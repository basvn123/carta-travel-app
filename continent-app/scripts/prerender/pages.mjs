/**
 * pages.mjs, one wire record in, one page model out.
 *
 * A page model is plain data: path, title, description, the h1 and its lead,
 * a fact list, link sections, the honest coverage line, credits, and the
 * schema.org subject node. html.mjs turns it into the stored document. Nothing
 * here touches the disk.
 *
 * Every sentence a page carries comes from the record, through the same story
 * builders the app renders with (beachStory.js, lakeStory.js, mountainStory.js,
 * trailStory.js, cycleStory.js) and the English catalogue, so the page a
 * crawler reads says what the app says. Every number is read from the record
 * at build time, never typed.
 *
 * The rules the models follow are docs/SEO.md's: the title pattern
 * "{name}, {headline number}, {qualifier} | Carta", a description of at most
 * 155 characters that does not repeat the title, one JSON-LD graph per page
 * with no AggregateRating and no Offer, the breadcrumb as a real link chain,
 * canonicals from urlScheme.js canonicalFor().
 */
import { en } from '../../src/i18n/en.js';
import { paths, canonicalFor } from '../../src/lib/urlScheme.js';
import { fmtHours } from '../../src/lib/format.js';
import { DEFAULT_LIFESTYLE, groundSpendPerPerson } from '../../src/lib/runtime_pricing.js';
import { cheapestStayMonths } from '../../src/lib/costIndex.js';
import * as B from '../../src/lib/beachStory.js';
import * as L from '../../src/lib/lakeStory.js';
import * as M from '../../src/lib/mountainStory.js';
import * as T from '../../src/lib/trailStory.js';
import * as C from '../../src/lib/cycleStory.js';
import { fitTitle, fitDescription, clean } from './html.mjs';

/** The English catalogue as the app's t(): same keys, same {slot} rule. */
export const t = (key, vars) => {
  const msg = en[key] ?? key;
  return vars ? msg.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : msg;
};

const NUM = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const DEC1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const n0 = (v) => NUM.format(v);
const d1 = (v) => DEC1.format(v);
const kmOf = (m) => (m >= 10000 ? n0(m / 1000) : d1(m / 1000));
const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthOf = (code) => MONTH[typeof code === 'number' ? code - 1 : MON3.indexOf(String(code).slice(0, 3).toLowerCase())] || null;
const sentence = (s) => { const c = clean(s); return c && !/[.!?]$/.test(c) ? `${c}.` : c; };
const upFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** 'a' or 'an' before a figure as it is read aloud: an 8 km, an 11 km, an 18 km, a 12 km. */
const aOf = (fig) => (/^(8|11(?![\d,])|18(?![\d,])|11,|18,)/.test(String(fig)) ? 'an' : 'a');
/** Months as one phrase: 'in July', or 'from May to September'. */
const monthSpan = (ms) => (ms.length === 1 ? `in ${ms[0]}` : `from ${ms[0]} to ${ms[ms.length - 1]}`);
const TRANSPORT = { rail: 'trip.byRail', car: 'trip.byCar', mixed: 'trip.byMixed' };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

let regionDisplay = null;
export function countryName(cc) {
  try {
    regionDisplay ||= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionDisplay.of(String(cc).toUpperCase()) || cc;
  } catch { return cc; }
}

export const SECTION_LABEL = {
  trails: 'Walks', beaches: 'Beaches', lakes: 'Lakes', mountains: 'Mountains',
  cycling: 'Cycling routes', regions: 'Regions', trips: 'Trips',
};
const SECTION_ONE = {
  trails: 'walk', beaches: 'beach', lakes: 'lake', mountains: 'mountain',
  cycling: 'cycling route', regions: 'region', trips: 'trip',
};
const plural = (n, one, many = `${one}s`) => `${n0(n)} ${n === 1 ? one : many}`;
const MANY = { beach: 'beaches', 'cycling route': 'cycling routes', walk: 'walks' };

/** Breadcrumb roots, shared by every page in a country. */
const home = { name: 'Carta', path: '/' };
const countryCrumb = (cc) => ({ name: countryName(cc), path: paths.country(cc) });
const sectionCrumb = (cc, s) => ({ name: SECTION_LABEL[s], path: paths.section(cc, s) });

const geo = (lat, lon) => (isNum(lat) && isNum(lon)
  ? { '@type': 'GeoCoordinates', latitude: +lat.toFixed(5), longitude: +lon.toFixed(5) } : undefined);
const prop = (name, value, unitText, description) => ({
  '@type': 'PropertyValue', name, value, ...(unitText ? { unitText } : {}), ...(description ? { description } : {}),
});
const imageNode = (img) => (img ? {
  '@type': 'ImageObject', contentUrl: img.src, ...(img.licence ? { license: img.licenceUrl || img.licence } : {}),
  ...(img.creditText ? { creditText: img.creditText } : {}),
} : undefined);

/** A layer photograph with its credit, or null when the licence is not on record. */
function layerImage(row, alt) {
  const im = (row.images || [])[0];
  if (!im?.u || !im.lic) return null;
  const by = clean(im.by) || 'Wikimedia Commons';
  return {
    src: im.u, w: im.w || null, h: im.h || null, alt, licence: im.lic, licenceUrl: im.licUrl || null,
    creditText: by, credit: `Photo: ${by}, ${im.lic}`,
  };
}

/** Rows a page links to, already as { name, path, meta }. Caps at `max`. */
const linkRows = (rows, max) => rows.filter((r) => r && r.path).slice(0, max);

/** The coverage sentence for one layer in one country (spec 4.6, docs/SEO.md). */
function coverageLine(kind, rated, listed, cc) {
  const many = MANY[kind] || `${kind}s`;
  const where = countryName(cc);
  if (!rated && !listed) return `Carta has no ${many} in ${where} in its catalogue yet.`;
  const head = `Carta publishes ${n0(rated)} rated ${rated === 1 ? kind : many} in ${where}`;
  return listed
    ? `${head} and lists ${n0(listed)} more that do not have enough measured facts to be rated yet.`
    : `${head}.`;
}

// ---------------------------------------------------------------- trails

export function trailHeadline(tr) {
  const g = T.gradeLabelKey(tr);
  const shape = tr.is_loop || tr.f?.rt === 'loop' ? 'loop' : 'walk';
  return `${kmOf(tr.distance_m)} km ${g ? `${t(g).toLowerCase()} ` : ''}${shape}`;
}

