import { sql } from "drizzle-orm";
import { db } from "./db";

export type AnalyticsEventType =
  | "post_uploaded"
  | "post_liked"
  | "comment_created"
  | "artist_confirmed_id"
  | "artist_denied_id"
  | "release_created"
  | "release_published"
  | "release_updated";

type EventMetadata = Record<string, unknown>;

export interface LogEventInput {
  event_type: AnalyticsEventType;
  user_id?: string | null;
  post_id?: string | null;
  release_id?: string | null;
  metadata?: EventMetadata | null;
}

/**
 * Best-effort analytics logging.
 * Failures should never impact the caller's main product flow.
 */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    const metadataJson =
      input.metadata && Object.keys(input.metadata).length > 0
        ? JSON.stringify(input.metadata)
        : null;

    await db.execute(sql`
      INSERT INTO events (event_type, user_id, post_id, release_id, metadata, created_at)
      VALUES (
        ${input.event_type},
        ${input.user_id ?? null},
        ${input.post_id ?? null},
        ${input.release_id ?? null},
        ${metadataJson}::jsonb,
        NOW()
      )
    `);
  } catch (error) {
    console.error("[analytics] Failed to log event:", {
      eventType: input.event_type,
      userId: input.user_id ?? null,
      postId: input.post_id ?? null,
      releaseId: input.release_id ?? null,
      error,
    });
  }
}
