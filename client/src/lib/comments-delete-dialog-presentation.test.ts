/**
 * COMMENT-DELETE-DIALOG-2 — Comments delete confirm overlay material.
 * Source-only: does not exercise delete mutations or sheet lifecycle.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");

const deleteDialog = commentsSrc.slice(
  commentsSrc.indexOf("<AlertDialog"),
  commentsSrc.indexOf("</AlertDialog>"),
);

describe("COMMENT-DELETE-DIALOG-2 overlay material", () => {
  it("opts the nested delete confirm into shared overlay tokens", () => {
    assert.match(deleteDialog, /APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS/);
    assert.match(deleteDialog, /APP_MATERIAL_OVERLAY_BACKDROP_CLASS/);
    assert.match(deleteDialog, /overlayClassName=\{cn\(alertDialogStackZ, APP_MATERIAL_OVERLAY_BACKDROP_CLASS\)\}/);
    assert.match(deleteDialog, /APP_MATERIAL_OVERLAY_TITLE_CLASS/);
    assert.match(deleteDialog, /APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS/);
    assert.match(deleteDialog, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS/);
    assert.match(deleteDialog, /APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS/);
  });

  it("keeps copy, test ids, and confirm/cancel wiring", () => {
    assert.match(deleteDialog, /Delete comment\?/);
    assert.match(deleteDialog, /Any replies will stay visible\./);
    assert.match(deleteDialog, /data-testid="delete-comment-confirm"/);
    assert.match(deleteDialog, /data-testid="delete-comment-cancel"/);
    assert.match(deleteDialog, /onClick=\{confirmDeleteComment\}/);
  });

  it("does not restyle the Comments Drawer with overlay/sheet tokens", () => {
    assert.match(commentsSrc, /COMMENTS_SHEET_SURFACE_CLASS/);
    assert.doesNotMatch(commentsSrc, /APP_MATERIAL_SHEET_SURFACE_CLASS/);
    assert.doesNotMatch(commentsSrc, /dubhub-app-sheet-surface/);
  });
});
