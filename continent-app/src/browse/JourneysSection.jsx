import React, { useEffect, useMemo, useState } from 'react';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { srcSetFor, fallbackSrc } from '../lib/heroImage.js';

/*
 * What these cards are really drawn at. They sit in .places-list, the same
 * grid the Destinations cards use (1 column below 640, 2 up to 1039, 3 above),
 * and on a desktop that list shares the window with the left panel, so the
 * photo comes out at 159px on a 375 phone and never wider than ~370.
 *
 * The old value promised 96vw on a phone and 560px on a desktop, both about
 * three times the truth, and `sizes` is a promise the browser believes: a
 * 310px card was taking the 960px rendering. Kept identical to
 * DestinationsTab's CARD_SIZES because it is literally the same grid.
 */
const CARD_SIZES = '(max-width: 1039px) 47vw, min(26vw, 370px)';
import {
  loadJourneyIndex, loadJourneyType, loadAllJourneyCards, typeLabel, diffLabel, monthsShort,
  coverageFacts, eurRange,
} from '../lib/journeys.js';
import { SHORT, cardTotal, readTripLength, writeTripLength } from '../lib/tripLength.js';
import { bandCounts, costEdges, filterByBand } from '../lib/tripFilters.js';
import { filterByTag, tagCounts as countTags, tagVocabulary } from '../lib/tripTags.js';
import { TripFilters } from './TripFilters.jsx';
import { ArrowLeftIcon, ChevronRightIcon, RouteIcon } from '../components/Icons.jsx';
import { ErrorBlock } from '../components/StateBlocks.jsx';
import { haversineKm } from '../lib/nearby.js';
import { FAR_KM } from '../lib/coverageCases.js';
import { MonoLine } from './CoverageEmpty.jsx';

/**
 * The Trips category's front door: the curated trip library, browsed style
 * first.
 *
 * Ten styles (cycling, trail running, city, cozy towns, road trips, hiking,
 * culinary, winter sports, nature escapes, water sports), each a full-bleed
 * photo card carrying nothing but the style's name and how many weeks are
 * written in it. Tapping one lists that style's trips as photo cards, and
 * tapping a trip opens the JourneyPage with the whole plan.
 *
 * The composed city routes (pipeline/trips, 2 to 14 days, priced) keep their
 * own door at the end of the grid: they are a different product, built by
 * the composer rather than written, and mixing the two lists would put a
 * scored, priced card beside an editorial one and invite the reader to
 * compare numbers that do not exist on both.
 *
 * The tab's shared search field and country filter narrow the style list
 * too: a card whose trips are all filtered out is not rendered at all.
 */

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l');

/** One style as a photo card: the photograph, the name, the count. */
function StyleCard({ type, n, onPick, t }) {
  const hero = type.hero;
  return (
    <button className="places-ccard jstyle-card" onClick={() => onPick(type.slug)}>
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
        : <span className="places-card-img places-card-noimg" aria-hidden="true" />}
      <span className="places-card-scrim" aria-hidden="true" />
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name jstyle-name">{typeLabel(type.slug, t, type.name)}</span>
          <span className="places-card-sub">
            <span>{t(n === 1 ? 'journey.oneTrip' : 'journey.nTrips', { n })}</span>
          </span>
        </span>
        <span className="places-card-right">
          <ChevronRightIcon size={15} className="places-card-chev" />
        </span>
      </span>
    </button>
  );
}

/** One curated trip as a photo card: hero, title, where, three plain facts.
 *  Deliberately spare: the whole argument lives one tap away. */
