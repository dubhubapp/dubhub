import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Lock,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { playInteractionLightThrottled } from "@/lib/haptic";
import { preventEnterFormSubmit } from "@/lib/form-search-input";
import { PlatformIcon } from "@/components/PlatformIcon";
import { ReleaseFormDrawer } from "@/components/release-form-drawer";
import { ReleaseSheetExpandable } from "@/components/release-sheet-expandable";
import { getPlatformLabel } from "@/lib/platforms";
import {
  LINK_CAPACITY_UPGRADE_HINT,
} from "@/lib/release-link-limit";
import {
  type LinkTypeOption,
  linkTypeOptionAriaLabel,
  selectedLinkTypeDisplay,
} from "@/lib/release-link-type-options";
import { RELEASE_LINKS_VISIBILITY_COPY } from "@/lib/release-links-visibility-copy";
import { triggerSelectionHaptic } from "@/lib/verified-artist-tools-haptics";
import {
  type CanonicalLinkPurpose,
  purposeOptionLabel,
} from "@shared/release-link-platforms";
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
  APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS,
  APP_MATERIAL_OVERLAY_TITLE_CLASS,
} from "@/lib/app-material";
import {
  RELEASE_UPGRADE_HINT_CHEVRON_CLASS,
  RELEASE_UPGRADE_HINT_CLASS,
} from "@/lib/release-upgrade-hint";

/**
 * Opaque lifted list row while dragging.
 * Do not use overlay/dialog surface (22px radius) — keep row-like rounded-md.
 * Fill matches dark overlay tone: rgba(20, 26, 48) ≈ rgb(20,26,48).
 */
const LINK_ROW_DRAG_SURFACE_CLASS =
  "relative z-10 rounded-md bg-[rgb(20,26,48)] shadow-md ring-1 ring-white/10";
export type ReleaseDraftLink = {
  id?: string;
  platform: string;
  url: string;
  linkType?: string | null;
  sortOrder?: number | null;
};

type SheetView = "list" | "add" | "edit";
type Panel = "form" | "platform" | "linkType";

type ReleaseLinksSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftLinks: ReleaseDraftLink[];
  onRemoveLink: (link: ReleaseDraftLink) => void;
  onStartEditLink: (link: ReleaseDraftLink) => void;
  onClearLinkForm: () => void;
  /** Reorder draft locally; parent persists when IDs allow. */
  onReorderLinks: (next: ReleaseDraftLink[]) => void | Promise<void>;
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
  /** Return false when gated (e.g. VAT) so sheet stays on ADD. */
  onAddLink: () => boolean;
  /** Return false when gated (e.g. VAT) so sheet stays on EDIT. */
  onUpdateLink: () => boolean;
  limitNotice: {
    show: boolean;
    prominence: "hidden" | "quiet" | "prominent";
    title: string;
    body: string | null;
    showUpgrade: boolean;
    onUpgradeClick: () => void;
  };
};

/** Material blue focus ring (canonical #0a83ff — not legacy teal accent). */
const SHEET_CONTROL_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83ff]/45 focus-visible:ring-inset focus-visible:ring-offset-0";

function draftPurpose(link: ReleaseDraftLink): CanonicalLinkPurpose {
  const raw = String(link.linkType ?? "").trim().toLowerCase();
  if (raw === "presave" || raw === "download" || raw === "listen") return raw;
  return "listen";
}

function linkRowId(link: ReleaseDraftLink): string {
  return link.id ? `id:${link.id}` : `draft:${link.platform.toLowerCase()}`;
}

