import type { RecentMentionUser } from "@/lib/comment-mention-recent";

export type MentionSuggestionSource = "pinned" | "artist" | "recent" | "thread";

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

export type BuildMentionSuggestionsInput = {
  query: string;
  verifiedArtists: VerifiedArtistRow[];
  recentMentionUsers: RecentMentionUser[];
  threadParticipants: MentionSuggestion[];
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

export function buildMentionSuggestions(input: BuildMentionSuggestionsInput): MentionSuggestion[] {
  const maxResults = input.maxResults ?? DEFAULT_MAX_RESULTS;
  const query = input.query;
  const seen = new Set<string>();
  const results: MentionSuggestion[] = [];

  const tryAdd = (suggestion: MentionSuggestion, options?: { allowSelf?: boolean }) => {
    if (results.length >= maxResults) return;
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
        { allowSelf: true },
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
    );
  }

  for (const recent of input.recentMentionUsers) {
    tryAdd(
      toSuggestion(
        {
          userId: recent.userId,
          username: recent.username,
          avatar_url: recent.avatar_url ?? null,
          verified_artist: recent.verified_artist,
        },
        "recent",
      ),
    );
  }

  for (const participant of input.threadParticipants) {
    tryAdd(
      toSuggestion(
        {
          userId: participant.userId,
          username: participant.username,
          avatar_url: participant.avatar_url ?? null,
          verified_artist: participant.verified_artist,
        },
        participant.source ?? "thread",
      ),
    );
  }

  return results;
}
