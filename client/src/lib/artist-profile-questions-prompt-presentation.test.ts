/**
 * Quick one profile prompt — presentation contracts (Pass B).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_COMPACT_ACTION_PRIMARY_CLASS,
  APP_MATERIAL_COMPACT_ACTION_SECONDARY_CLASS,
  APP_MATERIAL_FIELD_CLASS,
} from "./app-material";
import { INPUT_LIMITS } from "@shared/input-limits";

const here = dirname(fileURLToPath(import.meta.url));
const promptSrc = readFileSync(join(here, "../components/artist-profile-questions-prompt.tsx"), "utf8");

describe("artist profile questions prompt presentation", () => {
  it("uses white Sparkles / success icons with no turquoise accent", () => {
    assert.match(promptSrc, /Sparkles className="mt-0\.5 h-4 w-4 shrink-0 text-white"/);
    assert.match(promptSrc, /CheckCircle2 className="mt-0\.5 h-4 w-4 shrink-0 text-white"/);
    assert.doesNotMatch(promptSrc, /#4ae9df/);
  });

  it("applies app-material field + compact action tokens", () => {
    assert.match(promptSrc, /APP_MATERIAL_FIELD_CLASS/);
    assert.match(promptSrc, /APP_MATERIAL_COMPACT_ACTION_PRIMARY_CLASS/);
    assert.match(promptSrc, /APP_MATERIAL_COMPACT_ACTION_SECONDARY_CLASS/);
    assert.equal(APP_MATERIAL_FIELD_CLASS.includes("dubhub-app-field"), true);
    assert.match(APP_MATERIAL_COMPACT_ACTION_PRIMARY_CLASS, /bg-\[#0a83ff\]\/10/);
    assert.match(APP_MATERIAL_COMPACT_ACTION_SECONDARY_CLASS, /dark:bg-white\/\[0\.055\]/);
  });

  it("preserves textarea min-height, 280 limit, and bare section shell", () => {
    assert.match(promptSrc, /min-h-\[72px\] text-sm/);
    assert.match(promptSrc, /INPUT_LIMITS\.artistProfileAnswer/);
    assert.equal(INPUT_LIMITS.artistProfileAnswer, 280);
    assert.doesNotMatch(promptSrc, /dubhub-app-toast-surface|dubhub-app-sheet-surface|dubhub-app-overlay-surface/);
    assert.match(promptSrc, /data-testid="artist-profile-questions-prompt"/);
  });
});
