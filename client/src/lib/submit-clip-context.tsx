import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { dubhubVideoDebugLog } from "@/lib/video-debug";

type SubmitClipContextValue = {
  isSubmitClipOpen: boolean;
  /** Bump this when opening the sheet so hidden file inputs remount (same file re-pick works on iOS). */
  fileInputRemountKey: number;
  nativePostArtifact: NativePostArtifact | null;
  openSubmitClip: () => void;
  closeSubmitClip: () => void;
  setNativePostArtifact: (artifact: NativePostArtifact) => void;
  clearNativePostArtifact: () => void;
};

export type NativePostArtifact = {
  nativeOutputUri: string;
  previewUri: string;
  thumbnailUri: string | null;
  mimeType: string;
  fileSize: number;
  durationMs: number;
  width: number;
  height: number;
  filename: string;
  /** Upload-ready file prepared once at Trim -> Next and reused on submit. */
  uploadFile: File | null;
};

const SubmitClipContext = createContext<SubmitClipContextValue | null>(null);

export function SubmitClipProvider({ children }: { children: ReactNode }) {
  const [isSubmitClipOpen, setSubmitClipOpen] = useState(false);
  const [fileInputRemountKey, setFileInputRemountKey] = useState(0);
  const [nativePostArtifact, setNativePostArtifactState] = useState<NativePostArtifact | null>(null);

  const openSubmitClip = useCallback(() => {
    dubhubVideoDebugLog("[DubHub][PostFlow][state]", "entering submit drawer");
    setFileInputRemountKey((k) => k + 1);
    setSubmitClipOpen(true);
  }, []);
  const closeSubmitClip = useCallback(() => {
    dubhubVideoDebugLog("[DubHub][PostFlow][state]", "closing submit drawer");
    setSubmitClipOpen(false);
  }, []);
  const setNativePostArtifact = useCallback((artifact: NativePostArtifact) => {
    setNativePostArtifactState(artifact);
    dubhubVideoDebugLog("[DubHub][NativePost]", "final-artifact-stored", {
      fileSize: artifact.fileSize,
      durationMs: artifact.durationMs,
      width: artifact.width,
      height: artifact.height,
      hasUploadFile: !!artifact.uploadFile,
    });
  }, []);
  const clearNativePostArtifact = useCallback(() => {
    setNativePostArtifactState(null);
    dubhubVideoDebugLog("[DubHub][NativePost]", "artifact-cleared");
  }, []);

  const value = useMemo(
    () => ({
      isSubmitClipOpen,
      fileInputRemountKey,
      nativePostArtifact,
      openSubmitClip,
      closeSubmitClip,
      setNativePostArtifact,
      clearNativePostArtifact,
    }),
    [
      isSubmitClipOpen,
      fileInputRemountKey,
      nativePostArtifact,
      openSubmitClip,
      closeSubmitClip,
      setNativePostArtifact,
      clearNativePostArtifact,
    ],
  );

  return (
    <SubmitClipContext.Provider value={value}>{children}</SubmitClipContext.Provider>
  );
}

export function useSubmitClip() {
  const ctx = useContext(SubmitClipContext);
  if (!ctx) {
    throw new Error("useSubmitClip must be used within SubmitClipProvider");
  }
  return ctx;
}
