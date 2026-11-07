import { useMemo, useRef, useEffect, useState } from 'react';
import { fromDraft } from '../flow/tripSettings.js';
import { plannerStore } from '../plannerStore.js';
import { arrivalFromImports, staysFromImports, nearestStop } from '../flow/importStays.js';
import { tripDaysBetween } from '../../lib/runtime_pricing.js';
import { monthOptions } from '../../lib/wizardFlights.js';

export function useWizardSelection({
  allCountries, arrivalId, countries, dateMax, dateMin, dateMode, destinations, endDate,
  flexNights, flowSteps, nights, order, setArrivalId, setCountries, setNights, setOrder,
  setOwnStays, startDate,
}) {
  // Memoized: these three feed downstream memos (companionsFor, mapCities, which
  // each scan the whole destinations map). Recreating them as fresh arrays every
  // render gave those memos new deps every render, so a Stay-step re-render
  // (typing, +/- nights) re-ran N x all-destinations haversine work each time.
  const selectedCountries = useMemo(
    () => allCountries.filter((c) => countries.has(c.country)),
    [allCountries, countries],
  );
  const includedIds = useMemo(
    () => order.filter((id) => (nights[id] || 0) > 0),
    [order, nights],
  );
  // T675 (row T657-b): stays read from uploaded bookings fill Your stays
  // once the catalogue is here: the town, the nights to the next check-in,
  // the price paid. Once per mount, and never over towns already chosen.
  const importedStays = useRef(false);
  useEffect(() => {
    if (importedStays.current || !flowSteps?.length || !Object.keys(destinations).length) return;
    importedStays.current = true;
    const s = fromDraft(plannerStore.getState());
    // An uploaded flight out answers "Where do you land?".
    if (s.booked.flights && !arrivalId) {
      const lands = arrivalFromImports(s.imports, destinations);
      if (lands) setArrivalId(lands);
    }
    if (order.length) return;
    let rows = s.booked.stays ? staysFromImports(s.imports, destinations, s.when) : [];
    // T675 (row T659-a): a trip under way starts where the traveller is,
    // for the nights until they go home.
    if (!rows.length && s.kind === 'now') {
      const here = nearestStop(s.now, destinations);
      if (here) rows = [{ id: here, nights: Math.min(21, s.when.nights || 1), eur: 0 }];
    }
    if (!rows.length) return;
    setOrder(rows.map((r) => r.id));
    setNights(Object.fromEntries(rows.map((r) => [r.id, r.nights])));
    setOwnStays((prev) => ({ ...Object.fromEntries(rows.filter((r) => r.eur > 0).map((r) => [r.id, r.eur])), ...prev }));
    setCountries((prev) => (prev.size ? prev : new Set(rows.map((r) => destinations[r.id]?.country).filter(Boolean))));
  }, [destinations, flowSteps]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot, guarded by importedStays: the rows are read once the catalogue arrives
  const totalNights = useMemo(
    () => includedIds.reduce((sum, id) => sum + (nights[id] || 0), 0),
    [includedIds, nights],
  );
  // One date model for every shape of trip: exact dates, or a number of
  // nights in a month. The old landed path asked its own way and then had to
  // be special-cased in nine places.
  const windowNights = dateMode === 'exact' ? tripDaysBetween(startDate, endDate) : flexNights;
  const months = useMemo(() => monthOptions(dateMin, dateMax), [dateMin, dateMax]);

  // ---- Origin-first: where does this trip leave from? --------------------
  // A typed address (geocoded on an explicit search, Nominatim fair use)
  // unlocks every fare-carrying airport within 200 km; until one is typed the
  // app's chosen departure airport stands in, so nothing here blocks anyone.
  const [originQuery, setOriginQuery] = useState('');
  const [originResults, setOriginResults] = useState([]);
  const [originBusy, setOriginBusy] = useState(false);
  return { selectedCountries, includedIds, totalNights, windowNights, months, originQuery, setOriginQuery, originResults, setOriginResults, originBusy, setOriginBusy };
}
