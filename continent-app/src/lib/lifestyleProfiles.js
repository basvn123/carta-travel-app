/**
 * The Lifestyle presets, as a plain table (T474).
 *
 * Per-person presets, defined in the weekly cadence. Picking one applies the
 * preset in its native weekly cadence (a weekly rate like 5 dinners/week can't
 * be shown faithfully as a per-day integer, so the panel snaps back to per-week
 * - this keeps the priced spend exactly equal to the preset and lets the active
 * tile highlight correctly).
 *
 * Lives outside LifestylePanel.jsx so pure modules (lib/tripPrice.js, which
 * places a trip's written budget at the traveller's Lifestyle) and the node
 * tests can read it without a JSX loader. The panel re-exports it.
 */
import { DEFAULT_LIFESTYLE } from './runtime_pricing.js';

export const PROFILES = {
  Backpacker:      { cadence: 'week', dinners_per_week: 1, lunches_per_week: 3, fastfood_per_week: 4, drinks_per_week: 4,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 5 },
  Easygoing:       { ...DEFAULT_LIFESTYLE },
  Foodie:          { cadence: 'week', dinners_per_week: 7, lunches_per_week: 5, fastfood_per_week: 0, drinks_per_week: 5,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 0 },
  'Cafe & culture':{ cadence: 'week', dinners_per_week: 3, lunches_per_week: 5, fastfood_per_week: 1, drinks_per_week: 3,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 2 },
  Nightlife:       { cadence: 'week', dinners_per_week: 3, lunches_per_week: 2, fastfood_per_week: 4, drinks_per_week: 12, club_nights_per_week: 3, coffees_per_day: 0, self_catered_days_per_week: 1 },
  Family:          { cadence: 'week', dinners_per_week: 2, lunches_per_week: 4, fastfood_per_week: 3, drinks_per_week: 2,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 5 },
};
