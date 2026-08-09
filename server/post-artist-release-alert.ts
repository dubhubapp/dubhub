import type { Response } from "express";

type ReleaseAlertPostRequest = {
  dbUser?: { id: string } | null;
  params: { artistId: string };
};

type EnableArtistReleaseAlert = (
  userId: string,
  artistId: string,
) => Promise<{ created: boolean }>;

type ResolveDeliveryEnabled = (artistId: string) => Promise<boolean>;

/**
 * POST /api/artists/:artistId/release-alert — single success response; headersSent-safe catch.
 * deliveryEnabled is evaluated after membership succeeds and never rolls back opt-in.
 */
export async function handlePostArtistReleaseAlert(
  req: ReleaseAlertPostRequest,
  res: Response,
  enableArtistReleaseAlert: EnableArtistReleaseAlert,
  resolveDeliveryEnabled?: ResolveDeliveryEnabled,
): Promise<void> {
  try {
    if (!req.dbUser) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    const artistId = req.params.artistId;
    if (req.dbUser.id === artistId) {
      res.status(400).json({ message: "Cannot enable release alerts for yourself" });
      return;
    }
    try {
      const { created } = await enableArtistReleaseAlert(req.dbUser.id, artistId);
      let deliveryEnabled = false;
      if (resolveDeliveryEnabled) {
        try {
          deliveryEnabled = (await resolveDeliveryEnabled(artistId)) === true;
        } catch {
          deliveryEnabled = false;
        }
      }
      res.json({ enabled: true, created, deliveryEnabled });
      return;
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "ARTIST_NOT_FOUND" || code === "ARTIST_NOT_VERIFIED") {
        res.status(404).json({ message: "Artist not found" });
        return;
      }
      if (code === "SELF_ALERT_NOT_ALLOWED") {
        res.status(400).json({ message: "Cannot enable release alerts for yourself" });
        return;
      }
      throw err;
    }
  } catch (error) {
    console.error("[/api/artists/:artistId/release-alert] POST Error:", error);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ message: "Failed to enable release alerts" });
  }
}
