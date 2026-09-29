/**
 * Development-only measurement for interactive page transitions.
 * Production builds install no window helpers, listener registry, or logs.
 * Reads only. Does not write scroll, layout, or gesture state.
 */
import { stackLayerRole, type PopPhase } from "@/lib/interactive-page-transitions";

export type TransitionDebugWindow = Window & {
  __dubhubTransitionDebug?: () => TransitionDebugSnapshot;
  __dubhubHitTest?: (x: number, y: number) => TransitionHitTestResult;
};

type SettleNote = { kind: "commit" | "cancel"; source: "drag" | "button" } | null;

type EdgeListenerType = "touchstart" | "touchmove" | "touchend" | "touchcancel";

type EdgeListenerRecord = {
  id: number;
  type: EdgeListenerType;
  mode: "legacy" | "interactive";
  owner: string;
};

type PreventDefaultRecord = {
  t: number;
  mode: "legacy" | "interactive";
  owner: string;
};

export type TransitionTimelineEntry = {
  t: number;
  event: string;
  location: string | null;
  stack: string[];
  profileRole: string | null;
  profileScrollTop: number | null;
  layerTransform: string | null;
  inlineTransform: string | null;
};

type DebugLive = {
  getLocation: () => string;
  getPages: () => string[];
  getPhase: () => PopPhase;
  getInteraction: () => boolean;
  getPopDriver: () => boolean;
  getCommit: () => (() => void) | null;
};

export type TransitionDebugSnapshot = {
  stack: {
    location: string | null;
    pages: string[];
    roles: { path: string; role: string }[];
    foreground: string | null;
    underlay: string | null;
    retained: string[];
    solo: string | null;
    length: number;
  };
  transition: {
    dragging: boolean;
    settling: boolean;
    committing: boolean;
    inFlight: boolean;
    pendingPop: boolean;
    committed: boolean;
    phase: string;
    settleKind: "commit" | "cancel" | null;
    settleSource: "drag" | "button" | null;
    settleTimerId: number;
    fallbackPending: boolean;
    gestureOwners: string[];
    commitRef: string;
  };
  layers: LayerSnapshot[];
  profileScroller: ScrollerSnapshot | null;
  document: DocumentSnapshot;
  edgeSwipeWindowListeners: {
    note: string;
    touchstart: number;
    touchmove: number;
    touchend: number;
    touchcancel: number;
    records: EdgeListenerRecord[];
  };
  recentPreventDefault: PreventDefaultRecord[];
  timeline: TransitionTimelineEntry[];
};

export type TransitionHitTestResult = {
  x: number;
  y: number;
  top: HitElementSnapshot | null;
  stack: HitElementSnapshot[];
};

type LayerSnapshot = {
  pathname: string | null;
  role: string | null;
  connected: boolean;
  rect: RectSnapshot | null;
  computed: ComputedSnapshot | null;
  className: string | null;
  inlineStyle: string | null;
};

type ScrollerSnapshot = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  overflowY: string | null;
  overscrollBehavior: string | null;
  touchAction: string | null;
  pointerEvents: string | null;
  rect: RectSnapshot | null;
};

type DocumentSnapshot = {
  scrollingElementScrollTop: number | null;
  bodyOverflow: string | null;
  htmlOverflow: string | null;
  bodyPointerEvents: string | null;
  htmlPointerEvents: string | null;
};

type HitElementSnapshot = {
  tag: string;
  id: string;
  className: string | null;
  data: Record<string, string>;
  rect: RectSnapshot | null;
  pointerEvents: string | null;
  visibility: string | null;
  opacity: string | null;
  zIndex: string | null;
  position: string | null;
  transform: string | null;
  pathname: string | null;
  layerRole: string | null;
};

type RectSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type ComputedSnapshot = {
  display: string;
  visibility: string;
  opacity: string;
  pointerEvents: string;
  zIndex: string;
  position: string;
  transform: string;
  transition: string;
  overflow: string;
  touchAction: string;
};

