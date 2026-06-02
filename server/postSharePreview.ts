import type { Express, NextFunction, Request, Response } from "express";
import { getCanonicalGenreLabel } from "@shared/report-genre";
import { isAllowedPostThumbnailUrl } from "./postThumbnailUrl";
import { storage } from "./storage";

/** Canonical public origin for og:url (matches client share links). */
export const DUBHUB_PUBLIC_SHARE_ORIGIN = "https://dubhub.uk";

const SITE_NAME = "dub hub";
const DEFAULT_TITLE = "Track ID on dub hub";
const DEFAULT_DESCRIPTION =
  "Discover and identify underground tracks on dub hub — the UK's music identification collective.";

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

function truncate(value: string, maxLen: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
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

function resolveDefaultOgImageUrl(req: Request): string | null {
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

function buildPostDescription(post: {
  genre?: string | null;
  user?: { username?: string | null };
}): string {
  const genreLabel = getCanonicalGenreLabel(post.genre);
  const username =
    typeof post.user?.username === "string" && post.user.username.trim()
      ? post.user.username.trim()
      : null;

  if (username && genreLabel !== "Unknown") {
    return truncate(`${genreLabel} · @${username} on dub hub`, OG_DESCRIPTION_MAX);
  }
  if (username) {
    return truncate(`Track ID · @${username} on dub hub`, OG_DESCRIPTION_MAX);
  }
  if (genreLabel !== "Unknown") {
    return truncate(`${genreLabel} on dub hub`, OG_DESCRIPTION_MAX);
  }
  return DEFAULT_DESCRIPTION;
}

type SharePreviewMeta = {
  pageTitle: string;
  description: string;
  ogUrl: string;
  ogImage: string | null;
};

export function buildSharePreviewHtml(meta: SharePreviewMeta): string {
  const title = escapeHtml(meta.pageTitle);
  const desc = escapeHtml(meta.description);
  const url = escapeHtml(meta.ogUrl);
  const siteName = escapeHtml(SITE_NAME);
  const imageLines =
    meta.ogImage != null && meta.ogImage.trim() !== ""
      ? `  <meta property="og:image" content="${escapeHtml(meta.ogImage.trim())}" />\n` +
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

function sendSharePreviewHtml(res: Response, html: string): void {
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
    pageTitle: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    ogUrl: fallbackUrl,
    ogImage: defaultImage,
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
    const pageTitle = truncate(rawTitle || DEFAULT_TITLE, OG_TITLE_MAX);
    const description = buildPostDescription(post);
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
          pageTitle: DEFAULT_TITLE,
          description: DEFAULT_DESCRIPTION,
          ogUrl: DUBHUB_PUBLIC_SHARE_ORIGIN + "/",
          ogImage: resolveDefaultOgImageUrl(req),
        }),
      );
    });
  });
}
