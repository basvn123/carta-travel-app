/**
 * placeStory.js, the one line a card gets to say what a place is.
 *
 * The same job trailStory / beachStory / lakeStory / mountainStory do for
 * their layers: compose the copy the wire cannot.
 *
 * The problem it solves is the most visible content failure on the Explore
 * page. Only 260 destinations carry a hand-written line. The other 2,778 fall
 * back to `dest.blurb`, and the pipeline wrote those from category counts, so
 * the catalogue ships sentences like
 *
 *     "A place with more to see than its size suggests, known for its
 *      landmark and historical building and church cathedral"
 *
 * on 235 cards at once, with near-identical variants on roughly 900 more. It
 * is grammatically odd, it is the same on Dundee and on Faenza, and it tells a
 * reader nothing they could act on. Worse, the grid row never carried `blurb`
 * at all, so most cards were showing the even barer category fallback ("A
 * coastal escape").
 *
 * What the wire DOES carry, for all 3,038 destinations, is `activities.items`:
 * up to eight named sights in significance order. Those names are specific and
 * true, and strung together they read like the hand-written lines the best 260
 * destinations already have:
 *
 *     Dundee   was  "known for its church cathedral and park"
 *              now  "Tay Bridge, RRS Discovery and St Andrew's Cathedral"
 *     Brecon   was  "known for its landmark and historical building and museum"
 *              now  "Brecon Beacons National Park, Pen y Fan and Brecon Cathedral"
 *
 * Two kinds of noise have to come out first. The harvest's "Square" kind is a
 * catch-all that swallowed 479 historical EVENTS ("Battle of Mons Lactarius",
 * "Getaa railroad disaster"), which are not things to go and see. And a sight
 * named after the destination itself ("Amalfi Coast" on the Amalfi Coast card)
 * spends one of the three slots saying the name again.
 */

// Historical events that the POI harvest filed as places. A battle is not a
// sight, and "Brecon, known for the Battle of Brecon" is worse than silence.
const EVENT_RE = /^(battle|siege|treaty|massacre|sack|capture|raid|assault|bombing)\s+of\b|disaster\b|\bmassacre\b|\bmutiny\b|\brevolt\b|\buprising\b/i;

// Kinds that name something a traveller can stand in front of, in the order a
// card should prefer them. "Square" is last because the harvest uses it as a
// catch-all rather than as a description.
const KIND_RANK = {
  Cathedral: 0, Castle: 0, Palace: 0, Monastery: 0, Museum: 1, Theatre: 1,
  Tower: 1, Bridge: 1, Church: 2, Synagogue: 2, Mosque: 2, Peak: 1,
  Canyon: 1, Glacier: 1, 'Nature reserve': 2, 'Theme park': 1,
  'Sauna & baths': 1, 'Water park': 2, Village: 2,
};
const KIND_LAST = 4;

/**
 * Names that describe a building TYPE rather than name a building. The
 * harvest returns plenty of them, in every language the catalogue covers, and
 * a card that says "Cathedral, Chapel and Synagogue" has spent three slots
 * saying nothing. Matched whole, case- and accent-insensitively, with an
 * optional leading article.
 */
const GENERIC_NAMES = new Set([
  // English
  'cathedral', 'church', 'chapel', 'castle', 'museum', 'tower', 'palace',
  'monastery', 'abbey', 'bridge', 'square', 'park', 'fountain', 'old town',
  'city hall', 'town hall', 'clock tower', 'synagogue', 'mosque', 'city walls',
  'main square', 'market square', 'university chapel', 'railway station',
  'archaeological museum', 'olympic stadium', 'rose garden',
  // German
  'dom', 'rathaus', 'altes rathaus', 'neues rathaus', 'bahnhof', 'schloss',
  'altes schloss', 'kirche', 'synagoge', 'burg', 'hauptbahnhof',
  // Dutch
  'stadhuis', 'grote kerk', 'hervormde kerk', 'kerk', 'belfort',
  // Italian
  'duomo', 'chiesa madre', 'municipio', 'palazzo comunale', 'castello',
  // French
  'mairie', 'hotel de ville', 'eglise', 'cathedrale', 'chateau',
  // Spanish and Portuguese
  'ayuntamiento', 'catedral', 'iglesia', 'castillo', 'se',
  // Polish and Czech
  'ratusz', 'zamek', 'rynek', 'radnice',
  // Nordic
  'radhus', 'domkyrka', 'radhuset',
]);

// Shorter than this and the "name" is an abbreviation or a harvest artefact
// ("Tux" arrived on Essen's card that way).
const MIN_NAME_LEN = 4;

const strip = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\s*\([^)]*\)\s*$/, '')
  .trim();

/**
 * The named sights worth putting on a card, best first, noise removed.
 * Reads dest.activities.items, which every destination in the catalogue has.
 */
export function placeSights(dest, limit = 3) {
  const items = dest?.activities?.items;
  if (!Array.isArray(items) || items.length === 0) return [];
  const self = strip(dest.city);
  const country = strip(dest.country);
  const seen = new Set();
  const kept = [];

  items.forEach((it, i) => {
    const name = String(it?.name || '').trim();
    if (!name || name.length > 46 || name.length < MIN_NAME_LEN) return;
    if (EVENT_RE.test(name)) return;
    const key = strip(name);
    if (!key || seen.has(key)) return;
    if (GENERIC_NAMES.has(key.replace(/^(the|le|la|il|el|de|het)\s+/, ''))) return;
    // A sight named after the place itself, or after the country, spends a
    // slot repeating what the card already says above it.
    if (key === self || key === country) return;
    seen.add(key);
    kept.push({ name, rank: KIND_RANK[it.kind] ?? KIND_LAST, order: i });
  });

  kept.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return kept.slice(0, limit).map((k) => k.name);
}

/**
 * True for the pipeline blurbs that are category counts wearing a sentence.
 * These are the ones worth replacing; a blurb that says something specific
 * ("Positano, Amalfi, Ravello: cliffside villages") is left alone.
 */
export function isTemplateBlurb(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  if (/^a place with more to see than its size suggests/i.test(s)) return true;
  // "known for its X and Y and Z": the harvest's category list, not prose.
  if (/known for its .+\band\b.+\band\b/i.test(s)) return true;
  if (/\b(landmark and historical building|church cathedral)\b/i.test(s)) return true;
  return false;
}

/**
 * The composed line, or null when there is not enough to say something
 * specific. Two sights is the floor: one name on its own reads as a stub, and
 * the caller has a category line that is at least a complete sentence.
 */
export function placeLine(dest) {
  const sights = placeSights(dest, 3);
  if (sights.length < 2) return null;
  if (sights.length === 2) return `${sights[0]} and ${sights[1]}`;
  return `${sights[0]}, ${sights[1]} and ${sights[2]}`;
}
