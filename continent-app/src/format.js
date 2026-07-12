// Shared display formatting used across the panels/list/map.

/** Rounded euro amount, e.g. "€1,234". Returns '-' for null/undefined. */
export function eur(n) {
  return n == null ? '-' : `€${Math.round(n).toLocaleString('en-GB')}`;
}

// Human labels for dest.costs.price_source (on-the-ground spend).
export const PRICE_SOURCE_LABELS = {
  numbeo_city: 'city prices',
  numbeo_direct: 'country prices',
  pli_scaled: 'estimated prices',
};

// Human labels for dest.accommodation.price_source (Airbnb nightly rate).
export const ACCOM_SOURCE_LABELS = {
  inside_airbnb_city: 'Airbnb city rates',
  inside_airbnb_country: 'Airbnb country rates',
  airbnb_pli_scaled: 'estimated Airbnb rates',
};
