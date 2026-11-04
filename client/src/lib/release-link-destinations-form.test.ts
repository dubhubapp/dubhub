/**
 * Slice 3 — one platform row with an optional pre-release URL and an optional released URL.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FREE_RELEASE_LINK_LIMIT,
  canAddLinkToDraft,
  isPaidOnlyReleaseLink,
} from "@/lib/release-link-limit";
import {
  buildReleaseEditSnapshot,
  hasUnsavedReleaseEditChanges,
} from "@/lib/release-edit-dirty";
import { defaultMidnightDraft } from "@/lib/release-timing-draft";
import { planReleaseLinkSync } from "@/lib/sync-release-links";
import { resolvePublicReleaseLinkDestination } from "@shared/release-link-platforms";
import {
  RELEASE_LINK_DESTINATION_HINT,
  commitDraftLinkFromForm,
  formFieldsFromStoredLink,
  platformUsesDualReleaseDestinations,
  releaseLinkWriteBody,
  storedLinkFromFormFields,
} from "./release-link-destinations-form";

const here = dirname(fileURLToPath(import.meta.url));
const sheetSrc = readFileSync(
  join(here, "../components/release-links-sheet.tsx"),
  "utf8",
);
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const selectorSrc = readFileSync(
  join(here, "../../../shared/release-link-platforms.ts"),
  "utf8",
);

const PRE = "https://presave.example/spotify";
const LIVE = "https://open.spotify.com/track/live";
const LIVE_NEXT = "https://open.spotify.com/track/next";

function commit(args: {
  platform?: string;
  preReleaseUrl?: string;
  releasedUrl?: string;
  pickerPurpose?: "listen" | "presave" | "download";
}) {
  return commitDraftLinkFromForm({
    platform: args.platform ?? "spotify",
    preReleaseUrl: args.preReleaseUrl ?? "",
    releasedUrl: args.releasedUrl ?? "",
    pickerPurpose: args.pickerPurpose ?? "listen",
  });
}

function reopen(stored: {
  platform: string;
  url: string;
  linkType: string | null;
  postReleaseUrl: string | null;
}) {
  return formFieldsFromStoredLink(stored);
}

describe("destination mapping", () => {
  it("pre-release only creates, saves, and reopens the pre-release field", () => {
    const committed = commit({ preReleaseUrl: `  ${PRE}  ` });
    assert.ok(committed);
    assert.equal(committed.purpose, "presave");
    assert.deepEqual(committed.stored, {
      url: PRE,
      linkType: "presave",
      postReleaseUrl: null,
    });
    assert.deepEqual(releaseLinkWriteBody({ platform: "spotify", ...committed.stored }), {
      platform: "spotify",
      url: PRE,
      link_type: "presave",
      post_release_url: null,
    });
    assert.deepEqual(reopen({ platform: "spotify", ...committed.stored }), {
      preReleaseUrl: PRE,
      releasedUrl: "",
    });
  });

  it("released only creates, saves, and reopens the released field", () => {
    const committed = commit({ releasedUrl: LIVE, pickerPurpose: "presave" });
    assert.ok(committed);
    assert.equal(committed.purpose, "listen");
    assert.deepEqual(committed.stored, {
      url: LIVE,
      linkType: null,
      postReleaseUrl: null,
    });
    assert.deepEqual(reopen({ platform: "spotify", ...committed.stored }), {
      preReleaseUrl: "",
      releasedUrl: LIVE,
    });
  });

  it("both URLs create, save, and reopen on one row", () => {
    const committed = commit({ preReleaseUrl: PRE, releasedUrl: LIVE });
    assert.ok(committed);
    assert.deepEqual(committed.stored, {
      url: PRE,
      linkType: "presave",
      postReleaseUrl: LIVE,
    });
    assert.equal(
      releaseLinkWriteBody({ platform: "spotify", ...committed.stored }).post_release_url,
      LIVE,
    );
    assert.deepEqual(reopen({ platform: "spotify", ...committed.stored }), {
      preReleaseUrl: PRE,
      releasedUrl: LIVE,
    });
    assert.equal(commit({ preReleaseUrl: "  ", releasedUrl: "  " }), null);
  });

  it("loads an existing pre-save row into the pre-release field", () => {
    assert.deepEqual(
      formFieldsFromStoredLink({
        platform: "apple_music",
        url: "https://music.apple.com/pre",
        linkType: "presave",
        postReleaseUrl: null,
      }),
      {
        preReleaseUrl: "https://music.apple.com/pre",
        releasedUrl: "",
      },
    );
  });

  it("loads an existing listening row into the released field", () => {
    assert.deepEqual(
      formFieldsFromStoredLink({
        platform: "spotify",
        url: LIVE,
        linkType: null,
        postReleaseUrl: null,
      }),
      { preReleaseUrl: "", releasedUrl: LIVE },
    );
    assert.deepEqual(
      formFieldsFromStoredLink({
        platform: "beatport",
        url: "https://beatport.com/track/1",
        linkType: "listen",
      }),
      { preReleaseUrl: "", releasedUrl: "https://beatport.com/track/1" },
    );
  });
});

describe("edit compatibility", () => {
  const both = {
    platform: "spotify",
    url: PRE,
    linkType: "presave" as const,
    postReleaseUrl: LIVE,
  };

  it("a released-URL-only edit is persisted on the same row", () => {
    const next = storedLinkFromFormFields({
      platform: "spotify",
      preReleaseUrl: PRE,
      releasedUrl: LIVE_NEXT,
    });
    assert.deepEqual(next, {
      url: PRE,
      linkType: "presave",
      postReleaseUrl: LIVE_NEXT,
    });
    const plan = planReleaseLinkSync({
      existing: [both],
      draft: [{ platform: "spotify", ...next! }],
    });
    assert.deepEqual(plan.updates, [
      { platform: "spotify", url: PRE, linkType: "presave", postReleaseUrl: LIVE_NEXT },
    ]);
    assert.deepEqual(plan.removals, []);
    assert.deepEqual(plan.inserts, []);
    const initial = snapshot([both]);
    const current = snapshot([
      { platform: "spotify", url: PRE, linkType: "presave", postReleaseUrl: LIVE_NEXT },
    ]);
    assert.equal(hasUnsavedReleaseEditChanges(initial, current), true);
  });

  it("clearing the released URL persists the removal", () => {
    const next = storedLinkFromFormFields({
      platform: "spotify",
      preReleaseUrl: PRE,
      releasedUrl: "   ",
    });
    assert.deepEqual(next, {
      url: PRE,
      linkType: "presave",
      postReleaseUrl: null,
    });
    assert.equal(
      releaseLinkWriteBody({ platform: "spotify", ...next! }).post_release_url,
      null,
    );
    const plan = planReleaseLinkSync({
      existing: [both],
      draft: [{ platform: "spotify", ...next! }],
    });
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0]?.postReleaseUrl, null);
    assert.equal(plan.removals.length, 0);
  });

  it("changing from pre-release-only to released-only updates the existing row", () => {
    const next = storedLinkFromFormFields({
      platform: "spotify",
      preReleaseUrl: "",
      releasedUrl: LIVE,
    });
    assert.deepEqual(next, { url: LIVE, linkType: null, postReleaseUrl: null });
    const plan = planReleaseLinkSync({
      existing: [{ platform: "spotify", url: PRE, linkType: "presave", postReleaseUrl: null }],
      draft: [{ platform: "spotify", ...next! }],
    });
    assert.deepEqual(plan.updates, [
      { platform: "spotify", url: LIVE, linkType: null, postReleaseUrl: null },
    ]);
    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.removals.length, 0);
    assert.equal(plan.primaryReplace, null);
  });

  it("discarding the form leaves the stored snapshot unchanged", () => {
    const initial = snapshot([both]);
    const clearStart = createSrc.indexOf("const clearLinkForm");
    const clearEnd = createSrc.indexOf("\n  const ", clearStart + 1);
    const clearBlock = createSrc.slice(clearStart, clearEnd);
    assert.doesNotMatch(clearBlock, /setDraftLinks/);
    assert.match(sheetSrc, /onClearLinkForm\(\)/);
    assert.match(sheetSrc, /release-links-sheet-cancel-edit/);
    assert.equal(hasUnsavedReleaseEditChanges(initial, snapshot([both])), false);
  });

  it("reorder keeps both URLs and does not rewrite them", () => {
    const apple = {
      platform: "apple_music",
      url: "https://music.apple.com/pre",
      linkType: "presave" as const,
      postReleaseUrl: "https://music.apple.com/live",
    };
    const reordered = [apple, both];
    assert.equal(reordered[1]?.postReleaseUrl, LIVE);
    assert.match(sheetSrc, /\.\.\.link/);
    const plan = planReleaseLinkSync({
      existing: [both, apple],
      draft: reordered,
    });
    assert.deepEqual(plan.updates, []);
    assert.deepEqual(plan.removals, []);
    assert.match(editSrc, /linkIds/);
    const initial = snapshot([both, apple]);
    const current = snapshot(reordered);
    assert.equal(hasUnsavedReleaseEditChanges(initial, current), true);
    assert.equal(current.links[0]?.postReleaseUrl, apple.postReleaseUrl);
    assert.equal(current.links[1]?.postReleaseUrl, LIVE);
  });

  it("does not create a second row for the same platform", () => {
    const plan = planReleaseLinkSync({
      existing: [],
      draft: [
        { platform: "spotify", url: PRE, linkType: "presave", postReleaseUrl: null },
        { platform: "Spotify", url: LIVE, linkType: null, postReleaseUrl: LIVE_NEXT },
      ],
    });
    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0]?.url, LIVE);
    assert.equal(plan.inserts[0]?.postReleaseUrl, LIVE_NEXT);
    assert.match(createSrc, /Platform already added/);
    assert.match(editSrc, /Platform already added/);
  });

  it("unrelated release edits do not rewrite unchanged links", () => {
    const plan = planReleaseLinkSync({
      existing: [both, { platform: "tidal", url: "https://tidal.com/1", linkType: null }],
      draft: [both, { platform: "tidal", url: "https://tidal.com/1", linkType: null }],
    });
    assert.deepEqual(plan.updates, []);
    assert.deepEqual(plan.inserts, []);
    assert.deepEqual(plan.removals, []);
    assert.equal(plan.primaryReplace, null);
    const titled = snapshot([both], "Renamed");
    const original = snapshot([both], "Night Bus");
    assert.equal(hasUnsavedReleaseEditChanges(original, titled), true);
    assert.deepEqual(original.links, titled.links);
    assert.match(editSrc, /plan\.updates/);
    assert.match(editSrc, /releaseLinkWriteBody/);
  });
});

describe("Artist Tools gating", () => {
  it("counts one platform with two URLs as one free-tier link", () => {
    assert.equal(FREE_RELEASE_LINK_LIMIT, 1);
    const committed = commit({ preReleaseUrl: PRE, releasedUrl: LIVE });
    assert.ok(committed);
    assert.equal(
      canAddLinkToDraft({ unlimited: false, draftCount: 1, limit: FREE_RELEASE_LINK_LIMIT }),
      false,
    );
    assert.equal(
      canAddLinkToDraft({ unlimited: false, draftCount: 0, limit: FREE_RELEASE_LINK_LIMIT }),
      true,
    );
    const releasedOnly = commit({ releasedUrl: LIVE });
    assert.equal(releasedOnly?.purpose, "listen");
    assert.equal(isPaidOnlyReleaseLink("spotify", releasedOnly!.purpose), false);
  });

  it("keeps pre-release creation behind the existing entitlement", () => {
    const pre = commit({ preReleaseUrl: PRE });
    assert.equal(pre?.purpose, "presave");
    assert.equal(isPaidOnlyReleaseLink("spotify", pre!.purpose), true);
    assert.equal(isPaidOnlyReleaseLink("apple_music", "presave"), true);
    assert.equal(isPaidOnlyReleaseLink("beatport", "presave"), true);
    assert.match(
      createSrc,
      /!linkUnlimited && isPaidOnlyReleaseLink\(linkPlatform, purpose\)/,
    );
    assert.match(
      editSrc,
      /!linkUnlimited && isPaidOnlyReleaseLink\(linkPlatform, purpose\)/,
    );
  });

  it("keeps an existing pre-release and released URL after entitlement is no longer unlimited", () => {
    const stored = {
      platform: "spotify",
      url: PRE,
      linkType: "presave" as const,
      postReleaseUrl: LIVE,
    };
    assert.deepEqual(formFieldsFromStoredLink(stored), {
      preReleaseUrl: PRE,
      releasedUrl: LIVE,
    });
    const plan = planReleaseLinkSync({
      existing: [
        stored,
        { platform: "apple_music", url: "https://music.apple.com/a", linkType: null },
      ],
      draft: [
        stored,
        { platform: "apple_music", url: "https://music.apple.com/a", linkType: null },
      ],
    });
    assert.deepEqual(plan.removals, []);
    assert.deepEqual(plan.updates, []);
    assert.match(editSrc, /postReleaseUrl:/);
    assert.doesNotMatch(editSrc, /draftLinks\.filter\(\(\) => false\)/);
  });
});

describe("sheet presentation", () => {
  it("labels both fields and keeps download-only as one URL", () => {
    assert.equal(platformUsesDualReleaseDestinations("spotify"), true);
    assert.equal(platformUsesDualReleaseDestinations("apple_music"), true);
    assert.equal(platformUsesDualReleaseDestinations("beatport"), true);
    assert.equal(platformUsesDualReleaseDestinations("free_download"), false);
    assert.equal(platformUsesDualReleaseDestinations("dub_pack"), false);
    assert.equal(
      RELEASE_LINK_DESTINATION_HINT,
      "The pre-release link is shown before release day. When your track is out, we'll use the released link if you've added one.",
    );
    assert.match(sheetSrc, /Pre-release link/);
    assert.match(sheetSrc, /Released link/);
    assert.match(sheetSrc, /RELEASE_LINK_DESTINATION_HINT/);
    assert.match(sheetSrc, /data-testid="release-link-url"/);
    assert.doesNotMatch(sheetSrc, /Feature\.fm|Linkfire|convert your link/i);
    const download = storedLinkFromFormFields({
      platform: "free_download",
      preReleaseUrl: PRE,
      releasedUrl: "https://files.example/pack.zip",
      singlePurpose: "download",
    });
    assert.deepEqual(download, {
      url: "https://files.example/pack.zip",
      linkType: "download",
      postReleaseUrl: null,
    });
    assert.equal(
      formFieldsFromStoredLink({
        platform: "dub_pack",
        url: "https://files.example/dub.zip",
        linkType: "download",
        postReleaseUrl: LIVE,
      }).preReleaseUrl,
      "",
    );
  });

  it("create and edit send the released URL explicitly and hydrate stored rows", () => {
    assert.match(createSrc, /releaseLinkWriteBody/);
    assert.match(editSrc, /postReleaseUrl:\s*\n?\s*\(l as any\)\.postReleaseUrl/);
    assert.match(editSrc, /formFieldsFromStoredLink\(link\)/);
    assert.match(createSrc, /formFieldsFromStoredLink\(link\)/);
  });
});

describe("public selector compatibility", () => {
  it("Slice 2 still chooses the pre-release URL before release and the released URL after", () => {
    const before = resolvePublicReleaseLinkDestination({
      platform: "spotify",
      linkType: "presave",
      url: PRE,
      postReleaseUrl: LIVE,
      isUpcoming: true,
    });
    assert.equal(before?.href, PRE);
    assert.equal(before?.label, "Pre-save on Spotify");
    const after = resolvePublicReleaseLinkDestination({
      platform: "spotify",
      linkType: "presave",
      url: PRE,
      postReleaseUrl: LIVE,
      isUpcoming: false,
    });
    assert.equal(after?.href, LIVE);
    assert.equal(after?.label, "Listen on Spotify");
    const kept = resolvePublicReleaseLinkDestination({
      platform: "apple_music",
      linkType: "presave",
      url: "https://music.apple.com/pre",
      postReleaseUrl: null,
      isUpcoming: false,
    });
    assert.equal(kept?.href, "https://music.apple.com/pre");
    assert.equal(kept?.label, "Listen on Apple Music");
    const beatport = resolvePublicReleaseLinkDestination({
      platform: "beatport",
      linkType: "presave",
      url: "https://beatport.com/pre",
      postReleaseUrl: "https://beatport.com/buy",
      isUpcoming: false,
    });
    assert.equal(beatport?.href, "https://beatport.com/buy");
    assert.equal(beatport?.label, "Buy on Beatport");
    assert.match(selectorSrc, /export function resolvePublicReleaseLinkDestination/);
    assert.doesNotMatch(
      readFileSync(join(here, "release-link-destinations-form.ts"), "utf8"),
      /resolvePublicReleaseLinkDestination/,
    );
  });
});

function snapshot(
  links: {
    platform: string;
    url: string;
    linkType?: string | null;
    postReleaseUrl?: string | null;
  }[],
  title = "Night Bus",
) {
  return buildReleaseEditSnapshot({
    title,
    artworkPath: null,
    comingSoon: false,
    releaseDate: "2026-11-04",
    timingDraft: defaultMidnightDraft(),
    draftLinks: links,
    selectedPostIds: [],
    stagedCollaboratorIds: [],
  });
}
