/**
 * The flights screen's state (D10, explore polish, flight-tab.md). A look-around:
 * picking a day, a flight or a home airport changes what the screen shows,
 * never the row or the trip; making it stick is the Trip dock's job.
 *
 * The pair, the bars and the airport chips come from sweep files Explore
 * already holds (no network). Only the day list asks /api/flights, for the
 * selected leg and day, 400 ms after the last tap (so swiping the strip does
 * not spend the 20-a-minute search limit) and only while the screen is shown.
 *
 * G12 (D10): every figure is a person's, whatever Settings says (the owner:
 * flights always per person), and the headline is the row's own way figure
 * until the traveller picks another flight, so it equals the cards.
 */
import { useEffect, useMemo, useState } from 'react';
import { flightLegs } from '../../lib/price/flight.js';
import { legCost, HOURS } from '../../lib/flights/flights.js';
import { useLiveDay, liveKey } from '../../lib/flights/useLiveFlights.js';
import { flightRows } from '../../planner/trip/changeFlight.js';
import { destAnchor } from '../../lib/origins.js';
import { seatsOf } from '../../lib/price/request.js';
import { fareWindow, fareDays, stripColumns, pairFigure, airportPairs } from '../../lib/flights/fareDays.js';

const DEBOUNCE_MS = 400;
const todayIso = () => new Date().toISOString().slice(0, 10);
const same = (a, b) => Boolean(a && b && a.date === b.date && a.airline === b.airline && a.dep === b.dep && a.price === b.price);

function fileFor(data, iata) {
  if (!iata) return null;
  if (data?.flights?.from === iata) return data.flights;
  return data?.flightsBy?.[iata] || null;
}

