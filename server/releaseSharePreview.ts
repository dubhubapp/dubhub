import type { Express, NextFunction, Request, Response } from "express";
import {
  buildSharePreviewHtml,
  DUBHUB_PUBLIC_SHARE_ORIGIN,
  resolveDefaultOgImageUrl,
  sendSharePreviewHtml,
  truncateSharePreviewText,
} from "./postSharePreview";
import { isAllowedReleaseArtworkUrl, resolveReleaseArtworkPublicUrl } from "./releaseArtworkUrl";
import { storage } from "./storage";

const GENERIC_PAGE_TITLE = "Release | dub hub";
const GENERIC_DESCRIPTION =
  "Discover and identify underground tracks on dub hub — the UK's music identification collective.";
const GENERIC_IMAGE_ALT = "Release on dub hub";

const OG_DESCRIPTION_MAX = 200;
const OG_TITLE_MAX = 80;

function normalizeReleaseId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id || id.length > 128) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id) && !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return id;
}

function buildCanonicalReleaseShareUrl(releaseId: string): string {
  return `${DUBHUB_PUBLIC_SHARE_ORIGIN}/?release=${encodeURIComponent(releaseId)}`;
}

function formatShareReleaseDate(releaseDate: string | null | undefined): string | null {
  if (!releaseDate) return null;
  const date = new Date(releaseDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isReleaseUpcomingForShare(
  isComingSoon: boolean | undefined,
  releaseDate: string | null | undefined,
): boolean {
  if (isComingSoon) return true;
  if (releaseDate) {
    const d = new Date(releaseDate);
    if (!Number.isNaN(d.getTime()) && d > new Date()) return true;
  }
  return false;
}

function buildReleaseShareDescription(
  isComingSoon: boolean | undefined,
  releaseDate: string | null | undefined,
): string {
  const upcoming = isReleaseUpcomingForShare(isComingSoon, releaseDate);
  const formattedDate = formatShareReleaseDate(releaseDate);

  if (upcoming) {
    if (formattedDate) return truncateSharePreviewText(`Coming ${formattedDate}`, OG_DESCRIPTION_MAX);
    return "Coming soon";
  }

  if (formattedDate) return truncateSharePreviewText(`Released ${formattedDate}`, OG_DESCRIPTION_MAX);
  return "Release on dub hub";
}

function buildReleasePageTitle(artistUsername: string | null | undefined, title: string | null | undefined): string {
  const artist =
    typeof artistUsername === "string" && artistUsername.trim() ? `@${artistUsername.trim()}` : "@Artist";
  const releaseTitle =
    typeof title === "string" && title.trim() ? title.trim() : "Release";
  return truncateSharePreviewText(`${artist} — ${releaseTitle}`, OG_TITLE_MAX);
}

function buildReleaseImageAlt(title: string | null | undefined): string {
  const base = typeof title === "string" && title.trim() ? title.trim() : "Release";
  return truncateSharePreviewText(`${base} on dub hub`, OG_DESCRIPTION_MAX);
}

function genericReleaseShareMeta(req: Request, ogUrl: string) {
  return {
    pageTitle: GENERIC_PAGE_TITLE,
    description: GENERIC_DESCRIPTION,
    ogUrl,
    ogImage: resolveDefaultOgImageUrl(req),
    ogImageAlt: GENERIC_IMAGE_ALT,
  };
}

async function sendSharePreviewForReleaseId(
  req: Request,
  res: Response,
  releaseId: string | null,
  rawReleaseParam: string | null,
): Promise<void> {
  const fallbackUrl =
    releaseId != null
      ? buildCanonicalReleaseShareUrl(releaseId)
      : rawReleaseParam != null
        ? `${DUBHUB_PUBLIC_SHARE_ORIGIN}/?release=${encodeURIComponent(rawReleaseParam)}`
        : `${DUBHUB_PUBLIC_SHARE_ORIGIN}/`;

  const genericMeta = genericReleaseShareMeta(req, fallbackUrl);

  if (releaseId == null) {
    sendSharePreviewHtml(res, buildSharePreviewHtml(genericMeta));
    return;
  }

  try {
    const release = await storage.getRelease(releaseId);

    if (!release || release.isPublic !== true) {
      sendSharePreviewHtml(
        res,
        buildSharePreviewHtml({ ...genericMeta, ogUrl: buildCanonicalReleaseShareUrl(releaseId) }),
      );
      return;
    }

    const pageTitle = buildReleasePageTitle(release.artistUsername, release.title);
    const description = buildReleaseShareDescription(release.isComingSoon, release.releaseDate);
    const ogImageAlt = buildReleaseImageAlt(release.title);
    const artworkPublic = resolveReleaseArtworkPublicUrl(release.artworkUrl);
    const defaultImage = resolveDefaultOgImageUrl(req);
    const ogImage =
      artworkPublic && isAllowedReleaseArtworkUrl(artworkPublic) ? artworkPublic : defaultImage;

    sendSharePreviewHtml(
      res,
      buildSharePreviewHtml({
        pageTitle,
        description,
        ogUrl: buildCanonicalReleaseShareUrl(releaseId),
        ogImage,
        ogImageAlt,
      }),
    );
  } catch (err) {
    console.error("[releaseSharePreview] failed to load release", { releaseId, err });
    sendSharePreviewHtml(
      res,
      buildSharePreviewHtml({ ...genericMeta, ogUrl: buildCanonicalReleaseShareUrl(releaseId) }),
    );
  }
}

/**
 * GET /?release=<id> — server-rendered Open Graph HTML for release link previews.
 * Must register before SPA static fallback.
 */
export function registerReleaseSharePreviewRoutes(app: Express): void {
  app.get("/", (req: Request, res: Response, next: NextFunction) => {
    if (!Object.prototype.hasOwnProperty.call(req.query, "release")) {
      next();
      return;
    }

    const raw = req.query.release;
    const rawReleaseParam =
      typeof raw === "string" ? raw : Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : null;
    const releaseId = normalizeReleaseId(rawReleaseParam);

    void sendSharePreviewForReleaseId(req, res, releaseId, rawReleaseParam).catch((err) => {
      console.error("[releaseSharePreview] unhandled error", err);
      if (res.headersSent) return;
      sendSharePreviewHtml(
        res,
        buildSharePreviewHtml(
          genericReleaseShareMeta(req, `${DUBHUB_PUBLIC_SHARE_ORIGIN}/`),
        ),
      );
    });
  });
}
