import React, { useEffect, useMemo, useState } from 'react';
import { CountryFlag } from '../components/CountryFlag.jsx';
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
import {
  loadJourneyIndex, loadJourneyType, loadAllJourneyCards, typeLabel, diffLabel, monthsShort,
  coverageFacts, eurRange, styleFromPrice, takePendingJourney,
} from '../lib/journeys.js';
import { cardTotal, readTripLength, writeTripLength } from '../lib/tripLength.js';
import {
  bandCounts, costEdges, filterByBand, filterByMonth, monthCounts as countMonths, sortCards,
} from '../lib/tripFilters.js';
import { filterByTag, tagCounts as countTags, tagVocabulary } from '../lib/tripTags.js';
import { TripFilters } from './TripFilters.jsx';
import { ArrowLeftIcon, ChevronRightIcon } from '../components/Icons.jsx';
import { ErrorBlock } from '../components/StateBlocks.jsx';
import { haversineKm } from '../lib/nearby.js';
import { FAR_KM } from '../lib/coverageCases.js';
import { MonoLine } from './CoverageEmpty.jsx';

/**
 * The Trips category's front door: the curated trip library, browsed style
 * first.
 *
 * Ten styles, hiking first because the launch speaks to hikers first
 * (PRODUCT.md), then the wire's order. Each style is a photo card with its
 * caption in a paper band under the photograph (rule "Caption band": no text
 * on a photo, no scrim): the name, how many weeks are written in it, and
 * what the cheapest of them costs a person at the length the list is read at
 * (rule "Cost on cards": "From €N a person" with its length, from the
 * cheapest member, never an average). Tapping one lists that style's trips
 * as photo cards, and tapping a trip opens the JourneyPage with the plan.
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

const eur0 = (n, lang) => `€${Math.round(n).toLocaleString(lang)}`;

/** A photograph, or the flag-and-name placeholder on paper-dim. */
function CardPhoto({ hero, cc, name }) {
  return (
    <span className="jcap-photo">
      {hero?.url
        ? (
          <img
            className="places-card-img"
            src={fallbackSrc(hero.url, 500)}
            srcSet={srcSetFor(hero.url, 1280)}
            sizes={CARD_SIZES}
            alt=""
            loading="lazy"
          />
        )
        : (
          <span className="places-card-img places-card-noimg jcap-noimg" aria-hidden="true">
            {cc && <CountryFlag country={cc} size={16} />}
            <span>{name}</span>
          </span>
        )}
    </span>
  );
}

/** One style as a photo card: the photograph, then the name, the count and
 *  the from-price in a band under it. */
function StyleCard({ type, n, from, onPick, t, lang }) {
  const name = typeLabel(type.slug, t, type.name);
  return (
    <button type="button" className="jstyle-card jcap-card" onClick={() => onPick(type.slug)}>
      <CardPhoto hero={type.hero} name={name} />
      <span className="jcap-band">
        <span className="jcap-name jstyle-name">{name}</span>
        <span className="jcap-fig mono">
          {from
            ? t('journey.fromPrice', { eur: eur0(from.low, lang), n: from.days })
            : t('journey.fromNone')}
        </span>
        <span className="jcap-meta">
          <span className="jcap-count mono">{n}</span>
          {' '}
          {t(n === 1 ? 'journey.oneTripWord' : 'journey.nTripsWord')}
        </span>
      </span>
    </button>
  );
}

/** One curated trip as a photo card: the photograph, then the title, where,
 *  the length, the range a person, the difficulty and the months. */
