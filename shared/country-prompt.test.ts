import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  COUNTRY_PROMPT_LEADERBOARD_SETTLE_MS,
  COUNTRY_PROMPT_MIGRATION_ALLOWLIST,
  COUNTRY_PROMPT_MIGRATION_ALLOWLIST_COUNT,
  COUNTRY_PICKER_LEADERBOARD_HREF,
  isLeaderboardRouteForCountryPrompt,
  resolveCountryPickerReturnTo,
  shouldShowCountryPrompt,
} from "./country-prompt";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const migrationSrc = readFileSync(
  join(root, "supabase/migrations/20260917160000_country_prompt_pending.sql"),
  "utf8",
);
const schemaSrc = readFileSync(join(root, "shared/schema.ts"), "utf8");
const routesSrc = readFileSync(join(root, "server/routes.ts"), "utf8");
const userContextSrc = readFileSync(
  join(root, "client/src/lib/user-context.tsx"),
  "utf8",
);
const hostSrc = readFileSync(
  join(root, "client/src/components/country-prompt-host.tsx"),
  "utf8",
);
const appSrc = readFileSync(join(root, "client/src/App.tsx"), "utf8");
const settingsCountrySrc = readFileSync(
  join(root, "client/src/pages/settings-country.tsx"),
  "utf8",
);
const invalidateSrc = readFileSync(
  join(root, "client/src/lib/leaderboard-country-invalidate.ts"),
  "utf8",
);
const countryLeaderboardTestSrc = readFileSync(
  join(root, "client/src/lib/country-profile-leaderboard.test.ts"),
  "utf8",
);

describe("country prompt eligibility contract", () => {
  it("shows only when pending true AND country null", () => {
    assert.equal(
      shouldShowCountryPrompt({
        countryPromptPending: true,
        countryCode: null,
      }),
      true,
    );
    assert.equal(
      shouldShowCountryPrompt({
        countryPromptPending: true,
        countryCode: undefined,
      }),
      true,
    );
  });

  it("does not show for unlisted / non-pending null country", () => {
    assert.equal(
      shouldShowCountryPrompt({
        countryPromptPending: false,
        countryCode: null,
      }),
      false,
    );
  });

  it("does not show when country already set (e.g. GB allowlist)", () => {
    assert.equal(
      shouldShowCountryPrompt({
        countryPromptPending: true,
        countryCode: "GB",
      }),
      false,
    );
    assert.equal(
      shouldShowCountryPrompt({
        countryPromptPending: true,
        countryCode: "  ",
      }),
      true,
    );
  });

  it("never uses country_code IS NULL alone as a prompt gate in app code", () => {
    assert.doesNotMatch(hostSrc, /country_code\s+IS\s+NULL/i);
    assert.doesNotMatch(userContextSrc, /country_code\s+IS\s+NULL/i);
    assert.match(hostSrc, /shouldShowCountryPrompt/);
    assert.match(hostSrc, /countryPromptPending/);
  });
});

