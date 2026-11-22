// G12, D10 (explore-top-2, audit-perf.md cause 1): the country stays files
// are published together as one immutable snapshot, so a reader never sees
// records newer than the version its figures were keyed on, and 43 arrivals
// cost one or a few re-prices instead of 43.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import {
  loadStays, loadStaysFor, publishStays, setStayRecords, stayRecord, staysDataVersion,
} from "../src/lib/staysData.js";

const FILES = {
  AA: { built: "2026-11-01", dests: { a1: { m: [1] }, a2: { m: [2] } } },
  BB: { built: "2026-11-01", dests: { b1: { m: [3] } } },
  CC: { built: "2026-11-01", dests: { c1: { m: [4] } } },
  DD: { built: "2026-11-01", dests: { d1: { m: [5] } } },
};

// A fetch that answers each country file from FILES, once its gate opens.
function stubFetch() {
  const gates = new Map();
  const open = (cc) => gates.get(cc)?.();
  globalThis.fetch = async (url) => {
    const cc = String(url).match(/\/([A-Z]{2})\.json/)?.[1];
    if (!cc || !FILES[cc]) return { ok: false, status: 404, headers: { get: () => "" }, json: async () => null };
    await new Promise((ok) => gates.set(cc, ok));
    return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => FILES[cc] };
  };
  return open;
}
const tick = () => new Promise((ok) => setTimeout(ok, 0));

test("setStayRecords is readable at once and bumps the version", () => {
  const v = staysDataVersion();
  setStayRecords({ x1: { m: [9] } });
  assert.equal(staysDataVersion(), v + 1);
  assert.deepEqual(stayRecord("x1"), { m: [9] });
  setStayRecords({});
  assert.equal(stayRecord("x1"), null);
});

test("an arrived file is not readable until the publish, then records and version change together", async () => {
  setStayRecords({});
  const open = stubFetch();
  const v0 = staysDataVersion();
  const pa = loadStays("AA");
  const pb = loadStays("BB");
  await tick();
  open("AA");
  await pa;
  open("BB");
  await pb;
  // Both files are in, nothing is published: the old snapshot is intact.
  assert.equal(stayRecord("a1"), null);
  assert.equal(stayRecord("b1"), null);
  assert.equal(staysDataVersion(), v0);
  publishStays();
  // One publish for two files, and both appear in the same step.
  assert.equal(staysDataVersion(), v0 + 1);
  assert.deepEqual(stayRecord("a1"), { m: [1] });
  assert.deepEqual(stayRecord("b1"), { m: [3] });
  // A publish with nothing new keeps the version.
  publishStays();
  assert.equal(staysDataVersion(), v0 + 1);
});

test("loadStaysFor publishes once when the last file is in", async () => {
  setStayRecords({});
  const open = stubFetch();
  const v0 = staysDataVersion();
  const all = loadStaysFor({ c: { iso2: "CC" }, d: { iso2: "DD" } });
  await tick();
  open("CC");
  open("DD");
  await all;
  assert.equal(staysDataVersion(), v0 + 1);
  assert.deepEqual(stayRecord("c1"), { m: [4] });
  assert.deepEqual(stayRecord("d1"), { m: [5] });
});
