import { Check, ChevronDown, Lock } from "lucide-react";
import {
  type CanonicalLinkPurpose,
  purposeOptionLabel,
} from "@shared/release-link-platforms";
import {
  type LinkTypeOption,
  buildLinkTypeOptions,
  linkTypeOptionAriaLabel,
  selectedLinkTypeDisplay,
} from "@/lib/release-link-type-options";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { triggerSelectionHaptic } from "@/lib/verified-artist-tools-haptics";

export type { LinkTypeOption };
export { buildLinkTypeOptions };

type Props = {
  platform: string;
  value: CanonicalLinkPurpose;
  options: LinkTypeOption[];
  disabled?: boolean;
  onChange: (purpose: CanonicalLinkPurpose) => void;
  onLockedSelect: (purpose: CanonicalLinkPurpose) => void;
};

/**
 * Custom Link type menu: locked premium rows use a right-aligned Lucide lock.
 * Selecting a locked row opens Upgrade without mutating the draft selection.
 */
export function ReleaseLinkTypeSelect({
  platform,
  value,
  options,
  disabled,
  onChange,
  onLockedSelect,
}: Props) {
  const safeValue = options.some((o) => o.purpose === value && !o.locked)
    ? value
    : options.some((o) => o.purpose === value)
      ? value
      : (options.find((o) => !o.locked)?.purpose ?? value);

  // Free artists should never hold a locked purpose as the selected draft value.
  const displayValue =
    options.find((o) => o.purpose === safeValue)?.locked &&
    options.some((o) => !o.locked)
      ? (options.find((o) => !o.locked)?.purpose ?? safeValue)
      : safeValue;

  const selected = selectedLinkTypeDisplay({
    value: displayValue,
    options,
  });

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground" id="release-link-type-label">
        Link type
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          data-testid="release-link-type"
          aria-labelledby="release-link-type-label"
          aria-label={`Link type, ${selected.label}`}
          className={cn(
            "inline-flex h-9 min-w-[8.5rem] items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-sm outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <span className="truncate">{selected.label}</span>
          <span className="flex shrink-0 items-center gap-1">
            {selected.showLock ? (
              <Lock
                className="h-3 w-3 text-muted-foreground"
                aria-hidden
                data-testid="release-link-type-selected-lock"
              />
            ) : null}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
          onCloseAutoFocus={(e) => {
            // Keep focus return on the trigger (Radix default); avoid jumping the page.
            e.preventDefault();
            const trigger = document.querySelector<HTMLElement>(
              '[data-testid="release-link-type"]',
            );
            trigger?.focus();
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.purpose === displayValue && !opt.locked;
            const aria = linkTypeOptionAriaLabel(opt);
            return (
              <DropdownMenuItem
                key={opt.purpose}
                data-testid={`release-link-type-option-${opt.purpose}`}
                data-locked={opt.locked ? "true" : "false"}
                aria-label={aria}
                className={cn(
                  "flex cursor-pointer items-center gap-2 py-2 pl-2 pr-2",
                  opt.locked && "text-muted-foreground focus:text-muted-foreground",
                )}
                onSelect={() => {
                  if (opt.locked) {
                    // Light impact (app tap convention); paywall open must not add a second haptic.
                    triggerSelectionHaptic();
                    // Close menu (default) but do not change selection.
                    onLockedSelect(opt.purpose);
                    return;
                  }
                  onChange(opt.purpose);
                }}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="truncate">{opt.label}</span>
                </span>
                {opt.locked ? (
                  <Lock
                    className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                    data-testid="release-link-type-option-lock"
                  />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="sr-only">
        Link type for {purposeOptionLabel(platform, displayValue)}
      </span>
    </div>
  );
}
