/**
 * New-user demographics gender contract.
 * prefer_not_to_say is a valid completed response.
 */

export const DEMOGRAPHICS_GENDER_VALUES = [
  "male",
  "female",
  "other",
  "prefer_not_to_say",
] as const;

export type DemographicsGender = (typeof DEMOGRAPHICS_GENDER_VALUES)[number];

export const DEMOGRAPHICS_GENDER_LABELS: Record<DemographicsGender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

export function parseDemographicsGender(
  value: unknown,
): DemographicsGender | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (DEMOGRAPHICS_GENDER_VALUES as readonly string[]).includes(normalized)
    ? (normalized as DemographicsGender)
    : null;
}
