import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SubmitClipContextValue = {
  isSubmitClipOpen: boolean;
  openSubmitClip: () => void;
  closeSubmitClip: () => void;
};

const SubmitClipContext = createContext<SubmitClipContextValue | null>(null);

export function SubmitClipProvider({ children }: { children: ReactNode }) {
  const [isSubmitClipOpen, setSubmitClipOpen] = useState(false);

  const openSubmitClip = useCallback(() => setSubmitClipOpen(true), []);
  const closeSubmitClip = useCallback(() => setSubmitClipOpen(false), []);

  const value = useMemo(
    () => ({
      isSubmitClipOpen,
      openSubmitClip,
      closeSubmitClip,
    }),
    [isSubmitClipOpen, openSubmitClip, closeSubmitClip],
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
