import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { THEME_STORAGE_KEY } from "./theme";
import { PENDING_NATIVE_AUTH_CALLBACK_KEY } from "./native-auth-callback-url";
import {
  INITIAL_PRE_LOGIN_ONBOARDING_UI,
  INITIAL_PRE_LOGIN_REVEAL_PLAYED,
  PRE_LOGIN_ARTIST_TOOLS_LABEL,
  PRE_LOGIN_AVATAR_GLOW_FILTER,
  PRE_LOGIN_AVATAR_MOTION_CLASS,
  PRE_LOGIN_AVATAR_SELECTED_SCALE,
  PRE_LOGIN_AVATAR_SLOT_SCREEN1_CLASS,
  PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS,
  PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS,
  PRE_LOGIN_AVATAR_GLOW_PAINT_INSET_PX,
  PRE_LOGIN_AVATAR_VISUAL_CLASS,
  PRE_LOGIN_BACK_ICON_CLASS,
  PRE_LOGIN_BRAND_ANCHOR_CLASS,
  PRE_LOGIN_CALLOUT_BODY_CLASS,
  PRE_LOGIN_CALLOUT_CLASS,
  PRE_LOGIN_CALLOUT_TITLE_CLASS,
  PRE_LOGIN_EMAIL_VERIFIED_NOTICE_KEY,
  PRE_LOGIN_FEATURE_BODY_CLASS,
  PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS,
  PRE_LOGIN_FEATURE_GRID_ROWS_CLASS,
  PRE_LOGIN_FEATURE_LIST_CLASS,
  PRE_LOGIN_FEATURE_ROW_CLASS,
  PRE_LOGIN_FEATURE_ROW_GAP_CLASS,
  PRE_LOGIN_FEATURE_ROW_HEIGHTS_PX,
  PRE_LOGIN_FEATURE_TEXT_COL_CLASS,
  PRE_LOGIN_FEATURE_TITLE_CLASS,
  PRE_LOGIN_FEATURE_VISUAL_COL_CLASS,
  PRE_LOGIN_HEADING_BLOCK_CLASS,
  PRE_LOGIN_IDENTITY_LABEL_CLASS,
  PRE_LOGIN_IDENTITY_PRESS_CLASS,
  PRE_LOGIN_JOURNEY_ARROW_CLASS,
  PRE_LOGIN_JOURNEY_CONNECTOR_CLASS,
  PRE_LOGIN_JOURNEY_STEP_CLASS,
  PRE_LOGIN_LOGO_SIZE,
  PRE_LOGIN_ONBOARDING_COPY,
  PRE_LOGIN_ONBOARDING_SEEN_KEY,
  PRE_LOGIN_PAGER_SNAP_CLASS,
  PRE_LOGIN_PAGER_THRESHOLD,
  PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS,
  PRE_LOGIN_PERSPECTIVE_SWITCHER_CLASS,
  PRE_LOGIN_PERSPECTIVE_TRANSITION_CLASS,
  PRE_LOGIN_RECOVERY_INTENT_KEY,
  PRE_LOGIN_SCREEN_1_BOTTOM_CLASS,
  PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS,
  PRE_LOGIN_SCREEN_1_HEADLINE_CLASS,
  PRE_LOGIN_SCREEN_1_JOURNEY_CLASS,
  PRE_LOGIN_SCREEN_1_MIDDLE_CLASS,
  PRE_LOGIN_SCREEN_1_CLIP_CLASS,
  PRE_LOGIN_SCREEN_1_REVEAL_DURATION_MS,
  PRE_LOGIN_SCREEN_1_REVEAL_SLOTS,
  PRE_LOGIN_SCREEN_1_REVEAL_STEP_MS,
  PRE_LOGIN_SCREEN_1_REVEAL_TRANSLATE_PX,
  PRE_LOGIN_SCREEN_1_STORY_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_OUTER_GAP_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_RELEASE_CARD_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE,
  PRE_LOGIN_SCREEN_1_STORY_RELEASE_VERIFIED_TICK_CLASS,
  PRE_LOGIN_SCREEN_1_SELECTION_INSTRUCTION_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_TRANSITION_GAP_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_VISUAL_LABEL_GAP_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_WAVEFORM_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_STAGE_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_VISUAL_SLOT_CLASS,
  PRE_LOGIN_SCREEN_1_TOP_CLASS,
  PRE_LOGIN_SCREEN_2_CONTENT_INSET_CLASS,
  PRE_LOGIN_SCREEN_2_CTA_CLASS,
  PRE_LOGIN_SCREEN_2_PAGER_CLASS,
  PRE_LOGIN_SCREEN_2_LAYER_CLASS,
  PRE_LOGIN_SCREEN_2_SCROLL_CLASS,
  PRE_LOGIN_SCREEN_2_SWITCHER_HOST_CLASS,
  PRE_LOGIN_SCREEN_2_COMPACT_MIN_HEIGHT_PX,
  PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS,
  PRE_LOGIN_SCREEN_LAYERS_CLASS,
  PRE_LOGIN_SCREEN_LAYER_CLASS,
  PRE_LOGIN_SCREEN_TRANSITION_CLASS,
  PRE_LOGIN_STAGGER_DURATION_MS,
  PRE_LOGIN_STAGGER_EASING,
  PRE_LOGIN_STAGGER_INITIAL_DELAY_MS,
  PRE_LOGIN_STAGGER_ITEM_CLASS,
  PRE_LOGIN_STAGGER_STEP_MS,
  PRE_LOGIN_STAGGER_TRANSLATE_PX,
  PRE_LOGIN_STRAPLINE_CLASS,
  applyBackToScreen1,
  applyScreen1Intent,
  applyScreen2Perspective,
  featureStaggerDelayMs,
  hasPendingEmailVerifiedNotice,
  hasPendingNativeAuthCallback,
  hasPendingRecoveryIntent,
  hasSeenPreLoginOnboarding,
  lockPerspectivePagerAxis,
  markPerspectiveRevealed,
  markPreLoginOnboardingSeen,
  perspectivePagerTranslatePx,
  preLoginAvatarGlowStyle,
  preLoginAvatarTransformStyle,
  preLoginAvatarEmphasisStyle,
  preLoginFeatureRevealStyle,
  preLoginScreen1RevealStyle,
  resolvePerspectivePagerCommit,
  resolveScreen1RevealReady,
  resolveSignupAccountType,
  shouldAnimatePerspectiveReveal,
  shouldRunScreen1StorySequence,
  shouldShowPreLoginOnboarding,
  shouldShowScreen1Selection,
} from "./pre-login-onboarding";

const here = dirname(fileURLToPath(import.meta.url));
const helperSrc = readFileSync(join(here, "./pre-login-onboarding.ts"), "utf8");
const componentSrc = readFileSync(join(here, "../components/pre-login-onboarding.tsx"), "utf8");
const defaultAvatarSrc = readFileSync(join(here, "./default-avatar.ts"), "utf8");
const paywallCopySrc = readFileSync(
  join(here, "./verified-artist-tools-paywall-copy.ts"),
  "utf8",
);
const genreStylesSrc = readFileSync(join(here, "./genre-styles.ts"), "utf8");
const usernameAvailabilitySrc = readFileSync(
  join(here, "../../../shared/usernameAvailability.ts"),
  "utf8",
);
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const artistToolsMarkSrc = readFileSync(
  join(here, "../components/artist-tools-mark.tsx"),
  "utf8",
);
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const karmaSrc = readFileSync(join(here, "../../../server/karmaService.ts"), "utf8");
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const authPageSrc = readFileSync(join(here, "../pages/auth.tsx"), "utf8");
const signUpSrc = readFileSync(join(here, "../components/auth/SignUp.tsx"), "utf8");
const firstLoginModalSrc = readFileSync(
  join(here, "../components/first-login-onboarding-modal.tsx"),
  "utf8",
);
const postLoginOnboardingSrc = readFileSync(join(here, "./onboarding.ts"), "utf8");

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    key() {
      return null;
    },
  } as Storage;
}

const LOGOUT_LOCAL_KEYS = [
  "dubhub-authenticated",
  "dubhub-user-role",
  "dubhub-profile-image",
  "dubhub-display-name",
  "userRole",
  "dubhub-signup-role",
] as const;

