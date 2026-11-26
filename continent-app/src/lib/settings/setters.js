/**
 * The Settings setters (G12, D10): one per field, built over App's own
 * state setters so the dates, the From place and the legacy readers
 * (dateFlex, the Explore month that lib/when.js reads) stay in step.
 *
 * Switching the When mode never clears another mode's value: the dates
 * stay in departDate/returnDate, the month in choices.when_month, the length in
 * choices.trip_nights.
 *
 * Pure apart from calling the setters it is given; no React.
 */
import {
  withDateMode, withMonth, withTripNights, withWay, withPriceView, withPriceSpan, withStart,
  legacyFlex, legacyXm, isYm, addMonth,
} from './model.js';
import { nearestTown, countryStartTown, countryAirports } from './start.js';

const noop = () => {};

/**
 * @param {object} deps  { setChoices, setFrom, setDepartDate, setReturnDate,
 *   setDateFlex, setExploreMonth, data, sweptOrigins, getChoices }
 *   getChoices () -> the current choices (for the month a mode switch keeps)
 */
export function makeSettingsSetters(deps = {}) {
  const {
    setChoices = noop, setFrom = noop, setDepartDate = noop, setReturnDate = noop,
    setDateFlex = noop, setExploreMonth = noop, data = null, sweptOrigins = null, getChoices = () => ({}),
  } = deps;

  const syncLegacy = (mode, ym) => {
    setDateFlex(legacyFlex(mode));
    setExploreMonth(legacyXm(mode, ym));
  };

  return {
    /** Use my current location: the nearest Viantra town to `pos` ({ lat, lon }).
     *  Returns the town, or null when the catalogue has none (the UI then
     *  shows its plain message and the list). */
    setStartHere(pos) {
      const town = nearestTown(data, pos);
      if (!town) return null;
      setFrom({ name: town.name, lat: town.lat, lon: town.lon, iso2: town.iso2, country: town.country });
      setChoices(withStart('here', { town: town.id }));
      return town;
    },
    /** A town or city the traveller picked ({ name, lat, lon, iso2?, country? }). */
    /** `place.l` (or `place.names`): its names by UI language, as the
     *  gazetteer gives them, so the chip says Brüssel in German (E7). */
    setStartPlace(place) {
      setFrom(place);
      setChoices(withStart('place', { names: place?.l || place?.names || null }));
    },
    /** A whole country (ISO2): ground ways from its start town, flights from
     *  every airport in it the sweep covers. Returns { town, airports } or
     *  null when Viantra has no airport town there. */
    setStartCountry(iso2) {
      const code = String(iso2 || '').toUpperCase();
      const town = countryStartTown(data, code);
      if (!town) return null;
      const airports = countryAirports(data, code, sweptOrigins);
      setFrom(town);
      // setFrom picks the nearest priced airport; the country's own wins.
      setChoices((prev) => withStart('country', {
        country: code,
        airports,
        origin: airports.includes(prev.origin) ? prev.origin : (airports[0] || prev.origin),
      })(prev));
      return { town, airports };
    },
    setDateMode(mode) {
      const c = getChoices() || {};
      // A month mode opened for the first time starts on next month.
      const ym = isYm(c.when_month) ? c.when_month : addMonth(new Date().toISOString().slice(0, 7));
      if (mode === 'month') setChoices(withMonth(ym));
      else setChoices(withDateMode(mode));
      syncLegacy(mode, ym);
    },
    /** Dates mode with a pair ('YYYY-MM-DD'); `end` may come later. */
    setDates(start, end = null) {
      if (start) setDepartDate(start);
      if (end) setReturnDate(end);
      setChoices(withDateMode('dates'));
      syncLegacy('dates', null);
    },
    setMonth(ym) {
      if (!isYm(ym)) return;
      setChoices(withMonth(ym));
      syncLegacy('month', ym);
    },
    setTripNights(n) { setChoices(withTripNights(n)); },
    setWay(mode) { setChoices(withWay(mode)); },
    setPriceView(view) { setChoices(withPriceView(view)); },
    setPriceSpan(span) { setChoices(withPriceSpan(span)); },
  };
}
