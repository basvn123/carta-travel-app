import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { loadAllJourneyCards, loadJourneyIndex, typeLabel } from '../../lib/journeys.js';
import {
  bandCounts, costEdges, filterByBand, filterByMonth, cardPerDay,
  monthCounts as countMonths, sortCards,
} from '../../lib/tripFilters.js';
import { filterByTag, tagCounts as countTags, tagVocabulary } from '../../lib/tripTags.js';
import { WEEK, cardAtLength } from '../../lib/tripLength.js';
import { useSavedJourneys, toggleSavedJourney } from '../../lib/journeySaves.js';
import { tripFilterParts, TripSheetExtra } from '../../browse/TripFilters.jsx';
import { TripPlaceCard } from '../../browse/TripPlaceCard.jsx';
import { FilterChips } from '../../browse/FilterChips.jsx';
import { PlacesFilterSheet } from '../../browse/PlacesFilterSheet.jsx';
import { Button, Chip } from '../../components/ui/index.js';
import {
  BikeIcon, BunkIcon, CarIcon, CityIcon, DiningIcon, FilterIcon, LakeIcon, LeafIcon, MountainIcon, PalmIcon,
  RouteIcon, ShoeIcon, SnowIcon, SparkIcon, TrainIcon, VillageIcon,
} from '../../components/Icons.jsx';

// Cards per page of the grid; More adds the next page.
const PAGE = 24;
// The in-season band at the top while no filter is on.
const FEATURED = 8;
// Grid cards: one column of side cards on a phone, then about 260 px each.
const GRID_SIZES = '(max-width: 768px) 46vw, (max-width: 1279px) 33vw, 300px';
const RAIL_SIZES = '(max-width: 768px) 46vw, 300px';
// T902: an icon for each style tab (Explore's category row).
const STYLE_ICON = {
  city: CityIcon, hiking: MountainIcon, rail: TrainIcon, 'beach-week': PalmIcon, culinary: DiningIcon, cycling: BikeIcon,
  hostel: BunkIcon, 'cozy-towns': VillageIcon, 'road-trip': CarIcon, 'winter-sports': SnowIcon, 'nature-escape': LeafIcon,
  'water-sports': LakeIcon, 'trail-running': ShoeIcon, pilgrim: RouteIcon, 'island-hopping': PalmIcon,
};
// The filters a reload keeps (this visit only).
const KEEP = 'carta.cartaTrips.filters.v1';

/** In season this month first, then the cheapest a person a day. */
function ranked(cards, month) {
  const inSeason = (c) => ((c.months || []).includes(month) ? 0 : 1);
  const perDay = (c) => cardPerDay(c, WEEK) ?? Infinity;
  return cards.slice().sort((a, b) => inSeason(a) - inSeason(b) || perDay(a) - perDay(b));
}

function readKept() {
  try { return JSON.parse(sessionStorage.getItem(KEEP) || 'null') || {}; } catch { return {}; }
}

/**
 * Carta's own trips (T752, T824): every written week of the journeys library
 * on one page, laid out like Explore (owner 2026-10-29): the title and one
 * line of what every trip holds, one row with the Filters button and the
 * filters that are on, the weeks in season as a band while nothing is
 * filtered, then every week as Explore's card (one badge on the photo, the
 * bookmark, the price under it). The filters live in Explore's sheet:
 * style, cost a person, theme, month, cheap beds, saved, and the order.
 *
 *   onBack()             back where the page was opened from
 *   onOpenJourney(id)    one week, its whole plan
 */