export function trailPage(tr, ctx) {
  const cc = tr.country;
  const name = clean(tr.name);
  const region = ctx.regionName(tr.rg?.n2);
  const self = paths.trail(cc, tr.id, name);
  let of = null;
  if (tr.h?.cls === 'variant' && tr.h.of) of = ctx.trailByName(cc, tr.h.of);
  const canon = canonicalFor({ kind: 'trail', cc, id: tr.id, title: name, cls: tr.h?.cls, of: of ? { cc, id: of.id, title: of.name } : null });
  const climb = T.trailClimb(tr);
  const story = T.trailStory(tr, null, { t });
  const reasons = T.trailReasons(tr.reasons, t, 6, tr).map((r) => sentence(r.text));
  const rating = isNum(tr.rating) ? tr.rating : null;
  const season = tr.f?.se?.from && tr.f?.se?.to ? `${monthOf(tr.f.se.from)} to ${monthOf(tr.f.se.to)}` : null;
  const paved = isNum(tr.sf?.paved) ? Math.round(tr.sf.paved * 100) : null;
  const hookParts = [
    `${name} is ${aOf(kmOf(tr.distance_m))} ${kmOf(tr.distance_m)} km ${tr.is_loop ? 'loop' : 'route'} in ${region || countryName(cc)}`,
    climb?.up ? `with ${n0(climb.up)} m of climbing` : '',
  ].filter(Boolean);
  const hook = sentence(hookParts.join(' '));
  const parent = tr.h?.cls === 'stage' && (tr.h.top || tr.h.of) ? ctx.trailByName(cc, tr.h.top || tr.h.of) : null;
  const family = (ctx.familyOf(cc, tr.fam?.k) || []).filter((r) => r.id !== tr.id);
  const nearby = ctx.topTrails(cc, tr.rg?.n2, tr.id, 8);
  const subject = {
    '@type': 'TouristAttraction',
    additionalType: 'Hiking route',
    name,
    touristType: 'Hiker',
    geo: geo(...(tr.bbox ? [(tr.bbox[1] + tr.bbox[3]) / 2, (tr.bbox[0] + tr.bbox[2]) / 2] : [])),
    containedInPlace: { '@type': 'Country', name: countryName(cc) },
    additionalProperty: [
      prop('Distance', +(tr.distance_m / 1000).toFixed(1), 'km', 'measured from OpenStreetMap geometry'),
      climb?.up ? prop('Ascent', climb.up, 'm', 'measured from elevation data') : null,
      isNum(tr.duration_min) ? prop('Walking time', tr.duration_min, 'min', 'estimate from distance and climb') : null,
      T.gradeLabelKey(tr) ? prop('Difficulty', t(T.gradeLabelKey(tr))) : null,
    ].filter(Boolean),
    ...(tr.osm ? { sameAs: [`https://www.openstreetmap.org/relation/${tr.osm}`] } : {}),
    ...(parent ? { isPartOf: { '@type': 'TouristAttraction', name: clean(parent.name), url: `https://www.carta-europetravel.com${paths.trail(cc, parent.id, parent.name)}` } } : {}),
  };
  return {
    kind: 'trail',
    path: self,
    canonical: canon.canonical,
    title: fitTitle(name, trailHeadline(tr), region || countryName(cc)),
    description: fitDescription([hook, ...story.points.map((p) => p.text), ...reasons,
      'Distance and climb are measured from OpenStreetMap and elevation data.']),
    h1: name,
    lead: [hook, ...story.points.map((p) => sentence(p.text))],
    facts: [
      { label: 'Distance', value: `${kmOf(tr.distance_m)} km`, num: true },
      climb?.up ? { label: 'Climb', value: `${n0(climb.up)} m up${climb.down ? `, ${n0(climb.down)} m down` : ''}`, num: true } : null,
      isNum(tr.duration_min) ? { label: 'Walking time', value: fmtHours(tr.duration_min / 60), num: true } : null,
      T.gradeLabelKey(tr) ? { label: 'Difficulty', value: t(T.gradeLabelKey(tr)) } : null,
      { label: 'Shape', value: tr.is_loop ? 'Loop, ends where it starts' : 'Point to point' },
      tr.ele?.max ? { label: 'Highest point', value: `${n0(tr.ele.max)} m`, num: true } : null,
      season ? { label: 'Season', value: tr.f.se.est ? `${season}, estimated` : season } : null,
      paved != null ? { label: 'Paved', value: `${paved}%`, num: true } : null,
      rating != null ? { label: 'Carta score', value: `${d1(rating)} of 10`, num: true } : null,
      tr.f?.ref ? { label: 'Signs to follow', value: clean(tr.f.ref) } : null,
    ].filter(Boolean),
    sections: [
      reasons.length ? { h2: 'What you pass', paras: reasons } : null,
      parent ? { h2: 'Part of a longer route', links: [{ name: clean(parent.name), path: paths.trail(cc, parent.id, parent.name), meta: `${kmOf(parent.distance_m)} km`, metaNum: true }] } : null,
      family.length ? {
        h2: `More of ${clean(tr.fam?.n || name)}`,
        links: linkRows(family.map((r) => ({ name: clean(r.name), path: paths.trail(cc, r.id, r.name), meta: `${kmOf(r.distance_m)} km`, metaNum: true })), 12),
      } : null,
      nearby.length ? {
        h2: region ? `More walks in ${region}` : `More walks in ${countryName(cc)}`,
        links: nearby.map((r) => ({ name: clean(r.name), path: paths.trail(cc, r.id, r.name), meta: `${kmOf(r.distance_m)} km`, metaNum: true })),
      } : null,
    ],
    coverage: ctx.coverage('trails', cc),
    credits: ['Route geometry (c) OpenStreetMap contributors, ODbL', 'elevation from Copernicus DEM'],
    crumbs: [home, countryCrumb(cc), sectionCrumb(cc, 'trails')],
    boot: null,
    subject,
    lastmod: ctx.generatedAt('trails', cc),
  };
}

// --------------------------------------------------------------- cycling

export function cyclePage(r, ctx) {
  const cc = r.cc;
  const name = clean(C.routeTitle(r, t) || r.name || r.ref);
  const self = paths.cycle(cc, r.id, name);
  const why = C.whyLines(r.why, t, 5).map((w) => sentence(w.text));
  const paved = isNum(r.paved) ? Math.round(r.paved * 100) : null;
  const free = isNum(r.free) ? Math.round(r.free * 100) : null;
  const rating = C.cycleRating(r, t);
  const hook = sentence(`${name} is ${aOf(d1(r.km))} ${d1(r.km)} km cycling route in ${countryName(cc)}${isNum(r.asc) ? ` with ${n0(r.asc)} m of climbing` : ''}`);
  const nearTrails = (r.near?.trail || []).map((id) => ctx.trailById(cc, id)).filter(Boolean);
  const more = ctx.topCycles(cc, r.id, 8);
  const head = paved != null ? `${d1(r.km)} km, ${paved}% paved` : `${d1(r.km)} km`;
  return {
    kind: 'cycle',
    path: self,
    canonical: canonicalFor({ kind: 'cycle', cc, id: r.id, title: name }).canonical,
    title: fitTitle(name, head, r.fam || countryName(cc)),
    description: fitDescription([hook, ...why, 'Surface is measured per kilometre from OpenStreetMap.']),
    h1: name,
    lead: [hook, sentence(C.bikeLine(r.bike, t))].filter(Boolean),
    facts: [
      { label: 'Distance', value: `${d1(r.km)} km`, num: true },
      isNum(r.asc) ? { label: 'Climb', value: `${n0(r.asc)} m`, num: true } : null,
      isNum(r.dur?.min) ? { label: 'Riding time', value: fmtHours(r.dur.min / 60), num: true } : null,
      paved != null ? { label: 'Paved', value: `${paved}%`, num: true } : null,
      free != null ? { label: 'Away from motor traffic', value: `${free}%`, num: true } : null,
      r.ref ? { label: 'Signed as', value: clean(r.ref) } : null,
      rating ? { label: 'Carta score', value: `${d1(rating.score)} of 10`, num: true } : null,
    ].filter(Boolean),
    sections: [
      why.length ? { h2: 'Why ride it', paras: why } : null,
      nearTrails.length ? {
        h2: 'Walks near the route',
        links: linkRows(nearTrails.map((x) => ({ name: clean(x.name), path: paths.trail(cc, x.id, x.name), meta: `${kmOf(x.distance_m)} km`, metaNum: true })), 8),
      } : null,
      more.length ? {
        h2: `More cycling in ${countryName(cc)}`,
        links: more.map((x) => ({ name: clean(C.routeTitle(x, t) || x.name || x.ref), path: paths.cycle(cc, x.id, C.routeTitle(x, t) || x.name || x.ref), meta: `${d1(x.km)} km`, metaNum: true })),
      } : null,
    ],
    coverage: ctx.coverage('cycling', cc),
    credits: ['Route geometry and surface (c) OpenStreetMap contributors, ODbL'],
    crumbs: [home, countryCrumb(cc), sectionCrumb(cc, 'cycling')],
    subject: {
      '@type': 'TouristAttraction',
      additionalType: 'Cycling route',
      name,
      touristType: 'Cyclist',
      geo: geo(...(r.bbox ? [(r.bbox[1] + r.bbox[3]) / 2, (r.bbox[0] + r.bbox[2]) / 2] : [])),
      containedInPlace: { '@type': 'Country', name: countryName(cc) },
      additionalProperty: [
        prop('Distance', r.km, 'km', 'measured from OpenStreetMap geometry'),
        isNum(r.asc) ? prop('Ascent', r.asc, 'm', 'measured from elevation data') : null,
        paved != null ? prop('Paved share', paved, 'percent', 'measured per kilometre from OpenStreetMap') : null,
      ].filter(Boolean),
      sameAs: [`https://www.openstreetmap.org/relation/${r.id}`],
    },
    lastmod: ctx.generatedAt('cycling', cc),
  };
}

