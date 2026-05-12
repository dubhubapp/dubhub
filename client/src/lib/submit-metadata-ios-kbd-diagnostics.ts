/** Enable for TestFlight/console: localStorage.setItem('dubhub:submit-metadata-kbd-metrics','1') */
export const SUBMIT_METADATA_KBD_METRICS_LS_KEY = "dubhub:submit-metadata-kbd-metrics";

export function isSubmitMetadataKbdMetricsDebugEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SUBMIT_METADATA_KBD_METRICS_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export type SubmitMetadataKbdProbe = Record<
  string,
  string | number | boolean | null | undefined | Record<string, number | undefined>
>;

function describeActiveElement(): string {
  const ae = document.activeElement;
  if (!ae || !(ae instanceof Element)) return "(none)";
  if (ae instanceof HTMLInputElement) {
    return `INPUT type=${ae.type} name=${ae.name ?? ""} id=${ae.id ?? ""}`;
  }
  if (ae instanceof HTMLTextAreaElement) {
    return `TEXTAREA name=${ae.name ?? ""} id=${ae.id ?? ""}`;
  }
  if (ae instanceof HTMLSelectElement) {
    return `SELECT name=${ae.name ?? ""}`;
  }
  return `${ae.nodeName}.${ae.className?.slice?.(0, 48) ?? ""}`;
}

function snapshotAncestorBox(label: string, el: Element | null): Record<string, string | number | boolean | null> {
  if (!el || !(el instanceof HTMLElement)) {
    return { label, present: false };
  }
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    label,
    present: true,
    tag: el.tagName,
    id: el.id || "",
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    offsetHeight: el.offsetHeight,
    scrollTop: el.scrollTop,
    rectTop: Math.round(r.top * 100) / 100,
    rectBottom: Math.round(r.bottom * 100) / 100,
    rectHeight: Math.round(r.height * 100) / 100,
    overflowY: cs.overflowY,
    height: cs.height,
    minHeight: cs.minHeight,
    maxHeight: cs.maxHeight,
    paddingBottom: cs.paddingBottom,
    transform: cs.transform === "none" ? "none" : cs.transform,
  };
}

/** Scroll slack below the visible viewport slice (pixels of scroll-range still available downward). */
export function probeSubmitMetadataScrollLayout(scrollRoot: HTMLElement | null): SubmitMetadataKbdProbe | null {
  if (!scrollRoot) return null;
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const sh = scrollRoot.scrollHeight;
  const ch = scrollRoot.clientHeight;
  const st = scrollRoot.scrollTop;
  const maxST = Math.max(0, sh - ch);
  const slackBelowViewport = Math.max(0, maxST - st);
  const rootRect = scrollRoot.getBoundingClientRect();
  const shell = typeof document !== "undefined" ? document.querySelector<HTMLElement>("[data-app-shell]") : null;
  const shellRect = shell?.getBoundingClientRect();

  let lastChildGapToRootBottom: number | null = null;
  const lastChild = scrollRoot.lastElementChild;
  if (lastChild instanceof HTMLElement) {
    const lastRect = lastChild.getBoundingClientRect();
    lastChildGapToRootBottom = rootRect.bottom - lastRect.bottom;
  }

  return {
    scrollTop: Math.round(st * 100) / 100,
    scrollHeight: Math.round(sh * 100) / 100,
    clientHeight: Math.round(ch * 100) / 100,
    maxScrollTop: Math.round(maxST * 100) / 100,
    slackBelowViewport: Math.round(slackBelowViewport * 100) / 100,
    scrollTopPastMaxBy: Math.round(Math.max(0, st - maxST) * 100) / 100,
    rootRectH: Math.round(rootRect.height * 100) / 100,
    rootRectBottom: Math.round(rootRect.bottom * 100) / 100,
    vvHeight: vv ? Math.round(vv.height * 100) / 100 : null,
    vvOffsetTop: vv ? Math.round(vv.offsetTop * 100) / 100 : null,
    vvScale: vv ? Math.round(vv.scale * 1000) / 1000 : null,
    innerHeight: typeof window !== "undefined" ? Math.round(window.innerHeight * 100) / 100 : null,
    windowScrollY: typeof window !== "undefined" ? Math.round(window.scrollY * 100) / 100 : null,
    shellRectH: shellRect ? Math.round(shellRect.height * 100) / 100 : null,
    shellRectBottom: shellRect ? Math.round(shellRect.bottom * 100) / 100 : null,
    lastChildGapToRootBottom:
      lastChildGapToRootBottom != null ? Math.round(lastChildGapToRootBottom * 100) / 100 : null,
    activeElement: describeActiveElement(),
  };
}

