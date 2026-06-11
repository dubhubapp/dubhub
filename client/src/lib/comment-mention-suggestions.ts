import type { RecentMentionUser } from "@/lib/comment-mention-recent";

export type MentionSuggestionSource = "pinned" | "artist" | "recent" | "thread" | "search";

export type MentionSuggestion = {
  userId: string;
  username: string;
  avatar_url?: string | null;
  verified_artist?: boolean;
  source: MentionSuggestionSource;
  isPinnedSelf?: boolean;
};

type VerifiedArtistRow = {
  id: string;
  username: string;
  avatar_url?: string | null;
  profileImage?: string | null;
  verified_artist?: boolean;
};

type GlobalSearchUserRow = {
  id: string;
  username: string;
  avatar_url?: string | null;
  verified_artist?: boolean;
};

export type BuildMentionSuggestionsInput = {
  query: string;
  verifiedArtists: VerifiedArtistRow[];
  recentMentionUsers: RecentMentionUser[];
  threadParticipants: MentionSuggestion[];
  globalSearchResults?: GlobalSearchUserRow[];
  currentUserId?: string | null;
  pinSelfArtist?: boolean;
  selfUsername?: string | null;
  maxResults?: number;
};

const MENTION_QUERY_PATTERN = /^[a-zA-Z0-9._]*$/;
const DEFAULT_MAX_RESULTS = 8;

export function isValidMentionQuery(query: string): boolean {
  return MENTION_QUERY_PATTERN.test(query);
}

function matchesMentionQuery(username: string, query: string): boolean {
  if (!query) return true;
  return username.toLowerCase().includes(query.toLowerCase());
}

function toSuggestion(
  user: {
    userId: string;
    username: string;
    avatar_url?: string | null;
    verified_artist?: boolean;
  },
  source: MentionSuggestionSource,
  extra?: Partial<MentionSuggestion>,
): MentionSuggestion {
  return {
    userId: user.userId,
    username: user.username,
    avatar_url: user.avatar_url ?? null,
    verified_artist: user.verified_artist === true,
    source,
    ...extra,
  };
}

/** Prefer verified-artist list for canonical username and verified flag (case-insensitive). */
function resolveUserFromVerifiedArtists(
  user: {
    userId: string;
    username: string;
    avatar_url?: string | null;
    verified_artist?: boolean;
  },
  verifiedArtists: VerifiedArtistRow[],
): {
  userId: string;
  username: string;
  avatar_url?: string | null;
  verified_artist: boolean;
} {
  const match = verifiedArtists.find(
    (artist) =>
      artist.id === user.userId ||
      artist.username?.toLowerCase() === user.username.toLowerCase(),
  );
  if (match) {
    return {
      userId: match.id,
      username: match.username,
      avatar_url: match.avatar_url ?? match.profileImage ?? user.avatar_url ?? null,
      verified_artist: true,
    };
  }
  return {
    userId: user.userId,
    username: user.username,
    avatar_url: user.avatar_url ?? null,
    verified_artist: user.verified_artist === true,
  };
}

const SEARCH_SLOT_RESERVE_MAX = 3;

export function buildMentionSuggestions(input: BuildMentionSuggestionsInput): MentionSuggestion[] {
  const maxResults = input.maxResults ?? DEFAULT_MAX_RESULTS;
  const query = input.query;
  const searchResults = input.globalSearchResults ?? [];
  const reservedSearchSlots =
    query.length >= 2 && searchResults.length > 0
      ? Math.min(SEARCH_SLOT_RESERVE_MAX, searchResults.length)
      : 0;
  const b1MaxResults = maxResults - reservedSearchSlots;
  const seen = new Set<string>();
  const results: MentionSuggestion[] = [];

  const tryAdd = (
    suggestion: MentionSuggestion,
    options?: { allowSelf?: boolean; cap?: number },
  ) => {
    const cap = options?.cap ?? maxResults;
    if (results.length >= cap) return;
    if (!suggestion.userId || !suggestion.username?.trim()) return;
    if (!matchesMentionQuery(suggestion.username, query)) return;
    if (seen.has(suggestion.userId)) return;

    const isSelf = !!input.currentUserId && suggestion.userId === input.currentUserId;
    if (isSelf && !options?.allowSelf && !suggestion.isPinnedSelf) return;

    seen.add(suggestion.userId);
    results.push(suggestion);
  };

  if (input.pinSelfArtist && input.currentUserId && input.selfUsername) {
    const normalizedSelf = input.selfUsername.toLowerCase();
    const pinnedArtist = input.verifiedArtists.find(
      (artist) =>
        artist.id === input.currentUserId ||
        artist.username?.toLowerCase() === normalizedSelf,
    );
    if (pinnedArtist) {
      tryAdd(
        toSuggestion(
          {
            userId: pinnedArtist.id,
            username: pinnedArtist.username,
            avatar_url: pinnedArtist.avatar_url ?? pinnedArtist.profileImage ?? null,
            verified_artist: true,
          },
          "pinned",
          { isPinnedSelf: true },
        ),
        { allowSelf: true, cap: b1MaxResults },
      );
    }
  }

  for (const artist of input.verifiedArtists) {
    tryAdd(
      toSuggestion(
        {
          userId: artist.id,
          username: artist.username,
          avatar_url: artist.avatar_url ?? artist.profileImage ?? null,
          verified_artist: artist.verified_artist ?? true,
        },
        "artist",
      ),
      { cap: b1MaxResults },
    );
  }

  for (const recent of input.recentMentionUsers) {
    const resolved = resolveUserFromVerifiedArtists(
      {
        userId: recent.userId,
        username: recent.username,
        avatar_url: recent.avatar_url ?? null,
        verified_artist: recent.verified_artist,
      },
      input.verifiedArtists,
    );
    tryAdd(toSuggestion(resolved, "recent"), { cap: b1MaxResults });
  }

  for (const participant of input.threadParticipants) {
    const resolved = resolveUserFromVerifiedArtists(
      {
        userId: participant.userId,
        username: participant.username,
        avatar_url: participant.avatar_url ?? null,
        verified_artist: participant.verified_artist,
      },
      input.verifiedArtists,
    );
    tryAdd(toSuggestion(resolved, participant.source ?? "thread"), { cap: b1MaxResults });
  }

  for (const searchUser of searchResults) {
    const resolved = resolveUserFromVerifiedArtists(
      {
        userId: searchUser.id,
        username: searchUser.username,
        avatar_url: searchUser.avatar_url ?? null,
        verified_artist: searchUser.verified_artist,
      },
      input.verifiedArtists,
    );
    tryAdd(toSuggestion(resolved, "search"));
  }

  return results;
}
