/**
 * iOS/WebKit often keeps the first decoded frame black until a real playback tick runs.
 * `requestVideoFrameCallback` alone is not enough on many WebKit builds — we still need a
 * muted micro-play after seek so the compositor paints a frame.
 */
export function kickVideoFrameToScreen(video: HTMLVideoElement, timeSec: number) {
  const dur = video.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  const t = Math.min(Math.max(0, timeSec), Math.max(0, dur - 0.05));
  const applySeek = () => {
    try {
      video.currentTime = t;
    } catch {
      /* ignore */
    }
  };

  applySeek();

  const rVfc = video.requestVideoFrameCallback?.bind(video);
  if (rVfc) {
    rVfc(() => {
      applySeek();
    });
  }

  if (video.muted) {
    void video.play().then(
      () => {
        video.pause();
        applySeek();
      },
      () => {
        /* play() may reject before data is ready; event listeners will retry */
      },
    );
  }
}

/**
 * Extra `<video>` layers (wide-landscape blurred backdrop) often stay black on WebKit until the same
 * micro-play+seek used for the primary preview. When the primary is already playing, only align time;
 * do not call {@link kickVideoFrameToScreen} or we would pause the backdrop out of sync.
 */
export function syncBackdropVideoDecodedFrame(
  primary: HTMLVideoElement,
  backdrop: HTMLVideoElement,
): void {
  const t = Number.isFinite(primary.currentTime) ? primary.currentTime : 0;
  try {
    backdrop.currentTime = t;
  } catch {
    /* ignore */
  }
  if (!primary.paused) {
    return;
  }
  kickVideoFrameToScreen(backdrop, t);
}
