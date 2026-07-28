import type { Express, NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";
import type { SubscriptionStatusRepository } from "./subscription-status-repository";
import {
  SUBSCRIPTION_PROVIDER,
  buildSubscriptionStatusView,
} from "./subscription-status-domain";

type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => void | Promise<void>;

type RegisterSubscriptionStatusRoutesOptions = {
  authMiddleware?: AuthMiddleware;
  repository?: SubscriptionStatusRepository;
  now?: () => Date;
};

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
  ];

  return candidates.some((candidate) => {
    if (typeof candidate !== "string" || candidate.trim().length === 0) return false;
    return currentUserId !== null && candidate !== currentUserId;
  });
}

export function registerSubscriptionStatusRoutes(
  app: Express,
  options: RegisterSubscriptionStatusRoutesOptions = {},
): void {
  const authMiddleware = options.authMiddleware ?? defaultAuthMiddleware;
  const now = options.now ?? (() => new Date());

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
        const currentNow = now();
        const verifiedArtist =
          req.dbUser.account_type === "artist" && req.dbUser.verified_artist === true;

        return res.json({
          account: {
            userId: req.dbUser.id,
            accountType: resolveAccountType(req.dbUser),
            verifiedArtist,
            subscriptionSubject: verifiedArtist,
          },
          provider: SUBSCRIPTION_PROVIDER,
          environments: {
            production: buildSubscriptionStatusView(snapshots.production, currentNow),
            sandbox: buildSubscriptionStatusView(snapshots.sandbox, currentNow),
          },
        });
      } catch (error) {
        console.error("[/api/user/subscription-status] GET Error:", error);
        return res
          .status(500)
          .json({ message: "Failed to get subscription status" });
      }
    },
  );
}