export function tourPage(tour, ctx) {
  const cc = tour.cc;
  const name = clean(tour.title);
  const legs = (tour.routes || []).map((id) => ctx.cycleById(cc, id)).filter(Boolean);
  const hook = sentence(`${name} as a ${tour.days} day ride of ${n0(tour.km)} km${isNum(tour.asc) ? ` with ${n0(tour.asc)} m of climbing` : ''}`);
  return {
    kind: 'tour',
    path: paths.tour(cc, tour.slug),
    title: fitTitle(name, `${tour.days} days by bike`, countryName(cc)),
    description: fitDescription([hook, tour.pace && tour.bike ? `Planned at a ${tour.pace} pace for a ${tour.bike} bike.` : '', 'Distances are measured from OpenStreetMap.']),
    h1: name,
    lead: [hook],
    facts: [
      { label: 'Days', value: String(tour.days), num: true },
      { label: 'Distance', value: `${n0(tour.km)} km`, num: true },
      isNum(tour.asc) ? { label: 'Climb', value: `${n0(tour.asc)} m`, num: true } : null,
      tour.pace ? { label: 'Pace', value: upFirst(tour.pace) } : null,
      tour.bike ? { label: 'Bike', value: upFirst(tour.bike) } : null,
    ].filter(Boolean),
    sections: [legs.length ? {
      h2: 'The routes it follows',
      links: legs.map((x) => ({ name: clean(C.routeTitle(x, t) || x.name || x.ref), path: paths.cycle(cc, x.id, C.routeTitle(x, t) || x.name || x.ref), meta: `${d1(x.km)} km`, metaNum: true })),
    } : null, {
      h2: `More cycling in ${countryName(cc)}`,
      links: ctx.topCycles(cc, null, 8).map((x) => ({ name: clean(C.routeTitle(x, t) || x.name || x.ref), path: paths.cycle(cc, x.id, C.routeTitle(x, t) || x.name || x.ref), meta: `${d1(x.km)} km`, metaNum: true })),
    }],
    coverage: ctx.coverage('cycling', cc),
    credits: ['Route geometry (c) OpenStreetMap contributors, ODbL'],
    crumbs: [home, countryCrumb(cc), sectionCrumb(cc, 'cycling')],
    subject: {
      '@type': 'TouristTrip', name, touristType: 'Cyclist',
      itinerary: { '@type': 'ItemList', itemListElement: legs.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: clean(x.name || x.ref) })) },
    },
    lastmod: ctx.generatedAt('cycling', cc),
  };
}

// ------------------------------------------------- beaches, lakes, mountains

const LAYER = {
  beach: { story: B, section: 'beaches', headline: B.beachHeadline, why: B.beachWhy, rating: B.beachRating, type: 'Beach' },
  lake: { story: L, section: 'lakes', headline: L.lakeHeadline, why: L.lakeWhy, rating: L.lakeRating, type: 'LakeBodyOfWater' },
  mountain: { story: M, section: 'mountains', headline: M.mountainHeadline, why: M.mountainWhy, rating: M.mountainRating, type: 'Mountain' },
};

function layerTitleHead(kind, row) {
  if (kind === 'beach') {
    if (row.water?.class) return `${row.water.class.toLowerCase()} water`;
    return row.surface ? `${row.surface} beach` : 'beach';
  }
  if (kind === 'lake') {
    const s = row.swim?.season;
    if (s?.from && s?.to) return `swim ${monthOf(s.from)} to ${monthOf(s.to)}`;
    return row.size?.areaKm2 >= 1 ? `${d1(row.size.areaKm2)} km2 lake` : 'lake';
  }
  const ele = isNum(row.ele) ? `${n0(row.ele)} m` : null;
  return [ele, M.isLiftServed(row) ? 'by cable car' : null].filter(Boolean).join(' ') || 'mountain';
}

export function layerPage(kind, row, ctx) {
  const cfg = LAYER[kind];
  const cc = row.cc;
  const name = clean(row.name);
  const region = ctx.regionName(row.rg?.n2) || clean(row.region) || null;
  const headline = sentence(cfg.headline(row, t, countryName(cc)));
  const why = (cfg.why(row, t, 6) || []).map(sentence);
  const rating = cfg.rating(row, t);
  // Beaches and lakes name their base town in `base`; mountains in `near`.
  const baseRef = row.base?.id ? row.base : (row.near?.dest_id ? { id: row.near.dest_id, city: row.near.city, km: row.near.km } : null);
  const base = baseRef ? ctx.destById(baseRef.id) : null;
  const more = ctx.topLayer(kind, cc, row.rg?.n2, row.id, 8);
  const facts = [rating ? { label: 'Carta score', value: `${d1(rating.score)} of 10`, num: true } : null];
  const props = [];
  if (kind === 'beach') {
    if (row.water?.class) {
      facts.push({ label: 'Bathing water', value: row.water.site ? `${row.water.class}, at ${upFirst(String(row.water.site).toLowerCase())}` : row.water.class });
      props.push(prop('Bathing water class', row.water.class, null, 'EEA bathing water directive, measured'));
    }
    if (row.surface) facts.push({ label: 'Surface', value: upFirst(row.surface) });
    if (isNum(row.lengthM)) { facts.push({ label: 'Length', value: `${kmOf(row.lengthM)} km`, num: true }); props.push(prop('Length', row.lengthM, 'm', 'measured from OpenStreetMap')); }
  } else if (kind === 'lake') {
    const season = L.lakeSeason(row, t);
    const swim = L.lakeSwim(row, t);
    if (swim?.label) facts.push({ label: 'Swimming', value: swim.label });
    if (season) facts.push({ label: 'Swim season', value: season });
    if (row.size?.areaKm2 >= 0.05) { facts.push({ label: 'Area', value: `${row.size.areaKm2 >= 1 ? d1(row.size.areaKm2) : row.size.areaKm2.toFixed(2)} km2`, num: true }); props.push(prop('Area', row.size.areaKm2, 'km2', 'measured')); }
    if (row.size?.depthM) { facts.push({ label: 'Deepest point', value: `${n0(row.size.depthM)} m`, num: true }); props.push(prop('Depth', row.size.depthM, 'm', 'measured')); }
    if (row.water?.class) facts.push({ label: 'Bathing water', value: row.water.class });
    if (row.swim?.season?.peak) props.push(prop('Peak water temperature', row.swim.season.peak, 'degrees C', 'estimate from NASA POWER'));
  } else {
    const height = M.heightLine(row, t, 'en');
    if (height) facts.push({ label: 'Height', value: height, num: true });
    if (isNum(row.prom)) { facts.push({ label: 'Prominence', value: `${n0(row.prom)} m`, num: true }); props.push(prop('Prominence', row.prom, 'm', 'measured')); }
    const lift = M.liftLabel(row, t);
    if (lift) facts.push({ label: 'Getting up', value: lift });
    const season = M.mountainSeason(row, t);
    if (season) facts.push({ label: 'Snow free', value: season });
    if (row.range) facts.push({ label: 'Range', value: clean(row.range) });
  }
  if (base) facts.push({ label: 'Nearest town', value: `${clean(baseRef.city || base.name)}, ${d1(baseRef.km)} km` });
  const subject = {
    '@type': cfg.type,
    name,
    geo: kind === 'mountain' && isNum(row.ele) ? { ...geo(row.lat, row.lon), elevation: row.ele } : geo(row.lat, row.lon),
    containedInPlace: region ? { '@type': 'AdministrativeArea', name: region } : { '@type': 'Country', name: countryName(cc) },
    ...(props.length ? { additionalProperty: props } : {}),
    ...(row.wd ? { sameAs: [`https://www.wikidata.org/wiki/${row.wd}`] } : {}),
  };
  const image = layerImage(row, `${name}, ${countryName(cc)}`);
  if (image) subject.image = imageNode(image);
  const self = paths[kind](cc, row.id);
  return {
    kind,
    path: self,
    title: fitTitle(name, layerTitleHead(kind, row), region || countryName(cc)),
    description: fitDescription([headline, ...why, kind === 'beach' && row.water?.class ? 'The water class is measured by the European Environment Agency.' : '']),
    h1: name,
    lead: [headline],
    facts: facts.filter(Boolean),
    image,
    sections: [
      why.length ? { h2: kind === 'mountain' ? 'Why go up' : 'Why go', paras: why } : null,
      base ? { h2: 'Where to stay', links: [{ name: base.name, path: paths.dest(base.slug), meta: `${d1(baseRef.km)} km`, metaNum: true }] } : null,
      more.length ? {
        h2: `More ${cfg.section} in ${region || countryName(cc)}`,
        links: more.map((x) => ({ name: clean(x.name), path: paths[kind](cc, x.id), meta: isNum(x.score) ? `${d1(x.score)}` : '', metaNum: true })),
      } : null,
    ],
    coverage: ctx.coverage(cfg.section, cc),
    credits: (row.credit || []).map(clean),
    crumbs: [home, countryCrumb(cc), sectionCrumb(cc, cfg.section)],
    subject,
    lastmod: ctx.generatedAt(cfg.section, cc),
  };
}

