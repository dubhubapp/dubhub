/**
 * Client rollout flag for Home Screen widget listener selection UI.
 * Does not alter server widget endpoint or eligibility rules.
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
  return String(readFlagRaw(source) ?? "").trim().toLowerCase() === "true";
}
