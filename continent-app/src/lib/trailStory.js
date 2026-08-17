/**
 * trailStory.js, the trail explained to a walker rather than to a database.
 *
 * The lab's description_md is composed from the same numbers the page already
 * prints, in the voice of the script that wrote it: "It covers a distance of
 * 8.1 km with 527 m of ascent and 368 m of descent", country as a bare ISO2
 * code, the DIN rule named out loud. Read next to the facts strip it says
 * nothing twice.
 *
 * So this file does not clean that prose up, it replaces it. Every line the
 * walker reads is composed from the structured fields through t(), which means
 * it lands in all six UI languages and never leaks a country code. The three
 * things the prose knows that the fields do not are pulled back out of it:
 *   the waymark reference   "signposted as CBE"       -> follow the CBE signs
 *   what it goes past       "passes X within 800 m"   -> passes close to X
 *   the official source     "published by turrutebasen"
 *
 * If the lab ever ships a genuinely written description (describe.py's
 * reviewed prose), looksTemplated() sees that it is not boilerplate and the
 * page renders it as prose instead of throwing it away.
 */

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

    const ref = (md.match(REF_RE) || [])[1];
    if (ref) add('signs', 'compass', t('trails.sSigns', { ref: ref.trim() }));

    // Nothing here about the nearest town: "Getting to the start" says it
    // beside the start coordinates, measured from the trailhead rather than
    // from the middle of the route.
  }

  const passes = passesNearby(md);
  if (passes.length) add('passes', 'pin', t('trails.sPasses', { list: passes.join(', ') }));

  const source = (md.match(PUBLISHED_RE) || [])[1];
  if (source) add('official', 'check', t('trails.sOfficial', { source: source.trim() }));

  // A reviewed description is worth reading in full; boilerplate is not, and
  // everything it knew is already in the lines above.
  const prose = templated ? null : String(md)
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#+\s*/gm, '').replace(/\*\*?/g, '').trim())
    .filter(Boolean);

  return { points, prose };
}
