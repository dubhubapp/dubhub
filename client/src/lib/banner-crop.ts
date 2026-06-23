import type { CropAreaPixels } from "@/lib/avatar-crop";

const BANNER_OUTPUT_WIDTH = 1500;
const BANNER_OUTPUT_HEIGHT = 500;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for cropping"));
    image.src = src;
  });
}

export async function exportCroppedBanner(
  imageSrc: string,
  cropAreaPixels: CropAreaPixels,
  filenameBase: string,
): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = BANNER_OUTPUT_WIDTH;
  canvas.height = BANNER_OUTPUT_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not initialize image canvas");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    cropAreaPixels.x,
    cropAreaPixels.y,
    cropAreaPixels.width,
    cropAreaPixels.height,
    0,
    0,
    BANNER_OUTPUT_WIDTH,
    BANNER_OUTPUT_HEIGHT,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });

  if (!blob) {
    throw new Error("Failed to export cropped banner");
  }

  return new File([blob], `${filenameBase}.png`, { type: "image/png" });
}
