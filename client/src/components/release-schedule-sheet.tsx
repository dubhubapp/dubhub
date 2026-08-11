import { useEffect, useState } from "react";
import { playInteractionLightThrottled } from "@/lib/haptic";
import { RELEASE_TIMING_MODE_EXACT } from "@shared/release-timing";
import type { ReleaseTimingDraft } from "@/lib/release-timing-draft";
import { ReleaseStatusFields } from "@/components/release-status-fields";
import { ReleaseTimezonePickerPanel } from "@/components/release-timezone-picker-sheet";
import { ReleaseFormDrawer } from "@/components/release-form-drawer";

type ReleaseScheduleSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comingSoon: boolean;
  onComingSoonChange: (comingSoon: boolean) => void;
  releaseDate: string;
  onReleaseDateChange: (date: string) => void;
  timingDraft: ReleaseTimingDraft;
  onTimingDraftChange: (draft: ReleaseTimingDraft) => void;
};

type Panel = "schedule" | "timezone";

/**
 * Schedule controls in a bottom drawer.
 * Timezone uses an in-drawer panel swap (not nested drawers).
 */
export function ReleaseScheduleSheet({
  open,
  onOpenChange,
  comingSoon,
  onComingSoonChange,
  releaseDate,
  onReleaseDateChange,
  timingDraft,
  onTimingDraftChange,
}: ReleaseScheduleSheetProps) {
  const [panel, setPanel] = useState<Panel>("schedule");

  useEffect(() => {
    if (!open) setPanel("schedule");
  }, [open]);

  return (
    <ReleaseFormDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) setPanel("schedule");
        onOpenChange(next);
      }}
      title={panel === "schedule" ? "Release schedule" : "Timezone"}
      contentTestId="release-schedule-sheet"
      doneTestId="release-schedule-sheet-done"
      stableHeight={false}
      minHeightClass="min-h-[48vh]"
      showDone={panel === "schedule"}
      disableBodyScroll={panel === "timezone"}
      headerStart={
        panel === "timezone" ? (
          <button
            type="button"
            className="ios-press text-sm text-accent"
            onClick={() => {
              playInteractionLightThrottled();
              setPanel("schedule");
            }}
            data-testid="release-schedule-timezone-back"
          >
            Back
          </button>
        ) : null
      }
      description={
        panel === "timezone"
          ? "Choose the timezone the release will go live in."
          : undefined
      }
    >
      {panel === "schedule" ? (
        <div className="pt-2 pb-2">
          <ReleaseStatusFields
            comingSoon={comingSoon}
            onComingSoonChange={onComingSoonChange}
            releaseDate={releaseDate}
            onReleaseDateChange={onReleaseDateChange}
            timingDraft={timingDraft}
            onTimingDraftChange={onTimingDraftChange}
            onRequestTimezonePicker={() => setPanel("timezone")}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <ReleaseTimezonePickerPanel
            value={timingDraft.timezone}
            releaseDateYmd={releaseDate}
            timeLocalHhmm={timingDraft.timeLocal || "12:00"}
            active={open && panel === "timezone"}
            onSelect={(iana) => {
              onTimingDraftChange({
                ...timingDraft,
                mode: RELEASE_TIMING_MODE_EXACT,
                timezone: iana,
              });
              setPanel("schedule");
            }}
          />
        </div>
      )}
    </ReleaseFormDrawer>
  );
}
