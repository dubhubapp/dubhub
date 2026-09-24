/**
 * VAT-ANON-3.2 — Confirm ID footer hierarchy, paywall stacking above Confirm,
 * anonymous benefit + contextual emphasis.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANONYMOUS_IDENTIFY_VAT_BENEFIT_DETAIL,
  ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE,
  VERIFIED_ARTIST_TOOLS_BENEFIT_DETAILS,
  VERIFIED_ARTIST_TOOLS_BENEFITS,
  resolveVerifiedArtistToolsBenefitDetail,
  resolveVerifiedArtistToolsPaywallCopy,
} from "./verified-artist-tools-paywall-copy";
import { PAYWALL_SHELL_CLASS } from "./verified-artist-tools-paywall-lifecycle";
import { ID_MARKING_DIALOG_OVERLAY_CLASS } from "../components/id-marking-dialog-styles";

const here = dirname(fileURLToPath(import.meta.url));
const dialogSrc = readFileSync(
  join(here, "../components/artist-verification-dialog.tsx"),
  "utf8",
);
const paywallSrc = readFileSync(
  join(here, "../components/verified-artist-tools-paywall.tsx"),
  "utf8",
);
const copySrc = readFileSync(join(here, "./verified-artist-tools-paywall-copy.ts"), "utf8");

describe("VAT-ANON-3.2 Confirm ID footer hierarchy", () => {
  it("stacks Confirm publicly full-width primary above Identify anonymously full-width secondary", () => {
    const actionsStart = dialogSrc.indexOf('data-testid="artist-verification-actions"');
    const actions = dialogSrc.slice(actionsStart, actionsStart + 3500);
    const confirmIdx = actions.indexOf('data-testid="button-artist-confirm"');
    const anonIdx = actions.indexOf('data-testid="button-artist-identify-anonymously"');
    const cancelIdx = actions.indexOf('data-testid="button-cancel-artist-verification"');
    const denyIdx = actions.indexOf('data-testid="button-artist-deny"');
    assert.ok(confirmIdx >= 0 && anonIdx > confirmIdx);
    assert.ok(cancelIdx > anonIdx && denyIdx > anonIdx);
    assert.match(
      actions,
      /APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,\s*"w-full"[\s\S]{0,80}button-artist-confirm/,
    );
    assert.match(
      actions,
      /APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS,\s*"w-full"[\s\S]{0,80}button-artist-identify-anonymously/,
    );
  });

  it("keeps Lock only for free/unresolved Identify anonymously", () => {
    assert.match(dialogSrc, /\{!anonymousIdentifyEntitled \? \([\s\S]{0,80}<Lock/);
    assert.match(dialogSrc, /Identify anonymously — Verified Artist Tools/);
  });

  it("keeps Cancel + Not my track as quieter tertiary row", () => {
    const actionsStart = dialogSrc.indexOf('data-testid="artist-verification-actions"');
    const actions = dialogSrc.slice(actionsStart, actionsStart + 3500);
    assert.match(actions, /flex items-center justify-between/);
    assert.match(actions, /text-white\/55/);
    assert.match(actions, /text-red-400/);
    assert.match(actions, /Not my track/);
    assert.match(actions, /Cancel/);
  });

  it("preserves public confirm and deny mutations", () => {
    assert.match(dialogSrc, /\/api\/posts\/\$\{postId\}\/artist-confirm/);
    assert.match(dialogSrc, /\/api\/posts\/\$\{postId\}\/artist-deny/);
    assert.match(dialogSrc, /\/api\/posts\/\$\{postId\}\/artist-identify-anonymous/);
  });
});

describe("VAT-ANON-3.2 paywall stack above Confirm", () => {
  it("VAT paywall z-index is above Confirm / ID-marking dialog z-[120]", () => {
    assert.match(ID_MARKING_DIALOG_OVERLAY_CLASS, /z-\[120\]/);
    assert.ok(PAYWALL_SHELL_CLASS.includes("z-[140]"));
    assert.match(paywallSrc, /overlayClassName=\{cn\("z-\[140\]"/);
  });

  it("Confirm stays mounted and visually suppressed while paywall covers; dismiss restores after settle", () => {
    assert.match(dialogSrc, /vatPaywallCovering/);
    assert.doesNotMatch(dialogSrc, /modal=\{!vatPaywallCovering\}/);
    assert.match(dialogSrc, /pointer-events-none opacity-0/);
    assert.match(dialogSrc, /data-vat-paywall-covering/);
    assert.match(dialogSrc, /setVatPaywallCovering\(true\)/);
    assert.match(
      dialogSrc,
      /onDismissed:\s*\(\)\s*=>\s*setVatPaywallCovering\(false\)/,
    );
    assert.doesNotMatch(dialogSrc, /scrollTopBeforePaywallRef/);
    assert.doesNotMatch(dialogSrc, /!overflow-hidden/);
    // Closing dialog clears covering; open path does not wipe title/collaborators.
    assert.match(
      dialogSrc,
      /if \(!isOpen\) \{\s*setSelectedCommentId\(""\);\s*setVatPaywallCovering\(false\);/,
    );
    assert.doesNotMatch(
      dialogSrc.slice(
        dialogSrc.indexOf("handleIdentifyAnonymously"),
        dialogSrc.indexOf("handleIdentifyAnonymously") + 900,
      ),
      /resetState|setTitle\(""\)|setCollaborators\(""\)/,
    );
  });
});

describe("VAT-ANON-3.2 anonymous VAT benefit + emphasis", () => {
  it("adds Identify tracks anonymously benefit; long detail only for anonymous_identify", () => {
    assert.equal(ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE, "Identify tracks anonymously");
    assert.equal(
      ANONYMOUS_IDENTIFY_VAT_BENEFIT_DETAIL,
      "Identify the track anonymously now, then reveal yourself and the full track ID closer to release.",
    );
    assert.ok(VERIFIED_ARTIST_TOOLS_BENEFITS.includes(ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE));
    assert.equal(
      VERIFIED_ARTIST_TOOLS_BENEFIT_DETAILS[ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE],
      ANONYMOUS_IDENTIFY_VAT_BENEFIT_DETAIL,
    );
    assert.equal(VERIFIED_ARTIST_TOOLS_BENEFITS[2], ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE);
    assert.doesNotMatch(ANONYMOUS_IDENTIFY_VAT_BENEFIT_DETAIL, /credib|boost|status|paid verification/i);
    assert.match(paywallSrc, /resolveVerifiedArtistToolsBenefitDetail/);
    assert.match(copySrc, /source !== "anonymous_identify"/);
    assert.equal(
      resolveVerifiedArtistToolsBenefitDetail({
        benefit: ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE,
        source: "anonymous_identify",
      }),
      ANONYMOUS_IDENTIFY_VAT_BENEFIT_DETAIL,
    );
    assert.equal(
      resolveVerifiedArtistToolsBenefitDetail({
        benefit: ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE,
        source: "settings",
      }),
      undefined,
    );
    assert.equal(
      resolveVerifiedArtistToolsBenefitDetail({
        benefit: ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE,
        source: "attachment_limit",
      }),
      undefined,
    );
  });

  it("anonymous_identify emphasizes the anonymous benefit; other sources do not", () => {
    const anon = resolveVerifiedArtistToolsPaywallCopy("anonymous_identify");
    assert.equal(anon.emphasizeBenefit, ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE);
    assert.equal(anon.title, "Keep the track under wraps");
    assert.match(anon.body, /without revealing your identity/i);

    const settings = resolveVerifiedArtistToolsPaywallCopy("settings");
    assert.notEqual(settings.emphasizeBenefit, ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE);

    const release = resolveVerifiedArtistToolsPaywallCopy("release_limit");
    assert.equal(release.emphasizeBenefit, "Unlimited releases and active future releases");

    assert.match(paywallSrc, /data-paywall-benefit-emphasized/);
    assert.match(paywallSrc, /isEmphasized && "font-medium text-foreground"/);
    assert.match(copySrc, /emphasizeBenefit:\s*ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE/);
  });
});
