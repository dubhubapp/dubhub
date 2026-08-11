import { useEffect, useRef } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { playInteractionLightThrottled } from "@/lib/haptic";
import { SEARCH_INPUT_KEYBOARD_PROPS } from "@/lib/form-search-input";
import { getCollaborationStatusDisplay } from "@/lib/collaboration-status-display";
import { filterCollaboratorSearchResults } from "@/lib/release-collaborator-search-results";
import {
  COLLABORATOR_SEARCH_AUTOFOCUS_MS,
  shouldAutofocusCollaboratorSearch,
} from "@/lib/release-collaborator-autofocus";
import { ReleaseFormDrawer } from "@/components/release-form-drawer";
import { VerifiedArtistName } from "@/components/verified-artist-name";

export type ReleaseExistingCollaborator = {
  id: string;
  artistId?: string;
  username: string;
  status: string;
};

export type ReleaseStagedCollaborator = {
  id: string;
  username: string;
};

type ReleaseCollaboratorsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCollaborators: ReleaseExistingCollaborator[];
  stagedCollaborators: ReleaseStagedCollaborator[];
  invitesLocked: boolean;
  collabSearch: string;
  onCollabSearchChange: (value: string) => void;
  searchResults: { id: string; username: string }[];
  onStageCollaborator: (artist: { id: string; username: string }) => void;
  onUnstageCollaborator: (id: string) => void;
  onRemoveExisting?: (collaborator: ReleaseExistingCollaborator) => void;
  canRemoveExisting?: (collaborator: ReleaseExistingCollaborator) => boolean;
  ownerArtistId?: string | null;
  currentUserId?: string | null;
  searchDisabled?: boolean;
};

const SHEET_CONTROL_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:ring-offset-0";

/**
 * Collaborators drawer: stable viewport height; search results scroll inside
 * and fill space down to the keyboard/Done boundary.
 */
export function ReleaseCollaboratorsSheet({
  open,
  onOpenChange,
  existingCollaborators,
  stagedCollaborators,
  invitesLocked,
  collabSearch,
  onCollabSearchChange,
  searchResults,
  onStageCollaborator,
  onUnstageCollaborator,
  onRemoveExisting,
  canRemoveExisting,
  ownerArtistId,
  currentUserId,
  searchDisabled = false,
}: ReleaseCollaboratorsSheetProps) {
  const excludeIds = new Set<string>([
    ...(ownerArtistId ? [ownerArtistId] : []),
    ...(currentUserId ? [currentUserId] : []),
    ...(existingCollaborators
      .map((c) => c.artistId)
      .filter(Boolean) as string[]),
    ...stagedCollaborators.map((c) => c.id),
  ]);

  const filteredResults = filterCollaboratorSearchResults({
    searchResults,
    excludeIds,
    stagedCount: stagedCollaborators.length,
  });
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const autofocus = shouldAutofocusCollaboratorSearch({
    sheetOpen: open,
    invitesLocked,
    searchDisabled,
  });

  useEffect(() => {
    if (!autofocus) return;
    const id = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, COLLABORATOR_SEARCH_AUTOFOCUS_MS);
    return () => window.clearTimeout(id);
  }, [autofocus]);

  const hasExistingOrStaged =
    existingCollaborators.length > 0 || stagedCollaborators.length > 0;
  const searchActive = Boolean(collabSearch.trim());

  return (
    <ReleaseFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Collaborators"
      contentTestId="release-collaborators-sheet"
      doneTestId="release-collaborators-sheet-done"
      disableBodyScroll
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pt-2">
        {hasExistingOrStaged || invitesLocked ? (
          <div
            className={cn(
              "min-h-0 space-y-3 overflow-y-auto overscroll-contain",
              invitesLocked ? "flex-1" : "max-h-[30%] shrink-0",
            )}
            data-vaul-no-drag
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {existingCollaborators.length > 0 ? (
              <ul className="divide-y divide-white/10">
                {existingCollaborators.map((c) => {
                  const collabDisplay = getCollaborationStatusDisplay(c.status);
                  const canRemove = canRemoveExisting?.(c) ?? false;
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <VerifiedArtistName username={c.username} />
                        {collabDisplay ? (
                          <p
                            className={cn(
                              "mt-0.5 text-xs",
                              collabDisplay.className,
                            )}
                          >
                            {collabDisplay.label}
                          </p>
                        ) : null}
                      </div>
                      {canRemove && onRemoveExisting ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="shrink-0 text-destructive hover:text-destructive"
                          aria-label={`Remove collaborator`}
                          onClick={() => onRemoveExisting(c)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {stagedCollaborators.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Pending invite (max 4)
                </p>
                <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
                  {stagedCollaborators.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <VerifiedArtistName username={c.username} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                        aria-label="Remove staged invite"
                        onClick={() => onUnstageCollaborator(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {invitesLocked ? (
              <p className="text-xs leading-snug text-muted-foreground">
                Invites are locked once sent.
              </p>
            ) : null}
          </div>
        ) : null}

        {!invitesLocked ? (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              hasExistingOrStaged ? "mt-3 border-t border-white/10 pt-3" : "",
            )}
          >
            <div className="shrink-0 space-y-2">
              <p className="text-sm font-medium">Add collaborator</p>
              <p className="text-xs leading-snug text-muted-foreground">
                Invite verified artists. Stays private until everyone accepts.
              </p>
              <Input
                ref={searchInputRef}
                placeholder="Search artist username..."
                value={collabSearch}
                onChange={(e) => onCollabSearchChange(e.target.value)}
                className={cn("bg-black/40", SHEET_CONTROL_FOCUS)}
                disabled={searchDisabled}
                data-testid="release-collaborators-search"
                aria-label="Search artist username"
                {...SEARCH_INPUT_KEYBOARD_PROPS}
              />
            </div>

            <div
              className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain"
              data-vaul-no-drag
              data-testid="release-collaborators-search-results"
              style={{ WebkitOverflowScrolling: "touch" }}
              aria-live="polite"
            >
              {searchActive ? (
                filteredResults.length === 0 ? (
                  <p className="px-1 py-4 text-sm text-muted-foreground">
                    No matching verified artists.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/10 pb-8">
                    {filteredResults.map((artist) => (
                      <li key={artist.id}>
                        <button
                          type="button"
                          className={cn(
                            "ios-press flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left text-sm hover:bg-white/5",
                            SHEET_CONTROL_FOCUS,
                          )}
                          aria-label={`Invite ${artist.username}`}
                          onClick={() => {
                            playInteractionLightThrottled();
                            onStageCollaborator(artist);
                          }}
                        >
                          <VerifiedArtistName username={artist.username} />
                          <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
                            Invite
                            <UserPlus className="h-4 w-4" aria-hidden />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </ReleaseFormDrawer>
  );
}
