import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type HomeWhileOnHomeHandler = (() => void) | null;

type HomeFeedInteractionContextValue = {
  registerHomeWhileOnHomeHandler: (handler: HomeWhileOnHomeHandler) => void;
  invokeHomeWhileOnHome: () => void;
  isFeedMuted: boolean;
  toggleFeedMute: () => void;
  setFeedMuted: (muted: boolean) => void;
};

const HomeFeedInteractionContext = createContext<HomeFeedInteractionContextValue | null>(null);

export function HomeFeedInteractionProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<HomeWhileOnHomeHandler>(null);
  const [isFeedMuted, setIsFeedMuted] = useState(true);

  const registerHomeWhileOnHomeHandler = useCallback((handler: HomeWhileOnHomeHandler) => {
    handlerRef.current = handler;
  }, []);

  const invokeHomeWhileOnHome = useCallback(() => {
    handlerRef.current?.();
  }, []);

  const toggleFeedMute = useCallback(() => {
    setIsFeedMuted((m) => !m);
  }, []);

  const setFeedMuted = useCallback((muted: boolean) => {
    setIsFeedMuted(muted);
  }, []);

  const value = useMemo(
    () => ({
      registerHomeWhileOnHomeHandler,
      invokeHomeWhileOnHome,
      isFeedMuted,
      toggleFeedMute,
      setFeedMuted,
    }),
    [registerHomeWhileOnHomeHandler, invokeHomeWhileOnHome, isFeedMuted, toggleFeedMute, setFeedMuted],
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
