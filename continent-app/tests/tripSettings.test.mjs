// T653: the trip planner's settings, their checks, the old wizard draft read
// back into them, and the draft fields written for the planning engine.
// Run: npm test (from continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultSettings, normalizeSettings, answer, withPartyKind, fromDraft, draftPatch,
  nextMonthKey, quizAnswers, dayPrefs, flightRanking, nothingBooked, partySize, PICKABLE,
} from "../src/planner/flow/tripSettings.js";

test("defaults: nothing booked, nothing answered", () => {
  const s = defaultSettings();
  assert.equal(nothingBooked(s), true);
  assert.deepEqual(s.answered, []);
  assert.equal(partySize(s), 2);
});

test("normalize drops junk and clamps numbers", () => {
  const s = normalizeSettings({
    booked: { flights: 1, boats: true },
    party: { kind: "pirates", adults: 99, kids: 2, kidAges: [1, 30, 9], babies: -3 },
    priority: "fast",
    when: { mode: "exact", start: "2027-02-19", end: "nope", months: [13, 3, 3, 0], nights: 0 },
    guide: { likes: ["beach", "moon", "hiking", "food", "city"], avoid: ["crowds", "rain"] },
    rhythm: { steps: 12345, pace: "packed" },
  });
  assert.deepEqual(s.booked, { flights: true, stays: false, car: false, tickets: false });
  assert.equal(s.party.kind, "couple");
  assert.equal(s.party.adults, 20);
  assert.deepEqual(s.party.kidAges, [3, 11]);
  assert.equal(s.party.babies, 0);
  assert.equal(s.priority, "balance");
  assert.equal(s.when.start, "2027-02-19");
  assert.equal(s.when.end, "");
  assert.deepEqual(s.when.months, [3]);
  assert.equal(s.when.nights, 1);
  assert.deepEqual(s.guide.likes, ["beach", "hiking", "food"]);
  assert.deepEqual(s.guide.avoid, ["crowds"]);
  assert.equal(s.rhythm.steps, 0);
  assert.equal(s.rhythm.pace, "packed");
});

test("answer marks the question and keeps it once", () => {
  let s = answer(defaultSettings(), "priority", { priority: "price" });
  s = answer(s, "priority", { priority: "comfort" });
  assert.deepEqual(s.answered, ["priority"]);
  assert.equal(s.priority, "comfort");
});

test("party kind sets counts and trims ages", () => {
  let s = normalizeSettings({ party: { kind: "family", adults: 2, kids: 2, kidAges: [6, 9] } });
  s = withPartyKind(s, "solo");
  assert.equal(s.party.adults, 1);
  assert.equal(s.party.kids, 0);
  assert.deepEqual(s.party.kidAges, []);
});

test("an old wizard draft migrates", () => {
  const draft = {
    version: 2,
    origin: { name: "Ghent", lat: 51.05, lng: 3.72, countryCode: "BE" },
    travelers: { adults: 3, children: 1, babies: 1 },
    travelDates: { startDate: "2027-07-10", endDate: "2027-07-17", durationNights: 7 },
    wizard: { step: 4, booked: { travel: true, stays: false }, dateMode: "exact" },
  };
  const s = fromDraft(draft);
  assert.equal(s.booked.flights, true);
  assert.equal(s.party.kind, "family");
  assert.equal(s.party.adults, 3);
  assert.equal(s.party.kids, 1);
  assert.equal(s.party.babies, 1);
  assert.equal(s.when.mode, "exact");
  assert.equal(s.when.start, "2027-07-10");
  assert.equal(s.from.name, "Ghent");
  for (const id of ["booked", "who", "when", "from"]) assert.ok(s.answered.includes(id), id);
});

test("a flexible draft migrates to months", () => {
  const s = fromDraft({ wizard: { dateMode: "flex", flexMonth: "2027-05", flexNights: 10 } });
  assert.equal(s.when.mode, "months");
  assert.deepEqual(s.when.months, [5]);
  assert.equal(s.when.nights, 10);
  const any = fromDraft({ wizard: { dateMode: "flex", flexMonth: "" } });
  assert.equal(any.when.mode, "any");
});

