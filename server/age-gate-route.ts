import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  ageGateClientCode,
  evaluateDateOfBirth,
} from "@shared/age-gate";
import {
  ageGateClientIp,
  ageGateRateLimiter,
} from "./age-gate-rate-limit";

const bodySchema = z.object({
  dateOfBirth: z.string().min(1).max(32),
});

/**
 * POST /api/auth/age-gate — authoritative 13+ check.
 * Does not persist DOB. Does not return age or echo DOB.
 * Sealed claim ticket: not implemented in this phase (see module comment in tests).
 */
export function registerAgeGateRoutes(app: Express): void {
  app.post("/api/auth/age-gate", (req: Request, res: Response) => {
    const ip = ageGateClientIp(req);
    const limit = ageGateRateLimiter.check(ip);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      return res.status(429).json({
        eligible: false,
        code: "rate_limited",
      });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        eligible: false,
        code: "invalid_date_of_birth",
      });
    }

    const result = evaluateDateOfBirth(parsed.data.dateOfBirth);

    if (!result.valid) {
      return res.status(400).json({
        eligible: false,
        code: "invalid_date_of_birth",
      });
    }

    if (!result.eligible) {
      return res.status(403).json({
        eligible: false,
        code: ageGateClientCode(result) ?? "minimum_age_not_met",
      });
    }

    // Future phase: sealed claim ticket (server-authenticated, DOB not in clear).
    return res.status(200).json({
      eligible: true,
    });
  });
}
