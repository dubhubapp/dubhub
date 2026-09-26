/**
 * MailerLite unsubscribe / forget for account deletion.
 * Best-effort: missing subscriber = success; external failure does not block Auth wipe.
 *
 * Uses GDPR "forget" when possible; falls back to DELETE.
 * Does not store email on account_deletion_jobs.
 */

export type MailerLiteForgetResult =
  | { ok: true; outcome: "forgotten" | "deleted" | "already_absent" | "not_configured" }
  | { ok: false; outcome: "error"; code: string };

export type MailerLiteForgetDeps = {
  apiKey?: string | null;
  fetchFn?: typeof fetch;
};

/**
 * Remove marketing subscriber for the deleting user's email.
 * Call while email is still available (before Auth delete).
 */
export async function forgetMailerLiteSubscriberByEmail(
  email: string,
  deps: MailerLiteForgetDeps = {},
): Promise<MailerLiteForgetResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, outcome: "error", code: "invalid_email" };
  }

  const apiKey =
    deps.apiKey !== undefined
      ? deps.apiKey
      : (process.env.MAILERLITE_API_KEY ?? null);
  if (!apiKey) {
    return { ok: true, outcome: "not_configured" };
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    const encoded = encodeURIComponent(trimmed);
    const getRes = await fetchFn(
      `https://connect.mailerlite.com/api/subscribers/${encoded}`,
      { method: "GET", headers },
    );

    if (getRes.status === 404) {
      return { ok: true, outcome: "already_absent" };
    }

    if (!getRes.ok) {
      console.error("[mailerlite] fetch subscriber failed", {
        status: getRes.status,
      });
      return { ok: false, outcome: "error", code: "fetch_failed" };
    }

    const body = (await getRes.json()) as { data?: { id?: string } };
    const id = body?.data?.id;
    if (!id) {
      return { ok: false, outcome: "error", code: "missing_subscriber_id" };
    }

    const forgetRes = await fetchFn(
      `https://connect.mailerlite.com/api/subscribers/${id}/forget`,
      { method: "POST", headers },
    );

    if (forgetRes.ok || forgetRes.status === 404) {
      return {
        ok: true,
        outcome: forgetRes.status === 404 ? "already_absent" : "forgotten",
      };
    }

    // Fallback: plain delete (keeps history in MailerLite; still removes from list)
    const deleteRes = await fetchFn(
      `https://connect.mailerlite.com/api/subscribers/${id}`,
      { method: "DELETE", headers },
    );

    if (deleteRes.ok || deleteRes.status === 204 || deleteRes.status === 404) {
      return {
        ok: true,
        outcome: deleteRes.status === 404 ? "already_absent" : "deleted",
      };
    }

    console.error("[mailerlite] forget/delete failed", {
      forgetStatus: forgetRes.status,
      deleteStatus: deleteRes.status,
    });
    return { ok: false, outcome: "error", code: "forget_failed" };
  } catch {
    console.error("[mailerlite] unexpected error during forget");
    return { ok: false, outcome: "error", code: "network_error" };
  }
}
