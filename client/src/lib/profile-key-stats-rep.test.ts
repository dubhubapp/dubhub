import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { deriveTrustLevel } from "@shared/trust-level";

const here = dirname(fileURLToPath(import.meta.url));
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const genreStylesSrc = readFileSync(join(here, "./genre-styles.ts"), "utf8");
const trustSrc = readFileSync(join(here, "../../../shared/trust-level.ts"), "utf8");

function keyStatBlock(): string {
  const idx = userProfileSrc.indexOf('data-testid="profile-key-stats"');
  assert.ok(idx >= 0, "missing profile-key-stats");
  return userProfileSrc.slice(Math.max(0, idx - 120), idx + 1100);
}

function keyStatRowBuilder(): string {
  const idx = userProfileSrc.indexOf("const KEY_STAT_ICON_TONES");
  assert.ok(idx >= 0, "missing KEY_STAT_ICON_TONES");
  const end = userProfileSrc.indexOf("useEffect(() => {", idx);
  return userProfileSrc.slice(idx, end > idx ? end : idx + 1400);
}

function viewAllBlock(): string {
  const idx = userProfileSrc.indexOf('data-testid="your-activity-toggle-genres"');
  assert.ok(idx >= 0, "missing View All control");
  return userProfileSrc.slice(Math.max(0, idx - 350), idx + 350);
}

function activityGenresBlock(): string {
  const idx = userProfileSrc.indexOf('data-testid="your-activity-genres"');
  assert.ok(idx >= 0, "missing expanded activity genres");
  return userProfileSrc.slice(idx, idx + 3600);
}

