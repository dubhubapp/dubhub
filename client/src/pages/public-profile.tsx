import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Calendar, Check, Heart, MessageCircle, Target, Upload, User } from "lucide-react";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import { GoldVerifiedTick } from "@/components/verified-artist";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import { goldAvatarGlowShadowClass } from "@/components/verified-artist";
import { UserRoleInlineIcons } from "@/components/moderator-shield";
import { isDefaultAvatarUrl, resolveAvatarUrlForProfile } from "@/lib/default-avatar";
import { formatJoinedDateLine } from "@/lib/joined-date";
import { formatUsernameDisplay, cn } from "@/lib/utils";
import { deriveTrustLevel } from "@shared/trust-level";
import { getGenreChipStyle, getGenreGlowPillStyle } from "@/lib/genre-styles";
import type { PublicCommunityOverviewStats, PublicLightProfileStats } from "@shared/schema";
import { consumePublicProfileEnterAnimation } from "@/lib/profile-navigation-return";
import { ProfileRepOverview } from "@/components/profile-rep-overview";
import {
  PublicArtistDiscography,
  PublicArtistDiscographySkeleton,
} from "@/components/public-artist-discography";
import { type ReleaseFeedCardData } from "@/components/release-feed-card";
import { prefetchReleaseDetail } from "@/lib/release-cache";
import { appendReleaseDetailFromProfileParam } from "@/lib/release-detail-navigation";
import { APP_PAGE_SCROLL_CLASS, APP_SCROLL_BOTTOM_INSET_CLASS } from "@/lib/app-shell-layout";

type PublicReleasesResponse = {
  upcoming: ReleaseFeedCardData[];
  released: ReleaseFeedCardData[];
};

type PublicProfileResponse = {
  id?: string;
  username?: string;
  avatar_url?: string | null;
  banner_url?: string | null;
  account_type?: string;
  verified_artist?: boolean;
  moderator?: boolean;
  created_at?: string;
  reputation?: number;
  correct_ids?: number;
  karma?: number;
  publicLight?: PublicLightProfileStats;
  publicReleases?: PublicReleasesResponse;
  publicCommunityOverview?: PublicCommunityOverviewStats;
  publicSavedReleases?: PublicReleasesResponse;
};

const PROFILE_BANNER_BOTTOM_FADE_STYLE: CSSProperties = {
  background: `linear-gradient(to bottom, rgba(15,19,36,0) 0%, rgba(15,19,36,0.65) 45%, rgba(15,19,36,0.92) 72%, var(--dark) 86%, var(--dark) 100%)`,
};

const PROFILE_ACTIVITY_CARD_CLASS =
  "rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";

const PUBLIC_PROFILE_PAGE_SCROLL_CLASS = cn(
  APP_PAGE_SCROLL_CLASS,
  "bg-[var(--dark)] overflow-x-hidden",
);

/** Shared compact pill footprint for fav genre value beneath avatar. */
const PUBLIC_PROFILE_GENRE_VALUE_PILL_CLASS =
  "inline-flex min-h-[1.625rem] w-full max-w-[5.5rem] items-center justify-center rounded px-2 py-1 text-[10px] font-semibold leading-none ring-1 ring-white/15";

/** Equal vertical rhythm: stats → rep → releases */
const PUBLIC_PROFILE_SECTION_GAP_CLASS = "flex flex-col gap-5";

function normalizePublicProfileResponse(data: PublicProfileResponse): PublicProfileResponse {
  const overview = data.publicCommunityOverview
    ? {
        accuracyPercent: Math.max(0, Math.min(100, Number(data.publicCommunityOverview.accuracyPercent ?? 0))),
        releasesSaved: Number(data.publicCommunityOverview.releasesSaved ?? 0),
        artistIds: Number(data.publicCommunityOverview.artistIds ?? 0),
      }
    : undefined;

  const light = data.publicLight;
  if (!light) {
    return overview ? { ...data, publicCommunityOverview: overview } : data;
  }
  return {
    ...data,
    publicCommunityOverview: overview,
    publicLight: {
      ...light,
      posts: Number(light.posts ?? 0),
      correct_ids: Number(light.correct_ids ?? data.correct_ids ?? 0),
      reputation: Number(light.reputation ?? data.reputation ?? data.karma ?? 0),
      likesOnPosts: Number(light.likesOnPosts ?? 0),
      commentsOnPosts: Number(light.commentsOnPosts ?? 0),
      likesGiven: Number(light.likesGiven ?? 0),
      commentsWritten: Number(light.commentsWritten ?? 0),
      topGenreKey: light.topGenreKey ?? null,
    },
  };
}

