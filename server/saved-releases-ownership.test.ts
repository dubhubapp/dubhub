import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isReleaseEligibleForSavedAfterInterest,
  savedReleasesOwnershipPrecedenceSql,
} from "./saved-releases-ownership";

const here = dirname(fileURLToPath(import.meta.url));
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");
const ownershipSrc = readFileSync(join(here, "saved-releases-ownership.ts"), "utf8");

const VIEWER = "viewer-artist-a";
const OTHER = "other-artist-b";

function eligibleInterest(overrides: Partial<Parameters<typeof isReleaseEligibleForSavedAfterInterest>[0]> = {}) {
  return isReleaseEligibleForSavedAfterInterest({
    viewerId: VIEWER,
    releaseArtistId: OTHER,
    collaboratorStatus: null,
    isPublic: true,
    subscriptionSuspended: false,
    hasQualifyingLikeOrUpload: true,
    ...overrides,
  });
}

describe("Saved Releases ownership precedence (pure rule)", () => {
  it("A: owner + liked attached post → Saved false", () => {
    assert.equal(
      eligibleInterest({
        releaseArtistId: VIEWER,
        collaboratorStatus: null,
        hasQualifyingLikeOrUpload: true,
      }),
      false,
    );
  });

  it("B: accepted collaborator + liked attached post → Saved false", () => {
    assert.equal(
      eligibleInterest({
        releaseArtistId: OTHER,
        collaboratorStatus: "ACCEPTED",
        hasQualifyingLikeOrUpload: true,
      }),
      false,
    );
  });

  it("C: community liker → Saved true", () => {
    assert.equal(
      eligibleInterest({
        viewerId: "community-c",
        releaseArtistId: OTHER,
        collaboratorStatus: null,
        hasQualifyingLikeOrUpload: true,
      }),
      true,
    );
  });

  it("D: artist liking another artist's release → Saved true", () => {
    assert.equal(
      eligibleInterest({
        viewerId: VIEWER,
        releaseArtistId: OTHER,
        collaboratorStatus: null,
        hasQualifyingLikeOrUpload: true,
      }),
      true,
    );
  });

  it("E: pending collaborator + qualifying like → Saved true", () => {
    assert.equal(
      eligibleInterest({
        releaseArtistId: OTHER,
        collaboratorStatus: "PENDING",
        hasQualifyingLikeOrUpload: true,
      }),
      true,
    );
  });

  it("F: own uploader on someone else's release → Saved true", () => {
    assert.equal(
      eligibleInterest({
        releaseArtistId: OTHER,
        collaboratorStatus: null,
        hasQualifyingLikeOrUpload: true,
      }),
      true,
    );
  });

  it("G: owner must not contribute to releasesSaved count (Saved false)", () => {
    assert.equal(
      eligibleInterest({
        releaseArtistId: VIEWER,
        hasQualifyingLikeOrUpload: true,
      }),
      false,
    );
  });

  it("H: accepted collaborator must not contribute to releasesSaved count (Saved false)", () => {
    assert.equal(
      eligibleInterest({
        collaboratorStatus: "ACCEPTED",
        hasQualifyingLikeOrUpload: true,
      }),
      false,
    );
  });

  it("rejected collaborator is not ownership-excluded", () => {
    assert.equal(
      eligibleInterest({
        collaboratorStatus: "REJECTED",
        hasQualifyingLikeOrUpload: true,
      }),
      true,
    );
  });

  it("interest paths still required", () => {
    assert.equal(
      eligibleInterest({
        hasQualifyingLikeOrUpload: false,
      }),
      false,
    );
  });
});

describe("Saved Releases ownership precedence (SQL + storage wiring)", () => {
  it("SQL fragment excludes owner via artist_id and ACCEPTED via release_collaborators.artist_id", () => {
    const start = ownershipSrc.indexOf("export function savedReleasesOwnershipPrecedenceSql");
    const next = ownershipSrc.indexOf("export type SavedReleaseCollaboratorStatus");
    assert.ok(start >= 0 && next > start);
    const sqlBlock = ownershipSrc.slice(start, next);
    assert.match(sqlBlock, /r\.artist_id\s*<>/);
    assert.match(sqlBlock, /release_collaborators/);
    assert.match(sqlBlock, /rc\.artist_id/);
    assert.match(sqlBlock, /status\s*=\s*'ACCEPTED'/);
    assert.doesNotMatch(sqlBlock, /collaborator_id/);
    const fragment = savedReleasesOwnershipPrecedenceSql(VIEWER);
    assert.ok(fragment);
  });

  it("savedReleasesFeedWhereSql applies ownership precedence", () => {
    const start = storageSrc.indexOf("function savedReleasesFeedWhereSql");
    const next = storageSrc.indexOf("function publicReleaseNotSuspendedSql");
    assert.ok(start >= 0 && next > start);
    const block = storageSrc.slice(start, next);
    assert.match(block, /savedReleasesOwnershipPrecedenceSql/);
    assert.match(block, /post_likes/);
    assert.match(block, /p\.user_id/);
  });

  it("isReleaseInViewerSavedFeed applies the same ownership precedence helper", () => {
    const start = storageSrc.indexOf("async isReleaseInViewerSavedFeed");
    const next = storageSrc.indexOf("async viewerHasOwnUploadOnRelease");
    assert.ok(start >= 0 && next > start);
    const block = storageSrc.slice(start, next);
    assert.match(block, /savedReleasesOwnershipPrecedenceSql/);
    assert.match(block, /post_likes/);
    assert.match(block, /p\.user_id\s*=\s*\$\{userId\}/);
  });

  it("countSavedReleasesForProfile uses Saved feed (inherits exclusion)", () => {
    const start = storageSrc.indexOf("async countSavedReleasesForProfile");
    const next = storageSrc.indexOf("async getReleasesDropDayBannerCandidates");
    assert.ok(start >= 0 && next > start);
    const block = storageSrc.slice(start, next);
    assert.match(block, /getReleasesFeed\(userId,\s*"upcoming",\s*"saved"\)/);
    assert.match(block, /getReleasesFeed\(userId,\s*"past",\s*"saved"\)/);
  });

  it("home widget listener candidates use savedReleasesFeedWhereSql", () => {
    assert.match(
      storageSrc,
      /async getHomeWidgetListenerSavedReleaseCandidates[\s\S]*?savedReleasesFeedWhereSql/,
    );
  });

  it("My Releases baseWhere remains owner OR ACCEPTED only (no Saved union)", () => {
    assert.match(
      storageSrc,
      /scope:\s*"my"\s*=\s*owned\s*\+\s*ACCEPTED collaborator/,
    );
    assert.doesNotMatch(
      storageSrc,
      /scope:\s*"my"\s*=\s*owned\s*\+\s*collaborator\s*\+\s*saved/,
    );
    const start = storageSrc.indexOf("async getReleasesFeed");
    const next = storageSrc.indexOf("async countSavedReleasesForProfile");
    assert.ok(start >= 0 && next > start);
    const block = storageSrc.slice(start, next);
    assert.match(
      block,
      /r\.artist_id\s*=\s*\$\{userId\}\s*OR\s*EXISTS\s*\([\s\S]*?status\s*=\s*'ACCEPTED'/,
    );
  });
});
