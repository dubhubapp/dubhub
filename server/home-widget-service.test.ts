import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthenticatedRequest } from "./authMiddleware";
import {
  buildHomeWidgetPayload,
  type HomeWidgetServiceStorage,
} from "./home-widget-service";
import type {
  HomeWidgetListenerSelectionRow,
  HomeWidgetReleaseStorageRow,
} from "./storage";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const USER_ID = "00000000-0000-4000-8000-000000000001";
const SELECTED_ID = "00000000-0000-4000-8000-000000000002";

function profile(
  overrides: Partial<NonNullable<AuthenticatedRequest["dbUser"]>> = {},
): NonNullable<AuthenticatedRequest["dbUser"]> {
  return {
    id: USER_ID,
    username: "listener-one",
    account_type: "listener",
    verified_artist: false,
    moderator: false,
    ...overrides,
  };
}

function release(
  overrides: Partial<HomeWidgetReleaseStorageRow> = {},
): HomeWidgetReleaseStorageRow {
  return {
    id: SELECTED_ID,
    artistId: "00000000-0000-4000-8000-000000000099",
    title: "Night Bus",
    artistName: "artist-one",
    releaseDate: "2026-08-06T20:00:00.000Z",
    artworkUrl: "release/path.jpg",
    isPublic: true,
    isComingSoon: false,
    subscriptionSuspendedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function storageFixture(args: {
  artist?: HomeWidgetReleaseStorageRow[];
  listener?: HomeWidgetListenerSelectionRow;
  savedCandidates?: HomeWidgetReleaseStorageRow[];
} = {}): HomeWidgetServiceStorage {
  return {
    async getHomeWidgetArtistReleaseCandidates() {
      return args.artist ?? [];
    },
    async getHomeWidgetListenerSelection() {
      return args.listener ?? { release: null, isSaved: false };
    },
    async getHomeWidgetListenerSavedReleaseCandidates() {
      return args.savedCandidates ?? [];
    },
  };
}

const presentationDeps = {
  resolveArtworkUrl: (value: string | null | undefined) =>
    value ? `https://storage.example/public/release-artworks/${value}` : null,
  buildDeepLink: (id: string) =>
    `https://dubhub.uk/?release=${encodeURIComponent(id)}`,
  now: () => NOW,
};

describe("home widget service resolution", () => {
  it("returns chronological listener collection with activeReleaseId preserved", async () => {
    const selected = SELECTED_ID;
    const later = "00000000-0000-4000-8000-0000000000c2";
    const earlier = "00000000-0000-4000-8000-0000000000c1";
    const payload = await buildHomeWidgetPayload({
      profile: profile(),
      selectedReleaseId: later,
      deps: {
        ...presentationDeps,
        storage: storageFixture({
          listener: {
            release: release({
              id: later,
              title: "Later",
              releaseDate: "2026-09-01T00:00:00.000Z",
            }),
            isSaved: true,
          },
          savedCandidates: [
            release({
              id: later,
              title: "Later",
              releaseDate: "2026-09-01T00:00:00.000Z",
            }),
            release({
              id: earlier,
              title: "Earlier",
              releaseDate: "2026-08-15T00:00:00.000Z",
            }),
            release({
              id: selected,
              title: "Selected Mid",
              releaseDate: "2026-08-20T00:00:00.000Z",
            }),
          ],
        }),
      },
    });
    assert.equal(payload.mode, "listener");
    assert.equal(payload.release?.id, later);
    assert.equal(payload.activeReleaseId, later);
    assert.deepEqual(
      payload.releases?.map((r) => r.id),
      [earlier, selected, later],
    );
  });

  it("does not attach listener carousel while artist mode is active", async () => {
    const artistRelease = release({
      id: "00000000-0000-4000-8000-000000000010",
      artistId: USER_ID,
    });
    const payload = await buildHomeWidgetPayload({
      profile: profile({
        account_type: "artist",
        verified_artist: true,
      }),
      selectedReleaseId: SELECTED_ID,
      deps: {
        ...presentationDeps,
        canUsePaidTools: async () => true,
        storage: storageFixture({
          artist: [artistRelease],
          listener: {
            release: release(),
            isSaved: true,
          },
          savedCandidates: [
            release(),
            release({
              id: "00000000-0000-4000-8000-0000000000d2",
              releaseDate: "2026-09-01T00:00:00.000Z",
            }),
          ],
        }),
      },
    });
    assert.equal(payload.mode, "artist");
    assert.equal(payload.release?.id, artistRelease.id);
    assert.equal(payload.releases, undefined);
    assert.equal(payload.activeReleaseId, undefined);
  });

  it("returns artist mode before a valid listener selection", async () => {
    const artistRelease = release({
      id: "00000000-0000-4000-8000-000000000010",
      artistId: USER_ID,
    });
    const payload = await buildHomeWidgetPayload({
      profile: profile({
        account_type: "artist",
        verified_artist: true,
        username: "paid-artist",
      }),
      selectedReleaseId: SELECTED_ID,
      deps: {
        ...presentationDeps,
        storage: storageFixture({
          artist: [artistRelease],
          listener: { release: release(), isSaved: true },
        }),
        canUsePaidTools: async () => true,
      },
    });

    assert.equal(payload.mode, "artist");
    assert.equal(payload.release?.id, artistRelease.id);
    assert.equal(payload.eligibility, "eligible_artist_release");
  });

  it("falls back to a valid saved release when artist access fails closed", async () => {
    const payload = await buildHomeWidgetPayload({
      profile: profile({
        account_type: "artist",
        verified_artist: true,
      }),
      selectedReleaseId: SELECTED_ID,
      deps: {
        ...presentationDeps,
        storage: storageFixture({
          listener: { release: release(), isSaved: true },
        }),
        canUsePaidTools: async () => false,
      },
    });
    assert.equal(payload.mode, "listener");
    assert.equal(payload.eligibility, "eligible_listener_release");
  });

  it("accepts canonical Saved Releases membership regardless of like or own-upload path", async () => {
    for (const savedSource of ["like", "own_upload"]) {
      const payload = await buildHomeWidgetPayload({
        profile: profile(),
        selectedReleaseId: SELECTED_ID,
        deps: {
          ...presentationDeps,
          storage: storageFixture({
            // Storage owns derivation; both canonical paths resolve to isSaved=true.
            listener: { release: release({ title: savedSource }), isSaved: true },
          }),
        },
      });
      assert.equal(payload.mode, "listener");
    }
  });

  it("auto-advances expired listener selection to next Saved Release", async () => {
    const expiredId = SELECTED_ID;
    const nextId = "00000000-0000-4000-8000-000000000003";
    const payload = await buildHomeWidgetPayload({
      profile: profile(),
      selectedReleaseId: expiredId,
      deps: {
        ...presentationDeps,
        now: () => new Date("2026-08-06T10:00:00.000Z"),
        storage: storageFixture({
          listener: {
            release: release({
              id: expiredId,
              releaseDate: "2026-08-05T00:00:00.000Z",
              releaseTimingMode: "exact",
              releaseAt: "2026-08-05T10:00:00.000Z",
            }),
            isSaved: true,
          },
          savedCandidates: [
            release({
              id: expiredId,
              releaseDate: "2026-08-05T00:00:00.000Z",
              releaseTimingMode: "exact",
              releaseAt: "2026-08-05T10:00:00.000Z",
            }),
            release({
              id: nextId,
              title: "Saved Next",
              releaseDate: "2026-08-20T00:00:00.000Z",
            }),
          ],
        }),
      },
    });
    assert.equal(payload.mode, "listener");
    assert.equal(payload.advanceListenerSelectionTo, nextId);
    assert.equal(payload.release?.id, nextId);
    assert.equal(payload.retireListenerSelection, undefined);
  });

  it("does not auto-select an unsaved same-artist release", async () => {
    const expiredId = SELECTED_ID;
    const payload = await buildHomeWidgetPayload({
      profile: profile(),
      selectedReleaseId: expiredId,
      deps: {
        ...presentationDeps,
        now: () => new Date("2026-08-06T10:00:00.000Z"),
        storage: storageFixture({
          listener: {
            release: release({
              id: expiredId,
              releaseDate: "2026-08-05T00:00:00.000Z",
              releaseTimingMode: "exact",
              releaseAt: "2026-08-05T10:00:00.000Z",
            }),
            isSaved: true,
          },
          // Only the expired release is in Saved — same-artist futures are absent.
          savedCandidates: [
            release({
              id: expiredId,
              releaseDate: "2026-08-05T00:00:00.000Z",
              releaseTimingMode: "exact",
              releaseAt: "2026-08-05T10:00:00.000Z",
            }),
          ],
        }),
      },
    });
    assert.equal(payload.mode, "empty");
    assert.equal(payload.retireListenerSelection, true);
    assert.equal(payload.advanceListenerSelectionTo, undefined);
  });

  it("auto-advances to earliest Saved future and ignores later saved", async () => {
    const expiredId = SELECTED_ID;
    const earlier = "00000000-0000-4000-8000-0000000000b1";
    const later = "00000000-0000-4000-8000-0000000000b2";
    const payload = await buildHomeWidgetPayload({
      profile: profile(),
      selectedReleaseId: expiredId,
      deps: {
        ...presentationDeps,
        now: () => new Date("2026-08-06T10:00:00.000Z"),
        storage: storageFixture({
          listener: {
            release: release({
              id: expiredId,
              releaseDate: "2026-08-05T00:00:00.000Z",
              releaseTimingMode: "exact",
              releaseAt: "2026-08-05T10:00:00.000Z",
            }),
            isSaved: true,
          },
          savedCandidates: [
            release({
              id: later,
              releaseDate: "2026-09-01T00:00:00.000Z",
            }),
            release({
              id: earlier,
              releaseDate: "2026-08-15T00:00:00.000Z",
            }),
          ],
        }),
      },
    });
    assert.equal(payload.advanceListenerSelectionTo, earlier);
    assert.equal(payload.release?.id, earlier);
  });

  it("retires listener selection when Out-now expires with no future Saved Release", async () => {
    const payload = await buildHomeWidgetPayload({
      profile: profile(),
      selectedReleaseId: SELECTED_ID,
      viewerTimeZone: "Europe/London",
      deps: {
        ...presentationDeps,
        storage: storageFixture({
          listener: {
            release: release({ releaseDate: "2025-01-01T00:00:00.000Z" }),
            isSaved: true,
          },
          savedCandidates: [
            release({ releaseDate: "2025-01-01T00:00:00.000Z" }),
          ],
        }),
      },
    });
    assert.equal(payload.mode, "empty");
    assert.equal(payload.eligibility, "selected_release_out_now_expired");
    assert.equal(payload.retireListenerSelection, true);
    assert.equal(payload.advanceListenerSelectionTo, undefined);
    assert.equal(payload.release, null);
  });

  it("Midnight missing viewerTimeZone does not retire or auto-advance", async () => {
    const payload = await buildHomeWidgetPayload({
      profile: profile(),
      selectedReleaseId: SELECTED_ID,
      deps: {
        ...presentationDeps,
        storage: storageFixture({
          listener: {
            release: release({ releaseDate: "2025-01-01T00:00:00.000Z" }),
            isSaved: true,
          },
          savedCandidates: [
            release({ releaseDate: "2025-01-01T00:00:00.000Z" }),
            release({
              id: "00000000-0000-4000-8000-0000000000d1",
              releaseDate: "2026-09-01T00:00:00.000Z",
            }),
          ],
        }),
      },
    });
    assert.equal(payload.mode, "listener");
    assert.equal(payload.release?.id, SELECTED_ID);
    assert.equal(payload.retireListenerSelection, undefined);
    assert.equal(payload.advanceListenerSelectionTo, undefined);
  });

  it("Exact missing viewerTimeZone still retires via release_at + 24h", async () => {
    const payload = await buildHomeWidgetPayload({
      profile: profile(),
      selectedReleaseId: SELECTED_ID,
      deps: {
        ...presentationDeps,
        now: () => new Date("2026-08-06T10:00:00.000Z"),
        storage: storageFixture({
          listener: {
            release: release({
              releaseDate: "2026-08-05T00:00:00.000Z",
              releaseTimingMode: "exact",
              releaseAt: "2026-08-05T10:00:00.000Z",
            }),
            isSaved: true,
          },
          savedCandidates: [
            release({
              releaseDate: "2026-08-05T00:00:00.000Z",
              releaseTimingMode: "exact",
              releaseAt: "2026-08-05T10:00:00.000Z",
            }),
          ],
        }),
      },
    });
    assert.equal(payload.mode, "empty");
    assert.equal(payload.retireListenerSelection, true);
  });

  it("skips suspended Saved Release when auto-advancing", async () => {
    const expiredId = SELECTED_ID;
    const suspended = "00000000-0000-4000-8000-0000000000c1";
    const ok = "00000000-0000-4000-8000-0000000000c2";
    const payload = await buildHomeWidgetPayload({
      profile: profile(),
      selectedReleaseId: expiredId,
      deps: {
        ...presentationDeps,
        now: () => new Date("2026-08-06T10:00:00.000Z"),
        storage: storageFixture({
          listener: {
            release: release({
              id: expiredId,
              releaseDate: "2026-08-05T00:00:00.000Z",
              releaseTimingMode: "exact",
              releaseAt: "2026-08-05T10:00:00.000Z",
            }),
            isSaved: true,
          },
          savedCandidates: [
            release({
              id: suspended,
              releaseDate: "2026-08-12T00:00:00.000Z",
              subscriptionSuspendedAt: "2026-08-01T00:00:00.000Z",
            }),
            release({
              id: ok,
              releaseDate: "2026-08-18T00:00:00.000Z",
            }),
          ],
        }),
      },
    });
    assert.equal(payload.advanceListenerSelectionTo, ok);
  });

  it("keeps Exact listener Out now within 24h retention", async () => {
    const payload = await buildHomeWidgetPayload({
      profile: profile(),
      selectedReleaseId: SELECTED_ID,
      deps: {
        ...presentationDeps,
        now: () => new Date("2026-08-06T09:59:00.000Z"),
        storage: storageFixture({
          listener: {
            release: release({
              releaseDate: "2026-08-05T00:00:00.000Z",
              releaseTimingMode: "exact",
              releaseAt: "2026-08-05T10:00:00.000Z",
            }),
            isSaved: true,
          },
        }),
      },
    });
    assert.equal(payload.mode, "listener");
    assert.equal(payload.release?.isOutNow, true);
  });

  it("rejects unsaved, unavailable, undated, missing, and malformed selections", async () => {
    const cases: Array<{
      id: string;
      selection: HomeWidgetListenerSelectionRow;
      reason: string;
    }> = [
      {
        id: SELECTED_ID,
        selection: { release: release(), isSaved: false },
        reason: "selected_release_not_saved",
      },
      {
        id: SELECTED_ID,
        selection: {
          release: release({ subscriptionSuspendedAt: NOW }),
          isSaved: true,
        },
        reason: "selected_release_unavailable",
      },
      {
        id: SELECTED_ID,
        selection: {
          release: release({ releaseDate: null, isComingSoon: true }),
          isSaved: true,
        },
        reason: "selected_release_undated",
      },
      {
        id: SELECTED_ID,
        selection: { release: null, isSaved: false },
        reason: "invalid_listener_selection",
      },
    ];

    for (const testCase of cases) {
      const payload = await buildHomeWidgetPayload({
        profile: profile(),
        selectedReleaseId: testCase.id,
        deps: {
          ...presentationDeps,
          storage: storageFixture({ listener: testCase.selection }),
        },
      });
      assert.equal(payload.mode, "empty");
      assert.equal(payload.eligibility, testCase.reason);
      assert.equal(payload.release, null);
    }

    const malformed = await buildHomeWidgetPayload({
      profile: profile(),
      selectedReleaseId: "not-a-uuid",
      deps: {
        ...presentationDeps,
        storage: storageFixture(),
      },
    });
    assert.equal(malformed.eligibility, "invalid_listener_selection");
  });

  it("returns only the minimal public DTO with canonical artwork/deep-link/expiry", async () => {
    const payload = await buildHomeWidgetPayload({
      profile: profile(),
      selectedReleaseId: SELECTED_ID,
      deps: {
        ...presentationDeps,
        storage: storageFixture({
          listener: { release: release(), isSaved: true },
        }),
      },
    });
    assert.deepEqual(Object.keys(payload).sort(), [
      "eligibility",
      "expiresAt",
      "generatedAt",
      "mode",
      "release",
    ]);
    assert.deepEqual(Object.keys(payload.release ?? {}).sort(), [
      "artistName",
      "artworkUrl",
      "countdownLabel",
      "deepLink",
      "id",
      "isOutNow",
      "releaseAnnouncedAt",
      "releaseAt",
      "releaseCalendarDate",
      "releaseDate",
      "timingMode",
      "title",
    ]);
    assert.equal(payload.release?.timingMode, "midnight");
    assert.equal(payload.release?.releaseCalendarDate, "2026-08-06");
    assert.equal(payload.release?.releaseAt, null);
    assert.equal(payload.release?.releaseAnnouncedAt, null);
    assert.equal(
      payload.release?.deepLink,
      `https://dubhub.uk/?release=${SELECTED_ID}`,
    );
    assert.equal(
      payload.release?.artworkUrl,
      "https://storage.example/public/release-artworks/release/path.jpg",
    );
    assert.equal(payload.generatedAt, "2026-08-05T12:00:00.000Z");
    assert.equal(payload.expiresAt, "2026-08-07T12:00:00.000Z");
    assert.doesNotMatch(JSON.stringify(payload), /revenuecat|billing|grace|jwt|entitlement/i);
  });
});
