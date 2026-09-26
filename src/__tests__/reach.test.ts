import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateReach,
  assertDownloadUrl,
  csvDate,
  fetchReachJob,
  latestPerDay,
  listReports,
  loadReachWindow,
  missingDays,
  parseReachCsv,
  pickReachJob,
  reachCacheDir,
  reportDay,
  syncReports,
} from "../reach.js";

const HEADER =
  "date,channel_id,video_id,live_or_on_demand,subscribed_status,country_code," +
  "video_thumbnail_impressions,video_thumbnail_impressions_ctr";

describe("pickReachJob", () => {
  it("picks the reach job among others", () => {
    expect(
      pickReachJob([
        { id: "a", reportTypeId: "channel_basic_a3" },
        { id: "b", reportTypeId: "channel_reach_basic_a1" },
      ]),
    ).toEqual({ id: "b", reportTypeId: "channel_reach_basic_a1" });
  });
  it("returns null when there is none", () => {
    expect(pickReachJob([{ id: "a", reportTypeId: "channel_basic_a3" }])).toBeNull();
    expect(pickReachJob([])).toBeNull();
  });
});

describe("assertDownloadUrl", () => {
  it("accepts the Reporting API media host", () => {
    const u = assertDownloadUrl("https://youtubereporting.googleapis.com/v1/media/CHANNEL/x/jobs/j/reports/r?alt=media");
    expect(u.hostname).toBe("youtubereporting.googleapis.com");
  });
  it.each([
    "http://youtubereporting.googleapis.com/v1/media/x",
    "https://evil.example.com/v1/media/x",
    "https://youtubereporting.googleapis.com.evil.com/v1/media/x",
    "not a url",
  ])("rejects %s before the token can leave", (raw) => {
    expect(() => assertDownloadUrl(raw)).toThrow(/Refusing report download/);
  });
});

describe("reportDay / latestPerDay", () => {
  it("dates a report by its Pacific start", () => {
    expect(reportDay({ startTime: "2026-09-25T07:00:00Z" })).toBe("2026-09-25");
  });
  it("keeps only the latest re-issue of a day, sorted by day", () => {
    const out = latestPerDay([
      { id: "d2", startTime: "2026-09-26T07:00:00Z", createTime: "2026-09-27T10:00:00Z" },
      { id: "d1-old", startTime: "2026-09-25T07:00:00Z", createTime: "2026-09-26T10:00:00Z" },
      { id: "d1-new", startTime: "2026-09-25T07:00:00Z", createTime: "2026-09-29T10:00:00Z" },
    ]);
    expect(out.map((r) => r.id)).toEqual(["d1-new", "d2"]);
  });
});

describe("csvDate / parseReachCsv", () => {
  it("converts YYYYMMDD", () => {
    expect(csvDate("20260925")).toBe("2026-09-25");
  });
  it("parses rows into typed objects keyed by header", () => {
    const rows = parseReachCsv(
      `${HEADER}\n20260925,UC1,vidA,on_demand,UNSUBSCRIBED,US,1000,0.05\n20260925,UC1,vidB,on_demand,SUBSCRIBED,MX,3000,0.01\n`,
    );
    expect(rows).toEqual([
      { date: "20260925", channel_id: "UC1", video_id: "vidA", live_or_on_demand: "on_demand", subscribed_status: "UNSUBSCRIBED", country_code: "US", video_thumbnail_impressions: 1000, video_thumbnail_impressions_ctr: 0.05 },
      { date: "20260925", channel_id: "UC1", video_id: "vidB", live_or_on_demand: "on_demand", subscribed_status: "SUBSCRIBED", country_code: "MX", video_thumbnail_impressions: 3000, video_thumbnail_impressions_ctr: 0.01 },
    ]);
  });
  it("returns [] for a header-only file", () => {
    expect(parseReachCsv(`${HEADER}\n`)).toEqual([]);
  });
  it("refuses quoted fields instead of mis-splitting them", () => {
    expect(() => parseReachCsv(`${HEADER}\n20260925,UC1,"a,b",on_demand,SUBSCRIBED,US,1,0.1\n`)).toThrow(/quoted fields/);
  });
  it("names the row and column of a non-numeric metric", () => {
    expect(() => parseReachCsv(`${HEADER}\n20260925,UC1,vidA,on_demand,SUBSCRIBED,US,abc,0.1\n`)).toThrow(
      'Reach report row 2: video_thumbnail_impressions is not a number ("abc").',
    );
  });
  it("refuses a ragged row", () => {
    expect(() => parseReachCsv(`${HEADER}\n20260925,UC1\n`)).toThrow("Reach report row 2 has 2 fields, header has 8.");
  });
});

