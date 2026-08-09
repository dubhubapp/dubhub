/**
 * Race-safe enable path for Release Alerts with permanent demand-notification dedup.
 *
 * Membership (artist_release_alerts) toggles freely.
 * A separate marker row claims the one-time release_alert_enabled notification.
 * Marker insert + notification insert run in one transaction so a failed
 * notification rolls back the marker claim (recoverable on retry).
 */

export type VerifiedArtistGateProfile = {
  account_type?: string | null;
  verified_artist?: boolean | null;
};

export type ArtistReleaseAlertDemandEnableTx = {
  /** INSERT … ON CONFLICT DO NOTHING RETURNING — true if a new membership row was created. */
  insertMembership: (listenerId: string, artistId: string) => Promise<boolean>;
  /** INSERT … ON CONFLICT DO NOTHING RETURNING — true if this call claimed the first-enable marker. */
  claimDemandMarker: (listenerId: string, artistId: string) => Promise<boolean>;
  /** Insert release_alert_enabled for the artist; must throw on failure (no silent swallow). */
  insertDemandNotification: (args: {
    listenerId: string;
    artistId: string;
    message: string;
  }) => Promise<void>;
};

export type ArtistReleaseAlertDemandEnableDeps = {
  getArtist: (artistId: string) => Promise<VerifiedArtistGateProfile | null>;
  getListenerUsername: (listenerId: string) => Promise<string | null | undefined>;
  runInTransaction: <T>(fn: (tx: ArtistReleaseAlertDemandEnableTx) => Promise<T>) => Promise<T>;
};

export function isArtistOpenForReleaseAlertSubscriptions(
  artist: VerifiedArtistGateProfile,
): boolean {
  return artist.account_type === "artist" && artist.verified_artist === true;
}

export function formatReleaseAlertEnabledDemandMessage(rawUsername: string | null | undefined): string {
  const username = (rawUsername?.trim() || "Someone").replace(/^@+/, "");
  return `@${username} is waiting for your next release.`;
}

/**
 * Enable Release Alerts for listener→artist and create at most one demand notification ever.
 * Returns `{ created }` for the membership row (POST response contract unchanged).
 */
export async function enableArtistReleaseAlertWithDemandDedup(
  listenerId: string,
  artistId: string,
  deps: ArtistReleaseAlertDemandEnableDeps,
): Promise<{ created: boolean }> {
  if (!listenerId || !artistId) {
    throw new Error("INVALID_IDS");
  }
  if (listenerId === artistId) {
    throw new Error("SELF_ALERT_NOT_ALLOWED");
  }

  const artist = await deps.getArtist(artistId);
  if (!artist) {
    throw new Error("ARTIST_NOT_FOUND");
  }
  if (!isArtistOpenForReleaseAlertSubscriptions(artist)) {
    throw new Error("ARTIST_NOT_VERIFIED");
  }

  return deps.runInTransaction(async (tx) => {
    const created = await tx.insertMembership(listenerId, artistId);
    const claimedMarker = await tx.claimDemandMarker(listenerId, artistId);

    if (claimedMarker) {
      const username = await deps.getListenerUsername(listenerId);
      const message = formatReleaseAlertEnabledDemandMessage(username);
      // Must throw on failure so the transaction rolls back the marker claim.
      await tx.insertDemandNotification({
        listenerId,
        artistId,
        message,
      });
    }

    return { created };
  });
}
