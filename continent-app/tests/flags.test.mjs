// G7 (ROADMAP G4): the engine flags. Config only, default old, no traveller override.
// Run: node --test tests/flags.test.mjs (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ENGINES, MODES, flag, inShadow, isOn } from "../src/lib/flags.js";

test("G7: ten engines, E1 to E10, every one old until its wave flips it", () => {
  assert.deepEqual(ENGINES, Array.from({ length: 10 }, (_, i) => `E${i + 1}`));
  for (const e of ENGINES) {
    assert.equal(flag(e), "old", e);
    assert.equal(isOn(e), false, e);
    assert.equal(inShadow(e), false, e);
  }
});

test("G7: an unknown engine throws, so a typo cannot read as old", () => {
  assert.throws(() => flag("E11"), /not in config\/flags\.json/);
  assert.throws(() => isOn(""), /not in config\/flags\.json/);
});

test("G7: only old, new and shadow are modes", () => {
  assert.deepEqual([...MODES], ["old", "new", "shadow"]);
});

test("G7: no address or storage override: the module reads nothing but the config", () => {
  const src = readFileSync(new URL("../src/lib/flags.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  for (const bad of ["location", "localStorage", "sessionStorage", "URLSearchParams", "window", "document", "process.env", "import.meta.env"]) {
    assert.ok(!src.includes(bad), `flags.js must not read ${bad}`);
  }
});
