/**
 * Device-level first-install onboarding (pre-login).
 * Persists only whether the intro has been seen — never account type.
 */
import { PENDING_NATIVE_AUTH_CALLBACK_KEY } from "@/lib/native-auth-callback-url";

export const PRE_LOGIN_ONBOARDING_SEEN_KEY = "dubhub_pre_login_onboarding_seen";

/** Same key SignIn / auth-callback already use. Read-only for the onboarding gate. */
export const PRE_LOGIN_RECOVERY_INTENT_KEY = "dubhub:auth-recovery-intent";

/** Same key AuthPage already uses for the post-verify Sign In banner. */
export const PRE_LOGIN_EMAIL_VERIFIED_NOTICE_KEY = "dubhub:email-verified-ok";

export type PreLoginOnboardingIntent = "user" | "artist";
export type PreLoginOnboardingScreen = 1 | 2;

export type PreLoginOnboardingUiState = {
  screen: PreLoginOnboardingScreen;
  /** Screen 1 selection — drives signup preselection. */
  intent: PreLoginOnboardingIntent | null;
  /** Screen 2 viewing preference only — must not change intent. */
  viewingPerspective: PreLoginOnboardingIntent;
};

export const INITIAL_PRE_LOGIN_ONBOARDING_UI: PreLoginOnboardingUiState = {
  screen: 1,
  intent: null,
  viewingPerspective: "user",
};

export type PreLoginOnboardingVisual =
  | "unidentifiedPill"
  | "communityIdentifiedPill"
  | "genrePills"
  | "save"
  | "releases"
  | "alerts"
  | "leaderboard"
  | "clips"
  | "artistIdentifiedPill"
  | "alertDemand"
  | "artistTools";

export const PRE_LOGIN_ARTIST_TOOLS_LABEL = "Artist Tools";

export const PRE_LOGIN_ONBOARDING_COPY = {
  screen1: {
    heading: "Still got that video in your camera roll?",
    journeyHear: "Hear a track you like",
    journeyFind: "Find it on dub hub",
    journeyFollow: "Follow it through to release",
    intentPrompt: "Choose how you'll use dub hub",
    selectionInstruction: "Choose how you'll use dub hub",
    communityLabel: "Community Member",
    communitySupporting: "Find, identify and save music",
    artistLabel: "Artist",
    artistSupporting: "ID your music and connect it to your releases",
    signInLead: "Already have an account?",
    signInAction: "Sign in",
  },
  screen2: {
    communityHeading: "For the community",
    communityLead: "Music you've heard once shouldn't disappear forever.",
    artistHeading: "For artists",
    artistLead: "Let your music do the talking.",
    viewCommunity: "Community",
    viewArtists: "Artists",
    back: "Back",
    getStarted: "Get started",
    communityCalloutTitle: "Your next favourite track is waiting to be discovered",
    communityCalloutBody:
      "Join the community of people just like you, who hate scrolling through comments searching for the ID and release date",
    artistHookTitle: "Your artist name may already be waiting",
    artistHookBody:
      "We've reserved usernames for artists just like you. See if yours is one of them",
    communityBenefits: [
      {
        title: "ID the tracks you're looking for",
        body: "Upload clips from sets, events and mixes and let the community help identify them",
        visual: "communityIdentifiedPill" as const satisfies PreLoginOnboardingVisual,
      },
      {
        title: "Find your sound",
        body: "Explore the feed by genre, subgenre and identification status",
        visual: "genrePills" as const satisfies PreLoginOnboardingVisual,
      },
      {
        title: "Save the tracks you love",
        body: "Save tracks to find out when they're identified or released",
        visual: "save" as const satisfies PreLoginOnboardingVisual,
      },
      {
        title: "Follow them through to release",
        body: "Keep track of new music from the first ID to the final release",
        visual: "releases" as const satisfies PreLoginOnboardingVisual,
      },
      {
        title: "Get notified when tracks finally drop",
        body: "Stay updated when the music you've discovered is finally released",
        visual: "alerts" as const satisfies PreLoginOnboardingVisual,
      },
      {
        title: "Climb the Leaderboard to earn rewards",
        body: "Correct IDs can earn event tickets, unreleased dubs and production equipment",
        visual: "leaderboard" as const satisfies PreLoginOnboardingVisual,
      },
    ],
    artistBenefits: [
      {
        title: "Discover where your music is played",
        body: "Find clips of your tracks from sets, events and mixes",
        visual: "clips" as const satisfies PreLoginOnboardingVisual,
      },
      {
        title: "Confirm your tracks",
        body: "Let listeners know when an ID is yours, straight from the source",
        visual: "artistIdentifiedPill" as const satisfies PreLoginOnboardingVisual,
      },
      {
        title: "Connect clips to your releases",
        body: "Connect the moments people found your music to the release they belong to",
        visual: "releases" as const satisfies PreLoginOnboardingVisual,
      },
      {
        title: "Notify the people already waiting",
        body: "When a track drops, notify listeners who've saved clips containing your music",
        visual: "alertDemand" as const satisfies PreLoginOnboardingVisual,
      },
      {
        title: "Climb the Artist Leaderboard",
        body: "Contribute to the community, build your reputation and earn artist rewards",
        visual: "leaderboard" as const satisfies PreLoginOnboardingVisual,
      },
      {
        title: PRE_LOGIN_ARTIST_TOOLS_LABEL,
        body: "Unlimited releases, links, Release Alerts, private IDs and custom icons",
        visual: "artistTools" as const satisfies PreLoginOnboardingVisual,
      },
    ],
  },
} as const;

