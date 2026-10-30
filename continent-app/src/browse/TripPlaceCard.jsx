import React from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { FlightChip } from '../components/flights/Flights.jsx';
import { SaveButton } from './ExploreCards.jsx';
import { DayFrom, useCardFlight } from './JourneyCards.jsx';
import { cardPerDay } from '../lib/tripFilters.js';
import { cardTotal } from '../lib/tripLength.js';
import { countryName as localCountryName } from '../lib/countryName.js';
import { journeyHash } from '../lib/journeys.js';
import { openShared } from '../lib/sharedElement.js';

/**
 * One of Carta's trips (T824; T901, the owner's Plan home board
 * 2026-10-30): the card of Trips for you. The photograph carries one badge
 * (In season this month, else the trip's length), the bookmark, and on an
 * ink fade over its lower part the countries and the trip's name, two
 * lines at most. Under it, on the page ground: the flag, how many places
 * and nights, then one price a person a day with the cheapest return flight
 * on the same line, so every card in a row ends level. The style and the
 * months live on the trip's page and in the filters.
 */
export function TripPlaceCard({ card, length, month, saved = false, onToggleSave, onOpen, t, lang, sizes }) {
  const perDay = cardPerDay(card, length);
  const flight = useCardFlight(card, length);
  const days = cardTotal(card, length)?.days || card.days || length;
  const codes = (card.countries || []).length ? card.countries : [card.cc];
  const where = codes.filter(Boolean).map((cc) => localCountryName(cc, cc === card.cc ? card.country : null, lang)).join(', ');
  const stops = (card.visits || []).length;
  const nights = Math.max(1, days - 1);
  const inSeason = (card.months || []).includes(month);
  const photo = (card.photos || [])[0] || card.hero?.url || '';
  const open = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openShared(e.currentTarget.closest('.ctc'), card.id, () => onOpen(card));
  };
  const facts = [
    stops > 0 ? t(stops === 1 ? 'tp.card.placesOne' : 'tp.card.places', { n: stops }) : '',
    t(nights === 1 ? 'pf.home.nightsOne' : 'pf.home.nightsMany', { n: nights }),
  ].filter(Boolean).join(', ');
  return (
    <article className="ctc" data-trip={card.id}>
      <a className="ctc-hit" href={journeyHash(card.id)} onClick={open}>
        <span className="ctc-media">
          <HeroImage url={photo} city={card.title} iso2={card.cc} className="ctc-img" ratio={[4, 5]} maxWidth={720} sizes={sizes} />
          <span className="ctc-badge">{inSeason ? t('tp.card.inSeason') : t('tp.card.days', { n: days })}</span>
          <span className="ctc-over">
            {where && <span className="ctc-where">{where}</span>}
            <span className="ctc-name">{card.title}</span>
          </span>
        </span>
        <span className="ctc-meta">
          <CountryFlag country={card.cc} size={14} className="ctc-flag" />
          <span className="ctc-facts">{facts}</span>
        </span>
        <span className="ctc-price">
          {Number.isFinite(perDay) ? <DayFrom value={perDay} t={t} /> : <span className="jcap-fig is-none">{t('journey.fromNone')}</span>}
          {flight && <FlightChip perSeat={flight.perSeat} airline={flight.out.airline} />}
        </span>
      </a>
      {onToggleSave && (
        <SaveButton fav={saved} onToggle={() => onToggleSave(card.id)} t={t} tone="photo" className="ctc-save" name={card.title} />
      )}
    </article>
  );
}
