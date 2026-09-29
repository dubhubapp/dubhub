import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INTERACTIVE_CANCEL_MS,
  INTERACTIVE_COMMIT_FALLBACK_MS,
  INTERACTIVE_COMMIT_PROGRESS,
  INTERACTIVE_DRAG_START_PX,
  INTERACTIVE_EDGE_START_PX,
  INTERACTIVE_FLICK_MIN_PX,
  INTERACTIVE_FLICK_PX_PER_MS,
  INTERACTIVE_HORIZONTAL_INTENT_RATIO,
  INTERACTIVE_MAX_VERTICAL_DRIFT_PX,
  INTERACTIVE_PAGE_EASING,
  INTERACTIVE_STACK_CAP,
  INTERACTIVE_POP_MS,
  INTERACTIVE_PUSH_MS,
  INTERACTIVE_VELOCITY_WINDOW_MS,
  COMMENTS_PROFILE_PUSH_FROM,
  HOME_FEED_PROFILE_PUSH_FROM,
  RELEASE_DETAIL_PROFILE_PUSH_FROM,
  createInteractivePopController,
  evaluateInteractiveRelease,
  interactiveMotionMs,
  interactiveParentNavigation,
  isCommentsPublicProfilePushLocation,
  isHomeFeedPublicProfilePushLocation,
  isHomeFeedReleaseDetailPushLocation,
  isHomeFeedStaticReturnLocation,
  popHistoryToInteractiveParent,
  isInteractiveStackPair,
  isOwnedInteractivePath,
  isSettingsStackPair,
  isWithinBackEdge,
  isWholesaleStackReplacement,
  pushVelocitySample,
  clearReleaseEditReturnRecord,
  clearReleaseEditReturnRecordIfRestored,
  editDiscardReleaseDetailProfile,
  holdReleaseEditReturnForProfileArrival,
  releaseEditOpenedFromDetailLocation,
  isReleaseEditPath,
  noteReleaseEditTransition,
  pagesAfterReleaseEditReturn,
  reduceSettingsTransitionStack,
  releaseEditReturnSnapshot,
  shouldPopReleaseEditToStackedDetail,
  isReleaseDetailPublicProfilePushLocation,
  shouldArmCommentsProfilePush,
  shouldArmHomeFeedPublicProfilePoster,
  shouldArmHomeFeedReleasePoster,
  shouldArmReleaseDetailProfilePush,
  shouldPlayCommentsProfilePush,
  shouldPlayHomeContextualPosterPush,
  shouldPlayHomeFeedReleasePosterPush,
  shouldPlayReleaseDetailProfilePush,
  shouldUseCommentsHomeStaticPop,
  shouldUseHomeFeedReleaseStaticPop,
  shouldUseReleaseDetailStaticPop,
  releaseWindowVelocity,
  stackLayerRole,
  shouldArmHorizontalDrag,
  shouldCancelBeforeArm,
  underlayDimOpacity,
  underlayShiftPercent,
} from "./interactive-page-transitions";
import {
  armCommentsHomeReturnVisit,
  armCommentsProfilePushUnderlay,
  bridgeCommentsHomeReturnVisit,
  commentsForwardMediaNode,
  commentsHomeReturnIsVisuallyReady,
  commentsSheetSampleFrom,
  commentsSheetTransformIsIdentity,
  copyScrollTree,
  nextCommentsReturnReadySample,
  pinOffsetInUntransformedHost,
  dismissCommentsHomeReturnVisit,
  dismissCommentsProfilePushUnderlay,
  getCommentsHomeReturnVisit,
  getCommentsProfilePushUnderlaySnapshot,
  hideCommentsHomeReturnVisit,
  revealCommentsHomeReturnVisit,
} from "./comments-profile-push-underlay";
import {
  armHomeFeedReleasePoster,
  armHomeFeedReleaseReturnVisit,
  bridgeHomeFeedReleaseReturnVisit,
  dismissHomeFeedReleasePoster,
  dismissHomeFeedReleaseReturnVisit,
  getHomeFeedReleasePosterSnapshot,
  getHomeFeedReleaseReturnVisit,
  hideHomeFeedReleaseReturnVisit,
  revealHomeFeedReleaseReturnVisit,
} from "./home-feed-release-poster";
import {
  activeReleaseDetailEditSessionId,
  armReleaseDetailProfileUnderlay,
  bridgeReleaseDetailReturnStill,
  discardParkedReleaseDetailEditSurface,
  dismissReleaseDetailProfileUnderlay,
  dismissReleaseDetailReturnStill,
  getParkedReleaseDetailEditSurface,
  getReleaseDetailProfileUnderlaySnapshot,
  getReleaseDetailReturnVisit,
  hideReleaseDetailReturnStill,
  parkReleaseDetailEditSurface,
  revealReleaseDetailReturnStill,
  takeParkedReleaseDetailEditSurface,
} from "./release-detail-profile-underlay";

const here = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(join(here, "../hooks/use-edge-swipe-back.ts"), "utf8");
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const stackSrc = readFileSync(join(here, "../components/interactive-settings-stack.tsx"), "utf8");
const swipeSrc = readFileSync(join(here, "../components/swipe-back-page.tsx"), "utf8");
const hapticSrc = readFileSync(join(here, "./haptic.ts"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const sessionSrc = readFileSync(join(here, "./home-feed-session.ts"), "utf8");
const postFlowSrc = readFileSync(join(here, "./post-flow.ts"), "utf8");
const nativeContractSrc = readFileSync(join(here, "./native-nav-contract.ts"), "utf8");
const nativeBridgeSrc = readFileSync(join(here, "./native-nav-bridge.ts"), "utf8");
const swiftSrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarOverlay.swift"),
  "utf8",
);
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const posterHostSrc = readFileSync(
  join(here, "../components/home-feed-release-poster-host.tsx"),
  "utf8",
);
const popupSrc = readFileSync(join(here, "../components/user-profile-light-popup.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const commentsUnderlayHostSrc = readFileSync(
  join(here, "../components/comments-profile-push-underlay-host.tsx"),
  "utf8",
);
const commentsUnderlaySrc = readFileSync(
  join(here, "./comments-profile-push-underlay.ts"),
  "utf8",
);
const notificationRoutingSrc = readFileSync(join(here, "./notification-routing.ts"), "utf8");
const releaseDetailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const releaseBylineSrc = readFileSync(
  join(here, "../components/release-detail-artist-byline.tsx"),
  "utf8",
);
const releaseDetailUnderlayHostSrc = readFileSync(
  join(here, "../components/release-detail-profile-underlay-host.tsx"),
  "utf8",
);
const gallerySrc = readFileSync(
  join(here, "../components/release-attached-posts-gallery.tsx"),
  "utf8",
);
const sequenceViewerSrc = readFileSync(
  join(here, "../components/full-screen-post-sequence-viewer.tsx"),
  "utf8",
);

const legacySlice = hookSrc.slice(
  hookSrc.indexOf("/* LEGACY_SWIPE_START */"),
  hookSrc.indexOf("/* LEGACY_SWIPE_END */"),
);
const interactiveSlice = hookSrc.slice(
  hookSrc.indexOf("/* INTERACTIVE_SWIPE_START */"),
  hookSrc.indexOf("/* INTERACTIVE_SWIPE_END */"),
);

describe("interactive page transitions", () => {
  it("pops a pushed settings child instead of replacing it with a duplicate", () => {
    const entries = [
      { path: "/profile", state: null },
      { path: "/settings", state: null },
      { path: "/settings/artist", state: interactiveParentNavigation("/settings").state },
    ];
    let index = 2;
    let backs = 0;
    const previous = globalThis.window;
    globalThis.window = {
      history: {
        get length() {
          return entries.length;
        },
        get state() {
          return entries[index]?.state ?? null;
        },
        back() {
          backs += 1;
          index -= 1;
        },
      },
    } as unknown as Window & typeof globalThis;
    try {
      assert.equal(popHistoryToInteractiveParent("/settings"), true);
      assert.equal(backs, 1);
      assert.equal(entries[index]?.path, "/settings");
      assert.equal(popHistoryToInteractiveParent("/settings"), false);
      assert.equal(backs, 1);
    } finally {
      globalThis.window = previous;
    }
  });

  it("keeps the legacy solo swipe path", () => {
    assert.doesNotMatch(appSrc, /interactivePageTransitionsEnabled/);
    assert.match(appSrc, /function ReleaseDetailRoute\(\) \{\n  return null;\n\}/);
    assert.match(appSrc, /path="\/releases\/new"/);
    assert.match(appSrc, /path="\/releases\/:id\/edit"/);
    assert.match(hookSrc, /const COMPLETE_PROGRESS = 0\.5/);
    assert.match(legacySlice, /COMPLETE_PROGRESS/);
    assert.doesNotMatch(interactiveSlice, /COMPLETE_PROGRESS/);
    assert.doesNotMatch(hookSrc, /playInteractionLight|playSuccessNotification|@\/lib\/haptic/);
  });
});

describe("settings transition stack", () => {
  it("stacks allowlisted pairs and keeps earlier pages up to the cap", () => {
    assert.deepEqual(reduceSettingsTransitionStack(["/settings"], "/settings/notifications"), [
      "/settings",
      "/settings/notifications",
    ]);
    assert.deepEqual(reduceSettingsTransitionStack(["/settings"], "/settings/artist"), [
      "/settings",
      "/settings/artist",
    ]);
    assert.deepEqual(reduceSettingsTransitionStack(["/settings"], "/settings/manage-account"), [
      "/settings",
      "/settings/manage-account",
    ]);
    assert.equal(isSettingsStackPair("/settings/artist", "/settings/artist-questions"), true);
    assert.deepEqual(
      reduceSettingsTransitionStack(["/settings", "/settings/artist"], "/settings/artist-questions"),
      ["/settings", "/settings/artist", "/settings/artist-questions"],
    );
    assert.deepEqual(
      reduceSettingsTransitionStack(["/settings"], "/settings/developer-diagnostics"),
      ["/settings", "/settings/developer-diagnostics"],
    );
    assert.deepEqual(
      reduceSettingsTransitionStack(
        ["/settings", "/settings/manage-account"],
        "/settings/country?returnTo=/settings/manage-account",
      ),
      ["/settings", "/settings/manage-account", "/settings/country"],
    );
    assert.equal(
      reduceSettingsTransitionStack(["/settings", "/settings/manage-account"], "/settings/country")
        .length,
      3,
    );
  });

  it("does not stack unused or out-of-scope routes", () => {
    assert.equal(isSettingsStackPair("/settings", "/settings/artist-questions"), false);
    assert.deepEqual(reduceSettingsTransitionStack(["/settings"], "/settings/artist-questions"), [
      "/settings/artist-questions",
    ]);
    assert.deepEqual(reduceSettingsTransitionStack(["/profile"], "/profile/ada"), [
      "/profile",
      "/profile/ada",
    ]);
    assert.deepEqual(reduceSettingsTransitionStack(["/releases"], "/releases/abc"), [
      "/releases",
      "/releases/abc",
    ]);
    assert.deepEqual(reduceSettingsTransitionStack([], "/leaderboard"), ["/leaderboard"]);
    assert.deepEqual(reduceSettingsTransitionStack([], "/moderator"), []);
    assert.deepEqual(reduceSettingsTransitionStack([], "/submit"), []);
    assert.deepEqual(reduceSettingsTransitionStack([], "/trim-video"), []);
    assert.deepEqual(reduceSettingsTransitionStack([], "/submit-metadata"), []);
    assert.deepEqual(reduceSettingsTransitionStack([], "/releases/new"), []);
    assert.deepEqual(reduceSettingsTransitionStack([], "/releases/abc/edit"), []);
  });

  it("never lets Home enter the stack", () => {
    for (const path of ["/", "/moderator", "/submit"]) {
      assert.deepEqual(reduceSettingsTransitionStack(["/settings"], path), []);
      assert.equal(isSettingsStackPair(path, "/settings"), false);
      assert.equal(isSettingsStackPair("/settings", path), false);
      assert.equal(isInteractiveStackPair("/", path), false);
      assert.equal(isInteractiveStackPair(path, "/"), false);
    }
    assert.deepEqual(reduceSettingsTransitionStack(["/settings"], "/profile"), ["/profile"]);
    assert.deepEqual(reduceSettingsTransitionStack(["/settings"], "/leaderboard"), ["/leaderboard"]);
    assert.deepEqual(reduceSettingsTransitionStack(["/settings"], "/releases"), ["/releases"]);
    assert.equal(isInteractiveStackPair("/settings", "/profile"), false);
    assert.deepEqual(reduceSettingsTransitionStack(["/", "/settings"], "/settings/artist"), [
      "/settings",
      "/settings/artist",
    ]);
  });

  it("pops only the foreground page and clears on a non-owned route", () => {
    assert.deepEqual(
      reduceSettingsTransitionStack(["/settings", "/settings/notifications"], "/settings"),
      ["/settings"],
    );
    const stacked = reduceSettingsTransitionStack(["/settings"], "/settings/artist");
    const replaced = reduceSettingsTransitionStack(stacked, "/submit");
    assert.deepEqual(replaced, []);
    const profileSettings = reduceSettingsTransitionStack(["/profile"], "/settings");
    assert.deepEqual(
      reduceSettingsTransitionStack(profileSettings, "/settings/notifications"),
      ["/profile", "/settings", "/settings/notifications"],
    );
  });
});

describe("phase 2 ordinary back pairs", () => {
  it("retains profile under settings", () => {
    assert.equal(isInteractiveStackPair("/profile", "/settings"), true);
    assert.deepEqual(reduceSettingsTransitionStack(["/profile"], "/settings"), [
      "/profile",
      "/settings",
    ]);
    assert.deepEqual(reduceSettingsTransitionStack([], "/settings"), ["/settings"]);
  });

  it("retains leaderboard under a public profile and not under own profile", () => {
    assert.deepEqual(reduceSettingsTransitionStack(["/leaderboard"], "/profile/ada"), [
      "/leaderboard",
      "/profile/ada",
    ]);
    assert.deepEqual(reduceSettingsTransitionStack(["/leaderboard"], "/profile"), ["/profile"]);
    assert.equal(isInteractiveStackPair("/leaderboard", "/"), false);
  });

  it("retains releases under release detail and drops edit/create", () => {
    assert.deepEqual(reduceSettingsTransitionStack(["/releases"], "/releases/abc?scope=my&view=upcoming"), [
      "/releases",
      "/releases/abc",
    ]);
    assert.deepEqual(reduceSettingsTransitionStack(["/releases", "/releases/abc"], "/releases/abc/edit"), []);
    assert.deepEqual(reduceSettingsTransitionStack([], "/releases/new"), []);
  });

  it("retains the matching public profile under a from=profile release", () => {
    assert.deepEqual(
      reduceSettingsTransitionStack(
        ["/profile/ada"],
        "/releases/abc?from=profile&profile=ada",
      ),
      ["/profile/ada", "/releases/abc"],
    );
    assert.deepEqual(
      reduceSettingsTransitionStack(["/profile/ada"], "/releases/abc?from=profile&profile=bea"),
      ["/releases/abc"],
    );
    assert.deepEqual(
      reduceSettingsTransitionStack(["/profile/ada"], "/releases/abc"),
      ["/releases/abc"],
    );
    assert.deepEqual(
      reduceSettingsTransitionStack(["/profile/ada"], "/releases/abc?from=feed"),
      ["/releases/abc"],
    );
  });

  it("keeps the chain when a third allowlisted route is pushed", () => {
    const leaderboardProfile = reduceSettingsTransitionStack(["/leaderboard"], "/profile/ada");
    assert.deepEqual(
      reduceSettingsTransitionStack(
        leaderboardProfile,
        "/releases/abc?from=profile&profile=ada",
      ),
      ["/leaderboard", "/profile/ada", "/releases/abc"],
    );
    assert.deepEqual(
      reduceSettingsTransitionStack(["/releases", "/releases/abc"], "/profile/ada"),
      ["/profile/ada"],
    );
  });

  it("does not invent an underlay for a deep-linked child", () => {
    assert.deepEqual(reduceSettingsTransitionStack([], "/profile/ada"), ["/profile/ada"]);
    assert.deepEqual(reduceSettingsTransitionStack([], "/releases/abc?from=profile&profile=ada"), [
      "/releases/abc",
    ]);
    assert.deepEqual(reduceSettingsTransitionStack(["/"], "/profile/ada"), ["/profile/ada"]);
    assert.deepEqual(reduceSettingsTransitionStack(["/"], "/releases/abc"), ["/releases/abc"]);
    assert.deepEqual(reduceSettingsTransitionStack(["/profile"], "/"), []);
  });
});

describe("capped mounted stack", () => {
  it("keeps four pages and drops only the foreground on each back", () => {
    assert.equal(INTERACTIVE_STACK_CAP, 4);
    const questions = [
      "/profile",
      "/settings",
      "/settings/artist",
      "/settings/artist-questions",
    ];
    assert.deepEqual(
      reduceSettingsTransitionStack(
        ["/profile", "/settings", "/settings/artist"],
        "/settings/artist-questions",
      ),
      questions,
    );
    const afterQuestions = reduceSettingsTransitionStack(questions, "/settings/artist");
    assert.deepEqual(afterQuestions, ["/profile", "/settings", "/settings/artist"]);
    const afterArtist = reduceSettingsTransitionStack(afterQuestions, "/settings");
    assert.deepEqual(afterArtist, ["/profile", "/settings"]);
    assert.deepEqual(reduceSettingsTransitionStack(afterArtist, "/profile"), ["/profile"]);

    const country = [
      "/profile",
      "/settings",
      "/settings/manage-account",
      "/settings/country",
    ];
    assert.deepEqual(
      reduceSettingsTransitionStack(
        ["/profile", "/settings", "/settings/manage-account"],
        "/settings/country?returnTo=/settings/manage-account",
      ),
      country,
    );
    const afterCountry = reduceSettingsTransitionStack(country, "/settings/manage-account");
    assert.deepEqual(afterCountry, ["/profile", "/settings", "/settings/manage-account"]);
    assert.deepEqual(reduceSettingsTransitionStack(afterCountry, "/settings"), [
      "/profile",
      "/settings",
    ]);

    const releaseChain = reduceSettingsTransitionStack(
      ["/leaderboard", "/profile/ada"],
      "/releases/abc?from=profile&profile=ada",
    );
    assert.deepEqual(releaseChain, ["/leaderboard", "/profile/ada", "/releases/abc"]);
    assert.deepEqual(reduceSettingsTransitionStack(releaseChain, "/profile/ada"), [
      "/leaderboard",
      "/profile/ada",
    ]);
    assert.deepEqual(
      reduceSettingsTransitionStack(["/leaderboard", "/profile/ada"], "/leaderboard"),
      ["/leaderboard"],
    );
  });

  it("drops the oldest page on a fifth allowlisted push and never keeps Home", () => {
    const capped = reduceSettingsTransitionStack(
      ["/profile", "/leaderboard", "/releases", "/settings/artist"],
      "/settings/artist-questions",
    );
    assert.equal(capped.length, 4);
    assert.deepEqual(capped, [
      "/leaderboard",
      "/releases",
      "/settings/artist",
      "/settings/artist-questions",
    ]);
    assert.equal(capped.includes("/"), false);
    assert.deepEqual(
      reduceSettingsTransitionStack(
        ["/profile", "/settings", "/settings/notifications"],
        "/",
      ),
      [],
    );
  });

  it("gives only the foreground an interactive role", () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((index) => stackLayerRole(4, index)),
      ["retained", "retained", "underlay", "foreground"],
    );
    assert.deepEqual(
      [0, 1, 2].map((index) => stackLayerRole(3, index)),
      ["retained", "underlay", "foreground"],
    );
    assert.equal(stackLayerRole(1, 0), "solo");
    assert.match(stackSrc, /opacity-0 pointer-events-none/);
    assert.doesNotMatch(stackSrc, /invisible/);
    assert.match(stackSrc, /role === "foreground" \|\| staticPop \? gesture : null/);
    assert.match(swipeSrc, /role !== "underlay" && role !== "retained"/);
    assert.equal((stackSrc.match(/data-settings-stack-dim/g) ?? []).length, 2);
  });

  it("moves X travel onto an in-flow child and leaves the page shell untransformed", () => {
    assert.match(stackSrc, /data-settings-motion/);
    assert.match(stackSrc, /absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden/);
    assert.match(stackSrc, /relative flex min-h-0 min-w-0 w-full flex-1 flex-col/);
    assert.match(stackSrc, /translate3d\(\$\{shift\}%,0,0\)/);
    assert.doesNotMatch(stackSrc, /safe-area-inset-top|translateY/);
  });
});

