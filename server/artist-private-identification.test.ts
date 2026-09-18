import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  projectPublicArtistVerificationFields,
  publicPayloadLeaksAnonymousArtistId,
} from "@shared/artist-private-identification";
import {
  ANONYMOUS_ARTIST_IDENTIFICATION_ENV,
  isAnonymousArtistIdentificationEnabled,
  canArtistCreateAnonymousIdentification,
} from "./artist-private-identification-policy";
import type { ArtistSubscriptionSnapshot } from "./subscription-status-domain";

const here = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");
const serviceSrc = readFileSync(join(here, "artist-private-identification.ts"), "utf8");
const policySrc = readFileSync(
  join(here, "artist-private-identification-policy.ts"),
  "utf8",
);
const migrationSrc = readFileSync(
  join(here, "../supabase/migrations/20260918160000_artist_private_identifications.sql"),
  "utf8",
);

const ARTIST_ID = "00000000-0000-0000-0000-0000000000aa";
const OTHER_ARTIST = "00000000-0000-0000-0000-0000000000bb";
const now = new Date("2026-07-20T12:00:00.000Z");

function snapshotFixture(
  overrides: Partial<ArtistSubscriptionSnapshot> = {},
): ArtistSubscriptionSnapshot {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    userId: ARTIST_ID,
    provider: "revenuecat",
    providerEnvironment: "production",
    providerAppUserId: ARTIST_ID,
    entitlementIdentifier: "verified_artist_tools",
    productIdentifier: "dubhub_artist_monthly",
    store: "app_store",
    ownershipType: null,
    storeSubscriptionIdentifier: "orig_txn_1",
    isEntitlementActive: true,
    willRenew: true,
    hasBillingIssue: false,
    isInGracePeriod: false,
    isRefunded: false,
    isRevoked: false,
    unsubscribeDetected: false,
    originalPurchasedAt: new Date("2026-07-01T12:00:00.000Z"),
    latestPurchasedAt: new Date("2026-07-15T12:00:00.000Z"),
    expiresAt: new Date("2026-07-31T12:00:00.000Z"),
    providerEventAt: new Date("2026-07-20T09:00:00.000Z"),
    lastWebhookAt: null,
    lastRestReconciledAt: null,
    lastSuccessfulVerificationAt: new Date("2026-07-20T10:00:00.000Z"),
    staleAfterAt: new Date("2026-07-21T10:00:00.000Z"),
    rawProviderPayload: null,
    overrideType: null,
    overrideStartsAt: null,
    overrideEndsAt: null,
    overrideReason: null,
    overrideActor: null,
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    updatedAt: new Date("2026-07-20T10:05:00.000Z"),
    ...overrides,
  };
}

describe("VAT-ANON-1 public projection scrubbing", () => {
  it("H: anonymous state hides artistVerifiedBy and forces isVerifiedArtist false", () => {
    const projected = projectPublicArtistVerificationFields({
      is_artist_verified_anonymous: true,
      is_verified_artist: true,
      artist_verified_by: ARTIST_ID,
    });
    assert.equal(projected.isArtistVerifiedAnonymous, true);
    assert.equal(projected.isVerifiedArtist, false);
    assert.equal(projected.artistVerifiedBy, null);
    assert.equal(
      publicPayloadLeaksAnonymousArtistId({
        ...projected,
        verificationStatus: "identified",
      }),
      false,
    );
  });

  it("H: public confirmed artist path still exposes artistVerifiedBy", () => {
    const projected = projectPublicArtistVerificationFields({
      is_artist_verified_anonymous: false,
      is_verified_artist: true,
      artist_verified_by: ARTIST_ID,
    });
    assert.equal(projected.isArtistVerifiedAnonymous, false);
    assert.equal(projected.isVerifiedArtist, true);
    assert.equal(projected.artistVerifiedBy, ARTIST_ID);
  });

  it("H: leak detector catches username/avatar/profile joins and claim ids", () => {
    assert.equal(
      publicPayloadLeaksAnonymousArtistId({
        isArtistVerifiedAnonymous: true,
        artistVerifiedBy: null,
        isVerifiedArtist: false,
        verifiedArtist: { id: ARTIST_ID, username: "secret" },
      }),
      true,
    );
    assert.equal(
      publicPayloadLeaksAnonymousArtistId({
        isArtistVerifiedAnonymous: true,
        artistVerifiedBy: null,
        isVerifiedArtist: false,
        privateClaimId: "claim-1",
      }),
      true,
    );
  });
});

