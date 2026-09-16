import { useEffect, useMemo, useState } from 'react';
import { groupFavs } from '../lib/favorites.js';
import { loadBeaches } from '../lib/beaches.js';
import { loadLakes } from '../lib/lakes.js';
import { loadMountains } from '../lib/mountains.js';
import { loadTrails } from '../lib/trails.js';
import { loadCycling } from '../lib/cycling.js';
import { loadTrip } from '../lib/trips.js';

/**
 * useFavoriteItems, the shortlist with its names and photographs back on.
 *
 * A stored favourite is only `kind:cc/id` (see lib/favorites.js). That is
 * enough to know WHAT was kept, and nothing at all to show for it: the
 * Favorites tab needs a name, a photograph and a country per row, and those
 * live in the published layer files.
 *
 * So this resolves. Destinations come free, out of the catalogue the app
 * already holds. Everything else is fetched from its own layer loader, which
 * is the same cached, override-applying door the browse tab uses - so a
 * shortlist row shows exactly the name the page it opens will show, and a
 * shortlisted country already opened elsewhere costs no second request.
 *
 * Requests are grouped BY COUNTRY, not per favourite: five Austrian trails
 * are one read of trails/AT.json, not five. Trips are the exception, one file
 * per trip by id, because that is how that layer publishes.
 *
 * A row that cannot be resolved (the layer dropped it on a re-export, or the
 * file is missing) is not hidden. It comes back with `missing: true` and the
 * tab says so, because a wish that quietly vanished is worse than a wish the
 * app admits it can no longer find.
 */

/**
 * One loader per country-scoped kind, each normalised to answer an ARRAY of
 * rows. Four of the five already do; loadCycling answers a whole country
 * object, so its routes and its listed rows are flattened here rather than
 * making every caller below know the difference.
 */
const COUNTRY_LOADERS = {
  trail: loadTrails,
  beach: loadBeaches,
  lake: loadLakes,
  mountain: loadMountains,
  cycle: (cc) => loadCycling(cc).then((d) => (d ? [...(d.routes || []), ...(d.listed || [])] : null)),
};

/**
 * Commons thumbnails in the cycling layer arrive with tracking query params
 * appended (`?utm_source=commons.wikimedia.org&...`). They are harmless in an
 * <img>, but they defeat thumbAt/srcSetFor, which rewrite the size segment of
 * the path and would leave the params dangling. Strip the query, keep the URL.
 */
function cleanImg(url) {
  if (!url || typeof url !== 'string') return null;
  const cut = url.indexOf('?');
  return cut < 0 ? url : url.slice(0, cut);
}

/** The fields each layer happens to use, normalised to one row shape. */
function normalise(kind, row, id, cc) {
  if (!row) return null;
  const images = row.images || row.img || null;
  const first = Array.isArray(images) ? images[0] : images;
  const img = cleanImg(
    (first && (first.u || first.url || first.thumb)) || (typeof first === 'string' ? first : null),
  );
  return {
    kind,
    id: String(id),
    cc: cc || row.cc || row.country || '',
    name: row.name || row.title || '',
    // Coordinates ride along so a shortlisted place can be matched into a
    // day (see DayPlannerTab's shortlistDeck). A trail has a bbox rather
    // than a point, so its centre stands in.
    lat: row.lat ?? (row.bbox ? (row.bbox[1] + row.bbox[3]) / 2 : null),
    lon: row.lon ?? (row.bbox ? (row.bbox[0] + row.bbox[2]) / 2 : null),
    // Trails carry `category`, the water layers carry `region`; either is a
    // better second line than repeating the country the flag already shows.
    sub: row.region || row.category || row.ref || '',
    score: row.score ?? row.rating?.score ?? null,
    img,
    missing: false,
  };
}

