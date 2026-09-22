/**
 * VAT-ANON-3.5 — no Radix modal remount; visual suppress while VAT covers.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dialogSrc = readFileSync(
  join(here, "../components/artist-verification-dialog.tsx"),
  "utf8",
);
const hostSrc = readFileSync(
  join(here, "../components/verified-artist-tools-paywall-host.tsx"),
  "utf8",
);
const paywallSrc = readFileSync(
  join(here, "../components/verified-artist-tools-paywall.tsx"),
  "utf8",
);

describe("VAT-ANON-3.5 no Radix modal remount + visual suppress", () => {
  it("keeps Dialog modal (no modal true→false→true) while VAT covering", () => {
    assert.doesNotMatch(dialogSrc, /modal=\{!vatPaywallCovering\}/);
    assert.doesNotMatch(dialogSrc, /modal=\{false\}/);
    assert.doesNotMatch(dialogSrc, /modal=\{vatPaywallCovering/);
    // Default Radix modal=true — no modal prop override on Dialog.
    assert.match(dialogSrc, /<Dialog open=\{isOpen\} onOpenChange=\{handleOpenChange\}>/);
  });

  it("has no custom scroll freeze/restore", () => {
    assert.doesNotMatch(dialogSrc, /scrollTopBeforePaywallRef/);
    assert.doesNotMatch(dialogSrc, /freezeScroll/);
    assert.doesNotMatch(dialogSrc, /!overflow-hidden/);
    assert.doesNotMatch(dialogSrc, /scrollTop\s*=/);
    // useLayoutEffect only belonged to scroll freeze — should be gone from this file.
    assert.doesNotMatch(dialogSrc, /useLayoutEffect/);
  });

  it("visually suppresses Confirm while covering; clears only after dismiss settled", () => {
    assert.match(dialogSrc, /vatPaywallCovering && "pointer-events-none opacity-0"/);
    assert.match(dialogSrc, /data-vat-paywall-covering/);
    assert.match(dialogSrc, /aria-hidden=\{vatPaywallCovering/);
    assert.match(dialogSrc, /inert/);
    assert.match(dialogSrc, /setVatPaywallCovering\(true\)/);
    assert.match(
      dialogSrc,
      /onDismissed:\s*\(\)\s*=>\s*setVatPaywallCovering\(false\)/,
    );
    assert.match(hostSrc, /onDismissSettled/);
    assert.match(
      paywallSrc,
      /onAnimationEnd=\{\(animationOpen\) => \{[\s\S]*?if \(!animationOpen\) \{[\s\S]*?onDismissSettled\?\.\(\)/,
    );
  });

  it("keeps form mounted; selection/title/collaborators not cleared on VAT open", () => {
    assert.match(dialogSrc, /const \[title, setTitle\]/);
    assert.match(dialogSrc, /const \[collaborators, setCollaborators\]/);
    assert.match(dialogSrc, /selectedCommentId/);
    assert.match(dialogSrc, /focus\(\{\s*preventScroll:\s*true\s*\}\)/);
    const identify = dialogSrc.slice(
      dialogSrc.indexOf("handleIdentifyAnonymously"),
      dialogSrc.indexOf("handleIdentifyAnonymously") + 700,
    );
    assert.doesNotMatch(identify, /handleClose|onClose\(|resetState/);
    assert.doesNotMatch(identify, /setTitle\(|setCollaborators\(|setSelectedCommentId\(/);
    assert.doesNotMatch(identify, /isOpen:\s*false/);
  });
});
