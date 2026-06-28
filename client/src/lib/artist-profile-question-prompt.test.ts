import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ARTIST_QUESTION_PROMPT_RANDOM_SHOW_PROBABILITY,
  ARTIST_QUESTION_PROMPT_SAVE_COOLDOWN_MS,
  ARTIST_QUESTION_PROMPT_SKIP_COOLDOWN_MS,
  getArtistQuestionPromptDismissal,
  isArtistQuestionPromptInCooldown,
  setArtistQuestionPromptDismissal,
  shouldShowArtistQuestionPrompt,
} from "./artist-profile-question-prompt";

const ARTIST_ID = "artist-test-uuid";
const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  });
});

describe("artist question prompt visibility", () => {
  it("always shows for zero answers when not in cooldown", () => {
    assert.equal(
      shouldShowArtistQuestionPrompt({
        artistId: ARTIST_ID,
        unansweredCount: 5,
        answeredCount: 0,
        random: () => 0.99,
      }),
      true,
    );
  });

  it("hides when all questions are answered", () => {
    assert.equal(
      shouldShowArtistQuestionPrompt({
        artistId: ARTIST_ID,
        unansweredCount: 0,
        answeredCount: 3,
      }),
      false,
    );
  });

  it("respects skip cooldown window", () => {
    const now = 1_700_000_000_000;
    setArtistQuestionPromptDismissal(ARTIST_ID, "skip", now);
    assert.equal(isArtistQuestionPromptInCooldown(ARTIST_ID, now + 1000), true);
    assert.equal(
      isArtistQuestionPromptInCooldown(ARTIST_ID, now + ARTIST_QUESTION_PROMPT_SKIP_COOLDOWN_MS),
      false,
    );
    assert.equal(
      shouldShowArtistQuestionPrompt({
        artistId: ARTIST_ID,
        unansweredCount: 2,
        answeredCount: 1,
        now: now + 1000,
        random: () => 0,
      }),
      false,
    );
  });

  it("uses shorter save cooldown than skip", () => {
    const now = 1_700_000_000_000;
    setArtistQuestionPromptDismissal(ARTIST_ID, "save", now);
    const midCooldown = now + ARTIST_QUESTION_PROMPT_SAVE_COOLDOWN_MS - 1000;
    assert.equal(isArtistQuestionPromptInCooldown(ARTIST_ID, midCooldown), true);
    assert.equal(
      isArtistQuestionPromptInCooldown(ARTIST_ID, now + ARTIST_QUESTION_PROMPT_SAVE_COOLDOWN_MS + 1),
      false,
    );
  });

  it("uses random gate when artist already has answers", () => {
    assert.equal(
      shouldShowArtistQuestionPrompt({
        artistId: ARTIST_ID,
        unansweredCount: 4,
        answeredCount: 2,
        random: () => ARTIST_QUESTION_PROMPT_RANDOM_SHOW_PROBABILITY - 0.01,
      }),
      true,
    );
    assert.equal(
      shouldShowArtistQuestionPrompt({
        artistId: ARTIST_ID,
        unansweredCount: 4,
        answeredCount: 2,
        random: () => ARTIST_QUESTION_PROMPT_RANDOM_SHOW_PROBABILITY + 0.01,
      }),
      false,
    );
  });

  it("stores dismissal reason", () => {
    const now = 1_700_000_000_000;
    setArtistQuestionPromptDismissal(ARTIST_ID, "save", now);
    assert.deepEqual(getArtistQuestionPromptDismissal(ARTIST_ID), {
      dismissedAt: now,
      reason: "save",
    });
  });
});
