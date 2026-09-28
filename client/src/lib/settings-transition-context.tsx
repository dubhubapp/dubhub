import { createContext, useContext, type ReactNode } from "react";
import type { InteractiveSwipeGesture } from "@/lib/interactive-page-transitions";

export type SettingsLayerRole = "solo" | "underlay" | "foreground" | "retained";

export type SettingsTransitionContextValue = {
  role: SettingsLayerRole;
  gesture: InteractiveSwipeGesture | null;
  commitRef: { current: () => void };
  requestPop: () => void;
};

const SettingsTransitionContext = createContext<SettingsTransitionContextValue | null>(null);

export function SettingsTransitionProvider({
  value,
  children,
}: {
  value: SettingsTransitionContextValue;
  children: ReactNode;
}) {
  return (
    <SettingsTransitionContext.Provider value={value}>{children}</SettingsTransitionContext.Provider>
  );
}

export function useSettingsTransitionContext(): SettingsTransitionContextValue | null {
  return useContext(SettingsTransitionContext);
}

/**
 * Foreground allowlisted pages animate, then run `commit` once.
 * Every other caller gets `commit` immediately (flag off, solo, underlay).
 */
export function useSettingsInteractiveBack(commit: () => void): () => void {
  const ctx = useSettingsTransitionContext();
  if (ctx?.role === "foreground") {
    ctx.commitRef.current = commit;
    return ctx.requestPop;
  }
  return commit;
}
