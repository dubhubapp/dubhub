import {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Flame, Clock, TrendingUp } from "lucide-react";
import { GENRE_ENTRIES, getGenreLabel } from "@/lib/genre-styles";
import { cn } from "@/lib/utils";
import { DiceDiscoverIcon } from "@/components/random-dice-button";
import { playInteractionMedium } from "@/lib/haptic";

const MENU_MAX_WIDTH = 320;
const VIEWPORT_GUTTER = 8;
/** Keep aligned with `animation.dice-spin` in `tailwind.config.ts` (~0.42s) and `DICE_SPIN_ANIMATION_MS` in home.tsx */
const MENU_RANDOM_DICE_SPIN_MS = 420;

export type FeedSortMode = "trending" | "newest" | "hottest" | "random";

const FEED_MODE_LABELS: Record<FeedSortMode, string> = {
  trending: "Trending",
  newest: "Newest",
  hottest: "Hottest",
  random: "Random",
};

/** Shared compact section chrome for the collapsed Discover menu. */
const discoverMenuSectionClass = "px-3 py-2.5";
const discoverMenuHeadingClass = "mb-2 text-sm font-semibold text-white";

const feedModeCellBase =
  "ios-press flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-0.5 rounded-lg border py-1.5 px-1 text-center transition-all touch-manipulation [-webkit-tap-highlight-color:transparent] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 focus-visible:ring-offset-0";
const feedModeActiveClass =
  "text-accent-foreground border-accent/70 bg-accent font-semibold shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]";
const feedModeInactiveClass =
  "border-white/10 bg-black/20 text-white/70 hover:bg-black/30 hover:text-white";

function FeedModeMenuButton({
  variant,
  active,
  label,
  onPress,
  "aria-label": ariaLabel,
  children,
}: {
  variant: "flame" | "clock" | "trending";
  active: boolean;
  label: string;
  onPress: () => void;
  "aria-label": string;
  children: ReactNode;
}) {
  const [burstKey, setBurstKey] = useState(0);
  const [pressPlaying, setPressPlaying] = useState(false);

  useEffect(() => {
    if (!pressPlaying) return;
    const ms = variant === "flame" ? 400 : variant === "clock" ? 280 : 420;
    const t = window.setTimeout(() => setPressPlaying(false), ms);
    return () => window.clearTimeout(t);
  }, [pressPlaying, burstKey, variant]);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={() => {
        onPress();
        setBurstKey((k) => k + 1);
        setPressPlaying(true);
      }}
      className={cn(feedModeCellBase, active ? feedModeActiveClass : feedModeInactiveClass)}
    >
      <span
        key={burstKey}
        className={cn(
          "inline-flex size-[22px] transform-gpu items-center justify-center will-change-[transform,filter,color] [&>svg]:size-[22px] [&>svg]:shrink-0 [&>svg]:stroke-current",
          pressPlaying &&
            variant === "flame" &&
            "motion-safe:animate-feed-flame-ignite motion-reduce:animate-none",
          pressPlaying &&
            variant === "clock" &&
            "motion-safe:animate-feed-clock-sweep motion-reduce:animate-none",
          pressPlaying &&
            variant === "trending" &&
            "motion-safe:animate-feed-trending-surge motion-reduce:animate-none",
          !pressPlaying &&
            active &&
            variant === "flame" &&
            "motion-safe:animate-feed-flame-active-pulse motion-reduce:animate-none text-red-200",
          !pressPlaying &&
            active &&
            variant === "clock" &&
            "motion-safe:animate-feed-clock-active-pulse motion-reduce:animate-none text-cyan-100",
          !pressPlaying &&
            active &&
            variant === "trending" &&
            "motion-safe:animate-feed-trending-active-pulse motion-reduce:animate-none text-amber-200",
          !pressPlaying && !active && "text-white/70",
        )}
      >
        {children}
      </span>
      <span className={cn("text-xs font-medium leading-none", active ? "text-accent-foreground" : "text-white/85")}>
        {label}
      </span>
    </button>
  );
}

