import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward, Check, ArrowLeft } from "lucide-react";
import { TrimWaveformMatchedFallback } from "@/components/trim-waveform-matched-fallback";
import { VinylPullRefreshIndicator } from "@/components/vinyl-pull-refresh-indicator";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions.js";
import {
  DEFAULT_CLIP_SELECTION_SECONDS,
  MAX_CLIP_DURATION_SECONDS,
  MIN_CLIP_DURATION_SECONDS,
  MAX_VIDEO_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_MB,
} from "@shared/video-upload";
import { kickVideoFrameToScreen } from "@/lib/kick-video-frame";
import { dubhubVideoDebugLog } from "@/lib/video-debug";
import { isWaveSurferWaveformCanvasVisuallyBlank } from "@/lib/trim-waveform-paint-detect";
import {
  neutralWaveformPeaksNormalized,
  realignWaveSurferDecodedDuration,
  tryDecodeMediaUrlToMonoPeaks,
  wavesurferRepaintPlayhead,
} from "@/lib/trim-waveform-peaks";
import { cn } from "@/lib/utils";
import { cancelPostAndHardResetToHome } from "@/lib/post-flow";
import {
  isNativeIosVideoEditorPath,
  materializeSourceUriForNativeEditor,
  nativeGenerateThumbnail,
  nativePreviewUri,
  nativeTrimVideo,
  withTimeout,
} from "@/lib/native-video-editor";
import { useSubmitClip } from "@/lib/submit-clip-context";
import { Capacitor } from "@capacitor/core";
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

/** Dub hub brand blue (matches launch surface). */
const TRIM_SELECTION_BLUE = "rgba(30, 56, 249, 0.5)";
interface TrimVideoState {
  fileName: string;
  fileType: string;
  fileSize: number;
  videoUrl: string;
  extension?: string;
  sourceNativeUri?: string;
}

function validateTrimEntryState(value: unknown): value is TrimVideoState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<TrimVideoState>;
  if (!v.fileName || typeof v.fileName !== "string") return false;
  if (!v.fileType || typeof v.fileType !== "string") return false;
  if (typeof v.fileSize !== "number" || !Number.isFinite(v.fileSize) || v.fileSize <= 0) return false;
  if (!v.videoUrl || typeof v.videoUrl !== "string") return false;
  return true;
}

function upsertTrimState(patch: Partial<TrimVideoState>): void {
  const keys = ["dubhub-trim-source", "dubhub-trim-state"] as const;
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as TrimVideoState;
      localStorage.setItem(k, JSON.stringify({ ...parsed, ...patch }));
    } catch {
      /* ignore */
    }
  }
}

function clampSelection(
  start: number,
  end: number,
  videoDuration: number,
  minLen: number,
  maxLen: number,
): { start: number; end: number } {
  let s = Math.max(0, Math.min(start, videoDuration));
  let e = Math.max(0, Math.min(end, videoDuration));
  if (e <= s) {
    e = Math.min(videoDuration, s + minLen);
  }
  if (e - s > maxLen) {
    e = s + maxLen;
  }
  if (e - s < minLen) {
    e = Math.min(videoDuration, s + minLen);
    if (e - s < minLen) {
      s = Math.max(0, e - minLen);
    }
  }
  return { start: s, end: e };
}

function persistSelection(start: number, end: number) {
  try {
    localStorage.setItem("dubhub-trim-times", JSON.stringify({ startTime: start, endTime: end }));
  } catch {
    /* ignore quota */
  }
}

/**
 * Timeline length for H.264-style assets — `HTMLMediaElement.duration` is usually enough.
 * iPhone camera-roll / HEVC frequently keeps `duration === NaN` (or 0) while `seekable` already
 * spans the full clip; WaveSurfer's `load(url, _, hintDuration)` can use that hint to decode.
 */
