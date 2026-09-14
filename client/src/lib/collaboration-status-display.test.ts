import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  COLLABORATION_ACCEPTED_PILL_CLASS,
  COLLABORATION_DECLINED_PILL_CLASS,
  COLLABORATION_PENDING_PILL_CLASS,
  COLLABORATION_STATUS_PILL_BASE_CLASS,
  getCollaborationStatusDisplay,
} from "./collaboration-status-display";
import { RELEASE_RELEASED_PILL_CLASS } from "./release-status-pill";
import { formatReleaseCollaboratorsRowSummary } from "./release-tools-collaborators-summary";

const here = dirname(fileURLToPath(import.meta.url));

describe("collaboration status pill copy", () => {
  it("ACCEPTED exact visible copy is Title Case Collaboration Accepted", () => {
    const display = getCollaborationStatusDisplay("ACCEPTED");
    assert.equal(display?.label, "Collaboration Accepted");
    assert.notEqual(display?.label, display?.label.toUpperCase());
    assert.doesNotMatch(display?.label || "", /COLLABORATION/);
  });

  it("PENDING exact visible copy is Collaboration Pending", () => {
    const display = getCollaborationStatusDisplay("PENDING");
    assert.equal(display?.label, "Collaboration Pending");
    assert.doesNotMatch(display?.label || "", /COLLABORATION/);
  });

  it("REJECTED exact visible copy is Collaboration Declined", () => {
    const display = getCollaborationStatusDisplay("REJECTED");
    assert.equal(display?.label, "Collaboration Declined");
    assert.doesNotMatch(display?.label || "", /COLLABORATION/);
  });

  it("never uses uppercase text-transform on pill chrome", () => {
    for (const status of ["PENDING", "ACCEPTED", "REJECTED"] as const) {
      const display = getCollaborationStatusDisplay(status);
      assert.ok(display);
      assert.doesNotMatch(display.className, /uppercase/);
    }
  });
});

describe("collaboration status pill chrome and tones", () => {
  it("reuses ReleaseStatusPill structural chrome with unified font-medium", () => {
    assert.match(COLLABORATION_STATUS_PILL_BASE_CLASS, /inline-flex/);
    assert.match(COLLABORATION_STATUS_PILL_BASE_CLASS, /shrink-0/);
    assert.match(COLLABORATION_STATUS_PILL_BASE_CLASS, /items-center/);
    assert.match(COLLABORATION_STATUS_PILL_BASE_CLASS, /justify-center/);
    assert.match(COLLABORATION_STATUS_PILL_BASE_CLASS, /rounded/);
    assert.match(COLLABORATION_STATUS_PILL_BASE_CLASS, /font-medium/);
    assert.match(COLLABORATION_STATUS_PILL_BASE_CLASS, /leading-none/);
    assert.match(COLLABORATION_STATUS_PILL_BASE_CLASS, /min-h-\[1\.375rem\]/);
    assert.match(COLLABORATION_STATUS_PILL_BASE_CLASS, /px-2/);
    assert.match(COLLABORATION_STATUS_PILL_BASE_CLASS, /py-0\.5/);
    assert.match(COLLABORATION_STATUS_PILL_BASE_CLASS, /text-xs/);
  });

  it("entire Collaboration Accepted label uses unified font weight", () => {
    const display = getCollaborationStatusDisplay("ACCEPTED");
    assert.ok(display);
    assert.match(display.className, /font-medium/);
    assert.doesNotMatch(display.className, /font-normal|font-semibold|text-white\/70/);
    assert.equal(
      Object.prototype.hasOwnProperty.call(display, "prefixClassName"),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(display, "stateClassName"),
      false,
    );
  });

  it("no mixed-opacity or mixed-weight nested emphasis remains", () => {
    const displaySrc = readFileSync(
      join(here, "collaboration-status-display.ts"),
      "utf8",
    );
    const pillSrc = readFileSync(
      join(here, "../components/collaboration-status-pill.tsx"),
      "utf8",
    );
    assert.doesNotMatch(displaySrc, /text-white\/70|font-normal|font-semibold|prefixClassName|stateClassName/);
    assert.doesNotMatch(pillSrc, /prefixClassName|stateClassName|text-white\/70/);
    assert.match(pillSrc, /\{display\.label\}/);
  });

  it("accepted uses teal/mint-green family, not violet/blue", () => {
    const display = getCollaborationStatusDisplay("ACCEPTED");
    assert.ok(display);
    assert.match(display.className, /teal/);
    assert.match(COLLABORATION_ACCEPTED_PILL_CLASS, /bg-teal-500\/25/);
    assert.match(COLLABORATION_ACCEPTED_PILL_CLASS, /ring-1/);
    assert.match(COLLABORATION_ACCEPTED_PILL_CLASS, /ring-inset/);
    assert.match(COLLABORATION_ACCEPTED_PILL_CLASS, /ring-teal-400\/35/);
    assert.doesNotMatch(
      display.className,
      /violet|indigo|blue-500|purple/,
    );
  });

  it("accepted is distinct from Released green/emerald", () => {
    assert.match(RELEASE_RELEASED_PILL_CLASS, /green-500/);
    assert.doesNotMatch(RELEASE_RELEASED_PILL_CLASS, /teal/);
    assert.match(COLLABORATION_ACCEPTED_PILL_CLASS, /teal/);
    assert.doesNotMatch(COLLABORATION_ACCEPTED_PILL_CLASS, /green-500|emerald/);
  });

  it("pending uses amber/orange tone", () => {
    const display = getCollaborationStatusDisplay("PENDING");
    assert.ok(display);
    assert.match(display.className, /amber/);
    assert.match(COLLABORATION_PENDING_PILL_CLASS, /bg-amber-500\/25/);
    assert.match(COLLABORATION_PENDING_PILL_CLASS, /ring-amber-400\/35/);
    assert.doesNotMatch(display.className, /violet|indigo|teal|blue|green|red/);
  });

  it("declined uses red tone", () => {
    const display = getCollaborationStatusDisplay("REJECTED");
    assert.ok(display);
    assert.match(display.className, /red/);
    assert.match(COLLABORATION_DECLINED_PILL_CLASS, /bg-red-500\/25/);
    assert.match(COLLABORATION_DECLINED_PILL_CLASS, /ring-red-400\/35/);
  });

  it("Released pill chrome is unchanged", () => {
    const releasedSrc = readFileSync(
      join(here, "release-status-pill.ts"),
      "utf8",
    );
    assert.match(
      releasedSrc,
      /RELEASE_RELEASED_PILL_CLASS =\s*"bg-green-500\/25 text-white ring-1 ring-inset ring-green-400\/35"/,
    );
  });
});

