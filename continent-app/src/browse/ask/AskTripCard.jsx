import React from 'react';
import { Button, Money } from '../../components/ui/index.js';
import { AirlineMark, FlightRow, FlightLink } from '../../components/flights/Flights.jsx';
import { BedIcon, ChevronDownIcon, MapPinIcon, SuitcaseIcon } from '../../components/Icons.jsx';
import { cheapestReturn, roundTripNear, legCost } from '../../lib/flights/flights.js';
import { destAnchor } from '../../lib/origins.js';
import { fetchDestPois } from '../../lib/appData.js';
import { RouteArrow } from './marks.jsx';
import { loadLiveStay, useLiveStaysVersion } from '../../lib/liveStays.js';
import { loadStays, useStaysVersion } from '../../lib/staysData.js';
import { quoteStay, tripRequest } from '../../lib/price/index.js';

/**
 * The trip around an answer's first place (T571): the flight there and back
 * from the home airport, where to stay and what it costs, what to do, and
 * the ways on into Carta (open the place, plan the trip). Every figure is
 * one the rest of the app shows: the flight is Google Flights' swept price
 * (airline, times, when checked, the link out), the bed and the day are the
 * row's own cost at the traveller's Lifestyle.
 *
 *   pick       the answer's first Pick ({ id, dest })
 *   month      the month the question named (1..12), else the settings dates
 *   trip       { origin, originName, flights, depart, back, party, stayTier, destinations }
 *   primary    this is the latest turn, so Plan this trip is the primary
 */
const THINGS = 3;

function monthKey(month, depart) {
  const now = new Date();
  const base = depart ? new Date(`${depart}T00:00:00`) : now;
  let y = base.getFullYear();
  if (!depart && month < now.getMonth() + 1) y += 1;
  if (depart && month < base.getMonth() + 1) y += 1;
  return `${y}-${String(month).padStart(2, '0')}`;
}

