// T1199 (ROADMAP D19): entry rules on the country page. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { entryRowsFor, entryLine, ENTRY_GROUPS } from "../src/lib/entryRules.js";
import { validateEntryRules } from "../scripts/ci/contract.mjs";
import { en } from "../src/i18n/en.js";

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(here, "..", "public", "entry_rules.json"), "utf8"));
const t = (k, v = {}) => {
  const s = en[k];
  assert.ok(typeof s === "string", `missing key ${k}`);
  return s.replace(/\{(\w+)\}/g, (_, n) => String(v[n] ?? `{${n}}`));
};

test("the shipped file passes the contract and covers the catalogue", () => {
  const app = JSON.parse(readFileSync(join(here, "..", "public", "app_data.json"), "utf8"));
  const countries = [...new Set(Object.values(app.destinations).map((d) => d.iso2).filter(Boolean))];
  assert.deepEqual(validateEntryRules(doc, { countries }), []);
});

test("every code and source has words in English", () => {
  for (const code of doc.codes) t(`entry.need.${code}`);
  for (const id of Object.keys(doc.sources)) t(`entry.src.${id}`);
  for (const g of ENTRY_GROUPS) t(`entry.group.${g}`);
});

test("a Schengen country reads four lines with sources and dates", () => {
  const { rows, advice } = entryRowsFor(doc, "IT");
  assert.deepEqual(rows.map((r) => r.group), ENTRY_GROUPS);
  assert.equal(entryLine(rows[0], t), "ID card or passport");
  assert.match(entryLine(rows[2], t), /^Passport, fingerprints and photo at the border \(EES\), ETIAS later/);
  assert.ok(rows.every((r) => r.url.startsWith("https://") && /^\d{4}-\d{2}-\d{2}$/.test(r.checked)));
  assert.equal(advice.url, "https://www.gov.uk/foreign-travel-advice/italy");
});

test("a line with no source says to ask the embassy, and an unknown country shows nothing", () => {
  const { rows } = entryRowsFor(doc, "RS");
  const visa = rows.find((r) => r.group === "visa");
  assert.equal(entryLine(visa, t), en["entry.askEmbassy"]);
  assert.equal(entryRowsFor(doc, "ZZ"), null);
  assert.equal(entryRowsFor(null, "IT"), null);
});
