import "dotenv/config";
import cron from "node-cron";
import cors from "cors";
import { execFile } from "child_process";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { pool } from "./db";
import { reconcileArtistFutureReleaseSuspensions } from "./reconcile-artist-future-release-suspensions";
import { isFutureReleaseSuspensionEnforcementEnabled } from "./future-release-suspension";
import { subscriptionStatusRepository } from "./subscription-status-repository";

const app = express();

const isDev = process.env.NODE_ENV !== "production";
const isApiOnlyMode =
  /^(1|true|yes)$/i.test(String(process.env.API_ONLY ?? ""));
const PROD_CORS_ALLOWED_ORIGINS = new Set(
  String(process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
);

/** Explicit dev origins; LAN Vite + Capacitor. Production still uses the previous localhost:517* rule only. */
const DEV_CORS_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.1.184:5173",
  "capacitor://localhost",
  "ionic://localhost",
]);

function isDevOriginAllowed(origin: string): boolean {
  if (DEV_CORS_ORIGINS.has(origin)) return true;
  // Vite on LAN (device opens http://192.168.x.x:5173)
  if (/^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}:5173$/.test(origin)) return true;
  // Same as legacy middleware: Vite on localhost / 127.0.0.1 (5173, 5174, …)
  if (origin.includes("localhost:517") || origin.includes("127.0.0.1:517")) return true;
  return false;
}

function corsOriginAllowed(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
  if (!origin) {
    cb(null, true);
    return;
  }
  if (isDev) {
    cb(null, isDevOriginAllowed(origin));
    return;
  }
  cb(null, PROD_CORS_ALLOWED_ORIGINS.has(origin));
}

