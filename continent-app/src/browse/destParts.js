import React from 'react';
import { MONTHS_SHORT } from './ClimateStrip.jsx';
import { fetchDestPois } from '../lib/appData.js';
import { eur } from '../lib/format.js';

/**
 * Plain helpers of the destination page, moved out of DestinationPage.jsx
 * when T499 split the page into one module per tab (extract, not rewrite).
 * Every rule and comment is the one the page carried (T429, T446).
 */

export const baseCity = (name) => (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

/** The arrive month (1 to 12) of the dates the page prices: the traveller's
 *  own once they set them, Carta's default pair until then. */
export function monthOf(iso) {
  const m = /^\d{4}-(\d{2})/.exec(iso || '');
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 12 ? n : null;
}

export const CROWD_KEY = ['crowd.quiet', 'crowd.moderate', 'crowd.busy', 'crowd.crowded'];

/** A catalogue name that is a number with the place in brackets, as
 *  OpenStreetMap sometimes records a waterfall or a spring ("7 (The Blue
 *  Eye)"), shows the place (T446). Every other name is kept as it is. */
export const cleanName = (name) => {
  const raw = String(name || '');
  const m = /^\s*\d+\s*\((.+)\)\s*$/.exec(raw);
  if (m) return m[1];
  // A route's stage code is bookkeeping, not a name: "CNP - 01 - Roma -
  // Castel Gandolfo" reads "Roma, Castel Gandolfo", "Romea Strata in
  // Italia - Tappa RSIT47" reads "Romea Strata in Italia" (T446).
  const parts = raw.split(/\s+-\s+/);
  const named = parts.length > 1
    ? parts.filter((p) => !/^(?:[A-Z]{2,5}|\d{1,3})$/.test(p.trim())
      && !/^(?:tappa|stage|etappe|etapa|tronçon)\s+\S+$/i.test(p.trim()))
    : parts;
  const joined = (named.length ? named : parts).join(', ');
  // Words set in capitals by the source ("DORSALE", "STAZIONE") are set in
  // the name's own case.
  return joined.replace(/\b([A-ZÀ-ÖØ-Ý]{4,})\b/g, (w) => w[0] + w.slice(1).toLowerCase());
};

export const fmtKm = (km) => (km < 0.95 ? `${Math.round((km * 1000) / 10) * 10} m` : `${Math.round(km)} km`);

/** Highlight photographs ship at 960px; the tiles want 500. Same file, one
 *  path segment, and Commons serves both. */
export const thumb500 = (url) => (url ? url.replace(/\/960px-/, '/500px-') : url);

/** Commons files that are a mark rather than a view: an SVG rendering is
 *  almost always a crest, a logo or a map, never a photograph. */
export const NOT_A_VIEW = /\.svg\.png|logo|coat[_%20-]*of[_%20-]*arms|crest|emblem|wappen|escudo|stemma|blason/i;

/** Case, accents and a trailing "(...)" removed, so "Sagrada Família" and
 *  "Sagrada Familia (Basilica)" fold together. NFKD leaves some letters
 *  whole, so the handful that matter are folded by hand. */
const FOLD_PAIRS = [['ø', 'o'], ['æ', 'ae'], ['ł', 'l'], ['ð', 'd'], ['þ', 'th'], ['ß', 'ss']];
export function foldName(s) {
  let out = String(s || '').toLowerCase().replace(/\s*\([^)]*\)\s*$/, '');
  for (const [from, to] of FOLD_PAIRS) out = out.split(from).join(to);
  return out.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** (text) => the photograph whose folded name the text contains, longest
 *  name first, or null. */
export function photoMatcher(rows) {
  const named = rows
    .filter((p) => p.img && p.name && foldName(p.name).length >= 3)
    .map((p) => ({ key: foldName(p.name), img: p.img }))
    .sort((a, b) => b.key.length - a.key.length);
  return (text) => {
    const hay = ` ${foldName(text)} `;
    return named.find((p) => hay.includes(` ${p.key} `))?.img || null;
  };
}

/** One tip sentence from its rule code + args, through t() so all six
 *  languages carry it. Month arguments arrive as 1-12 and leave as names. */
export function tipText(tip, t) {
  const args = { ...(tip.args || {}) };
  if (args.from_m) args.from = MONTHS_SHORT[args.from_m - 1];
  if (args.to_m) args.to = MONTHS_SHORT[args.to_m - 1];
  if (args.month) args.month = MONTHS_SHORT[args.month - 1];
  if (args.rental_eur != null) args.rental_eur = eur(args.rental_eur);
  return t(`tip.${tip.code}`, args);
}

export const DO_TYPE_KEYS = {
  trail: 'dest.doType.trail', activity: 'dest.doType.activity',
  festival: 'dest.doType.festival', swim: 'dest.doType.swim',
  experience: 'dest.doType.experience',
};

/** The places a dossier says are an area rather than a town: Around comes
 *  before Things to do there (owner answer T491-d; hikers first). */
export const isArea = (d) => d?.place?.class === 'area';

/**
 * A photograph for each "thing to do" (P4.4).
 *
 * The `do` items are editorial phrases, not place names: "Colosseum, Forum
 * and Palatine Hill circuit", "Eat through Trastevere on an evening food
 * crawl". The POI shard for the same destination holds real places with
 * photographs. So the join is containment, not equality: a POI matches an
 * item when its folded name appears in the item's folded text, and the
 * LONGEST such name wins, so "Sistine Chapel" beats "Chapel" for the
 * Vatican line.
 *
 * Only names of three characters or more, and only whole words, so "Rome"
 * inside "Romantic" cannot claim a photograph it has nothing to do with.
 *
 * Crests and logos are dropped. A museum's coat of arms is a picture of its
 * BRANDING, not of the place, and the page's claim is that the photograph
 * shows what you would see, so the type glyph is the more honest fallback.
 */
export function useDoPhotos(destId) {
  const [pois, setPois] = React.useState(null);
  React.useEffect(() => {
    if (!destId) { setPois(null); return undefined; }
    let live = true;
    fetchDestPois(destId).then((items) => { if (live) setPois(items); });
    return () => { live = false; };
  }, [destId]);

  return React.useMemo(() => photoMatcher(
    (pois || []).filter((p) => p?.img && !NOT_A_VIEW.test(p.img)).map((p) => ({ name: p.name, img: p.img })),
  ), [pois]);
}
