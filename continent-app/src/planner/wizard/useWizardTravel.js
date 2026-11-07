import { useMemo, useCallback, useState, useEffect } from 'react';
import { cityLabel } from '../../lib/placeName.js';
import { addDays } from '../../lib/dates.js';
import { loadDossier } from '../../lib/dossier.js';
import { nearbyAirports } from '../../lib/wizardTransit.js';
import { publishedLeg, openJaw, prefillMode } from '../../lib/gettingThere.js';
import { useSettings } from '../../components/SettingsLine.jsx';

export function useWizardTravel({
  booked, data, depIataOk, destinations, drivingThere, homeIata, originCity, originCode,
  originPlace, originPoint, originRec, quiz, setTravelValues, stopDates, t, totalNights,
  tripDetail, tripStartDate,
}) {
  const homePoint = useMemo(() => ({
    city: originPlace?.name || originCity,
    country: null,
    iso2: originPlace?.iso2 || originRec?.iso2 || null,
    lat: originPoint?.lat ?? null,
    lon: originPoint?.lon ?? null,
    iata: depIataOk || homeIata || originCode || null,
  }), [originPlace, originCity, originRec, originPoint?.lat, originPoint?.lon, homeIata, originCode, depIataOk]);

  const pointOf = useCallback((id) => {
    const d = destinations[id];
    if (!d) return null;
    return {
      city: cityLabel(d.city),
      country: d.country,
      iso2: d.iso2,
      lat: d.city_lat ?? d.lat,
      lon: d.city_lon ?? d.lon,
      iata: d.iata || null,
      anchorIata: d.anchor_airport || null,
    };
  }, [destinations]);

  // Every hop of the trip, in order: out from home, stop to stop, home again.
  const travelLegs = useMemo(() => {
    if (!stopDates.length || !homePoint) return [];
    const legs = [];
    const first = pointOf(stopDates[0].id);
    const lastRow = stopDates[stopDates.length - 1];
    const last = pointOf(lastRow.id);
    const endDate = tripStartDate ? addDays(tripStartDate, totalNights) : '';
    if (first) {
      legs.push({
        key: 'out', kind: 'out', from: homePoint, to: first,
        date: stopDates[0].arrive,
        // A return search is what most people actually buy, so the outbound
        // link carries the way home too when both ends are flown.
        returnDate: endDate,
      });
    }
    for (let i = 0; i < stopDates.length - 1; i += 1) {
      const a = pointOf(stopDates[i].id);
      const b = pointOf(stopDates[i + 1].id);
      if (a && b) legs.push({ key: `leg${i}`, kind: 'inter', index: i, from: a, to: b, date: stopDates[i + 1].arrive });
    }
    if (last) {
      legs.push({ key: 'back', kind: 'back', from: last, to: homePoint, date: endDate });
    }
    return legs;
  }, [stopDates, homePoint, tripStartDate, totalNights, pointOf]);

  // ---- Getting there: what the step knows before anyone answers ----------
  // The airports that actually fly somewhere near the two ends of the trip,
  // and, where the dossier has it, how long the ride from the runway into town
  // takes. Only the two ends: the hops in between are not flown.
  const endIds = useMemo(() => {
    if (!stopDates.length) return { first: null, last: null };
    return { first: stopDates[0].id, last: stopDates[stopDates.length - 1].id };
  }, [stopDates]);
  const [endTransfers, setEndTransfers] = useState({});
  useEffect(() => {
    let live = true;
    const ids = [endIds.first, endIds.last].filter(Boolean);
    if (!ids.length) { setEndTransfers({}); return undefined; }
    Promise.all(ids.map((id) => loadDossier(id).then((d) => [id, d?.practical?.getting_there || null])))
      .then((rows) => { if (live) setEndTransfers(Object.fromEntries(rows)); });
    return () => { live = false; };
  }, [endIds.first, endIds.last]);

  /** The airports near one stop, each carrying the dossier's transfer time
   *  when that airport is the one the dossier names as the anchor. */
  const airportsFor = useCallback((id) => {
    const d = destinations[id];
    if (!d) return [];
    const got = endTransfers[id] || null;
    return nearbyAirports(data?.meta, d.city_lat ?? d.lat, d.city_lon ?? d.lon, { limit: 3 })
      .map((a) => (got && got.airport === a.iata
        ? { ...a, transferMin: got.transfer_min ?? null, transferMode: got.transfer_mode || null }
        : a));
  }, [destinations, endTransfers, data?.meta]);

  // The legs, with everything the step guesses on them: which airports serve
  // each end, what the trip's own composer measured for a hop, and the mode
  // that follows from both. A leg the traveller has already answered keeps
  // their answer; nothing here overwrites a choice.
  const gettingLegs = useMemo(() => {
    if (!travelLegs.length) return [];
    const inAir = endIds.first ? airportsFor(endIds.first) : [];
    const outAir = endIds.last ? airportsFor(endIds.last) : [];
    return travelLegs.map((leg) => {
      const isOut = leg.kind === 'out';
      const isBack = leg.kind === 'back';
      const pub = leg.kind === 'inter'
        ? publishedLeg(tripDetail, stopDates[leg.index]?.id, stopDates[leg.index + 1]?.id)
        : null;
      return {
        ...leg,
        airports: isOut ? inAir : isBack ? outAir : [],
        published: pub,
        // Travel they told us is already booked is not a question. Only the
        // legs that touch home were ever booked in that answer: the hops
        // between stops are the part this step is for.
        booked: booked.travel && (isOut || isBack),
      };
    });
  }, [travelLegs, tripDetail, stopDates, endIds, booked.travel, airportsFor]);

  // "Fly into BCN, home from GRO", when the far end of the trip has a
  // meaningfully closer airport than the one it started at.
  const jawHint = useMemo(() => {
    if (!booked.travel && gettingLegs.length > 1) {
      const jaw = openJaw(gettingLegs[0]?.airports, gettingLegs[gettingLegs.length - 1]?.airports);
      if (jaw) return t('travel.openJaw', { into: jaw.into.iata, home: jaw.home.iata });
    }
    return '';
  }, [gettingLegs, booked.travel, t]);

  // Every leg opens already answered. The guess is written into the same state
  // the traveller edits, once per leg, so it flows into finish() unchanged and
  // an answer already given is never overwritten.
  // T856: the way of travel the traveller chose (choices.transport_mode)
  // answers every leg it fits.
  const wayOfTravel = useSettings()?.transportMode || 'any';
  useEffect(() => {
    if (!gettingLegs.length) return;
    setTravelValues((prev) => {
      let next = prev;
      for (const leg of gettingLegs) {
        // A guess is not an answer: an older draft's guess is made again.
        if (prev[leg.key]?.mode && !prev[leg.key].guessed) continue;
        const mode = prefillMode(leg, {
          quiz,
          way: wayOfTravel,
          published: leg.published?.mode || '',
          // drivingThere, not the ownCarChosen alias below: that is declared
          // further down the component and this effect runs before it.
          drivingOwnCar: drivingThere,
        });
        if (!mode || mode === prev[leg.key]?.mode) continue;
        if (next === prev) next = { ...prev };
        // Marked as Carta's guess (T388): the draft and the recap only repeat
        // back what the traveller said, and a guess is not that.
        next[leg.key] = { ...next[leg.key], mode, guessed: true };
      }
      return next;
    });
  }, [gettingLegs]); // eslint-disable-line react-hooks/exhaustive-deps -- runs per new leg set only: re-running on quiz or drivingThere would refill a mode the traveller just cleared
  return { homePoint, travelLegs, gettingLegs, jawHint };
}
