/**
 * Client rollout flag for the production Verified Artist Tools paywall UI.
 * Does not bypass server entitlement rules.
 */

function readFlagRaw(
  env: ImportMetaEnv | NodeJS.ProcessEnv | Record<string, unknown> | null | undefined,
): unknown {
  if (!env || typeof env !== "object") return undefined;
  const record = env as Record<string, unknown>;
  return (
    record.VITE_VERIFIED_ARTIST_TOOLS_PAYWALL_ENABLED ??
    record.VERIFIED_ARTIST_TOOLS_PAYWALL_ENABLED
  );
}

export function isVerifiedArtistToolsPaywallEnabled(
  env?: ImportMetaEnv | NodeJS.ProcessEnv | Record<string, unknown> | null,
): boolean {
  let source: ImportMetaEnv | NodeJS.ProcessEnv | Record<string, unknown> | null | undefined =
    env;
  if (source === undefined) {
    try {
      // Vite client builds provide import.meta.env; node tests may not.
      source = import.meta.env as ImportMetaEnv | undefined;
    } catch {
      source = null;
    }
  }
  return String(readFlagRaw(source) ?? "").trim().toLowerCase() === "true";
}
