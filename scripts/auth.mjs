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
