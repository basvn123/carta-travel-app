// G12, D10 (explore-top-2, audit-perf.md causes 4 and 6): the caches that
// keep an Explore re-render cheap give the same answers as the work they
// skip, and the rail photo sizes match the house rail card.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { monthName } from "../src/lib/dates.js";
import { heroLadder, readLadderManifest } from "../src/lib/heroImage.js";
import { readFileSync } from "node:fs";
import { setStayRecords } from "../src/lib/staysData.js";
import { priceDays, priceDaysSliced, priceRequest } from "../src/lib/price/index.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("monthName answers from its cache exactly as Intl does", () => {
  for (const lang of ["en", "nl", "de", "fr", "es", "it"]) {
    for (let m = 1; m <= 12; m += 1) {
      const want = new Intl.DateTimeFormat(lang, { month: "long" }).format(new Date(Date.UTC(2021, m - 1, 15)));
      assert.equal(monthName(m, lang), want);
      assert.equal(monthName(m, lang), want, "second call, from the cache");
      const short = new Intl.DateTimeFormat(lang, { month: "short" }).format(new Date(Date.UTC(2021, m - 1, 15)));
      assert.equal(monthName(m, lang, false), short);
    }
  }
  assert.equal(monthName(0, "en"), "");
  assert.equal(monthName(13, "en"), "");
});

test("heroLadder keeps one answer per record and width", () => {
  const live = readLadderManifest({ schema: "carta.hero-ladder.v1", ladder: "ladder_v1", live: true, missing: [], rev: {}, dims: {} });
  const rec = {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Grand_Place_Bruselas_2.jpg/960px-Grand_Place_Bruselas_2.jpg",
    w: 3332, h: 2000,
  };
  const a = heroLadder(rec, 1280, live);
  assert.ok(a, "a live ladder answers");
  assert.equal(heroLadder(rec, 1280, live), a, "the same record and width give the same object");
  const small = heroLadder(rec, 250, live);
  assert.notEqual(small, a);
  assert.ok(!small.webp.includes("1280w"), "a narrow card is not offered the 1280");
  // Another manifest is its own cache: off means Wikimedia.
  assert.equal(heroLadder(rec, 1280, readLadderManifest(null)), null);
  // An equal record that is another object is worked out again, to the same answer.
  assert.deepEqual(heroLadder({ ...rec }, 1280, live), a);
});

test("a desktop rail card asks for about its own width, not the story card's 570", () => {
  const story = read("src/browse/StoryRail.jsx");
  assert.match(story, /RAIL_CARD_SIZES = '[^']*, 300px'/);
  assert.match(story, /STORY_SIZES = '[^']*, 570px'/, "story cards keep their own sizes");
  assert.match(read("src/browse/ExploreRails.jsx"), /sizes=\{RAIL_CARD_SIZES\}/);
});

test("priceDaysSliced gives exactly what priceDays gives, and stops when aborted", async () => {
  const FX = JSON.parse(read("tests/fixtures/price/destinations.json"));
  setStayRecords(FX.stays);
  // Big enough to cross several slices (COST_SLICE is 64).
  const big = {};
  for (let i = 0; i < 40; i += 1) {
    for (const [id, d] of Object.entries(FX.destinations)) big[`${id}-${i}`] = { ...d, id: `${id}-${i}` };
  }
  const req = priceRequest({ choices: { stay_tier: "hotel3" }, xm: 7 });
  const want = priceDays(big, req);
  const got = await priceDaysSliced(big, req);
  assert.equal(got.size, want.size);
  assert.deepEqual([...got], [...want]);
  const ctl = new AbortController();
  ctl.abort();
  assert.equal(await priceDaysSliced(big, req, { signal: ctl.signal }), null);
  setStayRecords({});
});
