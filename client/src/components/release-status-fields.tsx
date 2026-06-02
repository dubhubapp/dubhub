import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ReleaseStatusFieldsProps = {
  comingSoon: boolean;
  onComingSoonChange: (comingSoon: boolean) => void;
  releaseDate: string;
  onReleaseDateChange: (date: string) => void;
  /** Disables status toggle (e.g. live release on edit). */
  statusDisabled?: boolean;
  /** Extra disable on date input (e.g. live release on edit). */
  dateFieldDisabled?: boolean;
};

const tabGroupClass =
  "flex min-w-0 w-full max-w-full gap-1 p-1.5 rounded-xl border border-white/10 bg-black/35 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";
const tabButtonBaseClass =
  "ios-press min-w-0 flex-1 rounded-lg border border-white/10 py-2 px-2 text-sm font-medium transition-all";
const activeTabClass =
  "text-accent-foreground font-semibold border-accent/70 bg-accent shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]";
const inactiveTabClass = "bg-black/20 text-white/70 hover:text-white hover:bg-black/30";

export function ReleaseStatusFields({
  comingSoon,
  onComingSoonChange,
  releaseDate,
  onReleaseDateChange,
  statusDisabled = false,
  dateFieldDisabled = false,
}: ReleaseStatusFieldsProps) {
  return (
    <div className="space-y-3 min-w-0 w-full max-w-full">
      <div>
        <p className="text-sm font-medium block mb-2">Release status</p>
        <div role="radiogroup" aria-label="Release status" className={tabGroupClass}>
          <button
            type="button"
            role="radio"
            aria-checked={!comingSoon}
            disabled={statusDisabled}
            onClick={() => onComingSoonChange(false)}
            className={cn(
              tabButtonBaseClass,
              !comingSoon ? activeTabClass : inactiveTabClass
            )}
          >
            Scheduled release
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={comingSoon}
            disabled={statusDisabled}
            onClick={() => onComingSoonChange(true)}
            className={cn(
              tabButtonBaseClass,
              comingSoon ? activeTabClass : inactiveTabClass
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
        <div className="min-w-0 w-full max-w-full">
          <label
            htmlFor="release-date-input"
            className={cn(
              "text-sm font-medium block mb-1",
              dateFieldDisabled && "text-muted-foreground"
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
                dateFieldDisabled && "cursor-not-allowed opacity-50"
              )}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
