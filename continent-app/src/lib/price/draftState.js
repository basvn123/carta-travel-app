// The trip draft as the planner prices it (T827). The trip planner prices
// its own state with the trip's stay, its eating habits (a finder trip's,
// until the app's Lifestyle moves), the flight ranking and the flights the
// wizard picked each way; the day planner used to price the stored draft at
// the app's stay and Lifestyle with no picked flights, so after another
// flight was picked in Getting there the days screen said 1,939.20 where
// the trip said 1,931.20 (row T826-a). Both read this now.
import { DEFAULT_LIFESTYLE } from '../runtime_pricing.js';
import { pickedLive } from '../../planner/wizard/flightChoices.js';

/** The eating habits the trip prices with (useTripPlanner's rule). */
export function draftLifestyle(draft, appLifestyle = null) {
  const tl = draft?.tripLifestyle;
  return tl?.profile && tl.base === JSON.stringify(appLifestyle || null)
    ? tl.profile
    : (appLifestyle || DEFAULT_LIFESTYLE);
}

/**
 * quoteTrip()'s state for a stored draft: the draft, its own stay tier, the
 * trip's eating habits, the flight ranking, and the picked flights merged
 * over any live answers (a pick wins, as in useTripPlanner).
 */
export function draftQuoteState(draft, { stayTier = 'home', appLifestyle = null, flightRank = null, liveAnswers = null } = {}) {
  if (!draft) return null;
  const picks = pickedLive(draft.flightPicks);
  const live = picks.length || liveAnswers?.size
    ? new Map([...(liveAnswers || []), ...picks])
    : null;
  return {
    ...draft,
    stayTier: draft.stayTier || stayTier,
    lifestyle: draftLifestyle(draft, appLifestyle),
    ...(flightRank ? { flightRank } : {}),
    ...(live ? { liveFlights: live } : {}),
  };
}