describe("aggregateReach", () => {
  const rows = parseReachCsv(
    `${HEADER}\n` +
      "20260925,UC1,vidA,on_demand,UNSUBSCRIBED,US,1000,0.05\n" +
      "20260925,UC1,vidB,on_demand,UNSUBSCRIBED,US,3000,0.01\n" +
      "20260926,UC1,vidA,on_demand,SUBSCRIBED,MX,0,0\n" +
      "20260930,UC1,vidA,on_demand,SUBSCRIBED,MX,500,0.2\n",
  );
  const W = { startDate: "2026-09-25", endDate: "2026-09-29" };

  it("weights CTR by impressions (0.02, not the 0.03 average)", () => {
    expect(aggregateReach(rows, { ...W, groupBy: "none" })).toEqual([
      { key: "all", impressions: 4000, estimatedClicks: 80, impressionsCtr: 0.02 },
    ]);
  });
  it("groups by video and filters by window", () => {
    expect(aggregateReach(rows, { ...W, groupBy: "video" })).toEqual([
      { key: "vidA", impressions: 1000, estimatedClicks: 50, impressionsCtr: 0.05 },
      { key: "vidB", impressions: 3000, estimatedClicks: 30, impressionsCtr: 0.01 },
    ]);
  });
  it("groups by day, zero impressions giving a zero CTR", () => {
    expect(aggregateReach(rows, { ...W, groupBy: "day", videoId: "vidA" })).toEqual([
      { key: "2026-09-25", impressions: 1000, estimatedClicks: 50, impressionsCtr: 0.05 },
      { key: "2026-09-26", impressions: 0, estimatedClicks: 0, impressionsCtr: 0 },
    ]);
  });
});

describe("missingDays", () => {
  const today = new Date("2026-10-01T12:00:00Z");
  it("lists window days without a report, up to three days ago", () => {
    expect(missingDays(["2026-09-25", "2026-09-27"], "2026-09-25", "2026-09-30", today)).toEqual([
      "2026-09-26",
      "2026-09-28",
    ]);
  });
  it("caps the list at 31 entries", () => {
    const out = missingDays([], "2026-01-01", "2026-09-28", today);
    expect(out).toHaveLength(32);
    expect(out[31]).toMatch(/^… \+\d+ more$/);
  });
});

const token = async () => "TOKEN";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const MEDIA = "https://youtubereporting.googleapis.com/v1/media/CHANNEL/x/jobs/j1/reports/";

describe("fetchReachJob / listReports", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for jobs with the bearer token and picks the reach job", async () => {
    const f = vi.fn(async () => json({ jobs: [{ id: "j1", reportTypeId: "channel_reach_basic_a1" }] }));
    vi.stubGlobal("fetch", f);
    await expect(fetchReachJob(token)).resolves.toEqual({ id: "j1", reportTypeId: "channel_reach_basic_a1" });
    expect(f).toHaveBeenCalledWith("https://youtubereporting.googleapis.com/v1/jobs", {
      headers: { Authorization: "Bearer TOKEN", Accept: "application/json" },
    });
  });

  it("follows nextPageToken", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ reports: [{ id: "r1" }], nextPageToken: "p2" }))
      .mockResolvedValueOnce(json({ reports: [{ id: "r2" }] }));
    vi.stubGlobal("fetch", f);
    const out = await listReports(token, "j1");
    expect(out.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      "https://youtubereporting.googleapis.com/v1/jobs/j1/reports",
      "https://youtubereporting.googleapis.com/v1/jobs/j1/reports?pageToken=p2",
    ]);
  });

  it("retries once on a transient 5xx", async () => {
    // Seen live 2026-09-26: GET /jobs/{id}/reports answered 500 once, then 200.
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: "Internal error encountered." } }, 500))
      .mockResolvedValueOnce(json({ jobs: [{ id: "j1", reportTypeId: "channel_reach_basic_a1" }] }));
    vi.stubGlobal("fetch", f);
    await expect(fetchReachJob(token)).resolves.toEqual({ id: "j1", reportTypeId: "channel_reach_basic_a1" });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("must-not-retry: a 4xx fails on the first answer", async () => {
    const f = vi.fn(async () => json({ error: { message: "API not enabled" } }, 403));
    vi.stubGlobal("fetch", f);
    await expect(fetchReachJob(token)).rejects.toThrow("Reporting API 403");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("reports API errors with status and message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "API not enabled" } }, 403)));
    await expect(fetchReachJob(token)).rejects.toThrow("Reporting API 403 at /v1/jobs: API not enabled");
  });
});