function PublicArtistIdsStatIcon({ className }: { className?: string }) {
  return (
    <GoldVerifiedTick className={`text-white drop-shadow-none ${className ?? ""}`} glow="inline" />
  );
}

function ProfileBannerDefaultGradient() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)]"
        style={{
          background:
            "linear-gradient(180deg, hsl(227, 88%, 52%) 0%, rgba(30,56,249,0.55) 6%, hsl(222, 70%, 40%) 14%, rgba(15,19,36,0.88) 32%, #0f1324 48%, #0f1324 90%, #0f1324 100%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute -left-[10%] -top-[18%] h-[58%] w-[56%] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(74,233,223,0.32) 0%, rgba(74,233,223,0.1) 38%, transparent 70%)",
          }}
        />
        <div
          className="absolute -right-[6%] -top-[8%] h-[50%] w-[48%] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(99,102,241,0.26) 0%, rgba(99,102,241,0.07) 40%, transparent 72%)",
          }}
        />
        <div
          className="absolute left-[28%] top-[2%] h-[34%] w-[38%] rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle, rgba(30,56,249,0.28) 0%, rgba(30,56,249,0.06) 45%, transparent 74%)",
          }}
        />
      </div>
    </>
  );
}

function PublicProfileKeyStat({
  label,
  icon: Icon,
  tone,
  value,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <Icon className={`h-4 w-4 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${tone}`} />
      <span
        className={`text-base font-bold tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${tone}`}
      >
        {value}
      </span>
      <span className="text-[10px] leading-tight text-gray-300/90">{label}</span>
    </div>
  );
}

function PublicProfileKeyStatsSkeleton({ columns = 5 }: { columns?: 4 | 5 }) {
  return (
    <div className={cn("grid gap-1", columns === 5 ? "grid-cols-5" : "grid-cols-4")} aria-hidden>
      {Array.from({ length: columns }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <DubHubSkeletonBar tone="faint" className="h-4 w-4 rounded" />
          <DubHubSkeletonBar tone="mid" className="h-4 w-8" />
          <DubHubSkeletonBar tone="faint" className="h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}

function PublicProfileSecondaryKeyStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-1" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <DubHubSkeletonBar tone="faint" className="h-4 w-4 rounded" />
          <DubHubSkeletonBar tone="mid" className="h-4 w-8" />
          <DubHubSkeletonBar tone="faint" className="h-2.5 w-14" />
        </div>
      ))}
    </div>
  );
}

function PublicProfilePageSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <SwipeBackPage onBack={onBack} className={PUBLIC_PROFILE_PAGE_SCROLL_CLASS}>
      <div className={cn("px-6", APP_SCROLL_BOTTOM_INSET_CLASS)} aria-busy="true" aria-label="Loading profile">
        <div className="mx-auto max-w-md">
          <section className="relative -mx-6 overflow-hidden bg-[var(--dark)]">
            <ProfileBannerDefaultGradient />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] bg-gradient-to-b from-slate-950/45 via-slate-900/32 to-slate-950/35"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-48"
              style={PROFILE_BANNER_BOTTOM_FADE_STYLE}
              aria-hidden
            />
            <button
              type="button"
              className="ios-press ios-press-soft absolute left-4 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-20 inline-flex items-center gap-0.5 text-sm font-medium text-white/90"
              onClick={onBack}
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              Back
            </button>
            <div className="relative z-10 px-6 pb-5 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
              <div className="mb-4 flex items-start gap-4">
                <DubHubSkeletonBar tone="teal" className="h-20 w-20 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <DubHubSkeletonBar tone="default" className="h-5 w-36 max-w-full" />
                  <DubHubSkeletonBar tone="faint" className="h-5 w-28 rounded-full" />
                </div>
              </div>
              <PublicProfileKeyStatsSkeleton />
            </div>
          </section>
          <div className={PUBLIC_PROFILE_SECTION_GAP_CLASS}>
            <div className="space-y-2" aria-hidden>
              <DubHubSkeletonBar tone="default" className="h-4 w-28" />
              <DubHubSkeletonBar tone="faint" className="h-3 w-40" />
              <DubHubSkeletonBar tone="teal" className="h-2 w-full rounded-full" />
            </div>
            <PublicProfileSecondaryKeyStatsSkeleton />
            <div className="space-y-2" aria-hidden>
              <DubHubSkeletonBar tone="default" className="h-4 w-28" />
              <PublicArtistReleasesSkeleton />
            </div>
          </div>
        </div>
      </div>
    </SwipeBackPage>
  );
}