describe("pre-login onboarding slice 1", () => {
  it("shows onboarding for an unseen ordinary unauthenticated user", () => {
    const storage = memoryStorage();
    assert.equal(
      shouldShowPreLoginOnboarding({
        isAuthenticated: false,
        routePath: "/",
        storage,
      }),
      true,
    );
  });

  it("shows Sign In (not onboarding) once the device has seen it", () => {
    const storage = memoryStorage();
    markPreLoginOnboardingSeen(storage);
    assert.equal(hasSeenPreLoginOnboarding(storage), true);
    assert.equal(
      shouldShowPreLoginOnboarding({
        isAuthenticated: false,
        routePath: "/",
        storage,
      }),
      false,
    );
  });

  it("does not show onboarding for an authenticated session", () => {
    const storage = memoryStorage();
    assert.equal(
      shouldShowPreLoginOnboarding({
        isAuthenticated: true,
        routePath: "/",
        storage,
      }),
      false,
    );
    assert.match(appSrc, /if \(!isAuthenticated\)/);
    assert.match(appSrc, /<Route path="\/" component=\{Home\} \/>/);
    assert.doesNotMatch(
      appSrc.slice(appSrc.indexOf("if (!isAuthenticated)") , appSrc.indexOf("if (enforcementState.banned")),
      /FirstLoginOnboardingModal/,
    );
  });

  it("bypasses onboarding on /auth-callback", () => {
    const storage = memoryStorage();
    assert.equal(
      shouldShowPreLoginOnboarding({
        routePath: "/auth-callback?code=abc",
        storage,
      }),
      false,
    );
    const unauthSwitch = appSrc.slice(
      appSrc.indexOf("if (!isAuthenticated)"),
      appSrc.indexOf("if (enforcementState.banned"),
    );
    const callbackIdx = unauthSwitch.indexOf('path="/auth-callback"');
    const resetIdx = unauthSwitch.indexOf('path="/reset-password"');
    const entryIdx = unauthSwitch.indexOf("UnauthenticatedEntry");
    assert.ok(callbackIdx >= 0 && resetIdx > callbackIdx && entryIdx > resetIdx);
  });

  it("bypasses onboarding for recovery / reset-password", () => {
    const storage = memoryStorage();
    const session = memoryStorage({ [PRE_LOGIN_RECOVERY_INTENT_KEY]: "1" });
    assert.equal(hasPendingRecoveryIntent(session), true);
    assert.equal(
      shouldShowPreLoginOnboarding({
        routePath: "/reset-password",
        hasRecoveryIntent: true,
        storage,
      }),
      false,
    );
    assert.equal(PRE_LOGIN_RECOVERY_INTENT_KEY, "dubhub:auth-recovery-intent");
  });

  it("bypasses onboarding when email-verified success should show Sign In", () => {
    const storage = memoryStorage();
    const session = memoryStorage({ [PRE_LOGIN_EMAIL_VERIFIED_NOTICE_KEY]: "1" });
    assert.equal(hasPendingEmailVerifiedNotice(session), true);
    assert.equal(
      shouldShowPreLoginOnboarding({
        routePath: "/",
        hasEmailVerifiedNotice: true,
        storage,
      }),
      false,
    );
    assert.match(componentSrc, /hasPendingEmailVerifiedNotice\(\)/);
    assert.match(componentSrc, /markPreLoginOnboardingSeen\(\)/);
    assert.equal(PRE_LOGIN_EMAIL_VERIFIED_NOTICE_KEY, "dubhub:email-verified-ok");
    assert.match(authPageSrc, /EMAIL_VERIFIED_SESSION_STORAGE_KEY/);
    assert.match(
      authPageSrc,
      /Your email is verified\. Sign in below to finish opening dub hub\./,
    );
  });

  it("keeps Screen 1 Community selection in local UI state only", () => {
    const storage = memoryStorage();
    const next = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    assert.equal(next.intent, "user");
    assert.equal(next.screen, 2);
    assert.equal(storage.getItem(PRE_LOGIN_ONBOARDING_SEEN_KEY), null);
    assert.equal(storage.getItem("account_type"), null);
    assert.equal(storage.getItem("dubhub-signup-role"), null);
  });

  it("keeps Screen 1 Artist selection in local UI state only", () => {
    const storage = memoryStorage();
    const next = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "artist");
    assert.equal(next.intent, "artist");
    assert.equal(next.viewingPerspective, "artist");
    assert.equal(storage.getItem("account_type"), null);
    assert.doesNotMatch(helperSrc, /localStorage\.setItem\([^)]*account_type/);
    assert.doesNotMatch(helperSrc, /dubhub-signup-role/);
  });

  it("does not persist account type to localStorage", () => {
    const storage = memoryStorage();
    markPreLoginOnboardingSeen(storage);
    assert.deepEqual([...Object.keys({ [PRE_LOGIN_ONBOARDING_SEEN_KEY]: "1" })], [
      PRE_LOGIN_ONBOARDING_SEEN_KEY,
    ]);
    assert.equal(storage.getItem(PRE_LOGIN_ONBOARDING_SEEN_KEY), "1");
    assert.equal(storage.length, 1);
    assert.match(helperSrc, /storage\.setItem\(PRE_LOGIN_ONBOARDING_SEEN_KEY, "1"\)/);
    assert.doesNotMatch(helperSrc, /setItem\([^)]*accountType|setItem\([^)]*account_type/);
    assert.doesNotMatch(componentSrc, /localStorage\.setItem/);
  });

  it("maps Community Get started to signup preselection user", () => {
    const afterCommunity = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    assert.equal(resolveSignupAccountType(afterCommunity.intent), "user");
    assert.match(componentSrc, /initialAccountType: intent/);
    assert.match(authPageSrc, /initialAccountType=\{initialAccountType\}/);
    assert.match(
      signUpSrc,
      /initialAccountType === "user" \|\| initialAccountType === "artist" \? initialAccountType : ""/,
    );
  });

  it("maps Artist Get started to signup preselection artist", () => {
    const afterArtist = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "artist");
    assert.equal(resolveSignupAccountType(afterArtist.intent), "artist");
    assert.match(signUpSrc, /SelectItem value="artist"/);
    assert.match(signUpSrc, /SelectItem value="user"/);
  });

  it("leaves the signup account-type Select editable", () => {
    assert.match(signUpSrc, /onValueChange=\{setAccountType\}/);
    assert.match(signUpSrc, /disabled=\{hasSignupSucceeded\}/);
    assert.doesNotMatch(signUpSrc, /disabled=\{true\}/);
    assert.match(signUpSrc, /data-testid="select-account-type"/);
    assert.doesNotMatch(signUpSrc, /Joining as/);
  });

  it("does not change signup intent when Screen 2 perspective is switched", () => {
    let state = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    state = applyScreen2Perspective(state, "artist");
    assert.equal(state.intent, "user");
    assert.equal(state.viewingPerspective, "artist");
    assert.equal(resolveSignupAccountType(state.intent), "user");
    state = applyBackToScreen1(state);
    assert.equal(state.screen, 1);
    assert.equal(state.intent, "user");
    assert.match(componentSrc, /applyScreen2Perspective/);
    assert.match(componentSrc, /aria-pressed=\{!viewingArtist\}/);
    assert.match(componentSrc, /aria-pressed=\{viewingArtist\}/);
  });

  it("marks onboarding seen on Sign in exit", () => {
    const storage = memoryStorage();
    assert.match(componentSrc, /onSignIn=\{\(\) => \{/);
    const signInHandler = componentSrc.slice(
      componentSrc.indexOf("onSignIn={() => {"),
      componentSrc.indexOf("onGetStarted={(intent) => {"),
    );
    assert.match(signInHandler, /markPreLoginOnboardingSeen\(\)/);
    assert.match(signInHandler, /defaultToSignUp: false/);
    markPreLoginOnboardingSeen(storage);
    assert.equal(hasSeenPreLoginOnboarding(storage), true);
  });

  it("marks onboarding seen on Get started exit", () => {
    const getStartedHandler = componentSrc.slice(
      componentSrc.indexOf("onGetStarted={(intent) => {"),
      componentSrc.indexOf("return (", componentSrc.indexOf("onGetStarted={(intent) => {")),
    );
    assert.match(getStartedHandler, /markPreLoginOnboardingSeen\(\)/);
    assert.match(getStartedHandler, /defaultToSignUp: true/);
    assert.match(getStartedHandler, /initialAccountType: intent/);
  });

  it("does not clear onboarding-seen state on logout", () => {
    const storage = memoryStorage({
      [PRE_LOGIN_ONBOARDING_SEEN_KEY]: "1",
      "dubhub-authenticated": "true",
      "dubhub-user-role": "user",
      "dubhub-signup-role": "artist",
    });
    for (const key of LOGOUT_LOCAL_KEYS) {
      storage.removeItem(key);
    }
    assert.equal(hasSeenPreLoginOnboarding(storage), true);
    assert.match(appSrc, /localStorage\.removeItem\('dubhub-signup-role'\)/);
    assert.doesNotMatch(appSrc, /PRE_LOGIN_ONBOARDING_SEEN_KEY/);
    assert.doesNotMatch(
      appSrc,
      /localStorage\.removeItem\(['"]dubhub_pre_login_onboarding_seen['"]\)/,
    );
  });

  it("does not write dubhub-theme when onboarding mounts", () => {
    const themeWriteRe =
      /localStorage\.setItem\(\s*['"]dubhub-theme['"]|applyTheme\(|THEME_STORAGE_KEY/;
    assert.doesNotMatch(helperSrc, themeWriteRe);
    assert.doesNotMatch(componentSrc, themeWriteRe);
    assert.equal(THEME_STORAGE_KEY, "dubhub-theme");
    assert.match(componentSrc, /AUTH_SURFACE_CLASS/);
    assert.match(componentSrc, /PRELOGIN_CANVAS_CLASS/);
  });

  it("does not mutate Supabase auth from intent selection", () => {
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|signInWithPassword|account_type:/);
    assert.match(signUpSrc, /supabase\.auth\.signUp/);
    assert.match(signUpSrc, /account_type: accountType/);
  });

  it("leaves existing first-login onboarding keys and modal untouched", () => {
    assert.match(postLoginOnboardingSrc, /dubhub_onboarding_pending_/);
    assert.match(postLoginOnboardingSrc, /dubhub_onboarding_seen_/);
    assert.doesNotMatch(helperSrc, /dubhub_onboarding_pending_/);
    assert.doesNotMatch(helperSrc, /dubhub_onboarding_seen_/);
    assert.doesNotMatch(componentSrc, /FirstLoginOnboardingModal/);
    assert.match(appSrc, /FirstLoginOnboardingModal/);
    assert.match(firstLoginModalSrc, /Welcome to dub hub/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
  });

  it("respects reduced motion on screen transitions", () => {
    assert.match(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /motion-reduce:translate-x-0/);
    assert.match(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /motion-reduce:transition-opacity/);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_TRANSITION_CLASS/);
    assert.doesNotMatch(componentSrc, /framer-motion|drag|swipe|onPan|spring|bounce/);
  });

  it("bypasses onboarding when a native auth callback URL is pending", () => {
    const storage = memoryStorage();
    const session = memoryStorage({
      [PENDING_NATIVE_AUTH_CALLBACK_KEY]: "uk.dubhub.app://auth-callback?code=1",
    });
    assert.equal(hasPendingNativeAuthCallback(session), true);
    assert.equal(
      shouldShowPreLoginOnboarding({
        routePath: "/",
        hasPendingNativeAuthCallback: true,
        storage,
      }),
      false,
    );
  });

  it("uses live product copy and omits unlaunched promises", () => {
    const joined = JSON.stringify(PRE_LOGIN_ONBOARDING_COPY);
    assert.match(joined, /Still got that video in your camera roll\?/);
    assert.doesNotMatch(joined, /Great music deserves a second listen/);
    assert.match(joined, /Hear it in a set/);
    assert.match(joined, /Find it on dub hub/);
    assert.match(joined, /Follow it through to release/);
    assert.doesNotMatch(
      joined,
      /Identify tracks from sets, events and mixes, save the ones you love, and follow them through to release/,
    );
    assert.match(joined, /For the community/);
    assert.match(joined, /For artists/);
    assert.match(joined, /Let the music do the talking/);
    assert.doesNotMatch(joined, /subscription|widget|paid tools|mix alerts|hidden identification/i);
    assert.match(componentSrc, /PRE_LOGIN_ONBOARDING_COPY/);
    assert.match(componentSrc, /type="button"/);
    assert.match(componentSrc, /aria-live="polite"/);
  });

  it("preserves Screen 1 intent when returning from Screen 2", () => {
    let state = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "artist");
    state = applyScreen2Perspective(state, "user");
    state = applyBackToScreen1(state);
    assert.equal(state.screen, 1);
    assert.equal(state.intent, "artist");
    state = applyScreen1Intent(state, "user");
    assert.equal(state.intent, "user");
    assert.equal(state.screen, 2);
  });
});

describe("pre-login onboarding slice 2 presentation", () => {
  it("uses identical geometry classes for Community and Artists perspective buttons", () => {
    assert.match(PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS, /flex min-h-11 min-w-11 flex-col items-center justify-center/);
    assert.match(PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS, /px-2 py-1.5 text-sm font-medium leading-none/);
    const userBtn = componentSrc.slice(
      componentSrc.indexOf('data-testid="button-onboarding-view-user"'),
      componentSrc.indexOf('data-testid="button-onboarding-view-artist"'),
    );
    const artistBtn = componentSrc.slice(
      componentSrc.indexOf('data-testid="button-onboarding-view-artist"'),
      componentSrc.indexOf("{copy.screen2.viewArtists}"),
    );
    assert.match(userBtn, /PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS/);
    assert.match(artistBtn, /PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS/);
    assert.equal((userBtn.match(/PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS/g) ?? []).length, 1);
    assert.equal((artistBtn.match(/PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS/g) ?? []).length, 1);
  });

  it("keeps selected and unselected perspective buttons on the same geometry class", () => {
    const userBtn = componentSrc.slice(
      componentSrc.indexOf('data-testid="button-onboarding-view-user"'),
      componentSrc.indexOf('data-testid="button-onboarding-view-artist"'),
    );
    const artistBtn = componentSrc.slice(
      componentSrc.indexOf('data-testid="button-onboarding-view-artist"'),
      componentSrc.indexOf("{copy.screen2.viewArtists}"),
    );
    assert.match(userBtn, /text-foreground|text-muted-foreground/);
    assert.match(artistBtn, /text-foreground|text-muted-foreground/);
    assert.match(componentSrc, /aria-pressed=\{!viewingArtist\}/);
    assert.match(componentSrc, /aria-pressed=\{viewingArtist\}/);
    assert.doesNotMatch(componentSrc, /PRE_LOGIN_SEGMENT_HIGHLIGHT_CLASS/);
  });

  it("uses a restrained Screen 1 to Screen 2 fade and 8px forward slide", () => {
    assert.match(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /duration-200/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /duration-\[/);
    assert.match(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /ease-out/);
    assert.match(componentSrc, /pre-login-screen-1-layer/);
    assert.match(componentSrc, /pre-login-screen-2-layer/);
    assert.match(componentSrc, /motion-safe:-translate-x-2/);
    assert.match(componentSrc, /motion-safe:translate-x-2/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /spring|bounce|scale/);
  });

  it("reverses the screen transition on Back", () => {
    assert.match(componentSrc, /applyBackToScreen1/);
    assert.match(componentSrc, /onClick=\{\(\) => setState\(\(prev\) => applyBackToScreen1\(prev\)\)\}/);
    const screen1Inactive = componentSrc.includes(
      'opacity-0 motion-safe:-translate-x-2',
    );
    const screen2Inactive = componentSrc.includes(
      'opacity-0 motion-safe:translate-x-2',
    );
    assert.equal(screen1Inactive, true);
    assert.equal(screen2Inactive, true);
  });

  it("bypasses translation under reduced motion", () => {
    assert.match(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /motion-reduce:translate-x-0/);
    assert.match(PRE_LOGIN_PERSPECTIVE_TRANSITION_CLASS, /motion-reduce:translate-x-0/);
    assert.match(PRE_LOGIN_IDENTITY_PRESS_CLASS, /motion-reduce:active:scale-100/);
  });

  it("keeps both Screen 2 perspectives mounted without changing intent", () => {
    let state = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    state = applyScreen2Perspective(state, "artist");
    assert.equal(state.intent, "user");
    assert.match(componentSrc, /pre-login-perspective-\$\{side\}/);
    assert.match(componentSrc, /side="community"/);
    assert.match(componentSrc, /side="artist"/);
    assert.match(componentSrc, /pre-login-perspective-pager/);
    assert.match(componentSrc, /w-1\/2 shrink-0/);
    assert.match(componentSrc, /applyScreen2Perspective/);
  });

  it("gives Screen 2 a stable stacked content frame", () => {
    assert.match(componentSrc, /data-testid="pre-login-screen-2-content-frame"/);
    const frame = componentSrc.slice(
      componentSrc.indexOf('data-testid="pre-login-screen-2-content-frame"'),
      componentSrc.indexOf('data-testid="button-onboarding-get-started"'),
    );
    assert.match(frame, /w-\[200%\]/);
    assert.match(frame, /side="community"/);
    assert.match(frame, /side="artist"/);
  });

  it("keeps Get started outside perspective copy so CTA position is stable", () => {
    const screen2 = componentSrc.slice(componentSrc.indexOf("function Screen2("));
    const frame = screen2.indexOf('data-testid="pre-login-screen-2-content-frame"');
    const cta = screen2.indexOf('data-testid="button-onboarding-get-started"');
    const signIn = screen2.indexOf("<SignInExit");
    assert.ok(frame >= 0 && cta > frame && signIn > cta);
    const ctaBlock = screen2.slice(cta, cta + 280);
    assert.doesNotMatch(ctaBlock, /viewingArtist|viewingPerspective/);
  });

  it("uses the approved Screen 1 product journey copy", () => {
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyHear, "Hear it in a set");
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyFind, "Find it on dub hub");
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyFollow, "Follow it through to release");
    assert.equal("supporting" in PRE_LOGIN_ONBOARDING_COPY.screen1, false);
  });

  it("keeps Back on the existing local Screen 2 to Screen 1 handler", () => {
    assert.match(componentSrc, /aria-label="Back"/);
    assert.match(componentSrc, /applyBackToScreen1/);
    assert.match(componentSrc, /onClick=\{\(\) => setState\(\(prev\) => applyBackToScreen1\(prev\)\)\}/);
    assert.doesNotMatch(componentSrc, /history\.back|setLocation|navigate\(/);
  });

  it("does not change Get started behaviour", () => {
    const getStartedHandler = componentSrc.slice(
      componentSrc.indexOf("onGetStarted={(intent) => {"),
      componentSrc.indexOf("return (", componentSrc.indexOf("onGetStarted={(intent) => {")),
    );
    assert.match(getStartedHandler, /markPreLoginOnboardingSeen\(\)/);
    assert.match(getStartedHandler, /defaultToSignUp: true/);
    assert.match(getStartedHandler, /initialAccountType: intent/);
  });

  it("does not change Sign in behaviour", () => {
    const signInHandler = componentSrc.slice(
      componentSrc.indexOf("onSignIn={() => {"),
      componentSrc.indexOf("onGetStarted={(intent) => {"),
    );
    assert.match(signInHandler, /markPreLoginOnboardingSeen\(\)/);
    assert.match(signInHandler, /defaultToSignUp: false/);
  });

  it("does not change onboarding seen-key semantics", () => {
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
    assert.match(helperSrc, /storage\.setItem\(PRE_LOGIN_ONBOARDING_SEEN_KEY, "1"\)/);
    assert.doesNotMatch(helperSrc, /removeItem\(PRE_LOGIN_ONBOARDING_SEEN_KEY/);
  });

  it("does not change account-type intent semantics", () => {
    const community = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    const switched = applyScreen2Perspective(community, "artist");
    assert.equal(resolveSignupAccountType(switched.intent), "user");
    assert.equal(resolveSignupAccountType(applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "artist").intent), "artist");
  });

  it("does not change auth files in this presentation slice", () => {
    assert.match(authPageSrc, /initialAccountType=\{initialAccountType\}/);
    assert.match(signUpSrc, /supabase\.auth\.signUp/);
    assert.match(signUpSrc, /account_type: accountType/);
    assert.doesNotMatch(authPageSrc, /PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS|translate-x-2/);
    assert.doesNotMatch(signUpSrc, /PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS|translate-x-2/);
  });

  it("does not introduce global theme writes", () => {
    const themeWriteRe =
      /localStorage\.setItem\(\s*['"]dubhub-theme['"]|applyTheme\(|THEME_STORAGE_KEY/;
    assert.doesNotMatch(helperSrc, themeWriteRe);
    assert.doesNotMatch(componentSrc, themeWriteRe);
  });
});

describe("pre-login onboarding slice 3 presentation", () => {
  it("uses the existing Community and Artist default avatar assets", () => {
    assert.match(defaultAvatarSrc, /users\/default_user_avatar\.png/);
    assert.match(defaultAvatarSrc, /artists\/default_artist_avatar\.png/);
    assert.match(componentSrc, /getDefaultAvatarPublicUrl\("user"\)/);
    assert.match(componentSrc, /getDefaultAvatarPublicUrl\("artist"\)/);
    assert.match(componentSrc, /onboarding-intent-avatar-\$\{role\}/);
    assert.match(componentSrc, /onboarding-perspective-avatar-user/);
    assert.match(componentSrc, /onboarding-perspective-avatar-artist/);
    assert.doesNotMatch(componentSrc, /GenerateImage|default-community|placeholder-avatar/);
  });

  it("keeps Screen 1 identity controls as accessible buttons", () => {
    const userBtn = componentSrc.slice(
      componentSrc.indexOf("function IntentChoiceButton"),
      componentSrc.indexOf("function SignInExit"),
    );
    assert.match(userBtn, /type="button"/);
    assert.match(userBtn, /aria-pressed=\{selected\}/);
    assert.match(userBtn, /aria-label=\{`\$\{label\}\. \$\{supporting\}`\}/);
    assert.match(userBtn, /min-h-11/);
    assert.match(componentSrc, /testId="button-onboarding-intent-user"/);
    assert.match(componentSrc, /testId="button-onboarding-intent-artist"/);
    assert.match(componentSrc, /alt=""/);
    assert.match(componentSrc, /aria-hidden/);
  });

  it("does not change Screen 1 intent behaviour", () => {
    const next = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    assert.equal(next.intent, "user");
    assert.equal(next.screen, 2);
    assert.equal(next.viewingPerspective, "user");
    assert.equal(resolveSignupAccountType(next.intent), "user");
    assert.match(componentSrc, /applyScreen1Intent/);
  });

  it("keeps Screen 2 perspective independent of signup intent", () => {
    let state = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    state = applyScreen2Perspective(state, "artist");
    assert.equal(state.intent, "user");
    assert.equal(state.viewingPerspective, "artist");
    assert.equal(resolveSignupAccountType(state.intent), "user");
    assert.match(componentSrc, /applyScreen2Perspective/);
    assert.match(componentSrc, /aria-pressed=\{!viewingArtist\}/);
    assert.match(componentSrc, /aria-pressed=\{viewingArtist\}/);
  });

  it("keeps Get started on the original Screen 1 intent", () => {
    const start = componentSrc.indexOf("onGetStarted={() => {");
    const getStarted = componentSrc.slice(start, start + 280);
    assert.match(getStarted, /resolveSignupAccountType\(state\.intent\)/);
    assert.doesNotMatch(getStarted, /viewingPerspective/);
    const exitHandler = componentSrc.slice(
      componentSrc.indexOf("onGetStarted={(intent) => {"),
      componentSrc.indexOf("return (", componentSrc.indexOf("onGetStarted={(intent) => {")),
    );
    assert.match(exitHandler, /initialAccountType: intent/);
  });

  it("does not change Sign in behaviour", () => {
    const signInHandler = componentSrc.slice(
      componentSrc.indexOf("onSignIn={() => {"),
      componentSrc.indexOf("onGetStarted={(intent) => {"),
    );
    assert.match(signInHandler, /markPreLoginOnboardingSeen\(\)/);
    assert.match(signInHandler, /defaultToSignUp: false/);
    assert.equal((componentSrc.match(/<SignInExit /g) ?? []).length, 2);
    assert.match(componentSrc, /data-testid="button-onboarding-sign-in"/);
  });

  it("shares one logo size and brand-anchor across both screens", () => {
    assert.equal(PRE_LOGIN_LOGO_SIZE, "xl");
    assert.match(componentSrc, /data-testid="pre-login-brand-anchor"/);
    assert.match(componentSrc, /data-testid="pre-login-shared-logo"/);
    assert.match(componentSrc, /size=\{PRE_LOGIN_LOGO_SIZE\}/);
    assert.equal((componentSrc.match(/<Logo /g) ?? []).length, 1);
    const screen1 = componentSrc.slice(
      componentSrc.indexOf("function Screen1("),
      componentSrc.indexOf("function PerspectiveSwitcher("),
    );
    const screen2 = componentSrc.slice(
      componentSrc.indexOf("function Screen2("),
      componentSrc.indexOf("export function PreLoginOnboarding"),
    );
    assert.doesNotMatch(screen1, /<Logo /);
    assert.doesNotMatch(screen2, /<Logo /);
    assert.doesNotMatch(componentSrc, /size="md"|!h-11/);
  });

  it("keeps reduced motion support on identity press and screen motion", () => {
    assert.match(PRE_LOGIN_IDENTITY_PRESS_CLASS, /motion-reduce:active:scale-100/);
    assert.match(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /motion-reduce:translate-x-0/);
    assert.match(PRE_LOGIN_PERSPECTIVE_TRANSITION_CLASS, /motion-reduce:translate-x-0/);
    assert.match(componentSrc, /PRE_LOGIN_IDENTITY_PRESS_CLASS/);
    assert.doesNotMatch(componentSrc, /framer-motion|drag|swipe|onPan|spring|bounce/);
  });

  it("does not expose inactive perspective content to accessibility", () => {
    assert.match(componentSrc, /aria-hidden=\{!active\}/);
    assert.match(componentSrc, /ref=\{bindInert\(active\)\}/);
    assert.match(componentSrc, /aria-hidden=\{!onScreen1\}/);
    assert.match(componentSrc, /aria-hidden=\{onScreen1\}/);
    assert.match(componentSrc, /pre-login-perspective-\$\{side\}/);
  });

  it("never labels artist verification or ID confirmation as paid tooling", () => {
    const artistConfirm = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.find(
      (item) => item.visual === "artistIdentifiedPill",
    );
    const artistPlayed = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.find(
      (item) => item.visual === "clips",
    );
    const artistConnect = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.find(
      (item) => item.title === "Connect clips to your releases",
    );
    assert.ok(artistConfirm && artistPlayed && artistConnect);
    assert.match(artistConfirm.body, /Let listeners know when an ID is yours/);
    assert.equal("toolLabel" in artistConfirm, false);
    assert.equal("toolLabel" in artistPlayed, false);
    assert.equal("toolLabel" in artistConnect, false);
    assert.match(componentSrc, /GoldVerifiedTick/);
    assert.doesNotMatch(
      JSON.stringify([artistConfirm, artistPlayed, artistConnect]),
      /Artist tools|Premium|Subscribe/,
    );
  });

  it("does not introduce a price, purchase, or subscribe CTA", () => {
    const joined = JSON.stringify(PRE_LOGIN_ONBOARDING_COPY);
    assert.doesNotMatch(joined, /£|\$|Subscribe|Upgrade now|Unlock with|paywall|RevenueCat/i);
    assert.doesNotMatch(componentSrc, /Subscribe|Upgrade now|Unlock with|RevenueCat|purchase/i);
    assert.doesNotMatch(helperSrc, /Subscribe|Upgrade now|price/i);
  });

  it("limits artist selling points to confirmed entitlement scope", () => {
    const artistBenefits = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits;
    assert.equal(artistBenefits.length, 6);
    assert.equal(artistBenefits[0].title, "Discover where your music is played");
    assert.equal(artistBenefits[1].title, "Confirm your tracks");
    assert.equal(artistBenefits[2].title, "Connect clips to your releases");
    assert.equal(artistBenefits[3].title, "Notify the people already waiting");
    assert.equal(artistBenefits[4].title, "Climb the Artist Leaderboard");
    assert.equal(artistBenefits[5].title, PRE_LOGIN_ARTIST_TOOLS_LABEL);
    assert.equal("toolLabel" in artistBenefits[3], false);
    assert.equal("toolLabel" in artistBenefits[4], false);
    assert.equal(artistBenefits[5].visual, "artistTools");
    assert.match(paywallCopySrc, /Send Release Alerts to listeners already waiting/);
    const joined = JSON.stringify(artistBenefits);
    assert.doesNotMatch(
      joined,
      /unlimited|pre-save|pre-add|profile questions|boost|visibility|analytics|credibility|campaign|scheduled/i,
    );
    assert.equal(
      artistBenefits.filter((item) => item.visual === "artistTools").length,
      1,
    );
  });

  it("does not change auth, session, or storage mechanics", () => {
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|signInWithPassword|account_type:/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
    assert.match(helperSrc, /storage\.setItem\(PRE_LOGIN_ONBOARDING_SEEN_KEY, "1"\)/);
    assert.doesNotMatch(componentSrc, /localStorage\.setItem/);
    assert.match(signUpSrc, /supabase\.auth\.signUp/);
    assert.match(signUpSrc, /account_type: accountType/);
  });
});

describe("pre-login onboarding slice 4 presentation", () => {
  it("keeps Screen 1 identity controls accessible without decorative avatar containers", () => {
    const intentBtn = componentSrc.slice(
      componentSrc.indexOf("function IntentChoiceButton"),
      componentSrc.indexOf("function SignInExit"),
    );
    assert.match(intentBtn, /type="button"/);
    assert.match(intentBtn, /aria-pressed=\{selected\}/);
    assert.match(intentBtn, /min-h-11/);
    const avatarClass = intentBtn.slice(
      intentBtn.indexOf("<EmphasizedRoleAvatar"),
      intentBtn.indexOf("{label}"),
    );
    assert.doesNotMatch(avatarClass, /ring-1 ring-white\/20/);
    assert.doesNotMatch(avatarClass, /ring-offset/);
    assert.doesNotMatch(intentBtn, /bg-card|rounded-xl border/);
    assert.doesNotMatch(intentBtn, /ring-2 ring-\[#4ae9df\]/);
    assert.match(intentBtn, /emphasize=\{emphasize\}/);
  });

  it("does not change Screen 1 intent behaviour", () => {
    const next = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "artist");
    assert.equal(next.intent, "artist");
    assert.equal(next.screen, 2);
    assert.equal(resolveSignupAccountType(next.intent), "artist");
  });

  it("clips screen layers so Screen 1 cannot paint over Screen 2", () => {
    assert.match(PRE_LOGIN_SCREEN_LAYER_CLASS, /absolute inset-0/);
    assert.match(PRE_LOGIN_SCREEN_LAYER_CLASS, /overflow-x-hidden overflow-y-auto/);
    assert.match(PRE_LOGIN_SCREEN_LAYER_CLASS, /bg-transparent/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_LAYER_CLASS, /bg-\[#0f1324\]/);
    assert.match(componentSrc, /data-testid="pre-login-screen-layers"/);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_LAYERS_CLASS/);
    assert.match(PRE_LOGIN_SCREEN_LAYERS_CLASS, /isolate min-h-0 flex-1 overflow-hidden/);
    assert.match(PRE_LOGIN_SCREEN_LAYERS_CLASS, /-mx-4/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_LAYERS_CLASS, /-mt-4 pt-4/);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_LAYER_CLASS/);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_2_LAYER_CLASS/);
    const screen1Layer = componentSrc.slice(
      componentSrc.indexOf('data-testid="pre-login-screen-1-layer"') - 700,
      componentSrc.indexOf('data-testid="pre-login-screen-1-layer"') + 80,
    );
    const screen2Layer = componentSrc.slice(
      componentSrc.indexOf('data-testid="pre-login-screen-2-layer"') - 420,
      componentSrc.indexOf('data-testid="pre-login-screen-2-layer"') + 80,
    );
    assert.match(screen1Layer, /z-20/);
    assert.match(screen1Layer, /z-0/);
    assert.match(screen2Layer, /z-20/);
    assert.match(screen2Layer, /z-0/);
    assert.doesNotMatch(componentSrc, /content-center/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /spring|bounce/);
  });

  it("keeps shared logo geometry stable", () => {
    assert.equal(PRE_LOGIN_LOGO_SIZE, "xl");
    assert.equal((componentSrc.match(/<Logo /g) ?? []).length, 1);
    assert.match(componentSrc, /size=\{PRE_LOGIN_LOGO_SIZE\}/);
  });

  it("uses only approved live Community capabilities", () => {
    const titles = PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits.map((item) => item.title);
    assert.deepEqual(titles, [
      "ID the tracks you're looking for",
      "Find your sound",
      "Save the tracks you love",
      "Follow them through to release",
      "Get notified when tracks finally drop",
      "Climb the Leaderboard. Earn rewards.",
    ]);
    const joined = JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits);
    assert.doesNotMatch(joined, /Artist tools|Subscribe|tutorial|Discover UI|notification permission/i);
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits.every((item) => !("toolLabel" in item)),
      true,
    );
  });

  it("uses only approved live Artist capabilities", () => {
    const titles = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.map((item) => item.title);
    assert.deepEqual(titles, [
      "Discover where your music is played",
      "Confirm your tracks",
      "Connect clips to your releases",
      "Notify the people already waiting",
      "Climb the Artist Leaderboard",
      PRE_LOGIN_ARTIST_TOOLS_LABEL,
    ]);
    const joined = JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits);
    assert.doesNotMatch(
      joined,
      /analytics|campaign|boost|visibility|scheduled publishing|anonymous reveal|profile customisation|profile customization/i,
    );
  });

  it("uses one Artist Tools feature row for paid tooling", () => {
    const benefits = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits;
    const paid = benefits.filter((item) => item.visual === "artistTools");
    assert.equal(paid.length, 1);
    assert.equal(paid[0].title, PRE_LOGIN_ARTIST_TOOLS_LABEL);
    assert.match(paid[0].body, /More releases, attached clips and links/);
    assert.match(paid[0].body, /Release Alert delivery/);
    const confirm = benefits.find((item) => item.visual === "artistIdentifiedPill");
    const demand = benefits.find((item) => item.visual === "alertDemand");
    const reputation = benefits.find((item) => item.title === "Climb the Artist Leaderboard");
    assert.ok(confirm && demand && reputation);
    assert.equal("toolLabel" in confirm, false);
    assert.equal("toolLabel" in demand, false);
    assert.equal("toolLabel" in reputation, false);
    assert.match(demand.body, /notify listeners/);
    assert.equal(benefits[4].visual, "leaderboard");
  });

  it("does not introduce future analytics or campaign claims", () => {
    const joined = JSON.stringify(PRE_LOGIN_ONBOARDING_COPY);
    assert.doesNotMatch(
      joined,
      /advanced analytics|campaign analytics|audience insights|ranking boost|promotional placement|scheduled publishing|anonymous reveal/i,
    );
  });

  it("reuses canonical status and genre pill presentation without modifying VideoCard", () => {
    assert.match(componentSrc, /STATUS_GLOW_PILL_BG\.unidentified/);
    assert.match(componentSrc, /STATUS_GLOW_PILL_BG\.identified/);
    assert.match(componentSrc, /getGenreGlowPillStyle/);
    assert.match(componentSrc, /getGenreChipStyle\("dnb"\)/);
    assert.match(componentSrc, /getGenreChipStyle\("ukg"\)/);
    assert.match(componentSrc, /getGenreChipStyle\("house"\)/);
    assert.match(genreStylesSrc, /unidentified: "#ef4444"/);
    assert.match(genreStylesSrc, /identified: "#22c55e"/);
    assert.match(videoCardSrc, /STATUS_GLOW_PILL_BG\.unidentified/);
    assert.doesNotMatch(componentSrc, /from "@\/components\/video-card"/);
  });

  it("qualifies reserved-username copy without promising every artist", () => {
    assert.match(PRE_LOGIN_ONBOARDING_COPY.screen2.artistHookTitle, /Your artist name may already be waiting/);
    assert.match(PRE_LOGIN_ONBOARDING_COPY.screen2.artistHookBody, /artists just like you/);
    assert.doesNotMatch(PRE_LOGIN_ONBOARDING_COPY.screen2.artistHookBody, /probably|every artist|definitely/i);
    assert.match(usernameAvailabilitySrc, /is_artist_username_reserved/);
    assert.notEqual(
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits[4].title,
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistHookTitle,
    );
    assert.doesNotMatch(componentSrc, /pre-login-artist-hook/);
    assert.doesNotMatch(componentSrc, /pre-login-hook-slot/);
  });

  it("does not change perspective independence, Get started intent, or reduced motion", () => {
    let state = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    state = applyScreen2Perspective(state, "artist");
    assert.equal(state.intent, "user");
    assert.equal(resolveSignupAccountType(state.intent), "user");
    assert.match(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /motion-reduce:translate-x-0/);
    assert.match(PRE_LOGIN_IDENTITY_PRESS_CLASS, /motion-reduce:active:scale-100/);
  });

  it("does not change auth, routing, or storage behaviour", () => {
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
    assert.match(authPageSrc, /initialAccountType=\{initialAccountType\}/);
  });
});

