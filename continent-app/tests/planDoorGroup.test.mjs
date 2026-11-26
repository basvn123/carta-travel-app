// G12 follow-up: the Plan door's Friends card. One group, the most recently
// active with a place or dates in play, opens Plan through Vrienden's seam
// (friendsSeed) with its place, dates and band as a guide. Run: npm test
// (continent-app/). Pure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { doorGroups } from "../src/lib/plan/doorGroup.js";
import { friendsSeed } from "../src/lib/plan/seedWriters.js";
import { activeBudget } from "../src/lib/recommend/budgetCompass.js";

const TODAY = "2026-11-26";
const destinations = { LIS: { city: "Lisbon", iso2: "PT" }, SPU: { city: "Split", iso2: "HR" } };
const me = "u-me";
const members = [{ userId: me, status: "joined" }, { userId: "u2", status: "joined" }, { userId: "u3", status: "invited" }];

const trip = (over = {}) => ({
  id: "g1", title: "South 2027", myStatus: "joined", bookedPlanId: null, createdAt: "2026-10-01T10:00:00Z", members,
  options: [
    { id: "w1", kind: "when", start: "2027-05-01", end: "2027-05-06", at: "2026-10-02T10:00:00Z" },
    { id: "p1", kind: "where", destId: "LIS", at: "2026-10-03T10:00:00Z" },
  ],
  votes: [{ kind: "when", userId: "u2", optionId: "w1" }, { kind: "where", userId: "u2", optionId: "p1" }],
  band: { top: 900, ready: true, set: 3, members: 3 },
  ...over,
});

const circle = (over = {}) => ({
  id: "c1", name: "Unif", myStatus: "joined", createdAt: "2026-11-01T10:00:00Z", members,
  proposals: [{ id: "pp1", destId: "SPU", created_at: "2026-11-02T10:00:00Z" }],
  votes: [{ proposal_id: "pp1", user_id: "u2", value: 1 }],
  availability: [
    { user_id: me, start_date: "2027-06-01", end_date: "2027-06-08" },
    { user_id: "u2", start_date: "2027-06-03", end_date: "2027-06-10" },
  ],
  ...over,
});

test("no groups, or nothing in play: no card", () => {
  assert.deepEqual(doorGroups({ today: TODAY }), []);
  assert.deepEqual(doorGroups({ groups: [trip({ votes: [] })], today: TODAY }), [], "no votes, no leader, nothing in play");
  assert.deepEqual(doorGroups({ groups: [trip({ myStatus: "invited" })], today: TODAY }), [], "an open invite is not your group yet");
  assert.deepEqual(doorGroups({ groups: [trip({ bookedPlanId: "tp1" })], today: TODAY }), [], "a booked group trip is done");
  assert.deepEqual(doorGroups({ circles: [circle({ votes: [], availability: [] })], today: TODAY }), []);
});

test("a group trip: the leading place and dates, the band a guide", () => {
  const [pick] = doorGroups({ groups: [trip()], destinations, today: TODAY });
  assert.equal(pick.kind, "group");
  assert.equal(pick.title, "South 2027");
  assert.deepEqual(pick.place, { destId: "LIS", iso2: "PT", name: "Lisbon", start: "2027-05-01", end: "2027-05-06" });
  const seed = friendsSeed(pick.group, pick.place);
  assert.equal(seed.source, "friends");
  assert.deepEqual(seed.ref, { kind: "group", id: "g1" });
  assert.deepEqual(seed.places.map((p) => [p.id, p.iso2]), [["LIS", "PT"]]);
  assert.deepEqual([seed.when.start, seed.when.end], ["2027-05-01", "2027-05-06"]);
  assert.equal(seed.budget.mode, "band");
  assert.equal(activeBudget(seed.budget).mode, "soft", "the band guides, it never caps");
  assert.deepEqual(seed.coplanners, [me, "u2"]);
});

test("dates that have passed are not in play; a place alone still is", () => {
  const old = trip({ options: [{ id: "w1", kind: "when", start: "2026-05-01", end: "2026-05-06" }, { id: "p1", kind: "where", destId: "LIS" }] });
  const [pick] = doorGroups({ groups: [old], destinations, today: TODAY });
  assert.equal(pick.place.start, undefined);
  assert.equal(friendsSeed(pick.group, pick.place).when, null);
  const onlyOld = trip({ options: [{ id: "w1", kind: "when", start: "2026-05-01", end: "2026-05-06" }], votes: [{ kind: "when", userId: "u2", optionId: "w1" }] });
  assert.deepEqual(doorGroups({ groups: [onlyOld], today: TODAY }), []);
});

test("a kring: the top proposal and the best window, no band, ref circle", () => {
  const [pick] = doorGroups({ circles: [circle()], destinations, today: TODAY });
  assert.equal(pick.kind, "circle");
  assert.equal(pick.title, "Unif");
  assert.equal(pick.place.destId, "SPU");
  assert.deepEqual([pick.place.start, pick.place.end], ["2027-06-03", "2027-06-08"]);
  const seed = friendsSeed(pick.group, pick.place);
  assert.deepEqual(seed.ref, { kind: "circle", id: "c1" });
  assert.equal(seed.groupId, null, "a kring is not a group trip");
  assert.equal(seed.budget, null, "a kring has no band: no budget invented");
  const down = circle({ votes: [{ proposal_id: "pp1", user_id: "u2", value: -1 }], availability: [] });
  assert.deepEqual(doorGroups({ circles: [down], today: TODAY }), [], "a proposal with no positive score does not lead");
});

test("several groups: the most recently active first", () => {
  const quiet = trip({ id: "g-old", createdAt: "2026-01-01T10:00:00Z", options: trip().options.map((o) => ({ ...o, at: "2026-01-02T10:00:00Z" })) });
  const busy = trip({ id: "g-new", createdAt: "2026-02-01T10:00:00Z", options: trip().options.map((o) => ({ ...o, at: "2026-11-20T10:00:00Z" })) });
  const list = doorGroups({ groups: [quiet, busy], circles: [circle()], today: TODAY });
  assert.deepEqual(list.map((g) => g.id), ["g-new", "c1", "g-old"]);
});

test("the door: one card through planGroupTrip, All groups only with more than one", () => {
  const home = readFileSync(new URL("../src/planner/flow/PlanHome.jsx", import.meta.url), "utf8");
  assert.match(home, /planGroupTrip\(topGroup\.group, topGroup\.place\)/);
  assert.match(home, /groupsInPlay\.length > 1 \?/);
  const door = readFileSync(new URL("../src/planner/flow/PlanDoor.jsx", import.meta.url), "utf8");
  assert.match(door, /t\('pf\.door\.group', \{ name: group\.title \}\)/);
  for (const lang of ["en", "nl", "de", "fr", "es", "it"]) {
    const src = readFileSync(new URL(`../src/i18n/${lang}.js`, import.meta.url), "utf8");
    assert.match(src, /"pf\.door\.group": ".*\{name\}"/, lang);
    assert.match(src, /"pf\.door\.groups": "/, lang);
  }
});
