import { useEffect } from 'react';
import { plannerStore } from '../plannerStore.js';
import { normalizeSettings, withEngineEdits } from '../flow/tripSettings.js';
import { cityLabel } from '../../lib/placeName.js';

export function useWizardDraftSync({
  adults, arrivalId, babies, booked, buildMode, countries, dateMode, depIata, destinations,
  endDate, flexMonth, flexNights, includedIds, kids, nearAirports, nightlyFor, nights, order,
  originPlace, ownStays, pace, quiz, startDate, stayStyle, step, stepName, travelStyle,
  travelValues, tripPick, windowNights,
}) {
  // ---- The global planner draft (plannerStore) ---------------------------
  // The wizard is the writer; the store makes the draft survive tab hops and
  // reloads and gives other surfaces one place to read the context from.
  useEffect(() => {
    // T675: the flow's settings follow the engine's When and Who (row T653-a).
    const flowSettings = plannerStore.getState().settings;
    const engineSettings = (raw) => {
      const ns = normalizeSettings(raw);
      const next = withEngineEdits(ns, { dateMode, startDate, endDate, flexMonth, nights: windowNights, adults, kids, babies });
      return next === ns ? raw : next;
    };
    plannerStore.set({
      ...(flowSettings ? { settings: engineSettings(flowSettings) } : {}),
      origin: originPlace
        ? { name: originPlace.name, lat: originPlace.lat, lng: originPlace.lon, countryCode: originPlace.iso2 || '' }
        : null,
      nearbyAirports: nearAirports.map((a) => ({ iata: a.iata, name: a.name, distanceKm: a.km })),
      travelDates: {
        isFlexible: dateMode === 'flex',
        startDate,
        endDate,
        durationNights: windowNights || flexNights || 0,
        flexibleMonths: flexMonth ? [flexMonth] : [],
      },
      travelers: { adults, children: kids, babies, lifestyle: travelStyle },
      wizard: {
        step,
        // The step's name survives a renumbering of the list (T500).
        stepName,
        countries: [...countries],
        buildMode,
        tripPickId: tripPick?.id || null,
        dateMode,
        flexMonth,
        flexNights,
        quiz,
        // Everything else that decides which step a number means and what is
        // on it (T388, row T377-e): a reload lands on the same named step
        // with the same answers.
        booked,
        nights,
        order,
        travelValues,
        arrivalId,
        pace,
        stayStyle,
        ownStays,
        depIata,
      },
      selectedDestination: [...countries][0] || null,
      // How they told us they are getting there, and what they said it cost.
      // Carta no longer shops for a fare, so there is no cheapest or fastest
      // to claim and the store carries neither.
      selectedTransit: travelValues.out?.mode && !travelValues.out?.guessed
        ? {
          type: travelValues.out.mode === 'car' ? 'drive' : travelValues.out.mode,
          providerOrRoute: (travelValues.out.service || '').trim() || null,
          estimatedCostEur: Math.max(0, Math.round(Number(String(travelValues.out.eur ?? '').replace(',', '.')) || 0)),
          enteredByTraveller: true,
        }
        : null,
      stops: includedIds.map((id, i) => {
        const d = destinations[id];
        const nightly = d ? nightlyFor(id, d) : null;
        return {
          cityId: id,
          cityName: cityLabel(d?.city) || id,
          nights: nights[id] || 0,
          // Whole-group nightly from the same anchors the receipt uses.
          estimatedNightlyRateEur: nightly ?? 0,
          order: i,
        };
      }),
    });
    if (stayStyle === 'single') plannerStore.setItineraryType('single');
  }, [originPlace, nearAirports, dateMode, startDate, endDate, windowNights, flexNights,
    flexMonth, adults, kids, babies, travelStyle, countries, travelValues, includedIds, nights,
    stayStyle, step, buildMode, tripPick?.id, quiz, destinations, nightlyFor,
    booked, order, arrivalId, pace, ownStays, depIata, stepName]);
}
