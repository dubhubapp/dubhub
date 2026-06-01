import { Capacitor } from "@capacitor/core";
import { getPushReceivePermission } from "@/lib/push-notifications";

const POST_ONBOARDING_HANDLED_PREFIX = "dubhub_push_prompt_post_onboarding_handled_";
const RELEASES_HANDLED_PREFIX = "dubhub_push_prompt_releases_handled_";

/** While a push prompt dialog is open, defer other prompts (e.g. Releases vs post-onboarding). */
export const PUSH_PROMPT_ACTIVE_SESSION_KEY = "dubhub_push_prompt_active";

export function setPushPromptSessionActive(active: boolean): void {
  try {
    if (active) {
      sessionStorage.setItem(PUSH_PROMPT_ACTIVE_SESSION_KEY, "1");
    } else {
      sessionStorage.removeItem(PUSH_PROMPT_ACTIVE_SESSION_KEY);
    }
  } catch {
    // sessionStorage may be unavailable.
  }
}

export function isPushPromptSessionActive(): boolean {
  try {
    return sessionStorage.getItem(PUSH_PROMPT_ACTIVE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export type PushPromptVariant = "post_onboarding" | "releases";

export function getPostOnboardingPushPromptHandledKey(userId: string): string {
  return `${POST_ONBOARDING_HANDLED_PREFIX}${userId}`;
}

export function getReleasesPushPromptHandledKey(userId: string): string {
  return `${RELEASES_HANDLED_PREFIX}${userId}`;
}

export function isPostOnboardingPushPromptHandled(userId: string | null | undefined): boolean {
  if (!userId) return true;
  try {
    return localStorage.getItem(getPostOnboardingPushPromptHandledKey(userId)) === "1";
  } catch {
    return true;
  }
}

export function isReleasesPushPromptHandled(userId: string | null | undefined): boolean {
  if (!userId) return true;
  try {
    return localStorage.getItem(getReleasesPushPromptHandledKey(userId)) === "1";
  } catch {
    return true;
  }
}

export function markPostOnboardingPushPromptHandled(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    localStorage.setItem(getPostOnboardingPushPromptHandledKey(userId), "1");
  } catch {
    // Storage may be unavailable in constrained environments.
  }
}

export function markReleasesPushPromptHandled(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    localStorage.setItem(getReleasesPushPromptHandledKey(userId), "1");
  } catch {
    // Storage may be unavailable in constrained environments.
  }
}

export async function isPushGrantedOnDevice(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const receive = await getPushReceivePermission();
  return receive === "granted";
}

export async function shouldOfferPostOnboardingPushPrompt(userId: string | null | undefined): Promise<boolean> {
  if (!userId || !Capacitor.isNativePlatform()) return false;
  if (isPostOnboardingPushPromptHandled(userId)) return false;
  return !(await isPushGrantedOnDevice());
}

export async function shouldOfferReleasesPushPrompt(userId: string | null | undefined): Promise<boolean> {
  if (!userId || !Capacitor.isNativePlatform()) return false;
  if (isReleasesPushPromptHandled(userId)) return false;
  return !(await isPushGrantedOnDevice());
}
