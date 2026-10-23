import React, { useEffect, useMemo, useState } from 'react';
import { Strip } from './SectionOpening.jsx';
import { JourneyCard, RAIL_SIZES } from './JourneyCards.jsx';
import { StoryRail, StoryCard, STORY_MAX, STORY_SIZES } from './StoryRail.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { PiggyIcon } from '../components/Icons.jsx';
import { Money } from '../components/ui/index.js';
import { loadJourneyIndex, loadAllJourneyCards, typeLabel, typeDesc } from '../lib/journeys.js';
import { fitLength, lengthOptions, readTripLength } from '../lib/tripLength.js';
import { inCountry, lowestPerDay, weeksFor } from '../lib/tripFilters.js';

/**
 * The trip library as rails (T498, roadmap 1.3b sections A, D and E): the
 * styles row on Explore's Places view and the weeks row on a country or a
 * region page. Each is a Strip with "See all"; the cards are the library's
 * own (JourneyCards.jsx), one price each, "From {eur} a person a day", marked as an estimate, at
 * the length the traveller last read the library at.
 *
 * A rail with nothing to show is absent, not an empty box: both return null
 * while loading and when empty.
 *
 * T587: the styles row is a StoryRail (StoryRail.jsx); the weeks row on the
 * country and region pages stays a Strip.
 */

const LEAD_STYLE = 'hiking';

/** Hiking first, then the wire's order (the library's own order). */
function orderStyles(types) {
  return [...types.filter((tp) => tp.slug === LEAD_STYLE), ...types.filter((tp) => tp.slug !== LEAD_STYLE)];
}

/** The whole library, once (lib/journeys.js caches the files). */
function useLibrary() {
  const [library, setLibrary] = useState(null);
  useEffect(() => {
    let live = true;
    loadAllJourneyCards().then((all) => { if (live) setLibrary(all || []); });
    return () => { live = false; };
  }, []);
  return library;
}

/** The styles rail: one style tile each, narrowed to the styles that have
 *  a week in `country` when one is given. */
export function TripStylesRow({ t, lang: _lang, country = null, onPick, onSeeAll, id = 'trip-styles' }) {
  const [index, setIndex] = useState(null);
  const library = useLibrary();
  useEffect(() => {
    let live = true;
    loadJourneyIndex().then((ix) => { if (live) setIndex(ix || null); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const length = useMemo(() => fitLength(readTripLength(), lengthOptions(library)), [library]);
  const styles = useMemo(() => {
    if (!index?.types) return [];
    const list = index.types.filter((tp) => !country || (tp.countries || []).includes(country));
    return orderStyles(list);
  }, [index, country]);
  const perDay = useMemo(() => {
    const out = {};
    if (!library) return out;
    for (const tp of styles) {
      out[tp.slug] = lowestPerDay(library.filter((c) => c.type === tp.slug
        && (!country || inCountry(c, country))), length);
    }
    return out;
  }, [library, styles, length, country]);

  if (!styles.length) return null;
  const lows = styles.map((tp) => perDay[tp.slug]).filter(Number.isFinite);
  const facts = lows.length
    ? [{ key: 'from', icon: PiggyIcon, figure: true, text: withMoney(t('rail.factFrom', { price: SLOT }), <Money value={Math.min(...lows)} est />) }]
    : [];
  // T587: a StoryRail, the lead card holding the heading and "See all", the
  // styles as tall photo cards (no Score and no status: a style has neither).
  return (
    <StoryRail id={id} title={t('journey.rowStyles')} line={t('rail.line.styles')} facts={facts}
      onSeeAll={onSeeAll} t={t} className="jrail-styles"
      stack={styles.filter((tp) => tp.hero?.url).slice(0, 3).map((tp) => ({ url: tp.hero.url, city: tp.slug }))}>
      {styles.map((tp) => (
        <StyleStoryCard key={tp.slug} type={tp} perDay={perDay[tp.slug]} onPick={onPick} t={t} />
      ))}
    </StoryRail>
  );
}

const SLOT = '\u0001';
/** A sentence with the kit's Money in its one slot. */
function withMoney(text, money) {
  const at = text.indexOf(SLOT);
  if (at < 0) return text;
  return <>{text.slice(0, at)}{money}{text.slice(at + SLOT.length)}</>;
}

/** One style as a StoryRail photo card: the photograph of people doing it,
 *  the name, one line of what the week is, and "From {price} a person a
 *  day", the cheapest of its weeks at the list's length. */
function StyleStoryCard({ type, perDay, onPick, t }) {
  const name = typeLabel(type.slug, t, type.name);
  const desc = typeDesc(type.slug, t);
  return (
    <StoryCard
      className="jstyle-story"
      data-style={type.slug}
      photo={<HeroImage url={type.hero?.url} city={name} maxWidth={STORY_MAX} sizes={STORY_SIZES} ratio={[4, 5]} />}
      title={name}
      onOpen={() => onPick(type.slug)}
      meta={desc ? <span>{desc}</span> : null}
      price={Number.isFinite(perDay)
        ? <span className="xprice">{withMoney(t('journey.fromPpDay', { eur: SLOT }), <Money value={perDay} est />)}</span>
        : <span className="jcap-fig is-none">{t('journey.fromNone')}</span>}
    />
  );
}

/** The weeks rail: the written weeks in `country`, or with `near`
 *  ({ lat, lon, km }) the weeks whose point lies within km of it. */
export function WeeksRow({ t, lang, id, title, country = null, near = null, onOpen, onSeeAll = null, max = 12 }) {
  const library = useLibrary();
  const nearLat = near?.lat;
  const nearLon = near?.lon;
  const nearKm = near?.km;
  const cards = useMemo(
    () => (library ? weeksFor(library, {
      country,
      near: Number.isFinite(nearLat) && Number.isFinite(nearLon) ? { lat: nearLat, lon: nearLon, km: nearKm } : null,
      max,
    }) : []),
    [library, country, nearLat, nearLon, nearKm, max],
  );
  const length = useMemo(() => fitLength(readTripLength(), lengthOptions(library)), [library]);

  if (!cards.length) return null;
  return (
    <Strip id={id} title={title} onSeeAll={onSeeAll} t={t} className="jrail jrail-weeks">
      {cards.map((card) => (
        <li key={card.id} className="dtab-item">
          <JourneyCard card={card} length={length} onOpen={onOpen} t={t} lang={lang} sizes={RAIL_SIZES} />
        </li>
      ))}
    </Strip>
  );
}
