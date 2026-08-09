import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { invalidateQueriesAfterVerifiedArtistToolsCommerce } from "./subscription-post-purchase-invalidate";
import { SUBSCRIPTION_STATUS_QUERY_KEY } from "./subscription-status";
import { RELEASE_CREATION_CAPACITY_QUERY_KEY } from "./release-creation-capacity";
import { ATTACHMENT_ALLOWANCE_QUERY_KEY } from "./release-attachment-limit";
import { LINK_ALLOWANCE_QUERY_KEY } from "./release-link-limit";
import { ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY } from "./artist-release-alerts-cache";

describe("invalidateQueriesAfterVerifiedArtistToolsCommerce", () => {
  it("invalidates status, capacity, allowances, audience, feed, detail, and discography", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const keys = [
      [...SUBSCRIPTION_STATUS_QUERY_KEY],
      [...RELEASE_CREATION_CAPACITY_QUERY_KEY],
      [...ATTACHMENT_ALLOWANCE_QUERY_KEY],
      [...LINK_ALLOWANCE_QUERY_KEY],
      [...ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY],
      ["/api/releases/feed", "upcoming"],
      ["/api/releases", "rel-1"],
      ["/api/releases", "rel-1", "attachment-capacity"],
      ["/api/releases", "rel-1", "link-capacity"],
      ["/api/artists", "artist-1", "public-releases"],
      ["/api/unrelated"],
    ] as const;

    for (const key of keys) {
      queryClient.setQueryData([...key], { marker: key.join("/") });
    }

    const invalidated: string[] = [];
    const original = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = (async (filters: unknown) => {
      invalidated.push(JSON.stringify(filters));
      return original(filters as never);
    }) as typeof queryClient.invalidateQueries;

    await invalidateQueriesAfterVerifiedArtistToolsCommerce(queryClient);

    const blob = invalidated.join("\n");
    assert.match(blob, /subscription-status/);
    assert.match(blob, /creation-capacity/);
    assert.match(blob, /release-attachment-allowance/);
    assert.match(blob, /release-link-allowance/);
    assert.match(blob, /release-alerts-audience/);
    assert.match(blob, /releases\/feed/);

    // Unrelated key should still be present (not prefix-matched away accidentally via setQueryData alone).
    assert.deepEqual(queryClient.getQueryData(["/api/unrelated"]), {
      marker: "/api/unrelated",
    });
  });
});