export function logSubmitMetadataKbd(phase: string, extras?: SubmitMetadataKbdProbe): void {
  if (!isSubmitMetadataKbdMetricsDebugEnabled()) return;
  console.log(`[submit-metadata][kbd-metrics] ${phase}`, { ...extras });
}

/** Full ancestor + visualViewport snapshot for narrowing iOS keyboard/gap regressions (gated). */
export function buildSubmitMetadataDeepSnapshot(
  scrollRoot: HTMLElement | null,
  extras?: SubmitMetadataKbdProbe,
): Record<string, unknown> {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const scrollingEl = typeof document !== "undefined" ? document.scrollingElement : null;

  const visualViewportPayload =
    vv == null
      ? null
      : {
          pageTop: Math.round(vv.pageTop * 100) / 100,
          pageLeft: Math.round(vv.pageLeft * 100) / 100,
          offsetTop: Math.round(vv.offsetTop * 100) / 100,
          offsetLeft: Math.round(vv.offsetLeft * 100) / 100,
          width: Math.round(vv.width * 100) / 100,
          height: Math.round(vv.height * 100) / 100,
          scale: Math.round(vv.scale * 1000) / 1000,
        };

  let contentBottomPack: Record<string, number | null> | null = null;
  if (scrollRoot instanceof HTMLElement) {
    const sr = scrollRoot.getBoundingClientRect();
    const form = scrollRoot.querySelector("form");
    let formRectBottom: number | null = null;
    let gapViewportFormBottomToRootBottom: number | null = null;
    let contentBottomYInScrollSpace: number | null = null;

    if (form instanceof HTMLElement) {
      const fr = form.getBoundingClientRect();
      formRectBottom = Math.round(fr.bottom * 100) / 100;
      gapViewportFormBottomToRootBottom = Math.round((sr.bottom - fr.bottom) * 100) / 100;
      contentBottomYInScrollSpace =
        Math.round((scrollRoot.scrollTop + (fr.bottom - sr.top)) * 100) / 100;
    }

    const sh = scrollRoot.scrollHeight;
    const gapScrollHeightMinusContentBottomY =
      contentBottomYInScrollSpace != null
        ? Math.round((sh - contentBottomYInScrollSpace) * 100) / 100
        : null;

    const lastEl = scrollRoot.lastElementChild;
    let lastChildRectBottom: number | null = null;
    let gapViewportLastChildBottomToRootBottom: number | null = null;
    if (lastEl instanceof HTMLElement) {
      const lr = lastEl.getBoundingClientRect();
      lastChildRectBottom = Math.round(lr.bottom * 100) / 100;
      gapViewportLastChildBottomToRootBottom = Math.round((sr.bottom - lr.bottom) * 100) / 100;
    }

    contentBottomPack = {
      scrollRootRectTop: Math.round(sr.top * 100) / 100,
      scrollRootRectBottom: Math.round(sr.bottom * 100) / 100,
      formRectBottom,
      gapViewportFormBottomToScrollRootBottom: gapViewportFormBottomToRootBottom,
      contentBottomYInScrollSpace_form: contentBottomYInScrollSpace,
      scrollHeightModel: Math.round(sh * 100) / 100,
      gapScrollHeightMinusContentBottomY_form: gapScrollHeightMinusContentBottomY,
      lastChildRectBottom,
      gapViewportLastChildBottomToScrollRootBottom: gapViewportLastChildBottomToRootBottom,
    };
  }

  const root = typeof document !== "undefined" ? document.getElementById("root") : null;
  const appRoot = typeof document !== "undefined" ? document.querySelector("[data-app-root]") : null;
  const appShell = typeof document !== "undefined" ? document.querySelector("[data-app-shell]") : null;

  const out: Record<string, unknown> = {
    visualViewport: visualViewportPayload,
    documentScrollingElement: scrollingEl
      ? {
          tag: scrollingEl.tagName,
          id: scrollingEl.id || "",
          scrollTop:
            scrollingEl instanceof HTMLElement ? Math.round(scrollingEl.scrollTop * 100) / 100 : null,
          isHTMLElement: scrollingEl instanceof HTMLElement,
        }
      : null,
    windowScroll: {
      scrollY:
        typeof window !== "undefined" && typeof window.scrollY === "number"
          ? Math.round(window.scrollY * 100) / 100
          : null,
      pageYOffset:
        typeof window !== "undefined" && typeof window.pageYOffset === "number"
          ? Math.round(window.pageYOffset * 100) / 100
          : null,
    },
    ancestors: {
      html: snapshotAncestorBox("html", typeof document !== "undefined" ? document.documentElement : null),
      body: snapshotAncestorBox("body", typeof document !== "undefined" ? document.body : null),
      root: snapshotAncestorBox("#root", root),
      appRoot: snapshotAncestorBox("[data-app-root]", appRoot),
      appShell: snapshotAncestorBox("[data-app-shell]", appShell),
      pageScrollRef: snapshotAncestorBox(
        "pageScrollRef(APP_PAGE_SCROLL_CLASS)",
        scrollRoot instanceof HTMLElement ? scrollRoot : null,
      ),
    },
    contentBottom: contentBottomPack,
    scrollProbeFlat: extras ?? probeSubmitMetadataScrollLayout(scrollRoot),
  };

  return out;
}

