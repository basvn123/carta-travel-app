import React, { useEffect, useMemo, useState } from 'react';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { Button, Card, Money, Segmented } from '../components/ui/index.js';
import { InfoDot } from '../components/InfoDot.jsx';
import { TilePhotos } from './PhotoGallery.jsx';
import { countryName as localCountryName } from '../lib/countryName.js';
import { srcSetFor, fallbackSrc } from '../lib/heroImage.js';

/*
 * What these cards are really drawn at. They sit in .places-list, the same
 * grid the Destinations cards use (two abreast on a phone, 2 up to 1039, 3
 * above), and on a desktop that list shares the window with the left panel,
 * so the photo comes out at about 170px on a phone and never wider than ~370.
 * `sizes` is a promise the browser believes: kept identical to
 * DestinationsTab's CARD_SIZES because it is literally the same grid.
 */
const CARD_SIZES = '(max-width: 1039px) 47vw, min(26vw, 370px)';
// T431: the trip and style tiles, two across from 769 px and one on a phone;
// T457: in the full-width column, three from 1280 px (at most about 410 px
// wide) and four from 1600 px.
const TILE_SIZES = '(max-width: 768px) 92vw, (max-width: 1279px) 46vw, 410px';
import {
  loadJourneyIndex, loadJourneyType, loadAllJourneyCards, typeLabel, typeDesc, monthsShort,
  styleFromPrice, journeyHash,
} from '../lib/journeys.js';
import {
  cardAtLength, cardTotal, fitLength, lengthOptions, readTripLength, writeTripLength, SHORT,
} from '../lib/tripLength.js';
import { openShared } from '../lib/sharedElement.js';
import {
  bandCounts, costEdges, filterByBand, filterByMonth, monthCounts as countMonths, sortCards,
} from '../lib/tripFilters.js';
import { filterByTag, tagCounts as countTags, tagVocabulary } from '../lib/tripTags.js';
import { TripFilters } from './TripFilters.jsx';
import { ArrowLeftIcon, CalendarIcon, ChevronRightIcon, RouteIcon } from '../components/Icons.jsx';
import { ErrorBlock } from '../components/StateBlocks.jsx';
import { haversineKm } from '../lib/nearby.js';
import { FAR_KM } from '../lib/coverageCases.js';
import { MonoLine } from './CoverageEmpty.jsx';

/**
 * The Trips category's front door: the curated trip library, browsed style
 * first.
 *
 * Ten styles, hiking first because the launch speaks to hikers first
 * (PRODUCT.md), then the wire's order. Each style is a photo tile with its
 * caption under the photograph (rule "Caption band": no text on a photo, no
 * scrim): the name, its one line, and what the cheapest of its trips costs a
 * person at the length the list is read at (rule "Cost on cards": the
 * from-price with its length, from the cheapest member, never an average,
 * marked as an estimate). Tapping one lists that style's trips as compact
 * rows (T452), and tapping a trip opens the JourneyPage with the plan.
 *
 * The composed city routes (pipeline/trips, 2 to 14 days) keep their own door
 * at the end of the grid: they are a different product, built by the
 * composer rather than written, and mixing the two lists would invite the
 * reader to compare numbers that do not exist on both.
 *
 * The tab's shared search field and country filter narrow the style list
 * too: a card whose trips are all filtered out is not rendered at all.
 */

const LEAD_STYLE = 'hiking';

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l');

/** A sentence with the kit's Money in its {eur} or {range} slot (T451): the
 *  trip budgets are estimates, so they carry Explore's ~ and est. mark. */
const SLOT = '\u0001';
function withMoney(text, money) {
  const at = text.indexOf(SLOT);
  if (at < 0) return text;
  return <>{text.slice(0, at)}{money}{text.slice(at + SLOT.length)}</>;
}

/** A photograph, or the flag-and-name placeholder on the sunken ground. A
 *  row's photograph is the 72 px square of the list (T452). */
function CardPhoto({ hero, cc, name, row = false }) {
  return hero?.url
    ? (
      <img
        className="places-card-img"
        src={fallbackSrc(hero.url, row ? 250 : 500)}
        srcSet={srcSetFor(hero.url, row ? 500 : 1280)}
        sizes={row ? '72px' : CARD_SIZES}
        alt=""
        width={row ? 1 : 4}
        height={row ? 1 : 3}
        loading="lazy"
        decoding="async"
      />
    )
    : (
      <span className="places-card-img places-card-noimg jcap-noimg" aria-hidden="true">
        {cc && <CountryFlag country={cc} size={16} />}
        <span>{name}</span>
      </span>
    );
}

/** One style as a kit tile (T428, T431): the photograph of people doing
 *  it, the name, one line of what the week is, and what the cheapest of them
 *  costs a person. The length sits in the control above the grid, so the
 *  tile names no days (owner, 2026-10-15). No count of trips: the list
 *  behind the tile is the answer. */
