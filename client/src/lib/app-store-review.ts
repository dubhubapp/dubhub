/**
 * App Store review governor.
 * Pending opportunities are session-only. The 120-day cooldown is per-user localStorage.
 * Apple still decides whether the system sheet appears.
 */

import { Capacitor } from "@capacitor/core";
import { ANONYMOUS_TRACK_IDENTIFIED_UPLOADER_MESSAGE } from "@shared/notification-messages";
import {
  getEffectiveNotificationType,
  type NotificationType,
} from "@shared/notification-types";

export const REVIEW_COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000;
export const REVIEW_PENDING_TTL_MS = 3 * 60 * 1000;
export const REVIEW_PENDING_SESSION_KEY = "dubhub:app-store-review-pending";

/** Live production moderator confirm copy from handle_notifications(). */
export const MODERATOR_FULL_CONFIRM_MESSAGE = "confirmed your track ID";
/** Live production moderator rejection copy from handle_notifications(). */
export const MODERATOR_REJECTION_MESSAGE = "rejected your track ID";
/** API community-approve copy. */
export const COMMUNITY_APPROVAL_CONFIRM_MESSAGE = "Your ID was confirmed by the community.";

export const POSITIVE_CONTRIBUTOR_MESSAGES = [
  COMMUNITY_APPROVAL_CONFIRM_MESSAGE,
  MODERATOR_FULL_CONFIRM_MESSAGE,
] as const;

export type ReviewTriggerType =
  | "own_post_identified"
  | "saved_track_release_added"
  | "id_contribution_confirmed"
  | "release_created";

export type ReviewPlatform = "ios" | "web" | "android" | "other";

export type PendingReviewOpportunity = {
  type: ReviewTriggerType;
  entityId: string;
  postId?: string;
  armedAt: number;
};

export type ReviewArmDraft = {
  type: ReviewTriggerType;
  entityId: string;
  postId?: string;
};

export type ReviewStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type ReviewDispatchResult =
  | "requested"
  | "blocked_surface"
  | "cooldown"
  | "storage"
  | "native_failed"
  | "not_ios"
  | "wait";

type HomeDispatchDecision =
  | { action: "wait" }
  | { action: "drop"; reason: string }
  | { action: "request"; pending: PendingReviewOpportunity };

type ReleaseDispatchDecision =
  | { action: "wait" }
  | { action: "drop"; reason: string }
  | { action: "request"; pending: PendingReviewOpportunity };

function reviewLog(message: string): void {
  try {
    if (import.meta.env?.DEV !== true) return;
  } catch {
    return;
  }
  console.log(message);
}

function normalizeMessage(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isRejectionContributorMessage(message: string | null | undefined): boolean {
  return normalizeMessage(message).includes("rejected");
}

/** Exact allowlist. Does not treat a generic "confirmed" substring as success. */
export function isPositiveContributorFeedbackMessage(
  message: string | null | undefined,
): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || isRejectionContributorMessage(message)) return false;
  return POSITIVE_CONTRIBUTOR_MESSAGES.some(
    (allowed) => normalizeMessage(allowed) === normalized,
  );
}