app.use(
  cors({
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
    origin: corsOriginAllowed,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

async function logFfprobeRuntimeDiagnostics() {
  const pathValue = process.env.PATH || "";
  console.log("[startup][ffprobe] PATH", pathValue);

  await new Promise<void>((resolve) => {
    execFile("which", ["ffprobe"], (err, stdout, stderr) => {
      if (err) {
        console.error("[startup][ffprobe] which ffprobe failed", {
          message: err.message,
          code: (err as NodeJS.ErrnoException).code ?? null,
          stderr: stderr?.trim() || null,
        });
      } else {
        console.log("[startup][ffprobe] which ffprobe", stdout.trim() || "(empty)");
      }
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    execFile("ffprobe", ["-version"], (err, stdout, stderr) => {
      if (err) {
        console.error("[startup][ffprobe] ffprobe -version failed", {
          message: err.message,
          code: (err as NodeJS.ErrnoException).code ?? null,
          stderr: stderr?.trim() || null,
        });
      } else {
        const firstLine = stdout.trim().split("\n")[0] || "(empty)";
        console.log("[startup][ffprobe] ffprobe -version", firstLine);
      }
      resolve();
    });
  });
}

let futureReleaseSuspensionReconcileRunning = false;

/**
 * Batch future-release suspension reconcile: catches artists whose access
 * changed outside a direct create/attach/delete/refresh request (e.g. webhook
 * updates, expiry passing naturally, or a previously-failed inline reconcile).
 * Bounded to 200 artists per tick; each artist is reconciled independently so
 * one failure does not block the rest. Does not call RevenueCat directly —
 * relies on cached subscription snapshots via subscriptionStatusRepository.
 */
async function runFutureReleaseSuspensionReconcileBatch(): Promise<void> {
  if (!isFutureReleaseSuspensionEnforcementEnabled()) return;
  if (futureReleaseSuspensionReconcileRunning) {
    log("[Cron] Future-release reconcile batch skipped: previous run still in progress");
    return;
  }
  futureReleaseSuspensionReconcileRunning = true;
  try {
    const result = await pool.query<{ artist_id: string }>(`
      SELECT DISTINCT artist_id FROM releases WHERE subscription_suspended_at IS NOT NULL
      UNION
      SELECT DISTINCT artist_id FROM releases
      WHERE is_public = true
        AND (
          (release_date IS NULL AND is_coming_soon = true)
          OR (release_date IS NOT NULL AND release_date >= NOW())
        )
      LIMIT 200
    `);
    const artistIds = result.rows.map((r) => r.artist_id).filter(Boolean);
    if (artistIds.length === 0) return;

    let suspended = 0;
    let restored = 0;
    let promoted = 0;
    let failed = 0;
    for (const artistId of artistIds) {
      try {
        const outcome = await reconcileArtistFutureReleaseSuspensions(artistId, {
          pool,
          getSnapshotsForUser: (id) => subscriptionStatusRepository.getSnapshotsForUser(id),
        });
        suspended += outcome.suspendedCount;
        restored += outcome.restoredCount;
        promoted += outcome.promotedCount;
      } catch (err) {
        failed += 1;
        console.error("[Cron] Future-release reconcile failed for artist", { artistId, err });
      }
    }
    if (suspended > 0 || restored > 0 || promoted > 0 || failed > 0) {
      log(
        `[Cron] Future-release reconcile batch: artists=${artistIds.length} suspended=${suspended} restored=${restored} promoted=${promoted} failed=${failed}`,
      );
    }
  } catch (err) {
    console.error("[Cron] Future-release reconcile batch error:", err);
  } finally {
    futureReleaseSuspensionReconcileRunning = false;
  }
}

(async () => {
  await logFfprobeRuntimeDiagnostics();
  const server = await registerRoutes(app);

  // Release-day morning notifications: 9am Europe/London check is inside the job
  const isDev = process.env.NODE_ENV !== "production";
  const cronExpr = isDev ? "* * * * *" : "*/5 * * * *"; // Dev: every 1 min; Prod: every 5 min
  cron.schedule(cronExpr, async () => {
    try {
      if (isDev) log("[Cron] Release-day job running");
      const result = await storage.notifyReleaseDayLikers();
      if (result.count > 0) {
        log(`[Cron] Release-day notifications sent: ${result.count} for release(s) ${result.releaseIds.join(", ")}`);
      }
      if (isDev && result.releaseIds.length === 0) {
        log("[Cron] Release-day job: 0 releases eligible (date/time Europe/London, 9am+)");
      }
    } catch (err) {
      console.error("[Cron] Release-day notifications error:", err);
    }
  });

  // Future-release subscription suspension batch reconcile: hourly in prod, every 15 min in dev.
  const futureReleaseSuspensionCronExpr = isDev ? "*/15 * * * *" : "0 * * * *";
  cron.schedule(futureReleaseSuspensionCronExpr, () => {
    void runFutureReleaseSuspensionReconcileBatch();
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // If response was already sent, don't try to send again
    if (res.headersSent) {
      return _next(err);
    }

    // Return detailed error response
    console.error('[Server] Unhandled error:', {
      error: err,
      message: err.message,
      stack: err.stack,
      status,
      path: _req.path,
      method: _req.method
    });

    res.status(status).json({ 
      success: false,
      error: message,
      details: err.stack || err.details || 'No additional details available',
      type: err.constructor?.name || 'Error'
    });
  });

  // In standalone mode (when VITE_STANDALONE is set or in production), don't use Vite middleware
  // Vite dev server runs separately and proxies API requests to this server
  if (app.get("env") === "development" && !process.env.VITE_STANDALONE) {
    await setupVite(app, server);
  } else {
    // Production mode or standalone mode - serve static files or API only
    if (app.get("env") === "production") {
      if (isApiOnlyMode) {
        log("API_ONLY enabled: skipping static frontend serving");
      } else {
        serveStatic(app);
      }
    }
    // In standalone dev mode, only serve API - Vite dev server handles frontend
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Default to 5000 if not specified.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  }).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      log(`ERROR: Port ${port} is already in use.`);
      log(`To fix this, either:`);
      log(`  1. Kill the process using port ${port}: lsof -ti:${port} | xargs kill -9`);
      log(`  2. Change the PORT in your .env file to a different port`);
      process.exit(1);
    } else {
      throw err;
    }
  });
})();