export function CartaTrips({ titleTag = 'h1', onBack, onOpenJourney }) {
  const { t, lang } = useI18n();
  const Title = titleTag;
  const month = new Date().getMonth() + 1;
  const kept0 = useMemo(readKept, []);
  const [types, setTypes] = useState([]);
  const [cards, setCards] = useState(null);
  const [style, setStyle] = useState(kept0.style || null);
  const [band, setBand] = useState(kept0.band || null);
  const [fMonth, setFMonth] = useState(kept0.month || null);
  const [tag, setTag] = useState(kept0.tag || null);
  const [cheapBeds, setCheapBeds] = useState(Boolean(kept0.beds));
  const [savedOnly, setSavedOnly] = useState(Boolean(kept0.saved));
  const [sort, setSort] = useState(kept0.sort || 'written');
  const [shown, setShown] = useState(PAGE);
  const [sheetOpen, setSheetOpen] = useState(false);
  const filtersRef = useRef(null);
  const saved = useSavedJourneys();

  useEffect(() => {
    let live = true;
    loadJourneyIndex().then((ix) => { if (live) setTypes(ix?.types || []); }).catch(() => {});
    loadAllJourneyCards().then((all) => { if (live) setCards(all || []); }).catch(() => { if (live) setCards([]); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEEP, JSON.stringify({ style, band, month: fMonth, tag, beds: cheapBeds, saved: savedOnly, sort }));
    } catch { /* storage blocked: this view only */ }
    setShown(PAGE);
  }, [style, band, fMonth, tag, cheapBeds, savedOnly, sort]);

  const all = useMemo(() => (cards ? ranked(cards, month).filter((c) => cardAtLength(c, WEEK)) : []), [cards, month]);
  const edges = useMemo(() => costEdges(all, WEEK), [all]);
  const savedSet = useMemo(() => new Set(saved), [saved]);

  // What the style and Saved narrow to, before the sheet's own filters: the
  // counts read from here, so a choice knows what it would show.
  const scoped = useMemo(() => {
    let out = all;
    if (style) out = out.filter((c) => c.type === style);
    if (savedOnly) out = out.filter((c) => savedSet.has(c.id));
    return out;
  }, [all, style, savedOnly, savedSet]);
  const vocab = useMemo(() => tagVocabulary(scoped), [scoped]);
  const activeTag = tag && vocab.includes(tag) ? tag : null;
  const apply = (list, { skipBand = false, skipTag = false, skipMonth = false } = {}) => {
    let out = list || [];
    if (cheapBeds) out = out.filter((c) => (c.beds || []).length > 0);
    if (!skipTag) out = filterByTag(out, activeTag);
    if (!skipMonth) out = filterByMonth(out, fMonth);
    if (!skipBand) out = filterByBand(out, { length: WEEK, band: edges ? band : null, edges });
    return out;
  };
  const rows = useMemo(
    () => sortCards(apply(scoped), sort, WEEK, lang),
    // apply reads the same inputs listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, activeTag, fMonth, band, edges, sort, lang, cheapBeds],
  );
  const counts = useMemo(
    () => bandCounts(apply(scoped, { skipBand: true }), { length: WEEK, edges }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, activeTag, fMonth, edges, cheapBeds],
  );
  const tagNumbers = useMemo(
    () => countTags(apply(scoped, { skipTag: true }), vocab),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, fMonth, band, edges, vocab, cheapBeds],
  );
  const monthNumbers = useMemo(
    () => countMonths(apply(scoped, { skipMonth: true })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, activeTag, band, edges, cheapBeds],
  );
  const styleCounts = useMemo(() => {
    const m = {};
    for (const c of apply(savedOnly ? all.filter((x) => savedSet.has(x.id)) : all)) m[c.type] = (m[c.type] || 0) + 1;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, savedOnly, savedSet, activeTag, fMonth, band, edges, cheapBeds]);

  const parts = tripFilterParts({
    band: edges ? band : null, onBand: setBand, edges, counts,
    month: fMonth, onMonth: setFMonth, monthCounts: monthNumbers,
    tag: activeTag, onTag: setTag, tags: vocab, tagCounts: tagNumbers,
    sort, onSort: setSort,
    hasBeds: all.some((c) => (c.beds || []).length > 0), cheapBeds, onBeds: setCheapBeds,
    t, lang,
  });

  const styleName = (slug) => typeLabel(slug, t, types.find((x) => x.slug === slug)?.name || slug);
  const groups = [
    types.length > 0 && {
      key: 'style',
      label: t('pf.carta.styles'),
      options: types.map((tp) => ({
        key: tp.slug, label: styleName(tp.slug), on: style === tp.slug, disabled: style !== tp.slug && !(styleCounts[tp.slug] > 0),
      })),
      onToggle: (key) => setStyle(style === key ? null : key),
    },
    ...parts.groups,
    {
      key: 'saved',
      label: t('tp.flt.saved'),
      options: [{ key: 'saved', label: t('tp.flt.savedOnly', { n: saved.length }), on: savedOnly, disabled: !savedOnly && saved.length === 0 }],
      onToggle: () => setSavedOnly(!savedOnly),
    },
  ].filter(Boolean);
  const chips = [
    style && { key: 'style', label: styleName(style), remove: () => setStyle(null) },
    savedOnly && { key: 'saved', label: t('tp.flt.savedChip'), remove: () => setSavedOnly(false) },
    ...parts.chips,
  ].filter(Boolean);
  const active = chips.length;
  const clearAll = () => {
    setStyle(null); setBand(null); setFMonth(null); setTag(null); setCheapBeds(false); setSavedOnly(false);
  };

  const featured = useMemo(
    () => (active === 0 ? all.filter((c) => (c.months || []).includes(month)).slice(0, FEATURED) : []),
    [all, active, month],
  );
  // T902: the cheapest weeks a person a day, the second row while nothing is filtered.
  const cheapest = useMemo(() => {
    if (active > 0) return [];
    const at = (c) => cardPerDay(c, WEEK);
    return all.filter((c) => Number.isFinite(at(c))).sort((a, b) => at(a) - at(b)).slice(0, FEATURED);
  }, [all, active]);
  const open = (card) => onOpenJourney(card.id);
  const card = (c, sizes) => (
    <TripPlaceCard key={c.id} card={c} length={WEEK} month={month} saved={savedSet.has(c.id)}
      onToggleSave={toggleSavedJourney} onOpen={open} t={t} lang={lang} sizes={sizes} />
  );

  const filtersButton = (
    <Button
      ref={filtersRef}
      variant="secondary"
      size="sm"
      className="xtool pf-carta-filters"
      onClick={() => setSheetOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      iconStart={<FilterIcon size={16} />}
    >
      {t('filter.filters')}
      {active > 0 && <Chip kind="count" className="xfilters-n">{active}</Chip>}
    </Button>
  );

  return (
    <div className="pf-carta">
      {/* T902 (owner, Plan home board 2026-10-30): where the page sits,
          Plan / Carta's own trips, in place of a bare Back. */}
      <nav className="pf-carta-crumbs" aria-label={t('dayws.crumbsAria')}>
        <Button variant="quiet" size="sm" className="dayc-link" onClick={onBack}>{t('dayws.crumbPlan')}</Button>
        <span className="pf-carta-sep" aria-hidden="true">/</span>
        <span className="pf-carta-here" aria-current="page">{t('pf.carta.title')}</span>
      </nav>

      <header className="pf-carta-hero">
        <Title className="pf-title pf-carta-title" tabIndex={-1}>{t('pf.carta.title')}</Title>
      </header>

      {/* The styles as Explore's category row: All, then each style. */}
      {types.length > 0 && (
        <div className="pf-carta-styles" role="group" aria-label={t('pf.carta.styles')}>
          {[{ slug: null }, ...types].map((tp) => {
            const Icon = tp.slug ? STYLE_ICON[tp.slug] || SparkIcon : SparkIcon;
            const on = style === tp.slug;
            return (
              <Button key={tp.slug || 'all'} variant="quiet" className={`pf-carta-style${on ? ' is-on' : ''}`} aria-pressed={on}
                disabled={Boolean(tp.slug) && !on && !(styleCounts[tp.slug] > 0)} onClick={() => setStyle(tp.slug)}>
                <span className="pf-carta-style-ic" aria-hidden="true"><Icon size={22} /></span>
                <span className="pf-carta-style-name">{tp.slug ? styleName(tp.slug) : t('pf.carta.all')}</span>
              </Button>
            );
          })}
        </div>
      )}

      <div className="pf-carta-bar">
        <div className="pf-carta-quick" role="group" aria-label={t('journey.fltAria')}>
          <Chip kind="filter" selected={fMonth === month}
            onClick={() => setFMonth(fMonth === month ? null : month)}>{t('tp.card.inSeason')}</Chip>
          {saved.length > 0 && (
            <Chip kind="filter" selected={savedOnly}
              onClick={() => setSavedOnly(!savedOnly)}>{t('tp.flt.savedChip')}</Chip>
          )}
          {filtersButton}
        </div>
        {cards && <span className="pf-carta-count" aria-live="polite">{t(rows.length === 1 ? 'tp.carta.countOne' : 'tp.carta.count', { n: rows.length })}</span>}
      </div>
      {chips.length > 0 && <FilterChips t={t} chips={chips} onClearAll={clearAll} />}

      {sheetOpen && (
        <PlacesFilterSheet
          onClose={() => setSheetOpen(false)}
          anchorRef={filtersRef}
          groups={groups}
          extra={<TripSheetExtra parts={parts} />}
          activeFilters={active}
          resetAll={clearAll}
          resultCount={rows.length}
          noun="trips"
        />
      )}

      {featured.length > 0 && (
        <section className="pf-carta-sec" aria-labelledby="pf-carta-season">
          <h2 className="pf-carta-h" id="pf-carta-season">{t('pf.carta.inSeason')}</h2>
          <div className="pf-carta-rail">{featured.map((c) => card(c, RAIL_SIZES))}</div>
        </section>
      )}

      {cheapest.length > 0 && (
        <section className="pf-carta-sec" aria-labelledby="pf-carta-cheap">
          <h2 className="pf-carta-h" id="pf-carta-cheap">{t('pf.carta.cheapest')}</h2>
          <div className="pf-carta-rail">{cheapest.map((c) => card(c, RAIL_SIZES))}</div>
        </section>
      )}

      {cards === null ? (
        <div className="pf-carta-grid is-wait" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="pf-carta-ghost" />)}
        </div>
      ) : (
        <section className="pf-carta-sec" aria-labelledby="pf-carta-all">
          <h2 className="pf-carta-h" id="pf-carta-all">
            {style ? styleName(style) : t('pf.carta.allTrips')}
          </h2>
          {rows.length > 0 ? (
            <div className="pf-carta-grid">{rows.slice(0, shown).map((c) => card(c, GRID_SIZES))}</div>
          ) : (
            <div className="pf-carta-empty">
              <p>{savedOnly && saved.length === 0 ? t('tp.carta.noSaved') : t('tp.carta.none')}</p>
              {active > 0 && <Button variant="secondary" size="sm" onClick={clearAll}>{t('tp.carta.clear')}</Button>}
            </div>
          )}
          {rows.length > shown && (
            <Button variant="secondary" className="pf-carta-more" onClick={() => setShown(shown + PAGE)}>
              {t('pf.carta.more')}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
