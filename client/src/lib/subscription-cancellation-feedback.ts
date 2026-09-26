/**
 * Optional cancellation feedback for Verified Artist Tools.
 * Apple’s manage-subscriptions page stays immediate. A sheet is armed only
 * after one authoritative refresh proves a voluntary cancellation.
 * This module never writes subscription snapshots.
 */

import { isLifetimeSettingsAccess } from "./settings-subscription-row";
import {
  getAppBuildChannelFromEnv,
  selectAuthoritativeSubscriptionEnvironment,
  type SubscriptionEnvironmentName,
} from "./subscription-environment";
import type { UserSubscriptionStatusResponse } from "./subscription-status";
import {
  refreshServerSubscriptionSnapshot,
  type SubscriptionRefreshResult,
} from "./subscription-refresh";
import { parseAppBuildChannel, type AppBuildChannel } from "./revenuecat-provider";

export const CANCELLATION_FEEDBACK_BASELINE_KEY =
  "dubhub:vat-cancellation-feedback-baseline" as const;
export const CANCELLATION_FEEDBACK_OPPORTUNITY_KEY =
  "dubhub:vat-cancellation-feedback-opportunity" as const;
export const CANCELLATION_FEEDBACK_SEEN_KEY =
  "dubhub:vat-cancellation-feedback-seen" as const;

/** Manage-subscription handoff expires if the user never returns. */
export const CANCELLATION_FEEDBACK_BASELINE_MAX_AGE_MS = 30 * 60 * 1000;
/**
 * Confirmed sheet may wait out a short UI block in this session.
 * It must not appear hours later.
 */
export const CANCELLATION_FEEDBACK_OPPORTUNITY_MAX_AGE_MS = 10 * 60 * 1000;

export const CANCELLATION_FEEDBACK_REASONS = [
  { code: "too_expensive", label: "Too expensive" },
  { code: "not_using_enough", label: "Not using it enough" },
  { code: "missing_features", label: "Missing features I need" },
  { code: "app_trouble", label: "Had trouble with the app" },
  { code: "taking_break", label: "Taking a break" },
  { code: "other", label: "Other" },
] as const;

export type CancellationFeedbackReason =
  (typeof CANCELLATION_FEEDBACK_REASONS)[number]["code"];

export const CANCELLATION_FEEDBACK_COPY = {
  title: "What made you cancel?",
  support: "Optional — your feedback helps us improve Verified Artist Tools.",
  noteLabel: "Anything else you’d like us to know?",
  send: "Send feedback",
  skip: "Skip",
} as const;

export const CANCELLATION_FEEDBACK_LOG_LINES = {
  armed: "[DubHub Cancellation Feedback] armed",
  returned: "[DubHub Cancellation Feedback] returned",
  refresh_complete: "[DubHub Cancellation Feedback] refresh complete",
  cancellation_confirmed: "[DubHub Cancellation Feedback] cancellation confirmed",
  no_cancellation: "[DubHub Cancellation Feedback] no cancellation",
  sheet_shown: "[DubHub Cancellation Feedback] sheet shown",
  dismissed: "[DubHub Cancellation Feedback] dismissed",
  submitted: "[DubHub Cancellation Feedback] submitted",
} as const;

export type CancellationFeedbackLogEvent = keyof typeof CANCELLATION_FEEDBACK_LOG_LINES;

export type CancellationFeedbackStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type CancellationFeedbackBaseline = {
  userId: string;
  environment: SubscriptionEnvironmentName;
  productIdentifier: string;
  accessThrough: string;
  willRenew: true;
  armedAt: string;
};

export type CancellationFeedbackOpportunity = {
  userId: string;
  environment: SubscriptionEnvironmentName;
  productIdentifier: string;
  accessThrough: string;
  confirmedAt: string;
};

export type CancellationFeedbackArmInput = {
  userId: string | null;
  environment: SubscriptionEnvironmentName | null;
  state: string | null;
  freshness: string | null;
  hasPaidToolAccess: boolean;
  willRenew: boolean | null;
  accessThrough: string | null;
  productIdentifier: string | null;
  billingIssue: boolean;
  gracePeriod: boolean;
  expiresAt: string | null;
};

