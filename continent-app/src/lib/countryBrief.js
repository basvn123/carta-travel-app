/**
 * countryBrief.js, one country answered in the four things a person asks
 * before they put it on a shortlist: what is there, what would I do, what does
 * a day cost, and when should I go.
 *
 * This is what replaced the flight price on the country cards. A fare from one
 * airport on one day was never a fact about a country: it moved every time the
 * dates moved, it said nothing about Portugal that it did not also say about
 * the calendar, and it pushed the two figures that ARE about the country (a
 * bed, a day of eating) off the card entirely. Transport is booked elsewhere
 * now, so the card can carry what the catalogue actually measured.
 *
 * Every number here is measured or borrowed, never invented, and every one
 * says which it is:
 *
 *   stay   the median nightly rate per person across the country's priced
 *          destinations, from lib/costIndex.js, which already gates the broken
 *          harvests (the exact zeros that once made Geneva the cheapest place
 *          in Europe).
 *   food   the median of the same budget day of eating out: a cheap sit-down
 *          meal, a fast-food meal, two drinks and a coffee.
 *   day    those two added, which is what "a day here costs" means when the
 *          travel is booked separately.
 *   guide  the daily range from data/country_insights.json, hand-written per
 *          country. It is a second opinion, printed next to ours rather than
 *          averaged into it, because two sources that disagree are information
 *          and their average is not.
 *
 * What to visit prefers the hand-written must-see list (it carries a reason,
 * "book Colosseum slots weeks ahead", which no aggregate can produce) and
 * falls back to the best-rated places in the catalogue. Either way the
 * photograph and the rating come from the catalogue, so a name on this list is
 * always a place the rest of the app can open.
 */
import { stayPerNight, foodPerDay, bandFor } from './costIndex.js';
import { placeLine, isTemplateBlurb } from './placeStory.js';
import { omioSlug } from './omio.js';

/** Middle value of a sorted-in-place copy, or null for an empty set. */
function median(values) {
  if (!values.length) return null;
  const a = values.slice().sort((x, y) => x - y);
  return a[a.length >> 1];
}

/**
 * What there is to DO in a country, as groups of catalogued places rather than
 * adjectives. Each group counts the destinations carrying any of its tags, so
 * "31 beach towns" is a number the traveller can go and click on.
 */
export const THEME_GROUPS = [
  { key: 'beach', tags: ['beach', 'coast', 'surf', 'diving'], labelKey: 'brief.themeBeach', layer: 'beaches', quizTypes: ['beach', 'islands', 'water'] },
  { key: 'mountains', tags: ['mountains', 'alps', 'skiing'], labelKey: 'brief.themeMountains', layer: 'mountains', quizTypes: ['hiking', 'ski', 'trailrun'] },
  { key: 'hiking', tags: ['hiking', 'national-park', 'wilderness'], labelKey: 'brief.themeHiking', layer: 'trails', quizTypes: ['hiking', 'trailrun'] },
  { key: 'nature', tags: ['nature', 'lake', 'countryside'], labelKey: 'brief.themeNature', layer: 'lakes', quizTypes: ['lakes', 'cycling', 'roadtrip'] },
  { key: 'heritage', tags: ['unesco', 'medieval', 'roman', 'castle', 'fortress'], labelKey: 'brief.themeHeritage', quizTypes: ['culture'] },
  { key: 'art', tags: ['art'], labelKey: 'brief.themeArt', quizTypes: ['culture', 'city'] },
  { key: 'food', tags: ['food', 'wine'], labelKey: 'brief.themeFood', quizTypes: ['food'] },
  { key: 'islands', tags: ['island'], labelKey: 'brief.themeIslands', quizTypes: ['islands', 'beach'] },
  { key: 'spa', tags: ['spa', 'thermal'], labelKey: 'brief.themeSpa', quizTypes: ['wellness'] },
  { key: 'nightlife', tags: ['nightlife', 'music'], labelKey: 'brief.themeNightlife', quizTypes: ['nightlife', 'festivals'] },
];

/** How many catalogue rows a theme group keeps for its rail. Four is what the
 *  sub-rail shows; a fifth would only be fetched to be thrown away. */
const GROUP_ROWS = 4;

const NON_PHOTO = /coat[_-]of[_-]arms|wappen|blason|escudo|flag|[_-]map[._]|position[_-]of|locator|karte|seal|emblem|logo|\.svg/i;

/** Comparable form of a place name, for joining a hand-written must-see to the
 *  catalogue. The app's one city-slug rule with the hyphens taken out, so "Val
 *  d'Orcia" and "Val dOrcia" meet, and so the letters NFD cannot fold (an
 *  l-stroke, an o-slash) are folded here too rather than deleted. */
function nameKey(s) {
  return (omioSlug(s) || '').replace(/-/g, '');
}

