import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GENRE_ENTRIES } from "@/lib/genre-styles";
import {
  getModeratorGenreFilterLabel,
  MODERATOR_GENRE_OPTIONS,
  type ModeratorGenreId,
} from "@/lib/moderator-queue-filters";
import { cn } from "@/lib/utils";

interface ModeratorGenreFilterProps {
  selectedGenres: ModeratorGenreId[];
  onGenresChange: (genres: ModeratorGenreId[]) => void;
}

export function ModeratorGenreFilter({ selectedGenres, onGenresChange }: ModeratorGenreFilterProps) {
  const isAllSelected = selectedGenres.length === 0;
  const triggerLabel = getModeratorGenreFilterLabel(selectedGenres);

  const toggleGenre = (genreId: ModeratorGenreId) => {
    if (selectedGenres.includes(genreId)) {
      onGenresChange(selectedGenres.filter((g) => g !== genreId));
    } else {
      onGenresChange([...selectedGenres, genreId]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 min-w-[9.5rem] max-w-full justify-between border-white/15 bg-black/35 px-2.5 text-sm font-normal"
          data-testid="moderator-genre-filter"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(18rem,calc(100vw-2rem))] border-white/15 bg-background/95 p-3 backdrop-blur-md"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">Genres</span>
          {!isAllSelected ? (
            <button
              type="button"
              className="text-xs font-medium text-accent hover:underline"
              onClick={() => onGenresChange([])}
              data-testid="moderator-genre-filter-clear"
            >
              All Genres
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {MODERATOR_GENRE_OPTIONS.map((genre) => {
            const entry = GENRE_ENTRIES.find((g) => g.id === genre.id);
            const isSelected = selectedGenres.includes(genre.id);
            return (
              <button
                key={genre.id}
                type="button"
                onClick={() => toggleGenre(genre.id)}
                data-testid={`moderator-genre-option-${genre.id}`}
                className={cn(
                  "ios-press rounded-full px-2.5 py-1.5 text-xs transition-colors",
                  isSelected
                    ? entry?.textClass ?? "text-white"
                    : "border border-white/15 bg-white/10 text-white/85 hover:bg-white/20",
                )}
                style={isSelected && entry?.bgColor ? { backgroundColor: entry.bgColor } : undefined}
              >
                {genre.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
