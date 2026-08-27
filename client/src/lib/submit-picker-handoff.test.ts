import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  NATIVE_PICKER_OPEN_DELAY_MS,
  SUBMIT_PICKER_CLOSE_FALLBACK_MS,
  inputForPendingPickerSource,
  takePendingPickerSource,
} from "./submit-picker-handoff";

const here = dirname(fileURLToPath(import.meta.url));
const handoffSrc = readFileSync(join(here, "./submit-picker-handoff.ts"), "utf8");
const drawerSrc = readFileSync(join(here, "../components/submit-clip-drawer.tsx"), "utf8");

function sliceFn(src: string, startToken: string, endToken: string): string {
  const start = src.indexOf(startToken);
  const end = src.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `slice ${startToken}`);
  return src.slice(start, end);
}

describe("SUBMIT-MEDIA-4 picker 280ms handoff with safe covering finalisation", () => {
  it("stores pending gallery/camera source and consumes it once", () => {
    const pending: { current: "gallery" | "camera" | null } = { current: "gallery" };
    assert.equal(takePendingPickerSource(pending), "gallery");
    assert.equal(takePendingPickerSource(pending), null);
    pending.current = "camera";
    assert.equal(takePendingPickerSource(pending), "camera");
    assert.equal(takePendingPickerSource(pending), null);
  });

  it("maps gallery and camera to the matching hidden inputs", () => {
    const gallery = { id: "gallery" } as HTMLInputElement;
    const camera = { id: "camera" } as HTMLInputElement;
    assert.equal(inputForPendingPickerSource("gallery", { gallery, camera }), gallery);
    assert.equal(inputForPendingPickerSource("camera", { gallery, camera }), camera);
  });

  it("launches the native picker at 280ms + double rAF, not after 800ms fallback", () => {
    assert.equal(NATIVE_PICKER_OPEN_DELAY_MS, 280);
    assert.equal(SUBMIT_PICKER_CLOSE_FALLBACK_MS, 800);
    assert.match(
      drawerSrc,
      /Capacitor\.isNativePlatform\(\)\s*\n\s*\? NATIVE_PICKER_OPEN_DELAY_MS/,
    );
    assert.match(
      drawerSrc,
      /window\.setTimeout\(runHandoff, NATIVE_PICKER_OPEN_DELAY_MS_RUNTIME\)/,
    );
    const handoffFn = sliceFn(drawerSrc, "const handoffPendingPicker", "const requestPickerAfterClose");
    assert.match(handoffFn, /finalizeSubmitClipClose\(\)/);
    assert.match(handoffFn, /openNativePicker\(source\)/);
    const fallbackAssign = drawerSrc.slice(
      drawerSrc.indexOf("pickerCloseFallbackTimerRef.current = window.setTimeout"),
      drawerSrc.indexOf("SUBMIT_PICKER_CLOSE_FALLBACK_MS)") + 40,
    );
    assert.match(fallbackAssign, /finalizeSubmitClipClose\(\)/);
    assert.doesNotMatch(fallbackAssign, /openNativePicker/);
    const openFn = sliceFn(drawerSrc, "const openNativePicker", "const handoffPendingPicker");
    assert.match(
      openFn,
      /requestAnimationFrame\(\(\) => \{\s*requestAnimationFrame\(\(\) => \{/,
    );
    assert.match(openFn, /input\?\.click\(\)/);
  });

  it("finalises covering before input.click", () => {
    const handoffFn = sliceFn(drawerSrc, "const handoffPendingPicker", "const requestPickerAfterClose");
    const finalizeIdx = handoffFn.indexOf("finalizeSubmitClipClose()");
    const launchIdx = handoffFn.indexOf("openNativePicker(source)");
    assert.ok(finalizeIdx >= 0 && launchIdx > finalizeIdx);
    const openFn = sliceFn(drawerSrc, "const openNativePicker", "const handoffPendingPicker");
    const consumeIdx = openFn.indexOf("takePendingPickerSource");
    const clickIdx = openFn.indexOf("input?.click()");
    assert.ok(consumeIdx >= 0 && clickIdx > consumeIdx);
    assert.match(drawerSrc, /completeSubmitClipClose\(\)/);
  });

  it("cannot double-launch from later Vaul completion or fallback", () => {
    assert.match(drawerSrc, /if \(closeFinalizedRef\.current\) return;/);
    assert.match(drawerSrc, /if \(pickerLaunchStartedRef\.current\) return;/);
    assert.match(drawerSrc, /takePendingPickerSource\(pendingPickerSourceRef\)/);
    assert.match(
      drawerSrc,
      /onAnimationEnd=\{\(open\) => \{\s*if \(!open\) finalizeSubmitClipClose\(\);/,
    );
    const animationEnd = sliceFn(drawerSrc, "onAnimationEnd={", "shouldScaleBackground");
    assert.doesNotMatch(animationEnd, /openNativePicker/);
    assert.match(drawerSrc, /if \(pendingPickerSourceRef\.current\) return;/);
  });

  it("does not need a picker cancel/change callback to restore covering or native nav", () => {
    const cancelBlock = sliceFn(
      drawerSrc,
      "const onCaptureCancel",
      "captureEl?.addEventListener",
    );
    assert.doesNotMatch(cancelBlock, /completeSubmitClipClose|finalizeSubmitClipClose/);
    const changeFn = sliceFn(drawerSrc, "const onPickChange", "const openNativePicker");
    assert.doesNotMatch(changeFn, /completeSubmitClipClose|finalizeSubmitClipClose/);
  });

  it("keeps a normal Submit close without picker and the existing file-selection flow", () => {
    assert.match(drawerSrc, /onOpenChange=\{\(open\) => \{\s*if \(!open\) closeSubmitClip\(\);/);
    assert.match(drawerSrc, /onAnimationEnd=\{\(open\) => \{\s*if \(!open\) finalizeSubmitClipClose\(\);/);
    assert.match(drawerSrc, /const handleFileSelect = useCallback/);
    assert.match(drawerSrc, /accept="video\/\*"/);
    assert.match(drawerSrc, /capture="environment"/);
    assert.match(drawerSrc, /setLocation\("\/trim-video"\)/);
    assert.match(drawerSrc, /localStorage\.setItem\("dubhub-trim-source"/);
    assert.doesNotMatch(drawerSrc, /Camera\.getPhoto|@capacitor\/camera|PHPicker/);
  });

  it("does not log Submit picker timing or userActivation diagnostics", () => {
    assert.doesNotMatch(drawerSrc, /SubmitPicker\]\[timing/);
    assert.doesNotMatch(drawerSrc, /userActivation/);
    assert.doesNotMatch(handoffSrc, /console\.log/);
  });
});
