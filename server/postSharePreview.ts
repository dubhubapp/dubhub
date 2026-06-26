import type { Express, NextFunction, Request, Response } from "express";
import { getCanonicalGenreLabel } from "@shared/report-genre";
import { isAllowedPostThumbnailUrl } from "./postThumbnailUrl";
import { storage } from "./storage";

/** Canonical public origin for og:url (matches client share links). */
export const DUBHUB_PUBLIC_SHARE_ORIGIN = "https://dubhub.uk";

const SITE_NAME = "dub hub";
const TITLE_SUFFIX = " | dub hub";
const DEFAULT_PAGE_TITLE = `Track ID${TITLE_SUFFIX}`;
const DEFAULT_IMAGE_ALT = "Track ID on dub hub";
const DEFAULT_DESCRIPTION =
  "Discover and identify underground tracks on dub hub — the UK's music identification collective.";

const OG_LOCALE = "en_GB";
const OG_DESCRIPTION_MAX = 200;
const OG_TITLE_MAX = 80;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncateSharePreviewText(value: string, maxLen: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function truncate(value: string, maxLen: number): string {
  return truncateSharePreviewText(value, maxLen);
}

function normalizePostId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id || id.length > 128) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id) && !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return id;
}

function buildCanonicalShareUrl(postId: string): string {
  return `${DUBHUB_PUBLIC_SHARE_ORIGIN}/?post=${encodeURIComponent(postId)}`;
}

export function resolveDefaultOgImageUrl(req: Request): string | null {
  const fromEnv = String(process.env.SHARE_PREVIEW_DEFAULT_IMAGE_URL ?? "").trim();
  if (fromEnv) return fromEnv;

  const protoHeader = req.get("x-forwarded-proto");
  const hostHeader = req.get("x-forwarded-host") || req.get("host");
  const proto = protoHeader?.split(",")[0]?.trim() || req.protocol || "https";
  const host = hostHeader?.split(",")[0]?.trim();
  if (host) {
    return `${proto}://${host}/og-default.png`;
  }

  return `${DUBHUB_PUBLIC_SHARE_ORIGIN}/og-default.png`;
}

type SharePreviewPost = {
  genre?: string | null;
  description?: string | null;
  verificationStatus?: string | null;
  isVerifiedArtist?: boolean | null;
  verifiedByModerator?: boolean | null;
  likes?: number | null;
  comments?: number | null;
  user?: { username?: string | null };
};

/** Share-preview only — two labels; in-app badges use separate logic. */
function resolveShareStatusLabel(post: SharePreviewPost): string {
  if (post.isVerifiedArtist === true || post.verifiedByModerator === true) {
    return "Identified";
  }

  const status =
    typeof post.verificationStatus === "string"
      ? post.verificationStatus.trim().toLowerCase()
      : "";

  if (
    status === "identified" ||
    status === "community" ||
    status === "community_approved"
  ) {
    return "Identified";
  }

  return "Unidentified";
}

function buildPageTitle(rawTitle: string | null | undefined): string {
  const base =
    typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : "Track ID";
  return truncate(`${base}${TITLE_SUFFIX}`, OG_TITLE_MAX);
}

function buildImageAlt(rawTitle: string | null | undefined): string {
  const base =
    typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : "Track ID";
  return truncate(`${base} on dub hub`, OG_DESCRIPTION_MAX);
}

function buildPostDescription(post: SharePreviewPost): string {
  const parts: string[] = [resolveShareStatusLabel(post)];

  const genreLabel = getCanonicalGenreLabel(post.genre);
  if (genreLabel !== "Unknown") {
    parts.push(genreLabel);
  }

  const username =
    typeof post.user?.username === "string" && post.user.username.trim()
      ? post.user.username.trim()
      : null;
  if (username) {
    parts.push(`@${username}`);
  }

  const comments = Number(post.comments ?? 0);
  const likes = Number(post.likes ?? 0);
  if (comments > 0) {
    parts.push(`${comments} comments`);
  }
  if (likes > 0) {
    parts.push(`${likes} likes`);
  }

  return truncate(parts.join(" · "), OG_DESCRIPTION_MAX);
}

type SharePreviewMeta = {
  pageTitle: string;
  description: string;
  ogUrl: string;
  ogImage: string | null;
  ogImageAlt: string;
};

