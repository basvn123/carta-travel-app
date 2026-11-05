import React from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { FlightChip } from '../components/flights/Flights.jsx';
import { SaveButton } from './ExploreCards.jsx';
import { DayFrom, useCardFlight } from './JourneyCards.jsx';
import { cardPerDay } from '../lib/tripFilters.js';
import { cardTotal } from '../lib/tripLength.js';
import { countryName as localCountryName } from '../lib/countryName.js';
import { journeyHash } from '../lib/journeys.js';
import { openShared } from '../lib/sharedElement.js';

/** "Pelion Kalderimia: Mansions, Plane Trees and…" -> the name and the rest. */
function splitTitle(title) {
  const s = String(title || '');
  const i = s.indexOf(': ');
  return i > 0 ? [s.slice(0, i), s.slice(i + 2)] : [s, ''];
}

/** The difficulty's own word ("Moderate"), from its scale sentence. */
function diffWord(t, n) {
  if (!Number(n)) return '';
  const k = Math.max(1, Math.min(5, Number(n)));
  return String(t(`journey.diffScale${k}`) || '').split(':')[0].trim();
}
const DIFF_TONE = { 1: 'is-easy', 2: 'is-easy', 3: 'is-mid', 4: 'is-hard', 5: 'is-hard' };

/**
 * One of Carta's trips (T824, T901; T1030, owner: "the words on the image
 * are cut off; under it '4 places, 6 nights' adds nothing").
 *
 * The photograph carries the In season badge, the bookmark and, on an ink
 * fade, the countries and the trip's name in full (a "Name: what it is"
 * title shows its name there, at most 39 characters, so it is never cut).
 * Under it, on the page ground, what decides a week:
 *
 *   what      the rest of the title ("Mansions, plane trees and…"), or the
 *             trip's highlights ("Sarajevo, Mostar, Kotor"), in full
 *   facts     how hard it is (the journey's own scale word, in its tone)
 *             and how many days
 *   price     one price a person a day, the cheapest flight beside it
 */
export function TripPlaceCard({ card, length, month, saved = false, onToggleSave, onOpen, t, lang, sizes }) {
  const perDay = cardPerDay(card, length);
  const flight = useCardFlight(card, length);
  const days = cardTotal(card, length)?.days || card.days || length;
  const codes = (card.countries || []).length ? card.countries : [card.cc];
  const where = codes.filter(Boolean).map((cc) => localCountryName(cc, cc === card.cc ? card.country : null, lang)).join(', ');
  const [name, rest] = splitTitle(card.title);
  const what = rest || (card.visits || []).slice(0, 4).join(', ');
  const level = diffWord(t, card.diff);
  const inSeason = (card.months || []).includes(month);
  const photo = (card.photos || [])[0] || card.hero?.url || '';
  const open = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openShared(e.currentTarget.closest('.ctc'), card.id, () => onOpen(card));
  };
  return (
    <article className="ctc" data-trip={card.id}>
      <a className="ctc-hit" href={journeyHash(card.id)} onClick={open} aria-label={[card.title, where].filter(Boolean).join(', ')}>
        <span className="ctc-media">
          <HeroImage url={photo} city={card.title} iso2={card.cc} className="ctc-img" ratio={[4, 5]} maxWidth={720} sizes={sizes} />
          {inSeason && <span className="ctc-badge">{t('tp.card.inSeason')}</span>}
          <span className="ctc-over">
            {where && <span className="ctc-where">{where}</span>}
            <span className="ctc-name">{name}</span>
          </span>
        </span>
        {what && <span className="ctc-what">{what}</span>}
        <span className="ctc-facts">
          {level && <span className={`ctc-level ${DIFF_TONE[card.diff] || 'is-mid'}`}>{level}</span>}
          <span className="ctc-days">{t('tp.card.days', { n: days })}</span>
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
