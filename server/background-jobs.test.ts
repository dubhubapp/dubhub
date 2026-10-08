import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isBackgroundJobsEnabled,
  registerBackgroundJobs,
  type RegisterBackgroundJobsArgs,
} from "./background-jobs";

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(here, "index.ts"), "utf8");

const JOBS = [
  "release-day",
  "future-release-suspension",
  "leaderboard-freeze",
  "pending-demographics-cleanup",
  "startup-leaderboard-freeze",
] as const;

function registration(env: NodeJS.ProcessEnv) {
  const calls: string[] = [];
  const hooks: RegisterBackgroundJobsArgs = {
    env,
    scheduleReleaseDay: () => calls.push("release-day"),
    scheduleFutureReleaseSuspension: () => calls.push("future-release-suspension"),
    scheduleLeaderboardFreeze: () => calls.push("leaderboard-freeze"),
    schedulePendingDemographicsCleanup: () => calls.push("pending-demographics-cleanup"),
    runStartupLeaderboardFreeze: () => calls.push("startup-leaderboard-freeze"),
  };
  const enabled = registerBackgroundJobs(hooks);
  return { enabled, calls };
}

describe("isBackgroundJobsEnabled", () => {
  it("unset and empty stay enabled", () => {
    assert.equal(isBackgroundJobsEnabled({} as NodeJS.ProcessEnv), true);
    assert.equal(
      isBackgroundJobsEnabled({ BACKGROUND_JOBS_ENABLED: "" } as NodeJS.ProcessEnv),
      true,
    );
  });

  it("exact true stays enabled", () => {
    assert.equal(
      isBackgroundJobsEnabled({ BACKGROUND_JOBS_ENABLED: "true" } as NodeJS.ProcessEnv),
      true,
    );
  });

  it("exact false disables", () => {
    assert.equal(
      isBackgroundJobsEnabled({ BACKGROUND_JOBS_ENABLED: "false" } as NodeJS.ProcessEnv),
      false,
    );
  });
});

describe("registerBackgroundJobs", () => {
  it("unset registers all four crons and the startup leaderboard freeze", () => {
    const result = registration({} as NodeJS.ProcessEnv);
    assert.equal(result.enabled, true);
    assert.deepEqual(result.calls, [...JOBS]);
  });

  it("true registers all four crons and the startup leaderboard freeze", () => {
    const result = registration({
      BACKGROUND_JOBS_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    assert.equal(result.enabled, true);
    assert.deepEqual(result.calls, [...JOBS]);
  });

  it("false registers no crons and does not run the startup leaderboard freeze", () => {
    const result = registration({
      BACKGROUND_JOBS_ENABLED: "false",
    } as NodeJS.ProcessEnv);
    assert.equal(result.enabled, false);
    assert.deepEqual(result.calls, []);
  });

  it("false does not throw, so startup can continue to listen", () => {
    assert.doesNotThrow(() =>
      registerBackgroundJobs({
        env: { BACKGROUND_JOBS_ENABLED: "false" } as NodeJS.ProcessEnv,
        scheduleReleaseDay: () => {
          throw new Error("release-day cron must not register");
        },
        scheduleFutureReleaseSuspension: () => {
          throw new Error("future-release cron must not register");
        },
        scheduleLeaderboardFreeze: () => {
          throw new Error("leaderboard cron must not register");
        },
        schedulePendingDemographicsCleanup: () => {
          throw new Error("pending demographics cron must not register");
        },
        runStartupLeaderboardFreeze: () => {
          throw new Error("startup leaderboard freeze must not run");
        },
      }),
    );
  });
});

describe("server startup wiring", () => {
  it("schedules jobs after routes and still listens when registration returns", () => {
    const routesIdx = indexSrc.indexOf("await registerRoutes(app)");
    const registerIdx = indexSrc.indexOf("registerBackgroundJobs({");
    const listenIdx = indexSrc.indexOf("server.listen");
    assert.ok(routesIdx > 0);
    assert.ok(registerIdx > routesIdx);
    assert.ok(listenIdx > registerIdx);
    assert.match(indexSrc, /scheduleReleaseDay:/);
    assert.match(indexSrc, /notifyReleaseDayLikers/);
    assert.match(indexSrc, /scheduleFutureReleaseSuspension:/);
    assert.match(indexSrc, /runFutureReleaseSuspensionReconcileBatch/);
    assert.match(indexSrc, /scheduleLeaderboardFreeze:/);
    assert.match(indexSrc, /cron\.schedule\("0 \* \* \* \*"/);
    assert.match(indexSrc, /\[Cron\]\[LeaderboardMonthlyFreeze\]/);
    assert.match(indexSrc, /schedulePendingDemographicsCleanup:/);
    assert.match(indexSrc, /runPendingDemographicsCleanupJob/);
    assert.match(indexSrc, /runStartupLeaderboardFreeze:/);
    assert.match(indexSrc, /\[startup\]\[LeaderboardMonthlyFreeze\]/);
  });
});
