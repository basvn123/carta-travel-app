import { useMemo, useState, useEffect } from 'react';
import { localIntelFor } from '../../lib/localIntel.js';
import { cityCoords, haversineKm, withCityCoords } from '../../lib/runtime_pricing.js';
import { legTransportOptions } from '../../lib/transport.js';
import { fetchDrivingRoute } from '../../lib/routing.js';

export function useDayTrip({ activities, countryInsights, data, destinations, plan, stop }) {
  // Curated "where it's actually nicest" guide for this city (localIntel.js),
  // each named place resolved against the catalogue so it's one-tap addable.
  const intel = useMemo(() => {
    const g = localIntelFor(stop?.dest?.city || '');
    if (!g) return null;
    const areas = g.areas.map((a) => {
      const q = (a.match || a.name).toLowerCase();
      const idx = activities.items.findIndex((it, i) => !activities.suppressed.has(i)
        && (it.name || '').toLowerCase().includes(q));
      return { ...a, idx: idx >= 0 ? idx : null, item: idx >= 0 ? activities.items[idx] : null };
    });
    return { ...g, areas };
  }, [stop, activities]);

  // The stay address, entered ONCE (landing screen or in-plan), anchors the
  // whole day when it's actually in/near this city: the walking route starts
  // at the traveller's door, Carta orders stops from there, and the Google
  // Maps handoff includes it, it never has to be typed again.
  const stayAnchor = useMemo(() => {
    const p = plan?.stayPoint;
    if (!p || p.lat == null || p.lon == null || !stop?.dest) return null;
    const c = cityCoords(stop.dest);
    if (c.lat == null) return null;
    const km = haversineKm(p.lat, p.lon, c.lat, c.lon);
    return km != null && km <= 12 ? p : null;
  }, [plan, stop]);

  // ---- Day-trip transport: stay -> this city, ONE source of truth ----
  // The "Getting there" card, the timeline's first leg and the Google Maps
  // handoff all speak the same chosen mode, so "car is your best bet" never
  // sits above a three-hour "walk from your stay".
  const dayTripFrom = useMemo(() => {
    if (!plan?.standalone || !stop) return null;
    // Both ends are measured to the CITY centre, never the airport: for
    // airport-tier destinations dest.lat/lon is the runway, so a stay downtown
    // would otherwise read as a needless inter-city hop.
    return plan.stayPoint
      ? {
          city: plan.stayPoint.shortLabel || 'your stay',
          // The real address geocodes in Google Maps; '' forces the lat,lon
          // fallback rather than letting "your stay, Italy" become a query.
          gmapsName: plan.stayPoint.label || plan.stayPoint.shortLabel || '',
          lat: plan.stayPoint.lat,
          lon: plan.stayPoint.lon,
          country: stop.dest?.country,
        }
      : withCityCoords(destinations[plan.stayCityId] || null);
  }, [plan, stop, destinations]);

  const dayTrip = useMemo(() => {
    if (!dayTripFrom || dayTripFrom.lat == null || !stop?.dest) return null;
    const toDest = withCityCoords(stop.dest);
    if (!toDest || toDest.lat == null) return null;
    const kmAway = haversineKm(dayTripFrom.lat, dayTripFrom.lon, toDest.lat, toDest.lon);
    if (dayTripFrom.city === toDest.city || (kmAway != null && kmAway < 8)) {
      return { local: true, toDest };
    }
    const opts = legTransportOptions(dayTripFrom, toDest, 1, {
      carModel: data?.meta?.car_model || null,
      countryInsights,
    });
    return opts ? { ...opts, toDest } : null;
  }, [dayTripFrom, stop, data, countryInsights]);

  // Real road km + driving minutes from OSRM for the stay -> city leg. The
  // flat straight-line*1.3 model calls a 50-minute lakeside drive "24 min";
  // the actual routed road fixes both the distance and every mode's time.
  const [dayRoad, setDayRoad] = useState(null); // { key, km, min }
  const dayRoadKey = (dayTrip && !dayTrip.local && dayTrip.modes && dayTripFrom)
    ? `${dayTripFrom.lat.toFixed(4)},${dayTripFrom.lon.toFixed(4)}>${dayTrip.toDest.lat.toFixed(4)},${dayTrip.toDest.lon.toFixed(4)}`
    : null;
  useEffect(() => {
    if (!dayRoadKey) { setDayRoad(null); return; }
    let alive = true;
    fetchDrivingRoute([dayTripFrom, dayTrip.toDest]).then((r) => {
      if (alive && r) setDayRoad({ key: dayRoadKey, km: r.km, min: r.min });
    });
    return () => { alive = false; };
  }, [dayRoadKey]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by the rounded coordinates: the end points are fresh objects every render and listing them would refetch the road each time

  // Ride time per mode from a routed road leg: cars near the routed time
  // plus a dynamic parking padding, buses the same road with stops and a
  // wait, trains their own (rail-speed) model. Shared by the card and the
  // timeline's ride leg.
  const rideMinutes = (mode, roadKm, drivingMin) => {
    if (mode === 'car') {
      // Raw routed minutes lie: nobody teleports from the wheel to the sight.
      // Pad with 15% of the drive (floor 5, cap 20) for parking, paying and
      // walking in, so a 60-minute drive honestly reads as ~69.
      const parkPad = Math.min(20, Math.max(5, Math.round(drivingMin * 0.15)));
      return Math.max(5, Math.round(drivingMin + parkPad));
    }
    if (mode === 'bus') return Math.max(10, Math.round(drivingMin * 1.55 + 12));
    return Math.max(10, Math.round((roadKm / (roadKm < 60 ? 68 : 95)) * 60 + 15));
  };

  // What the card and timeline actually speak: the engine's estimate, refined
  // with the real routed road and filtered down to modes that exist where the
  // traveller is going (thin local transit = no train to offer).
  const dayTripView = useMemo(() => {
    if (!dayTrip || dayTrip.local || !dayTrip.modes) return dayTrip;
    const v = { ...dayTrip, modes: { ...dayTrip.modes } };
    const road = dayRoad && dayRoad.key === dayRoadKey ? dayRoad : null;
    const r2 = (x) => Math.round(x * 100) / 100;
    if (road) {
      const ratio = dayTrip.road_km > 0 ? road.km / dayTrip.road_km : 1;
      v.road_km = Math.round(road.km);
      v.real_road = true;
      v.modes.car = {
        ...v.modes.car,
        hours: r2(rideMinutes('car', road.km, road.min) / 60),
        eur_pp: r2((v.modes.car.eur_pp ?? 0) * ratio),
        eur_total: r2((v.modes.car.eur_total ?? 0) * ratio),
      };
      v.modes.bus = {
        ...v.modes.bus,
        hours: r2(rideMinutes('bus', road.km, road.min) / 60),
        eur_pp: r2(Math.max(5, 0.075 * road.km)),
      };
      if (v.modes.train) {
        v.modes.train = {
          ...v.modes.train,
          hours: r2(rideMinutes('train', road.km, road.min) / 60),
          eur_pp: r2(Math.max(8, 0.15 * road.km)),
        };
      }
    }
    // Only offer what's actually there: the pipeline's per-destination
    // transit_quality knows Lake Como's shore has no rail line.
    const lt = stop?.dest?.local_transport;
    if (lt?.transit_quality === 'poor') {
      delete v.modes.train;
      v.train_dropped = true;
    }
    if (lt?.reason && (lt.transit_quality === 'poor' || lt.transit_quality === 'limited')) {
      v.transit_reason = lt.reason;
    }
    // Re-pick the recommendation from the refined times and surviving modes.
    const score = (m) => (m.eur_pp ?? 99) + (m.hours ?? 9) * 3;
    v.recommended = Object.entries(v.modes).sort((a, b) => score(a[1]) - score(b[1]))[0][0];
    return v;
  }, [dayTrip, dayRoad, dayRoadKey, stop]);
  return { intel, stayAnchor, dayTripFrom, rideMinutes, dayTripView };
}