export function logSubmitMetadataKbdDeep(
  phase: string,
  scrollRoot: HTMLElement | null,
  extras?: SubmitMetadataKbdProbe,
): void {
  if (!isSubmitMetadataKbdMetricsDebugEnabled()) return;
  const payload = buildSubmitMetadataDeepSnapshot(scrollRoot, extras);
  console.log(`[submit-metadata][kbd-metrics-deep] ${phase}`, payload);
}

type DocumentWindowScrollLeakRead = {
  scrollY: number;
  pageYOffset: number;
  documentElementScrollTop: number;
  bodyScrollTop: number;
  scrollingElementScrollTop: number | null;
};

function readDocumentWindowScrollLeak(): DocumentWindowScrollLeakRead | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const se = document.scrollingElement;
  return {
    scrollY: window.scrollY,
    pageYOffset: window.pageYOffset,
    documentElementScrollTop: document.documentElement.scrollTop,
    bodyScrollTop: document.body ? document.body.scrollTop : 0,
    scrollingElementScrollTop:
      se instanceof HTMLElement ? Math.round(se.scrollTop * 100) / 100 : null,
  };
}

/** WKWebKit can leave `window`/document scroll residue after IME dismiss despite `overflow:hidden` on html/#root — Submit metadata only (call from submit-metadata.tsx iOS effects). */
export function flushSubmitMetadataIosDocumentWindowScroll(phase: string): void {
  const before = readDocumentWindowScrollLeak();
  if (!before) return;

  const needs =
    before.scrollY !== 0 ||
    before.pageYOffset !== 0 ||
    before.documentElementScrollTop !== 0 ||
    before.bodyScrollTop !== 0 ||
    (before.scrollingElementScrollTop ?? 0) !== 0;

  if (isSubmitMetadataKbdMetricsDebugEnabled()) {
    logSubmitMetadataKbd(`documentWindowScroll:${phase}:before`, before as SubmitMetadataKbdProbe);
  }

  if (!needs) return;

  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  if (document.body) {
    document.body.scrollTop = 0;
  }
  const se = document.scrollingElement;
  if (se instanceof HTMLElement) {
    se.scrollTop = 0;
  }

  const after = readDocumentWindowScrollLeak();
  if (isSubmitMetadataKbdMetricsDebugEnabled() && after) {
    logSubmitMetadataKbd(`documentWindowScroll:${phase}:after`, after as SubmitMetadataKbdProbe);
  }
}

/** Aligns with date picker exclusion — do not reposition native wheel/calendar inputs. */
const SUBMIT_METADATA_IOS_SCROLL_SKIP_INPUT_TYPES = new Set([
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
]);

function shouldSubmitMetadataAdjustScrollForActiveKeyboardField(active: HTMLElement): boolean {
  if (active instanceof HTMLInputElement) {
    if (SUBMIT_METADATA_IOS_SCROLL_SKIP_INPUT_TYPES.has(active.type)) return false;
    return true;
  }
  if (active instanceof HTMLTextAreaElement) return true;
  if (active instanceof HTMLSelectElement) return true;
  if (active.isContentEditable) return true;
  if (active.getAttribute("role") === "combobox") return true;
  if (
    active instanceof HTMLButtonElement &&
    active.getAttribute("aria-haspopup") === "listbox"
  ) {
    return true;
  }
  return false;
}

