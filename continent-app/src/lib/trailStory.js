/**
 * trailStory.js, the trail explained to a walker rather than to a database.
 *
 * The lab's description_md was composed from the same numbers the page already
 * prints, in the voice of the script that wrote it: "It covers a distance of
 * 8.1 km with 527 m of ascent and 368 m of descent", country as a bare ISO2
 * code, the DIN rule named out loud. Read next to the facts strip it said
 * nothing twice.
 *
 * So this file does not clean that prose up, it replaces it. Every line the
 * walker reads is composed from the structured fields through t(), which means
 * it lands in all six UI languages and never leaks a country code.
 *
 * The three things the prose knew that the fields did not are now FIELDS:
 *
 *   waymark_ref   "signposted as CBE"        -> follow the CBE signs
 *   passes        "passes X within 800 m"    -> passes close to X
 *   publisher     "published by turrutebasen"
 *
 * pipeline/trails/attributes.py promotes all three out of the same evidence
 * describe.py read (the OSM ref tag, popularity.py's anchors, the portal
 * cross-check), and describe.py itself is retired: it ran monthly, spent
 * free-tier quota and fed a surface that had stopped reading it. The regex
 * scrapers below are the FALLBACK for the descriptions still sitting in the
 * lab from before the fields existed, and they can go the day the last one
 * does.
 *
 * If the lab ever ships a genuinely written description, looksTemplated()
 * sees that it is not boilerplate and the page renders it as prose instead of
 * throwing it away.
 */

/**
 * Reason codes to sentences: why this particular walk is worth the day.
 *
 * pipeline/trails/rate.py writes codes and numbers, never prose, and the
 * sentence is built here through t(). That is what puts the explanation in all
 * six UI languages, and it is also what keeps it honest: every line below is a
 * restatement of something measured, so a claim like "three named summits, the
 * highest at 2,410 m" can be checked against the map rather than admired.
 *
 * The codes come from open data only. There is no review text anywhere in this
 * layer, because there is no review text anybody is allowed to give us.
 *
 * Ordered by rate.py strongest first, and the caller takes the first few: the
 * point is an argument for the walk, not an inventory of it.
 */
const REASON_ICON = {
  summits: 'mountain',
  summit: 'mountain',
  high: 'mountain',
  bigClimb: 'mountain',
  steady: 'mountain',
  glacier: 'mountain',
  gorge: 'mountain',
  cave: 'mountain',
  viewpoints: 'eye',
  waterfall: 'water',
  lakes: 'water',
  coast: 'coast',
  castle: 'castle',
  ruins: 'castle',
  monastery: 'castle',
  lighthouse: 'pin',
  huts: 'hut',
  water: 'spring',
  loop: 'loop',
  dayOut: 'clock',
  trek: 'clock',
  waymarked: 'compass',
  known: 'star',
  photogenic: 'camera',
  dense: 'eye',
  varied: 'eye',
  roadWalk: 'route',
  unrated_coverage: 'pin',
};

