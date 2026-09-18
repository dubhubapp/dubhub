/**
 * USER-MENTION-1 — source contracts for comment create mention notify path.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(join(here, "./routes.ts"), "utf8");
const pushSendSrc = readFileSync(join(here, "./push/pushSend.ts"), "utf8");
const toastSrc = readFileSync(
  join(here, "../client/src/hooks/use-in-app-notification-toasts.ts"),
  "utf8",
);
const pushClientSrc = readFileSync(
  join(here, "../client/src/lib/push-notifications.ts"),
  "utf8",
);

describe("USER-MENTION-1 comment mention notify wiring", () => {
  it("creates user_mention_comment after artist/reply/owner branches with notified dedupe", () => {
    assert.match(routesSrc, /selectUserMentionNotifyRecipients/);
    assert.match(routesSrc, /notificationType:\s*"user_mention_comment"/);
    assert.match(
      routesSrc,
      /message:\s*`@\$\{commenterUsername\} mentioned you in a comment`/,
    );
    assert.match(routesSrc, /type:\s*"user_mention_comment"/);
    assert.match(routesSrc, /skipped \(already notified\)/);
    // Artist tags still distinct and earlier.
    const artistIdx = routesSrc.indexOf('notificationType: "artist_tag_comment"');
    const mentionIdx = routesSrc.indexOf('notificationType: "user_mention_comment"');
    assert.ok(artistIdx > 0 && mentionIdx > artistIdx);
  });

  it("persist still skips artist-tag recipients so verified artists are not double-persisted as user mentions", () => {
    assert.match(routesSrc, /if \(taggedArtistIds\.has\(user\.id\)\) continue;/);
  });

  it("push payload + copy for user_mention_comment", () => {
    assert.match(pushSendSrc, /"user_mention_comment"/);
    assert.match(pushSendSrc, /Mention 💬/);
    assert.match(pushSendSrc, /mentioned you in a comment/);
  });

  it("client banner + push deep-link include user_mention_comment", () => {
    assert.match(toastSrc, /"user_mention_comment"/);
    assert.match(toastSrc, /mentioned you in a comment/);
    assert.match(
      pushClientSrc,
      /type === "user_mention_comment"/,
    );
  });
});
