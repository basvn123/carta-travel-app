/**
 * The Flight tab's state (D10, explore polish, flight-tab.md). A look-around:
 * picking a day, a flight or a home airport changes what the tab shows,
 * never the row or the trip; making it stick is the Trip dock's job.
 *
 * The pair, the bars and the airport chips come from sweep files Explore
 * already holds (no network). Only the day list asks /api/flights, for the
 * selected leg and day, 400 ms after the last tap (so swiping the strip does
 * not spend the 20-a-minute search limit) and only while the tab is shown.
 */
import { useEffect, useMemo, useState } from 'react';
import { flightLegs } from '../../lib/price/flight.js';
import { legCost, HOURS } from '../../lib/flights/flights.js';
import { useLiveFlights, liveKey } from '../../lib/flights/useLiveFlights.js';
import { flightRows } from '../../planner/trip/changeFlight.js';
import { destAnchor } from '../../lib/origins.js';
import { seatsOf } from '../../lib/price/request.js';
import { fareWindow, fareDays, pairFigure, airportPairs, flightBasis } from '../../lib/flights/fareDays.js';

const DEBOUNCE_MS = 400;
// The planner's Change flight rule (ChangeFlight.jsx): no answer in 15 s
// reads as failed, so the list never spins for ever.
const FAIL_MS = 15000;
const todayIso = () => new Date().toISOString().slice(0, 10);
const same = (a, b) => Boolean(a && b && a.date === b.date && a.airline === b.airline && a.dep === b.dep && a.price === b.price);

function fileFor(data, iata) {
  if (!iata) return null;
  if (data?.flights?.from === iata) return data.flights;
  return data?.flightsBy?.[iata] || null;
}

export function useFlightTab({ place, data, request, view, active }) {
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
  // until then), and a trip change reprices the row: the tab follows the
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
    () => fareDays(file, dir, airport, { ...win, after: dir === 'back' ? shown.out?.date || null : null, now }),
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

  // The day search, debounced and only while the tab is the shown tab.
  const o = dir === 'out' ? home : airport;
  const d = dir === 'out' ? airport : home;
  const date = leg?.date || null;
  const [query, setQuery] = useState(null);
  useEffect(() => {
    if (!active || !o || !d || !date) { setQuery(null); return undefined; }
    const id = setTimeout(() => setQuery({ o, d, date }), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [active, o, d, date]);
  const queries = useMemo(() => (query ? [query] : []), [query]);
  const answers = useLiveFlights(queries);
  const answer = query ? answers.get(liveKey(query.o, query.d, query.date)) : undefined;
  const [failedKey, setFailedKey] = useState(null);
  const qKey = query ? liveKey(query.o, query.d, query.date) : null;
  useEffect(() => {
    if (!qKey || answer) return undefined;
    const id = setTimeout(() => setFailedKey(qKey), FAIL_MS);
    return () => clearTimeout(id);
  }, [qKey, answer]);
  const dayState = !date ? 'none' : answer ? 'ready' : failedKey === qKey && qKey ? 'failed' : 'loading';

  const [lo, hi] = HOURS[hours] || HOURS.any;
  const current = leg ? { ...leg, cost: legCost(leg, { paying: 1, bagKey }) } : null;
  const day = flightRows({
    answer: answer || null,
    current,
    prefs: hours === 'any' ? null : { direct: false, after: lo, before: hi },
    party: { paying: 1, babies: 0, bagKey },
  });
  const pickLive = (f) => {
    const liveLeg = {
      date, price: f.price, airline: f.airline, dep: f.dep, arr: f.arr, stops: f.stops, min: f.min,
      checked: Date.parse(answer?.checked) || Date.now(), source: 'live',
    };
    setShown((s) => ({ ...s, [dir]: liveLeg }));
  };

  const figure = pairFigure(shown.out, shown.back, { party, bagKey, group: view?.total });
  const rowFigure = rowLegs ? pairFigure(rowLegs.out, rowLegs.back, { party, bagKey, group: view?.total }) : null;
  const picked = home !== selected || !same(shown.out, rowLegs?.out) || !same(shown.back, rowLegs?.back);
  const delta = figure && rowFigure ? Math.round(figure.shown) - Math.round(rowFigure.shown) : null;
  const homes = useMemo(
    () => (airport ? airportPairs(data, airport, request, { party, bagKey }) : []),
    [data, airport, request, party, bagKey],
  );

  return {
    home, selected, file, airport, party, bagKey,
    rowLegs, shown, dir, setDir, leg, strip, win, pickDay,
    hours, setHours, day, dayState, answer, pickLive,
    figure, rowFigure, picked, delta, backToList,
    homes, pickHome,
    basis: flightBasis(request, shown, { picked }),
  };
}
