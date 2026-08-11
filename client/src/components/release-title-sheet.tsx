import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { ReleaseFormDrawer } from "@/components/release-form-drawer";
import {
  clampReleaseTitleInput,
  releaseTitleCharCountLabel,
  RELEASE_TITLE_MAX_LENGTH,
} from "@/lib/release-title-input";
import { playInteractionLightThrottled } from "@/lib/haptic";

type ReleaseTitleSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (title: string) => void;
};

export function ReleaseTitleSheet({
  open,
  onOpenChange,
  value,
  onChange,
}: ReleaseTitleSheetProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  const commitAndClose = () => {
    playInteractionLightThrottled();
    onChange(clampReleaseTitleInput(draft));
    onOpenChange(false);
  };

  return (
    <ReleaseFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Release title"
      contentTestId="release-title-sheet"
      doneTestId="release-title-sheet-done"
      stableHeight={false}
      minHeightClass="min-h-[42vh]"
      showDone={false}
      footer={
        <div className="shrink-0 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            onClick={commitAndClose}
            data-testid="release-title-sheet-done"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="px-0.5 pt-3 pb-1">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(clampReleaseTitleInput(e.target.value))}
          placeholder="Brand New Banger"
          maxLength={RELEASE_TITLE_MAX_LENGTH}
          className="h-11 bg-black/40"
          autoComplete="off"
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitAndClose();
            }
          }}
          data-testid="release-title-sheet-input"
        />
      </div>
      <p className="mt-1 text-right text-xs text-muted-foreground">
        {releaseTitleCharCountLabel(draft.length)}
      </p>
    </ReleaseFormDrawer>
  );
}