// ------------------------------------------------------------ destinations

/** The first licensed gallery photograph of a dossier, with its credit. */
function destImage(dos, name) {
  const g = (dos.gallery || []).find((im) => im.licence && (im.thumb || im.url));
  return g ? {
    src: g.thumb || g.url, w: g.thumb === g.url ? g.w : null, h: g.thumb === g.url ? g.h : null,
    alt: clean(g.caption || name), licence: g.licence, licenceUrl: g.licence_url || null,
    creditText: clean(g.author) || 'Wikimedia Commons',
    credit: `Photo: ${clean(g.author) || 'Wikimedia Commons'}, ${g.licence}`,
  } : null;
}

export function destPage(dos, ctx) {
  const pl = dos.place || {};
  const cc = pl.iso2;
  const name = clean(pl.name);
  const cost = ctx.costOf(dos.id);
  const measured = cost && cost.stayLevel === 'city';
  const v = dos.verdict || {};
  const best = (dos.when?.best || []).map(monthOf).filter(Boolean);
  const intro = clean(dos.intro?.short || '');
  const body = clean(dos.intro?.body || '');
  const day = cost?.dayEur != null ? `€${n0(cost.dayEur)}` : null;
  const headNum = measured && day ? `${day} a day` : (isNum(v.score) ? `rated ${d1(v.score)}` : null);
  const costLine = day
    ? (measured
      ? `A day in ${name} costs about ${day} for one person: a bed measured from ${cost.listings ? `${n0(cost.listings)} stays in the town` : 'stays in the town'} and a day of food.`
      : `A day in ${name} costs about ${day} for one person, from ${cost.stayLevel === 'region' ? 'the nearest measured town' : 'national figures'} rather than stays measured in the town.`)
    : null;
  const rankLine = isNum(v.country_rank) && isNum(v.country_n) ? `Rated ${n0(v.country_rank)} of ${n0(v.country_n)} places in ${countryName(cc)}.` : null;
  const image = destImage(dos, name);
  const ar = dos.around || {};
  const trailLinks = (ar.trails || []).filter((x) => ctx.isTrail(x.cc, x.id)).map((x) => ({ name: clean(x.name), path: paths.trail(x.cc, x.id, x.name), meta: `${d1(x.km_len)} km`, metaNum: true }));
  const cycleLinks = (ar.cycling || []).filter((x) => ctx.isCycle(x.cc, x.id)).map((x) => ({ name: clean(x.name || x.ref), path: paths.cycle(x.cc, x.id, x.name || x.ref), meta: isNum(x.km_len) ? `${d1(x.km_len)} km` : '', metaNum: true }));
  const water = [...(dos.nearby?.beaches || []), ...(dos.nearby?.lakes || []), ...(ar.beaches || [])]
    .map((x) => ({ ...x, kind: (x.layer || '').startsWith('lake') ? 'lake' : 'beach' }))
    .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i && ctx.isLayer(x.kind, x.id))
    .map((x) => ({ name: clean(x.name), path: paths[x.kind](x.cc, x.id), meta: `${d1(x.km)} km away`, metaNum: true }));
  const peaks = (dos.nearby?.mountains || []).filter((x) => ctx.isLayer('mountain', x.id))
    .map((x) => ({ name: clean(x.name), path: paths.mountain(x.cc, x.id), meta: `${d1(x.km)} km away`, metaNum: true }));
  const days = (dos.trips || []).map((x) => ({ x, d: x.id ? ctx.destById(x.id) : null })).filter((o) => o.d)
    .map(({ x, d }) => ({ name: d.name, path: paths.dest(d.slug), meta: x.travel?.minutes ? `${fmtHours(x.travel.minutes / 60)} by ${x.travel.mode || 'road'}` : `${n0(x.dist_km)} km`, metaNum: true }));
  const hl = (dos.highlights || []).slice(0, 8).map((h) => (h.fact ? `${clean(h.name)}: ${sentence(h.fact)}` : sentence(h.name)));
  const subject = {
    '@type': 'TouristDestination',
    name,
    geo: geo(pl.lat, pl.lon),
    containedInPlace: { '@type': 'Country', name: countryName(cc) },
    ...(pl.categories?.length ? { touristType: pl.categories } : {}),
    ...(image ? { image: imageNode(image) } : {}),
    ...((dos.highlights || []).length ? { includesAttraction: dos.highlights.slice(0, 8).map((h) => ({ '@type': 'TouristAttraction', name: clean(h.name) })) } : {}),
    ...(cost?.dayEur != null ? {
      additionalProperty: [prop('Day cost for one person, bed and food', Math.round(cost.dayEur), 'EUR',
        measured ? 'measured from stays in the town' : 'estimate from national figures')],
    } : {}),
  };
  return {
    kind: 'dest',
    path: paths.dest(dos.slug),
    title: fitTitle(name, headNum, countryName(cc)),
    description: fitDescription([intro || body, costLine, rankLine]),
    h1: name,
    lead: [intro || body, costLine].filter(Boolean),
    facts: [
      day ? { label: measured ? 'A day for one person' : 'A day for one person, estimated', value: day, num: true } : null,
      cost?.stayEur != null ? { label: 'Bed, a night', value: `€${n0(cost.stayEur)}`, num: true } : null,
      cost?.foodEur != null ? { label: 'Food, a day', value: `€${n0(cost.foodEur)}`, num: true } : null,
      isNum(v.score) ? { label: 'Carta score', value: `${d1(v.score)} of 10`, num: true } : null,
      isNum(pl.visit_h) ? { label: 'Time to see it', value: fmtHours(pl.visit_h), num: true } : null,
      best.length ? { label: 'Best months', value: best.join(', ') } : null,
      dos.water?.rating ? { label: 'Bathing water nearby', value: dos.water.rating } : null,
      dos.when?.crowding?.label ? { label: 'Crowds', value: dos.when.crowding.label } : null,
    ].filter(Boolean),
    image,
    sections: [
      // T224: the week receipt is its own page; the destination links to it.
      cost?.dayEur != null && paths.cost(dos.slug) ? {
        h2: `What a week in ${name} costs`,
        links: [{ name: `A week in ${name}, bed and food for one person`, path: paths.cost(dos.slug), meta: `€${n0(weekReceipt(cost, ctx.destRow(dos.id)).total)}`, metaNum: true }],
      } : null,
      intro && body ? { h2: `About ${name}`, paras: [body] } : null,
      hl.length ? { h2: 'What to see', paras: hl } : null,
      trailLinks.length ? { h2: `Walks near ${name}`, links: linkRows(trailLinks, 6) } : null,
      cycleLinks.length ? { h2: 'Cycling nearby', links: linkRows(cycleLinks, 4) } : null,
      water.length ? { h2: 'Beaches and lakes nearby', links: linkRows(water, 6) } : null,
      peaks.length ? { h2: 'Mountains nearby', links: linkRows(peaks, 4) } : null,
      days.length ? { h2: `Day trips from ${name}`, links: linkRows(days, 8) } : null,
    ],
    coverage: rankLine,
    credits: (dos.credits || []).map((c) => clean(`${c.name}${c.licence && c.licence !== 'see site' ? `, ${c.licence}` : ''}`)),
    crumbs: [home, countryCrumb(cc)],
    boot: `#dest=${encodeURIComponent(dos.id)}`,
    subject,
    lastmod: dos.built_at || null,
  };
}

