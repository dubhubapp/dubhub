/**
 * Phase 1 profiles hardening contracts:
 * - public_profiles allowlist view
 * - username availability reads public_profiles
 * - App / UserContext no longer select profiles.email
 * - public product surfaces remain on Express (unchanged)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkUsernameAvailability,
  HARD_RESERVED_USERNAMES,
  LEGACY_DECEASED_RESERVED_USERNAMES,
  LEGACY_DECEASED_UNAVAILABLE_MESSAGE,
} from "./usernameAvailability";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const migrationSrc = readFileSync(
  join(root, "supabase/migrations/20260917180000_public_profiles_view.sql"),
  "utf8",
);
const schemaDocSrc = readFileSync(join(root, "supabase-schema.md"), "utf8");
const usernameAvailabilitySrc = readFileSync(
  join(root, "shared/usernameAvailability.ts"),
  "utf8",
);
const appSrc = readFileSync(join(root, "client/src/App.tsx"), "utf8");
const userContextSrc = readFileSync(
  join(root, "client/src/lib/user-context.tsx"),
  "utf8",
);
const homeSrc = readFileSync(join(root, "client/src/pages/home.tsx"), "utf8");
const leaderboardSrc = readFileSync(
  join(root, "client/src/pages/leaderboard.tsx"),
  "utf8",
);
const commentsSrc = readFileSync(
  join(root, "client/src/components/comments-modal.tsx"),
  "utf8",
);
const publicProfileSrc = readFileSync(
  join(root, "client/src/pages/public-profile.tsx"),
  "utf8",
);

const APPROVED_PUBLIC_PROFILE_COLUMNS = [
  "id",
  "username",
  "avatar_url",
  "banner_url",
  "account_type",
  "verified_artist",
  "moderator",
  "country_code",
  "created_at",
] as const;

const FORBIDDEN_PUBLIC_PROFILE_COLUMNS = [
  "email",
  "banned",
  "suspended_until",
  "warning_count",
  "country_prompt_pending",
] as const;

function extractPublicProfilesSelectList(sql: string): string[] {
  const match = sql.match(
    /CREATE OR REPLACE VIEW public\.public_profiles[\s\S]*?AS\s*SELECT\s*([\s\S]*?)\s*FROM public\.profiles/i,
  );
  assert.ok(match, "expected public_profiles CREATE VIEW SELECT list");
  return match[1]
    .split(",")
    .map((part) => part.trim().replace(/^p\./i, "").toLowerCase())
    .filter(Boolean);
}

describe("public_profiles migration allowlist", () => {
  it("creates public.public_profiles with only approved public fields", () => {
    assert.match(migrationSrc, /CREATE OR REPLACE VIEW public\.public_profiles/);
    const cols = extractPublicProfilesSelectList(migrationSrc);
    assert.deepEqual(cols, [...APPROVED_PUBLIC_PROFILE_COLUMNS]);
  });

  it("excludes email and private/moderation columns from the view", () => {
    const cols = new Set(extractPublicProfilesSelectList(migrationSrc));
    for (const forbidden of FORBIDDEN_PUBLIC_PROFILE_COLUMNS) {
      assert.equal(cols.has(forbidden), false, `must not expose ${forbidden}`);
      assert.doesNotMatch(
        migrationSrc,
        new RegExp(`\\bp\\.${forbidden}\\b`, "i"),
      );
    }
  });

  it("uses security_invoker = false and SELECT-only grants; does not revoke base profiles", () => {
    assert.match(migrationSrc, /security_invoker\s*=\s*false/);
    assert.match(migrationSrc, /GRANT SELECT ON TABLE public\.public_profiles TO anon/);
    assert.match(
      migrationSrc,
      /GRANT SELECT ON TABLE public\.public_profiles TO authenticated/,
    );
    // Executable SQL only (ignore `--` comments that mention future Phase 2 revoke).
    const executableSql = migrationSrc
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");
    assert.doesNotMatch(
      executableSql,
      /REVOKE\s+(ALL|SELECT)\s+ON\s+(TABLE\s+)?public\.profiles/i,
    );
    assert.doesNotMatch(executableSql, /DROP POLICY/i);
    assert.doesNotMatch(
      executableSql,
      /Profiles are viewable by everyone|Users can view all profiles/,
    );
  });

  it("documents Phase 1 additive path and Phase 2 hardening in schema docs", () => {
    assert.match(schemaDocSrc, /## public_profiles/);
    assert.match(schemaDocSrc, /Phase 2 — applied/i);
    assert.match(schemaDocSrc, /email/);
    assert.match(schemaDocSrc, /security_invoker = false/);
  });
});

describe("username availability → public_profiles", () => {
  it("reads public_profiles instead of base profiles", () => {
    assert.match(usernameAvailabilitySrc, /\.from\(['"]public_profiles['"]\)/);
    assert.doesNotMatch(
      usernameAvailabilitySrc,
      /\.from\(['"]profiles['"]\)/,
    );
  });

  it("preserves reserved / taken / available behavior", async () => {
    const hard = HARD_RESERVED_USERNAMES[0];
    const hardResult = await checkUsernameAvailability({} as any, hard, "user");
    assert.equal(hardResult.available, false);
    assert.equal(hardResult.reason, "hard_reserved");

    const legacy = LEGACY_DECEASED_RESERVED_USERNAMES[0];
    const legacyResult = await checkUsernameAvailability(
      {} as any,
      legacy,
      "artist",
    );
    assert.equal(legacyResult.available, false);
    assert.equal(legacyResult.reason, "legacy_deceased");
    assert.equal(legacyResult.error, LEGACY_DECEASED_UNAVAILABLE_MESSAGE);

    const calls: Array<{ table: string; filters: unknown[] }> = [];
    const takenClient = {
      from(table: string) {
        calls.push({ table, filters: [] });
        return {
          select() {
            return this;
          },
          ilike(_col: string, _val: string) {
            return Promise.resolve({
              data: [{ username: "takenuser" }],
              error: null,
            });
          },
        };
      },
      rpc() {
        return Promise.resolve({ data: false, error: null });
      },
    };
    const taken = await checkUsernameAvailability(
      takenClient as any,
      "TakenUser",
      "user",
    );
    assert.equal(taken.available, false);
    assert.equal(taken.reason, "taken");
    assert.equal(calls[0]?.table, "public_profiles");

    const availableClient = {
      from(table: string) {
        assert.equal(table, "public_profiles");
        return {
          select() {
            return this;
          },
          ilike() {
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
      rpc() {
        return Promise.resolve({ data: false, error: null });
      },
    };
    const available = await checkUsernameAvailability(
      availableClient as any,
      "brand_new_user_xyz",
      "user",
    );
    assert.equal(available.available, true);
  });
});

describe("client profiles.email selects removed", () => {
  it("App no longer selects profiles.email; uses session.user.email for onboarding", () => {
    assert.doesNotMatch(
      appSrc,
      /\.from\(['"]profiles['"]\)\s*\n\s*\.select\([^)]*email/s,
    );
    assert.doesNotMatch(appSrc, /profileData\.email/);
    assert.match(
      appSrc,
      /maybeQueueFirstLoginOnboarding\(\{[\s\S]*?email:\s*session\.user\.email/,
    );
    // Self hydration still targets base profiles with enforcement fields.
    assert.match(
      appSrc,
      /\.from\(['"]profiles['"]\)\s*\n\s*\.select\(['"]id, username, avatar_url, account_type, moderator, verified_artist, suspended_until, banned['"]\)/s,
    );
  });

  it("UserContext no longer selects profiles.email; self hydration otherwise unchanged", () => {
    assert.doesNotMatch(
      userContextSrc,
      /\.select\(\s*[\s\S]*?\bemail\b/,
    );
    assert.match(
      userContextSrc,
      /\.from\(['"]profiles['"]\)\s*\n\s*\.select\(\s*[\s\S]*?id, username, avatar_url, banner_url, account_type, verified_artist, moderator, created_at, country_code, country_prompt_pending/,
    );
    assert.match(userContextSrc, /setCountryCode\(profileData\.country_code/);
    assert.match(
      userContextSrc,
      /setCountryPromptPending\(profileData\.country_prompt_pending === true\)/,
    );
    assert.match(userContextSrc, /setVerifiedArtist/);
    assert.match(userContextSrc, /setIsModerator/);
  });
});

describe("public product surfaces not migrated off Express", () => {
  it("does not introduce direct public_profiles client reads on feed/LB/comments/public profile", () => {
    for (const [name, src] of [
      ["home", homeSrc],
      ["leaderboard", leaderboardSrc],
      ["comments", commentsSrc],
      ["public-profile", publicProfileSrc],
    ] as const) {
      assert.doesNotMatch(
        src,
        /\.from\(['"]public_profiles['"]\)/,
        `${name} must not query public_profiles directly`,
      );
      assert.doesNotMatch(
        src,
        /\.from\(['"]profiles['"]\)/,
        `${name} must not query base profiles directly`,
      );
    }
  });
});
