/**
 * Launch kill switch for Home Screen widget listener selection UI.
 * Does not alter server widget endpoint or eligibility rules.
 *
 * Opt-out: missing or any value other than explicit "false" leaves selection on.
 * Set VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED=false to hide it.
 */

function readFlagRaw(
  env: ImportMetaEnv | NodeJS.ProcessEnv | Record<string, unknown> | null | undefined,
): unknown {
  if (!env || typeof env !== "object") return undefined;
  const record = env as Record<string, unknown>;
  return (
    record.VITE_HOME_RELEASE_WIDGET_SELECTION_ENABLED ??
    record.HOME_RELEASE_WIDGET_SELECTION_ENABLED
  );
}

export function isHomeReleaseWidgetSelectionEnabled(
  env?: ImportMetaEnv | NodeJS.ProcessEnv | Record<string, unknown> | null,
): boolean {
  let source: ImportMetaEnv | NodeJS.ProcessEnv | Record<string, unknown> | null | undefined =
    env;
  if (source === undefined) {
    try {
      source = import.meta.env as ImportMetaEnv | undefined;
    } catch {
      source = null;
    }
  }
  const raw = readFlagRaw(source);
  if (raw == null) return true;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "") return true;
  return normalized !== "false";
}
