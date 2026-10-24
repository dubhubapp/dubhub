import { GoldVerifiedTick } from "@/components/verified-artist";
import {
  ARTIST_IDENTITY_COMPACT_CLASS,
  VERIFIED_NAME_CLASS,
  VERIFIED_NAME_INLINE_CLASS,
} from "@/lib/artist-identity-presentation";
import { cn } from "@/lib/utils";
import { parseCommentMentionSegments } from "@shared/mentionParsing";
import type { MouseEvent, ReactNode } from "react";

type MentionRenderOptions = {
  tagStatus?: "pending" | "confirmed" | "denied";
  onMentionClick?: (username: string, event: MouseEvent<HTMLSpanElement>) => void;
};

export function renderCommentMentionNodes(
  text: string,
  isVerifiedArtistUsername: (username: string) => boolean,
  options?: MentionRenderOptions,
): ReactNode[] {
  const tagStatus = options?.tagStatus;
  const onMentionClick = options?.onMentionClick;

  return parseCommentMentionSegments(text).map((segment, index) => {
    if (segment.type === "text") {
      return segment.value;
    }

    const username = segment.username;
    const isVerifiedArtist = isVerifiedArtistUsername(username);

    let className = isVerifiedArtist
      ? `${ARTIST_IDENTITY_COMPACT_CLASS} font-semibold cursor-pointer no-underline hover:no-underline active:no-underline focus:no-underline`
      : "text-inherit font-semibold cursor-pointer no-underline hover:no-underline active:no-underline focus:no-underline";

    if (tagStatus === "confirmed") {
      className =
        "text-green-600 font-medium bg-green-50 px-1 rounded cursor-pointer hover:underline dark:bg-green-950/55 dark:text-green-400";
    } else if (tagStatus === "denied") {
      className =
        "text-gray-400 font-medium line-through cursor-pointer hover:underline dark:text-white/45";
    }

    const showVerifiedTick =
      isVerifiedArtist && tagStatus !== "confirmed" && tagStatus !== "denied";

    return (
      <span
        key={`mention-${index}-${username}`}
        className={cn(
          className,
          showVerifiedTick && VERIFIED_NAME_CLASS,
          showVerifiedTick && VERIFIED_NAME_INLINE_CLASS,
        )}
        data-mark-id-long-press-ignore="true"
        onClick={
          onMentionClick
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                onMentionClick(username, e);
              }
            : undefined
        }
      >
        {segment.display}
        {showVerifiedTick ? (
          <GoldVerifiedTick className="h-3 w-3 shrink-0 text-[#FFD700]" glow="inline" />
        ) : null}
      </span>
    );
  });
}
