/**
 * Curated IANA timezones for Exact release-time picker.
 * Location-first presentation; only `id` (IANA) is persisted.
 */

export type ReleaseTimezoneOption = {
  id: string;
  /** City / place shown as primary location */
  city: string;
  /** Short region after city, e.g. "England", "USA", "Netherlands" */
  region: string;
  /** Longer country name for search (optional when region is enough) */
  country: string;
  /**
   * Stable concept name for search / secondary disambiguation.
   * e.g. "Pacific Time", "UK Time" — never primary row label.
   */
  label: string;
  /** Lowercased search aliases. Never persisted. */
  searchAliases: readonly string[];
};

/** Compact list covering major electronic-music markets + common artist bases. */
export const RELEASE_TIMEZONE_OPTIONS: readonly ReleaseTimezoneOption[] = [
  {
    id: "Europe/London",
    city: "London",
    region: "England",
    country: "United Kingdom",
    label: "UK Time",
    searchAliases: [
      "uk",
      "uk time",
      "british",
      "british time",
      "britain",
      "england",
      "great britain",
      "gmt",
      "bst",
      "london",
    ],
  },
  {
    id: "Europe/Dublin",
    city: "Dublin",
    region: "Ireland",
    country: "Ireland",
    label: "Irish Time",
    searchAliases: ["ireland", "irish", "dublin"],
  },
  {
    id: "Europe/Amsterdam",
    city: "Amsterdam",
    region: "Netherlands",
    country: "Netherlands",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "netherlands",
      "holland",
      "amsterdam",
    ],
  },
  {
    id: "Europe/Berlin",
    city: "Berlin",
    region: "Germany",
    country: "Germany",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "germany",
      "berlin",
    ],
  },
  {
    id: "Europe/Paris",
    city: "Paris",
    region: "France",
    country: "France",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "france",
      "paris",
    ],
  },
  {
    id: "Europe/Madrid",
    city: "Madrid",
    region: "Spain",
    country: "Spain",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "spain",
      "madrid",
    ],
  },
  {
    id: "Europe/Rome",
    city: "Rome",
    region: "Italy",
    country: "Italy",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "italy",
      "rome",
    ],
  },
  {
    id: "Europe/Lisbon",
    city: "Lisbon",
    region: "Portugal",
    country: "Portugal",
    label: "Western European Time",
    searchAliases: ["wet", "west", "western european", "portugal", "lisbon"],
  },
  {
    id: "Europe/Brussels",
    city: "Brussels",
    region: "Belgium",
    country: "Belgium",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "belgium",
      "brussels",
    ],
  },
  {
    id: "Europe/Zurich",
    city: "Zurich",
    region: "Switzerland",
    country: "Switzerland",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "switzerland",
      "zurich",
    ],
  },
  {
    id: "Europe/Vienna",
    city: "Vienna",
    region: "Austria",
    country: "Austria",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "austria",
      "vienna",
    ],
  },
  {
    id: "Europe/Stockholm",
    city: "Stockholm",
    region: "Sweden",
    country: "Sweden",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "sweden",
      "stockholm",
    ],
  },
  {
    id: "Europe/Copenhagen",
    city: "Copenhagen",
    region: "Denmark",
    country: "Denmark",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "denmark",
      "copenhagen",
    ],
  },
  {
    id: "Europe/Oslo",
    city: "Oslo",
    region: "Norway",
    country: "Norway",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "norway",
      "oslo",
    ],
  },
  {
    id: "Europe/Warsaw",
    city: "Warsaw",
    region: "Poland",
    country: "Poland",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "poland",
      "warsaw",
    ],
  },
  {
    id: "Europe/Prague",
    city: "Prague",
    region: "Czechia",
    country: "Czechia",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "czechia",
      "czech",
      "prague",
    ],
  },
  {
    id: "Europe/Budapest",
    city: "Budapest",
    region: "Hungary",
    country: "Hungary",
    label: "Central European Time",
    searchAliases: [
      "cet",
      "cest",
      "central european",
      "central european time",
      "hungary",
      "budapest",
    ],
  },
  {
    id: "Europe/Athens",
    city: "Athens",
    region: "Greece",
    country: "Greece",
    label: "Eastern European Time",
    searchAliases: [
      "eet",
      "eest",
      "eastern european",
      "eastern european time",
      "greece",
      "athens",
    ],
  },
  {
    id: "Europe/Bucharest",
    city: "Bucharest",
    region: "Romania",
    country: "Romania",
    label: "Eastern European Time",
    searchAliases: [
      "eet",
      "eest",
      "eastern european",
      "eastern european time",
      "romania",
      "bucharest",
    ],
  },
  {
    id: "Europe/Helsinki",
    city: "Helsinki",
    region: "Finland",
    country: "Finland",
    label: "Eastern European Time",
    searchAliases: [
      "eet",
      "eest",
      "eastern european",
      "eastern european time",
      "finland",
      "helsinki",
    ],
  },
  {
    id: "Europe/Moscow",
    city: "Moscow",
    region: "Russia",
    country: "Russia",
    label: "Moscow Time",
    searchAliases: ["msk", "russia", "moscow"],
  },
  {
    id: "Europe/Istanbul",
    city: "Istanbul",
    region: "Türkiye",
    country: "Türkiye",
    label: "Türkiye Time",
    searchAliases: ["turkey", "türkiye", "tr", "istanbul"],
  },
  {
    id: "America/New_York",
    city: "New York",
    region: "USA",
    country: "United States",
    label: "Eastern Time",
    searchAliases: [
      "eastern",
      "eastern time",
      "et",
      "est",
      "edt",
      "us eastern",
      "usa",
      "united states",
      "america",
      "nyc",
      "new york",
    ],
  },
  {
    id: "America/Chicago",
    city: "Chicago",
    region: "USA",
    country: "United States",
    label: "Central Time",
    searchAliases: [
      "central",
      "central time",
      "us central",
      "ct",
      "cst",
      "cdt",
      "usa",
      "united states",
      "chicago",
    ],
  },
  {
    id: "America/Denver",
    city: "Denver",
    region: "USA",
    country: "United States",
    label: "Mountain Time",
    searchAliases: [
      "mountain",
      "mountain time",
      "mt",
      "mst",
      "mdt",
      "us mountain",
      "usa",
      "united states",
      "denver",
    ],
  },
  {
    id: "America/Los_Angeles",
    city: "Los Angeles",
    region: "USA",
    country: "United States",
    label: "Pacific Time",
    searchAliases: [
      "pacific",
      "pacific time",
      "pt",
      "pst",
      "pdt",
      "us pacific",
      "usa",
      "united states",
      "la",
      "los angeles",
    ],
  },
  {
    id: "America/Phoenix",
    city: "Phoenix",
    region: "USA",
    country: "United States",
    label: "Arizona Time",
    searchAliases: ["arizona", "phoenix", "usa", "united states"],
  },
  {
    id: "America/Toronto",
    city: "Toronto",
    region: "Canada",
    country: "Canada",
    label: "Eastern Time",
    searchAliases: [
      "eastern",
      "eastern time",
      "et",
      "est",
      "edt",
      "canada",
      "toronto",
    ],
  },
  {
    id: "America/Vancouver",
    city: "Vancouver",
    region: "Canada",
    country: "Canada",
    label: "Pacific Time",
    searchAliases: [
      "pacific",
      "pacific time",
      "pt",
      "pst",
      "pdt",
      "canada",
      "vancouver",
    ],
  },
  {
    id: "America/Mexico_City",
    city: "Mexico City",
    region: "Mexico",
    country: "Mexico",
    label: "Central Time",
    searchAliases: ["central", "central time", "mexico", "cst", "mexico city"],
  },
  {
    id: "America/Sao_Paulo",
    city: "São Paulo",
    region: "Brazil",
    country: "Brazil",
    label: "Brasília Time",
    searchAliases: ["brazil", "sao paulo", "brasília", "brasilia"],
  },
  {
    id: "America/Argentina/Buenos_Aires",
    city: "Buenos Aires",
    region: "Argentina",
    country: "Argentina",
    label: "Argentina Time",
    searchAliases: ["argentina", "buenos aires"],
  },
  {
    id: "America/Bogota",
    city: "Bogotá",
    region: "Colombia",
    country: "Colombia",
    label: "Colombia Time",
    searchAliases: ["colombia", "bogota", "bogotá"],
  },
  {
    id: "America/Lima",
    city: "Lima",
    region: "Peru",
    country: "Peru",
    label: "Peru Time",
    searchAliases: ["peru", "lima"],
  },
  {
    id: "America/Santiago",
    city: "Santiago",
    region: "Chile",
    country: "Chile",
    label: "Chile Time",
    searchAliases: ["chile", "santiago"],
  },
  {
    id: "Asia/Tokyo",
    city: "Tokyo",
    region: "Japan",
    country: "Japan",
    label: "Japan Time",
    searchAliases: ["japan", "jst", "tokyo"],
  },
  {
    id: "Asia/Seoul",
    city: "Seoul",
    region: "South Korea",
    country: "South Korea",
    label: "Korea Time",
    searchAliases: ["korea", "kst", "seoul", "south korea"],
  },
  {
    id: "Asia/Shanghai",
    city: "Shanghai",
    region: "China",
    country: "China",
    label: "China Time",
    searchAliases: ["china", "cst china", "shanghai"],
  },
  {
    id: "Asia/Hong_Kong",
    city: "Hong Kong",
    region: "China",
    country: "China",
    label: "Hong Kong Time",
    searchAliases: ["hong kong", "hkt"],
  },
  {
    id: "Asia/Singapore",
    city: "Singapore",
    region: "Singapore",
    country: "Singapore",
    label: "Singapore Time",
    searchAliases: ["singapore", "sgt"],
  },
  {
    id: "Asia/Bangkok",
    city: "Bangkok",
    region: "Thailand",
    country: "Thailand",
    label: "Indochina Time",
    searchAliases: ["thailand", "bangkok", "ict"],
  },
  {
    id: "Asia/Jakarta",
    city: "Jakarta",
    region: "Indonesia",
    country: "Indonesia",
    label: "Western Indonesia Time",
    searchAliases: ["indonesia", "jakarta", "wib"],
  },
  {
    id: "Asia/Kolkata",
    city: "Kolkata",
    region: "India",
    country: "India",
    label: "India Time",
    searchAliases: ["india", "ist india", "kolkata", "mumbai", "delhi"],
  },
  {
    id: "Asia/Dubai",
    city: "Dubai",
    region: "UAE",
    country: "United Arab Emirates",
    label: "Gulf Time",
    searchAliases: ["dubai", "uae", "gst", "united arab emirates"],
  },
  {
    id: "Asia/Tel_Aviv",
    city: "Tel Aviv",
    region: "Israel",
    country: "Israel",
    label: "Israel Time",
    searchAliases: ["israel", "tel aviv", "ist israel"],
  },
  {
    id: "Australia/Sydney",
    city: "Sydney",
    region: "Australia",
    country: "Australia",
    label: "Australian Eastern Time",
    searchAliases: [
      "sydney",
      "aest",
      "aedt",
      "australian eastern",
      "australia",
    ],
  },
  {
    id: "Australia/Melbourne",
    city: "Melbourne",
    region: "Australia",
    country: "Australia",
    label: "Australian Eastern Time",
    searchAliases: [
      "melbourne",
      "aest",
      "aedt",
      "australian eastern",
      "australia",
    ],
  },
  {
    id: "Australia/Perth",
    city: "Perth",
    region: "Australia",
    country: "Australia",
    label: "Australian Western Time",
    searchAliases: ["perth", "awst", "australian western", "australia"],
  },
  {
    id: "Pacific/Auckland",
    city: "Auckland",
    region: "New Zealand",
    country: "New Zealand",
    label: "New Zealand Time",
    searchAliases: ["new zealand", "auckland", "nzst", "nzdt"],
  },
  {
    id: "Africa/Johannesburg",
    city: "Johannesburg",
    region: "South Africa",
    country: "South Africa",
    label: "South Africa Time",
    searchAliases: ["south africa", "johannesburg", "sast"],
  },
  {
    id: "Africa/Cairo",
    city: "Cairo",
    region: "Egypt",
    country: "Egypt",
    label: "Egypt Time",
    searchAliases: ["egypt", "cairo"],
  },
  {
    id: "Africa/Lagos",
    city: "Lagos",
    region: "Nigeria",
    country: "Nigeria",
    label: "West Africa Time",
    searchAliases: ["nigeria", "lagos", "wat"],
  },
] as const;

