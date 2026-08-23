import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  Clock,
  Film,
  Heart,
  Trophy,
} from "lucide-react";
import { ArtistToolsMark } from "@/components/artist-tools-mark";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { GoldVerifiedTick } from "@/components/verified-artist";
import AuthPage from "@/pages/auth";
import { AUTH_SURFACE_CLASS } from "@/lib/auth-surface";
import { getDefaultAvatarPublicUrl } from "@/lib/default-avatar";
import {
  getGenreChipStyle,
  getGenreGlowPillStyle,
  STATUS_GLOW_PILL_BG,
} from "@/lib/genre-styles";
import { peekPendingNativeAuthCallbackUrl } from "@/lib/native-auth-callback-url";
import {
  PRELOGIN_CANVAS_CLASS,
  PRELOGIN_LINK_CLASS,
  PRELOGIN_PRIMARY_CTA_CLASS,
} from "@/lib/prelogin-material";
import {
  INITIAL_PRE_LOGIN_ONBOARDING_UI,
  INITIAL_PRE_LOGIN_REVEAL_PLAYED,
  PRE_LOGIN_AVATAR_MOTION_CLASS,
  PRE_LOGIN_AVATAR_IMAGE_SCREEN1_CLASS,
  PRE_LOGIN_AVATAR_IMAGE_SCREEN2_CLASS,
  PRE_LOGIN_AVATAR_SLOT_SCREEN1_CLASS,
  PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS,
  PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS,
  PRE_LOGIN_BACK_ICON_CLASS,
  PRE_LOGIN_BRAND_ANCHOR_CLASS,
  PRE_LOGIN_CALLOUT_BODY_CLASS,
  PRE_LOGIN_CALLOUT_CLASS,
  PRE_LOGIN_CALLOUT_TITLE_CLASS,
  PRE_LOGIN_FEATURE_BODY_CLASS,
  PRE_LOGIN_FEATURE_LIST_CLASS,
  PRE_LOGIN_FEATURE_ROW_CLASS,
  PRE_LOGIN_FEATURE_TEXT_COL_CLASS,
  PRE_LOGIN_FEATURE_TITLE_CLASS,
  PRE_LOGIN_FEATURE_VISUAL_COL_CLASS,
  PRE_LOGIN_HEADING_BLOCK_CLASS,
  PRE_LOGIN_IDENTITY_LABEL_CLASS,
  PRE_LOGIN_IDENTITY_PRESS_CLASS,
  PRE_LOGIN_JOURNEY_CONNECTOR_CLASS,
  PRE_LOGIN_JOURNEY_STEP_CLASS,
  PRE_LOGIN_LOGO_SIZE,
  PRE_LOGIN_ONBOARDING_COPY,
  PRE_LOGIN_PAGER_SNAP_CLASS,
  PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS,
  PRE_LOGIN_PERSPECTIVE_SWITCHER_CLASS,
  PRE_LOGIN_SCREEN_1_CLIP_CLASS,
  PRE_LOGIN_SCREEN_1_BOTTOM_CLASS,
  PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS,
  PRE_LOGIN_SCREEN_1_HEADLINE_CLASS,
  PRE_LOGIN_SCREEN_1_JOURNEY_CLASS,
  PRE_LOGIN_SCREEN_1_REVEAL_SLOTS,
  PRE_LOGIN_SCREEN_1_STORY_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_RELEASE_CARD_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_STAGE_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_VISUAL_SLOT_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_WAVEFORM_CLASS,
  PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE,
  PRE_LOGIN_SCREEN_1_STORY_RELEASE_VERIFIED_TICK_CLASS,
  PRE_LOGIN_SCREEN_1_SELECTION_INSTRUCTION_CLASS,
  PRE_LOGIN_SCREEN_1_TOP_CLASS,
  PRE_LOGIN_SCREEN_2_CONTENT_INSET_CLASS,
  PRE_LOGIN_SCREEN_2_CTA_CLASS,
  PRE_LOGIN_SCREEN_2_PAGER_CLASS,
  PRE_LOGIN_SCREEN_2_LAYER_CLASS,
  PRE_LOGIN_SCREEN_2_SCROLL_CLASS,
  PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS,
  PRE_LOGIN_SCREEN_2_SWITCHER_HOST_CLASS,
  PRE_LOGIN_SCREEN_LAYERS_CLASS,
  PRE_LOGIN_SCREEN_LAYER_CLASS,
  PRE_LOGIN_SCREEN_TRANSITION_CLASS,
  PRE_LOGIN_STAGGER_ITEM_CLASS,
  PRE_LOGIN_STRAPLINE_CLASS,
  applyBackToScreen1,
  applyScreen1Intent,
  applyScreen2Perspective,
  hasPendingEmailVerifiedNotice,
  hasPendingRecoveryIntent,
  lockPerspectivePagerAxis,
  markPerspectiveRevealed,
  markPreLoginOnboardingSeen,
  perspectivePagerTranslatePx,
  preLoginAvatarGlowStyle,
  preLoginAvatarTransformStyle,
  preLoginFeatureRevealStyle,
  preLoginScreen1RevealStyle,
  resolveScreen1RevealReady,
  resolvePerspectivePagerCommit,
  resolveSignupAccountType,
  screen2LiveStatus,
  shouldAnimatePerspectiveReveal,
  shouldRunScreen1StorySequence,
  shouldShowPreLoginOnboarding,
  shouldShowScreen1Selection,
  type PreLoginOnboardingIntent,
  type PreLoginOnboardingUiState,
  type PreLoginOnboardingVisual,
  type PreLoginRevealPlayed,
} from "@/lib/pre-login-onboarding";
import { cn } from "@/lib/utils";

