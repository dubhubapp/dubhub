export const SUGGESTED_PLAYED_DATE_STORAGE_KEY = "dubhub-suggested-played-date";

export const CAMERA_PLAYED_DATE_SOURCE = "camera_metadata" as const;

export type CameraOriginMetadata = {
  creationDateISO?: string | null;
  make?: string | null;
  model?: string | null;
  software?: string | null;
  cameraLensModel?: string | null;
};

const EXPORT_SOFTWARE_TOKENS = [
  "whatsapp",
  "tiktok",
  "instagram",
  "capcut",
  "inshot",
  "lavc",
  "lavf",
] as const;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function localCalendarYmd(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function todayInputValue(now = new Date()): string {
  return localCalendarYmd(now);
}

function isPlausibleYmd(ymd: string): boolean {
  const m = ymd.match(YMD_RE);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (year < 1990) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

function nonempty(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

export function isIPhoneModel(model: string | null | undefined): boolean {
  const m = nonempty(model);
  return !!m && /\biphone\b/i.test(m);
}

export function softwareLooksLikeExport(software: string | null | undefined): boolean {
  const s = nonempty(software);
  if (!s) return false;
  const lower = s.toLowerCase();
  if (EXPORT_SOFTWARE_TOKENS.some((token) => lower.includes(token))) return true;
  return /(^|[^a-z])vn([^a-z]|$)/i.test(s);
}

/**
 * Convert a QuickTime/AVAsset creation timestamp to YYYY-MM-DD.
 * Numeric source offsets keep that calendar day. Z / unknown offset uses device-local calendar.
 * Never uses UTC slice.
 */
export function creationIsoToPlayedDate(iso: string, now = new Date()): string | null {
  const trimmed = nonempty(iso);
  if (!trimmed) return null;

  const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](.*))?$/);
  if (!m) return null;
  const datePart = m[1];
  const rest = m[2] ?? "";
  if (!isPlausibleYmd(datePart)) return null;

  const hasNumericOffset = /[+-]\d{2}:?\d{2}$/.test(rest) || /[+-]\d{2}$/.test(rest);
  const hasZ = /Z$/i.test(rest);

  let ymd: string;
  if (hasNumericOffset && !hasZ) {
    ymd = datePart;
  } else {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    ymd = localCalendarYmd(parsed);
  }

  if (!isPlausibleYmd(ymd)) return null;
  if (ymd > todayInputValue(now)) return null;
  return ymd;
}

export function isHighConfidenceIPhoneCameraOrigin(
  meta: CameraOriginMetadata,
  now = new Date(),
): boolean {
  if (!isIPhoneModel(meta.model)) return false;
  if (!nonempty(meta.cameraLensModel)) return false;
  if (softwareLooksLikeExport(meta.software)) return false;
  return creationIsoToPlayedDate(meta.creationDateISO ?? "", now) != null;
}

export function suggestedPlayedDateFromCameraOrigin(
  meta: CameraOriginMetadata,
  now = new Date(),
): string | null {
  if (!isHighConfidenceIPhoneCameraOrigin(meta, now)) return null;
  return creationIsoToPlayedDate(meta.creationDateISO ?? "", now);
}

export function persistSuggestedPlayedDate(date: string | null): void {
  try {
    if (!date) {
      localStorage.removeItem(SUGGESTED_PLAYED_DATE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      SUGGESTED_PLAYED_DATE_STORAGE_KEY,
      JSON.stringify({
        suggestedPlayedDate: date,
        playedDateSource: CAMERA_PLAYED_DATE_SOURCE,
      }),
    );
  } catch {
    /* ignore quota */
  }
}

export function readSuggestedPlayedDate(): string | null {
  try {
    const raw = localStorage.getItem(SUGGESTED_PLAYED_DATE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { suggestedPlayedDate?: unknown };
      if (
        typeof parsed.suggestedPlayedDate === "string" &&
        YMD_RE.test(parsed.suggestedPlayedDate)
      ) {
        return parsed.suggestedPlayedDate;
      }
    }
  } catch {
    /* ignore */
  }
  for (const key of ["dubhub-trim-source", "dubhub-trim-export", "dubhub-native-trim-output"]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { suggestedPlayedDate?: unknown };
      if (
        typeof parsed.suggestedPlayedDate === "string" &&
        YMD_RE.test(parsed.suggestedPlayedDate)
      ) {
        return parsed.suggestedPlayedDate;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function originMetadataFromNativeInfo(info: {
  creationDateISO?: unknown;
  make?: unknown;
  model?: unknown;
  software?: string | null | unknown;
  cameraLensModel?: unknown;
}): CameraOriginMetadata {
  const asStr = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    creationDateISO: asStr(info.creationDateISO),
    make: asStr(info.make),
    model: asStr(info.model),
    software: asStr(info.software),
    cameraLensModel: asStr(info.cameraLensModel),
  };
}
