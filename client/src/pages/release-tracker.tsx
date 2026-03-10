import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Calendar, Plus, Music, ExternalLink, Disc3 } from "lucide-react";
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

export type ReleaseFeedItem = {
  id: string;
  artistId: string;
  title: string;
  releaseDate: string;
  artworkUrl: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  artistUsername: string;
  links?: { id: string; platform: string; url: string }[];
  collaboratorStatus?: "PENDING" | "ACCEPTED" | "REJECTED" | null;
  collaborators?: { username: string; status: string }[];
};

export { PLATFORM_ICONS, PLATFORM_LABELS, getPlatformIcon, getPlatformLabel } from "@/lib/platforms";

function formatDate(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isUpcoming(d: string) {
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

function groupReleasesByMonth<T extends { releaseDate: string }>(
  items: T[],
  ascending: boolean
): { key: string; label: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getMonthYearKey(item.releaseDate);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  const keys = Array.from(map.keys()).sort((a, b) =>
    ascending ? a.localeCompare(b) : b.localeCompare(a)
  );
  return keys.map((key) => {
    const itemsInGroup = map.get(key)!;
    return { key, label: formatMonthYear(itemsInGroup[0].releaseDate), items: itemsInGroup };
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
    <div className="flex-1 bg-background overflow-y-auto pb-24">
      <div className="p-4 max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Releases</h1>
          {isArtist && (
            <Button
              size="sm"
              onClick={() => navigate("/releases/new")}
              className="flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Release
            </Button>
          )}
        </div>

        {currentUser?.id && (
          <div className="space-y-3 mb-4">
            {isArtist && (
              <div className="flex gap-1 p-1 rounded-lg bg-muted">
                {(["my", "saved"] as FeedScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                      scope === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s === "my" ? "My Releases" : "Saved Releases"}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1 p-1 rounded-lg bg-muted">
              {(effectiveScope === "my"
                ? (["upcoming", "collaborations", "past"] as FeedView[])
                : (["upcoming", "past"] as FeedView[])
              ).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFeedView(v)}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                    feedView === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "upcoming" ? "Upcoming" : v === "collaborations" ? "Collaborations" : "Past"}
                </button>
              ))}
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
              feed,
              effectiveView === "upcoming" || effectiveView === "collaborations"
            ).map(({ key: monthKey, label: monthLabel, items }) => (
              <section key={monthKey}>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3 sticky top-0 bg-background/95 backdrop-blur py-1 -mx-1 px-1">
                  {monthLabel}
                </h2>
                <div className="space-y-4">
                  {items.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        const params = new URLSearchParams();
                        if (isArtist) params.set("scope", scope);
                        params.set("view", feedView);
                        navigate(`/releases/${r.id}?${params}`);
                      }}
                      className="w-full text-left bg-card border rounded-xl p-4 hover:bg-accent/5 transition-colors flex gap-4"
                    >
                      <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                        {r.artworkUrl ? (
                          <img src={r.artworkUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Music className="w-10 h-10 text-muted-foreground" />
                      )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                          {formatReleaseTitleLine(r.artistUsername, r.title, r.collaborators)}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">{formatDate(r.releaseDate)}</p>
                        {getBannerFromLinks(r.links, isUpcoming(r.releaseDate)) && (
                          <p className="text-xs text-primary mt-1">
                            {getBannerFromLinks(r.links, isUpcoming(r.releaseDate))}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-2 items-center">
                          <span
                            className={`inline-block text-xs px-2 py-0.5 rounded ${
                              isUpcoming(r.releaseDate)
                                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                                : "bg-green-500/20 text-green-600 dark:text-green-400"
                            }`}
                          >
                            {isUpcoming(r.releaseDate) ? "Upcoming" : "Released"}
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
                                <span>{getLinkCtaLabel(link.platform, isUpcoming(r.releaseDate))}</span>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { formatDate, isUpcoming };
