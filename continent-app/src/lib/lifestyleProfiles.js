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
import { rule } from './price/config.js';

// T692: config/pricing.json lifestyle.profiles. Owner decision B8 (2026-10-24):
// one coffee a day in every preset but Backpacker.
export const PROFILES = rule('lifestyle.profiles');