type SeenMap = Record<string, Record<string, true>>;

const opportunityListeners = new Set<() => void>();

function emitOpportunity(): void {
  for (const listener of opportunityListeners) listener();
}

export function subscribeCancellationFeedbackOpportunity(
  listener: () => void,
): () => void {
  opportunityListeners.add(listener);
  return () => {
    opportunityListeners.delete(listener);
  };
}

export function logCancellationFeedback(event: CancellationFeedbackLogEvent): void {
  const dev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  if (!dev) return;
  console.info(CANCELLATION_FEEDBACK_LOG_LINES[event]);
}

function defaultSessionStore(): CancellationFeedbackStore | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

function defaultLocalStore(): CancellationFeedbackStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function resolveSession(
  session: CancellationFeedbackStore | null | undefined,
): CancellationFeedbackStore | null {
  if (session === null) return null;
  return session ?? defaultSessionStore();
}

function resolveLocal(
  local: CancellationFeedbackStore | null | undefined,
): CancellationFeedbackStore | null {
  if (local === null) return null;
  return local ?? defaultLocalStore();
}

function readJson<T>(store: CancellationFeedbackStore | null, key: string): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function cancellationFeedbackEventKey(args: {
  environment: string;
  productIdentifier: string;
  accessThrough: string;
}): string {
  return JSON.stringify([args.environment, args.productIdentifier, args.accessThrough]);
}

export function sameAccessThrough(a: string, b: string): boolean {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isFinite(left) && Number.isFinite(right)) return left === right;
  return a === b;
}

function isBaselineShape(value: unknown): value is CancellationFeedbackBaseline {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CancellationFeedbackBaseline>;
  return (
    typeof row.userId === "string" &&
    row.userId.length > 0 &&
    (row.environment === "sandbox" || row.environment === "production") &&
    typeof row.productIdentifier === "string" &&
    row.productIdentifier.trim().length > 0 &&
    typeof row.accessThrough === "string" &&
    row.accessThrough.length > 0 &&
    row.willRenew === true &&
    typeof row.armedAt === "string" &&
    Number.isFinite(Date.parse(row.armedAt))
  );
}

function isOpportunityShape(value: unknown): value is CancellationFeedbackOpportunity {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CancellationFeedbackOpportunity>;
  return (
    typeof row.userId === "string" &&
    row.userId.length > 0 &&
    (row.environment === "sandbox" || row.environment === "production") &&
    typeof row.productIdentifier === "string" &&
    row.productIdentifier.length > 0 &&
    typeof row.accessThrough === "string" &&
    row.accessThrough.length > 0 &&
    typeof row.confirmedAt === "string" &&
    Number.isFinite(Date.parse(row.confirmedAt))
  );
}

export function canArmCancellationFeedback(input: CancellationFeedbackArmInput): boolean {
  if (!input.userId) return false;
  if (input.environment !== "sandbox" && input.environment !== "production") return false;
  if (input.state !== "active") return false;
  if (input.willRenew !== true) return false;
  if (input.freshness !== "fresh") return false;
  if (input.hasPaidToolAccess !== true) return false;
  if (!input.accessThrough) return false;
  if (!input.productIdentifier?.trim()) return false;
  if (input.billingIssue || input.gracePeriod) return false;
  if (
    isLifetimeSettingsAccess({
      paid: input.hasPaidToolAccess,
      freshness: input.freshness,
      state: input.state,
      productIdentifier: input.productIdentifier,
      expiresAt: input.expiresAt,
      accessThrough: input.accessThrough,
      willRenew: input.willRenew,
    })
  ) {
    return false;
  }
  return true;
}

/**
 * Synchronous session write. Never waits on the network.
 * Caller must still open Apple immediately afterwards.
 */
