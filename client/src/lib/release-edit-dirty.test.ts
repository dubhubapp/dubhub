/**
 * Edit Release — hydration summaries, dirty snapshot, back/save destinations.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { defaultMidnightDraft, enableExactDraft } from "@/lib/release-timing-draft";
import { mergeReleasePatchIntoDetail } from "@/lib/release-edit-patch";
import {
  buildReleaseEditSnapshot,
  editBackDecision,
  hasUnsavedReleaseEditChanges,
  resolveEditAttachedSummaryCount,
  resolveEditLinksSummarySource,
  resolveReleaseEditExitPath,
  type ReleaseEditSnapshot,
} from "@/lib/release-edit-dirty";

const here = dirname(fileURLToPath(import.meta.url));
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const thumbSrc = readFileSync(join(here, "../components/release-artwork-thumb.tsx"), "utf8");
const attachSrc = readFileSync(
  join(here, "../components/release-attach-posts-section.tsx"),
  "utf8",
);
const linksSrc = readFileSync(
  join(here, "../components/release-links-sheet.tsx"),
  "utf8",
);

function baseSnapshot(
  overrides: Partial<ReleaseEditSnapshot> = {},
): ReleaseEditSnapshot {
  return buildReleaseEditSnapshot({
    title: "Night Bus",
    artworkPath: "art/night.jpg",
    comingSoon: false,
    releaseDate: "2026-10-31",
    timingDraft: defaultMidnightDraft(),
    draftLinks: [
      { platform: "spotify", url: "https://open.spotify.com/a", linkType: null },
      { platform: "apple", url: "https://music.apple.com/a", linkType: "pre_save" },
      { platform: "soundcloud", url: "https://soundcloud.com/a", linkType: null },
      { platform: "youtube", url: "https://youtube.com/a", linkType: null },
      { platform: "bandcamp", url: "https://bandcamp.com/a", linkType: null },
    ],
    selectedPostIds: ["post-1"],
    stagedCollaboratorIds: [],
    ...overrides,
  });
}

describe("Edit Links / Attached summary hydration", () => {
  it("uses release.links before drafts hydrate (5 links, no drawer)", () => {
    const releaseLinks = Array.from({ length: 5 }, (_, i) => ({
      platform: `p${i}`,
    }));
    const source = resolveEditLinksSummarySource({
      draftLinks: [],
      releaseLinks,
      draftsHydrated: false,
    });
    assert.equal(source.length, 5);
    assert.equal(source, releaseLinks);
  });

  it("uses draftLinks after hydrate even when empty (user cleared)", () => {
    const source = resolveEditLinksSummarySource({
      draftLinks: [],
      releaseLinks: [{ platform: "spotify" }],
      draftsHydrated: true,
    });
    assert.equal(source.length, 0);
  });

  it("attached summary uses release.postIds before hydrate (1 post)", () => {
    assert.equal(
      resolveEditAttachedSummaryCount({
        selectedPostIds: [],
        releasePostIds: ["post-1"],
        draftsHydrated: false,
      }),
      1,
    );
  });

  it("attached summary uses selectedPostIds after hydrate", () => {
    assert.equal(
      resolveEditAttachedSummaryCount({
        selectedPostIds: ["a", "b"],
        releasePostIds: ["post-1"],
        draftsHydrated: true,
      }),
      2,
    );
  });

  it("edit page wires summary helpers; attach accepts rowSummaryCount", () => {
    assert.match(editSrc, /resolveEditLinksSummarySource/);
    assert.match(editSrc, /resolveEditAttachedSummaryCount/);
    assert.match(editSrc, /rowSummaryCount=\{attachedSummaryCount\}/);
    assert.match(editSrc, /formatReleaseLinksRowSummary\(linksForSummary\)/);
    assert.match(attachSrc, /rowSummaryCount\?:/);
    assert.match(attachSrc, /typeof rowSummaryCount === "number"/);
  });

  it("Collaborators summary still reads release.collaborators (unchanged)", () => {
    assert.match(
      editSrc,
      /formatReleaseCollaboratorsRowSummary\(\{\s*existing: \(release\.collaborators/,
    );
    assert.doesNotMatch(editSrc, /resolveEditCollaborator/);
  });
});

describe("Edit dirty snapshot + comparison", () => {
  it("clean hydrated snapshot is not dirty", () => {
    const initial = baseSnapshot();
    assert.equal(hasUnsavedReleaseEditChanges(initial, initial), false);
    assert.equal(hasUnsavedReleaseEditChanges(null, initial), false);
  });

  it("open/close without mutation stays clean (same normalized snapshot)", () => {
    const initial = baseSnapshot();
    const afterSheetClose = buildReleaseEditSnapshot({
      title: "Night Bus",
      artworkPath: "art/night.jpg",
      comingSoon: false,
      releaseDate: "2026-10-31",
      timingDraft: defaultMidnightDraft(),
      draftLinks: [
        { platform: "Spotify", url: " https://open.spotify.com/a ", linkType: "listen" },
        { platform: "apple", url: "https://music.apple.com/a", linkType: "pre_save" },
        { platform: "soundcloud", url: "https://soundcloud.com/a", linkType: null },
        { platform: "youtube", url: "https://youtube.com/a", linkType: null },
        { platform: "bandcamp", url: "https://bandcamp.com/a", linkType: null },
      ],
      selectedPostIds: ["post-1"],
      stagedCollaboratorIds: [],
    });
    assert.equal(hasUnsavedReleaseEditChanges(initial, afterSheetClose), false);
  });

  it("link reorder is dirty", () => {
    const initial = baseSnapshot();
    const reordered = buildReleaseEditSnapshot({
      title: "Night Bus",
      artworkPath: "art/night.jpg",
      comingSoon: false,
      releaseDate: "2026-10-31",
      timingDraft: defaultMidnightDraft(),
      draftLinks: [
        { platform: "apple", url: "https://music.apple.com/a", linkType: "pre_save" },
        { platform: "spotify", url: "https://open.spotify.com/a", linkType: null },
        { platform: "soundcloud", url: "https://soundcloud.com/a", linkType: null },
        { platform: "youtube", url: "https://youtube.com/a", linkType: null },
        { platform: "bandcamp", url: "https://bandcamp.com/a", linkType: null },
      ],
      selectedPostIds: ["post-1"],
      stagedCollaboratorIds: [],
    });
    assert.equal(hasUnsavedReleaseEditChanges(initial, reordered), true);
  });

  it("link edit / attach / title / date / artwork / staged collab are dirty", () => {
    const initial = baseSnapshot();
    assert.equal(
      hasUnsavedReleaseEditChanges(
        initial,
        buildReleaseEditSnapshot({
          ...{
            title: "Night Bus",
            artworkPath: "art/night.jpg",
            comingSoon: false,
            releaseDate: "2026-10-31",
            timingDraft: defaultMidnightDraft(),
            selectedPostIds: ["post-1"],
            stagedCollaboratorIds: [],
          },
          draftLinks: [
            {
              platform: "spotify",
              url: "https://open.spotify.com/CHANGED",
              linkType: null,
            },
            { platform: "apple", url: "https://music.apple.com/a", linkType: "pre_save" },
            { platform: "soundcloud", url: "https://soundcloud.com/a", linkType: null },
            { platform: "youtube", url: "https://youtube.com/a", linkType: null },
            { platform: "bandcamp", url: "https://bandcamp.com/a", linkType: null },
          ],
        }),
      ),
      true,
    );
    assert.equal(
      hasUnsavedReleaseEditChanges(
        initial,
        buildReleaseEditSnapshot({
          title: "Night Bus",
          artworkPath: "art/night.jpg",
          comingSoon: false,
          releaseDate: "2026-10-31",
          timingDraft: defaultMidnightDraft(),
          draftLinks: initial.links,
          selectedPostIds: ["post-1", "post-2"],
          stagedCollaboratorIds: [],
        }),
      ),
      true,
    );
    assert.equal(
      hasUnsavedReleaseEditChanges(
        initial,
        buildReleaseEditSnapshot({
          title: "Day Bus",
          artworkPath: "art/night.jpg",
          comingSoon: false,
          releaseDate: "2026-10-31",
          timingDraft: defaultMidnightDraft(),
          draftLinks: initial.links,
          selectedPostIds: ["post-1"],
          stagedCollaboratorIds: [],
        }),
      ),
      true,
    );
    assert.equal(
      hasUnsavedReleaseEditChanges(
        initial,
        buildReleaseEditSnapshot({
          title: "Night Bus",
          artworkPath: "art/other.jpg",
          comingSoon: false,
          releaseDate: "2026-11-01",
          timingDraft: enableExactDraft(defaultMidnightDraft()),
          draftLinks: initial.links,
          selectedPostIds: ["post-1"],
          stagedCollaboratorIds: ["collab-1"],
        }),
      ),
      true,
    );
  });
});

describe("Edit Back / Discard / Save destinations", () => {
  it("exit path is same release detail; preserves useful from=", () => {
    assert.equal(
      resolveReleaseEditExitPath("rel-1", ""),
      "/releases/rel-1",
    );
    assert.equal(
      resolveReleaseEditExitPath("rel-1", "?from=feed&scope=upcoming"),
      "/releases/rel-1?from=feed&scope=upcoming",
    );
    assert.equal(resolveReleaseEditExitPath("", ""), "/releases");
    assert.doesNotMatch(editSrc, /resolveReleaseDetailBackPath/);
    assert.match(editSrc, /resolveReleaseEditExitPath\(releaseId, search\)/);
  });

  it("clean Back navigates; dirty Back confirms", () => {
    assert.equal(editBackDecision(false), "navigate");
    assert.equal(editBackDecision(true), "confirm");
    assert.match(editSrc, /editBackDecision\(isDirty\)/);
    assert.match(editSrc, /Discard changes\?/);
    assert.match(editSrc, /Your changes haven&apos;t been saved\./);
    assert.match(editSrc, /Keep editing/);
    assert.match(editSrc, /Discard changes/);
    assert.match(editSrc, /data-testid="release-edit-discard-confirm"/);
    assert.match(editSrc, /aria-label="Back"/);
    assert.doesNotMatch(editSrc, /Back to Releases/);
  });

  it("Save success exits to detail (not /releases list)", () => {
    assert.match(editSrc, /toast\(\{ title: "Release updated" \}\)/);
    assert.match(editSrc, /exitToDetail\(\)/);
    const saveBlock = editSrc.slice(
      editSrc.indexOf('toast({ title: "Release updated" })'),
      editSrc.indexOf('toast({ title: "Release updated" })') + 200,
    );
    assert.match(saveBlock, /exitToDetail/);
    assert.doesNotMatch(
      saveBlock,
      /navigate\(["'`]\/releases["'`]\)/,
    );
    assert.match(
      editSrc,
      /invalidateQueries\(\{ queryKey: \["\/api\/releases", releaseId\] \}\)/,
    );
  });

  it("merges the PATCH body before navigation and does not await invalidation", () => {
    const saveStart = editSrc.indexOf("const handleSave = async");
    const saveEnd = editSrc.indexOf("if (!releaseId || !release) {", saveStart);
    const save = editSrc.slice(saveStart, saveEnd);
    assert.match(save, /releaseLinkSyncNeedsOrderRoundTrip\(plan\)/);
    assert.match(save, /mergeReleasePatchIntoDetail/);
    const success = save.slice(save.indexOf("mergeReleasePatchIntoDetail"));
    assert.match(success, /void queryClient\.invalidateQueries\(\{ queryKey: \["\/api\/releases", releaseId\] \}\)/);
    assert.doesNotMatch(success, /await queryClient\.invalidateQueries/);
    const mergeAt = save.indexOf("mergeReleasePatchIntoDetail");
    const exitAt = save.indexOf("exitToDetail()");
    const invalidateAt = save.indexOf(
      'void queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId] })',
    );
    assert.ok(mergeAt > 0 && invalidateAt > mergeAt && exitAt > invalidateAt);
    assert.match(editSrc, /disabled=\{saving \|\| uploading\}/);
    assert.match(thumbSrc, /key=\{url\}/);
  });

  it("PATCH merge keeps collaborators, links, and suspension fields", () => {
    const previous = {
      id: "rel-1",
      artistId: "artist-1",
      title: "Old",
      releaseDate: "2026-01-01",
      artworkUrl: "https://cdn.example/old.jpg",
      artistUsername: "Artist",
      collaborators: [{ username: "Artist1", status: "ACCEPTED" }],
      links: [{ id: "link-1", platform: "spotify", url: "https://s/1" }],
      subscriptionPaused: true,
      subscriptionSuspendedAt: "2026-08-01T00:00:00.000Z",
      attachedClips: [{ id: "clip-1", title: "Clip", thumbnailUrl: null, uploaderUsername: "u", isVerifiedArtist: false, likes: 0 }],
    };
    const merged = mergeReleasePatchIntoDetail(previous, {
      title: "New",
      artworkUrl: "https://cdn.example/new.jpg",
      artworkPath: "artist/new.jpg",
      releaseDate: "2026-02-02",
      isComingSoon: false,
      links: [],
      collaborators: [],
      subscriptionPaused: false,
    });
    assert.equal(merged?.title, "New");
    assert.equal(merged?.artworkUrl, "https://cdn.example/new.jpg");
    assert.equal(merged?.artworkPath, "artist/new.jpg");
    assert.equal(merged?.releaseDate, "2026-02-02");
    assert.equal(merged?.collaborators?.[0]?.username, "Artist1");
    assert.equal(merged?.links?.[0]?.id, "link-1");
    assert.equal(merged?.subscriptionPaused, true);
    assert.equal(merged?.subscriptionSuspendedAt, "2026-08-01T00:00:00.000Z");
    assert.equal(merged?.attachedClips?.[0]?.id, "clip-1");
    assert.equal(mergeReleasePatchIntoDetail(undefined, { title: "New" }), undefined);
  });

  it("SwipeBack stays disabled; onBack reuses guard", () => {
    assert.match(editSrc, /enabled=\{false\}/);
    assert.match(editSrc, /onBack=\{handleBack\}/);
  });
});

describe("Drag axis + opaque active surface", () => {
  it("restrictToVerticalAxis is configured on DndContext", () => {
    assert.match(linksSrc, /@dnd-kit\/modifiers/);
    assert.match(linksSrc, /restrictToVerticalAxis/);
    assert.match(linksSrc, /modifiers=\{\[restrictToVerticalAxis\]\}/);
  });

  it("dragging row uses opaque overlay material surface", () => {
    assert.match(linksSrc, /LINK_ROW_DRAG_SURFACE_CLASS/);
    assert.match(linksSrc, /rounded-md bg-\[rgb\(20,26,48\)\]/);
    assert.doesNotMatch(linksSrc, /APP_MATERIAL_OVERLAY_SURFACE_CLASS/);
    assert.doesNotMatch(linksSrc, /bg-white\/\[0\.06\]/);
    assert.doesNotMatch(linksSrc, /DragOverlay/);
  });

  it("grip-only + index-crossing haptic preserved", () => {
    assert.match(linksSrc, /setActivatorNodeRef/);
    assert.match(linksSrc, /playInteractionLightThrottled/);
    assert.match(linksSrc, /lastOverIndexRef/);
    assert.match(linksSrc, /data-vaul-no-drag/);
  });
});