function StyleCard({ type, from, onPick, t }) {
  const name = typeLabel(type.slug, t, type.name);
  const desc = typeDesc(type.slug, t);
  return (
    <Card
      layout="tile"
      wrap
      className="jstyle-card ttile"
      data-style={type.slug}
      media={<TilePhotos urls={[type.hero?.url]} city={name} sizes={TILE_SIZES} maxWidth={960} ratio={[3, 2]} />}
      title={<span className="jcap-name jstyle-name">{name}</span>}
      onOpen={() => onPick(type.slug)}
      meta={desc ? <span className="jstyle-desc">{desc}</span> : null}
      price={from
        ? <span className="jcap-fig">{withMoney(t('journey.fromPp', { eur: SLOT }), <Money value={from.low} est />)}</span>
        : <span className="jcap-fig is-none">{t('journey.fromNone')}</span>}
    />
  );
}

/** "Jun to Sep" for a run of months, "Apr, May, Sep" otherwise. */
function monthsLine(months, lang, t) {
  const m = (months || []).filter((x) => x >= 1 && x <= 12).sort((a, b) => a - b);
  if (!m.length) return '';
  const run = m.every((x, i) => i === 0 || x === m[i - 1] + 1);
  if (run && m.length >= 3) {
    return t('journey.monthsRun', { from: monthsShort([m[0]], lang), to: monthsShort([m[m.length - 1]], lang) });
  }
  return monthsShort(m, lang);
}

/** One curated trip as a photo tile (T431, owner 2026-10-15): the
 *  photographs, swiped in place, the full title, where it is and the places
 *  it visits, the best months, and the range a person at the list's length.
 *  No day count (the length control above says it) and no difficulty word
 *  (the trip page explains the effort with its numbers). */
function JourneyCard({ card, length, onOpen, t, lang }) {
  const months = monthsLine(card.months, lang, t);
  const at = cardTotal(card, length);
  const total = at && (Number.isFinite(at.low) || Number.isFinite(at.high));
  const codes = (card.countries || []).length ? card.countries : [card.cc];
  const where = codes.filter(Boolean).map((cc) => localCountryName(cc, cc === card.cc ? card.country : null, lang)).join(', ');
  const urls = (card.photos || []).length ? card.photos : [card.hero?.url];
  // The card's photograph grows into the page's hero (rule "List to
  // detail", T397); without View Transitions the page opens as before.
  const open = (e) => openShared(e.currentTarget.closest('.card'), card.id, () => onOpen(card));
  // The title is a real link to the week's address (rule "Navigation", T474):
  // a plain click opens the page here, a modifier click is the browser's.
  const openLink = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    open(e);
  };
  return (
    <Card
      layout="tile"
      wrap
      className="jcard ttile"
      data-trip={card.id}
      media={<TilePhotos urls={urls} city={card.title} iso2={card.cc} onOpen={open} sizes={TILE_SIZES} maxWidth={960} ratio={[3, 2]} />}
      title={<span className="jcard-title">{card.title}</span>}
      href={journeyHash(card.id)}
      onOpen={openLink}
      meta={(
        <span className="ttile-meta">
          <span className="ttile-line">
            <CountryFlag country={card.cc} size={16} className="ttile-flag" />
            <span>{where}</span>
          </span>
          {(card.visits || []).length > 0 && (
            <span className="ttile-line">
              <RouteIcon size={16} aria-hidden="true" />
              <span>{card.visits.join(', ')}</span>
            </span>
          )}
          {months && (
            <span className="ttile-line">
              <CalendarIcon size={16} aria-hidden="true" />
              <span>{months}</span>
            </span>
          )}
        </span>
      )}
      price={total
        ? <span className="jcap-fig">{withMoney(t('journey.rangePp', { range: SLOT }), <Money low={at.low} high={at.high} est />)}</span>
        : null}
    />
  );
}

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
      .filter((c) => c.cc !== country && !(c.countries || []).includes(country)
        && Number.isFinite(c.lat) && Number.isFinite(c.lon))
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

