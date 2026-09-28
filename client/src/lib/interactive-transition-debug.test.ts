import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { INTERACTIVE_PAGE_TRANSITIONS_FLAG } from "./interactive-page-transitions";
import {
  installTransitionDebug,
  registerEdgeSwipeListener,
  uninstallTransitionDebug,
  type TransitionDebugWindow,
} from "./interactive-transition-debug";

const here = dirname(fileURLToPath(import.meta.url));
const debugSrc = readFileSync(join(here, "./interactive-transition-debug.ts"), "utf8");
const stackSrc = readFileSync(join(here, "../components/interactive-settings-stack.tsx"), "utf8");
const hookSrc = readFileSync(join(here, "../hooks/use-edge-swipe-back.ts"), "utf8");

const originalWindow = globalThis.window;

function installFakeWindow(flag: string | null): TransitionDebugWindow {
  const storage = new Map<string, string>();
  if (flag) storage.set(INTERACTIVE_PAGE_TRANSITIONS_FLAG, flag);
  const fake = {
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
    },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      elementFromPoint: () => null,
      elementsFromPoint: () => [],
      scrollingElement: { scrollTop: 0 },
      body: null,
      documentElement: null,
    },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => undefined,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
  } as unknown as TransitionDebugWindow;
  globalThis.window = fake;
  return fake;
}

afterEach(() => {
  uninstallTransitionDebug();
  globalThis.window = originalWindow;
});

describe("interactive transition diagnostics", () => {
  it("does not install helpers when the feature flag is off", () => {
    const fake = installFakeWindow(null);
    installTransitionDebug();
    assert.equal(fake.__dubhubTransitionDebug, undefined);
    assert.equal(fake.__dubhubHitTest, undefined);
    assert.equal(registerEdgeSwipeListener("touchmove", "interactive", "/settings"), 0);
  });

  it("installs read-only helpers only when the feature flag is on", () => {
    const fake = installFakeWindow("1");
    installTransitionDebug();
    assert.equal(typeof fake.__dubhubTransitionDebug, "function");
    assert.equal(typeof fake.__dubhubHitTest, "function");
    const moveId = registerEdgeSwipeListener("touchmove", "interactive", "/settings");
    assert.ok(moveId > 0);
    const snapshot = fake.__dubhubTransitionDebug?.();
    assert.ok(snapshot);
    assert.equal(snapshot.edgeSwipeWindowListeners.touchmove, 1);
    assert.equal(snapshot.edgeSwipeWindowListeners.touchstart, 0);
    assert.deepEqual(snapshot.stack.pages, []);
    assert.equal(snapshot.profileScroller, null);
    const hit = fake.__dubhubHitTest?.(12, 34);
    assert.deepEqual(hit, { x: 12, y: 34, top: null, stack: [] });
  });

  it("does not write scroll or change stack layout classes", () => {
    assert.doesNotMatch(debugSrc, /\.scrollTop\s*=/);
    assert.match(stackSrc, /opacity-0 pointer-events-none/);
    assert.match(stackSrc, /data-settings-path=\{path\}/);
    assert.match(hookSrc, /event\.preventDefault\(\)/);
    assert.match(hookSrc, /if \(debugOn\) noteEdgeSwipePreventDefault/);
  });
});
