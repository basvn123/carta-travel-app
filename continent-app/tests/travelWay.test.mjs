// T579 + T582: the party's shares and the way there by mode.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import {
  TRAVEL_MODES, nextMode, travelMode, partyOf, foodShare, ticketShare, flightPerSeat,
  homePoint, groundReturn, wayFor, BABY_LAP_FEE_LEG,
} from "../src/lib/travelWay.js";

const BRUSSELS = { lat: 50.85, lon: 4.35, iso2: "BE", country: "Belgium" };
const PARIS = { id: "PAR", iso2: "FR", country: "France", lat: 48.86, lon: 2.35, local_transport: {} };
const PALMA = { id: "PMI", iso2: "ES", country: "Spain", lat: 39.57, lon: 2.65, local_transport: { road_connected: false } };

test("the mode button cycles through every way and back to any", () => {
  let m = "any";
  const seen = [];
  for (let i = 0; i < TRAVEL_MODES.length; i++) { seen.push(m); m = nextMode(m); }
  assert.deepEqual(seen, ["any", "plane", "train", "bus", "car"]);
  assert.equal(m, "any");
  assert.equal(travelMode({ transport_mode: "rocket" }), "any");
  assert.equal(travelMode({ transport_mode: "car" }), "car");
});

test("the party: seats are adults plus children, babies ride on a lap", () => {
  assert.deepEqual(partyOf({ group_size: 4, children: 2, babies: 1 }), { adults: 2, children: 2, babies: 1, seats: 4 });
  assert.deepEqual(partyOf({}), { adults: 2, children: 0, babies: 0, seats: 2 });
  // Never a party of children only.
  assert.equal(partyOf({ group_size: 2, children: 5 }).adults, 1);
});

test("children eat less and pay half a ticket; adults alone are unchanged", () => {
  assert.equal(foodShare(partyOf({ group_size: 2 })), 1);
  assert.equal(ticketShare(partyOf({ group_size: 2 })), 1);
  const fam = partyOf({ group_size: 4, children: 2, babies: 1 });
  assert.ok(foodShare(fam) < 1 && foodShare(fam) > 0.6);
  assert.equal(ticketShare(fam), 0.75);
});

test("a baby's lap fee is shared over the seats", () => {
  const p = partyOf({ group_size: 2, babies: 1 });
  assert.equal(flightPerSeat(100, p), 100 + BABY_LAP_FEE_LEG);
  assert.equal(flightPerSeat(0, p), null);
});

test("the start point: a named place wins over the home airport's town", () => {
  const data = {
    destinations: { a: { country: "Belgium", iso2: "BE" } },
    meta: { origins: { CRL: { city: "Charleroi", country: "Belgium", lat: 50.46, lon: 4.45 } } },
  };
  assert.equal(homePoint({ origin: "CRL" }, data).iso2, "BE");
  assert.equal(homePoint({ origin: "CRL" }, data).name, "Charleroi");
  const named = homePoint({ origin: "CRL", drive_home: { name: "Ghent", lat: 51.05, lon: 3.72, iso2: "BE" } }, data);
  assert.equal(named.name, "Ghent");
  assert.equal(homePoint({}, data), null);
});

test("ground ways reach the mainland and not an island", () => {
  const p = partyOf({ group_size: 2 });
  for (const mode of ["train", "bus", "car"]) {
    const r = groundReturn(PARIS, BRUSSELS, mode, p);
    assert.ok(r && r.perPerson > 0 && Number.isFinite(r.total), mode);
  }
  assert.equal(groundReturn(PALMA, BRUSSELS, "train", p), null);
  assert.equal(groundReturn(PARIS, BRUSSELS, "plane", p), null);
});

test("the car is shared, so a bigger party pays less each", () => {
  const two = groundReturn(PARIS, BRUSSELS, "car", partyOf({ group_size: 2 }));
  const four = groundReturn(PARIS, BRUSSELS, "car", partyOf({ group_size: 4 }));
  assert.ok(four.perPerson < two.perPerson);
});

test("any way picks the cheapest; a single mode keeps to itself", () => {
  const party = partyOf({ group_size: 2 });
  const flight = { perSeat: 1, airline: "FR" };
  assert.equal(wayFor(PARIS, "any", { home: BRUSSELS, party, flight }).mode, "plane");
  assert.equal(wayFor(PARIS, "bus", { home: BRUSSELS, party, flight }).mode, "bus");
  assert.equal(wayFor(PALMA, "train", { home: BRUSSELS, party }), null);
  assert.equal(wayFor(PALMA, "any", { home: BRUSSELS, party, flight: { perSeat: 80, airline: "FR" } }).mode, "plane");
});