test("a draft with settings wins over the old fields", () => {
  const s = fromDraft({ settings: { priority: "price" }, travelers: { adults: 5 } });
  assert.equal(s.priority, "price");
  assert.equal(s.party.adults, 2);
});

test("draftPatch writes what the engine reads", () => {
  const s = normalizeSettings({
    booked: { stays: true },
    party: { adults: 2, kids: 1, babies: 0 },
    when: { mode: "months", months: [9], nights: 5 },
  });
  const p = draftPatch(s, { wizard: { step: 3, countries: ["Italy"] } });
  assert.deepEqual(p.wizard.booked, { travel: false, stays: true });
  assert.equal(p.wizard.dateMode, "flex");
  assert.match(p.wizard.flexMonth, /^\d{4}-09$/);
  assert.equal(p.wizard.flexNights, 5);
  assert.deepEqual(p.wizard.countries, ["Italy"]);
  assert.equal(p.travelers.children, 1);
  assert.equal(p.travelDates.isFlexible, true);
  assert.equal(p.travelDates.flexibleMonths.length, 1);
  assert.equal(p.settings, s);
});

test("nextMonthKey rolls into next year", () => {
  const nov = new Date(2026, 10, 3);
  assert.equal(nextMonthKey(12, nov), "2026-12");
  assert.equal(nextMonthKey(11, nov), "2026-11");
  assert.equal(nextMonthKey(3, nov), "2027-03");
});

test("guide answers become quiz answers", () => {
  const s = normalizeSettings({
    party: { kind: "family", adults: 2, kids: 2 },
    guide: { shape: "towns", likes: ["beach"], weather: "mild", reach: "overland", avoid: ["transfers", "car"] },
  });
  const q = quizAnswers(s, "budget");
  assert.deepEqual(q.types, ["beach", "family"]);
  assert.equal(q.around, "trainonly");
  assert.equal(q.pace, "fewstops");
  assert.equal(q.distance, "anywhere");
  assert.deepEqual(q.avoid.sort(), ["car", "heat", "longdays"]);
  assert.equal(q.spend, "budget");
});

test("rhythm becomes day prefs; unanswered stays undefined", () => {
  const s = normalizeSettings({ rhythm: { mornings: "early", pace: "slow", around: "walk" }, party: { slowWalkers: true } });
  const p = dayPrefs(s);
  assert.equal(p.dayStartMin, 480);
  assert.equal(p.pace, "relaxed");
  assert.equal(p.steps, 15000);
  assert.equal(p.stepFree, true);
  assert.equal(dayPrefs(defaultSettings()).pace, undefined);
});

test("priority decides flight ranking", () => {
  assert.equal(flightRanking(normalizeSettings({ priority: "price" })).sort, "price");
  assert.equal(flightRanking(normalizeSettings({ priority: "comfort" })).maxStops, 0);
});

test("uploaded bookings set booked and dates, never an answered date", async () => {
  const { fromImports } = await import("../src/planner/flow/tripSettings.js");
  const list = [
    { kind: "flight_out", date: "2027-05-03", eur: 89.5, title: "BRU to PSA" },
    { kind: "stay", city: "Lucca", date: "2027-05-04", eur: "x" },
    { kind: "flight_home", date: "2027-05-10" },
    { kind: "spaceship" },
  ];
  const s = fromImports(defaultSettings(), list);
  assert.equal(s.booked.flights, true);
  assert.equal(s.booked.stays, true);
  assert.equal(s.when.start, "2027-05-03");
  assert.equal(s.when.end, "2027-05-10");
  assert.equal(s.imports.length, 3);
  assert.equal(s.imports[1].eur, null);
  const answered = answer(defaultSettings(), "when", { when: { mode: "any", nights: 4 } });
  assert.equal(fromImports(answered, list).when.mode, "any");
});