describe("pre-login onboarding slice 5 interaction and rhythm", () => {
  it("places Screen 1 identities with a lower flexible thumb-zone spacer", () => {
    assert.match(PRE_LOGIN_SCREEN_1_TOP_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_1_BOTTOM_CLASS, /shrink-0/);
    assert.match(componentSrc, /pre-login-screen-1-top/);
    assert.match(componentSrc, /pre-login-screen-1-middle/);
    assert.match(componentSrc, /pre-login-identity-region/);
    assert.match(componentSrc, /pre-login-screen-1-bottom/);
    assert.doesNotMatch(componentSrc, /content-center/);
  });

  it("removes duplicate heading avatars from Screen 2", () => {
    assert.doesNotMatch(componentSrc, /onboarding-panel-avatar/);
    assert.match(componentSrc, /onboarding-perspective-avatar-user/);
    assert.match(componentSrc, /onboarding-perspective-avatar-artist/);
    const headingBlock = componentSrc.slice(
      componentSrc.indexOf("pre-login-heading-block"),
      componentSrc.indexOf("PRE_LOGIN_FEATURE_LIST_CLASS"),
    );
    assert.doesNotMatch(headingBlock, /DefaultRoleAvatar/);
  });

  it("gives Community and Artist the same heading geometry and Community strapline", () => {
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.communityLead,
      "Music you've heard once shouldn't disappear forever.",
    );
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistLead,
      "Let the music do the talking.",
    );
    assert.match(PRE_LOGIN_HEADING_BLOCK_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_HEADING_BLOCK_CLASS, /min-h-\[3\.25rem\]/);
    assert.doesNotMatch(PRE_LOGIN_STRAPLINE_CLASS, /min-h-/);
    assert.ok(PRE_LOGIN_FEATURE_LIST_CLASS.startsWith(PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS));
    assert.ok(PRE_LOGIN_CALLOUT_CLASS.startsWith(PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS));
    assert.match(componentSrc, /PRE_LOGIN_HEADING_BLOCK_CLASS/);
    assert.match(componentSrc, /copy\.screen2\.communityLead/);
    assert.match(componentSrc, /copy\.screen2\.artistLead/);
  });

  it("uses exactly six matched feature slots per perspective", () => {
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits.length, 6);
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.length, 6);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /grid-cols-\[7rem_minmax\(0,1fr\)\]/);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /items-start/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /items-center/);
    assert.match(PRE_LOGIN_FEATURE_VISUAL_COL_CLASS, /items-center/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /flex-col items-center|text-center/);
    assert.match(componentSrc, /PRE_LOGIN_FEATURE_ROW_CLASS/);
    assert.doesNotMatch(componentSrc, /PRE_LOGIN_HOOK_SLOT_CLASS/);
  });

  it("keeps Get started outside the pager so CTA placement is structurally stable", () => {
    const screen2 = componentSrc.slice(componentSrc.indexOf("function Screen2("));
    const pager = screen2.indexOf('data-testid="pre-login-perspective-pager"');
    const cta = screen2.indexOf('data-testid="button-onboarding-get-started"');
    const signIn = screen2.indexOf("<SignInExit");
    assert.ok(pager >= 0 && cta > pager && signIn > cta);
  });

  it("uses a compact Unidentified badge with canonical red status semantics", () => {
    assert.match(componentSrc, /onboarding-mini-unidentified/);
    assert.match(componentSrc, /text-\[10px\]/);
    assert.doesNotMatch(componentSrc, /text-\[7px\]|max-w-\[2\.75rem\]|scale-90/);
    assert.match(componentSrc, /STATUS_GLOW_PILL_BG\.unidentified/);
    assert.match(genreStylesSrc, /unidentified: "#ef4444"/);
    assert.doesNotMatch(componentSrc, /from "@\/components\/video-card"/);
  });

  it("keeps Artist feature icon colours individually sourced", () => {
    assert.match(componentSrc, /text-\[#f472b6\]/);
    assert.match(componentSrc, /GoldVerifiedTick/);
    assert.match(componentSrc, /text-\[#fb923c\]/);
    assert.match(componentSrc, /text-\[#4ae9df\]/);
    assert.match(componentSrc, /text-yellow-500/);
    assert.match(artistToolsMarkSrc, /text-\[#c9a227\]/);
    assert.doesNotMatch(componentSrc, /text-\[#a78bfa\]|text-\[#34d399\]|text-\[#e8d5a3\]/);
  });

  it("replaces Artist Tools text labels with one gold sleeve-and-record mark", () => {
    assert.match(artistToolsMarkSrc, /data-artist-tools-sleeve/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-record/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-wrench/);
    assert.match(artistToolsMarkSrc, /from "lucide-react"/);
    assert.match(artistToolsMarkSrc, /Disc3/);
    assert.match(artistToolsMarkSrc, /Wrench/);
    assert.doesNotMatch(artistToolsMarkSrc, /Hammer|#4ae9df|turquoise|#4AE9DF/i);
    assert.match(componentSrc, /ArtistToolsMark/);
    assert.doesNotMatch(componentSrc, /uppercase tracking-wider/);
    const paid = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.filter(
      (item) => item.visual === "artistTools",
    );
    assert.equal(paid.length, 1);
    const freeVisuals = ["clips", "artistIdentifiedPill", "releases", "alertDemand", "leaderboard"];
    for (const visual of freeVisuals) {
      const row = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.find((item) => item.visual === visual);
      assert.ok(row);
      assert.equal("toolLabel" in row, false);
      assert.notEqual(row.visual, "artistTools");
    }
  });

  it("uses the approved reserved-username hook copy", () => {
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistHookTitle,
      "Your artist name may already be waiting.",
    );
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistHookBody,
      "We've reserved usernames for artists just like you. See if yours is one of them.",
    );
  });

  it("keeps tap perspective switching and commits horizontal pager pans without looping", () => {
    assert.match(componentSrc, /aria-pressed=\{!viewingArtist\}/);
    assert.match(componentSrc, /onViewPerspective\("user"\)/);
    assert.match(componentSrc, /onViewPerspective\("artist"\)/);
    assert.match(componentSrc, /onPointerDown/);
    assert.match(componentSrc, /resolvePerspectivePagerCommit/);
    assert.equal(PRE_LOGIN_PAGER_THRESHOLD, 0.28);
    assert.equal(lockPerspectivePagerAxis(24, 4), "x");
    assert.equal(lockPerspectivePagerAxis(4, 24), "y");
    assert.equal(lockPerspectivePagerAxis(2, 2), null);
    assert.equal(
      resolvePerspectivePagerCommit({ from: "user", dx: -160, width: 400, vx: 0 }),
      "artist",
    );
    assert.equal(
      resolvePerspectivePagerCommit({ from: "artist", dx: 160, width: 400, vx: 0 }),
      "user",
    );
    assert.equal(
      resolvePerspectivePagerCommit({ from: "user", dx: 160, width: 400, vx: 0 }),
      "user",
    );
  });

  it("snaps back below the pager threshold and does not mutate signup intent", () => {
    assert.equal(
      resolvePerspectivePagerCommit({ from: "user", dx: -40, width: 400, vx: 0 }),
      "user",
    );
    assert.equal(perspectivePagerTranslatePx("user", 80, 400), 0);
    let state = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    state = applyScreen2Perspective(state, resolvePerspectivePagerCommit({
      from: state.viewingPerspective,
      dx: -200,
      width: 400,
      vx: 0,
    }));
    assert.equal(state.intent, "user");
    assert.equal(state.viewingPerspective, "artist");
    assert.equal(resolveSignupAccountType(state.intent), "user");
  });

  it("staggers features 1 through 6 deterministically and skips motion under reduce", () => {
    assert.equal(featureStaggerDelayMs(0), PRE_LOGIN_STAGGER_INITIAL_DELAY_MS);
    assert.equal(featureStaggerDelayMs(1), PRE_LOGIN_STAGGER_INITIAL_DELAY_MS + PRE_LOGIN_STAGGER_STEP_MS);
    assert.equal(featureStaggerDelayMs(5), PRE_LOGIN_STAGGER_INITIAL_DELAY_MS + PRE_LOGIN_STAGGER_STEP_MS * 5);
    assert.ok(PRE_LOGIN_STAGGER_DURATION_MS >= 650 && PRE_LOGIN_STAGGER_DURATION_MS <= 800);
    assert.ok(PRE_LOGIN_STAGGER_STEP_MS >= 220 && PRE_LOGIN_STAGGER_STEP_MS <= 280);
    assert.ok(PRE_LOGIN_STAGGER_TRANSLATE_PX >= 6 && PRE_LOGIN_STAGGER_TRANSLATE_PX <= 8);
    assert.match(componentSrc, /data-stagger-slot=\{index \+ 1\}/);
    assert.match(PRE_LOGIN_STAGGER_ITEM_CLASS, /motion-reduce:transition-none/);
    assert.match(PRE_LOGIN_PAGER_SNAP_CLASS, /motion-reduce:transition-none/);
    assert.doesNotMatch(componentSrc, /framer-motion|drag|swipe|onPan|spring|bounce/);
  });

  it("does not change auth, routing, seen, or signup behaviour", () => {
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
    assert.match(signUpSrc, /account_type: accountType/);
  });
});

describe("pre-login onboarding slice 6 layout and reveal polish", () => {
  it("moves the Screen 1 proposition toward identities without raising the thumb zone", () => {
    const screen1 = componentSrc.slice(
      componentSrc.indexOf("function Screen1("),
      componentSrc.indexOf("function PerspectiveSwitcher("),
    );
    const top = screen1.indexOf("pre-login-screen-1-top");
    const heading = screen1.indexOf("{copy.screen1.heading}");
    const middle = screen1.indexOf("pre-login-screen-1-middle");
    const journey = screen1.indexOf("pre-login-product-journey");
    const identities = screen1.indexOf("pre-login-identity-region");
    const bottom = screen1.indexOf("pre-login-screen-1-bottom");
    assert.ok(
      top >= 0 &&
        heading > top &&
        middle > heading &&
        journey > middle &&
        bottom > journey &&
        identities > bottom,
    );
    assert.match(PRE_LOGIN_SCREEN_1_TOP_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_1_BOTTOM_CLASS, /shrink-0/);
    assert.doesNotMatch(screen1, /content-center/);
  });

  it("uses compact status samples instead of the narrow icon box", () => {
    const pill = componentSrc.slice(
      componentSrc.indexOf("MINI_STATUS_PILL_CLASS"),
      componentSrc.indexOf("MINI_GENRE_PILL_CLASS"),
    );
    assert.match(pill, /whitespace-nowrap/);
    assert.match(pill, /text-\[10px\]/);
    assert.match(pill, /leading-snug/);
    assert.match(pill, /py-1/);
    assert.doesNotMatch(pill, /max-w-\[2\.75rem\]|w-\[2\.75rem\]|h-6 w-6|scale-90|leading-none/);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /grid-cols-\[7rem_minmax\(0,1fr\)\]/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_VISUAL_COL_CLASS, /w-\[2\.75rem\]/);
    assert.match(componentSrc, /data-compact-status-sample/);
  });

  it("keeps Identified and Unidentified labels inside their visual bounds", () => {
    assert.match(componentSrc, /onboarding-mini-unidentified/);
    assert.match(componentSrc, /onboarding-mini-identified/);
    assert.match(componentSrc, /whitespace-nowrap/);
    const pillFn = componentSrc.slice(
      componentSrc.indexOf("function OnboardingStatusPill"),
      componentSrc.indexOf("function OnboardingGenrePills"),
    );
    assert.match(pillFn, /Unidentified/);
    assert.match(pillFn, /Identified/);
    assert.doesNotMatch(pillFn, /overflow-hidden/);
    assert.doesNotMatch(pillFn, /scale-90/);
  });

  it("uses canonical DnB and UKG styling for the genre sample", () => {
    assert.match(componentSrc, /getGenreChipStyle\("dnb"\)/);
    assert.match(componentSrc, /getGenreChipStyle\("ukg"\)/);
    assert.match(componentSrc, /getGenreChipStyle\("house"\)/);
    assert.match(componentSrc, /onboarding-mini-genre-pills/);
    assert.match(genreStylesSrc, /id: "dnb", label: "DnB"/);
    assert.match(genreStylesSrc, /id: "ukg", label: "UKG"/);
    assert.match(genreStylesSrc, /id: "house", label: "House"/);
    const genreFn = componentSrc.slice(
      componentSrc.indexOf("function OnboardingGenrePills"),
      componentSrc.indexOf("function BenefitVisual"),
    );
    assert.doesNotMatch(genreFn, /max-w-\[2\.75rem\]|w-\[2\.75rem\]/);
  });

  it("keeps a single stable feature text-column origin", () => {
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /grid-cols-\[7rem_minmax\(0,1fr\)\]/);
    assert.match(PRE_LOGIN_FEATURE_TEXT_COL_CLASS, /text-left/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /flex-col items-center|text-center/);
    assert.match(componentSrc, /PRE_LOGIN_FEATURE_TEXT_COL_CLASS/);
    assert.match(componentSrc, /pre-login-feature-text/);
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits.length, 6);
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.length, 6);
  });

  it("gives Community and Artist exactly six matched rows", () => {
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits.length, 6);
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.length, 6);
    assert.match(componentSrc, /pre-login-feature-list-\$\{side\}/);
  });

  it("keeps the Artist username hook out of the six core feature rows", () => {
    const row5 = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits[4];
    assert.equal(row5.title, "Climb the Artist Leaderboard");
    assert.notEqual(row5.title, PRE_LOGIN_ONBOARDING_COPY.screen2.artistHookTitle);
    assert.doesNotMatch(
      JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits),
      /might already be waiting/,
    );
    assert.doesNotMatch(componentSrc, /pre-login-artist-hook|pre-login-hook-slot|pre-login-product-journey-hook/);
  });

  it("uses exactly one Artist Tools row with a gold sleeve-and-record mark", () => {
    const tools = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.filter(
      (item) => item.visual === "artistTools" || item.title === PRE_LOGIN_ARTIST_TOOLS_LABEL,
    );
    assert.equal(tools.length, 1);
    assert.equal(tools[0].title, "Artist Tools");
    assert.equal((componentSrc.match(/<ArtistToolsMark/g) ?? []).length, 1);
    assert.doesNotMatch(artistToolsMarkSrc, /#4ae9df|turquoise|#4AE9DF/i);
    assert.match(artistToolsMarkSrc, /data-artist-tools-sleeve/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-record/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-wrench/);
    assert.match(artistToolsMarkSrc, /Disc3/);
    assert.match(artistToolsMarkSrc, /Wrench/);
    assert.doesNotMatch(componentSrc, /PREMIUM|lock icon|pricing/i);
  });

  it("keeps paid markers off core Artist rows", () => {
    const free = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.slice(0, 5);
    assert.equal(free.every((item) => item.visual !== "artistTools"), true);
    assert.equal(free.every((item) => !("toolLabel" in item)), true);
    assert.doesNotMatch(JSON.stringify(free), /Artist Tools|PREMIUM/);
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits[5].visual, "artistTools");
  });

  it("places the CTA after the feature frame instead of pinning it to empty bottom space", () => {
    const screen2 = componentSrc.slice(componentSrc.indexOf("function Screen2("));
    const pagerEnd = screen2.indexOf("</div>", screen2.indexOf('data-testid="pre-login-perspective-pager"'));
    const cta = screen2.indexOf('data-testid="pre-login-screen-2-cta"');
    const getStarted = screen2.indexOf('data-testid="button-onboarding-get-started"');
    assert.ok(cta > pagerEnd && getStarted > cta);
    const ctaBlock = screen2.slice(cta, cta + 420);
    assert.doesNotMatch(ctaBlock, /mt-auto|flex-1 justify-end|bottom-0|fixed/);
    assert.doesNotMatch(ctaBlock, /PRE_LOGIN_STAGGER_ITEM_CLASS|data-stagger-slot/);
  });

  it("records Community and Artist reveals locally and does not replay them", () => {
    let played = { ...INITIAL_PRE_LOGIN_REVEAL_PLAYED };
    assert.equal(shouldAnimatePerspectiveReveal(played, "user", false), true);
    assert.equal(shouldAnimatePerspectiveReveal(played, "artist", false), true);
    played = markPerspectiveRevealed(played, "user");
    assert.equal(shouldAnimatePerspectiveReveal(played, "user", false), false);
    assert.equal(shouldAnimatePerspectiveReveal(played, "artist", false), true);
    played = markPerspectiveRevealed(played, "artist");
    assert.equal(shouldAnimatePerspectiveReveal(played, "user", false), false);
    assert.equal(shouldAnimatePerspectiveReveal(played, "artist", false), false);
    assert.match(componentSrc, /shouldAnimatePerspectiveReveal/);
    assert.match(componentSrc, /markPerspectiveRevealed/);
    assert.match(componentSrc, /playedRef/);
    assert.doesNotMatch(componentSrc, /localStorage\.setItem|sessionStorage\.setItem/);
    assert.doesNotMatch(helperSrc, /PRE_LOGIN_ONBOARDING_SEEN_KEY.*reveal|reveal.*localStorage/);
  });

  it("skips sequential reveal under reduced motion", () => {
    assert.equal(
      shouldAnimatePerspectiveReveal(INITIAL_PRE_LOGIN_REVEAL_PLAYED, "user", true),
      false,
    );
    assert.equal(
      shouldAnimatePerspectiveReveal(INITIAL_PRE_LOGIN_REVEAL_PLAYED, "artist", true),
      false,
    );
    assert.match(componentSrc, /prefersReducedMotion\(\)/);
    assert.match(componentSrc, /user: true, artist: true/);
    assert.match(PRE_LOGIN_STAGGER_ITEM_CLASS, /motion-reduce:opacity-100/);
  });

  it("keeps direct pager pan without mutating signup intent", () => {
    assert.match(componentSrc, /onPointerDown/);
    assert.match(componentSrc, /resolvePerspectivePagerCommit/);
    assert.match(componentSrc, /perspectivePagerTranslatePx/);
    assert.doesNotMatch(componentSrc, /framer-motion|drag|swipe|onPan/);
    let state = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    state = applyScreen2Perspective(state, resolvePerspectivePagerCommit({
      from: state.viewingPerspective,
      dx: -200,
      width: 400,
      vx: 0,
    }));
    assert.equal(state.intent, "user");
    assert.equal(state.viewingPerspective, "artist");
    assert.equal(resolveSignupAccountType(state.intent), "user");
  });

  it("does not change auth, routing, or seen-state semantics", () => {
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
    assert.match(signUpSrc, /account_type: accountType/);
    assert.match(authPageSrc, /initialAccountType=\{initialAccountType\}/);
  });
});

