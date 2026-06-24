import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Check, Heart, MessageCircle, TrendingUp, Upload, User } from "lucide-react";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { DubHubSkeletonBar, dubhubSkeletonGlassShellClass } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import { goldAvatarGlowShadowClass } from "@/components/verified-artist";
import { UserRoleInlineIcons } from "@/components/moderator-shield";
import { isDefaultAvatarUrl, resolveAvatarUrlForProfile } from "@/lib/default-avatar";
import { formatJoinedDateLine } from "@/lib/joined-date";
import { formatUsernameDisplay, cn } from "@/lib/utils";
import { deriveTrustLevel } from "@shared/trust-level";
import { getGenreChipStyle, getGenreGlowPillStyle } from "@/lib/genre-styles";
import type { PublicLightProfileStats } from "@shared/schema";
import { consumePublicProfileEnterAnimation } from "@/lib/profile-navigation-return";
import { ReleaseFeedCard, type ReleaseFeedCardData } from "@/components/release-feed-card";
import { prefetchReleaseDetail } from "@/lib/release-cache";
import { appendReleaseDetailFromProfileParam } from "@/lib/release-detail-navigation";

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
};

const PROFILE_BANNER_BOTTOM_FADE_STYLE: CSSProperties = {
  background: `linear-gradient(to bottom, rgba(15,19,36,0) 0%, rgba(15,19,36,0.65) 45%, rgba(15,19,36,0.92) 72%, var(--dark) 86%, var(--dark) 100%)`,
};

const PROFILE_ACTIVITY_CARD_CLASS =
  "rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";

function normalizePublicProfileResponse(data: PublicProfileResponse): PublicProfileResponse {
  const light = data.publicLight;
  if (!light) return data;
  return {
    ...data,
    publicLight: {
      ...light,
      posts: Number(light.posts ?? 0),
      correct_ids: Number(light.correct_ids ?? data.correct_ids ?? 0),
      reputation: Number(light.reputation ?? data.reputation ?? data.karma ?? 0),
      likesOnPosts: Number(light.likesOnPosts ?? 0),
      commentsOnPosts: Number(light.commentsOnPosts ?? 0),
      topGenreKey: light.topGenreKey ?? null,
    },
  };
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

function PublicProfileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 min-w-0 w-full flex-1 bg-[var(--dark)] overflow-x-hidden overflow-y-auto overscroll-y-contain">
      {children}
    </div>
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

function PublicProfileKeyStatsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <DubHubSkeletonBar tone="faint" className="h-4 w-4 rounded" />
          <DubHubSkeletonBar tone="mid" className="h-4 w-8" />
          <DubHubSkeletonBar tone="faint" className="h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}

function PublicProfilePageSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <PublicProfileShell>
      <div className="px-6 pb-8" aria-busy="true" aria-label="Loading profile">
        <div className="mx-auto max-w-md">
          <section className="relative -mx-6 mb-6 overflow-hidden bg-[var(--dark)]">
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
            <div className="relative z-10 px-6 pb-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
              <div className="mb-4 flex items-start gap-4">
                <DubHubSkeletonBar tone="teal" className="h-20 w-20 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <DubHubSkeletonBar tone="default" className="h-5 w-36 max-w-full" />
                  <DubHubSkeletonBar tone="faint" className="h-5 w-28 rounded-full" />
                  <DubHubSkeletonBar tone="faint" className="h-4 w-24" />
                </div>
              </div>
              <PublicProfileKeyStatsSkeleton />
            </div>
          </section>
          <div className="space-y-3">
            <DubHubSkeletonBar tone="default" className="h-4 w-20" />
            <PublicArtistReleasesSkeleton />
          </div>
        </div>
      </div>
    </PublicProfileShell>
  );
}

function PublicArtistReleasesSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1].map((i) => (
        <div key={i} className={`flex gap-4 p-4 ${dubhubSkeletonGlassShellClass}`}>
          <DubHubSkeletonBar tone="teal" className="h-20 w-20 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2 pt-1">
            <DubHubSkeletonBar tone="default" className="h-3 w-2/3 max-w-[10rem]" />
            <DubHubSkeletonBar tone="mid" className="h-4 w-full max-w-[14rem]" />
          </div>
        </div>
      ))}
    </div>
  );
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
      <SwipeBackPage onBack={handleBack} className="min-h-0 min-w-0 w-full flex-1">
        <PublicProfileShell>
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
        </PublicProfileShell>
      </SwipeBackPage>
    );
  }

  if (routeNormalized === viewerNormalized && viewerNormalized) {
    return <PublicProfilePageSkeleton onBack={handleBack} />;
  }

  if (isLoading) {
    return (
      <SwipeBackPage onBack={handleBack} className="min-h-0 min-w-0 w-full flex-1">
        <PublicProfilePageSkeleton onBack={handleBack} />
      </SwipeBackPage>
    );
  }

  if (isError || !profile) {
    return (
      <SwipeBackPage onBack={handleBack} className="min-h-0 min-w-0 w-full flex-1">
        <PublicProfileShell>
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
        </PublicProfileShell>
      </SwipeBackPage>
    );
  }

  const isVerifiedArtist = profileIsVerifiedArtist;
  const isArtist = profile.account_type === "artist";

  const light = profile.publicLight;
  const statsReady = light != null;

  const topGenreKey = light?.topGenreKey ?? null;
  const genreChip = topGenreKey ? getGenreChipStyle(topGenreKey) : null;
  const genrePillStyle = genreChip ? getGenreGlowPillStyle(genreChip.bgColor, genreChip.textClass) : null;

  const postsValue = statsReady ? Number(light.posts).toLocaleString() : "—";
  const idsValue = statsReady ? Number(light.correct_ids).toLocaleString() : "—";
  const likesValue = statsReady ? Number(light.likesOnPosts).toLocaleString() : "—";
  const commentsValue = statsReady ? Number(light.commentsOnPosts).toLocaleString() : "—";

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

  return (
    <SwipeBackPage onBack={handleBack} className="min-h-0 min-w-0 w-full flex-1">
      <PublicProfileShell>
        <div className={cn("px-6 pb-8", enterMotionClass)} onAnimationEnd={() => setPlayEnterAnimation(false)}>
          <div className="mx-auto max-w-md">
            <section
              className="relative -mx-6 mb-6 overflow-hidden bg-[var(--dark)]"
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

              <div className="relative z-10 px-6 pb-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
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
                    {repTrust ? (
                      <div
                        className="inline-flex max-w-[5.5rem] items-center justify-center gap-1 rounded-full border border-accent/40 bg-black/35 px-2 py-1 backdrop-blur-sm"
                        data-testid="public-profile-rep-badge"
                      >
                        <TrendingUp className="h-3.5 w-3.5 shrink-0 text-accent" />
                        <span className="truncate text-[10px] font-semibold leading-tight text-accent">
                          {repTrust.displayName}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex min-w-0 items-start gap-1.5">
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
                    {isArtist ? (
                      <p className="mt-1 text-xs font-medium text-white/70">
                        {isVerifiedArtist ? "Verified Artist" : "Artist"}
                      </p>
                    ) : null}
                    {joinedDateLine ? (
                      <p className="mt-2 inline-flex items-center rounded-full border border-white/20 bg-black/30 px-3 py-0.5 text-xs font-medium text-white/80 backdrop-blur-md">
                        {joinedDateLine}
                      </p>
                    ) : null}
                    {genreChip && genrePillStyle ? (
                      <div
                        className="mt-2 flex flex-wrap items-center gap-1.5"
                        data-testid="public-profile-fav-genre"
                      >
                        <span className="text-[11px] font-medium text-white/60">Fav genre</span>
                        <span
                          className="inline-flex max-w-full items-center rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-white/15"
                          style={genrePillStyle as React.CSSProperties}
                        >
                          <span className="truncate">{genreChip.label}</span>
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {statsReady ? (
                  <div className="grid grid-cols-4 gap-1" data-testid="public-profile-key-stats">
                    <PublicProfileKeyStat label="Posts" value={postsValue} icon={Upload} tone="text-gray-200" />
                    <PublicProfileKeyStat label="IDs" value={idsValue} icon={Check} tone="text-green-300" />
                    <PublicProfileKeyStat label="Likes" value={likesValue} icon={Heart} tone="text-pink-300" />
                    <PublicProfileKeyStat
                      label="Comments"
                      value={commentsValue}
                      icon={MessageCircle}
                      tone="text-cyan-300"
                    />
                  </div>
                ) : (
                  <PublicProfileKeyStatsSkeleton />
                )}
              </div>
            </section>

            {isVerifiedArtist ? (
              <section className="space-y-4" data-testid="public-profile-releases">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold text-white">Releases</h2>
                </div>

                {releasesLoading ? (
                  <PublicArtistReleasesSkeleton />
                ) : hasAnyReleases ? (
                  <div className="space-y-5">
                    {upcomingReleases.length > 0 ? (
                      <div>
                        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          Upcoming
                        </h3>
                        <div className="space-y-3">
                          {upcomingReleases.map((release) => (
                            <ReleaseFeedCard
                              key={release.id}
                              release={release}
                              onOpen={() => openRelease(release)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {releasedReleases.length > 0 ? (
                      <div>
                        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          Released
                        </h3>
                        <div className="space-y-3">
                          {releasedReleases.map((release) => (
                            <ReleaseFeedCard
                              key={release.id}
                              release={release}
                              onOpen={() => openRelease(release)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
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
              <div className={PROFILE_ACTIVITY_CARD_CLASS}>
                <h2 className="mb-2 text-sm font-semibold text-white">Community</h2>
                <p className="text-sm leading-relaxed text-gray-400">
                  Public music and ID activity for this account will expand here in a future update.
                </p>
              </div>
            )}
          </div>
        </div>
      </PublicProfileShell>
    </SwipeBackPage>
  );
}
