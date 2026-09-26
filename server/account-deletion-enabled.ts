/**
 * Server feature gate for self-serve account deletion.
 * Exact value "true" enables. Absent/false/other → disabled.
 */

export function isAccountDeletionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env.ACCOUNT_DELETION_ENABLED ?? "").trim().toLowerCase() === "true";
}
