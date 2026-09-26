#!/usr/bin/env node
// FORK-ONLY. Create (once) and inspect the Reporting API reach job whose
// daily CSVs yt_reach reads. `setup` is the single POST in this fork; the
// MCP server itself never writes to Google.
//
//   npm run build
//   node scripts/reporting.mjs setup  [--credentials <path>]
//   node scripts/reporting.mjs status [--credentials <path>]
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_CREDENTIAL_PATH, GoogleAuth } from "../dist/auth.js";
import { REACH_REPORT_TYPE, REPORTING_BASE, fetchReachJob, listReports, reachCacheDir } from "../dist/reach.js";

const USAGE = "Usage: node scripts/reporting.mjs <setup|status> [--credentials <path>]";

export function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { credentials: { type: "string" } },
    strict: true,
    allowPositionals: true,
  });
  const [command, ...rest] = positionals;
  if (!["setup", "status"].includes(command) || rest.length) throw new Error(USAGE);
  return {
    command,
    credentials: values.credentials ?? process.env.YT_ANALYTICS_CREDENTIALS_PATH ?? DEFAULT_CREDENTIAL_PATH,
  };
}

async function channelTitle(token) {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  const data = await res.json().catch(() => ({}));
  return data.items?.[0]?.snippet?.title ?? "(unknown channel)";
}

async function setup(token) {
  console.log(`Channel: ${await channelTitle(token)}`);
  const existing = await fetchReachJob(token);
  if (existing) {
    console.log(`Reach job already exists: ${existing.id} (created ${existing.createTime})`);
    return;
  }
  const res = await fetch(`${REPORTING_BASE}/jobs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reportTypeId: REACH_REPORT_TYPE, name: "yt-analytics reach" }),
  });
  const job = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Creating the reach job failed (HTTP ${res.status}): ${job.error?.message ?? "no details"}`);
  console.log(`Created reach job ${job.id}. The first report arrives within 24–48 hours.`);
}

async function status(token, credentials) {
  const job = await fetchReachJob(token);
  if (!job) throw new Error("No reach job — run: node scripts/reporting.mjs setup");
  const reports = await listReports(token, job.id);
  const starts = reports.map((r) => r.startTime).sort();
  const cache = reachCacheDir(credentials, job.id);
  const cached = existsSync(cache) ? readdirSync(cache).filter((f) => f.endsWith(".csv")).length : 0;
  console.log(`Reach job ${job.id} (created ${job.createTime})`);
  console.log(`Reports: ${reports.length}${starts.length ? ` (${starts[0]} → ${starts[starts.length - 1]})` : ""}`);
  console.log(`Cache: ${cache} (${cached} downloaded)`);
}

async function main() {
  const { command, credentials } = parseCli(process.argv.slice(2));
  const auth = GoogleAuth.tryLoad(credentials);
  if (!auth) throw new Error(`No usable credential at ${credentials}. Run node scripts/auth.mjs first.`);
  const token = () => auth.getAccessToken();
  if (command === "setup") await setup(token);
  else await status(token, credentials);
}

function isDirectRun() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (process.argv[1] && isDirectRun()) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
