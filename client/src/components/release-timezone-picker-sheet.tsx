import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { playInteractionLightThrottled } from "@/lib/haptic";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";
import {
  formatTimezonePickerSecondary,
  formatUtcOffsetForRelease,
} from "@/lib/release-timezone-label";
import {
  filterReleaseTimezoneOptions,
  findReleaseTimezoneOption,
  formatReleaseTimezoneLocation,
  type ReleaseTimezoneOption,
} from "@/lib/release-timezone-options";

type ReleaseTimezonePickerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string | null;
  releaseDateYmd: string;
  timeLocalHhmm?: string;
  onSelect: (iana: string) => void;
};

export type ReleaseTimezonePickerPanelProps = {
  value: string | null;
  releaseDateYmd: string;
  timeLocalHhmm?: string;
  onSelect: (iana: string) => void;
  /** When true, keyboard-aware scroll is active (parent sheet open). */
  active?: boolean;
  className?: string;
  onQueryChange?: (query: string) => void;
};

/** Timezone list body — reusable inside the standalone sheet or a parent schedule sheet panel. */
export function ReleaseTimezonePickerPanel({
  value,
  releaseDateYmd,
  timeLocalHhmm = "12:00",
  onSelect,
  active = true,
  className,
}: ReleaseTimezonePickerPanelProps) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  useIosKeyboardAwareScroll({
    enabled: active,
    scrollContainerRef: listRef,
  });

  useEffect(() => {
    if (!active) setQuery("");
  }, [active]);

  const options = useMemo(
    () =>
      filterReleaseTimezoneOptions({
        query,
        releaseDateYmd,
        timeLocalHhmm,
        formatOffset: formatUtcOffsetForRelease,
      }),
    [query, releaseDateYmd, timeLocalHhmm],
  );
  const selected = findReleaseTimezoneOption(value);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="shrink-0 px-4 py-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search city, country, or timezone"
          className="h-10 bg-black/40"
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="search"
        />
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {options.length === 0 ? (
          <p className="px-3 py-8 text-sm text-muted-foreground">
            No matching timezones.
          </p>
        ) : (
          options.map((option) => (
            <TimezoneRow
              key={option.id}
              option={option}
              releaseDateYmd={releaseDateYmd}
              timeLocalHhmm={timeLocalHhmm}
              selected={value === option.id}
              onSelect={() => {
                playInteractionLightThrottled();
                onSelect(option.id);
                setQuery("");
              }}
            />
          ))
        )}
        {selected && !options.some((o) => o.id === selected.id) ? (
          <TimezoneRow
            option={selected}
            releaseDateYmd={releaseDateYmd}
            timeLocalHhmm={timeLocalHhmm}
            selected
            onSelect={() => {
              playInteractionLightThrottled();
              onSelect(selected.id);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function ReleaseTimezonePickerSheet({
  open,
  onOpenChange,
  value,
  releaseDateYmd,
  timeLocalHhmm = "12:00",
  onSelect,
}: ReleaseTimezonePickerSheetProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const { isNativeIos, keyboardHeight, keyboardOpen, prefersReducedMotion } =
    useIosKeyboardAwareScroll({
      enabled: open,
      scrollContainerRef: shellRef,
    });

  const keyboardLiftPx = isNativeIos && keyboardOpen ? keyboardHeight : 0;
  const sheetMaxHeight = keyboardLiftPx
    ? `min(85vh, calc(100dvh - ${keyboardLiftPx}px - env(safe-area-inset-top, 0px) - 0.5rem))`
    : "min(85vh, 100dvh)";
  const sheetMinHeight = keyboardLiftPx
    ? `min(52vh, calc(100dvh - ${keyboardLiftPx}px - env(safe-area-inset-top, 0px) - 0.5rem))`
    : "min(52vh, 85vh)";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent
        side="bottom"
        showClose
        className={cn(
          "flex flex-col gap-0 overflow-hidden rounded-t-2xl border-white/10 bg-zinc-950 p-0",
        )}
        style={{
          bottom: keyboardLiftPx > 0 ? keyboardLiftPx : 0,
          maxHeight: sheetMaxHeight,
          minHeight: sheetMinHeight,
          transition:
            isNativeIos && !prefersReducedMotion
              ? "bottom 280ms ease-out, max-height 280ms ease-out, min-height 280ms ease-out"
              : undefined,
          paddingBottom:
            keyboardLiftPx > 0
              ? "0.5rem"
              : "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <SheetHeader className="shrink-0 border-b border-white/10 px-4 py-3 pr-12 text-left">
          <SheetTitle className="text-base">Timezone</SheetTitle>
          <p className="text-xs text-muted-foreground leading-snug">
            Choose the timezone the release will go live in.
          </p>
        </SheetHeader>

        <div ref={shellRef} className="flex min-h-0 flex-1 flex-col">
          <ReleaseTimezonePickerPanel
            value={value}
            releaseDateYmd={releaseDateYmd}
            timeLocalHhmm={timeLocalHhmm}
            active={open}
            onSelect={(iana) => {
              onSelect(iana);
              onOpenChange(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TimezoneRow(args: {
  option: ReleaseTimezoneOption;
  releaseDateYmd: string;
  timeLocalHhmm: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={args.onSelect}
      className={cn(
        "ios-press flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-3 text-left transition-colors",
        args.selected ? "bg-accent/20" : "hover:bg-white/5",
      )}
    >
      <span className="text-sm font-medium text-white">
        {formatReleaseTimezoneLocation(args.option)}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatTimezonePickerSecondary({
          timeZone: args.option.id,
          releaseDateYmd: args.releaseDateYmd || "2026-06-15",
          timeLocalHhmm: args.timeLocalHhmm,
          conceptLabel: args.option.label,
        })}
      </span>
    </button>
  );
}
