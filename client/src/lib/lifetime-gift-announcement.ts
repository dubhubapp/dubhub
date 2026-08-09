/**
 * One-time lifetime gift announcement — client persistence only.
 *
 * Suppression rule: only a recorded acknowledgement (message actually presented
 * and dismissed) prevents the message. A first-ever observation that is already
 * lifetime still shows, because a gift can become authoritative before this
 * device has ever seen the account as free.
 *
 * Accepted launch limitation: acknowledgement is per device/browser localStorage,
 * so reinstall or a second device may show the message once more. Account-wide
 * once-only would require a server marker (SQL), which is not used here.
 */

import type { SubscriptionEnvironmentSelection } from "./subscription-environment";
import { isLifetimeSettingsAccess } from "./settings-subscription-row";

export const LIFETIME_GIFT_COPY = {
  title: "Lifetime Verified Artist Tools unlocked",
  body: "You’ve been given lifetime access to Verified Artist Tools.",
  secondary: "Your artist tools are permanently unlocked and won’t renew.",
  done: "Done",
} as const;

const OBSERVED_KEY_PREFIX = "dubhub:vat-lifetime-gift-observed:";
/**
 * v2 namespace: v1 wrote acknowledgements for silent baselines that were never
 * shown to the artist. Those must not suppress a genuine gift message.
 */
const ACK_KEY_PREFIX = "dubhub:vat-lifetime-gift-ack-v2:";

/** Recorded when the selected environment is authoritative and not lifetime. */
export const LIFETIME_GIFT_OBSERVED_NONE = "none" as const;

export type LifetimeGiftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function defaultStorage(): LifetimeGiftStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(
  storage: LifetimeGiftStorage | null | undefined,
): LifetimeGiftStorage | null {
  return storage === undefined ? defaultStorage() : storage;
}

export function lifetimeGiftObservedKey(userId: string): string {
  return `${OBSERVED_KEY_PREFIX}${userId}`;
}

export function lifetimeGiftAckKey(userId: string, fingerprint: string): string {
  return `${ACK_KEY_PREFIX}${userId}:${fingerprint}`;
}

/** Stable fingerprint for a lifetime grant — product id only, no raw billing payloads. */
export function lifetimeGrantFingerprint(
  productIdentifier: string | null | undefined,
): string {
  const id = (productIdentifier ?? "").trim().toLowerCase();
  return id || "lifetime";
}

export function isLifetimeGiftAcknowledged(args: {
  userId: string;
  fingerprint: string;
  storage?: LifetimeGiftStorage | null;
}): boolean {
  const storage = resolveStorage(args.storage);
  if (!storage || !args.userId) return false;
  try {
    return storage.getItem(lifetimeGiftAckKey(args.userId, args.fingerprint)) === "1";
  } catch {
    return false;
  }
}

/** Call only after the message has been presented and dismissed. */
export function markLifetimeGiftAcknowledged(args: {
  userId: string;
  fingerprint: string;
  storage?: LifetimeGiftStorage | null;
}): void {
  const storage = resolveStorage(args.storage);
  if (!storage || !args.userId || !args.fingerprint) return;
  try {
    storage.setItem(lifetimeGiftAckKey(args.userId, args.fingerprint), "1");
    storage.setItem(lifetimeGiftObservedKey(args.userId), args.fingerprint);
  } catch {
    // Storage may be unavailable; in-session guards prevent replay.
  }
}

function readObserved(
  userId: string,
  storage: LifetimeGiftStorage | null,
): string | null {
  if (!storage || !userId) return null;
  try {
    return storage.getItem(lifetimeGiftObservedKey(userId));
  } catch {
    return null;
  }
}

/** Diagnostic breadcrumb only — never suppresses the message. */
function writeObserved(
  userId: string,
  value: string,
  storage: LifetimeGiftStorage | null,
): void {
  if (!storage || !userId) return;
  try {
    storage.setItem(lifetimeGiftObservedKey(userId), value);
  } catch {
    // ignore
  }
}

export type LifetimeGiftAnnouncementReason =
  | "missing_user"
  | "selection_not_ok"
  | "not_fresh"
  | "not_lifetime"
  | "already_acknowledged"
  | "first_observation_lifetime"
  | "new_lifetime_grant"
  | "unacknowledged_same_grant"
  | "new_lifetime_fingerprint";

export type LifetimeGiftAnnouncementDecision = {
  shouldShow: boolean;
  fingerprint: string | null;
  reason: LifetimeGiftAnnouncementReason;
};

/**
 * Decide whether to show the one-time lifetime gift success message.
 * Call only after auth + authoritative subscription status are ready.
 */
export function resolveLifetimeGiftAnnouncement(args: {
  userId: string | null | undefined;
  selection: SubscriptionEnvironmentSelection;
  storage?: LifetimeGiftStorage | null;
}): LifetimeGiftAnnouncementDecision {
  const storage = resolveStorage(args.storage);
  const userId = args.userId?.trim() ?? "";
  if (!userId) {
    return { shouldShow: false, fingerprint: null, reason: "missing_user" };
  }

  const { selection } = args;
  if (!selection.ok) {
    return { shouldShow: false, fingerprint: null, reason: "selection_not_ok" };
  }
  if (selection.freshness !== "fresh") {
    return { shouldShow: false, fingerprint: null, reason: "not_fresh" };
  }

  const status = selection.selectedStatus;
  const state = selection.state ?? status?.state ?? "";
  const lifetime = isLifetimeSettingsAccess({
    paid: selection.hasPaidToolAccess === true,
    freshness: selection.freshness,
    state,
    productIdentifier: status?.productIdentifier,
    expiresAt: status?.expiresAt,
    accessThrough: status?.accessThrough,
    willRenew: status?.willRenew,
  });

  if (!lifetime) {
    writeObserved(userId, LIFETIME_GIFT_OBSERVED_NONE, storage);
    return { shouldShow: false, fingerprint: null, reason: "not_lifetime" };
  }

  const fingerprint = lifetimeGrantFingerprint(status?.productIdentifier);

  // Acknowledgement is the only suppressor.
  if (isLifetimeGiftAcknowledged({ userId, fingerprint, storage })) {
    return { shouldShow: false, fingerprint, reason: "already_acknowledged" };
  }

  const observed = readObserved(userId, storage);
  const reason: LifetimeGiftAnnouncementReason =
    observed == null
      ? "first_observation_lifetime"
      : observed === LIFETIME_GIFT_OBSERVED_NONE
        ? "new_lifetime_grant"
        : observed === fingerprint
          ? "unacknowledged_same_grant"
          : "new_lifetime_fingerprint";

  writeObserved(userId, fingerprint, storage);
  return { shouldShow: true, fingerprint, reason };
}
