/**
 * cardFillings.js, what goes into the one card (spec 5.1, T179).
 *
 * Every outdoor section of the Destinations tab draws its rows through one
 * card, browse/PlaceCard.jsx. The card is a fixed frame: a 16:9 photograph
 * with the rating seal and the 6 px data strip, then a title with an optional
 * mono ref chip, a place line, a one-line hook, exactly three measured values
 * and up to three icons. What changes per section is only the filling, and
 * the fillings live here, as pure functions, so they can be tested without a
 * browser and so the rule "three values, never four" is enforced in one
 * place instead of five.
 *
 * A filling returns plain data:
 *   ref     the mono chip beside the title, or null
 *   where   the place line under the title, or ''
 *   hook    [{ text, cls }] read as one line, joined by commas in CSS
 *   values  exactly VALUE_COUNT cells { key, label, value, cls, none }
 *   icons   at most ICON_MAX codes { code, label }; PlaceCard maps a code to
 *           its glyph
 *
 * Three values is the point of the card, not a default. A fixed count is what
 * lets a grid be read down a column, so a row that is missing a figure keeps
 * its cell and says so ("No data") rather than closing the gap with a fourth
 * figure from somewhere else or showing two. Each section lists its values in
 * order of what a traveller asks first, with one or two spares behind them:
 * a spare moves up only when a primary figure is absent from the wire.
 */

import { beachTags } from './beachStory.js';
import { lakeTags, lakeSwim, isHiddenGem as isLakeGem } from './lakeStory.js';
import {
  mountainTags, isLiftServed, liftLabel, difficultyLabel, viewBandLabel,
  isHiddenGem as isMountainGem,
} from './mountainStory.js';
import { whyLines, routeTitle, paceLine } from './cycleStory.js';
import {
  HIGHLIGHTS, tripHighlights, tripGrade, gradeIsDerived,
} from './trailCards.js';
import { trailClimbUp, trailPlace } from './trailStory.js';
import { compassPoint } from './signature.js';
import { count } from './format.js';
import { activeLocale } from './localeState.js';

export const VALUE_COUNT = 3;
export const ICON_MAX = 3;
export const HOOK_MAX = 3;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A decimal in the reader's locale, at most `digits` places, no grouping so
 *  a figure is never read as two ("1,200" parsed back as 1). */
export const dec = (n, digits = 1) => n.toLocaleString(activeLocale(), {
  maximumFractionDigits: digits, useGrouping: false,
});

/**
 * The three cells, from an ordered list of candidates. A candidate whose
 * value is null is skipped while a later one can stand in; if fewer than
 * three carry a value, the first missing candidates fill the rest and are
 * marked `none`, so the card always draws exactly three cells.
 */
export function pickValues(candidates, t) {
  const present = candidates.filter((c) => c.value != null && c.value !== '');
  const out = present.slice(0, VALUE_COUNT);
  if (out.length < VALUE_COUNT) {
    for (const c of candidates) {
      if (out.length >= VALUE_COUNT) break;
      if (c.value == null || c.value === '') {
        out.push({ ...c, value: t('card.none'), none: true });
      }
    }
  }
  // Fewer candidates than three would be a filling bug, but the card still
  // keeps its geometry.
  while (out.length < VALUE_COUNT) {
    out.push({ key: `none${out.length}`, label: '', value: t('card.none'), none: true });
  }
  // Keep the section's own order, so "Length" never jumps to the right of
  // "Climb" on one card and not on the next.
  const order = new Map(candidates.map((c, i) => [c.key, i]));
  return out.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));
}

const cell = (key, label, value, cls = '') => ({ key, label, value, cls });

/** Kilometres as the trail card always printed them: one decimal, no ".0". */
export const kmText = (m) => (num(m) == null ? null : `${dec(m / 1000)} km`);

/** Walking time: one decimal under ten hours, whole hours above. */
export const hoursText = (min) => {
  if (num(min) == null) return null;
  const h = min / 60;
  return `${h >= 10 ? String(Math.round(h)) : dec(h)} h`;
};

const dirWord = (deg, t) => {
  const p = compassPoint(deg);
  return p ? t(`card.dir${p}`) : null;
};

const hookOf = (labels, cls = '') => labels
  .filter(Boolean)
  .slice(0, HOOK_MAX)
  .map((text) => ({ text, cls }));

/* ── Trails (walks and the drawn city days) ─────────────────────────────── */