describe("interactive pop gesture", () => {
  it("uses the audited edge, arm, ratio, and vertical-cancel thresholds", () => {
    assert.equal(INTERACTIVE_EDGE_START_PX, 24);
    assert.equal(INTERACTIVE_DRAG_START_PX, 12);
    assert.equal(INTERACTIVE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(INTERACTIVE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(isWithinBackEdge(24), true);
    assert.equal(isWithinBackEdge(25), false);
    assert.equal(shouldArmHorizontalDrag(12, 0), true);
    assert.equal(shouldArmHorizontalDrag(11, 0), false);
    assert.equal(shouldArmHorizontalDrag(20, 20), false);
    assert.equal(shouldCancelBeforeArm(4, 15), true);
    assert.equal(shouldCancelBeforeArm(20, 15), false);
  });

  it("commits at 48% or a fast flick and cancels otherwise", () => {
    assert.equal(INTERACTIVE_COMMIT_PROGRESS, 0.48);
    assert.equal(INTERACTIVE_FLICK_PX_PER_MS, 0.4);
    assert.equal(INTERACTIVE_FLICK_MIN_PX, 28);
    assert.equal(INTERACTIVE_VELOCITY_WINDOW_MS, 100);
    assert.equal(
      evaluateInteractiveRelease({ distancePx: 188, widthPx: 390, velocityPxPerMs: 0 }),
      "commit",
    );
    assert.equal(
      evaluateInteractiveRelease({ distancePx: 180, widthPx: 390, velocityPxPerMs: 0.1 }),
      "cancel",
    );
    assert.equal(
      evaluateInteractiveRelease({ distancePx: 28, widthPx: 390, velocityPxPerMs: 0.4 }),
      "commit",
    );
    assert.equal(
      evaluateInteractiveRelease({ distancePx: 27, widthPx: 390, velocityPxPerMs: 0.9 }),
      "cancel",
    );
  });

  it("measures flick velocity inside the release window", () => {
    const samples = pushVelocitySample(
      [
        { x: 0, t: 0 },
        { x: 10, t: 50 },
      ],
      40,
      200,
    );
    assert.deepEqual(samples.map((sample) => sample.t), [200]);
    const windowed = pushVelocitySample(
      [
        { x: 10, t: 120 },
        { x: 30, t: 180 },
      ],
      50,
      200,
    );
    assert.equal(releaseWindowVelocity(windowed), 40 / 80);
  });

  it("moves the underlay from -30% toward 0 and clears dim with progress", () => {
    assert.equal(underlayShiftPercent(0), -30);
    assert.equal(underlayShiftPercent(1), 0);
    assert.ok(underlayDimOpacity(0) > underlayDimOpacity(1));
    assert.equal(underlayDimOpacity(1), 0);
    assert.equal(INTERACTIVE_PAGE_EASING, "cubic-bezier(0.32, 0.45, 0.42, 1)");
    assert.equal(INTERACTIVE_PUSH_MS, 280);
    assert.equal(INTERACTIVE_POP_MS, 280);
    assert.equal(INTERACTIVE_CANCEL_MS, 260);
  });

  it("cancel leaves history unchanged and complete calls onBack once", () => {
    const cancel = createInteractivePopController();
    assert.equal(cancel.beginDrag(), true);
    assert.equal(cancel.beginSettle("cancel", "drag"), true);
    let pops = 0;
    const kind = cancel.completeSettle();
    if (kind === "commit") pops += 1;
    assert.equal(kind, "cancel");
    assert.equal(pops, 0);
    assert.equal(cancel.canArm(), true);

    const commit = createInteractivePopController();
    assert.equal(commit.beginDrag(), true);
    assert.equal(commit.beginSettle("commit", "drag"), true);
    assert.equal(commit.completeSettle(), "commit");
    pops += 1;
    assert.equal(commit.completeSettle(), null);
    assert.equal(pops, 1);
  });

  it("returns to idle after a second cancel so edge and button Back can start again", () => {
    const runSettle = interactiveSlice.slice(
      interactiveSlice.indexOf("const runSettle"),
      interactiveSlice.indexOf("gesture.popDriverRef.current"),
    );
    const resetAt = runSettle.indexOf("settled = false");
    const beginAt = runSettle.indexOf("beginSettle(kind, source)");
    assert.ok(resetAt !== -1 && beginAt !== -1 && resetAt < beginAt);
    assert.match(interactiveSlice, /if \(settled \|\| disposed\) return/);

    const controller = createInteractivePopController();
    let settled = false;
    let commits = 0;
    const finishOnce = () => {
      if (settled) return false;
      settled = true;
      const kind = controller.completeSettle();
      if (kind === "commit") commits += 1;
      return kind;
    };
    const cancel = () => {
      settled = false;
      assert.equal(controller.phase, "idle");
      assert.equal(controller.beginDrag(), true);
      assert.equal(controller.phase, "dragging");
      assert.equal(controller.beginSettle("cancel", "drag"), true);
      assert.equal(controller.phase, "settling");
      assert.equal(finishOnce(), "cancel");
      assert.equal(finishOnce(), false);
      assert.equal(controller.phase, "idle");
      assert.equal(commits, 0);
    };

    cancel();
    cancel();
    assert.equal(controller.canArm(), true);
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.phase, "dragging");
    settled = false;
    assert.equal(controller.beginSettle("cancel", "drag"), true);
    assert.equal(finishOnce(), "cancel");
    assert.equal(controller.phase, "idle");
    assert.equal(commits, 0);
    settled = false;
    assert.equal(controller.beginSettle("commit", "button"), true);
    assert.equal(controller.phase, "settling");
    assert.equal(commits, 0);
  });

  it("blocks a second gesture or button pop while a commit is in flight", () => {
    const controller = createInteractivePopController();
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.canArm(), false);
    assert.equal(controller.beginDrag(), false);
    assert.equal(controller.beginSettle("commit", "drag"), true);
    assert.equal(controller.beginSettle("commit", "button"), false);
    assert.equal(controller.beginSettle("commit", "drag"), false);
    assert.equal(controller.canArm(), false);
  });
});

describe("live parent settings pop", () => {
  const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
  const settingsNotificationsSrc = readFileSync(
    join(here, "../pages/settings-notifications.tsx"),
    "utf8",
  );
  const settingsArtistSrc = readFileSync(join(here, "../pages/settings-artist.tsx"), "utf8");
  const notificationsCommit = settingsNotificationsSrc.slice(
    settingsNotificationsSrc.indexOf("const commitBack"),
    settingsNotificationsSrc.indexOf("const handleBack"),
  );
  const artistCommit = settingsArtistSrc.slice(
    settingsArtistSrc.indexOf("const commitBack"),
    settingsArtistSrc.indexOf("const handleBack"),
  );
  const endSettle = interactiveSlice.slice(
    interactiveSlice.indexOf("const endSettle"),
    interactiveSlice.indexOf("const finishOnce"),
  );
  const finishOnce = interactiveSlice.slice(
    interactiveSlice.indexOf("const finishOnce"),
    interactiveSlice.indexOf("const animateSurface"),
  );

  it("keeps the audited gesture numbers", () => {
    assert.equal(INTERACTIVE_EDGE_START_PX, 24);
    assert.equal(INTERACTIVE_DRAG_START_PX, 12);
    assert.equal(INTERACTIVE_HORIZONTAL_INTENT_RATIO, 1.2);
    assert.equal(INTERACTIVE_MAX_VERTICAL_DRIFT_PX, 14);
    assert.equal(INTERACTIVE_COMMIT_PROGRESS, 0.48);
    assert.equal(INTERACTIVE_FLICK_PX_PER_MS, 0.4);
    assert.equal(INTERACTIVE_POP_MS, 280);
    assert.equal(INTERACTIVE_CANCEL_MS, 260);
    assert.equal(INTERACTIVE_COMMIT_FALLBACK_MS, 420);
    assert.equal(INTERACTIVE_PAGE_EASING, "cubic-bezier(0.32, 0.45, 0.42, 1)");
    assert.equal(underlayShiftPercent(0), -30);
    assert.equal(underlayDimOpacity(0), 0.16);
  });

  it("commits one logical back after the foreground slide and keeps the parent mounted", () => {
    assert.equal(isInteractiveStackPair("/profile", "/settings"), true);
    assert.equal(isInteractiveStackPair("/settings", "/settings/notifications"), true);
    assert.deepEqual(
      reduceSettingsTransitionStack(["/profile", "/settings"], "/settings/notifications"),
      ["/profile", "/settings", "/settings/notifications"],
    );
    assert.equal(stackLayerRole(3, 1), "underlay");
    assert.equal(stackLayerRole(3, 2), "foreground");
    assert.match(swipeSrc, /const interactive = role === "foreground" \|\| transition\?\.staticPop === true/);
    assert.match(interactiveSlice, /translate3d\(\$\{clamped\}px,0,0\)/);
    assert.match(interactiveSlice, /animateSurface\("100%"/);
    assert.match(interactiveSlice, /INTERACTIVE_POP_MS/);
    assert.match(interactiveSlice, /gesture\.onProgress\(clamped \/ width, false, 0\)/);
    assert.match(stackSrc, /translate3d\(\$\{shift\}%,0,0\)/);
    assert.equal(
      evaluateInteractiveRelease({ distancePx: 200, widthPx: 390, velocityPxPerMs: 0 }),
      "commit",
    );

    const controller = createInteractivePopController();
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.beginSettle("commit", "drag"), true);
    assert.equal(controller.phase, "settling");
    let backs = 0;
    assert.equal(controller.completeSettle(), "commit");
    if (controller.phase === "committed") backs += 1;
    assert.equal(controller.completeSettle(), null);
    assert.equal(backs, 1);
    assert.match(endSettle, /completeSettle\(\)/);
    assert.ok(endSettle.indexOf("completeSettle()") < endSettle.indexOf("finishCommit()"));
    assert.match(endSettle, /kind !== "commit"/);
    assert.deepEqual(
      reduceSettingsTransitionStack(
        ["/profile", "/settings", "/settings/notifications"],
        "/settings",
      ),
      ["/profile", "/settings"],
    );
  });

  it("cancels without a history pop and returns the controller to idle", () => {
    assert.equal(
      evaluateInteractiveRelease({ distancePx: 40, widthPx: 390, velocityPxPerMs: 0.1 }),
      "cancel",
    );
    const controller = createInteractivePopController();
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.beginSettle("cancel", "drag"), true);
    assert.equal(controller.completeSettle(), "cancel");
    assert.equal(controller.phase, "idle");
    assert.equal(controller.canArm(), true);
    assert.match(interactiveSlice, /animateSurface\("0px"/);
    assert.match(interactiveSlice, /INTERACTIVE_CANCEL_MS/);
    assert.doesNotMatch(
      endSettle.slice(endSettle.indexOf('kind !== "commit"'), endSettle.indexOf("finishCommit()")),
      /finishCommit\(\)/,
    );
  });

  it("ignores a second gesture, a second button, and a second settle completion", () => {
    const dragging = createInteractivePopController();
    assert.equal(dragging.beginDrag(), true);
    assert.equal(dragging.beginSettle("commit", "drag"), true);
    assert.equal(dragging.beginDrag(), false);
    assert.equal(dragging.beginSettle("commit", "button"), false);
    assert.equal(dragging.beginSettle("cancel", "drag"), false);
    assert.equal(dragging.completeSettle(), "commit");
    assert.equal(dragging.completeSettle(), null);
    assert.equal(dragging.canArm(), false);

    const button = createInteractivePopController();
    assert.equal(button.beginSettle("commit", "button"), true);
    assert.equal(button.beginSettle("commit", "button"), false);
    assert.match(finishOnce, /if \(settled \|\| disposed\) return/);
    assert.match(interactiveSlice, /finishOnce\("transitionend"\)/);
    assert.match(interactiveSlice, /finishOnce\("fallback-timeout"\)/);
    assert.match(stackSrc, /popDriverRef\.current\?\.\(\)/);
  });

  it("releases a commit that never changes the route", () => {
    const controller = createInteractivePopController();
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.beginSettle("commit", "drag"), true);
    assert.equal(controller.completeSettle(), "commit");
    assert.equal(controller.canArm(), false);
    assert.equal(controller.releaseUnchangedCommit(), true);
    assert.equal(controller.phase, "idle");
    assert.equal(controller.canArm(), true);
    assert.equal(controller.releaseUnchangedCommit(), false);
    assert.equal(controller.beginDrag(), true);
    assert.match(stackSrc, /releaseUnchangedCommit\(\)/);
    assert.match(stackSrc, /controllerRef\.current !== controller/);
    assert.match(stackSrc, /locationRef\.current !== before/);
    assert.match(stackSrc, /INTERACTIVE_COMMIT_FALLBACK_MS/);
  });

  it("pops a nested settings child with one history.back and no extra settings entry", () => {
    assert.match(settingsSrc, /navigate\("\/settings\/notifications"\)/);
    assert.match(notificationsCommit, /window\.history\.back\(\)/);
    assert.match(notificationsCommit, /navigate\("\/settings", \{ replace: true \}\)/);
    assert.doesNotMatch(notificationsCommit, /navigate\("\/settings"\)/);
    assert.match(artistCommit, /popHistoryToInteractiveParent\("\/settings"\)/);
    assert.match(artistCommit, /navigate\("\/settings", \{ replace: true \}\)/);
    assert.equal(popHistoryToInteractiveParent("/settings"), false);
  });

  it("does not give root tabs an interactive pop", () => {
    assert.equal(isInteractiveStackPair("/", "/profile"), false);
    assert.equal(isInteractiveStackPair("/profile", "/releases"), false);
    assert.equal(isInteractiveStackPair("/releases", "/leaderboard"), false);
    assert.equal(isInteractiveStackPair("/leaderboard", "/"), false);
    assert.equal(stackLayerRole(1, 0), "solo");
    assert.match(swipeSrc, /const interactive = role === "foreground" \|\| transition\?\.staticPop === true/);
    assert.equal(isOwnedInteractivePath("/"), false);
  });
});

