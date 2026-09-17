import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  COUNTRY_OPTIONS,
  filterCountryOptions,
  getCountryDisplayName,
  isoToFlagEmoji,
  normalizeCountryCode,
  parseCountryCodeInput,
} from "@shared/country-codes";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const migrationSrc = readFileSync(
  join(root, "supabase/migrations/20260917140000_profiles_country_code.sql"),
  "utf8",
);
const schemaSrc = readFileSync(join(root, "shared/schema.ts"), "utf8");
const storageSrc = readFileSync(join(root, "server/storage.ts"), "utf8");
const routesSrc = readFileSync(join(root, "server/routes.ts"), "utf8");
const leaderboardSrc = readFileSync(join(root, "client/src/pages/leaderboard.tsx"), "utf8");
const settingsSrc = readFileSync(join(root, "client/src/pages/settings.tsx"), "utf8");
const settingsCountrySrc = readFileSync(
  join(root, "client/src/pages/settings-country.tsx"),
  "utf8",
);
const appSrc = readFileSync(join(root, "client/src/App.tsx"), "utf8");

describe("country-codes helpers", () => {
  it("accepts NULL / empty as clear", () => {
    assert.deepEqual(parseCountryCodeInput(null), { ok: true, countryCode: null });
    assert.deepEqual(parseCountryCodeInput(undefined), { ok: true, countryCode: null });
    assert.deepEqual(parseCountryCodeInput(""), { ok: true, countryCode: null });
    assert.deepEqual(parseCountryCodeInput("   "), { ok: true, countryCode: null });
    assert.equal(normalizeCountryCode(null), null);
  });

  it("accepts valid uppercase ISO2 and normalizes lowercase", () => {
    assert.deepEqual(parseCountryCodeInput("GB"), { ok: true, countryCode: "GB" });
    assert.deepEqual(parseCountryCodeInput("us"), { ok: true, countryCode: "US" });
    assert.deepEqual(parseCountryCodeInput(" De "), { ok: true, countryCode: "DE" });
  });

  it("rejects invalid / unknown codes", () => {
    assert.equal(parseCountryCodeInput("g").ok, false);
    assert.equal(parseCountryCodeInput("GBR").ok, false);
    assert.equal(parseCountryCodeInput("12").ok, false);
    assert.equal(parseCountryCodeInput("XX").ok, false);
    assert.equal(parseCountryCodeInput("🇬🇧").ok, false);
  });

  it("maps GB → 🇬🇧 and US → 🇺🇸; NULL → no flag", () => {
    assert.equal(isoToFlagEmoji("GB"), "🇬🇧");
    assert.equal(isoToFlagEmoji("US"), "🇺🇸");
    assert.equal(isoToFlagEmoji(null), null);
    assert.equal(isoToFlagEmoji("XX"), null);
    assert.equal(isoToFlagEmoji(""), null);
  });

  it("resolves display names and filters the list", () => {
    assert.equal(getCountryDisplayName("GB"), "United Kingdom");
    assert.equal(getCountryDisplayName(null), null);
    assert.ok(COUNTRY_OPTIONS.length >= 200);
    const ukHits = filterCountryOptions("united king");
    assert.ok(ukHits.some((c) => c.code === "GB"));
  });
});

describe("country schema + migration", () => {
  it("adds nullable country_code with ISO2 CHECK", () => {
    assert.match(migrationSrc, /ADD COLUMN IF NOT EXISTS country_code text NULL/);
    assert.match(migrationSrc, /profiles_country_code_iso2/);
    assert.match(migrationSrc, /country_code ~ '\^\[A-Z\]\{2\}\$'/);
    assert.match(schemaSrc, /country_code: text\("country_code"\)/);
    assert.doesNotMatch(schemaSrc, /birth_year|age_band|gender|date_of_birth/);
  });
});

