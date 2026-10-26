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

describe("comments read timing", () => {
  it("keeps the comments JSON contract and reports stages only as Server-Timing", () => {
    const block = sliceBetween(
      routesSrc,
      'app.get("/api/posts/:id/comments"',
      'app.post("/api/posts/:id/comments"',
    );
    assert.match(block, /commentsReadViewer/);
    assert.doesNotMatch(block, /optionalSupabaseUser/);
    assert.match(block, /const currentUserId = req\.dbUser\?\.id \|\| undefined/);
    assert.match(block, /storage\.getPostComments\(postId, currentUserId, stage\)/);
    assert.match(block, /res\.json\(comments\)/);
    assert.match(block, /Server-Timing/);
    assert.match(block, /auth;dur=/);
    assert.match(block, /userResolve;dur=/);
    assert.match(block, /profileState;dur=/);
    assert.doesNotMatch(block, /profile;dur=/);
    assert.match(block, /commentVotesCheck;dur=/);
    assert.match(block, /commentsQuery;dur=/);
    assert.match(block, /handler;dur=/);
    assert.doesNotMatch(block, /comments\.timing/);
    assert.doesNotMatch(block, /res\.json\(\{[^}]*dur/);
  });

  it("times the votes check and comments query without changing the thread query", () => {
    const block = sliceBetween(storageSrc, "async getPostComments(", "async createComment(");
    assert.match(block, /to_regclass\('public\.comment_votes'\)/);
    assert.match(block, /timing\.commentVotesCheck/);
    assert.match(block, /timing\.commentsQuery/);
    assert.match(block, /ORDER BY c\.created_at DESC/);
    assert.match(block, /cv2\.user_id = \$2/);
    assert.match(block, /LEFT JOIN profiles p ON p\.id = c\.user_id/);
    assert.doesNotMatch(block, /DELETED_COMMENT_BODY/);
  });

  it("times comments auth only around the existing optional-auth steps", () => {
    const start = authSrc.indexOf("export async function optionalSupabaseUser");
    assert.ok(start >= 0);
    const block = authSrc.slice(start);
    assert.match(block, /commentsReadClock/);
    assert.match(block, /supabase\.auth\.getUser\(accessToken\)/);
    assert.match(block, /\.from\('profiles'\)/);
    assert.match(block, /userResolve: userResolveMs/);
    assert.match(block, /profile: profileMs/);
    assert.match(block, /if \(isBanned \|\| isSuspended\)/);
    assert.doesNotMatch(block, /console\.(log|info|error)\([^)]*userResolveMs/);
    assert.match(block, /\.from\('profiles'\)/);
  });

  it("loads comments viewer ban state from the pooled profile primary key", () => {
    assert.match(viewerSrc, /supabase\.auth\.getUser\(accessToken\)/);
    assert.match(
      viewerSrc,
      /SELECT banned, suspended_until\s+FROM profiles\s+WHERE id = \$1\s+LIMIT 1/,
    );
    assert.match(viewerSrc, /resolveCommentsReadViewerId\(user\.id, profile\)/);
    assert.match(viewerSrc, /profileState: profileStateMs/);
    assert.doesNotMatch(viewerSrc, /\.from\('profiles'\)/);
    assert.doesNotMatch(viewerSrc, /optionalSupabaseUser/);
  });
});
