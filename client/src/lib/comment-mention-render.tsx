import { GoldVerifiedTick } from "@/components/verified-artist";
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
      ? "text-yellow-500 font-medium cursor-pointer hover:underline"
      : "text-inherit font-medium cursor-pointer hover:underline";

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
        className={className}
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
        {showVerifiedTick ? (
          <span className="inline-flex items-center gap-0.5">
            {segment.display}
            <GoldVerifiedTick className="h-3 w-3 shrink-0 text-[#FFD700]" glow="inline" />
          </span>
        ) : (
          segment.display
        )}
      </span>
    );
  });
}