// ------------------------------------------- cost and trip-length pages (T224)
//
// Two families, both built from the computeCosts row the destination page
// leads with (costIndex.js, no choices: the default Lifestyle), so a day, a
// week and four days of the same town come from one set of figures. Ground
// costs only: Carta does not price flights (owner decision T272), and every
// page says so. Every figure carries the provenance words of T098.

export const WEEK = 7;
/** The trip lengths that get a country page: a long weekend, four days, a week. */
export const DAY_LENGTHS = Object.freeze([3, 4, 7]);
/** Day budgets in euros for one person. Fixed, like the CUTS in costIndex.js,
 *  so a URL such as /portugal/4-days/under-60 keeps its meaning as the
 *  catalogue grows. Chosen from the catalogue of 2026-10-03: about a tenth of
 *  the priced places are under 60, a third under 80, four fifths under 100. */
export const DAY_BANDS = Object.freeze([60, 80, 100]);
const OTHER_LENGTHS = [3, 4, 10, 14];
const WORD = { 3: 'three', 4: 'four', 7: 'seven', 10: 'ten', 14: 'fourteen' };
const EUR2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur2 = (v) => `€${EUR2.format(v)}`;
const eur0 = (v) => `€${n0(v)}`;
const r2 = (v) => Math.round(v * 100) / 100;
/** A whole-euro figure, with a tilde when the bed in it is not measured in or near the town. */
const approx = (v, measured) => `${measured ? '' : '~'}${eur0(v)}`;

const monthYear = (iso) => {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 7)}-15T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null
    : new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
};

/**
 * Where the bed figure came from, in the receipt's own words (T098,
 * CostSummary.jsx). A city-level bed names the place its listings come from,
 * which for a small town is often the nearest city Inside Airbnb covers; when
 * the wire does not name that place the sentence names only the listings.
 */
export function bedSource(cost) {
  if (!cost || cost.stayEur == null) return null;
  if (cost.stayLevel === 'region') return t('cost.bedRepaired');
  if (cost.stayLevel === 'city') {
    const when = monthYear(cost.captured);
    if (cost.listings && cost.source && when) {
      return t('cost.bedCityN', { n: n0(cost.listings), place: clean(cost.source), when });
    }
    if (cost.listings) return `Bed: from ${n0(cost.listings)} Inside Airbnb listings${when ? ` captured ${when}` : ''}.`;
    return t('cost.bedCity');
  }
  return String(cost.stayBasis || '').startsWith('airbnb_pli_scaled') ? t('cost.bedScaled') : t('cost.bedCountry');
}

/** Where the food figure came from (T098). */
export function foodSource(cost) {
  if (!cost || cost.foodEur == null) return null;
  if (cost.foodLevel === 'city') return t('cost.foodCity');
  return String(cost.foodBasis || '').startsWith('pli_scaled') ? t('cost.foodScaled') : t('cost.foodCountry');
}

/**
 * A week for one person as receipt lines: the bed for seven nights, then the
 * week of eating and drinking out item by item at the default Lifestyle,
 * through groundSpendPerPerson, the function the trip receipt and the day
 * planner price from. The total is the sum of the printed lines, so the
 * receipt always adds up. Null when the place has no day cost.
 */
export function weekReceipt(cost, row) {
  if (!cost || cost.dayEur == null) return null;
  const ls = DEFAULT_LIFESTYLE;
  const lines = [{ label: `A bed for the night, ${WEEK} nights at ${eur2(cost.stayEur)}`, eur: r2(cost.stayEur * WEEK) }];
  const g = row?.costs ? groundSpendPerPerson(row, WEEK, ls) : null;
  if (g) {
    const item = (label, n, eur) => { if (n > 0 && eur > 0) lines.push({ label: `${label}, ${n0(n)}`, eur }); };
    item(t('lifestyle.dinnersOut'), ls.dinners_per_week, g.dinners);
    item(t('lifestyle.casualMeals'), ls.lunches_per_week, g.lunches);
    item(t('lifestyle.fastFood'), ls.fastfood_per_week, g.fastfood);
    item(t('lifestyle.drinksAtBars'), ls.drinks_per_week, g.drinks);
    item(t('lifestyle.clubNights'), ls.club_nights_per_week, g.clubbing);
    item('Coffees', (ls.coffees_per_day || 0) * WEEK, g.coffees);
    item(t('lifestyle.cookAtHome'), ls.self_catered_days_per_week, g.groceries);
  } else {
    lines.push({ label: `Eating and drinking out, ${WEEK} days`, eur: r2(cost.foodEur * WEEK) });
  }
  const food = r2(lines.slice(1).reduce((a, l) => a + l.eur, 0));
  const total = r2(lines[0].eur + food);
  return { lines, bed: lines[0].eur, food, total, perDay: total / WEEK };
}

const destCrumb = (d) => ({ name: d.name, path: paths.dest(d.slug) });
const daysName = (cc, e) => (e.band
  ? `${countryName(cc)} for ${e.days} days under €${e.band} a day`
  : `${countryName(cc)} for ${e.days} days`);

