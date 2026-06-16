import type { FeedSortMode } from "@/components/genre-filter";
import { GENRE_ENTRIES } from "@/lib/genre-styles";
import { homeSearchHasPostOrTrack } from "@/lib/home-deeplink-url";

export type HomeFeedIdentificationFilter = "all" | "identified" | "unidentified";

/** Persisted sorted-feed session only — Random mode is intentionally excluded (phase 1). */
export type HomeFeedSessionState = {
  sortMode: Exclude<FeedSortMode, "random">;
  selectedGenres: string[];
  identificationFilter: HomeFeedIdentificationFilter;
  activePostId: string | null;
  scrollTop: number;
};

export type HomeFeedSessionBootstrap = {
  restoreSession: boolean;
  sortMode: FeedSortMode;
  selectedGenres: string[];
  identificationFilter: HomeFeedIdentificationFilter;
  activePostId: string | null;
  scrollTop: number;
};

const STORAGE_KEY = "dubhub:home-feed-session:v1";

const SORTED_FEED_MODES = new Set<HomeFeedSessionState["sortMode"]>(["trending", "newest", "hottest"]);
const IDENTIFICATION_FILTER_SET = new Set<HomeFeedIdentificationFilter>(["all", "identified", "unidentified"]);
const GENRE_ID_SET = new Set<string>(GENRE_ENTRIES.map((g) => g.id));

function parseSortedSortMode(value: unknown): HomeFeedSessionState["sortMode"] {
  if (typeof value === "string" && SORTED_FEED_MODES.has(value as HomeFeedSessionState["sortMode"])) {
    return value as HomeFeedSessionState["sortMode"];
  }
  return "trending";
}

function parseIdentificationFilter(value: unknown): HomeFeedIdentificationFilter {
  if (typeof value === "string" && IDENTIFICATION_FILTER_SET.has(value as HomeFeedIdentificationFilter)) {
    return value as HomeFeedIdentificationFilter;
  }
  return "all";
}

function parseSelectedGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !GENRE_ID_SET.has(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function parseActivePostId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseScrollTop(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function sanitizeHomeFeedSessionState(raw: unknown): HomeFeedSessionState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    sortMode: parseSortedSortMode(o.sortMode),
    selectedGenres: parseSelectedGenres(o.selectedGenres),
    identificationFilter: parseIdentificationFilter(o.identificationFilter),
    activePostId: parseActivePostId(o.activePostId),
    scrollTop: parseScrollTop(o.scrollTop),
  };
}

export function shouldRestoreHomeFeedSession(search: string): boolean {
  if (homeSearchHasPostOrTrack(search)) return false;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  if (params.get("openComments") === "1") return false;
  return true;
}

function resolveSortModeForRestore(
  search: string,
  savedSort: HomeFeedSessionState["sortMode"],
): FeedSortMode {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const sortParam = (params.get("sort") || "").toLowerCase();
  if (sortParam === "trending" || sortParam === "hottest" || sortParam === "newest") {
    return sortParam;
  }
  return savedSort;
}

export function loadHomeFeedSession(): HomeFeedSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeHomeFeedSessionState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveHomeFeedSession(state: HomeFeedSessionState): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function clearHomeFeedSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Build a snapshot for sessionStorage. Random mode is not persisted: filters are kept and the user
 * returns to Trending so phase-1 restore does not need random pool / seen-id state.
 */
export function buildHomeFeedSessionSnapshot(input: {
  sortMode: FeedSortMode;
  selectedGenres: string[];
  identificationFilter: HomeFeedIdentificationFilter;
  activePostId: string | null;
  scrollTop: number;
}): HomeFeedSessionState {
  if (input.sortMode === "random") {
    return {
      sortMode: "trending",
      selectedGenres: input.selectedGenres,
      identificationFilter: input.identificationFilter,
      activePostId: null,
      scrollTop: 0,
    };
  }
  return {
    sortMode: input.sortMode,
    selectedGenres: input.selectedGenres,
    identificationFilter: input.identificationFilter,
    activePostId: input.activePostId,
    scrollTop: parseScrollTop(input.scrollTop),
  };
}

export function getHomeFeedSessionBootstrap(search: string): HomeFeedSessionBootstrap {
  const defaults: HomeFeedSessionBootstrap = {
    restoreSession: false,
    sortMode: "trending",
    selectedGenres: [],
    identificationFilter: "all",
    activePostId: null,
    scrollTop: 0,
  };

  if (!shouldRestoreHomeFeedSession(search)) return defaults;

  const saved = loadHomeFeedSession();
  if (!saved) return defaults;

  return {
    restoreSession: true,
    sortMode: resolveSortModeForRestore(search, saved.sortMode),
    selectedGenres: saved.selectedGenres,
    identificationFilter: saved.identificationFilter,
    activePostId: saved.activePostId,
    scrollTop: saved.scrollTop,
  };
}
