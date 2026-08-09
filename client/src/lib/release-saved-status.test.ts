import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Calendar } from "lucide-react";
import {
  RELEASE_SAVED_STATUS_ICON,
  RELEASE_SAVED_TO_RELEASES_LABEL,
  getViewerSavedReleaseStatusParts,
  shouldShowViewerSavedReleaseStatus,
} from "./release-saved-status";

describe("shouldShowViewerSavedReleaseStatus", () => {
  it("shows when non-owner has viewerSavedRelease true with full detail", () => {
    assert.equal(
      shouldShowViewerSavedReleaseStatus({
        hasFullDetail: true,
        isOwner: false,
        viewerSavedRelease: true,
      }),
      true,
    );
  });

  it("hides when viewerSavedRelease is false", () => {
    assert.equal(
      shouldShowViewerSavedReleaseStatus({
        hasFullDetail: true,
        isOwner: false,
        viewerSavedRelease: false,
      }),
      false,
    );
  });

  it("hides for the release owner even when viewerSavedRelease is true", () => {
    assert.equal(
      shouldShowViewerSavedReleaseStatus({
        hasFullDetail: true,
        isOwner: true,
        viewerSavedRelease: true,
      }),
      false,
    );
  });

  it("hides without full detail or when flag is missing", () => {
    assert.equal(
      shouldShowViewerSavedReleaseStatus({
        hasFullDetail: false,
        isOwner: false,
        viewerSavedRelease: true,
      }),
      false,
    );
    assert.equal(
      shouldShowViewerSavedReleaseStatus({
        hasFullDetail: true,
        isOwner: false,
        viewerSavedRelease: undefined,
      }),
      false,
    );
    assert.equal(
      shouldShowViewerSavedReleaseStatus({
        hasFullDetail: true,
        isOwner: false,
        viewerSavedRelease: null,
      }),
      false,
    );
  });
});

describe("getViewerSavedReleaseStatusParts render contract", () => {
  it("uses the Releases tab Calendar icon", () => {
    assert.equal(RELEASE_SAVED_STATUS_ICON, Calendar);

    const parts = getViewerSavedReleaseStatusParts({
      hasFullDetail: true,
      isOwner: false,
      viewerSavedRelease: true,
    });
    assert.ok(parts);
    assert.equal(parts!.Icon, Calendar);
    assert.equal(parts!.label, "Saved to your Releases");
    assert.equal(parts!.label, RELEASE_SAVED_TO_RELEASES_LABEL);
  });

  it("returns null when status must not render", () => {
    assert.equal(
      getViewerSavedReleaseStatusParts({
        hasFullDetail: true,
        isOwner: true,
        viewerSavedRelease: true,
      }),
      null,
    );
    assert.equal(
      getViewerSavedReleaseStatusParts({
        hasFullDetail: true,
        isOwner: false,
        viewerSavedRelease: false,
      }),
      null,
    );
  });
});
