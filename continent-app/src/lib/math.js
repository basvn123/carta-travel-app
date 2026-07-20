// Shared numeric helpers for the pricing/cost modules. round2 was copy-pasted
// byte-for-byte into four files (runtime_pricing, trip_planner_pricing,
// transport, useTripPlanner); one definition here means the rounding rule can't
// silently drift between them.

/** Round to 2 decimals (euro cents). Passes null/undefined through as null. */
export function round2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}
