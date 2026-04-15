export const DUBHUB_VIDEO_DEBUG_FLAG = "dubhub_video_debug";

export function dubhubVideoDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DUBHUB_VIDEO_DEBUG_FLAG) === "1";
  } catch {
    return false;
  }
}

export function dubhubVideoDebugLog(
  tag: string,
  message: string,
  payload?: Record<string, unknown>,
): void {
  if (!dubhubVideoDebugEnabled()) return;
  if (payload) {
    console.log(tag, message, payload);
    return;
  }
  console.log(tag, message);
}

export function getMediaReadyStateLabel(readyState: number): string {
  switch (readyState) {
    case 0:
      return "HAVE_NOTHING";
    case 1:
      return "HAVE_METADATA";
    case 2:
      return "HAVE_CURRENT_DATA";
    case 3:
      return "HAVE_FUTURE_DATA";
    case 4:
      return "HAVE_ENOUGH_DATA";
    default:
      return `UNKNOWN(${readyState})`;
  }
}

export function mediaResetTargetId(el: HTMLMediaElement | null): string {
  if (!el) return "unknown";
  return (
    el.getAttribute("data-debug-media-id") ||
    el.id ||
    el.currentSrc ||
    el.getAttribute("src") ||
    "unknown"
  );
}

export function mediaResetLogCall(
  location: string,
  reason: string,
  el: HTMLMediaElement | null,
  extra?: Record<string, unknown>,
): void {
  if (!dubhubVideoDebugEnabled()) return;
  const targetId = mediaResetTargetId(el);
  if (
    !targetId.startsWith("home-feed-") &&
    targetId !== "submit-preview" &&
    targetId !== "trim-preview"
  ) {
    return;
  }
  const route = typeof window !== "undefined" ? window.location.pathname : "unknown";
  const before = el
    ? {
        readyStateBefore: el.readyState,
        currentSrcBefore: el.currentSrc || null,
        srcAttrBefore: el.getAttribute("src"),
      }
    : {};
  console.log("[DubHub][MediaReset][call]", location, {
    reason,
    route,
    targetId,
    ...before,
    ...(extra || {}),
  });
}

export function mediaResetLogTarget(
  location: string,
  reason: string,
  el: HTMLMediaElement | null,
  extra?: Record<string, unknown>,
): void {
  if (!dubhubVideoDebugEnabled()) return;
  const targetId = mediaResetTargetId(el);
  if (
    !targetId.startsWith("home-feed-") &&
    targetId !== "submit-preview" &&
    targetId !== "trim-preview"
  ) {
    return;
  }
  const route = typeof window !== "undefined" ? window.location.pathname : "unknown";
  const after = el
    ? {
        readyStateAfter: el.readyState,
        currentSrcAfter: el.currentSrc || null,
        srcAttrAfter: el.getAttribute("src"),
      }
    : {};
  console.log("[DubHub][MediaReset][target]", location, {
    reason,
    route,
    targetId,
    ...after,
    ...(extra || {}),
  });
}
