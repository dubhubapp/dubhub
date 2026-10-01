import { Window } from "happy-dom";

const dom = new Window({ url: "https://dubhub.test/profile" });
const globals = {
  window: dom,
  document: dom.document,
  HTMLElement: dom.HTMLElement,
  Element: dom.Element,
  Node: dom.Node,
  navigator: dom.navigator,
  sessionStorage: dom.sessionStorage,
  localStorage: dom.localStorage,
  getComputedStyle: dom.getComputedStyle.bind(dom),
  requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
  cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
  MutationObserver: dom.MutationObserver,
  Event: dom.Event,
  CustomEvent: dom.CustomEvent,
  matchMedia: dom.matchMedia.bind(dom),
  IS_REACT_ACT_ENVIRONMENT: true,
};
for (const [key, value] of Object.entries(globals)) {
  try {
    globalThis[key] = value;
  } catch {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
}

const { createServer } = await import("vite");
const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");

const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
const owner = internals.ReactCurrentOwner;
const dispatcherSlot = internals.ReactCurrentDispatcher;
const traces = [];
let recording = true;

function componentName() {
  const fiber = owner?.current;
  const type = fiber?.elementType ?? fiber?.type;
  if (!type) return "(unknown)";
  if (typeof type === "string") return type;
  return type.displayName || type.name || "(anonymous)";
}

function wrapDispatcher(dispatcher) {
  if (!dispatcher || dispatcher.__hookTrace) return dispatcher;
  const wrapped = { __hookTrace: true };
  for (const key of Object.keys(dispatcher)) {
    const value = dispatcher[key];
    wrapped[key] =
      typeof value === "function"
        ? (...args) => {
            if (recording) {
              traces.push(`${componentName()}:${key}`);
            }
            return value.apply(dispatcher, args);
          }
        : value;
  }
  return wrapped;
}

let currentDispatcher = dispatcherSlot.current;
Object.defineProperty(dispatcherSlot, "current", {
  configurable: true,
  get() {
    return currentDispatcher;
  },
  set(value) {
    currentDispatcher = wrapDispatcher(value);
  },
});

const nativeStub = {
  name: "runtime-native-stub",
  enforce: "pre",
  resolveId(id) {
    if (id.startsWith("@capacitor/") || id.startsWith("@revenuecat/")) {
      return `\0native-stub:${id}`;
    }
    return null;
  },
  load(id) {
    if (!id.startsWith("\0native-stub:")) return null;
    return `
      const fn = () => Promise.resolve({});
      const proxy = new Proxy(fn, {
        get: () => proxy,
        apply: () => ({}),
      });
      export default proxy;
      export const Capacitor = {
        isNativePlatform: () => false,
        getPlatform: () => "web",
        isPluginAvailable: () => false,
        addListener: fn,
        removeListener: fn,
      };
      export const registerPlugin = () => proxy;
      export const Purchases = proxy;
      export const LOG_LEVEL = { DEBUG: "DEBUG", INFO: "INFO" };
      export const App = proxy;
      export const Keyboard = proxy;
      export const KeyboardResize = { None: "none", Native: "native" };
      export const Haptics = proxy;
      export const ImpactStyle = { Light: "LIGHT" };
      export const NotificationType = { Success: "SUCCESS" };
      export const Share = proxy;
      export const StatusBar = proxy;
      export const SplashScreen = proxy;
      export const PushNotifications = proxy;
      export const Filesystem = proxy;
    `;
  },
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
  plugins: [nativeStub],
  resolve: {
    alias: [
      {
        find: "@/lib/user-context",
        replacement:
          "/Users/joshharris/Desktop/dub hub Replit Files/client/src/lib/interactive-page-transitions-runtime.user-mock.tsx",
      },
      { find: "@shared", replacement: "/Users/joshharris/Desktop/dub hub Replit Files/shared" },
      { find: "@assets", replacement: "/Users/joshharris/Desktop/dub hub Replit Files/attached_assets" },
      { find: "@", replacement: "/Users/joshharris/Desktop/dub hub Replit Files/client/src" },
    ],
  },
  ssr: {
    noExternal: [/^@capacitor\//, /^@revenuecat\//],
  },
});

const harness = await vite.ssrLoadModule(
  "/src/lib/interactive-page-transitions-runtime.harness.tsx",
);

function sequencesByComponent() {
  const byComponent = new Map();
  let currentName = "";
  let current = [];
  const flush = () => {
    if (!currentName) return;
    if (!byComponent.has(currentName)) byComponent.set(currentName, []);
    byComponent.get(currentName).push(current.join(">"));
    current = [];
  };
  for (const entry of traces) {
    const splitAt = entry.indexOf(":");
    const name = entry.slice(0, splitAt);
    const hook = entry.slice(splitAt + 1);
    if (name !== currentName) {
      flush();
      currentName = name;
    }
    current.push(hook);
  }
  flush();
  return byComponent;
}

function summarize(label) {
  const byComponent = sequencesByComponent();
  console.log("\n==", label);
  for (const [name, sequences] of byComponent) {
    if (
      !/Settings|Profile|Stack|Swipe|Gate|anonymous|Transition|Layer/.test(name)
    ) {
      continue;
    }
    const unique = [...new Set(sequences)];
    console.log(name, "renders", sequences.length, "unique", unique.length);
    if (unique.length > 1) {
      unique.forEach((sequence, index) => console.log("  variant", index, sequence));
    }
  }
}

function profileLayer() {
  const profile = dom.document.querySelector('[data-lg-nav-5a-dest="profile"]');
  return profile?.closest("[data-settings-stack]");
}

function assertProfileForeground(label) {
  const layer = profileLayer();
  if (!layer) throw new Error(`${label}: Profile layer missing`);
  if (layer.getAttribute("data-settings-stack") !== "solo" && layer.getAttribute("data-settings-stack") !== "foreground") {
    throw new Error(`${label}: Profile role is ${layer.getAttribute("data-settings-stack")}`);
  }
  if (/\binvisible\b|\bpointer-events-none\b|\bopacity-0\b/.test(layer.className)) {
    throw new Error(`${label}: Profile still has a retained/underlay class (${layer.className})`);
  }
  if (layer.style.pointerEvents === "none" || layer.style.visibility === "hidden") {
    throw new Error(`${label}: Profile inline style still blocks interaction`);
  }
  if (layer.style.transform) {
    throw new Error(`${label}: Profile transform was not cleared (${layer.style.transform})`);
  }
  const motion = layer.querySelector("[data-settings-motion]");
  if (motion?.style.transform) {
    throw new Error(`${label}: Profile motion transform was not cleared (${motion.style.transform})`);
  }
}

function assertXMotionIsNotOnPageShell(path) {
  const layer = dom.document.querySelector(`[data-settings-path="${path}"]`);
  if (!layer) throw new Error(`${path} layer missing`);
  const motion = layer.querySelector("[data-settings-motion]");
  if (!motion) throw new Error(`${path} motion shell missing`);
  if (layer.style.transform) {
    throw new Error(`${path} page shell has transform ${layer.style.transform}`);
  }
  const geometry = "absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden";
  if (!layer.className.includes(geometry)) {
    throw new Error(`${path} page shell lost its inset box (${layer.className})`);
  }
  if (/\babsolute\b/.test(motion.className) || /\binset-0\b/.test(motion.className)) {
    throw new Error(`${path} motion shell uses the page-shell box (${motion.className})`);
  }
  const transform = motion.style.transform || "";
  if (transform && !/^translate3d\([^,]+,\s*0(?:px)?,\s*0(?:px)?\)$/.test(transform)) {
    throw new Error(`${path} motion transform is not X-only (${transform})`);
  }
  return { layer, motion, transform };
}

function installSameDocumentHistory() {
  const history = dom.history;
  const entries = [
    {
      path: `${dom.location.pathname}${dom.location.search}`,
      state: history.state,
    },
  ];
  let index = 0;
  let backs = 0;
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  const pathOf = (url) => {
    const next = new URL(String(url), dom.location.href);
    return `${next.pathname}${next.search}`;
  };
  history.pushState = (state, title, url) => {
    const path = pathOf(url);
    entries.splice(index + 1);
    entries.push({ path, state });
    index = entries.length - 1;
    origPush(state, title, path);
  };
  history.replaceState = (state, title, url) => {
    const path = pathOf(url);
    entries[index] = { path, state };
    origReplace(state, title, path);
  };
  history.back = () => {
    if (index <= 0) return;
    backs += 1;
    index -= 1;
    const entry = entries[index];
    origReplace(entry.state, "", entry.path);
    dom.dispatchEvent(new dom.PopStateEvent("popstate", { state: entry.state }));
    harness.notifyBrowserHarnessLocation();
  };
  return {
    resetBacks() {
      backs = 0;
    },
    get backs() {
      return backs;
    },
    dump() {
      return `${index}:${entries.map((entry) => entry.path).join(" > ")}`;
    },
  };
}

let settleNonce = 1;

async function clickAndSettle(selector) {
  const button = dom.document.querySelector(selector);
  if (!button) throw new Error(`Missing ${selector}`);
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 700));
  });
  const nonce = settleNonce;
  settleNonce += 1;
  await act(async () => {
    harness.notifyBrowserHarnessLocation();
    root.render(React.createElement(harness.BrowserHistoryTransitionHarness, { nonce }));
  });
}

