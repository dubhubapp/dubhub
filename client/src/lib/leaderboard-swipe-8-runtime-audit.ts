/**
 * LEADERBOARD-SWIPE-8 — TEMP runtime diagnostics ONLY.
 * Do not commit as product behavior. Remove after physical root cause is known.
 *
 * Safari Web Inspector / Xcode console:
 *   window.__LB_SWIPE8.export()
 *   window.__LB_SWIPE8.captureHeights("blank")
 *   window.__LB_SWIPE8.captureScrollOwners()
 *   window.__LB_SWIPE8.clear()
 */

export type LbSwipe8Event =
  | "TOUCH_START"
  | "TOUCH_START_SKIP"
  | "ARM"
  | "TOUCH_END"
  | "TOUCH_CANCEL"
  | "EVALUATE"
  | "SNAP_BEGIN"
  | "SNAP_END"
  | "COMMIT"
  | "RESET"
  | "TAB_CHANGE"
  | "HEIGHT_CAPTURE"
  | "SCROLL_OWNERS";

export type LbSwipe8Record = {
  t: number;
  event: LbSwipe8Event;
  gestureId: number | null;
  phase: string | null;
  activeScope: string | null;
  sourceIndex: number | null;
  viewportWidth: number | null;
  startX: number | null;
  currentX: number | null;
  deltaX: number | null;
  deltaY: number | null;
  baseTranslate: number | null;
  currentTranslate: number | null;
  progress: number | null;
  velocityX: number | null;
  flickQualified: boolean | null;
  commitQualified: boolean | null;
  targetScope: string | null;
  snapTarget: number | null;
  snapGeneration: number | null;
  pointerId: number | null;
  endPointerId: number | null;
  touchstartCount: number | null;
  touchendCount: number | null;
  touchcancelCount: number | null;
  decisionAction: string | null;
  decisionReason: string | null;
  skipReason: string | null;
  note: string | null;
  extra: Record<string, unknown> | null;
};

type LbSwipe8Api = {
  records: LbSwipe8Record[];
  log: (partial: Partial<LbSwipe8Record> & { event: LbSwipe8Event }) => void;
  clear: () => void;
  export: () => string;
  captureHeights: (label: string) => Record<string, unknown>;
  captureScrollOwners: () => Record<string, unknown>;
  captureTouchCss: () => Record<string, unknown>;
};

const empty = (): LbSwipe8Record => ({
  t: 0,
  event: "RESET",
  gestureId: null,
  phase: null,
  activeScope: null,
  sourceIndex: null,
  viewportWidth: null,
  startX: null,
  currentX: null,
  deltaX: null,
  deltaY: null,
  baseTranslate: null,
  currentTranslate: null,
  progress: null,
  velocityX: null,
  flickQualified: null,
  commitQualified: null,
  targetScope: null,
  snapTarget: null,
  snapGeneration: null,
  pointerId: null,
  endPointerId: null,
  touchstartCount: null,
  touchendCount: null,
  touchcancelCount: null,
  decisionAction: null,
  decisionReason: null,
  skipReason: null,
  note: null,
  extra: null,
});

