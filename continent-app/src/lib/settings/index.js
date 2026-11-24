// The Settings engine (G12, D10). UI lanes import from here and never
// re-derive a figure, a chip text or a start.
export {
  ORIGIN_KINDS, DATE_MODES, PRICE_SPANS, DEFAULT_TRIP_NIGHTS, MIN_TRIP_NIGHTS, MAX_TRIP_NIGHTS,
  readSettings, nextYm, addMonth, isYm, clampNights, whenSetOf, nightsSetOf,
  withDateMode, withMonth, withTripNights, withWay, withPriceView, withPriceSpan, withStart,
} from './model.js';
export { nearestTown, countryStartTown, countryAirports, startCountryOf, CAPITALS, MAX_COUNTRY_AIRPORTS } from './start.js';
export { grandTotal, priceFigure, priceSortValue, asModel } from './prices.js';
export { settingsSummary, whenText, datesText, startPlace } from './summary.js';
export { makeSettingsSetters } from './setters.js';
export { monthFrom, atMonth } from './monthFrom.js';
export { wayRowsFor, warmWays, wayKey, flightFiles, placeRow } from './ways.js';
