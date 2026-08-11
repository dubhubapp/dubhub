/**
 * Create-only safeguard when a valid new release has zero attached posts.
 * Edit Save must never use this path.
 */

export const CREATE_WITHOUT_POSTS_TITLE = "Create without attached posts?" as const;

export const CREATE_WITHOUT_POSTS_BODY =
  "No posts are attached to this release. You can attach posts later from the release." as const;

export const CREATE_WITHOUT_POSTS_CONFIRM = "Create release" as const;

export const CREATE_WITHOUT_POSTS_BACK = "Go back" as const;

export type ReleaseCreateSubmitStep =
  | "toast-validation"
  | "confirm-zero-posts"
  | "mutate";

/** Validation always wins. Zero-post confirm is Create-only and never blocks Edit. */
export function nextReleaseCreateSubmitStep(args: {
  isCreate: boolean;
  formValid: boolean;
  selectedPostIdsCount: number;
}): ReleaseCreateSubmitStep {
  if (!args.formValid) return "toast-validation";
  if (
    args.isCreate &&
    Math.max(0, Math.floor(args.selectedPostIdsCount)) <= 0
  ) {
    return "confirm-zero-posts";
  }
  return "mutate";
}

export function shouldConfirmCreateWithoutAttachedPosts(args: {
  isCreate: boolean;
  formValid: boolean;
  selectedPostIdsCount: number;
}): boolean {
  return nextReleaseCreateSubmitStep(args) === "confirm-zero-posts";
}

/** Edit Save never nags for zero attached posts. */
export function shouldConfirmEditWithoutAttachedPosts(): false {
  return false;
}

export function createWithoutPostsConfirmChoice(
  choice: "confirm" | "back",
): "mutate" | "dismiss" {
  return choice === "confirm" ? "mutate" : "dismiss";
}
