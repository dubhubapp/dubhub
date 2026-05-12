import type { PostWithUser } from "@shared/schema";

/**
 * Single source of truth for reading post rows from one infinite-query "page" value.
 * Supports both `{ items: Post[] }` (FeedPage) and bare `Post[]` pages.
 */
export function feedPageRowItems(page: unknown): PostWithUser[] {
  try {
    if (Array.isArray(page)) {
      return page as PostWithUser[];
    }
    if (page !== null && typeof page === "object") {
      const items = (page as { items?: unknown }).items;
      return Array.isArray(items) ? (items as PostWithUser[]) : [];
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function describeFeedPageShapeForAudit(page: unknown): string {
  if (page === null) return "null";
  if (page === undefined) return "undefined";
  if (Array.isArray(page)) return `array(len=${page.length})`;
  if (typeof page === "object") {
    const items = (page as { items?: unknown }).items;
    if (Array.isArray(items)) return `object{items:array(len=${items.length})}`;
    return `object{items:${items === undefined ? "undefined" : typeof items}}`;
  }
  return typeof page;
}

export type FeedPagesFlattenAudit = {
  queryKey: unknown;
};

/**
 * Flattens TanStack infinite-query `data.pages` into a single post list without assuming
 * `page.items` is iterable (avoids flatMap + corrupt cache crashes in Safari).
 */
export function flattenInfiniteQueryFeedPages(
  pages: unknown,
  audit?: FeedPagesFlattenAudit,
): PostWithUser[] {
  try {
    if (!Array.isArray(pages)) {
      if (pages != null && audit) {
        console.log("[POSTS_SHAPE_AUDIT]", {
          queryKey: audit.queryKey,
          pageIndex: -1,
          pageShape: typeof pages,
          branch: "pages-not-array",
        });
      }
      return [];
    }

    const out: PostWithUser[] = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      let branch: string;

      if (Array.isArray(page)) {
        branch = "bare-array";
      } else if (page !== null && typeof page === "object") {
        const raw = (page as { items?: unknown }).items;
        if (Array.isArray(raw)) {
          branch = "object-items-array";
        } else {
          branch = "object-items-invalid";
          console.log("[POSTS_SHAPE_AUDIT]", {
            queryKey: audit?.queryKey,
            pageIndex: i,
            pageShape: describeFeedPageShapeForAudit(page),
            branch,
          });
        }
      } else {
        branch = page == null ? "null-page" : "non-object-page";
        if (page != null) {
          console.log("[POSTS_SHAPE_AUDIT]", {
            queryKey: audit?.queryKey,
            pageIndex: i,
            pageShape: describeFeedPageShapeForAudit(page),
            branch,
          });
        }
      }

      const rows = feedPageRowItems(page);
      for (let r = 0; r < rows.length; r++) {
        out.push(rows[r]!);
      }
    }
    return out;
  } catch (e) {
    console.log("[POSTS_SHAPE_AUDIT]", {
      queryKey: audit?.queryKey,
      pageIndex: -1,
      pageShape: "flatten-threw",
      branch: "exception",
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}
