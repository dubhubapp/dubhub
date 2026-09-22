/**
 * VAT-ANON-3.3 — anonymous copy refresh, paywall dismiss settle, scroll preserve,
 * anonymous metadata helper.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANONYMOUS_IDENTIFY_VAT_BENEFIT_DETAIL,
  ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE,
  resolveVerifiedArtistToolsPaywallCopy,
} from "./verified-artist-tools-paywall-copy";

const here = dirname(fileURLToPath(import.meta.url));
const dialogSrc = readFileSync(
  join(here, "../components/artist-verification-dialog.tsx"),
  "utf8",
);
const paywallSrc = readFileSync(
  join(here, "../components/verified-artist-tools-paywall.tsx"),
  "utf8",
);
const hostSrc = readFileSync(
  join(here, "../components/verified-artist-tools-paywall-host.tsx"),
  "utf8",
);
const upgradeSrc = readFileSync(join(here, "./verified-artist-tools-upgrade.ts"), "utf8");

describe("VAT-ANON-3.3 anonymous_identify copy", () => {
  it("uses Keep the track under wraps heading + new subtitle", () => {
    const copy = resolveVerifiedArtistToolsPaywallCopy("anonymous_identify");
    assert.equal(copy.title, "Keep the track under wraps");
    assert.equal(
      copy.body,
      "Confirm it’s yours without revealing your identity. Reveal the full track ID when you’re ready.",
    );
    assert.doesNotMatch(copy.body, /credib|boost|pay.?to.?win|more trusted/i);
  });

  it("highlighted benefit uses Identify tracks anonymously title/detail", () => {
    const copy = resolveVerifiedArtistToolsPaywallCopy("anonymous_identify");
    assert.equal(copy.emphasizeBenefit, ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE);
    assert.equal(ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE, "Identify tracks anonymously");
    assert.equal(
      ANONYMOUS_IDENTIFY_VAT_BENEFIT_DETAIL,
      "Identify the track anonymously now, then reveal yourself and the full track ID closer to release.",
    );
    assert.doesNotMatch(ANONYMOUS_IDENTIFY_VAT_BENEFIT_DETAIL, /credib|boost|status/i);
  });
});

describe("VAT-ANON-3.3 paywall dismiss settle", () => {
  it("defers onDismissed until onAnimationEnd(false) via onDismissSettled", () => {
    assert.match(paywallSrc, /onDismissSettled/);
    assert.match(
      paywallSrc,
      /onAnimationEnd=\{\(animationOpen\) => \{[\s\S]*?if \(!animationOpen\) \{[\s\S]*?onDismissSettled\?\.\(\)/,
    );
    assert.match(hostSrc, /onDismissSettled=\{/);
    assert.match(hostSrc, /dismissed\?\.\(\)/);
    // Host must not fire onDismissed on open→false (mid-animation).
    assert.doesNotMatch(
      hostSrc,
      /onOpenChange=\{[\s\S]*?if \(!next\)[\s\S]*?dismissed/,
    );
    assert.match(upgradeSrc, /after Vaul close animation settles/);
  });

  it("Confirm stays covering/inert until settled dismiss clears covering", () => {
    assert.match(dialogSrc, /setVatPaywallCovering\(true\)/);
    assert.match(
      dialogSrc,
      /onDismissed:\s*\(\)\s*=>\s*setVatPaywallCovering\(false\)/,
    );
    assert.doesNotMatch(dialogSrc, /modal=\{!vatPaywallCovering\}/);
    assert.match(dialogSrc, /pointer-events-none opacity-0/);
  });
});

describe("VAT-ANON-3.3 scroll preserve", () => {
  it("does not use custom scroll freeze/restore (superseded by 3.5)", () => {
    assert.doesNotMatch(dialogSrc, /scrollTopBeforePaywallRef/);
    assert.doesNotMatch(dialogSrc, /freezeScroll/);
    assert.doesNotMatch(dialogSrc, /!overflow-hidden/);
    assert.match(dialogSrc, /focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  });
});

describe("VAT-ANON-3.3 anonymous metadata contract", () => {
  it("anonymous request may send optional title; never collaborators; public confirm unchanged", () => {
    const anonMutate = dialogSrc.slice(
      dialogSrc.indexOf("identifyAnonymouslyMutation"),
      dialogSrc.indexOf("identifyAnonymouslyMutation") + 900,
    );
    assert.match(anonMutate, /commentId:\s*selectedCommentId/);
    assert.match(anonMutate, /sourceCommentId:\s*selectedCommentId/);
    assert.match(anonMutate, /trimmedTitle \? \{ title: trimmedTitle \}/);
    assert.doesNotMatch(anonMutate, /collaborators/);

    const confirmMutate = dialogSrc.slice(
      dialogSrc.indexOf("const confirmMutation = useMutation"),
      dialogSrc.indexOf("const attachMutation = useMutation"),
    );
    assert.match(confirmMutate, /title\.trim/);
    assert.match(confirmMutate, /collaborators\.trim/);
  });

  it("helper copy explains optional public title; collaborators deferred to reveal", () => {
    assert.match(dialogSrc, /data-testid="artist-anonymous-metadata-helper"/);
    assert.match(
      dialogSrc,
      /Title is optional and public\. Collaborators are not saved on anonymous IDs/,
    );
  });
});
