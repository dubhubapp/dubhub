/**
 * HINTS-ALIGN-2B — first-login onboarding content + material presentation.
 * Source-level presentation tests only; does not exercise auth/hint triggers.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_DIALOG_CONTENT_CLASS,
  APP_MATERIAL_FOCUS_RING_CLASS,
  APP_MATERIAL_OVERLAY_BACKDROP_CLASS,
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_TITLE_CLASS,
} from "@/lib/app-material";

const here = dirname(fileURLToPath(import.meta.url));
const modalSrc = readFileSync(
  join(here, "../components/first-login-onboarding-modal.tsx"),
  "utf8",
);
const onboardingSrc = readFileSync(join(here, "./onboarding.ts"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");

describe("HINTS-ALIGN-2B first-login artist content", () => {
  it("keeps three core artist concepts and drops profile-performance tip", () => {
    assert.match(modalSrc, /Your tracks get discovered through real clips/);
    assert.match(modalSrc, /Confirm your own tracks when you spot them/);
    assert.match(
      modalSrc,
      /Set up releases so interested listeners can follow them through to release/,
    );
    assert.doesNotMatch(modalSrc, /Track performance in your profile/);
    assert.doesNotMatch(modalSrc, /TrendingUp/);
  });

  it("keeps community membership without a duplicated nested tip list", () => {
    assert.match(modalSrc, /You.?re also part of the community/);
    assert.match(modalSrc, /Upload clips, help ID tracks and compete on the leaderboard/);
    assert.match(modalSrc, /first-login-artist-community/);
    assert.doesNotMatch(modalSrc, /CompactTipsList/);
    assert.doesNotMatch(
      modalSrc,
      /rounded-lg border border-white\/15 bg-\[#0f1324\]/,
    );
  });

  it("does not teach detailed self-tag mechanics in first-login", () => {
    assert.doesNotMatch(modalSrc, /tag yourself in the comments/i);
    assert.doesNotMatch(modalSrc, /Mark ID/);
  });
});

describe("HINTS-ALIGN-2B first-login community content", () => {
  it("keeps upload / ID / save-to-release / leaderboard concepts", () => {
    assert.match(modalSrc, /Upload clips you want identified/);
    assert.match(modalSrc, /Help identify tracks in the feed/);
    assert.match(modalSrc, /Save tracks and follow them through to release/);
    assert.match(modalSrc, /Compete on the Leaderboard for monthly rewards/);
  });

  it("does not over-teach Discover controls or comment drop mechanics", () => {
    assert.doesNotMatch(modalSrc, /Filter by genre, status and order/);
    assert.doesNotMatch(modalSrc, /Suggest track IDs in comments/);
    assert.doesNotMatch(modalSrc, /SlidersHorizontal/);
    assert.doesNotMatch(modalSrc, /Open Discover/);
    assert.doesNotMatch(modalSrc, /Drop the ID/);
  });
});

describe("HINTS-ALIGN-2B ID Status Key preserved", () => {
  it("keeps all four ID provenance states plus explanatory line", () => {
    assert.match(modalSrc, /ID Status Key/);
    assert.match(modalSrc, /Unidentified/);
    assert.match(modalSrc, /Community Identified/);
    assert.match(modalSrc, /Moderator Confirmed/);
    assert.match(modalSrc, /Artist Identified/);
    assert.match(modalSrc, /first-login-anonymous-identified/);
    assert.match(modalSrc, /EyeOff/);
    assert.match(
      modalSrc,
      /IDs can be suggested by the community, confirmed by moderators, or confirmed by\s+artists/,
    );
    assert.match(modalSrc, /first-login-id-status-key/);
  });
});

describe("HINTS-ALIGN-2B first-login presentation material", () => {
  it("uses shared overlay surface, primary CTA, and modern close control", () => {
    assert.match(modalSrc, /APP_MATERIAL_DIALOG_CONTENT_CLASS/);
    assert.match(modalSrc, /APP_MATERIAL_OVERLAY_BACKDROP_CLASS/);
    assert.match(modalSrc, /APP_MATERIAL_OVERLAY_TITLE_CLASS/);
    assert.match(modalSrc, /APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS/);
    assert.match(modalSrc, /hideCloseButton/);
    assert.match(modalSrc, /aria-label=\"Close\"/);
    assert.match(modalSrc, /button-first-login-onboarding-close/);
    assert.match(modalSrc, /variant=\"ghost\"/);
    assert.match(modalSrc, /size=\"icon\"/);
    assert.equal(APP_MATERIAL_DIALOG_CONTENT_CLASS.includes("dubhub-app-overlay-surface"), true);
    assert.equal(APP_MATERIAL_OVERLAY_BACKDROP_CLASS, "dubhub-app-overlay-backdrop");
    assert.match(APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS, /bg-white/);
    assert.match(APP_MATERIAL_OVERLAY_TITLE_CLASS, /font-semibold/);
  });

  it("removes legacy cyan-border flat panel chrome", () => {
    assert.doesNotMatch(modalSrc, /border-\[#4ae9df\]\/35/);
    assert.doesNotMatch(modalSrc, /bg-\[#0f1324\]\/95/);
    assert.doesNotMatch(modalSrc, /bg-\[#4ae9df\] text-black/);
  });

  it("ARTIST-ONBOARDING-SUB-2 tip icons use text-foreground, not text-accent", () => {
    assert.match(
      modalSrc,
      /const tipIconClass\s*=\s*"mt-0\.5 h-4 w-4 shrink-0 text-foreground"/,
    );
    assert.doesNotMatch(
      modalSrc,
      /const tipIconClass\s*=\s*"[^"]*text-accent[^"]*"/,
    );
    // ID Status Key / gold tick / Unidentified glow wiring unchanged.
    assert.match(modalSrc, /first-login-id-status-key/);
    assert.match(modalSrc, /STATUS_GLOW_PILL_BG\.unidentified/);
    assert.match(modalSrc, /STATUS_GLOW_PILL_BG\.identified/);
    assert.match(
      modalSrc,
      /GoldVerifiedTick className=\{`\$\{statusIconBase\} text-\[#FFD700\]`\}/,
    );
    assert.match(modalSrc, /tone=\"unidentified\"/);
    assert.match(modalSrc, /label=\"Unidentified\"/);
  });
});

describe("HINTS-ALIGN-2C close focus + CTA symmetry", () => {
  it("prevents open autofocus on close and does not hard-wire a blue focus ring", () => {
    assert.match(modalSrc, /onOpenAutoFocus=\{\(event\)\s*=>\s*event\.preventDefault\(\)\}/);
    assert.match(modalSrc, /aria-label=\"Close\"/);
    assert.doesNotMatch(modalSrc, /APP_MATERIAL_FOCUS_RING_CLASS/);
    assert.doesNotMatch(modalSrc, /ring-\[#0a83ff\]/);
    // Button primitive still provides keyboard focus-visible when Tabbed — not removed globally.
    assert.match(APP_MATERIAL_FOCUS_RING_CLASS, /focus-visible:ring/);
  });

  it("CTA is full-width with equal content insets (no content-wide pr-8)", () => {
    assert.match(
      modalSrc,
      /className=\{cn\(\"mt-5 w-full\",\s*APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS\)\}/,
    );
    // Title clearance only — not wrapping the CTA.
    assert.match(modalSrc, /DialogHeader className=\"space-y-1\.5 pr-8 text-left\"/);
    assert.doesNotMatch(modalSrc, /motion\.div[\s\S]*?className=\"pr-8\"/);
    assert.doesNotMatch(modalSrc, /sm:w-auto/);
    assert.doesNotMatch(modalSrc, /justify-(end|start|between)/);
  });
});

describe("HINTS-ALIGN-2B does not change triggers or contextual hints", () => {
  it("leaves onboarding persistence keys and home hint events untouched", () => {
    assert.match(onboardingSrc, /dubhub_onboarding_pending_/);
    assert.match(onboardingSrc, /dubhub_onboarding_seen_/);
    assert.match(onboardingSrc, /dubhub_hint_genre_filter_seen_/);
    assert.match(onboardingSrc, /dubhub_hint_comments_seen_/);
    assert.match(onboardingSrc, /dubhub_hint_like_release_seen_/);
    assert.match(onboardingSrc, /dubhub_hint_random_seen_/);
    assert.match(onboardingSrc, /dubhub_hint_artist_self_tag_flow_seen_/);
    assert.match(homeSrc, /DISCOVER_COACHMARK_COPY|Filter the feed by mode/);
    assert.match(homeSrc, /COMMENTS_COACHMARK_COPY|Know it\? Drop the ID/);
    assert.match(homeSrc, /ARTIST_SELF_TAG_COACHMARK_COPY/);
    assert.match(videoCardSrc, /HINT_ARTIST_SELF_TAG_READY_EVENT/);
    assert.doesNotMatch(videoCardSrc, /Is this your ID\?/);
  });
});
