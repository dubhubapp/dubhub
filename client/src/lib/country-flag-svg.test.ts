import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  COUNTRY_FLAG_CLASS,
  getCountryFlagComponent,
} from "@/components/country-flag";
import { hasFlag } from "country-flag-icons";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const flagSrc = readFileSync(join(root, "client/src/components/country-flag.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(root, "client/src/pages/leaderboard.tsx"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

describe("CountryFlag — SVG package", () => {
  it("depends on country-flag-icons with local 3x2 React SVGs", () => {
    assert.match(packageJson, /"country-flag-icons"/);
    assert.match(flagSrc, /country-flag-icons\/react\/3x2/);
    assert.match(flagSrc, /hasFlag/);
    assert.doesNotMatch(flagSrc, /cdn|http:\/\/|https:\/\/|fetch\(/);
    assert.doesNotMatch(flagSrc, /isoToFlagEmoji|getUnicodeFlagIcon|unicode/i);
  });

  it("resolves GB and US SVG components; null/invalid → nothing", () => {
    assert.equal(hasFlag("GB"), true);
    assert.equal(hasFlag("US"), true);
    assert.equal(typeof getCountryFlagComponent("GB"), "function");
    assert.equal(typeof getCountryFlagComponent("US"), "function");
    assert.equal(getCountryFlagComponent(null), null);
    assert.equal(getCountryFlagComponent(undefined), null);
    assert.equal(getCountryFlagComponent(""), null);
    assert.equal(getCountryFlagComponent("XX"), null);
  });

  it("uses 3:2 rectangular size (~21×14) with no border/ring", () => {
    assert.match(COUNTRY_FLAG_CLASS, /h-\[14px\]/);
    assert.match(COUNTRY_FLAG_CLASS, /w-\[21px\]/);
    assert.match(COUNTRY_FLAG_CLASS, /rounded-\[2px\]/);
    assert.doesNotMatch(COUNTRY_FLAG_CLASS, /ring-|border|outline|shadow-|rounded-full|glow/);
  });

  it("exposes larger picker size (~24×16) for Country list rows", () => {
    assert.match(flagSrc, /COUNTRY_FLAG_PICKER_CLASS/);
    assert.match(flagSrc, /h-\[16px\].*w-\[24px\]|w-\[24px\].*h-\[16px\]/);
  });
});

describe("Leaderboard — SVG flag placement", () => {
  it("uses CountryFlag SVG; no emoji helper on Leaderboard", () => {
    assert.match(leaderboardSrc, /CountryFlag/);
    assert.match(leaderboardSrc, /from "@\/components\/country-flag"/);
    assert.match(leaderboardSrc, /data-testid=\{`country-flag-\$\{entry\.user_id\}`\}/);
    assert.doesNotMatch(leaderboardSrc, /isoToFlagEmoji/);
    assert.doesNotMatch(leaderboardSrc, /flagEmoji|🇬🇧|String\.fromCodePoint/);
  });

  it("places flag in secondary row before Rep/trust; not beside ID score", () => {
    const secondaryOpen = leaderboardSrc.indexOf(
      'className="relative z-0 flex min-w-0 items-center gap-2"',
    );
    const scoreColIdx = leaderboardSrc.indexOf(
      '{/* IDs metric — value remains entry.correct_ids */}',
    );
    assert.ok(secondaryOpen > 0);
    assert.ok(scoreColIdx > secondaryOpen);
    const secondaryBlock = leaderboardSrc.slice(secondaryOpen, scoreColIdx);
    assert.match(secondaryBlock, /<CountryFlag/);
    assert.match(secondaryBlock, /trustLevel\.displayName/);
    assert.match(secondaryBlock, /LEADERBOARD_REP_TRACK_CLASS/);
    assert.match(secondaryBlock, /flex shrink-0 items-center gap-1/);
    // Score area restored — no CountryFlag wrapper beside IDs.
    const scoreBlock = leaderboardSrc.slice(scoreColIdx, scoreColIdx + 500);
    assert.doesNotMatch(scoreBlock, /CountryFlag/);
    assert.match(scoreBlock, /LEADERBOARD_SCORE_COLUMN_CLASS/);
    assert.doesNotMatch(leaderboardSrc, /flex shrink-0 items-center gap-1\.5/);
    // Flag before trust label within secondary cluster.
    const flagIdx = secondaryBlock.indexOf("<CountryFlag");
    const trustIdx = secondaryBlock.indexOf("{trustLevel.displayName}");
    assert.ok(flagIdx >= 0 && trustIdx > flagIdx);
  });

  it("preserves top-3 medals and shared Community + Artists row", () => {
    assert.match(leaderboardSrc, /LeaderboardTopRankMark/);
    assert.match(leaderboardSrc, /className="w-10 flex items-center justify-center"/);
    assert.match(leaderboardSrc, /export function LeaderboardEntryRow/);
    const rowUses = leaderboardSrc.match(/<LeaderboardEntryRow\b/g) ?? [];
    assert.ok(rowUses.length >= 2);
  });
});