/** What a traveller calls the place: the catalogue's label without the
 *  terminal it qualifies an airport city with ("Rome (Fiumicino)" -> "Rome"). */
function bareCity(city) {
  return String(city || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** Best row per bare city name, order preserved. Two Romes are one Rome on
 *  any list a person reads as places rather than as airports. */
function dedupeByCity(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const k = nameKey(bareCity(row.d.city));
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

/** One line on why a place is worth the trip: its own blurb when the blurb
 *  says something, the sights it is actually made of when it does not.
 *  Deliberately NOT lib/knownFor.js, which reaches into a component for its
 *  swim check and so cannot be run outside a browser build; this file stays
 *  node-runnable so its numbers can be checked without one. */
function whyLine(d) {
  const blurb = (d?.blurb || '').trim();
  if (blurb && !isTemplateBlurb(blurb)) return blurb;
  return placeLine(d) || blurb || null;
}

/**
 * Build the brief for every country in the catalogue.
 *
 * One pass over the destinations, so this is a `useMemo(..., [data])` job and
 * never a per-render one.
 *
 * @param destinations  data.destinations
 * @param insights      the { [countryName]: record } map from useCountryInsights
 * @returns Map(countryName -> brief)
 */
export function buildCountryBriefs(destinations, insights = null) {
  const byCountry = new Map();
  for (const [id, d] of Object.entries(destinations || {})) {
    if (!d?.country) continue;
    if (!byCountry.has(d.country)) byCountry.set(d.country, []);
    byCountry.get(d.country).push({ id, d });
  }

  const out = new Map();
  for (const [country, rows] of byCountry) {
    const rec = insights?.[country] || null;
    const stays = [];
    const foods = [];
    const themeHits = new Map();
    // The destinations behind each group, best first. "31 beach towns" was a
    // number nobody could click; four named towns with photographs is the same
    // fact with somewhere to go, so the count and the rows are both kept.
    const themeRows = new Map();
    for (const { id, d } of rows) {
      const s = stayPerNight(d);
      if (s != null) stays.push(s);
      const f = foodPerDay(d);
      if (f != null) foods.push(f);
      const cats = new Set(d.categories || []);
      for (const g of THEME_GROUPS) {
        if (g.tags.some((tag) => cats.has(tag))) {
          themeHits.set(g.key, (themeHits.get(g.key) || 0) + 1);
          if (!themeRows.has(g.key)) themeRows.set(g.key, []);
          themeRows.get(g.key).push({ id, d });
        }
      }
    }
    const stayEur = median(stays);
    const foodEur = median(foods);
    const dayEur = stayEur != null && foodEur != null ? stayEur + foodEur : null;

    // Best-rated places, photograph first: this is both the fallback list of
    // what to visit and where a must-see borrows its picture from.
    const ranked = rows
      .filter(({ d }) => d.image?.url && !NON_PHOTO.test(d.image.url))
      .sort((a, b) => (b.d.rating?.score || 0) - (a.d.rating?.score || 0)
        || (b.d.rating?.fame || 0) - (a.d.rating?.fame || 0));
    const byName = new Map();
    for (const row of rows) {
      const k = nameKey(row.d.city);
      if (k && !byName.has(k)) byName.set(k, row);
    }

    /**
     * The catalogue row behind a hand-written must-see, or null.
     *
     * The exact key first, because that is the only join that cannot be
     * wrong. Where it misses, the two names are usually the same place
     * described at different lengths: the guide writes "Theth & the Blue Eye
     * of Theth" and "Valbona-Theth hike", the catalogue holds "Theth &
     * Albanian Alps" and "Valbona Valley". So the fallback asks whether
     * either name STARTS with the other, on a key long enough that the
     * prefix means something. Four characters, because three would marry
     * "Bar" in Montenegro to "Barcelona".
     *
     * A prefix, not a containment: "Apollonia" inside "Fier (Apollonia)" is
     * the same place, but "Bar" inside "Bardolino" is not, and only anchoring
     * at the start tells them apart.
     *
     * The prefix has to end on a WORD boundary, which is why this runs on the
     * hyphenated slug rather than on nameKey's squashed form. Without it
     * "bernina-express-line" starts with "bern" and the Bernina railway
     * becomes the city of Bern.
     */
    const MIN_PREFIX = 4;
    /** Does the longer slug continue the shorter one at a word break? */
    const prefixAt = (a, b) => a === b || a.startsWith(`${b}-`);
    const matchMustSee = (name) => {
      const k = nameKey(name);
      if (!k) return null;
      const exact = byName.get(k);
      if (exact) return exact;
      const slug = omioSlug(name) || '';
      if (slug.replace(/-/g, '').length < MIN_PREFIX) return null;
      let best = null;
      for (const [, row] of byName) {
        const cslug = omioSlug(row.d.city) || '';
        if (cslug.replace(/-/g, '').length < MIN_PREFIX) continue;
        if (!prefixAt(cslug, slug) && !prefixAt(slug, cslug)) continue;
        // The longest shared start wins, so "Theth" does not take the row
        // that "Theth Something Else" answers better.
        const overlap = Math.min(cslug.length, slug.length);
        if (!best || overlap > best.overlap) best = { row, overlap };
      }
      return best?.row || null;
    };

    let visit;
    if (rec?.must_see?.length) {
      visit = rec.must_see.slice(0, 8).map((m) => {
        const hit = matchMustSee(m.name);
        return {
          id: hit?.id || null,
          name: m.name,
          region: m.region || null,
          why: m.why || (hit ? whyLine(hit.d) : null),
          img: hit && !NON_PHOTO.test(hit.d.image?.url || '') ? hit.d.image?.url || null : null,
          rating: hit?.d.rating?.score ?? null,
          // The whole rating object as well as its score: the photo rail draws
          // a ScoreChip, which needs the tier and the hidden-gem mark too.
          ratingObj: hit?.d.rating || null,
          iso2: hit?.d.iso2 || null,
          lat: hit?.d.lat ?? null,
          lon: hit?.d.lon ?? null,
          source: 'guide',
        };
      });
    } else {
      // The catalogue labels an airport city by its terminal ("Rome
      // (Fiumicino)", "Rome (Ciampino)"), which on a list of places to visit
      // reads as two Romes. The bare name is what a traveller calls it, and
      // the first one carries the best rating, so the rest are dropped.
      const seenCity = new Set();
      visit = [];
      for (const { id, d } of ranked) {
        const bare = bareCity(d.city);
        const key = nameKey(bare);
        if (!bare || seenCity.has(key)) continue;
        seenCity.add(key);
        visit.push({
          id,
          name: bare,
          region: null,
          why: whyLine(d),
          img: d.image?.url || null,
          rating: d.rating?.score ?? null,
          ratingObj: d.rating || null,
          iso2: d.iso2 || null,
          lat: d.lat ?? null,
          lon: d.lon ?? null,
          source: 'catalogue',
        });
        if (visit.length >= 8) break;
      }
    }

    const themes = THEME_GROUPS
      .map((g) => ({
        key: g.key,
        labelKey: g.labelKey,
        n: themeHits.get(g.key) || 0,
        layer: g.layer || null,
        quizTypes: g.quizTypes || [],
        // Rated first, then a photograph, so a rail never opens on four grey
        // rectangles when the country has pictured places further down.
        //
        // De-duplicated by the BARE name, the same rule the visit list uses:
        // the catalogue labels an airport city by its terminal, so "Rome
        // (Fiumicino)" and "Rome (Ciampino)" would otherwise fill half the
        // heritage rail with the same city and the same photograph twice.
        rows: dedupeByCity((themeRows.get(g.key) || [])
          .sort((a, b) => (b.d.rating?.score || 0) - (a.d.rating?.score || 0)
            || (b.d.rating?.fame || 0) - (a.d.rating?.fame || 0)))
          .slice(0, GROUP_ROWS * 3)
          .filter(({ d }) => !NON_PHOTO.test(d.image?.url || ''))
          .slice(0, GROUP_ROWS)
          .map(({ id, d }) => ({
            id,
            name: bareCity(d.city),
            img: d.image?.url || null,
            lat: d.lat ?? null,
            lon: d.lon ?? null,
            rating: d.rating || null,
          })),
      }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);

    out.set(country, {
      country,
      iso2: rows[0]?.d.iso2 || rec?.iso2 || null,
      nPlaces: rows.length,
      cover: ranked[0]?.d.image?.url || null,
      stayEur,
      foodEur,
      dayEur,
      stayBand: bandFor('stay', stayEur),
      foodBand: bandFor('food', foodEur),
      dayBand: bandFor('day', dayEur),
      priced: stays.length,
      guideRange: Array.isArray(rec?.daily_budget_eur) ? rec.daily_budget_eur : null,
      budgetLevel: rec?.budget_level || null,
      currency: rec?.currency || null,
      languages: rec?.languages || [],
      bestMonths: Array.isArray(rec?.best_months) ? rec.best_months : [],
      bestTimeNote: rec?.best_time_note || null,
      visit,
      themes,
      eat: rec?.food || [],
      // The whole list, not a sample. A brief that is opened on purpose is
      // read, and two of eleven tips was the shape of a card, not of a guide.
      events: rec?.events || [],
      tips: rec?.insights || [],
      rail: rec?.rail || null,
      bus: rec?.bus || null,
      driving: rec?.driving || null,
      hasGuide: Boolean(rec),
    });
  }
  return out;
}

/** Whole euros: the only precision a country median earns. */
export const briefEur = (v) => (v == null ? null : Math.round(v));
