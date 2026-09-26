import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type {
  SubscriptionEnvironmentStatusView,
  UserSubscriptionStatusResponse,
} from "./subscription-status";
import type { SubscriptionRefreshResult } from "./subscription-refresh";
import {
  CANCELLATION_FEEDBACK_BASELINE_KEY,
  CANCELLATION_FEEDBACK_BASELINE_MAX_AGE_MS,
  CANCELLATION_FEEDBACK_COPY,
  CANCELLATION_FEEDBACK_LOG_LINES,
  CANCELLATION_FEEDBACK_OPPORTUNITY_KEY,
  CANCELLATION_FEEDBACK_OPPORTUNITY_MAX_AGE_MS,
  CANCELLATION_FEEDBACK_REASONS,
  armCancellationFeedbackFromSettingsRow,
  canArmCancellationFeedback,
  canPresentCancellationFeedbackSheet,
  canSendCancellationFeedback,
  clearCancellationFeedbackSession,
  handleCancellationFeedbackForeground,
  isCancellationFeedbackEventSeen,
  isCancellationFeedbackLocalQaBuild,
  isVoluntaryCancellationStatus,
  markCancellationFeedbackEventSeen,
  readCancellationFeedbackBaseline,
  readCancellationFeedbackOpportunity,
  registerCancellationFeedbackDebugOpener,
  resetCancellationFeedbackDebugForTests,
  resolveCancellationFeedbackSubmission,
  syncCancellationFeedbackDebugHelper,
  writeCancellationFeedbackDebugOpportunity,
  type CancellationFeedbackArmInput,
  type CancellationFeedbackStore,
} from "./subscription-cancellation-feedback";

const here = dirname(fileURLToPath(import.meta.url));
const vatRowSrc = readFileSync(
  join(here, "../components/verified-artist-tools-settings-row.tsx"),
  "utf8",
);
const deleteDialogSrc = readFileSync(
  join(here, "../components/auth/DeleteAccountDialog.tsx"),
  "utf8",
);
const hostSrc = readFileSync(
  join(here, "../components/subscription-cancellation-feedback-host.tsx"),
  "utf8",
);
const sheetSrc = readFileSync(
  join(here, "../components/subscription-cancellation-feedback-sheet.tsx"),
  "utf8",
);
const libSrc = readFileSync(
  join(here, "./subscription-cancellation-feedback.ts"),
  "utf8",
);
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const authSrc = readFileSync(join(here, "./auth-session-utils.ts"), "utf8");
const legalSrc = readFileSync(join(here, "./legal-urls.ts"), "utf8");
const drawerSrc = readFileSync(join(here, "../components/ui/drawer.tsx"), "utf8");

