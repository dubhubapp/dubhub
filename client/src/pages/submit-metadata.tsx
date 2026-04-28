import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { INPUT_LIMITS } from "@shared/input-limits";
import { MAX_VIDEO_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_MB } from "@shared/video-upload";
import type { PostWithUser } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/apiBase";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useUser } from "@/lib/user-context";
import { supabase } from "@/lib/supabaseClient";
import { playSuccessNotification } from "@/lib/haptic";
import { APP_PAGE_SCROLL_CLASS } from "@/lib/app-shell-layout";
import { clearDubhubTrimSession } from "@/lib/dubhub-trim-session";
import { dubhubVideoDebugLog } from "@/lib/video-debug";
import { cancelPostAndHardResetToHome } from "@/lib/post-flow";
import { Capacitor } from "@capacitor/core";
import { nativeOutputUriToFileFallback, nativePreviewUri } from "@/lib/native-video-editor";
import { useSubmitClip } from "@/lib/submit-clip-context";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const getTodayInputValue = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const submitFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(INPUT_LIMITS.postTitle, `Title must be at most ${INPUT_LIMITS.postTitle} characters`),
  genre: z.string().min(1, "Genre is required").max(INPUT_LIMITS.postGenre),
  description: z.string().max(INPUT_LIMITS.postDescription, `Description must be at most ${INPUT_LIMITS.postDescription} characters`),
  djName: z.string().max(INPUT_LIMITS.postDjName, `Must be at most ${INPUT_LIMITS.postDjName} characters`),
  location: z.string().max(INPUT_LIMITS.postLocation, `Must be at most ${INPUT_LIMITS.postLocation} characters`),
  playedDate: z.string().optional().refine((v) => !v || v <= getTodayInputValue(), {
    message: "Date cannot be in the future",
  }),
});

type SubmitFormData = z.infer<typeof submitFormSchema>;

const genres = [
  { value: "DnB", label: "Drum & Bass" },
  { value: "UKG", label: "UK Garage" },
  { value: "Dubstep", label: "Dubstep" },
  { value: "Bassline", label: "Bassline" },
  { value: "House", label: "House" },
  { value: "Techno", label: "Techno" },
  { value: "Trance", label: "Trance" },
  { value: "Other", label: "Other" },
];

const GENRE_VALUE_SET = new Set(genres.map((g) => g.value));

function isTitleComplete(title: string | undefined) {
  const t = (title ?? "").trim();
  return t.length > 0 && t.length <= INPUT_LIMITS.postTitle;
}

function isGenreComplete(genre: string | undefined) {
  return !!genre && GENRE_VALUE_SET.has(genre);
}

function isDescriptionComplete(description: string | undefined) {
  const raw = description ?? "";
  const t = raw.trim();
  return t.length > 0 && raw.length <= INPUT_LIMITS.postDescription;
}

function isPlayedDateComplete(playedDate: string | undefined) {
  const v = playedDate?.trim() ?? "";
  if (!v) return false;
  return v <= getTodayInputValue();
}

function isLocationComplete(location: string | undefined) {
  const t = (location ?? "").trim();
  return t.length > 0 && t.length <= INPUT_LIMITS.postLocation;
}

function isDjNameComplete(djName: string | undefined) {
  const t = (djName ?? "").trim();
  return t.length > 0 && t.length <= INPUT_LIMITS.postDjName;
}

type TrackFieldKey =
  | "title"
  | "description"
  | "playedDate"
  | "location"
  | "djName"
  | "genre";

/** Turquoise outline is the primary success cue; tick is secondary. */
const fieldSuccessOutlineClass =
  "border-cyan-400/50 bg-cyan-950/20 shadow-[0_0_0_1px_rgba(34,211,238,0.35)] ring-1 ring-cyan-400/25";

function FieldCompleteCheck({
  className,
  variant = "overlay",
}: {
  className?: string;
  variant?: "overlay" | "inline";
}) {
  return (
    <span
      className={cn(
        "pointer-events-none z-[1] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 ring-1 ring-cyan-400/20",
        variant === "overlay" && "absolute",
        className,
      )}
      aria-hidden
    >
      <Check className="h-3 w-3 text-cyan-300/85" strokeWidth={2.25} />
    </span>
  );
}

