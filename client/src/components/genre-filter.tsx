import { useState, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { GENRE_ENTRIES, getGenreLabel } from "@/lib/genre-styles";
import { cn } from "@/lib/utils";

const MENU_MAX_WIDTH = 320;
const VIEWPORT_GUTTER = 8;

interface GenreFilterProps {
  selectedGenres: string[];
  onGenresChange: (genres: string[]) => void;
  identificationFilter: "all" | "identified" | "unidentified";
  onIdentificationChange: (filter: "all" | "identified" | "unidentified") => void;
  isCollapsed?: boolean;
  /** Home feed: hide green/red ID ring on the genre trigger — status lives in this menu only. */
  omitIdentificationRing?: boolean;
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
  }, [updateMenuPos, isOpen, collapsedLabel, selectedGenres.length, identificationFilter]);

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
