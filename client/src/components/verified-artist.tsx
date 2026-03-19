import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const VERIFIED_ARTIST_GOLD = "#FFD700";
export const VERIFIED_ARTIST_PILL_BG = "#D4AF37";

// Shared gold treatment used for verified-artist identity UI.
export const goldTextClass = "text-[#FFD700]";
export const goldGlowDropShadowClass = "drop-shadow-[0_0_10px_rgba(255,215,0,0.6)]";
export const goldAvatarGlowShadowClass = "shadow-[0_0_18px_rgba(255,215,0,0.45)]";
export const goldPillGlowShadowClass = "shadow-[0_0_14px_rgba(255,215,0,0.35)]";

export function GoldVerifiedTick({
  title = "Verified Artist Profile",
  className,
  withBackground = false,
  backgroundClassName = "bg-black rounded-full",
}: {
  title?: string;
  className?: string;
  withBackground?: boolean;
  backgroundClassName?: string;
}) {
  return (
    <span title={title} className="inline-flex">
      <CheckCircle
        className={cn(
          "text-[#FFD700] " + goldGlowDropShadowClass,
          withBackground ? backgroundClassName : "",
          className
        )}
      />
    </span>
  );
}

export function GoldVerifiedArtistPill({
  label = "Artist Verified",
  size = "sm",
  "data-testid": dataTestId,
  className,
}: {
  label?: string;
  size?: "sm" | "xs";
  "data-testid"?: string;
  className?: string;
}) {
  const isSm = size === "sm";
  return (
    <span
      data-testid={dataTestId}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[#FFD700]/70 bg-[#D4AF37] backdrop-blur-sm " +
          goldPillGlowShadowClass,
        isSm ? "px-3 py-1 text-sm font-medium" : "px-2 py-0.5 text-xs font-bold",
        className
      )}
      title="Verified Artist Profile"
    >
      <CheckCircle className="w-3 h-3 text-white drop-shadow-[0_0_6px_rgba(255,215,0,0.35)]" />
      <span className={cn("text-white", isSm ? "font-medium" : "font-bold")}>{label}</span>
    </span>
  );
}

