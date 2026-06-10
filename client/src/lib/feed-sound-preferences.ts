export const FEED_START_WITH_SOUND_STORAGE_KEY = "dubhub-feed-start-with-sound";

export function getFeedStartWithSound(): boolean {
  try {
    const value = localStorage.getItem(FEED_START_WITH_SOUND_STORAGE_KEY);
    if (value === "true") return true;
    if (value === "false") return false;
  } catch {
    /* ignore */
  }
  return false;
}

export function setFeedStartWithSound(value: boolean): void {
  try {
    localStorage.setItem(FEED_START_WITH_SOUND_STORAGE_KEY, value ? "true" : "false");
  } catch {
    /* ignore */
  }
}
