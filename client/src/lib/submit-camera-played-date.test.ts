import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  creationIsoToPlayedDate,
  isHighConfidenceIPhoneCameraOrigin,
  suggestedPlayedDateFromCameraOrigin,
} from "./submit-camera-played-date";

const here = dirname(fileURLToPath(import.meta.url));
const helperSrc = readFileSync(join(here, "./submit-camera-played-date.ts"), "utf8");
const trimSrc = readFileSync(join(here, "../pages/trim-video.tsx"), "utf8");
const metadataSrc = readFileSync(join(here, "../pages/submit-metadata.tsx"), "utf8");
const nativeSrc = readFileSync(join(here, "./native-video-editor.ts"), "utf8");
const sessionSrc = readFileSync(join(here, "./dubhub-trim-session.ts"), "utf8");
const appDelegateSrc = readFileSync(join(here, "../../../ios/App/App/AppDelegate.swift"), "utf8");

const NOW = new Date(2026, 7, 27, 12, 0, 0);

const CAMERA_QA = {
  creationDateISO: "2026-08-20T21:04:33+0100",
  make: "Apple",
  model: "iPhone 16 Pro Max",
  software: "18.6.2",
  cameraLensModel: "iPhone 16 Pro Max back camera 6.765mm f/1.78",
};

describe("SUBMIT-MEDIA-8 camera played-date classifier", () => {
  it("HIGH: iPhone model + lens + valid date", () => {
    assert.equal(isHighConfidenceIPhoneCameraOrigin(CAMERA_QA, NOW), true);
    assert.equal(suggestedPlayedDateFromCameraOrigin(CAMERA_QA, NOW), "2026-08-20");
  });

  it("HIGH even without cameraIdentifier or location", () => {
    assert.equal(suggestedPlayedDateFromCameraOrigin(CAMERA_QA, NOW), "2026-08-20");
    assert.doesNotMatch(helperSrc, /cameraIdentifier/);
    assert.doesNotMatch(helperSrc, /locationMetadataPresent/);
  });

  it("creation date only is not HIGH", () => {
    assert.equal(
      suggestedPlayedDateFromCameraOrigin({ creationDateISO: CAMERA_QA.creationDateISO }, NOW),
      null,
    );
  });

  it("model only is not HIGH", () => {
    assert.equal(
      suggestedPlayedDateFromCameraOrigin(
        { model: CAMERA_QA.model, creationDateISO: CAMERA_QA.creationDateISO },
        NOW,
      ),
      null,
    );
  });

  it("MOV / filename / make=Apple alone are not HIGH", () => {
    assert.equal(
      suggestedPlayedDateFromCameraOrigin(
        { make: "Apple", creationDateISO: "2026-08-20T12:00:00Z" },
        NOW,
      ),
      null,
    );
    assert.doesNotMatch(helperSrc, /\.mov/i);
    assert.doesNotMatch(helperSrc, /fileName/);
  });

  it("screen-recording and download/iMessage shapes stay blank", () => {
    assert.equal(
      suggestedPlayedDateFromCameraOrigin(
        { creationDateISO: "2026-08-20T12:00:00Z", cameraLensModel: null, model: null },
        NOW,
      ),
      null,
    );
  });

  it("export software tokens are not HIGH", () => {
    for (const software of ["WhatsApp", "Lavc58.54", "CapCut", "TikTok", "Instagram", "VN 2.0"]) {
      assert.equal(
        suggestedPlayedDateFromCameraOrigin({ ...CAMERA_QA, software }, NOW),
        null,
        software,
      );
    }
  });

  it("invalid and future creation dates are blank", () => {
    assert.equal(
      suggestedPlayedDateFromCameraOrigin({ ...CAMERA_QA, creationDateISO: "not-a-date" }, NOW),
      null,
    );
    assert.equal(
      suggestedPlayedDateFromCameraOrigin(
        { ...CAMERA_QA, creationDateISO: "2026-08-28T12:00:00+0100" },
        NOW,
      ),
      null,
    );
    assert.equal(
      suggestedPlayedDateFromCameraOrigin(
        { ...CAMERA_QA, creationDateISO: "1970-01-01T00:00:00Z" },
        NOW,
      ),
      null,
    );
  });
});