export function AskTripCard({ t, lang, pick, month = null, trip, primary, onOpen, onPlan }) {
  const { id, dest } = pick;
  const airport = destAnchor(trip.destinations?.[id]);
  const flight = React.useMemo(() => {
    if (!trip.flights || !airport || airport === trip.origin) return null;
    // The month asked about, else (no fare swept that far ahead) the
    // traveller's own dates; the card always prints the dates it found.
    const r = (month && cheapestReturn(trip.flights, airport, monthKey(month, trip.depart)))
      || roundTripNear(trip.flights, airport, trip.depart, trip.back);
    if (!r) return null;
    const leg = (l) => ({ ...l, from: l === r.back ? airport : trip.origin, to: l === r.back ? trip.origin : airport });
    return { out: leg(r.out), back: leg(r.back), perSeat: r.perSeat ?? r.out.price + r.back.price };
  }, [trip.flights, trip.origin, trip.depart, trip.back, airport, month]);

  // What to do: the place's own list, the one its page shows, so the chat
  // and the page say the same; else the first rated places from its shard.
  const own = (dest.activities || trip.destinations?.[id]?.activities)?.items;
  const [shard, setShard] = React.useState(null);
  React.useEffect(() => {
    if (own?.length) return undefined;
    let live = true;
    fetchDestPois(id).then((list) => {
      if (live) setShard([...list].sort((a, b) => (b.rate || 0) - (a.rate || 0)));
    });
    return () => { live = false; };
  }, [id, own]);
  const things = own?.length ? own.slice(0, THINGS) : shard && shard.slice(0, THINGS);

  const day = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' });
  const dates = flight ? t('askChat.trip.dates', {
    start: day.format(new Date(`${flight.out.date}T00:00:00`)),
    end: day.format(new Date(`${flight.back.date}T00:00:00`)),
  }) : null;
  const nights = flight
    ? Math.max(1, Math.round((Date.parse(flight.back.date) - Date.parse(flight.out.date)) / 86400000))
    : null;
  const cost = dest.cost || {};

  // T576: the bed for the trip's own nights (the flight's, else the
  // traveller's dates), at tonight's prices where Carta can ask for them
  // (/api/stays, T540): the same live reprice the place's own card uses.
  const full = trip.destinations?.[id] || null;
  const stayFrom = flight?.out.date || trip.depart || null;
  const stayTo = flight?.back.date || trip.back || null;
  const stayNights = stayFrom && stayTo
    ? Math.max(1, Math.round((Date.parse(stayTo) - Date.parse(stayFrom)) / 86400000)) : 0;
  const party = trip.party || 2;
  const staysVersion = useStaysVersion();
  const liveVersion = useLiveStaysVersion();
  React.useEffect(() => { if (full?.iso2) loadStays(full.iso2); }, [full?.iso2]);
  React.useEffect(() => {
    if (stayFrom && stayNights) loadLiveStay(id, stayFrom, stayNights, party);
  }, [id, stayFrom, stayNights, party, staysVersion]);
  // T702 (plan F6): the bed is the engine's, at the trip's party and dates.
  const bed = React.useMemo(
    () => (full && stayNights
      ? quoteStay(full, stayNights, stayFrom, tripRequest({ groupSize: party, stayTier: trip.stayTier }), trip.destinations)
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the versions say a stay or a live answer landed
    [full, trip.stayTier, party, stayNights, stayFrom, trip.destinations, staysVersion, liveVersion],
  );
  const bedLine = bed?.day?.lines?.find((l) => l.key === 'bed');
  const liveBed = bedLine?.quality === 'live' && bedLine.eur > 0 ? bedLine.eur : null;

  return (
    <section className="ac-trip" aria-label={t('askChat.trip.title', { place: dest.city })}>
      <details className="ac-trip-sec ac-trip-flight">
        <summary>
          <SuitcaseIcon size={20} className="ac-trip-icon" />
          <span className="ac-trip-route">
            <span className="ac-trip-h">{trip.origin}<RouteArrow /><span className="sr-only">{t('askChat.trip.to')}</span>{airport || dest.city}</span>
            <span className="ac-trip-sub">
              {flight ? dates : t('askChat.trip.flightNone', { origin: trip.originName || trip.origin })}
            </span>
          </span>
          {flight && (
            <span className="ac-trip-marks">
              <AirlineMark code={flight.out.airline} size="sm" />
              {flight.back.airline !== flight.out.airline && <AirlineMark code={flight.back.airline} size="sm" />}
            </span>
          )}
          {flight && (
            <span className="ac-trip-fig">
              <Money value={flight.perSeat} />
              <span className="ac-trip-unit">{t('askChat.trip.perPersonReturn')}</span>
            </span>
          )}
          {flight && <ChevronDownIcon size={16} className="ac-trip-chev" />}
        </summary>
        {flight && (
          <div className="ac-trip-legs">
            <FlightRow leg={flight.out} cost={legCost(flight.out)} dir="out" linkOut={false} />
            <FlightRow leg={flight.back} cost={legCost(flight.back)} dir="back" linkOut={false} />
            <FlightLink from={flight.out.from} to={flight.out.to} date={flight.out.date} back={flight.back.date} />
          </div>
        )}
      </details>

      <div className="ac-trip-sec">
        <BedIcon size={20} className="ac-trip-icon" />
        <div className="ac-trip-route">
          <span className="ac-trip-h">{t('askChat.trip.stay')}</span>
          <span className="ac-trip-sub">
            {liveBed != null
              ? <>{t('askChat.trip.bedFrom')} <Money value={liveBed} /> {t('askChat.trip.aNight')}</>
              : cost.stayEur != null
                ? <>{t('askChat.trip.bedFrom')} <Money value={cost.stayEur} est /> {t('askChat.trip.aNight')}</>
                : t('askChat.trip.stayNone')}
            {cost.foodEur != null && <>, {t('askChat.trip.food')} <Money value={cost.foodEur} est /> {t('askChat.trip.aDay')}</>}
          </span>
        </div>
      </div>

      <div className="ac-trip-sec">
        <MapPinIcon size={20} className="ac-trip-icon" />
        <div className="ac-trip-route">
          <span className="ac-trip-h">{t('askChat.trip.do')}</span>
          {things === null
            ? <span className="ac-trip-wait" aria-hidden="true" />
            : things.length
              ? <span className="ac-trip-sub">{things.map((x) => x.name).join(', ')}</span>
              : <span className="ac-trip-sub">{t('askChat.trip.doNone')}</span>}
        </div>
      </div>

      <div className="ac-trip-actions">
        <Button variant="secondary" size="sm" onClick={() => onOpen(id)}>{t('askChat.trip.open', { place: dest.city })}</Button>
        {onPlan && (
          <Button variant={primary ? 'primary' : 'secondary'} size="sm"
            onClick={() => onPlan({ stops: [{ dest: id, nights: nights || 6 }] })}>
            {t('ask.planThis')}
          </Button>
        )}
      </div>
    </section>
  );
}
