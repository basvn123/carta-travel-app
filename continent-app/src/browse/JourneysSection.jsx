import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Chip, ChipGroup, Segmented } from '../components/ui/index.js';
import {
  loadJourneyIndex, loadJourneyType, loadAllJourneyCards, typeLabel, typeDesc, journeyHash,
} from '../lib/journeys.js';
import {
  cardAtLength, fitLength, lengthOptions, readTripLength, writeTripLength, SHORT,
} from '../lib/tripLength.js';
import {
  bandCounts, costEdges, filterByBand, filterByMonth, inCountry, lowestPerDay,
  monthCounts as countMonths, sortCards,
} from '../lib/tripFilters.js';
import { filterByTag, tagCounts as countTags, tagVocabulary } from '../lib/tripTags.js';
import { tripFilterParts, TripFilterPanel, TripSheetExtra } from './TripFilters.jsx';
import { StyleCard, JourneyCard } from './JourneyCards.jsx';
import { FilterChips } from './FilterChips.jsx';
import { EmptyResult } from './EmptyResult.jsx';
import { PlacesFilterSheet } from './PlacesFilterSheet.jsx';
import { ArrowLeftIcon, ChevronRightIcon, FilterIcon } from '../components/Icons.jsx';
import { ErrorBlock } from '../components/StateBlocks.jsx';
import { haversineKm } from '../lib/nearby.js';
import { FAR_KM } from '../lib/coverageCases.js';
import { MonoLine } from './CoverageEmpty.jsx';

/**
 * The trip library: the written weeks, browsed style first (T428, T431;
 * folded into Explore by T498, roadmap 1.3b section C).
 *
 * Ten styles, hiking first because the launch speaks to hikers first
 * (PRODUCT.md), then the wire's order. Each style is a photo tile with its
 * caption under the photograph: the name, its one line, and what the
 * cheapest of its trips costs a person a day at the length the list is read
 * at (rule 5: one figure, never a range). Tapping one lists that style's
 * trips, and tapping a trip opens the JourneyPage with the plan.
 *
 * Moving around (owner 2026-10-21: keep every kind-of-trip path and make
 * moving between them easy): the styles list has a back control naming
 * where the traveller came from (`onBack`, `backLabel`); inside a style the
 * back control names "Trip styles", and a row of style chips under the head
 * hops style to style without going back.
 *
 * Filters (rule 4): no bar of its own. The active filters are chips in the
 * one refine row; the controls sit in the Explore side panel on a desktop
 * (`panelSlot`, portalled) and in the shared filter sheet on a phone.
 *
 * The composed city routes keep their own door at the end of the styles:
 * a different product, built by the composer rather than written.
 */

const LEAD_STYLE = 'hiking';

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l');

/** The length choices as the kit Segmented: the short version first, then
 *  each written length (lib/tripLength.js lengthOptions). */
function lengthChoices(options, t) {
  return options.map((o) => ({
    value: o.value,
    label: o.value === SHORT ? t('journey.segShortAny') : t('journey.nDays', { n: o.days }),
  }));
}

/** Still blocks at the final size of what is coming (rule "Loading"). */
function Skeleton({ n, kind, t }) {
  return (
    <div className="jskel" role="status" aria-busy="true">
      <span className="sr-only">{t('journey.loading')}</span>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={`jskel-card jskel-${kind}`} aria-hidden="true">
          <span className="jskel-photo" />
          <span className="jskel-line" />
          <span className="jskel-line is-short" />
        </span>
      ))}
    </div>
  );
}

/**
 * A style with nothing written in the chosen country (T367; the coverage
 * module's journeys form, docs/ONBOARDING_AND_EMPTY_STATES.md row 27): the
 * sentence, then the three weeks of that style nearest the country across
 * its border, then the one button that drops the country.
 */
