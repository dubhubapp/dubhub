
import { useState } from "react";

interface GenreFilterProps {
  selectedGenre: string;
  onGenreChange: (genre: string) => void;
  identificationFilter: "all" | "identified" | "unidentified";
  onIdentificationChange: (filter: "all" | "identified" | "unidentified") => void;
  isCollapsed?: boolean;
}

const genres = [
  { id: "all", label: "All", color: "bg-gray-100 text-gray-800" },
  { id: "dnb", label: "DnB", color: "text-white", bgColor: "#8f57b3" },
  { id: "ukg", label: "UKG", color: "text-white", bgColor: "#77c961" },
  { id: "dubstep", label: "Dubstep", color: "text-white", bgColor: "#b0271d" },
  { id: "bassline", label: "Bassline", color: "text-white", bgColor: "#3c72f5" },
  { id: "house", label: "House", color: "text-black", bgColor: "#fdb436" },
  { id: "techno", label: "Techno", color: "text-white", bgColor: "#e882cf" },
  { id: "trance", label: "Trance", color: "text-black", bgColor: "#93e1de" },
  { id: "other", label: "Other", color: "text-white", bgColor: "#7e7e7e" },
];

export function GenreFilter({ 
  selectedGenre, 
  onGenreChange, 
  identificationFilter, 
  onIdentificationChange,
  isCollapsed = false 
}: GenreFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedGenreLabel = genres.find(g => g.id === selectedGenre)?.label || "All";

  if (isCollapsed) {
    return (
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="bg-white/10 backdrop-blur-lg rounded-full px-4 py-2 text-white hover:bg-white/20 transition-colors flex items-center space-x-2 border border-white/20"
        >
          <span className="text-sm font-medium">{selectedGenreLabel}</span>
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
              <div className="grid grid-cols-3 gap-2">
                {genres.map((genre) => {
                  const isSelected = selectedGenre === genre.id;
                  return (
                    <button
                      type="button"
                      key={genre.id}
                      onClick={() => {
                        onGenreChange(genre.id);
                        setIsOpen(false);
                      }}
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
                    setIsOpen(false);
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
                    setIsOpen(false);
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
      {/* Genre Pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        {genres.slice(0, 5).map((genre) => {
          const isSelected = selectedGenre === genre.id;
          return (
            <button
              type="button"
              key={genre.id}
              onClick={() => onGenreChange(genre.id)}
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
          const isSelected = selectedGenre === genre.id;
          return (
            <button
              type="button"
              key={genre.id}
              onClick={() => onGenreChange(genre.id)}
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