const TRAIL_ICON = {
  summit: 'summit', lake: 'lake', coast: 'coast', forest: 'forest',
  castle: 'castle', viewpoint: 'viewpoint', village: 'village', hut: 'hut',
};
const HL_LABEL = Object.fromEntries(HIGHLIGHTS.map(({ key, labelKey }) => [key, labelKey]));
export const GRADE_KEY = {
  easy: 'trails.gradeEasy', moderate: 'trails.gradeModerate',
  hard: 'trails.gradeHard', very_hard: 'trails.gradeVeryHard',
  alpine: 'trails.gradeAlpine',
};
const DIFF_KEY = {
  easy: 'places.diffEasy', moderate: 'places.diffModerate', hard: 'places.diffHard',
};

/**
 * card is DestinationsTab's trip card { tr, assoc, kindKey }. The hook is the
 * kind, the grade and up to two highlights: the same words the chips carried,
 * now read as one line. The values are length, walking time and the climb read
 * uphill (T108-d); a city day trades the climb for its number of stops.
 */
export function trailFilling(card, { t, countryName = () => null }) {
  const { tr, assoc = {}, kindKey } = card;
  const isCityDay = tr.category === 'citytrip';
  const grade = tripGrade(tr);
  const gradeKey = grade ? GRADE_KEY[grade] : DIFF_KEY[tr.difficulty] || null;
  const highlights = isCityDay ? [] : tripHighlights(tr);
  const hook = [{ text: t(kindKey), cls: `places-card-kind${isCityDay ? ' city' : ''}` }];
  if (!isCityDay && gradeKey) {
    hook.push({
      text: t(gradeKey),
      cls: `places-card-diff${gradeIsDerived(tr) ? ' est' : ''}`,
      title: gradeIsDerived(tr) ? t('trails.gradeDerived') : undefined,
      est: gradeIsDerived(tr),
    });
  }
  for (const code of highlights.slice(0, 2)) {
    hook.push({ text: t(HL_LABEL[code] || 'trails.hlSummit'), cls: 'places-card-hl' });
  }
  const climb = trailClimbUp(tr);
  const values = pickValues([
    cell('length', t('card.vLength'), kmText(tr.distance_m)),
    cell('time', t('card.vTime'), hoursText(tr.duration_min)),
    isCityDay
      ? cell('stops', t('card.vStops'), num(tr.n_stops) != null ? String(tr.n_stops) : null)
      : cell('climb', t('card.vClimb'), num(climb) != null ? `+${count(climb)} m` : null),
  ], t);
  const icons = [];
  if (!isCityDay && tr.is_loop) icons.push({ code: 'loop', label: t('trails.loop'), cls: 'places-card-loop' });
  for (const code of highlights) {
    if (TRAIL_ICON[code]) icons.push({ code: TRAIL_ICON[code], label: t(HL_LABEL[code]) });
  }
  const place = trailPlace(tr, null, assoc.dest, countryName);
  const where = place ? [place.city, place.country].filter(Boolean).join(', ') : '';
  return {
    title: tr.name,
    // The ref chip only when the name does not already carry it ("Mount
    // Korab (9/1)" would otherwise print 9/1 twice).
    ref: (!isCityDay && tr.f?.ref && !String(tr.name || '').includes(String(tr.f.ref)))
      ? String(tr.f.ref) : null,
    where,
    hook,
    values,
    icons: icons.slice(0, ICON_MAX),
  };
}

/* ── Cycling ────────────────────────────────────────────────────────────── */

const CYCLE_ICON = [
  ['railAccess', 'rail', 'card.iRail'],
  ['coast', 'coast', 'trails.hlCoast'],
  ['lakes', 'lake', 'trails.hlLake'],
  ['views', 'viewpoint', 'trails.hlViewpoint'],
];

/** A ranked or listed route. The values are length, climb and the share of
 *  it away from motor traffic, the three figures spec 7.9 puts on the card. */
