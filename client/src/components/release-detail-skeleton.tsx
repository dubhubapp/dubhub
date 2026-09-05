import { ChevronLeft } from "lucide-react";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import { ReleaseActivitySection } from "@/components/release-activity-section";
import { SwipeBackPage } from "@/components/swipe-back-page";
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
  APP_MATERIAL_RELEASE_DETAIL_CANVAS_CLASS,
  APP_MATERIAL_RELEASE_DETAIL_TOP_CLASS,
} from "@/lib/app-material";
import {
  RELEASE_ATMOSPHERE_BRAND_RGB,
  releaseAtmosphereCssVarValue,
} from "@/lib/release-artwork-atmosphere";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

type ReleaseDetailSkeletonProps = {
  onBack: () => void;
};

/** Page shell while release detail payload is loading (cold start, no placeholder). */
export function ReleaseDetailSkeleton({ onBack }: ReleaseDetailSkeletonProps) {
  return (
    <SwipeBackPage
      enabled
      onBack={onBack}
      className={cn(
        "flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-none pb-[clamp(0.75rem,2.5vw,1rem)]",
        APP_MATERIAL_RELEASE_DETAIL_CANVAS_CLASS,
      )}
      style={
        {
          ["--release-atmosphere-rgb"]: releaseAtmosphereCssVarValue(
            RELEASE_ATMOSPHERE_BRAND_RGB,
          ),
        } as CSSProperties
      }
      data-atmosphere-ready="true"
      data-atmosphere-instant="true"
      data-release-atmosphere="brand"
      data-testid="release-detail-skeleton"
    >
      <div
        className={cn(APP_MATERIAL_RELEASE_DETAIL_TOP_CLASS, "px-4 pb-4 max-w-md mx-auto")}
        aria-busy="true"
        aria-label="Loading release"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className={APP_MATERIAL_BACK_BUTTON_CLASS}
            data-testid="release-detail-skeleton-back"
          >
            <ChevronLeft className={APP_MATERIAL_BACK_ICON_CLASS} strokeWidth={2} aria-hidden />
          </button>
          <div className="h-9 w-9 shrink-0" aria-hidden />
        </div>

        <div className="mb-6 flex min-w-0 gap-4 overflow-hidden">
          <DubHubSkeletonBar tone="teal" className="h-32 w-32 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2 overflow-hidden pt-0.5">
            <DubHubSkeletonBar tone="faint" className="h-3 w-24 max-w-full" />
            <DubHubSkeletonBar tone="default" className="h-5 w-full max-w-[12rem]" />
            <DubHubSkeletonBar tone="mid" className="h-3.5 w-28 max-w-full" />
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <DubHubSkeletonBar tone="faint" className="h-[1.375rem] w-16 rounded-full" />
              <DubHubSkeletonBar tone="faint" className="h-[1.375rem] w-24 rounded" />
            </div>
            <DubHubSkeletonBar tone="teal" className="mt-1 h-3 w-36 max-w-full" />
          </div>
        </div>

        <div className="mb-6">
          <DubHubSkeletonBar tone="faint" className="mb-2 h-4 w-12" />
          <div className="flex min-w-0 flex-wrap gap-2">
            <DubHubSkeletonBar tone="mid" className="h-9 w-28 rounded-lg" />
            <DubHubSkeletonBar tone="mid" className="h-9 w-32 rounded-lg" />
          </div>
        </div>

        <ReleaseActivitySection
          isLoading
          firstPostLabel={null}
          latestPostLabel={null}
          announcedDuration={null}
          releasedDuration={null}
        />
      </div>
    </SwipeBackPage>
  );
}
