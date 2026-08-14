import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { RELEASE_ACTIVITY_KEY_STATS } from "@/components/release-activity-section";
import {
  RELEASE_SUBSCRIPTION_PAUSED_OWNER_COPY,
  RELEASE_SUBSCRIPTION_PAUSED_OWNER_TITLE,
  RELEASE_SUBSCRIPTION_PAUSED_UPGRADE_CTA,
  shouldShowOwnerSubscriptionPausedBanner,
  shouldShowPublicSubscriptionPausedState,
} from "./release-subscription-paused";

const here = dirname(fileURLToPath(import.meta.url));
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const activitySrc = readFileSync(
  join(here, "../components/release-activity-section.tsx"),
  "utf8",
);
const skeletonSrc = readFileSync(
  join(here, "../components/release-detail-skeleton.tsx"),
  "utf8",
);

describe("Release Detail loading stability", () => {
  it("removes visible Updating release chrome while keeping the detail query fetch", () => {
    assert.doesNotMatch(detailSrc, /Updating release/);
    assert.match(detailSrc, /isFetching/);
    assert.match(detailSrc, /queryKey: \["\/api\/releases", id\]/);
    assert.match(detailSrc, /fetchReleaseById/);
    assert.match(detailSrc, /placeholderData/);
  });

  it("keeps four structural activity metric slots for loading and resolved states", () => {
    assert.equal(RELEASE_ACTIVITY_KEY_STATS.length, 4);
    assert.deepEqual(
      RELEASE_ACTIVITY_KEY_STATS.map((s) => s.label),
      ["Featured posts", "Saves", "Comments", "Uploaders"],
    );
    assert.match(activitySrc, /data-testid="release-key-stats"/);
    assert.match(activitySrc, /showKeyStats/);
    assert.match(activitySrc, /stats \? \([\s\S]*Icon[\s\S]*\) : \([\s\S]*DubHubSkeletonBar/);
    assert.match(activitySrc, /\{def\.label\}/);
    assert.doesNotMatch(activitySrc, /ReleaseKeyStatsSkeleton/);
  });

  it("treats zero as a normal resolved metric value", () => {
    const zeros = {
      postsFeaturingTrack: 0,
      totalLikes: 0,
      totalComments: 0,
      uniqueUploaders: 0,
      firstClipAt: null,
      latestClipAt: null,
      daysToAnnouncement: null,
      daysToRelease: null,
    };
    assert.deepEqual(
      RELEASE_ACTIVITY_KEY_STATS.map((s) => s.value(zeros)),
      [0, 0, 0, 0],
    );
    assert.match(activitySrc, /toLocaleString\(\)/);
  });
});

describe("Paused recovery notice placement", () => {
  it("renders the owner recovery notice only for paused owner/collaborator state", () => {
    assert.equal(
      shouldShowOwnerSubscriptionPausedBanner({
        hasFullDetail: true,
        isOwner: true,
        isAcceptedCollaborator: false,
        release: { subscriptionSuspendedAt: "2026-08-01T00:00:00.000Z" },
      }),
      true,
    );
    assert.equal(
      shouldShowOwnerSubscriptionPausedBanner({
        hasFullDetail: true,
        isOwner: true,
        isAcceptedCollaborator: false,
        release: {},
      }),
      false,
    );
    assert.equal(RELEASE_SUBSCRIPTION_PAUSED_OWNER_TITLE, "This release is paused");
    assert.match(RELEASE_SUBSCRIPTION_PAUSED_OWNER_COPY, /subscription is inactive/i);
    assert.equal(RELEASE_SUBSCRIPTION_PAUSED_UPGRADE_CTA, "Restore release");
  });

  it("places the paused recovery notice after the release hero, not before", () => {
    const artwork = detailSrc.indexOf('testId="release-detail-artwork"');
    const paused = detailSrc.indexOf('data-testid="banner-release-subscription-paused"');
    const posts = detailSrc.indexOf("<ReleaseAttachedClips");
    assert.ok(artwork > 0);
    assert.ok(paused > artwork);
    assert.ok(posts > paused);
    assert.doesNotMatch(
      detailSrc.slice(0, artwork),
      /banner-release-subscription-paused/,
    );
  });

  it("keeps the canonical Paused pill in the hero and does not duplicate it in the notice", () => {
    assert.match(
      detailSrc,
      /paused=\{isSubscriptionPausedPublic \|\| isSubscriptionPausedOwner\}/,
    );
    assert.doesNotMatch(detailSrc, /badge-release-paused-banner/);
    assert.doesNotMatch(
      detailSrc.slice(detailSrc.indexOf("banner-release-subscription-paused")),
      /ReleaseStatusPill paused/,
    );
  });

  it("preserves the existing upgrade/recovery behaviour for owners", () => {
    assert.match(detailSrc, /requestVerifiedArtistToolsUpgrade\(toast, \{/);
    assert.match(detailSrc, /source: "future_release_paused"/);
    assert.match(detailSrc, /data-testid="button-release-paused-upgrade"/);
    assert.match(detailSrc, /\{isOwner \? \(/);
  });

  it("does not reserve a paused card in the cold skeleton", () => {
    assert.doesNotMatch(skeletonSrc, /banner-release-subscription-paused/);
    assert.doesNotMatch(skeletonSrc, /subscription is inactive/i);
    assert.doesNotMatch(skeletonSrc, /Restore release/);
  });

  it("keeps public paused unavailable notice distinct from owner recovery", () => {
    assert.equal(
      shouldShowPublicSubscriptionPausedState({
        hasFullDetail: true,
        isOwner: false,
        isAcceptedCollaborator: false,
        release: { availability: "subscription_paused", subscriptionSuspended: true },
      }),
      true,
    );
    assert.match(detailSrc, /banner-release-unavailable/);
  });
});