describe("pre-login onboarding slice 7 story and motion polish", () => {
  it("replaces the Screen 1 paragraph with a three-step vertical product journey", () => {
    assert.equal("supporting" in PRE_LOGIN_ONBOARDING_COPY.screen1, false);
    assert.doesNotMatch(
      JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen1),
      /Identify tracks from sets, events and mixes, save the ones you love/,
    );
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyHear, "Hear it in a set");
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyFind, "Find it on dub hub");
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyFollow, "Follow it through to release");
    assert.match(componentSrc, /pre-login-product-journey/);
    assert.match(componentSrc, /copy\.screen1\.journeyHear/);
    assert.match(componentSrc, /copy\.screen1\.journeyFind/);
    assert.match(componentSrc, /copy\.screen1\.journeyFollow/);
  });

  it("treats Screen 1 journey arrows as decorative", () => {
    assert.match(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /h-\[3\.25rem\]/);
    assert.match(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /items-center/);
    assert.match(PRE_LOGIN_JOURNEY_STEP_CLASS, /text-\[15px\] font-semibold/);
    const connector = componentSrc.slice(
      componentSrc.indexOf("function JourneyConnector"),
      componentSrc.indexOf("function Screen1"),
    );
    assert.match(connector, /aria-hidden/);
    assert.equal((componentSrc.match(/<JourneyConnector/g) ?? []).length, 2);
    assert.doesNotMatch(connector, /border-dashed|border-dotted|border-spacing/);
    assert.doesNotMatch(connector, /flowchart|text-4xl|h-10 w-10/);
  });

  it("keeps identities in the lower thumb-friendly Screen 1 region", () => {
    assert.match(PRE_LOGIN_SCREEN_1_BOTTOM_CLASS, /shrink-0/);
    assert.match(componentSrc, /pre-login-identity-region/);
    assert.match(componentSrc, /pre-login-screen-1-bottom/);
    assert.doesNotMatch(componentSrc, /content-center/);
  });

  it("lays out DnB and UKG on row 1 with House centred on row 2", () => {
    const genreFn = componentSrc.slice(
      componentSrc.indexOf("function OnboardingGenrePills"),
      componentSrc.indexOf("function BenefitVisual"),
    );
    const row1 = genreFn.slice(
      genreFn.indexOf("onboarding-mini-genre-row-1"),
      genreFn.indexOf("onboarding-mini-genre-row-2"),
    );
    const row2 = genreFn.slice(genreFn.indexOf("onboarding-mini-genre-row-2"));
    assert.match(row1, /dnb\.label/);
    assert.match(row1, /ukg\.label/);
    assert.doesNotMatch(row1, /house\.label/);
    assert.match(row2, /house\.label/);
    assert.doesNotMatch(row2, /dnb\.label|ukg\.label/);
    assert.match(genreFn, /flex-col items-center/);
    assert.match(genreStylesSrc, /bgColor: "#8f57b3"/);
    assert.match(genreStylesSrc, /bgColor: "#77c961"/);
    assert.match(genreStylesSrc, /bgColor: "#fdb436"/);
  });

  it("slows sequential reveal past the previous 320ms / 130ms timing", () => {
    assert.ok(PRE_LOGIN_STAGGER_DURATION_MS > 320);
    assert.ok(PRE_LOGIN_STAGGER_DURATION_MS >= 650 && PRE_LOGIN_STAGGER_DURATION_MS <= 800);
    assert.ok(PRE_LOGIN_STAGGER_STEP_MS > 130);
    assert.ok(PRE_LOGIN_STAGGER_STEP_MS >= 220 && PRE_LOGIN_STAGGER_STEP_MS <= 280);
    assert.ok(PRE_LOGIN_STAGGER_TRANSLATE_PX >= 6 && PRE_LOGIN_STAGGER_TRANSLATE_PX <= 8);
    assert.doesNotMatch(PRE_LOGIN_STAGGER_ITEM_CLASS, /duration-\[/);
    assert.doesNotMatch(PRE_LOGIN_STAGGER_ITEM_CLASS, /spring|bounce|blur|scale/);
    const cta = componentSrc.slice(
      componentSrc.indexOf('data-testid="pre-login-screen-2-cta"'),
      componentSrc.indexOf('data-testid="button-onboarding-get-started"') + 80,
    );
    assert.doesNotMatch(cta, /PRE_LOGIN_STAGGER_ITEM_CLASS|data-stagger-slot/);
  });

  it("still reveals each perspective only once and skips stagger under reduced motion", () => {
    let played = { ...INITIAL_PRE_LOGIN_REVEAL_PLAYED };
    assert.equal(shouldAnimatePerspectiveReveal(played, "user", false), true);
    played = markPerspectiveRevealed(played, "user");
    assert.equal(shouldAnimatePerspectiveReveal(played, "user", false), false);
    assert.equal(shouldAnimatePerspectiveReveal(played, "artist", false), true);
    played = markPerspectiveRevealed(played, "artist");
    assert.equal(shouldAnimatePerspectiveReveal(played, "artist", false), false);
    assert.equal(shouldAnimatePerspectiveReveal(INITIAL_PRE_LOGIN_REVEAL_PLAYED, "user", true), false);
    assert.match(componentSrc, /playedRef/);
    assert.doesNotMatch(componentSrc, /localStorage\.setItem|sessionStorage\.setItem/);
  });

  it("uses audited Artist Leaderboard reputation for row 5 instead of the username hook", () => {
    const benefits = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits;
    assert.equal(benefits.length, 6);
    assert.equal(benefits[4].title, "Climb the Artist Leaderboard");
    assert.equal(benefits[4].visual, "leaderboard");
    assert.match(benefits[4].body, /earn artist rewards/);
    assert.match(benefits[4].body, /Contribute to the community/);
    assert.equal(benefits[5].title, PRE_LOGIN_ARTIST_TOOLS_LABEL);
    assert.equal(benefits[5].visual, "artistTools");
    assert.match(leaderboardSrc, /\/api\/leaderboard\/artists/);
    assert.match(leaderboardSrc, /data-testid="tab-artists"/);
    assert.match(karmaSrc, /Recipient.*=.*comment author/);
    assert.doesNotMatch(componentSrc, /pre-login-artist-hook/);
  });

  it("uses a gold sleeve-and-record Artist Tools mark", () => {
    assert.match(artistToolsMarkSrc, /text-\[#c9a227\]/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-sleeve/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-record/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-wrench/);
    assert.match(artistToolsMarkSrc, /Disc3/);
    assert.match(artistToolsMarkSrc, /Wrench/);
    assert.doesNotMatch(artistToolsMarkSrc, /#4ae9df|turquoise/);
    assert.equal((componentSrc.match(/<ArtistToolsMark/g) ?? []).length, 1);
  });

  it("keeps direct drag, CTA placement, and auth routing frozen", () => {
    assert.match(componentSrc, /onPointerDown/);
    assert.match(componentSrc, /resolvePerspectivePagerCommit/);
    assert.doesNotMatch(componentSrc, /framer-motion|drag|swipe|onPan/);
    const screen2 = componentSrc.slice(componentSrc.indexOf("function Screen2("));
    const cta = screen2.indexOf('data-testid="pre-login-screen-2-cta"');
    const getStarted = screen2.indexOf('data-testid="button-onboarding-get-started"');
    assert.ok(cta >= 0 && getStarted > cta);
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
  });
});

describe("pre-login onboarding slice 8 composition and motion polish", () => {
  it("uses distinct Screen 1 top, middle, and bottom layout zones", () => {
    const screen1 = componentSrc.slice(
      componentSrc.indexOf("function Screen1("),
      componentSrc.indexOf("function PerspectiveSwitcher("),
    );
    const top = screen1.indexOf("pre-login-screen-1-top");
    const middle = screen1.indexOf("pre-login-screen-1-middle");
    const journey = screen1.indexOf("pre-login-product-journey");
    const bottom = screen1.indexOf("pre-login-screen-1-bottom");
    const identities = screen1.indexOf("pre-login-identity-region");
    assert.ok(top >= 0 && middle > top && journey > middle && bottom > journey && identities > bottom);
    assert.match(PRE_LOGIN_SCREEN_1_TOP_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /shrink-0/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /justify-center/);
    assert.match(PRE_LOGIN_SCREEN_1_BOTTOM_CLASS, /shrink-0/);
  });

  it("uses a compact two-column feature frame with a 7rem visual slot", () => {
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /grid-cols-\[7rem_minmax\(0,1fr\)\]/);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /items-start/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /items-center/);
    assert.match(PRE_LOGIN_FEATURE_VISUAL_COL_CLASS, /items-center/);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /gap-x-3/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /flex-col items-center|text-center/);
    assert.match(PRE_LOGIN_FEATURE_TEXT_COL_CLASS, /text-left/);
    assert.match(PRE_LOGIN_FEATURE_VISUAL_COL_CLASS, /justify-center/);
    assert.match(componentSrc, /PRE_LOGIN_FEATURE_VISUAL_COL_CLASS/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /border|bg-card|rounded-xl/);
  });

  it("keeps six matched feature slots plus a shared closing callout geometry", () => {
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits.length, 6);
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits.length, 6);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /gap-y-1/);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /shrink-0/);
    assert.doesNotMatch(PRE_LOGIN_CALLOUT_CLASS, /min-h-/);
    assert.match(PRE_LOGIN_CALLOUT_CLASS, /text-left/);
    assert.equal(PRE_LOGIN_CALLOUT_TITLE_CLASS, PRE_LOGIN_CALLOUT_TITLE_CLASS);
    assert.match(componentSrc, /pre-login-closing-callout-\$\{side\}/);
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.communityCalloutTitle,
      "Your next ID might already be here.",
    );
    assert.match(PRE_LOGIN_ONBOARDING_COPY.screen2.communityCalloutBody, /Join the community/);
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistHookTitle,
      "Your artist name may already be waiting.",
    );
    assert.doesNotMatch(
      JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits),
      /may already be waiting/,
    );
  });

  it("places the CTA after the callout, outside the feature stagger", () => {
    const screen2 = componentSrc.slice(componentSrc.indexOf("function Screen2("));
    const pager = screen2.indexOf('data-testid="pre-login-perspective-pager"');
    const cta = screen2.indexOf('data-testid="pre-login-screen-2-cta"');
    assert.ok(pager >= 0 && cta > pager);
    assert.match(componentSrc, /pre-login-closing-callout-\$\{side\}/);
    assert.match(screen2, /communityCalloutTitle/);
    assert.match(PRE_LOGIN_SCREEN_2_CTA_CLASS, /shrink-0/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_2_CTA_CLASS, /absolute|fixed|bottom-0/);
    const ctaBlock = screen2.slice(cta, cta + 360);
    assert.doesNotMatch(ctaBlock, /PRE_LOGIN_STAGGER_ITEM_CLASS|data-stagger-slot/);
  });

  it("uses a slower sequential reveal that still plays once per perspective", () => {
    assert.ok(PRE_LOGIN_STAGGER_DURATION_MS >= 650);
    assert.ok(PRE_LOGIN_STAGGER_STEP_MS >= 220);
    assert.ok(PRE_LOGIN_STAGGER_TRANSLATE_PX >= 6 && PRE_LOGIN_STAGGER_TRANSLATE_PX <= 8);
    let played = { ...INITIAL_PRE_LOGIN_REVEAL_PLAYED };
    assert.equal(shouldAnimatePerspectiveReveal(played, "user", false), true);
    played = markPerspectiveRevealed(played, "user");
    assert.equal(shouldAnimatePerspectiveReveal(played, "user", false), false);
    assert.equal(shouldAnimatePerspectiveReveal(played, "artist", false), true);
    played = markPerspectiveRevealed(played, "artist");
    assert.equal(shouldAnimatePerspectiveReveal(played, "artist", false), false);
    assert.equal(shouldAnimatePerspectiveReveal(INITIAL_PRE_LOGIN_REVEAL_PLAYED, "user", true), false);
  });

  it("uses a gold-only sleeve, protruding record, and wrench Artist Tools mark", () => {
    assert.match(artistToolsMarkSrc, /data-artist-tools-sleeve/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-record/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-wrench/);
    assert.match(artistToolsMarkSrc, /Disc3/);
    assert.match(artistToolsMarkSrc, /Wrench/);
    assert.match(artistToolsMarkSrc, /h-7 w-8/);
    assert.match(artistToolsMarkSrc, /text-\[#c9a227\]/);
    assert.match(artistToolsMarkSrc, /text-white/);
    assert.doesNotMatch(artistToolsMarkSrc, /#4ae9df|turquoise/i);
    assert.equal((componentSrc.match(/<ArtistToolsMark/g) ?? []).length, 1);
  });

  it("keeps direct pan, signup intent, and auth routing frozen", () => {
    assert.match(componentSrc, /onPointerDown/);
    assert.match(componentSrc, /resolvePerspectivePagerCommit/);
    assert.doesNotMatch(componentSrc, /framer-motion|drag|swipe|onPan/);
    let state = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    state = applyScreen2Perspective(state, "artist");
    assert.equal(state.intent, "user");
    assert.equal(resolveSignupAccountType(state.intent), "user");
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
  });
});

describe("pre-login onboarding slice 9 corrective layout and motion", () => {
  it("keeps Screen 1 three-zone structure and enlarges journey type", () => {
    const screen1 = componentSrc.slice(
      componentSrc.indexOf("function Screen1("),
      componentSrc.indexOf("function PerspectiveSwitcher("),
    );
    const top = screen1.indexOf("pre-login-screen-1-top");
    const middle = screen1.indexOf("pre-login-screen-1-middle");
    const journey = screen1.indexOf("pre-login-product-journey");
    const bottom = screen1.indexOf("pre-login-screen-1-bottom");
    const identities = screen1.indexOf("pre-login-identity-region");
    assert.ok(top >= 0 && middle > top && journey > middle && bottom > journey && identities > bottom);
    assert.match(PRE_LOGIN_SCREEN_1_TOP_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /shrink-0/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /justify-center/);
    assert.match(PRE_LOGIN_SCREEN_1_BOTTOM_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_JOURNEY_STEP_CLASS, /text-\[15px\] font-semibold leading-snug/);
    assert.doesNotMatch(PRE_LOGIN_JOURNEY_STEP_CLASS, /text-2xl|text-xl /);
    assert.match(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /h-\[3\.25rem\]/);
    assert.match(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /text-white\/40/);
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyHear, "Hear it in a set");
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyFind, "Find it on dub hub");
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyFollow, "Follow it through to release");
  });

  it("restores a 7rem two-column feature frame with left-aligned text", () => {
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /grid-cols-\[7rem_minmax\(0,1fr\)\]/);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /items-start/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /items-center/);
    assert.match(PRE_LOGIN_FEATURE_VISUAL_COL_CLASS, /items-center/);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /gap-x-3/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /flex-col|text-center/);
    assert.match(PRE_LOGIN_FEATURE_VISUAL_COL_CLASS, /justify-center/);
    assert.match(PRE_LOGIN_FEATURE_TEXT_COL_CLASS, /text-left/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /border|bg-card|rounded-xl/);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /gap-y-1/);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /shrink-0/);
  });

  it("keeps the current six Community and six Artist feature slots", () => {
    const community = PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits;
    const artist = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits;
    assert.equal(community.length, 6);
    assert.equal(artist.length, 6);
    assert.deepEqual(
      community.map((item) => item.title),
      [
        "ID the tracks you're looking for",
        "Find your sound",
        "Save the tracks you love",
        "Follow them through to release",
        "Get notified when tracks finally drop",
        "Climb the Leaderboard. Earn rewards.",
      ],
    );
    assert.deepEqual(
      artist.map((item) => item.title),
      [
        "Discover where your music is played",
        "Confirm your tracks",
        "Connect clips to your releases",
        "Notify the people already waiting",
        "Climb the Artist Leaderboard",
        PRE_LOGIN_ARTIST_TOOLS_LABEL,
      ],
    );
    assert.match(artist[5].body, /Release Alert delivery/);
    assert.doesNotMatch(JSON.stringify(artist), /analytics|boosts|pre-save|visibility advantage/i);
  });

  it("keeps closing callouts compact, left-aligned, and outside the feature list", () => {
    assert.match(PRE_LOGIN_CALLOUT_CLASS, /text-left/);
    assert.doesNotMatch(PRE_LOGIN_CALLOUT_CLASS, /min-h-/);
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.communityCalloutTitle,
      "Your next ID might already be here.",
    );
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistHookTitle,
      "Your artist name may already be waiting.",
    );
    assert.doesNotMatch(
      JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits),
      /might already be here/,
    );
    assert.doesNotMatch(
      JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits),
      /may already be waiting/,
    );
    assert.match(componentSrc, /pre-login-closing-callout-\$\{side\}/);
  });

  it("uses compact onboarding status and genre samples without scale transforms", () => {
    const status = componentSrc.slice(
      componentSrc.indexOf("MINI_STATUS_PILL_CLASS"),
      componentSrc.indexOf("MINI_GENRE_PILL_CLASS"),
    );
    assert.match(status, /text-\[10px\]/);
    assert.match(status, /leading-snug/);
    assert.match(status, /py-1/);
    assert.match(status, /items-center/);
    assert.doesNotMatch(status, /scale-90|leading-none|py-0\.5/);
    assert.match(componentSrc, /h-3 w-3/);
    const genreFn = componentSrc.slice(
      componentSrc.indexOf("function OnboardingGenrePills"),
      componentSrc.indexOf("function BenefitVisual"),
    );
    assert.match(genreFn, /getGenreChipStyle\("dnb"\)/);
    assert.match(genreFn, /getGenreChipStyle\("ukg"\)/);
    assert.match(genreFn, /getGenreChipStyle\("house"\)/);
    assert.match(genreFn, /onboarding-mini-genre-row-1/);
    assert.match(genreFn, /onboarding-mini-genre-row-2/);
    assert.doesNotMatch(genreFn, /scale-90/);
    assert.doesNotMatch(videoCardSrc, /MINI_STATUS_PILL_CLASS|onboarding-mini-unidentified/);
  });

  it("ships a deterministic 700ms opacity fade that Tailwind cannot drop", () => {
    assert.equal(PRE_LOGIN_STAGGER_DURATION_MS, 700);
    assert.equal(PRE_LOGIN_STAGGER_INITIAL_DELAY_MS, 100);
    assert.ok(PRE_LOGIN_STAGGER_STEP_MS >= 250 && PRE_LOGIN_STAGGER_STEP_MS <= 280);
    assert.equal(PRE_LOGIN_STAGGER_TRANSLATE_PX, 6);
    assert.equal(PRE_LOGIN_STAGGER_EASING, "cubic-bezier(0.25, 0.1, 0.25, 1)");
    const hidden = preLoginFeatureRevealStyle(false, 0);
    const shown = preLoginFeatureRevealStyle(true, 0);
    const second = preLoginFeatureRevealStyle(true, 1);
    assert.equal(hidden.opacity, 0);
    assert.equal(shown.opacity, 1);
    assert.equal(hidden.transitionDuration, "700ms");
    assert.equal(shown.transitionDuration, "700ms");
    assert.equal(hidden.transitionProperty, "opacity, transform");
    assert.equal(shown.transitionTimingFunction, PRE_LOGIN_STAGGER_EASING);
    assert.equal(hidden.transitionDelay, "0ms");
    assert.equal(shown.transitionDelay, "100ms");
    assert.equal(second.transitionDelay, "360ms");
    assert.match(hidden.transform, /translateY\(6px\)/);
    assert.equal(shown.transform, "translateY(0)");
    assert.match(componentSrc, /preLoginFeatureRevealStyle\(staggerReady, index\)/);
    assert.doesNotMatch(helperSrc, /duration-\[/);
    assert.doesNotMatch(PRE_LOGIN_STAGGER_ITEM_CLASS, /duration-\[/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /duration-\[/);
    assert.match(PRE_LOGIN_SCREEN_TRANSITION_CLASS, /duration-200/);
  });

  it("preserves reveal-once and reduced-motion behaviour", () => {
    let played = { ...INITIAL_PRE_LOGIN_REVEAL_PLAYED };
    assert.equal(shouldAnimatePerspectiveReveal(played, "user", false), true);
    played = markPerspectiveRevealed(played, "user");
    assert.equal(shouldAnimatePerspectiveReveal(played, "user", false), false);
    assert.equal(shouldAnimatePerspectiveReveal(played, "artist", false), true);
    played = markPerspectiveRevealed(played, "artist");
    assert.equal(shouldAnimatePerspectiveReveal(played, "artist", false), false);
    assert.equal(shouldAnimatePerspectiveReveal(INITIAL_PRE_LOGIN_REVEAL_PLAYED, "user", true), false);
    assert.match(componentSrc, /playedRef/);
    assert.match(componentSrc, /requestAnimationFrame/);
    assert.match(PRE_LOGIN_STAGGER_ITEM_CLASS, /motion-reduce:opacity-100/);
    assert.doesNotMatch(componentSrc, /localStorage\.setItem|sessionStorage\.setItem/);
  });

  it("rebuilds Artist Tools from Disc3, a filled gold sleeve, and a white wrench", () => {
    assert.match(artistToolsMarkSrc, /from "lucide-react"/);
    assert.match(artistToolsMarkSrc, /Disc3/);
    assert.match(artistToolsMarkSrc, /Wrench/);
    assert.match(artistToolsMarkSrc, /bg-\[#c9a227\]/);
    assert.match(artistToolsMarkSrc, /text-\[#c9a227\]/);
    assert.match(artistToolsMarkSrc, /text-white/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-sleeve/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-record/);
    assert.match(artistToolsMarkSrc, /data-artist-tools-wrench/);
    assert.doesNotMatch(artistToolsMarkSrc, /clipPath|#4ae9df|turquoise/i);
    assert.equal((componentSrc.match(/<ArtistToolsMark/g) ?? []).length, 1);
  });

  it("does not change auth, routing, or seen-state semantics", () => {
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
    assert.match(signUpSrc, /account_type: accountType/);
    assert.match(authPageSrc, /initialAccountType=\{initialAccountType\}/);
    assert.doesNotMatch(componentSrc, /framer-motion|drag|swipe|onPan|spring|bounce/);
  });
});

describe("pre-login onboarding slice 10 spacing and reveal polish", () => {
  it("keeps Screen 1 top/middle/bottom structure with a slightly lower headline", () => {
    const screen1 = componentSrc.slice(
      componentSrc.indexOf("function Screen1("),
      componentSrc.indexOf("function PerspectiveSwitcher("),
    );
    const top = screen1.indexOf("pre-login-screen-1-top");
    const middle = screen1.indexOf("pre-login-screen-1-middle");
    const journey = screen1.indexOf("pre-login-product-journey");
    const bottom = screen1.indexOf("pre-login-screen-1-bottom");
    const identities = screen1.indexOf("pre-login-identity-region");
    assert.ok(top >= 0 && middle > top && journey > middle && bottom > journey && identities > bottom);
    assert.match(PRE_LOGIN_SCREEN_1_TOP_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_1_TOP_CLASS, /pt-3/);
    assert.match(PRE_LOGIN_SCREEN_1_HEADLINE_CLASS, /mt-2\.5/);
    assert.match(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /mt-7/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /flex-1|justify-center/);
    assert.match(PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS, /mt-7/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_1_BOTTOM_CLASS, /-mt-/);
  });

  it("moves identities slightly up without leaving the lower thumb zone", () => {
    assert.match(PRE_LOGIN_SCREEN_1_BOTTOM_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_1_BOTTOM_CLASS, /pb-2/);
    assert.match(componentSrc, /pre-login-identity-region/);
    assert.match(componentSrc, /pre-login-screen-1-bottom/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_1_BOTTOM_CLASS, /flex-1|justify-center/);
  });

  it("matches journey type to identity headings instead of Slice 9 text-xl", () => {
    assert.match(PRE_LOGIN_JOURNEY_STEP_CLASS, /text-\[15px\] font-semibold/);
    assert.match(PRE_LOGIN_IDENTITY_LABEL_CLASS, /text-\[15px\] font-semibold/);
    assert.doesNotMatch(PRE_LOGIN_JOURNEY_STEP_CLASS, /text-xl|text-2xl/);
    assert.match(componentSrc, /text-2xl font-bold/);
  });

  it("restores the previous ↓ journey arrow while keeping Slice 10 height", () => {
    assert.equal(PRE_LOGIN_JOURNEY_ARROW_CLASS, PRE_LOGIN_JOURNEY_CONNECTOR_CLASS);
    assert.match(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /h-\[3\.25rem\]/);
    assert.match(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /text-base leading-none text-white\/40/);
    assert.doesNotMatch(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /w-px|dashed|dotted|bg-white/);
    assert.match(componentSrc, /JourneyConnector/);
    assert.doesNotMatch(helperSrc, /border-dashed|border-dotted/);
    const connector = componentSrc.slice(
      componentSrc.indexOf("function JourneyConnector"),
      componentSrc.indexOf("function Screen1"),
    );
    assert.match(connector, /aria-hidden/);
    assert.match(connector, /↓/);
    assert.doesNotMatch(connector, /ChevronDown|w-px|bg-white/);
  });

  it("adds a one-time Screen 1 opacity reveal that respects reduced motion", () => {
    assert.ok(PRE_LOGIN_SCREEN_1_REVEAL_DURATION_MS >= 500);
    assert.ok(PRE_LOGIN_SCREEN_1_REVEAL_DURATION_MS <= 650);
    assert.ok(PRE_LOGIN_SCREEN_1_REVEAL_STEP_MS >= 180);
    assert.ok(PRE_LOGIN_SCREEN_1_REVEAL_STEP_MS <= 260);
    assert.ok(PRE_LOGIN_SCREEN_1_REVEAL_TRANSLATE_PX <= 6);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.logo, 0);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.headline, 1);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.stage1, 2);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.stage2, 4);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.stage3, 6);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.selectionInstruction, 7);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.identities, 8);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.signIn, 9);
    const hidden = preLoginScreen1RevealStyle(false, 0);
    const shown = preLoginScreen1RevealStyle(true, 0);
    assert.equal(hidden.opacity, 0);
    assert.equal(shown.opacity, 1);
    assert.equal(hidden.transitionDuration, "550ms");
    assert.equal(hidden.transitionProperty, "opacity, transform");
    assert.match(componentSrc, /preLoginScreen1RevealStyle/);
    assert.match(componentSrc, /screen1PlayedRef/);
    assert.match(componentSrc, /screen1RevealReady/);
    assert.doesNotMatch(helperSrc, /duration-\[/);
  });

  it("keeps Screen 2 as a matched two-column frame with explicit vertical rhythm", () => {
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /grid-cols-\[7rem_minmax\(0,1fr\)\]/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /flex-col|text-center/);
    assert.match(PRE_LOGIN_BRAND_ANCHOR_CLASS, /mb-4/);
    assert.match(PRE_LOGIN_PERSPECTIVE_SWITCHER_CLASS, /mb-2/);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /mt-1/);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /gap-y-1/);
    assert.match(PRE_LOGIN_CALLOUT_CLASS, /mt-1/);
    assert.match(PRE_LOGIN_SCREEN_2_CTA_CLASS, /pt-2\.5/);
    assert.match(PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS, /mt-1/);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS/);
  });

  it("matches Community and Artist selector and heading geometry", () => {
    assert.match(PRE_LOGIN_PERSPECTIVE_SWITCHER_CLASS, /h-\[4\.5rem\]/);
    assert.match(PRE_LOGIN_PERSPECTIVE_SWITCHER_CLASS, /items-center/);
    assert.match(PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS, /h-\[4\.5rem\]/);
    assert.equal(
      (componentSrc.slice(componentSrc.indexOf("function PerspectiveSwitcher(")).match(/PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS/g) ?? []).length,
      2,
    );
    assert.match(PRE_LOGIN_HEADING_BLOCK_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_HEADING_BLOCK_CLASS, /min-h-\[3\.25rem\]/);
    assert.doesNotMatch(PRE_LOGIN_STRAPLINE_CLASS, /min-h-/);
    assert.ok(PRE_LOGIN_FEATURE_LIST_CLASS.startsWith(PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS));
    assert.ok(PRE_LOGIN_CALLOUT_CLASS.startsWith(PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS));
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /repeat\(6,4\.25rem\)/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_LIST_CLASS, /minmax\(3\.75rem,1fr\)/);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /h-full min-h-0/);
  });

  it("uses natural body height without min-height clamp on feature descriptions", () => {
    assert.doesNotMatch(PRE_LOGIN_FEATURE_BODY_CLASS, /min-h-/);
    assert.match(PRE_LOGIN_FEATURE_BODY_CLASS, /text-\[13px\]/);
    assert.match(PRE_LOGIN_FEATURE_TITLE_CLASS, /text-sm font-semibold/);
    const community = PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits;
    const artist = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits;
    assert.equal(community.length, 6);
    assert.equal(artist.length, 6);
    for (const item of [...community, ...artist]) {
      assert.ok(item.body.length >= 52 && item.body.length <= 82, item.body);
      assert.ok(item.title.length <= 50, item.title);
    }
    assert.match(componentSrc, /PRE_LOGIN_FEATURE_BODY_CLASS/);
  });

  it("keeps Get started outside the feature reveal with explicit CTA spacing", () => {
    const screen2 = componentSrc.slice(componentSrc.indexOf("function Screen2("));
    const pager = screen2.indexOf('data-testid="pre-login-perspective-pager"');
    const cta = screen2.indexOf('data-testid="pre-login-screen-2-cta"');
    assert.ok(pager >= 0 && cta > pager);
    const ctaBlock = screen2.slice(cta, cta + 420);
    assert.doesNotMatch(ctaBlock, /PRE_LOGIN_STAGGER_ITEM_CLASS|data-stagger-slot/);
    assert.match(PRE_LOGIN_SCREEN_2_CTA_CLASS, /shrink-0 pt-2\.5/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_2_CTA_CLASS, /absolute|fixed|bottom-0/);
  });

  it("keeps the feature fade deterministic at 700ms and 6px, once per perspective", () => {
    assert.equal(PRE_LOGIN_STAGGER_DURATION_MS, 700);
    assert.equal(PRE_LOGIN_STAGGER_TRANSLATE_PX, 6);
    const shown = preLoginFeatureRevealStyle(true, 0);
    const hidden = preLoginFeatureRevealStyle(false, 1);
    assert.equal(shown.transitionDuration, "700ms");
    assert.equal(shown.opacity, 1);
    assert.equal(hidden.opacity, 0);
    assert.match(hidden.transform, /translateY\(6px\)/);
    let played = { ...INITIAL_PRE_LOGIN_REVEAL_PLAYED };
    played = markPerspectiveRevealed(played, "user");
    assert.equal(shouldAnimatePerspectiveReveal(played, "user", false), false);
    assert.equal(shouldAnimatePerspectiveReveal(played, "artist", false), true);
    assert.equal(shouldAnimatePerspectiveReveal(INITIAL_PRE_LOGIN_REVEAL_PLAYED, "user", true), false);
  });

  it("leaves Artist Tools mark and auth routing unchanged", () => {
    assert.match(artistToolsMarkSrc, /Disc3/);
    assert.match(artistToolsMarkSrc, /Wrench/);
    assert.equal((componentSrc.match(/<ArtistToolsMark/g) ?? []).length, 1);
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
    assert.match(signUpSrc, /account_type: accountType/);
    assert.doesNotMatch(componentSrc, /framer-motion|drag|swipe|onPan|spring|bounce/);
  });
});