function StyleCountryEmpty({ country, cards, geo, countryName, onOpen, onAllCountries, t, lang }) {
  const nf = (v) => new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(v);
  const near = useMemo(() => {
    if (!geo || !cards) return [];
    return cards
      .filter((c) => !inCountry(c, country) && Number.isFinite(c.lat) && Number.isFinite(c.lon))
      .map((c) => ({ c, km: haversineKm(geo.lat, geo.lon, c.lat, c.lon) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 3);
  }, [geo, cards, country]);
  // Across a sea, not a border: the rows are not listed, the line says
  // where the nearest one is (the module's Faroes rule).
  const far = near.length > 0 && near[0].km > FAR_KM;
  return (
    <div className="cov-empty" data-testid="coverage-empty" data-code="journey">
      <p className="cov-empty-why">{t('journey.emptyCountry', { country: countryName(country) })}</p>
      {far && (
        <p className="cov-empty-far">
          <MonoLine t={t} k="cov.nearestFar" vars={{ country: countryName(near[0].c.cc) }} mono={{ km: nf(near[0].km) }} />
        </p>
      )}
      {near.length > 0 && !far && (
        <>
          <p className="cov-empty-head">{t('cov.nearestHead')}</p>
          <ul className="cov-near">
            {near.map(({ c, km }) => (
              <li key={c.id}>
                <a
                  className="cov-near-row"
                  href={journeyHash(c.id)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    onOpen(c);
                  }}
                >
                  <span className="cov-near-name">{c.title}</span>
                  <span className="cov-near-meta">
                    {countryName(c.cc)} <span className="mono">{nf(km)} km</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {onAllCountries && (
        <Button variant="secondary" size="sm" className="cov-empty-btn" onClick={onAllCountries}>{t('cov.showAll')}</Button>
      )}
    </div>
  );
}

/** One row of style chips under a style's head: radio semantics, the open
 *  style checked, scrolled into view so the traveller sees where they are. */
function StyleSwitch({ styles, view, onView, t }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const row = ref.current;
    const on = row?.querySelector('[aria-checked="true"]');
    if (!row || !on || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - 16);
  }, [view]);
  if (styles.length < 2) return null;
  return (
    <div className="jstyle-switch" ref={ref}>
      <ChipGroup label={t('journey.styleSwitch')} className="jstyle-switch-row">
        {styles.map((tp) => (
          <Chip
            key={tp.slug}
            kind="choice"
            selected={tp.slug === view}
            onClick={() => { if (tp.slug !== view) onView(tp.slug); }}
          >
            {typeLabel(tp.slug, t, tp.name)}
          </Chip>
        ))}
      </ChipGroup>
    </div>
  );
}

export function JourneysSection({
  q, country, view, onView, onOpen, onComposed, countryName, t, lang,
  geoOf = null, onAllCountries = null, onClearSearch = null,
  // T498: where the styles list's back control goes, and what it says
  // ("Explore"); null hides it.
  onBack = null, backLabel = '',
  // T498: the Explore side panel's slot on a desktop (an element, or null);
  // with it the library's filters are portalled there.
  panelSlot = null, isDesktop = false,
}) {
  const [index, setIndex] = useState(undefined);   // undefined = loading
  const [indexTries, setIndexTries] = useState(0);
  // The open style's trips: undefined while loading, null when the load
  // failed (said as a failure with a retry, never as "no trips here").
  const [cards, setCards] = useState(undefined);
  const [cardTries, setCardTries] = useState(0);
  // The length the list is read at, shared with the trip page through
  // lib/tripLength.js; the cost band, month, tag and sort are not kept.
  const [stored, setLength] = useState(readTripLength);
  const [band, setBand] = useState(null);
  const [month, setMonth] = useState(null);
  const [tag, setTag] = useState(null);           // one tag at a time (T089)
  const [sort, setSort] = useState('written');
  // T428: only trips that offer a hostel, hut or campsite bed (the wire's
  // `beds`, T448), the budget traveller's question across every style.
  const [cheapBeds, setCheapBeds] = useState(false);
  // The filter set last, so an empty list names it (rule F: "Remove {filter}").
  const [lastSet, setLastSet] = useState(null);
  const [library, setLibrary] = useState(null);     // every trip, for the edges and from-prices
  const [sheetOpen, setSheetOpen] = useState(false);
  const filtersRef = useRef(null);
  const pickLength = (next) => { setLength(next); writeTripLength(next); };
  const onBand = (v) => { setBand(v); if (v) setLastSet('band'); };
  const onMonth = (v) => { setMonth(v); if (v) setLastSet('month'); };
  const onTag = (v) => { setTag(v); if (v) setLastSet('tag'); };
  const onBeds = (v) => { setCheapBeds(v); if (v) setLastSet('beds'); };

  useEffect(() => {
    let live = true;
    // A dropped connection is a failed load, said as one with a retry,
    // never "no trips here".
    loadJourneyIndex().then((ix) => { if (live) setIndex(ix); })
      .catch(() => { if (live) setIndex(null); });
    return () => { live = false; };
  }, [indexTries]);

  useEffect(() => {
    if (!view || view === 'composed') { setCards(undefined); return undefined; }
    let live = true;
    setCards(undefined);
    loadJourneyType(view)
      .then((rows) => { if (live) setCards(rows || []); })
      .catch(() => { if (live) setCards(null); });
    return () => { live = false; };
  }, [view, cardTries]);

  // The whole library: the style grid's from-prices and the list's cost
  // edges both read it.
  useEffect(() => {
    let live = true;
    loadAllJourneyCards().then((all) => { if (live) setLibrary(all); });
    return () => { live = false; };
  }, []);
  // T431: the length choices come from the trips (lib/tripLength.js), so a
  // 10 or 14 day trip adds its own choice; a remembered choice the list no
  // longer offers falls back to the week.
  const lenOptions = useMemo(
    () => lengthOptions(view && cards ? cards : library),
    [view, cards, library],
  );
  const length = fitLength(stored, lenOptions);
  const edges = useMemo(() => costEdges(library, length), [library, length]);

  const query = norm(q);

  // The styles, narrowed by the shared country filter: a style with nothing
  // in the chosen country is absent, not greyed. Hiking leads.
  const types = useMemo(() => {
    if (!index) return [];
    const list = index.types.filter((tp) => !country || (tp.countries || []).includes(country));
    return [...list.filter((tp) => tp.slug === LEAD_STYLE), ...list.filter((tp) => tp.slug !== LEAD_STYLE)];
  }, [index, country]);

  // The cheapest a person a day of each style at the list's length, in the
  // country when one is chosen, so the figure on the tile is one the list
  // can show.
  const perDay = useMemo(() => {
    if (!library?.length) return {};
    const out = {};
    for (const tp of types) {
      out[tp.slug] = lowestPerDay(library.filter((c) => c.type === tp.slug
        && (!country || inCountry(c, country))), length);
    }
    return out;
  }, [library, types, length, country]);

  // The style's trips after the search and the country, before the filters:
  // the counts read from here, so a choice knows what it would show.
  const scoped = useMemo(() => {
    if (!cards) return null;
    let out = cards;
    if (country) out = out.filter((c) => inCountry(c, country));
    if (query) {
      out = out.filter((c) => norm(`${c.title} ${c.country} ${c.sub || ''}`).includes(query));
    }
    return out;
  }, [cards, country, query]);
  // Tags (T089): the vocabulary is the style's common tags before any other
  // filter, so the choices stay put.
  const vocab = useMemo(() => tagVocabulary(scoped), [scoped]);
  const activeTag = tag && vocab.includes(tag) ? tag : null;
  const bandOn = edges ? band : null;
  const apply = (list, { skipBand = false, skipTag = false, skipMonth = false } = {}) => {
    let out = (list || []).filter((c) => cardAtLength(c, length));
    if (cheapBeds) out = out.filter((c) => (c.beds || []).length > 0);
    if (!skipTag) out = filterByTag(out, activeTag);
    if (!skipMonth) out = filterByMonth(out, month);
    if (!skipBand) out = filterByBand(out, { length, band: bandOn, edges });
    return out;
  };
  const rows = useMemo(
    () => (scoped ? sortCards(apply(scoped), sort, length, lang) : null),
    // apply reads the same inputs listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, activeTag, month, bandOn, edges, length, sort, lang, cheapBeds],
  );
  const counts = useMemo(
    () => bandCounts(apply(scoped, { skipBand: true }), { length, edges }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, activeTag, month, length, edges, cheapBeds],
  );
  const tagNumbers = useMemo(
    () => countTags(apply(scoped, { skipTag: true }), vocab),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, month, bandOn, edges, length, vocab, cheapBeds],
  );
  const monthNumbers = useMemo(
    () => countMonths(apply(scoped, { skipMonth: true })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, activeTag, bandOn, edges, length, cheapBeds],
  );
  // Clear all takes the cost, the month, the tag and the beds off; the
  // length is how the list is read, not a filter, so it stays (T376-g).
  const clearFilters = () => { setBand(null); setMonth(null); setTag(null); setCheapBeds(false); setLastSet(null); };
  const hasBeds = !!scoped && scoped.some((c) => (c.beds || []).length > 0);

  const parts = tripFilterParts({
    band: bandOn, onBand, edges, counts,
    month, onMonth, monthCounts: monthNumbers,
    tag: activeTag, onTag, tags: vocab, tagCounts: tagNumbers,
    sort, onSort: setSort,
    hasBeds, cheapBeds, onBeds,
    t, lang,
  });

  // The panel takes the filters only once its slot exists; until then (and
  // on a phone) the list carries them itself.
  const inPanel = !!(isDesktop && panelSlot);

  if (index === undefined) {
    return (
      <div className="places-list jsec tlib">
        <Skeleton n={6} kind="style" t={t} />
      </div>
    );
  }

  // The length control, the same on the styles and on a style's list, so
  // the from-price of a style and the figures of its trips agree.
  const lengthControl = (
    <Segmented
      size="sm"
      className="tlib-length"
      label={t('journey.lenLabel')}
      value={length}
      onChange={pickLength}
      options={lengthChoices(lenOptions, t)}
    />
  );
  const inStyle = !!view && cards !== null;
  const panel = inPanel
    ? createPortal(
      <TripFilterPanel lengthControl={lengthControl} parts={inStyle && cards ? parts : null} t={t} />,
      panelSlot,
    )
    : null;

  if (!view) {
    return (
      <div className="places-list jsec tlib">
        {panel}
        {onBack && (
          <div className="tlib-back">
            <Button variant="quiet" size="sm" className="jsec-back" onClick={onBack}
              iconStart={<ArrowLeftIcon size={16} />}>
              {backLabel}
            </Button>
          </div>
        )}
        {/* A picked country has its own band above, so the head keeps only
            the length choice then. */}
        {(!country || !inPanel) && (
          <header className={`dtab-head tlib-head${country ? ' is-bare' : ''}`}>
            {!country && <h2 className="dtab-title">{t('dtab.head.trips')}</h2>}
            {!inPanel && lengthControl}
          </header>
        )}
        {types.map((tp) => (
          <StyleCard key={tp.slug} type={tp} perDay={perDay[tp.slug]} onPick={onView} t={t} />
        ))}
        {index && types.length === 0 && country && (
          <EmptyResult
            line={t('journey.emptyCountryAll', { country: countryName(country) })}
            action={onAllCountries ? { label: t('cov.showAll'), onClick: onAllCountries } : null}
          />
        )}
        {!index && (
          <div className="places-empty places-loaderr" role="status">
            <ErrorBlock message={t('layer.loadFailed')}
              onRetry={() => { setIndex(undefined); setIndexTries((n) => n + 1); }}
              retryLabel={t('layer.retry')} />
          </div>
        )}
        {/* The composer's door: a different product, one quiet row (T428). */}
        <div className="jcomposed">
          <Button variant="secondary" className="jcomposed-card" onClick={onComposed}
            iconEnd={<ChevronRightIcon size={15} />}>
            {t('journey.composedTitle')}
          </Button>
        </div>
      </div>
    );
  }

  const openType = (index?.types || []).find((tp) => tp.slug === view);
  // The switch names every style the list offers, and always the open one,
  // so a radio is checked even when the country narrowed it away.
  const switchStyles = openType && !types.some((tp) => tp.slug === view) ? [openType, ...types] : types;

  // The one refine row: the active filters, and on a phone the Filters
  // button leading it (it stays when no filter is on).
  const filtersButton = inPanel ? null : (
    <Button
      ref={filtersRef}
      variant="secondary"
      className="tlib-filters"
      onClick={() => setSheetOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      iconStart={<FilterIcon size={16} />}
    >
      {t('filter.filters')}
      {parts.active > 0 && <Chip kind="count">{parts.active}</Chip>}
    </Button>
  );
  const refineRow = cards ? (
    <div className="tlib-refine">
      {parts.chips.length > 0
        ? <FilterChips t={t} chips={parts.chips} onClearAll={clearFilters} lead={filtersButton} />
        : filtersButton && (
          <div className="xchips" role="group" aria-label={t('journey.fltAria')}>
            <span className="xchips-lead">{filtersButton}</span>
          </div>
        )}
    </div>
  ) : null;
  const sheetGroups = [
    {
      key: 'length',
      label: t('journey.lenLabel'),
      options: lengthChoices(lenOptions, t).map((o) => ({ key: o.value, label: o.label, on: o.value === length })),
      onToggle: pickLength,
    },
    ...parts.groups,
  ];

  // What emptied the list, said once (rule F): the filter set last, or the
  // newest one on.
  const last = parts.chips.find((c) => c.key === lastSet) || parts.chips[parts.chips.length - 1] || null;
  const backToStyles = { label: t('journey.backStyles'), onClick: () => onView(null) };

  return (
    <div className="places-list jsec jsec-trips tlib">
      {panel}
      <header className="tlib-head is-style">
        <Button variant="quiet" size="sm" className="jsec-back" onClick={() => onView(null)}
          iconStart={<ArrowLeftIcon size={16} />}>
          {t('journey.backStyles')}
        </Button>
        <h2 className="dtab-title">{typeLabel(view, t, openType?.name)}</h2>
        {typeDesc(view, t) && <p className="tlib-desc">{typeDesc(view, t)}</p>}
      </header>
      <StyleSwitch styles={switchStyles} view={view} onView={onView} t={t} />
      {/* On a phone the length lives in the Filters sheet only (T502): the
          page row repeated it. */}
      {refineRow}
      {sheetOpen && !inPanel && (
        <PlacesFilterSheet
          onClose={() => setSheetOpen(false)}
          anchorRef={filtersRef}
          groups={sheetGroups}
          extra={<TripSheetExtra parts={parts} />}
          activeFilters={parts.active}
          resetAll={clearFilters}
          resultCount={rows ? rows.length : 0}
          noun="trips"
        />
      )}
      {cards === undefined && <Skeleton n={4} kind="trip" t={t} />}
      {cards === null && (
        <div className="places-empty places-loaderr" role="status">
          <ErrorBlock message={t('journey.listFailed')}
            onRetry={() => setCardTries((n) => n + 1)}
            retryLabel={t('layer.retry')} />
        </div>
      )}
      {rows && rows.map((card) => (
        <JourneyCard key={card.id} card={card} length={length} onOpen={onOpen} t={t} lang={lang} />
      ))}
      {rows && rows.length === 0 && (
        scoped && scoped.length > 0
          ? (
            <EmptyResult
              line={last ? t('journey.emptyFilter', { filter: last.label }) : t('journey.emptyType')}
              action={last
                ? { label: t('explore.removeFilter', { filter: last.label }), onClick: last.remove }
                : backToStyles}
              onClearAll={parts.chips.length >= 2 ? clearFilters : null}
              clearLabel={t('filter.clearAll')}
            />
          )
          : country
            ? (
              <StyleCountryEmpty
                country={country}
                cards={cards}
                geo={geoOf ? geoOf(country) : null}
                countryName={countryName}
                onOpen={onOpen}
                onAllCountries={onAllCountries}
                t={t}
                lang={lang}
              />
            )
            : query && onClearSearch
              ? (
                <EmptyResult
                  line={t('journey.noneMatch')}
                  action={{ label: t('results.clearSearch'), onClick: onClearSearch }}
                />
              )
              : <EmptyResult line={t('journey.emptyType')} action={backToStyles} />
      )}
    </div>
  );
}