describe("country API + storage", () => {
  it("exposes PATCH /api/user/country with parseCountryCodeInput", () => {
    assert.match(routesSrc, /app\.patch\("\/api\/user\/country"/);
    assert.match(routesSrc, /parseCountryCodeInput/);
    assert.match(routesSrc, /country_code: parsed\.countryCode/);
    assert.match(routesSrc, /country_prompt_pending:\s*false/);
    assert.match(routesSrc, /use null to clear|country_code is required/i);
  });

  it("includes country_code in leaderboard list + my-rank queries (no N+1)", () => {
    assert.match(storageSrc, /p\.country_code/);
    // Both list SELECT and my-rank scoped CTE / final select.
    const hits = storageSrc.match(/p\.country_code/g) ?? [];
    assert.ok(hits.length >= 2, `expected ≥2 p.country_code refs, got ${hits.length}`);
    assert.match(storageSrc, /country_code: row\.country_code \?\? null/);
    assert.doesNotMatch(storageSrc, /for \(.*leaderboard.*\)[\s\S]{0,200}from\("profiles"\)/);
  });
});

describe("country Settings UI", () => {
  it("registers Settings → Country route and picker page", () => {
    assert.match(appSrc, /path="\/settings\/country"/);
    assert.match(appSrc, /SettingsCountryPage/);
    assert.match(settingsSrc, /button-settings-country/);
    assert.match(settingsSrc, /navigate\("\/settings\/country"\)/);
    assert.match(settingsCountrySrc, /PATCH.*\/api\/user\/country|apiRequest\("PATCH", "\/api\/user\/country"/);
    assert.match(settingsCountrySrc, /button-settings-country-clear/);
    assert.match(settingsCountrySrc, /input-settings-country-search/);
    assert.doesNotMatch(settingsCountrySrc, /Nationality/);
  });

  it("uses CountryFlag SVG in picker and Settings root; no emoji in Country flow", () => {
    assert.match(settingsCountrySrc, /from "@\/components\/country-flag"/);
    assert.match(settingsCountrySrc, /CountryFlag/);
    assert.match(settingsCountrySrc, /COUNTRY_FLAG_PICKER_CLASS/);
    assert.doesNotMatch(settingsCountrySrc, /isoToFlagEmoji/);
    assert.match(settingsSrc, /CountryFlag/);
    assert.match(settingsSrc, /Shown on Leaderboard/);
    assert.doesNotMatch(settingsSrc, /isoToFlagEmoji/);
    assert.doesNotMatch(settingsSrc, /Optional —/);
  });
});

describe("leaderboard flag presentation", () => {
  it("uses CountryFlag SVG before Rep/trust in secondary row (not beside ID score)", () => {
    assert.match(leaderboardSrc, /CountryFlag/);
    assert.match(leaderboardSrc, /from "@\/components\/country-flag"/);
    assert.match(leaderboardSrc, /data-testid=\{`country-flag-\$\{entry\.user_id\}`\}/);
    assert.match(leaderboardSrc, /country_code\?: string \| null/);
    assert.match(leaderboardSrc, /className="w-10 flex items-center justify-center"/);
    assert.match(leaderboardSrc, /LEADERBOARD_SCORE_COLUMN_CLASS/);
    assert.match(leaderboardSrc, /LeaderboardTopRankMark/);
    assert.doesNotMatch(leaderboardSrc, /isoToFlagEmoji/);
    assert.match(leaderboardSrc, /export function LeaderboardEntryRow/);
    const rowUses = leaderboardSrc.match(/<LeaderboardEntryRow\b/g) ?? [];
    assert.ok(rowUses.length >= 2);
    const flagMarkupIdx = leaderboardSrc.indexOf("<CountryFlag");
    const trustLabelIdx = leaderboardSrc.indexOf("{trustLevel.displayName}");
    const scoreMetricIdx = leaderboardSrc.indexOf(
      '{/* IDs metric — value remains entry.correct_ids */}',
    );
    assert.ok(flagMarkupIdx > 0);
    assert.ok(trustLabelIdx > flagMarkupIdx);
    assert.ok(scoreMetricIdx > trustLabelIdx);
  });

  it("does not add country to public profile / preview / comments surfaces in this slice", () => {
    assert.doesNotMatch(leaderboardSrc, /public profile|profile preview/i);
    const popupSrc = readFileSync(
      join(root, "client/src/components/user-profile-light-popup.tsx"),
      "utf8",
    );
    assert.doesNotMatch(popupSrc, /country_code|isoToFlagEmoji|CountryFlag/);
  });
});