describe("pre-login onboarding slice 11 visual polish", () => {
  it("restores the previous Screen 1 arrow visual while keeping current height", () => {
    assert.equal(PRE_LOGIN_JOURNEY_ARROW_CLASS, PRE_LOGIN_JOURNEY_CONNECTOR_CLASS);
    assert.match(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /h-\[3\.25rem\]/);
    assert.match(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /text-base leading-none text-white\/40/);
    assert.doesNotMatch(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /w-px|dashed|dotted|ChevronDown/);
    const connector = componentSrc.slice(
      componentSrc.indexOf("function JourneyConnector"),
      componentSrc.indexOf("function Screen1"),
    );
    assert.match(connector, /↓/);
    assert.match(connector, /aria-hidden/);
    assert.doesNotMatch(connector, /ChevronDown|w-px|bg-white\/40/);
    assert.equal((componentSrc.match(/<JourneyConnector/g) ?? []).length, 2);
  });

  it("replaces Screen 2 Back with a white control and keeps the accessible Back label", () => {
    const backIdx = componentSrc.indexOf('data-testid="button-onboarding-back"');
    const backBtn = componentSrc.slice(backIdx - 520, backIdx + 320);
    assert.match(backBtn, /aria-label="Back"/);
    assert.match(backBtn, /text-white/);
    assert.match(backBtn, /min-h-11/);
    assert.match(backBtn, /min-w-11/);
    assert.doesNotMatch(backBtn, /copy\.screen2\.back/);
    assert.doesNotMatch(backBtn, /text-accent|bg-accent|rounded-full/);
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.back, "Back");
  });

  it("uses the same spacing token for subheading → Feature 1 and Feature 6 → closing copy", () => {
    assert.equal(PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS, "mt-1");
    assert.ok(PRE_LOGIN_FEATURE_LIST_CLASS.startsWith(PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS));
    assert.ok(PRE_LOGIN_CALLOUT_CLASS.startsWith(PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS));
    assert.match(PRE_LOGIN_HEADING_BLOCK_CLASS, /min-h-\[3\.25rem\]/);
    assert.doesNotMatch(PRE_LOGIN_STRAPLINE_CLASS, /min-h-/);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /gap-y-1/);
    assert.match(PRE_LOGIN_SCREEN_2_CTA_CLASS, /pt-2\.5/);
    assert.match(PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS, /mt-1/);
  });

  it("removes turquoise avatar rings and uses transform scale plus drop-shadow glow", () => {
    assert.doesNotMatch(componentSrc, /ring-2 ring-\[#4ae9df\]/);
    assert.equal(PRE_LOGIN_AVATAR_SELECTED_SCALE, 1.12);
    assert.ok(PRE_LOGIN_AVATAR_SELECTED_SCALE > 1.08);
    assert.ok(PRE_LOGIN_AVATAR_SELECTED_SCALE >= 1.11);
    assert.ok(PRE_LOGIN_AVATAR_SELECTED_SCALE <= 1.14);
    const selected = preLoginAvatarEmphasisStyle(true);
    const idle = preLoginAvatarEmphasisStyle(false);
    assert.equal(selected.transform, "scale(1.12)");
    assert.equal(idle.transform, "scale(1)");
    assert.match(selected.filter, /drop-shadow/);
    assert.match(PRE_LOGIN_AVATAR_GLOW_FILTER, /10, 131, 255/);
    assert.doesNotMatch(PRE_LOGIN_AVATAR_GLOW_FILTER, /74, 233, 223/);
    assert.equal(idle.filter, "none");
    assert.match(componentSrc, /preLoginAvatarGlowStyle\(emphasize\)/);
    assert.match(componentSrc, /preLoginAvatarTransformStyle\(emphasize\)/);
    assert.match(componentSrc, /emphasize=\{!viewingArtist\}/);
    assert.match(componentSrc, /emphasize=\{viewingArtist\}/);
    assert.match(PRE_LOGIN_AVATAR_MOTION_CLASS, /duration-200/);
    assert.match(PRE_LOGIN_AVATAR_MOTION_CLASS, /motion-reduce:transition-none/);
  });

  it("keeps avatar wrapper dimensions constant while scaling the inner image", () => {
    assert.match(PRE_LOGIN_AVATAR_SLOT_SCREEN1_CLASS, /h-24 w-24/);
    assert.match(PRE_LOGIN_AVATAR_SLOT_SCREEN1_CLASS, /min-\[400px\]:h-\[6\.75rem\] min-\[400px\]:w-\[6\.75rem\]/);
    assert.match(PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS, /h-9 w-9/);
    assert.doesNotMatch(PRE_LOGIN_AVATAR_SLOT_SCREEN1_CLASS, /scale-|h-auto|w-auto/);
    assert.doesNotMatch(PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS, /scale-|h-auto|w-auto/);
    assert.match(componentSrc, /PRE_LOGIN_AVATAR_SLOT_SCREEN1_CLASS/);
    assert.match(componentSrc, /PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS/);
    const intentBtn = componentSrc.slice(
      componentSrc.indexOf("function IntentChoiceButton"),
      componentSrc.indexOf("function SignInExit"),
    );
    assert.match(intentBtn, /PRE_LOGIN_AVATAR_SLOT_SCREEN1_CLASS/);
    assert.match(intentBtn, /emphasize=\{emphasize\}/);
  });

  it("keeps initial Screen 1 unselected and does not flash selection on the forward transition", () => {
    assert.equal(shouldShowScreen1Selection(INITIAL_PRE_LOGIN_ONBOARDING_UI), false);
    const afterTap = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    assert.equal(afterTap.screen, 2);
    assert.equal(afterTap.intent, "user");
    assert.equal(afterTap.viewingPerspective, "user");
    assert.equal(shouldShowScreen1Selection(afterTap), false);
    const artistTap = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "artist");
    assert.equal(shouldShowScreen1Selection(artistTap), false);
    assert.match(componentSrc, /shouldShowScreen1Selection\(state\) && state\.intent === "user"/);
    assert.match(componentSrc, /shouldShowScreen1Selection\(state\) && state\.intent === "artist"/);
    assert.doesNotMatch(componentSrc, /setTimeout\([^)]*shouldShowScreen1Selection/);
    assert.doesNotMatch(componentSrc, /setTimeout\([^)]*emphasize/);
    assert.equal((componentSrc.match(/setTimeout/g) ?? []).length, 1);
    assert.match(componentSrc, /window\.setTimeout\(\(\) => headingRef\.current\?\.focus\(\)/);
  });

  it("shows the chosen perspective selected on Screen 2 and switches scale/glow with viewingPerspective", () => {
    const community = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    assert.equal(community.viewingPerspective, "user");
    const switched = applyScreen2Perspective(community, "artist");
    assert.equal(switched.intent, "user");
    assert.equal(switched.viewingPerspective, "artist");
    assert.equal(preLoginAvatarEmphasisStyle(switched.viewingPerspective === "user").transform, "scale(1)");
    assert.equal(preLoginAvatarEmphasisStyle(switched.viewingPerspective === "artist").transform, "scale(1.12)");
    assert.match(componentSrc, /emphasize=\{!viewingArtist\}/);
    assert.match(componentSrc, /emphasize=\{viewingArtist\}/);
  });

  it("shows the previous Screen 1 choice with scale and glow after Back, not a ring", () => {
    const screen2 = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "artist");
    const returned = applyBackToScreen1(screen2);
    assert.equal(returned.screen, 1);
    assert.equal(returned.intent, "artist");
    assert.equal(shouldShowScreen1Selection(returned), true);
    assert.equal(preLoginAvatarEmphasisStyle(true).transform, "scale(1.12)");
    assert.match(preLoginAvatarEmphasisStyle(true).filter, /drop-shadow/);
    assert.doesNotMatch(componentSrc, /ring-2 ring-\[#4ae9df\]/);
    assert.match(componentSrc, /applyBackToScreen1/);
  });

  it("leaves reveal-once and auth/routing mechanics unchanged", () => {
    let played = { ...INITIAL_PRE_LOGIN_REVEAL_PLAYED };
    played = markPerspectiveRevealed(played, "user");
    assert.equal(shouldAnimatePerspectiveReveal(played, "user", false), false);
    assert.equal(shouldAnimatePerspectiveReveal(played, "artist", false), true);
    assert.match(componentSrc, /screen1PlayedRef/);
    assert.match(componentSrc, /preLoginScreen1RevealStyle/);
    assert.match(componentSrc, /preLoginFeatureRevealStyle/);
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
    assert.doesNotMatch(componentSrc, /history\.back|setLocation|navigate\(/);
  });
});

describe("pre-login onboarding slice 12 micro-polish", () => {
  it("uses a white ChevronLeft back icon with a 44pt tap target, not literal < text", () => {
    const backIdx = componentSrc.indexOf('data-testid="button-onboarding-back"');
    const backBtn = componentSrc.slice(backIdx - 520, backIdx + 360);
    assert.match(backBtn, /<ChevronLeft/);
    assert.match(backBtn, /PRE_LOGIN_BACK_ICON_CLASS/);
    assert.match(backBtn, /aria-label="Back"/);
    assert.match(backBtn, /min-h-11/);
    assert.match(backBtn, /min-w-11/);
    assert.match(PRE_LOGIN_BACK_ICON_CLASS, /h-7 w-7/);
    assert.match(PRE_LOGIN_BACK_ICON_CLASS, /text-white/);
    assert.match(backBtn, /text-white/);
    assert.doesNotMatch(backBtn, /\{\"<\"\}/);
    assert.doesNotMatch(backBtn, /copy\.screen2\.back/);
    assert.doesNotMatch(backBtn, /text-accent|bg-accent|rounded-full/);
    assert.match(backBtn, /applyBackToScreen1/);
  });

  it("strengthens selected avatar scale to about 1.12 while idle stays at 1", () => {
    assert.equal(PRE_LOGIN_AVATAR_SELECTED_SCALE, 1.12);
    assert.ok(PRE_LOGIN_AVATAR_SELECTED_SCALE > 1.08);
    assert.ok(PRE_LOGIN_AVATAR_SELECTED_SCALE >= 1.11);
    assert.ok(PRE_LOGIN_AVATAR_SELECTED_SCALE <= 1.14);
    assert.equal(preLoginAvatarEmphasisStyle(true).transform, "scale(1.12)");
    assert.equal(preLoginAvatarEmphasisStyle(false).transform, "scale(1)");
  });

  it("applies glow on a non-transformed wrapper and scale on the img to avoid WebKit filter clipping", () => {
    assert.match(PRE_LOGIN_AVATAR_SLOT_SCREEN1_CLASS, /overflow-visible/);
    assert.match(PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS, /overflow-visible/);
    assert.match(PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS, /overflow-visible/);
    assert.match(PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS, /-inset-6/);
    assert.equal(PRE_LOGIN_AVATAR_GLOW_PAINT_INSET_PX, 24);
    assert.doesNotMatch(PRE_LOGIN_AVATAR_SLOT_SCREEN1_CLASS, /overflow-hidden|overflow-clip/);
    assert.doesNotMatch(PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS, /overflow-hidden|overflow-clip/);
    assert.doesNotMatch(PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS, /overflow-hidden|overflow-clip|rounded-full/);
    const visual = componentSrc.slice(
      componentSrc.indexOf("function EmphasizedRoleAvatar"),
      componentSrc.indexOf("function OnboardingStatusPill"),
    );
    assert.match(visual, /PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS/);
    assert.match(visual, /preLoginAvatarGlowStyle\(emphasize\)/);
    assert.match(visual, /preLoginAvatarTransformStyle\(emphasize\)/);
    const emphasized = componentSrc.slice(
      componentSrc.indexOf("function EmphasizedRoleAvatar"),
      componentSrc.indexOf("function OnboardingStatusPill"),
    );
    assert.match(emphasized, /preLoginAvatarTransformStyle\(emphasize\)/);
    const img = componentSrc.slice(
      componentSrc.indexOf("function DefaultRoleAvatar"),
      componentSrc.indexOf("function EmphasizedRoleAvatar"),
    );
    assert.doesNotMatch(img, /preLoginAvatarGlowStyle/);
    assert.doesNotMatch(img, /preLoginAvatarTransformStyle/);
    assert.match(img, /rounded-full/);
    assert.match(preLoginAvatarGlowStyle(true).filter, /drop-shadow/);
    assert.equal(preLoginAvatarTransformStyle(true).transform, "scale(1.12)");
    assert.match(PRE_LOGIN_AVATAR_GLOW_FILTER, /10, 131, 255/);
    assert.doesNotMatch(PRE_LOGIN_AVATAR_GLOW_FILTER, /74, 233, 223/);
    assert.doesNotMatch(componentSrc, /ring-2 ring-\[#4ae9df\]/);
  });

  it("keeps Screen 2 selector geometry fixed", () => {
    assert.match(PRE_LOGIN_PERSPECTIVE_SWITCHER_CLASS, /h-\[4\.5rem\]/);
    assert.match(PRE_LOGIN_PERSPECTIVE_SWITCHER_CLASS, /gap-8/);
    assert.match(PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS, /h-\[4\.5rem\]/);
    assert.match(PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS, /h-9 w-9/);
    assert.doesNotMatch(PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS, /scale-|h-auto|w-auto/);
  });

  it("keeps initial Screen 1 unselected, Screen 2/back-return selected, and no forward flash", () => {
    assert.equal(shouldShowScreen1Selection(INITIAL_PRE_LOGIN_ONBOARDING_UI), false);
    const afterTap = applyScreen1Intent(INITIAL_PRE_LOGIN_ONBOARDING_UI, "user");
    assert.equal(shouldShowScreen1Selection(afterTap), false);
    assert.equal(afterTap.viewingPerspective, "user");
    const returned = applyBackToScreen1(afterTap);
    assert.equal(shouldShowScreen1Selection(returned), true);
    assert.equal(returned.intent, "user");
    assert.match(componentSrc, /shouldShowScreen1Selection\(state\)/);
    assert.doesNotMatch(componentSrc, /setTimeout\([^)]*shouldShowScreen1Selection/);
    assert.equal((componentSrc.match(/setTimeout/g) ?? []).length, 1);
  });

  it("does not change auth or routing behaviour", () => {
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
    assert.doesNotMatch(componentSrc, /history\.back|setLocation|navigate\(/);
    assert.match(componentSrc, /applyBackToScreen1/);
  });
});

describe("pre-login onboarding Screen 2 glow paint and feature-stack rhythm", () => {
  it("gives Screen 2 pill glow paint room in the canvas gutter without moving Screen 1", () => {
    assert.match(PRE_LOGIN_SCREEN_LAYERS_CLASS, /-mx-4/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_LAYERS_CLASS, /-mt-4 pt-4/);
    assert.match(PRE_LOGIN_SCREEN_1_CLIP_CLASS, /left-4 right-4/);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_1_CLIP_CLASS/);
    assert.match(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /absolute inset-0/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /-top-4/);
    assert.match(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /overflow-hidden/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /overflow-y-auto/);
    assert.match(PRE_LOGIN_SCREEN_2_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(PRE_LOGIN_SCREEN_2_SCROLL_CLASS, /min-h-0/);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_2_LAYER_CLASS/);
    assert.doesNotMatch(componentSrc, /PRE_LOGIN_SCREEN_2_PAINT_GUTTER_CLASS/);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_2_CONTENT_INSET_CLASS/);
    assert.match(PRE_LOGIN_SCREEN_2_CTA_CLASS, /px-4/);
    assert.match(PRE_LOGIN_FEATURE_VISUAL_COL_CLASS, /overflow-visible/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_2_PAGER_CLASS, /overflow-x-scroll|overflow-x-auto/);
  });

  it("keeps GAP A and GAP B on the same token with no leftover heading min-height", () => {
    assert.equal(PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS, "mt-1");
    assert.ok(PRE_LOGIN_FEATURE_LIST_CLASS.startsWith(PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS));
    assert.ok(PRE_LOGIN_CALLOUT_CLASS.startsWith(PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS));
    assert.match(PRE_LOGIN_HEADING_BLOCK_CLASS, /min-h-\[3\.25rem\]/);
    assert.doesNotMatch(PRE_LOGIN_STRAPLINE_CLASS, /min-h-/);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /gap-y-1/);
    assert.match(PRE_LOGIN_SCREEN_2_CTA_CLASS, /pt-2\.5/);
    assert.match(PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS, /mt-1/);
  });
});

describe("pre-login onboarding slice 13 copy lock and avatar glow gutter", () => {
  it("documents that Slice 13 host/layer gutter was superseded by glow wrapper split in Slice 14", () => {
    assert.doesNotMatch(PRE_LOGIN_SCREEN_LAYERS_CLASS, /-mt-4 pt-4/);
    assert.match(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /absolute inset-0/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /-top-4/);
    assert.doesNotMatch(componentSrc, /PRE_LOGIN_SCREEN_2_PAINT_GUTTER_CLASS/);
    const screen2 = componentSrc.slice(
      componentSrc.indexOf("function Screen2("),
      componentSrc.indexOf("export function PreLoginOnboarding"),
    );
    assert.doesNotMatch(screen2, /PRE_LOGIN_SCREEN_2_PAINT_GUTTER_CLASS/);
    assert.match(screen2, /PRE_LOGIN_SCREEN_2_SWITCHER_HOST_CLASS/);
    assert.match(screen2, /PerspectiveSwitcher/);
    assert.match(PRE_LOGIN_SCREEN_2_PAGER_CLASS, /overflow-x-hidden/);
    assert.match(screen2, /onPointerDown/);
    assert.match(screen2, /resolvePerspectivePagerCommit/);
    assert.equal(PRE_LOGIN_AVATAR_SELECTED_SCALE, 1.12);
    assert.match(PRE_LOGIN_AVATAR_GLOW_FILTER, /drop-shadow/);
  });

  it("locks approved Community feature copy", () => {
    const community = PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits;
    assert.equal(community.length, 6);
    assert.equal(community[0].title, "ID the tracks you're looking for");
    assert.equal(community[2].title, "Save the tracks you love");
    assert.equal(community[4].title, "Get notified when tracks finally drop");
    assert.equal(community[5].title, "Climb the Leaderboard. Earn rewards.");
    assert.match(community[5].body, /event tickets, unreleased dubs and production equipment/);
    const joined = JSON.stringify(community);
    assert.doesNotMatch(joined, /Find the tracks nobody can name|Save the ones worth chasing/);
  });

  it("locks approved Artist feature copy without mistaken-ID sales language", () => {
    const artist = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits;
    assert.equal(artist.length, 6);
    assert.equal(artist[0].title, "Discover where your music is played");
    assert.equal(artist[1].title, "Confirm your tracks");
    assert.equal(artist[3].title, "Notify the people already waiting");
    assert.equal(artist[4].title, "Climb the Artist Leaderboard");
    assert.match(artist[1].body, /straight from the source/);
    assert.match(artist[3].body, /notify listeners/);
    const joined = JSON.stringify(artist);
    assert.doesNotMatch(joined, /incorrect IDs|mistaken IDs|aren't yours|Confirm it from the source/);
    assert.doesNotMatch(joined, /private identification|identify unreleased music privately/);
  });

  it("uses Artist Tools Path B and keeps verification free", () => {
    const tools = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits[5];
    assert.equal(tools.title, PRE_LOGIN_ARTIST_TOOLS_LABEL);
    assert.match(tools.body, /More releases, attached clips and links/);
    assert.match(tools.body, /Release Alert delivery on drop/);
    assert.doesNotMatch(tools.body, /privately|private identification/);
    assert.doesNotMatch(JSON.stringify(PRE_LOGIN_ONBOARDING_COPY), /verification.*paid|paid.*verification/i);
    assert.match(paywallCopySrc, /Artist verification remains free/);
  });

  it("updates the Artist closing callout to reserved usernames wording", () => {
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistHookTitle,
      "Your artist name may already be waiting.",
    );
    assert.doesNotMatch(
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistHookTitle,
      /artist profile may already be waiting/,
    );
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.communityCalloutTitle,
      "Your next ID might already be here.",
    );
  });

  it("keeps feature bodies within two-line geometry and leaves Screen 1 frozen", () => {
    for (const item of [
      ...PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits,
      ...PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits,
    ]) {
      assert.ok(item.body.length >= 40 && item.body.length <= 82, item.body);
    }
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
    assert.match(componentSrc, /function Screen1\(/);
    assert.doesNotMatch(
      componentSrc.slice(componentSrc.indexOf("function Screen1("), componentSrc.indexOf("function PerspectivePanel(")),
      /PRE_LOGIN_SCREEN_2_LAYER_CLASS/,
    );
  });
});

describe("pre-login onboarding slice 14 final rhythm glow re-audit and fit", () => {
  it("redistributes Screen 1 vertical zones without changing journey copy or typography", () => {
    assert.match(PRE_LOGIN_SCREEN_1_TOP_CLASS, /pt-3/);
    assert.match(PRE_LOGIN_SCREEN_1_HEADLINE_CLASS, /mt-2\.5/);
    assert.match(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /mt-7/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /flex-1|justify-center/);
    assert.equal(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, PRE_LOGIN_JOURNEY_ARROW_CLASS);
    assert.match(PRE_LOGIN_JOURNEY_STEP_CLASS, /text-\[15px\]/);
    assert.match(componentSrc, /copy\.screen1\.journeyHear/);
    assert.match(componentSrc, /copy\.screen1\.heading/);
    assert.match(componentSrc, /text-2xl font-bold/);
    assert.match(PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS, /mt-7/);
  });

  it("documents post-Slice-13 glow clipping cause and targets filter/transform split", () => {
    assert.doesNotMatch(PRE_LOGIN_SCREEN_LAYERS_CLASS, /-mt-4 pt-4/);
    assert.match(PRE_LOGIN_SCREEN_LAYERS_CLASS, /overflow-hidden/);
    assert.match(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /absolute inset-0/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /-top-4/);
    assert.match(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /overflow-hidden/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /overflow-y-auto/);
    assert.match(PRE_LOGIN_SCREEN_2_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(PRE_LOGIN_SCREEN_2_SCROLL_CLASS, /min-h-0/);
    assert.match(PRE_LOGIN_PERSPECTIVE_SWITCHER_CLASS, /overflow-visible/);
    assert.match(PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS, /overflow-visible/);
    assert.equal(PRE_LOGIN_AVATAR_GLOW_PAINT_INSET_PX, 24);
    assert.match(PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS, /-inset-6/);
    assert.equal(PRE_LOGIN_AVATAR_SELECTED_SCALE, 1.12);
    assert.match(PRE_LOGIN_AVATAR_GLOW_FILTER, /drop-shadow\(0 0 6px/);
    const visual = componentSrc.slice(
      componentSrc.indexOf("function EmphasizedRoleAvatar"),
      componentSrc.indexOf("function OnboardingStatusPill"),
    );
    assert.match(visual, /preLoginAvatarGlowStyle\(emphasize\)/);
    assert.match(visual, /preLoginAvatarTransformStyle\(emphasize\)/);
    assert.doesNotMatch(visual, /preLoginAvatarEmphasisStyle\(emphasize\)/);
  });

  it("preserves pager and screen transition clipping while fixing avatar glow paint", () => {
    assert.match(PRE_LOGIN_SCREEN_2_PAGER_CLASS, /overflow-x-hidden/);
    assert.match(PRE_LOGIN_SCREEN_1_CLIP_CLASS, /overflow-hidden/);
    assert.match(PRE_LOGIN_SCREEN_LAYERS_CLASS, /overflow-hidden/);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_TRANSITION_CLASS/);
    assert.match(componentSrc, /resolvePerspectivePagerCommit/);
    assert.match(PRE_LOGIN_FEATURE_VISUAL_COL_CLASS, /overflow-visible/);
  });

  it("uses community-identified pill for Community row 1, not artist-verified or unidentified", () => {
    const row1 = PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits[0];
    assert.equal(row1.title, "ID the tracks you're looking for");
    assert.equal(row1.visual, "communityIdentifiedPill");
    assert.match(componentSrc, /case "communityIdentifiedPill"/);
    assert.match(componentSrc, /status="identified"/);
    assert.doesNotMatch(
      JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits[0]),
      /unidentifiedPill/,
    );
    const benefitVisual = componentSrc.slice(
      componentSrc.indexOf("function BenefitVisual"),
      componentSrc.indexOf("function IntentChoiceButton"),
    );
    assert.match(
      benefitVisual,
      /case "communityIdentifiedPill":\s*\n\s*return <OnboardingStatusPill status="identified" \/>;/,
    );
  });

  it("updates notification heading copy without changing the bell visual", () => {
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits[4].title,
      "Get notified when tracks finally drop",
    );
    assert.doesNotMatch(
      JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits),
      /Get notified when new tracks drop/,
    );
    assert.match(
      PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits[4].body,
      /Stay updated when the music you've discovered is finally released/,
    );
    assert.match(componentSrc, /case "alerts"/);
  });

  it("shares Community/Artist geometry with fixed row template and scroll fallback", () => {
    assert.equal(PRE_LOGIN_SCREEN_2_COMPACT_MIN_HEIGHT_PX, 844);
    assert.equal(PRE_LOGIN_FEATURE_ROW_HEIGHTS_PX.length, 6);
    assert.deepEqual([...PRE_LOGIN_FEATURE_ROW_HEIGHTS_PX], [68, 68, 68, 68, 68, 68]);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /repeat\(6,4\.25rem\)/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_LIST_CLASS, /minmax\(3\.5rem,1fr\)/);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /shrink-0/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_LIST_CLASS, /flex-1/);
    assert.match(PRE_LOGIN_SCREEN_2_PAGER_CLASS, /min-h-0/);
    assert.match(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /overflow-hidden/);
    assert.match(PRE_LOGIN_SCREEN_2_SCROLL_CLASS, /overflow-y-auto/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_TITLE_CLASS, /text-xs|text-\[12px\]/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_BODY_CLASS, /text-xs|text-\[12px\]/);
    const panel = componentSrc.slice(
      componentSrc.indexOf("function PerspectivePanel"),
      componentSrc.indexOf("function Screen2"),
    );
    assert.equal((panel.match(/PRE_LOGIN_FEATURE_LIST_CLASS/g) ?? []).length, 1);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS/);
  });

  it("keeps reveal behaviour and auth/routing frozen", () => {
    assert.match(componentSrc, /preLoginScreen1RevealStyle/);
    assert.match(componentSrc, /preLoginFeatureRevealStyle/);
    assert.match(componentSrc, /shouldShowScreen1Selection/);
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
    assert.equal(PRE_LOGIN_ONBOARDING_SEEN_KEY, "dubhub_pre_login_onboarding_seen");
  });
});

