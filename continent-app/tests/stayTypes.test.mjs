// T862: where to sleep, the space and the four stay types (src/lib/sleepGroups.js
// STAY_TYPES), each with a typical night (src/lib/price/stay.js typicalNight),
// the book links by type (src/lib/transportLinks.js stayBookLinks) and the
// words of Tell Carta read into the same types. Run: npm test (continent-app/).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { STAY_TYPES, offeredStayTypes, typesForSpace, stayTypeOf, tierForType, sleepGroupOf } from "../src/lib/sleepGroups.js";
import { STAY_TIERS } from "../src/lib/stayPrice.js";
import { typicalNight } from "../src/lib/price/priceDay.js";
import { stayBookLinks } from "../src/lib/transportLinks.js";
import { parseTrip } from "../src/lib/plan/parseTrip.js";

const pub = new URL("../public/app_data.json", import.meta.url);
const data = existsSync(pub) ? JSON.parse(readFileSync(pub, "utf8")) : null;
const skip = data ? false : "public/app_data.json is not on this machine";
const ALL = ["dorm", "private", "room", "home", "hotel2", "hotel3", "hotel4", "hotel5"];

test("four types, one whole place and three rooms, every priced tier in exactly one", () => {
  assert.deepEqual(STAY_TYPES.map((ty) => ty.key), ["apartment", "hotel", "room", "hostel"]);
  assert.deepEqual(typesForSpace(offeredStayTypes(ALL), "whole").map((ty) => ty.key), ["apartment"]);
  assert.deepEqual(typesForSpace(offeredStayTypes(ALL), "room").map((ty) => ty.key), ["hotel", "room", "hostel"]);
  assert.equal(typesForSpace(offeredStayTypes(ALL), "either").length, 4);
  const tiers = STAY_TYPES.flatMap((ty) => ty.tiers);
  assert.deepEqual([...tiers].sort(), [...STAY_TIERS].sort());
  assert.equal(new Set(tiers).size, tiers.length);
  // Only the hotel has a comfort row.
  assert.deepEqual(STAY_TYPES.filter((ty) => ty.comfort).map((ty) => ty.key), ["hotel"]);
});

test("a stored tier finds its type; a pick keeps a tier of the type, else the type's first", () => {
  assert.equal(stayTypeOf("home"), "apartment");
  assert.equal(stayTypeOf("bnb_home"), "apartment");
  assert.equal(stayTypeOf("room"), "room");
  assert.equal(stayTypeOf("private"), "hostel");
  assert.equal(stayTypeOf("hotel"), "hotel");
  assert.equal(stayTypeOf("hotel5"), "hotel");
  assert.equal(stayTypeOf("nonsense"), "apartment");
  const hotel = offeredStayTypes(ALL).find((ty) => ty.key === "hotel");
  assert.equal(tierForType(hotel, "hotel4"), "hotel4");
  assert.equal(tierForType(hotel, "dorm"), "hotel3");
  // A dataset without hostels offers no hostel tile.
  assert.ok(!offeredStayTypes(["home", "hotel3"]).some((ty) => ty.key === "hostel"));
  // The Lifestyle panel's three groups still read the same tiers.
  assert.equal(sleepGroupOf("room"), "home");
});

test("a typical night for the party, a person and for the group, narrowed by country", { skip }, () => {
  const all = typicalNight(data.destinations, "dorm", { adults: 2 });
  const pt = typicalNight(data.destinations, "dorm", { adults: 2, countries: ["PT"] });
  assert.ok(all.perPerson > 0 && all.n > 100);
  assert.equal(all.perNight, Math.round(all.perPerson * 2 * 100) / 100);
  assert.ok(pt.n < all.n && pt.n > 0);
  const hotel = typicalNight(data.destinations, "hotel3", { adults: 2 });
  assert.ok(hotel.perPerson > all.perPerson, "a hotel room costs more than a dorm bed");
  assert.equal(typicalNight(data.destinations, "dorm", { countries: ["XX"] }), null);
});

test("book links by type: Booking.com apartments and Airbnb, Airbnb rooms, Hostelworld, the hotel search", () => {
  const at = { city: "Lisbon", country: "Portugal", checkin: "2027-05-02", checkout: "2027-05-09", adults: 2, children: 1 };
  const home = stayBookLinks({ ...at, tier: "home" });
  assert.deepEqual(home.map((l) => l.provider), ["Booking.com", "Airbnb"]);
  assert.match(home[0].href, /booking\.com\/searchresults\.html\?ss=Lisbon.*nflt=ht_id%3D201/);
  assert.match(home[1].href, /airbnb\.com\/s\/Lisbon%2C%20Portugal\/homes\?adults=3&checkin=2027-05-02&checkout=2027-05-09&room_types%5B%5D=Entire\+home%2Fapt/);
  assert.match(stayBookLinks({ ...at, tier: "room" })[0].href, /room_types%5B%5D=Private\+room/);
  for (const tier of ["dorm", "private"]) {
    const [l] = stayBookLinks({ ...at, tier });
    assert.equal(l.provider, "Hostelworld");
    assert.match(l.href, /hostelworld\.com\/search\?search_keywords=Lisbon.*date_from=2027-05-02&date_to=2027-05-09/);
  }
  const hotel = stayBookLinks({ ...at, tier: "hotel4" });
  assert.deepEqual(hotel.map((l) => l.provider), ["Booking.com"]);
  assert.ok(!hotel[0].href.includes("nflt"));
  assert.deepEqual(stayBookLinks({ tier: "home" }), []);
});

test("Tell Carta's stay words land on the four types", () => {
  const read = (s) => parseTrip(s, { lang: "en", today: "2026-10-30" }).fields.stay?.value;
  const typeOf = (s) => stayTypeOf(read(s));
  assert.equal(typeOf("a week in Lisbon in a flat"), "apartment");
  assert.equal(typeOf("a holiday home in the Algarve"), "apartment");
  assert.equal(typeOf("two of us, a whole place in May"), "apartment");
  assert.equal(typeOf("a room in a home in Porto"), "room");
  assert.equal(typeOf("a 4 star hotel in Rome"), "hotel");
  assert.equal(read("a 4 star hotel in Rome"), "hotel4");
  assert.equal(typeOf("in a hostel, cheap"), "hostel");
  const nl = parseTrip("een kamer in een woning in Gent", { lang: "nl", today: "2026-10-30" }).fields.stay?.value;
  assert.equal(stayTypeOf(nl), "room");
});
