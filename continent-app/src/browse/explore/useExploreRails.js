import React from 'react';
import { resolveWhen } from '../../lib/when.js';
import { bandAtLeast, byRating } from '../../lib/rating.js';
import { interleaveByCountry } from '../ExploreRails.jsx';
import { vibeOf } from '../../lib/guidedData.js';
import { noCarOk, quietOk, underOk } from '../../lib/guidedSearch.js';
import { formatMoney } from '../../lib/money.js';
import { SCENIC_HERO } from './exploreConsts.js';
import { isResizable } from '../../lib/heroImage.js';
import { commonsPageUrl } from '../../lib/imageCredit.js';
import { spreadLeads } from './railLeads.js';
import { castleOnly } from '../filters/filterModel.js';

export function useExploreRails({
  allRows, applyShortcut, favorites, guided, lang, patchXf, railMonth, railsIdle, rows,
  setShowFavOnly, setSortKey, t, xf,
}) {
  // G12, D10 (lane 1, explore-top-2 profile): a re-price gives every row a
  // new object, and re-sorting the twenty rails from scratch cost about
  // 0.8 s at 4x CPU. Which places a rail holds, and in what order, does not
  // depend on a price (only the cost rail does), so those lists are kept by
  // place id while the rows hold the same places in the same order, the
  // guided data and the month are unchanged, and are mapped back onto the
  // current rows, so each card still shows its current figure.
  //
  // Round 5: when the places change but the month and guided data do not
  // (the full catalogue landing, a filter), a list not yet worked out for
  // the new places shows its previous order, mapped onto the new rows (so
  // every place shown is one the rows still hold), and the new list is
  // worked out after the render, one list per task, then swapped in. The
  // guided data's first arrival adds its rails the same way. The very first
  // lists and a month change are worked out at once: a rail never names a
  // month its places were not chosen for.
  const railLists = React.useRef({ ids: null, guided: null, month: null, lists: new Map(), stale: null, pending: new Map() });
  const [railsTick, setRailsTick] = React.useState(0);
  const { rails, waiting } = React.useMemo(() => {
    if (!railsIdle) return { rails: [], waiting: false };
    // The month the rails speak about: one set by hand, else the month of
    // the traveller's dates, else this month (T427).
    const month = xf.month || railMonth;
    const monthName = new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2026, month - 1, 15));
    const inSeason = (p) => (p.climate?.best || []).includes(month);
    // T649: the same tier the Crowds stat shows, in the month the rail names.
    const railWhen = resolveWhen({ xm: month });
    const ids = rows.map((p) => p.id).join(',');
    const prev = railLists.current;
    if (prev.ids !== ids || prev.guided !== guided || prev.month !== month) {
      const first = prev.ids == null;
      const later = !first && prev.month === month;
      railLists.current = {
        ids, guided, month, lists: new Map(), pending: new Map(),
        // Lists from the previous places, shown until their new ones are in.
        stale: later && prev.guided === guided ? new Map([...(prev.stale || []), ...prev.lists]) : null,
        // The guided data's first arrival: its rails wait for their lists.
        guidedLater: later && !prev.guided && !!guided,
      };
    }
    const cur = railLists.current;
    const byId = new Map(rows.map((p) => [p.id, p]));
    const kept = (name, make) => {
      let list = cur.lists.get(name);
      if (!list) {
        const old = cur.stale?.get(name);
        if (old || (cur.guidedLater && (name.startsWith('vibe:') || name === 'beach'))) {
          cur.pending.set(name, make);
          return (old || []).map((id) => byId.get(id)).filter(Boolean);
        }
        list = make().map((p) => p.id);
        cur.lists.set(name, list);
      }
      return list.map((id) => byId.get(id));
    };
    // Explore rails (owner 2026-11-18, "scroll a lot, horizontally and
    // vertically"): a theme rail holds the places strongest in one vibe of
    // the guided data that also score Good or better, best Score first,
    // round-robin by country. Its See all is the same vibe filter, so the
    // list holds these places and the weaker matches after them.
    // The Old towns rail drops a castle on its own, as its filter does.
    const vibeRail = (vibe) => (guided
      ? kept(`vibe:${vibe}`, () => interleaveByCountry(rows.filter((p) => vibeOf(guided, p.id, vibe) >= 80 && bandAtLeast(p.rating, 'good')
        && !(vibe === 'oldtown' && castleOnly(p))).sort(byRating)))
      : []);
    const q = {
      // Top rated and the gems open on the highest Score, never on one country.
      top: kept('top', () => interleaveByCountry(rows.filter((p) => bandAtLeast(p.rating, 'excellent')).sort(byRating))),
      gems: kept('gems', () => interleaveByCountry(rows.filter((p) => p.rating?.hidden_gem).sort(byRating))),
      now: kept('now', () => interleaveByCountry(rows.filter((p) => inSeason(p) && bandAtLeast(p.rating, 'very_good')).sort(byRating))),
      hiking: vibeRail('hiking'),
      beach: guided ? kept('beach', () => interleaveByCountry(rows.filter((p) => inSeason(p) && vibeOf(guided, p.id, 'beach') >= 80).sort(byRating))) : [],
      nocar: kept('nocar', () => interleaveByCountry(rows.filter(noCarOk))),
      // Quiet in high season says something only in June to September.
      quiet: month >= 6 && month <= 9 ? kept('quiet', () => interleaveByCountry(rows.filter((p) => quietOk(p, railWhen)))) : [],
      saved: favorites && favorites.size ? rows.filter((p) => favorites.has(p.id)) : [],
    };
    // G12 round 2: a rail that has a Browse shortcut opens what the
    // shortcut sets, in place, so its See all and the shortcut leave the same
    // chip with the same words (filters/filterModel.js labelForApplied).
    const theme = (key, vibe = key, shortcut = null) => {
      const title = t(`rail.${key}`);
      return { key, title, short: title, rows: vibeRail(vibe),
        seeAll: shortcut ? () => applyShortcut(shortcut) : () => patchXf({ vibe }) };
    };
    // V3 (T383): the page leads with cost (house rule "Rails and cuts",
    // explore N8). Well-rated places (Good and up) whose best months
    // include this month, under a ceiling: the traveller's own once the
    // input row sets one (the grid then answers instead of the rails, so in
    // practice the cheapest third of the catalogue), rounded up to the next
    // five euros so the title reads as a round figure. Sorted by day cost.
    // The rail strip shows at most two places per country among its twelve,
    // so it still rises left to right without opening on one country.
    const priced = rows.filter((p) => p.cost?.dayEur != null).map((p) => p.cost.dayEur).sort((a, b) => a - b);
    const third = priced.length ? priced[Math.floor((priced.length - 1) / 3)] : null;
    const ceiling = xf.budget || (third != null ? Math.ceil(third / 5) * 5 : null);
    const costCut = ceiling == null ? [] : rows
      .filter((p) => bandAtLeast(p.rating, 'good')
        && (p.climate?.best || []).includes(month)
        && underOk(ceiling)(p))
      .sort((a, b) => a.cost.dayEur - b.cost.dayEur);
    const perCountry = new Map();
    const costLead = [];
    const costRest = [];
    for (const p of costCut) {
      const n = perCountry.get(p.country) || 0;
      if (costLead.length < 12 && n < 2) { costLead.push(p); perCountry.set(p.country, n + 1); }
      else costRest.push(p);
    }
    // The sections (T427): a question each, no subtitle, no count. The
    // traveller's saved places lead when there are any. The themes alternate
    // town, coast and outdoors so the page never runs two alike in a row.
    // Until the guided data is in, the list stops before Hiking bases, its
    // first vibe rail: the rest arrive under what is on screen instead of
    // pushing Hidden gems and Go without a car down while the traveller
    // reads (checked on the merged branch, 2026-11-18).
    // G12, D10 (round 6): the same cut holds while the guided data's own
    // lists are still worked out after its arrival (round 5). Without it
    // Hidden gems, Go without a car and Quiet were drawn first and Hiking
    // bases, Beach, Old towns and Islands were inserted above them a moment
    // later, moving everything under the reader (0.38 of a 1280 screen in
    // perf_explore.mjs).
    const list = [
      { key: 'saved', title: t('rail.shortlist'), rows: q.saved,
        seeAll: () => setShowFavOnly(true) },
      { key: 'now', title: t('rail.bestIn', { month: monthName }), short: t('rail.bestIn', { month: monthName }),
        rows: q.now, seeAll: () => { patchXf({ month, verdicts: ['very_good'] }); } },
      { key: 'cost',
        title: t('rail.cost', { eur: ceiling != null ? formatMoney(ceiling) : '', month: monthName }),
        short: t('rail.costShort', { eur: ceiling != null ? formatMoney(ceiling) : '' }),
        rows: [...costLead, ...costRest],
        seeAll: () => { patchXf({ budget: ceiling, month }); setSortKey('cost'); } },
      { key: 'top', title: t('rail.topRated'), short: t('rail.topRated'), rows: q.top,
        seeAll: () => applyShortcut('top') },
      { key: 'hiking', title: t('rail.hiking'), short: t('rail.hiking'), rows: q.hiking,
        seeAll: () => applyShortcut('hiking') },
      { key: 'beach', title: t('rail.beachSeason'), short: t('rail.beachSeason'), rows: q.beach,
        seeAll: () => patchXf({ vibe: 'beach', month }) },
      theme('oldtown', 'oldtown', 'oldtown'),
      theme('island', 'island', 'island'),
      { key: 'gems', title: t('rail.gems'), short: t('rail.gems'), rows: q.gems,
        seeAll: () => applyShortcut('gems') },
      theme('mountain'),
      theme('unesco'),
      theme('lake', 'lake', 'lake'),
      { key: 'nocar', title: t('rail.nocar'), short: t('rail.nocar'), rows: q.nocar,
        seeAll: () => patchXf({ nocar: true }) },
      theme('food'),
      theme('views'),
      theme('castles'),
      theme('village'),
      theme('city'),
      theme('family'),
      theme('romantic'),
      theme('art'),
      { key: 'quiet', title: t('rail.quiet'), short: t('filter.notCrowded'), rows: q.quiet,
        seeAll: () => patchXf({ quiet: true }) },
    ];
    const waiting = !!guided && !!cur.guidedLater
      && [...cur.pending.keys()].some((name) => name.startsWith('vibe:') || name === 'beach');
    const cut = guided && !waiting ? list : list.slice(0, list.findIndex((r) => r.key === 'hiking'));
    return { rails: spreadLeads(cut), waiting };
    // railsTick: a list worked out after the render is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railsTick, railsIdle, rows, xf.month, xf.budget, railMonth, lang, guided, favorites, t, patchXf,
    applyShortcut, setSortKey, setShowFavOnly]);

  // The lists the render left pending, one per task, then one redraw.
  React.useEffect(() => {
    const cur = railLists.current;
    if (!cur.pending.size) return undefined;
    let live = true;
    const jobs = [...cur.pending];
    cur.pending = new Map();
    const step = () => {
      if (!live || railLists.current !== cur) return;
      const job = jobs.shift();
      if (job) {
        const [name, make] = job;
        if (!cur.lists.has(name)) cur.lists.set(name, make().map((p) => p.id));
        setTimeout(step, 0);
        return;
      }
      React.startTransition(() => setRailsTick((n) => n + 1));
    };
    const timer = setTimeout(step, 0);
    return () => { live = false; clearTimeout(timer); };
  }, [rails]);

  // T595 (owner 2026-10-22, point 1): the rails' doors stand at the top of
  // the overview as quick chips that act at once: every rail past the ones
  // drawn as strips, then the month's price and season rails. The same rail
  // objects, so a chip opens exactly what that rail's See all opens.
  // Explore rails (owner 2026-11-18): every rail with four or more places
  // is drawn as a strip, on every width, so the overview scrolls down
  // through all of them; T427's cap (three on a phone, four on a desktop)
  // is lifted. The quick chips keep the price and season rails.
  const railLead = Infinity;
  const quickRails = React.useMemo(() => {
    const shown = rails.filter((r) => r.rows.length >= 4);
    const out = shown.slice(railLead);
    for (const k of ['cost', 'now']) {
      const r = shown.find((x) => x.key === k);
      if (r && !out.includes(r)) out.push(r);
    }
    return out;
  }, [rails, railLead]);
  // T601: the hero's photograph, the first place of "Best in {month}" (else
  // Top rated) whose photo is a Wikimedia Commons file, so its file page
  // carries the author and the licence the credit links to.
  const heroPhoto = React.useMemo(() => {
    // T622 (owner 2026-10-23: "a more scenic, beautiful image"): a lake,
    // a coast or a mountain village from a short list of Europe's most
    // photographed views, one a day; the rails' first place stays the
    // fallback.
    const scenic = allRows.filter((x) => SCENIC_HERO.has(x.city) && isResizable(x.image) && commonsPageUrl(x.image));
    if (scenic.length) {
      scenic.sort((x, y) => String(x.id).localeCompare(String(y.id)));
      const day = Math.floor(Date.now() / 86400000);
      const p = scenic[day % scenic.length];
      return { url: p.image, city: p.city, page: commonsPageUrl(p.image), source: 'Wikimedia Commons' };
    }
    for (const key of ['now', 'top']) {
      const p = rails.find((r) => r.key === key)?.rows.find((x) => isResizable(x.image) && commonsPageUrl(x.image));
      if (p) return { url: p.image, city: p.city, page: commonsPageUrl(p.image), source: 'Wikimedia Commons' };
    }
    return null;
  }, [rails, allRows]);
  // The rails are all drawn and no list is still on its way (the guided
  // data in and its lists worked out): ExploreTab draws the footer only
  // then, so a rail arriving never pushes it down under the reader.
  const railsSettled = !railsIdle || (!!guided && !waiting);
  return { rails, railLead, quickRails, heroPhoto, railsSettled };
}