function FeedModeRandomCell({
  active,
  onPress,
  delayPressMs,
}: {
  active: boolean;
  onPress: () => void;
  delayPressMs?: number;
}) {
  const [diceSpinNonce, setDiceSpinNonce] = useState(0);
  const [pressPending, setPressPending] = useState(false);
  const pressDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pressDelayTimeoutRef.current) {
        clearTimeout(pressDelayTimeoutRef.current);
        pressDelayTimeoutRef.current = null;
      }
    };
  }, []);

  const handleClick = () => {
    playInteractionMedium();
    const useDelay = delayPressMs != null && delayPressMs > 0;
    if (useDelay && pressPending) return;

    setDiceSpinNonce((n) => n + 1);

    if (useDelay) {
      if (pressDelayTimeoutRef.current) clearTimeout(pressDelayTimeoutRef.current);
      setPressPending(true);
      pressDelayTimeoutRef.current = setTimeout(() => {
        pressDelayTimeoutRef.current = null;
        setPressPending(false);
        onPress();
      }, delayPressMs);
    } else {
      onPress();
    }
  };

  return (
    <button
      type="button"
      aria-label={active ? "Feed mode: Random, selected" : "Feed mode: Random"}
      aria-pressed={active}
      aria-busy={!!delayPressMs && pressPending}
      disabled={!!delayPressMs && pressPending}
      onClick={handleClick}
      className={cn(feedModeCellBase, active ? feedModeActiveClass : feedModeInactiveClass)}
    >
      <span
        key={diceSpinNonce}
        className={cn(
          "inline-flex size-[22px] transform-gpu items-center justify-center will-change-transform",
          diceSpinNonce > 0 ? "motion-safe:animate-dice-spin motion-reduce:animate-none" : "",
          active ? "text-white" : "text-white/70",
        )}
      >
        <DiceDiscoverIcon className="h-[22px] w-[22px]" />
      </span>
      <span className={cn("text-xs font-medium leading-none", active ? "text-accent-foreground" : "text-white/85")}>
        Random
      </span>
    </button>
  );
}

const FEED_MODE_TRIGGER_ICON_CLASS: Record<FeedSortMode, string> = {
  trending: "text-amber-300",
  newest: "text-cyan-200",
  hottest: "text-red-200",
  random: "text-[#8ffdf4]",
};

function FeedModeTriggerIcon({ mode }: { mode: FeedSortMode }) {
  const iconClass = cn("h-3.5 w-3.5 shrink-0", FEED_MODE_TRIGGER_ICON_CLASS[mode]);
  switch (mode) {
    case "trending":
      return <TrendingUp className={iconClass} strokeWidth={2} aria-hidden />;
    case "newest":
      return <Clock className={iconClass} strokeWidth={2} aria-hidden />;
    case "hottest":
      return <Flame className={iconClass} strokeWidth={2} aria-hidden />;
    case "random":
      return <DiceDiscoverIcon className={iconClass} />;
  }
}

interface GenreFilterProps {
  selectedGenres: string[];
  onGenresChange: (genres: string[]) => void;
  identificationFilter: "all" | "identified" | "unidentified";
  onIdentificationChange: (filter: "all" | "identified" | "unidentified") => void;
  isCollapsed?: boolean;
  /** Home feed: hide green/red ID ring on the genre trigger — status lives in this menu only. */
  omitIdentificationRing?: boolean;
  /** When set with `onSortChange`, collapsed menu includes feed mode (Trending / Newest / Hottest / Random). */
  sortMode?: FeedSortMode;
  onSortChange?: (mode: FeedSortMode) => void;
  onOpenChange?: (open: boolean) => void;
}

const genres = GENRE_ENTRIES.map((g) => ({
  ...g,
  color: g.textClass,
}));