describe("pre-login onboarding slice 15 structural geometry fix", () => {
  it("removes flex-centred journey and uses explicit inter-zone spacing on Screen 1", () => {
    assert.match(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /mt-7/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /flex-1/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /justify-center/);
    assert.match(PRE_LOGIN_SCREEN_1_HEADLINE_CLASS, /mt-2\.5/);
    assert.match(PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS, /mt-7/);
    const screen1 = componentSrc.slice(
      componentSrc.indexOf("function Screen1("),
      componentSrc.indexOf("function PerspectiveSwitcher"),
    );
    assert.match(screen1, /PRE_LOGIN_SCREEN_1_JOURNEY_CLASS/);
    assert.match(screen1, /PRE_LOGIN_SCREEN_1_HEADLINE_CLASS/);
    assert.match(screen1, /PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS/);
    assert.doesNotMatch(screen1, /PRE_LOGIN_SCREEN_1_MIDDLE_CLASS/);
    assert.match(screen1, /mt-3/);
    assert.doesNotMatch(screen1, /flex-1 justify-center/);
  });

  it("reparents the perspective switcher outside the vertical scrollport", () => {
    const screen2 = componentSrc.slice(
      componentSrc.indexOf("function Screen2("),
      componentSrc.indexOf("export function PreLoginOnboarding"),
    );
    assert.match(screen2, /PRE_LOGIN_SCREEN_2_SWITCHER_HOST_CLASS/);
    assert.match(screen2, /PRE_LOGIN_SCREEN_2_SCROLL_CLASS/);
    assert.match(screen2, /data-testid="pre-login-screen-2-switcher-host"/);
    assert.match(screen2, /data-testid="pre-login-screen-2-scroll"/);
    const switcherIdx = screen2.indexOf("pre-login-screen-2-switcher-host");
    const scrollIdx = screen2.indexOf("pre-login-screen-2-scroll");
    const pagerIdx = screen2.indexOf("pre-login-perspective-pager");
    assert.ok(switcherIdx >= 0 && scrollIdx > switcherIdx && pagerIdx > scrollIdx);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /overflow-y-auto/);
    assert.match(PRE_LOGIN_SCREEN_2_SCROLL_CLASS, /overflow-y-auto/);
    assert.doesNotMatch(componentSrc, /PRE_LOGIN_SCREEN_2_PAINT_GUTTER/);
    assert.match(PRE_LOGIN_SCREEN_2_SWITCHER_HOST_CLASS, /pt-4/);
  });

  it("keeps avatar glow CSS and scale unchanged while fixing structure", () => {
    assert.equal(PRE_LOGIN_AVATAR_SELECTED_SCALE, 1.12);
    assert.match(PRE_LOGIN_AVATAR_GLOW_FILTER, /drop-shadow/);
    assert.match(PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS, /-inset-6/);
    const visual = componentSrc.slice(
      componentSrc.indexOf("function EmphasizedRoleAvatar"),
      componentSrc.indexOf("function OnboardingStatusPill"),
    );
    assert.match(visual, /preLoginAvatarGlowStyle\(emphasize\)/);
    assert.match(visual, /preLoginAvatarTransformStyle\(emphasize\)/);
  });

  it("uses one shared six-row template for both perspectives", () => {
    assert.equal(PRE_LOGIN_FEATURE_GRID_ROWS_CLASS, PRE_LOGIN_FEATURE_GRID_ROWS_CLASS);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /repeat\(6,4\.25rem\)/);
    assert.deepEqual([...PRE_LOGIN_FEATURE_ROW_HEIGHTS_PX], [68, 68, 68, 68, 68, 68]);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_LIST_CLASS, /repeat\(6,minmax/);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_HEADING_BLOCK_CLASS, /min-h-\[3\.25rem\]/);
    assert.doesNotMatch(PRE_LOGIN_CALLOUT_CLASS, /min-h-/);
    assert.match(PRE_LOGIN_SCREEN_2_PAGER_CLASS, /min-h-0/);
    const panel = componentSrc.slice(
      componentSrc.indexOf("function PerspectivePanel"),
      componentSrc.indexOf("function Screen2"),
    );
    assert.match(panel, /PRE_LOGIN_FEATURE_LIST_CLASS/);
    assert.doesNotMatch(panel, /flex-1.*PRE_LOGIN_FEATURE_LIST/);
  });

  it("keeps CTA and Sign in outside the scrollport and perspective intrinsic height", () => {
    const screen2 = componentSrc.slice(
      componentSrc.indexOf("function Screen2("),
      componentSrc.indexOf("export function PreLoginOnboarding"),
    );
    const scrollIdx = screen2.indexOf("pre-login-screen-2-scroll");
    const ctaIdx = screen2.indexOf("pre-login-screen-2-cta");
    assert.ok(scrollIdx >= 0 && ctaIdx > scrollIdx);
    assert.match(PRE_LOGIN_SCREEN_2_CTA_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_2_PAGER_CLASS, /overflow-x-hidden/);
    assert.match(PRE_LOGIN_SCREEN_1_CLIP_CLASS, /overflow-hidden/);
    assert.match(PRE_LOGIN_SCREEN_LAYERS_CLASS, /overflow-hidden/);
  });

  it("preserves feature copy, motion, and auth/routing", () => {
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits[4].title, "Get notified when tracks finally drop");
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen2.communityBenefits[0].visual, "communityIdentifiedPill");
    assert.match(componentSrc, /preLoginFeatureRevealStyle/);
    assert.match(componentSrc, /resolvePerspectivePagerCommit/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
  });
});