/** A number the sentence can name, or nothing. Keeps "the highest at
 *  undefined m" out of the UI when a peak carries no ele tag. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function reasonText(r, t) {
  // The trails wire spells a reason `code`; the other three layers spell it
  // `k`. A listed row's single reason arrives in the shared shape, so both
  // are read here rather than making the region layer special-case trails.
  const code = r.code || r.k;
  const name = (r.name || '').trim();
  const n = num(r.n);
  const ele = num(r.ele);
  switch (code) {
    // The listed tier's one honest line, shared with the other three
    // layers: a route the region floor kept so its page is not empty.
    case 'unrated_coverage':
      return t('region.listedNote');
    case 'summits':
      return ele && name
        ? t('trails.whySummits', { n, name, m: ele })
        : t('trails.whySummitsPlain', { n });
    case 'summit':
      if (!name) return null;
      return ele ? t('trails.whySummit', { name, m: ele })
        : t('trails.whySummitPlain', { name });
    case 'viewpoints':
      return t(n > 1 ? 'trails.whyViewpoints' : 'trails.whyViewpoint', { n });
    case 'waterfall':
      return name ? t('trails.whyWaterfall', { name })
        : t('trails.whyWaterfallPlain', { n });
    case 'glacier':
      return name ? t('trails.whyGlacier', { name }) : null;
    case 'gorge':
      return name ? t('trails.whyGorge', { name }) : null;
    case 'lakes':
      return name && n === 1 ? t('trails.whyLake', { name })
        : t('trails.whyLakes', { n });
    case 'coast':
      return t('trails.whyCoast');
    case 'castle':
      return name ? t('trails.whyCastle', { name }) : null;
    case 'ruins':
      return name ? t('trails.whyRuins', { name }) : null;
    case 'monastery':
      return name ? t('trails.whyMonastery', { name }) : null;
    case 'lighthouse':
      return name ? t('trails.whyLighthouse', { name }) : null;
    case 'cave':
      return name ? t('trails.whyCave', { name }) : null;
    case 'bigClimb':
      return t('trails.whyBigClimb', { m: num(r.m) });
    case 'steady':
      return t('trails.whySteady', { m: num(r.perKm) });
    case 'high':
      return t('trails.whyHigh', { m: num(r.m) });
    case 'huts':
      return t(n > 1 ? 'trails.whyHuts' : 'trails.whyHut', { n });
    case 'water':
      return t('trails.whyWater', { n });
    case 'loop':
      return t('trails.whyLoop');
    case 'dayOut':
      return t('trails.whyDayOut', { km: r.km });
    case 'trek':
      return t('trails.whyTrek', { km: r.km });
    case 'waymarked':
      return t(r.level === 'iwn' ? 'trails.whyWaymarkedIwn' : 'trails.whyWaymarkedNwn');
    case 'known':
      return t('trails.whyKnown');
    case 'photogenic':
      return t('trails.whyPhotogenic', { n });
    // v2 of the rating (pipeline/trails/rate.py). Variety is the claim the
    // density term cannot make: three different things beat nine of one.
    case 'varied':
      return t('trails.whyVaried', { n });
    // And the one line here that is a warning rather than an argument. It is
    // in this list on purpose: the most common complaint about a route drawn
    // from OpenStreetMap is a "hike" that turns out to be a third tarmac, and
    // somebody deserves to read that before they drive there, not after.
    case 'roadWalk':
      return t('trails.roadShare', { pct: num(r.pct) });
    case 'dense':
      return t('trails.whyDense', { n });
    default:
      return null;
  }
}

/**
 * The "why this one" lines for a trail, from the wire's reason codes.
 *
 * reasons comes from the detail file when it has arrived and from the card
 * otherwise, so the section is populated on the first frame and simply grows.
 */
export function trailReasons(reasons, t, limit = 6) {
  const out = [];
  const seen = new Set();
  for (const r of Array.isArray(reasons) ? reasons : []) {
    if (out.length >= limit) break;
    const text = reasonText(r, t);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ key: `${r.code}:${out.length}`, icon: REASON_ICON[r.code] || 'check', text });
  }
  return out;
}

const TEMPLATE_MARKS = [
  /DIN 33466/i,
  /hiking time rule/i,
  /waymarked hiking (?:route|network)/i,
  /derived from|based on the distance and ascent|from the distance and ascent/i,
  /sightseeing stops|one day city sightseeing walk/i,
  /covers a distance of|spanning [\d.]+ km|covering [\d.]+ km/i,
];

/** True when the description is the pipeline's composed boilerplate. */
export function looksTemplated(md) {
  const text = String(md || '');
  if (!text) return true;
  return TEMPLATE_MARKS.some((re) => re.test(text));
}

const REF_RE = /\bsign(?:post)?ed as ([^.,;]+?)(?=[.,;]|\s+and\b|$)/i;
const OF_RE = /within\s+[\d.,]+\s*(?:m|km)\s+of\s+([^.]+)/i;
const NEAR_RE = /([^,.;]+?)\s+within\s+[\d.,]+\s*(?:m|km)/gi;
const PUBLISHED_RE = /published by ([^.,;]+?)(?=[.,;]|\s+as\b|$)/i;

const cleanPlace = (raw) => String(raw || '')
  .replace(/^.*?\b(?:passes|passing|past)\s+/i, '')
  .replace(/^(?:and|it|the route|the trail|the path|this route|this path)\s+/i, '')
  .replace(/^the\s+/i, '')
  .replace(/\s+/g, ' ')
  .trim();

/** The place names the route goes past, from either shape the pipeline writes:
 *  "within 400 m of A, B, and C" or "A within 800 m, B within 1000 m". */
function passesNearby(md) {
  const text = String(md || '');
  const out = [];
  const push = (name) => {
    const n = cleanPlace(name);
    if (!n || n.length > 48 || /^\d+$/.test(n)) return;
    if (out.some((x) => x.toLowerCase() === n.toLowerCase() || x.toLowerCase().includes(n.toLowerCase()))) return;
    out.push(n);
  };
  const ofMatch = text.match(OF_RE);
  if (ofMatch) {
    for (const part of ofMatch[1].split(/,\s*(?:and\s+)?|\s+and\s+/)) push(part);
  }
  for (const m of text.matchAll(NEAR_RE)) push(m[1]);
  return out.slice(0, 4);
}