describe("syncReports / loadReachWindow", () => {
  let dir: string;
  beforeEach(() => {
    dir = join(mkdtempSync(join(tmpdir(), "yt-reach-")), "cache");
  });
  afterEach(() => {
    rmSync(join(dir, ".."), { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  const reports = [
    { id: "r1", startTime: "2026-09-25T07:00:00Z", endTime: "2026-09-26T07:00:00Z", createTime: "2026-09-27T01:00:00Z", downloadUrl: `${MEDIA}r1?alt=media` },
    { id: "r2", startTime: "2026-09-26T07:00:00Z", endTime: "2026-09-27T07:00:00Z", createTime: "2026-09-28T01:00:00Z", downloadUrl: `${MEDIA}r2?alt=media` },
  ];

  it("downloads only missing reports and writes the index", async () => {
    const f = vi.fn(async (url: string | URL) => {
      const u = String(url);
      // The media URL also contains /jobs/j1/reports/, so test for it first.
      if (u.includes("/media/")) return new Response(`${HEADER}\n20260925,UC1,vidA,on_demand,SUBSCRIBED,US,100,0.1\n`);
      return json({ reports });
    });
    vi.stubGlobal("fetch", f);
    const index = await syncReports(token, "j1", dir);
    expect(index.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(readdirSync(dir).sort()).toEqual(["index.json", "r1.csv", "r2.csv"]);
    const downloads = f.mock.calls.filter((c) => String(c[0]).includes("/media/")).length;
    expect(downloads).toBe(2);

    await syncReports(token, "j1", dir);
    expect(f.mock.calls.filter((c) => String(c[0]).includes("/media/")).length).toBe(2);
  });

  it.skipIf(process.platform === "win32")("writes the cache 0700 / 0600", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) =>
      String(url).includes("/reports") && !String(url).includes("/media/") ? json({ reports: [reports[0]] }) : new Response(`${HEADER}\n`),
    ));
    await syncReports(token, "j1", dir);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "r1.csv")).mode & 0o777).toBe(0o600);
  });

  it("never requests a download from a foreign host", async () => {
    const bad = [{ ...reports[0], downloadUrl: "https://youtubereporting.googleapis.com.evil.com/x" }];
    const f = vi.fn(async () => json({ reports: bad }));
    vi.stubGlobal("fetch", f);
    await expect(syncReports(token, "j1", dir)).rejects.toThrow(/Refusing report download/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("skips a report whose id is unsafe as a file name", async () => {
    const f = vi.fn(async () => json({ reports: [{ ...reports[0], id: "../escape" }] }));
    vi.stubGlobal("fetch", f);
    const index = await syncReports(token, "j1", dir);
    expect(index).toEqual([]);
    expect(existsSync(join(dir, "..", "escape.csv"))).toBe(false);
  });

  it("loads only the window's days, latest re-issue per day", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) =>
      String(url).includes("/media/")
        ? new Response(`${HEADER}\n${String(url).includes("r1") ? "20260925" : "20260926"},UC1,vidA,on_demand,SUBSCRIBED,US,100,0.1\n`)
        : json({ reports }),
    ));
    const index = await syncReports(token, "j1", dir);
    const out = loadReachWindow(dir, index, "2026-09-26", "2026-09-30");
    expect(out.days).toEqual(["2026-09-26"]);
    expect(out.rows).toHaveLength(1);
  });
});

describe("reachCacheDir", () => {
  it("sits beside the credential, per job", () => {
    expect(reachCacheDir("/home/u/.config/yt-analytics/chan.json", "j1", {})).toBe(
      join("/home/u/.config/yt-analytics", "reach", "j1"),
    );
  });
  it("honours YT_ANALYTICS_CACHE_DIR", () => {
    expect(reachCacheDir("/x/chan.json", "j1", { YT_ANALYTICS_CACHE_DIR: "/tmp/c" })).toBe(join("/tmp/c", "j1"));
  });
  it("refuses an unsafe job id", () => {
    expect(() => reachCacheDir("/x/chan.json", "../j", {})).toThrow(/unsafe/);
  });
});
