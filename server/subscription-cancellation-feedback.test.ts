import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { INPUT_LIMITS } from "@shared/input-limits";
import {
  SUBSCRIPTION_CANCELLATION_REASONS,
  buildSubscriptionCancellationFeedbackBody,
  resolveSubscriptionCancellationFeedback,
} from "./subscription-cancellation-feedback";

const here = dirname(fileURLToPath(import.meta.url));
const routesSrc = readFileSync(join(here, "routes.ts"), "utf8");
const helperSrc = readFileSync(join(here, "subscription-cancellation-feedback.ts"), "utf8");
const migrationSrc = readFileSync(
  join(here, "../supabase/migrations/20260926223000_feedback_subscription_cancellation_category.sql"),
  "utf8",
);

describe("subscription cancellation feedback API", () => {
  it("accepts an allowlisted reason and optional note", () => {
    const withNote = resolveSubscriptionCancellationFeedback({
      reason: "too_expensive",
      note: "  the monthly plan  ",
    });
    assert.equal(withNote.ok, true);
    if (!withNote.ok) return;
    assert.equal(withNote.reason, "too_expensive");
    assert.equal(withNote.body, "Reason: too_expensive\nNote: the monthly plan");

    const reasonOnly = resolveSubscriptionCancellationFeedback({
      reason: "not_using_enough",
      note: "   ",
    });
    assert.equal(reasonOnly.ok, true);
    if (!reasonOnly.ok) return;
    assert.equal(reasonOnly.body, "Reason: not_using_enough");
    assert.equal(
      buildSubscriptionCancellationFeedbackBody("missing_features", ""),
      "Reason: missing_features",
    );
  });

  it("stores a note without a reason as other", () => {
    const resolved = resolveSubscriptionCancellationFeedback({
      reason: "",
      note: "switching apps for a bit",
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.reason, "other");
    assert.match(resolved.body, /^Reason: other\nNote: switching apps for a bit$/);
  });

  it("rejects an arbitrary reason and an empty submission", () => {
    const arbitrary = resolveSubscriptionCancellationFeedback({
      reason: "Too expensive",
      note: "",
    });
    assert.equal(arbitrary.ok, false);
    const empty = resolveSubscriptionCancellationFeedback({ reason: null, note: "  " });
    assert.equal(empty.ok, false);
    const objectReason = resolveSubscriptionCancellationFeedback({
      reason: { code: "too_expensive" },
      note: "",
    });
    assert.equal(objectReason.ok, false);
  });

  it("keeps the existing body length limit", () => {
    const resolved = resolveSubscriptionCancellationFeedback({
      reason: "other",
      note: "x".repeat(INPUT_LIMITS.feedbackBody),
    });
    assert.equal(resolved.ok, false);
  });

  it("reuses POST /api/feedback and does not touch subscription snapshots", () => {
    assert.deepEqual([...SUBSCRIPTION_CANCELLATION_REASONS], [
      "too_expensive",
      "not_using_enough",
      "missing_features",
      "app_trouble",
      "taking_break",
      "other",
    ]);
    assert.match(routesSrc, /app\.post\("\/api\/feedback"/);
    assert.match(routesSrc, /resolveSubscriptionCancellationFeedback/);
    assert.match(routesSrc, /subscription_cancellation/);
    assert.match(
      routesSrc,
      /INSERT INTO feedback_submissions \(user_id, category, body, app_version, platform, created_at\)/,
    );
    assert.doesNotMatch(helperSrc, /artist_subscription_snapshots|subscription-status-repository/);
    const handlerStart = routesSrc.indexOf('app.post("/api/feedback"');
    const handler = routesSrc.slice(handlerStart, routesSrc.indexOf("app.post(\"/api/addToMailerLite\""));
    assert.doesNotMatch(handler, /artist_subscription_snapshots|upsertEnvironmentSnapshots|subscription-refresh/);
  });

  it("migration only extends the category check and is a file, not a live apply", () => {
    for (const category of [
      "ux",
      "bug",
      "feature_request",
      "performance",
      "notifications",
      "account_verification",
      "artist_question_suggestion",
      "other",
      "subscription_cancellation",
    ]) {
      assert.match(migrationSrc, new RegExp(`'${category}'`));
    }
    assert.match(migrationSrc, /feedback_submissions_category_check/);
    assert.doesNotMatch(migrationSrc, /ADD COLUMN|CREATE TABLE/i);
  });
});