describe("interactive back button", () => {
  it("uses one non-interactive commit and does not double-pop", () => {
    const controller = createInteractivePopController();
    let pops = 0;
    assert.equal(controller.beginSettle("commit", "button"), true);
    assert.equal(controller.beginSettle("commit", "button"), false);
    if (controller.completeSettle() === "commit") pops += 1;
    if (controller.completeSettle() === "commit") pops += 1;
    assert.equal(pops, 1);
    assert.match(stackSrc, /requestPop/);
    assert.match(hookSrc, /popDriverRef/);
  });
});

describe("interactive transition haptics and reduced motion", () => {
  it("does not fire haptics on any back-swipe path", () => {
    assert.doesNotMatch(hookSrc, /playInteractionLight|playSuccessNotification|Haptics\.|@\/lib\/haptic/);
    assert.doesNotMatch(readFileSync(join(here, "./interactive-page-transitions.ts"), "utf8"), /haptic/);
  });

  it("skips travel when reduced motion is on and still allows one navigation", () => {
    assert.equal(interactiveMotionMs(true, "push"), 0);
    assert.equal(interactiveMotionMs(true, "pop"), 0);
    assert.equal(interactiveMotionMs(true, "cancel"), 0);
    assert.equal(interactiveMotionMs(false, "pop"), INTERACTIVE_POP_MS);
    assert.match(interactiveSlice, /prefersReducedPageMotion/);
    const controller = createInteractivePopController();
    let pops = 0;
    controller.beginSettle("commit", "button");
    if (controller.completeSettle() === "commit") pops += 1;
    assert.equal(pops, 1);
  });

  it("does not edit shared haptic helpers", () => {
    assert.match(hapticSrc, /export function playInteractionLight/);
    assert.match(hapticSrc, /export function playSuccessNotification/);
    assert.doesNotMatch(hapticSrc, /interactive-page-transitions|INTERACTIVE_COMMIT_PROGRESS/);
  });
});

describe("home feed release poster push", () => {
  const releaseNav = videoCardSrc.slice(
    videoCardSrc.indexOf("const navigateToReleasePreview"),
    videoCardSrc.indexOf("const [showComments", videoCardSrc.indexOf("const navigateToReleasePreview")),
  );

  it("arms a Home release poster for a non-owner feed card", () => {
    assert.equal(
      shouldArmHomeFeedReleasePoster({
        homeFeedCard: true,
        isReleaseOwner: false,
      }),
      true,
    );
    assert.equal(
      shouldArmHomeFeedReleasePoster({
        homeFeedCard: false,
        isReleaseOwner: false,
      }),
      false,
    );
  });

  it("does not arm or play a poster for edit, notifications, deep links, or the drop-day banner", () => {
    assert.equal(isHomeFeedReleaseDetailPushLocation("/releases/abc/edit?from=feed"), false);
    assert.equal(isHomeFeedReleaseDetailPushLocation("/releases/abc"), false);
    assert.equal(isHomeFeedReleaseDetailPushLocation("/releases/abc?from=profile&profile=ada"), false);
    assert.equal(isHomeFeedReleaseDetailPushLocation("/releases"), false);
    assert.deepEqual(reduceSettingsTransitionStack([], "/releases/abc/edit?from=feed"), []);
    assert.deepEqual(reduceSettingsTransitionStack([], "/releases/abc"), ["/releases/abc"]);
    assert.equal(
      shouldArmHomeFeedReleasePoster({
        homeFeedCard: true,
        isReleaseOwner: true,
      }),
      false,
    );
  });

  it("arms a poster and mounts release detail solo without putting Home on the stack", () => {
    dismissHomeFeedReleasePoster();
    const armed = armHomeFeedReleasePoster({
      destinationPath: "/releases/abc?from=feed",
      imageUrl: "https://example.test/poster.jpg",
      objectFit: "cover",
    });
    assert.equal(getHomeFeedReleasePosterSnapshot()?.id, armed.id);
    assert.equal(getHomeFeedReleasePosterSnapshot()?.imageUrl, "https://example.test/poster.jpg");
    assert.equal(isHomeFeedReleaseDetailPushLocation("/releases/abc?from=feed"), true);
    assert.deepEqual(reduceSettingsTransitionStack([], "/releases/abc?from=feed"), ["/releases/abc"]);
    assert.equal(reduceSettingsTransitionStack([], "/releases/abc?from=feed").includes("/"), false);
    assert.equal(isInteractiveStackPair("/", "/releases/abc?from=feed"), false);
    assert.equal(stackLayerRole(1, 0), "solo");
    dismissHomeFeedReleasePoster(armed.id);
    assert.equal(getHomeFeedReleasePosterSnapshot(), null);
    dismissHomeFeedReleasePoster(armed.id);
    assert.equal(getHomeFeedReleasePosterSnapshot(), null);
  });

  it("ignores a stale dismiss and drops the poster when the push finishes", () => {
    dismissHomeFeedReleasePoster();
    const armed = armHomeFeedReleasePoster({
      destinationPath: "/releases/abc?from=feed",
      imageUrl: null,
      objectFit: "contain",
    });
    dismissHomeFeedReleasePoster(armed.id + 1);
    assert.equal(getHomeFeedReleasePosterSnapshot()?.id, armed.id);
    assert.equal(getHomeFeedReleasePosterSnapshot()?.objectFit, "contain");
    dismissHomeFeedReleasePoster(armed.id);
    assert.equal(getHomeFeedReleasePosterSnapshot(), null);
  });

  it("plays the poster push only for a from=feed release detail", () => {
    assert.equal(shouldPlayHomeFeedReleasePosterPush("/releases/abc?from=feed"), true);
    assert.equal(shouldPlayHomeFeedReleasePosterPush("/releases/abc"), false);
    assert.equal(shouldPlayHomeFeedReleasePosterPush("/releases/abc?from=notification"), false);
  });

  it("captures the poster in the release-card handler before navigate", () => {
    assert.match(releaseNav, /!isReleaseOwner && homeFeedPosterFallback\)/);
    assert.ok(releaseNav.indexOf("armHomeFeedReleasePoster") < releaseNav.indexOf("navigate(destination)"));
    assert.match(releaseNav, /appendReleaseDetailFromFeedParam\(base\)/);
    assert.doesNotMatch(releaseNav, /<video|video\.play|removeAttribute\("src"\)|hardDisposeVideoElement/);
    assert.match(videoCardSrc, /function hardDispose|const hardDisposeVideoElement/);
  });

  it("slides the solo release page over a static poster and leaves root tabs instant", () => {
    assert.match(stackSrc, /HomeFeedReleasePosterHost/);
    assert.match(stackSrc, /translate3d\(100%,0,0\)/);
    assert.match(stackSrc, /INTERACTIVE_PUSH_MS/);
    assert.match(stackSrc, /INTERACTIVE_PAGE_EASING/);
    assert.match(stackSrc, /dismissHomeFeedReleasePoster\(posterId\)/);
    assert.match(posterHostSrc, /data-home-feed-release-poster/);
    assert.match(posterHostSrc, /pointer-events-none/);
    assert.match(posterHostSrc, /bg-zinc-950/);
    assert.doesNotMatch(posterHostSrc, /<video/);
    assert.doesNotMatch(stackSrc, /\bleft\s*:/);
    assert.equal(isInteractiveStackPair("/", "/profile"), false);
    assert.equal(isInteractiveStackPair("/", "/releases"), false);
    assert.equal(isInteractiveStackPair("/", "/leaderboard"), false);
    assert.equal(isInteractiveStackPair("/profile", "/releases"), false);
    assert.deepEqual(reduceSettingsTransitionStack(["/profile"], "/releases"), ["/releases"]);
    assert.deepEqual(reduceSettingsTransitionStack(["/releases"], "/leaderboard"), ["/leaderboard"]);
    assert.deepEqual(reduceSettingsTransitionStack(["/"], "/profile"), ["/profile"]);
    assert.deepEqual(reduceSettingsTransitionStack(["/releases"], "/releases/abc"), [
      "/releases",
      "/releases/abc",
    ]);
    assert.equal(isSettingsStackPair("/settings", "/settings/notifications"), true);
    assert.equal(isInteractiveStackPair("/settings", "/settings/artist"), true);
    assert.doesNotMatch(homeSrc, /dubhub_interactive_home_transitions|home-feed-release-poster/);
  });
});

describe("home feed profile popup push", () => {
  const authorOpen = videoCardSrc.slice(
    videoCardSrc.indexOf("const handleOpenPostAuthorProfile"),
    videoCardSrc.indexOf("const debugComments", videoCardSrc.indexOf("const handleOpenPostAuthorProfile")),
  );
  const fullProfile = popupSrc.slice(
    popupSrc.indexOf("const openFullProfile"),
    popupSrc.indexOf("const popup =", popupSrc.indexOf("const openFullProfile")),
  );

  it("arms a poster only for the Home feed popup opening another user", () => {
    assert.equal(
      shouldArmHomeFeedPublicProfilePoster({
        homeFeedOrigin: true,
        isSelf: false,
      }),
      true,
    );
    assert.equal(
      shouldArmHomeFeedPublicProfilePoster({
        homeFeedOrigin: true,
        isSelf: true,
      }),
      false,
    );
    assert.equal(
      shouldArmHomeFeedPublicProfilePoster({
        homeFeedOrigin: false,
        isSelf: false,
      }),
      false,
    );
    assert.match(authorOpen, /homeFeedPosterFallback/);
    assert.match(authorOpen, /homeFeedProfilePush:/);
    assert.doesNotMatch(commentsSrc, /homeFeedProfilePush/);
    assert.doesNotMatch(leaderboardSrc, /homeFeedProfilePush/);
  });

  it("pushes a solo public profile over the poster and skips the fade token", () => {
    assert.equal(
      isHomeFeedPublicProfilePushLocation(`/profile/ada?from=${HOME_FEED_PROFILE_PUSH_FROM}`),
      true,
    );
    assert.equal(isHomeFeedPublicProfilePushLocation("/profile/ada"), false);
    assert.equal(isHomeFeedPublicProfilePushLocation("/profile"), false);
    assert.equal(isHomeFeedPublicProfilePushLocation("/profile?from=home-popup"), false);
    assert.deepEqual(
      reduceSettingsTransitionStack([], `/profile/ada?from=${HOME_FEED_PROFILE_PUSH_FROM}`),
      ["/profile/ada"],
    );
    assert.equal(
      reduceSettingsTransitionStack([], `/profile/ada?from=${HOME_FEED_PROFILE_PUSH_FROM}`).includes("/"),
      false,
    );
    assert.equal(stackLayerRole(1, 0), "solo");
    assert.equal(isInteractiveStackPair("/", "/profile/ada?from=home-popup"), false);
    assert.match(fullProfile, /setTimeout\(navigateAfterClose, POPUP_CLOSE_MS\)/);
    assert.ok(fullProfile.indexOf("armHomeFeedReleasePoster") < fullProfile.lastIndexOf("navigate("));
    assert.match(fullProfile, /navigate\("\/profile"\)/);
    assert.match(fullProfile, /consumePublicProfileEnterAnimation\(\)/);
    assert.match(fullProfile, /markPublicProfileEnterAnimation\(\)/);
    assert.match(publicProfileSrc, /consumePublicProfileEnterAnimation\(\)/);
    assert.match(stackSrc, /shouldPlayHomeContextualPosterPush/);
  });

  it("leaves leaderboard, release-card, root tabs, and settings history alone", () => {
    assert.deepEqual(reduceSettingsTransitionStack(["/leaderboard"], "/profile/ada"), [
      "/leaderboard",
      "/profile/ada",
    ]);
    assert.equal(isInteractiveStackPair("/leaderboard", "/profile/ada"), true);
    assert.equal(isHomeFeedReleaseDetailPushLocation("/releases/abc?from=feed"), true);
    assert.deepEqual(reduceSettingsTransitionStack([], "/releases/abc?from=feed"), ["/releases/abc"]);
    assert.equal(isInteractiveStackPair("/", "/profile"), false);
    assert.equal(isInteractiveStackPair("/profile", "/releases"), false);
    assert.deepEqual(reduceSettingsTransitionStack(["/profile"], "/releases"), ["/releases"]);
    assert.equal(isSettingsStackPair("/settings", "/settings/artist"), true);
    assert.equal(isInteractiveStackPair("/profile", "/settings"), true);
    assert.equal(
      shouldPlayHomeContextualPosterPush(`/profile/ada?from=${HOME_FEED_PROFILE_PUSH_FROM}`),
      true,
    );
    assert.equal(shouldPlayHomeContextualPosterPush("/profile/ada"), false);
    assert.equal(shouldPlayHomeContextualPosterPush("/releases/abc?from=feed"), true);
  });
});

