/**
 * Existing-account Country completion prompt - eligibility helpers.
 * Runtime gate is profiles.country_prompt_pending + null country_code.
 * The migration allowlist is frozen for tests / audit only.
 */

/** Frozen migration allowlist count (exact UUID UPDATE in SQL). */
export const COUNTRY_PROMPT_MIGRATION_ALLOWLIST_COUNT = 88 as const;

/** Exact profile IDs targeted by the one-time migration UPDATE. */
export const COUNTRY_PROMPT_MIGRATION_ALLOWLIST = [
  "b15be001-231d-42b1-9d0f-3c6d15d6d8e5",
  "825a1cc2-abfd-4afe-a486-1236425189be",
  "4484f7e7-867d-4cb3-bbf8-6e4cc5aa5f06",
  "48d39179-bb79-4c85-95cd-af74652dd6fd",
  "e697f626-f2d8-47f6-bb8e-c1945803e0e4",
  "db708082-aedd-4f3c-acbf-bae0aa589ea9",
  "b84b2cfc-44d8-4d02-a107-5a9f46920689",
  "279bd59c-7f11-45a3-843c-92a297461831",
  "8a021695-8f8c-4b72-85a9-0cdb3780ecae",
  "8a1a4602-376f-4f00-a5c8-6038f4eb9b7d",
  "1bbc3cdd-84da-40af-8c72-03fbc3835af3",
  "ad3f7a44-3ee6-498e-89b6-ad6eb0a272fc",
  "653be9eb-c17f-4a95-845c-856acd6430f5",
  "a14810b2-b89b-448e-86a5-16238a590b4a",
  "59c63795-6b3c-41f1-a07c-44ab605bf67e",
  "4ed2a8c9-7219-45db-bb8c-241ce359e153",
  "21d0a1f0-f010-47ef-9651-23d612e8ec10",
  "7a6de4ef-4aa8-41ee-b5bb-2b4f3179a2fd",
  "243f0627-4c3b-450f-b93b-daf7f3fc729b",
  "50b760c7-de2e-44c0-bac8-9a5225d0b161",
  "fb09df49-ed68-43c6-b982-424513fb35d0",
  "c7cddb70-5bb6-495e-9090-467d24dcf42d",
  "be7ed0ac-f10b-4655-8e29-09d43d07cad8",
  "a0c9cad7-9810-46fd-916d-8d2d802832ae",
  "78523e2c-f464-4638-b092-0e67387354ac",
  "2937edc0-7d15-4be6-a18c-ea71640270bd",
  "caced301-17bb-4e5c-b8cc-53f470dcd29d",
  "8cbe1de4-abdd-42c0-a635-ff3063e45f88",
  "bf9e40c9-b153-4189-bc8b-4b0b872739c0",
  "7f04f452-906a-4ad8-928a-2f2b5726dce9",
  "de5c61a2-0fe5-4265-a8c8-efcff1c257e0",
  "3153abdf-49b6-40de-bb2c-d7d6dd93d005",
  "28bb43e2-4702-4b5d-8acd-598aa4034368",
  "7ca8c967-6035-4382-ad1d-cfec6be33ee5",
  "86c1f14c-3f28-48ab-83e7-43e98caf4b20",
  "28e9de32-104e-4f57-a421-5d5fd1e4e068",
  "7024d47d-8997-466e-bcef-2f93c617468e",
  "9688e1eb-824d-4ac1-b738-817e5dd24f4f",
  "6c48030e-8599-48a3-8f54-7696869c667f",
  "1c41db1c-1495-4fa5-9ca5-b0c2876d6ae7",
  "270ed0e2-3d0a-4e29-bcc6-e9a0299a7dfc",
  "8a3cc464-3376-42ba-ad28-ec003fb57da0",
  "6a70e16b-6e62-42be-b1b3-fd6874ce1e8e",
  "c46c9b89-da55-4f42-9845-d3e997684326",
  "e003ad1d-f420-4bcc-b662-b5766051e7aa",
  "36c976a8-8adc-4d85-a5c5-5000db9b11af",
  "02233d03-8951-47dc-8ead-5f601638557f",
  "506e9b85-9935-4ae8-8a02-e8e1e4894147",
  "6841bbd8-d024-4b69-a78c-ea9fbfee04c0",
  "48c36bad-e1d3-4129-a887-6bbae6ae27fb",
  "c7c64f9c-55d4-4b45-9ec3-509075f7ce36",
  "5a7252e1-dd23-4ed9-a313-f862ba6ee0a9",
  "e6009798-dd11-455b-b452-0df1c2979630",
  "20fa6111-7359-46a3-b871-bdd6025b1f46",
  "8604b7d8-47ec-4d11-9685-e5da520a908a",
  "7ffb1648-3354-4d43-ae96-b6836e436f8a",
  "785b8653-2df9-46df-8ff0-ee3ef8c386e0",
  "40e03b40-a8a4-453c-bda4-ebf67460c49a",
  "9467b8d4-dfc0-4ad3-888b-1c28d974c2c1",
  "ca843da9-6fea-498d-a90e-7fa962fc690b",
  "9bb77aa6-1ddb-4e1b-a43e-28efa39bce40",
  "9ef7e127-6375-4af4-b368-5687b1d16946",
  "15cc4a52-48e8-4997-a57c-adcb0d44d0dd",
  "32fbf509-697a-4569-99e8-6aa8e040049b",
  "6cb14d8a-4016-431c-8730-1cc805fd174b",
  "dbefb10e-0389-4b87-b5ab-9ce872a3b67a",
  "a31c6a7e-3caa-4be2-ad45-b02fc3ecdcbb",
  "0d0eeab8-f86a-4eae-8afc-185e1a812918",
  "2f7c6101-d6d8-470f-9353-66a359405641",
  "11105427-c70c-4e90-a53f-9bb333702587",
  "3356b385-4782-47b3-a61d-8b8c9d8886f8",
  "36b4316d-557b-4216-9668-1feb9927f604",
  "21710514-f0eb-4dc9-89d6-fc2e809d38f8",
  "800c0445-f55c-4ef1-90f7-36322b0d9a9b",
  "6760f489-f43d-44bf-8470-34b2d8e15f06",
  "95d568ca-69e7-48b8-a93e-3c48a7664173",
  "a81b1c8f-451f-4c77-a38b-767a7d20b7a6",
  "afc6ab17-efed-4cbb-8315-d9c25f11ce19",
  "447c39cd-a89c-4aa9-b9dc-423a1d977f83",
  "7aa7831b-bea9-4bb5-80c7-594b70ad13ae",
  "ccb90a7d-c17f-46fa-b7bb-a7927a643df7",
  "fdf88319-f7f5-478b-9447-18dd84524f42",
  "d62c63f4-d002-4aa0-a6f4-1f5bbb3d843b",
  "c31b4cb1-e620-4287-b7ac-5beacd25070b",
  "36a02fe2-5bb8-49e0-a117-88978d15b7d4",
  "f31d71b6-1aaf-4c08-871d-795a021c9b91",
  "97efb9c6-e2cc-486f-89ba-2ee645ca8ed8",
  "18fcda98-20f1-43da-b5ca-eba51e7f44f1",
] as const;