describe("SUBMIT-MEDIA-8 date conversion", () => {
  it("keeps the source-offset calendar day", () => {
    assert.equal(creationIsoToPlayedDate("2026-08-20T23:40:00+0100", NOW), "2026-08-20");
  });

  it("does not UTC-slice; Z uses device-local calendar", () => {
    assert.doesNotMatch(helperSrc, /toISOString\(\)\.slice\(0,\s*10\)/);
    const ymd = creationIsoToPlayedDate("2026-08-20T00:30:00.000Z", NOW);
    const d = new Date("2026-08-20T00:30:00.000Z");
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    assert.equal(ymd, local);
  });

  it("rejects future dates", () => {
    assert.equal(creationIsoToPlayedDate("2026-08-28T08:00:00+0100", NOW), null);
  });
});

describe("SUBMIT-MEDIA-8 trim + metadata wiring", () => {
  it("reads original getVideoInfo before trimVideo and persists suggestedPlayedDate", () => {
    const materializeIdx = trimSrc.indexOf("materializeSourceUriForNativeEditor({");
    const infoIdx = trimSrc.indexOf("nativeGetVideoInfo({");
    const persistIdx = trimSrc.indexOf("persistSuggestedPlayedDate(suggestedPlayedDate)", infoIdx);
    const trimIdx = trimSrc.indexOf("nativeTrimVideo({");
    assert.ok(materializeIdx > 0, "materialize");
    assert.ok(infoIdx > materializeIdx, "getVideoInfo after materialize");
    assert.ok(trimIdx > infoIdx, "trim after getVideoInfo");
    assert.ok(persistIdx > infoIdx && persistIdx < trimIdx, "persist between info and trim");
    assert.match(trimSrc, /suggestedPlayedDate: readSuggestedPlayedDate\(\)/);
    assert.match(sessionSrc, /dubhub-suggested-played-date/);
  });

  it("new pick clears previous suggestion via trim session cleanup", () => {
    assert.match(sessionSrc, /localStorage\.removeItem\("dubhub-suggested-played-date"\)/);
  });

  it("metadata prefills empty playedDate once and never overwrites a user value", () => {
    assert.match(metadataSrc, /didPrefillPlayedDateRef/);
    assert.match(metadataSrc, /readSuggestedPlayedDate\(\)/);
    assert.match(metadataSrc, /form\.setValue\("playedDate", suggested/);
    assert.match(metadataSrc, /const current = form\.getValues\("playedDate"\)/);
    assert.match(metadataSrc, /if \(current\) \{/);
    assert.doesNotMatch(metadataSrc, /Suggested from video|detected from video/i);
  });

  it("native production payload includes origin fields without GPS or item dump", () => {
    assert.match(nativeSrc, /creationDateISO\?:/);
    assert.match(nativeSrc, /cameraLensModel\?:/);
    assert.match(appDelegateSrc, /payload\["creationDateISO"\]/);
    assert.match(appDelegateSrc, /payload\["cameraLensModel"\]/);
    assert.match(appDelegateSrc, /func collectOriginMetadata/);
    assert.doesNotMatch(appDelegateSrc, /payload\["cameraIdentifier"\]/);
    assert.doesNotMatch(appDelegateSrc, /payload\["items"\]/);
    assert.doesNotMatch(appDelegateSrc, /latitude|longitude|CLLocation/);
  });

  it("does not keep provenance debug dump or debugDump plumbing", () => {
    assert.doesNotMatch(trimSrc, /debugDump/);
    assert.doesNotMatch(trimSrc, /SubmitOrigin\]\[debug/);
    assert.doesNotMatch(trimSrc, /provenanceDebug/);
    assert.doesNotMatch(nativeSrc, /debugDump/);
    assert.doesNotMatch(nativeSrc, /provenanceDebug/);
    assert.doesNotMatch(appDelegateSrc, /dumpProvenanceDebug/);
    assert.doesNotMatch(appDelegateSrc, /waitForAssetKeys/);
    assert.doesNotMatch(appDelegateSrc, /DispatchSemaphore/);
  });
});
