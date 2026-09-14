/**
 * RELEASE-DAY-POPUP-2 — Home release-day banner premium material + copy.
 * Source + pure copy helpers; does not exercise eligibility/API.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_SURFACE_CLASS,
} from "./app-material";
import {
  RELEASE_DROP_DAY_ARTWORK_FRAME_CLASS,
  RELEASE_DROP_DAY_ARTWORK_MULTI_SIZE_CLASS,
  RELEASE_DROP_DAY_ARTWORK_SIZE_CLASS,
  RELEASE_DROP_DAY_ARTWORK_STACK_CLASS,
  RELEASE_DROP_DAY_ARTWORK_TO_TITLE_CLASS,
  RELEASE_DROP_DAY_BODY_SPACING_CLASS,
  RELEASE_DROP_DAY_CARD_BG_ARTWORK_CLASS,
  RELEASE_DROP_DAY_CARD_BG_VIGNETTE_CLASS,
  RELEASE_DROP_DAY_CARD_BG_WASH_CLASS,
  RELEASE_DROP_DAY_CARD_INNER_CLASS,
  RELEASE_DROP_DAY_CARD_PLACEMENT_STYLE,
  RELEASE_DROP_DAY_CARD_SURFACE_WITH_ARTWORK_CLASS,
  RELEASE_DROP_DAY_CLOSE_CLASS,
  RELEASE_DROP_DAY_CTA_CELL_CLASS,
  RELEASE_DROP_DAY_ENTRANCE_MS,
  getReleaseDropDayBannerCopy,
  resolveReleaseDropDayBannerBackgroundArtworkUrl,
  selectReleaseDropDayBannerReleases,
  shouldFireReleaseDropDayCelebration,
} from "./release-drop-day-banner-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const bannerSrc = readFileSync(join(here, "../components/release-drop-day-banner.tsx"), "utf8");
const presentationSrc = readFileSync(join(here, "./release-drop-day-banner-presentation.ts"), "utf8");
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");
const dropDayStorageSrc = readFileSync(join(here, "../../../server/storage.ts"), "utf8");

describe("RELEASE-DAY-POPUP-2 material + presentation", () => {
  it("uses raised overlay surface and ceramic primary CTA", () => {
    assert.match(bannerSrc, /APP_MATERIAL_OVERLAY_SURFACE_CLASS/);
    assert.match(bannerSrc, /APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS/);
    assert.equal(APP_MATERIAL_OVERLAY_SURFACE_CLASS, "dubhub-app-overlay-surface");
    assert.match(APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS, /border-white\/80/);
    assert.match(APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS, /bg-white/);
  });

  it("removes legacy turquoise / cyan slab styling", () => {
    assert.doesNotMatch(bannerSrc, /#4ae9df/);
    assert.doesNotMatch(bannerSrc, /bg-\[#0f1324\]/);
    assert.doesNotMatch(bannerSrc, /border-\[#4ae9df\]/);
    assert.doesNotMatch(bannerSrc, /bg-\[#4ae9df\]/);
  });

  it("uses upper-middle placement centred on taller card mass", () => {
    assert.match(bannerSrc, /RELEASE_DROP_DAY_CARD_PLACEMENT_STYLE/);
    assert.match(bannerSrc, /fixed inset-x-0 z-40/);
    assert.match(bannerSrc, /-translate-y-1\/2/);
    assert.doesNotMatch(bannerSrc, /fixed inset-x-0 top-0/);
    assert.doesNotMatch(bannerSrc, /RELEASE_DROP_DAY_TOP_OFFSET_STYLE/);
    assert.match(bannerSrc, /max-w-sm/);
    assert.match(
      RELEASE_DROP_DAY_CARD_PLACEMENT_STYLE.top,
      /clamp\(calc\(env\(safe-area-inset-top/,
    );
    assert.match(RELEASE_DROP_DAY_CARD_PLACEMENT_STYLE.top, /42vh/);
    assert.match(RELEASE_DROP_DAY_CARD_PLACEMENT_STYLE.top, /420px/);
  });

  it("uses artwork-led vertical celebration layout", () => {
    assert.match(RELEASE_DROP_DAY_CARD_INNER_CLASS, /flex flex-col items-center/);
    assert.match(RELEASE_DROP_DAY_CARD_INNER_CLASS, /pt-12/);
    assert.match(RELEASE_DROP_DAY_CARD_INNER_CLASS, /px-5/);
    assert.match(RELEASE_DROP_DAY_CARD_INNER_CLASS, /pb-5/);
    assert.doesNotMatch(RELEASE_DROP_DAY_CARD_INNER_CLASS, /grid-cols-/);
    assert.equal(RELEASE_DROP_DAY_CTA_CELL_CLASS, "mt-5 flex w-full justify-center");
    assert.equal(RELEASE_DROP_DAY_ARTWORK_TO_TITLE_CLASS, "mt-5");
    assert.equal(RELEASE_DROP_DAY_BODY_SPACING_CLASS, "mt-1.5");
    assert.match(bannerSrc, /RELEASE_DROP_DAY_CARD_INNER_CLASS/);
    assert.match(bannerSrc, /RELEASE_DROP_DAY_CTA_CELL_CLASS/);
    assert.match(bannerSrc, /text-center/);
  });

  it("uses hero artwork ~160px with responsive clamp and soft glow", () => {
    assert.match(RELEASE_DROP_DAY_ARTWORK_SIZE_CLASS, /clamp\(132px,38vw,160px\)/);
    assert.match(RELEASE_DROP_DAY_ARTWORK_MULTI_SIZE_CLASS, /clamp\(100px,28vw,120px\)/);
    assert.match(RELEASE_DROP_DAY_ARTWORK_FRAME_CLASS, /border-white\/12/);
    assert.match(RELEASE_DROP_DAY_ARTWORK_FRAME_CLASS, /rgba\(10,131,255,0\.18\)/);
    assert.match(RELEASE_DROP_DAY_ARTWORK_FRAME_CLASS, /rgba\(0,0,0,0\.62\)/);
    assert.doesNotMatch(RELEASE_DROP_DAY_ARTWORK_FRAME_CLASS, /#4ae9df/);
    assert.match(bannerSrc, /RELEASE_DROP_DAY_ARTWORK_SIZE_CLASS/);
    assert.match(bannerSrc, /RELEASE_DROP_DAY_ARTWORK_MULTI_SIZE_CLASS/);
    assert.match(bannerSrc, /RELEASE_DROP_DAY_ARTWORK_STACK_CLASS/);
    assert.match(RELEASE_DROP_DAY_ARTWORK_STACK_CLASS, /-space-x-8/);
    assert.match(bannerSrc, /Music2/);
    assert.doesNotMatch(bannerSrc, /h-\[72px\]/);
  });

  it("adds blurred artwork card backdrop with dark wash when artwork exists", () => {
    assert.match(RELEASE_DROP_DAY_CARD_BG_ARTWORK_CLASS, /blur-\[34px\]/);
    assert.match(RELEASE_DROP_DAY_CARD_BG_ARTWORK_CLASS, /scale-\[1\.12\]/);
    assert.match(RELEASE_DROP_DAY_CARD_BG_ARTWORK_CLASS, /object-cover/);
    assert.match(RELEASE_DROP_DAY_CARD_BG_ARTWORK_CLASS, /saturate-\[1\.15\]/);
    assert.match(RELEASE_DROP_DAY_CARD_BG_WASH_CLASS, /rgba\(15,20,36,0\.62\)/);
    assert.match(RELEASE_DROP_DAY_CARD_BG_VIGNETTE_CLASS, /radial-gradient/);
    assert.match(RELEASE_DROP_DAY_CARD_SURFACE_WITH_ARTWORK_CLASS, /!bg-transparent/);
    assert.match(bannerSrc, /resolveReleaseDropDayBannerBackgroundArtworkUrl/);
    assert.match(bannerSrc, /RELEASE_DROP_DAY_CARD_BG_ARTWORK_CLASS/);
    assert.match(bannerSrc, /RELEASE_DROP_DAY_CARD_BG_WASH_CLASS/);
    assert.match(bannerSrc, /backgroundArtworkUrl \?/);
    assert.equal(
      resolveReleaseDropDayBannerBackgroundArtworkUrl([
        { artworkUrl: "https://cdn.example/a.jpg" },
        { artworkUrl: "https://cdn.example/b.jpg" },
      ]),
      "https://cdn.example/a.jpg",
    );
    assert.equal(
      resolveReleaseDropDayBannerBackgroundArtworkUrl([{ artworkUrl: null }, { artworkUrl: "" }]),
      null,
    );
    assert.equal(resolveReleaseDropDayBannerBackgroundArtworkUrl([]), null);
  });

  it("places dismiss control absolute top-right", () => {
    assert.match(bannerSrc, /aria-label="Dismiss"/);
    assert.match(bannerSrc, /onClick=\{dismiss\}/);
    assert.match(bannerSrc, /RELEASE_DROP_DAY_CLOSE_CLASS/);
    assert.match(RELEASE_DROP_DAY_CLOSE_CLASS, /absolute right-4 top-4/);
    assert.match(RELEASE_DROP_DAY_CLOSE_CLASS, /h-11 w-11/);
  });

  it("preserves dialog a11y labels", () => {
    assert.match(bannerSrc, /role="dialog"/);
    assert.match(bannerSrc, /aria-label="Release day"/);
  });

  it("keeps one-shot card + artwork settle and reduced motion", () => {
    assert.equal(RELEASE_DROP_DAY_ENTRANCE_MS, 220);
    assert.match(bannerSrc, /prefers-reduced-motion/);
    assert.match(bannerSrc, /scale\(0\.96\)/);
    assert.match(bannerSrc, /scale\(0\.94\)/);
    assert.match(bannerSrc, /RELEASE_DROP_DAY_ENTRANCE_MS/);
    assert.match(bannerSrc, /cardEntered/);
  });
});

describe("RELEASE-DAY-POPUP-2 copy variants", () => {
  it("formats single owned release", () => {
    const copy = getReleaseDropDayBannerCopy({
      currentUserId: "artist-1",
      releases: [{ id: "r1", title: "London Anthem", artistId: "artist-1" }],
    });
    assert.equal(copy.title, "Your release is out");
    assert.equal(copy.body, "London Anthem is out now.");
    assert.equal(copy.ctaLabel, "Open Release");
  });

  it("formats single listener/collaborator release", () => {
    const copy = getReleaseDropDayBannerCopy({
      currentUserId: "listener-1",
      releases: [
        {
          id: "r1",
          title: "Night Drive",
          artistId: "artist-2",
          artistUsername: "bassline",
        },
      ],
    });
    assert.equal(copy.title, "Out now");
    assert.equal(copy.body, "@bassline — Night Drive is out now.");
    assert.equal(copy.ctaLabel, "Open Release");
  });

  it("formats multi owned / saved / mixed bodies", () => {
    assert.deepEqual(
      getReleaseDropDayBannerCopy({
        currentUserId: "u1",
        releases: [
          { id: "a", title: "A", artistId: "u1" },
          { id: "b", title: "B", artistId: "u1" },
        ],
      }),
      {
        title: "Out now",
        body: "2 of your releases are out now.",
        ctaLabel: "Open Releases",
      },
    );
    assert.deepEqual(
      getReleaseDropDayBannerCopy({
        currentUserId: "u1",
        releases: [
          { id: "a", title: "A", artistId: "other" },
          { id: "b", title: "B", artistId: "other" },
        ],
      }),
      {
        title: "Out now",
        body: "2 saved releases are out now.",
        ctaLabel: "Open Releases",
      },
    );
    assert.deepEqual(
      getReleaseDropDayBannerCopy({
        currentUserId: "u1",
        releases: [
          { id: "a", title: "A", artistId: "u1" },
          { id: "b", title: "B", artistId: "other" },
        ],
      }),
      {
        title: "Out now",
        body: "2 releases you care about are out now.",
        ctaLabel: "Open Releases",
      },
    );
  });

  it("does not use legacy drop-today copy", () => {
    assert.doesNotMatch(bannerSrc, /Out today/);
    assert.doesNotMatch(bannerSrc, /drops today/);
    assert.doesNotMatch(bannerSrc, /Your release is out today/);
    assert.doesNotMatch(presentationSrc, /drops today/);
  });
});

describe("RELEASE-DAY-POPUP-2 celebration + behavior freeze", () => {
  it("keeps confetti and celebratory haptic one-time via celebration key", () => {
    assert.match(bannerSrc, /playReleaseDayHaptic\(\)/);
    assert.match(bannerSrc, /runConfetti\(\{/);
    assert.match(bannerSrc, /duration: 2800/);
    assert.match(bannerSrc, /particleCount: 36/);
    assert.match(bannerSrc, /SESSION_CELEBRATION_FIRED_KEY/);
    assert.match(bannerSrc, /celebrationSessionKey/);
    assert.match(bannerSrc, /shouldFireReleaseDropDayCelebration/);
    assert.match(bannerSrc, /celebrationFiredRef/);
    assert.equal(
      shouldFireReleaseDropDayCelebration({
        celebrationRefAlreadyMatched: false,
        storageAlreadyFired: false,
      }),
      true,
    );
    assert.equal(
      shouldFireReleaseDropDayCelebration({
        celebrationRefAlreadyMatched: true,
        storageAlreadyFired: false,
      }),
      false,
    );
    assert.equal(
      shouldFireReleaseDropDayCelebration({
        celebrationRefAlreadyMatched: false,
        storageAlreadyFired: true,
      }),
      false,
    );
  });

  it("does not gate confetti/haptic on reduced motion in this slice", () => {
    const celebrationBlock = bannerSrc.slice(
      bannerSrc.indexOf("const celebrationFiredRef"),
      bannerSrc.indexOf("const dismiss = useCallback"),
    );
    assert.doesNotMatch(celebrationBlock, /prefersReducedMotion|prefers-reduced-motion/);
  });

  it("keeps CTA routes and localStorage persistence keys", () => {
    assert.match(bannerSrc, /\/releases\/\$\{encodeURIComponent\(releases\[0\]\.id\)\}/);
    assert.match(bannerSrc, /ctaRoute = .* : "\/releases"/s);
    assert.match(presentationSrc, /Open Release/);
    assert.match(presentationSrc, /Open Releases/);
    assert.match(bannerSrc, /\{ctaLabel\}/);
    assert.match(bannerSrc, /dubhub-release-drop-day-banner-dismissed/);
    assert.match(bannerSrc, /dubhub-release-drop-day-banner-presented/);
    assert.match(bannerSrc, /localStorage/);
    assert.match(bannerSrc, /dismiss\(\);\s*\n\s*navigate\(ctaRoute\)/);
  });

  it("keeps release_day toast suppression wiring", () => {
    assert.match(bannerSrc, /setReleaseDropDayBannerState/);
  });
});

describe("RELEASE-DAY-POPUP eligibility + production path", () => {
  it("only keeps release-day-today candidates from drop-day API rows", () => {
    const selected = selectReleaseDropDayBannerReleases(
      [{ id: "r1" }, { id: "r2" }],
      (r) => r.id === "r1",
    );
    assert.deepEqual(selected.map((r) => r.id), ["r1"]);
    assert.deepEqual(
      selectReleaseDropDayBannerReleases([{ id: "r2" }], () => false),
      [],
    );
  });

  it("uses only drop-day-banner API and keeps server date window unchanged", () => {
    assert.match(bannerSrc, /\/api\/releases\/drop-day-banner/);
    assert.doesNotMatch(bannerSrc, /debug-drop-day-fallback/);
    assert.doesNotMatch(bannerSrc, /dubhub_debug_force_release_day_banner/);
    assert.doesNotMatch(bannerSrc, /forceDebug/);
    assert.doesNotMatch(bannerSrc, /\[ReleaseDayBanner\]\[debug\]/);
    assert.doesNotMatch(presentationSrc, /dubhub_debug_force_release_day_banner/);
    assert.match(routesSrc, /\/api\/releases\/drop-day-banner/);
    assert.match(
      dropDayStorageSrc,
      /release_date AT TIME ZONE 'UTC'\)::date BETWEEN \(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'\)::date - 1 AND \(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'\)::date \+ 1/,
    );
  });

  it("always writes genuine presented/dismissed/celebration persistence", () => {
    assert.match(bannerSrc, /store\?\.setItem\(presentedSessionKey, "1"\)/);
    assert.match(bannerSrc, /store\?\.setItem\(dismissSessionKey, "1"\)/);
    assert.match(bannerSrc, /store\?\.setItem\(celebrationSessionKey, "1"\)/);
    assert.doesNotMatch(bannerSrc, /skipping genuine/);
    assert.doesNotMatch(bannerSrc, /force mode/);
    assert.doesNotMatch(bannerSrc, /in-memory only/);
  });
});