export function cycleFilling(r, { t, countryName = '' }) {
  // The reasons are worded as sentences, so the hook takes the strongest one
  // whole rather than joining two with a comma.
  const evidence = (whyLines(r.why, t, 1) || []).map((line) => line.text);
  const free = num(r.free);
  const values = pickValues([
    cell('length', t('card.vLength'), num(r.km) != null ? `${dec(r.km)} km` : null),
    cell('climb', t('card.vClimb'), num(r.asc) != null ? `+${count(r.asc)} m` : null),
    cell('free', t('card.vCarFree'), free != null ? `${Math.round(free * 100)}%` : null),
  ], t);
  const codes = new Set((r.why || []).map((w) => w.code));
  const icons = [];
  if (r.loop || codes.has('loop')) icons.push({ code: 'loop', label: t('trails.loop') });
  for (const [why, code, key] of CYCLE_ICON) {
    if (codes.has(why)) icons.push({ code, label: t(key) });
  }
  const title = routeTitle(r, t);
  const ref = r.ref && !String(title).includes(String(r.ref)) ? String(r.ref) : null;
  return {
    title,
    ref,
    where: countryName || '',
    hook: hookOf(evidence),
    values,
    icons: icons.slice(0, ICON_MAX),
  };
}

/** A composed tour: days, length, and the day's ride that follows from them.
 *  The pace sentence is the hook; the bike it suits is on the tour page. */
export function cycleTourFilling(tr, { t, countryName = '' }) {
  const towns = (tr.towns || []).slice(0, 3).join(', ');
  const days = num(tr.days);
  const km = num(tr.km);
  const values = pickValues([
    cell('days', t('card.vDays'), days != null ? String(days) : null),
    cell('length', t('card.vLength'), km != null ? `${count(km)} km` : null),
    cell('perDay', t('card.vPerDay'), days && km != null ? `${count(km / days)} km` : null),
  ], t);
  return {
    title: tr.title,
    ref: null,
    where: [countryName, towns].filter(Boolean).join(', '),
    hook: hookOf([paceLine(tr.pace, t)]),
    values,
    icons: [],
  };
}

/* ── Beaches ────────────────────────────────────────────────────────────── */

const WATER_KEY = {
  Excellent: 'beach.waterExcellent', Good: 'beach.waterGood',
  Sufficient: 'beach.waterSufficient', Poor: 'beach.waterPoor',
};

const surfaceWord = (code, t) => {
  if (!code) return null;
  const key = `beach.surfaceWord${code[0].toUpperCase()}${code.slice(1)}`;
  const word = t(key);
  return word && word !== key ? word : null;
};

/** Length of the shore, which way it faces, and the EEA bathing water class.
 *  The distance to the nearest town, then the surface, stand in for a
 *  missing one. */
export function beachFilling(beach, { t, countryName = '' }) {
  const cls = beach.water?.class;
  const base = beach.base && num(beach.base.km) != null ? beach.base : null;
  const values = pickValues([
    cell('length', t('card.vLength'), num(beach.lengthM) != null ? `${count(beach.lengthM)} m` : null),
    cell('faces', t('card.vFaces'), dirWord(beach.aspect, t)),
    cell('water', t('card.vWater'), cls && WATER_KEY[cls] ? t(WATER_KEY[cls]) : null),
    cell('town', t('card.vToTown'), base ? `${count(base.km)} km` : null),
    cell('surface', t('card.vSurface'), surfaceWord(beach.surface, t)),
  ], t);
  const tags = new Set(beach.tags || []);
  const icons = [];
  if (beach.lifeguard || tags.has('lifeguard')) icons.push({ code: 'lifeguard', label: t('card.iLifeguard') });
  if (beach.sunset || tags.has('sunset_facing')) icons.push({ code: 'sunset', label: t('card.iSunset') });
  if (Array.isArray(beach.services) ? beach.services.length : beach.services) {
    icons.push({ code: 'services', label: t('card.iServices') });
  }
  if (beach.prot || beach.protected) icons.push({ code: 'protected', label: t('card.iProtected') });
  return {
    title: beach.name,
    ref: null,
    where: [beach.region, countryName].filter(Boolean).join(', '),
    hook: hookOf(beachTags(beach, t, HOOK_MAX).map((tag) => tag.label)),
    values,
    icons: icons.slice(0, ICON_MAX),
  };
}

/* ── Lakes ──────────────────────────────────────────────────────────────── */

/** Area, greatest depth and the estimated warmest month's water; the height
 *  of the water, then the distance to the nearest town, stand in where a
 *  figure was never measured. */
