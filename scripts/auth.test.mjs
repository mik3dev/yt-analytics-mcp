import { describe, it, expect, afterEach, vi } from "vitest";
import * as auth from "./auth.mjs";

const A = "https://www.googleapis.com/auth/yt-analytics.readonly";
const D = "https://www.googleapis.com/auth/youtube.readonly";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseClientFile", () => {
  it("accepts a Desktop (installed) client", () => {
    const text = JSON.stringify({ installed: { client_id: "cid", client_secret: "sec", redirect_uris: ["http://localhost"] } });
    expect(auth.parseClientFile(text)).toEqual({ clientId: "cid", clientSecret: "sec" });
  });
  it("rejects a Web client", () => {
    const text = JSON.stringify({ web: { client_id: "cid", client_secret: "sec" } });
    expect(() => auth.parseClientFile(text)).toThrow("This is a Web application client. Create a Desktop app client.");
  });
  it("rejects invalid JSON", () => {
    expect(() => auth.parseClientFile("{nope")).toThrow("Client file is not valid JSON.");
  });
  it("rejects an object with no installed section", () => {
    expect(() => auth.parseClientFile("{}")).toThrow('Client file has no "installed" section. Download the Desktop app client JSON from Google Cloud Console.');
  });
  it("rejects a missing client_secret", () => {
    const text = JSON.stringify({ installed: { client_id: "cid" } });
    expect(() => auth.parseClientFile(text)).toThrow("Client file is missing client_id or client_secret.");
  });
});

