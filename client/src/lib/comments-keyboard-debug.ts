/**
 * Opt-in diagnostics for comments + keyboard on iOS/WebKit.
 * Enable: append ?debug=comments-keyboard to the URL (or localStorage dubhub-debug-comments-keyboard=1).
 * Remove this module’s call sites when you no longer need traces.
 */

export function commentsKeyboardDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem("dubhub-debug-comments-keyboard") === "1") return true;
    return new URLSearchParams(window.location.search).get("debug") === "comments-keyboard";
  } catch {
    return false;
  }
}

type Rect = { top: number; bottom: number; left: number; height: number; width: number };

function snapRect(el: Element | null | undefined): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: Math.round(r.top * 100) / 100,
    bottom: Math.round(r.bottom * 100) / 100,
    left: Math.round(r.left * 100) / 100,
    height: Math.round(r.height * 100) / 100,
    width: Math.round(r.width * 100) / 100,
  };
}

function getVisiblePostEl(): HTMLElement | null {
  const feed = document.querySelector("[data-home-video-feed]");
  if (!feed) return null;
  const posts = feed.querySelectorAll<HTMLElement>("[data-post-id]");
  if (!posts.length) return null;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  let best: HTMLElement | null = null;
  let bestVisible = 0;
  posts.forEach((el) => {
    const r = el.getBoundingClientRect();
    const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    if (vis > bestVisible) {
      bestVisible = vis;
      best = el;
    }
  });
  return best;
}

function getPostElForSnapshot(extra?: Record<string, unknown>): HTMLElement | null {
  const id = extra?.postId;
  if (typeof id === "string" && id && typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    const byId = document.querySelector<HTMLElement>(`[data-post-id="${CSS.escape(id)}"]`);
    if (byId) return byId;
  }
  return getVisiblePostEl();
}

export function logCommentsKeyboardSnapshot(phase: string, extra?: Record<string, unknown>): void {
  if (!commentsKeyboardDebugEnabled()) return;

  const vv = window.visualViewport;
  const appRoot = document.querySelector<HTMLElement>("[data-app-root]");
  const appShell = document.querySelector<HTMLElement>("[data-app-shell]");
  const feed = document.querySelector<HTMLElement>("[data-home-video-feed]");
  const post = getPostElForSnapshot(extra);
  const rail = post?.querySelector<HTMLElement>("[data-video-action-rail]");
  const drawer = document.querySelector<HTMLElement>("[data-vaul-drawer]");
  const composer = document.querySelector<HTMLElement>('[data-testid="comment-input"]');

  const csHtml = getComputedStyle(document.documentElement);
  const csBody = getComputedStyle(document.body);

  const metrics = {
    innerHeight: window.innerHeight,
    visualViewportHeight: vv?.height,
    visualViewportOffsetTop: vv?.offsetTop,
    visualViewportScale: vv?.scale,
    scrollY: window.scrollY,
    docElScrollTop: document.documentElement.scrollTop,
    bodyScrollTop: document.body.scrollTop,
    appLockPx: csHtml.getPropertyValue("--comments-app-lock-px").trim() || null,
  };

  const bodyInline = {
    position: document.body.style.position || "(unset)",
    top: document.body.style.top || "(unset)",
    left: document.body.style.left || "(unset)",
    height: document.body.style.height || "(unset)",
    width: document.body.style.width || "(unset)",
  };

  const padding = {
    htmlPaddingRight: csHtml.paddingRight,
    bodyPaddingRight: csBody.paddingRight,
    htmlOverflow: csHtml.overflow,
    bodyOverflow: csBody.overflow,
  };

  const railComputed = rail
    ? {
        bottom: getComputedStyle(rail).bottom,
        right: getComputedStyle(rail).right,
        position: getComputedStyle(rail).position,
      }
    : null;

  const payload = {
    phase,
    t: performance.now(),
    extra: extra ?? null,
    metrics,
    bodyInline,
    padding,
    railComputed,
    rects: {
      appRoot: snapRect(appRoot),
      appShell: snapRect(appShell),
      feed: snapRect(feed),
      post: snapRect(post),
      rail: snapRect(rail),
      drawer: snapRect(drawer),
      composer: snapRect(composer),
    },
  };

  const w = window as unknown as { __dubhubKeyboardSnapPrev?: typeof payload };
  const prev = w.__dubhubKeyboardSnapPrev;
  w.__dubhubKeyboardSnapPrev = payload;

  console.log("[CommentsKeyboardDebug] SNAP", JSON.stringify(payload, null, 0));

  if (prev) {
    const delta: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(metrics) as (keyof typeof metrics)[]) {
      if (prev.metrics[key] !== metrics[key]) {
        delta[`metrics.${String(key)}`] = { from: prev.metrics[key], to: metrics[key] };
      }
    }
    for (const key of Object.keys(payload.rects) as (keyof typeof payload.rects)[]) {
      const a = prev.rects[key];
      const b = payload.rects[key];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        delta[`rect.${key}`] = { from: a, to: b };
      }
    }
    if (JSON.stringify(prev.bodyInline) !== JSON.stringify(bodyInline)) {
            delta.bodyInline = { from: prev.bodyInline, to: bodyInline };
    }
    if (JSON.stringify(prev.padding) !== JSON.stringify(padding)) {
            delta.padding = { from: prev.padding, to: padding };
    }
    if (JSON.stringify(prev.railComputed) !== JSON.stringify(railComputed)) {
            delta.railComputed = { from: prev.railComputed, to: railComputed };
    }
    if (Object.keys(delta).length) {
      console.warn("[CommentsKeyboardDebug] DELTA", phase, delta);
    }
  }
}
