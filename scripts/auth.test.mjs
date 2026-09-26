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