/**
 * After flushing document scroll on keyboard hide, WKWebKit no longer pans the page — keep focused
 * fields visible by adjusting `pageScrollRef.scrollTop` only while the IME is up.
 */
export function scrollSubmitMetadataActiveFieldAboveIosKeyboard(scrollRoot: HTMLElement | null, phase: string): void {
  if (!scrollRoot || typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (!vv) return;

  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (!scrollRoot.contains(active)) return;
  if (!shouldSubmitMetadataAdjustScrollForActiveKeyboardField(active)) return;

  const bufferPx = 14;
  const visibleTop = vv.offsetTop + bufferPx;
  const visibleBottom = vv.offsetTop + vv.height - bufferPx;

  const rect = active.getBoundingClientRect();
  let wantedDelta = 0;
  if (rect.bottom > visibleBottom) wantedDelta += rect.bottom - visibleBottom;
  if (rect.top < visibleTop) wantedDelta -= visibleTop - rect.top;

  if (Math.abs(wantedDelta) < 0.75) return;

  const maxST = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
  const before = scrollRoot.scrollTop;
  const slackBeforeApply = Math.max(0, maxST - before);

  const nextST = Math.min(maxST, Math.max(0, before + wantedDelta));
  const appliedDelta = nextST - before;
  /** Scroll-axis shortfall vs ideal (positive = wanted more scroll-down than maxScrollTop allowed). */
  const clampLossDown =
    wantedDelta > 0 ? Math.max(0, wantedDelta - appliedDelta) : 0;

  if (Math.abs(appliedDelta) < 0.5) return;

  scrollRoot.scrollTop = nextST;

  const rectAfter = active.getBoundingClientRect();

  if (isSubmitMetadataKbdMetricsDebugEnabled()) {
    const fieldStillBelowKb = rectAfter.bottom > visibleBottom;
    logSubmitMetadataKbd(`scrollFieldAboveKeyboard:${phase}`, {
      wantedDelta: Math.round(wantedDelta * 100) / 100,
      appliedDelta: Math.round(appliedDelta * 100) / 100,
      maxScrollTop: Math.round(maxST * 100) / 100,
      slackBeforeApply: Math.round(slackBeforeApply * 100) / 100,
      clampLossDownScroll: Math.round(clampLossDown * 100) / 100,
      prevScrollTop: Math.round(before * 100) / 100,
      nextScrollTop: Math.round(nextST * 100) / 100,
      visibleBottom: Math.round(visibleBottom * 100) / 100,
      fieldBottomBefore: Math.round(rect.bottom * 100) / 100,
      fieldBottomAfter: Math.round(rectAfter.bottom * 100) / 100,
      fieldStillBelowKb,
      visibleTop: Math.round(visibleTop * 100) / 100,
      fieldTop: Math.round(rect.top * 100) / 100,
      vvHeight: Math.round(vv.height * 100) / 100,
      vvOffsetTop: Math.round(vv.offsetTop * 100) / 100,
      scrollHeightAfter: Math.round(scrollRoot.scrollHeight * 100) / 100,
    });
  }
}

/** True if scrollTop was beyond the lawful range for the current scrollHeight/clientHeight pair. */
export function clampSubmitMetadataScrollRoot(scrollRoot: HTMLElement | null, reason: string): boolean {
  if (!scrollRoot) return false;
  const max = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
  const before = scrollRoot.scrollTop;
  if (scrollRoot.scrollTop > max) {
    scrollRoot.scrollTop = max;
    if (isSubmitMetadataKbdMetricsDebugEnabled()) {
      logSubmitMetadataKbd(`clamp:${reason}`, {
        ...(probeSubmitMetadataScrollLayout(scrollRoot) ?? {}),
        adjustedFrom: Math.round(before * 100) / 100,
      });
    }
    return true;
  }
  if (isSubmitMetadataKbdMetricsDebugEnabled()) {
    logSubmitMetadataKbd(`clamp:${reason}:no-op`, probeSubmitMetadataScrollLayout(scrollRoot) ?? {});
  }
  return false;
}
