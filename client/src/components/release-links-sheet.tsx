import { useEffect, useState } from "react";
import { Check, ChevronDown, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { playInteractionLightThrottled } from "@/lib/haptic";
import { preventEnterFormSubmit } from "@/lib/form-search-input";
import { PlatformIcon } from "@/components/PlatformIcon";
import { ReleaseFormDrawer } from "@/components/release-form-drawer";
import { ReleaseSheetExpandable } from "@/components/release-sheet-expandable";
import { getPlatformLabel, sortLinksByPlatform } from "@/lib/platforms";
import {
  LINK_CAPACITY_UPGRADE_HINT,
  LISTENING_LINK_FUTURE_GUIDANCE,
} from "@/lib/release-link-limit";
import {
  type LinkTypeOption,
  linkTypeOptionAriaLabel,
  selectedLinkTypeDisplay,
} from "@/lib/release-link-type-options";
import { triggerSelectionHaptic } from "@/lib/verified-artist-tools-haptics";
import {
  type CanonicalLinkPurpose,
  purposeOptionLabel,
} from "@shared/release-link-platforms";

export type ReleaseDraftLink = {
  id?: string;
  platform: string;
  url: string;
  linkType?: string | null;
};

type ReleaseLinksSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftLinks: ReleaseDraftLink[];
  onRemoveLink: (link: ReleaseDraftLink, sortedIndex: number) => void;
  linkPlatform: string;
  onLinkPlatformChange: (platform: string) => void;
  linkPurpose: CanonicalLinkPurpose;
  onLinkPurposeChange: (purpose: CanonicalLinkPurpose) => void;
  onLockedPurposeSelect: (purpose: CanonicalLinkPurpose) => void;
  linkUrl: string;
  onLinkUrlChange: (url: string) => void;
  platformChoices: { value: string; label: string }[];
  linkTypeOptions: LinkTypeOption[];
  canAddDraftLink: boolean;
  onAddLink: () => void;
  limitNotice: {
    show: boolean;
    prominence: "hidden" | "quiet" | "prominent";
    title: string;
    body: string | null;
    showUpgrade: boolean;
    onUpgradeClick: () => void;
  };
  showFutureListenGuidance: boolean;
};

type Panel = "form" | "platform" | "linkType";

/** Ring stays inside the control — no blue/offset pixels outside the sheet inset. */
const SHEET_CONTROL_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:ring-offset-0";

/**
 * Links management drawer.
 * Platform + Link Type use in-drawer panels (no nested Dialog/Dropdown portals)
 * so picks never dismiss the drawer or hide under Done.
 */
