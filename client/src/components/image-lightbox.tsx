import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ImageLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  imageAlt: string;
  closeAriaLabel?: string;
  closeTestId?: string;
};

export function ImageLightbox({
  open,
  onOpenChange,
  imageUrl,
  imageAlt,
  closeAriaLabel = "Close image viewer",
  closeTestId = "button-close-image-lightbox",
}: ImageLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/85 backdrop-blur-sm"
        disableDefaultStyles
        hideCloseButton
        className={cn(
          "fixed inset-0 z-[100] flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0",
          "flex-col border-0 bg-transparent p-0 shadow-none outline-none",
          "duration-200 motion-reduce:duration-0",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{imageAlt}</DialogTitle>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 z-[110] h-9 w-9 border-white/20 bg-black/60 text-white hover:bg-black/80 ios-press top-[max(0.75rem,calc(env(safe-area-inset-top,0px)+0.5rem))]"
          aria-label={closeAriaLabel}
          data-testid={closeTestId}
        >
          <X className="h-5 w-5" aria-hidden />
        </Button>
        <div
          className={cn(
            "flex min-h-0 flex-1 items-center justify-center px-4",
            "pb-[max(1rem,env(safe-area-inset-bottom,0px))]",
            "pt-[max(3.5rem,calc(env(safe-area-inset-top,0px)+3rem))]",
          )}
        >
          <img
            src={imageUrl}
            alt={imageAlt}
            className="max-h-[min(100%,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-4.5rem))] max-w-full object-contain"
            draggable={false}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
