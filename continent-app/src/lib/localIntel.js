/**
 * localIntel.js - hand-curated "where it's actually nicest" guides for
 * destinations whose geography a POI list alone can't explain. A rating tells
 * you Bellagio is good; it doesn't tell you the whole lake clusters around
 * the mid-lake "Golden Triangle" and that the ferry IS the sight.
 *
 * Keyed by lowercase city name (same convention as scenicWalks.js). Each area
 * row carries a `match` string that the Day planner resolves against the
 * city's own POI catalogue, so a row becomes one-tap addable when the place
 * exists there - and stays honest, plain intel when it doesn't.
 *
 * Shape:
 *   { intro, areas: [{ name, tag, note, match? }], tip }
 */

const LOCAL_INTEL = {
  'lake como': {
    intro: 'The best of the lake clusters mid-lake, where the "Golden Triangle" of Bellagio, Varenna and Menaggio face each other across the water: the grandest villas, the finest views, and ferries linking all three every half hour.',
    areas: [
      {
        name: 'Bellagio',
        tag: 'Pearl of the Lake',
        note: 'On the hill where the lake forks: steep stone stairways, elegant shops and the lakeside gardens of Villa Melzi.',
        match: 'Bellagio',
      },
      {
        name: 'Varenna',
        tag: 'The romantic one',
        note: 'Colourful houses on the quieter eastern shore, the Lovers\' Walk along the waterfront, and direct trains to Milan.',
        match: 'Varenna',
      },
      {
        name: 'Villa Carlotta',
        tag: 'Tremezzo',
        note: 'Art and botanical gardens on the sunny western shore, in the middle of the lake\'s grand-hotel stretch.',
        match: 'Villa Carlotta',
      },
      {
        name: 'Villa del Balbianello',
        tag: 'Lenno',
        note: 'The lake\'s most filmed villa (Star Wars, James Bond), on a wooded headland reached by boat or a short walk from Lenno.',
        match: 'Balbianello',
      },
      {
        name: 'Menaggio',
        tag: 'Best west-shore base',
        note: 'A relaxed lakefront square and the triangle\'s western ferry corner, handy for the whole mid-lake.',
        match: 'Menaggio',
      },
      {
        name: 'Cernobbio',
        tag: 'Discreet luxury',
        note: 'Villa d\'Este and old money at the lake\'s southern tip, an easy hop from Como city.',
        match: 'Cernobbio',
      },
    ],
    tip: 'Skip the slow shore roads where you can: the mid-lake ferries between Bellagio, Varenna and Menaggio run every ~30 minutes, and the crossing itself is the best view on the lake.',
  },
};

/** The curated local guide for a city, or null. Case-insensitive. */
export function localIntelFor(city) {
  return LOCAL_INTEL[(city || '').trim().toLowerCase()] || null;
}