type StorageGet = Pick<Storage, "getItem"> | null | undefined;
type StorageSet = Pick<Storage, "setItem"> | null | undefined;

function defaultLocalStorage(): StorageGet & StorageSet {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

function defaultSessionStorage(): StorageGet {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

export function hasSeenPreLoginOnboarding(storage: StorageGet = defaultLocalStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(PRE_LOGIN_ONBOARDING_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPreLoginOnboardingSeen(storage: StorageSet = defaultLocalStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(PRE_LOGIN_ONBOARDING_SEEN_KEY, "1");
  } catch {
    // Storage may be unavailable in constrained environments.
  }
}

export function hasPendingEmailVerifiedNotice(
  session: StorageGet = defaultSessionStorage(),
): boolean {
  if (!session) return false;
  try {
    return session.getItem(PRE_LOGIN_EMAIL_VERIFIED_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function hasPendingRecoveryIntent(
  session: StorageGet = defaultSessionStorage(),
): boolean {
  if (!session) return false;
  try {
    return session.getItem(PRE_LOGIN_RECOVERY_INTENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function hasPendingNativeAuthCallback(
  session: StorageGet = defaultSessionStorage(),
): boolean {
  if (!session) return false;
  try {
    const value = session.getItem(PENDING_NATIVE_AUTH_CALLBACK_KEY);
    return !!value && value.trim().length > 0;
  } catch {
    return false;
  }
}

export function shouldShowPreLoginOnboarding(args: {
  isAuthenticated?: boolean;
  routePath?: string;
  hasRecoveryIntent?: boolean;
  hasEmailVerifiedNotice?: boolean;
  hasPendingNativeAuthCallback?: boolean;
  storage?: StorageGet;
} = {}): boolean {
  if (args.isAuthenticated) return false;

  const path = (args.routePath ?? "").split(/[?#]/)[0].toLowerCase();
  if (path === "/auth-callback" || path.startsWith("/auth-callback/")) return false;
  if (path === "/reset-password") return false;
  if (args.hasRecoveryIntent) return false;
  if (args.hasEmailVerifiedNotice) return false;
  if (args.hasPendingNativeAuthCallback) return false;

  return !hasSeenPreLoginOnboarding(args.storage ?? defaultLocalStorage());
}

export function applyScreen1Intent(
  _state: PreLoginOnboardingUiState,
  intent: PreLoginOnboardingIntent,
): PreLoginOnboardingUiState {
  return {
    screen: 2,
    intent,
    viewingPerspective: intent,
  };
}

export function applyScreen2Perspective(
  state: PreLoginOnboardingUiState,
  perspective: PreLoginOnboardingIntent,
): PreLoginOnboardingUiState {
  return {
    ...state,
    viewingPerspective: perspective,
  };
}

export function applyBackToScreen1(
  state: PreLoginOnboardingUiState,
): PreLoginOnboardingUiState {
  return {
    ...state,
    screen: 1,
  };
}

/** Signup preselection from Screen 1 intent only — never from Screen 2 viewing. */
export function resolveSignupAccountType(
  intent: PreLoginOnboardingIntent | null,
): PreLoginOnboardingIntent | undefined {
  if (intent === "user" || intent === "artist") return intent;
  return undefined;
}

export function screen2LiveStatus(state: PreLoginOnboardingUiState): string {
  if (state.screen === 1) return PRE_LOGIN_ONBOARDING_COPY.screen1.heading;
  return state.viewingPerspective === "artist"
    ? PRE_LOGIN_ONBOARDING_COPY.screen2.artistHeading
    : PRE_LOGIN_ONBOARDING_COPY.screen2.communityHeading;
}

/** Shared Screen 1 / Screen 2 brand-anchor size — do not diverge per screen. */
export const PRE_LOGIN_LOGO_SIZE = "xl" as const;

/** Shared Screen 1 / Screen 2 brand-anchor. mb-4 matches Screen 2 section rhythm. */
export const PRE_LOGIN_BRAND_ANCHOR_CLASS =
  "mb-4 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center pt-1";

/** Shared Screen 2 perspective identity-button geometry. */
export const PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS =
  "relative flex min-h-11 min-w-11 flex-col items-center justify-center overflow-visible h-[4.5rem] gap-1 px-2 py-1.5 text-sm font-medium leading-none";
export const PRE_LOGIN_PERSPECTIVE_SWITCHER_CLASS =
  "mb-2 flex h-[4.5rem] items-center justify-center gap-8 overflow-visible";

/**
 * Screen-layer host. -mx-4 borrows the auth canvas px-4 gutter as paint room for
 * Screen 2 pill glows without moving in-flow content (Screen 1 is re-inset separately).
 */
export const PRE_LOGIN_SCREEN_LAYERS_CLASS =
  "relative isolate min-h-0 flex-1 overflow-hidden -mx-4";
/** Keeps Screen 1 on the original content width after the host borrows the gutter. */
export const PRE_LOGIN_SCREEN_1_CLIP_CLASS =
  "absolute inset-y-0 left-4 right-4 overflow-hidden";

/** Screen 1 / generic clipped layer box — transparent so parent canvas shows through. */
export const PRE_LOGIN_SCREEN_LAYER_CLASS =
  "absolute inset-0 overflow-x-hidden overflow-y-auto scrollbar-hide bg-transparent";

/** Screen 2 shell — clips transitions; vertical scroll lives in PRE_LOGIN_SCREEN_2_SCROLL_CLASS. */
export const PRE_LOGIN_SCREEN_2_LAYER_CLASS =
  "absolute inset-0 flex flex-col overflow-hidden bg-transparent";
/** Fixed switcher host outside the vertical scrollport (avatar glow paint room). */
export const PRE_LOGIN_SCREEN_2_SWITCHER_HOST_CLASS =
  "shrink-0 overflow-visible px-4 pt-4";
/** Scrollport for perspective pager content only — switcher and CTA stay outside. */
export const PRE_LOGIN_SCREEN_2_SCROLL_CLASS =
  "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scrollbar-hide";

export const PRE_LOGIN_SCREEN_TRANSITION_CLASS =
  "motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-opacity motion-reduce:duration-150 motion-reduce:translate-x-0";

export const PRE_LOGIN_PERSPECTIVE_TRANSITION_CLASS =
  "motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-opacity motion-reduce:duration-150 motion-reduce:translate-x-0";

export const PRE_LOGIN_IDENTITY_PRESS_CLASS =
  "motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.97] motion-reduce:active:scale-100";

/** Screen 1 fixed inter-zone rhythm — journey is not flex-centred. */
export const PRE_LOGIN_SCREEN_1_TOP_CLASS = "shrink-0 pt-3";
/** ~+10px headline delta without growing the TOP flex zone (audit target). */
export const PRE_LOGIN_SCREEN_1_HEADLINE_CLASS = "mt-2.5";
/** Equal outer padding above and below the complete story block (hero→waveform == final label→instruction). */
export const PRE_LOGIN_SCREEN_1_STORY_OUTER_GAP_CLASS = "mt-7";
/** Explicit gap: headline block → product story (waveform top). */
export const PRE_LOGIN_SCREEN_1_JOURNEY_CLASS =
  `${PRE_LOGIN_SCREEN_1_STORY_OUTER_GAP_CLASS} shrink-0 flex flex-col items-center`;
/** Explicit gap: final journey label → selection instruction. */
export const PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS =
  PRE_LOGIN_SCREEN_1_STORY_OUTER_GAP_CLASS;
/** Shared in-story transition rhythm: label → arrow and arrow → next visual. */
export const PRE_LOGIN_SCREEN_1_STORY_TRANSITION_GAP_CLASS = "gap-1";
/** Shared visual → label rhythm within every story stage. */
export const PRE_LOGIN_SCREEN_1_STORY_VISUAL_LABEL_GAP_CLASS = "gap-1";
export const PRE_LOGIN_SCREEN_1_STORY_CLASS = `flex flex-col items-center ${PRE_LOGIN_SCREEN_1_STORY_TRANSITION_GAP_CLASS}`;
export const PRE_LOGIN_SCREEN_1_STORY_STAGE_CLASS = `flex flex-col items-center ${PRE_LOGIN_SCREEN_1_STORY_VISUAL_LABEL_GAP_CLASS}`;
export const PRE_LOGIN_SCREEN_1_STORY_VISUAL_SLOT_CLASS =
  "flex items-center justify-center";
/** Smallest pyramid tier — ~75–85% of Identified pill intrinsic width. Soft silver + quiet blue-white bloom. */
export const PRE_LOGIN_SCREEN_1_STORY_WAVEFORM_CLASS =
  "h-6 w-[4.25rem] shrink-0 drop-shadow-[0_0_10px_rgba(255,255,255,0.16)] drop-shadow-[0_0_18px_rgba(10,131,255,0.12)]";
/** Widest pyramid tier — premium indigo mini surface (not an input). */
export const PRE_LOGIN_SCREEN_1_STORY_RELEASE_CARD_CLASS =
  "dubhub-prelogin-mini-surface flex w-[12rem] items-center gap-2 rounded-[12px] px-2 py-1.5";
export const PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE = {
  track: "New Release",
  artist: "@Artist",
  outLabel: "Out 1 Jan",
} as const;
/** Supporting marks on the mock release date row. Smaller than feed link icons. */
export const PRE_LOGIN_SCREEN_1_STORY_RELEASE_PLATFORMS = [
  "spotify",
  "apple_music",
  "beatport",
  "soundcloud",
] as const;
export const PRE_LOGIN_SCREEN_1_STORY_RELEASE_PLATFORM_ICON_CLASS = "h-2.5 w-2.5";
export const PRE_LOGIN_SCREEN_1_SELECTION_INSTRUCTION_CLASS =
  "mb-2 text-center text-sm font-medium leading-snug text-foreground/70";
export const PRE_LOGIN_SCREEN_1_BOTTOM_CLASS = "shrink-0 pb-2";
/** @deprecated Slice 15 — journey no longer lives in a flex-1 centred middle zone. */
export const PRE_LOGIN_SCREEN_1_MIDDLE_CLASS =
  "shrink-0 flex flex-col items-center";
export const PRE_LOGIN_IDENTITY_LABEL_CLASS =
  "mt-3 text-center text-[15px] font-semibold leading-snug";
export const PRE_LOGIN_JOURNEY_STEP_CLASS =
  "text-center text-[15px] font-semibold leading-snug text-foreground/90";
/** ↓ stem — compact enough for polished stack, still reads as journey flow. */
export const PRE_LOGIN_JOURNEY_CONNECTOR_CLASS =
  "flex h-[3.25rem] items-center justify-center text-base leading-none text-white/40";
export const PRE_LOGIN_JOURNEY_ARROW_CLASS = PRE_LOGIN_JOURNEY_CONNECTOR_CLASS;

export const PRE_LOGIN_HEADING_BLOCK_CLASS =
  "shrink-0 min-h-[3.25rem]";
export const PRE_LOGIN_STRAPLINE_CLASS =
  "mt-0.5 text-sm italic leading-snug text-muted-foreground";

/** iPhone 17 Pro Max class viewport — compact rhythm without typography reduction. */
export const PRE_LOGIN_SCREEN_2_COMPACT_MIN_HEIGHT_PX = 844;

/**
 * Shared six uniform feature row heights (px) at 4.25rem — no undersized 52px tracks.
 */
export const PRE_LOGIN_FEATURE_ROW_HEIGHTS_PX = [68, 68, 68, 68, 68, 68] as const;
export const PRE_LOGIN_FEATURE_GRID_ROWS_CLASS =
  "[grid-template-rows:repeat(6,4.25rem)]";
/** Uniform gap between every feature row (row N bottom → row N+1 top). */
export const PRE_LOGIN_FEATURE_ROW_GAP_CLASS = "gap-y-1";

/** Shared 6-row two-column frame. One template for both perspectives. */
export const PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS = "mt-1";
export const PRE_LOGIN_FEATURE_LIST_CLASS =
  `${PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS} grid shrink-0 ${PRE_LOGIN_FEATURE_ROW_GAP_CLASS} overflow-visible ${PRE_LOGIN_FEATURE_GRID_ROWS_CLASS}`;
/** Text top-anchored in slot; visual column centres in the full row height. */
export const PRE_LOGIN_FEATURE_ROW_CLASS =
  "grid h-full min-h-0 max-h-full grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-3 overflow-visible";
export const PRE_LOGIN_FEATURE_VISUAL_COL_CLASS =
  "flex h-full min-h-0 w-full items-center justify-center overflow-visible self-stretch";
export const PRE_LOGIN_FEATURE_TEXT_COL_CLASS = "min-w-0 self-start text-left";
export const PRE_LOGIN_FEATURE_TITLE_CLASS =
  "text-sm font-semibold leading-snug text-foreground";
/** Natural body height — min-height removed so 68px slots fit without painted overflow. */
export const PRE_LOGIN_FEATURE_BODY_CLASS =
  "mt-0.5 text-[13px] leading-snug text-muted-foreground";

/** Closing callout — hairline separation; natural height (no oversized min-h reserve). */
export const PRE_LOGIN_CALLOUT_CLASS =
  `${PRE_LOGIN_FEATURE_BLOCK_GAP_CLASS} shrink-0 border-t border-white/[0.08] pt-2.5 pb-1 text-left`;
export const PRE_LOGIN_CALLOUT_TITLE_CLASS =
  "text-sm font-semibold leading-snug text-foreground";
export const PRE_LOGIN_CALLOUT_BODY_CLASS =
  "mt-0.5 text-[13px] leading-snug text-muted-foreground";

export const PRE_LOGIN_SCREEN_2_PAGER_CLASS =
  "flex min-h-0 flex-1 flex-col overflow-x-hidden touch-pan-y";
export const PRE_LOGIN_SCREEN_2_CONTENT_INSET_CLASS = "px-4";
/** Breathing room above Get started; compact bottom pad. */
export const PRE_LOGIN_SCREEN_2_CTA_CLASS = "shrink-0 pt-2.5 pb-1.5 px-4";
export const PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS = "mt-1";

export const PRE_LOGIN_AVATAR_SELECTED_SCALE = 1.12;
/** Selected avatar ambient glow — dub hub blue family (not teal accent). */
export const PRE_LOGIN_AVATAR_GLOW_FILTER =
  "drop-shadow(0 0 6px rgba(10, 131, 255, 0.38)) drop-shadow(0 0 14px rgba(10, 131, 255, 0.2))";
/** Screen 1 Artist role chooser. Same radii as the blue glow, quieter gold. */
export const PRE_LOGIN_AVATAR_GOLD_GLOW_FILTER =
  "drop-shadow(0 0 6px rgba(255, 215, 0, 0.28)) drop-shadow(0 0 14px rgba(255, 215, 0, 0.14))";
export const PRE_LOGIN_AVATAR_MOTION_MS = 200;
export const PRE_LOGIN_AVATAR_MOTION_CLASS =
  "motion-safe:transition-[transform,filter] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none";
/** Label colour on the Screen 2 switcher. Avatar scale and glow do not use this transition. */
export const PRE_LOGIN_AVATAR_PROGRESS_MOTION_MS = 300;
export const PRE_LOGIN_AVATAR_PROGRESS_MOTION_CLASS =
  "motion-safe:transition-[transform,filter,color] motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none";
/** Fixed layout slot. Overflow stays visible so scaled/glowing inner visual cannot reflow or clip. */
export const PRE_LOGIN_AVATAR_SLOT_SCREEN1_CLASS =
  "relative flex h-24 w-24 min-[400px]:h-[6.75rem] min-[400px]:w-[6.75rem] items-center justify-center overflow-visible";
export const PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS =
  "relative flex h-9 w-9 items-center justify-center overflow-visible";
/**
 * Expanded glow paint box inside the fixed avatar slot.
 * Filter stays on this non-transformed wrapper; scale stays on the img child so
 * WebKit does not hard-clip combined filter+transform paint output.
 */
export const PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS =
  "pointer-events-none absolute -inset-6 flex items-center justify-center overflow-visible";
/** @deprecated Use PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS */
export const PRE_LOGIN_AVATAR_VISUAL_CLASS = PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS;
export const PRE_LOGIN_AVATAR_GLOW_PAINT_INSET_PX = 24;
export const PRE_LOGIN_AVATAR_IMAGE_SCREEN1_CLASS =
  "h-24 w-24 min-[400px]:h-[6.75rem] min-[400px]:w-[6.75rem]";
export const PRE_LOGIN_AVATAR_IMAGE_SCREEN2_CLASS = "h-9 w-9";
export const PRE_LOGIN_BACK_ICON_CLASS = "h-7 w-7 text-white";

export function preLoginAvatarTransformStyle(selected: boolean): { transform: string } {
  return {
    transform: selected ? `scale(${PRE_LOGIN_AVATAR_SELECTED_SCALE})` : "scale(1)",
  };
}

export function preLoginAvatarGlowStyle(
  selected: boolean,
  tone: "blue" | "gold" = "blue",
): { filter: string } {
  if (!selected) return { filter: "none" };
  return {
    filter: tone === "gold" ? PRE_LOGIN_AVATAR_GOLD_GLOW_FILTER : PRE_LOGIN_AVATAR_GLOW_FILTER,
  };
}

export function preLoginAvatarEmphasisStyle(selected: boolean): {
  transform: string;
  filter: string;
} {
  return {
    ...preLoginAvatarTransformStyle(selected),
    ...preLoginAvatarGlowStyle(selected),
  };
}

/** Screen 1 shows selection only while it is the active screen. Prevents a flash during Screen 1 → 2. */
export function shouldShowScreen1Selection(state: PreLoginOnboardingUiState): boolean {
  return state.screen === 1 && state.intent !== null;
}

export const PRE_LOGIN_STAGGER_DURATION_MS = 700;
export const PRE_LOGIN_STAGGER_STEP_MS = 260;
export const PRE_LOGIN_STAGGER_INITIAL_DELAY_MS = 100;
export const PRE_LOGIN_STAGGER_TRANSLATE_PX = 6;
export const PRE_LOGIN_STAGGER_EASING = "cubic-bezier(0.25, 0.1, 0.25, 1)";
export const PRE_LOGIN_SCREEN_1_REVEAL_DURATION_MS = 650;
export const PRE_LOGIN_SCREEN_1_REVEAL_STEP_MS = 320;
export const PRE_LOGIN_SCREEN_1_REVEAL_INITIAL_DELAY_MS = 40;
export const PRE_LOGIN_SCREEN_1_REVEAL_TRANSLATE_PX = 3;
export const PRE_LOGIN_SCREEN_1_REVEAL_SLOTS = {
  logo: 0,
  headline: 1,
  stage1: 2,
  arrow1: 3,
  stage2: 4,
  arrow2: 5,
  stage3: 6,
  selectionInstruction: 7,
  identities: 8,
  signIn: 9,
} as const;
/** Duration/easing live on inline styles — do not use arbitrary Tailwind duration classes. */
export const PRE_LOGIN_STAGGER_ITEM_CLASS =
  "motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:opacity-100";

export const PRE_LOGIN_PAGER_THRESHOLD = 0.28;
export const PRE_LOGIN_PAGER_FLICK_PX_PER_MS = 0.7;
export const PRE_LOGIN_PAGER_FLICK_MIN_PX = 56;
export const PRE_LOGIN_PAGER_SLOP_PX = 10;
export const PRE_LOGIN_PAGER_SNAP_CLASS =
  "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none";

export function lockPerspectivePagerAxis(
  dx: number,
  dy: number,
  slopPx: number = PRE_LOGIN_PAGER_SLOP_PX,
): "x" | "y" | null {
  if (Math.abs(dx) < slopPx && Math.abs(dy) < slopPx) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

export function resolvePerspectivePagerCommit(args: {
  from: PreLoginOnboardingIntent;
  dx: number;
  width: number;
  vx: number;
}): PreLoginOnboardingIntent {
  const width = Math.max(1, args.width);
  const distanceOk = Math.abs(args.dx) >= width * PRE_LOGIN_PAGER_THRESHOLD;
  const flickOk =
    Math.abs(args.vx) >= PRE_LOGIN_PAGER_FLICK_PX_PER_MS &&
    Math.abs(args.dx) >= PRE_LOGIN_PAGER_FLICK_MIN_PX;
  if (!distanceOk && !flickOk) return args.from;
  if (args.dx < 0 && args.from === "user") return "artist";
  if (args.dx > 0 && args.from === "artist") return "user";
  return args.from;
}

export function perspectivePagerTranslatePx(
  viewing: PreLoginOnboardingIntent,
  panDx: number,
  width: number,
): number {
  const pageWidth = Math.max(0, width);
  const base = viewing === "artist" ? -pageWidth : 0;
  const next = base + panDx;
  if (next > 0) return 0;
  if (next < -pageWidth) return -pageWidth;
  return next;
}

export function clampPreLoginEmphasis(strength: number): number {
  if (!Number.isFinite(strength)) return 0;
  return Math.min(1, Math.max(0, strength));
}

/** Community = 0, Artist = 1. Settled pages sit on the endpoints. */
export function perspectivePagerArtistProgress(args: {
  viewing: PreLoginOnboardingIntent;
  panning: boolean;
  panDx: number;
  width: number;
}): number {
  if (!args.panning || args.width <= 0) {
    return args.viewing === "artist" ? 1 : 0;
  }
  const width = Math.max(1, args.width);
  const translate = perspectivePagerTranslatePx(args.viewing, args.panDx, width);
  return clampPreLoginEmphasis(-translate / width);
}

export function preLoginPerspectiveEmphasis(artistProgress: number): {
  community: number;
  artist: number;
} {
  const artist = clampPreLoginEmphasis(artistProgress);
  return { community: 1 - artist, artist };
}

function formatEmphasisUnit(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** Always a drop-shadow pair so strength can blend. Never switches through `none`. */
export function preLoginAvatarGlowFilterForStrength(
  strength: number,
  tone: "blue" | "gold" = "blue",
): string {
  const t = clampPreLoginEmphasis(strength);
  const nearAlpha = tone === "gold" ? 0.28 : 0.38;
  const farAlpha = tone === "gold" ? 0.14 : 0.2;
  const rgb = tone === "gold" ? "255, 215, 0" : "10, 131, 255";
  const near = formatEmphasisUnit(nearAlpha * t);
  const far = formatEmphasisUnit(farAlpha * t);
  return `drop-shadow(0 0 6px rgba(${rgb}, ${near})) drop-shadow(0 0 14px rgba(${rgb}, ${far}))`;
}

/** Ease-out cubic. Stays between the endpoints, with no overshoot. */
export function preLoginEmphasisAt(args: {
  from: number;
  to: number;
  elapsedMs: number;
  durationMs: number;
}): number {
  const from = clampPreLoginEmphasis(args.from);
  const to = clampPreLoginEmphasis(args.to);
  if (!(args.durationMs > 0) || args.elapsedMs >= args.durationMs) return to;
  if (args.elapsedMs <= 0) return from;
  const progress = args.elapsedMs / args.durationMs;
  const eased = 1 - (1 - progress) ** 3;
  return clampPreLoginEmphasis(from + (to - from) * eased);
}

export function preLoginAvatarTransformForStrength(strength: number): string {
  const t = clampPreLoginEmphasis(strength);
  const scale = 1 + (PRE_LOGIN_AVATAR_SELECTED_SCALE - 1) * t;
  return `scale(${formatEmphasisUnit(scale)})`;
}

/** Mixes the existing foreground and muted-foreground tokens. No new colors. */
export function preLoginPerspectiveLabelColor(strength: number): string {
  const pct = formatEmphasisUnit(clampPreLoginEmphasis(strength) * 100);
  return `color-mix(in srgb, var(--foreground) ${pct}%, var(--muted-foreground))`;
}

export function featureStaggerDelayMs(slotIndex: number): number {
  return PRE_LOGIN_STAGGER_INITIAL_DELAY_MS + Math.max(0, slotIndex) * PRE_LOGIN_STAGGER_STEP_MS;
}

export function screen1RevealDelayMs(slotIndex: number): number {
  return (
    PRE_LOGIN_SCREEN_1_REVEAL_INITIAL_DELAY_MS +
    Math.max(0, slotIndex) * PRE_LOGIN_SCREEN_1_REVEAL_STEP_MS
  );
}

/** Screen 1 story sequence runs once per mounted onboarding session (not on Back). */
export function shouldRunScreen1StorySequence(
  alreadyPlayed: boolean,
  reduceMotion: boolean,
): boolean {
  return !alreadyPlayed && !reduceMotion;
}

export function resolveScreen1RevealReady(args: {
  alreadyPlayed: boolean;
  reduceMotion: boolean;
  animate: boolean;
}): boolean {
  if (args.reduceMotion || args.alreadyPlayed) return true;
  return args.animate;
}

export type PreLoginRevealTiming = {
  durationMs: number;
  stepMs: number;
  initialDelayMs: number;
  translatePx: number;
  easing: string;
};

export const PRE_LOGIN_FEATURE_REVEAL_TIMING: PreLoginRevealTiming = {
  durationMs: PRE_LOGIN_STAGGER_DURATION_MS,
  stepMs: PRE_LOGIN_STAGGER_STEP_MS,
  initialDelayMs: PRE_LOGIN_STAGGER_INITIAL_DELAY_MS,
  translatePx: PRE_LOGIN_STAGGER_TRANSLATE_PX,
  easing: PRE_LOGIN_STAGGER_EASING,
};

export const PRE_LOGIN_SCREEN_1_REVEAL_TIMING: PreLoginRevealTiming = {
  durationMs: PRE_LOGIN_SCREEN_1_REVEAL_DURATION_MS,
  stepMs: PRE_LOGIN_SCREEN_1_REVEAL_STEP_MS,
  initialDelayMs: PRE_LOGIN_SCREEN_1_REVEAL_INITIAL_DELAY_MS,
  translatePx: PRE_LOGIN_SCREEN_1_REVEAL_TRANSLATE_PX,
  easing: PRE_LOGIN_STAGGER_EASING,
};

export type PreLoginFeatureRevealStyle = {
  opacity: number;
  transform: string;
  transitionProperty: string;
  transitionDuration: string;
  transitionTimingFunction: string;
  transitionDelay: string;
};

/** Deterministic reveal contract. Inline so Tailwind cannot drop the duration. */
export function preLoginRevealStyle(
  ready: boolean,
  slotIndex: number,
  timing: PreLoginRevealTiming = PRE_LOGIN_FEATURE_REVEAL_TIMING,
): PreLoginFeatureRevealStyle {
  const delay = timing.initialDelayMs + Math.max(0, slotIndex) * timing.stepMs;
  return {
    opacity: ready ? 1 : 0,
    transform: ready ? "translateY(0)" : `translateY(${timing.translatePx}px)`,
    transitionProperty: "opacity, transform",
    transitionDuration: `${timing.durationMs}ms`,
    transitionTimingFunction: timing.easing,
    transitionDelay: ready ? `${delay}ms` : "0ms",
  };
}

export function preLoginFeatureRevealStyle(
  ready: boolean,
  slotIndex: number,
): PreLoginFeatureRevealStyle {
  return preLoginRevealStyle(ready, slotIndex, PRE_LOGIN_FEATURE_REVEAL_TIMING);
}

export function preLoginScreen1RevealStyle(
  ready: boolean,
  slotIndex: number,
): PreLoginFeatureRevealStyle {
  return preLoginRevealStyle(ready, slotIndex, PRE_LOGIN_SCREEN_1_REVEAL_TIMING);
}

export type PreLoginRevealPlayed = {
  user: boolean;
  artist: boolean;
};

export const INITIAL_PRE_LOGIN_REVEAL_PLAYED: PreLoginRevealPlayed = {
  user: false,
  artist: false,
};

export function shouldAnimatePerspectiveReveal(
  played: PreLoginRevealPlayed,
  perspective: PreLoginOnboardingIntent,
  reduceMotion: boolean,
): boolean {
  if (reduceMotion) return false;
  return perspective === "artist" ? !played.artist : !played.user;
}

export function markPerspectiveRevealed(
  played: PreLoginRevealPlayed,
  perspective: PreLoginOnboardingIntent,
): PreLoginRevealPlayed {
  if (perspective === "artist") return { ...played, artist: true };
  return { ...played, user: true };
}