export type CountryPromptEligibilityInput = {
  countryPromptPending: boolean;
  countryCode: string | null | undefined;
};

/**
 * Show prompt only when pending AND country_code is null.
 * Never use "country_code IS NULL" alone.
 */
export function shouldShowCountryPrompt(input: CountryPromptEligibilityInput): boolean {
  if (!input.countryPromptPending) return false;
  const code = input.countryCode;
  if (code != null && String(code).trim() !== "") return false;
  return true;
}

/** Settle delay before opening the prompt on Leaderboard (ms). */
export const COUNTRY_PROMPT_LEADERBOARD_SETTLE_MS = 350 as const;

/**
 * Visible prompt is Leaderboard-route gated only.
 * Query-safe: strips `?…` and `#…`, then matches exact `/leaderboard`.
 */
export function isLeaderboardRouteForCountryPrompt(path: string | null | undefined): boolean {
  if (!path) return false;
  const base = path.split("?")[0]?.split("#")[0] ?? "";
  return base === "/leaderboard";
}

/** Only known internal Country-picker return targets (no external URLs). */
export const COUNTRY_PICKER_RETURN_TARGETS = ["/leaderboard", "/settings"] as const;
export type CountryPickerReturnTo = (typeof COUNTRY_PICKER_RETURN_TARGETS)[number];

/** Prompt → picker href with explicit Leaderboard return. */
export const COUNTRY_PICKER_LEADERBOARD_HREF =
  "/settings/country?returnTo=/leaderboard" as const;

/**
 * Resolve safe Back destination from a query string.
 * Accepts `returnTo=/leaderboard` only; anything else → `/settings`.
 * Wouter `useLocation()` is pathname-only — pass `useSearch()` / `window.location.search`.
 */
export function resolveCountryPickerReturnTo(
  search: string | null | undefined,
): CountryPickerReturnTo {
  const raw = (search ?? "").startsWith("?") ? (search ?? "").slice(1) : (search ?? "");
  const params = new URLSearchParams(raw);
  if (params.get("returnTo") === "/leaderboard") return "/leaderboard";
  return "/settings";
}
