import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Single leading @ for UI; strips any existing @ prefix. Does not change stored/API values. */
export function formatUsernameDisplay(username: string | null | undefined): string {
  if (username == null) return ""
  const trimmed = String(username).trim()
  if (!trimmed) return ""
  const core = trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed
  if (!core) return ""
  return `@${core}`
}

/** Red notification badge label: show count up to 99, then "99+". */
export function formatNotificationBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}