const km1 = (m) => (m / 1000).toFixed(1).replace(/\.0$/, '');
const hours1 = (min) => {
  const h = min / 60;
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1).replace(/\.0$/, '');
};

const WAYMARK_KEY = {
  iwn: 'trails.sWayIwn',
  nwn: 'trails.sWayNwn',
  rwn: 'trails.sWayRwn',
  lwn: 'trails.sWayLwn',
  lcn: 'trails.sWayLwn',
};

const SAC_KEY = {
  strolling: 'trails.sSacStrolling',
  hiking: 'trails.sSacHiking',
  mountain_hiking: 'trails.sSacMountain',
  demanding_mountain_hiking: 'trails.sSacMountain',
};

const DIFF_KEY = {
  easy: 'trails.sEasy',
  moderate: 'trails.sModerate',
  hard: 'trails.sHard',
};

/**
 * The "what to expect" lines, in reading order.
 *
 * tr      the card record from the country wire
 * detail  the full record, once it has arrived (null before that)
 * opts    { t, loop, nearby: { city, km } | null }
 * returns { points: [{ key, icon, text }], prose: [string] | null }
 */
export function trailStory(tr, detail = null, { t, loop = null, nearby = null } = {}) {
  const src = detail || tr;
  const md = detail?.description_md || tr.summary || '';
  const templated = looksTemplated(md);
  const points = [];
  const add = (key, icon, text) => { if (text) points.push({ key, icon, text }); };

  if (tr.category === 'citytrip') {
    if (tr.n_stops) add('stops', 'list', t('trails.sCityStops', { n: tr.n_stops }));
    if (src.distance_m) add('walk', 'route', t('trails.sCityWalk', { km: km1(src.distance_m) }));
    if (src.duration_min) add('hours', 'clock', t('trails.sCityHours', { h: hours1(src.duration_min) }));
    if (nearby?.city) add('anchor', 'pin', t('trails.sCityAnchor', { city: nearby.city }));
  } else {
    if (loop === true) add('shape', 'route', t('trails.sLoop'));
    else if (loop === false) add('shape', 'route', t('trails.sOneWay'));

    const diffKey = DIFF_KEY[src.difficulty];
    if (diffKey) add('difficulty', 'boot', t(diffKey));

    const mins = src.duration_min || 0;
    if (mins > 720) add('length', 'clock', t('trails.sMultiDay'));
    else if (mins > 360) add('length', 'clock', t('trails.sFullDay'));

    const top = detail?.elevation?.ele_max_m;
    const grade = detail?.elevation?.max_grade_pct;
    if (top != null) {
      add('climb', 'mountain', grade != null && grade >= 15
        ? t('trails.sClimbTop', { top: Math.round(top), grade: Math.round(grade) })
        : t('trails.sClimbTopPlain', { top: Math.round(top) }));
    }

    const sacKey = SAC_KEY[src.sac_scale];
    if (sacKey) add('terrain', 'boot', t(sacKey));

    const wayKey = WAYMARK_KEY[src.network];
    if (wayKey) add('waymark', 'compass', t(wayKey));

    // The field first, the scrape only when there is no field. Same for the
    // two below: a route attributes.py has reached never has its prose read.
    const ref = src.waymark_ref || (md.match(REF_RE) || [])[1];
    if (ref) add('signs', 'compass', t('trails.sSigns', { ref: String(ref).trim() }));

    // Where the mapped route had short breaks in it, say so. The line the
    // app draws and the GPX carries is continuous, but a few metres of it
    // were joined in a straight line rather than mapped
    // (pipeline/trails/splice.py), and a walker following it on the ground
    // should know which claim is which.
    const bridges = detail?.bridges;
    if (bridges?.n) {
      add('bridges', 'route', t(bridges.n > 1 ? 'trails.sBridges' : 'trails.sBridge', {
        n: bridges.n,
        m: Math.round(bridges.total_m ?? 0),
      }));
    }

    // Nothing here about the nearest town: "Getting to the start" says it
    // beside the start coordinates, measured from the trailhead rather than
    // from the middle of the route.
  }

  const passes = Array.isArray(src.passes) && src.passes.length
    ? src.passes.map((p) => p.name).filter(Boolean).slice(0, 4)
    : passesNearby(md);
  if (passes.length) add('passes', 'pin', t('trails.sPasses', { list: passes.join(', ') }));

  const source = src.publisher || (md.match(PUBLISHED_RE) || [])[1];
  if (source) add('official', 'check', t('trails.sOfficial', { source: String(source).trim() }));

  // A reviewed description is worth reading in full; boilerplate is not, and
  // everything it knew is already in the lines above.
  const prose = templated ? null : String(md)
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#+\s*/gm, '').replace(/\*\*?/g, '').trim())
    .filter(Boolean);

  return { points, prose };
}