export function useFlightTab({ place, data, request, way = null, active }) {
  const selected = data?.flights?.from || null;
  const [home, setHome] = useState(selected);
  const file = fileFor(data, home);
  const airport = destAnchor(data?.destinations?.[place?.id]) || null;
  const party = useMemo(() => ({ ...(request?.group || {}), seats: seatsOf(request) }), [request]);
  const bagKey = request?.baggage;
  const now = Date.now();

  const rowLegs = useMemo(() => flightLegs(data?.flights, airport, request), [data, airport, request]);
  const homeLegs = useMemo(() => flightLegs(file, airport, request), [file, airport, request]);
  const [shown, setShown] = useState(() => ({ out: homeLegs?.out || null, back: homeLegs?.back || null }));
  const [dir, setDir] = useState('out');
  const [hours, setHours] = useState('any');
  // The sweep file can land after the sheet opened (data.flights is null
  // until then), and a trip change reprices the row: the screen follows the
  // row's pair again in both cases.
  useEffect(() => {
    if (home && home !== selected) return;
    if (!home && selected) setHome(selected);
    setShown({ out: rowLegs?.out || null, back: rowLegs?.back || null });
  }, [rowLegs]); // eslint-disable-line react-hooks/exhaustive-deps -- only a new row pair resets the look-around

  const pickHome = (iata) => {
    const legs = flightLegs(fileFor(data, iata), airport, request);
    setHome(iata);
    setShown({ out: legs?.out || null, back: legs?.back || null });
  };
  const backToList = () => {
    setHome(selected);
    setShown({ out: rowLegs?.out || null, back: rowLegs?.back || null });
  };

  const today = todayIso();
  const leg = shown[dir];
  const win = fareWindow(request, dir, { outDate: shown.out?.date || null, today });
  const strip = useMemo(
    () => stripColumns(fareDays(file, dir, airport, { ...win, after: dir === 'back' ? shown.out?.date || null : null, now })),
    // `now` moves every render; the strip only needs it per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [file, dir, airport, win.from, win.to, win.wanted, shown.out?.date],
  );

  // A day's bar becomes that leg; a way out past the shown way home pulls
  // the way home to the cheapest checked day after it, so the pair stays a
  // real return, never a home before out.
  const pickDay = (day) => {
    if (!day?.leg || day.state !== 'fare') return;
    if (dir === 'back') { setShown((s) => ({ ...s, back: day.leg })); return; }
    setShown((s) => {
      if (s.back && s.back.date > day.leg.date) return { ...s, out: day.leg };
      const bw = fareWindow(request, 'back', { outDate: day.leg.date, today });
      const backs = fareDays(file, 'back', airport, { ...bw, after: day.leg.date, now: Date.now() })
        .filter((d) => d.state === 'fare');
      const cheapest = backs.reduce((b, d) => (!b || d.leg.price < b.price ? d.leg : b), null);
      return { out: day.leg, back: cheapest };
    });
  };

  // The day search, debounced and only while the screen is shown.
  const o = dir === 'out' ? home : airport;
  const d = dir === 'out' ? airport : home;
  const date = leg?.date || null;
  const [query, setQuery] = useState(null);
  useEffect(() => {
    if (!active || !o || !d || !date) { setQuery(null); return undefined; }
    const id = setTimeout(() => setQuery({ o, d, date }), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [active, o, d, date]);
  const live = useLiveDay(query);
  const answer = live.status === 'ready' ? live.answer : null;
  // The tapped day reads 'loading' from the tap on, through the debounce,
  // so the old day's list or failure never stands under its title.
  const tapped = o && d && date ? liveKey(o, d, date) : null;
  const dayState = !date ? 'none' : live.id !== tapped || live.status === 'idle' ? 'loading' : live.status;

  const [lo, hi] = HOURS[hours] || HOURS.any;
  const current = leg ? { ...leg, cost: legCost(leg, { paying: 1, bagKey }) } : null;
  const day = flightRows({
    answer,
    current,
    prefs: hours === 'any' ? null : { direct: false, after: lo, before: hi },
    party: { paying: 1, babies: 0, bagKey },
    by: 'fare',
  });
  const pickLive = (f) => {
    const liveLeg = {
      date, price: f.price, airline: f.airline, dep: f.dep, arr: f.arr, stops: f.stops, min: f.min,
      checked: Date.parse(answer?.checked) || Date.now(), source: 'live',
    };
    setShown((s) => ({ ...s, [dir]: liveLeg }));
  };

  const figure = pairFigure(shown.out, shown.back, { party, bagKey });
  const rowFigure = rowLegs ? pairFigure(rowLegs.out, rowLegs.back, { party, bagKey }) : null;
  const picked = home !== selected || !same(shown.out, rowLegs?.out) || !same(shown.back, rowLegs?.back);
  // The row's plane figure a person (wayFor: flightPerSeat of the same
  // pair), so the screen opens on the cards' own number; a typical fare
  // stays labelled as one.
  const rowWay = way?.mode === 'plane' && way.perPerson > 0 ? way : null;
  const headline = !picked && rowWay
    ? { eur: rowWay.perPerson, typical: Boolean(rowWay.typical) }
    : figure ? { eur: figure.perPerson, typical: false } : null;
  const listEur = rowWay?.perPerson ?? rowFigure?.perPerson ?? null;
  const delta = picked && headline && listEur != null ? Math.round(headline.eur) - Math.round(listEur) : null;
  // When the shown price was checked: the older of the two legs.
  const checks = [shown.out?.checked, shown.back?.checked].filter((c) => Number.isFinite(c));
  const checked = checks.length ? Math.min(...checks) : null;
  const homes = useMemo(
    () => (airport ? airportPairs(data, airport, request, { party, bagKey }) : []),
    [data, airport, request, party, bagKey],
  );

  return {
    home, selected, file, airport, party, bagKey,
    rowLegs, shown, dir, setDir, leg, strip, win, pickDay,
    hours, setHours, day, dayState, answer, pickLive, retryDay: live.retry, dayReason: live.reason,
    figure, rowFigure, headline, picked, delta, checked, backToList,
    homes, pickHome,
  };
}
