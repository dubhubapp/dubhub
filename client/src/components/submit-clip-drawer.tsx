import { useRef, useCallback } from "react";
import { Film, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useSubmitClip } from "@/lib/submit-clip-context";

export function SubmitClipDrawer() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isSubmitClipOpen, closeSubmitClip } = useSubmitClip();
  const pickInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("video/")) {
        toast({
          title: "Invalid file",
          description: "Please choose a video.",
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();

      reader.onerror = () => {
        toast({
          title: "Error",
          description: "Failed to read the video. Try again.",
          variant: "destructive",
        });
      };

      reader.onload = () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const blob = new Blob([arrayBuffer], { type: file.type });
          const blobUrl = URL.createObjectURL(blob);

          localStorage.setItem(
            "dubhub-trim-state",
            JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              videoUrl: blobUrl,
            }),
          );
          // Trim step writes dubhub-trim-times when the user taps Next.
          localStorage.removeItem("dubhub-trim-times");

          closeSubmitClip();
          setLocation("/trim-video");
        } catch (error) {
          console.error("Error creating Blob URL:", error);
          toast({
            title: "Error",
            description: "Failed to process the video. Try again.",
            variant: "destructive",
          });
        }
      };

      reader.readAsArrayBuffer(file);
    },
    [closeSubmitClip, setLocation, toast],
  );

  const onPickChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFileSelect(file);
  };

  const openNativePicker = (input: HTMLInputElement | null) => {
    const run = () => input?.click();
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  };

  const triggerPickGallery = () => {
    closeSubmitClip();
    openNativePicker(pickInputRef.current);
  };

  const triggerPickCamera = () => {
    closeSubmitClip();
    openNativePicker(captureInputRef.current);
  };

  return (
    <>
      <input
        ref={pickInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onPickChange}
        data-testid="input-file"
      />
      <input
        ref={captureInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={onPickChange}
        data-testid="input-file-camera"
      />

      <Drawer
        open={isSubmitClipOpen}
        onOpenChange={(open) => {
          if (!open) closeSubmitClip();
        }}
        shouldScaleBackground={false}
      >
        <DrawerContent
          overlayClassName="z-40 bg-transparent pointer-events-auto"
          className="z-40 mx-auto mt-0 max-h-[min(420px,85dvh)] w-full max-w-xl gap-0 rounded-t-3xl border border-gray-800 bg-surface/98 p-0 shadow-2xl backdrop-blur-md outline-none"
          style={{ bottom: "var(--app-bottom-nav-block)" }}
        >
          <DrawerTitle className="sr-only">Add your clip</DrawerTitle>
          <DrawerDescription className="sr-only">
            Choose a video from your library or record with the camera.
          </DrawerDescription>

          <div className="border-b border-gray-800/90 px-4 pb-3 pt-2 text-left">
            <h3 className="text-base font-semibold text-white">Add your clip</h3>
            <p className="mt-1 text-sm text-gray-400">
              Choose from your library or record with the camera.
            </p>
          </div>

          <div className="flex flex-col gap-2 px-4 pb-6 pt-3">
            <button
              type="button"
              className="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors bg-gray-900/60 hover:bg-gray-800/80 active:bg-gray-800 border border-gray-800/80"
              onClick={triggerPickGallery}
              data-testid="button-select-video"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Film className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-base font-medium text-white">Choose Video</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors bg-gray-900/60 hover:bg-gray-800/80 active:bg-gray-800 border border-gray-800/80"
              onClick={triggerPickCamera}
              data-testid="button-take-video"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Video className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-base font-medium text-white">Take Video</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
