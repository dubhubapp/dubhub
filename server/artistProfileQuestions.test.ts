import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ARTIST_PROFILE_QUESTIONS,
  getArtistProfileQuestionBySlug,
  isValidArtistProfileQuestionSlug,
  toPublicArtistProfileQuestionAnswers,
} from "@shared/artist-profile-questions";
import {
  buildArtistProfileQuestionsState,
  requireVerifiedArtistAccount,
  validateArtistProfileAnswerInput,
  validateArtistProfileQuestionSlug,
} from "./artistProfileQuestions";

describe("artist profile questions shared bank", () => {
  it("has unique slugs", () => {
    const slugs = ARTIST_PROFILE_QUESTIONS.map((q) => q.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it("validates known slugs", () => {
    assert.equal(isValidArtistProfileQuestionSlug("first_tune"), true);
    assert.equal(isValidArtistProfileQuestionSlug("not_a_real_slug"), false);
  });

  it("maps public answers newest first with question text", () => {
    const publicAnswers = toPublicArtistProfileQuestionAnswers([
      {
        questionSlug: "first_tune",
        answer: "Track One",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        questionSlug: "arch_nemesis",
        answer: "Latency",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
    ]);
    assert.equal(publicAnswers.length, 2);
    assert.equal(publicAnswers[0].questionSlug, "arch_nemesis");
    assert.equal(publicAnswers[0].question, getArtistProfileQuestionBySlug("arch_nemesis")?.question);
  });
});

describe("artist profile questions server helpers", () => {
  it("requires verified artist account", () => {
    assert.deepEqual(requireVerifiedArtistAccount(null), {
      ok: false,
      status: 401,
      message: "Not authenticated",
    });
    assert.deepEqual(requireVerifiedArtistAccount({ account_type: "user", verified_artist: false }), {
      ok: false,
      status: 403,
      message: "Artists only",
    });
    assert.deepEqual(requireVerifiedArtistAccount({ account_type: "artist", verified_artist: false }), {
      ok: false,
      status: 403,
      message: "Verified artist access only",
    });
    assert.deepEqual(requireVerifiedArtistAccount({ account_type: "artist", verified_artist: true }), {
      ok: true,
    });
  });

  it("rejects invalid slug and empty answer", () => {
    assert.deepEqual(validateArtistProfileQuestionSlug("bad slug"), {
      ok: false,
      status: 400,
      message: "Invalid question slug",
    });
    assert.deepEqual(validateArtistProfileAnswerInput("first_tune", "   "), {
      ok: false,
      status: 400,
      message: "Answer cannot be empty",
    });
    assert.deepEqual(validateArtistProfileAnswerInput("first_tune", "a".repeat(281)), {
      ok: false,
      status: 400,
      message: "Answer must be at most 280 characters",
    });
  });

  it("accepts trimmed valid answer", () => {
    assert.deepEqual(validateArtistProfileAnswerInput("first_tune", "  My first tune  "), {
      ok: true,
      questionSlug: "first_tune",
      answer: "My first tune",
    });
  });

  it("builds unanswered slugs from bank", () => {
    const state = buildArtistProfileQuestionsState([
      {
        questionSlug: "first_tune",
        answer: "Demo",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    assert.equal(state.questions.length, ARTIST_PROFILE_QUESTIONS.length);
    assert.equal(state.answers.length, 1);
    assert.equal(state.unansweredSlugs.includes("first_tune"), false);
    assert.equal(state.unansweredSlugs.length, ARTIST_PROFILE_QUESTIONS.length - 1);
  });
});