describe("VAT-ANON-1 feature flag / kill switch", () => {
  it("defaults enabled; 0/false/no disables writes", () => {
    assert.equal(isAnonymousArtistIdentificationEnabled({} as NodeJS.ProcessEnv), true);
    assert.equal(
      isAnonymousArtistIdentificationEnabled({
        [ANONYMOUS_ARTIST_IDENTIFICATION_ENV]: "false",
      } as NodeJS.ProcessEnv),
      false,
    );
    assert.equal(
      isAnonymousArtistIdentificationEnabled({
        [ANONYMOUS_ARTIST_IDENTIFICATION_ENV]: "0",
      } as NodeJS.ProcessEnv),
      false,
    );
  });
});

describe("VAT-ANON-1 entitlement helper", () => {
  it("A/free: unpaid snapshot cannot create anonymous identification", async () => {
    const allowed = await canArtistCreateAnonymousIdentification(ARTIST_ID, {
      getSnapshotsForUser: async () => ({
        production: snapshotFixture({
          isEntitlementActive: false,
          expiresAt: new Date("2026-07-01T00:00:00.000Z"),
        }),
        sandbox: null,
      }),
      resolveEnvironment: () => ({ environment: "production", reason: "test" }),
      now: () => now,
    });
    assert.equal(allowed, false);
  });

  it("B/paid: fresh active entitlement allows anonymous identification", async () => {
    const allowed = await canArtistCreateAnonymousIdentification(ARTIST_ID, {
      getSnapshotsForUser: async () => ({
        production: snapshotFixture(),
        sandbox: null,
      }),
      resolveEnvironment: () => ({ environment: "production", reason: "test" }),
      now: () => now,
    });
    assert.equal(allowed, true);
  });

  it("fails closed on stale snapshot", async () => {
    const allowed = await canArtistCreateAnonymousIdentification(ARTIST_ID, {
      getSnapshotsForUser: async () => ({
        production: snapshotFixture({
          lastSuccessfulVerificationAt: new Date("2026-07-01T10:00:00.000Z"),
          staleAfterAt: new Date("2026-07-02T10:00:00.000Z"),
        }),
        sandbox: null,
      }),
      resolveEnvironment: () => ({ environment: "production", reason: "test" }),
      now: () => now,
    });
    assert.equal(allowed, false);
  });
});

