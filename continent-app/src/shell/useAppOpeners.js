import { useCallback, useState, useEffect, useRef } from 'react';
import { readJourneyFromUrl } from '../lib/journeys.js';
import { countryFromHash, countryHash } from '../lib/urlState.js';

export function useAppOpeners({
  goToTab, setCountryFilter, setPendingBeach, setPendingCategory, setPendingCountry,
  setPendingCycle, setPendingDaySeed, setPendingLake, setPendingMountain, setPendingRegion,
  setPendingSharedTrip, setPendingTrail, setPendingTrip, setPendingTripPlanId,
  setPendingTripSeed,
}) {
  // The six category tiles (T498, roadmap 1.3b A) and every door that names
  // a layer come through here. The country travels with the traveller
  // (rule 3): Italy on Places stays Italy on Beaches, and back again.
  // `query` (T600) is the text typed in the overview's Where field: it rides
  // in the address as `dq` and the layer starts with it in its own Where.
  const openExploreSection = useCallback((key, cc = undefined, query = '') => {
    if (key === 'places') {
      if (cc !== undefined) setCountryFilter(cc ? [cc] : []);
      goToTab('map');
      return;
    }
    setPendingCategory(key);
    // '' says "every country" (Places had none), null leaves it alone.
    if (cc !== undefined) setPendingCountry(cc ? String(cc).toUpperCase() : '');
    goToTab('places', { cat: key, q: typeof query === 'string' ? query : '' });
  }, [goToTab, setCountryFilter, setPendingCategory, setPendingCountry]);
  // The trip library inside Explore (owner T484-e, T489-a): "See all" on the
  // Trip styles row, one style from it, or a country's weeks.
  const [pendingStyle, setPendingStyle] = useState(null);
  // T1030 (owner: "two different pages; use the one from Plan"): every door
  // to the trip library (a style tile, a country's weeks) opens Plan's
  // Carta's own trips, with the style or the country already chosen.
  const [planOpen, setPlanOpen] = useState(null);
  // T1037: Plan past its opening shows its own page bar, not the app head.
  const [planInner, setPlanInner] = useState(false);
  const openTripStyles = useCallback((slug = null, cc = null) => {
    setPlanOpen({ screen: 'carta', style: slug || null, cc: cc ? String(cc).toUpperCase() : null, n: Date.now() });
    goToTab('planstart');
  }, [goToTab]);
  // A trip's page closes back onto Plan's Carta's own trips (T1030): the
  // trip library has one home, so a week never lands on a second list.
  // The page closes by stepping history back, and App's own Back handling
  // restores the tab under it on that same popstate, so the move to Plan
  // waits one tick to land after it.
  const onJourneyClosed = useCallback(() => {
    window.setTimeout(() => {
      setPlanOpen({ screen: 'carta', n: Date.now() });
      goToTab('planstart');
    }, 0);
  }, [goToTab]);

  // One journey (a week from the journeys library) to open, handed to
  // Destinations like the other pending items: a shared #journey=<id> link
  // at boot (T387 reads it in lib/journeys.js), or a starred week in My trips.
  // The id stays here until Destinations says the page is open (T474, row
  // T435-a), so a remount or React running an effect twice cannot drop it,
  // which is how the old take-once handover in JourneysSection lost it.
  const [pendingJourney, setPendingJourney] = useState(null);
  const clearPendingJourney = useCallback(() => setPendingJourney(null), []);
  const [bootJourney] = useState(() => readJourneyFromUrl());
  useEffect(() => {
    if (!bootJourney) return;
    setPendingCategory('trips');
    setPendingJourney({ id: bootJourney, fromLink: true });
    goToTab('places', { replace: true });
    // Once, at boot: the id is read once and never changes.
  }, [bootJourney, goToTab, setPendingCategory]);

  // A published itinerary handed to the trip planner, where every stop, night
  // and date stays editable. It goes in through the same door a shared trip
  // uses, so the planner needs no new code path for it.
  const openTripInPlanner = useCallback((trip) => {
    const stops = (trip.stops || [])
      // T942: a stop from Saved may carry day activities (a trail or a beach
      // at its nearest town), by name, as the planner keeps them.
      .map((st) => ({
        destinationId: st.dest,
        nights: st.nights,
        activities: Array.isArray(st.dayActivities) ? st.dayActivities.slice(0, 20).map((a) => String(a).slice(0, 80)) : [],
      }))
      .filter((st) => st.destinationId && st.nights);
    if (!stops.length) return;
    // The published trip already says how each hop is made: bus here, train
    // there, a ferry where there is water. That was thrown away at this door,
    // so a traveller who had just read "bus to Barcelona" arrived in the
    // planner and was asked how they were getting to Barcelona. The legs keep
    // their modes, keyed by leg index the way the planner keys them.
    const legModes = {};
    (trip.legs || []).forEach((leg, i) => {
      if (leg?.mode) legModes[i] = leg.mode === 'drive' ? 'car' : leg.mode;
    });
    setPendingSharedTrip({
      stops,
      label: trip.name || '',
      transportPref: trip.transport === 'car' ? 'owncar' : 'public',
      legModes,
      // Nobody has said when. The planner asks for the window itself rather
      // than inventing dates a published trip never carried.
      tripStart: '',
    });
    goToTab('trip');
  }, [goToTab, setPendingSharedTrip]);

  /** Open one published trip's page from the planner. Stable, like every
   *  other callback handed to the two planner tabs: they stay mounted behind
   *  display:none, so a fresh arrow here re-renders 3,000 lines of component
   *  on every unrelated keystroke. */
  const openTripPage = useCallback((id) => {
    if (!id) return;
    setPendingTrip({ id: String(id) });
    goToTab('places');
  }, [goToTab, setPendingTrip]);

  /** "Plan a trip here" on a destination page: the trip wizard's Where step
   *  with that destination's country already picked. The wizard maps the
   *  iso2 onto the country name it keys its picks by. */
  const openTripForCountry = useCallback((iso2, destId = null) => {
    if (!iso2 || !/^[A-Za-z]{2}$/.test(String(iso2))) return;
    // T504 (row T498-b): a region page names its nearest priced town too.
    // The wizard reads only the country so far (GuidedTripWizard.jsx, the
    // seed effect); `destId` is there for it to take as the first stop.
    setPendingTripSeed(destId
      ? { iso2: String(iso2).toUpperCase(), destId: String(destId) }
      : { iso2: String(iso2).toUpperCase() });
    goToTab('trip');
  }, [goToTab, setPendingTripSeed]);

  /** "Plan a day here" on a destination page: the day flow, staying in that
   *  city, opened on the When question. */
  const openDayForDest = useCallback((id, date = null) => {
    if (!id) return;
    // T929: "Plan a day together" names the day too.
    setPendingDaySeed(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { destId: String(id), date } : { destId: String(id) });
    goToTab('day');
  }, [goToTab, setPendingDaySeed]);
  // The friends signals across Carta (T929: the Plan date step, the place
  // page) ask for the same door with one event, so no prop runs through
  // every planner and page between here and them.
  useEffect(() => {
    const onPlanDay = (e) => { if (e.detail?.destId) openDayForDest(e.detail.destId, e.detail.date || null); };
    window.addEventListener('carta:plan-day', onPlanDay);
    return () => window.removeEventListener('carta:plan-day', onPlanDay);
  }, [openDayForDest]);

  /** "Add to a day plan" on a trail, beach, lake or mountain page: the day
   *  flow with that place as the first idea, staying in the nearest town.
   *  The page passes what it knows (name, point); a share link passes only
   *  kind, country and id, and the day tab resolves the rest. */
  const openDayForFeature = useCallback((kind, ref) => {
    if (!kind || !ref || ref.id == null) return;
    const k = kind === 'trails' ? 'trail' : kind === 'beaches' ? 'beach'
      : kind === 'lakes' ? 'lake' : kind === 'mountains' ? 'mountain' : kind;
    setPendingDaySeed({
      feature: {
        kind: k, cc: ref.cc || ref.country || '', id: String(ref.id),
        name: ref.name || '', lat: ref.lat, lon: ref.lon,
      },
    });
    goToTab('day');
  }, [goToTab, setPendingDaySeed]);

  /** "Back to trip" on a day plan that came out of a saved trip: reopen that
   *  trip in the planner. A null id means the still-unsaved draft, which the
   *  planner is already holding. */
  const openTripFromDay = useCallback((planId) => {
    if (planId) setPendingTripPlanId(planId);
    goToTab('trip');
  }, [goToTab, setPendingTripPlanId]);

  /**
   * Open one feature layer's full-screen page, from anywhere.
   *
   * Three callers now hand the same {layer, ref} pair around - the region
   * page, the destination page and the shortlist - and each was spelling out
   * the same five-way branch. One function, so a new layer is added in one
   * place and the three can never disagree about what `cc` means.
   */
  const openFeature = useCallback((layer, ref) => {
    if (!ref || ref.id == null) return;
    if (layer === 'trails' || layer === 'trail') setPendingTrail({ id: Number(ref.id), country: ref.cc });
    else if (layer === 'beaches' || layer === 'beach') setPendingBeach({ id: String(ref.id), cc: ref.cc });
    else if (layer === 'lakes' || layer === 'lake') setPendingLake({ id: String(ref.id), cc: ref.cc });
    else if (layer === 'mountains' || layer === 'mountain') setPendingMountain({ id: String(ref.id), cc: ref.cc });
    else if (layer === 'cycling' || layer === 'cycle') setPendingCycle({ kind: 'route', id: Number(ref.id), country: ref.cc });
    else if (layer === 'trips' || layer === 'trip') setPendingTrip({ id: String(ref.id) });
    // A starred journey (T390-c): the week opens over the Trips category, the
    // list it belongs to, through the same door a shared link uses (T474,
    // closes row T391-a).
    // T1030: closing the week goes back to Plan's Carta's own trips (see
    // onJourneyClosed); the page still sits on the Trips category, which
    // Destinations' own back handling expects.
    else if (layer === 'journey' || layer === 'journeys') {
      setPendingCategory('trips');
      setPendingJourney({ id: String(ref.id) });
    }
    // A starred region (T478, row T474-a): its page is hoisted above the tabs,
    // so it opens over the Destinations tab the shortlist hops to.
    else if (layer === 'region' || layer === 'regions') setPendingRegion({ id: String(ref.id) });
    else return;
    goToTab('places');
  }, [goToTab, setPendingBeach, setPendingCategory, setPendingCycle, setPendingLake, setPendingMountain, setPendingRegion, setPendingTrail, setPendingTrip]);
  // One of Carta's own trips from the trip planner (T752): stable, like every
  // callback handed to the planner tabs, which stay mounted behind display:none.
  const openJourneyPage = useCallback((id) => openFeature('journey', { id }), [openFeature]);

  // ── The country page and the region page (T498, roadmap 1.3b D and E) ──
  //
  // A country is a real page now: hoisted over every view like the region
  // and destination pages, with its own address (#country=IT, see
  // lib/urlState.js), so Explore, an outdoor layer, the planner's country
  // brief and a shared link all open the same page, and Back closes it.
  // Opening it pushes one history entry; closing it by its own control
  // steps back over that entry, the way a destination page does.
  const [countryPage, setCountryPage] = useState(
    () => (typeof window !== 'undefined' ? countryFromHash(window.location.hash) : null));
  const countryHandoffRef = useRef(false);
  const openCountryPage = useCallback((iso2) => {
    const cc = String(iso2 || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return;
    try {
      if (window.history.state?.cartaCountry !== cc) {
        window.history.pushState({ ...(window.history.state || {}), cartaCountry: cc }, '',
          `${window.location.pathname}${window.location.search}${countryHash(cc)}`);
      }
    } catch { /* sandboxed: the page still opens */ }
    setCountryPage(cc);
  }, []);
  const prevCountryRef = useRef(countryPage);
  useEffect(() => {
    const was = prevCountryRef.current;
    prevCountryRef.current = countryPage;
    const handoff = countryHandoffRef.current;
    countryHandoffRef.current = false;
    if (!was || countryPage) return;
    try {
      if (!handoff && window.history.state?.cartaCountry === was) window.history.back();
      else if (countryFromHash(window.location.hash)) {
        // Opened from an address, or left for another surface: the address
        // stops naming the country, so a reload does not bring it back.
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
      }
    } catch { /* sandboxed */ }
  }, [countryPage]);
  // Leaving the page for another surface (a layer, the planner, a week):
  // its history entry stays where it is, and nothing steps back over it.
  const leaveCountryPage = useCallback(() => {
    setCountryPage((cur) => {
      if (cur) countryHandoffRef.current = true;
      return null;
    });
  }, []);

  // The region page is a step in the history too (T504, row T498-d): Back on
  // a region page opened over a country page closes the region alone. Its
  // address keeps the country (#country=IT&region=...), so stepping back
  // lands on the country page, and its own close steps back over the entry.
  const regionPushedRef = useRef(false);
  const regionHandoffRef = useRef(false);
  const openRegionPage = useCallback((rid) => {
    const id = String(rid || '');
    if (!id) return;
    try {
      if (window.history.state?.cartaRegion !== id) {
        const cc = countryFromHash(window.location.hash);
        window.history.pushState({ ...(window.history.state || {}), cartaRegion: id }, '',
          `${window.location.pathname}${window.location.search}${cc ? `${countryHash(cc)}&` : '#'}region=${encodeURIComponent(id)}`);
        regionPushedRef.current = true;
      }
    } catch { /* sandboxed: the page still opens */ }
    setPendingRegion({ id });
  }, [setPendingRegion]);
  return { openExploreSection, pendingStyle, setPendingStyle, planOpen, planInner, setPlanInner, openTripStyles, onJourneyClosed, pendingJourney, clearPendingJourney, bootJourney, openTripInPlanner, openTripPage, openTripForCountry, openDayForDest, openDayForFeature, openTripFromDay, openFeature, openJourneyPage, countryPage, setCountryPage, openCountryPage, leaveCountryPage, regionPushedRef, regionHandoffRef, openRegionPage };
}