/** The cost page: what a week in one destination costs one person, as a receipt. */
export function costPage(dos, ctx) {
  const pl = dos.place || {};
  const cc = pl.iso2;
  const name = clean(pl.name);
  const cost = ctx.costOf(dos.id);
  const row = ctx.destRow(dos.id);
  const self = paths.cost(dos.slug);
  const week = weekReceipt(cost, row);
  if (!self || !week) return null;
  const where = countryName(cc);
  const bedMeasured = cost.stayLevel === 'city';
  const foodMeasured = cost.foodLevel === 'city';
  const a = row?.accommodation || {};
  const shared = cost.stayLevel !== 'region' && a.entire_home_night_eur > 0;
  const sleeps = a.typical_capacity || 4;
  const peers = ctx.pricedOf(cc);
  const median = peers.length ? peers[peers.length >> 1].week : null;
  const dearer = peers.filter((d) => d.perDay > week.perDay).length;
  const curve = bedMeasured && Array.isArray(a.seasonality) && a.seasonality.length === 12 ? a.seasonality : null;
  const cheapMonths = curve ? (cheapestStayMonths(row) || []).map(monthOf).filter(Boolean) : [];
  const monthWeek = curve ? curve.map((f, i) => ({ m: MONTH[i], eur: r2(cost.stayEur * f * WEEK) + week.food })) : null;
  const cheapest = monthWeek ? monthWeek.reduce((x, y) => (y.eur < x.eur ? y : x)) : null;

  const hook = `A week in ${name} costs about ${eur0(week.total)} for one person on the ground: seven nights in a bed and seven days of eating and drinking out.`;
  const shareLine = shared ? `The bed is one person's share of a whole place that sleeps ${n0(sleeps)}.` : null;
  const noFlights = 'Flights are not in this figure: Carta does not price them.';
  const middle = median != null && peers.length >= 5
    ? `The middle week across ${n0(peers.length)} priced places in ${where} costs ${eur0(median)}.` : null;
  // The receipt foot shows what one changed input does to the total: the
  // month where the bed has a measured calendar, four days instead of seven
  // where it does not.
  const foot = cheapest && cheapest.eur < week.total - 0.5
    ? `In ${cheapest.m}, the cheapest month for a bed here, the week comes to about ${eur0(cheapest.eur)}.`
    : `Four days instead of seven come to about ${eur0(week.perDay * 4)}.`;
  const near = ctx.cheaperNear(dos.id, cc, pl.lat, pl.lon, week.perDay, 6);
  const daysHere = ctx.daysOf(cc).filter((e) => !e.band);
  const image = destImage(dos, name);
  const estimateWord = bedMeasured && foodMeasured ? 'measured' : 'estimate';
  return {
    kind: 'cost',
    path: self,
    title: fitTitle(`A week in ${name}`, `${eur0(week.total)} for one person`, where),
    description: fitDescription([hook, middle, noFlights]),
    h1: `What a week in ${name} costs`,
    lead: [hook, [shareLine, noFlights].filter(Boolean).join(' ')],
    receipt: {
      head: `${name}, ${WEEK} nights, one person`,
      lines: week.lines.map((l) => ({ label: l.label, value: eur2(l.eur) })),
      totalLabel: 'The week, one person',
      total: eur2(week.total),
      foot,
      note: 'Food is priced at the default Lifestyle: five dinners out, four casual meals, two fast meals, seven drinks, one club night (the entry and three cocktails) and two days cooking at home.',
    },
    facts: [
      { label: bedMeasured && foodMeasured ? 'A week for one person' : 'A week for one person, estimated', value: eur0(week.total), num: true },
      { label: 'A day for one person', value: eur0(week.perDay), num: true },
      { label: bedMeasured ? 'Bed, a night' : 'Bed, a night, estimated', value: eur0(cost.stayEur), num: true },
      { label: foodMeasured ? 'Food, a day' : 'Food, a day, estimated', value: eur0(cost.foodEur), num: true },
      cheapMonths.length ? { label: 'Cheapest months for a bed', value: joinNames(cheapMonths) } : null,
      peers.length >= 5 ? { label: `Of ${n0(peers.length)} priced places in ${where}, how many cost more`, value: n0(dearer), num: true } : null,
    ].filter(Boolean),
    image,
    sections: [
      monthWeek ? {
        h2: 'What the week costs, month by month',
        links: monthWeek.map((x) => ({ name: x.m, meta: eur0(x.eur), metaNum: true })),
        note: `The bed follows the Inside Airbnb calendar${cost.source ? ` for ${clean(cost.source)}` : ''}; food stays at the same figure all year.`,
      } : null,
      {
        h2: `What ${joinNames(OTHER_LENGTHS.map(String)).replace(' and ', ' or ')} days in ${name} cost`,
        facts: OTHER_LENGTHS.map((n) => ({ label: `${n} days`, value: eur0(week.perDay * n), num: true })),
      },
      near.length ? { h2: `Where a week costs less near ${name}`, links: near } : null,
      {
        h2: `More about ${name} and ${where}`,
        links: [
          { name, path: paths.dest(dos.slug) },
          ...daysHere.map((e) => ({ name: `Where to go in ${where} for ${e.days} days`, path: e.path, meta: `${n0(e.places)} places`, metaNum: true })),
          { name: where, path: paths.country(cc) },
        ],
      },
    ],
    coverage: [bedSource(cost), foodSource(cost)].filter(Boolean).join(' '),
    credits: ['Bed prices from Inside Airbnb', 'food prices from Numbeo', "Eurostat's price level index where a figure is scaled"],
    crumbs: [home, countryCrumb(cc), destCrumb({ name, slug: dos.slug })],
    boot: `#dest=${encodeURIComponent(dos.id)}`,
    measured: bedMeasured || foodMeasured,
    subject: {
      '@type': 'TouristDestination',
      name,
      url: `https://www.carta-europetravel.com${paths.dest(dos.slug)}`,
      geo: geo(pl.lat, pl.lon),
      containedInPlace: { '@type': 'Country', name: where },
      ...(image ? { image: imageNode(image) } : {}),
      additionalProperty: [
        prop('Week cost for one person, bed and food, no flights', Math.round(week.total), 'EUR',
          estimateWord === 'measured' ? 'measured: bed from Inside Airbnb listings, food from Numbeo' : 'estimate: at least one part is a national or nearby figure'),
        prop('Day cost for one person, bed and food', Math.round(week.perDay), 'EUR', estimateWord === 'measured' ? 'measured' : 'estimate'),
      ],
    },
    lastmod: dos.built_at || null,
  };
}

/**
 * A country and trip-length page: where one person can go in a country for
 * `n` days, cheapest first, optionally only the places under a day budget.
 * Which of these pages exist is decided by daysPlan() in floor.mjs; the
 * builder is only called for those.
 */
export function daysPage(cc, n, band, ctx) {
  const where = countryName(cc);
  const all = ctx.pricedOf(cc);
  const rows = band ? all.filter((d) => d.perDay < band) : all;
  if (!rows.length) return null;
  const tot = (d) => d.perDay * n;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const mid = rows[rows.length >> 1];
  const measured = rows.filter((d) => d.measured).length;
  const w = WORD[n] || String(n);
  const h1 = band ? `Where to go in ${where} for ${n} days under €${band} a day` : `Where to go in ${where} for ${n} days`;
  const lead1 = band
    ? `${n0(rows.length)} of the ${n0(all.length)} priced places in ${where} cost one person under €${band} a day on the ground, so ${w} days there come to less than ${eur0(band * n)}.`
    : `${upFirst(w)} days in ${where} cost one person from about ${eur0(tot(first))} in ${first.name} to about ${eur0(tot(last))} in ${last.name} on the ground, across ${n0(rows.length)} priced places.`;
  const lead2 = `${upFirst(w)} days means ${w} nights in a bed and ${w} days of eating and drinking out. Flights are not included: Carta does not price them.`;
  // The plain length page lists the best rated places first and a budget page
  // the cheapest first: they answer "where should I go for four days" and
  // "where can I afford four days", and with a cap of 100 a cheapest-first
  // plain page would show the same hundred places as its budget page.
  const order = band ? rows : [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.perDay - b.perDay);
  const shown = order.slice(0, PAGE_SIZE);
  const trips = ctx.tripsOfLength(cc, n, 12);
  const weeks = n === WEEK ? ctx.journeysOf(cc).filter((j) => j.durationDays === WEEK).slice(0, 12) : [];
  const siblings = ctx.daysOf(cc).filter((e) => !(e.days === n && (e.band || null) === (band || null)));
  const self = paths.days(cc, n, band);
  const lastmod = rows.map((d) => d.built).filter(Boolean).sort().at(-1) || null;
  return {
    kind: 'days',
    path: self,
    title: band
      ? fitTitle(`${where} for ${n} days under €${band} a day`, `${n0(rows.length)} places`, null)
      : fitTitle(`${where} for ${n} days`, `${n0(rows.length)} places from ${eur0(tot(first))}`, null),
    description: fitDescription([lead1, lead2]),
    h1,
    lead: [lead1, lead2],
    facts: [
      { label: 'Places priced', value: n0(rows.length), num: true },
      { label: `Cheapest ${n} days, ${first.name}`, value: approx(tot(first), first.measured), num: true },
      { label: `Middle ${n} days, ${mid.name}`, value: approx(tot(mid), mid.measured), num: true },
      { label: 'Of these, beds priced from listings in or near the town', value: n0(measured), num: true },
    ],
    sections: [
      {
        h2: band
          ? (rows.length > shown.length ? `The ${n0(shown.length)} cheapest of ${n0(rows.length)} places` : `The ${n0(rows.length)} places, cheapest first`)
          : (rows.length > shown.length ? `The ${n0(shown.length)} best rated of ${n0(rows.length)} places` : `The ${n0(rows.length)} places, best rated first`),
        links: shown.map((d) => ({ name: d.name, path: paths.cost(d.slug), meta: approx(tot(d), d.measured), metaNum: true })),
      },
      trips.length ? {
        h2: `Planned ${n} day trips in ${where}`,
        links: trips.map((x) => ({ name: joinNames((x.cities || []).map((c) => clean(c.city))), path: paths.trip(x.id), meta: `${x.nights} nights`, metaNum: true })),
      } : null,
      weeks.length ? {
        h2: `Planned weeks in ${where}`,
        links: weeks.map((j) => ({ name: clean(j.title), path: paths.journey(j.id) })),
      } : null,
      {
        h2: `${where} by length and budget`,
        links: [
          ...siblings.map((e) => ({ name: daysName(cc, e), path: e.path, meta: `${n0(e.places)} places`, metaNum: true })),
          { name: where, path: paths.country(cc) },
        ],
      },
    ],
    coverage: `${n0(measured)} of these ${n0(rows.length)} bed prices come from Inside Airbnb listings in or near the town; the other ${n0(rows.length - measured)} are country-level figures and carry a tilde. Food is priced from Numbeo, at the town's own rates where it measures them and at country rates elsewhere.`,
    credits: ['Bed prices from Inside Airbnb', 'food prices from Numbeo', "Eurostat's price level index where a figure is scaled"],
    crumbs: band ? [home, countryCrumb(cc), { name: `${n} days`, path: paths.days(cc, n) }] : [home, countryCrumb(cc)],
    boot: null,
    subject: {
      '@type': 'ItemList', name: h1, numberOfItems: rows.length,
      itemListElement: shown.map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: `https://www.carta-europetravel.com${paths.cost(d.slug)}`, name: d.name })),
    },
    lastmod,
  };
}

