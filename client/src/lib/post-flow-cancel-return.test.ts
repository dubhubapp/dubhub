import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { clearDubhubTrimSession } from "@/lib/dubhub-trim-session";
import { saveHomeFeedSession } from "@/lib/home-feed-session";

const here = dirname(fileURLToPath(import.meta.url));
const postFlowSrc = readFileSync(join(here, "./post-flow.ts"), "utf8");
const trimSrc = readFileSync(join(here, "../pages/trim-video.tsx"), "utf8");
const metadataSrc = readFileSync(join(here, "../pages/submit-metadata.tsx"), "utf8");
const bottomNavSrc = readFileSync(join(here, "../components/bottom-navigation.tsx"), "utf8");
const nativeNavSrc = readFileSync(join(here, "../components/native-nav-bridge-host.tsx"), "utf8");

const HOME_SESSION_KEY = "dubhub:home-feed-session:v1";
const MEDIA_EPOCH_KEY = "dubhub_home_media_epoch";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
}

const session = memoryStorage();
const local = memoryStorage();
const previousWindow = globalThis.window;
const previousSession = globalThis.sessionStorage;
const previousLocal = globalThis.localStorage;

globalThis.sessionStorage = session as unknown as Storage;
globalThis.localStorage = local as unknown as Storage;
globalThis.window = {
  sessionStorage: session,
  localStorage: local,
  setTimeout: globalThis.setTimeout.bind(globalThis),
} as unknown as Window & typeof globalThis;

afterEach(() => {
  session.clear();
  local.clear();
});

function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `missing end after ${start}`);
  return source.slice(from, to);
}

function cancelReturnHelperSource(): string {
  const helperStart = postFlowSrc.indexOf("export async function cancelPostAndReturnToHome");
  assert.ok(helperStart >= 0);
  return postFlowSrc.slice(helperStart);
}

describe("cancel post returns to the existing Home session", () => {
  it("keeps the Home snapshot and media epoch while draft cleanup still runs", () => {
    saveHomeFeedSession({
      sortMode: "newest",
      selectedGenres: ["drum-and-bass"],
      selectedSubgenresByGenre: {},
      identificationFilter: "all",
      activePostId: "post-42",
      scrollTop: 2400,
    });
    session.setItem(MEDIA_EPOCH_KEY, "4");
    local.setItem("dubhub-submit-metadata-draft", "{\"title\":\"draft\"}");
    local.setItem(
      "dubhub-trim-state",
      JSON.stringify({ videoUrl: "blob:https://localhost/trim-source" }),
    );
    local.setItem(
      "dubhub-trim-thumbnail",
      JSON.stringify({ thumbnailUri: "blob:https://localhost/thumb" }),
    );
    local.setItem("dubhub-native-trim-output", "{\"uri\":\"file://tmp/export.mp4\"}");
    local.setItem("dubhub-trim-export", JSON.stringify({ videoUrl: "blob:https://localhost/export" }));
    local.setItem("dubhub-native-post-artifact", JSON.stringify({ videoUrl: "blob:https://localhost/artifact" }));

    const helper = cancelReturnHelperSource();
    assert.match(helper, /cancelDubhubPostFlow\(\)/);
    assert.doesNotMatch(helper, /clearHomeFeedSession|bumpDubhubHomeMediaEpoch/);
    local.removeItem("dubhub-submit-metadata-draft");
    clearDubhubTrimSession();

    assert.equal(session.data.has(HOME_SESSION_KEY), true);
    const saved = JSON.parse(session.getItem(HOME_SESSION_KEY) ?? "{}") as {
      activePostId?: string;
      scrollTop?: number;
    };
    assert.equal(saved.activePostId, "post-42");
    assert.equal(saved.scrollTop, 2400);
    assert.equal(session.getItem(MEDIA_EPOCH_KEY), "4");
    assert.equal(local.getItem("dubhub-submit-metadata-draft"), null);
    assert.equal(local.getItem("dubhub-trim-state"), null);
    assert.equal(local.getItem("dubhub-trim-thumbnail"), null);
    assert.equal(local.getItem("dubhub-trim-export"), null);
    assert.equal(local.getItem("dubhub-native-trim-output"), null);
    assert.equal(local.getItem("dubhub-native-post-artifact"), null);
  });

  it("soft-navigates home and does not reload the document or bump the media epoch", () => {
    const helper = cancelReturnHelperSource();
    const cleanup = sliceBetween(postFlowSrc, "export function cancelDubhubPostFlow", "export async function cancelPostAndReturnToHome");
    assert.doesNotMatch(helper, /clearHomeFeedSession/);
    assert.doesNotMatch(helper, /bumpDubhubHomeMediaEpoch/);
    assert.doesNotMatch(helper, /window\.location|location\.replace|location\.assign|document\.location|history\.go/);
    assert.match(helper, /navigateHome\(\)/);
    assert.match(helper, /disposeTrimExportResources\(`cancel-return:\$\{reason\}`\)/);
    assert.match(cleanup, /localStorage\.removeItem\("dubhub-submit-metadata-draft"\)/);
    assert.match(cleanup, /clearDubhubTrimSession\(\)/);
    assert.match(cleanup, /disposeTrimExportResources\("cancel-post-flow"\)/);
    assert.doesNotMatch(postFlowSrc, /cancelPostAndHardResetToHome/);
    assert.doesNotMatch(postFlowSrc, /window\.location\.replace/);
    assert.doesNotMatch(postFlowSrc, /clearHomeFeedSession/);
  });
});

