import { cityLabel } from '../../lib/placeName.js';
import { useMemo, useState, useEffect } from 'react';
import { fetchDrivingRoute } from '../../lib/routing.js';

export function useTripMap({ data, pinTag, t, tp }) {
  // A flown trip starts and ends at an airport (T458): the planned map shows
  // it as a pin of its own, and the road to it is part of the drawn route.
  const flying = Boolean(tp.planned && tp.flight && !tp.flight.driving
    && (tp.flight.combinable || (tp.flight.own && (tp.flight.mode || 'fly') === 'fly')));
  // T874 (row T864-c): the airport the priced flight lands at or leaves from
  // (the finder's held leg can use another airport than the stop's anchor:
  // Lake Como flies into Malpensa, its anchor is Bergamo), else the anchor.
  const airportOf = (dest, flown = null) => {
    const iata = (flown && data?.meta?.origins?.[flown] ? flown : null) || dest?.anchor_airport || null;
    const o = iata ? data?.meta?.origins?.[iata] : null;
    return o && o.lat != null ? { lat: o.lat, lon: o.lon, city: `${cityLabel(o.city || iata)} ${iata}`, tag: t('plan.pinAirport'), plain: true, airport: true } : null;
  };
  const geoStops = tp.stopDetails.filter((s) => s.dest && s.dest.lat != null && s.dest.lon != null);
  const airIn = flying ? airportOf(geoStops[0]?.dest, tp.priced?.cartaFlight?.inAirport) : null;
  const airOut = flying ? airportOf(geoStops[geoStops.length - 1]?.dest, tp.priced?.cartaFlight?.outAirport) : null;
  // T1005: the trip's points for the drawn map on the trip page (TripTrace):
  // home's airport, the airports flown into and out of, the stops, the hops.
  const homeIata = tp.priced?.cartaFlight?.out?.from || tp.flight?.origin || null;
  const homeAir = homeIata ? data?.meta?.origins?.[homeIata] : null;
  const traceStopsKey = geoStops.map((s) => `${s.destinationId}:${s.nights}`).join('|');
  const traceHopsKey = (tp.priced?.legs || []).map((l) => l?.mode).join('|');
  const trace = useMemo(() => (geoStops.length ? {
    home: homeAir && homeAir.lat != null ? { lat: homeAir.lat, lon: homeAir.lon, name: cityLabel(homeAir.city || homeIata) } : null,
    airIn: airIn ? { lat: airIn.lat, lon: airIn.lon } : null,
    airOut: airOut ? { lat: airOut.lat, lon: airOut.lon } : null,
    stops: geoStops.map((s) => ({
      lat: s.dest.lat, lon: s.dest.lon, city: cityLabel(s.dest.city), nights: s.nights, iso2: String(s.dest.iso2 || '').toUpperCase(),
    })),
    hops: geoStops.slice(1).map((_, i) => tp.priced?.legs?.[i]?.mode || ''),
    driving: Boolean(tp.flight?.driving),
  } : null), [ // eslint-disable-line react-hooks/exhaustive-deps -- keyed by value, like mapStops below
    homeIata, homeAir?.lat, airIn?.lat, airIn?.lon, airOut?.lat, airOut?.lon, tp.flight?.driving,
    traceStopsKey, traceHopsKey,
  ]);
  const mapStopsKey = [
    airIn ? `${airIn.lat},${airIn.lon}` : '',
    ...geoStops.map((s) => `${s.dest.lat},${s.dest.lon},${cityLabel(s.dest.city)},${pinTag(s)}`),
    airOut ? `${airOut.lat},${airOut.lon}` : '',
  ].join('|');
  const mapStops = useMemo(
    () => [
      ...(airIn ? [airIn] : []),
      ...tp.stopDetails
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.dest && s.dest.lat != null && s.dest.lon != null)
        .map(({ s, i }) => ({
          lat: s.dest.lat, lon: s.dest.lon, city: cityLabel(s.dest.city), tag: pinTag(s),
          tagImg: tp.planned ? (s.dest.image?.url || null) : null, stopIndex: i,
        })),
      // Flying home from the same airport: the route still returns to it,
      // with no second pin on top of the first.
      ...(airOut ? [airIn && airIn.lat === airOut.lat && airIn.lon === airOut.lon ? { ...airOut, ghost: true } : airOut] : []),
    ],
    [mapStopsKey], // eslint-disable-line react-hooks/exhaustive-deps -- keyed by value on purpose, see above
  );
  // The pins TripMap draws (no ghost), and its indexes back to the trip's.
  const pinStops = useMemo(() => mapStops.filter((m) => !m.ghost), [mapStops]);
  const toStop = (i) => (pinStops[i]?.stopIndex ?? null);
  const toMapIndex = (stop) => (stop == null ? null : pinStops.findIndex((m) => m.stopIndex === stop));

  // Draw the real road route through the stops whenever there are two or more
  // (keyless OSRM, same as the day planner's walking route), while editing
  // AND once planned, so the line never cuts across water when a road exists.
  // Keyed on the coordinates so a stale response for a since-changed route is
  // ignored; falls back to the dashed straight-line hops when the router has
  // no answer (a genuine sea crossing).
  const routeKey = mapStops.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';');
  const [tripRoute, setTripRoute] = useState(null);
  useEffect(() => {
    if (mapStops.length < 2) { setTripRoute(null); return undefined; }
    let alive = true;
    fetchDrivingRoute(mapStops).then((r) => { if (alive && r) setTripRoute({ key: routeKey, ...r }); });
    return () => { alive = false; };
  }, [mapStops, routeKey]);
  const tripRouteOk = tripRoute && tripRoute.key === routeKey;
  return { trace, pinStops, toStop, toMapIndex, tripRoute, tripRouteOk };
}