test("quiz answers never leave a quiz question open", async () => {
  const { quizAnswers, spendFor } = await import("../src/planner/flow/tripSettings.js");
  const s = normalizeSettings({ priority: "comfort", guide: { likes: ["food"] } });
  const q = quizAnswers(s, spendFor(s));
  assert.equal(q.spend, "luxury");
  assert.equal(q.distance, "anywhere");
  assert.equal(q.pace, "fewstops");
  assert.equal(q.around, "any");
  assert.equal(q.typesDone, true);
});

test("the day rhythm becomes the AI day plan's preset", async () => {
  const { dayAiPreset } = await import("../src/planner/flow/tripSettings.js");
  const s = normalizeSettings({
    party: { kind: "family", adults: 2, kids: 2, slowWalkers: true },
    rhythm: { mornings: "slow", pace: "slow", goal: "outdoors", food: "cook", around: "walk" },
  });
  const p = dayAiPreset(s);
  assert.equal(p.vibe, "active");
  assert.equal(p.pace, "relaxed");
  assert.equal(p.autoRun, true);
  assert.deepEqual(p.profile, { companions: "family", startTime: "11:00", steps: 15000, food: "picnic", stepFree: true, moods: ["nature", "active"] });
  const open = dayAiPreset(defaultSettings());
  assert.equal(open.autoRun, false);
  assert.equal(open.profile.startTime, null);
});

test("the engine's date and head count edits reach the settings", async () => {
  const { withEngineEdits } = await import("../src/planner/flow/tripSettings.js");
  const s = normalizeSettings({ when: { mode: "months", months: [6, 7], nights: 7 }, party: { kind: "family", adults: 2, kids: 2, kidAges: [6, 9] } });
  // Nothing moved: the same object, so the store does not emit.
  assert.equal(withEngineEdits(s, { dateMode: "flex", flexMonth: "2027-06", nights: 7, adults: 2, kids: 2, babies: 0 }), s);
  const exact = withEngineEdits(s, { dateMode: "exact", startDate: "2027-08-02", endDate: "2027-08-12", nights: 10, adults: 2, kids: 1, babies: 0 });
  assert.deepEqual(exact.when, { mode: "exact", start: "2027-08-02", end: "2027-08-12", months: [], nights: 10 });
  assert.equal(exact.party.kids, 1);
  assert.deepEqual(exact.party.kidAges, [6]);
  assert.equal(exact.party.kind, "family");
  // A month outside the picked ones replaces them; any month clears them.
  assert.deepEqual(withEngineEdits(s, { dateMode: "flex", flexMonth: "2027-09", nights: 7, adults: 2, kids: 2 }).when.months, [9]);
  assert.equal(withEngineEdits(s, { dateMode: "flex", flexMonth: "", nights: 5, adults: 2, kids: 2 }).when.mode, "any");
  // An exact trip waiting for its second date keeps the answer it had.
  assert.equal(withEngineEdits(s, { dateMode: "exact", startDate: "2027-08-02", endDate: "", nights: 0, adults: 2, kids: 2, babies: 0 }), s);
});

// T796: question 7, what Carta picks. Its rows are config/slots.json's
// pickable live slots; the default is every one of them.
test("question 7: Carta picks every pickable slot by default; unknown ids drop out", () => {
  assert.deepEqual(PICKABLE, ["flight", "stay", "local"]);
  assert.deepEqual(defaultSettings().guide.pick, PICKABLE);
  assert.deepEqual(normalizeSettings({}).guide.pick, PICKABLE);
  assert.deepEqual(normalizeSettings({ guide: { pick: ["flight", "activities", "castle"] } }).guide.pick, ["flight"]);
  assert.deepEqual(normalizeSettings({ guide: { pick: [] } }).guide.pick, [], "only where to go is a real answer");
  const s = answer(defaultSettings(), "g:pick", { guide: { ...defaultSettings().guide, pick: ["flight"] } });
  assert.ok(s.answered.includes("g:pick"));
  assert.deepEqual(s.guide.pick, ["flight"]);
});