describe("comments popup public profile push", () => {
  const fullProfile = popupSrc.slice(
    popupSrc.indexOf("const openFullProfile"),
    popupSrc.indexOf("const popup =", popupSrc.indexOf("const openFullProfile")),
  );
  const commentsBranch = fullProfile.slice(
    fullProfile.indexOf("const commentsOrigin"),
    fullProfile.indexOf("const poster ="),
  );

  it("pushes another user from an explicit comments origin without the Home poster", () => {
    assert.equal(COMMENTS_PROFILE_PUSH_FROM, "comments-popup");
    assert.equal(
      shouldArmCommentsProfilePush({
        commentsOrigin: true,
        isSelf: false,
      }),
      true,
    );
    assert.equal(
      isCommentsPublicProfilePushLocation(`/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`),
      true,
    );
    assert.equal(isHomeFeedPublicProfilePushLocation(`/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`), false);
    assert.equal(shouldPlayHomeContextualPosterPush(`/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`), false);
    assert.deepEqual(
      reduceSettingsTransitionStack([], `/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`),
      ["/profile/ada"],
    );
    assert.equal(stackLayerRole(1, 0), "solo");
    assert.equal(isInteractiveStackPair("/", `/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`), false);
    assert.match(commentsBranch, /if \(commentsOrigin\)/);
    assert.match(commentsBranch, /consumePublicProfileEnterAnimation\(\)/);
    assert.doesNotMatch(commentsBranch, /markPublicProfileEnterAnimation\(\)/);
    assert.doesNotMatch(commentsBranch, /armHomeFeedReleasePoster/);
    assert.match(commentsBranch, /armCommentsProfilePushUnderlay\(marked\)/);
    assert.match(commentsBranch, /isInteractiveStackPair\(location, marked\)/);
    assert.doesNotMatch(commentsSrc, /homeFeedProfilePush/);
    assert.match(stackSrc, /comments-profile:\$\{underlayId\}/);
    assert.match(stackSrc, /CommentsProfilePushUnderlayHost/);
    assert.match(commentsUnderlayHostSrc, /data-comments-profile-underlay/);
    assert.match(commentsUnderlayHostSrc, /pointer-events-none/);
    assert.doesNotMatch(commentsUnderlayHostSrc, /<video/);
    assert.doesNotMatch(commentsUnderlayHostSrc, /home-feed-release-poster/);
    dismissCommentsProfilePushUnderlay();
    const armed = armCommentsProfilePushUnderlay(`/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`);
    assert.equal(getCommentsProfilePushUnderlaySnapshot()?.id, armed.id);
    assert.equal(getCommentsProfilePushUnderlaySnapshot()?.sheet, null);
    dismissCommentsProfilePushUnderlay(armed.id + 1);
    assert.equal(getCommentsProfilePushUnderlaySnapshot()?.id, armed.id);
    dismissCommentsProfilePushUnderlay(armed.id);
    assert.equal(getCommentsProfilePushUnderlaySnapshot(), null);
  });

  it("sends the current user to the root profile tab with no contextual push", () => {
    assert.equal(
      shouldArmCommentsProfilePush({
        commentsOrigin: true,
        isSelf: true,
      }),
      false,
    );
    assert.equal(isCommentsPublicProfilePushLocation("/profile"), false);
    assert.equal(isCommentsPublicProfilePushLocation("/profile?from=comments-popup"), false);
    const afterClose = fullProfile.slice(fullProfile.indexOf("const navigateAfterClose"));
    assert.ok(
      afterClose.indexOf('navigate("/profile")') <
        afterClose.indexOf("if (commentsOrigin)"),
    );
    assert.equal(isInteractiveStackPair("/", "/profile"), false);
    assert.equal(stackLayerRole(1, 0), "solo");
  });

  it("leaves the Home popup push on the poster path", () => {
    assert.equal(
      isHomeFeedPublicProfilePushLocation(`/profile/ada?from=${HOME_FEED_PROFILE_PUSH_FROM}`),
      true,
    );
    assert.equal(
      isCommentsPublicProfilePushLocation(`/profile/ada?from=${HOME_FEED_PROFILE_PUSH_FROM}`),
      false,
    );
    assert.match(fullProfile, /armHomeFeedReleasePoster/);
    assert.match(fullProfile, /from=\$\{HOME_FEED_PROFILE_PUSH_FROM\}/);
    assert.doesNotMatch(
      fullProfile.slice(fullProfile.indexOf("const poster =")),
      /armCommentsProfilePushUnderlay/,
    );
  });

  it("leaves the leaderboard pair and root tabs unchanged", () => {
    assert.deepEqual(reduceSettingsTransitionStack(["/leaderboard"], "/profile/ada"), [
      "/leaderboard",
      "/profile/ada",
    ]);
    assert.equal(isInteractiveStackPair("/leaderboard", "/profile/ada"), true);
    assert.equal(isInteractiveStackPair("/profile", "/releases"), false);
    assert.deepEqual(reduceSettingsTransitionStack(["/profile"], "/releases"), ["/releases"]);
    assert.doesNotMatch(leaderboardSrc, /comments-popup|armCommentsProfilePushUnderlay/);
    assert.equal(isInteractiveStackPair("/", "/leaderboard"), false);
  });

  it("does not treat a notification or deep link as a comments push", () => {
    assert.equal(isCommentsPublicProfilePushLocation("/profile/ada"), false);
    assert.equal(isCommentsPublicProfilePushLocation("/profile/ada?from=notification"), false);
    assert.equal(isCommentsPublicProfilePushLocation("/profile/ada?openComments=1"), false);
    assert.doesNotMatch(notificationRoutingSrc, /comments-popup|COMMENTS_PROFILE_PUSH_FROM/);
    assert.equal(shouldPlayCommentsProfilePush("/profile/ada"), false);
    assert.equal(
      shouldPlayCommentsProfilePush(`/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`),
      true,
    );
  });

  it("keeps a mounted comments drawer open and freezes only the home snapshot", () => {
    assert.doesNotMatch(commentsSrc, /coveredByProfilePush/);
    assert.doesNotMatch(commentsSrc, /modal=\{!/);
    assert.match(commentsSrc, /open=\{isOpen\}/);
    assert.doesNotMatch(commentsSrc, /visibility", "hidden"/);
    assert.doesNotMatch(commentsSrc, /data-scroll-locked/);
    assert.match(commentsSrc, /host\.style\.removeProperty\("overflow"\)/);
    assert.match(commentsSrc, /classList\.remove\("comments-modal-open"\)/);
    assert.match(commentsSrc, /setOpenCommentsPostId\(null\)/);
    assert.match(commentsUnderlaySrc, /getBoundingClientRect\(\)/);
    assert.match(commentsUnderlaySrc, /data-vaul-animate", "false"/);
    assert.match(commentsUnderlaySrc, /animation", "none", "important"/);
    assert.match(commentsUnderlaySrc, /transform", "none", "important"/);
    assert.match(commentsUnderlayHostSrc, /sheet\.style\.setProperty\("height"/);
    assert.match(stackSrc, /z-\[140\] pointer-events-auto/);
    assert.match(stackSrc, /liftAboveComments/);
    assert.equal(isInteractiveStackPair("/profile", `/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`), true);
    assert.match(commentsBranch, /isInteractiveStackPair\(location, marked\)/);
    assert.doesNotMatch(commentsBranch, /handleClose|setShowComments\(false\)/);
    assert.match(popupSrc, /stashProfileReturnReopenComments/);
    assert.match(popupSrc, /setTimeout\(navigateAfterClose, POPUP_CLOSE_MS\)/);
    assert.match(homeSrc, /consumeProfileReturnReopenComments\(\)/);
    assert.match(commentsSrc, /consumeCommentsRestoreWithoutOpenAnimation\(\)/);
    assert.match(commentsSrc, /data-vaul-animate", "false"/);
    assert.match(publicProfileSrc, /window\.history\.back\(\)/);
    assert.match(fullProfile, /navigate\(`\/profile\/\$\{encodeURIComponent\(trimmed\)\}`\)/);
  });
});

describe("release detail byline public profile push", () => {
  const openArtist = releaseDetailSrc.slice(
    releaseDetailSrc.indexOf("const openArtistProfile"),
    releaseDetailSrc.indexOf("if (!id || id === \"new\")"),
  );
  const pushBranch = openArtist.slice(
    openArtist.indexOf("shouldArmReleaseDetailProfilePush"),
    openArtist.indexOf("markPublicProfileEnterAnimation()"),
  );
  const marked = `/profile/ada?from=${RELEASE_DETAIL_PROFILE_PUSH_FROM}`;

  it("pushes another artist from the byline over a static underlay without retaining release detail", () => {
    assert.equal(RELEASE_DETAIL_PROFILE_PUSH_FROM, "release-detail");
    assert.equal(
      shouldArmReleaseDetailProfilePush({
        releaseDetailOrigin: true,
        isSelf: false,
        overlaysClosed: true,
      }),
      true,
    );
    assert.equal(isReleaseDetailPublicProfilePushLocation(marked), true);
    assert.equal(isHomeFeedPublicProfilePushLocation(marked), false);
    assert.equal(isCommentsPublicProfilePushLocation(marked), false);
    assert.equal(shouldPlayHomeContextualPosterPush(marked), false);
    assert.equal(shouldPlayCommentsProfilePush(marked), false);
    assert.equal(isInteractiveStackPair("/releases/abc", marked), false);
    assert.equal(isInteractiveStackPair("/releases", marked), false);
    assert.deepEqual(reduceSettingsTransitionStack(["/releases", "/releases/abc"], marked), [
      "/profile/ada",
    ]);
    assert.deepEqual(reduceSettingsTransitionStack(["/releases/abc"], marked), ["/profile/ada"]);
    assert.equal(stackLayerRole(1, 0), "solo");
    assert.match(openArtist, /viewerNorm &&\s*shouldArmReleaseDetailProfilePush/);
    assert.match(pushBranch, /consumePublicProfileEnterAnimation\(\)/);
    assert.match(pushBranch, /armReleaseDetailProfileUnderlay/);
    assert.match(pushBranch, /from=\$\{RELEASE_DETAIL_PROFILE_PUSH_FROM\}/);
    assert.doesNotMatch(pushBranch, /markPublicProfileEnterAnimation\(\)/);
    assert.doesNotMatch(pushBranch, /armHomeFeedReleasePoster|armCommentsProfilePushUnderlay/);
    assert.match(stackSrc, /release-detail-profile:\$\{underlayId\}/);
    assert.match(stackSrc, /translate3d\(100%,0,0\)/);
    assert.match(stackSrc, /ReleaseDetailProfileUnderlayHost/);
    assert.match(releaseDetailUnderlayHostSrc, /data-release-detail-profile-underlay/);
    assert.match(releaseDetailUnderlayHostSrc, /pointer-events-none/);
    assert.match(releaseDetailUnderlayHostSrc, /APP_MATERIAL_RELEASE_DETAIL_CANVAS_CLASS/);
    assert.doesNotMatch(releaseDetailUnderlayHostSrc, /<video|<audio/);
    assert.doesNotMatch(releaseDetailUnderlayHostSrc, /home-feed-release-poster|comments-profile/);
    dismissReleaseDetailProfileUnderlay();
    const armed = armReleaseDetailProfileUnderlay({
      destinationPath: marked,
      imageUrl: "https://example.com/art.jpg",
      atmosphereRgb: "12, 58, 120",
      atmosphereMode: "artwork",
      atmosphereReady: true,
      atmosphereInstant: true,
    });
    assert.equal(getReleaseDetailProfileUnderlaySnapshot()?.id, armed.id);
    assert.equal(getReleaseDetailProfileUnderlaySnapshot()?.imageUrl, "https://example.com/art.jpg");
    dismissReleaseDetailProfileUnderlay(armed.id + 1);
    assert.equal(getReleaseDetailProfileUnderlaySnapshot()?.id, armed.id);
    dismissReleaseDetailProfileUnderlay(armed.id);
    assert.equal(getReleaseDetailProfileUnderlaySnapshot(), null);
    assert.equal(shouldPlayReleaseDetailProfilePush(marked), true);
  });

  it("uses the same byline handler for an accepted collaborator", () => {
    assert.match(releaseBylineSrc, /onClick=\{\(\) => onArtistPress\(ownerNavUsername\)\}/);
    assert.match(releaseBylineSrc, /onClick=\{\(\) => onArtistPress\(collab\.username\)\}/);
    assert.equal(releaseDetailSrc.split("const openArtistProfile").length - 1, 1);
  });

  it("sends the current user to the root profile tab with no contextual push", () => {
    assert.equal(
      shouldArmReleaseDetailProfilePush({
        releaseDetailOrigin: true,
        isSelf: true,
        overlaysClosed: true,
      }),
      false,
    );
    assert.equal(isReleaseDetailPublicProfilePushLocation("/profile"), false);
    assert.equal(isReleaseDetailPublicProfilePushLocation("/profile?from=release-detail"), false);
    assert.ok(openArtist.indexOf('navigate("/profile")') < openArtist.indexOf("const destination"));
    assert.doesNotMatch(
      openArtist.slice(0, openArtist.indexOf("const destination")),
      /from=release-detail|armReleaseDetailProfileUnderlay/,
    );
  });

  it("does not arm while the gallery, lightbox, menu, or remove-saved dialog is open", () => {
    assert.equal(
      shouldArmReleaseDetailProfilePush({
        releaseDetailOrigin: true,
        isSelf: false,
        overlaysClosed: false,
      }),
      false,
    );
    assert.match(openArtist, /galleryInitialPostId == null/);
    assert.match(openArtist, /!artworkLightboxOpen/);
    assert.match(openArtist, /!releaseMenuOpen/);
    assert.match(openArtist, /!removeSavedDialogOpen/);
    assert.match(openArtist, /markPublicProfileEnterAnimation\(\)/);
    assert.match(openArtist, /navigate\(destination\)/);
    assert.doesNotMatch(gallerySrc, /from=release-detail|RELEASE_DETAIL_PROFILE_PUSH_FROM/);
    assert.doesNotMatch(sequenceViewerSrc, /from=release-detail|RELEASE_DETAIL_PROFILE_PUSH_FROM/);
    assert.doesNotMatch(videoCardSrc, /from=release-detail|RELEASE_DETAIL_PROFILE_PUSH_FROM/);
  });

  it("does not treat a notification or deep link as a release detail push", () => {
    assert.equal(isReleaseDetailPublicProfilePushLocation("/profile/ada"), false);
    assert.equal(isReleaseDetailPublicProfilePushLocation("/profile/ada?from=notification"), false);
    assert.equal(isReleaseDetailPublicProfilePushLocation("/profile/ada?from=home-popup"), false);
    assert.equal(isReleaseDetailPublicProfilePushLocation("/profile/ada?from=comments-popup"), false);
    assert.doesNotMatch(notificationRoutingSrc, /release-detail|RELEASE_DETAIL_PROFILE_PUSH_FROM/);
    assert.doesNotMatch(homeSrc, /RELEASE_DETAIL_PROFILE_PUSH_FROM/);
    assert.equal(shouldPlayReleaseDetailProfilePush("/profile/ada"), false);
    assert.equal(shouldPlayReleaseDetailProfilePush(marked), true);
  });

  it("leaves existing profile and release pairs unchanged", () => {
    assert.equal(
      isHomeFeedPublicProfilePushLocation(`/profile/ada?from=${HOME_FEED_PROFILE_PUSH_FROM}`),
      true,
    );
    assert.equal(
      isCommentsPublicProfilePushLocation(`/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`),
      true,
    );
    assert.equal(isInteractiveStackPair("/leaderboard", "/profile/ada"), true);
    assert.equal(isInteractiveStackPair("/releases", "/releases/abc"), true);
    assert.equal(
      isInteractiveStackPair("/profile/ada", "/releases/abc?from=profile&profile=ada"),
      true,
    );
    assert.equal(isInteractiveStackPair("/settings", "/settings/notifications"), true);
    assert.equal(isInteractiveStackPair("/", "/profile/ada"), false);
    assert.equal(isInteractiveStackPair("/profile", "/releases"), false);
    assert.match(publicProfileSrc, /window\.history\.back\(\)/);
    assert.doesNotMatch(openArtist, /isInteractiveStackPair/);
  });
});

describe("release detail static pop", () => {
  const marked = `/profile/ada?from=${RELEASE_DETAIL_PROFILE_PUSH_FROM}`;
  const releasePath = "/releases/abc?from=feed";
  const contextSrc = readFileSync(join(here, "./settings-transition-context.tsx"), "utf8");

  function withFlags(values: Map<string, string>, run: () => void): void {
    const previous = globalThis.window;
    globalThis.window = {
      sessionStorage: {
        getItem(key: string) {
          return values.get(key) ?? null;
        },
      },
    } as unknown as Window & typeof globalThis;
    try {
      run();
    } finally {
      globalThis.window = previous;
    }
  }

  function allFlags(): Map<string, string> {
    return new Map();
  }

  const visual = {
    destinationPath: marked,
    releasePath,
    imageUrl: "https://example.com/art.jpg",
    atmosphereRgb: "12, 58, 120",
    atmosphereMode: "artwork" as const,
    atmosphereReady: true,
    atmosphereInstant: true,
  };

  it("uses the interactive shell for a release-detail profile and not the legacy swipe", () => {
    dismissReleaseDetailProfileUnderlay();
    dismissReleaseDetailReturnStill();
    withFlags(allFlags(), () => {
      armReleaseDetailProfileUnderlay(visual);
      assert.equal(shouldUseReleaseDetailStaticPop(marked, true), true);
      assert.equal(getReleaseDetailReturnVisit()?.presentation, "stored");
      assert.equal(getReleaseDetailProfileUnderlaySnapshot()?.destinationPath, marked);
    });
    assert.match(swipeSrc, /transition\?\.staticPop === true/);
    assert.match(legacySlice, /if \(interactive\) return/);
    assert.match(interactiveSlice, /translate3d\(\$\{clamped\}px,0,0\)/);
    assert.match(interactiveSlice, /onDragArmed\?\.\(\)/);
    assert.match(stackSrc, /data-settings-motion/);
    assert.match(stackSrc, /ReleaseDetailReturnStillHost/);
    assert.doesNotMatch(releaseDetailUnderlayHostSrc, /<video|<audio/);
    assert.match(releaseDetailSrc, /releasePath/);
    assert.equal(isInteractiveStackPair("/releases/abc", marked), false);
    assert.equal(stackLayerRole(1, 0), "solo");
  });

  it("hides the still on cancel and can reveal it again", () => {
    dismissReleaseDetailReturnStill();
    const armed = armReleaseDetailProfileUnderlay(visual);
    dismissReleaseDetailProfileUnderlay(armed.id);
    assert.equal(getReleaseDetailProfileUnderlaySnapshot(), null);
    assert.equal(getReleaseDetailReturnVisit()?.presentation, "stored");
    revealReleaseDetailReturnStill();
    assert.equal(getReleaseDetailReturnVisit()?.presentation, "shown");
    const controller = createInteractivePopController();
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.beginSettle("cancel", "drag"), true);
    assert.equal(controller.completeSettle(), "cancel");
    assert.equal(controller.phase, "idle");
    const visitId = getReleaseDetailReturnVisit()?.id;
    hideReleaseDetailReturnStill();
    assert.equal(getReleaseDetailReturnVisit()?.presentation, "stored");
    assert.equal(getReleaseDetailReturnVisit()?.id, visitId);
    revealReleaseDetailReturnStill();
    assert.equal(getReleaseDetailReturnVisit()?.presentation, "shown");
    hideReleaseDetailReturnStill();
  });

  it("commits one history back after settle and holds the still until dismiss", () => {
    dismissReleaseDetailReturnStill();
    armReleaseDetailProfileUnderlay(visual);
    revealReleaseDetailReturnStill();
    const controller = createInteractivePopController();
    let backs = 0;
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.beginSettle("commit", "drag"), true);
    assert.equal(controller.phase, "settling");
    assert.equal(backs, 0);
    assert.equal(controller.completeSettle(), "commit");
    backs += 1;
    assert.equal(controller.completeSettle(), null);
    assert.equal(backs, 1);
    bridgeReleaseDetailReturnStill();
    assert.equal(getReleaseDetailReturnVisit()?.presentation, "bridging");
    const id = getReleaseDetailReturnVisit()?.id ?? 0;
    dismissReleaseDetailReturnStill(id + 1);
    assert.equal(getReleaseDetailReturnVisit()?.presentation, "bridging");
    dismissReleaseDetailReturnStill(id);
    assert.equal(getReleaseDetailReturnVisit(), null);
    assert.match(stackSrc, /bridgeReleaseDetailReturnStill\(\)/);
    assert.match(stackSrc, /commitRef\.current\(\)/);
    assert.match(publicProfileSrc, /window\.history\.back\(\)/);
    assert.doesNotMatch(
      stackSrc.slice(stackSrc.indexOf("finishCommit:"), stackSrc.indexOf("interactionRef,")),
      /navigate\(`\/releases/,
    );
  });

  it("sends the back button through the same settle", () => {
    assert.match(contextSrc, /ctx\?\.staticPop/);
    assert.match(contextSrc, /return ctx\.requestPop/);
    assert.match(stackSrc, /revealReleaseDetailReturnStill\(\)/);
    assert.match(stackSrc, /popDriverRef\.current\?\.\(\)/);
    assert.match(interactiveSlice, /runSettle\("commit", "button"\)/);
    const controller = createInteractivePopController();
    assert.equal(controller.beginSettle("commit", "button"), true);
    assert.equal(controller.beginSettle("commit", "button"), false);
    assert.equal(controller.completeSettle(), "commit");
    assert.equal(controller.completeSettle(), null);
  });

  it("lets transitionend and the fallback complete only once", () => {
    assert.match(interactiveSlice, /if \(settled \|\| disposed\) return/);
    assert.match(interactiveSlice, /finishOnce\("transitionend"\)/);
    assert.match(interactiveSlice, /finishOnce\("fallback-timeout"\)/);
    const controller = createInteractivePopController();
    assert.equal(controller.beginSettle("commit", "button"), true);
    assert.equal(controller.completeSettle(), "commit");
    assert.equal(controller.completeSettle(), null);
  });

  it("returns the controller to idle when the route does not change", () => {
    const controller = createInteractivePopController();
    assert.equal(controller.beginSettle("commit", "button"), true);
    assert.equal(controller.completeSettle(), "commit");
    assert.equal(controller.releaseUnchangedCommit(), true);
    assert.equal(controller.phase, "idle");
    assert.equal(controller.canArm(), true);
    assert.match(stackSrc, /hideReleaseDetailReturnStill\(\)/);
    assert.match(stackSrc, /INTERACTIVE_COMMIT_FALLBACK_MS/);
  });

  it("stores a frozen release-detail surface separately from the forward artwork still", () => {
    dismissReleaseDetailProfileUnderlay();
    dismissReleaseDetailReturnStill();
    const returnStillSrc = readFileSync(join(here, "./release-detail-profile-underlay.ts"), "utf8");
    armReleaseDetailProfileUnderlay({ ...visual, scrollTop: 240 });
    assert.equal(getReleaseDetailReturnVisit()?.scrollTop, 240);
    assert.equal(getReleaseDetailReturnVisit()?.surface, null);
    assert.equal(getReleaseDetailProfileUnderlaySnapshot()?.imageUrl, visual.imageUrl);
    assert.match(returnStillSrc, /cloneNode\(true\)/);
    assert.match(returnStillSrc, /root\.scrollTop/);
    assert.match(returnStillSrc, /"video, audio, canvas/);
    assert.match(returnStillSrc, /setAttribute\("inert", ""\)/);
    assert.match(returnStillSrc, /pointer-events", "none"/);
    assert.match(returnStillSrc, /removeAttribute\("id"\)/);
    assert.match(returnStillSrc, /\[data-testid='release-detail-atmosphere'\]/);
    assert.match(returnStillSrc, /releaseDetailReturnHasPainted/);
    assert.match(returnStillSrc, /img\[data-testid='release-detail-artwork'\]/);
    assert.match(returnStillSrc, /data-settings-stack='solo'/);
    assert.match(releaseDetailSrc, /captureReleaseDetailReturnSurface\(\)/);
    assert.match(releaseDetailUnderlayHostSrc, /appendChild\(surface\)/);
    assert.match(releaseDetailUnderlayHostSrc, /surface\.scrollTop = scrollTop/);
    assert.doesNotMatch(releaseDetailUnderlayHostSrc, /<video|<audio/);
    assert.match(stackSrc, /releaseDetailReturnHasPainted\(document\)/);
    const first = getReleaseDetailReturnVisit()?.id ?? 0;
    dismissReleaseDetailReturnStill(first + 1);
    assert.equal(getReleaseDetailReturnVisit()?.id, first);
    dismissReleaseDetailReturnStill(first);
    assert.equal(getReleaseDetailReturnVisit(), null);
  });

  it("leaves other profile entries and live parents on their current paths", () => {
    dismissReleaseDetailReturnStill();
    withFlags(allFlags(), () => {
      assert.equal(shouldUseReleaseDetailStaticPop("/profile/ada", true), false);
      assert.equal(shouldUseReleaseDetailStaticPop("/profile/ada?from=home-popup", true), false);
      assert.equal(shouldUseReleaseDetailStaticPop("/profile/ada?from=comments-popup", true), false);
      assert.equal(shouldUseReleaseDetailStaticPop("/profile/ada?from=notification", true), false);
      assert.equal(shouldUseReleaseDetailStaticPop("/profile", true), false);
      assert.equal(shouldUseReleaseDetailStaticPop(marked, false), false);
      assert.equal(isInteractiveStackPair("/leaderboard", "/profile/ada"), true);
      assert.equal(isInteractiveStackPair("/settings", "/settings/notifications"), true);
      assert.equal(isInteractiveStackPair("/releases", "/releases/abc"), true);
      assert.equal(
        isInteractiveStackPair("/profile/ada", "/releases/abc?from=profile&profile=ada"),
        true,
      );
      assert.equal(isInteractiveStackPair("/", "/profile"), false);
      assert.equal(isInteractiveStackPair("/profile", "/releases"), false);
      assert.equal(stackLayerRole(1, 0), "solo");
    });
    assert.doesNotMatch(homeSrc, /INTERACTIVE_BACK_TRANSITIONS_FLAG|dubhub_interactive_back_transitions/);
    assert.doesNotMatch(notificationRoutingSrc, /dubhub_interactive_back_transitions/);
    assert.doesNotMatch(commentsSrc, /dubhub_interactive_back_transitions/);
  });
});

describe("home feed release static pop", () => {
  const feedRelease = "/releases/abc?from=feed";
  const posterSrc = readFileSync(join(here, "./home-feed-release-poster.ts"), "utf8");

  function withFlags(values: Map<string, string>, run: () => void): void {
    const previous = globalThis.window;
    globalThis.window = {
      sessionStorage: {
        getItem(key: string) {
          return values.get(key) ?? null;
        },
      },
    } as unknown as Window & typeof globalThis;
    try {
      run();
    } finally {
      globalThis.window = previous;
    }
  }

  function allFlags(): Map<string, string> {
    return new Map();
  }

  it("uses the static interactive back only for a from=feed release with a return still", () => {
    dismissHomeFeedReleaseReturnVisit();
    withFlags(allFlags(), () => {
      assert.equal(shouldUseHomeFeedReleaseStaticPop(feedRelease, false), false);
      armHomeFeedReleaseReturnVisit({
        releasePath: feedRelease,
        postId: "post-1",
        imageUrl: "https://example.com/poster.jpg",
        objectFit: "cover",
        surface: null,
      });
      assert.equal(shouldUseHomeFeedReleaseStaticPop(feedRelease, true), true);
      assert.equal(shouldUseHomeFeedReleaseStaticPop("/releases/abc", true), false);
      assert.equal(shouldUseHomeFeedReleaseStaticPop("/releases/abc?from=profile&profile=ada", true), false);
      assert.equal(shouldUseHomeFeedReleaseStaticPop("/releases/abc?from=notification", true), false);
      assert.equal(isInteractiveStackPair("/releases", "/releases/abc"), true);
      assert.equal(isInteractiveStackPair("/", feedRelease), false);
      assert.equal(reduceSettingsTransitionStack([], feedRelease).includes("/"), false);
    });
    dismissHomeFeedReleaseReturnVisit();
  });

  it("hides the still on cancel and can reveal it again", () => {
    dismissHomeFeedReleaseReturnVisit();
    const visit = armHomeFeedReleaseReturnVisit({
      releasePath: feedRelease,
      postId: "post-1",
      imageUrl: "https://example.com/poster.jpg",
      objectFit: "contain",
      surface: null,
    });
    const visitId = visit.id;
    revealHomeFeedReleaseReturnVisit();
    assert.equal(getHomeFeedReleaseReturnVisit()?.presentation, "shown");
    hideHomeFeedReleaseReturnVisit();
    assert.equal(getHomeFeedReleaseReturnVisit()?.presentation, "stored");
    assert.equal(getHomeFeedReleaseReturnVisit()?.id, visitId);
    assert.equal(getHomeFeedReleaseReturnVisit()?.surface, null);
    revealHomeFeedReleaseReturnVisit();
    assert.equal(getHomeFeedReleaseReturnVisit()?.presentation, "shown");
    hideHomeFeedReleaseReturnVisit();
    dismissHomeFeedReleaseReturnVisit();
  });

  it("holds the still through one history back and ignores a stale id", () => {
    dismissHomeFeedReleaseReturnVisit();
    dismissHomeFeedReleasePoster();
    armHomeFeedReleaseReturnVisit({
      releasePath: feedRelease,
      postId: "post-1",
      imageUrl: "https://example.com/poster.jpg",
      objectFit: "cover",
      surface: null,
    });
    armHomeFeedReleasePoster({
      destinationPath: feedRelease,
      imageUrl: "https://example.com/poster.jpg",
      objectFit: "cover",
    });
    revealHomeFeedReleaseReturnVisit();
    const controller = createInteractivePopController();
    let backs = 0;
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.beginSettle("commit", "drag"), true);
    assert.equal(backs, 0);
    assert.equal(controller.completeSettle(), "commit");
    backs += 1;
    assert.equal(controller.completeSettle(), null);
    assert.equal(backs, 1);
    bridgeHomeFeedReleaseReturnVisit();
    assert.equal(getHomeFeedReleaseReturnVisit()?.presentation, "bridging");
    dismissHomeFeedReleasePoster();
    assert.equal(getHomeFeedReleasePosterSnapshot(), null);
    assert.equal(getHomeFeedReleaseReturnVisit()?.presentation, "bridging");
    const id = getHomeFeedReleaseReturnVisit()?.id ?? 0;
    dismissHomeFeedReleaseReturnVisit(id + 1);
    assert.equal(getHomeFeedReleaseReturnVisit()?.presentation, "bridging");
    dismissHomeFeedReleaseReturnVisit(id);
    assert.equal(getHomeFeedReleaseReturnVisit(), null);
    const commitBack = releaseDetailSrc.slice(
      releaseDetailSrc.indexOf("const commitBack"),
      releaseDetailSrc.indexOf("const handleBack"),
    );
    assert.match(commitBack, /shouldUseHomeFeedReleaseStaticPop/);
    assert.match(commitBack, /window\.history\.back\(\)/);
    assert.match(commitBack, /navigate\(releasesBackUrl\)/);
    assert.doesNotMatch(commitBack, /navigate\("\/"\)/);
    assert.match(stackSrc, /shouldUseHomeFeedReleaseStaticPop/);
    assert.match(stackSrc, /bridgeHomeFeedReleaseReturnVisit\(\)/);
    assert.match(stackSrc, /homeFeedReleaseReturnHasPainted\(document, postId\)/);
    assert.match(stackSrc, /data-home-feed-release-return-bridge/);
    assert.match(posterSrc, /"video, audio, canvas/);
    assert.match(posterSrc, /setAttribute\("inert", ""\)/);
    assert.match(posterSrc, /pointer-events", "none"/);
    assert.match(posterSrc, /removeAttribute\("data-post-id"\)/);
    assert.match(posterHostSrc, /appendChild\(surface\)/);
    assert.doesNotMatch(posterHostSrc, /<video|<audio/);
    assert.match(videoCardSrc, /postId: post\.id/);
    assert.doesNotMatch(homeSrc, /home-feed-release-poster|homeFeedReleaseReturn/);
    assert.doesNotMatch(sessionSrc, /home-feed-release-poster/);
  });
});

describe("home profile popup static pop", () => {
  const marked = `/profile/ada?from=${HOME_FEED_PROFILE_PUSH_FROM}`;
  const popupSrcLocal = readFileSync(join(here, "../components/user-profile-light-popup.tsx"), "utf8");
  const openFull = popupSrcLocal.slice(
    popupSrcLocal.indexOf("const openFullProfile"),
    popupSrcLocal.indexOf("const popup =", popupSrcLocal.indexOf("const openFullProfile")),
  );
  const authorOpen = videoCardSrc.slice(
    videoCardSrc.indexOf("const handleOpenPostAuthorProfile"),
    videoCardSrc.indexOf("const debugComments", videoCardSrc.indexOf("const handleOpenPostAuthorProfile")),
  );

  function withFlags(values: Map<string, string>, run: () => void): void {
    const previous = globalThis.window;
    globalThis.window = {
      sessionStorage: {
        getItem(key: string) {
          return values.get(key) ?? null;
        },
      },
    } as unknown as Window & typeof globalThis;
    try {
      run();
    } finally {
      globalThis.window = previous;
    }
  }

  function allFlags(): Map<string, string> {
    return new Map();
  }

  it("uses the same Home return still for a from=home-popup profile", () => {
    dismissHomeFeedReleaseReturnVisit();
    withFlags(allFlags(), () => {
      assert.equal(isHomeFeedStaticReturnLocation(marked), true);
      assert.equal(isHomeFeedStaticReturnLocation("/releases/abc?from=feed"), true);
      assert.equal(shouldUseHomeFeedReleaseStaticPop(marked, false), false);
      armHomeFeedReleaseReturnVisit({
        releasePath: marked,
        postId: "post-1",
        imageUrl: "https://example.com/poster.jpg",
        objectFit: "cover",
        surface: null,
      });
      assert.equal(shouldUseHomeFeedReleaseStaticPop(marked, true), true);
      assert.equal(shouldUseHomeFeedReleaseStaticPop("/profile/ada", true), false);
      assert.equal(shouldUseHomeFeedReleaseStaticPop("/profile", true), false);
      assert.equal(shouldUseHomeFeedReleaseStaticPop(`/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`, true), false);
      assert.equal(shouldUseHomeFeedReleaseStaticPop(`/profile/ada?from=${RELEASE_DETAIL_PROFILE_PUSH_FROM}`, true), false);
      assert.equal(shouldUseHomeFeedReleaseStaticPop("/profile/ada?from=notification", true), false);
      assert.equal(isInteractiveStackPair("/leaderboard", "/profile/ada"), true);
      assert.equal(isInteractiveStackPair("/", marked), false);
      assert.equal(reduceSettingsTransitionStack([], marked).includes("/"), false);
    });
    dismissHomeFeedReleaseReturnVisit();
  });

  it("hides the still on cancel and commits one history back", () => {
    dismissHomeFeedReleaseReturnVisit();
    const visit = armHomeFeedReleaseReturnVisit({
      releasePath: marked,
      postId: "post-1",
      imageUrl: "https://example.com/poster.jpg",
      objectFit: "cover",
      surface: null,
    });
    const visitId = visit.id;
    revealHomeFeedReleaseReturnVisit();
    hideHomeFeedReleaseReturnVisit();
    assert.equal(getHomeFeedReleaseReturnVisit()?.presentation, "stored");
    assert.equal(getHomeFeedReleaseReturnVisit()?.id, visitId);
    revealHomeFeedReleaseReturnVisit();
    const controller = createInteractivePopController();
    let backs = 0;
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.beginSettle("commit", "drag"), true);
    assert.equal(backs, 0);
    assert.equal(controller.completeSettle(), "commit");
    backs += 1;
    assert.equal(controller.completeSettle(), null);
    assert.equal(backs, 1);
    assert.equal(controller.releaseUnchangedCommit(), true);
    assert.equal(controller.releaseUnchangedCommit(), false);
    bridgeHomeFeedReleaseReturnVisit();
    dismissHomeFeedReleaseReturnVisit(visitId + 1);
    assert.equal(getHomeFeedReleaseReturnVisit()?.id, visitId);
    dismissHomeFeedReleaseReturnVisit(visitId);
    assert.equal(getHomeFeedReleaseReturnVisit(), null);
    assert.match(openFull, /postId: poster\.postId/);
    assert.ok(openFull.indexOf("armHomeFeedReleasePoster") < openFull.lastIndexOf("navigate("));
    assert.ok(openFull.indexOf('navigate("/profile")') < openFull.indexOf("armHomeFeedReleasePoster"));
    assert.match(authorOpen, /postId: post\.id/);
    assert.match(publicProfileSrc, /shouldUseHomeFeedReleaseStaticPop/);
    assert.match(publicProfileSrc, /window\.history\.back\(\)/);
    assert.match(publicProfileSrc, /useSettingsInteractiveBack\(commitBack\)/);
    assert.match(stackSrc, /isHomeFeedStaticReturnLocation/);
    assert.match(stackSrc, /releaseUnchangedCommit\(\)/);
    assert.doesNotMatch(homeSrc, /home-popup|homeFeedReleaseReturn/);
  });
});

describe("home comments profile static pop", () => {
  const marked = `/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`;
  const contextSrc = readFileSync(join(here, "./settings-transition-context.tsx"), "utf8");

  function fakeSheet(): HTMLElement {
    return { remove() {} } as HTMLElement;
  }

  function withFlags<T>(values: Map<string, string>, run: () => T): T {
    const previous = globalThis.window;
    globalThis.window = {
      sessionStorage: {
        getItem(key: string) {
          return values.get(key) ?? null;
        },
      },
    } as unknown as Window & typeof globalThis;
    try {
      return run();
    } finally {
      globalThis.window = previous;
    }
  }

  function allFlags(): Map<string, string> {
    return new Map();
  }

  function homeVisit() {
    dismissCommentsHomeReturnVisit();
    return armCommentsHomeReturnVisit({
      destinationPath: marked,
      postId: "post-1",
      parentPath: "/",
      capture: false,
      sheet: fakeSheet(),
    });
  }

  it("is eligible only for Comments opened on Home with a return still", () => {
    const visit = withFlags(allFlags(), () => homeVisit());
    assert.ok(visit);
    withFlags(allFlags(), () => {
      assert.equal(shouldUseCommentsHomeStaticPop(marked, visit), true);
      assert.equal(shouldUseCommentsHomeStaticPop("/profile/ada", visit), false);
      assert.equal(shouldUseCommentsHomeStaticPop("/profile", visit), false);
      assert.equal(shouldUseCommentsHomeStaticPop(`/profile/ada?from=${HOME_FEED_PROFILE_PUSH_FROM}`, visit), false);
      assert.equal(shouldUseCommentsHomeStaticPop(`/profile/ada?from=${RELEASE_DETAIL_PROFILE_PUSH_FROM}`, visit), false);
      assert.equal(shouldUseCommentsHomeStaticPop("/profile/ada?from=notification", visit), false);
      assert.equal(shouldUseCommentsHomeStaticPop("/releases/abc?from=feed", visit), false);
      assert.equal(shouldUseHomeFeedReleaseStaticPop(`/profile/ada?from=${HOME_FEED_PROFILE_PUSH_FROM}`, true), true);
      assert.equal(shouldUseHomeFeedReleaseStaticPop("/releases/abc?from=feed", true), true);
      assert.equal(shouldUseHomeFeedReleaseStaticPop(marked, true), false);
      assert.equal(isInteractiveStackPair("/", marked), false);
      assert.equal(reduceSettingsTransitionStack([], marked).includes("/"), false);
    });
    dismissCommentsHomeReturnVisit();
  });

  it("does not arm a Home return still for release-gallery comments", () => {
    dismissCommentsHomeReturnVisit();
    withFlags(allFlags(), () => {
      const kept = homeVisit();
      assert.equal(
        armCommentsHomeReturnVisit({
          destinationPath: marked,
          postId: "post-1",
          parentPath: "/releases/abc",
          capture: false,
          sheet: fakeSheet(),
        }),
        null,
      );
      assert.equal(getCommentsHomeReturnVisit()?.id, kept?.id);
      assert.equal(
        shouldUseCommentsHomeStaticPop(marked, {
          postId: "post-1",
          parentPath: "/releases/abc",
          destinationPath: marked,
          sheet: fakeSheet(),
        }),
        false,
      );
      assert.equal(
        shouldUseCommentsHomeStaticPop(marked, {
          postId: "",
          parentPath: "/",
          destinationPath: marked,
          sheet: fakeSheet(),
        }),
        false,
      );
    });
    assert.match(popupSrc, /parentPath: location/);
    assert.equal(popupSrc.match(/armCommentsHomeReturnVisit\(/g)?.length, 1);
    dismissCommentsHomeReturnVisit();
  });

  it("copies the comments list scroll onto the frozen sheet only", () => {
    const source = {
      scrollTop: 0,
      children: [{ scrollTop: 240, children: [] as { scrollTop: number; children: never[] }[] }],
    };
    const clone = {
      scrollTop: 12,
      children: [{ scrollTop: 0, children: [] as { scrollTop: number; children: never[] }[] }],
    };
    copyScrollTree(source, clone);
    assert.equal(clone.children[0]?.scrollTop, 240);
    assert.match(commentsUnderlaySrc, /copyScrollTree\(sheet as ScrollTree, clone as ScrollTree\)/);
    assert.match(commentsUnderlaySrc, /cloneNode\(true\)/);
  });

  it("hides the still on cancel and can arm the next back", () => {
    const visit = withFlags(allFlags(), () => homeVisit());
    assert.ok(visit);
    revealCommentsHomeReturnVisit();
    const controller = createInteractivePopController();
    let backs = 0;
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.beginSettle("cancel", "drag"), true);
    assert.equal(controller.completeSettle(), "cancel");
    assert.equal(controller.phase, "idle");
    hideCommentsHomeReturnVisit();
    assert.equal(getCommentsHomeReturnVisit()?.presentation, "stored");
    assert.equal(getCommentsHomeReturnVisit()?.id, visit?.id);
    assert.equal(backs, 0);
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.beginSettle("cancel", "drag"), true);
    assert.equal(controller.completeSettle(), "cancel");
    assert.equal(controller.phase, "idle");
    hideCommentsHomeReturnVisit();
    assert.equal(controller.beginDrag(), true);
    controller.forceIdle();
    assert.equal(controller.beginSettle("commit", "button"), true);
    assert.equal(backs, 0);
    const runSettle = hookSrc.slice(
      hookSrc.indexOf("const runSettle"),
      hookSrc.indexOf("gesture.popDriverRef.current"),
    );
    assert.ok(runSettle.indexOf("settled = false") < runSettle.indexOf("beginSettle"));
    dismissCommentsHomeReturnVisit();
  });

  it("commits one history back and keeps the still until the restored sheet paints", () => {
    const visit = withFlags(allFlags(), () => homeVisit());
    assert.ok(visit);
    const controller = createInteractivePopController();
    let backs = 0;
    let navigatedHome = 0;
    revealCommentsHomeReturnVisit();
    assert.equal(controller.beginDrag(), true);
    assert.equal(controller.beginSettle("commit", "drag"), true);
    assert.equal(backs, 0);
    assert.equal(controller.completeSettle(), "commit");
    backs += 1;
    assert.equal(controller.completeSettle(), null);
    assert.equal(backs, 1);
    assert.equal(navigatedHome, 0);
    bridgeCommentsHomeReturnVisit();
    assert.equal(getCommentsHomeReturnVisit()?.presentation, "bridging");
    dismissCommentsProfilePushUnderlay();
    assert.equal(getCommentsHomeReturnVisit()?.id, visit?.id);
    dismissCommentsHomeReturnVisit((visit?.id ?? 0) + 1);
    assert.equal(getCommentsHomeReturnVisit()?.id, visit?.id);
    const openRect = { top: 320, left: 0, right: 390, bottom: 844, height: 524 };
    const openSample = commentsSheetSampleFrom("open", "none", openRect);
    const shifted = commentsSheetSampleFrom("open", "matrix(1, 0, 0, 1, 0, 240)", openRect);
    assert.equal(commentsSheetTransformIsIdentity("none"), true);
    assert.equal(commentsSheetTransformIsIdentity("matrix(1, 0, 0, 1, 0, 0)"), true);
    assert.equal(commentsSheetTransformIsIdentity("matrix(1, 0, 0, 1, 0, 240)"), false);
    assert.equal(commentsHomeReturnIsVisuallyReady(null, openSample), false);
    assert.equal(nextCommentsReturnReadySample(null, shifted).ready, false);
    assert.equal(nextCommentsReturnReadySample(null, shifted).held, null);
    const first = nextCommentsReturnReadySample(null, openSample);
    assert.equal(first.ready, false);
    assert.ok(first.held);
    assert.equal(nextCommentsReturnReadySample(first.held, openSample).ready, true);
    const commitBack = publicProfileSrc.slice(
      publicProfileSrc.indexOf("const commitBack"),
      publicProfileSrc.indexOf("const handleBack"),
    );
    const commentsReturn = commitBack.slice(commitBack.indexOf("shouldUseCommentsHomeStaticPop"));
    assert.match(commentsReturn, /window\.history\.back\(\)/);
    assert.ok(commentsReturn.indexOf("return;") < commentsReturn.indexOf('navigate("/")'));
    assert.match(stackSrc, /nextCommentsReturnReadySample/);
    assert.match(stackSrc, /readLiveCommentsReturnSheet\(document, postId\)/);
    assert.match(stackSrc, /COMMENTS_HOME_RETURN_BRIDGE_MS/);
    assert.match(commentsSrc, /data-comments-post-id=\{post\.id\}/);
    assert.match(commentsUnderlaySrc, /removeAttribute\("data-comments-post-id"\)/);
    const pushBlock = stackSrc.slice(
      stackSrc.indexOf("const commentsProfilePush"),
      stackSrc.indexOf("const releaseDetailUnderlay"),
    );
    assert.match(pushBlock, /dismissCommentsProfilePushUnderlay/);
    assert.doesNotMatch(pushBlock, /dismissCommentsHomeReturnVisit/);
    dismissCommentsHomeReturnVisit();
  });

  it("uses the shared settle for the Back button and leaves other profiles unchanged", () => {
    assert.match(publicProfileSrc, /useSettingsInteractiveBack\(commitBack\)/);
    assert.match(stackSrc, /shouldUseCommentsHomeStaticPop\(fullLocation, getCommentsHomeReturnVisit\(\)\)/);
    assert.match(stackSrc, /if \(kind === "comments"\) revealCommentsHomeReturnVisit\(\)/);
    assert.match(contextSrc, /ctx\?\.staticPop/);
    assert.match(contextSrc, /return ctx\.requestPop/);
    assert.match(swipeSrc, /transition\?\.staticPop === true/);
    const afterClose = popupSrc.slice(popupSrc.indexOf("const navigateAfterClose"));
    assert.ok(afterClose.indexOf('navigate("/profile")') < afterClose.indexOf("armCommentsHomeReturnVisit"));
    assert.equal(commentsSrc.match(/reopenCommentsPostId: post\.id/g)?.length, 3);
    assert.doesNotMatch(homeSrc, /armCommentsHomeReturnVisit|nextCommentsReturnReadySample/);
    assert.doesNotMatch(notificationRoutingSrc, /comments-popup|COMMENTS_PROFILE_PUSH_FROM/);
    assert.match(commentsUnderlaySrc, /removeAttribute\("src"\)/);
    assert.doesNotMatch(commentsUnderlayHostSrc, /<video/);
  });

  it("pins the return sheet in the untransformed host and waits for two stable open frames", () => {
    const measure = commentsUnderlayHostSrc.slice(
      commentsUnderlayHostSrc.indexOf("function measureUntransformedHost"),
      commentsUnderlayHostSrc.indexOf("function placeCommentsReturnPiece"),
    );
    const place = commentsUnderlayHostSrc.slice(
      commentsUnderlayHostSrc.indexOf("function placeCommentsReturnPiece"),
      commentsUnderlayHostSrc.indexOf("export function CommentsHomeReturnStillHost"),
    );
    const clearAt = measure.indexOf('still.style.transform = "none"');
    const measureAt = measure.indexOf("host.getBoundingClientRect()", clearAt);
    assert.ok(clearAt !== -1 && measureAt > clearAt);
    assert.ok(place.indexOf('getAttribute(RETURN_PINNED) === "1"') < place.indexOf("measureUntransformedHost("));
    assert.match(place, /pinOffsetInUntransformedHost/);
    assert.match(place, /object-fit/);
    assert.match(place, /object-position/);
    assert.match(commentsUnderlayHostSrc, /\[visible, visitId, sheet, frame, sheetBox, mediaBox\]/);
    assert.match(commentsUnderlaySrc, /function captureMediaBox/);
    assert.match(commentsUnderlaySrc, /style\.objectFit/);
    assert.match(commentsUnderlaySrc, /style\.objectPosition/);
    assert.equal(pinOffsetInUntransformedHost(12, 0), 12);
    assert.equal(pinOffsetInUntransformedHost(12, -117), 129);
    const moved = commentsSheetSampleFrom("open", "none", {
      top: 330,
      left: 0,
      right: 390,
      bottom: 854,
      height: 524,
    });
    const openRect = { top: 320, left: 0, right: 390, bottom: 844, height: 524 };
    const openSample = commentsSheetSampleFrom("open", "matrix(1, 0, 0, 1, 0, 0)", openRect);
    assert.equal(nextCommentsReturnReadySample(openSample, moved).ready, false);
    assert.match(stackSrc, /zIndex: 80/);
    assert.match(stackSrc, /createPortal/);
    assert.match(videoCardSrc, /data-video-action-rail/);
    assert.match(videoCardSrc, /z-30 flex w-\[var\(--video-feed-rail-width\)\]/);
    const restoreGate = commentsSrc.indexOf("consumeCommentsRestoreWithoutOpenAnimation");
    assert.ok(restoreGate !== -1);
    assert.equal(commentsSrc.slice(0, restoreGate).includes('data-vaul-animate", "false"'), false);
    assert.match(stackSrc, /setTimeout\(finish, COMMENTS_HOME_RETURN_BRIDGE_MS\)/);
    withFlags(allFlags(), () => {
      assert.equal(shouldUseHomeFeedReleaseStaticPop(`/profile/ada?from=${HOME_FEED_PROFILE_PUSH_FROM}`, true), true);
      assert.equal(shouldUseHomeFeedReleaseStaticPop("/releases/abc?from=feed", true), true);
    });
  });

  it("paints the forward underlay in the captured video box and falls back to the poster", () => {
    const frame = { kind: "frame" } as unknown as HTMLElement;
    const poster = { kind: "poster" } as unknown as HTMLElement;
    assert.equal(commentsForwardMediaNode(frame, poster), frame);
    assert.equal(commentsForwardMediaNode(null, poster), poster);
    assert.equal(commentsForwardMediaNode(null, null), null);
    const capture = commentsUnderlaySrc.slice(
      commentsUnderlaySrc.indexOf("chosen = true"),
      commentsUnderlaySrc.indexOf("return { sheet: clone"),
    );
    assert.ok(capture.indexOf("mediaBox = captureMediaBox") < capture.indexOf("frame = captureVideoFrame"));
    assert.match(capture, /if \(!frame\) poster = capturePosterElement/);
    const frameFn = commentsUnderlaySrc.slice(
      commentsUnderlaySrc.indexOf("function captureVideoFrame"),
      commentsUnderlaySrc.indexOf("function captureMediaBox"),
    );
    assert.doesNotMatch(frameFn, /inset/);
    assert.doesNotMatch(frameFn, /objectFit/);
    assert.match(commentsUnderlaySrc, /poster: captured\.poster/);
    assert.match(commentsUnderlaySrc, /mediaBox: captured\.mediaBox/);
    const forwardHost = commentsUnderlayHostSrc.slice(
      commentsUnderlayHostSrc.indexOf("export function CommentsProfilePushUnderlayHost"),
      commentsUnderlayHostSrc.indexOf("function commentsReturnVisible"),
    );
    assert.match(forwardHost, /commentsForwardMediaNode\(underlay\.frame, underlay\.poster\)/);
    assert.match(forwardHost, /placeCommentsReturnPiece\(media, underlay\.mediaBox, host, underlay\.mediaBox\)/);
    assert.match(forwardHost, /bg-black/);
    assert.doesNotMatch(forwardHost, /object-fit:\s*cover|objectFit,\s*"cover"/);
    assert.match(commentsUnderlayHostSrc, /\[visible, visitId, sheet, frame, sheetBox, mediaBox\]/);
    assert.match(popupSrc, /setTimeout\(navigateAfterClose, POPUP_CLOSE_MS\)/);
    assert.match(stackSrc, /requestAnimationFrame\(\(\) => \{\s*requestAnimationFrame/);
    assert.match(stackSrc, /INTERACTIVE_PUSH_MS/);
  });
});

describe("public profile scrollbar", () => {
  const layoutSrc = readFileSync(join(here, "./app-shell-layout.ts"), "utf8");
  const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
  const scrollFn = publicProfileSrc.slice(
    publicProfileSrc.indexOf("function publicProfilePageScrollClass"),
    publicProfileSrc.indexOf("const PUBLIC_PROFILE_GENRE_VALUE_PILL_CLASS"),
  );
  const pageScroll = layoutSrc.slice(
    layoutSrc.indexOf("export const APP_PAGE_SCROLL_CLASS"),
    layoutSrc.indexOf("export const APP_SCROLL_BOTTOM_INSET_CLASS"),
  );

  it("hides the public profile scrollbar and keeps that page as the scroll owner", () => {
    assert.match(scrollFn, /APP_PAGE_SCROLL_CLASS/);
    assert.match(scrollFn, /scrollbar-hide/);
    assert.match(pageScroll, /overflow-y-auto/);
    assert.match(pageScroll, /overscroll-y-none/);
    assert.match(pageScroll, /scrollbar-hide/);
    assert.match(cssSrc, /\.scrollbar-hide[\s\S]*scrollbar-width:\s*none/);
    assert.match(cssSrc, /\.scrollbar-hide::-webkit-scrollbar[\s\S]*display:\s*none/);
    assert.match(homeSrc, /scrollbar-hide/);
    assert.doesNotMatch(homeSrc, /publicProfilePageScrollClass|APP_PAGE_SCROLL_CLASS/);
  });
});

describe("phase 1 guards", () => {
  it("does not touch Home lifecycle, native nav, or the shared tab contract", () => {
    assert.doesNotMatch(homeSrc, /interactive-page-transitions|dubhub_interactive_page_transitions/);
    assert.doesNotMatch(sessionSrc, /interactive-page-transitions|dubhub_interactive_page_transitions/);
    assert.doesNotMatch(postFlowSrc, /interactive-page-transitions|dubhub_interactive_page_transitions/);
    assert.doesNotMatch(swiftSrc, /interactive-page-transitions|dubhub_interactive_page_transitions/);
    assert.doesNotMatch(nativeContractSrc, /interactive-page-transitions/);
    assert.doesNotMatch(nativeBridgeSrc, /interactive-page-transitions/);
    assert.doesNotMatch(stackSrc, /native-nav-bridge|pages\/home|post-flow|home-feed-session/);
    assert.match(stackSrc, /data-settings-stack/);
  });
});

describe("release edit return to releases parent", () => {
  const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
  const detail = "/releases/abc?scope=my&view=upcoming";
  const edit = "/releases/abc/edit";
  const pair = ["/releases", "/releases/abc"];

  function enterEdit(mounted: readonly string[], previous: string) {
    clearReleaseEditReturnRecord();
    noteReleaseEditTransition({ mounted, previousLocation: previous, nextLocation: edit });
  }

  it("restores the Releases parent after clean Back, Discard, and Save", () => {
    enterEdit(pair, detail);
    const saved = releaseEditReturnSnapshot();
    assert.deepEqual(saved, {
      detailPath: "/releases/abc",
      parentLocation: "/releases?scope=my&view=upcoming",
    });
    assert.equal(shouldPopReleaseEditToStackedDetail("abc"), true);
    assert.equal(shouldPopReleaseEditToStackedDetail("abc"), true);
    assert.equal(isReleaseEditPath(edit), true);
    assert.equal(isOwnedInteractivePath(edit), false);
    assert.deepEqual(reduceSettingsTransitionStack(pair, edit), []);
    const restored = pagesAfterReleaseEditReturn(
      reduceSettingsTransitionStack([], detail),
      detail,
    );
    assert.deepEqual(restored, pair);
    assert.equal(countsAsInteractivePush([], restored), false);
    assert.deepEqual(reduceSettingsTransitionStack(restored, saved!.parentLocation), ["/releases"]);
    clearReleaseEditReturnRecordIfRestored(detail, restored);
    assert.equal(releaseEditReturnSnapshot(), null);
    assert.deepEqual(pagesAfterReleaseEditReturn(reduceSettingsTransitionStack([], detail), detail), [
      "/releases/abc",
    ]);
  });

  it("keeps the Releases parent across a discarded-form profile hop", () => {
    enterEdit(pair, detail);
    const dropped = pagesAfterReleaseEditReturn(
      reduceSettingsTransitionStack([], "/profile/ada"),
      "/profile/ada",
    );
    assert.deepEqual(dropped, ["/profile/ada"]);
    assert.equal(releaseEditReturnSnapshot(), null);

    enterEdit(pair, detail);
    holdReleaseEditReturnForProfileArrival();
    const onProfile = pagesAfterReleaseEditReturn(
      reduceSettingsTransitionStack([], "/profile/ada?from=comments-popup"),
      "/profile/ada?from=comments-popup",
    );
    assert.deepEqual(onProfile, ["/profile/ada"]);
    assert.equal(releaseEditReturnSnapshot()?.detailPath, "/releases/abc");
    const restored = pagesAfterReleaseEditReturn(
      reduceSettingsTransitionStack([], detail),
      detail,
    );
    assert.deepEqual(restored, pair);
    clearReleaseEditReturnRecord();
  });

  it("arms the release-detail return for an Edit discard profile and keeps Releases behind Detail", () => {
    const detailUrl = "/releases/abc?scope=my&view=upcoming";
    enterEdit(pair, detailUrl);
    assert.equal(releaseEditOpenedFromDetailLocation(), detailUrl);
    const plan = editDiscardReleaseDetailProfile({
      formLocation: edit,
      username: "ada",
      isSelf: false,
      detailLocation: releaseEditOpenedFromDetailLocation(),
    });
    assert.deepEqual(plan, {
      profilePath: `/profile/ada?from=${RELEASE_DETAIL_PROFILE_PUSH_FROM}`,
      releasePath: detailUrl,
    });
    assert.equal(
      editDiscardReleaseDetailProfile({
        formLocation: "/releases/new",
        username: "ada",
        isSelf: false,
        detailLocation: detailUrl,
      }),
      null,
    );
    assert.equal(
      editDiscardReleaseDetailProfile({
        formLocation: edit,
        username: "ada",
        isSelf: true,
        detailLocation: detailUrl,
      }),
      null,
    );
    assert.equal(
      editDiscardReleaseDetailProfile({
        formLocation: edit,
        username: "ada",
        isSelf: false,
        detailLocation: null,
      }),
      null,
    );
    const armed = armReleaseDetailProfileUnderlay({
      destinationPath: plan!.profilePath,
      releasePath: plan!.releasePath,
      imageUrl: "https://example.test/art.jpg",
      atmosphereRgb: "12, 58, 120",
      atmosphereMode: "brand",
      atmosphereReady: true,
      atmosphereInstant: true,
      surface: null,
    });
    assert.equal(getReleaseDetailReturnVisit()?.profilePath, plan!.profilePath);
    assert.equal(getReleaseDetailReturnVisit()?.releasePath, detailUrl);
    assert.equal(getReleaseDetailReturnVisit()?.surface, null);
    assert.equal(armed.destinationPath, plan!.profilePath);
    assert.equal(shouldUseReleaseDetailStaticPop(plan!.profilePath, true), true);
    assert.equal(shouldUseReleaseDetailStaticPop(plan!.profilePath, false), false);
    assert.equal(
      shouldUseReleaseDetailStaticPop(`/profile/ada?from=${COMMENTS_PROFILE_PUSH_FROM}`, true),
      false,
    );
    assert.equal(shouldUseCommentsHomeStaticPop(plan!.profilePath, null), false);
    dismissReleaseDetailReturnStill();
    holdReleaseEditReturnForProfileArrival();
    assert.deepEqual(
      pagesAfterReleaseEditReturn(reduceSettingsTransitionStack([], plan!.profilePath), plan!.profilePath),
      ["/profile/ada"],
    );
    assert.equal(releaseEditReturnSnapshot()?.parentLocation, "/releases?scope=my&view=upcoming");
    const restored = pagesAfterReleaseEditReturn(
      reduceSettingsTransitionStack([], detailUrl),
      detailUrl,
    );
    assert.deepEqual(restored, pair);
    assert.deepEqual(
      reduceSettingsTransitionStack(restored, "/releases?scope=my&view=upcoming"),
      ["/releases"],
    );
    clearReleaseEditReturnRecord();
  });

  it("parks the Detail surface across Edit and transfers it only for a matching discard profile", () => {
    discardParkedReleaseDetailEditSurface();
    dismissReleaseDetailReturnStill();
    dismissReleaseDetailProfileUnderlay();
    const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
    const editAt = releaseDetailSrc.indexOf('data-testid="button-edit-release"');
    const editClick = releaseDetailSrc.slice(editAt, releaseDetailSrc.indexOf("</Button>", editAt));
    const openArtist = releaseDetailSrc.slice(
      releaseDetailSrc.indexOf("const openArtistProfile"),
      releaseDetailSrc.indexOf('if (!id || id === "new")'),
    );
    assert.ok(editClick.indexOf("captureReleaseDetailReturnSurface()") < editClick.indexOf("navigate("));
    assert.match(editClick, /parkReleaseDetailEditSurface/);
    assert.doesNotMatch(editClick, /armReleaseDetailProfileUnderlay/);
    assert.match(openArtist, /captureReleaseDetailReturnSurface\(\)/);
    assert.match(openArtist, /armReleaseDetailProfileUnderlay/);
    assert.doesNotMatch(openArtist, /parkReleaseDetailEditSurface/);
    assert.doesNotMatch(createSrc, /captureReleaseDetailReturnSurface|parkReleaseDetailEditSurface/);

    function detached(scrollTop: number) {
      let removed = false;
      return {
        removed: () => removed,
        surface: {
          node: { remove() { removed = true; } } as HTMLElement,
          scrollTop,
        },
      };
    }

    const detailPath = "/releases/abc?scope=my&view=upcoming";
    const first = detached(240);
    const session = parkReleaseDetailEditSurface({
      releaseId: "abc",
      releasePath: detailPath,
      surface: first.surface,
    });
    assert.equal(getReleaseDetailReturnVisit(), null);
    assert.equal(getParkedReleaseDetailEditSurface()?.node, first.surface.node);
    assert.equal(getParkedReleaseDetailEditSurface()?.scrollTop, 240);
    assert.equal(getParkedReleaseDetailEditSurface()?.releaseId, "abc");
    assert.equal(getParkedReleaseDetailEditSurface()?.releasePath, detailPath);
    assert.equal(getParkedReleaseDetailEditSurface()?.editSessionId, session);
    assert.equal(activeReleaseDetailEditSessionId(), session);
    assert.equal(first.removed(), false);

    const replacement = detached(12);
    parkReleaseDetailEditSurface({
      releaseId: "abc",
      releasePath: detailPath,
      surface: replacement.surface,
    });
    assert.equal(first.removed(), true);
    discardParkedReleaseDetailEditSurface();
    assert.equal(replacement.removed(), true);
    assert.equal(getParkedReleaseDetailEditSurface(), null);

    const kept = detached(180);
    const keptSession = parkReleaseDetailEditSurface({
      releaseId: "abc",
      releasePath: detailPath,
      surface: kept.surface,
    });
    const wrongId = takeParkedReleaseDetailEditSurface({
      releaseId: "other",
      releasePath: detailPath,
      editSessionId: keptSession,
    });
    assert.equal(wrongId, null);
    assert.equal(kept.removed(), true);
    assert.equal(getParkedReleaseDetailEditSurface(), null);

    const wrongPathSurface = detached(20);
    const wrongPathSession = parkReleaseDetailEditSurface({
      releaseId: "abc",
      releasePath: detailPath,
      surface: wrongPathSurface.surface,
    });
    assert.equal(
      takeParkedReleaseDetailEditSurface({
        releaseId: "abc",
        releasePath: "/releases/abc?scope=saved",
        editSessionId: wrongPathSession,
      }),
      null,
    );
    assert.equal(wrongPathSurface.removed(), true);

    const stale = detached(30);
    const staleSession = parkReleaseDetailEditSurface({
      releaseId: "abc",
      releasePath: detailPath,
      surface: stale.surface,
    });
    assert.equal(
      takeParkedReleaseDetailEditSurface({
        releaseId: "abc",
        releasePath: detailPath,
        editSessionId: staleSession + 1,
      }),
      null,
    );
    assert.equal(stale.removed(), true);
    assert.equal(activeReleaseDetailEditSessionId(), 0);

    const live = detached(240);
    const liveSession = parkReleaseDetailEditSurface({
      releaseId: "abc",
      releasePath: detailPath,
      surface: live.surface,
    });
    const taken = takeParkedReleaseDetailEditSurface({
      releaseId: "abc",
      releasePath: detailPath,
      editSessionId: liveSession,
    });
    assert.equal(taken?.node, live.surface.node);
    assert.equal(taken?.scrollTop, 240);
    assert.equal(live.removed(), false);
    assert.equal(getParkedReleaseDetailEditSurface(), null);
    discardParkedReleaseDetailEditSurface();
    assert.equal(live.removed(), false);
    const armed = armReleaseDetailProfileUnderlay({
      destinationPath: `/profile/ada?from=${RELEASE_DETAIL_PROFILE_PUSH_FROM}`,
      releasePath: detailPath,
      imageUrl: "https://example.test/art.jpg",
      atmosphereRgb: "12, 58, 120",
      atmosphereMode: "brand",
      atmosphereReady: true,
      atmosphereInstant: true,
      surface: taken?.node ?? null,
      scrollTop: taken?.scrollTop ?? 0,
    });
    assert.equal(getReleaseDetailReturnVisit()?.surface, live.surface.node);
    assert.equal(getReleaseDetailReturnVisit()?.scrollTop, 240);
    assert.equal(armed.destinationPath, `/profile/ada?from=${RELEASE_DETAIL_PROFILE_PUSH_FROM}`);
    dismissReleaseDetailReturnStill();
    assert.equal(live.removed(), true);
    assert.equal(getReleaseDetailReturnVisit(), null);

    const popupGo = popupSrc.slice(popupSrc.indexOf("const go = (navigation"), popupSrc.indexOf("const guard ="));
    const detailBranch = popupGo.slice(
      popupGo.indexOf("const detailReturn"),
      popupGo.indexOf("noteDiscardedFormProfileArrival"),
    );
    assert.match(detailBranch, /takeParkedReleaseDetailEditSurface/);
    assert.match(detailBranch, /activeReleaseDetailEditSessionId\(\)/);
    assert.match(detailBranch, /surface: taken\?\.node \?\? null/);
    assert.match(detailBranch, /scrollTop: taken\?\.scrollTop \?\? 0/);
    assert.doesNotMatch(detailBranch, /captureReleaseDetailReturnSurface|COMMENTS_PROFILE_PUSH_FROM/);
    assert.match(detailBranch, /navigate\(detailReturn\.profilePath, \{ replace: true \}\)/);

    const exitStart = editSrc.indexOf("const exitToDetail");
    const exit = editSrc.slice(exitStart, editSrc.indexOf("useIosKeyboardResizeNone", exitStart));
    assert.ok(exit.indexOf("discardParkedReleaseDetailEditSurface()") < exit.indexOf("window.history.back()"));
    const confirm = editSrc.slice(
      editSrc.indexOf("const handleDiscardConfirm"),
      editSrc.indexOf("const handleDiscardConfirm") + 450,
    );
    assert.ok(confirm.indexOf('pending(releaseFormChildNavigation("discard"))') < confirm.indexOf("exitToDetail()"));
    const saveAt = editSrc.indexOf('toast({ title: "Release updated" })');
    const saveExit = editSrc.slice(saveAt, editSrc.indexOf("} catch (error)", saveAt));
    assert.match(saveExit, /exitToDetail\(\)/);
    const deletedAt = editSrc.indexOf('toast({ title: "Release deleted" })');
    const deleted = editSrc.slice(deletedAt, editSrc.indexOf('navigate("/releases")', deletedAt));
    assert.match(deleted, /discardParkedReleaseDetailEditSurface\(\)/);
    assert.match(
      stackSrc,
      /isReleaseEditPath\(seenLocation\) && !isReleaseEditPath\(fullLocation\)/,
    );
    assert.match(stackSrc, /discardParkedReleaseDetailEditSurface\(\)/);

    const exited = detached(8);
    parkReleaseDetailEditSurface({
      releaseId: "abc",
      releasePath: detailPath,
      surface: exited.surface,
    });
    discardParkedReleaseDetailEditSurface();
    assert.equal(exited.removed(), true);
    assert.equal(
      takeParkedReleaseDetailEditSurface({
        releaseId: "abc",
        releasePath: detailPath,
        editSessionId: activeReleaseDetailEditSessionId(),
      }),
      null,
    );

    enterEdit(["/releases", "/releases/abc"], detailPath);
    holdReleaseEditReturnForProfileArrival();
    assert.deepEqual(
      pagesAfterReleaseEditReturn(
        reduceSettingsTransitionStack([], `/profile/ada?from=${RELEASE_DETAIL_PROFILE_PUSH_FROM}`),
        `/profile/ada?from=${RELEASE_DETAIL_PROFILE_PUSH_FROM}`,
      ),
      ["/profile/ada"],
    );
    assert.deepEqual(
      pagesAfterReleaseEditReturn(reduceSettingsTransitionStack([], detailPath), detailPath),
      ["/releases", "/releases/abc"],
    );
    clearReleaseEditReturnRecord();
    dismissReleaseDetailProfileUnderlay();
  });

  it("leaves notification, direct, Home, and Profile details solo", () => {
    enterEdit(["/releases/abc"], "/releases/abc");
    assert.equal(releaseEditReturnSnapshot(), null);
    assert.deepEqual(
      pagesAfterReleaseEditReturn(reduceSettingsTransitionStack([], "/releases/abc"), "/releases/abc"),
      ["/releases/abc"],
    );

    enterEdit([], "/releases/abc");
    assert.equal(releaseEditReturnSnapshot(), null);
    assert.equal(shouldPopReleaseEditToStackedDetail("abc"), false);

    enterEdit(pair, "/releases/abc?from=feed");
    assert.equal(releaseEditReturnSnapshot(), null);
    assert.equal(isHomeFeedStaticReturnLocation("/releases/abc?from=feed"), true);
    assert.equal(shouldPopReleaseEditToStackedDetail("abc"), false);

    enterEdit(
      ["/profile/ada", "/releases/abc"],
      "/releases/abc?from=profile&profile=ada",
    );
    assert.equal(releaseEditReturnSnapshot(), null);
    assert.equal(
      isInteractiveStackPair("/profile/ada", "/releases/abc?from=profile&profile=ada"),
      true,
    );
    assert.deepEqual(
      pagesAfterReleaseEditReturn(
        reduceSettingsTransitionStack([], "/releases/abc?from=profile&profile=ada"),
        "/releases/abc?from=profile&profile=ada",
      ),
      ["/releases/abc"],
    );
  });

  it("pops Edit once and keeps Edit out of the stack", () => {
    const exitStart = editSrc.indexOf("const exitToDetail");
    const exit = editSrc.slice(exitStart, editSrc.indexOf("useIosKeyboardResizeNone", exitStart));
    assert.match(exit, /shouldPopReleaseEditToStackedDetail\(releaseId\)/);
    assert.match(exit, /window\.history\.back\(\)/);
    assert.ok(exit.indexOf("window.history.back()") < exit.indexOf("resolveReleaseEditExitPath"));
    assert.doesNotMatch(exit, /navigate\("\/releases"\)/);
    assert.match(editSrc, /editBackDecision\(isDirty\)/);
    assert.match(editSrc, /exitToDetail\(\)/);
    const keep = editSrc.slice(
      editSrc.lastIndexOf("<AlertDialogCancel", editSrc.indexOf("Keep editing")),
      editSrc.indexOf("Keep editing"),
    );
    assert.doesNotMatch(keep, /exitToDetail/);
    assert.match(editSrc, /enabled=\{false\}/);
    const sync = stackSrc.slice(
      stackSrc.indexOf("if (fullLocation !== seenLocation)"),
      stackSrc.indexOf("const rootRef"),
    );
    assert.match(sync, /noteReleaseEditTransition/);
    assert.ok(
      sync.indexOf("reduceSettingsTransitionStack") < sync.indexOf("pagesAfterReleaseEditReturn") ||
        sync.indexOf("pagesAfterReleaseEditReturn") < sync.indexOf("setPages"),
    );
    assert.match(sync, /pagesAfterReleaseEditReturn\(\s*reduceSettingsTransitionStack/);
    assert.match(stackSrc, /pages\.length === previous\.length \+ 1/);
    assert.doesNotMatch(sync, /navigate\(/);
  });

  it("idles the pop controller when Profile is replaced by the seeded Releases pair", () => {
    const profile = ["/profile/ada"];
    const seeded = ["/releases", "/releases/abc"];
    const releasesDetail = ["/releases", "/releases/abc"];
    assert.equal(isWholesaleStackReplacement(profile, seeded), true);
    assert.equal(isWholesaleStackReplacement(seeded, seeded), false);
    assert.equal(isWholesaleStackReplacement(["/releases"], releasesDetail), false);
    assert.equal(isWholesaleStackReplacement(releasesDetail, ["/releases"]), false);
    assert.equal(
      isWholesaleStackReplacement(["/releases", "/releases/abc"], ["/profile/ada"]),
      false,
    );
    assert.equal(isWholesaleStackReplacement([], seeded), true);
    const cappedPrevious = ["/settings", "/settings/notifications", "/settings/country", "/settings/artist"];
    const cappedNext = ["/settings/notifications", "/settings/country", "/settings/artist", "/settings/manage-account"];
    assert.equal(isWholesaleStackReplacement(cappedPrevious, cappedNext), false);

    const stuck = createInteractivePopController();
    assert.equal(stuck.beginDrag(), true);
    assert.equal(stuck.beginSettle("commit", "drag"), true);
    assert.equal(stuck.completeSettle(), "commit");
    assert.equal(stuck.phase, "committed");
    assert.equal(stuck.canArm(), false);
    assert.equal(stuck.beginSettle("commit", "button"), false);

    const replacementAt = stackSrc.indexOf("if (!pushed && !cappedPush)");
    const replacement = stackSrc.slice(
      replacementAt,
      stackSrc.indexOf("const top = foregroundLayerRef.current", replacementAt),
    );
    assert.match(replacement, /isWholesaleStackReplacement\(previous, pages\)/);
    assert.match(replacement, /interactionRef\.current = false/);
    assert.match(replacement, /controllerRef\.current = createInteractivePopController\(\)/);
    assert.match(replacement, /parkForeground\(\)/);
    assert.ok(
      replacement.indexOf("isWholesaleStackReplacement(previous, pages)") <
        replacement.indexOf("controllerRef.current = createInteractivePopController()"),
    );
    const popReset = stackSrc.slice(
      stackSrc.indexOf("if (popped || pages.length < 2)"),
      stackSrc.indexOf("if (!pushed && !cappedPush)"),
    );
    assert.match(popReset, /controllerRef\.current = createInteractivePopController\(\)/);
    const pushReset = stackSrc.slice(
      stackSrc.indexOf("const top = foregroundLayerRef.current", replacementAt),
      stackSrc.indexOf("}, [flag, pageKey, pages.length])"),
    );
    assert.match(pushReset, /controllerRef\.current = createInteractivePopController\(\)/);
    assert.match(pushReset, /translate3d\(100%,0,0\)/);

    const idle = createInteractivePopController();
    assert.equal(idle.phase, "idle");
    assert.equal(idle.canArm(), true);
    assert.equal(idle.beginSettle("commit", "button"), true);
    assert.equal(idle.phase, "settling");
    assert.equal(idle.completeSettle(), "commit");
    assert.equal(idle.completeSettle(), null);

    const cancel = createInteractivePopController();
    assert.equal(cancel.beginDrag(), true);
    assert.equal(cancel.beginSettle("cancel", "drag"), true);
    assert.equal(cancel.completeSettle(), "cancel");
    assert.equal(cancel.phase, "idle");
    assert.equal(cancel.canArm(), true);
    assert.equal(cancel.beginDrag(), true);
    assert.equal(cancel.beginSettle("cancel", "drag"), true);
    assert.equal(cancel.completeSettle(), "cancel");
    assert.equal(cancel.canArm(), true);
    assert.equal(cancel.beginSettle("commit", "button"), true);

    const dragging = createInteractivePopController();
    assert.equal(dragging.beginDrag(), true);
    assert.equal(isWholesaleStackReplacement(releasesDetail, releasesDetail), false);
    assert.equal(dragging.phase, "dragging");
    assert.equal(dragging.canArm(), false);

    enterEdit(pair, "/releases/abc?scope=my&view=upcoming");
    assert.deepEqual(
      pagesAfterReleaseEditReturn(
        reduceSettingsTransitionStack([], "/releases/abc?scope=my&view=upcoming"),
        "/releases/abc?scope=my&view=upcoming",
      ),
      pair,
    );
    clearReleaseEditReturnRecord();
  });
});

function countsAsInteractivePush(previous: readonly string[], next: readonly string[]): boolean {
  return (
    next.length >= 2 &&
    next.length === previous.length + 1 &&
    previous.every((path, index) => path === next[index])
  );
}