let live: DebugLive | null = null;
let settleNote: SettleNote = null;
let settleTimerId = 0;
let listeners: EdgeListenerRecord[] = [];
let nextListenerId = 1;
let preventLog: PreventDefaultRecord[] = [];
let timeline: TransitionTimelineEntry[] = [];
let watchArmed = false;
let followUpScheduled = false;
let followUpTimer = 0;
let followUpRaf1 = 0;
let followUpRaf2 = 0;

let diagnosticsOverride: boolean | undefined;

export function transitionDiagnosticsEnabled(): boolean {
  if (diagnosticsOverride !== undefined && import.meta.env?.PROD !== true) return diagnosticsOverride;
  return import.meta.env?.DEV === true;
}

/** Tests only. Production builds ignore this. */
export function setTransitionDiagnosticsForTests(enabled: boolean | undefined): void {
  if (import.meta.env?.PROD === true) return;
  diagnosticsOverride = enabled;
}

function debugOn(): boolean {
  return transitionDiagnosticsEnabled();
}

export function publishTransitionDebugLive(next: DebugLive | null): void {
  if (next && !debugOn()) return;
  live = next;
}

export function setDebugSettle(note: SettleNote): void {
  if (!debugOn()) return;
  settleNote = note;
}

export function setDebugSettleTimer(id: number): void {
  if (!debugOn()) return;
  settleTimerId = id;
}

export function registerEdgeSwipeListener(
  type: EdgeListenerType,
  mode: "legacy" | "interactive",
  owner: string,
): number {
  if (!debugOn()) return 0;
  const id = nextListenerId++;
  listeners.push({ id, type, mode, owner });
  return id;
}

export function unregisterEdgeSwipeListener(id: number): void {
  if (!id) return;
  listeners = listeners.filter((record) => record.id !== id);
}

export function noteEdgeSwipePreventDefault(
  mode: "legacy" | "interactive",
  owner: string,
): void {
  if (!debugOn()) return;
  preventLog.push({ t: performance.now(), mode, owner });
  if (preventLog.length > 30) preventLog.shift();
}

export function immediateUnderlayPath(): string | null {
  const pages = live?.getPages() ?? [];
  if (pages.length < 2) return null;
  return pages[pages.length - 2] ?? null;
}

export function armProfilePopWatch(): void {
  if (!debugOn()) return;
  clearProfilePopFollowUp();
  watchArmed = true;
  followUpScheduled = false;
  timeline = [];
}

export function logProfilePopSample(event: string): void {
  if (!debugOn() || !watchArmed || typeof document === "undefined") return;
  const entry = readProfilePopSample(event);
  timeline.push(entry);
  console.log("[dubhub-transition]", entry);
}

export function scheduleProfilePopFollowUp(): void {
  if (!debugOn() || !watchArmed || followUpScheduled || typeof window === "undefined") return;
  followUpScheduled = true;
  followUpRaf1 = window.requestAnimationFrame(() => {
    logProfilePopSample("raf-1");
    followUpRaf2 = window.requestAnimationFrame(() => {
      logProfilePopSample("raf-2");
    });
  });
  followUpTimer = window.setTimeout(() => {
    logProfilePopSample("plus-500ms");
    watchArmed = false;
  }, 500);
}

function clearProfilePopFollowUp(): void {
  if (typeof window === "undefined") return;
  if (followUpRaf1) window.cancelAnimationFrame(followUpRaf1);
  if (followUpRaf2) window.cancelAnimationFrame(followUpRaf2);
  if (followUpTimer) window.clearTimeout(followUpTimer);
  followUpRaf1 = 0;
  followUpRaf2 = 0;
  followUpTimer = 0;
}

export function installTransitionDebug(): void {
  if (typeof window === "undefined") return;
  if (!debugOn()) {
    uninstallTransitionDebug();
    return;
  }
  const target = window as TransitionDebugWindow;
  target.__dubhubTransitionDebug = buildTransitionDebugSnapshot;
  target.__dubhubHitTest = hitTest;
}

export function uninstallTransitionDebug(): void {
  clearProfilePopFollowUp();
  watchArmed = false;
  live = null;
  settleNote = null;
  settleTimerId = 0;
  listeners = [];
  preventLog = [];
  if (typeof window === "undefined") return;
  const target = window as TransitionDebugWindow;
  delete target.__dubhubTransitionDebug;
  delete target.__dubhubHitTest;
}

