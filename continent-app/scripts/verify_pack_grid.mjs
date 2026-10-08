// T168: every trip file must produce a 16 to 24 cell packing grid, each cell with a tooltip line.
// T387 (V3.9): standard kit cells now carry journey.pack.* keys, so cells are resolved to the
// strings the page shows before they are checked, and labels must be distinct within a trip.
import fs from 'fs';
import { packCells, resolvePackCell, PACK_EN, PACK_MIN, PACK_MAX } from '../src/lib/packGrid.js';
const dir = new URL('../public/journeys/journey/', import.meta.url);
const files = fs.readdirSync(dir);
let bad = 0, written = 0, derived = 0, dash = 0, repeatTrips = 0, dayPack = 0, missingKey = 0, halfFail = 0;
const src = fs.readFileSync(new URL('../src/components/PackIcons.jsx', import.meta.url), 'utf8');
// En dash, em dash, middot, built from code points so this file holds none of them itself.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014, 0xb7)}]`);
const icons = new Set([...src.matchAll(/^  (\w+): </gm)].map((m) => m[1]));
// English resolver: the same shape as the app's t(), reading PACK_EN. A key it does not know
// is counted, because the page would otherwise show a raw key.
const tEn = (key, vars) => {
  if (!(key in PACK_EN)) { missingKey++; return key; }
  return PACK_EN[key].replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
};
for (const f of files) {
  const trip = JSON.parse(fs.readFileSync(new URL(f, dir)));
  const cells = packCells(trip).map((c) => ({ ...c, ...resolvePackCell(c, tEn, 'en') }));
  // Unchanged rule, now applied to the resolved label and reason rather than raw fields,
  // since a derived cell carries keys and only the resolved text is what a reader sees.
  const ok = cells.length >= PACK_MIN && cells.length <= PACK_MAX
    && cells.every((c) => c.why && c.why.length > 10 && c.label && icons.has(c.icon));
  if (!ok) { bad++; console.log('BAD', f, cells.length); }
  // New: one name per cell within a trip, so each grid button has a distinct accessible name.
  const names = cells.map((c) => c.label.toLowerCase());
  if (new Set(names).size !== names.length) { repeatTrips++; console.log('REPEAT', f, names.filter((n, i) => names.indexOf(n) !== i)); }
  // New: a trip that wrote eight or more items shows at least as many written cells as derived.
  const w = cells.filter((c) => !c.derived).length;
  if (w >= 8 && w * 2 < cells.length) { halfFail++; console.log('HALF', f, w, cells.length); }
  for (const c of cells) {
    c.derived ? derived++ : written++;
    if (c.label.toLowerCase() === 'day pack') dayPack++;
    // Widened from the reason alone to the label too, and to the en dash, per the copy rules.
    if (DASHES.test(c.why + c.label)) dash++;
  }
}
console.log({
  trips: files.length, bad, writtenCells: written, derivedCells: derived, dashHits: dash,
  tripsWithRepeatedLabel: repeatTrips, dayPackCells: dayPack, writtenUnderHalf: halfFail, missingKeys: missingKey,
});
process.exit(bad || dash || repeatTrips || halfFail || missingKey ? 1 : 0);
