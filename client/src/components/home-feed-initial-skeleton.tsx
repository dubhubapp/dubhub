import { DubHubSkeletonBar, dubhubSkeletonGlassShellClass } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Softer top scrim — reads on `bg-background` rather than a pure-black stage. */
const feedTopOverlayGradient =
  "pointer-events-none absolute inset-x-0 top-0 z-10 h-[max(7rem,calc(4.25rem+env(safe-area-inset-top,0px)))] bg-gradient-to-b from-black/20 via-black/6 to-transparent";

/**
 * Dark feed-stage wash — suggests the Home video panel without a flat black void.
 * Fades into the app shell (`bg-background`) toward the bottom.
 */
const feedStageWashClass =
  "pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/55 via-[#0c1020]/45 to-background";

/** Matches `post-genre-tag` / status pill footprint in `video-card.tsx`. */
const metaPillClass = "h-[1.375rem] rounded ring-1 ring-white/10";

/** Page shell while the sorted Home feed has no cached posts yet (cold initial load). */
export function HomeFeedInitialSkeleton() {
  return (
    <div
      className="flex-1 relative bg-background overflow-hidden"
      aria-busy="true"
      aria-label="Loading feed"
      data-testid="home-feed-initial-skeleton"
    >
      <div className={feedTopOverlayGradient} aria-hidden />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 pl-[max(0.625rem,env(safe-area-inset-left,0px))] pr-[max(0.625rem,env(safe-area-inset-right,0px))] pt-[max(0.5rem,calc(env(safe-area-inset-top,0px)+0.375rem))] sm:pl-[max(1rem,env(safe-area-inset-left,0px))] sm:pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pt-[max(0.625rem,calc(env(safe-area-inset-top,0px)+0.5rem))]">
        <div className="flex w-full min-w-0 justify-center">
          <div
            className={cn(
              dubhubSkeletonGlassShellClass,
              "flex h-9 min-h-9 w-[min(100%,11.5rem)] max-w-[min(100%,11.5rem)] items-center gap-2 rounded-full border-white/15 bg-black/20 px-3 sm:max-w-[min(46vw,12.75rem)]",
            )}
            aria-hidden
          >
            <DubHubSkeletonBar tone="teal" className="h-5 w-5 shrink-0 rounded-full opacity-80" />
            <DubHubSkeletonBar tone="faint" className="h-3.5 min-w-0 flex-1 max-w-[5.5rem]" />
            <DubHubSkeletonBar tone="faint" className="h-3 w-3 shrink-0 rounded-sm opacity-70" />
          </div>
        </div>
      </div>

      <div className="relative h-full min-h-0 w-full">
        <div className={feedStageWashClass} aria-hidden />

        <div
          className="absolute bottom-[clamp(calc(4.5rem+env(safe-area-inset-bottom,0px)),14lvh,7rem)] right-[max(0.5rem,env(safe-area-inset-right,0px))] z-30 flex w-[var(--video-feed-rail-width)] flex-col items-center gap-4"
          aria-hidden
        >
          {(["like", "comment", "share", "mute"] as const).map((slot) => (
            <div key={slot} className="flex w-full flex-col items-center gap-1">
              <DubHubSkeletonBar tone="faint" className="h-10 w-10 rounded-full sm:h-11 sm:w-11" />
              <DubHubSkeletonBar tone="faint" className="h-2 w-7 rounded opacity-80" />
            </div>
          ))}
        </div>

        {/*
          Bottom metadata — padding/structure aligned with Home `VideoCard` overlay
          (`py-5 pt-12 sm:py-6 sm:pt-14`, flex-col gap-2, pills row).
        */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-20",
            "bg-gradient-to-t from-background from-30% via-background/65 to-transparent",
            "py-5 pt-12 pl-3 pr-[calc(var(--video-feed-rail-width)+0.65rem)] sm:py-6 sm:pt-14 sm:pl-4",
          )}
        >
          <div className="flex flex-col gap-2 overflow-visible">
            <div className="overflow-x-visible py-0.5 pl-0.5 pr-1">
              <div className="flex min-w-0 items-center gap-3">
                <DubHubSkeletonBar tone="faint" className="h-10 w-10 shrink-0 rounded-full" />
                <DubHubSkeletonBar tone="mid" className="h-3.5 w-28 max-w-[42%] opacity-90" />
              </div>

              <div className="mt-2 space-y-2">
                <DubHubSkeletonBar tone="mid" className="h-3.5 w-full max-w-[14rem] opacity-90" />
                <DubHubSkeletonBar tone="faint" className="h-3 w-full max-w-[11rem]" />
              </div>
            </div>

            <div className="shrink-0 overflow-visible px-0.5 py-3 pl-0.5 pr-1 sm:py-3.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                <DubHubSkeletonBar tone="teal" className={cn(metaPillClass, "w-[4.25rem] opacity-80")} />
                <DubHubSkeletonBar tone="faint" className="h-1 w-1 shrink-0 rounded-full opacity-50" aria-hidden />
                <DubHubSkeletonBar tone="mid" className={cn(metaPillClass, "w-[3.5rem] opacity-85")} />
                <DubHubSkeletonBar tone="faint" className="h-8 w-[4.5rem] rounded-md opacity-70" />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <DubHubSkeletonBar tone="faint" className="h-3 w-3 shrink-0 rounded-sm opacity-70" />
                <DubHubSkeletonBar tone="faint" className="h-3 w-16 max-w-[38%] rounded opacity-80" />
                <DubHubSkeletonBar tone="faint" className="h-3 w-3 shrink-0 rounded-sm opacity-60" />
                <DubHubSkeletonBar tone="faint" className="h-3 w-14 max-w-[32%] rounded opacity-75" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