export function JourneysSection({
  q, country, view, onView, onOpen, onComposed, countryName, t, lang,
  geoOf = null, onAllCountries = null, onClearSearch = null,
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
  const [library, setLibrary] = useState(null);     // every trip, for the edges and from-prices
  const pickLength = (next) => { setLength(next); writeTripLength(next); };

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
  // edges both read it. Loaded once the grid or a list is on screen.
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

  // The home grid, narrowed by the shared country filter: a style with
  // nothing in the chosen country is absent, not greyed. Hiking leads.
  const types = useMemo(() => {
    if (!index) return [];
    const list = index.types.filter((tp) => !country || (tp.countries || []).includes(country));
    return [...list.filter((tp) => tp.slug === LEAD_STYLE), ...list.filter((tp) => tp.slug !== LEAD_STYLE)];
  }, [index, country]);

  // The cheapest card of each style at the list's length, in the country
  // when one is chosen, so the figure on the card is one the list can show.
  const fromPrices = useMemo(() => {
    if (!library?.length) return {};
    const out = {};
    for (const tp of types) {
      const mine = library.filter((c) => c.type === tp.slug
        && (!country || c.cc === country || (c.countries || []).includes(country)));
      out[tp.slug] = styleFromPrice(mine, length, cardTotal);
    }
    return out;
  }, [library, types, length, country]);

  // The style's trips after the search and the country, before the filters:
  // the chips count from here, so a chip says how many it would show.
  const scoped = useMemo(() => {
    if (!cards) return null;
    let out = cards;
    if (country) {
      out = out.filter((c) => c.cc === country || (c.countries || []).includes(country));
    }
    if (query) {
      out = out.filter((c) => norm(`${c.title} ${c.country} ${c.sub || ''}`).includes(query));
    }
    return out;
  }, [cards, country, query]);
  // Tags (T089): the vocabulary is the style's common tags before any other
  // filter, so the buttons stay put. Each count is what that choice would
  // show with the other filters applied, so every count adds up to the list.
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
  // Clear all takes the cost, the month and the tag off; the length is how
  // the list is read, not a filter, so it stays (T376-g).
  const clearFilters = () => { setBand(null); setMonth(null); setTag(null); setCheapBeds(false); };
  const hasBeds = !!scoped && scoped.some((c) => (c.beds || []).length > 0);

  if (index === undefined) {
    return (
      <div className="places-list jsec tlib">
        <Skeleton n={6} kind="style" t={t} />
      </div>
    );
  }

  // The length control, the same on the library and on a style's list, so
  // the from-price of a style and the range of its trips agree.
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

  if (!view) {
    return (
      <div className="places-list jsec tlib">
        {/* A picked country has its own band above (DestinationsTab), so the
            head keeps only the length choice then. */}
        <header className={`dtab-head tlib-head${country ? ' is-bare' : ''}`}>
          {!country && <h2 className="dtab-title">{t('dtab.head.trips')}</h2>}
          {lengthControl}
        </header>
        {types.map((tp) => (
          <StyleCard key={tp.slug} type={tp} from={fromPrices[tp.slug]}
            onPick={onView} t={t} lang={lang} />
        ))}
        {index && types.length === 0 && country && (
          <div className="places-empty empty-act">
            <p>{t('journey.emptyCountryAll', { country: countryName(country) })}</p>
            {onAllCountries && (
              <Button variant="secondary" size="sm" className="cov-empty-btn" onClick={onAllCountries}>{t('cov.showAll')}</Button>
            )}
          </div>
        )}
        {!index && (
          <div className="places-empty places-loaderr" role="status">
            <ErrorBlock message={t('layer.loadFailed')}
              onRetry={() => { setIndex(undefined); setIndexTries((n) => n + 1); }}
              retryLabel={t('layer.retry')} />
          </div>
        )}
        {/* The composer's door: a different product, one quiet row (T428:
            its method sentence went). */}
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
  return (
    <div className="places-list jsec jsec-trips tlib">
      <header className="tlib-head is-style">
        <Button variant="quiet" size="sm" className="jsec-back" onClick={() => onView(null)}
          iconStart={<ArrowLeftIcon size={16} />}>
          {t('journey.backStyles')}
        </Button>
        <h2 className="dtab-title">{typeLabel(view, t, openType?.name)}</h2>
        {typeDesc(view, t) && <p className="tlib-desc">{typeDesc(view, t)}</p>}
      </header>
      {cards !== null && (
        <TripFilters
          lengthControl={lengthControl}
          beds={hasBeds || cheapBeds ? (
            <div className="tlib-beds">
              <Segmented
                size="sm"
                label={t('journey.bedsLabel')}
                value={cheapBeds ? 'cheap' : 'any'}
                onChange={(v) => setCheapBeds(v === 'cheap')}
                options={[
                  { value: 'any', label: t('journey.bedsAny') },
                  { value: 'cheap', label: t('journey.bedsCheap') },
                ]}
              />
              <InfoDot term="budget-beds" />
            </div>
          ) : null}
          band={bandOn}
          onBand={setBand}
          edges={edges}
          counts={counts}
          month={month}
          onMonth={setMonth}
          monthCounts={monthNumbers}
          tag={activeTag}
          onTag={setTag}
          tags={vocab}
          tagCounts={tagNumbers}
          sort={sort}
          onSort={setSort}
          onClear={clearFilters}
          resultCount={rows ? rows.length : 0}
          t={t}
          lang={lang}
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
            <div className="places-empty empty-act">
              <p>{t('journey.emptyFilters')}</p>
              <Button variant="secondary" size="sm" className="cov-empty-btn" onClick={clearFilters}>{t('journey.fltClear')}</Button>
            </div>
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
                <div className="places-empty empty-act">
                  <p>{t('journey.noneMatch')}</p>
                  <Button variant="secondary" size="sm" className="cov-empty-btn" onClick={onClearSearch}>{t('results.clearSearch')}</Button>
                </div>
              )
              : (
                <div className="places-empty empty-act">
                  <p>{t('journey.emptyType')}</p>
                  <Button variant="secondary" size="sm" className="cov-empty-btn" onClick={() => onView(null)}>{t('journey.backStyles')}</Button>
                </div>
              )
      )}
    </div>
  );
}
