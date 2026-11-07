import React from 'react';
import { resolveWhen } from '../../lib/when.js';
import { bandAtLeast } from '../../lib/rating.js';
import { interleaveByCountry } from '../ExploreRails.jsx';
import { vibeOf } from '../../lib/guidedData.js';
import { noCarOk, quietOk, underOk } from '../../lib/guidedSearch.js';
import { formatMoney } from '../../lib/money.js';
import { SCENIC_HERO } from './exploreConsts.js';
import { isResizable } from '../../lib/heroImage.js';
import { commonsPageUrl } from '../../lib/imageCredit.js';

export function useExploreRails({
  allRows, favorites, guided, isDesktop, lang, patchXf, railMonth, railsIdle, rows, setGemOnly,
  setShowFavOnly, setSortKey, t, xf,
}) {
  const rails = React.useMemo(() => {
    if (!railsIdle) return [];
    // The month the rails speak about: one set by hand, else the month of
    // the traveller's dates, else this month (T427).
    const month = xf.month || railMonth;
    const monthName = new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2026, month - 1, 15));
    const inSeason = (p) => (p.climate?.best || []).includes(month);
    // T649: the same tier the Crowds stat shows, in the month the rail names.
    const railWhen = resolveWhen({ xm: month });
    const byRating = (a, b) => (b.rating?.score || 0) - (a.rating?.score || 0);
    const q = {
      top: rows.filter((p) => bandAtLeast(p.rating, 'excellent')),
      gems: interleaveByCountry(rows.filter((p) => p.rating?.hidden_gem)),
      now: interleaveByCountry(rows.filter((p) => inSeason(p) && bandAtLeast(p.rating, 'very_good')).sort(byRating)),
      hiking: guided ? interleaveByCountry(rows.filter((p) => vibeOf(guided, p.id, 'hiking') >= 80).sort(byRating)) : [],
      beach: guided ? interleaveByCountry(rows.filter((p) => inSeason(p) && vibeOf(guided, p.id, 'beach') >= 80).sort(byRating)) : [],
      nocar: interleaveByCountry(rows.filter(noCarOk)),
      // Quiet in high season says something only in June to September.
      quiet: month >= 6 && month <= 9 ? interleaveByCountry(rows.filter((p) => quietOk(p, railWhen))) : [],
      saved: favorites && favorites.size ? rows.filter((p) => favorites.has(p.id)) : [],
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
    // traveller's shortlist leads when it holds anything.
    return [
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
        seeAll: () => patchXf({ verdicts: ['excellent'] }) },
      { key: 'hiking', title: t('rail.hiking'), short: t('rail.hiking'), rows: q.hiking,
        seeAll: () => patchXf({ vibe: 'hiking' }) },
      { key: 'beach', title: t('rail.beachSeason'), short: t('rail.beachSeason'), rows: q.beach,
        seeAll: () => patchXf({ vibe: 'beach', month }) },
      { key: 'gems', title: t('rail.gems'), short: t('rail.gems'), rows: q.gems,
        seeAll: () => setGemOnly(true) },
      { key: 'nocar', title: t('rail.nocar'), short: t('rail.nocar'), rows: q.nocar,
        seeAll: () => patchXf({ nocar: true }) },
      { key: 'quiet', title: t('rail.quiet'), short: t('filter.notCrowded'), rows: q.quiet,
        seeAll: () => patchXf({ quiet: true }) },
    ];
  }, [railsIdle, rows, xf.month, xf.budget, railMonth, lang, guided, favorites, t, patchXf,
    setGemOnly, setSortKey, setShowFavOnly]);

  // T595 (owner 2026-10-22, point 1): the rails' doors stand at the top of
  // the overview as quick chips that act at once: every rail past the ones
  // drawn as strips, then the month's price and season rails. The same rail
  // objects, so a chip opens exactly what that rail's See all opens.
  const railLead = isDesktop ? 4 : 3;
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
  return { rails, railLead, quickRails, heroPhoto };
}
