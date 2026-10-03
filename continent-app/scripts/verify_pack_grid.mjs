// T168: every trip file must produce a 16 to 24 cell packing grid, each cell with a tooltip line.
import fs from 'fs';
import { packCells, PACK_MIN, PACK_MAX } from '../src/lib/packGrid.js';
const dir = new URL('../public/journeys/journey/', import.meta.url);
const files = fs.readdirSync(dir);
let bad = 0, written = 0, derived = 0, dash = 0;
const src = fs.readFileSync(new URL('../src/components/PackIcons.jsx', import.meta.url), 'utf8');
const icons = new Set([...src.matchAll(/^  (\w+): </gm)].map((m) => m[1]));
for (const f of files) {
  const trip = JSON.parse(fs.readFileSync(new URL(f, dir)));
  const cells = packCells(trip);
  const ok = cells.length >= PACK_MIN && cells.length <= PACK_MAX
    && cells.every((c) => c.why && c.why.length > 10 && c.label && icons.has(c.icon));
  if (!ok) { bad++; console.log('BAD', f, cells.length); }
  for (const c of cells) { c.derived ? derived++ : written++; if (/\u2014|\u00b7/.test(c.why)) dash++; }
}
console.log({ trips: files.length, bad, writtenCells: written, derivedCells: derived, dashHits: dash });
process.exit(bad || dash ? 1 : 0);