export function buildSharePreviewHtml(meta: SharePreviewMeta): string {
  const title = escapeHtml(meta.pageTitle);
  const desc = escapeHtml(meta.description);
  const url = escapeHtml(meta.ogUrl);
  const siteName = escapeHtml(SITE_NAME);
  const locale = escapeHtml(OG_LOCALE);
  const imageAlt = escapeHtml(meta.ogImageAlt);
  const imageLines =
    meta.ogImage != null && meta.ogImage.trim() !== ""
      ? `  <meta property="og:image" content="${escapeHtml(meta.ogImage.trim())}" />\n` +
        `  <meta property="og:image:alt" content="${imageAlt}" />\n` +
        `  <meta name="twitter:image" content="${escapeHtml(meta.ogImage.trim())}" />\n`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="${siteName}" />
  <meta property="og:locale" content="${locale}" />
  <meta property="og:type" content="website" />
${imageLines}  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
</head>
<body>
  <p>${desc}</p>
</body>
</html>`;
}

export function sendSharePreviewHtml(res: Response, html: string): void {
  res
    .status(200)
    .type("html")
    .set("Cache-Control", "public, max-age=300")
    .send(html);
}

async function sendSharePreviewForPostId(
  req: Request,
  res: Response,
  postId: string | null,
  rawPostParam: string | null,
): Promise<void> {
  const defaultImage = resolveDefaultOgImageUrl(req);
  const fallbackUrl =
    postId != null
      ? buildCanonicalShareUrl(postId)
      : rawPostParam != null
        ? `${DUBHUB_PUBLIC_SHARE_ORIGIN}/?post=${encodeURIComponent(rawPostParam)}`
        : `${DUBHUB_PUBLIC_SHARE_ORIGIN}/`;

  const genericMeta: SharePreviewMeta = {
    pageTitle: DEFAULT_PAGE_TITLE,
    description: DEFAULT_DESCRIPTION,
    ogUrl: fallbackUrl,
    ogImage: defaultImage,
    ogImageAlt: DEFAULT_IMAGE_ALT,
  };

  if (postId == null) {
    sendSharePreviewHtml(res, buildSharePreviewHtml(genericMeta));
    return;
  }

  try {
    const post = await storage.getPost(postId);

    if (!post) {
      sendSharePreviewHtml(
        res,
        buildSharePreviewHtml({ ...genericMeta, ogUrl: buildCanonicalShareUrl(postId) }),
      );
      return;
    }

    const rawTitle = typeof post.title === "string" ? post.title.trim() : "";
    const pageTitle = buildPageTitle(rawTitle);
    const description = buildPostDescription(post);
    const ogImageAlt = buildImageAlt(rawTitle);
    const thumbnail =
      typeof post.thumbnailUrl === "string" ? post.thumbnailUrl.trim() : "";
    const ogImage =
      thumbnail && isAllowedPostThumbnailUrl(thumbnail) ? thumbnail : defaultImage;

    sendSharePreviewHtml(
      res,
      buildSharePreviewHtml({
        pageTitle,
        description,
        ogUrl: buildCanonicalShareUrl(postId),
        ogImage,
        ogImageAlt,
      }),
    );
  } catch (err) {
    console.error("[postSharePreview] failed to load post", { postId, err });
    sendSharePreviewHtml(
      res,
      buildSharePreviewHtml({ ...genericMeta, ogUrl: buildCanonicalShareUrl(postId) }),
    );
  }
}

/**
 * GET /?post=<id> — server-rendered Open Graph HTML for link previews.
 * Must register before SPA static fallback.
 */
export function registerPostSharePreviewRoutes(app: Express): void {
  app.get("/", (req: Request, res: Response, next: NextFunction) => {
    if (!Object.prototype.hasOwnProperty.call(req.query, "post")) {
      next();
      return;
    }

    const raw = req.query.post;
    const rawPostParam =
      typeof raw === "string" ? raw : Array.isArray(raw) && typeof raw[0] === "string" ? raw[0] : null;
    const postId = normalizePostId(rawPostParam);

    void sendSharePreviewForPostId(req, res, postId, rawPostParam).catch((err) => {
      console.error("[postSharePreview] unhandled error", err);
      if (res.headersSent) return;
      sendSharePreviewHtml(
        res,
        buildSharePreviewHtml({
          pageTitle: DEFAULT_PAGE_TITLE,
          description: DEFAULT_DESCRIPTION,
          ogUrl: DUBHUB_PUBLIC_SHARE_ORIGIN + "/",
          ogImage: resolveDefaultOgImageUrl(req),
          ogImageAlt: DEFAULT_IMAGE_ALT,
        }),
      );
    });
  });
}
