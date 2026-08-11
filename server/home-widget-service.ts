import {
  HOME_WIDGET_PAYLOAD_TTL_HOURS,
  type HomeWidgetPayload,
  type HomeWidgetRelease,
} from "@shared/home-widget";
import type { AuthenticatedRequest } from "./authMiddleware";
import {
  calculateHomeWidgetPayloadExpiry,
  evaluateListenerReleaseEligibility,
  listEligibleListenerSavedReleases,
  resolveHomeWidgetMode,
  resolveHomeWidgetReleaseTiming,
  resolveListenerCollectionActiveRelease,
  resolveOptionalViewerTimeZone,
  selectArtistWidgetRelease,
  selectNextListenerSavedRelease,
  stampHomeWidgetCountdown,
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
  getHomeWidgetListenerSavedReleaseCandidates(
    userId: string,
  ): Promise<HomeWidgetReleaseStorageRow[]>;
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
    releaseTimingMode: row.releaseTimingMode ?? null,
    releaseAt: row.releaseAt ?? null,
    releaseTimezone: row.releaseTimezone ?? null,
    releaseAnnouncedAt: row.releaseAnnouncedAt ?? null,
  };
}

function toIsoAnnouncedAt(
  value: Date | string | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function buildReleasePayload(
  release: HomeWidgetReleaseCandidate,
  generatedAt: Date,
  deps: Required<
    Pick<HomeWidgetServiceDeps, "resolveArtworkUrl" | "buildDeepLink">
  >,
): HomeWidgetRelease {
  const timing = resolveHomeWidgetReleaseTiming(release);
  if (!timing.ok) {
    throw new Error(
      timing.reason === "inconsistent_exact"
        ? "Exact home-widget release is missing release_at"
        : "Eligible home-widget release has an invalid release date",
    );
  }
  const countdown = stampHomeWidgetCountdown({
    timing,
    releaseDate: release.releaseDate!,
    now: generatedAt,
  });
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
    timingMode: timing.timingMode,
    releaseCalendarDate: timing.releaseCalendarDate,
    releaseAt: timing.releaseAt,
    releaseAnnouncedAt: toIsoAnnouncedAt(release.releaseAnnouncedAt),
  };
}

export async function buildHomeWidgetPayload(args: {
  profile: HomeWidgetProfile;
  selectedReleaseId?: string | null;
  /** Device IANA timezone for listener Midnight retention / auto-advance. */
  viewerTimeZone?: string | null;
  deps?: HomeWidgetServiceDeps;
}): Promise<HomeWidgetPayload> {
  const serviceStorage =
    args.deps?.storage ?? (await import("./storage")).storage;
  const generatedAt = args.deps?.now?.() ?? new Date();
  const viewerTimeZone = resolveOptionalViewerTimeZone(args.viewerTimeZone);
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
        viewerTimeZone,
      );
    }
  }

  const listenerSelectionProvided = args.selectedReleaseId != null;
  let listenerEligibility: ListenerReleaseEligibility | null = null;
  let advanceListenerSelectionTo: string | undefined;
  let retireListenerSelection = false;
  let listenerCollection: HomeWidgetReleaseCandidate[] = [];
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
        now: generatedAt,
        viewerTimeZone,
      });

      const savedRows =
        await serviceStorage.getHomeWidgetListenerSavedReleaseCandidates(
          args.profile.id,
        );
      const savedCandidates = savedRows.map(toCandidate);

      // Out-now retention ended → auto-advance within Saved Releases only.
      if (
        !listenerEligibility.eligible &&
        listenerEligibility.reason === "selected_release_out_now_expired"
      ) {
        const next = selectNextListenerSavedRelease({
          savedReleases: savedCandidates,
          now: generatedAt,
          excludeReleaseIds: [normalizedSelection],
          viewerTimeZone,
        });
        if (next) {
          listenerEligibility = { eligible: true, release: next };
          advanceListenerSelectionTo = next.id;
        } else {
          retireListenerSelection = true;
        }
      }

      if (listenerEligibility.eligible) {
        const preferredId =
          advanceListenerSelectionTo ?? listenerEligibility.release.id;
        listenerCollection = listEligibleListenerSavedReleases({
          savedReleases: savedCandidates,
          now: generatedAt,
          viewerTimeZone,
          preferReleaseId: preferredId,
        });
        const active = resolveListenerCollectionActiveRelease({
          collection: listenerCollection,
          preferredReleaseId: preferredId,
        });
        if (active) {
          listenerEligibility = { eligible: true, release: active };
        }
      }
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
  if (resolved.release || listenerCollection.length > 0) {
    const resolveArtworkUrl =
      args.deps?.resolveArtworkUrl ??
      (await import("./releaseArtworkUrl")).resolveReleaseArtworkPublicUrl;
    const buildDeepLink =
      args.deps?.buildDeepLink ??
      (await import("./releaseSharePreview")).buildCanonicalReleaseShareUrl;
    releasePayloadDeps = { resolveArtworkUrl, buildDeepLink };
  }

  // Artist mode stays single/automatic — do not attach listener carousel.
  const includeListenerCollection =
    resolved.mode === "listener" &&
    listenerCollection.length > 0 &&
    releasePayloadDeps != null;

  const releasesPayload = includeListenerCollection
    ? listenerCollection.map((candidate) =>
        buildReleasePayload(candidate, generatedAt, releasePayloadDeps!),
      )
    : undefined;

  const activeRelease =
    includeListenerCollection && releasesPayload
      ? resolveListenerCollectionActiveRelease({
          collection: listenerCollection,
          preferredReleaseId:
            advanceListenerSelectionTo ??
            resolved.release?.id ??
            normalizedSelection,
        })
      : resolved.release;

  return {
    mode: resolved.mode,
    eligibility: resolved.eligibility,
    release:
      activeRelease && releasePayloadDeps
        ? buildReleasePayload(activeRelease, generatedAt, releasePayloadDeps)
        : null,
    ...(releasesPayload && releasesPayload.length > 0
      ? {
          releases: releasesPayload,
          activeReleaseId: activeRelease?.id ?? releasesPayload[0]?.id,
        }
      : {}),
    generatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ...(advanceListenerSelectionTo
      ? { advanceListenerSelectionTo }
      : {}),
    ...(retireListenerSelection ? { retireListenerSelection: true } : {}),
  };
}