export default function SubmitMetadata() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { currentUser } = useUser();
  const { nativePostArtifact, clearNativePostArtifact } = useSubmitClip();
  
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const simulatedProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const creepTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasRealProgressRef = useRef(false);
  const creepStartedRef = useRef(false);
  const activeUploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const suppressNextUploadErrorToastRef = useRef(false);

  // Get trim state
  const [trimState, setTrimState] = useState<{fileName: string; fileType: string; fileSize: number; videoUrl: string} | null>(null);
  const [trimTimes, setTrimTimes] = useState<{startTime: number; endTime: number} | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [nativeOutputUri, setNativeOutputUri] = useState<string | null>(null);
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);
  /** Display aspect for preview card (native / thumbnail metadata); avoids forcing 16:9 on portrait clips. */
  const [clipPreviewAspect, setClipPreviewAspect] = useState<{ w: number; h: number } | null>(null);
  const submitClickTsRef = useRef<number>(0);
  const submitSuccessRef = useRef(false);

  useEffect(() => {
    dubhubVideoDebugLog("[DubHub][SubmitDetails]", "mounted thumbnail-only mode", {
      route: "/submit-metadata",
    });
  }, []);

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const exportRaw = localStorage.getItem("dubhub-trim-export");
    const nativeExportRaw = localStorage.getItem("dubhub-native-trim-output");
    const nativeArtifactRaw = localStorage.getItem("dubhub-native-post-artifact");
    const savedState = localStorage.getItem("dubhub-trim-state");
    const savedTimes = localStorage.getItem("dubhub-trim-times");

    let state: {
      videoUrl: string;
      fileName: string;
      fileType: string;
      fileSize: number;
      nativeOutputUri?: string;
    };
    let times: { startTime: number; endTime: number };

    if (nativeExportRaw || exportRaw) {
      const exp = JSON.parse(nativeExportRaw || exportRaw!) as {
        videoUrl: string;
        previewUri?: string;
        fileName: string;
        fileType: string;
        fileSize: number;
        durationSec: number;
        nativeOutputUri?: string;
      };
      const previewUrl = exp.previewUri || exp.videoUrl;
      state = {
        videoUrl: previewUrl,
        fileName: exp.fileName,
        fileType: exp.fileType,
        fileSize: exp.fileSize,
        nativeOutputUri: exp.nativeOutputUri,
      };
      times = { startTime: 0, endTime: exp.durationSec };
      if (nativePostArtifact?.uploadFile && nativePostArtifact.filename === exp.fileName) {
        setVideoFile(nativePostArtifact.uploadFile);
      }
    } else if (savedState && savedTimes) {
      state = JSON.parse(savedState);
      times = JSON.parse(savedTimes);
    } else {
      toast({
        title: "No video data",
        description: "Please start from the beginning",
        variant: "destructive",
      });
      setLocation("/");
      return;
    }

    setTrimState(state);
    setTrimTimes(times);
    setNativeOutputUri(state.nativeOutputUri ?? null);
    let resolvedThumbnail: string | null = null;
    let aspectFromStorage: { w: number; h: number } | null = null;
    try {
      const thumbRaw = localStorage.getItem("dubhub-trim-thumbnail");
      if (thumbRaw) {
        const parsed = JSON.parse(thumbRaw) as {
          thumbnailUri?: string;
          width?: number;
          height?: number;
        };
        if (parsed.thumbnailUri) {
          resolvedThumbnail = parsed.thumbnailUri;
        }
        if (
          typeof parsed.width === "number" &&
          typeof parsed.height === "number" &&
          parsed.width > 0 &&
          parsed.height > 0
        ) {
          aspectFromStorage = { w: parsed.width, h: parsed.height };
        }
      }
    } catch {
      /* ignore */
    }
    if (!aspectFromStorage && nativeArtifactRaw) {
      try {
        const art = JSON.parse(nativeArtifactRaw) as { width?: number; height?: number };
        if (
          typeof art.width === "number" &&
          typeof art.height === "number" &&
          art.width > 0 &&
          art.height > 0
        ) {
          aspectFromStorage = { w: art.width, h: art.height };
        }
      } catch {
        /* ignore */
      }
    }
    setClipPreviewAspect(aspectFromStorage);
    setThumbnailSrc(resolvedThumbnail);
    dubhubVideoDebugLog("[DubHub][SubmitDetails]", "thumbnail source chosen", {
      hasThumbnail: !!resolvedThumbnail,
      thumbnailPreview: resolvedThumbnail?.slice(0, 120) ?? null,
      nativeOutputUriPreview: state.nativeOutputUri?.slice(0, 120) ?? null,
      fromTrimExport: !!exportRaw || !!nativeExportRaw,
    });
    dubhubVideoDebugLog("[DubHub][PostFlow][resource]", "submit details state hydrated", {
      route: "/submit-metadata",
      fromClientTrimExport: !!exportRaw || !!nativeExportRaw,
      videoUrlPreview: state.videoUrl.slice(0, 80),
      fileSize: state.fileSize,
    });

    // Reconstruct File from blob URL with proper error handling
    let blobUrlRevoked = false;

    (async () => {
      let lastErr: unknown = null;
      if (state.nativeOutputUri && Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform()) {
        if (nativePostArtifact?.uploadFile) {
          setVideoFile(nativePostArtifact.uploadFile);
          dubhubVideoDebugLog("[DubHub][NativePost]", "submit-using-existing-artifact", {
            bytes: nativePostArtifact.uploadFile.size,
            fileName: nativePostArtifact.filename,
          });
          return;
        }
        dubhubVideoDebugLog("[DubHub][NativePost]", "any reconstruction path still being used", {
          reason: "missing in-memory artifact; submit fallback may be required",
        });
        if (nativeArtifactRaw) {
          dubhubVideoDebugLog("[DubHub][NativeUploadPath]", "native artifact metadata recovered from storage", {
            hasNativeArtifactRaw: true,
          });
        }
        dubhubVideoDebugLog("[DubHub][NativeUploadPath]", "native output detected; deferring file bytes until submit", {
          nativeOutputUriPreview: state.nativeOutputUri.slice(0, 140),
          previewUriPreview: nativePreviewUri(state.nativeOutputUri).slice(0, 140),
        });
        // Keep upload bytes out of JS memory during details screen; build payload lazily on submit.
        return;
      }
      const candidateUrls: string[] = [state.videoUrl];
      if (state.nativeOutputUri) {
        candidateUrls.push(Capacitor.convertFileSrc(state.nativeOutputUri));
      }
      for (const url of candidateUrls) {
        try {
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`Failed to fetch source: ${res.status} ${res.statusText}`);
          }
          const blob = await res.blob();
          if (blobUrlRevoked) return;
          if (blob.size === 0) {
            throw new Error("Source blob is empty");
          }
          const file = new File([blob], state.fileName, { type: state.fileType });
          dubhubVideoDebugLog("[DubHub][NativeBridge]", "fetch reconstruction success", {
            bytes: blob.size,
            type: state.fileType,
            sourceUrlPreview: url.slice(0, 120),
          });
          if (isMountedRef.current) {
            setVideoFile(file);
          }
          return;
        } catch (err) {
          lastErr = err;
        }
      }

      console.error("Failed to reconstruct file:", lastErr);
      dubhubVideoDebugLog("[DubHub][NativeBridge]", "reconstruction failed", {
        message: lastErr instanceof Error ? lastErr.message : String(lastErr),
      });
      const primaryWasBlob = state.videoUrl.startsWith("blob:");
      if (primaryWasBlob) {
        console.warn("Blob URL no longer available, redirecting to start");
        toast({
          title: "Session Expired",
          description: "Please select your video again.",
          variant: "destructive",
        });
        setLocation("/");
        return;
      }
      toast({
        title: "Error",
        description: "Failed to load trimmed file. Please try trimming again.",
        variant: "destructive",
      });
    })();
    
    // Cleanup function to prevent accessing revoked Blob URL
    return () => {
      blobUrlRevoked = true;
      isMountedRef.current = false;
    };
  }, [toast, setLocation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      const xhr = activeUploadXhrRef.current;
      if (xhr) {
        suppressNextUploadErrorToastRef.current = true;
        try {
          xhr.abort();
        } catch {
          /* ignore */
        }
        activeUploadXhrRef.current = null;
      }
      dubhubVideoDebugLog("[DubHub][SubmitDetails]", "unmount cleanup done", {});
      // Don't revoke Blob URL here - let it be cleaned up by the submit success handler
      // or when user navigates back to trim page
    };
  }, []);

  const abortActiveUpload = useCallback((reason: string) => {
    const xhr = activeUploadXhrRef.current;
    if (!xhr) return;
    suppressNextUploadErrorToastRef.current = true;
    dubhubVideoDebugLog("[DubHub][PostFlow][cleanup]", "aborting in-flight upload", {
      reason,
    });
    try {
      xhr.abort();
    } catch {
      /* ignore */
    }
    activeUploadXhrRef.current = null;
    setIsUploading(false);
    setUploadProgress(0);
  }, []);

  const form = useForm<SubmitFormData>({
    resolver: zodResolver(submitFormSchema),
    defaultValues: {
      title: "",
      description: "",
      genre: "",
      djName: "",
      location: "",
      playedDate: "",
    },
  });

  const [fieldFocused, setFieldFocused] = useState<
    Partial<Record<TrackFieldKey, boolean>>
  >({});
  const [fieldConfirmed, setFieldConfirmed] = useState<
    Partial<Record<TrackFieldKey, boolean>>
  >({});

  const showFieldSuccess = (key: TrackFieldKey, valid: boolean) =>
    valid && !!fieldConfirmed[key] && !fieldFocused[key];

  const uploadMutation = useMutation({
    mutationFn: async ({ file, fileName }: { file: Blob; fileName: string }) => {
      if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
        throw new Error(
          `Your trimmed clip is over ${MAX_VIDEO_UPLOAD_MB}MB. Try trimming a shorter segment on the previous step.`,
        );
      }
      const formData = new FormData();
      formData.append("video", file, fileName);
      formData.append("preTrimmed", "1");

      /** Must use apiUrl() on Capacitor: relative `/api/...` hits the WebView origin, not the API server. */
      const uploadUrl = apiUrl("/api/upload-video");
      
      // Get auth token for the upload
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated. Please sign in to upload videos.');
      }
      
      // Use XMLHttpRequest for real upload progress tracking
      setUploadProgress(0);
      hasRealProgressRef.current = false;
      creepStartedRef.current = false;
      return new Promise<{ url: string; filename: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        activeUploadXhrRef.current = xhr;
        dubhubVideoDebugLog("[DubHub][PostFlow][resource]", "upload xhr created", {
          route: "/submit-metadata",
        });

        const clearSimulated = () => {
          if (simulatedProgressRef.current) {
            clearInterval(simulatedProgressRef.current);
            simulatedProgressRef.current = null;
          }
        };

        const clearCreep = () => {
          creepTimeoutsRef.current.forEach(clearTimeout);
          creepTimeoutsRef.current = [];
        };

        // Slow creep 95→96→97→98→99 while waiting for server response
        const startPost95Creep = () => {
          if (creepStartedRef.current) return;
          creepStartedRef.current = true;
          const delays = [700, 800, 1100, 1400]; // ms: 95→96, 96→97, 97→98, 98→99
          let total = 0;
          [96, 97, 98, 99].forEach((target, i) => {
            total += delays[i];
            creepTimeoutsRef.current.push(
              setTimeout(() => setUploadProgress(target), total)
            );
          });
        };

        // Simulated progress when real progress unavailable (e.g. lengthComputable false)
        const startSimulatedProgress = () => {
          clearSimulated();
          const start = Date.now();
          simulatedProgressRef.current = setInterval(() => {
            const elapsed = (Date.now() - start) / 1000;
            // Ease toward 92% over ~12s: 92 * (1 - e^(-t/3))
            const pct = 92 * (1 - Math.exp(-elapsed / 3));
            setUploadProgress(prev => Math.min(prev, 92, pct));
          }, 80);
        };

        // Track upload progress - use fractional values for smooth bar
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            hasRealProgressRef.current = true;
            clearSimulated();
            const percentComplete = (e.loaded / e.total) * 100;
            const capped = Math.min(95, percentComplete);
            setUploadProgress(capped);
            if (percentComplete >= 95) startPost95Creep();
          } else if (!simulatedProgressRef.current) {
            startSimulatedProgress();
          }
        });

        // Start simulated after 400ms if no real progress events
        const simTimeout = setTimeout(() => {
          if (!hasRealProgressRef.current && !simulatedProgressRef.current) {
            startSimulatedProgress();
          }
        }, 400);

        // Handle completion
        xhr.addEventListener("load", () => {
          activeUploadXhrRef.current = null;
          dubhubVideoDebugLog("[DubHub][PostFlow][dispose]", "upload xhr disposed on load", {
            route: "/submit-metadata",
          });
          clearTimeout(simTimeout);
          clearSimulated();
          clearCreep();
          const raw = xhr.responseText ?? "";
          const preview = raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(raw) as {
                url?: string;
                filename?: string;
                success?: boolean;
                error?: string;
              };
              if (!response?.url || typeof response.url !== "string") {
                console.error("[upload-video] Success status but missing url", {
                  status: xhr.status,
                  preview,
                  keys: response && typeof response === "object" ? Object.keys(response) : [],
                });
                reject(
                  new Error(
                    `Upload response missing video URL (HTTP ${xhr.status}). ${preview ? `Body: ${preview}` : "Empty body."}`,
                  ),
                );
                return;
              }
              setUploadProgress(100);
              resolve({ url: response.url, filename: String(response.filename ?? "") });
            } catch (parseErr) {
              console.error("[upload-video] JSON parse failed", {
                status: xhr.status,
                preview,
                parseErr,
              });
              reject(
                new Error(
                  `Invalid JSON from upload (HTTP ${xhr.status}). ${preview ? preview : "Empty response — check API base URL on device (native builds need VITE_API_ORIGIN)."}`,
                ),
              );
            }
          } else {
            try {
              const error = JSON.parse(raw) as { error?: string; message?: string };
              reject(
                new Error(
                  error.error || error.message || `Upload failed with status ${xhr.status}`,
                ),
              );
            } catch {
              reject(
                new Error(
                  preview
                    ? `Upload failed (HTTP ${xhr.status}): ${preview}`
                    : `Upload failed with status ${xhr.status} (empty body)`,
                ),
              );
            }
          }
        });
        
        // Handle errors
        xhr.addEventListener('error', () => {
          activeUploadXhrRef.current = null;
          dubhubVideoDebugLog("[DubHub][PostFlow][dispose]", "upload xhr disposed on error", {
            route: "/submit-metadata",
          });
          clearTimeout(simTimeout);
          clearSimulated();
          clearCreep();
          reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
          activeUploadXhrRef.current = null;
          dubhubVideoDebugLog("[DubHub][PostFlow][dispose]", "upload xhr disposed on abort", {
            route: "/submit-metadata",
          });
          clearTimeout(simTimeout);
          clearSimulated();
          clearCreep();
          reject(new Error('Upload cancelled'));
        });
        
        // Start upload with auth header
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.send(formData);
      });
    },
    onSuccess: (data) => {
      setUploadedVideoUrl(data.url);
      setUploadProgress(0);
      toast({
        title: "Video Uploaded!",
        description: "Your video has been processed and uploaded successfully.",
      });
    },
    onError: (error: Error) => {
      if (
        suppressNextUploadErrorToastRef.current &&
        /cancelled/i.test(error.message || "")
      ) {
        suppressNextUploadErrorToastRef.current = false;
        return;
      }
      setUploadProgress(0);
      toast({
        title: "Upload Failed",
        description: error.message || "There was an error uploading your video.",
        variant: "destructive",
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { formData: SubmitFormData; videoUrl: string }) => {
      if (!data.videoUrl) {
        throw new Error("Video URL is required");
      }
      dubhubVideoDebugLog("[DubHub][PostSubmit]", "create-start", {
        hasVideoUrl: !!data.videoUrl,
      });

      // Map form data to backend's expected snake_case format
      const submitData = {
        title: data.formData.title.trim(),
        video_url: data.videoUrl,
        genre: data.formData.genre.trim(),
        description: data.formData.description?.trim() || null,
        location: data.formData.location?.trim() || null,
        dj_name: data.formData.djName?.trim() || null,
        played_date: data.formData.playedDate || null,
      };
      
      console.log("Submitting post with data:", { ...submitData, video_url: submitData.video_url.substring(0, 50) + "..." });
      const response = await apiRequest("POST", "/api/posts", submitData);
      const text = await response.text();
      let responseData: { id?: string };
      try {
        responseData = text ? (JSON.parse(text) as { id?: string }) : {};
      } catch (e) {
        console.error("[POST /api/posts] Response is not JSON", {
          status: response.status,
          preview: text.slice(0, 400),
          e,
        });
        throw new Error(
          text.trim()
            ? `Create post returned non-JSON (HTTP ${response.status}): ${text.slice(0, 160)}`
            : `Create post returned empty body (HTTP ${response.status})`,
        );
      }
      console.log("Post created successfully:", responseData);
      dubhubVideoDebugLog("[DubHub][PostSubmit]", "create-success", {
        postId: responseData?.id ?? null,
      });
      return responseData;
    },
    onSuccess: async (created: { id?: string }) => {
      submitSuccessRef.current = true;
      const newPostId = created?.id;
      if (!newPostId) {
        console.error("Post created but response missing id:", created);
      } else {
        playSuccessNotification();
      }

      toast({
        title: "Track Submitted!",
        description: "Your track ID request has been submitted successfully.",
      });
      dubhubVideoDebugLog("[DubHub][PostSubmit]", "success-toast-fired", {
        postId: newPostId ?? null,
      });

      clearDubhubTrimSession({ revokeAfterMs: 500 });
      dubhubVideoDebugLog("[DubHub][PostFlow][cleanup]", "clear trim session after submit success", {
        revokeAfterMs: 500,
      });
      
      form.reset();
      setUploadedVideoUrl(null);
      setVideoFile(null); // Clear video file reference
      clearNativePostArtifact();

      // Put the new post in every cached feed variant so it appears immediately under Hottest/Newest
      // (feed is limited to 10; a 0-like post may not be in the refetched page without this).
      if (newPostId) {
        try {
          dubhubVideoDebugLog("[DubHub][PostSubmit]", "post-fetch-start", {
            postId: newPostId,
          });
          const detailRes = await apiRequest("GET", `/api/posts/${newPostId}`);
          const fullPost = (await detailRes.json()) as PostWithUser;
          dubhubVideoDebugLog("[DubHub][PostSubmit]", "post-fetch-success", {
            postId: fullPost.id,
          });
          queryClient.setQueriesData(
            { queryKey: ["/api/posts"], exact: false },
            (old: PostWithUser[] | undefined) => {
              if (!old) return [fullPost];
              const idx = old.findIndex((p) => p.id === fullPost.id);
              if (idx >= 0) {
                const next = [...old];
                next[idx] = fullPost;
                return next;
              }
              return [fullPost, ...old];
            },
          );
        } catch (e) {
          dubhubVideoDebugLog("[DubHub][PostSubmit]", "post-fetch-warning", {
            postId: newPostId,
            message: e instanceof Error ? e.message : String(e),
          });
          console.warn("Could not load new post for feed cache; Home may fetch it:", e);
        }
      }

      // Invalidate user posts query to show new post in profile immediately
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "posts"] });
      }

      // Deep-link to the post so Home scrolls/highlights by ID (not feed position / sort order).
      if (newPostId) {
        dubhubVideoDebugLog("[DubHub][PostSubmit]", "navigate-to-created-post", {
          postId: newPostId,
        });
        dubhubVideoDebugLog("[DubHub][PostFlow][route]", "submit success -> Home deep link", {
          route: "/",
          postId: newPostId,
        });
        setLocation(`/?post=${encodeURIComponent(newPostId)}`);
      } else {
        dubhubVideoDebugLog("[DubHub][PostFlow][route]", "submit success -> Home", {
          route: "/",
        });
        setLocation("/");
      }
    },
    onError: (error: Error) => {
      dubhubVideoDebugLog("[DubHub][PostSubmit]", "create-failure", {
        message: error.message,
      });
      if (submitSuccessRef.current) {
        dubhubVideoDebugLog("[DubHub][PostSubmit]", "post-fetch-warning", {
          message: "onError fired after success; suppressing error toast",
        });
        return;
      }
      console.error("Post submission error:", error);
      dubhubVideoDebugLog("[DubHub][PostSubmit]", "error-toast-fired", {
        message: error.message,
      });
      toast({
        title: "Submission Failed",
        description: error.message || "There was an error submitting your track. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: SubmitFormData) => {
    if (!trimState || !trimTimes) {
      toast({
        title: "Error",
        description: "Missing video data",
        variant: "destructive",
      });
      return;
    }

    submitClickTsRef.current = Date.now();
    let uploadBlob: Blob | null = videoFile || nativePostArtifact?.uploadFile || null;
    let uploadFileName = trimState.fileName;
    if (nativePostArtifact?.uploadFile) {
      uploadFileName = nativePostArtifact.filename || uploadFileName;
      dubhubVideoDebugLog("[DubHub][NativePost]", "submit-using-existing-artifact", {
        fileName: uploadFileName,
        fileSize: nativePostArtifact.uploadFile.size,
      });
    }

    if (!uploadBlob && nativeOutputUri && Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform()) {
      try {
        dubhubVideoDebugLog("[DubHub][NativePost]", "any reconstruction path still being used", {
          reason: "submit fallback reconstruction",
        });
        const previewUri = nativePreviewUri(nativeOutputUri);
        const candidateUris = [previewUri, Capacitor.convertFileSrc(nativeOutputUri), nativeOutputUri];
        let fallbackErr: unknown = null;
        for (const uri of candidateUris) {
          try {
            dubhubVideoDebugLog("[DubHub][NativeUploadPath]", "lazy native upload prep start", {
              nativeOutputUriPreview: nativeOutputUri.slice(0, 120),
              previewUriPreview: uri.slice(0, 120),
            });
            const res = await fetch(uri);
            if (!res.ok) {
              throw new Error(`Native preview fetch failed: ${res.status} ${res.statusText}`);
            }
            const blob = await res.blob();
            if (blob.size <= 0) {
              throw new Error("Native preview fetch returned empty blob");
            }
            uploadBlob = blob;
            uploadFileName = trimState.fileName || "trimmed_clip.mp4";
            dubhubVideoDebugLog("[DubHub][NativeUploadPath]", "lazy native upload prep success", {
              fileSize: blob.size,
              type: blob.type || trimState.fileType || "video/mp4",
            });
            break;
          } catch (err) {
            fallbackErr = err;
          }
        }
        if (!uploadBlob) {
          const fileFromFs = await nativeOutputUriToFileFallback({
            nativeOutputUri,
            fileName: trimState.fileName || "trimmed_clip.mp4",
            mimeType: trimState.fileType || "video/mp4",
          });
          uploadBlob = fileFromFs;
          uploadFileName = fileFromFs.name;
          dubhubVideoDebugLog("[DubHub][NativeUploadPath]", "lazy native upload prep success via filesystem", {
            fileSize: fileFromFs.size,
            type: fileFromFs.type,
            previousError: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          });
        }
      } catch (err) {
        dubhubVideoDebugLog("[DubHub][NativeUploadPath]", "lazy native upload prep failed", {
          message: err instanceof Error ? err.message : String(err),
        });
        toast({
          title: "Unable to process video",
          description: "We couldn't finish processing this clip. Try a slightly shorter trim and try again.",
          variant: "destructive",
        });
        return;
      }
    }

    if (!uploadBlob) {
      toast({
        title: "Error",
        description: "Missing trimmed file. Please trim your video again.",
        variant: "destructive",
      });
      return;
    }

    if (!uploadedVideoUrl) {
      try {
        setIsUploading(true);
        dubhubVideoDebugLog("[DubHub][NativePost]", "submit-upload-start", {
          elapsedSinceSubmitClickMs: Date.now() - submitClickTsRef.current,
          fileName: uploadFileName,
          bytes: uploadBlob.size,
        });
        const uploadResult = await uploadMutation.mutateAsync({
          file: uploadBlob,
          fileName: uploadFileName,
        });
        
        // Extract URL from upload result
        // The upload route returns: { success: true, url: publicUrl, filename, ... }
        const videoUrl = uploadResult.url;
        if (!videoUrl) {
          console.error("Upload result:", uploadResult);
          throw new Error("Upload succeeded but no URL returned. Check server logs.");
        }
        
        console.log("Video uploaded successfully, URL:", videoUrl);
        
        // Set the uploaded URL for UI state
        setUploadedVideoUrl(videoUrl);
        dubhubVideoDebugLog("[DubHub][NativePost]", "submit-upload-success", {
          elapsedSinceSubmitClickMs: Date.now() - submitClickTsRef.current,
          videoUrlPreview: videoUrl.slice(0, 120),
        });
        
        // Submit with the video URL directly
        submitMutation.mutate({ formData: data, videoUrl });
      } catch (error) {
        console.error("Upload/Submit error:", error);
        dubhubVideoDebugLog("[DubHub][NativePost]", "submit-upload-failure", {
          elapsedSinceSubmitClickMs: Date.now() - submitClickTsRef.current,
          message: error instanceof Error ? error.message : String(error),
        });
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to upload or submit video",
          variant: "destructive",
        });
        return;
      } finally {
        setIsUploading(false);
      }
    } else {
      submitMutation.mutate({ formData: data, videoUrl: uploadedVideoUrl });
    }
  };

  const handleBack = () => {
    dubhubVideoDebugLog("[DubHub][SubmitDetails]", "back cleanup start", {});
    abortActiveUpload("submit-details-back");
    setNativeOutputUri(null);
    setVideoFile(null);
    setTrimState(null);
    setTrimTimes(null);
    setThumbnailSrc(null);
    clearNativePostArtifact();
    dubhubVideoDebugLog("[DubHub][PostFlow][route]", "backing from submit details", {
      route: "/trim-video",
    });
    try {
      const expRaw = localStorage.getItem("dubhub-trim-export");
      if (expRaw) {
        const exp = JSON.parse(expRaw) as { videoUrl?: string };
        if (exp.videoUrl) {
          try {
            URL.revokeObjectURL(exp.videoUrl);
            dubhubVideoDebugLog("[DubHub][PostFlow][cleanup]", "object URL revoked", {
              reason: "submit details back",
              blobUrlPreview: exp.videoUrl.slice(0, 80),
            });
          } catch {
            /* ignore */
          }
        }
        localStorage.removeItem("dubhub-trim-export");
      }
    } catch {
      /* ignore */
    }
    dubhubVideoDebugLog("[DubHub][SubmitDetails]", "back cleanup done", {});
    setLocation("/trim-video");
  };

  const handleCancelPost = async () => {
    dubhubVideoDebugLog("[DubHub][SubmitDetails]", "cancel post start", {});
    abortActiveUpload("submit-details-cancel");
    setNativeOutputUri(null);
    setVideoFile(null);
    setTrimState(null);
    setTrimTimes(null);
    setThumbnailSrc(null);
    clearNativePostArtifact();
    try {
      const expRaw = localStorage.getItem("dubhub-trim-export");
      if (expRaw) {
        const exp = JSON.parse(expRaw) as { videoUrl?: string };
        if (exp.videoUrl) {
          try {
            URL.revokeObjectURL(exp.videoUrl);
          } catch {
            /* ignore */
          }
        }
      }
      const thumbRaw = localStorage.getItem("dubhub-trim-thumbnail");
      if (thumbRaw) {
        const thumb = JSON.parse(thumbRaw) as { thumbnailUri?: string };
        if (thumb.thumbnailUri?.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(thumb.thumbnailUri);
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
    dubhubVideoDebugLog("[DubHub][SubmitDetails]", "cancel post cleanup done", {});
    dubhubVideoDebugLog("[DubHub][SubmitDetails]", "navigate home", { route: "/" });
    await cancelPostAndHardResetToHome("submit-details-cancel-post");
  };

  const watched = form.watch();
  const requiredFieldsReady =
    isTitleComplete(watched.title) && isGenreComplete(watched.genre);
  const submitBusy = isUploading || submitMutation.isPending;
  const submitEnabled = requiredFieldsReady && !submitBusy;

  if (!trimState || !trimTimes) {
    return null;
  }

  const clipSeconds = Math.round(trimTimes.endTime - trimTimes.startTime);

  return (
    <div
      className={cn(
        "bg-dark max-w-full overflow-x-hidden touch-pan-y overscroll-x-none",
        APP_PAGE_SCROLL_CLASS,
      )}
    >
      <div className="app-page-top-pad w-full min-w-0 max-w-full p-5 pb-10 sm:p-6 sm:pb-12">
        <div className="mx-auto w-full min-w-0 max-w-md space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-gray-300 hover:text-white hover:bg-white/10 -ml-2"
              onClick={handleBack}
              data-testid="button-back-metadata"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-white tracking-tight">Track details</h1>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="text-white/75 hover:text-white hover:bg-white/10"
              onClick={() => setShowCancelDialog(true)}
              data-testid="button-cancel-metadata"
            >
              Cancel
            </Button>
          </div>

          <div className="rounded-2xl overflow-hidden border border-gray-800/90 bg-black shadow-sm w-full">
            <div
              className="relative w-full max-h-[min(70vh,520px)] mx-auto"
              style={
                clipPreviewAspect
                  ? { aspectRatio: `${clipPreviewAspect.w} / ${clipPreviewAspect.h}` }
                  : { aspectRatio: "16 / 9" }
              }
            >
              {thumbnailSrc ? (
                <img
                  src={thumbnailSrc}
                  alt="Selected clip thumbnail"
                  className="absolute inset-0 h-full w-full object-contain object-center bg-black"
                  data-testid="image-metadata-preview"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800">
                  <p className="px-4 text-center text-xs text-gray-300">
                    Thumbnail preview unavailable
                  </p>
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 to-transparent pt-10 pb-3 px-3">
                <p className="text-xs font-medium text-white/95">
                  Selected clip · {clipSeconds}s
                </p>
              </div>
            </div>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="min-w-0 space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => {
                  const valid = isTitleComplete(field.value);
                  const success = showFieldSuccess("title", valid);
                  return (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-300">Title *</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            placeholder="e.g., Amazing DnB track from Fabric"
                            className={cn(
                              "bg-surface text-white placeholder-gray-400 pr-10 transition-[border-color,box-shadow,background-color]",
                              success ? fieldSuccessOutlineClass : "border-gray-600",
                            )}
                            data-testid="input-title"
                            maxLength={INPUT_LIMITS.postTitle}
                            name={field.name}
                            ref={field.ref}
                            value={field.value || ""}
                            onFocus={() =>
                              setFieldFocused((f) => ({ ...f, title: true }))
                            }
                            onBlur={(e) => {
                              field.onBlur();
                              setFieldFocused((f) => ({ ...f, title: false }));
                              const v = (e.target as HTMLInputElement).value;
                              setFieldConfirmed((c) => ({
                                ...c,
                                title: isTitleComplete(v),
                              }));
                            }}
                            onChange={(e) => {
                              field.onChange(e);
                              if (!isTitleComplete(e.target.value)) {
                                setFieldConfirmed((c) => ({ ...c, title: false }));
                              }
                            }}
                          />
                        </FormControl>
                        {success ? (
                          <FieldCompleteCheck className="right-2 top-1/2 -translate-y-1/2" />
                        ) : null}
                      </div>
                      <p className="text-xs leading-none text-gray-500 text-right">
                        {(field.value?.length ?? 0)} / {INPUT_LIMITS.postTitle}
                      </p>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => {
                  const valid = isDescriptionComplete(field.value);
                  const success = showFieldSuccess("description", valid);
                  return (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-300">
                        Description
                      </FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Textarea
                            placeholder="What makes this track special? How long have you been looking for this tune? Where did you first hear this?"
                            className={cn(
                              "min-h-[72px] resize-none py-2 text-white placeholder-gray-400 transition-[border-color,box-shadow,background-color]",
                              success ? "pr-9" : "",
                              success
                                ? fieldSuccessOutlineClass
                                : "border-gray-600 bg-surface",
                            )}
                            rows={4}
                            data-testid="textarea-description"
                            maxLength={INPUT_LIMITS.postDescription}
                            name={field.name}
                            ref={field.ref}
                            value={field.value ?? ""}
                            onFocus={() =>
                              setFieldFocused((f) => ({ ...f, description: true }))
                            }
                            onBlur={(e) => {
                              field.onBlur();
                              setFieldFocused((f) => ({ ...f, description: false }));
                              const v = (e.target as HTMLTextAreaElement).value;
                              setFieldConfirmed((c) => ({
                                ...c,
                                description: isDescriptionComplete(v),
                              }));
                            }}
                            onChange={(e) => {
                              field.onChange(e);
                              if (!isDescriptionComplete(e.target.value)) {
                                setFieldConfirmed((c) => ({ ...c, description: false }));
                              }
                            }}
                          />
                        </FormControl>
                        {success ? (
                          <FieldCompleteCheck className="right-2 top-2" />
                        ) : null}
                      </div>
                      <p className="text-xs leading-none text-gray-500 text-right">
                        {(field.value?.length ?? 0)} / {INPUT_LIMITS.postDescription}
                      </p>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="playedDate"
                render={({ field }) => {
                  const valid = isPlayedDateComplete(field.value);
                  const success = showFieldSuccess("playedDate", valid);
                  return (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-300">Date</FormLabel>
                      <div className="relative isolate flex min-w-0 w-full max-w-full overflow-hidden rounded-md [contain:inline-size]">
                        <FormControl className="min-w-0 w-full max-w-full flex-1 basis-0">
                          <Input
                            type="date"
                            max={getTodayInputValue()}
                            className={cn(
                              "dubhub-date-input h-10 min-w-0 w-full max-w-full items-center justify-start bg-surface px-3 py-0 pr-12 text-white text-left transition-[border-color,box-shadow,background-color] [color-scheme:dark] md:text-sm",
                              "focus-visible:ring-offset-0",
                              success ? fieldSuccessOutlineClass : "border-gray-600",
                              success && "ring-inset",
                            )}
                            data-testid="input-date"
                            name={field.name}
                            ref={field.ref}
                            value={field.value ?? ""}
                            onFocus={() =>
                              setFieldFocused((f) => ({ ...f, playedDate: true }))
                            }
                            onBlur={(e) => {
                              field.onBlur();
                              setFieldFocused((f) => ({ ...f, playedDate: false }));
                              const v = (e.target as HTMLInputElement).value;
                              setFieldConfirmed((c) => ({
                                ...c,
                                playedDate: isPlayedDateComplete(v),
                              }));
                            }}
                            onChange={(e) => {
                              const max = getTodayInputValue();
                              let next = e.target.value;
                              if (next > max) next = max;
                              field.onChange(next);
                              if (!isPlayedDateComplete(next)) {
                                setFieldConfirmed((c) => ({ ...c, playedDate: false }));
                              }
                            }}
                          />
                        </FormControl>
                        {success ? (
                          <FieldCompleteCheck className="right-2 top-1/2 -translate-y-1/2" />
                        ) : null}
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => {
                  const valid = isLocationComplete(field.value);
                  const success = showFieldSuccess("location", valid);
                  return (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-300">Location</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            placeholder="e.g., Fabric London, Printworks"
                            className={cn(
                              "bg-surface text-white placeholder-gray-400 pr-10 transition-[border-color,box-shadow,background-color]",
                              success ? fieldSuccessOutlineClass : "border-gray-600",
                            )}
                            data-testid="input-location"
                            maxLength={INPUT_LIMITS.postLocation}
                            name={field.name}
                            ref={field.ref}
                            value={field.value || ""}
                            onFocus={() =>
                              setFieldFocused((f) => ({ ...f, location: true }))
                            }
                            onBlur={(e) => {
                              field.onBlur();
                              setFieldFocused((f) => ({ ...f, location: false }));
                              const v = (e.target as HTMLInputElement).value;
                              setFieldConfirmed((c) => ({
                                ...c,
                                location: isLocationComplete(v),
                              }));
                            }}
                            onChange={(e) => {
                              field.onChange(e);
                              if (!isLocationComplete(e.target.value)) {
                                setFieldConfirmed((c) => ({ ...c, location: false }));
                              }
                            }}
                          />
                        </FormControl>
                        {success ? (
                          <FieldCompleteCheck className="right-2 top-1/2 -translate-y-1/2" />
                        ) : null}
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="djName"
                render={({ field }) => {
                  const valid = isDjNameComplete(field.value);
                  const success = showFieldSuccess("djName", valid);
                  return (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-300">Played by</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            placeholder="e.g., DJ Name"
                            className={cn(
                              "bg-surface text-white placeholder-gray-400 pr-10 transition-[border-color,box-shadow,background-color]",
                              success ? fieldSuccessOutlineClass : "border-gray-600",
                            )}
                            data-testid="input-dj"
                            maxLength={INPUT_LIMITS.postDjName}
                            name={field.name}
                            ref={field.ref}
                            value={field.value || ""}
                            onFocus={() =>
                              setFieldFocused((f) => ({ ...f, djName: true }))
                            }
                            onBlur={(e) => {
                              field.onBlur();
                              setFieldFocused((f) => ({ ...f, djName: false }));
                              const v = (e.target as HTMLInputElement).value;
                              setFieldConfirmed((c) => ({
                                ...c,
                                djName: isDjNameComplete(v),
                              }));
                            }}
                            onChange={(e) => {
                              field.onChange(e);
                              if (!isDjNameComplete(e.target.value)) {
                                setFieldConfirmed((c) => ({ ...c, djName: false }));
                              }
                            }}
                          />
                        </FormControl>
                        {success ? (
                          <FieldCompleteCheck className="right-2 top-1/2 -translate-y-1/2" />
                        ) : null}
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="genre"
                render={({ field }) => {
                  const valid = isGenreComplete(field.value);
                  const success = showFieldSuccess("genre", valid);
                  return (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-300">Genre *</FormLabel>
                      <div className="flex items-center gap-2.5">
                        <div className="min-w-0 flex-1">
                          <Select
                            value={field.value || undefined}
                            onValueChange={(v) => {
                              field.onChange(v);
                              if (!isGenreComplete(v)) {
                                setFieldConfirmed((c) => ({ ...c, genre: false }));
                              }
                            }}
                            onOpenChange={(open) => {
                              setFieldFocused((f) => ({ ...f, genre: open }));
                              if (!open) {
                                field.onBlur();
                                queueMicrotask(() => {
                                  const g = form.getValues("genre");
                                  setFieldConfirmed((c) => ({
                                    ...c,
                                    genre: isGenreComplete(g),
                                  }));
                                });
                              }
                            }}
                          >
                            <FormControl>
                              <SelectTrigger
                                ref={field.ref}
                                className={cn(
                                  "w-full bg-surface text-white transition-[border-color,box-shadow,background-color]",
                                  success ? fieldSuccessOutlineClass : "border-gray-600",
                                )}
                                data-testid="select-genre"
                              >
                                <SelectValue placeholder="Select genre..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {genres.map((genre) => (
                                <SelectItem key={genre.value} value={genre.value}>
                                  {genre.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {success ? (
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center"
                            aria-hidden
                          >
                            <FieldCompleteCheck variant="inline" />
                          </div>
                        ) : null}
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {isUploading && (
                <div className="rounded-xl bg-surface/80 border border-gray-700/50 p-4 space-y-3">
                  <Progress
                    value={uploadProgress}
                    className="h-2.5 bg-gray-800"
                  />
                  <p className="text-sm text-gray-400 text-center tabular-nums">
                    Uploading... {Math.round(uploadProgress)}%
                  </p>
                </div>
              )}
              <div
                className={cn(
                  "relative w-full rounded-xl transition-[filter,box-shadow] duration-700",
                  submitEnabled &&
                    !submitBusy &&
                    "shadow-[0_0_28px_rgba(34,211,238,0.38),0_0_56px_rgba(34,211,238,0.18)]",
                )}
              >
                <div
                  className={cn(
                    "relative w-full overflow-hidden rounded-xl",
                    submitEnabled && !submitBusy && "p-[2px]",
                  )}
                >
                  {submitEnabled && !submitBusy ? (
                    <div
                      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[10px]"
                      aria-hidden
                    >
                      <div
                        className="absolute left-1/2 top-1/2 h-[240%] w-[240%] min-h-[260px] min-w-[260px] -translate-x-1/2 -translate-y-1/2 animate-submit-edge-trace"
                        style={{
                          background:
                            "conic-gradient(from 0deg, rgba(34,211,238,0.08) 0deg, transparent 58deg, transparent 302deg, rgba(224,249,255,0.95) 322deg, rgba(103,232,249,0.65) 332deg, rgba(34,211,238,0.25) 342deg, transparent 352deg)",
                        }}
                      />
                    </div>
                  ) : null}
                  <Button
                    type="submit"
                    className={cn(
                      "relative z-[2] w-full h-12 text-base font-semibold transition-colors duration-500",
                      submitEnabled && !submitBusy ? "rounded-[10px]" : "rounded-xl",
                      submitBusy
                        ? "border-0 bg-primary/85 text-primary-foreground hover:bg-primary/85"
                        : submitEnabled
                          ? "border-0 bg-primary text-primary-foreground hover:bg-primary/92"
                          : "cursor-not-allowed border border-white/10 bg-primary/20 text-primary-foreground/45 shadow-none hover:bg-primary/20",
                    )}
                    disabled={!submitEnabled}
                    data-testid="button-submit"
                  >
                    {submitBusy ? (
                      <>
                        <InlineSpinner className="mr-2 border-white" sizeClassName="h-4 w-4" />
                        {isUploading ? "Uploading..." : "Submitting..."}
                      </>
                    ) : (
                      "Submit Track ID"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </div>
      </div>
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel posting?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current clip and edits will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void handleCancelPost();
              }}
            >
              Cancel post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
