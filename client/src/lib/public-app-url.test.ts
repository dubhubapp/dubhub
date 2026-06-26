import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPublicArtistProfileShareUrl } from "./public-app-url";

describe("getPublicArtistProfileShareUrl", () => {
  it("uses lowercase normalized username in query URL", () => {
    assert.equal(
      getPublicArtistProfileShareUrl("Artist.Name"),
      "https://dubhub.uk/?artist=artist.name",
    );
  });
});
