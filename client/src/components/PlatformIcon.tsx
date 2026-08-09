import { Link as LinkIcon } from "lucide-react";
import { getPlatformIcon, getPlatformLabel, isPlatformAssetUrl } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type Props = {
  platform: string;
  className?: string;
  /** Fixed box so layout does not jump while images load. */
  boxClassName?: string;
};

/**
 * Renders platform logo in a fixed square box.
 * Brand assets use img; download/other/missing use a neutral Link icon (no emoji).
 */
export function PlatformIcon({
  platform,
  className = "h-4 w-4 object-contain",
  boxClassName = "h-5 w-5",
}: Props) {
  const icon = getPlatformIcon(platform);
  const label = getPlatformLabel(platform);
  const hasAsset = isPlatformAssetUrl(platform) && icon.length > 0;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        boxClassName,
      )}
      aria-hidden={hasAsset ? undefined : true}
    >
      {hasAsset ? (
        <img src={icon} alt="" className={className} loading="lazy" />
      ) : (
        <LinkIcon className={cn("text-muted-foreground", className)} aria-hidden />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
