/**
 * Light-DOM waveform + playhead that mirrors WaveSurfer trim styling when canvases fail to paint.
 * Matches bar density (2px + 1px gap), waveColor / progressColor / cursorColor from trim-video.
 */

type Props = {
  peaks: number[];
  durationSec: number;
  currentTimeSec: number;
};

const WAVE = "rgba(255,255,255,0.28)";
const PROGRESS_GLOSS =
  "linear-gradient(90deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.14) 55%, rgba(255,255,255,0.04) 100%)";

export function TrimWaveformMatchedFallback({ peaks, durationSec, currentTimeSec }: Props) {
  if (peaks.length === 0 || durationSec <= 0) return null;
  const pct = Math.max(0, Math.min(100, (currentTimeSec / durationSec) * 100));

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[6] overflow-hidden rounded-[inherit]"
      data-testid="trim-waveform-fallback-layer"
      aria-hidden
    >
      <div className="absolute inset-x-1 inset-y-2">
        <div className="relative h-full w-full min-h-0">
          <div className="flex h-full min-h-0 w-full items-end gap-px">
            {peaks.map((pk, i) => (
              <div
                key={i}
                className="min-w-0 flex-1 rounded-[1px]"
                style={{
                  height: `${Math.max(5, pk * 100)}%`,
                  minHeight: 3,
                  backgroundColor: WAVE,
                  boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.06)",
                }}
              />
            ))}
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 left-0 mix-blend-screen"
            style={{
              width: `${pct}%`,
              maxWidth: "100%",
              backgroundImage: PROGRESS_GLOSS,
              opacity: 0.95,
            }}
          />
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-[2] w-0.5 -translate-x-1/2 rounded-full bg-white/[0.72] shadow-[0_0_10px_rgba(255,255,255,0.35)]"
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
