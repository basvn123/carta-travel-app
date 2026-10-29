import React from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { FlightChip } from '../components/flights/Flights.jsx';
import { SaveButton } from './ExploreCards.jsx';
import { DayFrom, useCardFlight, monthsLine } from './JourneyCards.jsx';
import { cardPerDay } from '../lib/tripFilters.js';
import { cardTotal } from '../lib/tripLength.js';
import { countryName as localCountryName } from '../lib/countryName.js';
import { journeyHash, typeLabel } from '../lib/journeys.js';
import { openShared } from '../lib/sharedElement.js';

/**
 * One of Carta's trips in Explore's card (T824, owner 2026-10-29: "the image
 * with just one badge, how you can save it, and underneath how much it
 * costs"). The photograph with one badge (In season this month, else the
 * trip's length) and the bookmark on it; under it, straight on the page
 * ground with no box: the title, where it is and how many places it
 * visits, its style and best months, and one price, from a person a day,
 * with the cheapest return flight beside it when the sweep has one. On a
 * phone it lies on its side, the way Explore's does.
 */
export function TripPlaceCard({ card, length, month, saved = false, onToggleSave, onOpen, t, lang, sizes }) {
  const perDay = cardPerDay(card, length);
  const flight = useCardFlight(card, length);
  const days = cardTotal(card, length)?.days || card.days || length;
  const codes = (card.countries || []).length ? card.countries : [card.cc];
  const where = codes.filter(Boolean).map((cc) => localCountryName(cc, cc === card.cc ? card.country : null, lang)).join(', ');
  const stops = (card.visits || []).length;
  const inSeason = (card.months || []).includes(month);
  const months = monthsLine(card.months, lang, t);
  const photo = (card.photos || [])[0] || card.hero?.url || '';
  const open = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openShared(e.currentTarget.closest('.tpc'), card.id, () => onOpen(card));
  };
  return (
    <article className="tpc" data-trip={card.id}>
      <a className="tpc-hit" href={journeyHash(card.id)} onClick={open}>
        <span className="tpc-media">
          <HeroImage url={photo} city={card.title} iso2={card.cc} className="tpc-img" ratio={[3, 2]} maxWidth={720} sizes={sizes} />
          <span className="tpc-badge">{inSeason ? t('tp.card.inSeason') : t('tp.card.days', { n: days })}</span>
        </span>
        <span className="tpc-body">
          <span className="tpc-name">{card.title}</span>
          <span className="tpc-where">
            <CountryFlag country={card.cc} size={14} className="tpc-flag" />
            <span>{[where, stops > 0 ? t(stops === 1 ? 'tp.card.placesOne' : 'tp.card.places', { n: stops }) : ''].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="tpc-facts">{[typeLabel(card.type, t, card.type), months].filter(Boolean).join(' · ')}</span>
          <span className="tpc-price">
            {Number.isFinite(perDay) ? <DayFrom value={perDay} t={t} /> : <span className="jcap-fig is-none">{t('journey.fromNone')}</span>}
            {flight && <FlightChip perSeat={flight.perSeat} airline={flight.out.airline} />}
          </span>
        </span>
      </a>
      {onToggleSave && (
        <SaveButton fav={saved} onToggle={() => onToggleSave(card.id)} t={t} tone="photo" className="tpc-save" name={card.title} />
      )}
    </article>
  );
}
