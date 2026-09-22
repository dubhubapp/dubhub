/**
 * VAT-ANON-3.4 — superseded by 3.5 (modal remount was the real flash cause).
 * Retained as a pointer so old suite names still resolve in local runs.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dialogSrc = readFileSync(
  join(here, "../components/artist-verification-dialog.tsx"),
  "utf8",
);

describe("VAT-ANON-3.4 → 3.5 supersession", () => {
  it("no longer toggles Radix modal or freezes scroll (3.5 contract)", () => {
    assert.doesNotMatch(dialogSrc, /modal=\{!vatPaywallCovering\}/);
    assert.doesNotMatch(dialogSrc, /scrollTopBeforePaywallRef/);
    assert.doesNotMatch(dialogSrc, /freezeScroll/);
    assert.match(dialogSrc, /opacity-0/);
    assert.match(dialogSrc, /vatPaywallCovering/);
  });
});
