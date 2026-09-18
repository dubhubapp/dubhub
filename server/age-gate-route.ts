/**
 * POST /api/auth/age-gate — authoritative 13+ check + sealed ticket.
 * Kept free of DB/Supabase imports so unit tests can load this module alone.
 *
 * Body: { dateOfBirth, email } — email is bound into the ticket as SHA-256
 * (never echoed). Request bodies are never written to the access log.
 */

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
import {
  sealAgeGateTicket,
  tryResolveAgeGateTicketKey,
} from "./age-gate-ticket";

const ageGateBodySchema = z.object({
  dateOfBirth: z.string().min(1).max(32),
  email: z.string().min(1).max(320),
});

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

    const parsed = ageGateBodySchema.safeParse(req.body);
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

    const keyResolved = tryResolveAgeGateTicketKey();
    if (!keyResolved.ok) {
      console.error("[age-gate] AGE_GATE_TICKET_SECRET missing or invalid");
      return res.status(503).json({
        eligible: false,
        code: "unavailable",
      });
    }

    const sealed = sealAgeGateTicket({
      dateOfBirth: result.normalizedDob,
      email: parsed.data.email,
      key: keyResolved.key,
    });
    if (!sealed.ok) {
      if (sealed.code === "invalid_email") {
        return res.status(400).json({
          eligible: false,
          code: "invalid_request",
        });
      }
      console.error("[age-gate] ticket seal failed");
      return res.status(503).json({
        eligible: false,
        code: "unavailable",
      });
    }

    return res.status(200).json({
      eligible: true,
      ticket: sealed.ticket,
    });
  });
}
