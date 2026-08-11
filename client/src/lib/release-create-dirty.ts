/**
 * Small Create Release dirty-state helpers.
 * Compares local draft against known empty/default Create initialization.
 */

import {
  RELEASE_TIMING_MODE_EXACT,
  RELEASE_TIMING_MODE_MIDNIGHT,
} from "@shared/release-timing";
import type { ReleaseTimingDraft } from "@/lib/release-timing-draft";

export type ReleaseCreateDraftSnapshot = {
  title: string;
  artworkPath: string | null;
  comingSoon: boolean;
  releaseDate: string;
  timingDraft: ReleaseTimingDraft;
  draftLinksCount: number;
  stagedCollaboratorsCount: number;
  selectedPostIdsCount: number;
};

/** Fresh Add Release defaults — not dirty. */
export function isDefaultReleaseCreateTimingDraft(
  draft: ReleaseTimingDraft,
): boolean {
  return (
    draft.mode === RELEASE_TIMING_MODE_MIDNIGHT &&
    draft.timezone == null
  );
}

/**
 * True when the Create page has meaningful local draft work that would be lost.
 * Does not treat default Midnight initialization as dirty.
 */
export function hasUnsavedReleaseDraft(
  state: ReleaseCreateDraftSnapshot,
): boolean {
  if (state.title.trim().length > 0) return true;
  if (state.artworkPath) return true;
  if (state.comingSoon) return true;
  if (state.releaseDate.trim().length > 0) return true;
  if (state.timingDraft.mode === RELEASE_TIMING_MODE_EXACT) return true;
  if (!isDefaultReleaseCreateTimingDraft(state.timingDraft)) return true;
  if (state.draftLinksCount > 0) return true;
  if (state.stagedCollaboratorsCount > 0) return true;
  if (state.selectedPostIdsCount > 0) return true;
  return false;
}

export type CreateBackDecision = "navigate" | "confirm";

export function createBackDecision(dirty: boolean): CreateBackDecision {
  return dirty ? "confirm" : "navigate";
}

export type CreateDiscardChoice = "keep" | "discard";

export function applyCreateDiscardChoice(
  choice: CreateDiscardChoice,
): "stay" | "navigate" {
  return choice === "discard" ? "navigate" : "stay";
}
