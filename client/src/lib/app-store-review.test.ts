/**
 * App Store review governor, pending opportunity, and arm classification.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANONYMOUS_TRACK_IDENTIFIED_LIKER_WITH_TITLE_MESSAGE,
  ANONYMOUS_TRACK_IDENTIFIED_UPLOADER_MESSAGE,
  TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
} from "@shared/notification-messages";
import {
  REVIEW_COOLDOWN_MS,
  REVIEW_PENDING_SESSION_KEY,
  REVIEW_PENDING_TTL_MS,
  armReleaseCreatedFromExitPath,
  armReviewOpportunity,
  canRequestAppStoreReview,
  clearPendingAppStoreReviewOpportunity,
  commitAppStoreReviewRequest,
  dispatchReleaseAppStoreReview,
  evaluateHomeReviewDispatch,
  evaluateReleaseReviewDispatch,
  isPositiveContributorFeedbackMessage,
  readPendingReviewOpportunity,
  recordAppStoreReviewRequest,
  reviewOpportunityFromNotification,
  reviewOpportunityFromPush,
  type ReviewStorage,
} from "./app-store-review";

const here = dirname(fileURLToPath(import.meta.url));
const pushSrc = readFileSync(join(here, "./push-notifications.ts"), "utf8");
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const bannerSrc = readFileSync(join(here, "../hooks/use-in-app-notification-toasts.ts"), "utf8");
const authSrc = readFileSync(join(here, "./auth-session-utils.ts"), "utf8");

function memoryStorage(initial: Record<string, string> = {}): ReviewStorage & { dump(): Record<string, string> } {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
    dump() {
      return { ...data };
    },
  };
}

function throwingStorage(): ReviewStorage {
  return {
    getItem() {
      throw new Error("storage unavailable");
    },
    setItem() {
      throw new Error("storage unavailable");
    },
    removeItem() {
      throw new Error("storage unavailable");
    },
  };
}

const NOW = 1_700_000_000_000;

describe("review governor", () => {
  it("allows the first qualifying request", () => {
    const storage = memoryStorage();
    assert.deepEqual(canRequestAppStoreReview({ userId: "u1", now: NOW, storage }), { ok: true });
  });

  it("blocks a second request inside 120 days and shares one cooldown across triggers", () => {
    const storage = memoryStorage();
    assert.equal(
      recordAppStoreReviewRequest({
        userId: "u1",
        now: NOW,
        triggerType: "own_post_identified",
        appVersion: "1.5",
        storage,
      }),
      true,
    );
    assert.deepEqual(
      canRequestAppStoreReview({ userId: "u1", now: NOW + REVIEW_COOLDOWN_MS - 1, storage }),
      { ok: false, reason: "cooldown" },
    );
    assert.equal(storage.getItem("dubhub:app-store-review:u1:lastTriggerType"), "own_post_identified");
    assert.equal(
      recordAppStoreReviewRequest({
        userId: "u1",
        now: NOW + 10,
        triggerType: "release_created",
        appVersion: "1.6",
        storage,
      }),
      true,
    );
    assert.deepEqual(
      canRequestAppStoreReview({ userId: "u1", now: NOW + 11, storage }),
      { ok: false, reason: "cooldown" },
    );
  });

  it("allows a request once 120 days have elapsed", () => {
    const storage = memoryStorage();
    storage.setItem("dubhub:app-store-review:u1:lastReviewRequestAt", String(NOW));
    assert.deepEqual(
      canRequestAppStoreReview({ userId: "u1", now: NOW + REVIEW_COOLDOWN_MS, storage }),
      { ok: true },
    );
  });

  it("does not reset cooldown when the app version changes", () => {
    const storage = memoryStorage();
    recordAppStoreReviewRequest({
      userId: "u1",
      now: NOW,
      triggerType: "saved_track_release_added",
      appVersion: "1.5",
      storage,
    });
    storage.setItem("dubhub:app-store-review:u1:lastReviewRequestVersion", "9.0");
    assert.deepEqual(
      canRequestAppStoreReview({ userId: "u1", now: NOW + 1_000, storage }),
      { ok: false, reason: "cooldown" },
    );
  });

  it("fails closed when localStorage is missing or throws", () => {
    assert.deepEqual(canRequestAppStoreReview({ userId: "u1", now: NOW, storage: null }), {
      ok: false,
      reason: "storage",
    });
    assert.deepEqual(
      canRequestAppStoreReview({ userId: "u1", now: NOW, storage: throwingStorage() }),
      { ok: false, reason: "storage" },
    );
    assert.equal(
      recordAppStoreReviewRequest({
        userId: "u1",
        now: NOW,
        triggerType: "release_created",
        appVersion: "1.5",
        storage: null,
      }),
      false,
    );
  });
});

describe("pending review opportunity", () => {
  it("keeps a pending opportunity for less than 3 minutes and drops it at expiry", () => {
    const storage = memoryStorage();
    const armed = armReviewOpportunity(
      { type: "own_post_identified", entityId: "post-1" },
      { now: NOW, storage },
    );
    assert.ok(armed);
    assert.equal(
      readPendingReviewOpportunity({ now: NOW + REVIEW_PENDING_TTL_MS - 1, storage })?.entityId,
      "post-1",
    );
    assert.equal(
      readPendingReviewOpportunity({ now: NOW + REVIEW_PENDING_TTL_MS, storage }),
      null,
    );
    assert.equal(storage.getItem(REVIEW_PENDING_SESSION_KEY), null);
  });

  it("replaces an older unconsumed opportunity with the latest qualifying open", () => {
    const storage = memoryStorage();
    armReviewOpportunity(
      { type: "own_post_identified", entityId: "post-1" },
      { now: NOW, storage },
    );
    armReviewOpportunity(
      { type: "saved_track_release_added", entityId: "rel-2", postId: "post-9" },
      { now: NOW + 50, storage },
    );
    const pending = readPendingReviewOpportunity({ now: NOW + 60, storage });
    assert.equal(pending?.type, "saved_track_release_added");
    assert.equal(pending?.entityId, "rel-2");
    assert.equal(pending?.postId, "post-9");
  });

  it("clears the pending opportunity on logout or account deletion", () => {
    const storage = memoryStorage();
    armReviewOpportunity({ type: "release_created", entityId: "rel-1" }, { now: NOW, storage });
    clearPendingAppStoreReviewOpportunity(storage);
    assert.equal(readPendingReviewOpportunity({ now: NOW + 1, storage }), null);
    assert.match(authSrc, /clearPendingAppStoreReviewOpportunity\(\)/);
  });

  it("drops a release opportunity when the open release does not match", () => {
    const pending = armReviewOpportunity(
      { type: "saved_track_release_added", entityId: "rel-1", postId: "post-1" },
      { now: NOW, storage: memoryStorage() },
    );
    assert.equal(
      evaluateReleaseReviewDispatch({ pending, releaseId: "rel-2" }).action,
      "drop",
    );
  });
});

describe("own post identified arm", () => {
  it("qualifies an artist-identified post and uploader anonymous copy", () => {
    assert.deepEqual(
      reviewOpportunityFromNotification({
        notificationType: "artist_identified_post",
        postId: "post-1",
        message: "@artist just confirmed the track you uploaded.",
      }),
      { type: "own_post_identified", entityId: "post-1" },
    );
    assert.deepEqual(
      reviewOpportunityFromNotification({
        notificationType: "anonymous_track_identified",
        postId: "post-2",
        message: `${ANONYMOUS_TRACK_IDENTIFIED_UPLOADER_MESSAGE}\nID - Title`,
      }),
      { type: "own_post_identified", entityId: "post-2" },
    );
  });

  it("does not qualify liker anonymous copy, community submit, or liker track_identified", () => {
    assert.equal(
      reviewOpportunityFromNotification({
        notificationType: "anonymous_track_identified",
        postId: "post-2",
        message: ANONYMOUS_TRACK_IDENTIFIED_LIKER_WITH_TITLE_MESSAGE,
      }),
      null,
    );
    assert.equal(
      reviewOpportunityFromNotification({
        notificationType: "anonymous_track_identified",
        postId: "post-2",
        message: TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
      }),
      null,
    );
    assert.equal(
      reviewOpportunityFromNotification({
        notificationType: "community_identified_post",
        postId: "post-3",
        message: "Great news - your post has just been identified by the community.",
      }),
      null,
    );
    assert.equal(
      reviewOpportunityFromNotification({
        notificationType: "track_identified",
        postId: "post-4",
        message: TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
      }),
      null,
    );
    assert.equal(
      reviewOpportunityFromNotification({
        notificationType: "anonymous_track_revealed",
        postId: "post-5",
        message: "Mystery solved — it's @artist",
      }),
      null,
    );
  });
});

describe("saved release arm", () => {
  it("qualifies release_attached only when post and release ids are present", () => {
    assert.deepEqual(
      reviewOpportunityFromNotification({
        notificationType: "release_attached",
        postId: "post-1",
        releaseId: "rel-1",
        message: "That tune you've been waiting for? It's finally got a release date.",
      }),
      { type: "saved_track_release_added", entityId: "rel-1", postId: "post-1" },
    );
    assert.equal(
      reviewOpportunityFromNotification({
        notificationType: "release_attached",
        releaseId: "rel-1",
        message: "That tune you've been waiting for? It's finally got a release date.",
      }),
      null,
    );
  });

  it("does not arm announce, release day, or artist release alert", () => {
    for (const notificationType of ["release_announce", "release_day", "artist_release_alert"]) {
      assert.equal(
        reviewOpportunityFromNotification({
          notificationType,
          postId: "post-1",
          releaseId: "rel-1",
          message: "announced",
        }),
        null,
      );
    }
    assert.equal(
      reviewOpportunityFromPush({
        type: "release_announce",
        postId: "post-1",
        releaseId: "rel-1",
      }),
      null,
    );
    assert.equal(
      reviewOpportunityFromPush({
        type: "release_day_out_today",
        postId: "post-1",
        releaseId: "rel-1",
      }),
      null,
    );
    assert.equal(
      reviewOpportunityFromPush({
        type: "artist_release_alert",
        postId: "post-1",
        releaseId: "rel-1",
      }),
      null,
    );
  });

  it("drops an uploader-only open when the post is not liked", async () => {
    const session = memoryStorage();
    const local = memoryStorage();
    armReviewOpportunity(
      { type: "saved_track_release_added", entityId: "rel-1", postId: "post-uploader" },
      { now: NOW, storage: session },
    );
    const calls: string[] = [];
    const result = await dispatchReleaseAppStoreReview({
      userId: "u1",
      releaseId: "rel-1",
      now: NOW,
      sessionStorage: session,
      localStorage: local,
      platform: "ios",
      appVersion: "1.5",
      surfaceBlocked: false,
      likesPost: async () => false,
      requestNative: async () => {
        calls.push("native");
        return true;
      },
    });
    assert.equal(result, "wait");
    assert.deepEqual(calls, []);
    assert.equal(readPendingReviewOpportunity({ now: NOW, storage: session }), null);
    assert.equal(local.getItem("dubhub:app-store-review:u1:lastReviewRequestAt"), null);
  });

  it("requests when the saved post is still liked", async () => {
    const session = memoryStorage();
    const local = memoryStorage();
    armReviewOpportunity(
      { type: "saved_track_release_added", entityId: "rel-1", postId: "post-liked" },
      { now: NOW, storage: session },
    );
    const calls: string[] = [];
    const result = await dispatchReleaseAppStoreReview({
      userId: "u1",
      releaseId: "rel-1",
      now: NOW,
      sessionStorage: session,
      localStorage: local,
      platform: "ios",
      appVersion: "1.5",
      surfaceBlocked: false,
      likesPost: async () => true,
      requestNative: async () => {
        calls.push("native");
        return true;
      },
    });
    assert.equal(result, "requested");
    assert.deepEqual(calls, ["native"]);
  });

  it("does not request when the release id mismatches or a surface is open", async () => {
    const session = memoryStorage();
    const local = memoryStorage();
    armReviewOpportunity(
      { type: "saved_track_release_added", entityId: "rel-1", postId: "post-1" },
      { now: NOW, storage: session },
    );
    const mismatch = evaluateReleaseReviewDispatch({
      pending: readPendingReviewOpportunity({ now: NOW, storage: session }),
      releaseId: "rel-other",
    });
    assert.equal(mismatch.action, "drop");

    const calls: string[] = [];
    const liked = await commitAppStoreReviewRequest({
      userId: "u1",
      pending: {
        type: "saved_track_release_added",
        entityId: "rel-1",
        postId: "post-1",
        armedAt: NOW,
      },
      now: NOW,
      localStorage: local,
      sessionStorage: session,
      surfaceBlocked: true,
      platform: "ios",
      appVersion: "1.5",
      requestNative: async () => {
        calls.push("native");
        return true;
      },
    });
    assert.equal(liked, "blocked_surface");
    assert.deepEqual(calls, []);
    assert.equal(readPendingReviewOpportunity({ now: NOW, storage: session })?.entityId, "rel-1");
  });
});

describe("contributor confirmation arm", () => {
  it("qualifies community approval and live full-confirm wording", () => {
    assert.equal(
      isPositiveContributorFeedbackMessage("Your ID was confirmed by the community."),
      true,
    );
    assert.equal(isPositiveContributorFeedbackMessage("confirmed your track ID"), true);
    assert.deepEqual(
      reviewOpportunityFromNotification({
        notificationType: "id_verification_feedback",
        postId: "post-1",
        message: "Your ID was confirmed by the community.",
      }),
      { type: "id_contribution_confirmed", entityId: "post-1" },
    );
    assert.deepEqual(
      reviewOpportunityFromNotification({
        notificationType: null,
        postId: "post-2",
        message: "confirmed your track ID",
      }),
      { type: "id_contribution_confirmed", entityId: "post-2" },
    );
  });

  it("does not qualify rejection wording", () => {
    assert.equal(isPositiveContributorFeedbackMessage("rejected your track ID"), false);
    assert.equal(isPositiveContributorFeedbackMessage("confirmed"), false);
    assert.equal(
      reviewOpportunityFromNotification({
        notificationType: "id_verification_feedback",
        postId: "post-3",
        message: "rejected your track ID",
      }),
      null,
    );
    assert.equal(
      reviewOpportunityFromNotification({
        notificationType: null,
        postId: "post-3",
        message: "rejected your track ID",
      }),
      null,
    );
  });

  it("does not arm from background push receipt or notification polling", () => {
    assert.doesNotMatch(pushSrc, /pushNotificationReceived/);
    const handlerStart = pushSrc.indexOf("function handlePushNotificationActionPerformed");
    const handlerEnd = pushSrc.indexOf("export async function unregisterPushListeners");
    const handler = pushSrc.slice(handlerStart, handlerEnd);
    assert.match(handler, /armReviewOpportunity\(reviewArm\)/);
    assert.ok(handler.indexOf("armReviewOpportunity(reviewArm)") < handler.indexOf("navigate(route)"));
    assert.match(pushSrc, /pushNotificationActionPerformed/);
    const bannerTap = bannerSrc.indexOf("const handleBannerTap");
    const bannerArm = bannerSrc.indexOf("if (banner.reviewArm) armReviewOpportunity(banner.reviewArm)");
    assert.ok(bannerTap > 0 && bannerArm > bannerTap);
    assert.doesNotMatch(bannerSrc, /presentPayload\([\s\S]{0,200}armReviewOpportunity/);
  });
});

describe("release created arm", () => {
  it("qualifies a release detail exit and skips edit, list, and new", () => {
    const storage = memoryStorage();
    assert.equal(
      armReleaseCreatedFromExitPath("/releases/rel-1", { now: NOW, storage })?.type,
      "release_created",
    );
    assert.equal(armReleaseCreatedFromExitPath("/releases/rel-1/edit", { now: NOW, storage: memoryStorage() }), null);
    assert.equal(armReleaseCreatedFromExitPath("/releases", { now: NOW, storage: memoryStorage() }), null);
    assert.equal(armReleaseCreatedFromExitPath("/releases/new", { now: NOW, storage: memoryStorage() }), null);
  });

  it("does not arm from the paywall button or the failed-create catch", () => {
    const toolsIdx = createSrc.indexOf('data-testid="release-allowance-success-view-tools"');
    const toolsSlice = createSrc.slice(toolsIdx, toolsIdx + 400);
    assert.doesNotMatch(toolsSlice, /armReleaseCreatedFromExitPath/);
    const catchIdx = createSrc.indexOf('title: "Failed to create release"');
    const catchSlice = createSrc.slice(catchIdx, catchIdx + 500);
    assert.doesNotMatch(catchSlice, /armReleaseCreatedFromExitPath/);
    assert.match(createSrc, /armReleaseCreatedFromExitPath\(args\.exitPath\)/);
    assert.match(createSrc, /armReleaseCreatedFromExitPath\(path\)/);
  });
});

describe("dispatch platform and settle gates", () => {
  it("does not call the native bridge on web", async () => {
    const session = memoryStorage();
    const calls: string[] = [];
    const result = await commitAppStoreReviewRequest({
      userId: "u1",
      pending: { type: "release_created", entityId: "rel-1", armedAt: NOW },
      now: NOW,
      localStorage: memoryStorage(),
      sessionStorage: session,
      surfaceBlocked: false,
      platform: "web",
      appVersion: "web",
      requestNative: async () => {
        calls.push("native");
        return true;
      },
    });
    assert.equal(result, "not_ios");
    assert.deepEqual(calls, []);
    assert.equal(readPendingReviewOpportunity({ now: NOW, storage: session }), null);
  });

  it("calls native only after the home post has settled, then records the request", async () => {
    const pending = {
      type: "own_post_identified" as const,
      entityId: "post-1",
      armedAt: NOW,
    };
    assert.equal(
      evaluateHomeReviewDispatch({
        pending,
        activePostId: "other",
        postPresent: true,
        deepLinkPostId: "post-1",
      }).action,
      "wait",
    );
    const ready = evaluateHomeReviewDispatch({
      pending,
      activePostId: "post-1",
      postPresent: true,
      deepLinkPostId: "post-1",
    });
    assert.equal(ready.action, "request");
    const session = memoryStorage();
    session.setItem(REVIEW_PENDING_SESSION_KEY, JSON.stringify(pending));
    const local = memoryStorage();
    const calls: string[] = [];
    const result = await commitAppStoreReviewRequest({
      userId: "u1",
      pending,
      now: NOW,
      localStorage: local,
      sessionStorage: session,
      surfaceBlocked: false,
      platform: "ios",
      appVersion: "1.5",
      requestNative: async () => {
        calls.push("native");
        return true;
      },
    });
    assert.equal(result, "requested");
    assert.deepEqual(calls, ["native"]);
    assert.equal(local.getItem("dubhub:app-store-review:u1:lastReviewRequestAt"), String(NOW));
    assert.equal(local.getItem("dubhub:app-store-review:u1:lastReviewRequestVersion"), "1.5");
    assert.equal(local.getItem("dubhub:app-store-review:u1:lastTriggerType"), "own_post_identified");
    assert.equal(readPendingReviewOpportunity({ now: NOW, storage: session }), null);
  });

  it("does not record a request when native invocation fails", async () => {
    const local = memoryStorage();
    const result = await commitAppStoreReviewRequest({
      userId: "u1",
      pending: { type: "id_contribution_confirmed", entityId: "post-1", armedAt: NOW },
      now: NOW,
      localStorage: local,
      sessionStorage: memoryStorage(),
      surfaceBlocked: false,
      platform: "ios",
      appVersion: "1.5",
      requestNative: async () => false,
    });
    assert.equal(result, "native_failed");
    assert.equal(local.getItem("dubhub:app-store-review:u1:lastReviewRequestAt"), null);
  });

  it("blocks native while a surface is open and keeps the pending opportunity", async () => {
    const session = memoryStorage();
    const pending = { type: "release_created" as const, entityId: "rel-1", armedAt: NOW };
    session.setItem(REVIEW_PENDING_SESSION_KEY, JSON.stringify(pending));
    const calls: string[] = [];
    const result = await commitAppStoreReviewRequest({
      userId: "u1",
      pending,
      now: NOW,
      localStorage: memoryStorage(),
      sessionStorage: session,
      surfaceBlocked: true,
      platform: "ios",
      appVersion: "1.5",
      requestNative: async () => {
        calls.push("native");
        return true;
      },
    });
    assert.equal(result, "blocked_surface");
    assert.deepEqual(calls, []);
    assert.ok(readPendingReviewOpportunity({ now: NOW, storage: session }));
  });
});
