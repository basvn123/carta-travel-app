// T474 (row T435-h): names EU registers publish in capitals, printed in the
// case of every other name. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { displayName } from "../src/lib/format.js";

test("a name in capitals takes the case the page prints names in", () => {
  assert.equal(displayName("VOIDOKILIA"), "Voidokilia");
  assert.equal(displayName("LIMNOTHALASSA GIALOVAS KAI NISOS SFAKTIRIA"), "Limnothalassa Gialovas kai Nisos Sfaktiria");
  assert.equal(displayName("PLAYA DE LA CONCHA"), "Playa de la Concha");
  assert.equal(displayName("SAINT-JEAN-DE-LUZ"), "Saint-Jean-de-Luz");
  assert.equal(displayName("ÖSTERSJÖN"), "Östersjön");
});

test("a name already written in mixed case is left exactly as it is", () => {
  assert.equal(displayName("Ría de Vigo"), "Ría de Vigo");
  assert.equal(displayName("Plage de l'EU"), "Plage de l'EU");
  assert.equal(displayName("EU"), "EU");
  assert.equal(displayName(""), "");
  assert.equal(displayName(null), null);
});
