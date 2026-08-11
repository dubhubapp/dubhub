import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { playInteractionLightThrottled } from "@/lib/haptic";
import {
  RELEASE_TIMING_MODE_EXACT,
  type ReleaseTimingMode,
} from "@shared/release-timing";
import type { ReleaseTimingDraft } from "@/lib/release-timing-draft";
import {
  defaultMidnightDraft,
  enableExactDraft,
} from "@/lib/release-timing-draft";
import { formatUtcOffsetForRelease } from "@/lib/release-timezone-label";
import { findReleaseTimezoneOption } from "@/lib/release-timezone-options";
import { ReleaseTimezonePickerSheet } from "@/components/release-timezone-picker-sheet";
import { ReleaseSheetExpandable } from "@/components/release-sheet-expandable";

export type ReleaseStatusFieldsProps = {
  comingSoon: boolean;
  onComingSoonChange: (comingSoon: boolean) => void;
  releaseDate: string;
  onReleaseDateChange: (date: string) => void;
  timingDraft: ReleaseTimingDraft;
  onTimingDraftChange: (draft: ReleaseTimingDraft) => void;
  /** Disables status toggle (e.g. live release on edit). */
  statusDisabled?: boolean;
  /** Extra disable on date/time inputs (e.g. live release on edit). */
  dateFieldDisabled?: boolean;
  /**
   * When provided, timezone opens via parent (e.g. schedule sheet panel swap)
   * instead of nesting a second Dialog-based Sheet.
   */
  onRequestTimezonePicker?: () => void;
};

/** Independent option tiles — no shared outer shell. */
const optionRowClass =
  "grid w-full min-w-0 max-w-full grid-cols-[repeat(2,minmax(0,1fr))] gap-2";
const optionButtonBaseClass =
  "ios-press box-border min-h-10 min-w-0 w-full max-w-full rounded-lg border px-2 py-2.5 text-sm font-medium leading-snug transition-colors break-words text-center";
/** Border-only selected chrome — outer glow was clipped by sheet overflow and looked past the inset. */
const activeOptionClass =
  "text-accent-foreground font-semibold border-accent bg-accent";
const inactiveOptionClass =
  "border-white/10 bg-black/25 text-white/70 hover:text-white hover:bg-black/35";