export function lakeFilling(lake, { t, countryName = '' }) {
  const size = lake.size || {};
  const temps = (lake.swim?.temps || []).map(num).filter((v) => v != null);
  const warm = temps.length ? Math.max(...temps) : null;
  const area = num(size.areaKm2);
  const values = pickValues([
    cell('area', t('card.vArea'), area != null
      ? `${area >= 10 ? count(area) : dec(area, area >= 1 ? 1 : 2)} km²` : null),
    cell('depth', t('card.vDepth'), num(size.depthM) != null ? `${count(size.depthM)} m` : null),
    cell('alt', t('card.vAlt'), num(size.elevM) != null ? `${count(size.elevM)} m` : null),
    // An estimate from the climate record (swim.est), so it carries the
    // tilde the derived trail grade uses, explained by its title.
    { ...cell('warm', t('card.vWarm'), warm != null ? `~${Math.round(warm)} °C` : null), title: t('card.estimate') },
    cell('town', t('card.vToTown'), lake.base && num(lake.base.km) != null ? `${count(lake.base.km)} km` : null),
  ], t);
  const swim = lakeSwim(lake, t);
  const icons = [];
  if (swim.rule === 'yes') icons.push({ code: 'swim', label: t('card.iSwim') });
  if (lake.walks?.length || num(lake.nWalks)) icons.push({ code: 'walks', label: t('card.iWalks') });
  if (Array.isArray(lake.services) ? lake.services.length : lake.services) {
    icons.push({ code: 'services', label: t('card.iServices') });
  }
  if (lake.protected) icons.push({ code: 'protected', label: t('card.iProtected') });
  return {
    title: lake.name,
    ref: null,
    where: [lake.region, countryName].filter(Boolean).join(', '),
    hook: hookOf(lakeTags(lake, t, HOOK_MAX).map((tag) => tag.label)),
    values,
    icons: icons.slice(0, ICON_MAX),
    gem: isLakeGem(lake) ? t('lake.hiddenGem') : null,
    swim,
  };
}

/* ── Mountains ──────────────────────────────────────────────────────────── */

/** Height, prominence, and how far it is to a higher summit; the area in
 *  view stands in where the isolation was not computed. */
export function mountainFilling(mountain, { t, countryName = '' }) {
  const values = pickValues([
    cell('height', t('card.vHeight'), num(mountain.ele) != null ? `${count(mountain.ele)} m` : null, 'places-mcard-ele'),
    cell('prom', t('card.vProm'), num(mountain.prom) != null ? `${count(mountain.prom)} m` : null),
    // How far it is to the nearest higher summit: a lone mountain or a bump
    // on a ridge. The viewshed's peak count is not used: it reads 0 on 188 of
    // the 740 published mountains, Hafelekarspitze above Innsbruck among them.
    cell('higher', t('card.vHigher'), num(mountain.isoKm) != null
      ? `${mountain.isoKm >= 100 ? count(mountain.isoKm) : dec(mountain.isoKm)} km` : null),
    cell('inView', t('card.vInView'), num(mountain.view?.km2) != null ? `${count(mountain.view.km2)} km²` : null),
  ], t);
  // The grade as its word, with the tilde the trail card uses when it was
  // read off the terrain rather than tagged; the lift is left out of the
  // hook because the photograph already says it.
  const est = !!mountain.diff?.est;
  const grade = difficultyLabel(est ? { ...mountain, diff: { ...mountain.diff, est: false } } : mountain, t);
  const hook = [
    grade ? { text: grade, est, title: est ? t('mtn.diffEst', { word: grade }) : undefined } : null,
    ...hookOf([
      viewBandLabel(mountain, t),
      ...mountainTags(mountain, t, HOOK_MAX)
        .filter((tag) => !(tag.code === 'lift' && isLiftServed(mountain)))
        .map((tag) => tag.label),
    ]),
  ].filter(Boolean).slice(0, HOOK_MAX);
  const tags = new Set(mountain.tags || []);
  const icons = [];
  if (isLiftServed(mountain)) icons.push({ code: 'lift', label: liftLabel(mountain, t) });
  if ((mountain.acc || []).includes('transit')) icons.push({ code: 'rail', label: t('card.iTransit') });
  if (tags.has('summitFood')) icons.push({ code: 'food', label: t('card.iSummitFood') });
  if (tags.has('hut')) icons.push({ code: 'hut', label: t('trails.hlHut') });
  if (tags.has('viewpoint')) icons.push({ code: 'viewpoint', label: t('trails.hlViewpoint') });
  return {
    title: mountain.name,
    ref: null,
    where: [mountain.range, countryName].filter(Boolean).join(', '),
    hook,
    values,
    icons: icons.slice(0, ICON_MAX),
    gem: isMountainGem(mountain) ? t('mtn.hiddenGem') : null,
  };
}
