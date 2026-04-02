import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

type HomeWhileOnHomeHandler = (() => void) | null;

type HomeFeedInteractionContextValue = {
  registerHomeWhileOnHomeHandler: (handler: HomeWhileOnHomeHandler) => void;
  invokeHomeWhileOnHome: () => void;
};

const HomeFeedInteractionContext = createContext<HomeFeedInteractionContextValue | null>(null);

export function HomeFeedInteractionProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<HomeWhileOnHomeHandler>(null);

  const registerHomeWhileOnHomeHandler = useCallback((handler: HomeWhileOnHomeHandler) => {
    handlerRef.current = handler;
  }, []);

  const invokeHomeWhileOnHome = useCallback(() => {
    handlerRef.current?.();
  }, []);

  const value = useMemo(
    () => ({ registerHomeWhileOnHomeHandler, invokeHomeWhileOnHome }),
    [registerHomeWhileOnHomeHandler, invokeHomeWhileOnHome],
  );

  return (
    <HomeFeedInteractionContext.Provider value={value}>{children}</HomeFeedInteractionContext.Provider>
  );
}

export function useHomeFeedInteraction(): HomeFeedInteractionContextValue {
  const ctx = useContext(HomeFeedInteractionContext);
  if (!ctx) {
    throw new Error("useHomeFeedInteraction must be used within HomeFeedInteractionProvider");
  }
  return ctx;
}
