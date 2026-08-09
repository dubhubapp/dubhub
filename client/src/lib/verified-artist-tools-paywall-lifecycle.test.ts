import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PAYWALL_FOOTER_GEOMETRY,
  PAYWALL_SHELL_CLASS,
  PAYWALL_SUCCESS_CONFIRMATION_LINES,
  isPaywallCompactShellPhase,
  isPaywallInFlightCommercePhase,
  isPaywallTerminalCommercePhase,
  paywallVinylLoadingCopy,
  resolvePhaseAfterPurchaseReport,
  resolvePhaseAfterRestoreReport,
  shouldAutoCloseAfterVerifiedSuccess,
  shouldForceActiveFromPaidStatus,
  shouldReservePaywallDisclosureHeight,
  shouldShowPaywallDisclosureContent,
  shouldShowPaywallPackageChrome,
  shouldShowPaywallPrimaryPurchaseButton,
  shouldShowPaywallRestoreButton,
  shouldShowPaywallVinylLoading,
  type PaywallUiPhase,
} from "./verified-artist-tools-paywall-lifecycle";
import { PAYWALL_UI_COPY } from "./verified-artist-tools-paywall-copy";

describe("verified-artist-tools-paywall-lifecycle", () => {
  it("does not auto-close after verified success", () => {
    assert.equal(shouldAutoCloseAfterVerifiedSuccess(), false);
  });

  it("maps purchase cancel back to ready without error", () => {
    assert.equal(
      resolvePhaseAfterPurchaseReport({ outcome: "user_cancelled" }),
      "ready",
    );
  });

  it("maps verified success and verification-pending distinctly", () => {
    assert.equal(
      resolvePhaseAfterPurchaseReport({
        outcome: "success",
        serverSync: { verificationPending: false },
      }),
      "success",
    );
    assert.equal(
      resolvePhaseAfterPurchaseReport({
        outcome: "success",
        serverSync: { verificationPending: true },
      }),
      "verification_pending",
    );
  });

  it("maps restore success and nothing-to-restore", () => {
    assert.equal(
      resolvePhaseAfterRestoreReport(
        { outcome: "success", serverSync: { verificationPending: false } },
        true,
      ),
      "restore_success",
    );
    assert.equal(
      resolvePhaseAfterRestoreReport({ outcome: "nothing_to_restore" }, true),
      "restore_nothing",
    );
  });

  it("blocks active while commerce session is active even if paid flips", () => {
    assert.equal(
      shouldForceActiveFromPaidStatus({
        phase: "purchasing",
        commerceSessionActive: true,
        openedWhilePaid: false,
        hasPaidToolAccess: true,
        freshnessFresh: true,
      }),
      false,
    );
    assert.equal(
      shouldForceActiveFromPaidStatus({
        phase: "verifying",
        commerceSessionActive: true,
        openedWhilePaid: false,
        hasPaidToolAccess: true,
        freshnessFresh: true,
      }),
      false,
    );
    assert.equal(
      shouldForceActiveFromPaidStatus({
        phase: "success",
        commerceSessionActive: true,
        openedWhilePaid: false,
        hasPaidToolAccess: true,
        freshnessFresh: true,
      }),
      false,
    );
  });

  it("never forces active when session opened unpaid", () => {
    assert.equal(
      shouldForceActiveFromPaidStatus({
        phase: "ready",
        commerceSessionActive: false,
        openedWhilePaid: false,
        hasPaidToolAccess: true,
        freshnessFresh: true,
      }),
      false,
    );
  });

  it("allows active only when opened already paid", () => {
    assert.equal(
      shouldForceActiveFromPaidStatus({
        phase: "offerings_loading",
        commerceSessionActive: false,
        openedWhilePaid: true,
        hasPaidToolAccess: true,
        freshnessFresh: true,
      }),
      true,
    );
  });

  it("treats purchasing/verifying as in-flight commerce", () => {
    assert.equal(isPaywallInFlightCommercePhase("purchasing"), true);
    assert.equal(isPaywallInFlightCommercePhase("verifying"), true);
    assert.equal(isPaywallTerminalCommercePhase("success"), true);
    assert.equal(isPaywallCompactShellPhase("success"), true);
    assert.equal(isPaywallCompactShellPhase("ready"), false);
  });

  it("reserves disclosure height through purchasing and verifying", () => {
    for (const phase of ["ready", "purchasing", "restoring", "verifying"] as PaywallUiPhase[]) {
      assert.equal(shouldReservePaywallDisclosureHeight(phase), true);
      assert.equal(shouldShowPaywallDisclosureContent(phase), true);
      assert.equal(shouldShowPaywallPrimaryPurchaseButton(phase), true);
    }
    assert.equal(shouldShowPaywallPackageChrome("ready"), true);
    assert.equal(shouldShowPaywallPackageChrome("purchasing"), false);
    assert.equal(shouldShowPaywallPackageChrome("verifying"), false);
    assert.equal(shouldShowPaywallVinylLoading("purchasing"), true);
    assert.equal(shouldShowPaywallVinylLoading("verifying"), true);
    assert.equal(shouldShowPaywallVinylLoading("restoring"), true);
    assert.equal(shouldShowPaywallRestoreButton("verifying"), false);
  });

  it("success confirmation is exactly four non-empty feature lines", () => {
    assert.equal(PAYWALL_SUCCESS_CONFIRMATION_LINES.length, 4);
    assert.equal(
      PAYWALL_SUCCESS_CONFIRMATION_LINES[0],
      "Unlimited releases and active future releases",
    );
    assert.equal(
      PAYWALL_SUCCESS_CONFIRMATION_LINES[2],
      "Pre-save, Pre-add and Pre-order links",
    );
    for (const line of PAYWALL_SUCCESS_CONFIRMATION_LINES) {
      assert.ok(line.trim().length > 0);
    }
    assert.equal(new Set(PAYWALL_SUCCESS_CONFIRMATION_LINES).size, 4);
    assert.ok(PAYWALL_SHELL_CLASS.includes("rounded-t-[28px]"));
    assert.ok(PAYWALL_SHELL_CLASS.includes("backdrop-blur"));
  });

  it("vinyl loading copy covers processing, restore, and verifying", () => {
    assert.equal(paywallVinylLoadingCopy("purchasing")?.title, "Processing…");
    assert.equal(paywallVinylLoadingCopy("verifying")?.title, "Unlocking your tools…");
    assert.match(paywallVinylLoadingCopy("verifying")?.body ?? "", /Confirming your purchase/);
    assert.equal(paywallVinylLoadingCopy("restoring")?.title, "Restoring…");
    assert.equal(paywallVinylLoadingCopy("ready"), null);
  });

  it("keeps disclosure reserved only for commerce; success is compact", () => {
    assert.equal(shouldReservePaywallDisclosureHeight("success"), false);
    assert.equal(shouldShowPaywallDisclosureContent("success"), false);
    assert.equal(isPaywallCompactShellPhase("success"), true);
    assert.equal(isPaywallCompactShellPhase("active"), true);
  });

  it("verification pending never uses verified-success copy", () => {
    assert.notEqual(
      PAYWALL_UI_COPY.verificationPendingTitle,
      PAYWALL_UI_COPY.successTitle,
    );
    assert.equal(
      PAYWALL_UI_COPY.successBody,
      "Your artist tools are ready to use.",
    );
    assert.equal(PAYWALL_UI_COPY.unlockingTitle, "Unlocking your tools…");
    assert.equal(PAYWALL_UI_COPY.activeBody, "Your artist tools are unlocked.");
    assert.match(PAYWALL_UI_COPY.verificationPendingBody, /verifying your access/i);
  });

  it("exports stable footer geometry tokens", () => {
    assert.ok(PAYWALL_FOOTER_GEOMETRY.disclosureMinHeightClass.includes("min-h-"));
    assert.ok(PAYWALL_FOOTER_GEOMETRY.footerActionsMinHeightClass.includes("min-h-"));
    assert.ok(PAYWALL_FOOTER_GEOMETRY.primaryButtonMinHeightClass.includes("min-h-"));
  });
});
