import React from 'react';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { Card, Money } from '../components/ui/index.js';
import { TilePhotos } from './PhotoGallery.jsx';
import { countryName as localCountryName } from '../lib/countryName.js';
import { typeLabel, typeDesc, monthsShort, journeyHash } from '../lib/journeys.js';
import { cardPerDay } from '../lib/tripFilters.js';
import { openShared } from '../lib/sharedElement.js';
import { CalendarIcon, RouteIcon } from '../components/Icons.jsx';
import { cardTotal } from '../lib/tripLength.js';
import { useFirstRun } from '../lib/firstRunContext.js';
import { FlightChip } from '../components/flights/Flights.jsx';
import { homeFlightSetup, journeyAirports, bestRoundTrip, backDate } from './cartaFlight.js';

/**
 * The trip library's two cards, one of each (T498): the style tile and the
 * trip tile, shared by the library (JourneysSection) and the rails on
 * Explore, the country page and the region page (TripStylesRow.jsx).
 *
 * One price a card (roadmap 1.3b rule 5, owner 2026-10-21): "From {eur} a
 * person a day" with the estimate mark, the low end at the list's length over its days
 * (lib/tripFilters.js perDayFrom). Never a range on a card.
 *
 * T518: beside it, one quiet flight chip, the cheapest return a person from
 * the home airport to the week's gateway near the app's dates, when the
 * sweep has one (cartaFlight.js). Nothing shows without a flight.
 */

// T431: the trip and style tiles, two across from 769 px and one on a phone;
// T457: in the full-width column, three from 1280 px (at most about 410 px
// wide) and four from 1600 px.
export const TILE_SIZES = '(max-width: 768px) 92vw, (max-width: 1279px) 46vw, 410px';
// In a rail (.dtab-strip): 80 percent of a phone column, then 2.4, 3.4 and
// 4.4 tiles across the container (30-section-opening.css).
export const RAIL_SIZES = '(max-width: 559px) 80vw, (max-width: 1079px) 40vw, 320px';

/** A sentence with the kit's Money in its {eur} slot (T451): the trip
 *  budgets are estimates, so they carry Explore's ~ and est. mark. */
const SLOT = '\u0001';
function withMoney(text, money) {
  const at = text.indexOf(SLOT);
  if (at < 0) return text;
  return <>{text.slice(0, at)}{money}{text.slice(at + SLOT.length)}</>;
}

/** "From {eur} a person a day" with the estimate mark, or null when there is no figure. */
export function DayFrom({ value, t }) {
  if (!Number.isFinite(value)) return null;
  return <span className="jcap-fig">{withMoney(t('journey.fromPpDay', { eur: SLOT }), <Money value={value} est />)}</span>;
}

/** One style as a kit tile (T428, T431): the photograph of people doing
 *  it, the name, one line of what the week is, and what the cheapest of
 *  them costs a person a day at the list's length. No count of trips: the
 *  list behind the tile is the answer. */
export function StyleCard({ type, perDay = null, flight = null, onPick, t, sizes = TILE_SIZES }) {
  const name = typeLabel(type.slug, t, type.name);
  const desc = typeDesc(type.slug, t);
  return (
    <Card
      layout="tile"
      wrap
      className="jstyle-card ttile"
      data-style={type.slug}
      media={<TilePhotos urls={[type.hero?.url]} city={name} sizes={sizes} maxWidth={960} ratio={[3, 2]} />}
      title={<span className="jcap-name jstyle-name">{name}</span>}
      onOpen={() => onPick(type.slug)}
      meta={desc ? <span className="jstyle-desc">{desc}</span> : null}
      price={Number.isFinite(perDay)
        ? (
          <>
            <DayFrom value={perDay} t={t} />
            {/* The style's cheapest return a person, when the caller has one
                ({ perSeat, airline }, T518). */}
            {flight && <FlightChip perSeat={flight.perSeat} airline={flight.airline} />}
          </>
        )
        : <span className="jcap-fig is-none">{t('journey.fromNone')}</span>}
    />
  );
}

/** The card's return flight a person: out on the app's leaving day, home
 *  after the card's nights at the list's length, cheapest gateway. */
// Shared with TripPlaceCard (T824).
// eslint-disable-next-line react-refresh/only-export-components
export function useCardFlight(card, length) {
  const ctx = useFirstRun();
  const fl = homeFlightSetup(ctx);
  const days = cardTotal(card, length)?.days || card.days || 7;
  const back = backDate(fl.from, days - 1);
  return React.useMemo(
    () => bestRoundTrip(fl.file, journeyAirports(card), fl.from, back, { paying: 1, bagKey: fl.bagKey }),
    [fl.file, card, fl.from, back, fl.bagKey],
  );
}

/** "Jun to Sep" for a run of months, "Apr, May, Sep" otherwise. */
// Shared with TripPlaceCard (T824).
// eslint-disable-next-line react-refresh/only-export-components
export function monthsLine(months, lang, t) {
  const m = (months || []).filter((x) => x >= 1 && x <= 12).sort((a, b) => a - b);
  if (!m.length) return '';
  // Each run of three or more months reads "Mar to Jun" (T502: a season
  // with a gap used to fall back to every month, "Mar, Apr, May, Jun, Sep").
  const runs = [];
  for (const x of m) {
    const last = runs[runs.length - 1];
    if (last && x === last[last.length - 1] + 1) last.push(x);
    else runs.push([x]);
  }
  return runs.map((r) => (r.length >= 3
    ? t('journey.monthsRun', { from: monthsShort([r[0]], lang), to: monthsShort([r[r.length - 1]], lang) })
    : monthsShort(r, lang))).join(', ');
}

/** One written trip as a photo tile (T431, owner 2026-10-15): the
 *  photographs, swiped in place, the full title, where it is and the places
 *  it visits, the best months, and one from-price a person a day at the
 *  list's length. No day count (the length control says it) and no
 *  difficulty word (the trip page explains the effort with its numbers). */
export function JourneyCard({ card, length, onOpen, t, lang, sizes = TILE_SIZES }) {
  const months = monthsLine(card.months, lang, t);
  const perDay = cardPerDay(card, length);
  const flight = useCardFlight(card, length);
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
      media={<TilePhotos urls={urls} city={card.title} iso2={card.cc} onOpen={open} sizes={sizes} maxWidth={960} ratio={[3, 2]} />}
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
      price={(
        <>
          <DayFrom value={perDay} t={t} />
          {flight && <FlightChip perSeat={flight.perSeat} airline={flight.out.airline} />}
        </>
      )}
    />
  );
}