describe("pre-login onboarding final feature rhythm polish", () => {
  it("shortens Artist row 1 heading only", () => {
    const artist = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits[0];
    assert.equal(artist.title, "Discover where your music is played");
    assert.equal(artist.body, "Find clips of your tracks from sets, events and mixes.");
    assert.doesNotMatch(
      JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen2),
      /Find where your music is already being played/,
    );
  });

  it("uses one shared row template and uniform inter-row gap for both perspectives", () => {
    assert.deepEqual([...PRE_LOGIN_FEATURE_ROW_HEIGHTS_PX], [68, 68, 68, 68, 68, 68]);
    assert.equal(PRE_LOGIN_FEATURE_ROW_GAP_CLASS, "gap-y-1");
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /gap-y-1/);
    assert.equal(PRE_LOGIN_FEATURE_ROW_GAP_CLASS, "gap-y-1");
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /repeat\(6,4\.25rem\)/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_LIST_CLASS, /repeat\(6,minmax/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_LIST_CLASS, /flex-1/);
    const panel = componentSrc.slice(
      componentSrc.indexOf("function PerspectivePanel"),
      componentSrc.indexOf("function Screen2"),
    );
    assert.equal((panel.match(/PRE_LOGIN_FEATURE_LIST_CLASS/g) ?? []).length, 1);
    assert.doesNotMatch(panel, /gap-y-2|gap-y-3|mb-\d|mt-\d.*feature-row/);
  });

  it("top-anchors text and centre-aligns visuals so shorter copy cannot collapse rows", () => {
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /h-full/);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /max-h-full/);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /items-start/);
    assert.match(PRE_LOGIN_FEATURE_TEXT_COL_CLASS, /self-start/);
    assert.match(PRE_LOGIN_FEATURE_VISUAL_COL_CLASS, /h-full/);
    assert.match(PRE_LOGIN_FEATURE_VISUAL_COL_CLASS, /items-center/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_BODY_CLASS, /min-h-/);
  });

  it("keeps CTA and Sign in outside perspective intrinsic sizing", () => {
    assert.match(PRE_LOGIN_SCREEN_2_CTA_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_SCREEN_2_PAGER_CLASS, /min-h-0/);
    assert.match(PRE_LOGIN_SCREEN_2_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /overflow-hidden/);
  });
});

describe("pre-login onboarding feature rhythm structural fix", () => {
  it("keeps Artist row 1 heading copy unchanged", () => {
    const artist = PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits[0];
    assert.equal(artist.title, "Discover where your music is played");
    assert.equal(artist.body, "Find clips of your tracks from sets, events and mixes.");
  });

  it("uses six uniform 68px feature row tracks with no 52px rows", () => {
    assert.deepEqual([...PRE_LOGIN_FEATURE_ROW_HEIGHTS_PX], [68, 68, 68, 68, 68, 68]);
    assert.equal(PRE_LOGIN_FEATURE_GRID_ROWS_CLASS, "[grid-template-rows:repeat(6,4.25rem)]");
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /repeat\(6,4\.25rem\)/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_LIST_CLASS, /3\.25rem/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_LIST_CLASS, /52px/);
  });

  it("shares one row definition for Community and Artist with no perspective overrides", () => {
    const panel = componentSrc.slice(
      componentSrc.indexOf("function PerspectivePanel"),
      componentSrc.indexOf("function Screen2"),
    );
    assert.equal((panel.match(/PRE_LOGIN_FEATURE_LIST_CLASS/g) ?? []).length, 1);
    assert.doesNotMatch(panel, /community.*grid-template-rows|artist.*grid-template-rows/i);
    assert.doesNotMatch(panel, /viewingArtist.*PRE_LOGIN_FEATURE_ROW|viewingArtist.*PRE_LOGIN_FEATURE_LIST/);
    assert.equal(PRE_LOGIN_FEATURE_ROW_GAP_CLASS, "gap-y-1");
  });

  it("does not clip feature text or use per-row margin hacks", () => {
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /overflow-hidden/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_TEXT_COL_CLASS, /overflow-hidden/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_TITLE_CLASS, /overflow-hidden/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_BODY_CLASS, /overflow-hidden/);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /overflow-visible/);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /overflow-visible/);
    const panel = componentSrc.slice(
      componentSrc.indexOf("function PerspectivePanel"),
      componentSrc.indexOf("function Screen2"),
    );
    assert.doesNotMatch(panel, /feature-row.*-mt-|feature-row.*mb-\d|PRE_LOGIN_FEATURE_ROW_CLASS.*-m[ty]-/);
  });

  it("preserves feature typography and CTA shell height tokens", () => {
    assert.match(PRE_LOGIN_FEATURE_TITLE_CLASS, /text-sm font-semibold leading-snug/);
    assert.match(PRE_LOGIN_FEATURE_BODY_CLASS, /text-\[13px\] leading-snug/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_TITLE_CLASS, /text-xs|text-\[12px\]/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_BODY_CLASS, /text-xs|text-\[12px\]/);
    assert.match(PRE_LOGIN_SCREEN_2_CTA_CLASS, /shrink-0 pt-2\.5 pb-1\.5/);
    assert.match(PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS, /mt-1/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_2_CTA_CLASS, /min-h-|h-\[/);
  });

  it("keeps perspective content from altering shared row positions", () => {
    const screen2 = componentSrc.slice(
      componentSrc.indexOf("function Screen2("),
      componentSrc.indexOf("export function PreLoginOnboarding"),
    );
    assert.match(screen2, /PerspectivePanel/);
    assert.doesNotMatch(screen2, /viewingArtist\s*\?\s*PRE_LOGIN_FEATURE/);
    assert.match(PRE_LOGIN_HEADING_BLOCK_CLASS, /shrink-0/);
    assert.match(PRE_LOGIN_CALLOUT_CLASS, /shrink-0/);
  });

  it("recovers feature-list height from structural whitespace without touching CTA → Sign in", () => {
    assert.equal(PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS, "mt-1");
    assert.match(PRE_LOGIN_PERSPECTIVE_SWITCHER_CLASS, /mb-2/);
    assert.match(PRE_LOGIN_HEADING_BLOCK_CLASS, /min-h-\[3\.25rem\]/);
    assert.doesNotMatch(PRE_LOGIN_CALLOUT_CLASS, /min-h-/);
    assert.match(PRE_LOGIN_SCREEN_2_CTA_CLASS, /pt-2\.5 pb-1\.5/);
    assert.match(PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS, /mt-1/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS, /mt-1[^.]|mt-0/);
  });

  it("keeps Screen 2 configured for no-scroll large-phone presentation", () => {
    assert.equal(PRE_LOGIN_SCREEN_2_COMPACT_MIN_HEIGHT_PX, 844);
    assert.match(PRE_LOGIN_SCREEN_2_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /overflow-hidden/);
    assert.match(PRE_LOGIN_SCREEN_2_PAGER_CLASS, /min-h-0/);
    assert.match(PRE_LOGIN_FEATURE_LIST_CLASS, /shrink-0/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_LIST_CLASS, /flex-1/);
  });
});

