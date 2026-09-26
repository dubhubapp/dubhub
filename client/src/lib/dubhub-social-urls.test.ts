import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DUBHUB_INSTAGRAM_URL,
  DUBHUB_LISTEN_FOLLOW_LINKS,
  DUBHUB_SOUNDCLOUD_URL,
  DUBHUB_SPOTIFY_URL,
  DUBHUB_TIKTOK_URL,
  DUBHUB_YOUTUBE_URL,
  openDubhubExternalUrl,
} from "./dubhub-social-urls";
import {
  DUBHUB_PRIVACY_POLICY_URL,
  DUBHUB_SIGNUP_PRIVACY_URL,
  DUBHUB_SIGNUP_TERMS_URL,
  DUBHUB_TERMS_OF_USE_URL,
  DUBHUB_WEBSITE_PRIVACY_URL,
  DUBHUB_WEBSITE_TERMS_URL,
} from "./legal-urls";

const here = dirname(fileURLToPath(import.meta.url));
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const legalSrc = readFileSync(join(here, "./legal-urls.ts"), "utf8");
const vatRowSrc = readFileSync(
  join(here, "../components/verified-artist-tools-settings-row.tsx"),
  "utf8",
);
const paywallSrc = readFileSync(
  join(here, "../components/verified-artist-tools-paywall.tsx"),
  "utf8",
);

describe("dub hub social profile URLs", () => {
  it("exports exact approved profile destinations without Spotify tracking params", () => {
    assert.equal(
      DUBHUB_SPOTIFY_URL,
      "https://open.spotify.com/user/v6yq929l0925bqgwxigg7mq7r",
    );
    assert.doesNotMatch(DUBHUB_SPOTIFY_URL, /[?&]/);
    assert.equal(DUBHUB_SOUNDCLOUD_URL, "https://soundcloud.com/dubhub-uk");
    assert.match(DUBHUB_SOUNDCLOUD_URL, /^https:\/\//);
    assert.equal(DUBHUB_YOUTUBE_URL, "https://www.youtube.com/@dubhubuk");
    assert.equal(DUBHUB_INSTAGRAM_URL, "https://www.instagram.com/dubhub.uk/");
    assert.equal(DUBHUB_TIKTOK_URL, "https://www.tiktok.com/@dubhub.uk");
  });

  it("orders Listen & follow Spotify → SoundCloud → YouTube → Instagram → TikTok", () => {
    assert.deepEqual(
      DUBHUB_LISTEN_FOLLOW_LINKS.map((l) => l.id),
      ["spotify", "soundcloud", "youtube", "instagram", "tiktok"],
    );
    assert.deepEqual(
      DUBHUB_LISTEN_FOLLOW_LINKS.map((l) => l.label),
      ["Spotify", "SoundCloud", "YouTube", "Instagram", "TikTok"],
    );
    assert.equal(DUBHUB_LISTEN_FOLLOW_LINKS[0].url, DUBHUB_SPOTIFY_URL);
    assert.equal(DUBHUB_LISTEN_FOLLOW_LINKS[1].url, DUBHUB_SOUNDCLOUD_URL);
    assert.equal(DUBHUB_LISTEN_FOLLOW_LINKS[2].url, DUBHUB_YOUTUBE_URL);
    assert.equal(DUBHUB_LISTEN_FOLLOW_LINKS[3].url, DUBHUB_INSTAGRAM_URL);
    assert.equal(DUBHUB_LISTEN_FOLLOW_LINKS[4].url, DUBHUB_TIKTOK_URL);
  });

  it("exposes openDubhubExternalUrl helper", () => {
    assert.equal(typeof openDubhubExternalUrl, "function");
  });
});

describe("website legal URL source of truth", () => {
  it("Settings / SignUp website Privacy and Terms use www.dubhub.uk", () => {
    assert.equal(DUBHUB_WEBSITE_PRIVACY_URL, "https://www.dubhub.uk/privacy");
    assert.equal(DUBHUB_WEBSITE_TERMS_URL, "https://www.dubhub.uk/terms");
    assert.equal(DUBHUB_SIGNUP_PRIVACY_URL, DUBHUB_WEBSITE_PRIVACY_URL);
    assert.equal(DUBHUB_SIGNUP_TERMS_URL, DUBHUB_WEBSITE_TERMS_URL);
  });

  it("keeps Apple EULA as IAP Terms; does not point website Terms at Apple", () => {
    assert.equal(
      DUBHUB_TERMS_OF_USE_URL,
      "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
    );
    assert.notEqual(DUBHUB_WEBSITE_TERMS_URL, DUBHUB_TERMS_OF_USE_URL);
    assert.match(legalSrc, /DUBHUB_WEBSITE_TERMS_URL/);
    assert.match(legalSrc, /DUBHUB_WEBSITE_PRIVACY_URL/);
  });

  it("IAP surfaces keep Apple EULA Terms and apex privacy; Settings uses website SOT", () => {
    assert.match(vatRowSrc, /DUBHUB_TERMS_OF_USE_URL/);
    assert.match(vatRowSrc, /DUBHUB_PRIVACY_POLICY_URL/);
    assert.doesNotMatch(vatRowSrc, /DUBHUB_WEBSITE_TERMS_URL/);
    assert.match(paywallSrc, /DUBHUB_TERMS_OF_USE_URL/);
    assert.match(paywallSrc, /DUBHUB_PRIVACY_POLICY_URL/);
    assert.match(settingsSrc, /DUBHUB_WEBSITE_PRIVACY_URL/);
    assert.match(settingsSrc, /DUBHUB_WEBSITE_TERMS_URL/);
    assert.doesNotMatch(settingsSrc, /DUBHUB_TERMS_OF_USE_URL/);
    assert.match(DUBHUB_PRIVACY_POLICY_URL, /dubhub\.uk\/privacy/);
  });
});
