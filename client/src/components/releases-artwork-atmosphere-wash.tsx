import { useEffect, useRef, useState } from "react";
import {
  RELEASE_TRACKER_ATMOSPHERE_BACKDROP_CLASS,
  RELEASE_TRACKER_ATMOSPHERE_BUFFER_CLASS,
  RELEASE_TRACKER_ATMOSPHERE_HOST_CLASS,
  RELEASE_TRACKER_ATMOSPHERE_READABILITY_CLASS,
  RELEASE_TRACKER_ATMOSPHERE_WASH_CLASS,
  TRACKER_ATMOSPHERE_DURATION_MS,
  trackerAtmosphereWashStyle,
} from "@/lib/release-tracker-atmosphere";
import type { AtmosphereRgb } from "@/lib/release-artwork-atmosphere";
import { cn } from "@/lib/utils";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sameRgb(a: AtmosphereRgb | null, b: AtmosphereRgb | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

type AtmosphereBuffer = {
  rgb: AtmosphereRgb;
  url: string | null;
};

function loadBackdrop(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    img.onload = () => {
      if (typeof img.decode === "function") {
        void img.decode().then(() => finish(true)).catch(() => finish(false));
        return;
      }
      finish(true);
    };
    img.onerror = () => finish(false);
    img.src = url;
    window.setTimeout(() => finish(true), 700);
  });
}

function AtmosphereBufferLayers({
  buffer,
  on,
  layer,
}: {
  buffer: AtmosphereBuffer;
  on: boolean;
  layer: "back" | "front";
}) {
  return (
    <div
      className={cn(
        RELEASE_TRACKER_ATMOSPHERE_BUFFER_CLASS,
        on ? "opacity-100" : "opacity-0",
      )}
      data-atmosphere-layer={layer}
    >
      {buffer.url ? (
        <img
          src={buffer.url}
          alt=""
          aria-hidden
          draggable={false}
          className={RELEASE_TRACKER_ATMOSPHERE_BACKDROP_CLASS}
        />
      ) : null}
      <div
        className={RELEASE_TRACKER_ATMOSPHERE_WASH_CLASS}
        style={trackerAtmosphereWashStyle(buffer.rgb)}
      />
    </div>
  );
}

/**
 * Persistent hybrid atmosphere: blurred artwork + dominant wash.
 * Front buffer fades 0→1 over an opaque back buffer (no navy dip).
 * Host is always mounted and extends to the bottom of the page.
 */
export function ReleasesArtworkAtmosphereWash({
  rgb,
  artworkUrl,
  active,
}: {
  rgb: AtmosphereRgb | null;
  artworkUrl: string | null;
  active: boolean;
}) {
  const generationRef = useRef(0);
  const backRef = useRef<AtmosphereBuffer | null>(null);
  const frontRef = useRef<AtmosphereBuffer | null>(null);
  const [back, setBack] = useState<AtmosphereBuffer | null>(null);
  const [backOn, setBackOn] = useState(false);
  const [front, setFront] = useState<AtmosphereBuffer | null>(null);
  const [frontOn, setFrontOn] = useState(false);

  useEffect(() => {
    const generation = ++generationRef.current;
    const reducedMotion = prefersReducedMotion();
    const next: AtmosphereBuffer | null =
      active && rgb ? { rgb, url: artworkUrl } : null;

    const commit = (committed: AtmosphereBuffer | null) => {
      if (generation !== generationRef.current) return;
      backRef.current = committed;
      frontRef.current = null;
      setBack(committed);
      setBackOn(!!committed);
      setFront(null);
      setFrontOn(false);
    };

    if (reducedMotion) {
      commit(next);
      return;
    }

    if (!next) {
      frontRef.current = null;
      setFront(null);
      setFrontOn(false);
      setBackOn(false);
      const timer = window.setTimeout(() => commit(null), TRACKER_ATMOSPHERE_DURATION_MS);
      return () => window.clearTimeout(timer);
    }

    const sameTarget =
      backRef.current &&
      sameRgb(backRef.current.rgb, next.rgb) &&
      backRef.current.url === next.url &&
      !frontRef.current;
    if (sameTarget) {
      setBackOn(true);
      return;
    }

    let cancelled = false;
    let frame1 = 0;
    let frame2 = 0;
    let commitTimer = 0;
    const run = async () => {
      let prepared = next;
      if (next.url) {
        const decoded = await loadBackdrop(next.url);
        prepared = decoded ? next : { rgb: next.rgb, url: null };
      }
      if (cancelled || generation !== generationRef.current) return;
      frontRef.current = prepared;
      setFront(prepared);
      setFrontOn(false);
      frame1 = window.requestAnimationFrame(() => {
        frame2 = window.requestAnimationFrame(() => {
          if (cancelled || generation !== generationRef.current) return;
          setFrontOn(true);
        });
      });
      commitTimer = window.setTimeout(
        () => commit(prepared),
        TRACKER_ATMOSPHERE_DURATION_MS + 48,
      );
    };
    void run();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
      if (commitTimer) window.clearTimeout(commitTimer);
    };
  }, [active, artworkUrl, rgb]);

  const readabilityOn = backOn || frontOn;

  return (
    <div
      className={RELEASE_TRACKER_ATMOSPHERE_HOST_CLASS}
      aria-hidden
      data-testid="releases-artwork-atmosphere-wash"
      data-atmosphere-crossfade="double-buffer"
    >
      {back ? <AtmosphereBufferLayers buffer={back} on={backOn} layer="back" /> : null}
      {front ? <AtmosphereBufferLayers buffer={front} on={frontOn} layer="front" /> : null}
      <div
        className={cn(
          RELEASE_TRACKER_ATMOSPHERE_READABILITY_CLASS,
          readabilityOn ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