describe("cancel call sites use the soft return", () => {
  const trimCancel = sliceBetween(trimSrc, "const handleCancelPost", "const formatTime");
  const trimBack = sliceBetween(trimSrc, "const handleBack = ()", "const handleCancelPost");
  const metadataCancel = sliceBetween(metadataSrc, "const handleCancelPost", "const watched = form.watch()");
  const metadataBack = sliceBetween(metadataSrc, "const handleBack = ()", "const handleCancelPost");
  const navCancel = sliceBetween(
    bottomNavSrc,
    "const handleConfirmCancelFromNav",
    "useLayoutEffect",
  );
  const nativeCancel = sliceBetween(
    nativeNavSrc,
    "void cancelPostAndReturnToHome",
    "Cancel post",
  );

  it("Trim Cancel soft-returns and Trim Back still opens /submit", () => {
    assert.match(trimCancel, /cancelPostAndReturnToHome\(\{/);
    assert.match(trimCancel, /reason:\s*"trim-cancel-post"/);
    assert.match(trimCancel, /navigateHome:\s*\(\)\s*=>\s*setLocation\("\/"\)/);
    assert.doesNotMatch(trimCancel, /window\.location|cancelPostAndHardResetToHome/);
    assert.match(trimBack, /setLocation\("\/submit"\)/);
    assert.doesNotMatch(trimBack, /cancelPostAndReturnToHome/);
  });

  it("Track details Cancel soft-returns and Back still returns to Trim", () => {
    assert.match(metadataCancel, /cancelPostAndReturnToHome\(\{/);
    assert.match(metadataCancel, /reason:\s*"submit-details-cancel-post"/);
    assert.match(metadataCancel, /navigateHome:\s*\(\)\s*=>\s*setLocation\("\/"\)/);
    assert.match(metadataCancel, /abortActiveUpload\("submit-details-cancel"\)/);
    assert.doesNotMatch(metadataCancel, /window\.location|cancelPostAndHardResetToHome/);
    assert.match(metadataBack, /setLocation\("\/trim-video"\)/);
    assert.doesNotMatch(metadataBack, /cancelPostAndReturnToHome/);
  });

  it("Home tab cancel from the web and native bars uses the same soft return", () => {
    assert.match(navCancel, /cancelPostAndReturnToHome\(\{/);
    assert.match(navCancel, /reason:\s*"bottom-nav-cancel-post"/);
    assert.match(navCancel, /navigateHome:\s*\(\)\s*=>\s*navigate\("\/"\)/);
    assert.doesNotMatch(navCancel, /window\.location|cancelPostAndHardResetToHome/);
    assert.match(nativeCancel, /reason:\s*"bottom-nav-cancel-post"/);
    assert.match(nativeCancel, /navigateHome:\s*\(\)\s*=>\s*navigate\("\/"\)/);
    assert.doesNotMatch(nativeNavSrc, /cancelPostAndHardResetToHome|window\.location\.replace/);
    assert.doesNotMatch(bottomNavSrc, /cancelPostAndHardResetToHome|window\.location\.replace/);
  });

  it("successful upload still deep-links to the new post", () => {
    assert.match(
      metadataSrc,
      /setLocation\(`\/\?post=\$\{encodeURIComponent\(newPostId\)\}&sort=newest`\)/,
    );
    assert.doesNotMatch(metadataCancel, /sort=newest|newPostId/);
  });
});

process.on("exit", () => {
  globalThis.window = previousWindow;
  globalThis.sessionStorage = previousSession;
  globalThis.localStorage = previousLocal;
});