async function assertNestedSettingsPopCommits() {
  const session = installSameDocumentHistory();
  await act(async () => {
    harness.setRuntimeMockUser({
      id: "user-1",
      username: "josh",
      profileImage: null,
      avatarUrl: null,
      level: 1,
      currentXP: 0,
      memberSince: "2024-01-01T00:00:00.000Z",
      userType: "artist",
      verifiedArtist: true,
    });
    root.render(React.createElement(harness.BrowserHistoryTransitionHarness, { nonce: 0 }));
  });
  const profileSettingsButton = dom.document.querySelector('[data-testid="button-settings"]');
  if (!profileSettingsButton) throw new Error("Browser harness Profile Settings button missing");
  await act(async () => {
    profileSettingsButton.dispatchEvent(new dom.MouseEvent("click", { bubbles: true }));
  });
  if (session.dump() !== "1:/profile > /settings") {
    throw new Error(`Profile Settings tap did not push history (${session.dump()})`);
  }
  if (globalThis.window.__dubhubTransitionDebug?.().stack.pages.join("|") !== "/profile|/settings") {
    throw new Error("Profile Settings tap did not push the contextual stack");
  }
  await act(async () => {
    dom.history.back();
  });
  await act(async () => {
    harness.navigateBrowserHarness("/settings");
  });
  const artistButton = dom.document.querySelector('[data-testid="button-settings-artist"]');
  if (!artistButton) throw new Error("Artist settings row did not render");
  await act(async () => {
    artistButton.click();
  });
  if (dom.location.pathname !== "/settings/artist") {
    throw new Error(`Artist push did not update history (${dom.location.pathname})`);
  }
  const settingsUnderlay = assertXMotionIsNotOnPageShell("/settings");
  if (settingsUnderlay.layer.getAttribute("data-settings-stack") !== "underlay") {
    throw new Error(`Settings role during Artist is ${settingsUnderlay.layer.getAttribute("data-settings-stack")}`);
  }
  if (!settingsUnderlay.transform) {
    throw new Error("Settings underlay did not receive an X-only motion transform");
  }
  assertXMotionIsNotOnPageShell("/settings/artist");
  session.resetBacks();
  await clickAndSettle('[data-testid="button-settings-artist-back"]');
  if (session.backs !== 1) {
    throw new Error(`Artist back should pop once, called history.back ${session.backs} times`);
  }
  if (dom.location.pathname !== "/settings") {
    throw new Error(`Artist back did not return to Settings (${dom.location.pathname})`);
  }
  const afterArtist = globalThis.window.__dubhubTransitionDebug?.();
  if (!afterArtist) throw new Error("Transition debug snapshot missing after Artist back");
  if (afterArtist.stack.location !== "/settings") {
    throw new Error(`Stack location after Artist back is ${afterArtist.stack.location}`);
  }
  if (afterArtist.stack.pages.join("|") !== "/profile|/settings") {
    throw new Error(`Stack after Artist back is ${afterArtist.stack.pages.join("|")}`);
  }
  const settingsForeground = assertXMotionIsNotOnPageShell("/settings");
  if (settingsForeground.layer.getAttribute("data-settings-stack") !== "foreground") {
    throw new Error(`Settings role after Artist back is ${settingsForeground.layer.getAttribute("data-settings-stack")}`);
  }
  if (settingsForeground.transform) {
    throw new Error(`Settings foreground motion transform remained (${settingsForeground.transform})`);
  }
  if (!settingsForeground.layer.className.includes("absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden")) {
    throw new Error("Settings foreground page shell no longer matches the underlay shell");
  }
  session.resetBacks();
  await clickAndSettle('[data-testid="button-settings-back"]');
  if (session.backs !== 1) {
    throw new Error(`Settings back should commit once, called history.back ${session.backs} times`);
  }
  if (dom.location.pathname !== "/profile") {
    throw new Error(`Settings back left location at ${dom.location.pathname}`);
  }
  const stuck = globalThis.window.__dubhubTransitionDebug?.();
  if (!stuck) throw new Error("Transition debug snapshot missing after Settings back");
  if (stuck.stack.location !== "/profile" || stuck.stack.pages.join("|") !== "/profile") {
    throw new Error(
      `Settings back did not leave a solo Profile stack (${stuck.stack.location} ${stuck.stack.pages.join("|")}) history ${session.dump()}`,
    );
  }
  if (stuck.stack.solo !== "/profile") {
    throw new Error(`Profile role after Settings back is ${stuck.stack.solo}`);
  }
  if (stuck.transition.inFlight || stuck.transition.pendingPop) {
    throw new Error(
      `Pop commit stayed armed (inFlight ${stuck.transition.inFlight}, pendingPop ${stuck.transition.pendingPop})`,
    );
  }
  const settingsListeners = stuck.edgeSwipeWindowListeners.records.filter((record) =>
    String(record.owner).includes("/settings"),
  );
  if (settingsListeners.length !== 0) {
    throw new Error(`Settings edge listeners still attached (${settingsListeners.length})`);
  }

  session.resetBacks();
  await act(async () => {
    harness.navigateBrowserHarness("/settings");
  });
  const manageButton = dom.document.querySelector('[data-testid="button-manage-account"]');
  if (!manageButton) throw new Error("Manage account row did not render");
  await act(async () => {
    manageButton.click();
  });
  if (dom.history.state?.dubhubInteractiveParent !== "/settings") {
    throw new Error(
      `Manage account history.state parent is ${dom.history.state?.dubhubInteractiveParent ?? "missing"} (${session.dump()})`,
    );
  }
  const countryButton = dom.document.querySelector('[data-testid="button-settings-country"]');
  if (!countryButton) throw new Error("Country row did not render");
  await act(async () => {
    countryButton.click();
  });
  if (dom.location.pathname !== "/settings/country") {
    throw new Error(`Country push did not update history (${dom.location.pathname}${dom.location.search})`);
  }
  if (dom.history.state?.dubhubInteractiveParent !== "/settings/manage-account") {
    throw new Error(
      `Country history.state parent is ${dom.history.state?.dubhubInteractiveParent ?? "missing"} (${session.dump()})`,
    );
  }
  session.resetBacks();
  await clickAndSettle('[data-testid="button-settings-country-back"]');
  if (session.backs !== 1) {
    throw new Error(`Country back should pop once, called history.back ${session.backs} times`);
  }
  if (dom.location.pathname !== "/settings/manage-account") {
    throw new Error(`Country back did not return to Manage account (${dom.location.pathname}) history ${session.dump()}`);
  }
  session.resetBacks();
  await clickAndSettle('[data-testid="button-manage-account-back"]');
  if (session.backs !== 1) {
    throw new Error(`Manage account back should pop once, called history.back ${session.backs} times`);
  }
  if (dom.location.pathname !== "/settings") {
    throw new Error(`Manage account back did not return to Settings (${dom.location.pathname}) history ${session.dump()}`);
  }
  session.resetBacks();
  await clickAndSettle('[data-testid="button-settings-back"]');
  if (session.backs !== 1) {
    throw new Error(`Settings back should pop once, called history.back ${session.backs} times (${session.dump()})`);
  }
  if (dom.location.pathname !== "/profile") {
    throw new Error(`Settings back left location at ${dom.location.pathname} history ${session.dump()}`);
  }
  const unwound = globalThis.window.__dubhubTransitionDebug?.();
  if (!unwound) throw new Error("Transition debug snapshot missing after Country unwind");
  if (unwound.stack.location !== "/profile" || unwound.stack.pages.join("|") !== "/profile") {
    throw new Error(
      `Country unwind did not leave a solo Profile stack (${unwound.stack.location} ${unwound.stack.pages.join("|")})`,
    );
  }
  if (unwound.stack.solo !== "/profile") {
    throw new Error(`Profile role after Country unwind is ${unwound.stack.solo}`);
  }
  if (unwound.transition.inFlight || unwound.transition.pendingPop) {
    throw new Error(
      `Country unwind stayed armed (inFlight ${unwound.transition.inFlight}, pendingPop ${unwound.transition.pendingPop})`,
    );
  }
  session.resetBacks();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    harness.notifyBrowserHarnessLocation();
  });
  if (session.backs !== 0) {
    throw new Error(`A later history.back fired after Profile settled (${session.backs})`);
  }
  if (dom.location.pathname !== "/profile") {
    throw new Error(`Profile bounced to ${dom.location.pathname}${dom.location.search} history ${session.dump()}`);
  }
  const settled = globalThis.window.__dubhubTransitionDebug?.();
  if (!settled || settled.stack.pages.join("|") !== "/profile" || settled.stack.solo !== "/profile") {
    throw new Error(
      `Profile did not stay solo (${settled?.stack.location} ${settled?.stack.pages?.join("|")} role ${settled?.stack.solo})`,
    );
  }
  if (settled.transition.inFlight || settled.transition.pendingPop) {
    throw new Error("Profile unwind re-armed a pop after the fallback window");
  }
}

