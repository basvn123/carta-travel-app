#!/usr/bin/env node
/**
 * status_notice.mjs, write the data host's status.json and print how to
 * upload it. It never uploads anything itself. (T316, register T218-a;
 * docs/INCIDENT_RUNBOOK.md, "The status surface".)
 *
 *   node scripts/status_notice.mjs "Signing in is down. Your trips are safe." --until 2026-10-04T18:00Z
 *   node scripts/status_notice.mjs "Fares refresh tonight" --tone info --hours 6
 *   node scripts/status_notice.mjs --clear
 *   node scripts/status_notice.mjs --check path/to/status.json
 *
 * Options: --tone warn|info (default warn), --until <ISO time> or --hours <n>
 * (default 24 hours from now, so a forgotten file ends by itself), --out
 * <file> (default carta-status.json in the system temp folder, so the file
 * never lands inside a repository where it could be committed by mistake).
 *
 * The file is run through the same parseStatus() the app uses and the script
 * prints the exact line a traveller will see, or refuses, so a file written
 * in a hurry during an incident cannot be one the app silently ignores. It is
 * written as plain UTF-8 without a byte order mark, which Windows PowerShell's
 * Out-File would add.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseStatus, STATUS_FILE } from '../src/lib/statusFile.js';

const HOST = 'https://data.carta-europetravel.com/data';
const KEY = `carta/data/${STATUS_FILE}`;
const CACHE = 'public, max-age=60';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
function opt(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const DEFAULT_OUT = join(tmpdir(), 'carta-status.json');
const VALUED = new Set(['--tone', '--until', '--hours', '--out', '--check']);
const words = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]));

function die(msg) {
  console.error(`[status_notice] ${msg}`);
  process.exit(1);
}

function describe(raw) {
  const n = parseStatus(raw);
  if (!n) return 'the app shows no line for this file';
  const until = raw.until ? `, until ${new Date(Date.parse(raw.until)).toISOString()}` : '';
  return `the app shows (${n.tone}${until}): ${n.text}`;
}

function printUpload(file) {
  const f = file.includes(' ') ? `"${file}"` : file;
  console.log(`
Upload it (owner step; run from continent-app/, one of the two):

  npx wrangler r2 object put ${KEY} --file ${f} --content-type application/json --cache-control "${CACHE}" --remote

  rclone copyto ${f} r2:${KEY} --s3-no-check-bucket --header-upload "Cache-Control: ${CACHE}" --header-upload "Content-Type: application/json"

wrangler needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID exported; rclone needs the
RCLONE_CONFIG_R2_* variables from the header of scripts/r2/push-data.mjs.

Check it is live (allow up to a minute for the edge cache):

  curl -s ${HOST}/${STATUS_FILE}

A traveller sees it on their next page load. To take it down, run this script with
--clear and upload again, or delete the object:

  npx wrangler r2 object delete ${KEY} --remote
`);
}

if (flag('--check')) {
  const file = resolve(opt('--check') || DEFAULT_OUT);
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf-8').replace(/^[\s\u{FEFF}]+/u, ''));
  } catch (e) {
    die(`${file} is not valid JSON (${e.message}); the app would show nothing`);
  }
  console.log(`${file}: ${describe(raw)}`);
  process.exit(0);
}

let raw;
if (flag('--clear')) {
  raw = { enabled: false };
} else {
  const text = words.join(' ').trim();
  if (!text) die('give the line as the first argument, or --clear');
  const tone = opt('--tone') || 'warn';
  if (tone !== 'warn' && tone !== 'info') die('--tone is warn or info');
  let until = opt('--until');
  if (until) {
    const t = Date.parse(until);
    if (!Number.isFinite(t)) die(`--until "${until}" is not a date the app can read; use 2026-10-04T18:00Z`);
    until = new Date(t).toISOString();
  } else {
    const hours = Number(opt('--hours') || 24);
    if (!(hours > 0)) die('--hours must be a positive number');
    until = new Date(Date.now() + hours * 3600e3).toISOString();
  }
  raw = { enabled: true, tone, text, until, written: new Date().toISOString() };
  if (!parseStatus(raw)) die('that file would show nothing (is --until already past?)');
}

const out = resolve(opt('--out') || DEFAULT_OUT);
writeFileSync(out, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
console.log(`wrote ${out}`);
console.log(describe(raw));
printUpload(out.split('\\').join('/'));
