/**
 * Release Links Management V2B — LIST/ADD/EDIT views, visibility copy, reorder.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { RELEASE_LINKS_VISIBILITY_COPY } from "@/lib/release-links-visibility-copy";
import {
  assignCatalogSortOrders,
  compareReleaseLinkPlatformsForBackfill,
  orderReleaseLinksForDisplay,
} from "@shared/release-link-sort-order";
import {
  validateReleaseLinkReorderPayload,
  ReleaseLinkReorderError,
} from "../../../server/reorder-release-links";

const here = dirname(fileURLToPath(import.meta.url));
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const linksSrc = readFileSync(
  join(here, "../components/release-links-sheet.tsx"),
  "utf8",
);
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const feedSrc = readFileSync(
  join(here, "../components/release-feed-card.tsx"),
  "utf8",
);
const migrationSrc = readFileSync(
  join(
    here,
    "../../../supabase/migrations/20260924160000_release_links_sort_order.sql",
  ),
  "utf8",
);
const storageSrc = readFileSync(
  join(here, "../../../server/storage.ts"),
  "utf8",
);
const upsertSrc = readFileSync(
  join(here, "../../../server/upsert-release-link-with-limit.ts"),
  "utf8",
);
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");
const platformsSrc = readFileSync(join(here, "platforms.ts"), "utf8");

describe("Links UX — LIST / ADD / EDIT", () => {
  it("LIST does not permanently show Add form; + Add link enters ADD", () => {
    assert.match(linksSrc, /view === "list"/);
    assert.match(linksSrc, /data-testid="release-links-enter-add"/);
    assert.match(linksSrc, /setView\("add"\)/);
    assert.match(linksSrc, /showDone=\{view === "list" && panel === "form"\}/);
    assert.doesNotMatch(
      linksSrc,
      /view === "list"[\s\S]{0,400}release-link-platform-picker/,
    );
  });

  it("ADD Back and successful Add return LIST; Done not under form", () => {
    assert.match(linksSrc, /release-links-sheet-cancel-add/);
    assert.match(linksSrc, /resetToList/);
    assert.match(linksSrc, /onAddLink\(\)/);
    assert.match(linksSrc, /setView\("list"\)/);
    assert.match(linksSrc, /showDone=\{view === "list" && panel === "form"\}/);
  });

  it("row tap enters EDIT; Save returns LIST; Trash removed from list", () => {
    assert.match(linksSrc, /setView\("edit"\)/);
    assert.match(linksSrc, /release-link-save-changes/);
    assert.match(linksSrc, /data-testid="release-link-delete"/);
    assert.doesNotMatch(linksSrc, /Trash2/);
    assert.match(linksSrc, /GripVertical/);
    assert.match(linksSrc, /release-link-row-grip-/);
  });
});

describe("Visibility copy", () => {
  it("no Info icon; no Link saved ·; exact visibility copy", () => {
    assert.equal(
      RELEASE_LINKS_VISIBILITY_COPY,
      "Listening links become visible when the release is out. Pre-save, pre-add and pre-order links can appear before release day.",
    );
    assert.match(linksSrc, /RELEASE_LINKS_VISIBILITY_COPY/);
    assert.match(linksSrc, /data-testid="release-links-visibility-copy"/);
    assert.doesNotMatch(linksSrc, /StatInfoPopover/);
    assert.doesNotMatch(linksSrc, /Link saved/);
    assert.doesNotMatch(linksSrc, /LISTENING_LINK_FUTURE_GUIDANCE/);
  });
});

describe("sort_order schema + backfill", () => {
  it("migration adds sort_order, backfills catalog order, indexes", () => {
    assert.match(migrationSrc, /ADD COLUMN IF NOT EXISTS sort_order integer/);
    assert.match(migrationSrc, /SET NOT NULL/);
    assert.match(migrationSrc, /release_links_release_id_sort_order_idx/);
    assert.match(migrationSrc, /WHEN 'spotify' THEN 0/);
    assert.match(migrationSrc, /WHEN 'apple_music' THEN 1/);
    assert.match(migrationSrc, /WHEN 'other' THEN 11/);
  });

  it("catalog backfill helper is deterministic", () => {
    const links = [
      { platform: "other", url: "o" },
      { platform: "spotify", url: "s" },
      { platform: "juno", url: "j" },
      { platform: "beatport", url: "b" },
    ];
    const ordered = assignCatalogSortOrders(links);
    assert.deepEqual(
      ordered.map((l) => l.platform),
      ["spotify", "beatport", "other", "juno"],
    );
    assert.deepEqual(
      ordered.map((l) => l.sortOrder),
      [0, 1, 2, 3],
    );
    assert.ok(compareReleaseLinkPlatformsForBackfill("spotify", "apple_music") < 0);
  });

  it("orderReleaseLinksForDisplay prefers sort_order over catalog", () => {
    const ordered = orderReleaseLinksForDisplay([
      { platform: "spotify", sortOrder: 1 },
      { platform: "beatport", sortOrder: 0 },
    ]);
    assert.deepEqual(
      ordered.map((l) => l.platform),
      ["beatport", "spotify"],
    );
  });
});

describe("Reorder endpoint validation", () => {
  it("rejects duplicates, foreign IDs, incomplete set", () => {
    assert.throws(
      () =>
        validateReleaseLinkReorderPayload({
          linkIds: ["a", "a"],
          existingIds: ["a", "b"],
        }),
      (err: unknown) =>
        err instanceof ReleaseLinkReorderError && err.code === "DUPLICATE_LINK_IDS",
    );
    assert.throws(
      () =>
        validateReleaseLinkReorderPayload({
          linkIds: ["a", "c"],
          existingIds: ["a", "b"],
        }),
      (err: unknown) =>
        err instanceof ReleaseLinkReorderError && err.code === "FOREIGN_LINK_ID",
    );
    assert.throws(
      () =>
        validateReleaseLinkReorderPayload({
          linkIds: ["a"],
          existingIds: ["a", "b"],
        }),
      (err: unknown) =>
        err instanceof ReleaseLinkReorderError && err.code === "INCOMPLETE_LINK_SET",
    );
    const ok = validateReleaseLinkReorderPayload({
      linkIds: ["b", "a"],
      existingIds: ["a", "b"],
    });
    assert.deepEqual(ok, ["b", "a"]);
  });

  it("routes expose PUT /api/releases/:id/links/order", () => {
    assert.match(routesSrc, /\/api\/releases\/:id\/links\/order/);
    assert.match(routesSrc, /reorderReleaseLinks/);
    assert.match(routesSrc, /canManageRelease/);
  });
});

describe("Server read + append order", () => {
  it("reads ORDER BY sort_order ASC, platform ASC", () => {
    assert.match(storageSrc, /ORDER BY sort_order ASC, platform ASC/);
    assert.match(upsertSrc, /ORDER BY sort_order ASC, platform ASC/);
    assert.doesNotMatch(
      storageSrc.slice(storageSrc.indexOf("async getReleaseLinks")),
      /ORDER BY platform\n/,
    );
  });

  it("new inserts append via nextSortOrder / MAX+1", () => {
    assert.match(upsertSrc, /nextSortOrder/);
    assert.match(upsertSrc, /MAX\(sort_order\)/);
    assert.match(upsertSrc, /sort_order, created_at/);
    assert.match(createSrc, /sortOrder: links\.length/);
    assert.match(editSrc, /sortOrder: links\.length/);
  });
});

describe("Client catalog re-sort removals", () => {
  it("public consumers do not re-sort with sortLinksByPlatform", () => {
    assert.doesNotMatch(detailSrc, /sortLinksByPlatform/);
    assert.doesNotMatch(feedSrc, /sortLinksByPlatform/);
    assert.doesNotMatch(linksSrc, /sortLinksByPlatform/);
    assert.match(platformsSrc, /sortLinksByPlatform/);
    assert.match(platformsSrc, /Prefer API \/ draft array order/);
  });

  it("edit persists draft order after sync", () => {
    assert.match(editSrc, /\/links\/order/);
    assert.match(editSrc, /handleReorderDraftLinks/);
    assert.match(createSrc, /handleReorderDraftLinks/);
  });
});

describe("Drag + haptic + VAT non-regression", () => {
  it("only grip initiates reorder; row body edits", () => {
    assert.match(linksSrc, /setActivatorNodeRef/);
    assert.match(linksSrc, /data-vaul-no-drag/);
    assert.match(linksSrc, /release-link-row-edit-/);
    assert.match(linksSrc, /playInteractionLightThrottled/);
    assert.match(linksSrc, /lastOverIndexRef/);
  });

  it("vertical-only modifier + opaque drag surface", () => {
    assert.match(linksSrc, /restrictToVerticalAxis/);
    assert.match(linksSrc, /modifiers=\{\[restrictToVerticalAxis\]\}/);
    assert.match(linksSrc, /rounded-md bg-\[rgb\(20,26,48\)\]/);
    assert.doesNotMatch(linksSrc, /APP_MATERIAL_OVERLAY_SURFACE_CLASS/);
    assert.doesNotMatch(linksSrc, /bg-white\/\[0\.06\]/);
  });

  it("edit VAT gate still uses !linkUnlimited && isPaidOnlyReleaseLink", () => {
    assert.match(
      editSrc,
      /!linkUnlimited && isPaidOnlyReleaseLink\(linkPlatform, purpose\)/,
    );
    assert.match(
      createSrc,
      /!linkUnlimited && isPaidOnlyReleaseLink\(linkPlatform, purpose\)/,
    );
    assert.match(editSrc, /:\s*boolean\s*=>/);
    assert.match(createSrc, /handleUpdateDraftLink = \(\): boolean/);
  });

  it("failed persist restores previous order", () => {
    assert.match(editSrc, /const previous = draftLinks/);
    assert.match(editSrc, /setDraftLinks\(previous\)/);
    assert.match(editSrc, /Couldn't save link order/);
  });
});
