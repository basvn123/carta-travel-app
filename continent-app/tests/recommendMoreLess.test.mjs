// G12 plan rethink B5 (lane R4): More like this / Less like this. For this
// trip only, a soft capped penalty (one mark moves nothing, three similar
// lower the group, never a filter), the Style Studio hint after three.
// Run: npm test (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { LESS_CAP, lessHint, lessOrder, lessPenalty, likeThis, markOf } from "../src/lib/recommend/moreLess.js";

const t = (id, iso2, shape = "towns", group = 1000) => ({ id, iso2, shape, total: { group }, slots: [] });

test("More like this: most similar first; the anchor never itself", () => {
  const a = t("a", "IT", "towns");
  const pool = [a, t("b", "FR", "towns"), t("c", "IT", "one"), t("d", "IT", "towns"), t("e", "ES", "road")];
  // diversify.similarity: same country and shape first; a trip sharing
  // nothing (another country, shape and band) is not "like" it.
  const ids = likeThis(a, pool).map((x) => x.id);
  assert.equal(ids[0], "d");
  assert.ok(!ids.includes("a"));
  assert.ok(!ids.includes("e"));
  assert.deepEqual(likeThis(null, pool), []);
});

test("Less like this: one or two marks move nothing; three similar lower the group, capped", () => {
  const list = ["x1", "x2", "x3", "x4", "x5"].map((id) => t(id, "IT"));
  const other = t("o", "FR", "one");
  const marks1 = [markOf(t("m1", "IT"))];
  assert.equal(lessPenalty(list[0], marks1), 0);
  const marks3 = ["m1", "m2", "m3"].map((id) => markOf(t(id, "IT")));
  assert.equal(lessPenalty(list[0], marks3), 3);
  assert.equal(lessPenalty(other, marks3), 0);
  const many = Array.from({ length: 12 }, (_, i) => markOf(t(`m${i}`, "IT")));
  assert.equal(lessPenalty(list[0], many), LESS_CAP);
  // Never a filter: every trip stays in the list.
  const ordered = lessOrder([...list, other], marks3);
  assert.equal(ordered.length, 6);
  // Three places down: the other trip climbs from sixth to fourth, no further.
  assert.equal(ordered.findIndex((x) => x.id === "o"), 3);
});

test("the Style Studio hint after three marks of one country or shape, not before", () => {
  const two = [markOf(t("a", "IT", "one")), markOf(t("b", "IT", "road"))];
  assert.equal(lessHint(two), null);
  assert.deepEqual(lessHint([...two, markOf(t("c", "IT", "towns"))]), { kind: "country", iso2: "IT" });
  const shapes = [markOf(t("a", "IT", "road")), markOf(t("b", "FR", "road")), markOf(t("c", "ES", "road"))];
  assert.deepEqual(lessHint(shapes), { kind: "shape", shape: "road" });
});
