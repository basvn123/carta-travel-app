import { useMemo } from 'react';
import { addDays } from '../../lib/dates.js';
import { tripHeadline } from '../../lib/tripStory.js';
import { paidEur, PLANNER_BAG } from '../../lib/tripTotal.js';

export function useWizardHandOver({
  adults, arrivalId, babies, booked, destinations, effectiveStayTier, includedIds, kids, nights,
  orderedIncludedIds, originPlace, ownCarChosen, ownStays, pace, readyTrip, selectedCountries,
  t, travelLegs, travelValues, tripStartDate, bag = null,
}) {
  // The trip the wizard will hand over, as a value (T432). The running
  // estimate prices exactly this through lib/tripTotal.js, the planned trip
  // loads exactly this, so the two figures are one figure.
  const handOver = useMemo(() => {
    const orderedIds = readyTrip ? includedIds : orderedIncludedIds;
    const stops = orderedIds.map((id) => ({
      destinationId: id,
      nights: Math.max(1, nights[id] || 1),
      activities: [],
    }));
    const start = tripStartDate;
    // The end follows the stops as handed over (each at least one night), so
    // a stop left at 0 nights never ends the trip a day short (T812, from the
    // T815 date audit).
    const handedNights = stops.reduce((n, x) => n + x.nights, 0);
    const end = start && handedNights ? addDays(start, handedNights) : null;
    const stopCountries = [...new Set(orderedIds.map((id) => destinations[id]?.country).filter(Boolean))];
    const label = readyTrip
      ? tripHeadline(readyTrip, t)
      : (selectedCountries.length
        ? selectedCountries.map((c) => c.country).slice(0, 2).join(' & ')
        : stopCountries.slice(0, 2).join(' & '));
    const out = travelValues.out || {};
    const back = travelValues.back || {};
    const legModes = {};
    const ownLegs = {};
    for (const leg of travelLegs) {
      if (leg.kind !== 'inter') continue;
      const v = travelValues[leg.key];
      if (!v?.mode) continue;
      legModes[leg.index] = v.mode;
      const paid = paidEur(v.eur);
      if (paid > 0) ownLegs[leg.index] = { mode: v.mode, eur: paid };
    }
    const paidOut = paidEur(out.eur);
    const paidBack = paidEur(back.eur);
    const ownStaysNow = {};
    for (const id of orderedIds) {
      const v = paidEur(ownStays[id]);
      if (v) ownStaysNow[id] = v;
    }
    return {
      startDate: start,
      // Adults; children and babies are priced by their own rule (T458).
      groupSize: adults,
      children: kids,
      babies,
      stayTier: effectiveStayTier,
      // Driving there means driving between the stops too.
      transport: ownCarChosen ? 'owncar' : 'auto',
      pace,
      baggage: bag || PLANNER_BAG,
      anchorId: booked.travel && !ownCarChosen ? arrivalId : null,
      anchorOrigin: null,
      returnAnchorId: null,
      // Carta prices no transport, so this is always the traveller's own
      // figure, with each direction kept apart so an own car typed one way
      // keeps Carta's estimate for the other.
      ownFlight: {
        airline: [out.service, back.service].map((x) => (x || '').trim()).filter(Boolean).join(' / '),
        mode: out.mode || back.mode || 'fly',
        costTotal: Math.round((paidOut + paidBack) * 100) / 100,
        costOut: paidOut,
        costBack: paidBack,
        outDate: start || null,
        retDate: end,
      },
      carHome: ownCarChosen ? originPlace : null,
      legModes,
      ownLegs,
      ownStays: ownStaysNow,
      label,
      stops,
    };
  }, [readyTrip, includedIds, orderedIncludedIds, nights, tripStartDate, destinations,
    selectedCountries, travelValues, travelLegs, ownStays, adults, kids, babies, effectiveStayTier, ownCarChosen,
    pace, booked.travel, arrivalId, originPlace, t, bag]);
  return { handOver };
}