export function findReleaseTimezoneOption(
  id: string | null | undefined,
): ReleaseTimezoneOption | null {
  if (!id) return null;
  return RELEASE_TIMEZONE_OPTIONS.find((z) => z.id === id) ?? null;
}

/** Primary location line: "London, England". */
export function formatReleaseTimezoneLocation(
  option: ReleaseTimezoneOption,
): string {
  return `${option.city}, ${option.region}`;
}

/** Build searchable haystack for an option (city, region, country, label, IANA, aliases). */
export function releaseTimezoneSearchHaystack(
  option: ReleaseTimezoneOption,
): string {
  return [
    option.city,
    option.region,
    option.country,
    option.label,
    option.id,
    option.id.replace(/_/g, " "),
    ...option.searchAliases,
  ]
    .join(" ")
    .toLowerCase();
}

export type FilterReleaseTimezoneOptionsArgs = {
  query: string;
  /** YYYY-MM-DD — used when matching UTC±N offset queries. */
  releaseDateYmd?: string;
  /** HH:mm wall time for offset matching; defaults to 12:00. */
  timeLocalHhmm?: string;
  /** Offset formatter injected to avoid circular imports in tests. */
  formatOffset?: (args: {
    timeZone: string;
    releaseDateYmd: string;
    timeLocalHhmm?: string;
  }) => string;
};

