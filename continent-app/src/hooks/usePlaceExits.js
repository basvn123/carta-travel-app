import React, { useEffect, useState } from 'react';
import { firstOkImage, okPhoto } from '../lib/photoVeto.js';
import { useI18n } from '../i18n/index.jsx';
import { catalogue } from '../lib/appData.js';
import { priceDay, requestKey, DEFAULT_PRICE_REQUEST } from '../lib/price/index.js';
import { useFirstRun } from '../lib/firstRunContext.js';
import { placeExits } from '../lib/detailSkeleton.js';
import { formatMoney } from '../lib/money.js';

/**
 * The data behind slot 9 of the detail-page skeleton (T180): three computed
 * ways out. The rule itself is lib/detailSkeleton.js placeExits; this file
 * loads what it needs. Kept out of browse/DetailSkeleton.jsx so that file
 * exports components only.
 */

/**
 * Euros a night at each base town, for the "cheaper" exit. The base ids are
 * catalogue ids (beach.base.id, lake.base.id, mountain.near.dest_id), so the
 * shared catalogue loads their shards. T664 (F2): the bed line of the
 * engine's day price for the app's one request (lib/price/), so the exit
 * compares towns at the stay, party and dates the traveller chose, as the
 * cards and the receipt price them. Returns an object id -> euros a person
 * a night, empty until the shards land.
 */
export function useBaseStays(ids) {
  const key = (ids || []).filter(Boolean).sort().join('|');
  const request = useFirstRun()?.priceRequest || DEFAULT_PRICE_REQUEST;
  const reqKey = requestKey(request);
  const [stays, setStays] = useState({});
  useEffect(() => {
    let live = true;
    const want = key ? key.split('|') : [];
    if (!want.length) { setStays({}); return undefined; }
    catalogue.ensureIds(want).then(() => {
      if (!live) return;
      const dests = catalogue.snapshot()?.destinations || {};
      const out = {};
      for (const id of want) {
        const v = dests[id] ? priceDay(dests[id], request, dests)?.stayEur : null;
        if (Number.isFinite(v)) out[id] = v;
      }
      setStays(out);
    }).catch(() => {});
    return () => { live = false; };
    // The request is read through its key, which carries every field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reqKey]);
  return stays;
}

/** The kind label of an exit, in the five pages' shared words. */
export function exitKindLabel(kind, t) {
  if (kind === 'easier') return t('journey.exitEasier');
  if (kind === 'cheaper') return t('detail.exitCheaper');
  return t('detail.exitNearby');
}

/** How many of the closest siblings the exits look at; their base towns are
 *  the only ones whose shards are fetched for the "cheaper" exit. */
const EXIT_POOL = 40;

/**
 * The three ways out for one page (lib/detailSkeleton.js placeExits), with
 * everything a page would otherwise repeat: loading the country list, the
 * closest siblings, their base towns' stays.
 *
 *   me       the page's own row
 *   cc       its country, the list the exits come from
 *   load     cc -> Promise of rows (loadBeaches and friends, all cached)
 *   centre   row -> { lat, lon }
 *   level    row -> 0..5
 *   baseOf   row -> catalogue id of the town you would sleep in, or null
 *   open     row -> opens that page
 *   meta     (exit) -> extra words after the distance, optional
 */
export function usePlaceExits({ me, cc, load, centre, level, baseOf = () => null, open, meta = null }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    if (!cc || !load) return undefined;
    Promise.resolve(load(cc)).then((r) => { if (live) setRows(Array.isArray(r) ? r : []); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [cc, load]);

  const here = me ? centre(me) : null;
  const pool = React.useMemo(() => {
    if (!rows || !here) return [];
    return rows
      .map((r) => ({ r, c: centre(r) }))
      .filter((x) => x.c && x.r !== me)
      .map((x) => ({ r: x.r, d: (x.c.lat - here.lat) ** 2 + ((x.c.lon - here.lon) * Math.cos((here.lat * Math.PI) / 180)) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, EXIT_POOL)
      .map((x) => x.r);
    // centre is a module-level function on every page; `here` is a fresh
    // object each render, so its two numbers are the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, me, here?.lat, here?.lon]);

  const stays = useBaseStays(me ? [baseOf(me), ...pool.map(baseOf)] : []);
  return React.useMemo(() => {
    if (!me || !pool.length) return [];
    const stay = (r) => {
      const id = baseOf(r);
      return id && Number.isFinite(stays[id]) ? stays[id] : null;
    };
    const fmt = (km) => (km < 1 ? '<1' : Math.round(km).toLocaleString(lang));
    return placeExits(me, pool, { centre, level, stay }).map((e) => ({
      key: `${e.kind}-${e.row.id}`,
      kindLabel: exitKindLabel(e.kind, t),
      title: e.row.name || '',
      meta: [
        e.kind === 'cheaper' && Number.isFinite(stay(e.row))
          ? t('detail.exitStay', { km: fmt(e.km), eur: formatMoney(stay(e.row)) })
          : t('detail.exitKm', { km: fmt(e.km) }),
        meta ? meta(e.row) : null,
      ].filter(Boolean).join(', '),
      mono: false,
      onOpen: () => open?.(e.row),
      // T430: the alternatives are photo cards now ("Not quite right?").
      row: e.row,
      kind: e.kind,
      photoUrl: firstOkImage(e.row.images)?.u || okPhoto(e.row.img?.u) || okPhoto(e.row.photo) || null,
      rating: e.row.score != null ? { score: e.row.score, tier: e.row.tier ?? 0 } : null,
      iso2: e.row.cc || null,
    }));
    // baseOf, centre, level, meta and open are stable per page type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, pool, stays, t, lang]);
}