// ----------------------------------------------------------------- trips

const joinNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export function tripPage(trip, ctx) {
  const cities = (trip.cities || []).map((c) => ({ ...c, d: ctx.destByCity(c.cc, c.city) }));
  const names = cities.map((c) => clean(c.d?.name || c.city));
  const h1 = `${joinNames(names)}, ${trip.days} days`;
  const nights = cities.map((c) => `${c.n} ${c.n === 1 ? 'night' : 'nights'} in ${clean(c.d?.name || c.city)}`);
  const season = (trip.season || []).map(monthOf).filter(Boolean);
  const hook = sentence(`${upFirst(joinNames(nights))}${TRANSPORT[trip.transport] ? `, ${t(TRANSPORT[trip.transport]).toLowerCase()}` : ''}`);
  const cost = trip.cost?.per_day_eur ? sentence(`About €${n0(trip.cost.per_day_eur)} a day for one person for the beds and the ground transport, an estimate from the catalogue`) : null;
  const cc = trip.cc;
  return {
    kind: 'trip',
    path: paths.trip(trip.id),
    title: fitTitle(joinNames(names), `${trip.days} days`, countryName(cc)),
    description: fitDescription([hook, cost, season.length ? `Best ${monthSpan(season)}.` : '']),
    h1,
    lead: [hook, cost].filter(Boolean),
    facts: [
      { label: 'Days', value: `${trip.days} days, ${trip.nights} nights`, num: true },
      isNum(trip.km) ? { label: 'Distance between stops', value: `${n0(trip.km)} km`, num: true } : null,
      trip.transport ? { label: 'Getting around', value: upFirst(trip.transport) } : null,
      trip.cost?.per_day_eur ? { label: 'A day for one person, estimated', value: `€${n0(trip.cost.per_day_eur)}`, num: true } : null,
      season.length ? { label: 'Season', value: season.length === 1 ? season[0] : `${season[0]} to ${season[season.length - 1]}` } : null,
      trip.pace ? { label: 'Pace', value: upFirst(trip.pace) } : null,
    ].filter(Boolean),
    sections: [
      { h2: 'Where you stay', links: cities.filter((c) => c.d).map((c) => ({ name: c.d.name, path: paths.dest(c.d.slug), meta: `${c.n} ${c.n === 1 ? 'night' : 'nights'}`, metaNum: true })) },
      trip.sights?.length ? { h2: 'What you see', paras: [sentence(joinNames(trip.sights.map(clean)))] } : null,
      { h2: `More trips in ${countryName(cc)}`, links: ctx.topTrips(cc, trip.id, 6).map((x) => ({ name: joinNames((x.cities || []).map((c) => clean(c.city))), path: paths.trip(x.id), meta: `${x.days} days`, metaNum: true })) },
    ],
    coverage: 'Costs on this page are estimates: beds from the catalogue’s stay prices and the ground transport between the stops, with no flights.',
    credits: ['Composed by Carta from its own destination catalogue'],
    crumbs: [home, countryCrumb(cc), sectionCrumb(cc, 'trips')],
    boot: null,
    subject: {
      '@type': 'TouristTrip', name: h1,
      itinerary: { '@type': 'ItemList', itemListElement: cities.map((c, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'TouristDestination', name: clean(c.d?.name || c.city), ...(c.d ? { url: `https://www.carta-europetravel.com${paths.dest(c.d.slug)}` } : {}) } })) },
    },
    lastmod: ctx.generatedAt('trips', cc),
  };
}

export function journeyPage(j, ctx) {
  const name = clean(j.title);
  const cc = j.countryCode;
  const months = (j.bestPeriod?.months || []).map(monthOf).filter(Boolean);
  const perDay = j.budget?.perDayEur;
  const days = (j.itinerary || []).map((d) => `Day ${d.day}: ${sentence(d.title)}`);
  const others = ctx.journeysOfType(j.tripTypeSlug, j.id, 6);
  return {
    kind: 'journey',
    path: paths.journey(j.id),
    title: fitTitle(name, `${j.durationDays} days`, null),
    description: fitDescription([j.hook, j.summary]),
    h1: name,
    lead: [j.hook, j.summary].filter(Boolean).map(sentence),
    facts: [
      { label: 'Length', value: `${j.durationDays} days`, num: true },
      j.tripType ? { label: 'Kind of trip', value: clean(j.tripType) } : null,
      months.length ? { label: 'Best months', value: months.join(', ') } : null,
      perDay?.low ? { label: 'A day for one person', value: perDay.high && perDay.high !== perDay.low ? `€${n0(perDay.low)} to €${n0(perDay.high)}` : `€${n0(perDay.low)}`, num: true } : null,
      j.profile?.difficultyLabel ? { label: 'Effort', value: clean(j.profile.difficultyLabel) } : null,
    ].filter(Boolean),
    sections: [
      days.length ? { h2: 'Day by day', paras: days } : null,
      cc && paths.country(cc) ? { h2: `More in ${countryName(cc)}`, links: [
        { name: countryName(cc), path: paths.country(cc) },
        ...(ctx.hasSection(cc, 'trails') ? [{ name: `Walks in ${countryName(cc)}`, path: paths.section(cc, 'trails') }] : []),
        ...(ctx.hasSection(cc, 'trips') ? [{ name: `Trips in ${countryName(cc)}`, path: paths.section(cc, 'trips') }] : []),
      ] } : null,
      others.length ? { h2: `More ${clean(j.tripType || 'journeys').toLowerCase()}`, links: others.map((o) => ({ name: clean(o.title), path: paths.journey(o.id), meta: `${o.durationDays} days`, metaNum: true })) } : null,
    ],
    coverage: j.dataVintage ? `The prices and opening details on this page were last checked in ${j.dataVintage}.` : null,
    credits: ['Written and checked by Carta'],
    crumbs: cc && paths.country(cc) ? [home, countryCrumb(cc)] : [home],
    subject: {
      '@type': 'TouristTrip', name, ...(j.tripType ? { touristType: clean(j.tripType) } : {}),
      itinerary: { '@type': 'ItemList', itemListElement: (j.itinerary || []).map((d, i) => ({ '@type': 'ListItem', position: i + 1, name: clean(d.title) })) },
    },
    lastmod: j.generated_at || null,
  };
}

// --------------------------------------------------- regions, sections, country

