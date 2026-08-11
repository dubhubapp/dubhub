/**
 * Client-side helpers for push-token timezone reporting (unit-testable).
 */

import { resolveDeviceIanaTimezone } from "./release-timezone-options";

/** Whether a foreground sync should POST (timezone changed vs last report). */
export function shouldReportPushTimezone(args: {
  lastReported: string | null;
  current: string | null;
}): boolean {
  if (!args.current) return false;
  if (!args.lastReported) return true;
  return args.lastReported !== args.current;
}

export function buildPushTokenRegisterBody(args: {
  token: string;
  environment: "sandbox" | "production";
  timezone?: string | null;
}): Record<string, string> {
  const body: Record<string, string> = {
    token: args.token,
    platform: "ios",
    environment: args.environment,
  };
  if (args.timezone) {
    body.timezone = args.timezone;
  }
  return body;
}

export { resolveDeviceIanaTimezone };
