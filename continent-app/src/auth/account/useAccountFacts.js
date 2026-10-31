import { useEffect, useState } from 'react';
import { fetchTripPlans } from '../tripPlanStorage.js';
import { fetchDayPlanRows } from '../dayPlanCloud.js';
import { fetchAskChats } from '../askChatCloud.js';
import { loadMemory } from '../pastTripMemory.js';
import { loadVisitedCountries } from '../../lib/visitedCountries.js';
import { visitedRecord } from '../../lib/myTrips.js';
import { useTogether } from '../../together/useTogether.js';
import { IS_ACCOUNT_MOCK, MOCK_FACTS } from './accountMock.js';

/**
 * What the Account page counts (T933, T936): the three figures under the
 * identity and the counts in Your data, each read from where Carta keeps it.
 *
 *   trips      the account's trip plans (trip_plans)
 *   countries  the visited record My trips draws: finished trips, memories
 *              and the countries marked by hand (lib/myTrips visitedRecord)
 *   friends    accepted friends (Together's store)
 *   saves      the shortlist, as App holds it
 *   photos     photos kept in trip memories on this device
 *   dayPlans   day plans in the account (day_plans, tombstones left out)
 *   chats      Ask Carta chats in the account (ask_chats, tombstones left out)
 *   nextTripDest  the first place of the next dated trip, for Your travel
 *
 * A figure whose read failed is null, and the page leaves it out: a part
 * without data is not rendered (no zero that is really "unknown").
 */
const EMPTY = { loaded: false, trips: null, countries: null, dayPlans: null, chats: null, photos: null, nextTripDest: null };

export function useAccountFacts({ user, destinations, favorites }) {
  const tg = useTogether();
  const [facts, setFacts] = useState(EMPTY);
  const userId = user?.id || null;

  useEffect(() => {
    if (IS_ACCOUNT_MOCK || !userId) { setFacts(EMPTY); return undefined; }
    let live = true;
    const settle = (p) => Promise.resolve().then(() => p).catch(() => null);
    Promise.all([
      settle(fetchTripPlans(userId)),
      settle(fetchDayPlanRows(userId)),
      settle(fetchAskChats(userId)),
    ]).then(([plans, days, chats]) => {
      if (!live) return;
      const today = new Date().toISOString().slice(0, 10);
      const list = Array.isArray(plans) ? plans : null;
      let countries = null;
      let photos = null;
      let nextTripDest = null;
      if (list) {
        const past = list.filter((p) => p.end_date && p.end_date < today);
        const memories = {};
        let shots = 0;
        list.forEach((p) => {
          const m = loadMemory(p.id);
          if (m) {
            if (past.includes(p)) memories[p.id] = m;
            shots += (m.photos || []).length;
          }
        });
        photos = shots;
        countries = visitedRecord({
          pastPlans: past, memories, destinations: destinations || {}, manualCountries: loadVisitedCountries(),
        }).countries.length;
        const next = list
          .filter((p) => p.start_date && p.start_date >= today)
          .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
          .find((p) => (p.destination_ids || []).some((id) => destinations?.[id]));
        nextTripDest = next ? (next.destination_ids || []).find((id) => destinations?.[id]) : null;
      }
      setFacts({
        loaded: true,
        trips: list ? list.length : null,
        countries,
        photos,
        nextTripDest,
        dayPlans: Array.isArray(days) ? days.filter((r) => !r.deleted_at).length : null,
        chats: Array.isArray(chats) ? chats.filter((r) => !r.deleted_at).length : null,
      });
    });
    return () => { live = false; };
  }, [userId, destinations]);

  if (IS_ACCOUNT_MOCK) return MOCK_FACTS;
  return {
    ...facts,
    friends: tg.signedIn ? tg.links.filter((l) => l.kind === 'friend').length : null,
    saves: favorites && typeof favorites.size === 'number' ? favorites.size : null,
  };
}