export function GenreFilter({
  selectedGenres,
  onGenresChange,
  identificationFilter,
  onIdentificationChange,
  isCollapsed = false,
  omitIdentificationRing = false,
  sortMode,
  onSortChange,
  onOpenChange,
}: GenreFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const isAllSelected = selectedGenres.length === 0;
  const collapsedLabel = useMemo(() => {
    if (selectedGenres.length > 0) {
      const labels = selectedGenres.map(getGenreLabel);
      return labels.length <= 2
        ? labels.join(" + ")
        : `${labels[0]} + ${labels.length - 1} more`;
    }
    if (identificationFilter === "identified") return "Identified";
    if (identificationFilter === "unidentified") return "Unidentified";
    return "Discover";
  }, [selectedGenres, identificationFilter]);

  const showFeedModeGlyph = sortMode != null && onSortChange != null;

  const triggerAriaLabel = useMemo(() => {
    const modePart =
      sortMode != null ? `, ${FEED_MODE_LABELS[sortMode]} feed` : "";
    if (!isAllSelected) {
      return `Discover filters, ${collapsedLabel}${modePart}`;
    }
    if (identificationFilter === "identified") {
      return `Discover filters, identified tracks only${modePart}`;
    }
    if (identificationFilter === "unidentified") {
      return `Discover filters, unidentified tracks only${modePart}`;
    }
    return `Discover feed filters${modePart}`;
  }, [collapsedLabel, identificationFilter, isAllSelected, sortMode]);

  const collapsedTriggerStatusClass =
    identificationFilter === "identified"
      ? "border-green-400/80 ring-2 ring-green-400/45 shadow-[0_0_8px_2px_rgba(34,197,94,0.55),0_0_28px_4px_rgba(34,197,94,0.35),0_0_48px_2px_rgba(34,197,94,0.2)]"
      : identificationFilter === "unidentified"
        ? "border-red-400/80 ring-2 ring-red-400/45 shadow-[0_0_8px_2px_rgba(239,68,68,0.55),0_0_28px_4px_rgba(239,68,68,0.32),0_0_48px_2px_rgba(239,68,68,0.18)]"
        : "border-white/20 shadow-none ring-0";

  const toggleGenre = (genreId: string) => {
    const isSelected = selectedGenres.includes(genreId);
    if (isSelected) {
      onGenresChange(selectedGenres.filter((g) => g !== genreId));
    } else {
      onGenresChange([...selectedGenres, genreId]);
    }
  };

  const updateMenuPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el || !isOpen) {
      setMenuPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : MENU_MAX_WIDTH;
    const vh = typeof window !== "undefined" ? window.innerHeight : 520;
    const width = Math.min(MENU_MAX_WIDTH, vw - VIEWPORT_GUTTER * 2);
    let left = r.left + r.width / 2 - width / 2;
    left = Math.max(VIEWPORT_GUTTER, Math.min(left, vw - width - VIEWPORT_GUTTER));

    const panelCap = Math.min(540, Math.floor(vh * 0.76));
    let top = r.bottom + VIEWPORT_GUTTER;
    let maxHeight = Math.min(panelCap, vh - top - VIEWPORT_GUTTER);
    if (maxHeight < 168) {
      maxHeight = Math.min(panelCap, Math.max(120, r.top - VIEWPORT_GUTTER * 2));
      top = r.top - maxHeight - VIEWPORT_GUTTER;
    }
    top = Math.max(VIEWPORT_GUTTER, Math.min(top, vh - maxHeight - VIEWPORT_GUTTER));

    setMenuPos({ top, left, width, maxHeight });
  }, [isOpen]);

  useLayoutEffect(() => {
    updateMenuPos();
  }, [updateMenuPos, isOpen, collapsedLabel, selectedGenres.length, identificationFilter, sortMode]);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;
    const onReposition = () => updateMenuPos();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [isOpen, updateMenuPos]);

  if (isCollapsed) {
    const menuContent = (
      <>
        {sortMode != null && onSortChange ? (
          <div className={cn("border-b border-white/20", discoverMenuSectionClass)}>
            <h3 id="discover-feed-mode-heading" className={discoverMenuHeadingClass}>
              Feed
            </h3>
            <div
              role="group"
              aria-labelledby="discover-feed-mode-heading"
              className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/35 p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-md"
            >
              <FeedModeMenuButton
                variant="trending"
                active={sortMode === "trending"}
                label={FEED_MODE_LABELS.trending}
                onPress={() => onSortChange("trending")}
                aria-label={
                  sortMode === "trending" ? "Feed mode: Trending, selected" : "Feed mode: Trending"
                }
              >
                <TrendingUp className="h-5 w-5" strokeWidth={2} aria-hidden />
              </FeedModeMenuButton>
              <FeedModeMenuButton
                variant="clock"
                active={sortMode === "newest"}
                label={FEED_MODE_LABELS.newest}
                onPress={() => onSortChange("newest")}
                aria-label={sortMode === "newest" ? "Feed mode: Newest, selected" : "Feed mode: Newest"}
              >
                <Clock className="h-5 w-5" strokeWidth={2} aria-hidden />
              </FeedModeMenuButton>
              <FeedModeMenuButton
                variant="flame"
                active={sortMode === "hottest"}
                label={FEED_MODE_LABELS.hottest}
                onPress={() => onSortChange("hottest")}
                aria-label={
                  sortMode === "hottest" ? "Feed mode: Hottest, selected" : "Feed mode: Hottest"
                }
              >
                <Flame className="h-5 w-5" strokeWidth={2} aria-hidden />
              </FeedModeMenuButton>
              <FeedModeRandomCell
                active={sortMode === "random"}
                delayPressMs={sortMode === "random" ? MENU_RANDOM_DICE_SPIN_MS : undefined}
                onPress={() => onSortChange("random")}
              />
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            discoverMenuSectionClass,
            sortMode != null && onSortChange && "border-b border-white/20",
          )}
        >
          <h3 className={discoverMenuHeadingClass}>Status</h3>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-pressed={identificationFilter === "identified"}
              onClick={() => {
                onIdentificationChange(identificationFilter === "identified" ? "all" : "identified");
              }}
              className={`ios-press min-h-9 flex-1 rounded-full px-3 py-1.5 text-xs transition-colors ${
                identificationFilter === "identified"
                  ? "bg-green-500 text-white"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              Identified
            </button>
            <button
              type="button"
              aria-pressed={identificationFilter === "unidentified"}
              onClick={() => {
                onIdentificationChange(identificationFilter === "unidentified" ? "all" : "unidentified");
              }}
              className={`ios-press min-h-9 flex-1 rounded-full px-3 py-1.5 text-xs transition-colors ${
                identificationFilter === "unidentified"
                  ? "bg-red-500 text-white"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              Unidentified
            </button>
          </div>
        </div>

        <div className={discoverMenuSectionClass}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Genres</h3>
            <button
              type="button"
              onClick={() => onGenresChange([])}
              className={`ios-press shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors ${
                isAllSelected
                  ? "bg-gray-100 text-gray-800"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              All
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {genres.map((genre) => {
              const isSelected = selectedGenres.includes(genre.id);
              return (
                <button
                  type="button"
                  key={genre.id}
                  onClick={() => toggleGenre(genre.id)}
                  className={`ios-press min-h-9 rounded-full px-2 py-1.5 text-xs transition-colors ${
                    isSelected
                      ? `${genre.color || "text-white"}`
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                  style={isSelected && genre.bgColor ? { backgroundColor: genre.bgColor } : {}}
                >
                  {genre.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-white/20 bg-white/10 px-3 py-2.5 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => {
              playInteractionMedium();
              setIsOpen(false);
            }}
            className="ios-press min-h-9 w-full rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/30"
          >
            Done
          </button>
        </div>
      </>
    );

    return (
      <div className="relative z-50 inline-flex max-w-full min-w-0 justify-center">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-label={triggerAriaLabel}
          className={cn(
            "ios-press flex max-w-full min-h-9 min-w-0 items-center gap-1 rounded-full border bg-white/10 px-2.5 py-1.5 text-left text-white backdrop-blur-lg transition-[colors,box-shadow,border-color] hover:bg-white/20 sm:gap-1.5 sm:px-3 sm:py-2",
            omitIdentificationRing ? "border-white/20 shadow-none ring-0" : collapsedTriggerStatusClass
          )}
        >
          {showFeedModeGlyph && sortMode ? (
            <span className="inline-flex shrink-0" aria-hidden>
              <FeedModeTriggerIcon mode={sortMode} />
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{collapsedLabel}</span>
          <svg
            className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen &&
          menuPos &&
          typeof document !== "undefined" &&
          createPortal(
            <>
              <button
                type="button"
                aria-label="Close filters"
                className="fixed inset-0 z-[55] bg-black/20"
                onClick={() => setIsOpen(false)}
              />
              <div
                role="dialog"
                aria-label="Discover feed filters"
                style={{
                  position: "fixed",
                  top: menuPos.top,
                  left: menuPos.left,
                  width: menuPos.width,
                  maxHeight: menuPos.maxHeight,
                  zIndex: 60,
                }}
                className="overflow-y-auto rounded-xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl"
              >
                {menuContent}
              </div>
            </>,
            document.body
          )}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => onGenresChange([])}
          className={`ios-press rounded-full px-4 py-2 text-sm transition-colors ${
            isAllSelected
              ? "bg-gray-100 text-gray-800"
              : "bg-white/20 text-white hover:bg-white/30"
          }`}
        >
          All
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {genres.slice(0, 5).map((genre) => {
          const isSelected = selectedGenres.includes(genre.id);
          return (
            <button
              type="button"
              key={genre.id}
              onClick={() => toggleGenre(genre.id)}
              className={`ios-press rounded-full px-4 py-2 text-sm transition-colors ${
                isSelected
                  ? `${genre.color || "text-white"}`
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
              style={isSelected && genre.bgColor ? { backgroundColor: genre.bgColor } : {}}
            >
              {genre.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {genres.slice(5).map((genre) => {
          const isSelected = selectedGenres.includes(genre.id);
          return (
            <button
              type="button"
              key={genre.id}
              onClick={() => toggleGenre(genre.id)}
              className={`ios-press rounded-full px-4 py-2 text-sm transition-colors ${
                isSelected
                  ? `${genre.color || "text-white"}`
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
              style={isSelected && genre.bgColor ? { backgroundColor: genre.bgColor } : {}}
            >
              {genre.label}
            </button>
          );
        })}
      </div>

      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() =>
            onIdentificationChange(identificationFilter === "identified" ? "all" : "identified")
          }
          className={`ios-press rounded-full px-6 py-2 text-sm transition-colors ${
            identificationFilter === "identified"
              ? "bg-green-500 text-white"
              : "bg-white/20 text-white hover:bg-white/30"
          }`}
        >
          Identified
        </button>
        <button
          type="button"
          onClick={() =>
            onIdentificationChange(identificationFilter === "unidentified" ? "all" : "unidentified")
          }
          className={`ios-press rounded-full px-6 py-2 text-sm transition-colors ${
            identificationFilter === "unidentified"
              ? "bg-red-500 text-white"
              : "bg-white/20 text-white hover:bg-white/30"
          }`}
        >
          Unidentified
        </button>
      </div>
    </div>
  );
}
