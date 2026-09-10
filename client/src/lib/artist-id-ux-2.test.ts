/**
 * ARTIST-ID-UX-2 — server denial wiring contracts (source inspection).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");
const storageSrc = readFileSync(join(here, "../../../server/storage.ts"), "utf8");
const dialogSrc = readFileSync(
  join(here, "../components/artist-verification-dialog.tsx"),
  "utf8",
);
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const moderatorSrc = readFileSync(join(here, "../pages/moderator.tsx"), "utf8");

describe("ARTIST-ID-UX-2 server denial contracts", () => {
  it("artist-deny marks per-artist tags denied", () => {
    assert.match(routesSrc, /markArtistDeniedOnPost\(postId, artistId/);
    assert.match(storageSrc, /async markArtistDeniedOnPost/);
    assert.match(storageSrc, /lower\(status\) = 'pending'/);
    assert.match(storageSrc, /status = 'denied'/);
  });

  it("processArtistTags skips artists who already denied the post", () => {
    assert.match(routesSrc, /hasArtistDeniedPost\(postId, artist\.id\)/);
    assert.match(routesSrc, /ARTIST_DENIED_ON_POST/);
    assert.match(storageSrc, /code = "ARTIST_DENIED_ON_POST"/);
  });

  it("feed exposes current_user_denied_as_artist per viewer", () => {
    assert.match(storageSrc, /current_user_denied_as_artist/);
    assert.match(routesSrc, /current_user_denied_as_artist: !!p\.currentUserDeniedAsArtist/);
  });

  it("artist dialog uses Not my track; moderator Keep copy unchanged", () => {
    assert.match(dialogSrc, /Not my track/);
    assert.doesNotMatch(dialogSrc, />\s*Deny\s*</);
    assert.match(moderatorSrc, /Keep as Community Identified/);
    assert.doesNotMatch(moderatorSrc, /Not my track/);
  });

  it("Comments confirm copy promises re-tag block; autocomplete loads artist-tags", () => {
    assert.match(
      commentsSrc,
      /People won&apos;t be able to tag you as the\s+artist on this post again/,
    );
    assert.match(commentsSrc, /\/api\/posts\/\$\{post\.id\}\/artist-tags/);
    assert.match(commentsSrc, /collectDeniedArtistIdsFromTags/);
    assert.match(commentsSrc, /suggestion\.disabled/);
    assert.match(commentsSrc, /font-semibold text-gray-800/);
  });
});