function JourneyCard({ card, length, onOpen, t, lang }) {
  const months = monthsShort(card.months, lang);
  const diff = diffLabel(card.diffLabel, t);
  // The days and the total at the length the list is read at (T188).
  const at = cardTotal(card, length);
  const days = at?.days || card.days;
  const total = at ? eurRange({ low: at.low, high: at.high }, lang) : '';
  return (
    <button type="button" className="jcard jcap-card" onClick={() => onOpen(card)}>
      <CardPhoto hero={card.hero} cc={card.cc} name={card.title} />
      <span className="jcap-band">
        <span className="jcap-name jcard-title">{card.title}</span>
        <span className="jcap-where">
          <CountryFlag country={card.cc} size={12} className="places-card-flag" />
          <span>{[card.country, card.sub].filter(Boolean).join(', ')}</span>
        </span>
        {total && (
          <span className="jcap-fig mono">{t('journey.rangePp', { range: total })}</span>
        )}
        <span className="jcap-meta">
          {[t('journey.nDays', { n: days }), diff, months].filter(Boolean).join(', ')}
        </span>
      </span>
    </button>
  );
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
                <button type="button" className="cov-near-row" onClick={() => onOpen(c)}>
                  <span className="cov-near-name">{c.title}</span>
                  <span className="cov-near-meta">
                    {countryName(c.cc)} <span className="mono">{nf(km)} km</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {onAllCountries && (
        <button type="button" className="cov-empty-btn" onClick={onAllCountries}>{t('cov.showAll')}</button>
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
  const [length, setLength] = useState(readTripLength);
  const [band, setBand] = useState(null);
  const [month, setMonth] = useState(null);
  const [tag, setTag] = useState(null);           // one tag at a time (T089)
  const [sort, setSort] = useState('written');
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

  // A link that opened the app on #journey=<id> (lib/journeys.js reads it
  // once at startup) opens that week as soon as the library is on screen.
  useEffect(() => {
    const id = takePendingJourney();
    if (!id) return undefined;
    let live = true;
    loadAllJourneyCards().then((all) => {
      if (!live) return;
      const card = all.find((c) => c.id === id);
      onOpen(card || { id, gw: null });
    });
    return () => { live = false; };
    // Once per mount: the pending id is handed over a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const coverage = useMemo(() => (index ? coverageFacts(index) : null), [index]);

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
    let out = list || [];
    if (!skipTag) out = filterByTag(out, activeTag);
    if (!skipMonth) out = filterByMonth(out, month);
    if (!skipBand) out = filterByBand(out, { length, band: bandOn, edges });
    return out;
  };
  const rows = useMemo(
    () => (scoped ? sortCards(apply(scoped), sort, length, lang) : null),
    // apply reads the same inputs listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, activeTag, month, bandOn, edges, length, sort, lang],
  );
  const counts = useMemo(
    () => bandCounts(apply(scoped, { skipBand: true }), { length, edges }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, activeTag, month, length, edges],
  );
  const tagNumbers = useMemo(
    () => countTags(apply(scoped, { skipTag: true }), vocab),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, month, bandOn, edges, length, vocab],
  );
  const monthNumbers = useMemo(
    () => countMonths(apply(scoped, { skipMonth: true })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, activeTag, bandOn, edges, length],
  );
  // Clear all takes the cost, the month and the tag off; the length is how
  // the list is read, not a filter, so it stays (T376-g).
  const clearFilters = () => { setBand(null); setMonth(null); setTag(null); };

  if (index === undefined) {
    return (
      <div className="places-list jsec">
        <Skeleton n={6} kind="style" t={t} />
      </div>
    );
  }

  if (!view) {
    return (
      <div className="places-list jsec">
        {coverage && coverage.trips > 0 && (
          <p className="jsec-coverage">
            {country
              ? t('journey.coverageCountry', {
                country: countryName(country),
                n: coverage.stylesIn(country),
                styles: coverage.styles,
              })
              : t('journey.coverage', {
                trips: coverage.trips,
                countries: coverage.countries,
                styles: coverage.styles,
                thin: coverage.thin,
              })}
          </p>
        )}
        {types.map((tp) => (
          <StyleCard key={tp.slug} type={tp} n={tp.n} from={fromPrices[tp.slug]}
            onPick={onView} t={t} lang={lang} />
        ))}
        {index && types.length === 0 && country && (
          <div className="places-empty empty-act">
            <p>{t('journey.emptyCountryAll', { country: countryName(country) })}</p>
            {onAllCountries && (
              <button type="button" className="cov-empty-btn" onClick={onAllCountries}>{t('cov.showAll')}</button>
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
        {/* The composer's door: a different product, a plain row. */}
        <button type="button" className="jcomposed-card" onClick={onComposed}>
          <span className="jcomposed-text">
            <span className="jcomposed-title">{t('journey.composedTitle')}</span>
            <span className="jcomposed-sub">{t('journey.composedSub')}</span>
          </span>
          <ChevronRightIcon size={15} className="places-card-chev" />
        </button>
      </div>
    );
  }

  const openType = (index?.types || []).find((tp) => tp.slug === view);
  return (
    <div className="places-list jsec">
      <div className="jsec-head">
        <button type="button" className="jsec-back" onClick={() => onView(null)}>
          <ArrowLeftIcon size={14} />
          <span>{t('journey.backStyles')}</span>
        </button>
        <h2 className="jsec-title">
          {typeLabel(view, t, openType?.name)}
          {rows && <span className="jsec-n mono">{rows.length}</span>}
        </h2>
      </div>
      {cards !== null && (
        <TripFilters
          length={length}
          onLength={pickLength}
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
              <button type="button" className="cov-empty-btn" onClick={clearFilters}>{t('journey.fltClear')}</button>
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
                  <button type="button" className="cov-empty-btn" onClick={onClearSearch}>{t('results.clearSearch')}</button>
                </div>
              )
              : (
                <div className="places-empty empty-act">
                  <p>{t('journey.emptyType')}</p>
                  <button type="button" className="cov-empty-btn" onClick={() => onView(null)}>{t('journey.backStyles')}</button>
                </div>
              )
      )}
      {rows && rows.length > 0 && (
        <p className="places-credit">{t('journey.credit')}</p>
      )}
    </div>
  );
}
