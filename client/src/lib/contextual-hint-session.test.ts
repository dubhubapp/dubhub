/**
 * HINTS-PREMIUM-2B — session pacing, budget, and persistence contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONTEXTUAL_HINTS_SESSION_MAX,
  CONTEXTUAL_HINT_FEED_COOLDOWN_MS,
  CONTEXTUAL_HINT_FEED_COOLDOWN_POST_ADVANCES,
  beginArtistSelfTagOccurrence,
  beginCommentsOpenOccurrence,
  beginGenreOpenOccurrence,
  beginLikeEventOccurrence,
  createEmptyContextualHintSession,
  evaluateContextualHintOpportunity,
  isContextualHintSeen,
  isHintOccurrenceSuppressed,
  noteContextualHintActivePostChange,
  noteContextualHintDismissed,
  noteContextualHintShown,
  pacingKindForHintType,
  shouldPersistOnSurfaceClose,
  suppressHintOccurrence,
} from "./contextual-hint-session";
import { getHintArtistSelfTagSeenKey, getHintLikeReleaseSeenKey } from "./onboarding";

const here = dirname(fileURLToPath(import.meta.url));
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const sessionSrc = readFileSync(join(here, "./contextual-hint-session.ts"), "utf8");

type MemStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function memoryStorage(initial: Record<string, string> = {}): MemStorage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const USER_ID = "qa-hints-user";
const LIKE_KEY = getHintLikeReleaseSeenKey(USER_ID);

describe("HINTS-PREMIUM-2B seen persistence", () => {
  it("normal seen Like hint stays suppressed", () => {
    const local = memoryStorage({ [LIKE_KEY]: "1" });
    const gate = evaluateContextualHintOpportunity({
      activeHintType: null,
      session: createEmptyContextualHintSession(),
      kind: "feed",
      hintKey: LIKE_KEY,
      localStorage: local,
    });
    assert.deepEqual(gate, { ok: false, reason: "seen" });
    assert.equal(isContextualHintSeen(LIKE_KEY, { localStorage: local }), true);
  });

  it("unseen Like hint may show when pacing allows", () => {
    const local = memoryStorage();
    const gate = evaluateContextualHintOpportunity({
      activeHintType: null,
      session: createEmptyContextualHintSession(),
      kind: "feed",
      hintKey: LIKE_KEY,
      localStorage: local,
    });
    assert.deepEqual(gate, { ok: true });
  });

  it("Home persists genuine seen keys on intentional dismiss", () => {
    assert.match(homeSrc, /maybePersistHintSeen/);
    assert.match(homeSrc, /persistHintSeen\(key\)/);
    assert.doesNotMatch(homeSrc, /isDebugForceContextualHints/);
    assert.doesNotMatch(sessionSrc, /dubhub_debug_force_contextual_hints/);
  });
});

describe("HINTS-PREMIUM-2B stacking", () => {
  it("second hint cannot become visible while one is active", () => {
    const gate = evaluateContextualHintOpportunity({
      activeHintType: "like",
      session: createEmptyContextualHintSession(),
      kind: "surface",
      hintKey: "dubhub_hint_comments_seen_x",
      localStorage: memoryStorage(),
    });
    assert.deepEqual(gate, { ok: false, reason: "active" });
  });

  it("never stacks two coachmarks", () => {
    const gate = evaluateContextualHintOpportunity({
      activeHintType: "genre",
      session: noteContextualHintShown(createEmptyContextualHintSession()),
      kind: "feed",
      hintKey: LIKE_KEY,
      localStorage: memoryStorage({ [LIKE_KEY]: "1" }),
    });
    assert.deepEqual(gate, { ok: false, reason: "active" });
  });
});

describe("HINTS-PREMIUM-2B budget", () => {
  it("normal session allows up to 3 hints", () => {
    let session = createEmptyContextualHintSession();
    for (let i = 0; i < CONTEXTUAL_HINTS_SESSION_MAX; i++) {
      const gate = evaluateContextualHintOpportunity({
        activeHintType: null,
        session,
        kind: "surface",
        hintKey: `key-${i}`,
        localStorage: memoryStorage(),
      });
      assert.equal(gate.ok, true);
      session = noteContextualHintShown(session);
      session = noteContextualHintDismissed(session, 1_000 + i);
    }
    assert.equal(session.shownCount, 3);
  });

  it("fourth is deferred, not marked seen", () => {
    let session = createEmptyContextualHintSession();
    session = {
      ...session,
      shownCount: CONTEXTUAL_HINTS_SESSION_MAX,
      lastDismissedAt: 1,
    };
    const fourthKey = "dubhub_hint_random_seen_x";
    const local = memoryStorage();
    const gate = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "feed",
      hintKey: fourthKey,
      now: 100_000,
      localStorage: local,
    });
    assert.deepEqual(gate, { ok: false, reason: "budget" });
    assert.equal(local.getItem(fourthKey), null);
  });

  it("new app session resets budget (empty in-memory state)", () => {
    const fresh = createEmptyContextualHintSession();
    assert.equal(fresh.shownCount, 0);
    assert.equal(fresh.lastDismissedAt, null);
    assert.match(homeSrc, /createEmptyContextualHintSession\(\)/);
    assert.match(homeSrc, /contextualHintSessionRef/);
  });
});

describe("HINTS-PREMIUM-2B context / no queue", () => {
  it("blocked opportunity is not queued — helpers have no FIFO queue", () => {
    assert.doesNotMatch(sessionSrc, /queue\.push|pendingQueue/);
    assert.doesNotMatch(sessionSrc, /hintQueue\s*=/);
    assert.doesNotMatch(homeSrc, /hintQueue|pendingHints/);
  });

  it("missed hint remains eligible on next valid contextual trigger", () => {
    const key = LIKE_KEY;
    const local = memoryStorage();
    const blocked = evaluateContextualHintOpportunity({
      activeHintType: "comments",
      session: createEmptyContextualHintSession(),
      kind: "feed",
      hintKey: key,
      localStorage: local,
    });
    assert.deepEqual(blocked, { ok: false, reason: "active" });
    assert.equal(local.getItem(key), null);

    const later = evaluateContextualHintOpportunity({
      activeHintType: null,
      session: createEmptyContextualHintSession(),
      kind: "feed",
      hintKey: key,
      localStorage: local,
    });
    assert.deepEqual(later, { ok: true });
  });
});

describe("HINTS-PREMIUM-2B pacing", () => {
  it("maps Like to feed and Discover/Comments/Artist to surface", () => {
    assert.equal(pacingKindForHintType("like"), "feed");
    assert.equal(pacingKindForHintType("genre"), "surface");
    assert.equal(pacingKindForHintType("comments"), "surface");
    assert.equal(pacingKindForHintType("artist"), "surface");
  });

  it("next feed hint cannot immediately appear after dismissal", () => {
    let session = noteContextualHintShown(createEmptyContextualHintSession());
    session = noteContextualHintDismissed(session, 1_000);
    const gate = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "feed",
      hintKey: LIKE_KEY,
      now: 1_000 + 5_000,
      localStorage: memoryStorage(),
    });
    assert.deepEqual(gate, { ok: false, reason: "cooldown" });
  });

  it("time progress unlocks the next feed hint", () => {
    let session = noteContextualHintShown(createEmptyContextualHintSession());
    session = noteContextualHintDismissed(session, 1_000);
    const gate = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "feed",
      hintKey: LIKE_KEY,
      now: 1_000 + CONTEXTUAL_HINT_FEED_COOLDOWN_MS,
      localStorage: memoryStorage(),
    });
    assert.deepEqual(gate, { ok: true });
  });

  it("active-post advances unlock feed pacing without waiting full cooldown", () => {
    let session = noteContextualHintShown(createEmptyContextualHintSession());
    session = noteContextualHintDismissed(session, 1_000);
    session = noteContextualHintActivePostChange(session, "post-a");
    session = noteContextualHintActivePostChange(session, "post-b");
    session = noteContextualHintActivePostChange(session, "post-c");
    assert.equal(
      session.postAdvancesSinceDismiss,
      CONTEXTUAL_HINT_FEED_COOLDOWN_POST_ADVANCES,
    );
    const gate = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "feed",
      hintKey: LIKE_KEY,
      now: 1_000 + 1_000,
      localStorage: memoryStorage(),
    });
    assert.deepEqual(gate, { ok: true });
  });

  it("surface tips can show after prior clear without feed cooldown", () => {
    let session = noteContextualHintShown(createEmptyContextualHintSession());
    session = noteContextualHintDismissed(session, 1_000);
    const gate = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "surface",
      hintKey: "dubhub_hint_genre_filter_seen_x",
      now: 1_000 + 500,
      localStorage: memoryStorage(),
    });
    assert.deepEqual(gate, { ok: true });
  });

  it("budget still applies when session is full", () => {
    let session = createEmptyContextualHintSession();
    session = {
      ...session,
      shownCount: CONTEXTUAL_HINTS_SESSION_MAX,
      lastDismissedAt: 1_000,
      postAdvancesSinceDismiss: 0,
    };
    const gate = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "feed",
      hintKey: LIKE_KEY,
      now: 1_000 + 100,
      localStorage: memoryStorage(),
    });
    assert.deepEqual(gate, { ok: false, reason: "budget" });
  });
});

describe("HINTS-PREMIUM-2B Home wiring", () => {
  it("wires Like path through evaluateContextualHintOpportunity + persist", () => {
    assert.match(homeSrc, /evaluateContextualHintOpportunity/);
        assert.match(homeSrc, /noteContextualHintActivePostChange/);
    assert.match(homeSrc, /pacingKindForHintType\(payload\.type\)/);
    assert.match(homeSrc, /LIKE_RELEASE_COACHMARK_COPY/);
  });

  it("migrates Discover/Comments/Artist to ContextualCoachmark; Random coaching gone", () => {
    assert.match(homeSrc, /premiumCoachmark/);
    assert.match(homeSrc, /activeHint\?\.type === "artist"/);
    assert.doesNotMatch(homeSrc, /activeHint\?\.type === "random"/);
    assert.doesNotMatch(homeSrc, /Quick tip/);
    assert.doesNotMatch(homeSrc, /hintOverlay/);
  });
});

describe("HINTS-PREMIUM-3 occurrence suppression", () => {
  it("debug dismissal suppresses the current occurrence without mutating seen keys", () => {
    let session = createEmptyContextualHintSession();
    session = beginGenreOpenOccurrence(session);
    const local = memoryStorage();
    const openGate = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "surface",
      hintKey: "dubhub_hint_genre_filter_seen_x",
      occurrenceKind: "genre",
      localStorage: local,
    });
    assert.deepEqual(openGate, { ok: true });

    session = suppressHintOccurrence(session, "genre");
    const afterDismiss = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "surface",
      hintKey: "dubhub_hint_genre_filter_seen_x",
      occurrenceKind: "genre",
      localStorage: local,
    });
    assert.deepEqual(afterDismiss, { ok: false, reason: "occurrence_suppressed" });
  });

  it("close + reopen begins a new occurrence that can show again if unseen", () => {
    let session = createEmptyContextualHintSession();
    session = beginCommentsOpenOccurrence(session);
    session = suppressHintOccurrence(session, "comments");
    assert.equal(isHintOccurrenceSuppressed(session, "comments"), true);

    session = beginCommentsOpenOccurrence(session);
    assert.equal(isHintOccurrenceSuppressed(session, "comments"), false);
    const gate = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "surface",
      hintKey: "dubhub_hint_comments_seen_x",
      occurrenceKind: "comments",
      localStorage: memoryStorage(),
    });
    assert.deepEqual(gate, { ok: true });
  });

  it("Like suppress lasts until the next successful Like event", () => {
    let session = createEmptyContextualHintSession();
    session = beginLikeEventOccurrence(session);
    session = suppressHintOccurrence(session, "like");
    assert.equal(isHintOccurrenceSuppressed(session, "like"), true);
    session = beginLikeEventOccurrence(session);
    assert.equal(isHintOccurrenceSuppressed(session, "like"), false);
  });

  it("artist self-tag occurrence suppress blocks same open; new occurrence may show", () => {
    const artistKey = getHintArtistSelfTagSeenKey(USER_ID);
    const local = memoryStorage();
    let session = createEmptyContextualHintSession();
    session = beginArtistSelfTagOccurrence(session);
    const openGate = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "surface",
      hintKey: artistKey,
      occurrenceKind: "artist",
      localStorage: local,
    });
    assert.deepEqual(openGate, { ok: true });

    session = suppressHintOccurrence(session, "artist");
    const sameOpen = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "surface",
      hintKey: artistKey,
      occurrenceKind: "artist",
      localStorage: local,
    });
    assert.deepEqual(sameOpen, { ok: false, reason: "occurrence_suppressed" });

    session = beginArtistSelfTagOccurrence(session);
    const reopen = evaluateContextualHintOpportunity({
      activeHintType: null,
      session,
      kind: "surface",
      hintKey: artistKey,
      occurrenceKind: "artist",
      localStorage: local,
    });
    assert.deepEqual(reopen, { ok: true });
  });

  it("shouldPersistOnSurfaceClose requires a readable visible interval", () => {
    assert.equal(
      shouldPersistOnSurfaceClose({ shownAt: 1000, now: 1200, minVisibleMs: 900 }),
      false,
    );
    assert.equal(
      shouldPersistOnSurfaceClose({ shownAt: 1000, now: 2000, minVisibleMs: 900 }),
      true,
    );
    assert.equal(shouldPersistOnSurfaceClose({ shownAt: null, now: 2000 }), false);
  });
});
