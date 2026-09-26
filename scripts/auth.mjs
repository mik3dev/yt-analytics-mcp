#!/usr/bin/env node
// Mint a YouTube Analytics credential for one channel.
//
//   npm run build
//   node scripts/auth.mjs [--client <path>] [--out <path>] [--force]
//
// Runs Google's installed-app OAuth flow (loopback redirect + PKCE), then
// writes the refresh token in the google-auth `authorized_user` format that
// src/auth.ts reads. The server itself still only ever reads that file.
// Run once per channel; each file backs one MCP server entry.
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

export const SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
];
export const TOKEN_URI = "https://oauth2.googleapis.com/token";
export const DEFAULT_DIR = join(homedir(), ".config", "yt-analytics");
const AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth";

/** Google's Desktop-app client download → { clientId, clientSecret }. */
export function parseClientFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Client file is not valid JSON.");
  }
  if (parsed && typeof parsed === "object" && parsed.web) {
    throw new Error("This is a Web application client. Create a Desktop app client.");
  }
  const c = parsed?.installed;
  if (!c) {
    throw new Error('Client file has no "installed" section. Download the Desktop app client JSON from Google Cloud Console.');
  }
  if (!c.client_id || !c.client_secret) {
    throw new Error("Client file is missing client_id or client_secret.");
  }
  return { clientId: c.client_id, clientSecret: c.client_secret };
}

/** RFC 7636 S256 challenge. */
export function pkceChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthUrl({ clientId, redirectUri, state, challenge }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent: Google returns a refresh_token even on a repeat login.
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URI}?${params}`;
}

/** Required scopes absent from the token response's space-separated `scope`. */
export function grantedScopesMissing(scopeString) {
  const granted = (scopeString ?? "").split(" ");
  return SCOPES.filter((s) => !granted.includes(s));
}

/** Exactly the fields GoogleAuth.tryLoad reads; `scopes` drives its scope checks. */
export function buildCredential({ clientId, clientSecret, refreshToken }) {
  return {
    type: "authorized_user",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    scopes: [...SCOPES],
    token_uri: TOKEN_URI,
  };
}

/** "@NotObvious" → "notobvious"; falls back to the channel id. */
export function credentialFileName(customUrl, channelId) {
  const name = (customUrl ?? "")
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || channelId;
}

const TIMEOUT_MS = 5 * 60 * 1000;

/** Decide the response to one loopback request. `outcome: null` = keep waiting. */
export function handleCallback(requestUrl, expectedState) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  if (url.pathname !== "/callback") {
    return { status: 404, body: "Not found", outcome: null };
  }
  if (url.searchParams.get("state") !== expectedState) {
    return {
      status: 400,
      body: "State mismatch. Close this tab and run the script again.",
      outcome: { error: "State mismatch in the OAuth callback. Run the script again." },
    };
  }
  const error = url.searchParams.get("error");
  if (error) {
    return {
      status: 200,
      body: "Consent was declined. You can close this tab.",
      outcome: { error: error === "access_denied" ? "Consent was declined." : `Google returned an error: ${error}` },
    };
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return { status: 400, body: "Missing code.", outcome: { error: "The callback had no authorization code." } };
  }
  return { status: 200, body: "Authorized. You can close this tab.", outcome: { code } };
}

/**
 * Listen on 127.0.0.1 at an OS-chosen port. Resolves once listening with the
 * redirect URI and a promise for the authorization code.
 */
export function startListener(state, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolveStart, rejectStart) => {
    let settle;
    const code = new Promise((res, rej) => {
      settle = { res, rej };
    });
    const finish = () => {
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
    };
    const server = createServer((req, res) => {
      const r = handleCallback(req.url ?? "/", state);
      res.writeHead(r.status, { "Content-Type": "text/plain; charset=utf-8", Connection: "close" });
      res.end(r.body);
      if (!r.outcome) return;
      finish();
      if ("error" in r.outcome) settle.rej(new Error(r.outcome.error));
      else settle.res(r.outcome.code);
    });
    const timer = setTimeout(() => {
      finish();
      settle.rej(new Error("No response from the browser within 5 minutes."));
    }, timeoutMs);
    server.on("error", (err) => {
      clearTimeout(timer);
      rejectStart(err);
    });
    server.listen(0, "127.0.0.1", () => {
      resolveStart({ redirectUri: `http://127.0.0.1:${server.address().port}/callback`, code });
    });
  });
}

const CHANNELS_URI = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";

export async function exchangeCode({ clientId, clientSecret, code, redirectUri, verifier }) {
  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: verifier,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Only Google's own error fields: never the request body, which holds secrets.
    const detail = [data.error, data.error_description].filter(Boolean).join(" — ") || "no details";
    throw new Error(`Token exchange failed (HTTP ${res.status}): ${detail}`);
  }
  if (!data.refresh_token) {
    throw new Error("Google returned no refresh_token. Revoke the app at https://myaccount.google.com/permissions and run the script again.");
  }
  const missing = grantedScopesMissing(data.scope);
  if (missing.length) {
    throw new Error(`Consent did not grant: ${missing.join(", ")}. Run the script again and tick every permission.`);
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function fetchChannel(accessToken) {
  const res = await fetch(CHANNELS_URI, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Channel lookup failed (HTTP ${res.status}): ${data.error?.message ?? "no details"}`);
  }
  const item = data.items?.[0];
  if (!item) {
    throw new Error("This Google account has no YouTube channel. Pick the account or brand account that owns the channel.");
  }
  return { id: item.id, title: item.snippet?.title ?? item.id, customUrl: item.snippet?.customUrl ?? "" };
}
