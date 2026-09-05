/**
 * Discover feed-mode selected icon colours — open tile + collapsed pill share this map.
 * Random accent hex is shared with the Home rail dice trace (SVG stroke/glow).
 * Icon colour only; does not own layout, selection chrome, or animations.
 */

/**
 * Tailwind `red-500` — canonical Random accent for Discover icons + rail dice trace.
 * Keep in sync with `DISCOVER_FEED_MODE_ICON_COLOR_CLASS.random` (`text-red-500`).
 */
export const DISCOVER_RANDOM_ACCENT = "#ef4444" as const;

export const DISCOVER_FEED_MODE_ICON_COLOR_CLASS = {
  /** Yellow/gold — keep existing Trending identity. */
  trending: "text-amber-300",
  /** Green — aligns with Discover identified/status green family. */
  newest: "text-green-400",
  /** Soft orange/red — keep existing Hottest flame identity. */
  hottest: "text-red-200",
  /** Clear red — same family as `DISCOVER_RANDOM_ACCENT` / rail dice trace. */
  random: "text-red-500",
} as const;

export type DiscoverFeedModeIconColorMode = keyof typeof DISCOVER_FEED_MODE_ICON_COLOR_CLASS;
