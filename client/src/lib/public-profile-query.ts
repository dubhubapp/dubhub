import type { ReleaseFeedCardData } from "@/components/release-feed-card";
import type { PublicArtistProfileQuestionAnswer, PublicCommunityOverviewStats, PublicLightProfileStats } from "@shared/schema";

export type PublicReleasesResponse = {
  upcoming: ReleaseFeedCardData[];
  released: ReleaseFeedCardData[];
};

export type PublicProfileResponse = {
  id?: string;
  username?: string;
  avatar_url?: string | null;
  banner_url?: string | null;
  account_type?: string;
  verified_artist?: boolean;
  moderator?: boolean;
  created_at?: string;
  reputation?: number;
  correct_ids?: number;
  karma?: number;
  publicLight?: PublicLightProfileStats;
  publicReleases?: PublicReleasesResponse;
  publicCommunityOverview?: PublicCommunityOverviewStats;
  publicSavedReleases?: PublicReleasesResponse;
  publicProfileQuestionAnswers?: PublicArtistProfileQuestionAnswer[];
};

/** Must match `routeUsername` in `public-profile.tsx` (trimmed, decoded route param). */
export function publicProfileQueryKey(username: string): readonly ["/api/user/profile", string] {
  return ["/api/user/profile", username.trim()] as const;
}

export function normalizePublicProfileResponse(data: PublicProfileResponse): PublicProfileResponse {
  const overview = data.publicCommunityOverview
    ? {
        accuracyPercent: Math.max(0, Math.min(100, Number(data.publicCommunityOverview.accuracyPercent ?? 0))),
        releasesSaved: Number(data.publicCommunityOverview.releasesSaved ?? 0),
        artistIds: Number(data.publicCommunityOverview.artistIds ?? 0),
      }
    : undefined;

  const light = data.publicLight;
  if (!light) {
    return overview ? { ...data, publicCommunityOverview: overview } : data;
  }
  return {
    ...data,
    publicCommunityOverview: overview,
    publicLight: {
      ...light,
      posts: Number(light.posts ?? 0),
      correct_ids: Number(light.correct_ids ?? data.correct_ids ?? 0),
      reputation: Number(light.reputation ?? data.reputation ?? data.karma ?? 0),
      likesOnPosts: Number(light.likesOnPosts ?? 0),
      commentsOnPosts: Number(light.commentsOnPosts ?? 0),
      likesGiven: Number(light.likesGiven ?? 0),
      commentsWritten: Number(light.commentsWritten ?? 0),
      topGenreKey: light.topGenreKey ?? null,
    },
  };
}
