/**
 * Widget / setup-guide copy contract for Release Countdown.
 * Asserts shared copy + native Swift / setup-guide sources stay aligned.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { HOME_WIDGET_COPY } from "@shared/home-widget-copy";
import { HOME_WIDGET_OUT_NOW_RETENTION_HOURS } from "@shared/home-widget-retention";
import { HOME_WIDGET_SETUP_GUIDE_COPY } from "./home-widget-setup-guide";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("Release Countdown widget copy contract", () => {
  const viewsSrc = readRepo(
    "ios/App/ReleaseCountdownWidget/ReleaseCountdownViews.swift",
  );
  const widgetSrc = readRepo(
    "ios/App/ReleaseCountdownWidget/ReleaseCountdownWidget.swift",
  );
  const entrySrc = readRepo(
    "ios/App/ReleaseCountdownWidget/ReleaseCountdownEntry.swift",
  );
  const retentionSrc = readRepo("shared/home-widget-retention.ts");
  const utcCountdownSrc = readRepo("ios/App/Shared/HomeWidgetUtcCountdown.swift");
  const payloadModelsSrc = readRepo(
    "ios/App/Shared/HomeWidgetPayloadModels.swift",
  );

  it("keeps Release Countdown title and exact empty/stale/artist bodies", () => {
    assert.equal(HOME_WIDGET_COPY.title, "Release Countdown");
    assert.equal(
      HOME_WIDGET_COPY.emptyBody,
      "Choose a saved release in dub hub to start a new countdown.",
    );
    assert.equal(
      HOME_WIDGET_COPY.staleBody,
      "Open dub hub to refresh your countdown.",
    );
    assert.equal(
      HOME_WIDGET_COPY.artistEmptyBody,
      "Create your next release in dub hub to start a countdown.",
    );
    assert.equal(HOME_WIDGET_COPY.outNow, "Out now");
    assert.equal(HOME_WIDGET_COPY.brand, "dub hub");

    assert.match(viewsSrc, /title: "Release Countdown"/);
    assert.match(
      viewsSrc,
      /message: "Choose a saved release in dub hub to start a new countdown\."/,
    );
    assert.match(
      viewsSrc,
      /message: "Open dub hub to refresh your countdown\."/,
    );
    assert.match(
      viewsSrc,
      /message: "Create your next release in dub hub to start a countdown\."/,
    );
  });

  it("distinguishes artist empty via stamped eligibility only", () => {
    assert.match(entrySrc, /case emptyArtist/);
    assert.match(
      entrySrc,
      /eligibility == "no_eligible_artist_release"/,
    );
    assert.match(
      payloadModelsSrc,
      /case empty\(eligibility: String\?\)/,
    );
    assert.equal(
      HOME_WIDGET_COPY.artistEmptyEligibility,
      "no_eligible_artist_release",
    );
  });

  it("has no Dub Hub brand casing in widget or setup-guide copy", () => {
    const setupBlob = [
      HOME_WIDGET_SETUP_GUIDE_COPY.title,
      HOME_WIDGET_SETUP_GUIDE_COPY.body,
      ...HOME_WIDGET_SETUP_GUIDE_COPY.steps,
      HOME_WIDGET_SETUP_GUIDE_COPY.primaryCta,
      HOME_WIDGET_SETUP_GUIDE_COPY.secondaryCta,
    ].join("\n");

    assert.doesNotMatch(viewsSrc, /Dub Hub/);
    assert.doesNotMatch(widgetSrc, /Dub Hub/);
    assert.doesNotMatch(setupBlob, /Dub Hub/);
    assert.doesNotMatch(setupBlob, /DUB HUB/);

    assert.match(
      HOME_WIDGET_SETUP_GUIDE_COPY.steps[1],
      /search for dub hub/,
    );
    assert.match(widgetSrc, /saved dub hub release/);
  });

  it("lowercases mid-sentence countdown in empty/stale/setup copy", () => {
    assert.match(viewsSrc, /refresh your countdown/);
    assert.doesNotMatch(viewsSrc, /refresh your Countdown/);
    assert.equal(
      HOME_WIDGET_SETUP_GUIDE_COPY.steps[2],
      "Choose your countdown size.",
    );
    assert.doesNotMatch(
      HOME_WIDGET_SETUP_GUIDE_COPY.steps.join(" "),
      /your Countdown/,
    );
  });

  it("does not introduce Listen now; keeps Out now", () => {
    assert.doesNotMatch(viewsSrc, /Listen now/);
    assert.match(utcCountdownSrc, /label: "Out now"/);
    assert.equal(HOME_WIDGET_COPY.outNow, "Out now");
  });

  it("leaves 24h Out-now retention untouched", () => {
    assert.equal(HOME_WIDGET_OUT_NOW_RETENTION_HOURS, 24);
    assert.match(
      retentionSrc,
      /export const HOME_WIDGET_OUT_NOW_RETENTION_HOURS = 24 as const/,
    );
    assert.match(
      utcCountdownSrc,
      /static let outNowRetentionHours: TimeInterval = 24/,
    );
  });

  it("keeps empty/stale deep links at app root", () => {
    assert.match(
      viewsSrc,
      /case \.empty, \.emptyArtist, \.refresh:[\s\S]*https:\/\/dubhub\.uk\//,
    );
  });
});