function ensureApi(): LbSwipe8Api {
  const w = window as Window & { __LB_SWIPE8?: LbSwipe8Api };
  if (w.__LB_SWIPE8) return w.__LB_SWIPE8;

  const records: LbSwipe8Record[] = [];

  const api: LbSwipe8Api = {
    records,
    log(partial) {
      const row: LbSwipe8Record = { ...empty(), ...partial, t: performance.now() };
      records.push(row);
      // Compact single-line for Safari console filtering: LB-SWIPE-8
      console.info("LB-SWIPE-8", partial.event, row);
    },
    clear() {
      records.length = 0;
      console.info("LB-SWIPE-8", "cleared");
    },
    export() {
      const json = JSON.stringify(records, null, 2);
      console.info("LB-SWIPE-8 export\n" + json);
      return json;
    },
    captureHeights(label: string) {
      const page = document.querySelector(
        '[data-lg-nav-5a-dest="leaderboard"]',
      ) as HTMLElement | null;
      const viewport = document.querySelector(
        '[data-testid="leaderboard-swipe-region"]',
      ) as HTMLElement | null;
      const track = document.querySelector(
        '[data-testid="leaderboard-pager-track"]',
      ) as HTMLElement | null;
      const users = document.querySelector(
        '[data-testid="leaderboard-pager-panel-users"]',
      ) as HTMLElement | null;
      const artists = document.querySelector(
        '[data-testid="leaderboard-pager-panel-artists"]',
      ) as HTMLElement | null;

      const metrics = (el: HTMLElement | null, name: string) => {
        if (!el) return { name, missing: true };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          name,
          rect: { top: r.top, bottom: r.bottom, height: r.height, width: r.width },
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          maxScrollTop: Math.max(0, el.scrollHeight - el.clientHeight),
          overflowY: cs.overflowY,
          height: cs.height,
          minHeight: cs.minHeight,
          maxHeight: cs.maxHeight,
          flexBasis: cs.flexBasis,
          alignSelf: cs.alignSelf,
          display: cs.display,
          overflow: cs.overflow,
          dataState: el.getAttribute("data-state"),
          className: el.className,
          inlineMinHeight: el.style.minHeight || null,
          inlineHeight: el.style.height || null,
        };
      };

      const payload = {
        label,
        page: metrics(page, "pageScroll"),
        viewport: metrics(viewport, "pagerViewport"),
        track: metrics(track, "pagerTrack"),
        users: metrics(users, "panelUsers"),
        artists: metrics(artists, "panelArtists"),
        contentWrap: metrics(
          page?.querySelector(":scope > div") as HTMLElement | null,
          "contentWrap",
        ),
      };
      api.log({
        event: "HEIGHT_CAPTURE",
        note: label,
        extra: payload,
      });
      return payload;
    },
    captureScrollOwners() {
      const page = document.querySelector(
        '[data-lg-nav-5a-dest="leaderboard"]',
      ) as HTMLElement | null;
      const candidates: Array<{ name: string; el: Element | null }> = [
        { name: "pageScrollRef", el: page },
        { name: "document.scrollingElement", el: document.scrollingElement },
        { name: "document.documentElement", el: document.documentElement },
        { name: "document.body", el: document.body },
      ];
      if (page) {
        let p: HTMLElement | null = page.parentElement;
        let i = 0;
        while (p && i < 8) {
          candidates.push({ name: `pageParent[${i}]`, el: p });
          p = p.parentElement;
          i += 1;
        }
      }
      const rows = candidates.map(({ name, el }) => {
        if (!(el instanceof HTMLElement)) return { name, missing: true };
        const cs = getComputedStyle(el);
        return {
          name,
          tag: el.tagName,
          className: el.className,
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          maxScrollTop: Math.max(0, el.scrollHeight - el.clientHeight),
          overflowY: cs.overflowY,
          overflowAnchor: cs.overflowAnchor,
        };
      });
      const payload = { rows, at: performance.now() };
      api.log({ event: "SCROLL_OWNERS", extra: payload });
      return payload;
    },
    captureTouchCss() {
      const viewport = document.querySelector(
        '[data-testid="leaderboard-swipe-region"]',
      ) as HTMLElement | null;
      const track = document.querySelector(
        '[data-testid="leaderboard-pager-track"]',
      ) as HTMLElement | null;
      const users = document.querySelector(
        '[data-testid="leaderboard-pager-panel-users"]',
      ) as HTMLElement | null;
      const artists = document.querySelector(
        '[data-testid="leaderboard-pager-panel-artists"]',
      ) as HTMLElement | null;
      const read = (el: HTMLElement | null, name: string) => {
        if (!el) return { name, missing: true };
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          name,
          width: r.width,
          height: r.height,
          touchAction: cs.touchAction,
          overscrollBehavior: cs.overscrollBehavior,
          webkitOverflowScrolling: (cs as CSSStyleDeclaration & {
            webkitOverflowScrolling?: string;
          }).webkitOverflowScrolling ?? null,
          pointerEvents: cs.pointerEvents,
          display: cs.display,
          flexDirection: cs.flexDirection,
          alignItems: cs.alignItems,
          minHeight: cs.minHeight,
          heightCss: cs.height,
          overflow: cs.overflow,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        };
      };
      return {
        viewport: read(viewport, "viewport"),
        track: read(track, "track"),
        users: read(users, "users"),
        artists: read(artists, "artists"),
      };
    },
  };

  w.__LB_SWIPE8 = api;
  console.info(
    "LB-SWIPE-8 ready — run sequences then window.__LB_SWIPE8.export()",
  );
  return api;
}

/** Call once from swipe hook / page so the global exists in Capacitor WKWebView. */
export function lbSwipe8Ensure(): LbSwipe8Api {
  if (typeof window === "undefined") {
    return {
      records: [],
      log: () => {},
      clear: () => {},
      export: () => "[]",
      captureHeights: () => ({}),
      captureScrollOwners: () => ({}),
      captureTouchCss: () => ({}),
    };
  }
  return ensureApi();
}

export function lbSwipe8Log(
  partial: Partial<LbSwipe8Record> & { event: LbSwipe8Event },
): void {
  lbSwipe8Ensure().log(partial);
}
