/**
 * Diff existing release links vs draft for safe edit synchronisation.
 * Never clear-all-and-recreate.
 */

export type SyncableLink = {
  platform: string;
  url: string;
  linkType?: string | null;
};

export type LinkSyncPlan = {
  /** Unchanged platforms — skip network. */
  unchanged: string[];
  /** Same platform, URL and/or type changed. */
  updates: SyncableLink[];
  /** Platforms to delete (not in draft). */
  removals: string[];
  /** New platforms to insert. */
  inserts: SyncableLink[];
  /**
   * Exactly one removal + one insert with different platforms and
   * existing count === 1 → prefer atomic replace endpoint.
   */
  primaryReplace: {
    fromPlatform: string;
    next: SyncableLink;
  } | null;
};

function normPlatform(platform: string): string {
  const s = String(platform).trim().toLowerCase();
  if (s === "youtube") return "youtube_music";
  if (s === "apple") return "apple_music";
  return s;
}

function normType(linkType: string | null | undefined): string | null {
  if (linkType == null) return null;
  const s = String(linkType).trim().toLowerCase();
  return s || null;
}

function normUrl(url: string): string {
  return String(url).trim();
}

/**
 * Build a sync plan. When existing has exactly one link and draft has exactly
 * one different platform, primaryReplace is set and inserts/removals for that
 * pair are left empty so the caller uses the atomic replace API.
 */
export function planReleaseLinkSync(args: {
  existing: SyncableLink[];
  draft: SyncableLink[];
}): LinkSyncPlan {
  const existingMap = new Map<string, SyncableLink>();
  for (const link of args.existing) {
    existingMap.set(normPlatform(link.platform), {
      platform: normPlatform(link.platform),
      url: normUrl(link.url),
      linkType: normType(link.linkType),
    });
  }

  const draftMap = new Map<string, SyncableLink>();
  for (const link of args.draft) {
    // Last draft entry wins for duplicate platforms.
    draftMap.set(normPlatform(link.platform), {
      platform: normPlatform(link.platform),
      url: normUrl(link.url),
      linkType: normType(link.linkType),
    });
  }

  const unchanged: string[] = [];
  const updates: SyncableLink[] = [];
  const removals: string[] = [];
  const inserts: SyncableLink[] = [];

  for (const [platform, draftLink] of draftMap) {
    const existing = existingMap.get(platform);
    if (!existing) {
      inserts.push(draftLink);
      continue;
    }
    const sameUrl = existing.url === draftLink.url;
    const sameType = normType(existing.linkType) === normType(draftLink.linkType);
    if (sameUrl && sameType) {
      unchanged.push(platform);
    } else {
      updates.push(draftLink);
    }
  }

  for (const platform of existingMap.keys()) {
    if (!draftMap.has(platform)) {
      removals.push(platform);
    }
  }

  let primaryReplace: LinkSyncPlan["primaryReplace"] = null;
  if (
    existingMap.size === 1 &&
    draftMap.size === 1 &&
    removals.length === 1 &&
    inserts.length === 1
  ) {
    primaryReplace = {
      fromPlatform: removals[0],
      next: inserts[0],
    };
    return {
      unchanged: [],
      updates: [],
      removals: [],
      inserts: [],
      primaryReplace,
    };
  }

  return { unchanged, updates, removals, inserts, primaryReplace };
}