describe("pre-login onboarding screen 1 product story polish", () => {
  it("uses the new hero question with no subtitle", () => {
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen1.heading,
      "Still got that video in your camera roll?",
    );
    assert.doesNotMatch(
      JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen1),
      /Great music deserves a second listen/,
    );
    assert.equal("supporting" in PRE_LOGIN_ONBOARDING_COPY.screen1, false);
    assert.equal("subtitle" in PRE_LOGIN_ONBOARDING_COPY.screen1, false);
  });

  it("keeps exactly three story stages with approved labels", () => {
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyHear, "Hear it in a set");
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyFind, "Find it on dub hub");
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.journeyFollow, "Follow it through to release");
    assert.match(componentSrc, /pre-login-story-stage-1/);
    assert.match(componentSrc, /pre-login-story-stage-2/);
    assert.match(componentSrc, /pre-login-story-stage-3/);
    assert.equal((componentSrc.match(/pre-login-story-stage-/g) ?? []).length, 3);
  });

  it("uses presentation-only waveform, community identified, and release visuals", () => {
    assert.match(componentSrc, /function Screen1WaveformVisual/);
    assert.match(componentSrc, /function Screen1IdentifiedVisual/);
    assert.match(componentSrc, /function Screen1ReleaseVisual/);
    assert.match(componentSrc, /pre-login-story-waveform-visual/);
    assert.doesNotMatch(componentSrc, /pre-login-story-clip-visual/);
    assert.doesNotMatch(componentSrc, /function Screen1ClipVisual/);
    assert.match(componentSrc, /pre-login-story-identified-visual/);
    assert.match(componentSrc, /pre-login-story-release-visual/);
    const identified = componentSrc.slice(
      componentSrc.indexOf("function Screen1IdentifiedVisual"),
      componentSrc.indexOf("function Screen1ReleaseVisual"),
    );
    assert.match(identified, /status="identified"/);
    assert.doesNotMatch(identified, /artistIdentified/);
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE.track, "New Release");
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE.artist, "@Artist");
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE.outLabel, "Out 1 Jan");
    assert.match(componentSrc, /GoldVerifiedTick/);
    assert.doesNotMatch(componentSrc, /fetch\(|useQuery|autoplay|video-card|VideoCard/i);
  });

  it("marks decorative story visuals aria-hidden and keeps identity behaviour frozen", () => {
    const clip = componentSrc.slice(
      componentSrc.indexOf("function Screen1WaveformVisual"),
      componentSrc.indexOf("function Screen1IdentifiedVisual"),
    );
    const identified = componentSrc.slice(
      componentSrc.indexOf("function Screen1IdentifiedVisual"),
      componentSrc.indexOf("function Screen1ReleaseVisual"),
    );
    const release = componentSrc.slice(
      componentSrc.indexOf("function Screen1ReleaseVisual"),
      componentSrc.indexOf("function Screen1StoryStage"),
    );
    assert.match(clip, /aria-hidden/);
    assert.match(identified, /aria-hidden/);
    assert.match(release, /aria-hidden/);
    assert.match(componentSrc, /applyScreen1Intent/);
    assert.match(componentSrc, /resolveSignupAccountType/);
    assert.match(signUpSrc, /account_type: accountType/);
  });

  it("reveals the story once per mounted session and skips replay on Back", () => {
    assert.equal(shouldRunScreen1StorySequence(false, false), true);
    assert.equal(shouldRunScreen1StorySequence(true, false), false);
    assert.equal(shouldRunScreen1StorySequence(false, true), false);
    assert.equal(
      resolveScreen1RevealReady({ alreadyPlayed: true, reduceMotion: false, animate: false }),
      true,
    );
    assert.equal(
      resolveScreen1RevealReady({ alreadyPlayed: false, reduceMotion: true, animate: false }),
      true,
    );
    assert.match(componentSrc, /screen1PlayedRef/);
    assert.match(componentSrc, /shouldRunScreen1StorySequence/);
    assert.doesNotMatch(componentSrc, /localStorage.*screen1|screen1.*localStorage/i);
  });

  it("uses calm opacity-first Screen 1 timing within product-story bounds", () => {
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_DURATION_MS, 550);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_STEP_MS, 220);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_TRANSLATE_PX, 5);
    assert.match(PRE_LOGIN_SCREEN_1_STORY_CLASS, /gap-1/);
    assert.match(PRE_LOGIN_SCREEN_1_STORY_STAGE_CLASS, /gap-1/);
    const lastDelay =
      PRE_LOGIN_SCREEN_1_REVEAL_DURATION_MS +
      40 +
      PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.signIn * PRE_LOGIN_SCREEN_1_REVEAL_STEP_MS;
    assert.ok(lastDelay >= 2000 && lastDelay <= 3200);
  });

  it("leaves Screen 2 contracts unchanged", () => {
    assert.equal(PRE_LOGIN_FEATURE_GRID_ROWS_CLASS, "[grid-template-rows:repeat(6,4.25rem)]");
    assert.deepEqual([...PRE_LOGIN_FEATURE_ROW_HEIGHTS_PX], [68, 68, 68, 68, 68, 68]);
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits[0].title,
      "Discover where your music is played",
    );
    const screen2 = componentSrc.slice(
      componentSrc.indexOf("function Screen2("),
      componentSrc.indexOf("export function PreLoginOnboarding"),
    );
    assert.doesNotMatch(screen2, /pre-login-story-/);
  });
});

describe("pre-login onboarding screen 1 story rhythm polish", () => {
  it("replaces the clip card with a standalone non-interactive waveform", () => {
    assert.match(componentSrc, /function Screen1WaveformVisual/);
    assert.match(componentSrc, /pre-login-story-waveform-visual/);
    assert.doesNotMatch(componentSrc, /pre-login-story-clip-visual/);
    assert.doesNotMatch(componentSrc, /function Screen1ClipVisual/);
    const waveform = componentSrc.slice(
      componentSrc.indexOf("function Screen1WaveformVisual"),
      componentSrc.indexOf("function Screen1IdentifiedVisual"),
    );
    assert.match(waveform, /aria-hidden/);
    assert.match(waveform, /<svg/);
    assert.doesNotMatch(waveform, /Play|autoplay|video|fetch\(/i);
    assert.doesNotMatch(waveform, /rounded-md border|shadow-inner/);
  });

  it("preserves the visual pyramid width relationship", () => {
    assert.match(PRE_LOGIN_SCREEN_1_STORY_WAVEFORM_CLASS, /w-\[4\.25rem\]/);
    assert.match(PRE_LOGIN_SCREEN_1_STORY_RELEASE_CARD_CLASS, /w-\[12rem\]/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_1_STORY_WAVEFORM_CLASS, /w-\[12rem\]|w-full/);
    assert.doesNotMatch(PRE_LOGIN_SCREEN_1_STORY_RELEASE_CARD_CLASS, /max-w-\[11rem\]/);
  });

  it("uses the timeless release example with verified artist treatment", () => {
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE.track, "New Release");
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE.artist, "@Artist");
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE.outLabel, "Out 1 Jan");
    assert.doesNotMatch(JSON.stringify(PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE), /202[0-9]/);
    const release = componentSrc.slice(
      componentSrc.indexOf("function Screen1ReleaseVisual"),
      componentSrc.indexOf("function Screen1StoryStage"),
    );
    assert.match(release, /GoldVerifiedTick/);
    assert.match(release, /PRE_LOGIN_SCREEN_1_STORY_RELEASE_CARD_CLASS/);
  });

  it("derives equal stage gaps from shared layout constants", () => {
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_VISUAL_LABEL_GAP_CLASS, "gap-1");
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_TRANSITION_GAP_CLASS, "gap-1");
    assert.match(PRE_LOGIN_SCREEN_1_STORY_CLASS, /gap-1/);
    assert.match(PRE_LOGIN_SCREEN_1_STORY_STAGE_CLASS, /gap-1/);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_1_STORY_CLASS/);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_1_STORY_STAGE_CLASS/);
    assert.match(PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS, /mt-7/);
  });

  it("uses identical slightly longer arrows and preserves reveal-once behaviour", () => {
    assert.match(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /h-\[3\.25rem\]/);
    assert.equal((componentSrc.match(/<JourneyConnector/g) ?? []).length, 2);
    assert.match(componentSrc, /shouldRunScreen1StorySequence/);
    assert.match(componentSrc, /screen1PlayedRef/);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.stage1, 2);
  });

  it("leaves Screen 2 and auth contracts unchanged", () => {
    assert.equal(PRE_LOGIN_FEATURE_GRID_ROWS_CLASS, "[grid-template-rows:repeat(6,4.25rem)]");
    assert.doesNotMatch(helperSrc, /supabase/);
    assert.doesNotMatch(componentSrc, /signUp\(|account_type:/);
  });
});

describe("pre-login onboarding screen 1 final copy polish", () => {
  it("updates release example, labels, and artist supporting copy", () => {
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE.track, "New Release");
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE.artist, "@Artist");
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE.outLabel, "Out 1 Jan");
    assert.equal(PRE_LOGIN_ONBOARDING_COPY.screen1.communityLabel, "Community Member");
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen1.artistSupporting,
      "ID your music and connect it to your releases",
    );
    assert.doesNotMatch(
      JSON.stringify(PRE_LOGIN_ONBOARDING_COPY.screen1),
      /Community member|Midnight Pressure|Find where your music is being played|finally out/,
    );
  });

  it("uses a smaller release-card-only verified tick", () => {
    assert.match(PRE_LOGIN_SCREEN_1_STORY_RELEASE_VERIFIED_TICK_CLASS, /h-2\.5 w-2\.5/);
    const release = componentSrc.slice(
      componentSrc.indexOf("function Screen1ReleaseVisual"),
      componentSrc.indexOf("function Screen1StoryStage"),
    );
    assert.match(release, /PRE_LOGIN_SCREEN_1_STORY_RELEASE_VERIFIED_TICK_CLASS/);
    assert.doesNotMatch(release, /h-3 w-3/);
  });

  it("shows the selection instruction above avatars without shifting journey rhythm", () => {
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen1.selectionInstruction,
      "Choose how you'll use dub hub",
    );
    assert.match(PRE_LOGIN_SCREEN_1_SELECTION_INSTRUCTION_CLASS, /text-sm/);
    assert.match(PRE_LOGIN_SCREEN_1_SELECTION_INSTRUCTION_CLASS, /text-foreground\/70/);
    assert.match(PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS, /mt-7/);
    assert.match(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS, /mt-7/);
    assert.match(componentSrc, /pre-login-selection-instruction/);
    assert.match(componentSrc, /copy\.screen1\.selectionInstruction/);
  });

  it("leaves Screen 2 contracts untouched", () => {
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits[0].title,
      "Discover where your music is played",
    );
    assert.equal(PRE_LOGIN_FEATURE_GRID_ROWS_CLASS, "[grid-template-rows:repeat(6,4.25rem)]");
  });
});

describe("pre-login onboarding screen 1 outer rhythm and instruction reveal", () => {
  it("uses one shared outer-gap token for hero→story and story→instruction", () => {
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_OUTER_GAP_CLASS, "mt-7");
    assert.equal(
      PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS,
      PRE_LOGIN_SCREEN_1_STORY_OUTER_GAP_CLASS,
    );
    assert.ok(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS.startsWith(PRE_LOGIN_SCREEN_1_STORY_OUTER_GAP_CLASS));
    assert.match(helperSrc, /PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS =\s*\n\s*PRE_LOGIN_SCREEN_1_STORY_OUTER_GAP_CLASS/);
  });

  it("leaves internal journey spacing unchanged", () => {
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_TRANSITION_GAP_CLASS, "gap-1");
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_VISUAL_LABEL_GAP_CLASS, "gap-1");
    assert.match(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /h-\[3\.25rem\]/);
  });

  it("reveals the selection instruction after stage 3 and before avatars", () => {
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.stage3, 6);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.selectionInstruction, 7);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.identities, 8);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.signIn, 9);
    assert.match(componentSrc, /slots\.selectionInstruction/);
    assert.match(componentSrc, /screen1ItemReveal\(revealReady, slots\.selectionInstruction/);
    const screen1 = componentSrc.slice(
      componentSrc.indexOf("function Screen1("),
      componentSrc.indexOf("function PerspectiveSwitcher"),
    );
    const instructionIdx = screen1.indexOf("pre-login-selection-instruction");
    const identitiesIdx = screen1.indexOf("pre-login-identity-region");
    assert.ok(instructionIdx >= 0 && identitiesIdx > instructionIdx);
    assert.match(screen1.slice(instructionIdx - 200, instructionIdx + 400), /PRE_LOGIN_STAGGER_ITEM_CLASS/);
    assert.match(screen1.slice(instructionIdx - 200, instructionIdx + 400), /screen1ItemReveal/);
  });

  it("preserves reveal-once and reduced-motion behaviour", () => {
    assert.match(componentSrc, /shouldRunScreen1StorySequence/);
    assert.match(componentSrc, /screen1PlayedRef/);
    assert.match(componentSrc, /resolveScreen1RevealReady/);
  });

  it("leaves Screen 2 contracts untouched", () => {
    assert.equal(PRE_LOGIN_FEATURE_GRID_ROWS_CLASS, "[grid-template-rows:repeat(6,4.25rem)]");
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen2.artistBenefits[0].title,
      "Discover where your music is played",
    );
  });
});

describe("pre-login onboarding screen 1 vertical rhythm adjustment", () => {
  it("tightens in-journey transitions symmetrically via shared gap token", () => {
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_TRANSITION_GAP_CLASS, "gap-1");
    assert.equal(PRE_LOGIN_SCREEN_1_STORY_VISUAL_LABEL_GAP_CLASS, "gap-1");
    assert.match(PRE_LOGIN_SCREEN_1_STORY_CLASS, /gap-1/);
    assert.match(PRE_LOGIN_SCREEN_1_STORY_STAGE_CLASS, /gap-1/);
    assert.match(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, /h-\[3\.25rem\]/);
  });

  it("redistributes recovered space into the journey-to-selection section break", () => {
    assert.equal(PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS, PRE_LOGIN_SCREEN_1_STORY_OUTER_GAP_CLASS);
    assert.match(PRE_LOGIN_SCREEN_1_SELECTION_INSTRUCTION_CLASS, /mb-2/);
    assert.ok(PRE_LOGIN_SCREEN_1_JOURNEY_CLASS.startsWith(PRE_LOGIN_SCREEN_1_STORY_OUTER_GAP_CLASS));
  });

  it("leaves Screen 2 untouched", () => {
    assert.deepEqual([...PRE_LOGIN_FEATURE_ROW_HEIGHTS_PX], [68, 68, 68, 68, 68, 68]);
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen1.selectionInstruction,
      "Choose how you'll use dub hub",
    );
  });
});

describe("pre-login onboarding Slice B — premium material", () => {
  const materialSrc = readFileSync(join(here, "./prelogin-material.ts"), "utf8");
  const cssSrc = readFileSync(join(here, "../index.css"), "utf8");

  it("applies shared premium canvas without flat opaque layer cover", () => {
    assert.match(componentSrc, /PRELOGIN_CANVAS_CLASS/);
    assert.match(componentSrc, /data-prelogin-onboarding=/);
    assert.doesNotMatch(componentSrc, /min-h-screen overflow-hidden bg-\[#0f1324\]/);
    assert.match(PRE_LOGIN_SCREEN_LAYER_CLASS, /bg-transparent/);
    assert.match(PRE_LOGIN_SCREEN_2_LAYER_CLASS, /bg-transparent/);
    assert.match(materialSrc, /PRELOGIN_CANVAS_CLASS = PRELOGIN_AUTH_CANVAS_CLASS/);
  });

  it("migrates generic Sign In + avatar glow to dub hub blue; keeps semantic teal bells", () => {
    const signInExit = componentSrc.slice(
      componentSrc.indexOf("function SignInExit"),
      componentSrc.indexOf("function bindInert"),
    );
    assert.match(signInExit, /PRELOGIN_LINK_CLASS/);
    assert.doesNotMatch(signInExit, /text-accent/);
    assert.match(PRE_LOGIN_AVATAR_GLOW_FILTER, /10, 131, 255/);
    assert.doesNotMatch(PRE_LOGIN_AVATAR_GLOW_FILTER, /74, 233, 223/);
    assert.doesNotMatch(componentSrc, /ring-2 ring-\[#4ae9df\]/);
    assert.match(componentSrc, /text-\[#4ae9df\]/);
  });

  it("upgrades New Release miniature and keeps waveform unboxed", () => {
    assert.match(PRE_LOGIN_SCREEN_1_STORY_RELEASE_CARD_CLASS, /dubhub-prelogin-mini-surface/);
    assert.match(PRE_LOGIN_SCREEN_1_STORY_RELEASE_CARD_CLASS, /w-\[12rem\]/);
    assert.match(cssSrc, /\.dubhub-prelogin-mini-surface/);
    assert.doesNotMatch(cssSrc, /\.dubhub-prelogin-mini-surface[\s\S]{0,200}backdrop-filter/);
    const waveform = componentSrc.slice(
      componentSrc.indexOf("function Screen1WaveformVisual"),
      componentSrc.indexOf("function Screen1IdentifiedVisual"),
    );
    assert.doesNotMatch(waveform, /rounded-md border|shadow-inner|dubhub-prelogin-field/);
  });

  it("preserves Identified green semantics with modest dimensional treatment", () => {
    const identified = componentSrc.slice(
      componentSrc.indexOf("function Screen1IdentifiedVisual"),
      componentSrc.indexOf("function Screen1ReleaseVisual"),
    );
    assert.match(identified, /OnboardingStatusPill status="identified"/);
    assert.match(identified, /34,197,94/);
    assert.doesNotMatch(identified, /#0a83ff|text-\[#0a83ff\]/);
  });

  it("reuses ceramic Get started CTA; feature rows stay editorial not cards", () => {
    assert.match(componentSrc, /PRELOGIN_PRIMARY_CTA_CLASS/);
    assert.doesNotMatch(componentSrc, /button-onboarding-get-started[\s\S]*?size="lg"/);
    assert.match(PRE_LOGIN_FEATURE_ROW_CLASS, /grid-cols-\[7rem/);
    assert.doesNotMatch(PRE_LOGIN_FEATURE_ROW_CLASS, /rounded-xl border|backdrop-blur|shadow-lg/);
    assert.match(PRE_LOGIN_CALLOUT_CLASS, /border-t border-white\/\[0\.08\]/);
    assert.doesNotMatch(PRE_LOGIN_CALLOUT_CLASS, /rounded-xl border border-white|bg-white\/\[0\.04\]/);
  });

  it("keeps avatar glow paint gutter and selectionInstruction in Screen 1 reveal", () => {
    assert.match(PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS, /overflow-visible/);
    assert.match(PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS, /-inset-6/);
    assert.equal(PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.selectionInstruction, 7);
    assert.match(componentSrc, /PRE_LOGIN_SCREEN_1_SELECTION_INSTRUCTION_CLASS/);
    assert.equal(
      PRE_LOGIN_ONBOARDING_COPY.screen1.selectionInstruction,
      "Choose how you'll use dub hub",
    );
  });

  it("does not change reveal-once, reduced motion, or pager thresholds", () => {
    assert.equal(PRE_LOGIN_STAGGER_DURATION_MS, 700);
    assert.equal(PRE_LOGIN_STAGGER_STEP_MS, 260);
    assert.equal(PRE_LOGIN_PAGER_THRESHOLD, 0.28);
    assert.match(componentSrc, /shouldAnimatePerspectiveReveal/);
    assert.match(componentSrc, /markPerspectiveRevealed/);
    assert.match(componentSrc, /prefersReducedMotion/);
  });
});
