// The status file on the data host (T316, register T218-a). Run: npm test
// (from continent-app/). Pins the rules in src/lib/statusFile.js: which files
// show a line, which stay silent, and that the loader never throws or hangs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseStatus, siteNotice, pickNotice, statusUrl, fetchStatus,
} from "../src/lib/statusFile.js";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const BOM = String.fromCharCode(0xfeff);
const EMDASH = String.fromCharCode(0x2014);

test("statusUrl sits next to the shards, and there is none without a data host", () => {
  assert.equal(statusUrl("https://data.carta-europetravel.com/data"),
    "https://data.carta-europetravel.com/data/status.json");
  assert.equal(statusUrl(""), "");
});

test("a live file gives one line with its tone", () => {
  const n = parseStatus({ enabled: true, tone: "warn", text: "  Saving trips is down.  " }, { now: NOW });
  assert.deepEqual(n, { text: "Saving trips is down.", tone: "warn", source: "status" });
  assert.equal(parseStatus({ enabled: true, text: "x", tone: "loud" }, { now: NOW }).tone, "info");
});

test("anything not plainly switched on stays silent", () => {
  for (const raw of [null, undefined, "on", 3, [], {}, { text: "x" }, { enabled: "true", text: "x" },
    { enabled: false, text: "x" }, { enabled: true }, { enabled: true, text: "   " },
    { enabled: true, text: 42 }, { enabled: true, text: ["x"] }]) {
    assert.equal(parseStatus(raw, { now: NOW }), null, JSON.stringify(raw));
  }
});

test("until ends the line by itself, and a bad until is ignored", () => {
  const base = { enabled: true, text: "x" };
  assert.equal(parseStatus({ ...base, until: "2026-10-03T11:59:59Z" }, { now: NOW }), null);
  assert.equal(parseStatus({ ...base, until: "2026-10-03T12:00:00Z" }, { now: NOW }), null);
  assert.ok(parseStatus({ ...base, until: "2026-10-03T12:00:01Z" }, { now: NOW }));
  assert.ok(parseStatus({ ...base, until: "tomorrow-ish" }, { now: NOW }));
});

test("text by language falls back to English", () => {
  const raw = { enabled: true, text: { en: "Down.", nl: "Plat." } };
  assert.equal(parseStatus(raw, { lang: "nl", now: NOW }).text, "Plat.");
  assert.equal(parseStatus(raw, { lang: "de", now: NOW }).text, "Down.");
  assert.equal(parseStatus({ enabled: true, text: { nl: "Plat." } }, { lang: "fr", now: NOW }), null);
});

test("dashes in the owner's text are rewritten, like every other string", () => {
  const n = parseStatus({ enabled: true, text: `Sign-in is down ${EMDASH} trips are safe` }, { now: NOW });
  assert.equal(n.text, "Sign-in is down, trips are safe");
});

test("the status file wins over the site notice, and the bar shows one line", () => {
  const site = siteNotice({ enabled: true, tone: "info", text: "Fares refresh tonight" });
  const status = parseStatus({ enabled: true, tone: "warn", text: "Supabase is down" }, { now: NOW });
  assert.equal(pickNotice(status, site), status);
  assert.equal(pickNotice(null, site), site);
  assert.equal(pickNotice(null, siteNotice({ enabled: false, text: "x" })), null);
});

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });

test("fetchStatus decodes a good file, a BOM included", async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => { seen.push([url, opts.credentials]); return res(200, `${BOM}{"enabled":true,"text":"x"}`); };
  const raw = await fetchStatus({ base: "https://d.example/data", fetchImpl });
  assert.deepEqual(raw, { enabled: true, text: "x" });
  assert.deepEqual(seen, [["https://d.example/data/status.json", "omit"]]);
});

test("fetchStatus is null for a 404, an HTML fallback, bad JSON and a network error", async () => {
  const cases = [
    async () => res(404, "not found"),
    async () => res(200, "<!doctype html><html></html>"),
    async () => res(200, "{\"enabled\": true,"),
    async () => { throw new TypeError("Failed to fetch"); },
    async () => undefined,
  ];
  for (const fetchImpl of cases) {
    assert.equal(await fetchStatus({ base: "https://d.example/data", fetchImpl }), null);
  }
  assert.equal(await fetchStatus({ base: "https://d.example/data", fetchImpl: null }), null);
});

test("a build without a data host makes no request at all", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return res(200, "{\"enabled\":true,\"text\":\"x\"}"); };
  assert.equal(await fetchStatus({ base: "", fetchImpl }), null);
  assert.equal(calls, 0);
});

test("fetchStatus gives up on a slow host and aborts the request", async () => {
  let aborted = false;
  const fetchImpl = (url, { signal }) => new Promise((resolve) => {
    signal.addEventListener("abort", () => { aborted = true; });
    setTimeout(() => resolve(res(200, "{\"enabled\":true,\"text\":\"late\"}")), 500);
  });
  const t0 = Date.now();
  assert.equal(await fetchStatus({ base: "https://d.example/data", fetchImpl, timeoutMs: 50 }), null);
  assert.ok(Date.now() - t0 < 400, "returned before the slow response");
  assert.ok(aborted, "the request was aborted");
});
