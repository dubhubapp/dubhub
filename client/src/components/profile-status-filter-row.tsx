/**
 * Shared All / Identified / Unidentified secondary filter row (Posts + Likes).
 * Presentation-only — state owners remain in user-profile.tsx.
 */

import {
  PROFILE_POSTS_FILTER_LABEL_CLASS,
  PROFILE_POSTS_FILTER_ROW_CLASS,
  PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS,
  PROFILE_POSTS_FILTER_TAB_BASE_CLASS,
  PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS,
} from "@/lib/profile-posts-filter-presentation";
import type { ProfileIdentificationFilter } from "@/lib/profile-identification-filter";

type ProfileStatusFilterRowProps = {
  value: ProfileIdentificationFilter;
  onChange: (next: ProfileIdentificationFilter) => void;
  allCount: number;
  identifiedCount: number;
  unidentifiedCount: number;
  ariaLabel: string;
  /** Root test id, e.g. `profile-posts-filter` / `profile-liked-filter`. */
  testId: string;
  /** Suffix for tab test ids, e.g. `posts` → `filter-all-posts`. */
  testIdSuffix: string;
};

export function ProfileStatusFilterRow({
  value,
  onChange,
  allCount,
  identifiedCount,
  unidentifiedCount,
  ariaLabel,
  testId,
  testIdSuffix,
}: ProfileStatusFilterRowProps) {
  const tabClass = (selected: boolean) =>
    `${PROFILE_POSTS_FILTER_TAB_BASE_CLASS} ${
      selected ? PROFILE_POSTS_FILTER_TAB_ACTIVE_CLASS : PROFILE_POSTS_FILTER_TAB_INACTIVE_CLASS
    }`;

  return (
    <div
      className={PROFILE_POSTS_FILTER_ROW_CLASS}
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "all"}
        className={tabClass(value === "all")}
        onClick={() => onChange("all")}
        data-testid={`filter-all-${testIdSuffix}`}
      >
        <span className={PROFILE_POSTS_FILTER_LABEL_CLASS}>All ({allCount})</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "identified"}
        className={tabClass(value === "identified")}
        onClick={() => onChange("identified")}
        data-testid={`filter-identified-${testIdSuffix}`}
      >
        <span className={PROFILE_POSTS_FILTER_LABEL_CLASS}>
          Identified ({identifiedCount})
        </span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "unidentified"}
        className={tabClass(value === "unidentified")}
        onClick={() => onChange("unidentified")}
        data-testid={`filter-unidentified-${testIdSuffix}`}
      >
        <span className={PROFILE_POSTS_FILTER_LABEL_CLASS}>
          Unidentified ({unidentifiedCount})
        </span>
      </button>
    </div>
  );
}