const copy = PRE_LOGIN_ONBOARDING_COPY;
const COMMUNITY_AVATAR_URL = getDefaultAvatarPublicUrl("user");
const ARTIST_AVATAR_URL = getDefaultAvatarPublicUrl("artist");

const MINI_STATUS_PILL_CLASS =
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[10px] font-semibold leading-snug ring-1 ring-white/15";
const MINI_GENRE_PILL_CLASS =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-1.5 py-1 text-[10px] font-semibold leading-snug ring-1 ring-white/15";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function DefaultRoleAvatar({
  role,
  className,
  testId,
  style,
}: {
  role: PreLoginOnboardingIntent;
  className?: string;
  testId?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={role === "artist" ? ARTIST_AVATAR_URL : COMMUNITY_AVATAR_URL}
      alt=""
      aria-hidden
      data-testid={testId}
      className={cn("rounded-full object-cover", className)}
      style={style}
    />
  );
}

function EmphasizedRoleAvatar({
  role,
  emphasize,
  slotClassName,
  imageClassName,
  testId,
}: {
  role: PreLoginOnboardingIntent;
  emphasize: boolean;
  slotClassName: string;
  imageClassName: string;
  testId?: string;
}) {
  return (
    <span className={slotClassName}>
      <span
        className={cn(PRE_LOGIN_AVATAR_GLOW_WRAPPER_CLASS, PRE_LOGIN_AVATAR_MOTION_CLASS)}
        style={preLoginAvatarGlowStyle(emphasize)}
      >
        <DefaultRoleAvatar
          role={role}
          testId={testId}
          className={cn(imageClassName, PRE_LOGIN_AVATAR_MOTION_CLASS)}
          style={preLoginAvatarTransformStyle(emphasize)}
        />
      </span>
    </span>
  );
}

function OnboardingStatusPill({
  status,
}: {
  status: "identified" | "unidentified" | "artistIdentified";
}) {
  const unidentified = status === "unidentified";
  const artistIdentified = status === "artistIdentified";
  return (
    <span
      className={MINI_STATUS_PILL_CLASS}
      data-compact-status-sample=""
      data-testid={unidentified ? "onboarding-mini-unidentified" : "onboarding-mini-identified"}
      style={getGenreGlowPillStyle(
        unidentified ? STATUS_GLOW_PILL_BG.unidentified : STATUS_GLOW_PILL_BG.identified,
        "text-white",
      )}
    >
      {unidentified ? (
        <Clock className="h-3 w-3 shrink-0" />
      ) : artistIdentified ? (
        <GoldVerifiedTick className="h-3 w-3" glow="inline" />
      ) : (
        <Check className="h-3 w-3 shrink-0 text-white" />
      )}
      {unidentified ? "Unidentified" : "Identified"}
    </span>
  );
}

function OnboardingGenrePills() {
  const dnb = getGenreChipStyle("dnb");
  const ukg = getGenreChipStyle("ukg");
  const house = getGenreChipStyle("house");
  return (
    <span className="mx-auto flex w-max flex-col items-center gap-0.5" data-testid="onboarding-mini-genre-pills">
      <span className="flex items-center justify-center gap-0.5" data-testid="onboarding-mini-genre-row-1">
        <span
          className={MINI_GENRE_PILL_CLASS}
          style={getGenreGlowPillStyle(dnb.bgColor, dnb.textClass)}
        >
          {dnb.label}
        </span>
        <span
          className={MINI_GENRE_PILL_CLASS}
          style={getGenreGlowPillStyle(ukg.bgColor, ukg.textClass)}
        >
          {ukg.label}
        </span>
      </span>
      <span className="flex items-center justify-center" data-testid="onboarding-mini-genre-row-2">
        <span
          className={MINI_GENRE_PILL_CLASS}
          style={getGenreGlowPillStyle(house.bgColor, house.textClass)}
        >
          {house.label}
        </span>
      </span>
    </span>
  );
}

