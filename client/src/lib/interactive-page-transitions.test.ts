import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INTERACTIVE_CANCEL_MS,
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
  createInteractivePopController,
  evaluateInteractiveRelease,
  interactiveMotionMs,
  interactiveParentNavigation,
  popHistoryToInteractiveParent,
  isInteractiveStackPair,
  isSettingsStackPair,
  isWithinBackEdge,
  pushVelocitySample,
  readInteractivePageTransitionsFlag,
  reduceSettingsTransitionStack,
  releaseWindowVelocity,
  stackLayerRole,
  shouldArmHorizontalDrag,
  shouldCancelBeforeArm,
  underlayDimOpacity,
  underlayShiftPercent,
} from "./interactive-page-transitions";

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

const legacySlice = hookSrc.slice(
  hookSrc.indexOf("/* LEGACY_SWIPE_START */"),
  hookSrc.indexOf("/* LEGACY_SWIPE_END */"),
);
const interactiveSlice = hookSrc.slice(
  hookSrc.indexOf("/* INTERACTIVE_SWIPE_START */"),
  hookSrc.indexOf("/* INTERACTIVE_SWIPE_END */"),
);

describe("interactive page transitions flag", () => {
  it("defaults off", () => {
    assert.equal(readInteractivePageTransitionsFlag(null), false);
    assert.equal(readInteractivePageTransitionsFlag({ getItem: () => null }), false);
    assert.equal(readInteractivePageTransitionsFlag({ getItem: () => "0" }), false);
    assert.equal(readInteractivePageTransitionsFlag({ getItem: () => "true" }), false);
  });

  it("turns on only for the exact session value", () => {
    assert.equal(readInteractivePageTransitionsFlag({ getItem: () => "1" }), true);
  });

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

  it("keeps the legacy swipe path when the flag is off", () => {
    assert.match(appSrc, /interactivePageTransitionsEnabled\(\) \? null/);
    assert.match(appSrc, /<SettingsNotificationsPage \/>/);
    assert.match(appSrc, /<SettingsPage onSignOut=\{handleSignOut\} \/>/);
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
    assert.match(stackSrc, /role === "foreground" \? gesture : null/);
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
