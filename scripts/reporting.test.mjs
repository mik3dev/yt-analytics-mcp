import { describe, it, expect } from "vitest";
import { DEFAULT_CREDENTIAL_PATH } from "../dist/auth.js";
import { parseCli } from "./reporting.mjs";

describe("parseCli", () => {
  it("reads the command and defaults the credential", () => {
    const prev = process.env.YT_ANALYTICS_CREDENTIALS_PATH;
    delete process.env.YT_ANALYTICS_CREDENTIALS_PATH;
    try {
      expect(parseCli(["setup"])).toEqual({ command: "setup", credentials: DEFAULT_CREDENTIAL_PATH });
    } finally {
      if (prev !== undefined) process.env.YT_ANALYTICS_CREDENTIALS_PATH = prev;
    }
  });
  it("takes --credentials", () => {
    expect(parseCli(["status", "--credentials", "/c.json"])).toEqual({ command: "status", credentials: "/c.json" });
  });
  it("rejects an unknown command", () => {
    expect(() => parseCli(["delete"])).toThrow("Usage: node scripts/reporting.mjs <setup|status> [--credentials <path>]");
  });
  it("rejects unknown flags", () => {
    expect(() => parseCli(["setup", "--force"])).toThrow(/Unknown option '--force'/);
  });
});