export function regionPage(reg, ctx) {
  const r = reg.region;
  const cc = r.country;
  const name = clean(r.name);
  const rated = (reg.rated || []).map((x) => ({ x, path: ctx.layerPath(x) })).filter((o) => o.path);
  const byLayer = {};
  for (const o of rated) (byLayer[o.x.layer] ||= []).push(o);
  const LABEL = { trail: 'Walks', beach: 'Beaches', lake: 'Lakes', mountain: 'Mountains', cycling: 'Cycling routes' };
  const sections = Object.entries(byLayer).map(([layer, list]) => ({
    h2: `${LABEL[layer] || upFirst(layer)} in ${name}`,
    links: linkRows(list.map((o) => ({ name: clean(o.x.name || o.x.ref), path: o.path, meta: isNum(o.x.rating ?? o.x.score) ? d1(o.x.rating ?? o.x.score) : '', metaNum: true })), 24),
  }));
  const neighbours = (reg.neighbours || []).filter((n) => ctx.isRegion(n.id))
    .map((n) => ({ name: clean(n.name), path: paths.region(ctx.regionCountry(n.id), n.id, n.name) }));
  if (neighbours.length) sections.push({ h2: 'Regions next door', links: neighbours });
  const listed = (reg.listed || []).length;
  const counts = Object.entries(byLayer).map(([l, list]) => `${list.length} ${(LABEL[l] || l).toLowerCase()}`);
  const lead = sentence(`${name} is a region of ${countryName(cc)}${counts.length ? ` where Carta rates ${joinNames(counts)}` : ''}`);
  return {
    kind: 'region',
    path: paths.region(cc, r.id, name),
    title: fitTitle(name, `${n0(rated.length)} places rated`, countryName(cc)),
    description: fitDescription([lead, listed ? `${n0(listed)} more are listed with fewer measured facts.` : '']),
    h1: name,
    lead: [lead],
    facts: [],
    sections,
    coverage: listed ? `Carta also lists ${n0(listed)} more places in ${name} that do not have enough measured facts to be rated yet.` : null,
    credits: ['Region boundaries from Eurostat NUTS 2021', 'places from OpenStreetMap, Wikidata and the European Environment Agency'],
    crumbs: [home, countryCrumb(cc), sectionCrumb(cc, 'regions')],
    subject: {
      '@type': 'AdministrativeArea', name, containedInPlace: { '@type': 'Country', name: countryName(cc) },
      containsPlace: rated.slice(0, 24).map((o) => ({ '@type': 'Place', name: clean(o.x.name || o.x.ref), url: `https://www.carta-europetravel.com${o.path}` })),
    },
    lastmod: reg.generated_at || null,
  };
}

export const PAGE_SIZE = 100;

/** A country section list, page `page` of its rows (already sorted, already links). */
export function sectionPage(cc, section, rows, page, ctx) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const where = countryName(cc);
  const label = SECTION_LABEL[section];
  const h1 = `${upFirst(plural(rows.length, SECTION_ONE[section], MANY[SECTION_ONE[section]]))} in ${where}${page > 1 ? `, page ${page}` : ''}`;
  const lead = sentence(section === 'regions' ? `The NUTS 2 regions of ${where}, each with the places Carta rates in it` : `Every ${SECTION_ONE[section]} Carta rates in ${where}, best rated first`);
  const pager = pages > 1 ? Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p !== page)
    .map((p) => ({ name: `Page ${p}`, path: paths.section(cc, section, p) })) : null;
  return {
    kind: 'section',
    path: paths.section(cc, section, page),
    title: fitTitle(`${label} in ${where}`, `${n0(rows.length)} rated`, page > 1 ? `page ${page}` : null),
    description: fitDescription([lead, ctx.coverage(section, cc), `Every figure on Carta says where it came from.`]),
    h1,
    lead: [lead],
    facts: [],
    sections: [{ h2: page > 1 ? `${label}, ${(page - 1) * PAGE_SIZE + 1} to ${(page - 1) * PAGE_SIZE + slice.length}` : `The ${label.toLowerCase()}`, links: slice }],
    pager,
    coverage: ctx.coverage(section, cc),
    credits: [],
    crumbs: [home, countryCrumb(cc)],
    subject: {
      '@type': 'ItemList', name: h1, numberOfItems: rows.length,
      itemListElement: slice.map((l, i) => ({ '@type': 'ListItem', position: (page - 1) * PAGE_SIZE + i + 1, url: `https://www.carta-europetravel.com${l.path}`, name: clean(l.name) })),
    },
    lastmod: ctx.generatedAt(section === 'regions' ? 'trails' : section, cc),
  };
}

export function countryPage(cc, ctx) {
  const where = countryName(cc);
  const dests = ctx.destsOf(cc);
  const priced = dests.filter((d) => d.dayEur != null);
  const days = priced.map((d) => d.dayEur).sort((a, b) => a - b);
  const median = days.length ? days[Math.floor(days.length / 2)] : null;
  const measured = priced.filter((d) => d.measured).length;
  const sections = ctx.sectionsOf(cc);
  const lead = sentence(`What a day costs in ${plural(priced.length, 'place')} in ${where}${median != null ? `, with a middle figure of €${n0(median)} for one person's bed and food` : ''}`);
  const honest = priced.length
    ? `${n0(measured)} of the ${n0(priced.length)} day costs are measured from stays in the town; the rest borrow national or nearby figures and are marked as estimates.`
    : `Carta has no priced places in ${where} yet.`;
  return {
    kind: 'country',
    path: paths.country(cc),
    title: fitTitle(`${where} on a budget`, `${n0(priced.length)} places priced`, null),
    description: fitDescription([lead, honest]),
    h1: where,
    lead: [lead, honest],
    facts: [
      { label: 'Places priced', value: n0(priced.length), num: true },
      median != null ? { label: 'Middle day cost, one person', value: `€${n0(median)}`, num: true } : null,
      ...sections.map((s) => ({ label: SECTION_LABEL[s.section], value: n0(s.n), num: true })),
    ].filter(Boolean),
    sections: [
      dests.length ? {
        h2: `Places to go in ${where}`,
        links: linkRows([...dests].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((d) => ({ name: d.name, path: paths.dest(d.slug), meta: d.dayEur != null ? `€${n0(d.dayEur)} a day` : '', metaNum: true })), 36),
      } : null,
      // T224: the trip-length pages hang off the country, so a crawler at the
      // country finds them and a reader can go from a day cost to a plan.
      ctx.daysOf(cc).length ? {
        h2: `Where to go in ${where} for ${joinNames(DAY_LENGTHS.filter((n) => ctx.daysOf(cc).some((e) => e.days === n)).map(String))} days`,
        links: ctx.daysOf(cc).map((e) => ({
          name: e.band ? `${e.days} days under €${e.band} a day` : `${e.days} days, every priced place`,
          path: e.path, meta: `${n0(e.places)} places`, metaNum: true,
        })),
      } : null,
      sections.length ? { h2: `Everything in ${where}`, links: sections.map((s) => ({ name: `${SECTION_LABEL[s.section]} in ${where}`, path: paths.section(cc, s.section), meta: n0(s.n), metaNum: true })) } : null,
      ctx.regionsOf(cc).length ? { h2: 'Regions', links: ctx.regionsOf(cc).map((r) => ({ name: r.name, path: paths.region(cc, r.id, r.name) })) } : null,
      ctx.journeysOf(cc).length ? { h2: `Planned journeys in ${where}`, links: ctx.journeysOf(cc).map((j) => ({ name: clean(j.title), path: paths.journey(j.id), meta: `${j.durationDays} days`, metaNum: true })) } : null,
    ],
    coverage: sections.map((s) => ctx.coverage(s.section, cc)).filter(Boolean).slice(0, 3).join(' ') || null,
    credits: ['Stay prices from Inside Airbnb and the catalogue', 'food from national price data', 'places from OpenStreetMap and Wikidata'],
    crumbs: [home],
    subject: {
      '@type': 'Country', name: where,
      containsPlace: ctx.regionsOf(cc).map((r) => ({ '@type': 'AdministrativeArea', name: r.name, url: `https://www.carta-europetravel.com${paths.region(cc, r.id, r.name)}` })),
    },
    lastmod: ctx.generatedAt('trails', cc),
  };
}