describe("VAT-ANON-1 route + serializer contracts", () => {
  it("registers anonymous identify + private owner/moderator paths", () => {
    assert.match(routesSrc, /\/api\/posts\/:id\/artist-identify-anonymous/);
    assert.match(routesSrc, /\/api\/posts\/:id\/artist-private-identification/);
    assert.match(routesSrc, /\/api\/artists\/me\/anonymous-identifications/);
    assert.match(
      routesSrc,
      /\/api\/moderator\/posts\/:postId\/artist-private-identification/,
    );
  });

  it("D: ignores client-supplied artist_id spoof on create", () => {
    assert.match(serviceSrc, /void input\.bodyArtistId/);
    assert.match(routesSrc, /bodyArtistId:\s*\(body as any\)\.artistId/);
    assert.match(routesSrc, /const artistId = req\.dbUser\.id/);
  });

  it("K/L: artist-confirm and artist-deny remain registered and ungated by VAT", () => {
    assert.match(routesSrc, /\/api\/posts\/:id\/artist-confirm/);
    assert.match(routesSrc, /\/api\/posts\/:id\/artist-deny/);
    const confirmIdx = routesSrc.indexOf('"/api/posts/:id/artist-confirm"');
    const confirmBlock = routesSrc.slice(confirmIdx, confirmIdx + 2500);
    assert.doesNotMatch(confirmBlock, /canArtistUsePaidTools|canArtistCreateAnonymousIdentification/);
    assert.doesNotMatch(confirmBlock, /PAID_ARTIST_TOOL_REQUIRED/);
  });

  it("blocks public confirm/deny once anonymous claim flag is set", () => {
    assert.match(routesSrc, /isArtistVerifiedAnonymous/);
    assert.match(routesSrc, /is_artist_verified_anonymous/);
  });

  it("H: storage public mappers use projectPublicArtistVerificationFields", () => {
    assert.match(storageSrc, /projectPublicArtistVerificationFields/);
    assert.match(storageSrc, /mapPublicArtistVerification/);
    assert.match(storageSrc, /isArtistVerifiedAnonymous: artistVerification\.isArtistVerifiedAnonymous/);
    assert.match(storageSrc, /artistVerifiedBy: artistVerification\.artistVerifiedBy/);
  });

  it("create path never sets artist_verified_by or confirm comment/notify", () => {
    assert.match(serviceSrc, /is_artist_verified_anonymous = true/);
    assert.doesNotMatch(serviceSrc, /artist_verified_by\s*=/);
    assert.doesNotMatch(serviceSrc, /artist_identified_post|track_identified|createComment/);
    assert.doesNotMatch(serviceSrc, /awardConfirmedIdKarma/);
    assert.match(policySrc, /canPerformIrreversiblePaidAction/);
  });
});

describe("VAT-ANON-1 migration contracts", () => {
  it("adds private claim table + public boolean; enables RLS with no public policies", () => {
    assert.match(migrationSrc, /CREATE TABLE IF NOT EXISTS public\.artist_private_identifications/);
    assert.match(migrationSrc, /is_artist_verified_anonymous boolean NOT NULL DEFAULT false/);
    assert.match(migrationSrc, /ENABLE ROW LEVEL SECURITY/);
    assert.match(migrationSrc, /state IN \('anonymous', 'revealed'\)/);
    assert.match(
      migrationSrc,
      /artist_private_identifications_one_claim_per_post_idx/,
    );
  });

  it("I: private table stores artist_id; posts must not store hidden artist_id", () => {
    assert.match(migrationSrc, /artist_id uuid NOT NULL REFERENCES public\.profiles\(id\)/);
    assert.match(
      migrationSrc,
      /Never store the claiming artist_id on posts while anonymous/,
    );
  });
});

describe("VAT-ANON-1 conflict semantics (documented in service)", () => {
  it("E/F/G: service rejects existing public verify, anonymous flag, and prior claim", () => {
    assert.match(serviceSrc, /ARTIST_ALREADY_VERIFIED/);
    assert.match(serviceSrc, /ANONYMOUS_CLAIM_EXISTS/);
    assert.match(serviceSrc, /is_verified_artist === true \|\| post\.artist_verified_by != null/);
    assert.match(serviceSrc, /is_artist_verified_anonymous === true/);
  });

  it("C: community users fail verified-artist gate before entitlement", () => {
    assert.match(serviceSrc, /VERIFIED_ARTIST_REQUIRED/);
    assert.match(serviceSrc, /account_type !== "artist"/);
  });

  it("J: moderator private path returns artistUsername + artistId", () => {
    assert.match(routesSrc, /artistUsername: claim\.artistUsername/);
    assert.match(routesSrc, /artistId: claim\.artistId/);
    assert.match(serviceSrc, /getAnonymousClaimForModerator/);
  });
});

describe("VAT-ANON-1 projection identity matrix", () => {
  it("never leaks OTHER_ARTIST when scrubbing anonymous rows", () => {
    const projected = projectPublicArtistVerificationFields({
      isArtistVerifiedAnonymous: true,
      artistVerifiedBy: OTHER_ARTIST,
      isVerifiedArtist: true,
    });
    assert.equal(projected.artistVerifiedBy, null);
    assert.notEqual(projected.artistVerifiedBy, OTHER_ARTIST);
  });
});
