/** z-[120] stacks above Comments drawer (z-[60]/z-[110]) for long-press Mark path.
 * Entrance animation mirrors DialogContent defaults so open-from-Comments still
 * fades/scales instead of popping in while a finger is held.
 */
export const ID_MARKING_DIALOG_OVERLAY_CLASS =
  "fixed inset-0 z-[120] bg-black/58 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-200 motion-reduce:animate-none motion-reduce:transition-none";

export const ID_MARKING_DIALOG_CONTENT_CLASS =
  "z-[120] w-[calc(100%-2rem)] max-w-[30rem] max-h-[80vh] overflow-y-auto rounded-2xl border border-white/20 bg-[#0f1324] p-5 text-white shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] duration-200 motion-reduce:animate-none motion-reduce:transition-none";

/**
 * Picker chrome. Cue pills are the frozen C8D.1 semantic system
 * (Oldest = blue, First Comment/First Tag = gold).
 * Do not restyle ID_MARKING_DIALOG_* above.
 */
export const ID_MARKING_PICKER_ROW_CLASS =
  "flex min-w-0 items-start space-x-3 rounded-lg border border-white/12 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]";

export const ID_MARKING_PICKER_ROW_SELECTED_CLASS =
  "border-[#0a83ff]/70 bg-white/[0.06]";

export const ID_MARKING_PICKER_ROW_REPLY_CLASS = "ml-3 border-l-2 border-l-white/20";

export const ID_MARKING_PICKER_META_PILL_CLASS =
  "whitespace-nowrap rounded-full border border-white/20 bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-white/75";

/** Oldest Comment — semantic blue cue (pill only; not row selection). */
export const ID_MARKING_PICKER_OLDEST_PILL_CLASS =
  "whitespace-nowrap rounded-full border border-[#3B82F6] bg-[#3B82F6] px-2 py-0.5 text-[11px] font-medium text-white shadow-[0_0_14px_rgba(59,130,246,0.45)]";

/** First Comment / First Tag — semantic gold cue (pill only; not row selection). */
export const ID_MARKING_PICKER_FIRST_PILL_CLASS =
  "whitespace-nowrap rounded-full border border-[#FFD700]/80 bg-[#FFD700]/25 px-2 py-0.5 text-[11px] font-semibold text-white shadow-[0_0_14px_rgba(255,215,0,0.35)]";
