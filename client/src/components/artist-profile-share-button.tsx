import { Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { shareArtistProfile } from "@/lib/artist-profile-share";
import { cn } from "@/lib/utils";

type ArtistProfileShareButtonProps = {
  username: string;
  className?: string;
  /** Banner header on public/own profile — matches Release Alerts contrast. */
  variant?: "onDark" | "muted";
};

export function ArtistProfileShareButton({
  username,
  className,
  variant = "muted",
}: ArtistProfileShareButtonProps) {
  const { toast } = useToast();

  const handleShare = async () => {
    try {
      const result = await shareArtistProfile(username);
      if (result === "copied") {
        toast({
          title: "Link Copied",
          description: "Artist profile link copied to clipboard",
        });
      } else if (result === "failed") {
        toast({ title: "Error", description: "Failed to copy link", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to copy link", variant: "destructive" });
    }
  };

  return (
    <button
      type="button"
      className={cn(
        "ios-press inline-flex shrink-0 items-center justify-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold leading-none min-h-[1.625rem] ring-1 backdrop-blur-md transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]",
        variant === "onDark"
          ? "border border-white/15 bg-black/40 text-white/90 ring-white/20 hover:bg-black/50"
          : "bg-muted/80 font-medium text-muted-foreground hover:bg-muted",
        className,
      )}
      onClick={() => void handleShare()}
      aria-label="Share artist profile"
      data-testid="button-share-artist-profile"
    >
      <Send className="h-3 w-3 shrink-0" aria-hidden />
      <span className="hidden min-[380px]:inline whitespace-nowrap">Share</span>
    </button>
  );
}
