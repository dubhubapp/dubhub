import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { HomeWidgetRelease } from "@shared/home-widget";
import {
  HOME_WIDGET_SETUP_PREVIEW_FAMILIES,
  buildHomeWidgetSetupPreview,
  formatHomeWidgetPreviewDateLabel,
} from "./home-widget-setup-preview";

const here = dirname(fileURLToPath(import.meta.url));

function release(overrides: Partial<HomeWidgetRelease> = {}): HomeWidgetRelease {
  return {
    id: "rel-1",
    title: "Night Drive",
    artistName: "Ada",
    artworkUrl: "https://cdn.example/art.jpg",
    releaseDate: "2026-10-31T00:00:00.000Z",
    deepLink: "https://dubhub.uk/release/rel-1",
    countdownLabel: "83 days",
    isOutNow: false,
    timingMode: "midnight",
    releaseCalendarDate: "2026-10-31",
    releaseAt: null,
    releaseAnnouncedAt: null,
    ...overrides,
  };
}

describe("home widget setup preview model", () => {
  it("uses the stamped release fields and only small plus medium", () => {
    assert.deepEqual([...HOME_WIDGET_SETUP_PREVIEW_FAMILIES], ["small", "medium"]);
    const model = buildHomeWidgetSetupPreview(release());
    assert.equal(model?.title, "Night Drive");
    assert.equal(model?.artistName, "Ada");
    assert.equal(model?.artworkUrl, "https://cdn.example/art.jpg");
    assert.equal(model?.countdownLabel, "83 days");
    assert.equal(model?.isOutNow, false);
    assert.equal(model?.announcementLabel, null);
    assert.match(model?.releaseDateLabel ?? "", /Oct/);
    assert.match(model?.releaseDateLabel ?? "", /31/);
    assert.match(model?.releaseDateLabel ?? "", /2026/);
  });

  it("compacts the small countdown label the same way as the widget", () => {
    const model = buildHomeWidgetSetupPreview(
      release({ countdownLabel: "7 hours 55 mins" }),
    );
    assert.equal(model?.countdownLabel, "7 hours 55 mins");
    assert.equal(model?.smallCountdownLabel, "7 hours 55");
  });

  it("shows Release announced only while the decoration is fresh", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    const fresh = buildHomeWidgetSetupPreview(
      release({ releaseAnnouncedAt: "2026-10-01T10:00:00.000Z" }),
      now,
    );
    assert.equal(fresh?.announcementLabel, "Release announced");
    const outNow = buildHomeWidgetSetupPreview(
      release({
        isOutNow: true,
        countdownLabel: "Out now",
        releaseAnnouncedAt: "2026-10-01T10:00:00.000Z",
      }),
      now,
    );
    assert.equal(outNow?.announcementLabel, null);
    assert.equal(outNow?.isOutNow, true);
  });

  it("formats an exact release as date and time", () => {
    const label = formatHomeWidgetPreviewDateLabel({
      timingMode: "exact",
      releaseAt: "2026-10-31T19:00:00.000Z",
      releaseCalendarDate: "2026-10-31",
    });
    assert.match(label ?? "", /Oct/);
    assert.match(label ?? "", /31/);
    assert.match(label ?? "", /·/);
  });

  it("returns null without a release", () => {
    assert.equal(buildHomeWidgetSetupPreview(null), null);
  });
});

describe("home widget setup preview sheet", () => {
  const hostSrc = readFileSync(
    join(here, "../components/home-widget-setup-guide-host.tsx"),
    "utf8",
  );
  const previewSrc = readFileSync(
    join(here, "../components/home-widget-setup-preview.tsx"),
    "utf8",
  );
  const hookSrc = readFileSync(
    join(here, "../hooks/use-home-widget-selection.ts"),
    "utf8",
  );
  const nativeBridgeSrc = readFileSync(
    join(here, "./home-widget-bridge-native.ts"),
    "utf8",
  );

  it("opens the preview from the release on the completed selection, not a native re-read", () => {
    assert.doesNotMatch(nativeBridgeSrc, /readHomeWidgetPayload/);
    assert.match(hookSrc, /result\.refresh\.ok/);
    assert.match(hookSrc, /release: result\.refresh\.payload\.dto\.release/);
    assert.match(hostSrc, /if \(detail && "release" in detail\)/);
    assert.match(hostSrc, /buildHomeWidgetSetupPreview\(release \?\? null\)/);
    assert.match(hostSrc, /<HomeWidgetSetupPreview model=\{preview\} \/>/);
    assert.match(hostSrc, /z-\[70\]/);
    assert.match(hostSrc, /acquireHomeWidgetSetupGuideNativeNavCover/);
    assert.match(hostSrc, /APP_MATERIAL_SHEET_SURFACE_CLASS/);
  });

  it("keeps empty copy behind a missing release and gives Small and Medium distinct frames", () => {
    const emptyAt = previewSrc.indexOf("home-widget-setup-preview-empty");
    const smallLayout = previewSrc.indexOf('data-layout="small-centered"');
    const mediumLayout = previewSrc.indexOf('data-layout="medium-row"');
    assert.ok(emptyAt > 0 && smallLayout > 0 && mediumLayout > smallLayout);
    assert.match(previewSrc, /aspect-square w-full/);
    assert.match(previewSrc, /aspect-\[338\/158\]/);
    assert.match(previewSrc, /w-\[46%\]/);
    assert.doesNotMatch(previewSrc, /systemLarge|preview-large|size-large/);
  });

  it("preserves the mark aspect ratio and leaves padding around the shadow", () => {
    assert.match(previewSrc, /object-contain/);
    assert.match(previewSrc, /height: "auto"/);
    assert.match(previewSrc, /maxHeight: size/);
    assert.match(previewSrc, /DubHubD\.png/);
    assert.match(previewSrc, /mixBlendMode: "screen"/);
    assert.match(previewSrc, /shadow-\[0_10px_22px_rgba\(0,0,0,0\.32\)\]/);
    assert.match(previewSrc, /px-6 pt-6 pb-12/);
    assert.match(previewSrc, /bottom-3 right-3/);
    assert.match(previewSrc, /items-end justify-between/);
    assert.match(previewSrc, /h-\[78%\]/);
    assert.match(previewSrc, /mt-auto/);
    assert.match(previewSrc, /home-widget-setup-preview-slide-small/);
    assert.match(previewSrc, /home-widget-setup-preview-slide-medium/);
    assert.match(previewSrc, /rgb\(18, 20, 41\)/);
    assert.match(previewSrc, /bg-black\/55/);
    assert.match(previewSrc, /text-white/);
  });
});