describe("collaborator identity clarity", () => {
  it("create/edit summary lists usernames for multiple collaborators", () => {
    assert.equal(
      formatReleaseCollaboratorsRowSummary({
        existing: [
          { username: "artistone", status: "ACCEPTED" },
          { username: "artisttwo", status: "PENDING" },
          { username: "artistthree", status: "REJECTED" },
        ],
        staged: [],
      }),
      "@artistone, @artisttwo, @artistthree · 1 pending",
    );
  });

  it("sheet keeps username above status and one row per collaborator", () => {
    const sheetSrc = readFileSync(
      join(here, "../components/release-collaborators-sheet.tsx"),
      "utf8",
    );
    assert.match(sheetSrc, /space-y-1\.5/);
    assert.match(
      sheetSrc,
      /release-collaborator-username-[\s\S]*?release-collaborator-status-/,
    );
    const mapStart = sheetSrc.indexOf("{existingCollaborators.map((c) => {");
    assert.ok(mapStart >= 0);
    const mapEnd = sheetSrc.indexOf("{stagedCollaborators.map((c) => (");
    assert.ok(mapEnd > mapStart);
    const rowBody = sheetSrc.slice(mapStart, mapEnd);
    const usernameIdx = rowBody.indexOf("<VerifiedArtistName");
    const statusIdx = rowBody.indexOf("<CollaborationStatusPill");
    assert.ok(usernameIdx >= 0 && statusIdx > usernameIdx);
  });

  it("does not broaden into avatar fetches or notification/query changes", () => {
    const displaySrc = readFileSync(
      join(here, "collaboration-status-display.ts"),
      "utf8",
    );
    const sheetSrc = readFileSync(
      join(here, "../components/release-collaborators-sheet.tsx"),
      "utf8",
    );
    assert.doesNotMatch(displaySrc, /avatar|notification|getReleasesFeed/i);
    assert.doesNotMatch(sheetSrc, /apiRequest|fetch\(|avatar_url|profileImage/);
  });
});