export function useFavoriteItems(favorites, destinations) {
  const groups = useMemo(() => groupFavs(favorites), [favorites]);

  // Resolved rows, keyed by the favourite key so a re-resolve never has to
  // rebuild the ones already in hand.
  const [resolved, setResolved] = useState(() => new Map());
  const [loading, setLoading] = useState(false);

  // What still needs fetching, as a stable string so the effect below does
  // not re-run on every unrelated render of the panel.
  const wanted = useMemo(() => {
    const out = [];
    for (const { kind, items } of groups) {
      if (kind === 'dest') continue;
      for (const it of items) out.push(it);
    }
    return out;
  }, [groups]);
  const wantedSig = useMemo(() => wanted.map((w) => w.key).sort().join('|'), [wanted]);

  useEffect(() => {
    const todo = wanted.filter((w) => !resolved.has(w.key));
    if (!todo.length) {
      // Nothing left to fetch. Clear the flag rather than returning early:
      // a resolve that was still in flight when the shortlist changed has
      // had its cleanup run, so its own `finally` is skipped, and without
      // this `loading` would stay true for the rest of the session.
      setLoading(false);
      return undefined;
    }
    let live = true;
    setLoading(true);

    // Group the country-scoped kinds so one file answers many favourites.
    const byFile = new Map(); // `${kind}:${cc}` -> [item]
    const trips = [];
    for (const it of todo) {
      if (it.kind === 'trip') { trips.push(it); continue; }
      const k = `${it.kind}:${it.cc}`;
      if (!byFile.has(k)) byFile.set(k, []);
      byFile.get(k).push(it);
    }

    const jobs = [];
    for (const [k, items] of byFile) {
      const [kind, cc] = k.split(':');
      const load = COUNTRY_LOADERS[kind];
      if (!load) continue;
      jobs.push(load(cc).then((rows) => {
        const index = new Map((rows || []).map((r) => [String(r.id), r]));
        return items.map((it) => [
          it.key,
          normalise(kind, index.get(String(it.id)), it.id, cc)
            || { kind, id: it.id, cc, name: '', sub: '', img: null, missing: true },
        ]);
      }).catch(() => items.map((it) => [
        it.key, { kind, id: it.id, cc: it.cc, name: '', sub: '', img: null, missing: true },
      ])));
    }
    for (const it of trips) {
      jobs.push(loadTrip(it.id).then((row) => [[
        it.key,
        normalise('trip', row, it.id, '')
          || { kind: 'trip', id: it.id, cc: '', name: '', sub: '', img: null, missing: true },
      ]]).catch(() => [[
        it.key, { kind: 'trip', id: it.id, cc: '', name: '', sub: '', img: null, missing: true },
      ]]));
    }

    Promise.all(jobs).then((batches) => {
      if (!live) return;
      setResolved((prev) => {
        const next = new Map(prev);
        for (const batch of batches) for (const [key, row] of batch) next.set(key, row);
        return next;
      });
    }).finally(() => { if (live) setLoading(false); });

    return () => { live = false; };
    // `resolved` is deliberately not a dependency: it is what this effect
    // writes, and depending on it would re-run the effect on its own result.
  }, [wantedSig]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The shortlist ready to draw: [{kind, rows}], groups in FAV_KINDS order. */
  const sections = useMemo(() => groups.map(({ kind, items }) => ({
    kind,
    rows: items.map((it) => {
      if (kind === 'dest') {
        const d = destinations?.[it.id];
        return d
          ? {
            kind, id: it.id, key: it.key, cc: d.iso2 || '',
            name: d.city || it.id, sub: d.country || '',
            score: d.rating?.score ?? null, img: d.image?.url || null, missing: false,
          }
          : { kind, id: it.id, key: it.key, cc: '', name: '', sub: '', img: null, missing: true };
      }
      const row = resolved.get(it.key);
      return row
        ? { ...row, key: it.key }
        : { kind, id: it.id, key: it.key, cc: it.cc, name: '', sub: '', img: null, pending: true, missing: false };
    }),
  })), [groups, resolved, destinations]);

  const count = useMemo(
    () => sections.reduce((n, s) => n + s.rows.length, 0),
    [sections],
  );

  return { sections, count, loading };
}


/**
 * Just the map points of the shortlist, for the planners.
 *
 * The Favorites tab wants names and photographs; a planner only needs to
 * know WHERE the wishes are, so it can offer the ones within reach. Each
 * caller keeps its own resolution state, but the LAYER LOADERS underneath
 * are cached per file, so a second caller costs a second pass over rows
 * already in memory rather than a second download.
 *
 * Destinations and trips are left out on purpose: a shortlisted city is
 * somewhere you go, not something you drop into a day spent somewhere else.
 */
export function useShortlistPoints(favorites) {
  const { sections } = useFavoriteItems(favorites, null);
  return useMemo(() => {
    const out = [];
    for (const { kind, rows } of sections) {
      if (kind === 'dest' || kind === 'trip') continue;
      for (const r of rows) {
        if (r.missing || r.pending) continue;
        if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
        out.push({ kind, id: r.id, name: r.name, lat: r.lat, lon: r.lon });
      }
    }
    return out;
  }, [sections]);
}
