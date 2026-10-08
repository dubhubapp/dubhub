/**
 * Process-wide switch for scheduled background work.
 * Unset and "true" keep today's jobs. Exact "false" skips registration.
 * Request-driven paths are not controlled here.
 */

export function isBackgroundJobsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.BACKGROUND_JOBS_ENABLED;
  if (raw == null || raw === "") return true;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return true;
}

export type RegisterBackgroundJobsArgs = {
  env?: NodeJS.ProcessEnv;
  scheduleReleaseDay: () => void;
  scheduleFutureReleaseSuspension: () => void;
  scheduleLeaderboardFreeze: () => void;
  schedulePendingDemographicsCleanup: () => void;
  runStartupLeaderboardFreeze: () => void;
};

/**
 * Register the four production crons and the startup leaderboard freeze.
 * Returns false without calling any hook when background jobs are disabled.
 */
export function registerBackgroundJobs(args: RegisterBackgroundJobsArgs): boolean {
  if (!isBackgroundJobsEnabled(args.env ?? process.env)) return false;
  args.scheduleReleaseDay();
  args.scheduleFutureReleaseSuspension();
  args.scheduleLeaderboardFreeze();
  args.schedulePendingDemographicsCleanup();
  args.runStartupLeaderboardFreeze();
  return true;
}