describe("pkceChallenge", () => {
  it("matches RFC 7636 Appendix B", () => {
    expect(auth.pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("differs for a different verifier", () => {
    expect(auth.pkceChallenge("x")).not.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("buildAuthUrl", () => {
  it("builds the exact consent URL", () => {
    expect(
      auth.buildAuthUrl({ clientId: "cid.apps.googleusercontent.com", redirectUri: "http://127.0.0.1:5555/callback", state: "st", challenge: "ch" }),
    ).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth" +
        "?client_id=cid.apps.googleusercontent.com" +
        "&redirect_uri=http%3A%2F%2F127.0.0.1%3A5555%2Fcallback" +
        "&response_type=code" +
        "&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyt-analytics.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.readonly" +
        "&access_type=offline&prompt=consent&state=st&code_challenge=ch&code_challenge_method=S256",
    );
  });
});

describe("grantedScopesMissing", () => {
  it("returns [] when both scopes are granted", () => {
    expect(auth.grantedScopesMissing(`${D} ${A}`)).toEqual([]);
  });
  it("names the scope that was unticked", () => {
    expect(auth.grantedScopesMissing(A)).toEqual([D]);
  });
  it("returns both when the scope string is absent", () => {
    expect(auth.grantedScopesMissing(undefined)).toEqual([A, D]);
  });
});

describe("buildCredential", () => {
  it("returns the exact authorized_user object src/auth.ts reads", () => {
    expect(auth.buildCredential({ clientId: "cid", clientSecret: "sec", refreshToken: "rt" })).toEqual({
      type: "authorized_user",
      client_id: "cid",
      client_secret: "sec",
      refresh_token: "rt",
      scopes: [A, D],
      token_uri: "https://oauth2.googleapis.com/token",
    });
  });
});

describe("credentialFileName", () => {
  it("strips @ and lowercases", () => {
    expect(auth.credentialFileName("@NotObvious", "UC1")).toBe("notobvious");
  });
  it("collapses unsafe characters into single dashes", () => {
    expect(auth.credentialFileName("@Café Ñu", "UC1")).toBe("caf-u");
  });
  it("never produces a path separator", () => {
    expect(auth.credentialFileName("@a/b\\c", "UC1")).toBe("a-b-c");
  });
  it("falls back to the channel id", () => {
    expect(auth.credentialFileName("", "UC1")).toBe("UC1");
    expect(auth.credentialFileName(undefined, "UC1")).toBe("UC1");
    expect(auth.credentialFileName("@ñ", "UC1")).toBe("UC1");
  });
});

describe("handleCallback", () => {
  it("returns the code on a valid callback", () => {
    expect(auth.handleCallback("/callback?state=s1&code=abc", "s1")).toEqual({
      status: 200,
      body: "Authorized. You can close this tab.",
      outcome: { code: "abc" },
    });
  });
  it("ignores other paths without ending the flow (favicon)", () => {
    expect(auth.handleCallback("/favicon.ico", "s1")).toEqual({ status: 404, body: "Not found", outcome: null });
  });
  it("aborts on a state mismatch", () => {
    expect(auth.handleCallback("/callback?state=evil&code=abc", "s1")).toEqual({
      status: 400,
      body: "State mismatch. Close this tab and run the script again.",
      outcome: { error: "State mismatch in the OAuth callback. Run the script again." },
    });
  });
  it("reports declined consent", () => {
    expect(auth.handleCallback("/callback?state=s1&error=access_denied", "s1")).toEqual({
      status: 200,
      body: "Consent was declined. You can close this tab.",
      outcome: { error: "Consent was declined." },
    });
  });
  it("reports other Google errors verbatim", () => {
    expect(auth.handleCallback("/callback?state=s1&error=invalid_scope", "s1").outcome).toEqual({
      error: "Google returned an error: invalid_scope",
    });
  });
  it("aborts when the code is missing", () => {
    expect(auth.handleCallback("/callback?state=s1", "s1").outcome).toEqual({
      error: "The callback had no authorization code.",
    });
  });
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const EXCHANGE = { clientId: "cid", clientSecret: "SECRET-XYZ", code: "abc", redirectUri: "http://127.0.0.1:5555/callback", verifier: "VERIFIER-XYZ" };

describe("exchangeCode", () => {
  it("posts the exact form and returns both tokens", async () => {
    const fetchMock = vi.fn(async () => json({ access_token: "at", refresh_token: "rt", scope: `${A} ${D}` }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(auth.exchangeCode(EXCHANGE)).resolves.toEqual({ accessToken: "at", refreshToken: "rt" });
    expect(fetchMock).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:
        "grant_type=authorization_code&code=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A5555%2Fcallback" +
        "&client_id=cid&client_secret=SECRET-XYZ&code_verifier=VERIFIER-XYZ",
    });
  });
  it("reports Google's error fields without echoing secrets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid_grant", error_description: "Bad Request" }, 400)));
    const err = await auth.exchangeCode(EXCHANGE).catch((e) => e);
    expect(err.message).toBe("Token exchange failed (HTTP 400): invalid_grant — Bad Request");
    expect(err.message).not.toContain("SECRET-XYZ");
    expect(err.message).not.toContain("VERIFIER-XYZ");
  });
  it("fails when no refresh_token comes back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ access_token: "at", scope: `${A} ${D}` })));
    await expect(auth.exchangeCode(EXCHANGE)).rejects.toThrow(
      "Google returned no refresh_token. Revoke the app at https://myaccount.google.com/permissions and run the script again.",
    );
  });
  it("fails when a scope was unticked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ access_token: "at", refresh_token: "rt", scope: A })));
    await expect(auth.exchangeCode(EXCHANGE)).rejects.toThrow(
      `Consent did not grant: ${D}. Run the script again and tick every permission.`,
    );
  });
});

describe("fetchChannel", () => {
  it("returns id, title and handle with a bearer token", async () => {
    const fetchMock = vi.fn(async () => json({ items: [{ id: "UC1", snippet: { title: "Not Obvious", customUrl: "@notobvious" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(auth.fetchChannel("at")).resolves.toEqual({ id: "UC1", title: "Not Obvious", customUrl: "@notobvious" });
    expect(fetchMock).toHaveBeenCalledWith("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: "Bearer at" },
    });
  });
  it("fails for an account with no channel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [] })));
    await expect(auth.fetchChannel("at")).rejects.toThrow(
      "This Google account has no YouTube channel. Pick the account or brand account that owns the channel.",
    );
  });
  it("reports HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "API not enabled" } }, 403)));
    await expect(auth.fetchChannel("at")).rejects.toThrow("Channel lookup failed (HTTP 403): API not enabled");
  });
});
