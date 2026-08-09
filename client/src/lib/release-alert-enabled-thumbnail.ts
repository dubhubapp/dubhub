/**
 * Presentation contract for release_alert_enabled thumbnails.
 * Person notification: circular actor avatar, no bell overlay.
 * Post/release types must not use this helper.
 */

export type ReleaseAlertEnabledThumbnailPresentation = {
  shape: "circle";
  showBellOverlay: false;
  useActorAvatar: true;
  /** List tile outer frame (16×16, circular clip). */
  listContainerClassName: string;
  /** List img classes matching app person-avatar pattern. */
  listImageClassName: string;
  /** Banner frame classes (9×9 host keeps size; circle clip). */
  bannerFrameClassName: string;
};

export function getReleaseAlertEnabledThumbnailPresentation(): ReleaseAlertEnabledThumbnailPresentation {
  return {
    shape: "circle",
    showBellOverlay: false,
    useActorAvatar: true,
    listContainerClassName:
      "relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-gray-800",
    listImageClassName: "avatar-media h-full w-full rounded-full object-cover",
    bannerFrameClassName:
      "h-full w-full overflow-hidden rounded-full border border-white/10 bg-white/8 ring-1 ring-[#4ae9df]/20",
  };
}
