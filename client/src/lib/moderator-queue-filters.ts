import { GENRE_ENTRIES, getGenreLabel, resolveGenreId } from "@/lib/genre-styles";

export type ModeratorQueueTab = "pending" | "reports";

export type QueueClaimFilter = "all" | "unclaimed" | "mine" | "others";

export type ModeratorGenreId = (typeof GENRE_ENTRIES)[number]["id"];

/** Selectable genres for moderator queue filter (no synthetic "all" id). */
export const MODERATOR_GENRE_OPTIONS: readonly { id: ModeratorGenreId; label: string }[] = [
  { id: "dnb", label: "DnB" },
  { id: "ukg", label: "UKG" },
  { id: "bassline", label: "Bassline" },
  { id: "house", label: "House" },
  { id: "techno", label: "Techno" },
  { id: "dubstep", label: "Dubstep" },
  { id: "trance", label: "Trance" },
  { id: "other", label: "Other" },
] as const;

const MODERATOR_GENRE_ID_SET = new Set<string>(MODERATOR_GENRE_OPTIONS.map((g) => g.id));

const QUEUE_CLAIM_FILTER_SET = new Set<string>(["all", "unclaimed", "mine", "others"]);

export type ModeratorQueueFilterState = {
  activeTab: ModeratorQueueTab;
  claimFilter: QueueClaimFilter;
  selectedGenres: ModeratorGenreId[];
};

export const MODERATOR_QUEUE_FILTER_DEFAULTS: ModeratorQueueFilterState = {
  activeTab: "pending",
  claimFilter: "unclaimed",
  selectedGenres: [],
};

const STORAGE_KEY = "dubhub:moderator-queue-filters:v1";

function isModeratorGenreId(value: unknown): value is ModeratorGenreId {
  return typeof value === "string" && MODERATOR_GENRE_ID_SET.has(value);
}

function parseClaimFilter(value: unknown): QueueClaimFilter {
  if (typeof value === "string" && QUEUE_CLAIM_FILTER_SET.has(value)) {
    return value as QueueClaimFilter;
  }
  return MODERATOR_QUEUE_FILTER_DEFAULTS.claimFilter;
}

function parseActiveTab(value: unknown): ModeratorQueueTab {
  return value === "reports" ? "reports" : "pending";
}

function parseSelectedGenres(value: unknown): ModeratorGenreId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ModeratorGenreId[] = [];
  for (const item of value) {
    if (!isModeratorGenreId(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function sanitizeModeratorQueueFilterState(
  raw: unknown,
): ModeratorQueueFilterState {
  if (!raw || typeof raw !== "object") {
    return { ...MODERATOR_QUEUE_FILTER_DEFAULTS };
  }
  const o = raw as Record<string, unknown>;
  return {
    activeTab: parseActiveTab(o.activeTab),
    claimFilter: parseClaimFilter(o.claimFilter),
    selectedGenres: parseSelectedGenres(o.selectedGenres),
  };
}

export function loadModeratorQueueFilterState(): ModeratorQueueFilterState {
  if (typeof window === "undefined") {
    return { ...MODERATOR_QUEUE_FILTER_DEFAULTS };
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...MODERATOR_QUEUE_FILTER_DEFAULTS };
    return sanitizeModeratorQueueFilterState(JSON.parse(raw));
  } catch {
    return { ...MODERATOR_QUEUE_FILTER_DEFAULTS };
  }
}

export function saveModeratorQueueFilterState(state: ModeratorQueueFilterState): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function matchesModeratorGenresFilter(
  rawGenre: string | null | undefined,
  selectedGenres: readonly string[],
): boolean {
  if (selectedGenres.length === 0) return true;
  const canonical = resolveGenreId(rawGenre);
  if (!canonical) return false;
  return selectedGenres.includes(canonical);
}

export const QUEUE_CLAIM_FILTER_OPTIONS: { id: QueueClaimFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unclaimed", label: "Unclaimed" },
  { id: "mine", label: "Claimed by Me" },
  { id: "others", label: "Claimed by Others" },
];

export function getModeratorGenreFilterLabel(selectedGenres: readonly string[]): string {
  if (selectedGenres.length === 0) return "All Genres";
  if (selectedGenres.length === 1) {
    return getGenreLabel(selectedGenres[0]);
  }
  return `${selectedGenres.length} genres`;
}
