import { useState } from "react";
import { GENRE_ENTRIES, getGenreLabel } from "@/lib/genre-styles";
import { cn } from "@/lib/utils";

interface GenreFilterProps {
  selectedGenres: string[];
  onGenresChange: (genres: string[]) => void;
  identificationFilter: "all" | "identified" | "unidentified";
  onIdentificationChange: (filter: "all" | "identified" | "unidentified") => void;
  isCollapsed?: boolean;
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
  isCollapsed = false 
}: GenreFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  if (isCollapsed) {
    return (
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
        <button
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
            "bg-white/10 backdrop-blur-lg rounded-full px-4 py-2 text-white hover:bg-white/20 transition-[colors,box-shadow,border-color] flex items-center space-x-2 border",
            collapsedTriggerStatusClass
          )}
        >
          <span className="text-sm font-medium">{collapsedLabel}</span>
          <svg 
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {isOpen && (
          <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 overflow-hidden min-w-[300px] shadow-2xl">
            {/* Genres Section */}
            <div className="p-4 border-b border-white/20">
              <h3 className="text-sm font-semibold text-white mb-3">Genres</h3>
              <div className="flex flex-wrap gap-2 justify-center mb-3">
                <button
                  type="button"
                  onClick={() => onGenresChange([])}
                  className={`px-3 py-2 text-xs rounded-full transition-colors ${
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
                      className={`px-3 py-2 text-xs rounded-full transition-colors ${
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
            
            {/* Identification Status */}
            <div className="p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Status</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onIdentificationChange(identificationFilter === "identified" ? "all" : "identified");
                  }}
                  className={`px-4 py-2 text-xs rounded-full transition-colors ${
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
                  className={`px-4 py-2 text-xs rounded-full transition-colors ${
                    identificationFilter === "unidentified"
                      ? "bg-red-500 text-white"
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  Unidentified
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* All + Genre Pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          type="button"
          onClick={() => onGenresChange([])}
          className={`px-4 py-2 text-sm rounded-full transition-colors ${
            isAllSelected
              ? "bg-gray-100 text-gray-800"
              : "bg-white/20 text-white hover:bg-white/30"
          }`}
        >
          All
        </button>
      </div>

      {/* Genre Pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        {genres.slice(0, 5).map((genre) => {
          const isSelected = selectedGenres.includes(genre.id);
          return (
            <button
              type="button"
              key={genre.id}
              onClick={() => toggleGenre(genre.id)}
              className={`px-4 py-2 text-sm rounded-full transition-colors ${
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
      
      {/* Second row of genres */}
      <div className="flex flex-wrap gap-2 justify-center">
        {genres.slice(5).map((genre) => {
          const isSelected = selectedGenres.includes(genre.id);
          return (
            <button
              type="button"
              key={genre.id}
              onClick={() => toggleGenre(genre.id)}
              className={`px-4 py-2 text-sm rounded-full transition-colors ${
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
      
      {/* Identification Status Toggle */}
      <div className="flex gap-2 justify-center">
        <button
          type="button"
          onClick={() => onIdentificationChange(identificationFilter === "identified" ? "all" : "identified")}
          className={`px-6 py-2 text-sm rounded-full transition-colors ${
            identificationFilter === "identified"
              ? "bg-green-500 text-white"
              : "bg-white/20 text-white hover:bg-white/30"
          }`}
        >
          Identified
        </button>
        <button
          type="button"
          onClick={() => onIdentificationChange(identificationFilter === "unidentified" ? "all" : "unidentified")}
          className={`px-6 py-2 text-sm rounded-full transition-colors ${
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
