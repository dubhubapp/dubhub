import type { Express, NextFunction, Request, Response } from "express";
import {
  buildArtistProfileImageAlt,
  buildArtistProfilePageTitle,
  buildArtistProfileShareDescription,
  buildCanonicalArtistProfileShareUrl,
  isShareableVerifiedArtistProfile,
  normalizeArtistUsernameParam,
} from "./artistProfileShareMeta";
import {
  buildSharePreviewHtml,
  DUBHUB_PUBLIC_SHARE_ORIGIN,
  resolveDefaultOgImageUrl,
  sendSharePreviewHtml,
} from "./postSharePreview";
import { resolveArtistProfileShareOgImage } from "./profileMediaUrl";
import { storage } from "./storage";

const GENERIC_PAGE_TITLE = "dub hub";
const GENERIC_DESCRIPTION =
  "Discover and identify underground tracks on dub hub — the UK's music identification collective.";
const GENERIC_IMAGE_ALT = "dub hub";

function genericArtistProfileShareMeta(req: Request, ogUrl: string) {
  return {
    pageTitle: GENERIC_PAGE_TITLE,
    description: GENERIC_DESCRIPTION,
    ogUrl,
    ogImage: resolveDefaultOgImageUrl(req),
    ogImageAlt: GENERIC_IMAGE_ALT,
  };
}

async function sendSharePreviewForArtistUsername(
  req: Request,
  res: Response,
  username: string | null,
  rawArtistParam: string | null,
): Promise<void> {
  const fallbackUrl =
    username != null
      ? buildCanonicalArtistProfileShareUrl(username)
      : rawArtistParam != null
        ? `${DUBHUB_PUBLIC_SHARE_ORIGIN}/?artist=${encodeURIComponent(rawArtistParam)}`
        : `${DUBHUB_PUBLIC_SHARE_ORIGIN}/`;

  const genericMeta = genericArtistProfileShareMeta(req, fallbackUrl);

  if (username == null) {
    sendSharePreviewHtml(res, buildSharePreviewHtml(genericMeta));
    return;
  }

  try {
    const user = await storage.getUserByUsername(username);

    if (!user || !isShareableVerifiedArtistProfile(user)) {
      sendSharePreviewHtml(
        res,
        buildSharePreviewHtml({ ...genericMeta, ogUrl: buildCanonicalArtistProfileShareUrl(username) }),
      );
      return;
    }

    const pageTitle = buildArtistProfilePageTitle(user.username ?? username);
    const description = buildArtistProfileShareDescription(user.username ?? username);
    const ogImageAlt = buildArtistProfileImageAlt(user.username ?? username);
    const defaultImage = resolveDefaultOgImageUrl(req);
    const customImage = resolveArtistProfileShareOgImage(user.banner_url, user.avatar_url);
    const ogImage = customImage ?? defaultImage;

    sendSharePreviewHtml(
      res,
      buildSharePreviewHtml({
        pageTitle,
        description,
        ogUrl: buildCanonicalArtistProfileShareUrl(username),
        ogImage,
        ogImageAlt,
      }),
    );
  } catch (err) {
    console.error("[artistProfileSharePreview] failed to load profile", { username, err });
    sendSharePreviewHtml(
      res,
      buildSharePreviewHtml({ ...genericMeta, ogUrl: buildCanonicalArtistProfileShareUrl(username) }),
    );
  }
}

/**
 * GET /?artist=<username> — server-rendered Open Graph HTML for artist profile link previews.
 * Must register before SPA static fallback.
 *
 * Future: generate richer artist share cards with banner, avatar and latest release artwork.
 */
export function registerArtistProfileSharePreviewRoutes(app: Express): void {
  app.get("/", (req: Request, res: Response, next: NextFunction) => {
    if (!Object.prototype.hasOwnProperty.call(req.query, "artist")) {
      next();
      return;
    }

    const raw = req.query.artist;
    const rawArtistParam =
      typeof raw === "string" ? raw : Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : null;
    const username = normalizeArtistUsernameParam(rawArtistParam);

    void sendSharePreviewForArtistUsername(req, res, username, rawArtistParam).catch((err) => {
      console.error("[artistProfileSharePreview] unhandled error", err);
      if (res.headersSent) return;
      sendSharePreviewHtml(
        res,
        buildSharePreviewHtml(genericArtistProfileShareMeta(req, `${DUBHUB_PUBLIC_SHARE_ORIGIN}/`)),
      );
    });
  });
}