export function armCancellationFeedbackFromSettingsRow(
  input: CancellationFeedbackArmInput,
  options?: { now?: number; session?: CancellationFeedbackStore | null },
): boolean {
  if (!canArmCancellationFeedback(input)) return false;
  const session = resolveSession(options?.session);
  if (!session) return false;
  const baseline: CancellationFeedbackBaseline = {
    userId: input.userId as string,
    environment: input.environment as SubscriptionEnvironmentName,
    productIdentifier: input.productIdentifier!.trim(),
    accessThrough: input.accessThrough as string,
    willRenew: true,
    armedAt: new Date(options?.now ?? Date.now()).toISOString(),
  };
  try {
    session.setItem(CANCELLATION_FEEDBACK_BASELINE_KEY, JSON.stringify(baseline));
  } catch {
    return false;
  }
  logCancellationFeedback("armed");
  return true;
}

export function readCancellationFeedbackBaseline(options?: {
  now?: number;
  session?: CancellationFeedbackStore | null;
}): CancellationFeedbackBaseline | null {
  const session = resolveSession(options?.session);
  const parsed = readJson<unknown>(session, CANCELLATION_FEEDBACK_BASELINE_KEY);
  if (!isBaselineShape(parsed)) {
    if (parsed != null && session) {
      try {
        session.removeItem(CANCELLATION_FEEDBACK_BASELINE_KEY);
      } catch {
        // ignore
      }
    }
    return null;
  }
  const armedAt = Date.parse(parsed.armedAt);
  const now = options?.now ?? Date.now();
  if (!Number.isFinite(armedAt) || now - armedAt > CANCELLATION_FEEDBACK_BASELINE_MAX_AGE_MS) {
    try {
      session?.removeItem(CANCELLATION_FEEDBACK_BASELINE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
  return parsed;
}

function takeCancellationFeedbackBaseline(options?: {
  now?: number;
  session?: CancellationFeedbackStore | null;
}): CancellationFeedbackBaseline | null {
  const baseline = readCancellationFeedbackBaseline(options);
  if (!baseline) return null;
  const session = resolveSession(options?.session);
  try {
    session?.removeItem(CANCELLATION_FEEDBACK_BASELINE_KEY);
  } catch {
    // Still treat as consumed so a throw cannot refresh on every foreground.
  }
  return baseline;
}

export function clearCancellationFeedbackBaseline(options?: {
  session?: CancellationFeedbackStore | null;
}): void {
  const session = resolveSession(options?.session);
  try {
    session?.removeItem(CANCELLATION_FEEDBACK_BASELINE_KEY);
  } catch {
    // ignore
  }
}

let opportunitySnapshotRaw: string | null = null;
let opportunitySnapshot: CancellationFeedbackOpportunity | null = null;
let opportunitySnapshotReady = false;

/** Stable snapshot for useSyncExternalStore. Uses the real sessionStorage. */
export function getCancellationFeedbackOpportunitySnapshot(): CancellationFeedbackOpportunity | null {
  const session = defaultSessionStore();
  let raw: string | null = null;
  try {
    raw = session?.getItem(CANCELLATION_FEEDBACK_OPPORTUNITY_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (opportunitySnapshotReady && raw === opportunitySnapshotRaw) return opportunitySnapshot;
  opportunitySnapshotReady = true;
  opportunitySnapshotRaw = raw;
  opportunitySnapshot = readCancellationFeedbackOpportunity();
  try {
    const nextRaw = session?.getItem(CANCELLATION_FEEDBACK_OPPORTUNITY_KEY) ?? null;
    if (nextRaw !== raw) {
      opportunitySnapshotRaw = nextRaw;
      if (nextRaw == null) opportunitySnapshot = null;
    }
  } catch {
    // ignore
  }
  return opportunitySnapshot;
}

export function readCancellationFeedbackOpportunity(options?: {
  now?: number;
  session?: CancellationFeedbackStore | null;
}): CancellationFeedbackOpportunity | null {
  const session = resolveSession(options?.session);
  const parsed = readJson<unknown>(session, CANCELLATION_FEEDBACK_OPPORTUNITY_KEY);
  if (!isOpportunityShape(parsed)) {
    if (parsed != null && session) {
      try {
        session.removeItem(CANCELLATION_FEEDBACK_OPPORTUNITY_KEY);
      } catch {
        // ignore
      }
      emitOpportunity();
    }
    return null;
  }
  const confirmedAt = Date.parse(parsed.confirmedAt);
  const now = options?.now ?? Date.now();
  if (
    !Number.isFinite(confirmedAt) ||
    now - confirmedAt > CANCELLATION_FEEDBACK_OPPORTUNITY_MAX_AGE_MS
  ) {
    try {
      session?.removeItem(CANCELLATION_FEEDBACK_OPPORTUNITY_KEY);
    } catch {
      // ignore
    }
    emitOpportunity();
    return null;
  }
  return parsed;
}

export function clearCancellationFeedbackOpportunity(options?: {
  session?: CancellationFeedbackStore | null;
}): void {
  const session = resolveSession(options?.session);
  try {
    session?.removeItem(CANCELLATION_FEEDBACK_OPPORTUNITY_KEY);
  } catch {
    // ignore
  }
  emitOpportunity();
}

/** Waiting baseline and unshown sheet only. Seen-event history stays. */
export function clearCancellationFeedbackSession(options?: {
  session?: CancellationFeedbackStore | null;
}): void {
  clearCancellationFeedbackBaseline(options);
  clearCancellationFeedbackOpportunity(options);
}

function readSeenMap(local: CancellationFeedbackStore | null): SeenMap {
  const parsed = readJson<unknown>(local, CANCELLATION_FEEDBACK_SEEN_KEY);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as SeenMap;
}

export function isCancellationFeedbackEventSeen(
  args: {
    userId: string;
    environment: string;
    productIdentifier: string;
    accessThrough: string;
  },
  options?: { local?: CancellationFeedbackStore | null },
): boolean {
  const local = resolveLocal(options?.local);
  const map = readSeenMap(local);
  const key = cancellationFeedbackEventKey(args);
  return map[args.userId]?.[key] === true;
}

export function markCancellationFeedbackEventSeen(
  args: {
    userId: string;
    environment: string;
    productIdentifier: string;
    accessThrough: string;
  },
  options?: { local?: CancellationFeedbackStore | null },
): void {
  const local = resolveLocal(options?.local);
  if (!local) return;
  const map = readSeenMap(local);
  const userEvents = { ...(map[args.userId] ?? {}) };
  userEvents[cancellationFeedbackEventKey(args)] = true;
  map[args.userId] = userEvents;
  try {
    local.setItem(CANCELLATION_FEEDBACK_SEEN_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export type VoluntaryCancellationView = {
  state: string | null;
  freshness: string | null;
  hasPaidToolAccess: boolean;
  willRenew: boolean | null;
  accessThrough: string | null;
  billingIssue: boolean;
  gracePeriod: boolean;
  isLifetime: boolean;
};

export function isVoluntaryCancellationStatus(view: VoluntaryCancellationView): boolean {
  if (view.isLifetime) return false;
  if (view.state !== "cancelled_but_active_until_expiry") return false;
  if (view.freshness !== "fresh") return false;
  if (view.hasPaidToolAccess !== true) return false;
  if (view.willRenew !== false) return false;
  if (!view.accessThrough) return false;
  if (view.billingIssue) return false;
  if (view.gracePeriod) return false;
  return true;
}

export function canPresentCancellationFeedbackSheet(args: {
  onboardingActive: boolean;
  accountDeletionActive: boolean;
  paywallOpen: boolean;
  commerceBusy: boolean;
  otherBlockingSurface: boolean;
  sensitivePath: boolean;
}): boolean {
  return !(
    args.onboardingActive ||
    args.accountDeletionActive ||
    args.paywallOpen ||
    args.commerceBusy ||
    args.otherBlockingSurface ||
    args.sensitivePath
  );
}

export function isCancellationFeedbackSensitivePath(path: string): boolean {
  const raw = path.split(/[?#]/)[0] ?? "";
  return (
    raw === "/auth-callback" ||
    raw.startsWith("/auth-callback/") ||
    raw === "/auth/callback" ||
    raw.startsWith("/auth/callback/") ||
    raw === "/reset-password" ||
    raw.startsWith("/reset-password/")
  );
}

/** Send is enabled once a reason or non-whitespace note exists. Empty is not a dismissal. */
export function canSendCancellationFeedback(input: {
  reason: CancellationFeedbackReason | null;
  note: string;
}): boolean {
  return input.reason != null || input.note.trim().length > 0;
}

export function resolveCancellationFeedbackSubmission(input: {
  reason: CancellationFeedbackReason | null;
  note: string;
}):
  | { kind: "blocked" }
  | { kind: "submit"; reason: CancellationFeedbackReason; note: string } {
  const note = input.note.trim();
  if (!canSendCancellationFeedback({ reason: input.reason, note })) return { kind: "blocked" };
  if (!input.reason) return { kind: "submit", reason: "other", note };
  return { kind: "submit", reason: input.reason, note };
}

function writeOpportunity(
  opportunity: CancellationFeedbackOpportunity,
  session: CancellationFeedbackStore | null,
): void {
  if (!session) return;
  try {
    session.setItem(CANCELLATION_FEEDBACK_OPPORTUNITY_KEY, JSON.stringify(opportunity));
  } catch {
    return;
  }
  emitOpportunity();
}

export type ForegroundReturnResult = {
  type: "ignored" | "user_mismatch" | "refresh_error" | "not_cancelled" | "opportunity";
  status: UserSubscriptionStatusResponse | null;
};

/**
 * One foreground return consumes the baseline and performs at most one refresh.
 * Hidden document, missing baseline, and a second call do not refresh.
 */
export async function handleCancellationFeedbackForeground(args: {
  isActive: boolean;
  documentVisible: boolean;
  userId: string | null;
  now?: number;
  session?: CancellationFeedbackStore | null;
  local?: CancellationFeedbackStore | null;
  refresh?: () => Promise<SubscriptionRefreshResult>;
  buildChannel?: AppBuildChannel | null;
}): Promise<ForegroundReturnResult> {
  if (!args.isActive || !args.documentVisible) {
    return { type: "ignored", status: null };
  }

  const baseline = takeCancellationFeedbackBaseline({
    now: args.now,
    session: args.session,
  });
  if (!baseline) return { type: "ignored", status: null };

  logCancellationFeedback("returned");

  if (!args.userId || args.userId !== baseline.userId) {
    logCancellationFeedback("no_cancellation");
    return { type: "user_mismatch", status: null };
  }

  const refresh = args.refresh ?? refreshServerSubscriptionSnapshot;
  let result: SubscriptionRefreshResult;
  try {
    result = await refresh();
  } catch {
    logCancellationFeedback("refresh_complete");
    logCancellationFeedback("no_cancellation");
    return { type: "refresh_error", status: null };
  }

  logCancellationFeedback("refresh_complete");

  if (!result.ok || !result.status) {
    logCancellationFeedback("no_cancellation");
    return { type: "refresh_error", status: result.status };
  }

  const channel =
    args.buildChannel === undefined ? getAppBuildChannelFromEnv() : args.buildChannel;
  const selection = selectAuthoritativeSubscriptionEnvironment(result.status, channel);
  const status = selection.selectedStatus;
  const isLifetime =
    selection.ok && status
      ? isLifetimeSettingsAccess({
          paid: selection.hasPaidToolAccess === true,
          freshness: selection.freshness,
          state: selection.state ?? "",
          productIdentifier: status.productIdentifier,
          expiresAt: status.expiresAt,
          accessThrough: status.accessThrough,
          willRenew: status.willRenew,
        })
      : false;

  const qualified =
    selection.ok &&
    selection.selectedEnvironment === baseline.environment &&
    status != null &&
    status.productIdentifier === baseline.productIdentifier &&
    status.accessThrough != null &&
    sameAccessThrough(status.accessThrough, baseline.accessThrough) &&
    isVoluntaryCancellationStatus({
      state: selection.state,
      freshness: selection.freshness,
      hasPaidToolAccess: selection.hasPaidToolAccess === true,
      willRenew: status.willRenew,
      accessThrough: status.accessThrough,
      billingIssue: status.billingIssue === true,
      gracePeriod: status.gracePeriod === true,
      isLifetime,
    });

  if (!qualified) {
    logCancellationFeedback("no_cancellation");
    return { type: "not_cancelled", status: result.status };
  }

  if (
    isCancellationFeedbackEventSeen(
      {
        userId: baseline.userId,
        environment: baseline.environment,
        productIdentifier: baseline.productIdentifier,
        accessThrough: baseline.accessThrough,
      },
      { local: args.local },
    )
  ) {
    logCancellationFeedback("no_cancellation");
    return { type: "not_cancelled", status: result.status };
  }

  writeOpportunity(
    {
      userId: baseline.userId,
      environment: baseline.environment,
      productIdentifier: baseline.productIdentifier,
      accessThrough: baseline.accessThrough,
      confirmedAt: new Date(args.now ?? Date.now()).toISOString(),
    },
    resolveSession(args.session),
  );
  logCancellationFeedback("cancellation_confirmed");
  return { type: "opportunity", status: result.status };
}

const commerceSources = new Set<string>();
const commerceListeners = new Set<() => void>();

function emitCommerce(): void {
  for (const listener of commerceListeners) listener();
}

export function setCancellationFeedbackCommerceBusy(source: string, busy: boolean): void {
  const before = commerceSources.size;
  if (busy) commerceSources.add(source);
  else commerceSources.delete(source);
  if (commerceSources.size !== before) emitCommerce();
}

export function isCancellationFeedbackCommerceBusy(): boolean {
  return commerceSources.size > 0;
}

export function subscribeCancellationFeedbackCommerceBusy(
  listener: () => void,
): () => void {
  commerceListeners.add(listener);
  return () => {
    commerceListeners.delete(listener);
  };
}

export function resetCancellationFeedbackCommerceBusyForTests(): void {
  commerceSources.clear();
  emitCommerce();
}

/**
 * Local QA builds only (`VITE_APP_BUILD_CHANNEL=local` via getAppBuildChannelFromEnv).
 * A Capacitor bundle is not Vite DEV, so channel — not import.meta.env.DEV — decides this.
 * Opening the sheet does not call Apple or refresh RevenueCat.
 */
export const CANCELLATION_FEEDBACK_DEBUG_WINDOW_KEY =
  "__dubhubCancellationFeedbackDebug" as const;

export type CancellationFeedbackDebugHelper = {
  show: () => void;
};

type CancellationFeedbackDebugTarget = {
  __dubhubCancellationFeedbackDebug?: CancellationFeedbackDebugHelper;
};

let debugOpener: (() => void) | null = null;

export function registerCancellationFeedbackDebugOpener(opener: () => void): () => void {
  debugOpener = opener;
  return () => {
    if (debugOpener === opener) debugOpener = null;
  };
}

export function resetCancellationFeedbackDebugForTests(): void {
  debugOpener = null;
}

/** Minimum local opportunity so the existing sheet can open. Not a subscription write. */
export function writeCancellationFeedbackDebugOpportunity(
  userId: string,
  options?: { now?: number; session?: CancellationFeedbackStore | null },
): void {
  if (!userId) return;
  writeOpportunity(
    {
      userId,
      environment: "sandbox",
      productIdentifier: "dev_qa",
      accessThrough: "dev-qa",
      confirmedAt: new Date(options?.now ?? Date.now()).toISOString(),
    },
    resolveSession(options?.session),
  );
}

/** True only for the local build channel. TestFlight and production stay closed. */
export function isCancellationFeedbackLocalQaBuild(
  buildChannel: string | null | undefined = getAppBuildChannelFromEnv(),
): boolean {
  return parseAppBuildChannel(buildChannel) === "local";
}

export function syncCancellationFeedbackDebugHelper(
  buildChannel: string | null | undefined,
  target?: CancellationFeedbackDebugTarget | null,
): void {
  const host =
    target === undefined
      ? typeof window === "undefined"
        ? null
        : (window as CancellationFeedbackDebugTarget)
      : target;
  if (!host) return;
  if (!isCancellationFeedbackLocalQaBuild(buildChannel)) {
    delete host.__dubhubCancellationFeedbackDebug;
    return;
  }
  host.__dubhubCancellationFeedbackDebug = {
    show() {
      debugOpener?.();
    },
  };
}
