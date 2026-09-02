import React, { useEffect, useMemo, useState } from 'react';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { srcSetFor } from '../lib/heroImage.js';
import {
  loadJourneyIndex, loadJourneyType, typeLabel, diffLabel, monthsShort,
} from '../lib/journeys.js';
import { ArrowLeftIcon, ChevronRightIcon, RouteIcon } from '../components/Icons.jsx';

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
            src={hero.url}
            srcSet={srcSetFor(hero.url, 1280)}
            sizes="(max-width: 639px) 96vw, (max-width: 1180px) 48vw, 560px"
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
function JourneyCard({ card, onOpen, t, lang }) {
  const months = monthsShort(card.months, lang);
  const diff = diffLabel(card.diffLabel, t);
  return (
    <button className="places-dcard jcard" onClick={() => onOpen(card)}>
      {card.hero?.url
        ? (
          <img
            className="places-card-img"
            src={card.hero.url}
            srcSet={srcSetFor(card.hero.url, 1280)}
            sizes="(max-width: 639px) 96vw, (max-width: 1180px) 48vw, 560px"
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
            <span>{t('journey.nDays', { n: card.days })}</span>
            {card.tier && <span className="mono">{card.tier}</span>}
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

export function JourneysSection({
  q, country, view, onView, onOpen, onComposed, countryName, t, lang,
}) {
  const [index, setIndex] = useState(undefined);   // undefined = loading
  const [cards, setCards] = useState(null);        // the open style's trips

  useEffect(() => {
    let live = true;
    loadJourneyIndex().then((ix) => { if (live) setIndex(ix); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!view) { setCards(null); return undefined; }
    let live = true;
    setCards(null);
    loadJourneyType(view).then((rows) => { if (live) setCards(rows || []); });
    return () => { live = false; };
  }, [view]);

  const query = norm(q);

  // The home grid, narrowed by the shared country filter: a style with
  // nothing in the chosen country is absent, not greyed.
  const types = useMemo(() => {
    if (!index) return [];
    return index.types.filter((tp) => !country || (tp.countries || []).includes(country));
  }, [index, country]);

  const rows = useMemo(() => {
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

  if (index === undefined) return <div className="places-list"><p className="places-empty">{'…'}</p></div>;

  if (!view) {
    return (
      <div className="places-list jsec">
        {index && (
          <p className="jsec-lede">
            {t('journey.homeLede', { n: index.n_trips })}
          </p>
        )}
        {types.map((tp) => (
          <StyleCard key={tp.slug} type={tp} n={tp.n} onPick={onView} t={t} />
        ))}
        {index && types.length === 0 && (
          <p className="places-empty">{t('journey.emptyType')}</p>
        )}
        {!index && <p className="places-empty">{t('journey.emptyType')}</p>}
        {/* The composer's door: a different product, its own card. */}
        <button className="jcomposed-card" onClick={onComposed}>
          <span className="jcomposed-icon" aria-hidden="true"><RouteIcon size={20} /></span>
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
          {rows && (
            <span className="jsec-n">
              {t(rows.length === 1 ? 'journey.oneTrip' : 'journey.nTrips', { n: rows.length })}
            </span>
          )}
        </h2>
      </div>
      {rows === null && <p className="places-empty">{'…'}</p>}
      {rows && rows.map((card) => (
        <JourneyCard key={card.id} card={card} onOpen={onOpen} t={t} lang={lang} />
      ))}
      {rows && rows.length === 0 && (
        <p className="places-empty">
          {country
            ? t('journey.emptyCountry', { country: countryName(country) })
            : t('journey.emptyType')}
        </p>
      )}
      {rows && rows.length > 0 && (
        <p className="places-credit">{t('journey.credit')}</p>
      )}
    </div>
  );
}
