import { useState, useRef, useLayoutEffect, useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Flame, Clock } from "lucide-react";
import { GENRE_ENTRIES, getGenreLabel } from "@/lib/genre-styles";
import { cn } from "@/lib/utils";
import { RandomDiceButton } from "@/components/random-dice-button";

/** Matches former home feed sort row: idle / active chrome for icon controls. */
const feedSortPillIdle = "text-white/78 hover:text-white";
const feedSortPillActive =
  "text-white [filter:drop-shadow(0_0_10px_rgba(255,255,255,0.28))] scale-[1.03]";
const feedSortIconButtonWrap =
  "relative inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md px-2 transition-[transform,color,filter] duration-150 touch-manipulation [-webkit-tap-highlight-color:transparent] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 focus-visible:ring-offset-0 sm:min-h-12 sm:min-w-12";

function FeedSortMenuIconButton({
  variant,
  active,
  onPress,
  "aria-label": ariaLabel,
  children,
}: {
  variant: "flame" | "clock";
  active: boolean;
  onPress: () => void;
  "aria-label": string;
  children: ReactNode;
}) {
  const [burstKey, setBurstKey] = useState(0);
  const [pressPlaying, setPressPlaying] = useState(false);

  useEffect(() => {
    if (!pressPlaying) return;
    const ms = variant === "flame" ? 400 : 280;
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
      className={cn(
        feedSortIconButtonWrap,
        active ? feedSortPillActive : feedSortPillIdle,
        "touch-manipulation active:scale-[0.97]",
      )}
    >
      <span
        key={burstKey}
        className={cn(
          "inline-flex size-[22px] transform-gpu items-center justify-center will-change-[transform,filter,color] text-inherit [&>svg]:size-[22px] [&>svg]:shrink-0 [&>svg]:stroke-current",
          pressPlaying && variant === "flame" && "animate-feed-flame-ignite",
          pressPlaying && variant === "clock" && "animate-feed-clock-sweep",
          !pressPlaying && active && variant === "flame" && "animate-feed-flame-active-pulse text-red-200",
          !pressPlaying && active && variant === "clock" && "animate-feed-clock-active-pulse text-cyan-100",
          !pressPlaying && !active && "text-white/70",
        )}
      >
        {children}
      </span>
    </button>
  );
}

const MENU_MAX_WIDTH = 320;
const VIEWPORT_GUTTER = 8;

export type FeedSortMode = "hottest" | "newest" | "random";

interface GenreFilterProps {
  selectedGenres: string[];
  onGenresChange: (genres: string[]) => void;
  identificationFilter: "all" | "identified" | "unidentified";
  onIdentificationChange: (filter: "all" | "identified" | "unidentified") => void;
  isCollapsed?: boolean;
  /** Home feed: hide green/red ID ring on the genre trigger — status lives in this menu only. */
  omitIdentificationRing?: boolean;
  /** When set with `onSortChange`, collapsed menu includes Feed order (Hottest / Newest / Random). */
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
  const selectedGenreLabels = selectedGenres.map(getGenreLabel);
  const collapsedLabel =
    isAllSelected
      ? "Genre"
      : selectedGenreLabels.length <= 2
        ? selectedGenreLabels.join(" + ")
        : `${selectedGenreLabels[0]} + ${selectedGenreLabels.length - 1} more`;

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

    const panelCap = Math.min(520, Math.floor(vh * 0.72));
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
        <div className="border-b border-white/20 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Genres</h3>
          <div className="mb-3 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => onGenresChange([])}
              className={`ios-press rounded-full px-3 py-2 text-xs transition-colors ${
                isAllSelected
                  ? "bg-gray-100 text-gray-800"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              All
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {genres.map((genre) => {
              const isSelected = selectedGenres.includes(genre.id);
              return (
                <button
                  type="button"
                  key={genre.id}
                  onClick={() => toggleGenre(genre.id)}
                  className={`ios-press rounded-full px-3 py-2 text-xs transition-colors ${
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

        <div className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Status</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onIdentificationChange(identificationFilter === "identified" ? "all" : "identified");
              }}
              className={`ios-press rounded-full px-4 py-2 text-xs transition-colors ${
                identificationFilter === "identified"
                  ? "bg-green-500 text-white"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              Identified
            </button>
            <button
              type="button"
              onClick={() => {
                onIdentificationChange(identificationFilter === "unidentified" ? "all" : "unidentified");
              }}
              className={`ios-press rounded-full px-4 py-2 text-xs transition-colors ${
                identificationFilter === "unidentified"
                  ? "bg-red-500 text-white"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              Unidentified
            </button>
          </div>
        </div>

        {sortMode != null && onSortChange ? (
          <div className="border-t border-white/20 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Feed order</h3>
            <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
              <FeedSortMenuIconButton
                variant="flame"
                active={sortMode === "hottest"}
                onPress={() => onSortChange("hottest")}
                aria-label="Sort by hottest"
              >
                <Flame className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
              </FeedSortMenuIconButton>
              <FeedSortMenuIconButton
                variant="clock"
                active={sortMode === "newest"}
                onPress={() => onSortChange("newest")}
                aria-label="Sort by newest"
              >
                <Clock className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
              </FeedSortMenuIconButton>
              <RandomDiceButton
                active={sortMode === "random"}
                onPress={() => onSortChange("random")}
                aria-label={
                  sortMode === "random"
                    ? "Random feed order selected"
                    : "Discover random unidentified tracks"
                }
                className={feedSortIconButtonWrap}
              />
            </div>
          </div>
        ) : null}
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
          aria-label={
            isAllSelected
              ? "Filter by genre and identification status"
              : `Genre filter, ${collapsedLabel}`
          }
          className={cn(
            "ios-press flex max-w-full min-h-9 min-w-0 items-center gap-2 rounded-full border bg-white/10 px-3 py-1.5 text-left text-white backdrop-blur-lg transition-[colors,box-shadow,border-color] hover:bg-white/20 sm:px-3.5 sm:py-2",
            omitIdentificationRing ? "border-white/20 shadow-none ring-0" : collapsedTriggerStatusClass
          )}
        >
          <span className="min-w-0 truncate text-sm font-medium">{collapsedLabel}</span>
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
                aria-label="Genre and status filters"
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