export function ReleaseLinksSheet({
  open,
  onOpenChange,
  draftLinks,
  onRemoveLink,
  linkPlatform,
  onLinkPlatformChange,
  linkPurpose,
  onLinkPurposeChange,
  onLockedPurposeSelect,
  linkUrl,
  onLinkUrlChange,
  platformChoices,
  linkTypeOptions,
  canAddDraftLink,
  onAddLink,
  limitNotice,
  showFutureListenGuidance,
}: ReleaseLinksSheetProps) {
  const [panel, setPanel] = useState<Panel>("form");
  const showLinkType = Boolean(linkPlatform && linkTypeOptions.length > 0);

  useEffect(() => {
    if (!open) setPanel("form");
  }, [open]);

  const selectedPlatform = platformChoices.find((o) => o.value === linkPlatform);

  const safePurpose = linkTypeOptions.some((o) => o.purpose === linkPurpose && !o.locked)
    ? linkPurpose
    : linkTypeOptions.some((o) => o.purpose === linkPurpose)
      ? linkPurpose
      : (linkTypeOptions.find((o) => !o.locked)?.purpose ?? linkPurpose);
  const displayPurpose =
    linkTypeOptions.find((o) => o.purpose === safePurpose)?.locked &&
    linkTypeOptions.some((o) => !o.locked)
      ? (linkTypeOptions.find((o) => !o.locked)?.purpose ?? safePurpose)
      : safePurpose;
  const selectedType = selectedLinkTypeDisplay({
    value: displayPurpose,
    options: linkTypeOptions,
  });

  const sorted = sortLinksByPlatform(draftLinks);

  const showCapacityNearAdd =
    panel === "form" && limitNotice.show && Boolean(limitNotice.title);

  return (
    <ReleaseFormDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) setPanel("form");
        onOpenChange(next);
      }}
      title={
        panel === "form"
          ? "Links"
          : panel === "platform"
            ? "Platform"
            : "Link type"
      }
      contentTestId="release-links-sheet"
      doneTestId="release-links-sheet-done"
      showDone={panel === "form"}
      disableBodyScroll={panel !== "form"}
      headerStart={
        panel !== "form" ? (
          <button
            type="button"
            className="ios-press text-sm text-accent"
            onClick={() => {
              playInteractionLightThrottled();
              setPanel("form");
            }}
          >
            Back
          </button>
        ) : null
      }
    >
      {panel === "form" ? (
        <div className="space-y-4 min-w-0 w-full max-w-full pt-2 pb-8">
          {showFutureListenGuidance ? (
            <p
              className="text-xs text-muted-foreground leading-snug"
              data-testid="release-listening-link-future-guidance"
              role="status"
            >
              <span className="font-medium text-foreground">
                {LISTENING_LINK_FUTURE_GUIDANCE.title}
              </span>
              {" · "}
              {LISTENING_LINK_FUTURE_GUIDANCE.body}
            </p>
          ) : null}

          {sorted.length > 0 ? (
            <ul className="space-y-0 divide-y divide-white/10 min-w-0">
              {sorted.map((l, idx) => (
                <li
                  key={l.id ?? `${l.platform}-${l.url}-${idx}`}
                  className="flex min-w-0 items-start gap-3 py-3"
                >
                  <PlatformIcon platform={l.platform} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {getPlatformLabel(l.platform)}
                      {l.linkType ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          (
                          {purposeOptionLabel(
                            l.platform,
                            (l.linkType as CanonicalLinkPurpose) || "listen",
                          )}
                          )
                        </span>
                      ) : null}
                    </p>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 block truncate text-xs text-primary"
                    >
                      {l.url.replace(/^https?:\/\//i, "")}
                    </a>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                    aria-label={`Remove ${getPlatformLabel(l.platform)} link`}
                    onClick={() => onRemoveLink(l, idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              No links yet. Add streaming and music links below.
            </p>
          )}

          <div className="space-y-3 min-w-0 border-t border-white/10 pt-4">
            <p className="text-sm font-medium">Add link</p>

            <div className="min-w-0 space-y-1">
              <p className="text-[10px] text-muted-foreground">Platform</p>
              <button
                type="button"
                disabled={!canAddDraftLink}
                data-testid="release-link-platform-picker"
                onClick={() => {
                  if (!canAddDraftLink) return;
                  playInteractionLightThrottled();
                  setPanel("platform");
                }}
                className={cn(
                  "ios-press flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/35 px-3 text-left text-sm",
                  SHEET_CONTROL_FOCUS,
                  !canAddDraftLink && "cursor-not-allowed opacity-50",
                )}
              >
                {selectedPlatform ? (
                  <>
                    <PlatformIcon platform={selectedPlatform.value} />
                    <span className="min-w-0 flex-1 truncate">
                      {selectedPlatform.label}
                    </span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    Choose platform
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </div>

            <ReleaseSheetExpandable open={showLinkType}>
              <div className="min-w-0 space-y-1 pt-1">
                <p className="text-[10px] text-muted-foreground" id="release-link-type-label">
                  Link type
                </p>
                <button
                  type="button"
                  disabled={!canAddDraftLink}
                  data-testid="release-link-type"
                  aria-labelledby="release-link-type-label"
                  aria-label={`Link type, ${selectedType.label}`}
                  onClick={() => {
                    if (!canAddDraftLink) return;
                    playInteractionLightThrottled();
                    setPanel("linkType");
                  }}
                  className={cn(
                    "ios-press flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-black/35 px-3 text-left text-sm",
                    SHEET_CONTROL_FOCUS,
                    !canAddDraftLink && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="truncate">{selectedType.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {selectedType.showLock ? (
                      <Lock
                        className="h-3 w-3 text-muted-foreground"
                        aria-hidden
                        data-testid="release-link-type-selected-lock"
                      />
                    ) : null}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  </span>
                </button>
              </div>
            </ReleaseSheetExpandable>

            <div className="min-w-0 space-y-1">
              <p className="text-[10px] text-muted-foreground">URL</p>
              <Input
                placeholder="URL"
                value={linkUrl}
                onChange={(e) => onLinkUrlChange(e.target.value)}
                className={cn("min-w-0 w-full bg-black/40", SHEET_CONTROL_FOCUS)}
                onKeyDown={preventEnterFormSubmit}
                disabled={!canAddDraftLink}
              />
            </div>

            {showCapacityNearAdd ? (
              <p
                className={cn(
                  "text-xs leading-snug",
                  limitNotice.prominence === "prominent"
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
                data-testid="release-link-limit-notice"
                role="status"
              >
                <span data-testid="release-link-limit-title">
                  {limitNotice.title}
                </span>
                {limitNotice.showUpgrade ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="ios-press text-accent underline-offset-2 hover:underline"
                      onClick={() => {
                        playInteractionLightThrottled();
                        limitNotice.onUpgradeClick();
                      }}
                      data-testid="release-link-upgrade"
                      aria-label={`${LINK_CAPACITY_UPGRADE_HINT}. Opens upgrade options.`}
                    >
                      {LINK_CAPACITY_UPGRADE_HINT}
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}

            <Button
              type="button"
              className={cn("w-full", SHEET_CONTROL_FOCUS)}
              onClick={onAddLink}
              disabled={!linkPlatform || !linkUrl.trim() || !canAddDraftLink}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add link
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "platform" ? (
        <ul
          data-vaul-no-drag
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-white/10 px-4 py-1 pb-8"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {platformChoices.length === 0 ? (
            <li className="px-1 py-6 text-sm text-muted-foreground">
              No platforms left
            </li>
          ) : (
            platformChoices.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  className={cn(
                    "ios-press flex w-full items-center gap-3 px-1 py-3 text-left text-sm",
                    opt.value === linkPlatform && "bg-white/5",
                  )}
                  onClick={() => {
                    playInteractionLightThrottled();
                    onLinkPlatformChange(opt.value);
                    setPanel("form");
                  }}
                >
                  <PlatformIcon platform={opt.value} />
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {opt.value === linkPlatform ? (
                    <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {panel === "linkType" ? (
        <ul
          data-vaul-no-drag
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-white/10 px-4 py-1 pb-8"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {linkTypeOptions.map((opt) => {
            const isSelected = opt.purpose === displayPurpose && !opt.locked;
            return (
              <li key={opt.purpose}>
                <button
                  type="button"
                  data-testid={`release-link-type-option-${opt.purpose}`}
                  data-locked={opt.locked ? "true" : "false"}
                  aria-label={linkTypeOptionAriaLabel(opt)}
                  className={cn(
                    "ios-press flex w-full items-center gap-2 px-1 py-3 text-left text-sm",
                    opt.locked && "text-muted-foreground",
                    isSelected && "bg-white/5",
                  )}
                  onClick={() => {
                    if (opt.locked) {
                      triggerSelectionHaptic();
                      onLockedPurposeSelect(opt.purpose);
                      setPanel("form");
                      return;
                    }
                    playInteractionLightThrottled();
                    onLinkPurposeChange(opt.purpose);
                    setPanel("form");
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
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </ReleaseFormDrawer>
  );
}
