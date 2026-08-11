import { Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReleaseFormHeroSchedule } from "@/lib/release-form-hero-schedule";

export type ReleaseFormHeroProps = {
  artworkUrl: string | null;
  uploading?: boolean;
  onArtworkPress: () => void;
  title: string;
  titleEditable: boolean;
  onTitlePress?: () => void;
  schedule: ReleaseFormHeroSchedule;
  onSchedulePress?: () => void;
};

export function ReleaseFormHero({
  artworkUrl,
  uploading = false,
  onArtworkPress,
  title,
  titleEditable,
  onTitlePress,
  schedule,
  onSchedulePress,
}: ReleaseFormHeroProps) {
  const hasTitle = title.trim().length > 0;
  const titlePlaceholder = "Add release title *";

  return (
    <div
      className="flex flex-col items-center gap-5 text-center"
      data-testid="release-form-hero"
    >
      <button
        type="button"
        onClick={onArtworkPress}
        disabled={uploading}
        className={cn(
          "ios-press relative aspect-square w-[min(72vw,17.5rem)] max-w-full overflow-hidden rounded-2xl",
          "border border-white/10 bg-black/40 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          uploading && "opacity-70",
        )}
        aria-label={artworkUrl ? "Change artwork" : "Add artwork"}
        data-testid="release-form-hero-artwork"
      >
        {artworkUrl ? (
          <>
            <img
              src={artworkUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            <span
              className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-md"
              aria-hidden
            >
              <Pencil className="h-3.5 w-3.5" />
            </span>
          </>
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-white/25 bg-white/5">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium text-white/80">
              {uploading ? "Uploading…" : "Add artwork"}
            </span>
          </span>
        )}
      </button>

      {titleEditable ? (
        <button
          type="button"
          onClick={onTitlePress}
          className={cn(
            "ios-press max-w-full px-2",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md",
          )}
          aria-label={hasTitle ? "Edit release title" : "Add release title"}
          data-testid="release-form-hero-title"
        >
          <span
            className={cn(
              "block text-2xl font-semibold leading-tight tracking-tight",
              hasTitle ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {hasTitle ? title.trim() : titlePlaceholder}
          </span>
        </button>
      ) : (
        <p
          className="max-w-full px-2 text-2xl font-semibold leading-tight tracking-tight text-foreground"
          data-testid="release-form-hero-title"
        >
          {title.trim() || "Untitled release"}
        </p>
      )}

      {schedule.readOnly || !onSchedulePress ? (
        <div
          className="space-y-1 px-2"
          data-testid="release-form-hero-schedule"
        >
          <HeroScheduleLines schedule={schedule} />
        </div>
      ) : (
        <button
          type="button"
          onClick={onSchedulePress}
          className={cn(
            "ios-press space-y-1 rounded-md px-2",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
          aria-label="Edit release schedule"
          data-testid="release-form-hero-schedule"
        >
          <HeroScheduleLines schedule={schedule} />
        </button>
      )}
    </div>
  );
}

function HeroScheduleLines({ schedule }: { schedule: ReleaseFormHeroSchedule }) {
  const showStatusFirst = schedule.readOnly;
  const showStatusFooter =
    !showStatusFirst && Boolean(schedule.statusLabel.trim());
  return (
    <>
      {showStatusFirst && schedule.statusLabel ? (
        <p className="text-sm font-medium text-foreground">
          {schedule.statusLabel}
        </p>
      ) : null}
      {schedule.primaryLine ? (
        <p className="text-sm text-muted-foreground leading-snug">
          {schedule.primaryLine}
        </p>
      ) : null}
      {schedule.secondaryLine ? (
        <p className="text-xs text-muted-foreground leading-snug">
          {schedule.secondaryLine}
        </p>
      ) : null}
      {showStatusFooter ? (
        <p className="pt-0.5 text-sm font-medium text-foreground">
          {schedule.statusLabel}
        </p>
      ) : null}
    </>
  );
}
