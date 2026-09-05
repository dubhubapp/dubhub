/**
 * Home sorted-feed end-of-list composition — dice CTA + quiet atmosphere.
 * Idle spin reuses RandomDiceButton's dice-spin path (no automatic feedback).
 */

import { useEffect, useRef, useState } from "react";
import { RandomDiceButton } from "@/components/random-dice-button";
import {
  HOME_FEED_END_ATMOSPHERE_CLASS,
  HOME_FEED_END_BODY,
  HOME_FEED_END_BODY_CLASS,
  HOME_FEED_END_CONTENT_CLASS,
  HOME_FEED_END_DICE_ARIA_LABEL,
  HOME_FEED_END_DICE_BUTTON_CLASS,
  HOME_FEED_END_DICE_HALO_CLASS,
  HOME_FEED_END_DICE_HALO_STYLE,
  HOME_FEED_END_DICE_SPIN_MS,
  HOME_FEED_END_IDLE_SPIN_INITIAL_MS,
  HOME_FEED_END_IDLE_SPIN_INTERVAL_MS,
  HOME_FEED_END_SLIDE_CLASS,
  HOME_FEED_END_TITLE,
  HOME_FEED_END_TITLE_CLASS,
  prefersReducedMotion,
  shouldScheduleHomeFeedEndIdleSpin,
} from "@/lib/home-feed-end-presentation";

type HomeFeedEndStateProps = {
  onRandomPress: () => void;
};

export function HomeFeedEndState({ onRandomPress }: HomeFeedEndStateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [endStateInView, setEndStateInView] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const [userTriggeredRandom, setUserTriggeredRandom] = useState(false);
  const [idleSpinKey, setIdleSpinKey] = useState(0);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setEndStateInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setEndStateInView(Boolean(entry?.isIntersecting && (entry.intersectionRatio ?? 0) >= 0.45));
      },
      { threshold: [0, 0.45, 0.7, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      setDocumentVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    if (
      !shouldScheduleHomeFeedEndIdleSpin({
        reducedMotion: prefersReducedMotion(),
        documentVisible,
        endStateInView,
        userTriggeredRandom,
      })
    ) {
      return clearTimer;
    }

    const armIdleSpin = (delayMs: number) => {
      clearTimer();
      timer = setTimeout(() => {
        if (cancelled) return;
        setIdleSpinKey((n) => n + 1);
        timer = setTimeout(() => {
          if (cancelled) return;
          armIdleSpin(HOME_FEED_END_IDLE_SPIN_INTERVAL_MS);
        }, HOME_FEED_END_DICE_SPIN_MS);
      }, delayMs);
    };

    armIdleSpin(HOME_FEED_END_IDLE_SPIN_INITIAL_MS);

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [documentVisible, endStateInView, userTriggeredRandom]);

  const handlePress = () => {
    setUserTriggeredRandom(true);
    onRandomPress();
  };

  return (
    <div
      ref={rootRef}
      data-post-id="home-feed-end-card"
      data-home-feed-end-state
      className={HOME_FEED_END_SLIDE_CLASS}
    >
      <div className={HOME_FEED_END_ATMOSPHERE_CLASS} aria-hidden />
      <div className={HOME_FEED_END_CONTENT_CLASS}>
        <div className="relative mb-1 flex items-center justify-center">
          <span className={HOME_FEED_END_DICE_HALO_CLASS} style={HOME_FEED_END_DICE_HALO_STYLE} aria-hidden />
          <RandomDiceButton
            active
            accentGlow="none"
            idleSpinKey={idleSpinKey}
            onPress={handlePress}
            className={HOME_FEED_END_DICE_BUTTON_CLASS}
            iconWrapClassName="!size-6"
            iconClassName="!h-full !w-full !text-white"
            aria-label={HOME_FEED_END_DICE_ARIA_LABEL}
          />
        </div>
        <h3 className={HOME_FEED_END_TITLE_CLASS}>{HOME_FEED_END_TITLE}</h3>
        <p className={HOME_FEED_END_BODY_CLASS}>{HOME_FEED_END_BODY}</p>
      </div>
    </div>
  );
}
