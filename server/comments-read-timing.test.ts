import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");
const storageSrc = readFileSync(join(here, "storage.ts"), "utf8");
const authSrc = readFileSync(join(here, "authMiddleware.ts"), "utf8");
const viewerSrc = readFileSync(join(here, "comments-read-viewer.ts"), "utf8");

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, `missing slice ${startNeedle}`);
  return source.slice(start, end);
}

describe("comments read", () => {
  it("keeps the comments JSON contract without route timing headers", () => {
    const block = sliceBetween(
      routesSrc,
      'app.get("/api/posts/:id/comments"',
      'app.post("/api/posts/:id/comments"',
    );
    assert.match(block, /commentsReadViewer/);
    assert.doesNotMatch(block, /optionalSupabaseUser/);
    assert.match(block, /const currentUserId = req\.dbUser\?\.id \|\| undefined/);
    assert.match(block, /storage\.getPostComments\(postId, currentUserId\)/);
    assert.match(block, /res\.json\(comments\)/);
    assert.doesNotMatch(block, /Server-Timing/);
    assert.doesNotMatch(block, /comments\.timing/);
    assert.doesNotMatch(block, /res\.json\(\{[^}]*dur/);
  });

  it("keeps the votes check and comments query without timing stages", () => {
    const block = sliceBetween(storageSrc, "async getPostComments(", "async createComment(");
    assert.match(block, /to_regclass\('public\.comment_votes'\)/);
    assert.doesNotMatch(block, /timing\.commentVotesCheck/);
    assert.doesNotMatch(block, /timing\.commentsQuery/);
    assert.match(block, /ORDER BY c\.created_at DESC/);
    assert.match(block, /cv2\.user_id = \$2/);
    assert.match(block, /LEFT JOIN profiles p ON p\.id = c\.user_id/);
    assert.doesNotMatch(block, /DELETED_COMMENT_BODY/);
  });

  it("keeps optional auth on the full profile lookup", () => {
    const start = authSrc.indexOf("export async function optionalSupabaseUser");
    assert.ok(start >= 0);
    const block = authSrc.slice(start);
    assert.doesNotMatch(block, /commentsReadClock/);
    assert.match(block, /supabase\.auth\.getUser\(accessToken\)/);
    assert.match(block, /\.from\('profiles'\)/);
    assert.match(block, /if \(isBanned \|\| isSuspended\)/);
  });

  it("loads comments viewer ban state from the pooled profile primary key", () => {
    assert.match(viewerSrc, /supabase\.auth\.getUser\(accessToken\)/);
    assert.match(
      viewerSrc,
      /SELECT banned, suspended_until\s+FROM profiles\s+WHERE id = \$1\s+LIMIT 1/,
    );
    assert.match(viewerSrc, /resolveCommentsReadViewerId\(user\.id, profile\)/);
    assert.doesNotMatch(viewerSrc, /profileState/);
    assert.doesNotMatch(viewerSrc, /\.from\('profiles'\)/);
    assert.doesNotMatch(viewerSrc, /optionalSupabaseUser/);
  });
});
