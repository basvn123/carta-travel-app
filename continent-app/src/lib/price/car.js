/**
 * The car (T702, plan F6 and section 3): one hire model for every price that
 * holds a car. The model is the price configuration's (config/pricing.json
 * car.model, car.rental_by_country, car.fuel_by_country), the same values
 * car_layer.py bakes as meta.car_model, so the day price, the trip price and
 * the planner's car line read one table.
 *
 * A party pays for as many cars as it fills (car.model car_capacity): seven
 * people are two cars. That step is the one place a larger party pays more a
 * person (V6), and the line's basis names it (`cars`).
 */
import { round2 } from '../math.js';
import { rule } from './config.js';

const CAR = rule('car.model');

export const ENGINE_CAR_MODEL = Object.freeze({
  ...rule('car.model'),
  rental_eur_per_day_by_iso2: rule('car.rental_by_country'),
  fuel_price_by_iso2: rule('car.fuel_by_country'),
});

/** Rental-car cost for the whole trip (group total), from the car model:
 *  per-country day rate x seasonality x weekly discount. Groups bigger than
 *  one car's capacity pay for as many cars as they fill. Moved here from
 *  lib/transport.js (T712) so the day price does not load the leg engine. */
export function rentalEstimate(carModel, iso2, days, startDate, groupSize = 1) {
  if (!carModel || !days || days <= 0) return null;
  const byIso = carModel.rental_eur_per_day_by_iso2 || {};
  let rate = byIso[iso2] ?? carModel.rental_eur_per_day_default ?? CAR.rental_eur_per_day_default;
  const month = startDate ? Number(startDate.slice(5, 7)) : null;
  const season = month ? (carModel.rental_seasonality?.[String(month)] ?? 1) : 1;
  rate *= season;
  const cars = Math.max(1, Math.ceil((groupSize || 1) / Math.max(1, carModel.car_capacity || 4)));
  let total = rate * days * cars;
  if (days >= 7 && carModel.rental_weekly_discount_pct) {
    total *= 1 - carModel.rental_weekly_discount_pct / 100;
  }
  return { eur_total: round2(total), eur_per_day: round2(total / days), days, cars };
}

/** The car model a screen prices with: the wire's when it has one (the same
 *  values), else the configuration's. */
export const carModelOf = (data) => data?.meta?.car_model || ENGINE_CAR_MODEL;

/**
 * Hire for the party: { eur_total, eur_per_day, days, cars } or null.
 * `start` is a 'YYYY-MM-DD' (its month sets the season) or null.
 */
export function carHire(iso2, days, start, seats, model = ENGINE_CAR_MODEL) {
  return rentalEstimate(model, iso2, days, start, seats);
}