export function isUploaderAnonymousIdentifiedMessage(
  message: string | null | undefined,
): boolean {
  const raw = String(message ?? "").trim();
  if (!raw) return false;
  const base = ANONYMOUS_TRACK_IDENTIFIED_UPLOADER_MESSAGE;
  return raw === base || raw.startsWith(`${base}\n`);
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function releaseIdFromDetailExit(path: string | null | undefined): string | null {
  const raw = String(path ?? "").trim();
  const match = raw.match(/^\/releases\/([^/?#]+)\/?$/);
  if (!match) return null;
  let id = match[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    return null;
  }
  if (!id || id === "new" || id === "edit") return null;
  return id;
}

export function reviewOpportunityFromNotification(fields: {
  notificationType?: string | null;
  message?: string | null;
  postId?: string | null;
  releaseId?: string | null;
}): ReviewArmDraft | null {
  const type = getEffectiveNotificationType({
    notificationType: fields.notificationType,
    message: fields.message,
    postId: fields.postId,
    releaseId: fields.releaseId,
  });
  return reviewOpportunityFromEffectiveType({
    type,
    message: fields.message,
    postId: fields.postId,
    releaseId: fields.releaseId,
  });
}

function reviewOpportunityFromEffectiveType(fields: {
  type: NotificationType;
  message?: string | null;
  postId?: string | null;
  releaseId?: string | null;
}): ReviewArmDraft | null {
  const postId = cleanId(fields.postId);
  const releaseId = cleanId(fields.releaseId);

  if (fields.type === "artist_identified_post" && postId) {
    return { type: "own_post_identified", entityId: postId };
  }

  if (fields.type === "anonymous_track_identified" && postId) {
    if (!isUploaderAnonymousIdentifiedMessage(fields.message)) return null;
    return { type: "own_post_identified", entityId: postId };
  }

  if (fields.type === "release_attached" && postId && releaseId) {
    return {
      type: "saved_track_release_added",
      entityId: releaseId,
      postId,
    };
  }

  if (fields.type === "id_verification_feedback" && postId) {
    if (!isPositiveContributorFeedbackMessage(fields.message)) return null;
    return { type: "id_contribution_confirmed", entityId: postId };
  }

  return null;
}

export function reviewOpportunityFromPush(payload: {
  type?: unknown;
  postId?: unknown;
  releaseId?: unknown;
  release_id?: unknown;
  post_id?: unknown;
  message?: unknown;
}): ReviewArmDraft | null {
  const pushType = typeof payload.type === "string" ? payload.type : "";
  const postId = cleanId(payload.postId ?? payload.post_id);
  const releaseId = cleanId(payload.releaseId ?? payload.release_id);
  const message = typeof payload.message === "string" ? payload.message : null;

  if (pushType === "artist_identified_post") {
    return reviewOpportunityFromEffectiveType({
      type: "artist_identified_post",
      postId,
      releaseId,
      message,
    });
  }
  if (pushType === "anonymous_track_identified") {
    return reviewOpportunityFromEffectiveType({
      type: "anonymous_track_identified",
      postId,
      releaseId,
      message,
    });
  }
  if (pushType === "release_attached_to_liked_or_uploaded_post") {
    return reviewOpportunityFromEffectiveType({
      type: "release_attached",
      postId,
      releaseId,
      message,
    });
  }
  return null;
}

function governorKey(userId: string, field: string): string {
  return `dubhub:app-store-review:${userId}:${field}`;
}

function readStorageItem(storage: ReviewStorage, key: string): string | null | undefined {
  try {
    return storage.getItem(key);
  } catch {
    return undefined;
  }
}

export function canRequestAppStoreReview(args: {
  userId: string | null | undefined;
  now: number;
  storage: ReviewStorage | null;
}): { ok: true } | { ok: false; reason: "storage" | "missing_user" | "cooldown" } {
  if (!args.userId) return { ok: false, reason: "missing_user" };
  if (!args.storage) return { ok: false, reason: "storage" };
  const raw = readStorageItem(args.storage, governorKey(args.userId, "lastReviewRequestAt"));
  if (raw === undefined) return { ok: false, reason: "storage" };
  if (!raw) return { ok: true };
  const last = Number(raw);
  if (!Number.isFinite(last)) return { ok: true };
  if (args.now - last < REVIEW_COOLDOWN_MS) return { ok: false, reason: "cooldown" };
  return { ok: true };
}

export function recordAppStoreReviewRequest(args: {
  userId: string;
  now: number;
  triggerType: ReviewTriggerType;
  appVersion: string;
  storage: ReviewStorage | null;
}): boolean {
  if (!args.storage) return false;
  try {
    args.storage.setItem(governorKey(args.userId, "lastReviewRequestAt"), String(args.now));
    args.storage.setItem(
      governorKey(args.userId, "lastReviewRequestVersion"),
      args.appVersion || "unknown",
    );
    args.storage.setItem(governorKey(args.userId, "lastTriggerType"), args.triggerType);
    return true;
  } catch {
    return false;
  }
}

function defaultSessionStorage(): ReviewStorage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

function defaultLocalStorage(): ReviewStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function parsePending(raw: string | null): PendingReviewOpportunity | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingReviewOpportunity>;
    if (
      parsed.type !== "own_post_identified" &&
      parsed.type !== "saved_track_release_added" &&
      parsed.type !== "id_contribution_confirmed" &&
      parsed.type !== "release_created"
    ) {
      return null;
    }
    if (typeof parsed.entityId !== "string" || !parsed.entityId.trim()) return null;
    if (typeof parsed.armedAt !== "number" || !Number.isFinite(parsed.armedAt)) return null;
    const pending: PendingReviewOpportunity = {
      type: parsed.type,
      entityId: parsed.entityId.trim(),
      armedAt: parsed.armedAt,
    };
    if (typeof parsed.postId === "string" && parsed.postId.trim()) {
      pending.postId = parsed.postId.trim();
    }
    return pending;
  } catch {
    return null;
  }
}

export function readPendingReviewOpportunity(args?: {
  now?: number;
  storage?: ReviewStorage | null;
}): PendingReviewOpportunity | null {
  const storage = args?.storage === undefined ? defaultSessionStorage() : args.storage;
  const now = args?.now ?? Date.now();
  if (!storage) return null;
  const raw = readStorageItem(storage, REVIEW_PENDING_SESSION_KEY);
  if (raw === undefined) return null;
  const pending = parsePending(raw);
  if (!pending) {
    if (raw) {
      try {
        storage.removeItem(REVIEW_PENDING_SESSION_KEY);
      } catch {
        // ignore
      }
    }
    return null;
  }
  if (now - pending.armedAt >= REVIEW_PENDING_TTL_MS) {
    dropPendingReviewOpportunity("expiry", storage);
    return null;
  }
  return pending;
}

export function armReviewOpportunity(
  draft: ReviewArmDraft,
  args?: { now?: number; storage?: ReviewStorage | null },
): PendingReviewOpportunity | null {
  const storage = args?.storage === undefined ? defaultSessionStorage() : args.storage;
  const now = args?.now ?? Date.now();
  if (!storage || !draft.entityId.trim()) {
    reviewLog("[DubHub Review] dropped storage");
    return null;
  }
  const pending: PendingReviewOpportunity = {
    type: draft.type,
    entityId: draft.entityId.trim(),
    armedAt: now,
    ...(draft.postId?.trim() ? { postId: draft.postId.trim() } : {}),
  };
  try {
    storage.setItem(REVIEW_PENDING_SESSION_KEY, JSON.stringify(pending));
  } catch {
    reviewLog("[DubHub Review] dropped storage");
    return null;
  }
  reviewLog("[DubHub Review] armed");
  return pending;
}

export function armReleaseCreatedFromExitPath(
  exitPath: string,
  args?: { now?: number; storage?: ReviewStorage | null },
): PendingReviewOpportunity | null {
  const releaseId = releaseIdFromDetailExit(exitPath);
  if (!releaseId) return null;
  return armReviewOpportunity(
    { type: "release_created", entityId: releaseId },
    args,
  );
}

export function dropPendingReviewOpportunity(
  reason: string,
  storage?: ReviewStorage | null,
): void {
  const session = storage === undefined ? defaultSessionStorage() : storage;
  if (!session) return;
  try {
    session.removeItem(REVIEW_PENDING_SESSION_KEY);
  } catch {
    return;
  }
  reviewLog(`[DubHub Review] dropped ${reason}`);
}

export function clearPendingAppStoreReviewOpportunity(
  storage?: ReviewStorage | null,
): void {
  const session = storage === undefined ? defaultSessionStorage() : storage;
  if (!session) return;
  try {
    session.removeItem(REVIEW_PENDING_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function isReviewSurfaceBlocked(args?: {
  onboardingActive?: boolean;
  pushPromptActive?: boolean;
  document?: Document | null;
}): boolean {
  if (args?.onboardingActive) return true;
  if (args?.pushPromptActive) return true;
  const doc = args?.document === undefined ? (typeof document !== "undefined" ? document : null) : args.document;
  if (!doc) return false;
  if (doc.documentElement?.classList?.contains("comments-modal-open")) return true;
  if (doc.body?.classList?.contains("comments-modal-open")) return true;
  if (doc.querySelector?.('[data-testid="verified-artist-tools-paywall"]')) return true;
  if (doc.querySelector?.('[role="dialog"][data-state="open"]')) return true;
  if (doc.querySelector?.('[role="alertdialog"][data-state="open"]')) return true;
  return false;
}

export function evaluateHomeReviewDispatch(args: {
  pending: PendingReviewOpportunity | null;
  activePostId: string | null;
  postPresent: boolean;
  deepLinkPostId: string | null;
}): HomeDispatchDecision {
  const pending = args.pending;
  if (!pending) return { action: "wait" };
  if (pending.type !== "own_post_identified" && pending.type !== "id_contribution_confirmed") {
    return { action: "wait" };
  }
  if (args.deepLinkPostId && args.deepLinkPostId !== pending.entityId) {
    return { action: "drop", reason: "destination_mismatch" };
  }
  if (!args.postPresent || args.activePostId !== pending.entityId) {
    return { action: "wait" };
  }
  return { action: "request", pending };
}

export function evaluateReleaseReviewDispatch(args: {
  pending: PendingReviewOpportunity | null;
  releaseId: string | null;
}): ReleaseDispatchDecision {
  const pending = args.pending;
  if (!pending) return { action: "wait" };
  if (pending.type !== "saved_track_release_added" && pending.type !== "release_created") {
    return { action: "wait" };
  }
  if (!args.releaseId || args.releaseId !== pending.entityId) {
    return { action: "drop", reason: "destination_mismatch" };
  }
  return { action: "request", pending };
}

let reviewCommitInFlight = false;

export async function commitAppStoreReviewRequest(args: {
  userId: string | null | undefined;
  pending: PendingReviewOpportunity;
  now: number;
  localStorage: ReviewStorage | null;
  sessionStorage: ReviewStorage | null;
  surfaceBlocked: boolean;
  platform: ReviewPlatform;
  appVersion: string;
  requestNative: () => Promise<boolean>;
}): Promise<ReviewDispatchResult> {
  if (args.surfaceBlocked) return "blocked_surface";
  if (reviewCommitInFlight) return "wait";
  reviewCommitInFlight = true;
  try {
  return await commitAppStoreReviewRequestLocked(args);
  } finally {
    reviewCommitInFlight = false;
  }
}

async function commitAppStoreReviewRequestLocked(args: {
  userId: string | null | undefined;
  pending: PendingReviewOpportunity;
  now: number;
  localStorage: ReviewStorage | null;
  sessionStorage: ReviewStorage | null;
  surfaceBlocked: boolean;
  platform: ReviewPlatform;
  appVersion: string;
  requestNative: () => Promise<boolean>;
}): Promise<ReviewDispatchResult> {
  if (args.surfaceBlocked) return "blocked_surface";
  if (args.platform !== "ios") {
    dropPendingReviewOpportunity("platform", args.sessionStorage);
    return "not_ios";
  }
  const gate = canRequestAppStoreReview({
    userId: args.userId,
    now: args.now,
    storage: args.localStorage,
  });
  if (!gate.ok) {
    if (gate.reason === "cooldown") {
      reviewLog("[DubHub Review] cooldown blocked");
      dropPendingReviewOpportunity("cooldown", args.sessionStorage);
      return "cooldown";
    }
    reviewLog("[DubHub Review] dropped storage");
    dropPendingReviewOpportunity("storage", args.sessionStorage);
    return "storage";
  }
  let invoked = false;
  try {
    invoked = await args.requestNative();
  } catch {
    invoked = false;
  }
  if (!invoked) {
    dropPendingReviewOpportunity("native_failed", args.sessionStorage);
    return "native_failed";
  }
  reviewLog("[DubHub Review] native request invoked");
  const recorded = recordAppStoreReviewRequest({
    userId: args.userId as string,
    now: args.now,
    triggerType: args.pending.type,
    appVersion: args.appVersion,
    storage: args.localStorage,
  });
  dropPendingReviewOpportunity(recorded ? "consumed" : "storage", args.sessionStorage);
  return recorded ? "requested" : "storage";
}

export function currentReviewPlatform(): ReviewPlatform {
  try {
    if (!Capacitor.isNativePlatform()) return "web";
    const platform = Capacitor.getPlatform();
    if (platform === "ios") return "ios";
    if (platform === "android") return "android";
    return "other";
  } catch {
    return "web";
  }
}

export async function requestNativeAppStoreReview(): Promise<boolean> {
  const native = await import("./app-store-review-native");
  return native.requestNativeAppStoreReview();
}

export async function readNativeAppVersion(): Promise<string> {
  try {
    const app = await import("@capacitor/app");
    const info = await app.App.getInfo();
    return info.version?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export function browserReviewSurfaceBlocked(): boolean {
  let onboardingActive = false;
  let pushPromptActive = false;
  try {
    onboardingActive = sessionStorage.getItem("dubhub_onboarding_active") === "1";
    pushPromptActive = sessionStorage.getItem("dubhub_push_prompt_active") === "1";
  } catch {
    return true;
  }
  return isReviewSurfaceBlocked({
    onboardingActive,
    pushPromptActive,
  });
}

export async function dispatchHomeAppStoreReview(args: {
  userId: string | null | undefined;
  activePostId: string | null;
  postPresent: boolean;
  deepLinkPostId: string | null;
}): Promise<ReviewDispatchResult> {
  const session = defaultSessionStorage();
  const pending = readPendingReviewOpportunity({ storage: session });
  const decision = evaluateHomeReviewDispatch({
    pending,
    activePostId: args.activePostId,
    postPresent: args.postPresent,
    deepLinkPostId: args.deepLinkPostId,
  });
  if (decision.action === "wait") return "wait";
  if (decision.action === "drop") {
    dropPendingReviewOpportunity(decision.reason, session);
    return "wait";
  }
  if (browserReviewSurfaceBlocked()) return "blocked_surface";
  const platform = currentReviewPlatform();
  const appVersion = platform === "ios" ? await readNativeAppVersion() : "web";
  return commitAppStoreReviewRequest({
    userId: args.userId,
    pending: decision.pending,
    now: Date.now(),
    localStorage: defaultLocalStorage(),
    sessionStorage: session,
    surfaceBlocked: false,
    platform,
    appVersion,
    requestNative: requestNativeAppStoreReview,
  });
}

export async function userCurrentlyLikesPost(postId: string): Promise<boolean> {
  try {
    const { apiRequest } = await import("./queryClient");
    const res = await apiRequest("GET", `/api/posts/${encodeURIComponent(postId)}`);
    if (!res.ok) return false;
    const body = (await res.json()) as { hasLiked?: boolean; has_liked?: boolean };
    return body.hasLiked === true || body.has_liked === true;
  } catch {
    return false;
  }
}

export async function dispatchReleaseAppStoreReview(args: {
  userId: string | null | undefined;
  releaseId: string | null;
  likesPost?: (postId: string) => Promise<boolean>;
  isCancelled?: () => boolean;
  now?: number;
  sessionStorage?: ReviewStorage | null;
  localStorage?: ReviewStorage | null;
  platform?: ReviewPlatform;
  requestNative?: () => Promise<boolean>;
  surfaceBlocked?: boolean;
  appVersion?: string;
}): Promise<ReviewDispatchResult> {
  const session = args.sessionStorage === undefined ? defaultSessionStorage() : args.sessionStorage;
  const pending = readPendingReviewOpportunity({ now: args.now, storage: session });
  const decision = evaluateReleaseReviewDispatch({
    pending,
    releaseId: args.releaseId,
  });
  if (decision.action === "wait") return "wait";
  if (decision.action === "drop") {
    dropPendingReviewOpportunity(decision.reason, session);
    return "wait";
  }
  const surfaceBlocked = args.surfaceBlocked ?? browserReviewSurfaceBlocked();
  if (surfaceBlocked) return "blocked_surface";
  if (decision.pending.type === "saved_track_release_added") {
    const postId = decision.pending.postId;
    if (!postId) {
      dropPendingReviewOpportunity("missing_post", session);
      return "wait";
    }
    const likes = args.likesPost ?? userCurrentlyLikesPost;
    const liked = await likes(postId);
    if (args.isCancelled?.()) return "wait";
    if (!liked) {
      dropPendingReviewOpportunity("like_check_failed", session);
      return "wait";
    }
  }
  if (args.isCancelled?.()) return "wait";
  const platform = args.platform ?? currentReviewPlatform();
  const appVersion =
    args.appVersion ?? (platform === "ios" ? await readNativeAppVersion() : "web");
  return commitAppStoreReviewRequest({
    userId: args.userId,
    pending: decision.pending,
    now: args.now ?? Date.now(),
    localStorage: args.localStorage === undefined ? defaultLocalStorage() : args.localStorage,
    sessionStorage: session,
    surfaceBlocked: false,
    platform,
    appVersion,
    requestNative: args.requestNative ?? requestNativeAppStoreReview,
  });
}
