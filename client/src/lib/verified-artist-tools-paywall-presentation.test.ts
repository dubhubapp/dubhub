/**
 * VAT-PAYWALL-POLISH-2 — presentation-only contract for Verified Artist Tools paywall + intro.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_SHEET_BACKDROP_CLASS,
  APP_MATERIAL_SHEET_SURFACE_CLASS,
} from "./app-material";
import { ARTIST_SUBSCRIPTION_INTRO_COPY } from "./artist-subscription-intro";
import {
  VERIFIED_ARTIST_TOOLS_BENEFITS,
} from "./verified-artist-tools-paywall-copy";
import {
  PAYWALL_PACKAGE_SELECTED_CLASS,
  PAYWALL_SHELL_CLASS,
  PAYWALL_SUCCESS_CONFIRMATION_LINES,
} from "./verified-artist-tools-paywall-lifecycle";
import { cn } from "./utils";

const here = dirname(fileURLToPath(import.meta.url));
const paywallSrc = readFileSync(
  join(here, "../components/verified-artist-tools-paywall.tsx"),
  "utf8",
);
const introModalSrc = readFileSync(
  join(here, "../components/artist-subscription-intro-modal.tsx"),
  "utf8",
);
const hostSrc = readFileSync(
  join(here, "../components/native-nav-bridge-host.tsx"),
  "utf8",
);
const drawerSrc = readFileSync(join(here, "../components/ui/drawer.tsx"), "utf8");

/** Mirrors DrawerContent base + paywall className merge (cn → twMerge). */
function mergedPaywallDrawerContentClass(): string {
  return cn(
    "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background",
    "mx-auto flex w-full max-w-lg flex-col gap-0 border-0 bg-transparent p-0",
    "mt-[max(0.75rem,min(22dvh,10rem))]",
    PAYWALL_SHELL_CLASS,
    "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]",
    "h-auto max-h-[92dvh]",
  );
}

describe("VAT-PAYWALL-POLISH-2C fixed positioning", () => {
  it("merged DrawerContent classes retain fixed and do not resolve to relative", () => {
    assert.doesNotMatch(PAYWALL_SHELL_CLASS, /(^|\s)relative(\s|$)/);
    const merged = mergedPaywallDrawerContentClass();
    const tokens = merged.split(/\s+/);
    assert.ok(tokens.includes("fixed"), `expected fixed in: ${merged}`);
    assert.equal(tokens.includes("relative"), false, merged);
    assert.equal(tokens.includes("absolute"), false, merged);
    assert.equal(tokens.includes("sticky"), false, merged);
  });
});

