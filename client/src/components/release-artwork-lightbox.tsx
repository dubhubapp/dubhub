import { ImageLightbox } from "@/components/image-lightbox";

type ReleaseArtworkLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artworkUrl: string;
  title: string;
};

export function ReleaseArtworkLightbox({
  open,
  onOpenChange,
  artworkUrl,
  title,
}: ReleaseArtworkLightboxProps) {
  const imageAlt = title.trim() ? `Artwork for ${title.trim()}` : "Release artwork";

  return (
    <ImageLightbox
      open={open}
      onOpenChange={onOpenChange}
      imageUrl={artworkUrl}
      imageAlt={imageAlt}
      closeAriaLabel="Close artwork viewer"
      closeTestId="button-close-release-artwork-lightbox"
    />
  );
}
