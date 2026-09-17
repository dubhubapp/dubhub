/**
 * In-memory IP rate limit for unauthenticated age-gate.
 * Smallest abuse protection — no new dependency.
 * Not keyed off DOB. Process-local (resets on deploy / multi-instance not shared).
 */

export type AgeGateRateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number };

type WindowEntry = {
  count: number;
  windowStartMs: number;
};

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 30;

/** Mutable store for tests. */
export function createAgeGateRateLimiter(options?: {
  windowMs?: number;
  maxRequests?: number;
  now?: () => number;
}) {
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options?.maxRequests ?? DEFAULT_MAX;
  const nowFn = options?.now ?? Date.now;
  const buckets = new Map<string, WindowEntry>();

  function check(key: string): AgeGateRateLimitResult {
    const now = nowFn();
    const entry = buckets.get(key);
    if (!entry || now - entry.windowStartMs >= windowMs) {
      buckets.set(key, { count: 1, windowStartMs: now });
      return { allowed: true, remaining: maxRequests - 1 };
    }
    if (entry.count >= maxRequests) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((entry.windowStartMs + windowMs - now) / 1000),
      );
      return { allowed: false, retryAfterSec };
    }
    entry.count += 1;
    return { allowed: true, remaining: maxRequests - entry.count };
  }

  function reset() {
    buckets.clear();
  }

  return { check, reset, windowMs, maxRequests };
}

export const ageGateRateLimiter = createAgeGateRateLimiter();

export function ageGateClientIp(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
}): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0]?.trim() || "unknown";
  }
  if (Array.isArray(xf) && xf[0]) {
    return String(xf[0]).split(",")[0]?.trim() || "unknown";
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}