export function ReleaseStatusFields({
  comingSoon,
  onComingSoonChange,
  releaseDate,
  onReleaseDateChange,
  timingDraft,
  onTimingDraftChange,
  statusDisabled = false,
  dateFieldDisabled = false,
  onRequestTimezonePicker,
}: ReleaseStatusFieldsProps) {
  const [timezoneSheetOpen, setTimezoneSheetOpen] = useState(false);
  const deferTimezone = typeof onRequestTimezonePicker === "function";
  const timingMode: ReleaseTimingMode = timingDraft.mode;
  const exact = !comingSoon && timingMode === RELEASE_TIMING_MODE_EXACT;
  const zoneOption = findReleaseTimezoneOption(timingDraft.timezone);
  const zoneButtonLabel = timingDraft.timezone
    ? `${zoneOption?.city || timingDraft.timezone} · ${formatUtcOffsetForRelease({
        timeZone: timingDraft.timezone,
        releaseDateYmd: releaseDate || "2026-06-15",
        timeLocalHhmm: timingDraft.timeLocal || "12:00",
      })}`
    : null;

  return (
    <div className="space-y-3 min-w-0 w-full max-w-full overflow-x-hidden">
      <div className="min-w-0 w-full max-w-full">
        <p className="text-sm font-medium block mb-2">Release status</p>
        <div
          role="radiogroup"
          aria-label="Release status"
          className={optionRowClass}
        >
          <button
            type="button"
            role="radio"
            aria-checked={!comingSoon}
            disabled={statusDisabled}
            onClick={() => {
              playInteractionLightThrottled();
              onComingSoonChange(false);
            }}
            className={cn(
              optionButtonBaseClass,
              !comingSoon ? activeOptionClass : inactiveOptionClass,
            )}
          >
            Scheduled release
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={comingSoon}
            disabled={statusDisabled}
            onClick={() => {
              playInteractionLightThrottled();
              onComingSoonChange(true);
              onTimingDraftChange(defaultMidnightDraft());
            }}
            className={cn(
              optionButtonBaseClass,
              comingSoon ? activeOptionClass : inactiveOptionClass,
            )}
          >
            Coming soon
          </button>
        </div>
        {comingSoon ? (
          <p className="text-xs text-muted-foreground mt-2 leading-snug">
            Use this if the release date is not confirmed yet. You can add the date later.
          </p>
        ) : null}
      </div>

      {!comingSoon ? (
        <>
          <div className="min-w-0 w-full max-w-full">
            <label
              htmlFor="release-date-input"
              className={cn(
                "text-sm font-medium block mb-1",
                dateFieldDisabled && "text-muted-foreground",
              )}
            >
              Release date *
            </label>
            <div className="relative isolate flex min-w-0 w-full max-w-full overflow-hidden rounded-md [contain:inline-size]">
              <Input
                id="release-date-input"
                type="date"
                value={releaseDate}
                onChange={(e) => onReleaseDateChange(e.target.value)}
                disabled={dateFieldDisabled}
                required
                className={cn(
                  "dubhub-date-input h-10 min-w-0 w-full max-w-full flex-1 basis-0 items-center justify-start px-3 py-0 pr-12 text-left transition-[border-color,box-shadow,background-color] [color-scheme:dark] md:text-sm",
                  "focus-visible:ring-offset-0",
                  dateFieldDisabled && "cursor-not-allowed opacity-50",
                )}
              />
            </div>
          </div>

          <div className="min-w-0 w-full max-w-full">
            <p className="text-sm font-medium block mb-2">Release time</p>
            <div
              role="radiogroup"
              aria-label="Release time"
              className={optionRowClass}
            >
              <button
                type="button"
                role="radio"
                aria-checked={!exact}
                disabled={dateFieldDisabled}
                onClick={() => {
                  playInteractionLightThrottled();
                  onTimingDraftChange(defaultMidnightDraft());
                }}
                className={cn(
                  optionButtonBaseClass,
                  !exact ? activeOptionClass : inactiveOptionClass,
                )}
              >
                Midnight
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={exact}
                disabled={dateFieldDisabled}
                onClick={() => {
                  playInteractionLightThrottled();
                  onTimingDraftChange(enableExactDraft(timingDraft));
                }}
                className={cn(
                  optionButtonBaseClass,
                  exact ? activeOptionClass : inactiveOptionClass,
                )}
              >
                Set a specific time
              </button>
            </div>
            <ReleaseSheetExpandable open={!exact}>
              <p className="text-xs text-muted-foreground mt-2 leading-snug">
                Most releases go live at midnight.
              </p>
            </ReleaseSheetExpandable>
            <ReleaseSheetExpandable open={exact}>
              <p className="text-xs text-muted-foreground mt-2 leading-snug">
                Choose the timezone the release will go live in.
              </p>
            </ReleaseSheetExpandable>
          </div>

          <ReleaseSheetExpandable open={exact}>
            <div className="space-y-3 min-w-0 w-full max-w-full pt-3">
              <div className="min-w-0 w-full max-w-full">
                <label
                  htmlFor="release-time-local-input"
                  className={cn(
                    "text-sm font-medium block mb-1",
                    dateFieldDisabled && "text-muted-foreground",
                  )}
                >
                  Time *
                </label>
                <div className="relative isolate flex min-w-0 w-full max-w-full overflow-hidden rounded-md [contain:inline-size]">
                  <Input
                    id="release-time-local-input"
                    type="time"
                    value={timingDraft.timeLocal}
                    onChange={(e) =>
                      onTimingDraftChange({
                        ...timingDraft,
                        mode: RELEASE_TIMING_MODE_EXACT,
                        timeLocal: e.target.value,
                      })
                    }
                    disabled={dateFieldDisabled}
                    required={exact}
                    className={cn(
                      "dubhub-time-input h-10 min-w-0 w-full max-w-full flex-1 basis-0 items-center justify-center px-3 py-0 text-center transition-[border-color,box-shadow,background-color] [color-scheme:dark] md:text-sm",
                      "focus-visible:ring-offset-0",
                      dateFieldDisabled && "cursor-not-allowed opacity-50",
                    )}
                  />
                </div>
              </div>

              <div className="min-w-0 w-full max-w-full">
                <p
                  className={cn(
                    "text-sm font-medium block mb-1",
                    dateFieldDisabled && "text-muted-foreground",
                  )}
                >
                  Timezone *
                </p>
                <button
                  type="button"
                  disabled={dateFieldDisabled}
                  onClick={() => {
                    playInteractionLightThrottled();
                    if (deferTimezone) {
                      onRequestTimezonePicker?.();
                    } else {
                      setTimezoneSheetOpen(true);
                    }
                  }}
                  className={cn(
                    "ios-press flex h-10 w-full min-w-0 max-w-full items-center justify-between rounded-md border border-white/10 bg-black/35 px-3 text-left text-sm",
                    dateFieldDisabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      !zoneButtonLabel && "text-muted-foreground",
                    )}
                  >
                    {zoneButtonLabel || "Choose timezone"}
                  </span>
                </button>
              </div>
            </div>
          </ReleaseSheetExpandable>
        </>
      ) : null}

      {!deferTimezone ? (
        <ReleaseTimezonePickerSheet
          open={timezoneSheetOpen}
          onOpenChange={setTimezoneSheetOpen}
          value={timingDraft.timezone}
          releaseDateYmd={releaseDate}
          timeLocalHhmm={timingDraft.timeLocal || "12:00"}
          onSelect={(iana) =>
            onTimingDraftChange({
              ...timingDraft,
              mode: RELEASE_TIMING_MODE_EXACT,
              timezone: iana,
            })
          }
        />
      ) : null}
    </div>
  );
}