async function go(path) {
  traces.length = 0;
  await act(async () => {
    harness.navigateRuntimeHarness(path);
  });
}

function motionSnapshot(label) {
  const debug = globalThis.window.__dubhubTransitionDebug?.();
  const layers = [...dom.document.querySelectorAll("[data-settings-path]")].map((layer) => {
    const motion = layer.querySelector("[data-settings-motion]");
    return {
      path: layer.getAttribute("data-settings-path"),
      role: layer.getAttribute("data-settings-stack"),
      motionTransform: motion?.style?.transform || "",
      motionTransition: motion?.style?.transition || "",
    };
  });
  return {
    label,
    location: debug?.stack?.location ?? dom.location.pathname,
    pages: debug?.stack?.pages ?? null,
    layers,
  };
}

async function traceHeldPush(label, path, activate) {
  const queued = [];
  const previous = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    queued.push(callback);
    return queued.length;
  };
  globalThis.cancelAnimationFrame = (id) => {
    queued[id - 1] = null;
  };
  if (globalThis.window) {
    globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
  }
  try {
    await act(async () => {
      if (activate) activate();
      else harness.navigateRuntimeHarness(path);
    });
    const afterLayout = motionSnapshot(`${label}:after-layout`);
    const depth = queued.length;
    await act(async () => {
      const batch = queued.splice(0, queued.length);
      for (const callback of batch) callback?.(0);
    });
    const afterOuterFrame = motionSnapshot(`${label}:after-outer-frame`);
    await act(async () => {
      const batch = queued.splice(0, queued.length);
      for (const callback of batch) callback?.(0);
    });
    const afterInnerFrame = motionSnapshot(`${label}:after-inner-frame`);
    const foreground = afterLayout.layers.find((layer) => layer.role === "foreground");
    const underlay = afterLayout.layers.find((layer) => layer.role === "underlay");
    if (!foreground || foreground.motionTransform !== "translate3d(100%,0,0)") {
      throw new Error(
        `${label} did not start off the right edge (${JSON.stringify(afterLayout.layers)})`,
      );
    }
    if (!underlay) {
      throw new Error(`${label} did not keep a mounted underlay (${JSON.stringify(afterLayout.layers)})`);
    }
    if (foreground.motionTransition !== "none") {
      throw new Error(`${label} armed a transition before the enter frame (${foreground.motionTransition})`);
    }
    const entered = afterInnerFrame.layers.find((layer) => layer.role === "foreground");
    const stillUnder = afterInnerFrame.layers.find((layer) => layer.path === underlay.path);
    if (!entered || entered.motionTransform !== "translate3d(0,0,0)") {
      throw new Error(`${label} did not enter (${JSON.stringify(afterInnerFrame.layers)})`);
    }
    if (!entered.motionTransition.includes("280ms")) {
      throw new Error(`${label} did not use the push duration (${entered.motionTransition})`);
    }
    if (!stillUnder) {
      throw new Error(`${label} removed the previous page before the enter frame`);
    }
    if (depth < 2) {
      throw new Error(`${label} did not schedule the double frame (${depth})`);
    }
  } finally {
    globalThis.requestAnimationFrame = previous;
    globalThis.cancelAnimationFrame = previousCancel;
    if (globalThis.window) {
      globalThis.window.requestAnimationFrame = previous;
      globalThis.window.cancelAnimationFrame = previousCancel;
    }
  }
}

