import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { cn } from "@/lib/utils";

export type PlatformPickerOption = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  options: PlatformPickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  "data-testid"?: string;
};

/** Custom platform select with logos (native <option> cannot render images). */
export function ReleaseLinkPlatformPicker({
  value,
  options,
  onChange,
  disabled,
  placeholder = "Platform",
  "data-testid": testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div ref={rootRef} className="relative min-w-[9.5rem]" data-testid={testId}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded border bg-background px-2 py-1.5 text-sm",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        {selected ? (
          <>
            <PlatformIcon platform={selected.value} />
            <span className="truncate flex-1 text-left">{selected.label}</span>
          </>
        ) : (
          <span className="truncate flex-1 text-left text-muted-foreground">
            {placeholder}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-background py-1 shadow-md"
        >
          {options.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">No platforms left</li>
          ) : (
            options.map((opt) => (
              <li key={opt.value} role="option" aria-selected={opt.value === value}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted",
                    opt.value === value && "bg-muted/60",
                  )}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <PlatformIcon platform={opt.value} />
                  <span className="truncate">{opt.label}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
