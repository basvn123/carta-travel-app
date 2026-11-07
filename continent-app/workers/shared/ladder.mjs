// Data access ladder flags (ROADMAP I16, T1213). Every flag is off unless its
// environment variable is exactly "1". The names live in config/access-ladder.json.
export const LADDER_FLAGS = Object.freeze({
  stopGoogleFlights: 'LADDER_STOP_GOOGLE_FLIGHTS',
  liveFlightSearch: 'LADDER_LIVE_FLIGHT_SEARCH',
  stopBookingScrape: 'LADDER_STOP_BOOKING_SCRAPE',
  stopHostelworldScrape: 'LADDER_STOP_HOSTELWORLD_SCRAPE',
  activityPrices: 'LADDER_ACTIVITY_PRICES',
});

export function ladderOn(env, flag) {
  const name = LADDER_FLAGS[flag];
  return Boolean(name) && String(env?.[name] ?? '') === '1';
}
