/** Max playable clip length after trim (seconds). */
export const MAX_CLIP_DURATION_SECONDS = 30;

/** Minimum selection when the source is long enough to support it (seconds). */
export const MIN_CLIP_DURATION_SECONDS = 3;

/** Default selection length on the trim screen (seconds). */
export const DEFAULT_CLIP_SELECTION_SECONDS = 15;

/** Post-trim upload cap: trimmed file only (bytes). */
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;

export const MAX_VIDEO_UPLOAD_MB = Math.round(MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024));