describe("country prompt Leaderboard route gate + settle", () => {
  it("gates visible prompt to /leaderboard only (query-safe)", () => {
    assert.equal(isLeaderboardRouteForCountryPrompt("/leaderboard"), true);
    assert.equal(isLeaderboardRouteForCountryPrompt("/leaderboard?tab=artists"), true);
    assert.equal(isLeaderboardRouteForCountryPrompt("/leaderboard#top"), true);
    assert.equal(isLeaderboardRouteForCountryPrompt("/"), false);
    assert.equal(isLeaderboardRouteForCountryPrompt("/profile"), false);
    assert.equal(isLeaderboardRouteForCountryPrompt("/settings"), false);
    assert.equal(isLeaderboardRouteForCountryPrompt("/leaderboards"), false);
    assert.equal(isLeaderboardRouteForCountryPrompt(null), false);
  });

  it("uses 350ms settle delay and cancels timer on leave", () => {
    assert.equal(COUNTRY_PROMPT_LEADERBOARD_SETTLE_MS, 350);
    assert.match(hostSrc, /COUNTRY_PROMPT_LEADERBOARD_SETTLE_MS/);
    assert.match(hostSrc, /isLeaderboardRouteForCountryPrompt/);
    assert.match(hostSrc, /window\.setTimeout/);
    assert.match(hostSrc, /window\.clearTimeout\(timer\)/);
    assert.match(hostSrc, /setOpen\(false\)/);
    // Leaving LB must not call dismiss — only hide.
    const openEffectSlice = hostSrc.slice(
      hostSrc.indexOf("Visible prompt: Leaderboard"),
      hostSrc.indexOf("const handleNotNow"),
    );
    assert.doesNotMatch(openEffectSlice, /country-prompt\/dismiss/);
  });

  it("Community and Artists share the same /leaderboard route (both qualify)", () => {
    // Single route; scope tabs live on the page — gate is path-only.
    assert.equal(isLeaderboardRouteForCountryPrompt("/leaderboard"), true);
    assert.match(appSrc, /path="\/leaderboard"/);
    assert.doesNotMatch(hostSrc, /activeTab|LeaderboardScope/);
  });

  it("keeps stale-pending cleanup global (not Leaderboard-gated)", () => {
    assert.match(
      hostSrc,
      /already have country_code: clear pending globally/,
    );
    const staleStart = hostSrc.indexOf(
      "already have country_code: clear pending globally",
    );
    const visibleStart = hostSrc.indexOf("Visible prompt: Leaderboard");
    assert.ok(staleStart >= 0 && visibleStart > staleStart);
    const staleSlice = hostSrc.slice(staleStart, visibleStart);
    assert.match(staleSlice, /country-prompt\/dismiss/);
    assert.doesNotMatch(staleSlice, /isLeaderboardRouteForCountryPrompt/);
    assert.doesNotMatch(staleSlice, /COUNTRY_PROMPT_LEADERBOARD_SETTLE_MS/);
  });

  it("host stays globally mounted in App (not moved into leaderboard.tsx)", () => {
    assert.match(appSrc, /CountryPromptHost/);
    const leaderboardSrc = readFileSync(
      join(root, "client/src/pages/leaderboard.tsx"),
      "utf8",
    );
    assert.doesNotMatch(leaderboardSrc, /CountryPromptHost/);
  });
});

