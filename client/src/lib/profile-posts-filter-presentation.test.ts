import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROFILE_POSTS_FILTER_LABEL_CLASS,
  PROFILE_POSTS_FILTER_ROW_CLASS,
  PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS,
  PROFILE_POSTS_FILTER_TAB_BASE_CLASS,
  PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS,
} from "./profile-posts-filter-presentation";

describe("profile-posts-filter-presentation", () => {
  it("uses equal flex secondary row without capsule chrome", () => {
    assert.match(PROFILE_POSTS_FILTER_ROW_CLASS, /flex/);
    assert.match(PROFILE_POSTS_FILTER_ROW_CLASS, /min-h-11/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_ROW_CLASS, /rounded-2xl|border-white\/10|bg-black/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_TAB_BASE_CLASS, /bg-primary|border-input|variant/);
  });

  it("keeps 44pt-equivalent targets and equal column distribution", () => {
    assert.match(PROFILE_POSTS_FILTER_TAB_BASE_CLASS, /min-h-11/);
    assert.match(PROFILE_POSTS_FILTER_TAB_BASE_CLASS, /flex-1/);
  });

  it("uses bright active text + teal underline on the label", () => {
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /font-semibold/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /text-foreground/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:bg-accent/);
    assert.match(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /after:h-\[2px\]/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS, /(?:^|\s)bg-accent(?:\s|$)|(?:^|\s)bg-primary(?:\s|$)/);
    assert.match(PROFILE_POSTS_FILTER_LABEL_CLASS, /truncate/);
  });

  it("mutes inactive labels without filled chrome", () => {
    assert.match(PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS, /text-white\/55/);
    assert.doesNotMatch(PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS, /border|bg-/);
  });
});
