// Shared settings for the Carta k6 load tests (ROADMAP H4, T1158).
// Run any file with: k6 run -e BASE_URL=https://preview.carta-app.pages.dev tests/load/<route>.js
// docs/runbooks/load-tests.md explains the numbers and how to read a run.
import http from 'k6/http';
import { Counter, Rate } from 'k6/metrics';

export const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
// The data host serves /dest, /stays and the other R2 tier. Default: same host as the app.
export const DATA = (__ENV.DATA_URL || BASE).replace(/\/$/, '');
// Local runs (wrangler pages dev) trust cf-connecting-ip, so each virtual user gets its own
// address and the per-address limits do not hide the capacity. On the real edge Cloudflare
// overwrites the header: set SPOOF_IP=0 there, and expect 429s from one runner (counted, not failed).
export const SPOOF_IP = (__ENV.SPOOF_IP || '1') !== '0';

// ---- The number: 10x launch traffic -------------------------------------------------
// Launch plan: no traffic forecast exists yet (docs/research/E-R3-models-and-hosting.md
// section 3 uses 1,000 / 10,000 / 100,000 MAU). Launch is taken as 10,000 MAU, so 10x is 100,000 MAU.
export const MAU = Number(__ENV.MAU || 100000);
const SESSIONS_PER_MAU = 2;      // per month (assumption)
const PEAK_HOUR_SHARE = 0.12;    // share of a day's traffic in the busiest hour (evening peak)
const SPIKE = 5;                 // campaign day (4 May) against an ordinary peak hour
// Billed calls per MAU per month, from E-R3 section 3 (ask), plus a flights guess.
const PER_MAU_MONTH = { ask: 6, flights: 4 };
// Static wire files fetched per session: boot.json, a dest shard, a stays shard, a handful of assets.
const STATIC_PER_SESSION = 8;

export function peakRps(perMonth) {
  return (MAU * perMonth / 30) * PEAK_HOUR_SHARE * SPIKE / 3600;
}
const MULT = Number(__ENV.MULT || 1);  // 2 or 3 for a stress run above the 10x target
const ceil1 = (x) => Math.max(1, Math.ceil(x * MULT));
// Arrival rates in requests per second at the 10x campaign peak.
export const RATE = {
  ask: ceil1(peakRps(PER_MAU_MONTH.ask)),
  flights: ceil1(peakRps(PER_MAU_MONTH.flights)),
  stays: ceil1(peakRps(SESSIONS_PER_MAU)),
  static: ceil1(peakRps(SESSIONS_PER_MAU * STATIC_PER_SESSION)),
};

// p95 budgets in ms, per route, on successful answers (edge cache hit or miss mixed).
export const BUDGET = { ask: 800, flights: 2500, stays: 400, static: 300 };

export const refused = new Counter('refused_429');   // the per-address limit answering, by design
export const upstream = new Rate('upstream_502');    // flights/ask upstream failure
export const serverErr = new Rate('server_5xx');     // anything 5xx other than a 502 upstream

let vuIp = null;
export function headers(extra = {}) {
  if (!SPOOF_IP) return extra;
  if (!vuIp) vuIp = `10.${__VU % 250}.${(__VU >> 8) % 250}.${(__ITER % 250) + 1}`;
  return { 'cf-connecting-ip': vuIp, ...extra };
}

export function scenario(rate, exec = 'default') {
  return {
    executor: 'constant-arrival-rate',
    rate, timeUnit: '1s', duration: __ENV.DURATION || '3m',
    preAllocatedVUs: Math.max(20, rate * 4), maxVUs: Math.max(100, rate * 20), exec,
  };
}

export function thresholds(route, extra = {}) {
  return {
    [`http_req_duration{route:${route}}`]: [`p(95)<${BUDGET[route]}`],
    [`http_req_failed{route:${route}}`]: ['rate<0.01'],
    server_5xx: ['rate<0.01'],
    ...extra,
  };
}

// One GET: tags the route, sorts the answer into ok / refused / upstream / error.
export function get(route, url, okCodes = [200]) {
  const res = http.get(url, { headers: headers(), tags: { route }, responseCallback: http.expectedStatuses(...okCodes, 429, 502) });
  if (res.status === 429) refused.add(1);
  upstream.add(res.status === 502);
  serverErr.add(res.status >= 500 && res.status !== 502);
  return res;
}
