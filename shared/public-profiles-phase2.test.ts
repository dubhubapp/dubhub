/**
 * Phase 2 profiles hardening contracts:
 * - revoke anon/public SELECT on base profiles
 * - authenticated self-only SELECT policy
 * - drop broad public SELECT-true policies
 * - public_profiles allowlist + grants unchanged
 * - username availability still uses public_profiles
 * - no client/server product-surface refactors required
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const phase1Src = readFileSync(
  join(root, "supabase/migrations/20260917180000_public_profiles_view.sql"),
  "utf8",
);
const phase2Src = readFileSync(
  join(root, "supabase/migrations/20260917190000_profiles_self_only_select.sql"),
  "utf8",
);
const schemaDocSrc = readFileSync(join(root, "supabase-schema.md"), "utf8");
const usernameAvailabilitySrc = readFileSync(
  join(root, "shared/usernameAvailability.ts"),
  "utf8",
);
const setupSrc = readFileSync(join(root, "supabase_setup.sql"), "utf8");
const appSrc = readFileSync(join(root, "client/src/App.tsx"), "utf8");
const userContextSrc = readFileSync(
  join(root, "client/src/lib/user-context.tsx"),
  "utf8",
);
const signInSrc = readFileSync(
  join(root, "client/src/components/auth/SignIn.tsx"),
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

function executableSql(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

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

describe("Phase 2 migration — base profiles SELECT hardening", () => {
  it("adds authenticated self-only SELECT policy (auth.uid() = id)", () => {
    assert.match(
      phase2Src,
      /CREATE POLICY "Users can select their own profile"/,
    );
    assert.match(phase2Src, /FOR SELECT\s+TO authenticated/s);
    assert.match(phase2Src, /USING \(auth\.uid\(\) = id\)/);
    assert.doesNotMatch(
      executableSql(phase2Src),
      /FOR SELECT\s+TO authenticated[\s\S]*USING\s*\(\s*true\s*\)/i,
    );
    assert.doesNotMatch(
      executableSql(phase2Src),
      /FOR SELECT\s+TO public[\s\S]*USING/i,
    );
  });

  it("drops both broad public SELECT-true policies defensively", () => {
    assert.match(
      phase2Src,
      /DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public\.profiles/,
    );
    assert.match(
      phase2Src,
      /DROP POLICY IF EXISTS "Users can view all profiles" ON public\.profiles/,
    );
  });

  it("revokes anon (and PUBLIC) SELECT on base profiles", () => {
    const sql = executableSql(phase2Src);
    assert.match(sql, /REVOKE SELECT ON TABLE public\.profiles FROM anon/i);
    assert.match(sql, /REVOKE SELECT ON TABLE public\.profiles FROM PUBLIC/i);
    assert.doesNotMatch(
      sql,
      /REVOKE\s+(ALL|SELECT)\s+ON\s+(TABLE\s+)?public\.profiles\s+FROM\s+authenticated/i,
    );
  });

  it("does not touch INSERT/UPDATE/DELETE policy definitions", () => {
    const sql = executableSql(phase2Src);
    assert.doesNotMatch(sql, /Users can insert their own profile/);
    assert.doesNotMatch(sql, /Users can update their own profile/);
    assert.doesNotMatch(sql, /Users can delete their own profile/);
    assert.doesNotMatch(sql, /FOR INSERT/);
    assert.doesNotMatch(sql, /FOR UPDATE/);
    assert.doesNotMatch(sql, /FOR DELETE/);
  });

  it("does not alter public_profiles columns or demographics", () => {
    assert.doesNotMatch(executableSql(phase2Src), /CREATE OR REPLACE VIEW/i);
    assert.doesNotMatch(phase2Src, /user_demographics|date_of_birth|gender/);
    assert.doesNotMatch(executableSql(phase2Src), /DROP COLUMN|ADD COLUMN/i);
    assert.doesNotMatch(executableSql(phase2Src), /\bemail\b/);
  });

  it("re-affirms public_profiles SELECT grants without changing allowlist", () => {
    assert.match(
      phase2Src,
      /GRANT SELECT ON TABLE public\.public_profiles TO anon/,
    );
    assert.match(
      phase2Src,
      /GRANT SELECT ON TABLE public\.public_profiles TO authenticated/,
    );
    const cols = extractPublicProfilesSelectList(phase1Src);
    assert.deepEqual(cols, [...APPROVED_PUBLIC_PROFILE_COLUMNS]);
    for (const forbidden of FORBIDDEN_PUBLIC_PROFILE_COLUMNS) {
      assert.equal(cols.includes(forbidden), false);
    }
  });

  it("documents rollback SQL restoring one broad public SELECT + anon grant", () => {
    assert.match(schemaDocSrc, /Phase 2 rollback/i);
    assert.match(schemaDocSrc, /GRANT SELECT ON TABLE public\.profiles TO anon/);
    assert.match(
      schemaDocSrc,
      /CREATE POLICY "Users can view all profiles"/,
    );
    assert.match(
      schemaDocSrc,
      /DROP POLICY IF EXISTS "Users can select their own profile"/,
    );
  });
});

describe("Phase 2 — clients remain self-only; username uses public_profiles", () => {
  it("username availability still reads public_profiles", () => {
    assert.match(usernameAvailabilitySrc, /\.from\(['"]public_profiles['"]\)/);
    assert.doesNotMatch(usernameAvailabilitySrc, /\.from\(['"]profiles['"]\)/);
  });

  it("App / UserContext / SignIn base profiles reads stay self-scoped", () => {
    assert.match(appSrc, /\.from\(['"]profiles['"]\)[\s\S]*?\.eq\(['"]id['"], sessionUserId\)/);
    assert.match(
      appSrc,
      /\.from\(['"]profiles['"]\)[\s\S]*?\.eq\(['"]id['"], signedInUserId\)/,
    );
    assert.match(
      userContextSrc,
      /\.from\(['"]profiles['"]\)[\s\S]*?\.eq\(['"]id['"], session\.user\.id\)/,
    );
    assert.match(
      signInSrc,
      /\.from\(['"]profiles['"]\)[\s\S]*?\.eq\(['"]id['"], currentUser\.id\)/,
    );
  });
});

describe("Phase 2 — schema / setup docs", () => {
  it("marks Phase 2 applied and keeps public_profiles allowlist docs", () => {
    assert.match(schemaDocSrc, /Phase 2 — applied/i);
    assert.match(schemaDocSrc, /Users can select their own profile/);
    assert.match(schemaDocSrc, /## public_profiles/);
    assert.doesNotMatch(schemaDocSrc, /Phase 2 \(not applied yet\)/);
  });

  it("supabase_setup no longer teaches public SELECT true on profiles", () => {
    const sql = executableSql(setupSrc);
    assert.doesNotMatch(
      sql,
      /CREATE POLICY "Users can view all profiles"[\s\S]*USING \(true\)/,
    );
    assert.match(
      setupSrc,
      /CREATE POLICY "Users can select their own profile"/,
    );
  });
});
