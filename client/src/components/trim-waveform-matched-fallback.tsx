/**
 * Light-DOM waveform + playhead that mirrors WaveSurfer trim styling when canvases fail to paint.
 * Matches bar density (2px + 1px gap), waveColor / progressColor from trim-video.
 * Playhead is rendered by trim-video.tsx (single clipped layer).
 */

type Props = {
  peaks: number[];
  durationSec: number;
  currentTimeSec: number;
  selectionStartPct?: number;
  selectionWidthPct?: number;
};

const WAVE = "rgba(255,255,255,0.38)";
const WAVE_SELECTED = "rgba(255,255,255,0.72)";
const PROGRESS_GLOSS =
  "linear-gradient(90deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.18) 55%, rgba(255,255,255,0.04) 100%)";

export function TrimWaveformMatchedFallback({
  peaks,
  durationSec,
  currentTimeSec,
  selectionStartPct = 0,
  selectionWidthPct = 100,
}: Props) {
  if (peaks.length === 0 || durationSec <= 0) return null;
  const pct = Math.max(0, Math.min(100, (currentTimeSec / durationSec) * 100));
  const selStart = Math.max(0, Math.min(100, selectionStartPct));
  const selEnd = Math.max(selStart, Math.min(100, selStart + selectionWidthPct));

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[6] overflow-hidden"
      data-testid="trim-waveform-fallback-layer"
      aria-hidden
    >
      <div className="relative h-full w-full min-h-0">
        <div className="flex h-full min-h-0 w-full items-end gap-px px-0">
          {peaks.map((pk, i) => {
            const barPct = (i / Math.max(1, peaks.length - 1)) * 100;
            const inSelection = barPct >= selStart && barPct <= selEnd;
            return (
              <div
                key={i}
                className="min-w-0 flex-1 rounded-[1px]"
                style={{
                  height: `${Math.max(5, pk * 100)}%`,
                  minHeight: 3,
                  backgroundColor: inSelection ? WAVE_SELECTED : WAVE,
                  boxShadow: inSelection
                    ? "inset 0 -1px 0 rgba(255,255,255,0.14)"
                    : "inset 0 -1px 0 rgba(255,255,255,0.08)",
                }}
              />
            );
          })}
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
      </div>
    </div>
  );
}
