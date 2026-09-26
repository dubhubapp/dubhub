import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(join(here, "./use-ios-keyboard-aware-scroll.ts"), "utf8");
const releaseDrawerSrc = readFileSync(
  join(here, "../components/release-form-drawer.tsx"),
  "utf8",
);
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const sheetSrc = readFileSync(
  join(here, "../components/subscription-cancellation-feedback-sheet.tsx"),
  "utf8",
);

describe("iOS keyboard aware scroll", () => {
  it("keeps the original center scroll for release drawers and leaves comments alone", () => {
    assert.match(hookSrc, /scrollDelayMs = 120/);
    assert.match(
      hookSrc,
      /scrollIntoView\(\{ block: "center", inline: "nearest", behavior: "smooth" \}\)/,
    );
    assert.match(hookSrc, /Keyboard\.addListener\("keyboardWillShow"/);
    assert.match(hookSrc, /Keyboard\.addListener\("keyboardDidShow"/);
    assert.doesNotMatch(
      hookSrc,
      /scrollOnFocus|scrollOnWillShow|scrollOnDidShow|scrollBehavior|scrollBlock|scrollOnViewportResizeAfterKeyboardShow|armPostResizeReveal|evaluatePostResizeReveal/,
    );

    const releaseCall = releaseDrawerSrc.slice(
      releaseDrawerSrc.indexOf("useIosKeyboardAwareScroll({"),
      releaseDrawerSrc.indexOf("useIosKeyboardAwareScroll({") + 160,
    );
    assert.match(releaseCall, /scrollContainerRef: scrollRef/);
    assert.doesNotMatch(releaseCall, /scrollBlock|scrollOnDidShow|scrollBehavior/);

    assert.match(commentsSrc, /repositionInputs=\{false\}/);
    assert.match(commentsSrc, /KeyboardResize\.None/);
    assert.match(commentsSrc, /bottom 0\.5s cubic-bezier\(0\.32, 0\.72, 0, 1\)/);
    assert.doesNotMatch(sheetSrc, /useIosKeyboardAwareScroll/);
  });
});
