import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Calendar, Music, ExternalLink, Disc3, Plus } from "lucide-react";
import { formatReleaseTitleLine } from "@/lib/release-display";
import { getPlatformLabel, sortLinksByPlatform } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  getLinkCtaLabel,
  getBannerFromLinks,
} from "@/lib/release-cta";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/user-context";
import { supabase } from "@/lib/supabaseClient";
import { isReleaseDayToday } from "@/lib/release-status";
import { ReleaseDayCelebration } from "@/components/release-day-celebration";
import { cn } from "@/lib/utils";

export type ReleaseFeedItem = {
  id: string;
  artistId: string;
  title: string;
  releaseDate: string | null;
  artworkUrl: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  artistUsername: string;
  isComingSoon?: boolean;
  links?: { id: string; platform: string; url: string }[];
  collaboratorStatus?: "PENDING" | "ACCEPTED" | "REJECTED" | null;
  collaborators?: { username: string; status: string }[];
};

export { PLATFORM_ICONS, PLATFORM_LABELS, getPlatformIcon, getPlatformLabel } from "@/lib/platforms";

function formatDate(d: string | null) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isUpcoming(d: string | null) {
  if (!d) return false;
  return new Date(d) > new Date();
}

function getMonthYearKey(d: string): string {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthYear(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function groupReleasesByMonth<T extends { releaseDate: string | null }>(
  items: T[],
  ascending: boolean
): { key: string; label: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (!item.releaseDate) continue;
    const key = getMonthYearKey(item.releaseDate);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  const keys = Array.from(map.keys()).sort((a, b) =>
    ascending ? a.localeCompare(b) : b.localeCompare(a)
  );
  return keys.map((key) => {
    const itemsInGroup = map.get(key)!;
    return { key, label: formatMonthYear(itemsInGroup[0].releaseDate!), items: itemsInGroup };
  });
}

type FeedView = "upcoming" | "collaborations" | "past";
type FeedScope = "my" | "saved";

function getScopeFromSearch(search: string, isArtist: boolean): FeedScope {
  if (!isArtist) return "saved";
  const s = new URLSearchParams(search).get("scope");
  return s === "saved" ? "saved" : "my";
}

function getViewFromSearch(search: string, scope: FeedScope): FeedView {
  const v = new URLSearchParams(search).get("view");
  if (scope === "saved") return v === "past" ? "past" : "upcoming";
  return v === "past" || v === "collaborations" ? v : "upcoming";
}

/** Saved Releases feed: release drops today for someone else’s track (not your own release). */
function isSavedReleaseOutTodayInList(
  r: ReleaseFeedItem,
  scope: FeedScope,
  currentUserId: string | undefined
): boolean {
  if (scope !== "saved" || !currentUserId) return false;
  if (r.artistId === currentUserId) return false;
  return isReleaseDayToday(r.isComingSoon, r.releaseDate);
}

/** Any release with release_date = today (for glow and Out today badge). */
function isReleaseDayHighlight(r: ReleaseFeedItem): boolean {
  return isReleaseDayToday(r.isComingSoon, r.releaseDate);
}

export default function ReleaseTracker() {
  const [, navigate] = useLocation();
  const { currentUser, userType } = useUser();
  const isArtist = userType === "artist";
  const [scope, setScopeState] = useState<FeedScope>(() =>
    typeof window !== "undefined" ? getScopeFromSearch(window.location.search, isArtist) : (isArtist ? "my" : "saved")
  );
  const [feedView, setFeedViewState] = useState<FeedView>(() =>
    typeof window !== "undefined" ? getViewFromSearch(window.location.search, scope) : "upcoming"
  );

  useEffect(() => {
    const onPop = () => {
      const s = getScopeFromSearch(window.location.search, isArtist);
      setScopeState(s);
      setFeedViewState(getViewFromSearch(window.location.search, s));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isArtist]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const s = getScopeFromSearch(window.location.search, isArtist);
    setScopeState(s);
    setFeedViewState(getViewFromSearch(window.location.search, s));
  }, [currentUser?.id, isArtist]);

  const setScope = (s: FeedScope) => {
    setScopeState(s);
    const nextView: FeedView = s === "saved" ? "upcoming" : feedView;
    setFeedViewState(nextView);
    navigate(`/releases?scope=${s}&view=${nextView}`);
  };

  const setFeedView = (v: FeedView) => {
    setFeedViewState(v);
    const params = new URLSearchParams();
    if (isArtist) params.set("scope", scope);
    params.set("view", v);
    navigate(`/releases?${params}`);
  };

  const effectiveScope: FeedScope = isArtist ? scope : "saved";
  const effectiveView: FeedView = effectiveScope === "saved" && feedView === "collaborations" ? "upcoming" : feedView;
  const tabGroupClass =
    "flex gap-1 p-1.5 rounded-xl border border-white/10 bg-black/35 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";
  const tabButtonBaseClass =
    "flex-1 py-2 text-sm font-medium rounded-lg border border-white/10 transition-all";
  const activeTabClass =
    "text-accent-foreground font-semibold border-accent/70 bg-accent shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]";
  const inactiveTabClass = "bg-black/20 text-white/70 hover:text-white hover:bg-black/30";
  const releaseCardBaseClass =
    "w-full text-left rounded-xl p-4 transition-all border flex gap-4 bg-black/30 backdrop-blur-md border-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] hover:bg-black/40 hover:border-white/20";

  const { data: feed = [], isLoading } = useQuery<ReleaseFeedItem[]>({
    queryKey: ["/api/releases/feed", effectiveScope, effectiveView],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const params = new URLSearchParams({ view: effectiveView, scope: effectiveScope });
      const res = await fetch(`/api/releases/feed?${params}`, {
        headers,
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch releases");
      return res.json();
    },
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const myReleasesDueToday = useMemo(() => {
    if (!isArtist || effectiveScope !== "my" || !currentUser?.id) return [];
    return feed.filter(
      (r) =>
        r.artistId === currentUser.id && isReleaseDayToday(r.isComingSoon, r.releaseDate)
    );
  }, [feed, isArtist, effectiveScope, currentUser?.id]);

  const featuredReleaseIds = useMemo(
    () => new Set(myReleasesDueToday.map((r) => r.id)),
    [myReleasesDueToday]
  );
  const standardDatedFeed = useMemo(
    () => feed.filter((r) => r.releaseDate && !r.isComingSoon && !featuredReleaseIds.has(r.id)),
    [feed, featuredReleaseIds]
  );

  const renderReleaseCard = (r: ReleaseFeedItem, opts?: { featured?: boolean }) => {
    const savedOutToday = isSavedReleaseOutTodayInList(r, effectiveScope, currentUser?.id);
    const releaseDayHighlight = isReleaseDayHighlight(r);
    const isOwnerReleaseDay = r.artistId === currentUser?.id && releaseDayHighlight;
    const featured = !!opts?.featured;
    return (
      <button
        key={r.id}
        type="button"
        onClick={() => {
          const params = new URLSearchParams();
          if (isArtist) params.set("scope", scope);
          params.set("view", feedView);
          navigate(`/releases/${r.id}?${params}`);
        }}
        className={cn(
          releaseCardBaseClass,
          featured
            ? "bg-transparent border-0 px-1 py-2 shadow-none hover:bg-transparent"
            : "",
          !featured && savedOutToday &&
            "ring-1 ring-emerald-500/40 shadow-[0_0_24px_-8px_rgba(16,185,129,0.3)] bg-emerald-500/[0.06] border-emerald-500/35",
          !featured && isOwnerReleaseDay &&
            "ring-1 ring-violet-500/40 shadow-[0_0_26px_-8px_rgba(139,92,246,0.35)] bg-violet-500/[0.06] border-violet-500/35",
          !featured && releaseDayHighlight && !savedOutToday && !isOwnerReleaseDay &&
            "ring-1 ring-amber-500/35 shadow-[0_0_22px_-8px_rgba(245,158,11,0.3)] bg-amber-500/[0.06] border-amber-500/30"
        )}
      >
        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
          {r.artworkUrl ? (
            <img src={r.artworkUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <Music className="w-10 h-10 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {formatReleaseTitleLine(r.artistUsername, "", r.collaborators).replace(" — ", "")}
          </p>
          <p className="text-sm text-foreground mt-0.5 line-clamp-2 break-words">
            {r.title}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {r.isComingSoon ? "Coming soon..." : formatDate(r.releaseDate)}
          </p>
          {getBannerFromLinks(r.links, r.isComingSoon || isUpcoming(r.releaseDate || null)) && (
            <p className="text-xs text-primary mt-1">
              {getBannerFromLinks(r.links, r.isComingSoon || isUpcoming(r.releaseDate || null))}
            </p>
          )}
          <div className="flex flex-wrap gap-1 mt-2 items-center">
            {(() => {
              const upcoming = r.isComingSoon || isUpcoming(r.releaseDate);
              return (
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded ${
                    upcoming
                      ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      : "bg-green-500/20 text-green-600 dark:text-green-400"
                  }`}
                >
                  {upcoming ? "Upcoming" : "Released"}
                </span>
              );
            })()}
            {r.collaboratorStatus && (
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  r.collaboratorStatus === "ACCEPTED"
                    ? "bg-green-500/20 text-green-600 dark:text-green-400"
                    : r.collaboratorStatus === "REJECTED"
                    ? "bg-red-500/20 text-red-600 dark:text-red-400"
                    : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                }`}
              >
                {r.collaboratorStatus}
              </span>
            )}
          </div>
          {r.links && r.links.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
              {sortLinksByPlatform(r.links).map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 rounded p-1 bg-muted hover:bg-muted/80 text-xs"
                  title={getPlatformLabel(link.platform)}
                >
                  <PlatformIcon platform={link.platform} className="h-5 w-auto object-contain" />
                  <span>{getLinkCtaLabel(link.platform, r.isComingSoon || isUpcoming(r.releaseDate || null))}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          )}
        </div>
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading releases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background overflow-y-auto pb-[calc(10.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="p-4 max-w-md mx-auto">
        {currentUser?.id && (
          <div className="space-y-3 mb-4">
            {isArtist && (
              <div className={tabGroupClass}>
                {(["my", "saved"] as FeedScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`${tabButtonBaseClass} ${
                      scope === s ? activeTabClass : inactiveTabClass
                    }`}
                  >
                    {s === "my" ? "My Releases" : "Saved Releases"}
                  </button>
                ))}
              </div>
            )}
            <div className={tabGroupClass}>
              {(effectiveScope === "my"
                ? (["upcoming", "collaborations", "past"] as FeedView[])
                : (["upcoming", "past"] as FeedView[])
              ).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFeedView(v)}
                  className={`${tabButtonBaseClass} ${
                    feedView === v ? activeTabClass : inactiveTabClass
                  }`}
                >
                  {v === "upcoming" ? "Upcoming" : v === "collaborations" ? "Collaborations" : "Past"}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentUser?.id && isArtist && effectiveScope === "my" && myReleasesDueToday.length > 0 && (
          <div className="relative z-10 mb-7 rounded-xl border-2 border-amber-300/80 bg-gradient-to-br from-violet-500/16 via-background/86 to-amber-400/22 shadow-[0_0_34px_-8px_rgba(139,92,246,0.4),0_0_78px_-8px_rgba(245,158,11,0.95),0_14px_32px_-18px_rgba(245,158,11,0.6),inset_0_1px_0_rgba(255,255,255,0.14)] p-3 space-y-3">
            <ReleaseDayCelebration releaseId={myReleasesDueToday[0].id} variant="heading" />
            <div className="space-y-3">
              {myReleasesDueToday.map((r) => renderReleaseCard(r, { featured: true }))}
            </div>
          </div>
        )}

        {!currentUser?.id ? (
          <div className="text-center text-muted-foreground py-12">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2">Sign in to see releases from artists you’ve liked.</p>
          </div>
        ) : feed.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Disc3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2">
              {feedView === "upcoming"
                ? "No upcoming releases"
                : feedView === "collaborations"
                ? "No collaborations"
                : "No past releases"}
            </p>
            <p className="text-sm">
              {feedView === "upcoming"
                ? effectiveScope === "my"
                  ? "Create a release or accept collaboration invites to see upcoming releases here."
                  : "Like posts that are verified by artists to see their releases here."
                : feedView === "collaborations"
                ? "You'll see releases you're invited to collaborate on here."
                : effectiveScope === "my"
                ? "Past releases from you and collaborations will appear here."
                : "Past releases from liked posts will appear here."}
            </p>
            {isArtist && feedView === "upcoming" && effectiveScope === "my" && (
              <Button className="mt-4" onClick={() => navigate("/releases/new")}>
                Add your first release
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groupReleasesByMonth(
              standardDatedFeed,
              effectiveView === "upcoming" || effectiveView === "collaborations"
            ).map(({ key: monthKey, label: monthLabel, items }) => (
              <section key={monthKey}>
                <h2 className="text-sm font-semibold text-white/85 mb-3">
                  {monthLabel}
                </h2>
                <div className="space-y-4">
                  {items.map((r) => renderReleaseCard(r))}
                </div>
              </section>
            ))}
            {feed.some((r) => r.isComingSoon) && (
              <section>
                <h2 className="text-sm font-semibold text-white/85 mb-3 mt-1">
                  Coming soon...
                </h2>
                <div className="space-y-4">
                  {feed
                    .filter((r) => r.isComingSoon)
                    .map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          const params = new URLSearchParams();
                          if (isArtist) params.set("scope", scope);
                          params.set("view", feedView);
                          navigate(`/releases/${r.id}?${params}`);
                        }}
                        className={releaseCardBaseClass}
                      >
                        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {r.artworkUrl ? (
                            <img src={r.artworkUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Music className="w-10 h-10 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground">
                            {formatReleaseTitleLine(r.artistUsername, "", r.collaborators).replace(" — ", "")}
                          </p>
                          <p className="text-sm text-foreground mt-0.5 line-clamp-2 break-words">
                            {r.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">Coming soon...</p>
                          {getBannerFromLinks(r.links, true) && (
                            <p className="text-xs text-primary mt-1">
                              {getBannerFromLinks(r.links, true)}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-2 items-center">
                            <span className="inline-block text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
                              Upcoming
                            </span>
                            {r.collaboratorStatus && (
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${
                                  r.collaboratorStatus === "ACCEPTED"
                                    ? "bg-green-500/20 text-green-600 dark:text-green-400"
                                    : r.collaboratorStatus === "REJECTED"
                                    ? "bg-red-500/20 text-red-600 dark:text-red-400"
                                    : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                {r.collaboratorStatus}
                              </span>
                            )}
                          </div>
                          {r.links && r.links.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                              {sortLinksByPlatform(r.links).map((link) => (
                                <a
                                  key={link.id}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 rounded p-1 bg-muted hover:bg-muted/80 text-xs"
                                  title={getPlatformLabel(link.platform)}
                                >
                                  <PlatformIcon platform={link.platform} className="h-5 w-auto object-contain" />
                                  <span>{getLinkCtaLabel(link.platform, true)}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <div
        className="fixed inset-x-0 z-30 pointer-events-none"
        style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="absolute inset-x-0 bottom-0 h-[calc(6.25rem+env(safe-area-inset-bottom,0px))] bg-background" />
        <div className="absolute inset-x-0 bottom-[calc(6.25rem+env(safe-area-inset-bottom,0px))] h-32 bg-gradient-to-t from-background via-background/95 via-45% to-transparent" />
        <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-background/90 via-background/60 to-transparent" />
        <div className="relative mx-auto max-w-md px-4">
          <div className="relative pb-0 pt-1">
            <Button
              onClick={() => navigate("/releases/new")}
              className="pointer-events-auto h-12 w-full rounded-xl border border-white/80 bg-white text-slate-900 shadow-[0_10px_28px_-18px_rgba(255,255,255,0.95),0_10px_24px_-18px_rgba(15,23,42,0.45)] transition-all hover:opacity-95 active:scale-[0.995]"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Release
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { formatDate, isUpcoming };