function PublicArtistReleasesSkeleton() {
  return <PublicArtistDiscographySkeleton />;
}

export default function PublicProfile() {
  const [, params] = useRoute("/profile/:username");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { username: viewerUsername } = useUser();
  const [playEnterAnimation, setPlayEnterAnimation] = useState(() => consumePublicProfileEnterAnimation());
  const [bannerImageReady, setBannerImageReady] = useState(false);
  const [bannerImageFailed, setBannerImageFailed] = useState(false);

  const routeUsername = useMemo(() => {
    const raw = params?.username ?? "";
    try {
      return decodeURIComponent(raw).trim();
    } catch {
      return raw.trim();
    }
  }, [params?.username]);

  const viewerNormalized = (viewerUsername ?? "").trim().toLowerCase();
  const routeNormalized = routeUsername.toLowerCase();

  useEffect(() => {
    if (!routeUsername || !viewerNormalized) return;
    if (routeNormalized === viewerNormalized) {
      navigate("/profile", { replace: true });
    }
  }, [routeUsername, routeNormalized, viewerNormalized, navigate]);

  const { data: profile, isLoading, isError } = useQuery<PublicProfileResponse>({
    queryKey: ["/api/user/profile", routeUsername],
    enabled: routeUsername.length > 0 && routeNormalized !== viewerNormalized,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/user/profile/${encodeURIComponent(routeUsername)}`);
      if (!res.ok) {
        const err = new Error("Profile not found");
        (err as any).status = res.status;
        throw err;
      }
      return normalizePublicProfileResponse(await res.json());
    },
  });

  const bannerUrl = profile?.banner_url?.trim() || null;

  useEffect(() => {
    if (!bannerUrl || typeof window === "undefined") {
      setBannerImageReady(false);
      setBannerImageFailed(false);
      return;
    }

    let cancelled = false;
    setBannerImageReady(false);
    setBannerImageFailed(false);

    const img = new window.Image();
    img.decoding = "async";

    const onReady = () => {
      if (!cancelled) setBannerImageReady(true);
    };
    const onFail = () => {
      if (!cancelled) setBannerImageFailed(true);
    };

    img.onload = onReady;
    img.onerror = onFail;
    img.src = bannerUrl;

    if (img.complete && img.naturalWidth > 0) {
      onReady();
    }

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [bannerUrl]);

  const profileId = profile?.id;
  const profileIsVerifiedArtist = profile?.verified_artist === true;
  const embeddedReleases = profile?.publicReleases;

  const { data: karmaData, isLoading: karmaLoading } = useQuery<{
    communityTopPercent?: number | null;
  }>({
    queryKey: ["/api/user", profileId, "karma"],
    enabled: Boolean(profileId),
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/user/${profileId}/karma`);
      if (!res.ok) throw new Error("Failed to load reputation");
      return res.json();
    },
  });

  const { data: fetchedReleases, isLoading: fetchedReleasesLoading } = useQuery<PublicReleasesResponse>({
    queryKey: ["/api/artists", profileId, "public-releases"],
    enabled: Boolean(profileId && profileIsVerifiedArtist && embeddedReleases === undefined),
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/artists/${profileId}/public-releases`);
      if (!res.ok) throw new Error("Failed to load releases");
      return res.json();
    },
  });

  const publicReleases = embeddedReleases ?? fetchedReleases;
  const releasesLoading =
    profileIsVerifiedArtist && embeddedReleases === undefined && fetchedReleasesLoading;

  const openRelease = useCallback(
    (release: ReleaseFeedCardData) => {
      prefetchReleaseDetail(queryClient, release.id);
      navigate(appendReleaseDetailFromProfileParam(`/releases/${release.id}`, routeUsername));
    },
    [navigate, queryClient, routeUsername],
  );

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate("/");
  };

  const enterMotionClass = playEnterAnimation
    ? "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:ease-out"
    : "";

  const showBannerDefaultGradient = !bannerUrl || bannerImageFailed || !bannerImageReady;
  const showUploadedBannerImage = Boolean(bannerUrl) && !bannerImageFailed;

  if (!routeUsername) {
    return (
      <SwipeBackPage onBack={handleBack} className={PUBLIC_PROFILE_PAGE_SCROLL_CLASS}>
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-gray-400">Profile not found.</p>
          <button
            type="button"
            className="ios-press mt-4 inline-flex items-center gap-1 text-sm text-gray-300"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      </SwipeBackPage>
    );
  }

  if (routeNormalized === viewerNormalized && viewerNormalized) {
    return <PublicProfilePageSkeleton onBack={handleBack} />;
  }

  if (isLoading) {
    return <PublicProfilePageSkeleton onBack={handleBack} />;
  }

  if (isError || !profile) {
    return (
      <SwipeBackPage onBack={handleBack} className={PUBLIC_PROFILE_PAGE_SCROLL_CLASS}>
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-gray-400">This profile could not be found.</p>
          <button
            type="button"
            className="ios-press mt-4 inline-flex items-center gap-1 text-sm text-gray-300"
            onClick={handleBack}
            data-testid="public-profile-back"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      </SwipeBackPage>
    );
  }

  const isVerifiedArtist = profileIsVerifiedArtist;

  const light = profile.publicLight;
  const statsReady = light != null;
  const communityOverview = profile.publicCommunityOverview;

  const topGenreKey = light?.topGenreKey ?? null;
  const genreChip = topGenreKey ? getGenreChipStyle(topGenreKey) : null;
  const genrePillStyle = genreChip ? getGenreGlowPillStyle(genreChip.bgColor, genreChip.textClass) : null;

  const postsValue = statsReady ? Number(light.posts).toLocaleString() : "—";
  const idsValue = statsReady ? Number(light.correct_ids).toLocaleString() : "—";
  const likesValue = statsReady ? Number(light.likesGiven).toLocaleString() : "—";
  const commentsValue = statsReady ? Number(light.commentsWritten).toLocaleString() : "—";
  const accuracyValue = communityOverview
    ? `${communityOverview.accuracyPercent}%`
    : "—";
  const releasesSavedValue = communityOverview
    ? communityOverview.releasesSaved.toLocaleString()
    : "—";
  const artistIdsValue = communityOverview ? communityOverview.artistIds.toLocaleString() : "—";

  const reputationRaw = light?.reputation ?? profile.reputation ?? profile.karma;
  const reputationNum = Number(reputationRaw);
  const repTrust =
    reputationRaw != null && Number.isFinite(reputationNum)
      ? deriveTrustLevel(reputationNum)
      : null;

  const avatarSrc = resolveAvatarUrlForProfile(
    profile.avatar_url,
    profile.account_type ?? (isVerifiedArtist ? "artist" : "user"),
  );
  const avatarIsDefault = avatarSrc ? isDefaultAvatarUrl(avatarSrc) : false;
  const joinedDateLine = formatJoinedDateLine(profile.created_at);

  const upcomingReleases = publicReleases?.upcoming ?? [];
  const releasedReleases = publicReleases?.released ?? [];
  const hasAnyReleases = upcomingReleases.length > 0 || releasedReleases.length > 0;

  const savedReleases = profile.publicSavedReleases;
  const upcomingSaved = savedReleases?.upcoming ?? [];
  const releasedSaved = savedReleases?.released ?? [];
  const hasAnySavedReleases = upcomingSaved.length > 0 || releasedSaved.length > 0;

  return (
    <SwipeBackPage onBack={handleBack} className={PUBLIC_PROFILE_PAGE_SCROLL_CLASS}>
      <div
        className={cn("px-6", APP_SCROLL_BOTTOM_INSET_CLASS, enterMotionClass)}
        onAnimationEnd={() => setPlayEnterAnimation(false)}
      >
          <div className="mx-auto max-w-md">
            <section
              className="relative -mx-6 overflow-hidden bg-[var(--dark)]"
              data-testid="public-profile-banner"
            >
              {showBannerDefaultGradient ? <ProfileBannerDefaultGradient /> : null}
              {showUploadedBannerImage ? (
                <img
                  src={bannerUrl!}
                  alt=""
                  className={`pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] h-full w-full object-cover transition-opacity duration-500 ease-out ${
                    bannerImageReady ? "opacity-100" : "opacity-0"
                  }`}
                  data-testid="public-profile-banner-image"
                />
              ) : null}
              <div
                className={`pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] ${
                  showUploadedBannerImage && bannerImageReady
                    ? "bg-black/40"
                    : "bg-gradient-to-b from-slate-950/45 via-slate-900/32 to-slate-950/35"
                }`}
                aria-hidden
              />
              {showUploadedBannerImage && bannerImageReady ? (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] bg-gradient-to-b from-slate-950/35 via-transparent to-transparent"
                  aria-hidden
                />
              ) : null}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-48"
                style={PROFILE_BANNER_BOTTOM_FADE_STYLE}
                aria-hidden
              />

              <button
                type="button"
                className="ios-press ios-press-soft absolute left-4 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-20 inline-flex items-center gap-0.5 text-sm font-medium text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] hover:text-white"
                onClick={handleBack}
                data-testid="public-profile-back"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                Back
              </button>

              <div className="relative z-10 px-6 pb-5 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
                <div className="mb-4 flex items-start gap-4">
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <div className="relative">
                      {avatarSrc ? (
                        <img
                          src={avatarSrc}
                          alt=""
                          className={`avatar-media h-20 w-20 rounded-full border-2 ${
                            avatarIsDefault ? "avatar-default-media" : ""
                          } ${isVerifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-primary"}`}
                        />
                      ) : (
                        <div
                          className={`avatar-shell h-20 w-20 border-2 ${
                            isVerifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-primary"
                          } bg-gray-700`}
                        >
                          <User className="avatar-icon h-10 w-10 text-gray-400" />
                        </div>
                      )}
                    </div>
                    {genreChip && genrePillStyle ? (
                      <div
                        className="flex w-full max-w-[5.5rem] flex-col items-center gap-1 text-center"
                        data-testid="public-profile-fav-genre"
                      >
                        <span className="text-[10px] font-medium leading-none text-white/60">Fav genre</span>
                        <span
                          className={PUBLIC_PROFILE_GENRE_VALUE_PILL_CLASS}
                          style={genrePillStyle as CSSProperties}
                        >
                          <span className="truncate">{genreChip.label}</span>
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <h1
                        className={`min-w-0 break-words text-xl font-bold leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] sm:truncate ${
                          isVerifiedArtist ? "text-[#FFD700]" : "text-foreground"
                        }`}
                        data-testid="public-profile-username"
                        title={profile.username ? formatUsernameDisplay(profile.username) : routeUsername}
                      >
                        {profile.username ? formatUsernameDisplay(profile.username) : routeUsername}
                      </h1>
                      <UserRoleInlineIcons
                        verifiedArtist={isVerifiedArtist}
                        moderator={profile.moderator === true}
                        shieldTone="onDark"
                      />
                    </div>
                    {joinedDateLine ? (
                      <p className="mt-2 inline-flex items-center rounded-full border border-white/20 bg-black/30 px-3 py-0.5 text-xs font-medium leading-none text-white/80 backdrop-blur-md">
                        {joinedDateLine}
                      </p>
                    ) : null}
                  </div>
                </div>

                {statsReady ? (
                  <div
                    className={cn("grid gap-1", isVerifiedArtist ? "grid-cols-4" : "grid-cols-5")}
                    data-testid="public-profile-key-stats"
                  >
                    <PublicProfileKeyStat label="Posts" value={postsValue} icon={Upload} tone="text-gray-200" />
                    <PublicProfileKeyStat label="IDs" value={idsValue} icon={Check} tone="text-green-300" />
                    <PublicProfileKeyStat label="Likes" value={likesValue} icon={Heart} tone="text-pink-300" />
                    <PublicProfileKeyStat
                      label="Comments"
                      value={commentsValue}
                      icon={MessageCircle}
                      tone="text-cyan-300"
                    />
                    {!isVerifiedArtist ? (
                      <PublicProfileKeyStat
                        label="Accuracy"
                        value={accuracyValue}
                        icon={Target}
                        tone="text-violet-300"
                      />
                    ) : null}
                  </div>
                ) : (
                  <PublicProfileKeyStatsSkeleton columns={isVerifiedArtist ? 4 : 5} />
                )}
              </div>
            </section>

            <div className={PUBLIC_PROFILE_SECTION_GAP_CLASS}>
              {statsReady && repTrust ? (
                karmaLoading ? (
                  <div className="space-y-2" aria-busy="true" data-testid="public-profile-rep-skeleton">
                    <DubHubSkeletonBar tone="default" className="h-4 w-28" />
                    <DubHubSkeletonBar tone="faint" className="h-3 w-40" />
                    <DubHubSkeletonBar tone="teal" className="h-2 w-full rounded-full" />
                  </div>
                ) : (
                  <div data-testid="public-profile-rep">
                    <ProfileRepOverview
                      trust={repTrust}
                      communityTopPercent={karmaData?.communityTopPercent}
                      genreBarColorHex={genreChip?.bgColor}
                      showSectionHeader
                      percentileVariant="public"
                      compact
                    />
                  </div>
                )
              ) : null}

            {isVerifiedArtist ? (
              <section className="space-y-4" data-testid="public-profile-releases">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold text-white">Releases</h2>
                </div>

                {releasesLoading ? (
                  <PublicArtistReleasesSkeleton />
                ) : hasAnyReleases ? (
                  <PublicArtistDiscography
                    upcoming={upcomingReleases}
                    released={releasedReleases}
                    onOpen={openRelease}
                  />
                ) : (
                  <div className={PROFILE_ACTIVITY_CARD_CLASS}>
                    <p className="text-sm leading-relaxed text-gray-400">
                      No public releases yet. When this artist publishes releases, they will appear here.
                    </p>
                  </div>
                )}

                {/* Reserved layout slot for a future paid release-alerts CTA — not implemented in Phase B */}
              </section>
            ) : (
              <>
                {communityOverview ? (
                  <div className="grid grid-cols-2 gap-1" data-testid="public-profile-secondary-stats">
                    <PublicProfileKeyStat
                      label="Releases Saved"
                      value={releasesSavedValue}
                      icon={Calendar}
                      tone="text-indigo-300"
                    />
                    <PublicProfileKeyStat
                      label="Artist IDs"
                      value={artistIdsValue}
                      icon={PublicArtistIdsStatIcon}
                      tone="text-amber-300"
                    />
                  </div>
                ) : null}

                <section className="space-y-4" data-testid="public-profile-saved-releases">
                  <h2 className="text-sm font-semibold text-white">Saved Releases</h2>
                  {savedReleases ? (
                    hasAnySavedReleases ? (
                      <PublicArtistDiscography
                        upcoming={upcomingSaved}
                        released={releasedSaved}
                        onOpen={openRelease}
                      />
                    ) : (
                      <p className="text-sm text-gray-400">No saved releases yet.</p>
                    )
                  ) : (
                    <PublicArtistReleasesSkeleton />
                  )}
                </section>
              </>
            )}
            </div>
          </div>
        </div>
    </SwipeBackPage>
  );
}
