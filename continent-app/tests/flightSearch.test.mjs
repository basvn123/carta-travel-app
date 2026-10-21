// T513: one Google Flights search through the vendored fli-js, read from a
// saved results page (the ds:1 data script only), so it runs offline.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchDay, blockReason, googleLink } from "../workers/shared/flightSearch.mjs";

const page = readFileSync(new URL("./fixtures/gflights-BRU-BCN-2026-11-18.txt", import.meta.url), "utf8");
const serve = (body, status = 200, url = "https://www.google.com/travel/flights") =>
  async () => Object.defineProperty(new Response(body, { status }), "url", { value: url });

test("a saved page gives every flight of the day, cheapest first", async () => {
  const r = await searchDay({ from: "BRU", to: "BCN", date: "2026-11-18", fetchImpl: serve(page) });
  assert.equal(r.ok, true);
  assert.ok(r.flights.length >= 5);
  const [first] = r.flights;
  assert.deepEqual(
    { price: first.price, airline: first.airline, dep: first.dep, arr: first.arr, stops: first.stops },
    { price: 87, airline: "VY", dep: "21:55", arr: "23:59", stops: 0 },
  );
  assert.equal(first.airlineName, "Vueling");
  for (let i = 1; i < r.flights.length; i++) assert.ok(r.flights[i].price >= r.flights[i - 1].price);
  assert.ok(r.flights.some((f) => f.stops > 0 && f.via.length === f.stops));
  assert.match(r.link, /^https:\/\/www\.google\.com\/travel\/flights\?q=/);
});

test("a refusal is reported as blocked, never as no flights", async () => {
  const sorry = await searchDay({
    from: "BRU", to: "BCN", date: "2026-11-18",
    fetchImpl: serve("<html>Our systems have detected unusual traffic</html>", 200),
  });
  assert.equal(sorry.ok, false);
  assert.equal(sorry.blocked, true);
  const limited = await searchDay({ from: "BRU", to: "BCN", date: "2026-11-18", fetchImpl: serve("", 429) });
  assert.equal(limited.blocked, true);
});

test("block reasons", () => {
  assert.equal(blockReason(429, "https://www.google.com/x", ""), "http429");
  assert.equal(blockReason(200, "https://www.google.com/sorry/index", ""), "sorry");
  assert.equal(blockReason(200, "https://consent.google.com/m", "ds:1"), "consent");
  assert.equal(blockReason(200, "https://www.google.com/travel/flights", "no data"), "empty");
  // A normal page mentions reCAPTCHA in its scripts; that alone is not a block.
  assert.equal(blockReason(200, "https://www.google.com/travel/flights", "recaptcha ds:1"), null);
});

test("bad queries never reach Google", async () => {
  let called = false;
  const spy = async () => { called = true; return new Response(page); };
  for (const q of [
    { from: "BRU", to: "BRU", date: "2026-11-18" },
    { from: "bru", to: "BCN", date: "2026-11-18" },
    { from: "BRU", to: "BCN", date: "18-11-2026" },
  ]) {
    const r = await searchDay({ ...q, fetchImpl: spy });
    assert.equal(r.ok, false);
    assert.equal(r.blocked, false);
  }
  assert.equal(called, false);
});

test("the booking link names the route and the day", () => {
  assert.equal(
    googleLink("CRL", "BGY", "2026-11-18"),
    "https://www.google.com/travel/flights?q=Flights%20from%20CRL%20to%20BGY%20on%202026-11-18%20one%20way&curr=EUR&hl=en",
  );
});
