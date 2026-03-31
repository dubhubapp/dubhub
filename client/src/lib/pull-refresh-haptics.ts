import { playPullRefreshThresholdHaptic } from "./haptic";

/** One strong impact when pull distance first crosses the refresh threshold (see `usePullToRefresh` + Home). */
export function triggerPullRefreshCommittedHaptic() {
  playPullRefreshThresholdHaptic();
}
