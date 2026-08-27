import { useRef, useCallback, useEffect } from "react";
import { Film, Video } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useSubmitClip } from "@/lib/submit-clip-context";
import { clearDubhubTrimSession } from "@/lib/dubhub-trim-session";
import { dubhubVideoDebugLog } from "@/lib/video-debug";
import {
  NATIVE_PICKER_OPEN_DELAY_MS,
  SUBMIT_PICKER_CLOSE_FALLBACK_MS,
  inputForPendingPickerSource,
  takePendingPickerSource,
  type SubmitPendingPickerSource,
} from "@/lib/submit-picker-handoff";

type NormalizedPickedAsset = {
  fileName: string;
  fileType: string;
  fileSize: number;
  extension: string;
  videoUrl: string;
  sourceNativeUri?: string;
};

function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i + 1).toLowerCase();
}

function normalizePickedFile(file: File): Omit<NormalizedPickedAsset, "videoUrl"> {
  const fileName = file.name?.trim() || `clip-${Date.now()}.mp4`;
  const extension = extFromName(fileName);
  const fallbackType = extension === "m4v" || extension === "mp4" ? "video/mp4" : "video/*";
  return {
    fileName,
    fileType: (file.type || fallbackType).toLowerCase(),
    fileSize: Number.isFinite(file.size) ? file.size : 0,
    extension,
  };
}