const rootEl = dom.document.createElement("div");
dom.document.body.appendChild(rootEl);
const root = createRoot(rootEl);

async function renderNonce(nonce) {
  traces.length = 0;
  await act(async () => {
    root.render(React.createElement(harness.TransitionRuntimeHarness, { nonce }));
  });
}

try {
  harness.setRuntimeMockUser(null);
  await renderNonce(0);
  summarize("flag on profile before user");
  traces.length = 0;
  await act(async () => {
    harness.setRuntimeMockUser({
      id: "user-1",
      username: "josh",
      profileImage: null,
      avatarUrl: null,
      level: 1,
      currentXP: 0,
      memberSince: "2024-01-01T00:00:00.000Z",
    });
  });
  summarize("flag on profile user arrived");
  if (dom.document.querySelectorAll('[data-lg-nav-5a-dest="profile"]').length !== 1) {
    throw new Error("Profile did not mount once after currentUser arrived with the flag on");
  }

  const settingsButton = dom.document.querySelector('[data-testid="button-settings"]');
  if (!settingsButton) throw new Error("Profile Settings button did not mount");
  await traceHeldPush("profile-button-to-settings", "/settings", () => {
    settingsButton.dispatchEvent(new dom.MouseEvent("click", { bubbles: true }));
  });
  await traceHeldPush("settings-to-notifications", "/settings/notifications");
  await go("/profile");

  await go("/settings");
  summarize("flag on /settings");
  if (!dom.document.querySelector('[data-settings-stack="on"]')) {
    throw new Error("Settings transition stack did not mount");
  }
  const profileUnderlay = dom.document.querySelector('[data-settings-stack="underlay"]');
  if (!profileUnderlay?.querySelector('[data-lg-nav-5a-dest="profile"]')) {
    throw new Error("Profile was not retained underneath Settings");
  }
  if (dom.document.querySelectorAll('[data-lg-nav-5a-dest="profile"]').length !== 1) {
    throw new Error("Profile mounted more than once under Settings");
  }
  const profileNode = dom.document.querySelector('[data-lg-nav-5a-dest="profile"]');
  profileNode.dataset.stackInstance = "profile-1";
  await go("/settings/notifications");
  summarize("flag on push notifications");
  if (!dom.document.querySelector('[data-settings-stack="foreground"]')) {
    throw new Error("Allowlisted settings push did not mount a foreground layer");
  }
  const retainedProfile = dom.document.querySelector('[data-settings-stack="retained"]');
  if (retainedProfile?.querySelector('[data-lg-nav-5a-dest="profile"]')?.dataset.stackInstance !== "profile-1") {
    throw new Error("Profile was not kept as the same retained instance under Notifications");
  }
  if (!dom.document.querySelector('[data-settings-stack="underlay"]')) {
    throw new Error("Allowlisted settings push did not keep Settings mounted");
  }
  await go("/settings");
  summarize("flag on pop notifications to settings");
  const profileUnderSettings = dom.document.querySelector('[data-settings-stack="underlay"] [data-lg-nav-5a-dest="profile"]');
  if (profileUnderSettings?.dataset.stackInstance !== "profile-1") {
    throw new Error("Profile was not the same underlay instance after Notifications popped");
  }
  await go("/profile");
  summarize("flag on pop to profile");
  if (dom.document.querySelector('[data-lg-nav-5a-dest="profile"]')?.dataset.stackInstance !== "profile-1") {
    throw new Error("Profile remounted on the second back");
  }
  if (dom.document.querySelector('[data-settings-stack="underlay"]')) {
    throw new Error("Popping to Profile kept a stale underlay");
  }
  assertProfileForeground("notifications chain");

  const profileForScroll = dom.document.querySelector('[data-lg-nav-5a-dest="profile"]');
  let scrollWrites = 0;
  let scrollValue = 240;
  Object.defineProperty(profileForScroll, "scrollTop", {
    configurable: true,
    get() {
      return scrollValue;
    },
    set(next) {
      scrollWrites += 1;
      scrollValue = Number(next) || 0;
    },
  });
  await act(async () => {
    harness.setRuntimeMockUser({
      id: "user-1",
      username: "josh",
      profileImage: null,
      avatarUrl: null,
      level: 1,
      currentXP: 0,
      memberSince: "2024-01-01T00:00:00.000Z",
      userType: "artist",
      verifiedArtist: true,
    });
  });
  await go("/settings");
  await go("/settings/artist");
  if (profileLayer()?.getAttribute("data-settings-stack") !== "retained") {
    throw new Error(
      `Profile was not retained behind Artist settings (${profileLayer()?.getAttribute("data-settings-stack") ?? "missing"})`,
    );
  }
  scrollWrites = 0;
  await go("/settings");
  await go("/profile");
  assertProfileForeground("artist chain");
  if (profileForScroll.dataset.stackInstance !== "profile-1") {
    throw new Error("Artist chain remounted Profile");
  }
  if (scrollWrites !== 0 || scrollValue !== 240) {
    throw new Error(`Profile scroll was rewritten on reactivation (${scrollWrites} writes, ${scrollValue})`);
  }
  await go("/settings");
  await go("/settings/artist");
  await go("/settings/artist-questions");
  scrollWrites = 0;
  await go("/settings/artist");
  await go("/settings");
  await go("/profile");
  assertProfileForeground("artist questions chain");
  if (profileForScroll.dataset.stackInstance !== "profile-1") {
    throw new Error("Questions chain remounted Profile");
  }
  if (scrollWrites !== 0 || scrollValue !== 240) {
    throw new Error(`Profile scroll was rewritten after the questions chain (${scrollWrites} writes, ${scrollValue})`);
  }

  await assertNestedSettingsPopCommits();

  console.log("\nNO THROW");
} catch (error) {
  summarize("at throw");
  console.error("THREW", error && error.stack ? error.stack : error);
  process.exitCode = 1;
} finally {
  setTimeout(() => process.exit(process.exitCode ?? 0), 20);
}
