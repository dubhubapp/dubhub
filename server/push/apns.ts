import fs from "fs";
import http2 from "http2";
import crypto from "crypto";

type ApnsEnvironment = "sandbox" | "production";

export interface ApnsSendParams {
  environment: ApnsEnvironment;
  deviceToken: string;
  bundleId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export type ApnsSendResult =
  | { ok: true }
  | { ok: false; reason: "invalid_token" | "transient_error"; status?: number; error?: string };

const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;

/**
 * Supports real multiline PEM in .env / Railway and single-line values with literal `\n` / `\r\n` pairs.
 */
function normalizeApnsPrivateKey(raw: string | undefined): {
  pem: string;
  hadEscapedNewlines: boolean;
} | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hadEscapedNewlines = trimmed.includes("\\n") || trimmed.includes("\\r\\n");
  const pem = trimmed.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  return { pem, hadEscapedNewlines };
}

/**
 * Prefer `APNS_PRIVATE_KEY_PATH` (raw .p8 file) for local dev; otherwise inline `APNS_PRIVATE_KEY` (e.g. Railway).
 * If the path is set but unreadable, falls back to inline env when present.
 */
function loadRawApnsPrivateKey():
  | { raw: string; source: "path" | "env" }
  | null {
  const pathEnv = process.env.APNS_PRIVATE_KEY_PATH?.trim();
  if (pathEnv) {
    try {
      const raw = fs.readFileSync(pathEnv, "utf8");
      return { raw, source: "path" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log("[apns] APNS_PRIVATE_KEY_PATH read failed", { message });
    }
  }
  const inline = process.env.APNS_PRIVATE_KEY;
  if (inline === undefined || inline === null || String(inline).trim() === "") {
    return null;
  }
  return { raw: inline, source: "env" };
}

/** ES256 bearer token for APNs; uses PKCS#8 PEM via KeyObject (Apple .p8). */
function buildApnsJwt(
  privateKeyPem: string,
): { jwt: string } | Extract<ApnsSendResult, { ok: false }> {
  if (!privateKeyPem || !APNS_KEY_ID || !APNS_TEAM_ID) {
    return {
      ok: false,
      reason: "transient_error",
      error: "APNS credentials are not fully configured",
    };
  }

  const header = {
    alg: "ES256" as const,
    kid: APNS_KEY_ID,
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: APNS_TEAM_ID,
    iat: now,
  };

  const toBase64Url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const headerB64 = toBase64Url(header);
  const payloadB64 = toBase64Url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  let keyObject: crypto.KeyObject;
  try {
    keyObject = crypto.createPrivateKey({ key: privateKeyPem, format: "pem" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log("[apns] createPrivateKey failed", { message });
    return { ok: false, reason: "transient_error", error: message };
  }

  console.log("[apns] private key PKCS decode ok", {
    asymmetricKeyType: keyObject.asymmetricKeyType,
  });

  try {
    const sign = crypto.createSign("sha256");
    sign.update(signingInput);
    sign.end();
    const signature = sign.sign(keyObject);
    const signatureB64 = signature
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    return { jwt: `${signingInput}.${signatureB64}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log("[apns] ES256 JWT sign failed", { message });
    return { ok: false, reason: "transient_error", error: message };
  }
}

export async function sendApnsNotification(params: ApnsSendParams): Promise<ApnsSendResult> {
  const { environment, deviceToken, bundleId, title, body, data } = params;

  const rawLoad = loadRawApnsPrivateKey();
  const keyInfo = rawLoad ? normalizeApnsPrivateKey(rawLoad.raw) : null;
  const keyPresent = keyInfo !== null;

  if (!rawLoad || !keyInfo || !APNS_KEY_ID || !APNS_TEAM_ID) {
    console.log("[apns] credentials incomplete; skipping connect", {
      environment,
      hasPrivateKey: keyPresent,
      keySource: rawLoad?.source ?? "none",
      hasKeyId: Boolean(APNS_KEY_ID),
      hasTeamId: Boolean(APNS_TEAM_ID),
    });
    // Misconfiguration: treat as transient and log at call site.
    return { ok: false, reason: "transient_error", error: "APNS credentials missing" };
  }

  console.log("[apns] APNS_PRIVATE_KEY diagnostics", {
    source: rawLoad.source,
    keyPresent: true,
    hasBeginPrivateKeyMarker: keyInfo.pem.includes("BEGIN PRIVATE KEY"),
    hadEscapedNewlines: keyInfo.hadEscapedNewlines,
  });

  const host =
    environment === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

  const hostLabel =
    environment === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";

  const jwtResult = buildApnsJwt(keyInfo.pem);
  if ("ok" in jwtResult && jwtResult.ok === false) {
    return jwtResult;
  }
  const jwt = jwtResult.jwt;

  console.log("[apns] request", { environment, host: hostLabel });

  const client = http2.connect(host);

  const headers: http2.OutgoingHttpHeaders = {
    ":method": "POST",
    ":path": `/3/device/${deviceToken}`,
    authorization: `bearer ${jwt}`,
    "apns-topic": bundleId,
    "apns-push-type": "alert",
    "content-type": "application/json",
  };

  const aps: Record<string, unknown> = {
    alert: { title, body },
    sound: "default",
  };

  const payload = JSON.stringify({
    aps,
    ...((data && Object.keys(data).length > 0) ? { data } : {}),
  });

  return new Promise<ApnsSendResult>((resolve) => {
    let resolved = false;
    const req = client.request(headers);

    req.setEncoding("utf8");

    let responseData = "";
    req.on("response", (headers) => {
      const status = Number(headers[":status"] ?? 0);
      req.on("data", (chunk) => {
        responseData += chunk;
      });
      req.on("end", () => {
        if (resolved) return;
        resolved = true;
        client.close();

        if (status >= 200 && status < 300) {
          console.log("[apns] response", { environment, host: hostLabel, status });
          resolve({ ok: true });
          return;
        }

        let reason: ApnsSendResult["reason"] = "transient_error";
        const errorString = responseData || String(headers["apns-id"] ?? "");
        let apnsReason: string | undefined;
        try {
          const j = JSON.parse(errorString) as { reason?: string };
          if (typeof j.reason === "string") apnsReason = j.reason;
        } catch {
          // ignore
        }

        if (status === 400 || status === 410 || status === 403) {
          // Treat known client-side issues as invalid token so we can deactivate.
          reason = "invalid_token";
        }

        console.log("[apns] response", {
          environment,
          host: hostLabel,
          status,
          mappedReason: reason,
          apnsReason,
        });

        resolve({
          ok: false,
          reason,
          status,
          error: errorString,
        });
      });
    });

    req.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      client.close();
      console.log("[apns] transport error", {
        environment,
        host: hostLabel,
        message: err instanceof Error ? err.message : String(err),
      });
      resolve({
        ok: false,
        reason: "transient_error",
        error: err instanceof Error ? err.message : String(err),
      });
    });

    req.write(payload);
    req.end();
  });
}