function SortableLinkRow({
  link,
  onEdit,
}: {
  link: ReleaseDraftLink;
  onEdit: () => void;
}) {
  const id = linkRowId(link);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const purpose = draftPurpose(link);
  const purposeLabel =
    purpose === "listen" && !link.linkType
      ? null
      : purposeOptionLabel(link.platform, purpose);

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex min-w-0 items-start gap-2 py-3",
        isDragging && LINK_ROW_DRAG_SURFACE_CLASS,
      )}
      data-testid={`release-link-row-${link.platform}`}
    >
      <button
        type="button"
        className="ios-press flex min-w-0 flex-1 items-start gap-3 text-left"
        data-testid={`release-link-row-edit-${link.platform}`}
        aria-label={`Edit ${getPlatformLabel(link.platform)} link`}
        onClick={onEdit}
      >
        <PlatformIcon
          platform={link.platform}
          className="h-5 w-5 object-contain"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {getPlatformLabel(link.platform)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {purposeLabel ? `${purposeLabel} · ` : null}
            {link.url.replace(/^https?:\/\//i, "")}
          </p>
        </div>
      </button>
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="flex h-9 w-9 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
        aria-label={`Reorder ${getPlatformLabel(link.platform)} link`}
        data-testid={`release-link-row-grip-${link.platform}`}
        data-vaul-no-drag
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}

/**
 * Links management drawer — LIST / ADD / EDIT views.
 * Platform + Link Type use in-drawer panels (no nested Dialog/Dropdown portals).
 */
export function ReleaseLinksSheet({
  open,
  onOpenChange,
  draftLinks,
  onRemoveLink,
  onStartEditLink,
  onClearLinkForm,
  onReorderLinks,
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
  onUpdateLink,
  limitNotice,
}: ReleaseLinksSheetProps) {
  const [view, setView] = useState<SheetView>("list");
  const [panel, setPanel] = useState<Panel>("form");
  const [editingLink, setEditingLink] = useState<ReleaseDraftLink | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const lastOverIndexRef = useRef<number | null>(null);

  const isFormView = view === "add" || view === "edit";
  const formEnabled = view === "edit" || (view === "add" && canAddDraftLink);
  const showLinkType = Boolean(linkPlatform && linkTypeOptions.length > 0);

  const resetToList = () => {
    setView("list");
    setPanel("form");
    setEditingLink(null);
    setDeleteConfirmOpen(false);
    onClearLinkForm();
  };

  useEffect(() => {
    if (!open) {
      setView("list");
      setPanel("form");
      setEditingLink(null);
      setDeleteConfirmOpen(false);
      setActiveDragId(null);
      lastOverIndexRef.current = null;
      return;
    }
    // Restore ADD/EDIT after VAT suspend when form still filled.
    if (!linkPlatform) return;
    const existing = draftLinks.find(
      (l) => l.platform.toLowerCase() === linkPlatform.toLowerCase(),
    );
    if (existing) {
      setEditingLink(existing);
      setView("edit");
      setPanel("form");
    } else {
      setEditingLink(null);
      setView("add");
      setPanel("form");
    }
  }, [open]);

  const selectedPlatform = platformChoices.find((o) => o.value === linkPlatform);
  const platformLabel =
    selectedPlatform?.label ??
    (linkPlatform ? getPlatformLabel(linkPlatform) : "");

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

  const showCapacityNearAdd =
    view === "add" && panel === "form" && limitNotice.show && Boolean(limitNotice.title);

  const sortableIds = draftLinks.map(linkRowId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const beginAdd = () => {
    if (!canAddDraftLink) return;
    playInteractionLightThrottled();
    onClearLinkForm();
    setEditingLink(null);
    setPanel("form");
    setView("add");
  };

  const beginEdit = (link: ReleaseDraftLink) => {
    playInteractionLightThrottled();
    setEditingLink(link);
    setPanel("form");
    setView("edit");
    onStartEditLink(link);
  };

  const handlePrimaryAction = () => {
    if (view === "edit") {
      if (onUpdateLink()) {
        resetToList();
      }
      return;
    }
    if (view === "add") {
      if (onAddLink()) {
        resetToList();
      }
    }
  };

  const confirmDelete = () => {
    if (!editingLink) return;
    playInteractionLightThrottled();
    onRemoveLink(editingLink);
    setDeleteConfirmOpen(false);
    resetToList();
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
    lastOverIndexRef.current = sortableIds.indexOf(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id != null ? String(event.over.id) : null;
    if (!overId) return;
    const nextIndex = sortableIds.indexOf(overId);
    if (nextIndex < 0) return;
    if (
      lastOverIndexRef.current != null &&
      lastOverIndexRef.current !== nextIndex
    ) {
      playInteractionLightThrottled();
    }
    lastOverIndexRef.current = nextIndex;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    lastOverIndexRef.current = null;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const next = arrayMove(draftLinks, oldIndex, newIndex).map((link, index) => ({
      ...link,
      sortOrder: index,
    }));
    void onReorderLinks(next);
  };

  const title =
    panel === "platform"
      ? "Platform"
      : panel === "linkType"
        ? "Link type"
        : view === "add"
          ? "Add link"
          : view === "edit"
            ? "Edit link"
            : "Links";

  const headerStart =
    panel !== "form" ? (
      <button
        type="button"
        className={APP_MATERIAL_BACK_BUTTON_CLASS}
        aria-label="Back"
        data-testid="release-links-sheet-back"
        onClick={() => {
          playInteractionLightThrottled();
          setPanel("form");
        }}
      >
        <ChevronLeft
          className={APP_MATERIAL_BACK_ICON_CLASS}
          strokeWidth={2}
          aria-hidden
        />
      </button>
    ) : isFormView ? (
      <button
        type="button"
        className={APP_MATERIAL_BACK_BUTTON_CLASS}
        aria-label={view === "edit" ? "Cancel edit" : "Back to links"}
        data-testid={
          view === "edit"
            ? "release-links-sheet-cancel-edit"
            : "release-links-sheet-cancel-add"
        }
        onClick={() => {
          playInteractionLightThrottled();
          resetToList();
        }}
      >
        <ChevronLeft
          className={APP_MATERIAL_BACK_ICON_CLASS}
          strokeWidth={2}
          aria-hidden
        />
      </button>
    ) : null;

  return (
    <>
      <ReleaseFormDrawer
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setView("list");
            setPanel("form");
            setEditingLink(null);
          }
          onOpenChange(next);
        }}
        title={title}
        description={
          view === "list" && panel === "form" ? (
            <p
              className="text-xs leading-snug text-muted-foreground"
              data-testid="release-links-visibility-copy"
            >
              {RELEASE_LINKS_VISIBILITY_COPY}
            </p>
          ) : undefined
        }
        contentTestId="release-links-sheet"
        doneTestId="release-links-sheet-done"
        showDone={view === "list" && panel === "form"}
        disableBodyScroll={panel !== "form"}
        headerStart={headerStart}
      >
        {view === "list" && panel === "form" ? (
          <div className="space-y-4 min-w-0 w-full max-w-full pt-2 pb-8">
            {draftLinks.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={() => {
                  setActiveDragId(null);
                  lastOverIndexRef.current = null;
                }}
              >
                <SortableContext
                  items={sortableIds}
                  strategy={verticalListSortingStrategy}
                >
                  <ul
                    className="space-y-0 divide-y divide-white/10 min-w-0"
                    data-testid="release-links-list"
                    data-dragging={activeDragId ? "true" : "false"}
                  >
                    {draftLinks.map((l) => (
                      <SortableLinkRow
                        key={linkRowId(l)}
                        link={l}
                        onEdit={() => beginEdit(l)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                No links yet. Add streaming and music links below.
              </p>
            )}

            <button
              type="button"
              disabled={!canAddDraftLink}
              data-testid="release-links-enter-add"
              onClick={beginAdd}
              className={cn(
                "ios-press flex w-full items-center justify-center gap-1.5 rounded-md py-2.5 text-sm font-medium text-[#0a83ff]",
                SHEET_CONTROL_FOCUS,
                !canAddDraftLink && "cursor-not-allowed opacity-50",
              )}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add link
            </button>

            {limitNotice.show && Boolean(limitNotice.title) ? (
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
                      className={RELEASE_UPGRADE_HINT_CLASS}
                      onClick={() => {
                        playInteractionLightThrottled();
                        limitNotice.onUpgradeClick();
                      }}
                      data-testid="release-link-upgrade"
                      aria-label={`${LINK_CAPACITY_UPGRADE_HINT}. Opens upgrade options.`}
                    >
                      <span>{LINK_CAPACITY_UPGRADE_HINT}</span>
                      <ChevronRight
                        className={RELEASE_UPGRADE_HINT_CHEVRON_CLASS}
                        aria-hidden
                      />
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {isFormView && panel === "form" ? (
          <div className="space-y-4 min-w-0 w-full max-w-full pt-2 pb-8">
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] text-muted-foreground">Platform</p>
              {view === "edit" ? (
                <div
                  className="flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-muted-foreground"
                  data-testid="release-link-platform-locked"
                  aria-disabled="true"
                >
                  {linkPlatform ? (
                    <>
                      <PlatformIcon platform={linkPlatform} />
                      <span className="min-w-0 flex-1 truncate">{platformLabel}</span>
                    </>
                  ) : (
                    <span className="truncate">Platform</span>
                  )}
                </div>
              ) : (
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
              )}
            </div>

            <ReleaseSheetExpandable open={showLinkType}>
              <div className="min-w-0 space-y-1 pt-1">
                <p className="text-[10px] text-muted-foreground" id="release-link-type-label">
                  Link type
                </p>
                <button
                  type="button"
                  disabled={!formEnabled}
                  data-testid="release-link-type"
                  aria-labelledby="release-link-type-label"
                  aria-label={`Link type, ${selectedType.label}`}
                  onClick={() => {
                    if (!formEnabled) return;
                    playInteractionLightThrottled();
                    setPanel("linkType");
                  }}
                  className={cn(
                    "ios-press flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-black/35 px-3 text-left text-sm",
                    SHEET_CONTROL_FOCUS,
                    !formEnabled && "cursor-not-allowed opacity-50",
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
                disabled={!formEnabled}
                data-testid="release-link-url"
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
                      className={RELEASE_UPGRADE_HINT_CLASS}
                      onClick={() => {
                        playInteractionLightThrottled();
                        limitNotice.onUpgradeClick();
                      }}
                      data-testid="release-link-upgrade"
                      aria-label={`${LINK_CAPACITY_UPGRADE_HINT}. Opens upgrade options.`}
                    >
                      <span>{LINK_CAPACITY_UPGRADE_HINT}</span>
                      <ChevronRight className={RELEASE_UPGRADE_HINT_CHEVRON_CLASS} aria-hidden />
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}

            <Button
              type="button"
              className={cn("w-full", SHEET_CONTROL_FOCUS)}
              onClick={handlePrimaryAction}
              disabled={
                !linkPlatform ||
                !linkUrl.trim() ||
                (view === "add" ? !canAddDraftLink : false)
              }
              data-testid={
                view === "edit" ? "release-link-save-changes" : "release-link-add"
              }
            >
              {view === "edit" ? (
                "Save Changes"
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add link
                </>
              )}
            </Button>

            {view === "edit" ? (
              <div className="pt-6">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                  data-testid="release-link-delete"
                  onClick={() => {
                    playInteractionLightThrottled();
                    setDeleteConfirmOpen(true);
                  }}
                >
                  Delete link
                </Button>
              </div>
            ) : null}
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
                      <Check className="h-4 w-4 shrink-0 text-[#0a83ff]" aria-hidden />
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

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className={APP_MATERIAL_OVERLAY_TITLE_CLASS}>
              Delete link?
            </AlertDialogTitle>
            <AlertDialogDescription className={APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS}>
              {editingLink
                ? `Remove the ${getPlatformLabel(editingLink.platform)} link from this release.`
                : "Remove this link from the release."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS}
              data-testid="release-link-delete-confirm"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