function JourneyCard({ card, length, onOpen, t, lang }) {
  const months = monthsShort(card.months, lang);
  const diff = diffLabel(card.diffLabel, t);
  // The days and the total at the length the list is read at (T188).
  const at = cardTotal(card, length);
  const days = at?.days || card.days;
  const total = at ? eurRange({ low: at.low, high: at.high }, lang) : '';
  return (
    <button className="places-dcard jcard" onClick={() => onOpen(card)}>
      {card.hero?.url
        ? (
          <img
            className="places-card-img"
            src={fallbackSrc(card.hero.url, 500)}
            srcSet={srcSetFor(card.hero.url, 1280)}
            sizes={CARD_SIZES}
            alt=""
            loading="lazy"
          />
        )
        : <span className="places-card-img places-card-noimg" aria-hidden="true" />}
      <span className="places-card-scrim" aria-hidden="true" />
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name jcard-title">{card.title}</span>
          <span className="places-card-sub">
            <CountryFlag country={card.cc} size={12} className="places-card-flag" />
            <span>{[card.country, card.sub].filter(Boolean).join(', ')}</span>
          </span>
          <span className="places-card-facts jcard-facts">
            <span>{t('journey.nDays', { n: days })}</span>
            {total && <span className="mono">{total}</span>}
            {!total && card.tier && <span className="mono">{card.tier}</span>}
            {diff && <span>{diff}</span>}
            {months && <span>{months}</span>}
          </span>
        </span>
        <span className="places-card-right">
          <ChevronRightIcon size={15} className="places-card-chev" />
        </span>
      </span>
    </button>
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
  const [cards, setCards] = useState(null);        // the open style's trips
  // The two filters (T188): the length the list is read at, shared with the
  // trip page through lib/tripLength.js, and the cost band, which is not kept.
  const [length, setLength] = useState(readTripLength);
  const [band, setBand] = useState(null);
  const [tag, setTag] = useState(null);           // one tag at a time (T089)
  const [library, setLibrary] = useState(null);     // every trip, for the band edges
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
    if (!view) { setCards(null); return undefined; }
    let live = true;
    setCards(null);
    loadJourneyType(view).then((rows) => { if (live) setCards(rows || []); });
    return () => { live = false; };
  }, [view]);

  useEffect(() => {
    if (!view) return undefined;
    let live = true;
    loadAllJourneyCards().then((all) => { if (live) setLibrary(all); });
    return () => { live = false; };
  }, [view]);
  const edges = useMemo(() => costEdges(library, length), [library, length]);

  const query = norm(q);

  // The home grid, narrowed by the shared country filter: a style with
  // nothing in the chosen country is absent, not greyed.
  const types = useMemo(() => {
    if (!index) return [];
    return index.types.filter((tp) => !country || (tp.countries || []).includes(country));
  }, [index, country]);

  const coverage = useMemo(() => (index ? coverageFacts(index) : null), [index]);

  // The style's trips after the search and the country, before the band: the
  // band chips count from here, so a chip says how many it would show.
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
  // filter, so the buttons stay put. A tag button counts the trips it would
  // show with the band applied; a band chip counts the trips it would show
  // with the tag applied; the list is both, so every count adds up to it.
  const vocab = useMemo(() => tagVocabulary(scoped), [scoped]);
  const activeTag = tag && vocab.includes(tag) ? tag : null;
  const tagged = useMemo(() => (scoped ? filterByTag(scoped, activeTag) : null), [scoped, activeTag]);
  const rows = useMemo(
    () => (tagged ? filterByBand(tagged, { length, band, edges }) : null),
    [tagged, length, band, edges],
  );
  const counts = useMemo(() => bandCounts(tagged, { length, edges }), [tagged, length, edges]);
  const tagNumbers = useMemo(
    () => countTags(scoped ? filterByBand(scoped, { length, band, edges }) : [], vocab),
    [scoped, length, band, edges, vocab],
  );
  const filtersOn = (band != null && !!edges) || length === SHORT || activeTag != null;
  const clearFilters = () => { setBand(null); setTag(null); pickLength('week'); };

  if (index === undefined) return <div className="places-list"><p className="places-empty">{'…'}</p></div>;

  if (!view) {
    return (
      <div className="places-list jsec">
        {types.map((tp) => (
          <StyleCard key={tp.slug} type={tp} n={tp.n} onPick={onView} t={t} />
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
        {/* The composer's door: a different product, its own card. */}
        <button className="jcomposed-card" onClick={onComposed}>
          <span className="jcomposed-icon" aria-hidden="true"><RouteIcon size={20} /></span>
          <span className="jcomposed-text">
            <span className="jcomposed-title">{t('journey.composedTitle')}</span>
            <span className="jcomposed-sub">{t('journey.composedSub')}</span>
          </span>
          <ChevronRightIcon size={15} className="places-card-chev" />
        </button>
        {coverage && coverage.trips > 0 && (
          <p className="places-credit jsec-coverage">
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
          {rows && (
            <span className="jsec-n">
              {t(rows.length === 1 ? 'journey.oneTrip' : 'journey.nTrips', { n: rows.length })}
            </span>
          )}
        </h2>
      </div>
      {scoped && (
        <TripFilters
          length={length}
          onLength={pickLength}
          band={edges ? band : null}
          onBand={setBand}
          edges={edges}
          counts={counts}
          tag={activeTag}
          onTag={setTag}
          tags={vocab}
          tagCounts={tagNumbers}
          onClear={clearFilters}
          active={filtersOn}
          t={t}
          lang={lang}
        />
      )}
      {rows === null && <p className="places-empty">{'…'}</p>}
      {rows && rows.map((card) => (
        <JourneyCard key={card.id} card={card} length={length} onOpen={onOpen} t={t} lang={lang} />
      ))}
      {rows && rows.length === 0 && (
        scoped && scoped.length > 0
          ? (
            <div className="places-empty empty-act">
              <p>{t('journey.emptyFilters')}</p>
              <button type="button" className="cov-empty-btn" onClick={clearFilters}>{t('empty.clearFilters')}</button>
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
