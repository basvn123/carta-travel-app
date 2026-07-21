import { useCallback, useEffect, useRef } from 'react';
import { saveTrip, fetchUserSettings, saveUserSettings } from '../auth/tripStorage.js';

/** Keeps a signed-in user's filter/lifestyle preferences synced with their
 *  account: pulls saved settings once right after login (never when a shared
 *  link is already driving the view), and pushes local changes back
 *  (debounced) so they carry over to the next visit/device. Also exposes the
 *  "save this trip" / "load a saved trip" actions used by the detail panel
 *  and account panel.
 */
export function useAccountSync({
  user, cameFromUrl, hasLocalOrigin,
  choices, setChoices,
  priceMode, setPriceMode,
  countryFilter, setCountryFilter,
  tripKinds, setTripKinds,
  minTier, setMinTier,
  unescoOnly, setUnescoOnly,
  topBeachOnly, setTopBeachOnly,
  sortKey, setSortKey,
  selectedId, setSelectedId,
  departDate, setDepartDate,
  returnDate, setReturnDate,
  setAccountOpen, setAuthModalOpen,
}) {
  // The account id we've already pulled settings for (keyed by id, not a bare
  // boolean, so a second sign-in in the same page session re-hydrates for the
  // new account instead of being short-circuited by the first pull).
  const appliedForRef = useRef(null);
  // Whether the initial pull for the current account has finished. The push
  // effect must NOT fire before this, or a debounced save races the pull and
  // overwrites the account's saved preferences with local defaults.
  const hydratedRef = useRef(false);

  // Pull the signed-in user's saved settings once, right after login (never
  // when a shared link is already driving the view, see cameFromUrl above).
  useEffect(() => {
    if (!user) {
      // Signed out: reset so the next sign-in hydrates from that account.
      appliedForRef.current = null;
      hydratedRef.current = false;
      return;
    }
    if (appliedForRef.current === user.id) return;
    appliedForRef.current = user.id;
    if (cameFromUrl) {
      // A shared link is driving the view; skip the pull (it would fight the
      // link) but treat the account as hydrated so deliberate later edits save.
      hydratedRef.current = true;
      return;
    }
    fetchUserSettings(user.id).then((settings) => {
      if (!settings) return;
      if (settings.choices) {
        // The departure airport chosen on THIS device wins over the one in the
        // account snapshot, otherwise changing "flying from" didn't survive a
        // fresh open (the older synced origin silently clobbered it).
        const incoming = { ...settings.choices };
        if (hasLocalOrigin) {
          delete incoming.origin;
          delete incoming.home;
        }
        setChoices((prev) => ({ ...prev, ...incoming }));
      }
      if (settings.priceMode) setPriceMode(settings.priceMode);
      // Older accounts synced a single country string; normalize to the array shape.
      if (settings.countryFilter != null) {
        setCountryFilter(Array.isArray(settings.countryFilter)
          ? settings.countryFilter
          : (settings.countryFilter !== 'all' ? [settings.countryFilter] : []));
      }
      if (settings.tripKinds) setTripKinds(settings.tripKinds);
      if (settings.minTier != null) setMinTier(settings.minTier);
      // Legacy accounts synced a min-gems (1-5) beauty floor; map it onto the
      // closest rating tier once, until the next save overwrites it.
      else if (settings.minBeauty) {
        const mb = settings.minBeauty;
        setMinTier(mb >= 5 ? 3 : mb >= 4 ? 2 : mb >= 2 ? 1 : 0);
      }
      if (settings.unescoOnly != null) setUnescoOnly(settings.unescoOnly);
      if (settings.topBeachOnly != null) setTopBeachOnly(settings.topBeachOnly);
      if (settings.sortKey) setSortKey(settings.sortKey);
    }).catch(() => {}).finally(() => { hydratedRef.current = true; });
  }, [user, cameFromUrl, hasLocalOrigin]);

  // Keep the signed-in user's settings synced (debounced) so they carry over
  // to their next visit/device. Gated on hydratedRef so it never runs before
  // the initial pull, which would clobber the account's saved preferences.
  useEffect(() => {
    if (!user || !hydratedRef.current) return;
    const t = setTimeout(() => {
      saveUserSettings(user.id, {
        choices, priceMode, countryFilter, tripKinds, minTier, unescoOnly, topBeachOnly, sortKey,
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [user, choices, priceMode, countryFilter, tripKinds, minTier, unescoOnly, topBeachOnly, sortKey]);

  const handleSaveTrip = useCallback(async (destination) => {
    if (!user) { setAuthModalOpen(true); throw new Error('Sign in to save trips'); }
    await saveTrip(user.id, {
      destinationId: selectedId,
      city: destination.city,
      country: destination.country,
      departDate, returnDate, choices,
    });
  }, [user, selectedId, departDate, returnDate, choices]);

  const handleLoadTrip = useCallback((trip) => {
    setSelectedId(trip.destination_id);
    if (trip.depart_date) setDepartDate(trip.depart_date);
    if (trip.return_date) setReturnDate(trip.return_date);
    if (trip.choices) setChoices((prev) => ({ ...prev, ...trip.choices }));
    setAccountOpen(false);
  }, []);

  return { handleSaveTrip, handleLoadTrip };
}
