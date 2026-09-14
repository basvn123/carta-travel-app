/**
 * heroImage.js, the one place that knows how to ask Wikimedia for a photo at
 * the size the layout actually needs, and which photos a card is not allowed
 * to show.
 *
 * Two problems this solves.
 *
 * SIZE. The wire ships every hero at Wikimedia's 960px rendering. A grid card
 * is ~300 css px and a phone card is ~170, so the grid was downloading three
 * to five times the bytes it drew, on the slowest connections, for 48 cards at
 * once. The fix is a srcset, and the catch is that Wikimedia no longer renders
 * an arbitrary width: it answers 400 for anything off a fixed list. Probed
 * against upload.wikimedia.org, the list that answers 200 is
 *
 *     250  330  500  960  1280  1920
 *
 * and 320 / 400 / 640 / 800 / 1024 / 1200 / 1600 all fail. Hand-writing any
 * other number silently breaks the image, which is why nothing outside this
 * file is allowed to build a thumb URL.
 *
 * DUPLICATES. Twelve Commons files are the hero of 29 destinations. Most of
 * that is not an error: London's skyline fronts Heathrow, Gatwick, Luton and
 * Stansted, the Eiffel Tower fronts all three Paris gateways, and those really
 * are one city with several airport records, which the grid already merges
 * into one card.
 *
 * What IS an error is the same photograph standing for two DIFFERENT places.
 * The shipped file does that twice: the Roman Baths at Bath front the Belgian
 * town of Spa (a name match, not a photograph of Spa), and one Devil's Bridge
 * borrows the other's picture across Bulgaria and Wales. There the repeat is a
 * lie about what a place looks like, and the placeholder is the better answer
 * because it at least says which place it is.
 *
 * "The same place" is decided twice over, and a photograph is only taken away
 * when both tests agree. The first is the key the grid's own gateway merge
 * uses, base city plus country. The second is distance, because the catalogue
 * carries the same town under two spellings often enough to matter: Rhodes and
 * Rodos are one harbour and share one photograph correctly, and no name
 * comparison was ever going to work that out.
 */

import { haversineKm } from './nearby.js';

// The only widths upload.wikimedia.org renders. Do not add to this list
// without probing: an unlisted width returns 400, not a resized image.
const WIKI_WIDTHS = [250, 330, 500, 960, 1280, 1920];

const THUMB_RE = /\/(\d+)px-/;

/** True for a Wikimedia thumb URL this file can re-size. */
export function isResizable(url) {
  return typeof url === 'string' && url.includes('/thumb/') && THUMB_RE.test(url);
}

/** The same photo at one of the widths Wikimedia will actually render. */
export function thumbAt(url, width) {
  if (!isResizable(url)) return url;
  return url.replace(THUMB_RE, `/${width}px-`);
}

/**
 * A srcset over the renderable widths that bracket what the layout needs.
 * `max` caps the ladder so a 300px card never offers the browser a 1920.
 */
export function srcSetFor(url, max = 960) {
  if (!isResizable(url)) return undefined;
  const widths = WIKI_WIDTHS.filter((w) => w <= max);
  if (widths.length < 2) return undefined;
  return widths.map((w) => `${thumbAt(url, w)} ${w}w`).join(', ');
}

/** The src a browser without srcset support should get. */
export const fallbackSrc = (url, width = 500) => thumbAt(url, width);

/**
 * Which destinations must NOT render their wire photo, because another
 * destination has a better claim to it. Returns a Set of dest ids.
 *
 * "Better claim" is fame (average daily Wikipedia pageviews, already on
 * dest.rating). It is the right tiebreak here for a blunt reason: when one
 * photo has to stand for one of several places, it should stand for the one
 * a reader is most likely to recognise it as.
 */
const placeKey = (d) => `${String(d?.city || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()}|${d?.iso2 || ''}`;

// Two records this close together are one place under two names, whatever
// they are called. Comfortably wider than any city's spread of airports.
const SAME_PLACE_KM = 30;

export function duplicateHeroes(destinations) {
  const byUrl = new Map();
  for (const [id, d] of Object.entries(destinations || {})) {
    const url = d?.image?.url;
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(id);
  }
  const drop = new Set();
  for (const [, ids] of byUrl) {
    if (ids.length < 2) continue;
    // Several airport records for one city are allowed to share a photograph,
    // because they share a city. Only a second PLACE loses the picture.
    const keys = new Set(ids.map((id) => placeKey(destinations[id])));
    if (keys.size < 2) continue;
    // Fame decides who keeps it: when one photograph has to stand for one of
    // several places, it should stand for the one a reader will recognise it
    // as. (The Roman Baths belong to Bath, not to Spa.)
    let best = ids[0];
    for (const id of ids) {
      if ((destinations[id]?.rating?.fame ?? 0) > (destinations[best]?.rating?.fame ?? 0)) best = id;
    }
    const bestKey = placeKey(destinations[best]);
    const bd = destinations[best];
    for (const id of ids) {
      const d = destinations[id];
      if (placeKey(d) === bestKey) continue;
      if (haversineKm(d.city_lat ?? d.lat, d.city_lon ?? d.lon,
        bd.city_lat ?? bd.lat, bd.city_lon ?? bd.lon) < SAME_PLACE_KM) continue;
      drop.add(id);
    }
  }
  return drop;
}

/** The two letters the placeholder shows when there is no usable photo. */
export function initials(city) {
  const words = String(city || '').replace(/\s*\([^)]*\)\s*$/, '').trim().split(/[\s'-]+/);
  if (!words[0]) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