describe("VAT-PAYWALL-POLISH-2 material", () => {
  it("uses shared sheet surface + backdrop tokens without flat #0f1324 shell", () => {
    assert.equal(APP_MATERIAL_SHEET_SURFACE_CLASS, "dubhub-app-sheet-surface");
    assert.equal(APP_MATERIAL_SHEET_BACKDROP_CLASS, "dubhub-app-sheet-backdrop");
    assert.ok(PAYWALL_SHELL_CLASS.includes(APP_MATERIAL_SHEET_SURFACE_CLASS));
    assert.ok(PAYWALL_SHELL_CLASS.includes("rounded-t-[28px]"));
    assert.ok(!PAYWALL_SHELL_CLASS.includes("bg-[#0f1324]"));
    assert.match(paywallSrc, /APP_MATERIAL_SHEET_BACKDROP_CLASS/);
    assert.match(paywallSrc, /overlayClassName=\{cn\("z-\[70\]"/);
    assert.doesNotMatch(paywallSrc, /bg-\[#0f1324\]/);
  });
});

describe("VAT-PAYWALL-POLISH-2 close", () => {
  it("removes visible ready-state X while retaining accessible dismissal", () => {
    assert.match(paywallSrc, /data-testid="paywall-close"/);
    assert.match(paywallSrc, /className="sr-only"/);
    assert.doesNotMatch(paywallSrc, /from "lucide-react".*\bX\b|\bX\b.*from "lucide-react"/);
    assert.doesNotMatch(paywallSrc, /<X\b/);
    assert.match(paywallSrc, /DrawerClose/);
    assert.match(paywallSrc, /onOpenChange/);
  });
});

describe("VAT-PAYWALL-POLISH-2 geometry + nav overlay", () => {
  it("uses safe-bottom only, taller sheet, and native-nav cover stacking", () => {
    assert.doesNotMatch(paywallSrc, /--app-bottom-control-inset/);
    assert.match(
      paywallSrc,
      /pb-\[max\(0\.75rem,env\(safe-area-inset-bottom,0px\)\)\]/,
    );
    assert.match(paywallSrc, /max-h-\[92dvh\]/);
    assert.doesNotMatch(paywallSrc, /min-h-\[min\(78dvh,92dvh\)\]/);
    assert.match(paywallSrc, /mt-\[max\(0\.75rem,min\(22dvh,10rem\)\)\]/);
    assert.ok(PAYWALL_SHELL_CLASS.includes("z-[70]"));
    assert.match(paywallSrc, /setVerifiedArtistToolsPaywallCoveringNativeNav/);
    assert.match(hostSrc, /paywallOpen:\s*paywallCovering/);
    assert.match(hostSrc, /subscribeVerifiedArtistToolsPaywallNativeNavCover/);
    assert.doesNotMatch(drawerSrc, /APP_MATERIAL_SHEET_SURFACE_CLASS/);
  });
});

describe("VAT-PAYWALL-POLISH-2D ready-state spacing", () => {
  it("does not force min-height dead zone; footer follows packages with modest gap", () => {
    assert.match(paywallSrc, /h-auto max-h-\[92dvh\]/);
    assert.doesNotMatch(paywallSrc, /min-h-\[min\(78dvh/);
    // DrawerFooter default mt-auto overridden so packages→CTA is not stretched.
    assert.match(paywallSrc, /"mt-0 shrink-0/);
    assert.match(paywallSrc, /compactShell \? "pt-3" : "pt-8"/);
    assert.match(paywallSrc, /data-testid="paywall-purchase"/);
    assert.match(paywallSrc, /data-testid="paywall-restore"/);
    assert.match(paywallSrc, /data-testid="paywall-disclosure"/);
    assert.match(paywallSrc, /Terms of Use/);
    assert.match(paywallSrc, /Privacy Policy/);
    // Compact success/active still uses shrink-0 body (unchanged contract).
    assert.match(paywallSrc, /compactShell[\s\S]*?shrink-0 overflow-y-auto/);
  });
});

describe("VAT-PAYWALL-POLISH-2 benefits + intro parity", () => {
  it("shares canonical four benefits and turquoise Checks; no speculative footer", () => {
    assert.deepEqual(
      [...ARTIST_SUBSCRIPTION_INTRO_COPY.benefits],
      [...VERIFIED_ARTIST_TOOLS_BENEFITS],
    );
    assert.deepEqual([...PAYWALL_SUCCESS_CONFIRMATION_LINES], [
      ...VERIFIED_ARTIST_TOOLS_BENEFITS,
    ]);
    assert.match(introModalSrc, /ARTIST_SUBSCRIPTION_INTRO_BENEFIT_CHECK_CLASS/);
    assert.match(introModalSrc, /\bCheck\b/);
    assert.match(paywallSrc, /text-\[#4ae9df\]/);
    assert.doesNotMatch(paywallSrc, /Includes future Verified Artist Tools/);
    assert.doesNotMatch(paywallSrc, /VERIFIED_ARTIST_TOOLS_BENEFITS_FOOTER/);
  });
});

describe("VAT-PAYWALL-POLISH-2 pricing + CTA + legal", () => {
  it("refines selected package, uses ceramic primary CTA, keeps legal links", () => {
    assert.match(PAYWALL_PACKAGE_SELECTED_CLASS, /border-\[#0a83ff\]\/35/);
    assert.doesNotMatch(PAYWALL_PACKAGE_SELECTED_CLASS, /ring-2/);
    assert.match(paywallSrc, /PAYWALL_PACKAGE_SELECTED_CLASS/);
    assert.doesNotMatch(paywallSrc, /ring-2 ring-white\/30/);
    assert.match(paywallSrc, /selectedRow \?[\s\S]*Check/);
    assert.match(paywallSrc, /APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS/);
    assert.match(APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS, /bg-white/);
    assert.match(paywallSrc, /paywall-disclosure/);
    assert.match(paywallSrc, /Terms of Use/);
    assert.match(paywallSrc, /Privacy Policy/);
  });

  it("applies static metallic grabber / top hairline only", () => {
    assert.match(PAYWALL_SHELL_CLASS, /before:via-white\/40/);
    assert.match(PAYWALL_SHELL_CLASS, /via-\[#9eb0cc\]\/55/);
    assert.doesNotMatch(PAYWALL_SHELL_CLASS, /animate-|@keyframes|shimmer/);
  });
});