function describeCommit(fn: (() => void) | null): string {
  if (!fn) return "missing";
  try {
    return Function.prototype.toString.call(fn).replace(/\s+/g, " ").slice(0, 240);
  } catch {
    return fn.name || "unavailable";
  }
}

function readProfilePopSample(event: string): TransitionTimelineEntry {
  const profile = profileLayer();
  const scroller = profileScrollerElement();
  const computed = readComputed(profile);
  return {
    t: typeof performance !== "undefined" ? performance.now() : 0,
    event,
    location: live?.getLocation() ?? null,
    stack: live?.getPages() ?? [],
    profileRole: profile?.getAttribute("data-settings-stack") ?? null,
    profileScrollTop: scroller ? scroller.scrollTop : null,
    layerTransform: computed?.transform ?? null,
    inlineTransform: profile?.style?.transform ?? null,
  };
}

function isHtmlElement(node: unknown): node is HTMLElement {
  return typeof HTMLElement !== "undefined" && node instanceof HTMLElement;
}

function profileLayer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const node = document.querySelector('[data-settings-path="/profile"]');
  return isHtmlElement(node) ? node : null;
}

function profileScrollerElement(): HTMLElement | null {
  const layer = profileLayer();
  const node = layer?.querySelector("[data-lg-nav-5a-dest]");
  return isHtmlElement(node) ? node : null;
}

function stackRoot(): ParentNode | null {
  if (typeof document === "undefined") return null;
  return document.querySelector('[data-settings-stack="on"]');
}

function buildTransitionDebugSnapshot(): TransitionDebugSnapshot {
  const pages = live?.getPages() ?? [];
  const roles = pages.map((path, index) => ({
    path,
    role: stackLayerRole(pages.length, index),
  }));
  const phase = live?.getPhase() ?? "idle";
  const owners = Array.from(new Set(listeners.map((record) => `${record.mode}:${record.owner}`)));
  return {
    stack: {
      location: live?.getLocation() ?? null,
      pages,
      roles,
      foreground: roles.find((item) => item.role === "foreground")?.path ?? null,
      underlay: roles.find((item) => item.role === "underlay")?.path ?? null,
      retained: roles.filter((item) => item.role === "retained").map((item) => item.path),
      solo: roles.find((item) => item.role === "solo")?.path ?? null,
      length: pages.length,
    },
    transition: {
      dragging: phase === "dragging",
      settling: phase === "settling",
      committing: phase === "settling" && settleNote?.kind === "commit",
      inFlight: live?.getInteraction() ?? false,
      pendingPop: live?.getPopDriver() ?? false,
      committed: phase === "committed",
      phase,
      settleKind: settleNote?.kind ?? null,
      settleSource: settleNote?.source ?? null,
      settleTimerId,
      fallbackPending: settleTimerId !== 0,
      gestureOwners: owners,
      commitRef: describeCommit(live?.getCommit() ?? null),
    },
    layers: readLayers(),
    profileScroller: readProfileScroller(),
    document: readDocumentSnapshot(),
    edgeSwipeWindowListeners: {
      note: "useEdgeSwipeBack window listeners only. WKWebView cannot enumerate every window listener.",
      touchstart: countListeners("touchstart"),
      touchmove: countListeners("touchmove"),
      touchend: countListeners("touchend"),
      touchcancel: countListeners("touchcancel"),
      records: listeners.map((record) => ({ ...record })),
    },
    recentPreventDefault: preventLog.map((record) => ({ ...record })),
    timeline: timeline.map((entry) => ({ ...entry, stack: [...entry.stack] })),
  };
}

function countListeners(type: EdgeListenerType): number {
  return listeners.filter((record) => record.type === type).length;
}

function readLayers(): LayerSnapshot[] {
  const root = stackRoot();
  if (!root) return [];
  return Array.from(root.querySelectorAll("[data-settings-path]")).flatMap((node) => {
    if (!isHtmlElement(node)) return [];
    if (node.parentElement !== root) return [];
    return [readLayer(node)];
  });
}

