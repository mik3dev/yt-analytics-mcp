import { describe, it, expect } from "vitest";
import {
  aggregateReach,
  assertDownloadUrl,
  csvDate,
  latestPerDay,
  missingDays,
  parseReachCsv,
  pickReachJob,
  reportDay,
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
