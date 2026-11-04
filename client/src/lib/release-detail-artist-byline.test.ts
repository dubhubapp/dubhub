/**
 * Release Detail header artist credit — solo tick vs combined collab credit.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  artistCreditSeparator,
  formatArtistCreditList,
  formatArtistCreditName,
  getReleaseBylineSegments,
} from "@/lib/release-display";

const here = dirname(fileURLToPath(import.meta.url));
const bylineSrc = readFileSync(
  join(here, "../components/release-detail-artist-byline.tsx"),
  "utf8",
);
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const verifiedNameSrc = readFileSync(
  join(here, "../components/verified-artist-name.tsx"),
  "utf8",
);

describe("release detail artist credit formatting", () => {
  it("formats two, three, and four+ artists with spaced ampersand and commas", () => {
    assert.equal(formatArtistCreditList(["CollabArtistTest", "Artist1"]), "CollabArtistTest & Artist1");
    assert.equal(
      formatArtistCreditList(["Artist1", "Artist2", "Artist3"]),
      "Artist1, Artist2 & Artist3",
    );
    assert.equal(
      formatArtistCreditList(["Artist1", "Artist2", "Artist3", "Artist4"]),
      "Artist1, Artist2, Artist3 & Artist4",
    );
    assert.equal(artistCreditSeparator(1, 2), " & ");
    assert.equal(artistCreditSeparator(1, 3), ", ");
    assert.equal(artistCreditSeparator(2, 3), " & ");
  });

  it("strips @ prefixes from credit names without changing order", () => {
    assert.equal(formatArtistCreditName("@CollabArtistTest"), "CollabArtistTest");
    assert.equal(
      formatArtistCreditList(["@CollabArtistTest", "@Artist1"]),
      "CollabArtistTest & Artist1",
    );
  });

  it("includes only accepted collaborators in byline segments", () => {
    const { owner, collaborators } = getReleaseBylineSegments("Owner", [
      { username: "Accepted1", status: "ACCEPTED" },
      { username: "Pending", status: "PENDING" },
      { username: "Rejected", status: "REJECTED" },
      { username: "Accepted2", status: "ACCEPTED" },
    ]);
    assert.equal(owner.label, "Owner");
    assert.deepEqual(
      collaborators.map((c) => c.label),
      ["Accepted1", "Accepted2"],
    );
  });
});

describe("release detail artist byline presentation", () => {
  it("keeps the gold verification tick for a single artist credit only", () => {
    assert.match(bylineSrc, /const isCombinedCredit = people\.length > 1/);
    assert.match(bylineSrc, /!isCombinedCredit \? \(/);
    assert.match(bylineSrc, /GoldVerifiedTick/);
    assert.match(bylineSrc, /text-\[#FFD700\]/);
    assert.doesNotMatch(bylineSrc, /isOwner \? \(\s*<span className="inline-flex">\s*<GoldVerifiedTick/);
  });

  it("uses natural separators as plain text so spaces around & are preserved", () => {
    assert.match(bylineSrc, /artistCreditSeparator\(index, people\.length\)/);
    assert.doesNotMatch(bylineSrc, /inline-flex max-w-full flex-wrap/);
    assert.match(bylineSrc, /leading-snug break-words/);
  });

  it("keeps individual artist and collaborator profile links", () => {
    assert.match(bylineSrc, /onClick=\{\(\) => onArtistPress\(navUsername\)\}/);
    assert.match(bylineSrc, /release-detail-artist-link-\$\{navUsername\}/);
    assert.match(bylineSrc, /release-detail-collaborator-link-\$\{navUsername\}/);
    assert.match(detailSrc, /<ReleaseDetailArtistByline/);
    assert.match(detailSrc, /onArtistPress=\{openArtistProfile\}/);
  });

  it("does not remove verification ticks from other individual artist surfaces", () => {
    assert.match(verifiedNameSrc, /GoldVerifiedTick/);
    assert.match(verifiedNameSrc, /VERIFIED_NAME_CLASS/);
  });
});