function readLayer(node: HTMLElement): LayerSnapshot {
  return {
    pathname: node.getAttribute("data-settings-path"),
    role: node.getAttribute("data-settings-stack"),
    connected: node.isConnected,
    rect: readRect(node),
    computed: readComputed(node),
    className: node.getAttribute("class"),
    inlineStyle: node.getAttribute("style"),
  };
}

function readProfileScroller(): ScrollerSnapshot | null {
  const scroller = profileScrollerElement();
  if (!scroller) return null;
  const computed = readComputed(scroller);
  return {
    scrollTop: scroller.scrollTop,
    scrollHeight: scroller.scrollHeight,
    clientHeight: scroller.clientHeight,
    overflowY: computed?.overflow ?? null,
    overscrollBehavior: readOverscroll(scroller),
    touchAction: computed?.touchAction ?? null,
    pointerEvents: computed?.pointerEvents ?? null,
    rect: readRect(scroller),
  };
}

function readDocumentSnapshot(): DocumentSnapshot {
  if (typeof document === "undefined") {
    return {
      scrollingElementScrollTop: null,
      bodyOverflow: null,
      htmlOverflow: null,
      bodyPointerEvents: null,
      htmlPointerEvents: null,
    };
  }
  const body = asElement(document.body);
  const html = asElement(document.documentElement);
  const bodyComputed = readComputed(body);
  const htmlComputed = readComputed(html);
  const scrolling = document.scrollingElement;
  return {
    scrollingElementScrollTop: scrolling ? scrolling.scrollTop : null,
    bodyOverflow: bodyComputed?.overflow ?? null,
    htmlOverflow: htmlComputed?.overflow ?? null,
    bodyPointerEvents: bodyComputed?.pointerEvents ?? null,
    htmlPointerEvents: htmlComputed?.pointerEvents ?? null,
  };
}

function hitTest(x: number, y: number): TransitionHitTestResult {
  if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") {
    return { x, y, top: null, stack: [] };
  }
  const topNode = document.elementFromPoint(x, y);
  const stacked =
    typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(x, y) : [];
  return {
    x,
    y,
    top: topNode ? describeHitElement(topNode) : null,
    stack: stacked.map((node) => describeHitElement(node)),
  };
}

function describeHitElement(node: Element): HitElementSnapshot {
  const computed = readComputed(node);
  const layer = node.closest("[data-settings-stack]");
  const pathNode = node.closest("[data-settings-path]");
  return {
    tag: node.tagName,
    id: node.id,
    className: node.getAttribute("class"),
    data: readData(node),
    rect: readRect(node),
    pointerEvents: computed?.pointerEvents ?? null,
    visibility: computed?.visibility ?? null,
    opacity: computed?.opacity ?? null,
    zIndex: computed?.zIndex ?? null,
    position: computed?.position ?? null,
    transform: computed?.transform ?? null,
    pathname: pathNode?.getAttribute("data-settings-path") ?? null,
    layerRole:
      isHtmlElement(layer) ? layer.getAttribute("data-settings-stack") : null,
  };
}

function readData(node: Element): Record<string, string> {
  const out: Record<string, string> = {};
  const attributes = node.attributes;
  if (!attributes) return out;
  for (let index = 0; index < attributes.length; index += 1) {
    const attr = attributes.item(index);
    if (attr && attr.name.startsWith("data-")) out[attr.name] = attr.value;
  }
  return out;
}

function readRect(node: Element | null): RectSnapshot | null {
  if (!node || typeof node.getBoundingClientRect !== "function") return null;
  try {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
    };
  } catch {
    return null;
  }
}

function readComputed(node: Element | null): ComputedSnapshot | null {
  if (!node || typeof getComputedStyle !== "function") return null;
  try {
    const style = getComputedStyle(node);
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      position: style.position,
      transform: style.transform,
      transition: style.transition,
      overflow: style.overflow,
      touchAction: style.touchAction,
    };
  } catch {
    return null;
  }
}

function readOverscroll(node: HTMLElement): string | null {
  if (typeof getComputedStyle !== "function") return null;
  try {
    return getComputedStyle(node).overscrollBehavior || null;
  } catch {
    return null;
  }
}

function asElement(value: unknown): Element | null {
  return typeof Element !== "undefined" && value instanceof Element ? value : null;
}
