// T689 (F4): what a price says on screen, plan "Carta prijslogica Explore"
// rule 2 and invariant V4: one amount and its unit, no tilde, no "about",
// no "live", no estimate dot, no assumption line. Whether a price is
// measured, live or estimated stays in the engine's lines (lib/price/) and
// the internal view. Owner, 2026-10-24: the tilde leaves the screen.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { formatApprox, formatEst, formatMoney } from "../src/lib/money.js";
import { readFileSync as readFx } from "node:fs";
import { setStayRecords } from "../src/lib/staysData.js";
import { priceDays, priceRequest, seatsOf } from "../src/lib/price/index.js";
import { shownDay, shownWay, viewFactor, wayFactor } from "../src/lib/price/display.js";
import { underOk } from "../src/lib/guidedSearch.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LANGS = ["en", "nl", "de", "fr", "es", "it"];

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f.startsWith(".")) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(f)) out.push(p);
  }
  return out;
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const sources = () => walk(join(ROOT, "src"))
  .filter((p) => !/[\\/]i18n[\\/]/.test(p))
  .map((p) => ({ rel: relative(ROOT, p).replace(/\\/g, "/"), text: strip(readFileSync(p, "utf8")) }));
const catalogue = (lang) => readFileSync(join(ROOT, "src", "i18n", `${lang}.js`), "utf8");

test("V4: an estimate is written like any figure", () => {
  for (const v of [87.4, 1234.5, 0.5]) {
    assert.equal(formatApprox(v), formatMoney(v));
    assert.equal(formatEst(v, "est."), formatMoney(v));
    assert.equal(formatApprox(v, { precision: "cents" }), formatMoney(v, { precision: "cents" }));
    assert.ok(!formatApprox(v).includes("~"));
  }
});

test("V4: no catalogue writes an estimate mark or an 'about' into a price", () => {
  for (const lang of LANGS) {
    const s = catalogue(lang);
    assert.match(s, /"money\.estSpoken": "\{price\}"/, `${lang}: money.estSpoken`);
    const marked = s.match(/"[\w.]+": "[^"\n]*~\{(price|eur|amount|n)\}[^"\n]*"/g) || [];
    // A tilde before a duration or a distance is not a price ("~12 min").
    const prices = marked.filter((m) => !/min|km|h\b|Min|Std/.test(m.split(": ")[1]));
    assert.deepEqual(prices, [], `${lang}: a price template with a tilde`);
  }
});