function memoryStore(): CancellationFeedbackStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function envView(
  overrides: Partial<SubscriptionEnvironmentStatusView> = {},
): SubscriptionEnvironmentStatusView {
  return {
    state: "active",
    freshness: "fresh",
    hasPaidToolAccess: true,
    irreversibleActionsAllowed: true,
    accessThrough: "2026-10-01T00:00:00.000Z",
    entitlementIdentifier: "verified_artist_tools",
    productIdentifier: "vat_monthly",
    willRenew: true,
    billingIssue: false,
    gracePeriod: false,
    expiresAt: "2026-10-01T00:00:00.000Z",
    lastVerifiedAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function statusResponse(
  environment: "sandbox" | "production",
  overrides: Partial<SubscriptionEnvironmentStatusView> = {},
): UserSubscriptionStatusResponse {
  const selected = envView(overrides);
  const other = envView({
    state: "never_subscribed",
    hasPaidToolAccess: false,
    willRenew: null,
    accessThrough: null,
    productIdentifier: null,
    expiresAt: null,
  });
  return {
    account: {
      userId: "user-1",
      accountType: "artist",
      verifiedArtist: true,
      subscriptionSubject: true,
    },
    provider: "revenuecat",
    environments: {
      production: environment === "production" ? selected : other,
      sandbox: environment === "sandbox" ? selected : other,
    },
  };
}

function refreshOk(
  status: UserSubscriptionStatusResponse,
): SubscriptionRefreshResult {
  return {
    ok: true,
    verificationPending: false,
    httpStatus: 200,
    latencyMs: 1,
    failureReason: null,
    contentType: "application/json",
    bodyPreview: null,
    status,
  };
}

const NOW = Date.parse("2026-09-26T12:00:00.000Z");
const ACCESS = "2026-10-01T00:00:00.000Z";

function armInput(
  overrides: Partial<CancellationFeedbackArmInput> = {},
): CancellationFeedbackArmInput {
  return {
    userId: "user-1",
    environment: "sandbox",
    state: "active",
    freshness: "fresh",
    hasPaidToolAccess: true,
    willRenew: true,
    accessThrough: ACCESS,
    productIdentifier: "vat_monthly",
    billingIssue: false,
    gracePeriod: false,
    expiresAt: ACCESS,
    ...overrides,
  };
}

function arm(session: CancellationFeedbackStore, overrides?: Partial<CancellationFeedbackArmInput>) {
  return armCancellationFeedbackFromSettingsRow(armInput(overrides), {
    now: NOW,
    session,
  });
}

describe("cancellation feedback manage-subscription arm", () => {
  it("opens Manage Subscription immediately and does not refresh first", () => {
    const start = vatRowSrc.indexOf("const onManageSubscription");
    const end = vatRowSrc.indexOf("if (!enabled || !paywallEnabled)");
    const manageFn = vatRowSrc.slice(start, end);
    assert.ok(start >= 0);
    assert.match(manageFn, /armCancellationFeedbackFromSettingsRow\(/);
    assert.match(manageFn, /openIosManageSubscriptions\(\)/);
    assert.ok(
      manageFn.indexOf("armCancellationFeedbackFromSettingsRow") <
        manageFn.indexOf("openIosManageSubscriptions()"),
    );
    assert.equal(manageFn.includes("await"), false);
    assert.equal(manageFn.includes("subscription-refresh"), false);
    assert.equal(manageFn.includes("retryAuthoritativeSubscriptionStatus"), false);
    assert.match(legalSrc, /window\.location\.href = IOS_MANAGE_SUBSCRIPTIONS_URL/);
    assert.doesNotMatch(legalSrc, /subscription-cancellation-feedback/);
  });

  it("does not arm from account-deletion Manage Subscription", () => {
    assert.match(deleteDialogSrc, /openIosManageSubscriptions\(\)/);
    assert.doesNotMatch(deleteDialogSrc, /armCancellationFeedbackFromSettingsRow/);
    assert.doesNotMatch(deleteDialogSrc, /subscription-cancellation-feedback/);
  });

  it("arms only a fresh renewing paid subscription", () => {
    const session = memoryStore();
    assert.equal(arm(session), true);
    const baseline = readCancellationFeedbackBaseline({ now: NOW, session });
    assert.equal(baseline?.willRenew, true);
    assert.equal(baseline?.productIdentifier, "vat_monthly");
    assert.equal(canArmCancellationFeedback(armInput({ willRenew: false })), false);
    assert.equal(canArmCancellationFeedback(armInput({ state: "cancelled_but_active_until_expiry" })), false);
    assert.equal(canArmCancellationFeedback(armInput({ gracePeriod: true })), false);
    assert.equal(canArmCancellationFeedback(armInput({ billingIssue: true })), false);
    assert.equal(canArmCancellationFeedback(armInput({ freshness: "stale" })), false);
    assert.equal(canArmCancellationFeedback(armInput({ hasPaidToolAccess: false })), false);
    assert.equal(
      canArmCancellationFeedback(
        armInput({
          productIdentifier: "rc_promo_verified_artist_tools_lifetime",
          accessThrough: null,
          expiresAt: null,
          willRenew: false,
        }),
      ),
      false,
    );
  });
});

describe("cancellation feedback foreground return", () => {
  it("does nothing when no baseline exists", async () => {
    let calls = 0;
    const result = await handleCancellationFeedbackForeground({
      isActive: true,
      documentVisible: true,
      userId: "user-1",
      now: NOW,
      session: memoryStore(),
      local: memoryStore(),
      buildChannel: "local",
      refresh: async () => {
        calls += 1;
        return refreshOk(statusResponse("sandbox"));
      },
    });
    assert.equal(result.type, "ignored");
    assert.equal(calls, 0);
  });

  it("refreshes once for one return and ignores a second foreground", async () => {
    const session = memoryStore();
    const local = memoryStore();
    arm(session);
    let calls = 0;
    const refresh = async () => {
      calls += 1;
      return refreshOk(statusResponse("sandbox", { willRenew: true }));
    };
    const first = handleCancellationFeedbackForeground({
      isActive: true,
      documentVisible: true,
      userId: "user-1",
      now: NOW,
      session,
      local,
      buildChannel: "local",
      refresh,
    });
    const second = handleCancellationFeedbackForeground({
      isActive: true,
      documentVisible: true,
      userId: "user-1",
      now: NOW,
      session,
      local,
      buildChannel: "local",
      refresh,
    });
    const [a, b] = await Promise.all([first, second]);
    assert.equal(calls, 1);
    assert.equal([a.type, b.type].filter((type) => type === "ignored").length, 1);
    assert.equal(readCancellationFeedbackBaseline({ now: NOW, session }), null);
  });

  it("does not refresh while the document is hidden", async () => {
    const session = memoryStore();
    arm(session);
    let calls = 0;
    const result = await handleCancellationFeedbackForeground({
      isActive: true,
      documentVisible: false,
      userId: "user-1",
      now: NOW,
      session,
      local: memoryStore(),
      buildChannel: "local",
      refresh: async () => {
        calls += 1;
        return refreshOk(statusResponse("sandbox"));
      },
    });
    assert.equal(result.type, "ignored");
    assert.equal(calls, 0);
    assert.ok(readCancellationFeedbackBaseline({ now: NOW, session }));
  });

  it("clears the baseline and shows nothing when the subscription is still renewing", async () => {
    const session = memoryStore();
    arm(session);
    const result = await handleCancellationFeedbackForeground({
      isActive: true,
      documentVisible: true,
      userId: "user-1",
      now: NOW,
      session,
      local: memoryStore(),
      buildChannel: "local",
      refresh: async () => refreshOk(statusResponse("sandbox", { willRenew: true, state: "active" })),
    });
    assert.equal(result.type, "not_cancelled");
    assert.equal(readCancellationFeedbackOpportunity({ now: NOW, session }), null);
    assert.equal(readCancellationFeedbackBaseline({ now: NOW, session }), null);
  });

  it("clears the baseline and shows nothing when refresh fails", async () => {
    const session = memoryStore();
    arm(session);
    const result = await handleCancellationFeedbackForeground({
      isActive: true,
      documentVisible: true,
      userId: "user-1",
      now: NOW,
      session,
      local: memoryStore(),
      buildChannel: "local",
      refresh: async () => ({
        ok: false,
        verificationPending: true,
        httpStatus: 502,
        latencyMs: 1,
        failureReason: "server_error_502",
        contentType: null,
        bodyPreview: null,
        status: null,
      }),
    });
    assert.equal(result.type, "refresh_error");
    assert.equal(readCancellationFeedbackOpportunity({ now: NOW, session }), null);
  });

  it("does not refresh for another user and does not let them consume the baseline", async () => {
    const session = memoryStore();
    arm(session);
    let calls = 0;
    const result = await handleCancellationFeedbackForeground({
      isActive: true,
      documentVisible: true,
      userId: "user-2",
      now: NOW,
      session,
      local: memoryStore(),
      buildChannel: "local",
      refresh: async () => {
        calls += 1;
        return refreshOk(statusResponse("sandbox"));
      },
    });
    assert.equal(result.type, "user_mismatch");
    assert.equal(calls, 0);
    assert.equal(readCancellationFeedbackBaseline({ now: NOW, session }), null);
  });

  it("drops an expired baseline without refreshing", async () => {
    const session = memoryStore();
    arm(session);
    let calls = 0;
    const result = await handleCancellationFeedbackForeground({
      isActive: true,
      documentVisible: true,
      userId: "user-1",
      now: NOW + CANCELLATION_FEEDBACK_BASELINE_MAX_AGE_MS + 1,
      session,
      local: memoryStore(),
      buildChannel: "local",
      refresh: async () => {
        calls += 1;
        return refreshOk(statusResponse("sandbox"));
      },
    });
    assert.equal(result.type, "ignored");
    assert.equal(calls, 0);
    assert.equal(session.getItem(CANCELLATION_FEEDBACK_BASELINE_KEY), null);
  });

  it("does not poll", () => {
    assert.doesNotMatch(libSrc, /setInterval|setTimeout/);
    assert.doesNotMatch(hostSrc, /setInterval|setTimeout/);
    assert.match(hostSrc, /appStateChange/);
    assert.match(hostSrc, /refreshServerSubscriptionSnapshot/);
  });
});

describe("cancellation feedback qualification", () => {
  async function qualify(overrides: Partial<SubscriptionEnvironmentStatusView>) {
    const session = memoryStore();
    const local = memoryStore();
    arm(session);
    return handleCancellationFeedbackForeground({
      isActive: true,
      documentVisible: true,
      userId: "user-1",
      now: NOW,
      session,
      local,
      buildChannel: "local",
      refresh: async () => refreshOk(statusResponse("sandbox", overrides)),
    });
  }

  it("qualifies active to cancelled_but_active_until_expiry for the same period", async () => {
    const session = memoryStore();
    arm(session);
    const result = await handleCancellationFeedbackForeground({
      isActive: true,
      documentVisible: true,
      userId: "user-1",
      now: NOW,
      session,
      local: memoryStore(),
      buildChannel: "local",
      refresh: async () =>
        refreshOk(
          statusResponse("sandbox", {
            state: "cancelled_but_active_until_expiry",
            willRenew: false,
            accessThrough: ACCESS,
          }),
        ),
    });
    assert.equal(result.type, "opportunity");
    const opportunity = readCancellationFeedbackOpportunity({ now: NOW, session });
    assert.equal(opportunity?.accessThrough, ACCESS);
    assert.equal(opportunity?.productIdentifier, "vat_monthly");
  });

  it("does not qualify expired, grace, billing, refunded, revoked, or lifetime", async () => {
    const cases: Partial<SubscriptionEnvironmentStatusView>[] = [
      { state: "expired", willRenew: false, hasPaidToolAccess: false },
      { state: "grace_period", gracePeriod: true, willRenew: false },
      { state: "billing_issue", billingIssue: true, willRenew: false, hasPaidToolAccess: false },
      { state: "refunded", willRenew: false, hasPaidToolAccess: false },
      { state: "revoked", willRenew: false, hasPaidToolAccess: false },
      {
        state: "active",
        willRenew: false,
        accessThrough: null,
        expiresAt: null,
        productIdentifier: "rc_promo_verified_artist_tools_lifetime",
        hasPaidToolAccess: true,
      },
    ];
    for (const overrides of cases) {
      const result = await qualify(overrides);
      assert.equal(result.type, "not_cancelled", JSON.stringify(overrides));
    }
    assert.equal(
      isVoluntaryCancellationStatus({
        state: "active",
        freshness: "fresh",
        hasPaidToolAccess: true,
        willRenew: false,
        accessThrough: null,
        billingIssue: false,
        gracePeriod: false,
        isLifetime: true,
      }),
      false,
    );
    assert.equal(
      isVoluntaryCancellationStatus({
        state: "cancelled_but_active_until_expiry",
        freshness: "stale",
        hasPaidToolAccess: true,
        willRenew: false,
        accessThrough: ACCESS,
        billingIssue: false,
        gracePeriod: false,
        isLifetime: false,
      }),
      false,
    );
  });
});

describe("cancellation feedback dedupe", () => {
  it("shows one event once and allows a later accessThrough", () => {
    const local = memoryStore();
    const event = {
      userId: "user-1",
      environment: "sandbox",
      productIdentifier: "vat_monthly",
      accessThrough: ACCESS,
    };
    assert.equal(isCancellationFeedbackEventSeen(event, { local }), false);
    markCancellationFeedbackEventSeen(event, { local });
    assert.equal(isCancellationFeedbackEventSeen(event, { local }), true);
    assert.equal(
      isCancellationFeedbackEventSeen({ ...event, accessThrough: "2026-11-01T00:00:00.000Z" }, { local }),
      false,
    );
    const session = memoryStore();
    session.setItem(CANCELLATION_FEEDBACK_BASELINE_KEY, "{}");
    clearCancellationFeedbackSession({ session });
    assert.equal(session.getItem(CANCELLATION_FEEDBACK_BASELINE_KEY), null);
    assert.equal(isCancellationFeedbackEventSeen(event, { local }), true);
  });

  it("does not create a second opportunity for a seen event", async () => {
    const session = memoryStore();
    const local = memoryStore();
    markCancellationFeedbackEventSeen(
      {
        userId: "user-1",
        environment: "sandbox",
        productIdentifier: "vat_monthly",
        accessThrough: ACCESS,
      },
      { local },
    );
    arm(session);
    const result = await handleCancellationFeedbackForeground({
      isActive: true,
      documentVisible: true,
      userId: "user-1",
      now: NOW,
      session,
      local,
      buildChannel: "local",
      refresh: async () =>
        refreshOk(
          statusResponse("sandbox", {
            state: "cancelled_but_active_until_expiry",
            willRenew: false,
          }),
        ),
    });
    assert.equal(result.type, "not_cancelled");
    assert.equal(readCancellationFeedbackOpportunity({ now: NOW, session }), null);
  });

  it("marks seen on dismiss and submit paths", () => {
    assert.match(sheetSrc, /onDismiss\(\)/);
    assert.match(sheetSrc, /button-cancellation-feedback-skip/);
    assert.match(sheetSrc, /handleOpenChange/);
    assert.match(hostSrc, /acknowledge\("dismissed"\)/);
    assert.match(hostSrc, /acknowledge\("submitted"\)/);
    assert.match(hostSrc, /markCancellationFeedbackEventSeen/);
  });

  it("expires a confirmed opportunity instead of showing it later", () => {
    const session = memoryStore();
    session.setItem(
      CANCELLATION_FEEDBACK_OPPORTUNITY_KEY,
      JSON.stringify({
        userId: "user-1",
        environment: "sandbox",
        productIdentifier: "vat_monthly",
        accessThrough: ACCESS,
        confirmedAt: new Date(NOW).toISOString(),
      }),
    );
    assert.ok(readCancellationFeedbackOpportunity({ now: NOW, session }));
    assert.equal(
      readCancellationFeedbackOpportunity({
        now: NOW + CANCELLATION_FEEDBACK_OPPORTUNITY_MAX_AGE_MS + 1,
        session,
      }),
      null,
    );
  });
});

describe("cancellation feedback submission and guards", () => {
  it("accepts a reason or an optional note, and blocks an empty form without dismissing", () => {
    assert.equal(canSendCancellationFeedback({ reason: null, note: "" }), false);
    assert.equal(canSendCancellationFeedback({ reason: null, note: "   " }), false);
    assert.equal(canSendCancellationFeedback({ reason: "too_expensive", note: "" }), true);
    assert.equal(canSendCancellationFeedback({ reason: null, note: "just a note" }), true);
    assert.deepEqual(
      resolveCancellationFeedbackSubmission({ reason: "too_expensive", note: "" }),
      { kind: "submit", reason: "too_expensive", note: "" },
    );
    assert.deepEqual(
      resolveCancellationFeedbackSubmission({ reason: "taking_break", note: "  back later  " }),
      { kind: "submit", reason: "taking_break", note: "back later" },
    );
    assert.deepEqual(resolveCancellationFeedbackSubmission({ reason: null, note: "just a note" }), {
      kind: "submit",
      reason: "other",
      note: "just a note",
    });
    assert.deepEqual(resolveCancellationFeedbackSubmission({ reason: null, note: "   " }), {
      kind: "blocked",
    });
  });

  it("posts only through the existing feedback route and does not change subscription state", () => {
    assert.match(sheetSrc, /apiRequest\("POST", "\/api\/feedback"/);
    assert.match(sheetSrc, /category: "subscription_cancellation"/);
    assert.doesNotMatch(sheetSrc, /subscription-refresh|subscription-sync|artist_subscription_snapshots/);
    const sendStart = sheetSrc.indexOf("const handleSend");
    const sendFn = sheetSrc.slice(sendStart, sheetSrc.indexOf("const sheetMaxHeight"));
    assert.ok(sendFn.indexOf('decision.kind !== "submit"') < sendFn.indexOf("apiRequest"));
    assert.doesNotMatch(sendFn, /finishDismiss\(\)/);
    assert.doesNotMatch(libSrc, /artist_subscription_snapshots/);
  });

  it("blocks the sheet during onboarding, deletion, paywall, commerce, and other surfaces", () => {
    const clear = {
      onboardingActive: false,
      accountDeletionActive: false,
      paywallOpen: false,
      commerceBusy: false,
      otherBlockingSurface: false,
      sensitivePath: false,
    };
    assert.equal(canPresentCancellationFeedbackSheet(clear), true);
    for (const key of Object.keys(clear) as (keyof typeof clear)[]) {
      assert.equal(canPresentCancellationFeedbackSheet({ ...clear, [key]: true }), false, key);
    }
  });

  it("uses the final copy and material sheet treatment", () => {
    assert.equal(CANCELLATION_FEEDBACK_COPY.title, "What made you cancel?");
    assert.equal(
      CANCELLATION_FEEDBACK_COPY.support,
      "Optional — your feedback helps us improve Verified Artist Tools.",
    );
    assert.equal(CANCELLATION_FEEDBACK_COPY.noteLabel, "Anything else you’d like us to know?");
    assert.equal(CANCELLATION_FEEDBACK_COPY.send, "Send feedback");
    assert.equal(CANCELLATION_FEEDBACK_COPY.skip, "Skip");
    assert.match(sheetSrc, /CANCELLATION_FEEDBACK_COPY\.title/);
    assert.match(sheetSrc, /CANCELLATION_FEEDBACK_COPY\.support/);
    assert.match(sheetSrc, /CANCELLATION_FEEDBACK_COPY\.noteLabel/);
    assert.match(sheetSrc, /CANCELLATION_FEEDBACK_COPY\.send/);
    assert.match(sheetSrc, /CANCELLATION_FEEDBACK_COPY\.skip/);
    assert.deepEqual(
      CANCELLATION_FEEDBACK_REASONS.map((item) => item.label),
      [
        "Too expensive",
        "Not using it enough",
        "Missing features I need",
        "Had trouble with the app",
        "Taking a break",
        "Other",
      ],
    );
    assert.match(sheetSrc, /CANCELLATION_FEEDBACK_REASONS\.map/);
    assert.match(sheetSrc, /APP_MATERIAL_SHEET_SURFACE_CLASS/);
    assert.match(sheetSrc, /APP_MATERIAL_FIELD_CLASS/);
    assert.match(sheetSrc, /APP_MATERIAL_FORM_PRIMARY_CLASS/);
    assert.doesNotMatch(sheetSrc, /APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS/);
    assert.match(sheetSrc, /text-muted-foreground hover:text-foreground\/90/);
    assert.doesNotMatch(sheetSrc, /#4ae9df|Are you sure|discount/i);
    assert.match(appSrc, /SubscriptionCancellationFeedbackHost/);
  });

  it("keeps one reason, disables empty Send, and lets Skip dismiss without a payload", () => {
    assert.match(sheetSrc, /<RadioGroup/);
    assert.match(sheetSrc, /value=\{reason \?\? ""\}/);
    assert.match(sheetSrc, /<RadioGroupItem/);
    assert.doesNotMatch(sheetSrc, /Checkbox|type="checkbox"|aria-multiselectable/);

    const actionsStart = sheetSrc.indexOf('data-testid="button-cancellation-feedback-send"');
    const actions = sheetSrc.slice(actionsStart - 400, actionsStart + 900);
    assert.match(actions, /disabled=\{!canSend \|\| submitting\}/);
    assert.match(actions, /data-testid="button-cancellation-feedback-skip"/);
    assert.match(actions, /onClick=\{finishDismiss\}/);
    assert.doesNotMatch(
      actions.slice(actions.indexOf("button-cancellation-feedback-skip")),
      /disabled=/,
    );
    assert.match(sheetSrc, /dismissible/);
    assert.match(sheetSrc, /if \(!next\) finishDismiss\(\)/);

    const dismissStart = sheetSrc.indexOf("const finishDismiss");
    const dismissFn = sheetSrc.slice(dismissStart, dismissStart + 180);
    assert.match(dismissFn, /onDismiss\(\)/);
    assert.match(hostSrc, /onDismiss=\{\(\) => acknowledge\("dismissed"\)\}/);
    const ackStart = hostSrc.indexOf('const acknowledge = (kind: "dismissed" | "submitted")');
    const ackFn = hostSrc.slice(ackStart, ackStart + 700);
    assert.match(ackFn, /markCancellationFeedbackEventSeen/);
    assert.match(ackFn, /setOpen\(false\)/);
  });

  it("moves with the keyboard using the comments contract and keeps the note above the fold", () => {
    assert.match(sheetSrc, /repositionInputs=\{false\}/);
    assert.match(sheetSrc, /shouldScaleBackground=\{false\}/);
    assert.match(sheetSrc, /dismissible/);
    assert.match(sheetSrc, /KeyboardResize\.None/);
    assert.match(sheetSrc, /Keyboard\.setResizeMode\(\{ mode: KeyboardResize\.None \}\)/);
    assert.match(sheetSrc, /Keyboard\.setResizeMode\(\{ mode: restoreMode \}\)/);
    assert.match(sheetSrc, /keyboardWillShow/);
    assert.match(sheetSrc, /setKeyboardInsetPx\(height\)/);
    assert.match(sheetSrc, /keyboardWillHide/);
    assert.match(sheetSrc, /setKeyboardInsetPx\(0\)/);
    assert.match(sheetSrc, /bottom 0\.5s cubic-bezier\(0\.32, 0\.72, 0, 1\)/);
    assert.match(sheetSrc, /bottom: keyboardInsetPx/);
    assert.doesNotMatch(sheetSrc, /useIosKeyboardAwareScroll|scrollIntoView|addEventListener\("resize"|keyboardPadPx/);

    const reasonsStart = sheetSrc.indexOf('data-testid="cancellation-feedback-reasons"');
    const composerStart = sheetSrc.indexOf('data-testid="cancellation-feedback-composer"');
    const reasons = sheetSrc.slice(reasonsStart, composerStart);
    assert.match(reasons, /<RadioGroup/);
    assert.match(reasons, /overflow-y-auto/);
    assert.doesNotMatch(reasons, /cancellation-feedback-note|button-cancellation-feedback-send|button-cancellation-feedback-skip/);

    const composer = sheetSrc.slice(composerStart);
    assert.match(composer, /cancellation-feedback-note/);
    assert.match(composer, /button-cancellation-feedback-send/);
    assert.match(composer, /button-cancellation-feedback-skip/);
    assert.match(composer, /pb-\[calc\(0\.5rem\+env\(safe-area-inset-bottom,0px\)\)\]/);
    assert.match(composer, /keyboardInsetPx > 0\s*\?\s*"pb-2"/);
    assert.doesNotMatch(composer, /keyboardHeight|paddingBottom:\s*keyboard/);

    assert.match(sheetSrc, /value=\{reason \?\? ""\}/);
    assert.match(sheetSrc, /if \(!next\) finishDismiss\(\)/);
    assert.doesNotMatch(drawerSrc, /keyboardPadPx|keyboardHeight|useIosKeyboardAwareScroll/);
  });

  it("logs fixed dev lines and clears the waiting session on logout without wiping seen history", () => {
    assert.deepEqual(Object.values(CANCELLATION_FEEDBACK_LOG_LINES), [
      "[DubHub Cancellation Feedback] armed",
      "[DubHub Cancellation Feedback] returned",
      "[DubHub Cancellation Feedback] refresh complete",
      "[DubHub Cancellation Feedback] cancellation confirmed",
      "[DubHub Cancellation Feedback] no cancellation",
      "[DubHub Cancellation Feedback] sheet shown",
      "[DubHub Cancellation Feedback] dismissed",
      "[DubHub Cancellation Feedback] submitted",
    ]);
    const logStart = libSrc.indexOf("export function logCancellationFeedback");
    const logFn = libSrc.slice(logStart, libSrc.indexOf("function defaultSessionStore"));
    assert.doesNotMatch(logFn, /note|productIdentifier|accessThrough|userId/);
    assert.match(authSrc, /clearCancellationFeedbackSession\(\)/);
    assert.match(appSrc, /clearCancellationFeedbackSession\(\)/);
    assert.match(libSrc, /CANCELLATION_FEEDBACK_SEEN_KEY/);
    const clearStart = libSrc.indexOf("export function clearCancellationFeedbackSession");
    const clearFn = libSrc.slice(clearStart, clearStart + 280);
    assert.doesNotMatch(clearFn, /CANCELLATION_FEEDBACK_SEEN_KEY/);
  });
});

describe("cancellation feedback local QA console helper", () => {
  it("show() exists on the local build channel, opens the sheet, and does not refresh or open Apple", () => {
    resetCancellationFeedbackDebugForTests();
    assert.equal(isCancellationFeedbackLocalQaBuild("local"), true);
    const session = memoryStore();
    const target: {
      __dubhubCancellationFeedbackDebug?: { show: () => void };
    } = {};
    let opened = false;
    const unregister = registerCancellationFeedbackDebugOpener(() => {
      writeCancellationFeedbackDebugOpportunity("user-1", { now: NOW, session });
      opened = true;
    });
    syncCancellationFeedbackDebugHelper("local", target);
    assert.equal(typeof target.__dubhubCancellationFeedbackDebug?.show, "function");
    target.__dubhubCancellationFeedbackDebug?.show();
    assert.equal(opened, true);
    const opportunity = readCancellationFeedbackOpportunity({ now: NOW, session });
    assert.equal(opportunity?.userId, "user-1");
    assert.equal(opportunity?.productIdentifier, "dev_qa");
    assert.equal(opportunity?.accessThrough, "dev-qa");
    assert.equal(session.getItem(CANCELLATION_FEEDBACK_BASELINE_KEY), null);

    const debugStart = libSrc.indexOf("CANCELLATION_FEEDBACK_DEBUG_WINDOW_KEY");
    const debugSrc = libSrc.slice(debugStart);
    assert.doesNotMatch(debugSrc, /openIosManageSubscriptions|refreshServerSubscriptionSnapshot|subscription-refresh/);
    assert.match(debugSrc, /parseAppBuildChannel\(buildChannel\) === "local"/);

    const hostDebugStart = hostSrc.indexOf("const buildChannel = getAppBuildChannelFromEnv();");
    const hostDebug = hostSrc.slice(hostDebugStart, hostSrc.indexOf("const canShow"));
    assert.match(hostDebug, /syncCancellationFeedbackDebugHelper\(buildChannel\)/);
    assert.match(hostDebug, /isCancellationFeedbackLocalQaBuild\(buildChannel\)/);
    assert.match(hostDebug, /writeCancellationFeedbackDebugOpportunity\(userId\)/);
    assert.match(hostDebug, /setDebugOpen\(true\)/);
    assert.match(hostSrc, /if \(debugOpen\)/);
    assert.doesNotMatch(hostDebug, /import\.meta\.env\.DEV/);
    assert.doesNotMatch(hostDebug, /openIosManageSubscriptions|refreshServerSubscriptionSnapshot|subscription-refresh/);

    unregister();
    resetCancellationFeedbackDebugForTests();
  });

  it("does not install the helper for production or other non-local channels", () => {
    resetCancellationFeedbackDebugForTests();
    assert.equal(isCancellationFeedbackLocalQaBuild("production"), false);
    assert.equal(isCancellationFeedbackLocalQaBuild("testflight"), false);
    assert.equal(isCancellationFeedbackLocalQaBuild(null), false);
    const target: {
      __dubhubCancellationFeedbackDebug?: { show: () => void };
    } = {
      __dubhubCancellationFeedbackDebug: { show() {} },
    };
    syncCancellationFeedbackDebugHelper("production", target);
    assert.equal(target.__dubhubCancellationFeedbackDebug, undefined);
    target.__dubhubCancellationFeedbackDebug = { show() {} };
    syncCancellationFeedbackDebugHelper("testflight", target);
    assert.equal(target.__dubhubCancellationFeedbackDebug, undefined);
    assert.match(hostSrc, /getAppBuildChannelFromEnv\(\)/);
    assert.doesNotMatch(
      hostSrc.slice(hostSrc.indexOf("const buildChannel = getAppBuildChannelFromEnv();"), hostSrc.indexOf("const canShow")),
      /import\.meta\.env\.DEV/,
    );
    resetCancellationFeedbackDebugForTests();
  });
});