describe("PROFILE-REFINEMENT-B — top strip Rep replacement", () => {
  it("fifth top stat is Rep; Accuracy is not in the strip", () => {
    const builder = keyStatRowBuilder();
    assert.match(builder, /\["Posts", "IDs", "Likes", "Comments"\]/);
    assert.match(builder, /label: "Rep"/);
    assert.match(builder, /repTrustForProfile\.displayName/);
    assert.doesNotMatch(builder, /Accuracy/);
    assert.doesNotMatch(builder, /accuracyPercent/);

    const render = keyStatBlock();
    assert.match(render, /grid-cols-5/);
    assert.doesNotMatch(render, /Accuracy/);
  });

  it("Rep uses deriveTrustLevel categorical model (not numeric score)", () => {
    assert.match(userProfileSrc, /const repTrustForProfile = useMemo\(\(\) => \{/);
    assert.match(userProfileSrc, /deriveTrustLevel\(/);
    assert.match(userProfileSrc, /value: repTrustForProfile\.displayName/);

    assert.equal(deriveTrustLevel(0).displayName, "Beginner");
    assert.equal(deriveTrustLevel(20).displayName, "Trusted");
    assert.equal(deriveTrustLevel(50).displayName, "Expert");
    assert.equal(deriveTrustLevel(100).displayName, "Crate Digger");
    assert.equal(deriveTrustLevel(200).displayName, "Selecta");
  });

  it("Artist + Community share the same key-stat Rep wiring (no role branch)", () => {
    const builder = keyStatRowBuilder();
    assert.doesNotMatch(builder, /verifiedArtist|userType === "artist"/);
    assert.match(userProfileSrc, /profileOverviewStatsLoading = statsLoading \|\| reputationLoading/);
  });

  it("Accuracy remains in Your Activity; stats/accuracy source untouched", () => {
    assert.match(userProfileSrc, /label: "Accuracy"/);
    assert.match(userProfileSrc, /accuracyPercent/);
    assert.match(userProfileSrc, /PROFILE_HELP\.accuracy/);
    assert.match(userProfileSrc, /userOverviewItems=\{userOverviewItems\}/);
    assert.match(userProfileSrc, />Your Activity</);
    assert.match(userProfileSrc, /\["\/api\/user", currentUser\?\.id, "stats"\]/);
    assert.match(userProfileSrc, /\["\/api\/user", currentUser\?\.id, "karma"\]/);
  });

  it("public profile key stats remain unchanged (no Accuracy→Rep invention)", () => {
    assert.match(publicProfileSrc, /data-testid="public-profile-key-stats"/);
    assert.doesNotMatch(publicProfileSrc, /label="Rep"/);
    assert.doesNotMatch(publicProfileSrc, /accuracyPercent/);
  });

  it("trust thresholds are unchanged", () => {
    assert.match(trustSrc, /displayName: "Beginner"/);
    assert.match(trustSrc, /displayName: "Crate Digger"/);
    assert.match(trustSrc, /minScore: 100/);
    assert.match(trustSrc, /minScore: 200/);
  });
});

describe("PROFILE-REFINEMENT-B1 — alignment + colour + View All + genre audit", () => {
  it("Rep value shares aligned min-height value slot with other stats", () => {
    const builder = keyStatRowBuilder();
    assert.match(builder, /KEY_STAT_VALUE_CLASS/);
    assert.match(builder, /min-h-\[2rem\]/);
    assert.match(builder, /items-center justify-center/);

    const render = keyStatBlock();
    assert.match(render, /KEY_STAT_VALUE_CLASS/);
    assert.match(render, /label === "Rep"/);
    assert.match(render, /text-\[11px\] leading-tight/);
    assert.match(render, /text-base leading-none/);
    assert.doesNotMatch(render, /truncate|Crate Dig|abbrevia/);
  });

  it("top stat icons + values are neutral white; labels muted", () => {
    const builder = keyStatRowBuilder();
    assert.match(builder, /KEY_STAT_ICON_TONES/);
    assert.match(builder, /Posts: "text-white"/);
    assert.match(builder, /IDs: "text-white"/);
    assert.match(builder, /Likes: "text-white"/);
    assert.match(builder, /Comments: "text-white"/);
    assert.match(builder, /Rep: "text-white"/);
    assert.doesNotMatch(builder, /text-green-300|text-pink-300|text-cyan-300|text-gray-200/);
    assert.doesNotMatch(builder, /KEY_STAT_TONES/);

    const render = keyStatBlock();
    assert.match(render, /iconTone/);
    assert.match(render, /KEY_STAT_VALUE_CLASS/);
    assert.match(render, /text-gray-300\/90/);
    assert.doesNotMatch(render, /\$\{tone\}/);
  });

  it("View All is neutral secondary, not teal accent", () => {
    const block = viewAllBlock();
    assert.match(block, /text-white\/70 hover:text-white/);
    assert.doesNotMatch(block, /text-accent/);
    assert.match(block, /View All/);
    assert.match(block, /Show Less/);
    assert.match(block, /onToggleGenres/);
    assert.match(block, /ChevronRight/);
  });

  it("expanded Activity genre chips reuse canonical glow-pill helpers", () => {
    assert.match(genreStylesSrc, /export function getGenreChipStyle/);
    assert.match(genreStylesSrc, /export function getGenreGlowPillStyle/);
    assert.match(userProfileSrc, /function ActivityGenreStatChip/);
    assert.match(userProfileSrc, /getGenreChipStyle\(genre\)/);
    assert.match(userProfileSrc, /getGenreGlowPillStyle\(chip\.bgColor/);
    assert.doesNotMatch(userProfileSrc, /function getGenreChipColors/);
    assert.doesNotMatch(userProfileSrc, /bg-purple-600\/20/);

    const expanded = activityGenresBlock();
    assert.match(expanded, /ActivityGenreStatChip/);
    assert.match(expanded, /identified-genres-genre-/);
    assert.match(expanded, /posted-genres-genre-/);
  });

  it("does not change Rep/Accuracy/karma behaviour contracts", () => {
    assert.match(userProfileSrc, /value: repTrustForProfile\.displayName/);
    assert.match(userProfileSrc, /label: "Accuracy"/);
    assert.match(userProfileSrc, /accuracyPercent/);
    assert.doesNotMatch(keyStatRowBuilder(), /accuracyPercent/);
  });
});