function probeMediaTimelineSeconds(video: HTMLVideoElement): number | null {
  const d = video.duration;
  if (Number.isFinite(d) && d > 0 && d !== Number.POSITIVE_INFINITY) return d;
  try {
    const s = video.seekable;
    if (s != null && s.length > 0) {
      const end = s.end(s.length - 1);
      if (Number.isFinite(end) && end > 0 && end !== Number.POSITIVE_INFINITY) return end;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Prefer WaveSurfer (same object as `video`); fall back to probe for iOS camera roll. */
function readTrimMediaDurationSeconds(ws: WaveSurfer, video: HTMLVideoElement): number | null {
  const dWs = ws.getDuration();
  if (Number.isFinite(dWs) && dWs > 0 && dWs !== Number.POSITIVE_INFINITY) return dWs;
  return probeMediaTimelineSeconds(video);
}

/** Region outline only — draggable trim edges use light-DOM overlays (`TRIM_HANDLE_BLUE`). */
function applyTrimRegionChrome(region: Region, opts?: { delayedRepaint?: boolean }) {
  const paint = () => {
    const root = region.element;
    if (!root) return;
    root.style.boxShadow = "inset 0 0 0 2px rgba(255,255,255,0.45)";
    root.style.borderRadius = "6px";
  };

  requestAnimationFrame(paint);
  if (opts?.delayedRepaint) {
    window.setTimeout(paint, 80);
  }
}

/** Brand blue — visible trim grips in the page layer (not WaveSurfer shadow). */
const TRIM_HANDLE_BLUE = "rgb(30, 56, 249)";

export default function TrimVideo() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { setNativePostArtifact, clearNativePostArtifact } = useSubmitClip();

  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(DEFAULT_CLIP_SELECTION_SECONDS);
  const [duration, setDuration] = useState(0);
  /** Probe-driven timeline length (seekable / duration); trim UI must not depend only on WaveSurfer decode. */
  const [trimTimelineSeconds, setTrimTimelineSeconds] = useState(0);
  /** WaveSurfer canvas failed to paint — use matched light-DOM bars + playhead. */
  const [trimWavePaintFallback, setTrimWavePaintFallback] = useState(false);
  const [fallbackBarPeaks, setFallbackBarPeaks] = useState<number[]>([]);
  /** No WaveSurfer region (media-probe trim path) — enable dragging the whole blue selection band. */
  const [trimLightDomWholeRangeDrag, setTrimLightDomWholeRangeDrag] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionPluginRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const [isPreparingClip, setIsPreparingClip] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const startTimeRef = useRef(startTime);
  const endTimeRef = useRef(endTime);
  const isPlayingRef = useRef(isPlaying);
  const activeTrimRegionRef = useRef<Region | null>(null);
  /** Set in trim WaveSurfer effect — snap playhead into trim range after handle/region edits. */
  const clampPlaybackToTrimRef = useRef<() => void>(() => {});
  const trimBoundsRef = useRef({
    minLen: MIN_CLIP_DURATION_SECONDS,
    maxLen: MAX_CLIP_DURATION_SECONDS,
    duration: 0,
  });

  const [state, setState] = useState<TrimVideoState | null>(null);
  /** Start muted (no surprise audio); unmute when the user presses play so volume keys behave normally. */
  const [videoMuted, setVideoMuted] = useState(true);

  const destroyTrimPreviewVideo = useCallback((reason: string) => {
    const v = videoRef.current;
    dubhubVideoDebugLog("[DubHub][VideoCleanup]", "trim cleanup start", { reason, hasVideo: !!v });
    if (!v) return;
    try {
      v.pause();
      dubhubVideoDebugLog("[DubHub][VideoCleanup]", "trim video paused", { reason });
    } catch {
      /* ignore */
    }
    try {
      v.removeAttribute("src");
      v.load();
      dubhubVideoDebugLog("[DubHub][VideoCleanup]", "trim video src removed+loaded", { reason });
    } catch {
      /* ignore */
    }
  }, []);

  const destroyTrimWaveSurfer = useCallback((reason: string) => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    try {
      ws.pause();
      ws.destroy();
      dubhubVideoDebugLog("[DubHub][VideoCleanup]", "trim wavesurfer destroyed", { reason });
    } catch {
      /* ignore */
    }
    wavesurferRef.current = null;
    regionPluginRef.current = null;
  }, []);

  useEffect(() => {
    dubhubVideoDebugLog("[DubHub][PostFlow][route]", "entered trim page", {
      route: "/trim-video",
    });
  }, []);

  useEffect(() => {
    const sourceRaw = localStorage.getItem("dubhub-trim-source");
    const stateRaw = localStorage.getItem("dubhub-trim-state");
    const raw = sourceRaw || stateRaw;
    if (!raw) {
      toast({
        title: "No video selected",
        description: "Please select a video first",
        variant: "destructive",
      });
      setLocation("/");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!validateTrimEntryState(parsed)) {
        dubhubVideoDebugLog("[DubHub][NativeBridge]", "fatal-js-exception-guard", {
          stage: "trim-video:validateTrimEntryState",
          hasSourceRaw: !!sourceRaw,
          hasStateRaw: !!stateRaw,
        });
        localStorage.removeItem("dubhub-trim-state");
        localStorage.removeItem("dubhub-trim-source");
        localStorage.removeItem("dubhub-trim-times");
        toast({
          title: "Could not load clip",
          description: "Please select your video again.",
          variant: "destructive",
        });
        setLocation("/");
        return;
      }
      const next = parsed as TrimVideoState;
      // On native iOS, prefer durable native URI if present (survives WebView reload).
      if (isNativeIosVideoEditorPath() && next.sourceNativeUri) {
        next.videoUrl = nativePreviewUri(next.sourceNativeUri);
      }
      setState(next);
    } catch (e) {
      dubhubVideoDebugLog("[DubHub][NativeBridge]", "fatal-js-exception-guard", {
        stage: "trim-video:parseTrimState",
        message: e instanceof Error ? e.message : String(e),
      });
      localStorage.removeItem("dubhub-trim-state");
      localStorage.removeItem("dubhub-trim-source");
      localStorage.removeItem("dubhub-trim-times");
      toast({
        title: "Could not load clip",
        description: "Please select your video again.",
        variant: "destructive",
      });
      setLocation("/");
    }
  }, [toast, setLocation]);

  useEffect(() => {
    setVideoMuted(true);
  }, [state?.videoUrl]);

  useEffect(() => {
    setTrimWavePaintFallback(false);
    setFallbackBarPeaks([]);
    setTrimLightDomWholeRangeDrag(false);
  }, [state?.videoUrl]);

  /** When canvas paint fallback is on, drive `currentTime` from the video element (reliable on iOS). */
  useEffect(() => {
    if (!trimWavePaintFallback || !state?.videoUrl) return;
    const v = videoRef.current;
    if (!v) return;
    const sync = () => setCurrentTime(v.currentTime);
    v.addEventListener("timeupdate", sync);
    sync();
    return () => v.removeEventListener("timeupdate", sync);
  }, [trimWavePaintFallback, state?.videoUrl]);

  useEffect(() => {
    if (!trimWavePaintFallback || !isPlaying) return;
    const v = videoRef.current;
    if (!v) return;
    const rafRef = { id: 0 };
    const tick = () => {
      setCurrentTime(v.currentTime);
      rafRef.id = requestAnimationFrame(tick);
    };
    rafRef.id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.id);
  }, [trimWavePaintFallback, isPlaying]);

  useEffect(() => {
    const onUnhandledError = (event: ErrorEvent) => {
      dubhubVideoDebugLog("[DubHub][NativeBridge]", "fatal-js-exception-guard", {
        stage: "trim-video:window.error",
        message: event.message,
        fileName: event.filename,
        line: event.lineno,
      });
    };
    window.addEventListener("error", onUnhandledError);
    return () => {
      window.removeEventListener("error", onUnhandledError);
    };
  }, []);

  useEffect(() => {
    return () => {
      destroyTrimPreviewVideo("trim-unmount");
      destroyTrimWaveSurfer("trim-unmount");
      dubhubVideoDebugLog("[DubHub][VideoCleanup]", "trim screen unmount cleanup done", {});
    };
  }, [destroyTrimPreviewVideo, destroyTrimWaveSurfer]);

  useEffect(() => {
    startTimeRef.current = startTime;
    endTimeRef.current = endTime;
    isPlayingRef.current = isPlaying;
  }, [startTime, endTime, isPlaying]);

  /** Kick first-frame decode early; WaveSurfer also calls kick in `ready`. */
  useLayoutEffect(() => {
    const v = videoRef.current;
    if (!v || !state?.videoUrl) return;
    const run = () => kickVideoFrameToScreen(v, startTimeRef.current);
    run();
    requestAnimationFrame(run);
  }, [state?.videoUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !state?.videoUrl) return;

    const onData = () => kickVideoFrameToScreen(v, startTimeRef.current);

    v.addEventListener("loadeddata", onData);
    v.addEventListener("canplay", onData);
    v.addEventListener("loadedmetadata", onData);

    return () => {
      v.removeEventListener("loadeddata", onData);
      v.removeEventListener("canplay", onData);
      v.removeEventListener("loadedmetadata", onData);
    };
  }, [state?.videoUrl]);

  /** Keep timeline length in sync with HTMLMediaElement when WaveSurfer reports NaN/0 (common on iPhone camera-roll). */
  useEffect(() => {
    if (!state?.videoUrl) return;
    const tick = () => {
      const v = videoRef.current;
      const ws = wavesurferRef.current;
      if (!v) return;
      const p = probeMediaTimelineSeconds(v);
      const dWs = ws?.getDuration();
      let best = 0;
      if (p != null && p > 0) best = Math.max(best, p);
      if (
        typeof dWs === "number" &&
        Number.isFinite(dWs) &&
        dWs > 0 &&
        dWs !== Number.POSITIVE_INFINITY
      ) {
        best = Math.max(best, dWs);
      }
      if (best > 0) {
        setTrimTimelineSeconds((prev) => (Math.abs(prev - best) > 0.04 ? best : prev));
        setDuration((prev) =>
          !Number.isFinite(prev) || prev <= 0 || Math.abs(prev - best) > 0.05 ? best : prev,
        );
        trimBoundsRef.current.minLen = Math.min(MIN_CLIP_DURATION_SECONDS, best);
        trimBoundsRef.current.maxLen = Math.min(MAX_CLIP_DURATION_SECONDS, best);
        trimBoundsRef.current.duration = best;
      }
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [state?.videoUrl]);

  /**
   * Light-DOM handles — work with or without a WaveSurfer region (see `attemptTrimWaveformSetup` probe-only path).
   */
  const handleTrimEdgePointerDown = useCallback((edge: "start" | "end") => {
    return (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const waveEl = waveformRef.current;
      if (!waveEl) return;

      const rect = waveEl.getBoundingClientRect();
      if (rect.width < 8) return;

      const b = trimBoundsRef.current;
      const durRaw = b.duration > 0 ? b.duration : trimTimelineSeconds;
      const dur = durRaw > 0 ? durRaw : Number.EPSILON;

      const region = activeTrimRegionRef.current;
      const anchorStart = region?.start ?? startTimeRef.current;
      const anchorEnd = region?.end ?? endTimeRef.current;

      const originClientX = e.clientX;
      const originEdgeTime = edge === "start" ? anchorStart : anchorEnd;
      const rectWidth = rect.width;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        ev.preventDefault();
        const r = activeTrimRegionRef.current;
        const dx = ev.clientX - originClientX;
        const dt = (dx / rectWidth) * dur;
        if (edge === "start") {
          const nextStart = originEdgeTime + dt;
          const { start: ns, end: ne } = clampSelection(nextStart, anchorEnd, dur, b.minLen, b.maxLen);
          r?.setOptions({ start: ns, end: ne });
          startTimeRef.current = ns;
          endTimeRef.current = ne;
          setStartTime(ns);
          setEndTime(ne);
        } else {
          const nextEnd = originEdgeTime + dt;
          const { start: ns, end: ne } = clampSelection(anchorStart, nextEnd, dur, b.minLen, b.maxLen);
          r?.setOptions({ start: ns, end: ne });
          startTimeRef.current = ns;
          endTimeRef.current = ne;
          setStartTime(ns);
          setEndTime(ne);
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        persistSelection(startTimeRef.current, endTimeRef.current);
        clampPlaybackToTrimRef.current();
      };

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    };
  }, [trimTimelineSeconds]);

  /**
   * Drag entire selection (fixed length) — WaveSurfer region provides this when present;
   * probe-only / iPhone path has no region, so the blue band must receive pointers.
   */
  const handleTrimWholeSelectionPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTrimRegionRef.current) return;

    const waveEl = waveformRef.current;
    if (!waveEl) return;
    const rect = waveEl.getBoundingClientRect();
    if (rect.width < 8) return;

    const b = trimBoundsRef.current;
    const durRaw = b.duration > 0 ? b.duration : trimTimelineSeconds;
    const dur = durRaw > 0 ? durRaw : Number.EPSILON;
    const originClientX = e.clientX;
    const originStart = startTimeRef.current;
    const span = Math.max(1e-6, endTimeRef.current - startTimeRef.current);
    const rectWidth = rect.width;
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();
      const dx = ev.clientX - originClientX;
      const dt = (dx / rectWidth) * dur;
      let ns = originStart + dt;
      let ne = ns + span;
      if (ns < 0) {
        ns = 0;
        ne = span;
      }
      if (ne > dur) {
        ne = dur;
        ns = Math.max(0, dur - span);
      }
      const { start: cs, end: ce } = clampSelection(ns, ne, dur, b.minLen, b.maxLen);
      startTimeRef.current = cs;
      endTimeRef.current = ce;
      setStartTime(cs);
      setEndTime(ce);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      persistSelection(startTimeRef.current, endTimeRef.current);
      clampPlaybackToTrimRef.current();
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [trimTimelineSeconds]);

  useLayoutEffect(() => {
    if (!state?.videoUrl || !waveformRef.current) return;
    const trimSourceUrl = state.videoUrl;
    /** Preserve mono peaks when a later `load(url, duration-hint)` runs for iOS timeline hints. */
    let prefetchedMonoPeaks: number[] | null = null;

    const videoEl = videoRef.current;
    if (!videoEl) return;
    const trimVideoEl = videoEl;

    isLoadingRef.current = true;
    let waveformCancelled = false;
    let playheadRafId = 0;
    const wsRegions = RegionsPlugin.create();
    regionPluginRef.current = wsRegions;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "rgba(255,255,255,0.28)",
      progressColor: "rgba(255,255,255,0.92)",
      cursorColor: "rgba(255,255,255,0.65)",
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 112,
      normalize: true,
      fillParent: true,
      /** Hint mux type for fetch+decode on iOS blob / camera-roll URLs. */
      blobMimeType:
        state.fileType && state.fileType.trim().length > 0 ? state.fileType : "video/mp4",
      /** Keep the trim region mounted: auto-scroll follows playback and WaveSurfer virtualizes regions outside the viewport. */
      autoScroll: false,
      autoCenter: false,
      hideScrollbar: true,
      plugins: [wsRegions],
      backend: "MediaElement",
      media: videoEl,
    });

    wavesurferRef.current = ws;
    dubhubVideoDebugLog("[DubHub][PostFlow][resource]", "wavesurfer created", {
      route: "/trim-video",
      hasMediaElement: !!videoEl,
    });

    const repaintAllTrimRegions = () => {
      wsRegions.getRegions().forEach((r) => applyTrimRegionChrome(r));
    };

    ws.on("scroll", repaintAllTrimRegions);
    ws.on("resize", repaintAllTrimRegions);

    let trimWaveformSetupComplete = false;
    /** iOS HEVC: one `load(url, undefined, seekProbe)` so WaveSurfer decodes when `media.duration` is still NaN. */
    let trimDurationReloadIssued = false;

    clampPlaybackToTrimRef.current = () => {
      if (waveformCancelled || wavesurferRef.current !== ws) return;
      const s = startTimeRef.current;
      const e = endTimeRef.current;
      let t = ws.getCurrentTime();
      if (!Number.isFinite(t)) t = trimVideoEl.currentTime;
      if (t < s || t >= e - 0.04) {
        ws.setTime(s);
        trimVideoEl.currentTime = s;
        wavesurferRepaintPlayhead(ws, s);
      }
    };
    let mediaDurationPollTimer: number | undefined;
    const mediaDurationEvents = ["durationchange", "loadedmetadata", "canplay", "progress"] as const;

    const clearMediaDurationWatchers = () => {
      for (const ev of mediaDurationEvents) {
        trimVideoEl.removeEventListener(ev, onMediaDurationMaybeReady);
      }
      if (mediaDurationPollTimer != null) {
        window.clearInterval(mediaDurationPollTimer);
        mediaDurationPollTimer = undefined;
      }
    };

    function syncWaveSurferDurationToVideoTimeline(): void {
      if (waveformCancelled || wavesurferRef.current !== ws) return;
      const probed = probeMediaTimelineSeconds(trimVideoEl);
      const vDur = trimVideoEl.duration;
      let target: number | null = probed;
      if (
        target == null &&
        Number.isFinite(vDur) &&
        vDur > 0 &&
        vDur !== Number.POSITIVE_INFINITY
      ) {
        target = vDur;
      }
      if (target == null || target <= 0) return;
      if (realignWaveSurferDecodedDuration(ws, target)) {
        dubhubVideoDebugLog("[DubHub][Trim]", "wavesurfer-duration-realigned-to-media", {
          targetSec: target,
        });
      }
      wavesurferRepaintPlayhead(ws, trimVideoEl.currentTime);
    }

    function onMediaDurationMaybeReady() {
      if (trimWaveformSetupComplete) {
        const dLate = readTrimMediaDurationSeconds(ws, trimVideoEl);
        if (dLate != null) {
          setDuration(dLate);
          setTrimTimelineSeconds(dLate);
          trimBoundsRef.current = {
            ...trimBoundsRef.current,
            duration: dLate,
          };
        }
        syncWaveSurferDurationToVideoTimeline();
        return;
      }
      attemptTrimWaveformSetup();
    }

    const onVideoTimelineForWsSync = () => {
      syncWaveSurferDurationToVideoTimeline();
    };
    trimVideoEl.addEventListener("durationchange", onVideoTimelineForWsSync);
    trimVideoEl.addEventListener("loadedmetadata", onVideoTimelineForWsSync);

    function attemptTrimWaveformSetup(): boolean {
      if (trimWaveformSetupComplete) return true;

      const probed = probeMediaTimelineSeconds(trimVideoEl);
      const dWs = ws.getDuration();
      const wsDurationOk =
        Number.isFinite(dWs) && dWs > 0 && dWs !== Number.POSITIVE_INFINITY;

      if (!wsDurationOk && probed != null && probed > 0 && !trimDurationReloadIssued) {
        trimDurationReloadIssued = true;
        void ws
          .load(
            trimSourceUrl,
            prefetchedMonoPeaks && prefetchedMonoPeaks.length >= 32
              ? [prefetchedMonoPeaks]
              : undefined,
            probed,
          )
          .catch(() => {
            trimDurationReloadIssued = false;
          });
        return false;
      }

      const videoDurationRaw = wsDurationOk ? dWs : probed;
      if (
        videoDurationRaw == null ||
        !Number.isFinite(videoDurationRaw) ||
        videoDurationRaw <= 0
      ) {
        return false;
      }
      const timelineSec = videoDurationRaw;

      const maxLen = Math.min(MAX_CLIP_DURATION_SECONDS, timelineSec);
      const minLen = Math.min(MIN_CLIP_DURATION_SECONDS, timelineSec);

      let initialStart = 0;
      let initialEnd = Math.min(DEFAULT_CLIP_SELECTION_SECONDS, timelineSec);
      const savedTimesRaw = localStorage.getItem("dubhub-trim-times");
      if (savedTimesRaw) {
        try {
          const t = JSON.parse(savedTimesRaw) as { startTime?: number; endTime?: number };
          if (
            typeof t.startTime === "number" &&
            typeof t.endTime === "number" &&
            t.endTime > t.startTime
          ) {
            initialStart = t.startTime;
            initialEnd = t.endTime;
          }
        } catch {
          /* ignore */
        }
      }

      if (initialEnd - initialStart < minLen) {
        initialEnd = Math.min(timelineSec, initialStart + minLen);
      }
      const clamped = clampSelection(initialStart, initialEnd, timelineSec, minLen, maxLen);

      function applyInitialTrimStateAfterSetup() {
        setDuration(timelineSec);
        setTrimTimelineSeconds(timelineSec);
        trimBoundsRef.current = { minLen, maxLen, duration: timelineSec };
        setStartTime(clamped.start);
        setEndTime(clamped.end);
        startTimeRef.current = clamped.start;
        endTimeRef.current = clamped.end;
        persistSelection(clamped.start, clamped.end);

        const video = videoRef.current;
        if (video) {
          kickVideoFrameToScreen(video, clamped.start);
          requestAnimationFrame(() => kickVideoFrameToScreen(video, clamped.start));
          window.setTimeout(() => kickVideoFrameToScreen(video, clamped.start), 80);
          window.setTimeout(() => kickVideoFrameToScreen(video, clamped.start), 250);
        }
      }

      /**
       * iPhone / HEVC: HTMLMediaElement exposes a real timeline via seekable/duration while
       * WaveSurfer keeps `getDuration()` invalid — do not block trim UI on plugin duration.
       */
      if (!wsDurationOk) {
        trimWaveformSetupComplete = true;
        clearMediaDurationWatchers();
        try {
          ws.setScroll(0);
        } catch {
          /* ignore */
        }
        activeTrimRegionRef.current = null;
        applyInitialTrimStateAfterSetup();
        setTrimLightDomWholeRangeDrag(true);
        dubhubVideoDebugLog("[DubHub][Trim]", "waveform-duration-invalid-using-media-probe", {
          probedSeconds: probed,
          wsGetDuration: dWs,
          videoElDuration: trimVideoEl.duration,
          seekableLen: trimVideoEl.seekable?.length ?? 0,
        });
        return true;
      }

      trimWaveformSetupComplete = true;
      clearMediaDurationWatchers();

      try {
        ws.setScroll(0);
      } catch {
        /* ignore */
      }

      const region = wsRegions.addRegion({
        start: clamped.start,
        end: clamped.end,
        color: TRIM_SELECTION_BLUE,
        drag: true,
        /** Native shadow-DOM grips are unreliable to style; visible handles are light-DOM overlays. */
        resize: false,
        minLength: minLen > 0 ? minLen : 0.1,
        maxLength: maxLen,
      });

      activeTrimRegionRef.current = region;
      applyTrimRegionChrome(region, { delayedRepaint: true });
      applyInitialTrimStateAfterSetup();
      setTrimLightDomWholeRangeDrag(false);

      region.on("update", () => {
        applyTrimRegionChrome(region);
        setStartTime(region.start);
        setEndTime(region.end);
        startTimeRef.current = region.start;
        endTimeRef.current = region.end;
      });

      region.on("update-end", () => {
        applyTrimRegionChrome(region);
        const dur = trimBoundsRef.current.duration;
        const max = Math.min(MAX_CLIP_DURATION_SECONDS, dur);
        const min = Math.min(MIN_CLIP_DURATION_SECONDS, dur);
        const { start: ns, end: ne } = clampSelection(region.start, region.end, dur, min, max);
        if (Math.abs(ns - region.start) > 1e-4 || Math.abs(ne - region.end) > 1e-4) {
          region.setOptions({ start: ns, end: ne });
        }
        setStartTime(ns);
        setEndTime(ne);
        startTimeRef.current = ns;
        endTimeRef.current = ne;
        persistSelection(ns, ne);
        clampPlaybackToTrimRef.current();
      });

      return true;
    }

    ws.on("ready", () => {
      isLoadingRef.current = false;
      syncWaveSurferDurationToVideoTimeline();
      if (attemptTrimWaveformSetup()) return;

      for (const ev of mediaDurationEvents) {
        videoEl.addEventListener(ev, onMediaDurationMaybeReady);
      }

      let pollTicks = 0;
      mediaDurationPollTimer = window.setInterval(() => {
        pollTicks += 1;
        if (attemptTrimWaveformSetup()) return;
        if (pollTicks > 150) {
          void attemptTrimWaveformSetup();
          clearMediaDurationWatchers();
        }
      }, 100);
    });

    const LOOP_EPS = 0.04;

    const paintPlayheadFrame = () => {
      if (waveformCancelled || wavesurferRef.current !== ws) return;
      if (trimVideoEl.paused) return;
      wavesurferRepaintPlayhead(ws, trimVideoEl.currentTime);
      playheadRafId = requestAnimationFrame(paintPlayheadFrame);
    };

    ws.on("timeupdate", (time) => {
      setCurrentTime(time);
      const s = startTimeRef.current;
      const e = endTimeRef.current;
      if (isPlayingRef.current && time >= e - LOOP_EPS) {
        ws.setTime(s);
        if (videoRef.current) {
          videoRef.current.currentTime = s;
        }
        wavesurferRepaintPlayhead(ws, s);
      }
    });

    ws.on("play", () => {
      setIsPlaying(true);
      cancelAnimationFrame(playheadRafId);
      paintPlayheadFrame();
    });
    ws.on("pause", () => {
      setIsPlaying(false);
      cancelAnimationFrame(playheadRafId);
      wavesurferRepaintPlayhead(ws, trimVideoEl.currentTime);
    });

    const waveformSurfaceTimers: number[] = [];
    const peakLoadAbort = new AbortController();

    const scheduleWaveformPaintChecks = () => {
      const tryActivateWaveformPaintFallback = (stage: string) => {
        if (waveformCancelled || wavesurferRef.current !== ws) return;
        if (!isWaveSurferWaveformCanvasVisuallyBlank(waveformRef.current)) {
          setTrimWavePaintFallback(false);
          return;
        }
        const d =
          trimBoundsRef.current.duration > 0
            ? trimBoundsRef.current.duration
            : (probeMediaTimelineSeconds(trimVideoEl) ?? 0);
        if (!(d > 0)) return;
        setTrimWavePaintFallback(true);
        setFallbackBarPeaks(
          neutralWaveformPeaksNormalized(
            200,
            `${trimSourceUrl}\0${String(state.fileSize ?? 0)}`,
          ),
        );
        dubhubVideoDebugLog("[DubHub][Trim]", "trim-waveform-paint-fallback-active", {
          durationSec: d,
          stage,
        });
      };

      waveformSurfaceTimers.push(
        window.setTimeout(() => {
          if (waveformCancelled || wavesurferRef.current !== ws) return;
          if (!isWaveSurferWaveformCanvasVisuallyBlank(waveformRef.current)) {
            setTrimWavePaintFallback(false);
          }
        }, 450),
      );
      waveformSurfaceTimers.push(
        window.setTimeout(() => tryActivateWaveformPaintFallback("t1350"), 1350),
      );
      waveformSurfaceTimers.push(
        window.setTimeout(() => tryActivateWaveformPaintFallback("t2800"), 2800),
      );
    };

    void (async () => {
      try {
        const pre = await tryDecodeMediaUrlToMonoPeaks(trimSourceUrl, 4096, 4500, {
          signal: peakLoadAbort.signal,
        });
        if (waveformCancelled) return;
        const probeAtLoad = probeMediaTimelineSeconds(trimVideoEl);
        const durHint =
          probeAtLoad != null && probeAtLoad > 0 ? probeAtLoad : (pre?.durationSec ?? 0);
        if (pre && pre.peaks.length >= 32 && durHint > 0) {
          prefetchedMonoPeaks = pre.peaks;
          await ws.load(trimSourceUrl, [pre.peaks], durHint);
          dubhubVideoDebugLog("[DubHub][Trim]", "waveform-peaks-prefetched-for-load", {
            barCount: pre.peaks.length,
            durationSec: durHint,
          });
        } else if (pre && pre.peaks.length >= 32) {
          prefetchedMonoPeaks = pre.peaks;
          await ws.load(trimSourceUrl, [pre.peaks], pre.durationSec);
          dubhubVideoDebugLog("[DubHub][Trim]", "waveform-peaks-prefetched-for-load", {
            barCount: pre.peaks.length,
            durationSec: pre.durationSec,
          });
        } else {
          prefetchedMonoPeaks = null;
          await ws.load(trimSourceUrl);
        }
      } catch (error) {
        if (waveformCancelled) return;
        try {
          await ws.load(trimSourceUrl);
        } catch (e2) {
          const err = e2 as Error;
          if (err?.name !== "AbortError" && isLoadingRef.current) {
            console.error("WaveSurfer load error:", e2);
          }
        }
      }
      if (!waveformCancelled) {
        syncWaveSurferDurationToVideoTimeline();
        window.setTimeout(() => {
          wavesurferRepaintPlayhead(ws, trimVideoEl.currentTime);
          scheduleWaveformPaintChecks();
        }, 50);
      }
    })();

    return () => {
      waveformCancelled = true;
      cancelAnimationFrame(playheadRafId);
      clampPlaybackToTrimRef.current = () => {};
      trimVideoEl.removeEventListener("durationchange", onVideoTimelineForWsSync);
      trimVideoEl.removeEventListener("loadedmetadata", onVideoTimelineForWsSync);
      peakLoadAbort.abort();
      for (const t of waveformSurfaceTimers) window.clearTimeout(t);
      clearMediaDurationWatchers();
      isLoadingRef.current = false;
      regionPluginRef.current = null;
      activeTrimRegionRef.current = null;
      if (ws) {
        try {
          dubhubVideoDebugLog("[DubHub][PostFlow][dispose]", "wavesurfer destroy start", {
            route: "/trim-video",
          });
          ws.pause();
          ws.destroy();
          dubhubVideoDebugLog("[DubHub][PostFlow][dispose]", "wavesurfer destroyed", {
            route: "/trim-video",
          });
        } catch {
          /* ignore */
        }
      }
      wavesurferRef.current = null;
    };
  }, [state?.videoUrl, state?.fileType]);

  const togglePlayPause = useCallback(() => {
    const ws = wavesurferRef.current;
    const videoEl = videoRef.current;
    if (!ws || !videoEl) return;

    const s = startTimeRef.current;
    const e = endTimeRef.current;
    const t = ws.getCurrentTime();

    if (!videoEl.paused) {
      ws.pause();
      return;
    }

    if (t < s || t >= e - 0.05) {
      ws.setTime(s);
      videoEl.currentTime = s;
    }
    videoEl.muted = false;
    setVideoMuted(false);
    void ws.play();
  }, []);

  const skipBackward = useCallback(() => {
    const ws = wavesurferRef.current;
    const videoEl = videoRef.current;
    if (!ws) return;
    const s = startTimeRef.current;
    const e = endTimeRef.current;
    const t = ws.getCurrentTime();
    const newTime = Math.max(s, Math.min(e - 0.05, t - 5));
    ws.setTime(newTime);
    if (videoEl) videoEl.currentTime = newTime;
  }, []);

  const skipForward = useCallback(() => {
    const ws = wavesurferRef.current;
    const videoEl = videoRef.current;
    if (!ws) return;
    const s = startTimeRef.current;
    const e = endTimeRef.current;
    const t = ws.getCurrentTime();
    const newTime = Math.max(s, Math.min(e - 0.05, t + 5));
    ws.setTime(newTime);
    if (videoEl) videoEl.currentTime = newTime;
  }, []);

  const handleNext = useCallback(async () => {
    if (!state?.videoUrl) return;

    const clipLen = endTime - startTime;
    const timelineDur = Math.max(duration, trimTimelineSeconds);
    const minRequired =
      timelineDur >= MIN_CLIP_DURATION_SECONDS ? MIN_CLIP_DURATION_SECONDS : timelineDur;

    if (clipLen > MAX_CLIP_DURATION_SECONDS + 0.01 || clipLen <= 0) {
      toast({
        title: "Invalid selection",
        description: `Choose a segment up to ${MAX_CLIP_DURATION_SECONDS} seconds.`,
        variant: "destructive",
      });
      return;
    }

    if (timelineDur >= MIN_CLIP_DURATION_SECONDS && clipLen < minRequired - 0.05) {
      toast({
        title: "Selection too short",
        description: `Clips must be at least ${MIN_CLIP_DURATION_SECONDS} seconds.`,
        variant: "destructive",
      });
      return;
    }

    wavesurferRef.current?.pause();

    setIsPreparingClip(true);
    try {
      const baseName = state.fileName.replace(/\.[^/.]+$/, "") || "clip";
      if (isNativeIosVideoEditorPath()) {
        const nextProcessStartMs = Date.now();
        dubhubVideoDebugLog("[DubHub][NativePost]", "next-processing-start", {
          route: "/trim-video",
          startSec: startTime,
          endSec: endTime,
          clipLen,
        });
        dubhubVideoDebugLog("[DubHub][NativeTrim]", "trim flow using native path", {
          route: "/trim-video",
          startSec: startTime,
          endSec: endTime,
          clipLen,
        });
        dubhubVideoDebugLog("[DubHub][NativeBridge]", "trim-handoff-start", {
          fileName: state.fileName,
          fileType: state.fileType,
          fileSize: state.fileSize,
          sourceUriPreview: state.videoUrl.slice(0, 120),
        });
        const sourceUri = await materializeSourceUriForNativeEditor({
          sourceUri: state.videoUrl,
          fileName: state.fileName,
        });
        if (!sourceUri || typeof sourceUri !== "string") {
          throw new Error("Native trim handoff returned invalid source URI.");
        }
        upsertTrimState({
          sourceNativeUri: sourceUri,
          videoUrl: nativePreviewUri(sourceUri),
        });
        dubhubVideoDebugLog("[DubHub][NativeTrim]", "source URI before trimVideo", {
          sourceUriPreview: sourceUri.slice(0, 140),
          startMs: Math.round(startTime * 1000),
          endMs: Math.round(endTime * 1000),
        });
        /** Native trim + H.264 pass can take minutes on large sources; cap wait so UI can recover. */
        const trimTimeoutMs = 10 * 60 * 1000;
        const trimResult = await withTimeout(
          nativeTrimVideo({
            sourceUri,
            startMs: Math.round(startTime * 1000),
            endMs: Math.round(endTime * 1000),
          }),
          trimTimeoutMs,
          "Trim and encoding took too long. Try a shorter selection or a smaller video, then tap Next again.",
        );
        if (!trimResult.outputUri) {
          throw new Error("Native trim returned no outputUri.");
        }
        if (!trimResult.durationMs || trimResult.durationMs <= 0) {
          throw new Error("Native output clip is invalid (duration).");
        }
        if ((trimResult.fileSize ?? 0) <= 0) {
          throw new Error("Native output clip is invalid (size).");
        }
        dubhubVideoDebugLog("[DubHub][NativeTrim]", "validated native output before route", {
          outputUriPreview: trimResult.outputUri.slice(0, 140),
          durationMs: trimResult.durationMs,
          fileSize: trimResult.fileSize,
        });
        const finalOutputSize = trimResult.fileSize ?? 0;
        const postCompressionWithinLimit = finalOutputSize > 0 && finalOutputSize <= MAX_VIDEO_UPLOAD_BYTES;
        dubhubVideoDebugLog("[DubHub][NativeTrim]", "post-compression size validation result", {
          finalOutputSize,
          uploadLimitBytes: MAX_VIDEO_UPLOAD_BYTES,
          uploadLimitMb: MAX_VIDEO_UPLOAD_MB,
          withinLimit: postCompressionWithinLimit,
        });
        if (finalOutputSize > MAX_VIDEO_UPLOAD_BYTES) {
          toast({
            title: "Clip too large",
            description: "This clip is still too large after processing. Try trimming it a little shorter.",
          });
          return;
        }
        const webViewUri = nativePreviewUri(trimResult.outputUri);
        dubhubVideoDebugLog("[DubHub][NativeTrim]", "final output selected for submission", {
          outputUriPreview: trimResult.outputUri.slice(0, 120),
          previewUriPreview: webViewUri.slice(0, 120),
          fileSize: finalOutputSize,
        });
        dubhubVideoDebugLog("[DubHub][NativeUploadPath]", "native output prepared for preview only", {
          outputUriPreview: trimResult.outputUri.slice(0, 120),
          previewUriPreview: webViewUri.slice(0, 120),
          fileSize: finalOutputSize || null,
        });
        dubhubVideoDebugLog("[DubHub][NativeBridge]", "preview URI converted", {
          outputUriPreview: trimResult.outputUri.slice(0, 120),
          webViewUriPreview: webViewUri.slice(0, 120),
        });
        const thumbStartMs = Date.now();
        let thumbnailUri: string | null = null;
        try {
          const thumb = await nativeGenerateThumbnail({
            sourceUri: trimResult.outputUri,
            atMs: Math.round(Math.min(250, trimResult.durationMs / 3)),
          });
          thumbnailUri = Capacitor.convertFileSrc(thumb.thumbnailUri);
          localStorage.setItem(
            "dubhub-trim-thumbnail",
            JSON.stringify({
              thumbnailUri,
              width: thumb.width,
              height: thumb.height,
            }),
          );
        } catch {
          /* thumbnail is optional for now */
        }
        dubhubVideoDebugLog("[DubHub][NativePost]", "next-thumbnail-finished", {
          elapsedMs: Date.now() - thumbStartMs,
          hasThumbnail: !!thumbnailUri,
        });
        const uploadPrepStartMs = Date.now();
        let preparedUploadFile: File | null = null;
        try {
          const uploadCtl = new AbortController();
          const uploadTid = window.setTimeout(() => uploadCtl.abort(), 3 * 60 * 1000);
          try {
            const uploadRes = await fetch(webViewUri, { signal: uploadCtl.signal });
            if (!uploadRes.ok) {
              throw new Error(`Could not read processed clip (${uploadRes.status}).`);
            }
            const uploadBlob = await uploadRes.blob();
            if (uploadBlob.size <= 0) {
              throw new Error("Processed clip is empty.");
            }
            preparedUploadFile = new File([uploadBlob], `${baseName}_trim.mp4`, {
              type: trimResult.mimeType || "video/mp4",
            });
            dubhubVideoDebugLog("[DubHub][NativePost]", "next-upload-artifact-prepared", {
              elapsedMs: Date.now() - uploadPrepStartMs,
              bytes: preparedUploadFile.size,
              type: preparedUploadFile.type,
            });
          } finally {
            window.clearTimeout(uploadTid);
          }
        } catch (err) {
          // Do not fail the whole Next flow here; submit page can still use native URI fallback.
          dubhubVideoDebugLog("[DubHub][NativePost]", "any reconstruction path still being used", {
            reason: "next-upload-artifact-prepare-failed",
            message: err instanceof Error ? err.message : String(err),
          });
        }
        setNativePostArtifact({
          nativeOutputUri: trimResult.outputUri,
          previewUri: webViewUri,
          thumbnailUri,
          mimeType: trimResult.mimeType || "video/mp4",
          fileSize: finalOutputSize,
          durationMs: trimResult.durationMs,
          width: trimResult.width,
          height: trimResult.height,
          filename: `${baseName}_trim.mp4`,
          uploadFile: preparedUploadFile,
        });
        localStorage.setItem(
          "dubhub-trim-export",
          JSON.stringify({
            videoUrl: webViewUri,
            nativeOutputUri: trimResult.outputUri,
            fileName: `${baseName}_trim.mp4`,
            fileType: trimResult.mimeType || "video/mp4",
              fileSize: finalOutputSize,
            durationSec: trimResult.durationMs / 1000,
          }),
        );
        localStorage.setItem(
          "dubhub-native-trim-output",
          JSON.stringify({
            previewUri: webViewUri,
            nativeOutputUri: trimResult.outputUri,
            fileName: `${baseName}_trim.mp4`,
            fileType: trimResult.mimeType || "video/mp4",
              fileSize: finalOutputSize,
            durationSec: trimResult.durationMs / 1000,
          }),
        );
        localStorage.setItem(
          "dubhub-native-post-artifact",
          JSON.stringify({
            nativeOutputUri: trimResult.outputUri,
            previewUri: webViewUri,
            thumbnailUri,
            mimeType: trimResult.mimeType || "video/mp4",
            fileSize: finalOutputSize,
            durationMs: trimResult.durationMs,
            width: trimResult.width,
            height: trimResult.height,
            filename: `${baseName}_trim.mp4`,
          }),
        );
        localStorage.removeItem("dubhub-trim-state");
        dubhubVideoDebugLog("[DubHub][NativeBridge]", "trim-handoff-success", {
          sourceUriPreview: sourceUri.slice(0, 120),
          outputUriPreview: trimResult.outputUri.slice(0, 120),
        });
        dubhubVideoDebugLog("[DubHub][NativeTrim]", "trim export stored; route -> submit-metadata", {
          route: "/submit-metadata",
        });
        dubhubVideoDebugLog("[DubHub][NativePost]", "next-processing-finished", {
          elapsedMs: Date.now() - nextProcessStartMs,
          finalFileSize: finalOutputSize,
        });
      } else {
        const { exportTrimmedClip } = await import("@/lib/export-trimmed-video");
        const blob = await exportTrimmedClip({
          sourceBlobUrl: state.videoUrl,
          sourceFileName: state.fileName,
          startSec: startTime,
          durationSec: clipLen,
        });

        if (blob.size > MAX_VIDEO_UPLOAD_BYTES) {
          toast({
            title: "Exported clip too large",
            description: `After trimming, the file is over ${MAX_VIDEO_UPLOAD_MB}MB. Try a shorter clip or a lower-resolution video.`,
            variant: "destructive",
          });
          return;
        }

        const newUrl = URL.createObjectURL(blob);
        dubhubVideoDebugLog("[DubHub][PostFlow][resource]", "trim export object URL created", {
          route: "/trim-video",
          blobUrlPreview: newUrl.slice(0, 80),
          bytes: blob.size,
        });

        localStorage.setItem(
          "dubhub-trim-export",
          JSON.stringify({
            videoUrl: newUrl,
            fileName: `${baseName}_trim.mp4`,
            fileType: "video/mp4",
            fileSize: blob.size,
            durationSec: clipLen,
          }),
        );
      }

      persistSelection(startTime, endTime);
      dubhubVideoDebugLog("[DubHub][PostFlow][route]", "entering submit details", {
        route: "/submit-metadata",
      });
      setLocation("/submit-metadata");
    } catch (e) {
      const errMsg =
        e instanceof Error
          ? `${e.name}: ${e.message}`
          : (() => {
              try {
                return JSON.stringify(e);
              } catch {
                return String(e);
              }
            })();
      console.error("[trim-video] prepare clip failed:", errMsg, e);
      dubhubVideoDebugLog("[DubHub][NativeBridge]", "trim-handoff-failure", {
        message: errMsg,
      });
      dubhubVideoDebugLog("[DubHub][NativeTrim]", "trim flow failure", {
        message: e instanceof Error ? e.message : String(e),
      });
      toast({
        title: "Could not prepare clip",
        description:
          e instanceof Error
            ? e.message
            : "We couldn't finish processing this clip. Try a slightly shorter trim and try again.",
        variant: "destructive",
      });
    } finally {
      setIsPreparingClip(false);
    }
  }, [duration, endTime, startTime, state, toast, setLocation, trimTimelineSeconds]);

  const handleBack = () => {
    clearNativePostArtifact();
    destroyTrimPreviewVideo("trim-back");
    destroyTrimWaveSurfer("trim-back");
    if (state?.videoUrl?.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(state.videoUrl);
        dubhubVideoDebugLog("[DubHub][VideoCleanup]", "trim back blob revoked", {
          blobUrlPreview: state.videoUrl.slice(0, 80),
        });
      } catch {
        /* ignore */
      }
    }
    dubhubVideoDebugLog("[DubHub][PostFlow][route]", "leaving trim page to Home", {
      route: "/submit",
    });
    setLocation("/submit");
  };

  const handleCancelPost = async () => {
    clearNativePostArtifact();
    destroyTrimPreviewVideo("trim-cancel");
    destroyTrimWaveSurfer("trim-cancel");
    if (state?.videoUrl?.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(state.videoUrl);
        dubhubVideoDebugLog("[DubHub][VideoCleanup]", "trim cancel blob revoked", {
          blobUrlPreview: state.videoUrl.slice(0, 80),
        });
      } catch {
        /* ignore */
      }
    }
    await cancelPostAndHardResetToHome("trim-cancel-post");
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 10);
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${ms}`;
  };

  if (!state) {
    return null;
  }

  const clipSpan = Math.max(0, endTime - startTime);
  /** Denominator for handles + light-DOM trim strip; must not be WaveSurfer-only. */
  const effectiveTrimUiSec = Math.max(0, duration, trimTimelineSeconds);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black pt-[env(safe-area-inset-top,0px)]">
      <div className="relative z-30 flex items-center justify-between border-b border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur-md pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-white">Trim clip</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-white/75 hover:text-white hover:bg-white/10"
            onClick={() => setShowCancelDialog(true)}
            data-testid="button-cancel-trim"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleNext()}
            disabled={isPreparingClip}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="button-next-trim"
          >
            {isPreparingClip ? (
              <span
                className="mr-2.5 inline-flex h-10 w-10 shrink-0 items-center justify-center"
                aria-hidden
              >
                <span className="flex origin-center scale-[calc(40/28)]">
                  <VinylPullRefreshIndicator
                    phase="refreshing"
                    pullDistancePx={0}
                    pullProgress={1}
                    spinningContrast="onPrimaryButton"
                  />
                </span>
              </span>
            ) : (
              <span className="mr-2.5 inline-flex h-10 w-10 shrink-0 items-center justify-center">
                <Check className="h-5 w-5" />
              </span>
            )}
            {isPreparingClip ? "Preparing…" : "Next"}
          </Button>
        </div>
      </div>

      <div className="flex-1 relative min-h-0 overflow-hidden">
        <video
          key={state.videoUrl}
          ref={videoRef}
          data-debug-media-id="trim-preview"
          src={state.videoUrl}
          className="absolute inset-0 z-10 h-full w-full object-contain bg-black"
          playsInline
          muted={videoMuted}
          preload="auto"
          data-testid="video-preview"
          onError={(e) => {
            console.error("Video load error:", e);
            const target = e.target as HTMLVideoElement;
            if (target.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
              console.warn("Blob URL may have been revoked or is invalid");
              dubhubVideoDebugLog("[DubHub][NativeBridge]", "fatal-js-exception-guard", {
                stage: "trim-video:video-src-not-supported",
                sourcePreview: state.videoUrl.slice(0, 120),
              });
              if (isNativeIosVideoEditorPath()) {
                let recovered = false;
                try {
                  const candidateUri = state.sourceNativeUri;
                  if (candidateUri) {
                    const restored = nativePreviewUri(candidateUri);
                    setState((prev) => (prev ? { ...prev, videoUrl: restored } : prev));
                    upsertTrimState({ videoUrl: restored, sourceNativeUri: candidateUri });
                    recovered = true;
                    dubhubVideoDebugLog("[DubHub][NativeBridge]", "trim-handoff-success", {
                      sourceUriPreview: candidateUri.slice(0, 120),
                      restoredPreview: restored.slice(0, 120),
                    });
                  }
                } catch {
                  recovered = false;
                }
                if (!recovered && state.videoUrl.startsWith("blob:")) {
                  toast({
                    title: "Could not restore clip",
                    description: "We couldn't restore this clip after reload. Please choose it again.",
                    variant: "destructive",
                  });
                  localStorage.removeItem("dubhub-trim-state");
                  localStorage.removeItem("dubhub-trim-source");
                  localStorage.removeItem("dubhub-trim-times");
                  setLocation("/submit");
                }
                return;
              }
              if (state.videoUrl.startsWith("blob:")) {
                localStorage.removeItem("dubhub-trim-state");
                localStorage.removeItem("dubhub-trim-source");
                localStorage.removeItem("dubhub-trim-times");
                toast({
                  title: "Could not restore clip",
                  description: "Please choose the video again.",
                  variant: "destructive",
                });
                setLocation("/submit");
              }
            }
          }}
        />

        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="pointer-events-auto mb-28 flex items-center justify-center gap-4 touch-manipulation">
            <Button
              variant="outline"
              size="icon"
              onClick={skipBackward}
              className="h-12 w-12 border-white/25 bg-black/55 text-white backdrop-blur-md hover:bg-black/75"
              data-testid="button-skip-backward"
              aria-label="Skip backward 5 seconds"
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            <Button
              size="icon"
              className="h-20 w-20 rounded-full border border-white/25 bg-black/45 text-white shadow-2xl backdrop-blur-md hover:bg-black/65"
              onClick={togglePlayPause}
              data-testid="button-play-pause"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="ml-1 h-8 w-8" />}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={skipForward}
              className="h-12 w-12 border-white/25 bg-black/55 text-white backdrop-blur-md hover:bg-black/75"
              data-testid="button-skip-forward"
              aria-label="Skip forward 5 seconds"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/85 to-transparent pb-[calc(1rem+var(--app-bottom-nav-block))] pt-20">
          <div className="pointer-events-auto space-y-3 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
            <p className="text-center text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
              Drag handles or blue range · {MIN_CLIP_DURATION_SECONDS}–{MAX_CLIP_DURATION_SECONDS}{" "}
              seconds
            </p>
            <div className="flex items-center justify-between gap-2 text-xs text-white/90">
              <span className="font-mono tabular-nums shrink-0" data-testid="text-current-time">
                {formatTime(currentTime)}
              </span>
              <span className="min-w-0 text-center font-medium">
                <span className="text-white">{formatTime(startTime)}</span>
                <span className="mx-1 text-white/35">·</span>
                <span className="text-white">{formatTime(endTime)}</span>
                <span className="ml-2 tabular-nums text-white/55">({clipSpan.toFixed(1)}s)</span>
              </span>
              <span className="font-mono tabular-nums shrink-0 text-white/60" data-testid="text-total-duration">
                {formatTime(effectiveTrimUiSec)}
              </span>
            </div>

            <div className="relative mb-1 w-full min-h-[112px] select-none [-webkit-touch-callout:none]">
              <div className="relative h-[112px] overflow-hidden rounded-2xl border border-white/12 bg-zinc-950/90 shadow-inner backdrop-blur-sm">
                <div
                  ref={waveformRef}
                  className={cn(
                    "relative z-0 h-full w-full min-h-0",
                    trimWavePaintFallback && "[&>*]:opacity-[0.03]",
                  )}
                  data-testid="waveform-container"
                />
                {trimWavePaintFallback &&
                fallbackBarPeaks.length > 0 &&
                effectiveTrimUiSec > 0 ? (
                  <TrimWaveformMatchedFallback
                    peaks={fallbackBarPeaks}
                    durationSec={effectiveTrimUiSec}
                    currentTimeSec={currentTime}
                  />
                ) : null}
                {effectiveTrimUiSec > 0 ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-[15]"
                    data-testid="trim-visual-overlay"
                    aria-hidden
                  >
                    <div className="absolute inset-x-1 inset-y-2 rounded-md bg-white/[0.08]" />
                    <div
                      role="presentation"
                      data-testid="trim-range-body"
                      className={cn(
                        "absolute inset-y-2 rounded-md bg-[rgba(30,56,249,0.5)] ring-1 ring-white/30 [-webkit-touch-callout:none]",
                        trimLightDomWholeRangeDrag
                          ? "pointer-events-auto cursor-grab touch-none active:cursor-grabbing"
                          : "pointer-events-none",
                      )}
                      style={{
                        left: `${Math.max(0, Math.min(100, (startTime / effectiveTrimUiSec) * 100))}%`,
                        width: `${Math.max(
                          0.45,
                          Math.min(
                            100,
                            ((endTime - startTime) / effectiveTrimUiSec) * 100,
                          ),
                        )}%`,
                      }}
                      onPointerDown={
                        trimLightDomWholeRangeDrag
                          ? handleTrimWholeSelectionPointerDown
                          : undefined
                      }
                    />
                  </div>
                ) : null}
              </div>
              {effectiveTrimUiSec > 0 ? (
                <>
                  <div
                    role="slider"
                    aria-label="Trim clip start"
                    data-testid="trim-handle-start"
                    className="pointer-events-auto absolute top-0 z-[60] flex h-[112px] w-11 -translate-x-1/2 touch-none cursor-ew-resize items-center justify-center"
                    style={{
                      left: `${Math.max(0, Math.min(100, (startTime / effectiveTrimUiSec) * 100))}%`,
                    }}
                    onPointerDown={handleTrimEdgePointerDown("start")}
                  >
                    <div
                      className="h-[98px] w-5 shrink-0 rounded-md border-2 border-white/90 bg-white/95"
                      style={{
                        boxShadow: `0 0 0 2px ${TRIM_HANDLE_BLUE}, 0 3px 14px rgba(0,0,0,0.48)`,
                      }}
                      aria-hidden
                    />
                  </div>
                  <div
                    role="slider"
                    aria-label="Trim clip end"
                    data-testid="trim-handle-end"
                    className="pointer-events-auto absolute top-0 z-[60] flex h-[112px] w-11 -translate-x-1/2 touch-none cursor-ew-resize items-center justify-center"
                    style={{
                      left: `${Math.max(0, Math.min(100, (endTime / effectiveTrimUiSec) * 100))}%`,
                    }}
                    onPointerDown={handleTrimEdgePointerDown("end")}
                  >
                    <div
                      className="h-[98px] w-5 shrink-0 rounded-md border-2 border-white/90 bg-white/95"
                      style={{
                        boxShadow: `0 0 0 2px ${TRIM_HANDLE_BLUE}, 0 3px 14px rgba(0,0,0,0.48)`,
                      }}
                      aria-hidden
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>
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
