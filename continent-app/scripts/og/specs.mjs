/**
 * specs.mjs, turns one wire record into the plain description of a card.
 *
 * A spec says what the card contains and in what order; cards.mjs decides
 * where it sits. Every number comes from the record, never from this file, so
 * the card and the page it advertises cannot disagree: the destination total
 * is computed by the same costIndex.js the receipt on the page uses.
 *
 * A spec is null when the record cannot carry the card honestly (a
 * destination with no usable bed figure, a beach with nothing measured). The
 * caller falls back to the site card then, which is what the page floor in
 * the T205 plan already does for a row it will not index.
 *
 * English only. The share image is shared at one URL per page and the
 * language is not in the URL yet (T205, hreflang section), so the words here
 * are English and T212-b records the translation work.
 */
import { computeCosts, cheapestStayMonths, eurDay } from '../../src/lib/costIndex.js';

const NUM = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const DEC1 = new Intl.NumberFormat('en', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

let regionNames = null;
export function countryName(cc) {
  try {
    regionNames ||= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(String(cc).toUpperCase()) || cc;
  } catch { return cc; }
}

/** 'ATTERSEE, STEINBACH' to 'Attersee, Steinbach'; the EEA register is all capitals. */
const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s,(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const why = (row, k) => (row.why || []).find((w) => w.k === k);

/** Month numbers (1 to 12) from a from/to pair, wrapping over the new year. */
function monthRange(from, to) {
  const a = MONTHS.indexOf(from);
  const b = MONTHS.indexOf(to);
  if (a < 0 || b < 0) return [];
  const out = [];
  for (let i = a; ; i = (i + 1) % 12) { out.push(i + 1); if (i === b) break; }
  return out;
}

function score(row) {
  const s = row?.score ?? row?.rating?.score;
  return typeof s === 'number' ? { label: 'Carta score', value: DEC1.format(s), unit: 'of 10', tone: 'rate' } : null;
}

export function destinationSpec(key, dest) {
  const cost = computeCosts({ [key]: dest }, {}).get(key);
  if (!cost || cost.dayEur == null) return null;
  const city = cost.stayLevel === 'city';
  const stayNote = city && cost.listings
    ? `Measured from ${NUM.format(cost.listings)} stays in this town`
    : cost.stayLevel === 'region' ? 'Borrowed from the nearest measured town' : 'National figure, not measured here';
  const foodNote = cost.foodLevel === 'city' ? 'Priced at this town’s own rates' : 'National basket';
  const months = cheapestStayMonths(dest);
  const rating = dest.rating?.score;
  return {
    type: 'destination',
    kind: 'Destination',
    title: dest.city,
    subtitle: rating != null ? `${dest.country}, rated ${DEC1.format(rating)} of 10` : dest.country,
    panel: {
      head: 'One person, one day',
      rows: [
        { label: 'Bed', value: eurDay(cost.stayEur), note: stayNote },
        { label: 'Food', value: eurDay(cost.foodEur), note: foodNote },
      ],
      total: { label: 'A day here', value: eurDay(cost.dayEur), unit: 'a day' },
    },
    strip: months ? { label: 'Cheapest months to stay', good: months, note: 'From a year of listing prices' } : null,
    alt: `Receipt for a day in ${dest.city}: bed ${eurDay(cost.stayEur)}, food ${eurDay(cost.foodEur)}, ${eurDay(cost.dayEur)} in total per person.`,
  };
}

const WATER = {
  waterExcellent: 'Excellent', waterGood: 'Good', waterSufficient: 'Sufficient', waterPoor: 'Poor',
};

function waterRow(row) {
  const wk = Object.keys(WATER).find((k) => why(row, k));
  if (!wk) return null;
  const site = why(row, wk).site;
  return {
    label: 'Bathing water',
    value: WATER[wk],
    note: site ? `Class at ${titleCase(site)}` : 'EEA bathing water class',
    font: 'ui',
  };
}

export function beachSpec(row) {
  const rows = [];
  const w = waterRow(row);
  if (w) rows.push(w);
  const surface = why(row, 'surface')?.surface || why(row, 'sandColour')?.surface;
  if (surface) {
    const sc = why(row, 'sandColour');
    rows.push({ label: 'Surface', value: cap(surface), note: sc ? `${cap(sc.colour)} ${surface}` : 'From OpenStreetMap', font: 'ui' });
  }
  const len = why(row, 'length')?.m;
  if (len) rows.push({ label: 'Length', value: `${NUM.format(len)} m`, note: 'Measured on the coastline' });
  const prot = why(row, 'reserve')?.name || why(row, 'natura2000')?.name || why(row, 'nationalPark')?.name;
  if (rows.length < 3 && prot) rows.push({ label: 'Protected', value: 'Yes', note: prot, font: 'ui' });
  if (!rows.length) return null;
  return {
    type: 'beach',
    kind: 'Beach',
    title: row.name,
    subtitle: countryName(row.cc),
    panel: { head: 'What is measured', rows: rows.slice(0, 3), total: score(row) },
    strip: null,
    alt: `${row.name}, ${countryName(row.cc)}: ${rows.map((r) => `${r.label.toLowerCase()} ${r.value}`).join(', ')}.`,
  };
}

export function lakeSpec(row) {
  const rows = [];
  const area = why(row, 'area')?.km2;
  if (area) rows.push({ label: 'Area', value: `${NUM.format(area)} km²`, note: 'Measured from OpenStreetMap' });
  const depth = why(row, 'depth')?.m;
  if (depth) rows.push({ label: 'Deepest point', value: `${NUM.format(depth)} m`, note: 'From the lake depth record' });
  const el = why(row, 'elevation')?.m;
  if (el) rows.push({ label: 'Elevation', value: `${NUM.format(el)} m`, note: 'Above sea level' });
  const w = waterRow(row);
  if (rows.length < 3 && w) rows.push(w);
  const s = why(row, 'season');
  if (!rows.length && !s) return null;
  return {
    type: 'lake',
    kind: 'Lake',
    title: row.name,
    subtitle: countryName(row.cc),
    panel: { head: 'What is measured', rows: rows.slice(0, 3), total: score(row) },
    strip: s
      ? {
        label: 'Swim season',
        good: monthRange(s.from, s.to),
        note: s.peak != null ? `Warmest water about ${NUM.format(s.peak)} °C, estimated` : 'Estimated from climate data',
      }
      : null,
    alt: `${row.name}, ${countryName(row.cc)}${s ? `: swim season ${cap(s.from)} to ${cap(s.to)}` : ''}.`,
  };
}

const LIFT = {
  cableCar: 'Cable car', gondola: 'Gondola', liftsNearby: 'Lifts nearby', chairlift: 'Chairlift', rackRailway: 'Rack railway',
};

export function mountainSpec(row) {
  const h = why(row, 'height')?.m;
  if (!h) return null;
  const rows = [];
  const prom = why(row, 'prominence')?.m;
  if (prom) rows.push({ label: 'Prominence', value: `${NUM.format(prom)} m`, note: 'Rise above the saddle to a higher peak' });
  const lift = why(row, 'lift');
  rows.push(lift
    ? { label: 'Way up', value: LIFT[lift.kind] || 'Lift', note: lift.name || 'Lift to or near the top', font: 'ui' }
    : { label: 'Way up', value: 'On foot', note: 'No lift to the top on record', font: 'ui' });
  const d = why(row, 'difficulty');
  if (d?.hard) rows.push({ label: 'Hardest route', value: cap(String(d.hard)), note: d.est ? 'Estimated from route tags' : 'From route tags', font: 'ui' });
  const s = why(row, 'season');
  return {
    type: 'mountain',
    kind: 'Mountain',
    title: row.name,
    subtitle: countryName(row.cc),
    panel: { head: 'What is measured', rows, total: { label: 'Height', value: `${NUM.format(h)} m`, unit: '', tone: 'ink' } },
    strip: s?.months?.length
      ? { label: 'Snow-free months', good: s.months, note: s.est ? 'Estimated from a twelve month snow series' : 'Measured' }
      : null,
    alt: `${row.name}, ${countryName(row.cc)}: ${NUM.format(h)} m${prom ? `, prominence ${NUM.format(prom)} m` : ''}.`,
  };
}

const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`);

export function trailSpec(t) {
  if (!t?.distance_m) return null;
  const rows = [
    { label: 'Distance', value: `${DEC1.format(t.distance_m / 1000)} km`, note: 'Measured along the route' },
  ];
  if (t.ascent_m != null) rows.push({ label: 'Ascent', value: `${NUM.format(t.ascent_m)} m`, note: 'From elevation data' });
  if (t.duration_min) rows.push({ label: 'Walking time', value: hm(t.duration_min), note: 'Estimated from distance and ascent' });
  const g = t.geometry;
  const lines = g?.type === 'MultiLineString' ? g.coordinates : g?.type === 'LineString' ? [g.coordinates] : null;
  return {
    type: 'trail',
    kind: t.category === 'hike' || !t.category ? 'Walk' : cap(t.category),
    title: t.name,
    subtitle: [countryName(t.country), t.difficulty ? `${t.difficulty} difficulty` : null, typeof t.score === 'number' ? `rated ${DEC1.format(t.score)} of 10` : null].filter(Boolean).join(', '),
    panel: { head: 'The route', rows, route: lines, total: null },
    strip: null,
    alt: `${t.name}: ${DEC1.format(t.distance_m / 1000)} km${t.ascent_m != null ? `, ${NUM.format(t.ascent_m)} m of ascent` : ''}.`,
  };
}

/** The card for the home page and for any page that cannot carry its own. */
export function siteSpec({ places, countries }, sample) {
  const spec = {
    type: 'site',
    kind: 'Carta',
    title: 'What a day costs, place by place',
    subtitle: `Bed, food and local transport per person in ${NUM.format(places)} places across ${countries} countries. Every figure says where it came from.`,
    panel: null,
    strip: null,
    alt: 'Carta prices the ground for every place in Europe it covers: the bed, food and local transport, per person per day.',
  };
  if (sample) spec.panel = { ...sample.panel, head: `Example, ${sample.title}` };
  return spec;
}
