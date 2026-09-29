/**
 * Shared leave decision for Release Create and Release Edit.
 * A child destination (profile, release card) is not the form Back URL.
 */

/** Above attach-viewer Comments (z-[110]) and that viewer's own alerts (z-[120]). */
export const RELEASE_FORM_DISCARD_DIALOG_LAYER_CLASS = "z-[140]" as const;

export type ReleaseFormLeaveChoice = "keep" | "discard";
export type ReleaseFormDiscardResult = "stay" | "child" | "back";
/** Clean child navigation pushes. Discard replaces the form history entry. */
export type ReleaseFormLeaveNavigation = "push" | "replace";

export function releaseFormChildNavigation(
  phase: "clean" | "discard",
): ReleaseFormLeaveNavigation {
  return phase === "discard" ? "replace" : "push";
}

/**
 * After discard, the form history entry is replaced by one profile URL.
 * Back then lands on the durable parent already underneath the form.
 */
export function historyAfterDiscardedFormProfile(input: {
  parent: string;
  form: string;
  profile: string;
}): string[] {
  return [input.parent, input.profile];
}

let discardedFormProfileArrival = false;

export function noteDiscardedFormProfileArrival(): void {
  discardedFormProfileArrival = true;
}

export function consumeDiscardedFormProfileArrival(): boolean {
  const value = discardedFormProfileArrival;
  discardedFormProfileArrival = false;
  return value;
}

/** Clean forms leave immediately. Dirty forms use the existing discard dialog. */
export function beginReleaseFormLeave(dirty: boolean): "navigate" | "confirm" {
  return dirty ? "confirm" : "navigate";
}

/**
 * Keep editing stays put.
 * Discard follows the stored child route when the viewer requested one.
 * Otherwise Discard uses the form's normal Back destination.
 */
export function completeReleaseFormDiscard(input: {
  choice: ReleaseFormLeaveChoice;
  pendingChild: boolean;
}): ReleaseFormDiscardResult {
  if (input.choice === "keep") return "stay";
  return input.pendingChild ? "child" : "back";
}
