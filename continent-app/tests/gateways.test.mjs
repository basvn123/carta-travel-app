// T763 step 8 (closes T755-b): an airport row of a multi-airport city
// (`gateway_of` names the city row) is never a place of its own, and a link
// to it opens its city. Reads the real wire in public/app_data.json.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { isGateway, gatewayCity } from "../src/lib/rating.js";
import { dedupeGateways } from "../src/hooks/useExploreCatalog.js";
import { nearbyPlaces } from "../src/lib/nearby.js";
import { buildCountryBriefs } from "../src/lib/countryBrief.js";

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const HAVE = existsSync(pub("app_data.json"));
const data = HAVE ? JSON.parse(readFileSync(pub("app_data.json"), "utf8")) : null;
const dests = data?.destinations || {};
const gateways = Object.entries(dests).filter(([, d]) => isGateway(d));

test("every gateway row names an existing city row that is not a gateway", { skip: !HAVE }, () => {
  assert.ok(gateways.length > 0, "the wire carries gateway rows");
  for (const [id, d] of gateways) {
    const city = dests[d.gateway_of];
    assert.ok(city, `${id} -> ${d.gateway_of} exists`);
    assert.ok(!isGateway(city), `${id} -> ${d.gateway_of} is a city row`);
    assert.equal(gatewayCity(id, dests), d.gateway_of);
  }
});

test("#dest=CIA opens Rome (FCO); a city id opens itself", { skip: !HAVE }, () => {
  assert.equal(gatewayCity("CIA", dests), "FCO");
  assert.equal(gatewayCity("FCO", dests), "FCO");
  assert.equal(gatewayCity("BCN", dests), "BCN");
  assert.equal(gatewayCity("not-a-place", dests), "not-a-place");
});

test("gatewayCity stops on a loop", () => {
  const loop = { A: { gateway_of: "B" }, B: { gateway_of: "A" } };
  assert.ok(["A", "B"].includes(gatewayCity("A", loop)));
});

test("Explore (and Ask Carta, which reads Explore's rows) drops every gateway", { skip: !HAVE }, () => {
  const rows = Object.entries(dests).map(([id, d]) => ({ id, ...d }));
  const out = dedupeGateways(rows);
  const ids = new Set(out.map((p) => p.id));
  for (const [id] of gateways) assert.ok(!ids.has(id), `${id} not in Explore`);
  assert.equal(out.length, rows.length - gateways.length);
});

test("nearby places never list a gateway", { skip: !HAVE }, () => {
  for (const [, d] of gateways) {
    const city = dests[d.gateway_of];
    const near = nearbyPlaces({ ...city, id: d.gateway_of }, dests, 50);
    for (const p of near) assert.ok(!isGateway(dests[p.id]), `${p.id} near ${d.gateway_of}`);
  }
});

test("country briefs never count a gateway", { skip: !HAVE }, () => {
  const sub = {};
  const ccs = new Set(gateways.map(([, d]) => d.country));
  for (const [id, d] of Object.entries(dests)) if (ccs.has(d.country)) sub[id] = d;
  const withAll = buildCountryBriefs(sub);
  const without = buildCountryBriefs(Object.fromEntries(Object.entries(sub).filter(([, d]) => !isGateway(d))));
  assert.deepEqual(JSON.parse(JSON.stringify([...withAll])), JSON.parse(JSON.stringify([...without])));
});
