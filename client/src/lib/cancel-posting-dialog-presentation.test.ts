import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_OVERLAY_ACTION_ROW_CLASS,
  APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_DESTRUCTIVE_CTA_CLASS,
  APP_MATERIAL_OVERLAY_KEEP_EDITING_CLASS,
} from "@/lib/app-material";

const here = dirname(fileURLToPath(import.meta.url));
const trimSrc = readFileSync(join(here, "../pages/trim-video.tsx"), "utf8");
const metadataSrc = readFileSync(join(here, "../pages/submit-metadata.tsx"), "utf8");
const bottomNavSrc = readFileSync(join(here, "../components/bottom-navigation.tsx"), "utf8");
const nativeNavSrc = readFileSync(join(here, "../components/native-nav-bridge-host.tsx"), "utf8");

function cancelDialog(source: string): string {
  const start = source.indexOf("Cancel posting?");
  assert.ok(start >= 0);
  const from = source.lastIndexOf("<AlertDialog", start);
  const end = source.indexOf("</AlertDialog>", start);
  assert.ok(from >= 0 && end > from);
  return source.slice(from, end);
}

describe("cancel posting dialog presentation", () => {
  it("uses rounded destructive and filled secondary actions in Light and Dark", () => {
    assert.match(APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS, /bg-destructive/);
    assert.match(APP_MATERIAL_OVERLAY_DESTRUCTIVE_CTA_CLASS, /rounded-\[15px\]/);
    assert.match(APP_MATERIAL_OVERLAY_DESTRUCTIVE_CTA_CLASS, /h-11/);
    assert.match(APP_MATERIAL_OVERLAY_DESTRUCTIVE_CTA_CLASS, /shadow-\[inset_0_1px_0/);
    assert.match(APP_MATERIAL_OVERLAY_KEEP_EDITING_CLASS, /bg-\[#EDF2F8\]/);
    assert.match(APP_MATERIAL_OVERLAY_KEEP_EDITING_CLASS, /border-\[#DCE3EC\]/);
    assert.match(APP_MATERIAL_OVERLAY_KEEP_EDITING_CLASS, /dark:bg-white\/\[0\.1\]/);
    assert.match(APP_MATERIAL_OVERLAY_KEEP_EDITING_CLASS, /dark:border-white\/20/);
    assert.match(APP_MATERIAL_OVERLAY_KEEP_EDITING_CLASS, /rounded-\[15px\]/);
    assert.match(APP_MATERIAL_OVERLAY_ACTION_ROW_CLASS, /gap-2\.5/);
  });

  for (const [name, source, confirm] of [
    ["trim", trimSrc, "void handleCancelPost()"],
    ["metadata", metadataSrc, "void handleCancelPost()"],
    ["bottom nav", bottomNavSrc, "void handleConfirmCancelFromNav()"],
    ["native nav", nativeNavSrc, "cancelPostAndReturnToHome"],
  ] as const) {
    it(`${name} keeps copy, order, and the existing confirm handler`, () => {
      const dialog = cancelDialog(source);
      const keep = dialog.indexOf("Keep editing");
      const cancel = dialog.indexOf("Cancel post", keep + 1);
      assert.ok(keep >= 0 && cancel > keep);
      assert.match(dialog, /Your current clip and edits will be discarded\./);
      assert.match(dialog, /APP_MATERIAL_OVERLAY_KEEP_EDITING_CLASS/);
      assert.match(dialog, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS/);
      assert.match(dialog, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_CTA_CLASS/);
      assert.match(dialog, /APP_MATERIAL_OVERLAY_ACTION_ROW_CLASS/);
      assert.match(dialog, new RegExp(confirm.replace(/[()]/g, "\\$&")));
    });
  }
});
