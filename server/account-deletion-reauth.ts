/**
 * Password reauth for account deletion — anon client, no session persistence.
 * Never logs or stores the password.
 */

import { createClient } from "@supabase/supabase-js";

export type PasswordReauthResult =
  | { ok: true }
  | { ok: false; code: "wrong_password" | "no_email" | "reauth_unavailable" | "reauth_failed" };

export type PasswordReauthDeps = {
  supabaseUrl?: string;
  anonKey?: string;
  signInWithPassword?: (args: {
    email: string;
    password: string;
  }) => Promise<{ error: { message?: string } | null }>;
};

export async function reauthWithEmailPassword(args: {
  email: string | null | undefined;
  password: string;
  deps?: PasswordReauthDeps;
}): Promise<PasswordReauthResult> {
  const email = typeof args.email === "string" ? args.email.trim() : "";
  if (!email) {
    return { ok: false, code: "no_email" };
  }
  if (!args.password || args.password.length < 1) {
    return { ok: false, code: "wrong_password" };
  }

  const deps = args.deps ?? {};
  if (deps.signInWithPassword) {
    const { error } = await deps.signInWithPassword({
      email,
      password: args.password,
    });
    if (!error) return { ok: true };
    const msg = (error.message ?? "").toLowerCase();
    if (
      msg.includes("invalid login") ||
      msg.includes("invalid credentials") ||
      msg.includes("email not confirmed") ||
      msg.includes("wrong")
    ) {
      return { ok: false, code: "wrong_password" };
    }
    return { ok: false, code: "reauth_failed" };
  }

  const url = deps.supabaseUrl ?? process.env.SUPABASE_URL;
  const anonKey =
    deps.anonKey ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, code: "reauth_unavailable" };
  }

  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await client.auth.signInWithPassword({
    email,
    password: args.password,
  });

  if (!error) return { ok: true };

  const msg = (error.message ?? "").toLowerCase();
  if (
    msg.includes("invalid login") ||
    msg.includes("invalid credentials") ||
    msg.includes("invalid_grant")
  ) {
    return { ok: false, code: "wrong_password" };
  }
  return { ok: false, code: "reauth_failed" };
}
