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

const APNS_AUTH_KEY = process.env.APNS_PRIVATE_KEY;
const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;

function buildJwt(): string {
  if (!APNS_AUTH_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) {
    throw new Error("APNS credentials are not fully configured");
  }
  const header = {
    alg: "ES256",
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

  const sign = crypto.createSign("sha256");
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(APNS_AUTH_KEY);
  const signatureB64 = signature
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${signingInput}.${signatureB64}`;
}

export async function sendApnsNotification(params: ApnsSendParams): Promise<ApnsSendResult> {
  const { environment, deviceToken, bundleId, title, body, data } = params;

  if (!APNS_AUTH_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) {
    // Misconfiguration: treat as transient and log at call site.
    return { ok: false, reason: "transient_error", error: "APNS credentials missing" };
  }

  const host =
    environment === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

  const client = http2.connect(host);

  const jwt = buildJwt();

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
          resolve({ ok: true });
          return;
        }

        let reason: ApnsSendResult["reason"] = "transient_error";
        const errorString = responseData || String(headers["apns-id"] ?? "");

        if (status === 400 || status === 410 || status === 403) {
          // Treat known client-side issues as invalid token so we can deactivate.
          reason = "invalid_token";
        }

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

