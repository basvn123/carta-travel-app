// T858: Tell Carta's chips as data (src/planner/flow/tellChips.js): the
// settings the field stands for as it is typed, and the chips under it.
// Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { parseTrip } from "../src/lib/plan/parseTrip.js";
import { tellSettings, tellChips, openSetup } from "../src/planner/flow/tellChips.js";
import { defaultSettings, markAnswered, answer } from "../src/planner/flow/tripSettings.js";
import { setupScreens, nextScreen } from "../src/planner/flow/flowGraph.js";

const TODAY = "2026-10-30";
const read = (text) => parseTrip(text, { lang: "en", today: TODAY });
const t = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);
const chipsOf = (s, p, extra = {}) => tellChips(s, p, { t, monthName: (m) => `m${m}`, day: (iso) => iso, money: (n) => `E${n}`, ...extra });

test("the words fill the answers they give; the rest stay open as dashed chips", () => {
  const p = read("a week in July with my wife and two kids, around 2000 euro, by train");
  const { settings, words, choices } = tellSettings(defaultSettings(), p);
  assert.deepEqual(words.sort(), ["g:budget", "when", "who"].sort());
  assert.equal(settings.sources.who, "words");
  assert.equal(choices.transport_mode, "train");
  const chips = chipsOf(settings, p, { choices });
  const filled = chips.filter((c) => !c.missing).map((c) => c.key);
  assert.deepEqual(filled, ["when", "nights", "who", "budget", "way"]);
  // 2000 for a family of four: the chip says what was said, the answer holds 500 a person.
  assert.equal(chips.find((c) => c.key === "budget").text, 'pf.chip.budgetGroup{"eur":"E2000","n":4}');
  assert.deepEqual(settings.guide.budget, { kind: "total", eur: 500 });
  const missing = chips.filter((c) => c.missing).map((c) => c.screen);
  assert.deepEqual(missing, ["booked", "sleep", "priority", "from"]);
  assert.deepEqual(missing, openSetup(settings));
});

test("deleting the words takes their answer back; a screen's answer stays", () => {
  const first = tellSettings(defaultSettings(), read("two of us in May"));
  // The traveller confirms When on its screen, then edits the words.
  const base = answer(first.settings, "when", { when: { mode: "months", months: [5], nights: 7 } });
  const again = tellSettings(base, read("just a sentence"));
  assert.ok(again.settings.answered.includes("when"), "the screen's when stays");
  assert.ok(!again.settings.answered.includes("who"), "the words' who goes");
  assert.equal(again.settings.sources.who, undefined);
});

test("a popover's answer wins over the words, while they keep typing", () => {
  const p = read("with my wife in July");
  const mine = { ...defaultSettings(), party: { kind: "family", adults: 2, kids: 1, kidAges: [7], babies: 0, slowWalkers: false } };
  const { settings, words } = tellSettings(defaultSettings(), p, { who: mine });
  assert.equal(settings.party.kids, 1);
  assert.ok(!words.includes("who"));
  assert.equal(settings.sources.who, undefined, "the popover's answer is the traveller's own");
  assert.equal(settings.sources.when, "words");
});

test("Continue asks only the questions still open", () => {
  let { settings } = tellSettings(defaultSettings(), read("two of us in July, from Ghent? no: hotel, cheap, nothing booked"));
  settings = markAnswered(settings, "tell", "words");
  const list = [...setupScreens(settings), "create"];
  const asked = [];
  let k = nextScreen(list, "tell");
  while (k && k !== "create") { if (!settings.answered.includes(k)) asked.push(k); k = nextScreen(list, k); }
  assert.deepEqual(asked, ["from"]);
});

test("named places become chips that open one popover", () => {
  const settings = { ...defaultSettings(), answered: ["places"], places: [
    { kind: "country", id: "PT", name: "Portugal", iso2: "PT", country: "Portugal" },
    { kind: "country", id: "ES", name: "Spain", iso2: "ES", country: "Spain" },
  ] };
  const chips = chipsOf(settings, { fields: {} });
  assert.deepEqual(chips.filter((c) => c.screen === "places").map((c) => c.text), ["Portugal", "Spain"]);
});

test("a hotel's stars read in the chip, a 3 star hotel is a hotel", () => {
  const four = tellSettings(defaultSettings(), read("4 star hotel"));
  assert.equal(chipsOf(four.settings, read("4 star hotel"), { choices: four.choices }).find((c) => c.key === "stay").text, 'pf.chip.hotel{"stars":"stay.stars4"}');
  const three = tellSettings(defaultSettings(), read("a hotel"));
  assert.equal(chipsOf(three.settings, read("a hotel"), { choices: three.choices }).find((c) => c.key === "stay").text, "stay.hotel");
});

test("a budget for the group is split over the party a popover set", () => {
  const p = read("with my wife in July, 1500 euro for all of us");
  const family = { ...defaultSettings(), party: { kind: "family", adults: 2, kids: 2, kidAges: [7, 7], babies: 0, slowWalkers: false } };
  const { settings } = tellSettings(defaultSettings(), p, { who: family });
  assert.deepEqual(settings.guide.budget, { kind: "total", eur: 375 });
});