function normalizeOffsetQuery(q: string): string | null {
  const trimmed = q.trim().toLowerCase().replace(/\s+/g, "");
  const m = /^(?:utc|gmt)([+-])(\d{1,2})(?::?([0-5]\d))?$/.exec(trimmed);
  if (!m) return null;
  const sign = m[1];
  const hours = Number(m[2]);
  const mins = m[3] ? Number(m[3]) : 0;
  if (hours > 14) return null;
  if (mins === 0) return `UTC${sign}${hours}`;
  return `UTC${sign}${hours}:${String(mins).padStart(2, "0")}`;
}

export function filterReleaseTimezoneOptions(
  queryOrArgs: string | FilterReleaseTimezoneOptionsArgs,
): ReleaseTimezoneOption[] {
  const args: FilterReleaseTimezoneOptionsArgs =
    typeof queryOrArgs === "string" ? { query: queryOrArgs } : queryOrArgs;
  const q = args.query.trim().toLowerCase();
  if (!q) return [...RELEASE_TIMEZONE_OPTIONS];

  const offsetTarget = normalizeOffsetQuery(q);
  if (offsetTarget && args.formatOffset && args.releaseDateYmd) {
    return RELEASE_TIMEZONE_OPTIONS.filter((z) => {
      const offset = args.formatOffset!({
        timeZone: z.id,
        releaseDateYmd: args.releaseDateYmd!,
        timeLocalHhmm: args.timeLocalHhmm,
      });
      return offset.replace(/\s+/g, "").toUpperCase() === offsetTarget.toUpperCase();
    });
  }

  return RELEASE_TIMEZONE_OPTIONS.filter((z) =>
    releaseTimezoneSearchHaystack(z).includes(q),
  );
}

/** Device IANA timezone, or null if unresolved (fail closed — do not invent UTC). */
export function resolveDeviceIanaTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === "string" && tz.includes("/")) return tz;
  } catch {
    /* ignore */
  }
  return null;
}