describe("country prompt copy + centred icon", () => {
  it("uses approved copy exactly", () => {
    assert.match(hostSrc, /Show your flag/);
    assert.match(
      hostSrc,
      /Choose your country to add your flag to the Leaderboard\./,
    );
    assert.match(hostSrc, /Choose country/);
    assert.match(hostSrc, /Not now/);
    assert.doesNotMatch(hostSrc, /Add your country so it appears beside your name/);
    assert.doesNotMatch(hostSrc, /Show your flag on the leaderboard/);
    assert.match(
      hostSrc,
      /AlertDialogTitle[\s\S]*?Show your flag[\s\S]*?AlertDialogTitle/,
    );
  });

  it("centres a large globe icon above the title", () => {
    assert.match(hostSrc, /h-16 w-16/);
    assert.match(hostSrc, /Globe2 className="h-8 w-8/);
    assert.match(hostSrc, /items-center/);
    assert.match(hostSrc, /text-center sm:text-center/);
    assert.match(hostSrc, /mx-auto/);
    assert.match(hostSrc, /data-testid="country-prompt-icon"/);
    assert.doesNotMatch(hostSrc, /h-10 w-10/);
    assert.doesNotMatch(hostSrc, /Globe2 className="h-5 w-5/);
  });
});

describe("country prompt migration allowlist", () => {
  it("targets exactly 88 unique UUIDs in SQL and TS", () => {
    assert.equal(COUNTRY_PROMPT_MIGRATION_ALLOWLIST_COUNT, 88);
    assert.equal(COUNTRY_PROMPT_MIGRATION_ALLOWLIST.length, 88);
    assert.equal(new Set(COUNTRY_PROMPT_MIGRATION_ALLOWLIST).size, 88);

    const sqlUuids = [...migrationSrc.matchAll(/'([0-9a-f-]{36})'::uuid/gi)].map(
      (m) => m[1]!.toLowerCase(),
    );
    assert.equal(sqlUuids.length, 88);
    assert.equal(new Set(sqlUuids).size, 88);
    assert.deepEqual(
      [...sqlUuids].sort(),
      [...COUNTRY_PROMPT_MIGRATION_ALLOWLIST].map((id) => id.toLowerCase()).sort(),
    );
  });

  it("adds country_prompt_pending NOT NULL DEFAULT false (new profiles inherit false)", () => {
    assert.match(
      migrationSrc,
      /country_prompt_pending boolean NOT NULL DEFAULT false/,
    );
    assert.match(
      schemaSrc,
      /country_prompt_pending: boolean\("country_prompt_pending"\)\.notNull\(\)\.default\(false\)/,
    );
    assert.match(migrationSrc, /SET country_prompt_pending = true/);
    assert.match(
      migrationSrc,
      /SET country_prompt_pending = false[\s\S]*country_code IS NOT NULL/,
    );
    assert.doesNotMatch(
      migrationSrc,
      /SET country_prompt_pending = true[\s\S]*country_code IS NULL/,
    );
  });

  it("includes the GB example UUID on the allowlist", () => {
    assert.ok(
      COUNTRY_PROMPT_MIGRATION_ALLOWLIST.includes(
        "9467b8d4-dfc0-4ad3-888b-1c28d974c2c1",
      ),
    );
  });
});

describe("country prompt API + UI wiring", () => {
  it("clears pending on country PATCH and exposes dismiss endpoint", () => {
    assert.match(routesSrc, /app\.patch\("\/api\/user\/country"/);
    assert.match(routesSrc, /country_prompt_pending:\s*false/);
    assert.match(
      routesSrc,
      /app\.post\("\/api\/user\/country-prompt\/dismiss"/,
    );
  });

  it("hydrates pending from profiles and hosts prompt after auth", () => {
    assert.match(userContextSrc, /country_prompt_pending/);
    assert.match(userContextSrc, /countryPromptPending/);
    assert.match(userContextSrc, /updateCountryPromptPending/);
    assert.match(appSrc, /CountryPromptHost/);
    assert.match(hostSrc, /\/api\/user\/country-prompt\/dismiss/);
    assert.match(hostSrc, /COUNTRY_PICKER_LEADERBOARD_HREF/);
    assert.match(hostSrc, /blockingSurfaceActive/);
  });

  it("Not now and Choose country preserve one-time contract paths", () => {
    assert.match(hostSrc, /handleNotNow/);
    assert.match(hostSrc, /handleChooseCountry/);
    assert.match(hostSrc, /COUNTRY_PICKER_LEADERBOARD_HREF|returnTo=\/leaderboard/);
    assert.match(hostSrc, /updateCountryPromptPending\(false\)/);
    assert.match(hostSrc, /Not now/);
    assert.doesNotMatch(hostSrc, /mandatory|must choose|required/i);
  });

  it("successful settings save clears pending and invalidates leaderboards", () => {
    assert.match(settingsCountrySrc, /invalidateLeaderboardCountryQueries/);
    assert.match(settingsCountrySrc, /updateCountryPromptPending\(false\)/);
    assert.match(invalidateSrc, /\/api\/leaderboard\/users/);
    assert.match(invalidateSrc, /\/api\/leaderboard\/artists/);
    assert.match(invalidateSrc, /\/api\/leaderboard\/users\/my-rank/);
    assert.match(invalidateSrc, /\/api\/leaderboard\/artists\/my-rank/);
  });

  it("keeps existing Settings country flow intact", () => {
    assert.match(settingsCountrySrc, /apiRequest\("PATCH", "\/api\/user\/country"/);
    assert.match(settingsCountrySrc, /button-settings-country-clear/);
    assert.match(countryLeaderboardTestSrc, /registers Settings → Country route/);
  });
});

describe("country flow SVG + copy + return path", () => {
  const settingsSrc = readFileSync(join(root, "client/src/pages/settings.tsx"), "utf8");

  it("picker and Settings root use CountryFlag SVG; no emoji in Country flow UI", () => {
    assert.match(settingsCountrySrc, /CountryFlag/);
    assert.match(settingsCountrySrc, /COUNTRY_FLAG_PICKER_CLASS/);
    assert.doesNotMatch(settingsCountrySrc, /isoToFlagEmoji/);
    assert.match(settingsSrc, /CountryFlag/);
    assert.match(settingsSrc, /COUNTRY_FLAG_SETTINGS_ROW_CLASS/);
    assert.doesNotMatch(settingsSrc, /isoToFlagEmoji/);
    assert.doesNotMatch(hostSrc, /isoToFlagEmoji/);
  });

  it("picker copy is simplified without em dashes", () => {
    assert.match(settingsCountrySrc, /Choose your country/);
    assert.match(settingsCountrySrc, /Your flag appears on the Leaderboard\./);
    assert.match(settingsCountrySrc, /Search countries/);
    assert.match(settingsCountrySrc, /Remove country/);
    assert.match(settingsCountrySrc, /Country saved/);
    assert.match(settingsCountrySrc, /Your flag is now on the Leaderboard\./);
    assert.match(settingsCountrySrc, /Country removed/);
    assert.match(settingsCountrySrc, /Couldn.t save\. Try again\./);
    assert.doesNotMatch(settingsCountrySrc, /—/);
    assert.doesNotMatch(settingsCountrySrc, /This is not nationality/);
    assert.doesNotMatch(settingsCountrySrc, /Appears on Leaderboard rows/);
    assert.doesNotMatch(settingsCountrySrc, /No flag until you choose/);
    assert.doesNotMatch(settingsSrc, /Optional — shown on Leaderboard/);
    assert.match(settingsSrc, /Shown on Leaderboard/);
  });

  it("prompt-launched picker returns to Leaderboard; Settings path returns to Settings", () => {
    assert.match(settingsCountrySrc, /resolveCountryPickerReturnTo/);
    assert.match(settingsCountrySrc, /useSearch/);
    assert.match(settingsCountrySrc, /returnTo/);
    assert.match(hostSrc, /COUNTRY_PICKER_LEADERBOARD_HREF|returnTo=\/leaderboard/);
    // Save must not auto-navigate away (Back owns return).
    assert.doesNotMatch(
      settingsCountrySrc,
      /if \(saved\)[\s\S]{0,200}navigate\("\/leaderboard"/,
    );
    assert.match(settingsCountrySrc, /navigate\(returnTo/);
  });
});

describe("country picker returnTo resolver", () => {
  it("maps allowlisted returnTo=/leaderboard; defaults everything else to /settings", () => {
    assert.equal(resolveCountryPickerReturnTo("returnTo=/leaderboard"), "/leaderboard");
    assert.equal(resolveCountryPickerReturnTo("?returnTo=/leaderboard"), "/leaderboard");
    assert.equal(resolveCountryPickerReturnTo(""), "/settings");
    assert.equal(resolveCountryPickerReturnTo(null), "/settings");
    assert.equal(resolveCountryPickerReturnTo("returnTo=/settings"), "/settings");
    assert.equal(resolveCountryPickerReturnTo("returnTo=https://evil.example"), "/settings");
    assert.equal(resolveCountryPickerReturnTo("returnTo=/profile"), "/settings");
    assert.equal(resolveCountryPickerReturnTo("from=leaderboard"), "/settings");
    assert.match(COUNTRY_PICKER_LEADERBOARD_HREF, /returnTo=\/leaderboard/);
  });

  it("preserves return destination across save (captured state; no auto-nav)", () => {
    assert.match(settingsCountrySrc, /useState<CountryPickerReturnTo>/);
    assert.match(settingsCountrySrc, /Capture once so save/);
    assert.match(settingsCountrySrc, /invalidateLeaderboardCountryQueries/);
    assert.match(settingsCountrySrc, /updateCountryPromptPending\(false\)/);
  });
});
