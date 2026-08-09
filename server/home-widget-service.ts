import {
  HOME_WIDGET_PAYLOAD_TTL_HOURS,
  type HomeWidgetPayload,
  type HomeWidgetRelease,
} from "@shared/home-widget";
import type { AuthenticatedRequest } from "./authMiddleware";
import {
  calculateHomeWidgetPayloadExpiry,
  evaluateListenerReleaseEligibility,
  getHomeWidgetCountdown,
  resolveHomeWidgetMode,
  selectArtistWidgetRelease,
  type HomeWidgetReleaseCandidate,
  type ListenerReleaseEligibility,
} from "./home-widget-domain";
import {
  type HomeWidgetListenerSelectionRow,
  type HomeWidgetReleaseStorageRow,
} from "./storage";

type HomeWidgetProfile = NonNullable<AuthenticatedRequest["dbUser"]>;

export type HomeWidgetServiceStorage = {
  getHomeWidgetArtistReleaseCandidates(
    artistId: string,
  ): Promise<HomeWidgetReleaseStorageRow[]>;
  getHomeWidgetListenerSelection(
    userId: string,
    releaseId: string,
  ): Promise<HomeWidgetListenerSelectionRow>;
};

export type HomeWidgetServiceDeps = {
  storage?: HomeWidgetServiceStorage;
  canUsePaidTools?: (artistId: string) => Promise<boolean>;
  resolveArtworkUrl?: (artworkUrl: string | null | undefined) => string | null;
  buildDeepLink?: (releaseId: string) => string;
  now?: () => Date;
};

const RELEASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toCandidate(row: HomeWidgetReleaseStorageRow): HomeWidgetReleaseCandidate {
  return {
    id: row.id,
    artistId: row.artistId,
    title: row.title,
    artistName: row.artistName,
    releaseDate: row.releaseDate,
    artworkUrl: row.artworkUrl,
    isPublic: row.isPublic,
    isComingSoon: row.isComingSoon,
    subscriptionSuspendedAt: row.subscriptionSuspendedAt,
    createdAt: row.createdAt,
  };
}

function buildReleasePayload(
  release: HomeWidgetReleaseCandidate,
  generatedAt: Date,
  deps: Required<
    Pick<HomeWidgetServiceDeps, "resolveArtworkUrl" | "buildDeepLink">
  >,
): HomeWidgetRelease {
  const countdown = getHomeWidgetCountdown(release.releaseDate!, generatedAt);
  if (!countdown) {
    throw new Error("Eligible home-widget release has an invalid release date");
  }
  const releaseDate =
    release.releaseDate instanceof Date
      ? release.releaseDate.toISOString()
      : new Date(release.releaseDate!).toISOString();
  return {
    id: release.id,
    title: release.title,
    artistName: release.artistName,
    artworkUrl: deps.resolveArtworkUrl(release.artworkUrl),
    releaseDate,
    deepLink: deps.buildDeepLink(release.id),
    countdownLabel: countdown.countdownLabel,
    isOutNow: countdown.isOutNow,
  };
}

export async function buildHomeWidgetPayload(args: {
  profile: HomeWidgetProfile;
  selectedReleaseId?: string | null;
  deps?: HomeWidgetServiceDeps;
}): Promise<HomeWidgetPayload> {
  const serviceStorage =
    args.deps?.storage ?? (await import("./storage")).storage;
  const generatedAt = args.deps?.now?.() ?? new Date();
  const canUsePaidTools =
    args.deps?.canUsePaidTools ??
    (async (artistId: string) => {
      const [{ canArtistUsePaidTools }, { subscriptionStatusRepository }] =
        await Promise.all([
          import("./artist-paid-tool-access"),
          import("./subscription-status-repository"),
        ]);
      return canArtistUsePaidTools(artistId, {
        getSnapshotsForUser: (id) =>
          subscriptionStatusRepository.getSnapshotsForUser(id),
        now: () => generatedAt,
      });
    });

  const isVerifiedArtist =
    args.profile.account_type === "artist" &&
    args.profile.verified_artist === true;
  let artistAccess: "not_artist" | "eligible" | "unavailable" = "not_artist";
  let artistRelease: HomeWidgetReleaseCandidate | null = null;

  if (isVerifiedArtist) {
    const paid = await canUsePaidTools(args.profile.id);
    artistAccess = paid ? "eligible" : "unavailable";
    if (paid) {
      const rows = await serviceStorage.getHomeWidgetArtistReleaseCandidates(
        args.profile.id,
      );
      artistRelease = selectArtistWidgetRelease(
        rows.map(toCandidate),
        args.profile.id,
        generatedAt,
      );
    }
  }

  const listenerSelectionProvided = args.selectedReleaseId != null;
  let listenerEligibility: ListenerReleaseEligibility | null = null;
  const normalizedSelection = args.selectedReleaseId?.trim() ?? "";
  if (listenerSelectionProvided) {
    if (!RELEASE_ID_PATTERN.test(normalizedSelection)) {
      listenerEligibility = {
        eligible: false,
        reason: "invalid_listener_selection",
      };
    } else {
      const selected = await serviceStorage.getHomeWidgetListenerSelection(
        args.profile.id,
        normalizedSelection,
      );
      listenerEligibility = evaluateListenerReleaseEligibility({
        release: selected.release ? toCandidate(selected.release) : null,
        isSaved: selected.isSaved,
      });
    }
  }

  const resolved = resolveHomeWidgetMode({
    artistAccess,
    artistRelease,
    listenerSelectionProvided,
    listenerEligibility,
  });
  const expiresAt = calculateHomeWidgetPayloadExpiry(
    generatedAt,
    HOME_WIDGET_PAYLOAD_TTL_HOURS,
  );
  let releasePayloadDeps: Required<
    Pick<HomeWidgetServiceDeps, "resolveArtworkUrl" | "buildDeepLink">
  > | null = null;
  if (resolved.release) {
    const resolveArtworkUrl =
      args.deps?.resolveArtworkUrl ??
      (await import("./releaseArtworkUrl")).resolveReleaseArtworkPublicUrl;
    const buildDeepLink =
      args.deps?.buildDeepLink ??
      (await import("./releaseSharePreview")).buildCanonicalReleaseShareUrl;
    releasePayloadDeps = { resolveArtworkUrl, buildDeepLink };
  }

  return {
    mode: resolved.mode,
    eligibility: resolved.eligibility,
    release: resolved.release
      ? buildReleasePayload(resolved.release, generatedAt, releasePayloadDeps!)
      : null,
    generatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
