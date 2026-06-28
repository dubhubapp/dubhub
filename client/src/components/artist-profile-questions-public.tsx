import { useState } from "react";
import type { PublicArtistProfileQuestionAnswer } from "@shared/schema";
import { formatUsernameDisplay, cn } from "@/lib/utils";

const INITIAL_VISIBLE = 3;

const CARD_CLASS =
  "rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";

export function ArtistProfileQuestionsPublic({
  answers,
  username,
  className,
}: {
  answers: PublicArtistProfileQuestionAnswer[];
  username: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!answers.length) return null;

  const displayName = formatUsernameDisplay(username);
  const visible = expanded ? answers : answers.slice(0, INITIAL_VISIBLE);
  const hasMore = answers.length > INITIAL_VISIBLE;

  return (
    <section className={cn("space-y-3", className)} data-testid="public-profile-questions">
      <h2 className="text-sm font-semibold text-white">
        Get to know {displayName}
      </h2>
      <div className={CARD_CLASS}>
        <ul className="space-y-3">
          {visible.map((row) => (
            <li
              key={row.questionSlug}
              className="border-b border-white/5 pb-3 last:border-b-0 last:pb-0"
              data-testid={`public-profile-question-${row.questionSlug}`}
            >
              <p className="text-xs font-medium leading-snug text-[#4ae9df]/90">{row.question}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-200">{row.answer}</p>
            </li>
          ))}
        </ul>
        {hasMore ? (
          <button
            type="button"
            className="mt-3 text-xs font-medium text-[#4ae9df] hover:text-[#4ae9df]/80 ios-press"
            onClick={() => setExpanded((prev) => !prev)}
            data-testid={expanded ? "public-profile-questions-show-less" : "public-profile-questions-view-all"}
          >
            {expanded ? "Show less" : "View all"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