export function SubmitClipDrawer() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const {
    isSubmitClipOpen,
    closeSubmitClip,
    completeSubmitClipClose,
    fileInputRemountKey,
    clearNativePostArtifact,
  } = useSubmitClip();
  const pickInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const pendingPickerSourceRef = useRef<SubmitPendingPickerSource | null>(null);
  const pickerLaunchStartedRef = useRef(false);
  const closeFinalizedRef = useRef(false);
  const pickerHandoffTimerRef = useRef<number | null>(null);
  const pickerCloseFallbackTimerRef = useRef<number | null>(null);

  const NATIVE_PICKER_OPEN_DELAY_MS_RUNTIME = Capacitor.isNativePlatform()
    ? NATIVE_PICKER_OPEN_DELAY_MS
    : 0;

  const clearPickerCloseFallback = useCallback(() => {
    if (pickerCloseFallbackTimerRef.current != null) {
      window.clearTimeout(pickerCloseFallbackTimerRef.current);
      pickerCloseFallbackTimerRef.current = null;
    }
  }, []);

  const clearPickerHandoffTimer = useCallback(() => {
    if (pickerHandoffTimerRef.current != null) {
      window.clearTimeout(pickerHandoffTimerRef.current);
      pickerHandoffTimerRef.current = null;
    }
  }, []);

  const finalizeSubmitClipClose = useCallback(() => {
    clearPickerCloseFallback();
    if (closeFinalizedRef.current) return;
    closeFinalizedRef.current = true;
    completeSubmitClipClose();
  }, [clearPickerCloseFallback, completeSubmitClipClose]);

  useEffect(() => {
    return () => {
      clearPickerCloseFallback();
      clearPickerHandoffTimer();
    };
  }, [clearPickerCloseFallback, clearPickerHandoffTimer]);

  useEffect(() => {
    if (!isSubmitClipOpen) return;
    pendingPickerSourceRef.current = null;
    pickerLaunchStartedRef.current = false;
    closeFinalizedRef.current = false;
    clearPickerHandoffTimer();
    clearPickerCloseFallback();
  }, [isSubmitClipOpen, clearPickerCloseFallback, clearPickerHandoffTimer]);

  useEffect(() => {
    const captureEl = captureInputRef.current;
    const pickEl = pickInputRef.current;

    const onCaptureCancel = () => {
      toast({
        title: "No video recorded",
        description:
          "Recording was cancelled. If the camera did not open, check Settings → dub hub → Camera and Microphone.",
      });
    };
    const onPickCancel = () => {
      toast({
        title: "No video selected",
        description:
          "Import was cancelled. If your library did not open, check Settings → dub hub → Photos.",
      });
    };

    captureEl?.addEventListener("cancel", onCaptureCancel);
    pickEl?.addEventListener("cancel", onPickCancel);
    return () => {
      captureEl?.removeEventListener("cancel", onCaptureCancel);
      pickEl?.removeEventListener("cancel", onPickCancel);
    };
  }, [toast]);

  const handleFileSelect = useCallback(
    async (file: File) => {
      const maybe = file as File & {
        webPath?: string;
        path?: string;
        uri?: string;
      };
      const normalized = normalizePickedFile(file);
      dubhubVideoDebugLog("[DubHub][PostFlow][state]", "file selected", {
        fileName: normalized.fileName,
        fileType: normalized.fileType,
        fileSize: normalized.fileSize,
      });
      dubhubVideoDebugLog("[DubHub][NativeBridge]", "picker-result", {
        name: maybe.name ?? null,
        type: maybe.type ?? null,
        size: maybe.size ?? null,
        webPath: maybe.webPath ?? null,
        path: maybe.path ?? null,
        uri: maybe.uri ?? null,
        extension: normalized.extension || null,
      });
      clearNativePostArtifact();
      clearDubhubTrimSession();

      if (!normalized.fileType.startsWith("video/")) {
        toast({
          title: "Invalid file",
          description: "Please choose a video.",
          variant: "destructive",
        });
        return;
      }
      if (normalized.fileSize <= 0) {
        toast({
          title: "Could not read video",
          description: "This video file is missing size metadata. Please try another clip.",
          variant: "destructive",
        });
        return;
      }

      try {
        dubhubVideoDebugLog("[DubHub][NativeBridge]", "source-file-shape", {
          fileName: normalized.fileName,
          fileType: normalized.fileType,
          fileSize: normalized.fileSize,
          extension: normalized.extension || null,
        });
        // Keep picker handoff lightweight to avoid iOS WebView crashes.
        const blobUrl = URL.createObjectURL(file);
        dubhubVideoDebugLog("[DubHub][PostFlow][cleanup]", "object URL created", {
          reason: "submit picker selection",
          fileName: file.name,
          blobUrlPreview: blobUrl.slice(0, 80),
        });

        const payload: NormalizedPickedAsset = {
          fileName: normalized.fileName,
          fileType: normalized.fileType,
          fileSize: normalized.fileSize,
          extension: normalized.extension,
          videoUrl: blobUrl,
        };

        /** Full original clip for re-trim; never replaced by the trimmed export. */
        localStorage.setItem("dubhub-trim-source", JSON.stringify(payload));
        localStorage.setItem("dubhub-trim-state", JSON.stringify(payload));
        localStorage.removeItem("dubhub-trim-export");
        // Trim step writes dubhub-trim-times when the user adjusts selection / taps Next.
        localStorage.removeItem("dubhub-trim-times");

        closeSubmitClip();
        dubhubVideoDebugLog("[DubHub][PostFlow][route]", "entering trim page", {
          route: "/trim-video",
        });
        setLocation("/trim-video");
      } catch (error) {
        dubhubVideoDebugLog("[DubHub][NativeBridge]", "fatal-js-exception-guard", {
          stage: "submit-clip-drawer:handleFileSelect",
          message: error instanceof Error ? error.message : String(error),
        });
        console.error("Error creating Blob URL:", error);
        toast({
          title: "Error",
          description: "Failed to process the video. Try again.",
          variant: "destructive",
        });
      }
    },
    [clearNativePostArtifact, closeSubmitClip, setLocation, toast],
  );

  const onPickChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    dubhubVideoDebugLog("[DubHub][NativeBridge]", "picker-result", {
      hasFile: !!file,
      fileName: file?.name ?? null,
      fileType: file?.type ?? null,
      fileSize: file?.size ?? null,
    });
    e.target.value = "";
    if (!file) {
      // Dismissed without a selection — `cancel` event explains this where supported; avoid noisy toasts here.
      return;
    }
    void handleFileSelect(file);
  };

  const openNativePicker = (source: SubmitPendingPickerSource) => {
    if (pickerLaunchStartedRef.current) return;
    pickerLaunchStartedRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const consumed = takePendingPickerSource(pendingPickerSourceRef);
        if (!consumed) return;
        const input = inputForPendingPickerSource(consumed, {
          gallery: pickInputRef.current,
          camera: captureInputRef.current,
        });
        try {
          input?.click();
        } catch (err) {
          console.error("openNativePicker:", err);
          toast({
            title: "Could not open picker",
            description: "Something blocked the file or camera chooser. Try again.",
            variant: "destructive",
          });
        }
      });
    });
  };

  const handoffPendingPicker = () => {
    pickerHandoffTimerRef.current = null;
    finalizeSubmitClipClose();
    const source = pendingPickerSourceRef.current;
    if (!source) return;
    openNativePicker(source);
  };

  const requestPickerAfterClose = (source: SubmitPendingPickerSource) => {
    if (pendingPickerSourceRef.current) return;
    pickerLaunchStartedRef.current = false;
    closeFinalizedRef.current = false;
    pendingPickerSourceRef.current = source;
    closeSubmitClip();
    clearPickerHandoffTimer();
    clearPickerCloseFallback();
    pickerCloseFallbackTimerRef.current = window.setTimeout(() => {
      pickerCloseFallbackTimerRef.current = null;
      finalizeSubmitClipClose();
    }, SUBMIT_PICKER_CLOSE_FALLBACK_MS);
    const runHandoff = () => handoffPendingPicker();
    if (NATIVE_PICKER_OPEN_DELAY_MS_RUNTIME > 0) {
      pickerHandoffTimerRef.current = window.setTimeout(runHandoff, NATIVE_PICKER_OPEN_DELAY_MS_RUNTIME);
    } else {
      runHandoff();
    }
  };

  const triggerPickGallery = () => {
    requestPickerAfterClose("gallery");
  };

  const triggerPickCamera = () => {
    requestPickerAfterClose("camera");
  };

  return (
    <>
      <input
        key={`dubhub-pick-${fileInputRemountKey}`}
        ref={pickInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onPickChange}
        data-testid="input-file"
      />
      <input
        key={`dubhub-capture-${fileInputRemountKey}`}
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
        onAnimationEnd={(open) => {
          if (!open) finalizeSubmitClipClose();
        }}
        shouldScaleBackground={false}
      >
        <DrawerContent
          overlayClassName="z-40 bg-transparent pointer-events-auto"
          className="z-40 mx-auto mt-0 max-h-[min(420px,85dvh)] w-full max-w-xl gap-0 rounded-t-3xl border border-gray-800 bg-surface/98 p-0 shadow-2xl backdrop-blur-md outline-none"
          style={{ bottom: "var(--app-sheet-screen-bottom, var(--app-bottom-control-inset))" }}
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
