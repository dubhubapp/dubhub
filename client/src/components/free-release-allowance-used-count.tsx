/**
 * Restrained digit tween for free-release allowance success (0→1 / 1→2).
 */

import { useEffect, useState } from "react";
import {
  FREE_RELEASE_ALLOWANCE_COUNT_ANIMATION_MS,
  resolveAllowanceCountDisplay,
  type FreeReleaseAllowanceSuccessUsed,
} from "@/lib/release-create-allowance-success";

type Props = {
  used: FreeReleaseAllowanceSuccessUsed;
  reducedMotion: boolean;
  className?: string;
};

export function FreeReleaseAllowanceUsedCount({
  used,
  reducedMotion,
  className,
}: Props) {
  const [display, setDisplay] = useState(() =>
    resolveAllowanceCountDisplay({ used, reducedMotion, progress: reducedMotion ? 1 : 0 }),
  );

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(resolveAllowanceCountDisplay({ used, reducedMotion: true }));
      return;
    }
    setDisplay(resolveAllowanceCountDisplay({ used, reducedMotion: false, progress: 0 }));
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(
        1,
        (now - start) / FREE_RELEASE_ALLOWANCE_COUNT_ANIMATION_MS,
      );
      setDisplay(
        resolveAllowanceCountDisplay({ used, reducedMotion: false, progress }),
      );
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [used, reducedMotion]);

  return (
    <span
      className={className}
      data-testid="release-allowance-used-count"
      aria-hidden
    >
      {display}
    </span>
  );
}
