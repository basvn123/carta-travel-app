// Build a synthetic ~24.8k-destination app_data.json out of the shipped 1,570:
// every destination plus 15 clones with distinct ids/cities and jittered
// coordinates. Clones keep the pricing-relevant fields (same IATA, so fares
// hydrate for real) but drop the heavy content arrays, roughly matching how
// thin the real expansion towns are. Never touches the repo; output lands in
// the scratchpad and is served to the app via Playwright route interception.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(os.tmpdir(), 'carta-perf', 'synthetic_app_data.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const CLONES = 15;

const data = JSON.parse(fs.readFileSync(path.join(APP, 'public/app_data.json'), 'utf8'));
const src = data.destinations;
const ids = Object.keys(src);

// What's heavy per destination? (one-time report to sanity-check the slimming)
const fieldBytes = {};
for (const id of ids.slice(0, 200)) {
  for (const [k, v] of Object.entries(src[id])) {
    fieldBytes[k] = (fieldBytes[k] || 0) + JSON.stringify(v ?? null).length;
  }
}
const top = Object.entries(fieldBytes).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('heaviest fields (sample of 200):', top.map(([k, b]) => `${k}=${Math.round(b / 200)}B`).join(', '));

const HEAVY = ['items', 'items_full', 'must_sees', 'activities', 'guide', 'nature', 'geonames', 'wiki_summary', 'known_for_facts'];

// Deterministic jitter (no Math.random: reruns must produce identical data).
const jitter = (i, salt) => (((i * 2654435761 + salt * 40503) % 1000) / 1000 - 0.5) * 1.0;

const out = {};
let n = 0;
for (const id of ids) {
  const d = src[id];
  out[id] = d;
  n += 1;
  for (let c = 1; c <= CLONES; c += 1) {
    const clone = { ...d };
    for (const k of HEAVY) delete clone[k];
    clone.city = `${d.city} ${c}`;
    clone.lat = d.lat != null ? +(d.lat + jitter(n, c)).toFixed(4) : d.lat;
    clone.lon = d.lon != null ? +(d.lon + jitter(n, c + 77)).toFixed(4) : d.lon;
    if (clone.image?.url) clone.image = { url: clone.image.url };
    out[`${id}~${c}`] = clone;
    n += 1;
  }
}

const synth = { ...data, destinations: out };
fs.writeFileSync(OUT, JSON.stringify(synth));
const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
console.log(`synthetic dataset: ${n} destinations, ${mb} MB -> ${OUT}`);
