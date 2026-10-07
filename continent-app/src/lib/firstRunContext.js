/**
 * The inputs a first-run receipt reads and writes (T099), handed down from
 * App once instead of threaded through every page that shows a receipt: the
 * catalogue, the traveller's choices (party, stay tier, lifestyle, airport),
 * the trip dates and the pair Carta picked as the default.
 *
 * Null outside the app shell (a test harness, a shared-trip screen), and the
 * receipt renders nothing then.
 */
import { createContext, useContext } from 'react';

export const FirstRunContext = createContext(null);

export function useFirstRun() {
  return useContext(FirstRunContext);
}