test("V4: no screen prints the live mark, the estimate dot or a tilde before a figure", () => {
  const bad = [];
  for (const { rel, text } of sources()) {
    if (/t\(\s*['"]stay\.live['"]/.test(text)) bad.push(`${rel}: stay.live`);
    if (/<InfoDot\s+term="estimate"/.test(text)) bad.push(`${rel}: InfoDot estimate`);
    if (/['"`]~['"`]\s*\+\s*\w*(eur|money|price|fig)/i.test(text)
      || /\$\{[^}]*\?\s*'~'\s*:\s*''\}\$\{[^}]*(eur|money|price|fig)/i.test(text)) bad.push(`${rel}: tilde before a figure`);
  }
  assert.deepEqual(bad, []);
});

// ── T694: per person or the whole group (plan rule 4, V15, V16) ─────────

const FX = JSON.parse(readFx(new URL("./fixtures/price/destinations.json", import.meta.url), "utf8"));
setStayRecords(FX.stays);
const reqs = (view) => [
  priceRequest({ choices: { group_size: 2, price_view: view } }),
  priceRequest({ choices: { group_size: 7, children: 2, stay_tier: "hotel3", price_view: view }, departDate: "2026-12-05", returnDate: "2026-12-12", ownDates: true }),
  priceRequest({ choices: { group_size: 3, price_view: view }, departDate: "2026-11-02", returnDate: "2026-11-05", dateFlex: "month" }),
];

test("V16: the total is the per-person figure times the group (and the nights for a day), to the cent", () => {
  for (const [pp, tot] of reqs("pp").map((r, i) => [r, reqs("total")[i]])) {
    assert.equal(viewFactor(pp), 1);
    assert.equal(viewFactor(tot), seatsOf(tot) * tot.nights);
    assert.equal(wayFactor(tot), seatsOf(tot));
    for (const row of priceDays(FX.destinations, pp).values()) {
      const c = Math.round(row.dayEur * 100);
      assert.equal(Math.round(shownDay(row.dayEur, tot) * 100), c * seatsOf(tot) * tot.nights);
      assert.equal(shownDay(row.dayEur, pp), row.dayEur);
    }
    assert.equal(shownWay(123.45, tot), Math.round(123.45 * seatsOf(tot) * 100) / 100);
  }
});

test("V15 and V16: a filter compares the shown figure with the shown threshold, and both views keep the same places in the same order", () => {
  for (const [pp, tot] of reqs("pp").map((r, i) => [r, reqs("total")[i]])) {
    const rows = [...priceDays(FX.destinations, pp)].map(([id, cost]) => ({ id, cost }));
    for (const ceiling of [60, 80, 100, 130]) {
      const inPp = rows.filter((p) => shownDay(p.cost.dayEur, pp) <= ceiling * viewFactor(pp)).map((p) => p.id);
      const inTot = rows.filter((p) => shownDay(p.cost.dayEur, tot) <= ceiling * viewFactor(tot)).map((p) => p.id);
      assert.deepEqual(inTot, inPp, `ceiling ${ceiling}`);
      assert.deepEqual(inPp, rows.filter(underOk(ceiling)).map((p) => p.id), "the stored per-person rule");
    }
    const order = (r) => [...rows].sort((a, b) => shownDay(a.cost.dayEur, r) - shownDay(b.cost.dayEur, r)).map((p) => p.id);
    assert.deepEqual(order(tot), order(pp));
  }
});

test("T694: the view is a setting with a URL key, and nothing else reads as total", () => {
  const src = readFx(new URL("../src/lib/urlState.js", import.meta.url), "utf8");
  assert.match(src, /q\.set\('pv', 't'\)/);
  assert.match(src, /out\.price_view = q\.get\('pv'\) === 't'/);
  assert.equal(priceRequest({ choices: { price_view: "total" } }).view, "total");
  assert.equal(priceRequest({ choices: { price_view: "nonsense" } }).view, "pp");
});

// ── T695: the opened price and its switches (plan rule 9, V9, V5) ───────
test("V9: an item switched off and on again gives back the reference amount, and the amount is the sum of the items that are on", () => {
  for (const id of Object.keys(FX.destinations)) {
    const base = priceDays(FX.destinations, priceRequest({})).get(id);
    for (const off of [["food"], ["bed"], ["bed", "food"], ["transport", "events"]]) {
      const req = priceRequest({ choices: { price_excluded: off } });
      const row = priceDays(FX.destinations, req).get(id);
      const on = row.lines.filter((l) => l.status === "included");
      const sum = on.length && on.every((l) => l.eur != null) ? Math.round(on.reduce((s, l) => s + l.eur, 0) * 100) / 100 : null;
      assert.equal(row.dayEur, sum, `${id} off ${off}`);
      const back = priceDays(FX.destinations, priceRequest({ choices: { price_excluded: [] } })).get(id);
      assert.equal(back.dayEur, base.dayEur, `${id} back on`);
    }
  }
});

test("V5: a placeholder item is never counted and never zero", () => {
  const row = priceDays(FX.destinations, priceRequest({})).get("LIS");
  for (const k of ["transport", "activities", "events"]) {
    const l = row.lines.find((x) => x.key === k);
    assert.equal(l.eur, null, k);
    assert.notEqual(l.status, "included", k);
  }
  const off = priceDays(FX.destinations, priceRequest({ choices: { price_excluded: ["transport", "events", "activities"] } })).get("LIS");
  assert.equal(off.dayEur, row.dayEur, "switching a placeholder off moves nothing");
});

test("V9: the calculator drops a switched-off item and the flight, and adds up", async () => {
  const { quoteNights } = await import("../src/lib/price/nights.js");
  const row = priceDays(FX.destinations, priceRequest({ choices: { price_excluded: ["food"] } })).get("gem:como");
  const carta = { total: 300, perSeat: 150 };
  const r = quoteNights(row, 7, 2, null, carta);
  assert.deepEqual(r.lines.map((l) => l.key), ["flight", "stay"]);
  assert.equal(r.total, Math.round(r.lines.reduce((s, l) => s + l.eur, 0) * 100) / 100);
  assert.equal(r.dayEur, row.stayEur);
  const all = quoteNights(priceDays(FX.destinations, priceRequest({})).get("gem:como"), 7, 2, null, carta);
  assert.deepEqual(all.lines.map((l) => l.key), ["flight", "stay", "ground"]);
});

test("rule 9: the switched-off items are a setting with a URL key and only known items count", () => {
  const src = readFx(new URL("../src/lib/urlState.js", import.meta.url), "utf8");
  assert.match(src, /q\.set\('px', choices\.price_excluded\.join\('\.'\)\)/);
  assert.deepEqual(priceRequest({ choices: { price_excluded: ["food", "nonsense"] } }).excluded, ["food"]);
});

// ── T698: the short line names what is in the price (B11) ───────────────
test("B11: the day sentence names the items that are in the price, from the engine's lines", async () => {
  const { includedParts } = await import("../src/lib/price/display.js");
  const { dayIncludesText } = await import("../src/lib/dayIncludes.js");
  const en = (await import("../src/i18n/en.js")).en;
  const t = (k, v = {}) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? "");
  const row = priceDays(FX.destinations, priceRequest({})).get("LIS");
  assert.deepEqual(includedParts(row), ["bed", "food"], "local transport is not in it yet");
  assert.equal(dayIncludesText(t, includedParts(row)), "A bed plus food and drink.");
  const noFood = priceDays(FX.destinations, priceRequest({ choices: { price_excluded: ["food"] } })).get("LIS");
  assert.deepEqual(includedParts(noFood), ["bed"]);
  const priced = { lines: [...row.lines.map((l) => (l.key === "transport" ? { ...l, status: "included", eur: 4.2 } : l))] };
  assert.deepEqual(includedParts(priced), ["bed", "food", "transport"], "F8 joins by itself");
});
