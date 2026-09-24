/**
 * Edit Release dirty-state — compare current draft to one hydrated initial snapshot.
 * Do not reuse Create's blank/non-empty helper (Edit begins populated).
 */

import type { ReleaseTimingDraft } from "@/lib/release-timing-draft";

export type ReleaseEditLinkSnapshot = {
  platform: string;
  url: string;
  linkType: string | null;
};

export type ReleaseEditSnapshot = {
  title: string;
  artworkPath: string | null;
  comingSoon: boolean;
  releaseDate: string;
  timingDraft: ReleaseTimingDraft;
  links: ReleaseEditLinkSnapshot[];
  selectedPostIds: string[];
  stagedCollaboratorIds: string[];
};

export type ReleaseEditLinkDraft = {
  platform: string;
  url: string;
  linkType?: string | null;
  sortOrder?: number | null;
};

function normalizeLinkType(linkType?: string | null): string | null {
  const raw = String(linkType ?? "").trim().toLowerCase();
  if (!raw || raw === "listen") return null;
  return raw;
}

function normalizePlatform(platform: string): string {
  return String(platform ?? "").trim().toLowerCase();
}

function normalizeUrl(url: string): string {
  return String(url ?? "").trim();
}

/** Stable ordered link list for comparison (order is part of dirty state). */
export function normalizeEditLinksForSnapshot(
  links: ReleaseEditLinkDraft[],
): ReleaseEditLinkSnapshot[] {
  return links.map((l) => ({
    platform: normalizePlatform(l.platform),
    url: normalizeUrl(l.url),
    linkType: normalizeLinkType(l.linkType),
  }));
}

export function normalizeEditPostIdsForSnapshot(ids: string[]): string[] {
  return [...ids].map((id) => String(id)).filter(Boolean);
}

export function normalizeEditStagedCollaboratorIds(ids: string[]): string[] {
  return [...ids].map((id) => String(id).trim()).filter(Boolean).sort();
}

export function normalizeEditTimingDraft(
  draft: ReleaseTimingDraft,
): ReleaseTimingDraft {
  return {
    mode: draft.mode,
    timeLocal: String(draft.timeLocal ?? "").trim() || "18:00",
    timezone: draft.timezone?.trim() || null,
  };
}

export function buildReleaseEditSnapshot(args: {
  title: string;
  artworkPath: string | null;
  comingSoon: boolean;
  releaseDate: string;
  timingDraft: ReleaseTimingDraft;
  draftLinks: ReleaseEditLinkDraft[];
  selectedPostIds: string[];
  stagedCollaboratorIds: string[];
}): ReleaseEditSnapshot {
  return {
    title: String(args.title ?? "").trim(),
    artworkPath: args.artworkPath ? String(args.artworkPath) : null,
    comingSoon: !!args.comingSoon,
    releaseDate: String(args.releaseDate ?? "").trim(),
    timingDraft: normalizeEditTimingDraft(args.timingDraft),
    links: normalizeEditLinksForSnapshot(args.draftLinks),
    selectedPostIds: normalizeEditPostIdsForSnapshot(args.selectedPostIds),
    stagedCollaboratorIds: normalizeEditStagedCollaboratorIds(
      args.stagedCollaboratorIds,
    ),
  };
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameLinks(
  a: ReleaseEditLinkSnapshot[],
  b: ReleaseEditLinkSnapshot[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].platform !== b[i].platform ||
      a[i].url !== b[i].url ||
      a[i].linkType !== b[i].linkType
    ) {
      return false;
    }
  }
  return true;
}

function sameTiming(a: ReleaseTimingDraft, b: ReleaseTimingDraft): boolean {
  return (
    a.mode === b.mode &&
    a.timeLocal === b.timeLocal &&
    (a.timezone ?? null) === (b.timezone ?? null)
  );
}

/**
 * True when the artist has mutated Edit draft relative to the hydrated snapshot.
 */
export function hasUnsavedReleaseEditChanges(
  initial: ReleaseEditSnapshot | null,
  current: ReleaseEditSnapshot,
): boolean {
  if (!initial) return false;
  if (initial.title !== current.title) return true;
  if (initial.artworkPath !== current.artworkPath) return true;
  if (initial.comingSoon !== current.comingSoon) return true;
  if (initial.releaseDate !== current.releaseDate) return true;
  if (!sameTiming(initial.timingDraft, current.timingDraft)) return true;
  if (!sameLinks(initial.links, current.links)) return true;
  if (!sameStringArray(initial.selectedPostIds, current.selectedPostIds)) {
    return true;
  }
  if (
    !sameStringArray(
      initial.stagedCollaboratorIds,
      current.stagedCollaboratorIds,
    )
  ) {
    return true;
  }
  return false;
}

export type EditBackDecision = "navigate" | "confirm";

export function editBackDecision(dirty: boolean): EditBackDecision {
  return dirty ? "confirm" : "navigate";
}

/**
 * Edit Back / Save destination — same release detail, preserving useful from= context.
 * Do not use resolveReleaseDetailBackPath (that targets Releases list / Home).
 */
export function resolveReleaseEditExitPath(
  releaseId: string | null | undefined,
  search: string,
): string {
  const id = String(releaseId ?? "").trim();
  if (!id) return "/releases";
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const next = new URLSearchParams();
  const from = params.get("from");
  if (from === "feed" || from === "profile") {
    next.set("from", from);
    const profile = params.get("profile")?.trim();
    if (from === "profile" && profile) next.set("profile", profile);
  }
  const scope = params.get("scope");
  const view = params.get("view");
  if (scope) next.set("scope", scope);
  if (view) next.set("view", view);
  const qs = next.toString();
  return qs ? `/releases/${id}?${qs}` : `/releases/${id}`;
}

/**
 * Parent Links / Attached summary: use release payload until local draft is ready,
 * then prefer local draft once hydrated or mutated.
 */
export function resolveEditLinksSummarySource<T>(args: {
  draftLinks: T[];
  releaseLinks: T[] | undefined | null;
  draftsHydrated: boolean;
}): T[] {
  if (args.draftsHydrated || args.draftLinks.length > 0) return args.draftLinks;
  return args.releaseLinks ?? [];
}

export function resolveEditAttachedSummaryCount(args: {
  selectedPostIds: string[];
  releasePostIds: string[] | undefined | null;
  draftsHydrated: boolean;
}): number {
  if (args.draftsHydrated || args.selectedPostIds.length > 0) {
    return args.selectedPostIds.length;
  }
  return Array.isArray(args.releasePostIds) ? args.releasePostIds.length : 0;
}
