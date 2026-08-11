import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CREATE_RELEASE_UPGRADE_CTA,
  resolveCreateReleaseBottomCapacity,
} from "./release-creation-capacity";
import {
  LINK_CAPACITY_UPGRADE_HINT,
  resolveLinkCapacityHeader,
  resolveLinkLimitCardCopy,
} from "./release-link-limit";
import { resolveFreeQuotaNoticeProminence } from "./release-form-limit-prominence";
import { formatReleaseLinksRowSummary } from "./release-tools-links-summary";
import { formatReleaseCollaboratorsRowSummary } from "./release-tools-collaborators-summary";
import { hasUnsavedReleaseDraft } from "./release-create-dirty";
import { defaultMidnightDraft } from "./release-timing-draft";
import { filterCollaboratorSearchResults } from "./release-collaborator-search-results";

const emptyDraft = {
  title: "",
  artworkPath: null,
  comingSoon: false,
  releaseDate: "",
  timingDraft: defaultMidnightDraft(),
  draftLinksCount: 0,
  stagedCollaboratorsCount: 0,
  selectedPostIdsCount: 0,
};

describe("C2.3 link capacity copy", () => {
  it("free usage includes Upgrade hint", () => {
    const header = resolveLinkCapacityHeader({
      unlimited: false,
      used: 0,
      limit: 1,
    });
    assert.equal(header?.title, "0 of 1 free links used");
    assert.equal(header?.upgradeHint, LINK_CAPACITY_UPGRADE_HINT);
  });

  it("paid/unlimited hides Upgrade hint", () => {
    assert.equal(
      resolveLinkCapacityHeader({ unlimited: true, used: 3, limit: null }),
      null,
    );
  });

  it("at-limit prominence unchanged", () => {
    assert.equal(
      resolveFreeQuotaNoticeProminence({ unlimited: false, used: 1, limit: 1 }),
      "prominent",
    );
    assert.equal(
      resolveLinkLimitCardCopy({ unlimited: false, used: 1, limit: 1 }).title,
      "1 of 1 free links used",
    );
  });
});

describe("C2.3 create capacity bottom UX", () => {
  it("with room keeps create unblocked and no top-card promo", () => {
    const ux = resolveCreateReleaseBottomCapacity({
      unlimited: false,
      used: 0,
      limit: 2,
      remaining: 2,
      canCreate: true,
    });
    assert.equal(ux.createBlocked, false);
    assert.equal(ux.showUpgrade, false);
    assert.equal(ux.countLabel, null);
  });

  it("at limit keeps blocked create + upgrade CTA", () => {
    const ux = resolveCreateReleaseBottomCapacity({
      unlimited: false,
      used: 2,
      limit: 2,
      remaining: 0,
      canCreate: false,
    });
    assert.equal(ux.createBlocked, true);
    assert.equal(ux.showUpgrade, true);
    assert.equal(ux.upgradeLabel, CREATE_RELEASE_UPGRADE_CTA);
  });
});

describe("C2.3 release tools copy", () => {
  it("row helpers unchanged aside from presentation", () => {
    assert.equal(formatReleaseLinksRowSummary([]), "Add streaming & music links");
    assert.equal(
      formatReleaseCollaboratorsRowSummary({ existing: [], staged: [] }),
      "Add verified artists",
    );
  });
});

describe("C2.3 collaborator results + dirty", () => {
  it("empty and many results do not encode sheet height", () => {
    assert.equal(
      filterCollaboratorSearchResults({
        searchResults: [],
        excludeIds: [],
        stagedCount: 0,
      }).length,
      0,
    );
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      username: `a${i}`,
    }));
    assert.equal(
      filterCollaboratorSearchResults({
        searchResults: many,
        excludeIds: [],
        stagedCount: 0,
      }).length,
      8,
    );
  });

  it("dirty-state semantics unchanged", () => {
    assert.equal(hasUnsavedReleaseDraft(emptyDraft), false);
    assert.equal(
      hasUnsavedReleaseDraft({ ...emptyDraft, draftLinksCount: 1 }),
      true,
    );
    assert.equal(
      hasUnsavedReleaseDraft({ ...emptyDraft, stagedCollaboratorsCount: 1 }),
      true,
    );
  });
});
