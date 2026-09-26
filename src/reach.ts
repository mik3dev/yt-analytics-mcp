/**
 * Reach reports — thumbnail impressions and click-through rate — from the
 * YouTube Reporting API. FORK-ONLY: the report job these read is created by
 * scripts/reporting.mjs (a POST); everything in this module is a read.
 *
 * The Analytics API has no impressions or CTR (see AGENTS.md); the bulk
 * `channel_reach_basic_a1` report is the only programmatic source.
 */
import { addDays, pacificDate, round } from "./shape.js";

export const REACH_REPORT_TYPE = "channel_reach_basic_a1";
export const REPORTING_BASE = "https://youtubereporting.googleapis.com/v1";
const REPORTING_HOST = "youtubereporting.googleapis.com";

/**
 * Scale of `video_thumbnail_impressions_ctr` in the CSV: 1 when it is a
 * fraction (0.051), 100 when it is a percent (5.1). Confirmed against the
 * first real report — see the fixture in src/__tests__/reach.test.ts.
 */
export const CTR_SCALE = 1;

export type TokenSource = () => Promise<string>;

export interface ReportingJob {
  id: string;
  reportTypeId: string;
  name?: string;
  createTime?: string;
}

export interface ReportMeta {
  id: string;
  startTime: string;
  endTime: string;
  createTime: string;
  downloadUrl?: string;
}

export type ReachRow = Record<string, string | number>;

export interface ReachAggregate {
  key: string;
  impressions: number;
  estimatedClicks: number;
  impressionsCtr: number;
}

const NUMERIC_COLUMNS = new Set(["video_thumbnail_impressions", "video_thumbnail_impressions_ctr"]);
const MISSING_DAYS_CAP = 31;

export function pickReachJob(jobs: ReportingJob[]): ReportingJob | null {
  return jobs.find((j) => j.reportTypeId === REACH_REPORT_TYPE) ?? null;
}

/**
 * The download request carries the bearer token, so its URL is checked
 * before anything is sent: https, and exactly the Reporting API host.
 */
export function assertDownloadUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Refusing report download: not a URL ("${raw.slice(0, 80)}").`);
  }
  if (url.protocol !== "https:" || url.hostname !== REPORTING_HOST) {
    throw new Error(
      `Refusing report download from ${url.protocol}//${url.hostname}: only ` +
        `https://${REPORTING_HOST} may receive the token.`,
    );
  }
  return url;
}

/** A report covers one Pacific day; its startTime is that day's Pacific midnight. */
export function reportDay(r: Pick<ReportMeta, "startTime">): string {
  return pacificDate(r.startTime);
}

/** Google re-issues corrected reports for a day; keep the newest per day. */
export function latestPerDay<T extends Pick<ReportMeta, "startTime" | "createTime">>(reports: T[]): T[] {
  const byDay = new Map<string, T>();
  for (const r of reports) {
    const day = reportDay(r);
    const prev = byDay.get(day);
    if (!prev || Date.parse(r.createTime) > Date.parse(prev.createTime)) byDay.set(day, r);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, r]) => r);
}

export function csvDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** Plain CSV only: anything unexpected throws rather than parsing wrong. */
export function parseReachCsv(text: string): ReachRow[] {
  if (text.includes('"')) {
    throw new Error("Reach report contains quoted fields; this parser expects plain CSV. Inspect the cached file.");
  }
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(",");
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",");
    const rowNo = i + 2;
    if (cells.length !== header.length) {
      throw new Error(`Reach report row ${rowNo} has ${cells.length} fields, header has ${header.length}.`);
    }
    const row: ReachRow = {};
    header.forEach((h, k) => {
      if (NUMERIC_COLUMNS.has(h)) {
        const n = Number(cells[k]);
        if (cells[k] === "" || !Number.isFinite(n)) {
          throw new Error(`Reach report row ${rowNo}: ${h} is not a number ("${cells[k]}").`);
        }
        row[h] = n;
      } else {
        row[h] = cells[k];
      }
    });
    return row;
  });
}

/** Impression-weighted CTR: Σ(impressions × ctr) / Σ impressions. */
export function aggregateReach(
  rows: ReachRow[],
  o: { groupBy: "video" | "day" | "none"; videoId?: string; startDate: string; endDate: string },
): ReachAggregate[] {
  const groups = new Map<string, { impressions: number; clicks: number }>();
  for (const r of rows) {
    const day = csvDate(String(r.date));
    if (day < o.startDate || day > o.endDate) continue;
    if (o.videoId && r.video_id !== o.videoId) continue;
    const key = o.groupBy === "video" ? String(r.video_id) : o.groupBy === "day" ? day : "all";
    const impressions = Number(r.video_thumbnail_impressions);
    const ctr = Number(r.video_thumbnail_impressions_ctr) / CTR_SCALE;
    const g = groups.get(key) ?? { impressions: 0, clicks: 0 };
    g.impressions += impressions;
    g.clicks += impressions * ctr;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => ({
      key,
      impressions: g.impressions,
      estimatedClicks: round(g.clicks, 2),
      impressionsCtr: g.impressions > 0 ? round(g.clicks / g.impressions, 4) : 0,
    }));
}

/** Window days (up to three days ago, the Analytics lag) with no report. */
export function missingDays(present: string[], startDate: string, endDate: string, today: Date = new Date()): string[] {
  const lastSettled = addDays(today.toISOString().slice(0, 10), -3);
  const end = endDate < lastSettled ? endDate : lastSettled;
  const have = new Set(present);
  const missing: string[] = [];
  for (let d = startDate; d <= end; d = addDays(d, 1)) if (!have.has(d)) missing.push(d);
  return missing.length > MISSING_DAYS_CAP
    ? [...missing.slice(0, MISSING_DAYS_CAP), `… +${missing.length - MISSING_DAYS_CAP} more`]
    : missing;
}
