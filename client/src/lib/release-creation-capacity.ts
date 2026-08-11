/**
 * Create Release capacity copy and FREE_RELEASE_LIMIT_REACHED friendly fallback.
 * Display never mentions the rolling 12-month window.
 */

export const RELEASE_CREATION_CAPACITY_QUERY_KEY = [
  "/api/releases/creation-capacity",
] as const;

export const FREE_RELEASE_LIMIT_REACHED_CODE = "FREE_RELEASE_LIMIT_REACHED" as const;

export type ReleaseCreationCapacity = {
  unlimited: boolean;
  used: number;
  limit: number;
  remaining: number;
  canCreate: boolean;
};

export type ReleaseCapacityCardCopy = {
  title: string;
  body: string;
  showUpgrade: boolean;
};

export const RELEASE_LIMIT_REACHED_TOAST = {
  title: "Release limit reached",
  body: "You've used your 2 free releases. Upgrade for unlimited releases.",
} as const;

export const UPGRADE_PLACEHOLDER_HINT = "Purchase options coming soon" as const;

export const CREATE_RELEASE_UPGRADE_CTA = "Upgrade for unlimited releases" as const;

export type CreateReleaseBottomCapacity = {
  createBlocked: boolean;
  countLabel: string | null;
  showUpgrade: boolean;
  upgradeLabel: typeof CREATE_RELEASE_UPGRADE_CTA;
};

/**
 * Bottom-of-page Create capacity presentation.
 * Does not change canCreate / entitlement — only where copy/CTA appear.
 * Top-of-page capacity card is no longer part of this contract.
 */
export function resolveCreateReleaseBottomCapacity(
  capacity: ReleaseCreationCapacity | null | undefined,
): CreateReleaseBottomCapacity {
  if (!capacity) {
    return {
      createBlocked: false,
      countLabel: null,
      showUpgrade: false,
      upgradeLabel: CREATE_RELEASE_UPGRADE_CTA,
    };
  }
  const createBlocked = capacity.canCreate === false;
  if (!createBlocked) {
    return {
      createBlocked: false,
      countLabel: null,
      showUpgrade: false,
      upgradeLabel: CREATE_RELEASE_UPGRADE_CTA,
    };
  }
  return {
    createBlocked: true,
    countLabel: capacity.unlimited
      ? null
      : `${capacity.limit} of ${capacity.limit} free releases used`,
    showUpgrade: true,
    upgradeLabel: CREATE_RELEASE_UPGRADE_CTA,
  };
}

export function parseReleaseCreationCapacity(
  value: unknown,
): ReleaseCreationCapacity | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.unlimited !== "boolean") return null;
  if (typeof record.used !== "number" || !Number.isFinite(record.used)) return null;
  if (typeof record.limit !== "number" || !Number.isFinite(record.limit)) return null;
  if (typeof record.remaining !== "number" || !Number.isFinite(record.remaining)) {
    return null;
  }
  if (typeof record.canCreate !== "boolean") return null;
  return {
    unlimited: record.unlimited,
    used: Math.max(0, Math.floor(record.used)),
    limit: Math.max(0, Math.floor(record.limit)),
    remaining: Math.max(0, Math.floor(record.remaining)),
    canCreate: record.canCreate,
  };
}

/** Build title/body/upgrade visibility for the capacity card. */
export function resolveReleaseCapacityCardCopy(
  capacity: ReleaseCreationCapacity,
): ReleaseCapacityCardCopy {
  if (capacity.unlimited) {
    return {
      title: "Unlimited releases",
      body: "You're subscribed to Verified Artist Tools.",
      showUpgrade: false,
    };
  }

  const used = Math.min(capacity.used, capacity.limit);
  if (capacity.remaining <= 0 || capacity.used >= capacity.limit) {
    return {
      title: `${capacity.limit} of ${capacity.limit} free releases used`,
      body: "You've reached your free release limit. Upgrade for unlimited releases.",
      showUpgrade: true,
    };
  }

  if (capacity.used === 1 || capacity.remaining === 1) {
    return {
      title: `1 of ${capacity.limit} free releases used`,
      body: "You can create one more release. Upgrade for unlimited releases.",
      showUpgrade: true,
    };
  }

  // 0 used (2 remaining)
  return {
    title: `${used} of ${capacity.limit} free releases used`,
    body: "You can create 2 free releases. Upgrade for unlimited releases.",
    showUpgrade: true,
  };
}

export function isFreeReleaseLimitReachedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (status !== 403) return false;

  const body =
    typeof (error as { responseBody?: unknown }).responseBody === "string"
      ? (error as { responseBody: string }).responseBody
      : typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";

  if (body.includes(FREE_RELEASE_LIMIT_REACHED_CODE)) return true;

  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return parsed?.code === FREE_RELEASE_LIMIT_REACHED_CODE;
  } catch {
    return false;
  }
}