function BenefitVisual({ name }: { name: PreLoginOnboardingVisual }) {
  const iconClass = "h-6 w-6";
  switch (name) {
    case "unidentifiedPill":
      return <OnboardingStatusPill status="unidentified" />;
    case "communityIdentifiedPill":
      return <OnboardingStatusPill status="identified" />;
    case "genrePills":
      return <OnboardingGenrePills />;
    case "save":
      return <Heart className={cn(iconClass, "fill-red-500 text-red-500")} />;
    case "releases":
      return <Calendar className={cn(iconClass, "text-[#fb923c]")} />;
    case "alerts":
      return <Bell className={cn(iconClass, "text-[#4ae9df]")} />;
    case "leaderboard":
      return <Trophy className={cn(iconClass, "text-yellow-500")} />;
    case "clips":
      return <Film className={cn(iconClass, "text-[#f472b6]")} />;
    case "artistIdentifiedPill":
      return <OnboardingStatusPill status="artistIdentified" />;
    case "alertDemand":
      return <Bell className={cn(iconClass, "text-[#4ae9df]")} />;
    case "artistTools":
      return <ArtistToolsMark />;
  }
}

function IntentChoiceButton({
  selected,
  emphasize,
  role,
  label,
  supporting,
  onSelect,
  testId,
}: {
  selected: boolean;
  emphasize: boolean;
  role: PreLoginOnboardingIntent;
  label: string;
  supporting: string;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${label}. ${supporting}`}
      data-testid={testId}
      className={cn(
        "flex min-h-11 w-full flex-col items-center px-1 py-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1324] rounded-xl",
        PRE_LOGIN_IDENTITY_PRESS_CLASS,
      )}
    >
      <EmphasizedRoleAvatar
        role={role}
        emphasize={emphasize}
        slotClassName={PRE_LOGIN_AVATAR_SLOT_SCREEN1_CLASS}
        imageClassName={PRE_LOGIN_AVATAR_IMAGE_SCREEN1_CLASS}
        testId={`onboarding-intent-avatar-${role}`}
      />
      <span
        className={cn(
          PRE_LOGIN_IDENTITY_LABEL_CLASS,
          emphasize ? "text-foreground" : "text-foreground/90",
        )}
      >
        {label}
      </span>
      <span className="mt-1 text-center text-sm leading-snug text-muted-foreground">
        {supporting}
      </span>
    </button>
  );
}

function SignInExit({ onSignIn }: { onSignIn: () => void }) {
  return (
    <p className="text-center text-[15px] leading-snug text-muted-foreground">
      {copy.screen1.signInLead}{" "}
      <button
        type="button"
        onClick={onSignIn}
        className={`${PRELOGIN_LINK_CLASS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1324] rounded-sm`}
        data-testid="button-onboarding-sign-in"
      >
        {copy.screen1.signInAction}
      </button>
    </p>
  );
}

function bindInert(active: boolean) {
  return (el: HTMLDivElement | null) => {
    if (!el) return;
    if (active) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  };
}

function screen1ItemReveal(
  ready: boolean,
  slot: number,
  reduceMotion: boolean,
) {
  return reduceMotion ? undefined : preLoginScreen1RevealStyle(ready, slot);
}

function JourneyConnector({
  style,
}: {
  style?: ReturnType<typeof preLoginScreen1RevealStyle>;
}) {
  return (
    <span
      className={cn(PRE_LOGIN_JOURNEY_CONNECTOR_CLASS, PRE_LOGIN_STAGGER_ITEM_CLASS)}
      aria-hidden
      data-testid="pre-login-journey-connector"
      style={style}
    >
      ↓
    </span>
  );
}

function Screen1WaveformVisual() {
  const bars = [4, 7, 10, 14, 12, 18, 15, 11, 8, 13, 17, 12, 7, 9, 14, 10, 6];
  return (
    <svg
      aria-hidden
      data-testid="pre-login-story-waveform-visual"
      className={PRE_LOGIN_SCREEN_1_STORY_WAVEFORM_CLASS}
      viewBox="0 0 68 24"
      role="presentation"
    >
      {bars.map((height, index) => {
        const x = index * 4;
        const y = (24 - height) / 2;
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={2}
            height={height}
            rx={1}
            className="fill-white/70"
          />
        );
      })}
    </svg>
  );
}

function Screen1IdentifiedVisual() {
  return (
    <div
      aria-hidden
      data-testid="pre-login-story-identified-visual"
      className="flex items-center justify-center drop-shadow-[0_0_8px_rgba(34,197,94,0.28)]"
    >
      <OnboardingStatusPill status="identified" />
    </div>
  );
}

function Screen1ReleaseVisual() {
  const sample = PRE_LOGIN_SCREEN_1_STORY_RELEASE_EXAMPLE;
  return (
    <div
      aria-hidden
      data-testid="pre-login-story-release-visual"
      className={PRE_LOGIN_SCREEN_1_STORY_RELEASE_CARD_CLASS}
    >
      <div
        className="h-9 w-9 shrink-0 rounded bg-gradient-to-br from-[#fb923c]/40 via-[#f472b6]/30 to-[#4ae9df]/25 ring-1 ring-white/10"
        aria-hidden
      />
      <div className="min-w-0 text-left">
        <p className="truncate text-[11px] font-semibold leading-tight text-foreground">
          {sample.track}
        </p>
        <p className="flex min-w-0 items-center gap-0.5 truncate text-[10px] leading-tight text-muted-foreground">
          <span className="truncate">{sample.artist}</span>
          <GoldVerifiedTick
            className={PRE_LOGIN_SCREEN_1_STORY_RELEASE_VERIFIED_TICK_CLASS}
            glow="inline"
          />
        </p>
        <p className="mt-0.5 text-[9px] font-medium leading-tight text-[#fb923c]">
          {sample.outLabel}
        </p>
      </div>
    </div>
  );
}

function Screen1StoryStage({
  visual,
  label,
  revealReady,
  slot,
  reduceMotion,
  testId,
}: {
  visual: ReactNode;
  label: string;
  revealReady: boolean;
  slot: number;
  reduceMotion: boolean;
  testId: string;
}) {
  return (
    <div
      className={cn(PRE_LOGIN_SCREEN_1_STORY_STAGE_CLASS, PRE_LOGIN_STAGGER_ITEM_CLASS)}
      data-testid={testId}
      style={screen1ItemReveal(revealReady, slot, reduceMotion)}
    >
      <div className={PRE_LOGIN_SCREEN_1_STORY_VISUAL_SLOT_CLASS}>{visual}</div>
      <p className={PRE_LOGIN_JOURNEY_STEP_CLASS}>{label}</p>
    </div>
  );
}

function Screen1({
  state,
  headingRef,
  captureHeading,
  onChooseIntent,
  onSignIn,
  revealReady,
  reduceMotion,
}: {
  state: PreLoginOnboardingUiState;
  headingRef: { current: HTMLHeadingElement | null };
  captureHeading: boolean;
  onChooseIntent: (intent: PreLoginOnboardingIntent) => void;
  onSignIn: () => void;
  revealReady: boolean;
  reduceMotion: boolean;
}) {
  const slots = PRE_LOGIN_SCREEN_1_REVEAL_SLOTS;
  return (
    <div className="flex min-h-full flex-col" data-testid="pre-login-screen-1">
      <div className={PRE_LOGIN_SCREEN_1_TOP_CLASS} data-testid="pre-login-screen-1-top">
        <h1
          ref={captureHeading ? headingRef : undefined}
          tabIndex={-1}
          className={cn(
            "text-2xl font-bold leading-tight text-foreground text-center outline-none",
            PRE_LOGIN_SCREEN_1_HEADLINE_CLASS,
            PRE_LOGIN_STAGGER_ITEM_CLASS,
          )}
          style={screen1ItemReveal(revealReady, slots.headline, reduceMotion)}
        >
          {copy.screen1.heading}
        </h1>
      </div>
      <div
        className={PRE_LOGIN_SCREEN_1_JOURNEY_CLASS}
        data-testid="pre-login-screen-1-middle"
      >
        <div className={PRE_LOGIN_SCREEN_1_STORY_CLASS} data-testid="pre-login-product-journey">
          <Screen1StoryStage
            visual={<Screen1WaveformVisual />}
            label={copy.screen1.journeyHear}
            revealReady={revealReady}
            slot={slots.stage1}
            reduceMotion={reduceMotion}
            testId="pre-login-story-stage-1"
          />
          <JourneyConnector
            style={screen1ItemReveal(revealReady, slots.arrow1, reduceMotion)}
          />
          <Screen1StoryStage
            visual={<Screen1IdentifiedVisual />}
            label={copy.screen1.journeyFind}
            revealReady={revealReady}
            slot={slots.stage2}
            reduceMotion={reduceMotion}
            testId="pre-login-story-stage-2"
          />
          <JourneyConnector
            style={screen1ItemReveal(revealReady, slots.arrow2, reduceMotion)}
          />
          <Screen1StoryStage
            visual={<Screen1ReleaseVisual />}
            label={copy.screen1.journeyFollow}
            revealReady={revealReady}
            slot={slots.stage3}
            reduceMotion={reduceMotion}
            testId="pre-login-story-stage-3"
          />
        </div>
      </div>
      <div
        className={cn(
          PRE_LOGIN_SCREEN_1_GAP_JOURNEY_IDENTITY_CLASS,
          PRE_LOGIN_SCREEN_1_BOTTOM_CLASS,
        )}
        data-testid="pre-login-screen-1-bottom"
      >
        <p
          id="onboarding-intent-heading"
          className={cn(
            PRE_LOGIN_SCREEN_1_SELECTION_INSTRUCTION_CLASS,
            PRE_LOGIN_STAGGER_ITEM_CLASS,
          )}
          data-testid="pre-login-selection-instruction"
          style={screen1ItemReveal(revealReady, slots.selectionInstruction, reduceMotion)}
        >
          {copy.screen1.selectionInstruction}
        </p>
        <div
          role="group"
          aria-labelledby="onboarding-intent-heading"
          data-testid="pre-login-identity-region"
          className={cn("grid grid-cols-2 gap-3 min-[400px]:gap-8", PRE_LOGIN_STAGGER_ITEM_CLASS)}
          style={screen1ItemReveal(revealReady, slots.identities, reduceMotion)}
        >
          <IntentChoiceButton
            selected={state.intent === "user"}
            emphasize={shouldShowScreen1Selection(state) && state.intent === "user"}
            role="user"
            label={copy.screen1.communityLabel}
            supporting={copy.screen1.communitySupporting}
            onSelect={() => onChooseIntent("user")}
            testId="button-onboarding-intent-user"
          />
          <IntentChoiceButton
            selected={state.intent === "artist"}
            emphasize={shouldShowScreen1Selection(state) && state.intent === "artist"}
            role="artist"
            label={copy.screen1.artistLabel}
            supporting={copy.screen1.artistSupporting}
            onSelect={() => onChooseIntent("artist")}
            testId="button-onboarding-intent-artist"
          />
        </div>
        <div
          className={cn("mt-3", PRE_LOGIN_STAGGER_ITEM_CLASS)}
          style={screen1ItemReveal(revealReady, slots.signIn, reduceMotion)}
        >
          <SignInExit onSignIn={onSignIn} />
        </div>
      </div>
      <div className="min-h-0 flex-1 shrink" aria-hidden />
    </div>
  );
}

function PerspectiveSwitcher({
  viewingArtist,
  onViewPerspective,
}: {
  viewingArtist: boolean;
  onViewPerspective: (perspective: PreLoginOnboardingIntent) => void;
}) {
  return (
    <div
      role="group"
      aria-label="View community or artist benefits"
      className={PRE_LOGIN_PERSPECTIVE_SWITCHER_CLASS}
    >
      <button
        type="button"
        aria-pressed={!viewingArtist}
        onClick={() => onViewPerspective("user")}
        data-testid="button-onboarding-view-user"
        className={cn(
          PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS,
          "rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1324]",
          !viewingArtist ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <EmphasizedRoleAvatar
          role="user"
          emphasize={!viewingArtist}
          slotClassName={PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS}
          imageClassName={PRE_LOGIN_AVATAR_IMAGE_SCREEN2_CLASS}
          testId="onboarding-perspective-avatar-user"
        />
        <span>{copy.screen2.viewCommunity}</span>
      </button>
      <span className="select-none text-muted-foreground/45" aria-hidden>
        ↔
      </span>
      <button
        type="button"
        aria-pressed={viewingArtist}
        onClick={() => onViewPerspective("artist")}
        data-testid="button-onboarding-view-artist"
        className={cn(
          PRE_LOGIN_PERSPECTIVE_BUTTON_CLASS,
          "rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1324]",
          viewingArtist ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <EmphasizedRoleAvatar
          role="artist"
          emphasize={viewingArtist}
          slotClassName={PRE_LOGIN_AVATAR_SLOT_SCREEN2_CLASS}
          imageClassName={PRE_LOGIN_AVATAR_IMAGE_SCREEN2_CLASS}
          testId="onboarding-perspective-avatar-artist"
        />
        <span>{copy.screen2.viewArtists}</span>
      </button>
    </div>
  );
}

function PerspectivePanel({
  active,
  side,
  heading,
  lead,
  benefits,
  callout,
  headingRef,
  staggerReady,
  reduceMotion,
}: {
  active: boolean;
  side: "community" | "artist";
  heading: string;
  lead: string;
  benefits: readonly {
    title: string;
    body: string;
    visual: PreLoginOnboardingVisual;
  }[];
  callout: { title: string; body: string };
  headingRef: { current: HTMLHeadingElement | null };
  staggerReady: boolean;
  reduceMotion: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-1/2 shrink-0 flex-col overflow-visible",
        PRE_LOGIN_SCREEN_2_CONTENT_INSET_CLASS,
      )}
      aria-hidden={!active}
      ref={bindInert(active)}
      data-testid={`pre-login-perspective-${side}`}
    >
      <div className={PRE_LOGIN_HEADING_BLOCK_CLASS} data-testid="pre-login-heading-block">
        <h1
          ref={active ? headingRef : undefined}
          tabIndex={active ? -1 : undefined}
          className="text-lg font-semibold leading-snug text-foreground outline-none"
        >
          {heading}
        </h1>
        <p className={PRE_LOGIN_STRAPLINE_CLASS}>{lead}</p>
      </div>
      <ul className={PRE_LOGIN_FEATURE_LIST_CLASS} data-testid={`pre-login-feature-list-${side}`}>
        {benefits.map((item, index) => {
          return (
            <li
              key={item.title}
              className={cn(PRE_LOGIN_FEATURE_ROW_CLASS, PRE_LOGIN_STAGGER_ITEM_CLASS)}
              data-testid={`pre-login-feature-row-${index + 1}`}
              data-stagger-slot={index + 1}
              style={
                reduceMotion ? undefined : preLoginFeatureRevealStyle(staggerReady, index)
              }
            >
              <span className={PRE_LOGIN_FEATURE_VISUAL_COL_CLASS} aria-hidden>
                <BenefitVisual name={item.visual} />
              </span>
              <div className={PRE_LOGIN_FEATURE_TEXT_COL_CLASS} data-testid="pre-login-feature-text">
                <p className={PRE_LOGIN_FEATURE_TITLE_CLASS}>{item.title}</p>
                <p className={PRE_LOGIN_FEATURE_BODY_CLASS}>{item.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <div
        className={cn(PRE_LOGIN_CALLOUT_CLASS, PRE_LOGIN_STAGGER_ITEM_CLASS)}
        data-testid={`pre-login-closing-callout-${side}`}
        data-stagger-slot={7}
        style={
          reduceMotion ? undefined : preLoginFeatureRevealStyle(staggerReady, 6)
        }
      >
        <p className={PRE_LOGIN_CALLOUT_TITLE_CLASS}>{callout.title}</p>
        <p className={PRE_LOGIN_CALLOUT_BODY_CLASS}>{callout.body}</p>
      </div>
    </div>
  );
}

function Screen2({
  state,
  headingRef,
  captureHeading,
  active,
  onViewPerspective,
  onGetStarted,
  onSignIn,
}: {
  state: PreLoginOnboardingUiState;
  headingRef: { current: HTMLHeadingElement | null };
  captureHeading: boolean;
  active: boolean;
  onViewPerspective: (perspective: PreLoginOnboardingIntent) => void;
  onGetStarted: () => void;
  onSignIn: () => void;
}) {
  const viewingArtist = state.viewingPerspective === "artist";
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef(0);
  const originRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const axisRef = useRef<"x" | "y" | null>(null);
  const panDxRef = useRef(0);
  const [panDx, setPanDx] = useState(0);
  const [panning, setPanning] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const playedRef = useRef<PreLoginRevealPlayed>({ ...INITIAL_PRE_LOGIN_REVEAL_PLAYED });
  const [revealReady, setRevealReady] = useState<PreLoginRevealPlayed>(
    INITIAL_PRE_LOGIN_REVEAL_PLAYED,
  );

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) {
      playedRef.current = { user: true, artist: true };
      setRevealReady({ user: true, artist: true });
      return;
    }
    const perspective = state.viewingPerspective;
    if (!shouldAnimatePerspectiveReveal(playedRef.current, perspective, false)) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      playedRef.current = markPerspectiveRevealed(playedRef.current, perspective);
      setRevealReady((prev) => markPerspectiveRevealed(prev, perspective));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, state.viewingPerspective]);

  const pageWidth = () => widthRef.current || pagerRef.current?.getBoundingClientRect().width || 0;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    widthRef.current = pagerRef.current?.getBoundingClientRect().width ?? 0;
    originRef.current = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    axisRef.current = null;
    panDxRef.current = 0;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = originRef.current;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (!axisRef.current) {
      axisRef.current = lockPerspectivePagerAxis(dx, dy);
      if (axisRef.current !== "x") return;
      setPanning(true);
      pagerRef.current?.setPointerCapture(event.pointerId);
    }
    if (axisRef.current !== "x") return;
    panDxRef.current = dx;
    if (!prefersReducedMotion()) setPanDx(dx);
  };

  const finishPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = originRef.current;
    originRef.current = null;
    const axis = axisRef.current;
    axisRef.current = null;
    const dx = panDxRef.current;
    panDxRef.current = 0;
    setPanning(false);
    setPanDx(0);
    if (axis !== "x" || !origin) return;
    const elapsed = Math.max(1, event.timeStamp - origin.t);
    const next = resolvePerspectivePagerCommit({
      from: state.viewingPerspective,
      dx,
      width: pageWidth(),
      vx: dx / elapsed,
    });
    if (next !== state.viewingPerspective) onViewPerspective(next);
  };

  const width = pageWidth();
  const translatePx = panning
    ? perspectivePagerTranslatePx(state.viewingPerspective, reduceMotion ? 0 : panDx, width)
    : viewingArtist
      ? null
      : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="pre-login-screen-2">
      <div
        className={PRE_LOGIN_SCREEN_2_SWITCHER_HOST_CLASS}
        data-testid="pre-login-screen-2-switcher-host"
      >
        <PerspectiveSwitcher
          viewingArtist={viewingArtist}
          onViewPerspective={onViewPerspective}
        />
      </div>

      <div
        className={PRE_LOGIN_SCREEN_2_SCROLL_CLASS}
        data-testid="pre-login-screen-2-scroll"
      >
        <div
          ref={pagerRef}
          data-testid="pre-login-perspective-pager"
          className={PRE_LOGIN_SCREEN_2_PAGER_CLASS}
          style={{ touchAction: panning ? "none" : "pan-y" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPan}
          onPointerCancel={finishPan}
        >
          <div
            data-testid="pre-login-screen-2-content-frame"
            className={cn(
              "flex h-full min-h-0 w-[200%]",
              !panning && PRE_LOGIN_PAGER_SNAP_CLASS,
            )}
            style={{
              transform: panning && translatePx != null
                ? `translateX(${translatePx}px)`
                : viewingArtist
                  ? "translateX(-50%)"
                  : "translateX(0%)",
            }}
          >
            <PerspectivePanel
              active={!viewingArtist}
              side="community"
              heading={copy.screen2.communityHeading}
              lead={copy.screen2.communityLead}
              benefits={copy.screen2.communityBenefits}
              callout={{
                title: copy.screen2.communityCalloutTitle,
                body: copy.screen2.communityCalloutBody,
              }}
              headingRef={captureHeading ? headingRef : { current: null }}
              staggerReady={revealReady.user}
              reduceMotion={reduceMotion}
            />
            <PerspectivePanel
              active={viewingArtist}
              side="artist"
              heading={copy.screen2.artistHeading}
              lead={copy.screen2.artistLead}
              benefits={copy.screen2.artistBenefits}
              callout={{
                title: copy.screen2.artistHookTitle,
                body: copy.screen2.artistHookBody,
              }}
              headingRef={captureHeading ? headingRef : { current: null }}
              staggerReady={revealReady.artist}
              reduceMotion={reduceMotion}
            />
          </div>
        </div>
      </div>

      <div className={PRE_LOGIN_SCREEN_2_CTA_CLASS} data-testid="pre-login-screen-2-cta">
        <Button
          type="button"
          className={PRELOGIN_PRIMARY_CTA_CLASS}
          onClick={onGetStarted}
          disabled={!state.intent}
          data-testid="button-onboarding-get-started"
        >
          {copy.screen2.getStarted}
        </Button>
        <div className={PRE_LOGIN_SCREEN_2_SIGN_IN_CLASS}>
          <SignInExit onSignIn={onSignIn} />
        </div>
      </div>
    </div>
  );
}

export function PreLoginOnboarding({
  onSignIn,
  onGetStarted,
}: {
  onSignIn: () => void;
  onGetStarted: (intent: PreLoginOnboardingIntent) => void;
}) {
  const [state, setState] = useState<PreLoginOnboardingUiState>(INITIAL_PRE_LOGIN_ONBOARDING_UI);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const previousScreenRef = useRef(state.screen);
  const screen1PlayedRef = useRef(false);
  const [screen1RevealReady, setScreen1RevealReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const reduce = prefersReducedMotion();
    setReduceMotion(reduce);
    if (!shouldRunScreen1StorySequence(screen1PlayedRef.current, reduce)) {
      screen1PlayedRef.current = true;
      setScreen1RevealReady(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      screen1PlayedRef.current = true;
      setScreen1RevealReady(
        resolveScreen1RevealReady({
          alreadyPlayed: false,
          reduceMotion: reduce,
          animate: true,
        }),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (previousScreenRef.current === state.screen) return;
    previousScreenRef.current = state.screen;
    const reduce = prefersReducedMotion();
    const delay = reduce ? 0 : 200;
    const timer = window.setTimeout(() => headingRef.current?.focus(), delay);
    return () => window.clearTimeout(timer);
  }, [state.screen]);

  const onScreen1 = state.screen === 1;

  return (
    <div
      className={`${AUTH_SURFACE_CLASS} ${PRELOGIN_CANVAS_CLASS} min-h-screen overflow-hidden flex flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]`}
      data-auth-surface=""
      data-prelogin-onboarding=""
      data-testid="pre-login-onboarding"
    >
      <div className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
        <div
          className={PRE_LOGIN_BRAND_ANCHOR_CLASS}
          data-testid="pre-login-brand-anchor"
        >
          <div className="justify-self-start">
            {!onScreen1 ? (
              <button
                type="button"
                onClick={() => setState((prev) => applyBackToScreen1(prev))}
                aria-label="Back"
                className="inline-flex min-h-11 min-w-11 items-center justify-center -ml-1 rounded-sm text-white hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1324]"
                data-testid="button-onboarding-back"
              >
                <ChevronLeft className={PRE_LOGIN_BACK_ICON_CLASS} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </div>
          <div
            data-testid="pre-login-shared-logo"
            className={PRE_LOGIN_STAGGER_ITEM_CLASS}
            style={
              reduceMotion
                ? undefined
                : preLoginScreen1RevealStyle(screen1RevealReady, PRE_LOGIN_SCREEN_1_REVEAL_SLOTS.logo)
            }
          >
            <Logo size={PRE_LOGIN_LOGO_SIZE} />
          </div>
          <span aria-hidden />
        </div>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {screen2LiveStatus(state)}
        </div>
        <div
          className={PRE_LOGIN_SCREEN_LAYERS_CLASS}
          data-testid="pre-login-screen-layers"
        >
          <div
            className={cn(
              PRE_LOGIN_SCREEN_1_CLIP_CLASS,
              onScreen1 ? "z-20" : "z-0 pointer-events-none",
            )}
          >
            <div
              className={cn(
                PRE_LOGIN_SCREEN_LAYER_CLASS,
                PRE_LOGIN_SCREEN_TRANSITION_CLASS,
                onScreen1
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 motion-safe:-translate-x-2",
              )}
              aria-hidden={!onScreen1}
              ref={bindInert(onScreen1)}
              data-testid="pre-login-screen-1-layer"
            >
            <Screen1
              state={state}
              headingRef={headingRef}
              captureHeading={onScreen1}
              onChooseIntent={(intent) => setState((prev) => applyScreen1Intent(prev, intent))}
              onSignIn={onSignIn}
              revealReady={screen1RevealReady}
              reduceMotion={reduceMotion}
            />
            </div>
          </div>
          <div
            className={cn(
              PRE_LOGIN_SCREEN_2_LAYER_CLASS,
              PRE_LOGIN_SCREEN_TRANSITION_CLASS,
              !onScreen1
                ? "z-20 opacity-100 translate-x-0"
                : "z-0 pointer-events-none opacity-0 motion-safe:translate-x-2",
            )}
            aria-hidden={onScreen1}
            ref={bindInert(!onScreen1)}
            data-testid="pre-login-screen-2-layer"
          >
            <Screen2
              state={state}
              headingRef={headingRef}
              captureHeading={!onScreen1}
              active={!onScreen1}
              onViewPerspective={(perspective) =>
                setState((prev) => applyScreen2Perspective(prev, perspective))
              }
              onGetStarted={() => {
                const accountType = resolveSignupAccountType(state.intent);
                if (!accountType) return;
                onGetStarted(accountType);
              }}
              onSignIn={onSignIn}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function UnauthenticatedEntry({
  onAuthSuccess,
  authBanner = null,
}: {
  onAuthSuccess: (role: string) => void;
  authBanner?: string | null;
}) {
  const [location] = useLocation();
  const [phase, setPhase] = useState<"onboarding" | "auth">(() =>
    shouldShowPreLoginOnboarding({
      routePath: location,
      hasEmailVerifiedNotice: hasPendingEmailVerifiedNotice(),
      hasRecoveryIntent: hasPendingRecoveryIntent(),
      hasPendingNativeAuthCallback: !!peekPendingNativeAuthCallbackUrl(),
    })
      ? "onboarding"
      : "auth",
  );
  const [authEntry, setAuthEntry] = useState<{
    defaultToSignUp: boolean;
    initialAccountType?: PreLoginOnboardingIntent;
  }>({ defaultToSignUp: false });

  useEffect(() => {
    if (hasPendingEmailVerifiedNotice()) {
      markPreLoginOnboardingSeen();
    }
  }, []);

  if (phase === "onboarding") {
    return (
      <PreLoginOnboarding
        onSignIn={() => {
          markPreLoginOnboardingSeen();
          setAuthEntry({ defaultToSignUp: false });
          setPhase("auth");
        }}
        onGetStarted={(intent) => {
          markPreLoginOnboardingSeen();
          setAuthEntry({
            defaultToSignUp: true,
            initialAccountType: intent,
          });
          setPhase("auth");
        }}
      />
    );
  }

  return (
    <AuthPage
      onAuthSuccess={onAuthSuccess}
      defaultToSignUp={authEntry.defaultToSignUp}
      initialAccountType={authEntry.initialAccountType}
      authBanner={authBanner}
    />
  );
}
