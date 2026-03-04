import { getPlatformIcon, getPlatformLabel, isPlatformAssetUrl } from "@/lib/platforms";

type Props = {
  platform: string;
  className?: string;
};

/** Renders platform icon: img for brand assets, span for emoji (free_download, dub_pack, other) */
export function PlatformIcon({ platform, className = "h-5 w-auto object-contain" }: Props) {
  const icon = getPlatformIcon(platform);
  const label = getPlatformLabel(platform);

  if (isPlatformAssetUrl(platform)) {
    return <img src={icon} alt={label} className={className} />;
  }
  return <span className="inline-flex items-center text-lg leading-none h-5">{icon}</span>;
}
