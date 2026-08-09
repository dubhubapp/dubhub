import type { Express, NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";
import type { SubscriptionStatusRepository } from "./subscription-status-repository";
import {
  SUBSCRIPTION_PROVIDER,
  buildSubscriptionStatusView,
} from "./subscription-status-domain";
import {
  fetchRevenueCatSubscriber,
  parseRevenueCatV1SubscriberResponse,
  RevenueCatRestError,
  type RevenueCatV1SubscriberResponse,
} from "./revenuecat-rest-client";
import {
  mapRevenueCatSubscriberToSnapshots,
  RevenueCatSubscriberMapError,
} from "./revenuecat-subscriber-map";
import { isFutureReleaseSuspensionEnforcementEnabled } from "./future-release-suspension";
import type { FutureReleaseReconcileResult } from "./reconcile-artist-future-release-suspensions";

type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => void | Promise<void>;

type FetchSubscriber = (args: {
  appUserId: string;
}) => Promise<RevenueCatV1SubscriberResponse>;

type RegisterSubscriptionStatusRoutesOptions = {
  authMiddleware?: AuthMiddleware;
  repository?: SubscriptionStatusRepository;
  now?: () => Date;
  fetchSubscriber?: FetchSubscriber;
  /** Injectable for tests; defaults to the real pool-backed reconcile, gated by the enforcement flag. */
  reconcileFutureReleaseSuspensions?: (
    userId: string,
  ) => Promise<FutureReleaseReconcileResult | void>;
};

/**
 * Lazily imports the pool + reconcile module only when enforcement is enabled,
 * so tests (enforcement off by default) never trigger a real DB connection.
 */
async function defaultReconcileFutureReleaseSuspensions(
  userId: string,
): Promise<FutureReleaseReconcileResult | void> {
  if (!isFutureReleaseSuspensionEnforcementEnabled()) return;
  try {
    const [{ pool }, { reconcileArtistFutureReleaseSuspensions }, { subscriptionStatusRepository }] =
      await Promise.all([
        import("./db"),
        import("./reconcile-artist-future-release-suspensions"),
        import("./subscription-status-repository"),
      ]);
    return await reconcileArtistFutureReleaseSuspensions(userId, {
      pool,
      getSnapshotsForUser: (id) => subscriptionStatusRepository.getSnapshotsForUser(id),
    });
  } catch (error) {
    console.error("[/api/user/subscription-refresh] future-release reconcile failed", {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

const defaultAuthMiddleware: AuthMiddleware = async (req, res, next) => {
  try {
    const { withSupabaseUser } = await import("./authMiddleware");
    return withSupabaseUser(req, res, next);
  } catch (error) {
    return next(error);
  }
};

async function getDefaultRepository(): Promise<SubscriptionStatusRepository> {
  const { subscriptionStatusRepository } = await import(
    "./subscription-status-repository"
  );
  return subscriptionStatusRepository;
}

function resolveAccountType(
  user: AuthenticatedRequest["dbUser"] | undefined,
): string {
  if (!user) return "other";
  if (user.moderator) return "moderator";
  return user.account_type ?? "other";
}

function hasForeignUserTarget(req: AuthenticatedRequest): boolean {
  const currentUserId = req.dbUser?.id ?? null;
  const candidates = [
    req.params?.userId,
    typeof req.query?.userId === "string" ? req.query.userId : undefined,
    req.body?.userId,
    req.body?.appUserId,
    req.body?.app_user_id,
  ];

  return candidates.some((candidate) => {
    if (typeof candidate !== "string" || candidate.trim().length === 0) return false;
    return currentUserId !== null && candidate !== currentUserId;
  });
}

function hasDisallowedRefreshBody(req: AuthenticatedRequest): boolean {
  const body = req.body;
  if (body == null) return false;
  if (typeof body !== "object" || Array.isArray(body)) return true;
  const keys = Object.keys(body);
  if (keys.length === 0) return false;
  // Empty body only — reject entitlement/provider payloads and targeting fields.
  return true;
}

function buildStatusResponse(
  req: AuthenticatedRequest,
  snapshots: Awaited<
    ReturnType<SubscriptionStatusRepository["getSnapshotsForUser"]>
  >,
  now: Date,
) {
  const verifiedArtist =
    req.dbUser!.account_type === "artist" && req.dbUser!.verified_artist === true;

  return {
    account: {
      userId: req.dbUser!.id,
      accountType: resolveAccountType(req.dbUser),
      verifiedArtist,
      subscriptionSubject: verifiedArtist,
    },
    provider: SUBSCRIPTION_PROVIDER,
    environments: {
      production: buildSubscriptionStatusView(snapshots.production, now),
      sandbox: buildSubscriptionStatusView(snapshots.sandbox, now),
    },
  };
}

function providerFailureStatus(error: unknown): number {
  if (error instanceof RevenueCatRestError) {
    if (error.code === "timeout") return 503;
    if (error.code === "missing_secret") return 503;
    return 502;
  }
  if (error instanceof RevenueCatSubscriberMapError) {
    return 502;
  }
  return 502;
}

export function registerSubscriptionStatusRoutes(
  app: Express,
  options: RegisterSubscriptionStatusRoutesOptions = {},
): void {
  const authMiddleware = options.authMiddleware ?? defaultAuthMiddleware;
  const now = options.now ?? (() => new Date());
  const fetchSubscriber =
    options.fetchSubscriber ??
    ((args: { appUserId: string }) => fetchRevenueCatSubscriber(args));

  app.get(
    "/api/user/subscription-status",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!req.dbUser) {
          return res.status(401).json({ message: "Not authenticated" });
        }
        if (hasForeignUserTarget(req)) {
          return res.status(400).json({ message: "User targeting is not allowed" });
        }

        const repository =
          options.repository ?? (await getDefaultRepository());
        const snapshots = await repository.getSnapshotsForUser(req.dbUser.id);
        return res.json(buildStatusResponse(req, snapshots, now()));
      } catch (error) {
        console.error("[/api/user/subscription-status] GET Error:", error);
        return res
          .status(500)
          .json({ message: "Failed to get subscription status" });
      }
    },
  );

  app.post(
    "/api/user/subscription-refresh",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!req.dbUser) {
          return res.status(401).json({ message: "Not authenticated" });
        }
        if (hasForeignUserTarget(req)) {
          return res.status(400).json({ message: "User targeting is not allowed" });
        }
        if (hasDisallowedRefreshBody(req)) {
          return res.status(400).json({
            message: "Request body must be empty; user and entitlement fields are not accepted",
          });
        }

        const userId = req.dbUser.id;
        const currentNow = now();
        const repository =
          options.repository ?? (await getDefaultRepository());

        let providerResponse: RevenueCatV1SubscriberResponse;
        try {
          const fetched = await fetchSubscriber({ appUserId: userId });
          // Always structural-parse so injected fixtures and live client share one path.
          providerResponse = parseRevenueCatV1SubscriberResponse(fetched);
        } catch (error) {
          const status = providerFailureStatus(error);
          console.error("[/api/user/subscription-refresh] provider fetch failed", {
            code: error instanceof RevenueCatRestError ? error.code : "unknown",
            status: error instanceof RevenueCatRestError ? error.status : null,
          });
          return res.status(status).json({
            message: "Failed to refresh subscription from provider",
          });
        }

        let mapped;
        try {
          mapped = mapRevenueCatSubscriberToSnapshots({
            response: providerResponse,
            userId,
            now: currentNow,
          });
        } catch (error) {
          console.error("[/api/user/subscription-refresh] provider map failed", {
            code:
              error instanceof RevenueCatSubscriberMapError ? error.code : "unknown",
          });
          return res.status(502).json({
            message: "Failed to refresh subscription from provider",
          });
        }

        const snapshots = await repository.upsertEnvironmentSnapshots(mapped);

        const reconcile =
          options.reconcileFutureReleaseSuspensions ??
          defaultReconcileFutureReleaseSuspensions;
        await reconcile(userId);

        return res.json(buildStatusResponse(req, snapshots, currentNow));
      } catch (error) {
        console.error("[/api/user/subscription-refresh] POST Error:", error);
        return res.status(500).json({ message: "Failed to refresh subscription" });
      }
    },
  );
}
