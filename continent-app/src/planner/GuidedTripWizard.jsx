import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { countriesFromData, cityTier } from '../lib/tripGuide.js';
import { monthOptions } from '../lib/wizardFlights.js';
import { TRAVEL_STYLES, nearbyAirports } from '../lib/wizardTransit.js';
import { plannerStore } from './plannerStore.js';
import { trackLaunch } from '../lib/launchEvents.js';
import { ReadyTripsStep } from './ReadyTripsStep.jsx';
// The trip's own page, the one the Destinations tab opens. Lazy because it
// pulls a map with it, and nobody reaching the Trips step has asked for one
// until they tap "What's there".
const TripPage = lazy(() => import('../browse/TripPage.jsx').then((m) => ({ default: m.TripPage })));
import { PlanTotal } from './PlanTotal.jsx';
import { quoteTrip as priceWholeTrip, wizardPlannerState, paidEur, PLANNER_BAG } from '../lib/tripTotal.js';
import { prefillMode, openJaw, publishedLeg } from '../lib/gettingThere.js';
import { loadDossier } from '../lib/dossier.js';
import { TRAVEL_MODE_LABEL } from '../lib/transportLinks.js';
import { buildCountryBriefs } from '../lib/countryBrief.js';
import { matchCountries } from '../lib/countryMatch.js';
import { loadTrailsIndex } from '../lib/trails.js';
import { loadBeachIndex } from '../lib/beaches.js';
import { loadLakeIndex } from '../lib/lakes.js';
import { loadMountainIndex } from '../lib/mountains.js';
import { loadCyclingIndex } from '../lib/cycling.js';
import { eurDay } from '../lib/costIndex.js';
import { priceDays, tripRequest, atDates } from '../lib/price/index.js';
import { routeOrder } from '../lib/cartaRoute.js';
import { loadTrip } from '../lib/trips.js';
import { tripHeadline } from '../lib/tripStory.js';
import { haversineKm, tripDaysBetween } from '../lib/runtime_pricing.js';
import { cityLabel, cityKeyName } from '../lib/placeName.js';
import { duplicateHeroes } from '../lib/heroImage.js';
import { pickWithDupes } from '../lib/countryCovers.js';
import { fmtDate, addDays, laterISO, useToday, planningHorizon } from '../lib/dates.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { SheetShell } from '../browse/SheetShell.jsx';
import { CheckIcon, RouteIcon, BedIcon, MapPinIcon, CalendarIcon, PersonIcon, CarIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { wizardSteps, restoreStep, STEP_LABEL_KEYS, nightsText, cheapestDay } from './wizard/wizardSteps.js';
import { OriginCard } from './wizard/OriginCard.jsx';
import { StepBookedWho } from './wizard/StepBookedWho.jsx';
import { StepFrom } from './wizard/StepFrom.jsx';
import { StepWhen } from './wizard/StepWhen.jsx';
import { StepWhere } from './wizard/StepWhere.jsx';
import { StepStays } from './wizard/StepStays.jsx';
import { StepStay } from './wizard/StepStay.jsx';
import { StepGettingThere } from './wizard/StepGettingThere.jsx';
import { StepReview } from './wizard/StepReview.jsx';
import { WizardAside } from './wizard/WizardAside.jsx';
import { WizardHead, WizardStepsSheet, WizardFoot } from './wizard/WizardChrome.jsx';

// Shared empty catalogue for before the data lands: a fresh `{}` per render
// would invalidate the dozen memos below that read destinations (T192).
const NO_DESTINATIONS = Object.freeze({});

// The step modules live in ./wizard/ (T500, owner T484-c): one file a step,
// each handed the wizard's state and setters, so this file holds the state,
// the rules that join the steps, and the frame.

/**
 * "Let Carta guide you", the guided trip builder.
 *
 * Opens on ONE question: how much is already booked?
 *   - Carta plans it start to end: countries (map pick, or Carta recommends
 *     from a vacation-type quiz) -> dates (exact, exact +-2 days, or fully
 *     flexible) -> getting there (a MAP of real Ryanair fares;
 *     picking one shows the interesting places around it) -> stays (map
 *     zoomed on the arrival region; tap a city for a clean briefing with a
 *     recommended stay length; one home base or changing stays) -> finish.
 *   - Travel there is booked (any airline, or car): tell Carta where you
 *     arrive and when; it plans the stays and days from there.
 *   - Everything is booked: type in the stops and jump to the overview.
 *
 * A "planning around" recap strip keeps every earlier answer visible, so the
 * traveller always sees what Carta is taking into account.
 *
 * On finish Carta arranges everything itself: orders the stays into a route
 * flowing from the arrival point, and (when flexible) finds the cheapest real
 * fare dates. The parent gets { startDate, groupSize, transport, pace, label,
 * anchorId, stops:[{destinationId, nights, activities}] }.
 */

// `inline` drops the modal shell: the wizard becomes the trip planner's own
// page, sitting under the app header instead of covering it. There is nothing
// behind it to go back to, so it loses the backdrop, the close button and the
// header strip on the opening question.
// The app's departure airport used to arrive here as a prop, because picking a
// flight switched it. Nothing in the wizard chooses a flight any more, so it
// does not take it and does not change it.
export function GuidedTripWizard({
  data, onCancel, onComplete, stayTier = 'home', inline = false,
  lifestyle = null, favorites = null,
  // Hand-offs out of the wizard, all three from App: open one destination's
  // page, browse one country in the Destinations tab, open one published
  // trip's page. Null in the modal mount, where there is nothing to hand to.
  onOpenDest = null, onOpenCountry = null, onOpenTrip = null,
  // A hand-off in: { iso2 } from "Plan a trip here" on a destination page
  // (App.openTripForCountry) or a ?tab=trip&cc= link. Applied once the
  // catalogue can name the country, then reported consumed.
  seed = null, onSeedConsumed = null,
}) {
  const { t } = useI18n();
  const destinations = data?.destinations || NO_DESTINATIONS;
  // Never offer a date that has already happened: the catalogue's fare window
  // opens on the day the fares were harvested, which is behind us by the time
  // anyone opens the app. `today` is live, so this stays right tomorrow too.
  const today = useToday();
  const dateMin = laterISO(data?.meta?.start_date, today);
  // Not the fare window's end: a trip for next May must be plannable in
  // September (see planningHorizon).
  const dateMax = planningHorizon(data?.meta?.end_date, today);
  // The departure airport the fares are currently priced from (set globally in
  // the header); its city names the getting-there step so the copy follows it.
  const originCode = data?.meta?.selected_origin;
  const originRec = data?.meta?.origins?.[originCode] || null;
  const originCity = originRec?.city || t('wizard.yourAirport');
  const allCountries = useMemo(() => countriesFromData(destinations), [destinations]);
  // Cover photo per country. The rules, and why each one is there, live in
  // lib/countryCovers.js so they can be tested against the real catalogue.
  //
  // dupeHeroes is keyed off data?.destinations, not the `|| {}` alias above:
  // that expression is a fresh object on every render, and this walks the
  // whole 3.8k catalogue.
  const dupeHeroes = useMemo(
    () => duplicateHeroes(data?.destinations || {}),
    [data?.destinations],
  );
  const countryCovers = useMemo(
    () => pickWithDupes(allCountries, dupeHeroes),
    [allCountries, dupeHeroes],
  );
  const countryInsights = useCountryInsights();

  // ---- Wizard flow state ----
  // What the traveller already holds. Answered first, on the same screen as
  // the dates and the party, because it decides what the rest of the flow
  // bothers to ask.
  // The saved draft, read once. plannerStore has already applied the v1->v2
  // migration and the staleness rules, so whatever it hands back here is
  // safe to reopen on. Read before `booked`, because the booked answers decide
  // the step list and a restored step number means nothing without them
  // (T388, row T377-e).
  const savedDraft = useRef(plannerStore.getState().wizard || {}).current;
  const [booked, setBooked] = useState(() => ({
    travel: Boolean(savedDraft.booked?.travel),
    stays: Boolean(savedDraft.booked?.stays),
  }));
  // The dates were already written to the store; nothing ever read them back.
  const savedDates = useRef(plannerStore.getState().travelDates || {}).current;
  // Reopened by the step's name; an older draft's number is moved to the
  // six-step list (Who folded into the first step, T490-c).
  const [step, setStep] = useState(() => restoreStep(savedDraft));
  // Which way the last move went, so the incoming screen slides in from the
  // side it came from. Steps should read as travel through one form.
  const [stepDir, setStepDir] = useState('fwd');
  // The phone's rail is one line plus a sheet (see the header). This is the
  // sheet, and every move through the form closes it.
  const [stepsOpen, setStepsOpen] = useState(false);
  const isDesktop = useIsDesktop();
  // From 1024 px the step and a right column stand side by side (T500): the
  // price card before Where, the step's map from Where on. Same width the
  // planned trip's workspace splits at.
  const [railOn, setRailOn] = useState(() => typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(min-width: 1024px)').matches));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = (e) => setRailOn(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const goStep = useCallback((n) => {
    setStepDir(n < step ? 'back' : 'fwd');
    setStep(n);
    setStepsOpen(false);
  }, [step]);


  const [countries, setCountries] = useState(() => new Set(savedDraft.countries || []));
  // The Where step is two tabs over one selection: a quiz that recommends
  // countries, and the map/grid you pick them on yourself. It opens on the
  // quiz for a traveller who has chosen nothing, and on the picker for one who
  // already has, because arriving back at a quiz you have answered is a step
  // backwards.
  const [whereTab, setWhereTab] = useState(() => (
    (savedDraft.countries || []).length ? 'hand' : 'help'
  ));
  // The quiz answers, restored from the draft so a reload does not re-ask.
  const [quiz, setQuiz] = useState(() => ({
    types: [], typesDone: false, spend: '', around: '', distance: '', pace: '', avoid: [], editing: '',
    ...(savedDraft.quiz || {}),
  }));
  // Which country's brief is open beside the grid. One at a time: this is a
  // reading panel, and two of them would be a comparison table nobody asked
  // for.
  const [briefCountry, setBriefCountry] = useState('');
  // 'ready' takes a published itinerary off the shelf; 'custom' picks cities
  // and lets the Carta algorithm route them.
  const [buildMode, setBuildMode] = useState(() => savedDraft.buildMode || 'ready');
  const [tripPick, setTripPick] = useState(null);     // the chosen trip card
  // The card's id, which is all the effects below read: they key on it so a
  // re-fetched card for the same trip never reloads its stops.
  const tripPickId = tripPick?.id || null;
  // The id from the draft, held until the Trips step has loaded the card it
  // names. Cleared as soon as a card arrives, or the moment the traveller
  // picks anything themselves, so a restore can never overwrite a fresh choice.
  const [pendingTripPickId, setPendingTripPickId] = useState(() => savedDraft.tripPickId || null);
  // The Trips step hands the restored card back through this. Stable, so its
  // restore effect runs when the list or the id changes and not on every
  // render; a choice made in the meantime always wins over the restore.
  const restoreTripPick = useCallback((card) => {
    setPendingTripPickId(null);
    setTripPick((cur) => cur || card);
  }, []);

  // The seed lands on Where with its one country picked by hand. It replaces
  // the draft's countries rather than adding to them: "plan a trip here" is a
  // fresh intent, and a stale Portugal draft under a fresh Belgium pick would
  // make a trip nobody asked for. Booked stays are switched off because that
  // path has no Where step to land on. Waits for the catalogue, which is what
  // turns the iso2 into the name the picks are keyed by.
  useEffect(() => {
    if (!seed?.iso2 || !allCountries.length) return;
    const hit = allCountries.find((c) => c.iso2 === seed.iso2);
    if (hit) {
      setBooked({ travel: false, stays: false });
      setCountries(new Set([hit.country]));
      setWhereTab('hand');
      setTripPick(null);
      // Booked (with Who), When, then Where, once nothing is booked.
      goStep(wizardSteps({}, 'ready').indexOf('Where') + 1);
    }
    onSeedConsumed && onSeedConsumed();
  }, [seed, allCountries, goStep, onSeedConsumed]);
  // Which trip's full page is open over the step. The page is the one the
  // Destinations tab shows, mounted here so "What's there" answers the
  // question in the place that already answers it properly.
  const [tripPageId, setTripPageId] = useState('');
  // Inline, the wizard IS the Trip planner page, so each step's question is
  // the page's one h1. As a modal over another page, or while a trip's own
  // page (which has its h1) is open over it, it steps down to h2 (T193).
  const StepTitle = inline && !tripPageId ? 'h1' : 'h2';
  const [tripDetail, setTripDetail] = useState(null); // its stops, once loaded
  const [tripLoading, setTripLoading] = useState(false);
  // The picked trip's detail file failed to arrive (a network failure, not a
  // retired trip): say so with a retry instead of a skeleton forever (T193).
  const [tripFailed, setTripFailed] = useState(false);
  const [tripTry, setTripTry] = useState(0);
  const [tripMissing, setTripMissing] = useState(0);  // stops not in the catalogue
  // What the traveller says the moving about costs, per leg:
  // { [legKey]: { mode, service, eur } }. Carta prices none of it.
  const [travelValues, setTravelValues] = useState(() => (
    savedDraft.travelValues && typeof savedDraft.travelValues === 'object' ? savedDraft.travelValues : {}
  ));
  // Beds the traveller has booked and typed in, by destination id (T432):
  // the figure replaces Carta's estimate for that stay, here and in the
  // planned trip.
  const [ownStays, setOwnStays] = useState(() => (
    savedDraft.ownStays && typeof savedDraft.ownStays === 'object' ? savedDraft.ownStays : {}
  ));
  const setOwnStay = (id, eurTotal) => setOwnStays((prev) => {
    const next = { ...prev };
    if (eurTotal > 0) next[id] = eurTotal; else delete next[id];
    return next;
  });
  // The published trip this plan IS, when there is one. Everything downstream
  // reads this rather than (buildMode, tripPick) so the two can never disagree.
  const readyTrip = buildMode === 'ready' ? tripPick : null;
  // Driving there in their own car is the one transport answer that changes
  // how the whole trip is planned and priced, so it is read back out of the
  // answers rather than asked for twice.
  const drivingThere = travelValues.out?.mode === 'car';
  const [dateMode, setDateMode] = useState(() => savedDraft.dateMode || 'exact'); // 'exact' | 'flex'
  // Whether the two-month calendar is on screen. It closes itself the moment
  // a whole span is picked, which is what makes the rest of step one visible
  // without scrolling past an answered question.
  const [calOpen, setCalOpen] = useState(() => !(savedDates.startDate && savedDates.endDate));
  const [, setFlexPad] = useState(false);     // exact dates, +-2 days wiggle
  const [startDate, setStartDate] = useState(() => savedDates.startDate || '');
  const [endDate, setEndDate] = useState(() => savedDates.endDate || '');
  const [flexNights, setFlexNights] = useState(() => savedDraft.flexNights || 7);
  const [flexMonth, setFlexMonth] = useState(() => savedDraft.flexMonth || ''); // '' = any month
  // How the Where step shows the catalogue. Photo cards first: a country reads
  // faster from a picture of it than from its outline on a basemap.
  const [whereView, setWhereView] = useState('list'); // 'list' | 'map'
  // Restored from the draft (T388): a reload on Stay used to bring the step
  // back with no cities in it.
  const [nights, setNights] = useState(() => (
    savedDraft.nights && typeof savedDraft.nights === 'object' ? savedDraft.nights : {}
  ));      // { [id]: nights }
  const [order, setOrder] = useState(() => (
    Array.isArray(savedDraft.order) ? savedDraft.order : []
  ));        // included city ids, pick order
  const [staySearch, setStaySearch] = useState('');
  // Narrowing filters for the (long) city list: a minimum traveller rating and
  // a per-night stay budget for the whole group. 0 = filter off.
  const [stayMinRating, setStayMinRating] = useState(0);
  const [stayMaxNightly, setStayMaxNightly] = useState(0);
  const [stayView, setStayView] = useState('map'); // 'map' | 'list'
  const [stayStyle, setStayStyle] = useState(() => (savedDraft.stayStyle === 'single' ? 'single' : 'multi')); // 'multi' | 'single'
  // Re-opens the (answered, folded) stay-style question for editing.
  const [stayStyleOpen, setStayStyleOpen] = useState(false);
  const [focusedId, setFocusedId] = useState(''); // city briefed next to the map
  const [pickedStopId, setPickedStopId] = useState(''); // stop picked on the numbered stops map
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [designedNote, setDesignedNote] = useState(false);
  // "Let Carta pick my cities" mini-questionnaire (open + its three answers).
  const [designQuizOpen, setDesignQuizOpen] = useState(false);
  const [quizStops, setQuizStops] = useState(0); // 0 = Carta decides
  const [quizMust, setQuizMust] = useState(() => new Set()); // must-include ids
  // The party. Children travel at full price: the fare, bed and cost models
  // carry no child rates, and a made-up discount would be a lie; the UI says
  // so where it asks. Everything downstream prices from the combined size.
  const [adults, setAdults] = useState(() => plannerStore.getState().travelers.adults || 2);
  const [kids, setKids] = useState(() => plannerStore.getState().travelers.children || 0);
  // Babies 0 to 2 travel free (T458); children 3 to 11 are `kids`.
  const [babies, setBabies] = useState(() => plannerStore.getState().travelers.babies || 0);
  // The children stepper stays folded until asked for: most trips have none,
  // and a zero counter on the summary card is a question nobody answered.
  const [, setKidsOpen] = useState(false);
  const groupSize = adults + kids;
  // Travel style: one answer that sets what a bed and a day cost everywhere
  // (stay tier + eating-out cadence, see wizardTransit.TRAVEL_STYLES). The
  // wizard no longer asks for it as a step of its own; it follows the app's
  // own lifestyle panel until the Where quiz starts setting it.
  const [travelStyle, setTravelStyle] = useState(() => (
    plannerStore.getState().travelers.lifestyle
    || TRAVEL_STYLES.find((st) => st.stayTier === stayTier)?.key
    || 'standard'
  ));
  const [pace, setPace] = useState(() => savedDraft.pace || 'balanced');

  // ---- Travel already booked: where does the trip start on the ground? ----
  const [arrivalQuery, setArrivalQuery] = useState('');
  const [arrivalId, setArrivalId] = useState(() => savedDraft.arrivalId || '');

  // ---- Stays already booked: the cities they hold, typed in ----
  const [stayQuery, setStayQuery] = useState('');


  // Memoized: these three feed downstream memos (companionsFor, mapCities, which
  // each scan the whole destinations map). Recreating them as fresh arrays every
  // render gave those memos new deps every render, so a Stay-step re-render
  // (typing, +/- nights) re-ran N x all-destinations haversine work each time.
  const selectedCountries = useMemo(
    () => allCountries.filter((c) => countries.has(c.country)),
    [allCountries, countries],
  );
  const includedIds = useMemo(
    () => order.filter((id) => (nights[id] || 0) > 0),
    [order, nights],
  );
  const totalNights = useMemo(
    () => includedIds.reduce((sum, id) => sum + (nights[id] || 0), 0),
    [includedIds, nights],
  );
  // One date model for every shape of trip: exact dates, or a number of
  // nights in a month. The old landed path asked its own way and then had to
  // be special-cased in nine places.
  const windowNights = dateMode === 'exact' ? tripDaysBetween(startDate, endDate) : flexNights;
  const months = useMemo(() => monthOptions(dateMin, dateMax), [dateMin, dateMax]);

  // ---- Origin-first: where does this trip leave from? --------------------
  // A typed address (geocoded on an explicit search, Nominatim fair use)
  // unlocks every fare-carrying airport within 200 km; until one is typed the
  // app's chosen departure airport stands in, so nothing here blocks anyone.
  const [originQuery, setOriginQuery] = useState('');
  const [originResults, setOriginResults] = useState([]);
  const [originBusy, setOriginBusy] = useState(false);
  const [originPlace, setOriginPlace] = useState(() => {
    const o = plannerStore.getState().origin;
    return o ? { name: o.name, lat: o.lat, lon: o.lng, iso2: o.countryCode || null } : null;
  });
  // Where the trip really starts on the ground: the typed address, else the
  // chosen departure airport itself.
  // Memoised: built inline it was a new object every render, which re-ran the
  // country scorer (countryMatches) and the airport list on every keystroke
  // and every nights bump (T192).
  const originPoint = useMemo(
    () => originPlace
      || (originRec && originRec.lat != null ? { name: originCity, lat: originRec.lat, lon: originRec.lon } : null),
    [originPlace, originRec, originCity],
  );
  const nearAirports = useMemo(() => {
    if (!originPoint) return [];
    const list = nearbyAirports(data?.meta, originPoint.lat, originPoint.lon);
    // The app's own origin always stays on the table, even from far away, so
    // switching address can never silently strand an existing choice.
    if (originCode && originRec?.lat != null && !list.some((a) => a.iata === originCode)) {
      const km = haversineKm(originPoint.lat, originPoint.lon, originRec.lat, originRec.lon);
      list.push({ iata: originCode, name: originRec.name || originCity, city: originCity, km: Math.round(km || 0), coverage: 0 });
    }
    return list;
  }, [originPoint, data?.meta, originCode, originRec, originCity]);
  // What a bed costs follows the travel style, not the app-wide lifestyle
  // panel; the panel's tier still stands when the style says nothing.
  // What a bed costs follows the Lifestyle panel (T432): the wizard used to
  // keep a travel style of its own, so its estimate and the planned trip read
  // the Lifestyle from two places and disagreed.
  const effectiveStayTier = stayTier || 'home';

  // The steps for this path. On the full path the third one is the fork:
  // "Trips" offers the published itineraries, "Stay" builds a route out of
  // cities the traveller picks. Swapping between them keeps the step number,
  // so the rail below the header never renumbers under anyone's hand.
  // Getting there is on every path except travel AND beds booked; booked beds
  // replace Where and the city picker (lib in ./wizard/wizardSteps.js).
  const steps = useMemo(
    () => wizardSteps(booked, buildMode),
    [booked, buildMode],
  );

  // A step number past the end (a path that got shorter) lands on the last
  // real step instead of rendering under a "7 of 6" rail.
  useEffect(() => {
    if (step > steps.length) setStep(steps.length);
  }, [step, steps.length]);

  // Which step is which (so the render below reads by NAME).
  const stepName = steps[Math.min(step, steps.length) - 1] || 'Finish';

  // Every Ryanair route into the chosen countries for the chosen period,
  // cheapest first. The pick anchors the whole trip, so this must stay
  // resolvable AFTER the Getting-there step too (the Stay and Finish steps read
  // the chosen fly-in for the arrival anchor, the route ordering and the
  // flexible-date repricing). Gating it to only 'Getting there' silently
  // dropped `flyIn` to null everywhere else, which handed the planner a null
  // anchor and left ground-only first/last stops (gems like Toledo) with no
  // priceable flight, the "no single flight plan" dead end.
  const arrivalDest = arrivalId ? destinations[arrivalId] : null;
  // Only the landed path has an arrival anchor now: on the full path the
  // traveller books their own way in, so Carta is not told which airport it is
  // and never invents one.
  // Where the trip touches down, when the traveller has told us. It anchors
  // the airport transfer and the stay suggestions; nothing else needs it.
  const anchorDest = booked.travel ? arrivalDest : null;
  const anchorId = booked.travel ? arrivalId : null;

  // ---- What each country actually costs and holds ------------------------
  // The Where step used to paint a flight fare and an all-in total on every
  // card. Both moved with the calendar rather than with the country, and they
  // crowded out the two figures that ARE about the place: a bed and a day of
  // eating out. Transport is booked outside Carta now, so the cards carry the
  // catalogue's own measurements instead (lib/countryBrief.js).
  const countryBriefs = useMemo(
    () => buildCountryBriefs(destinations, countryInsights,
      lifestyle || data?.meta?.defaults?.lifestyle || null),
    [destinations, countryInsights, lifestyle, data],
  );
  const openBrief = briefCountry ? countryBriefs.get(briefCountry) || null : null;



  // ---- The return flight home (its own step, after the stays are pinned) ----
  // Route the pinned stays out from the arrival anchor so we know the genuine
  // LAST stop, then offer the airports you can fly home from near it. The exact
  // return date is the start plus the nights actually planned; when flexible we
  // fall back to the cheapest stored return.
  // The Carta algorithm decides the order (lib/cartaRoute.js: nearest
  // neighbour, then 2-opt and Or-opt to untangle it). A published trip is
  // exempt: pipeline/trips already sequenced it and re-routing someone else's
  // checked itinerary would only invent a different one.
  const orderedIncludedIds = useMemo(() => {
    // A published trip was sequenced by pipeline/trips, and a traveller who
    // has booked their beds has sequenced it themselves. Both are somebody
    // else's decision and Carta does not overrule either.
    if (readyTrip || booked.stays) return includedIds;
    return routeOrder(includedIds, destinations, {
      start: anchorDest && anchorDest.lat != null
        ? { lat: anchorDest.lat, lon: anchorDest.lon }
        : (originPoint ? { lat: originPoint.lat, lon: originPoint.lon } : null),
      fixFirst: Boolean(anchorId && includedIds[0] === anchorId),
    });
  }, [readyTrip, booked.stays, includedIds, destinations, anchorDest, anchorId,
    originPoint]);

  // ---- A published trip, taken off the shelf ------------------------------
  // The card carries enough to choose by; the stops, their nights and their
  // coordinates arrive with the detail file. Loading it IS accepting it: the
  // stays become this wizard's stays, so the summary, the route and the
  // hand-over to the planner all work exactly as they do for a built trip.
  useEffect(() => {
    if (!tripPickId) { setTripDetail(null); setTripMissing(0); setTripFailed(false); return undefined; }
    let live = true;
    setTripLoading(true);
    setTripFailed(false);
    loadTrip(tripPickId).then((detail) => {
      if (!live) return;
      setTripLoading(false);
      if (!detail) { setTripDetail(null); return; }
      setTripDetail(detail);
      const stops = (detail.stops || []).filter((s) => destinations[s.dest]);
      setTripMissing((detail.stops || []).length - stops.length);
      const nextNights = {};
      stops.forEach((s) => { nextNights[s.dest] = Math.max(1, s.nights || 1); });
      setNights(nextNights);
      setOrder(stops.map((s) => s.dest));
    }, () => {
      if (!live) return;
      setTripLoading(false);
      setTripFailed(true);
    });
    return () => { live = false; };
  }, [tripPickId, destinations, tripTry]);

  // ---- The trip as dates: one anchor, everything else relative to it ------
  // Nothing below stores a calendar date of its own. Move the start and the
  // whole itinerary moves with it, which is what makes "that flight is forty
  // euros cheaper two days later" a one-tap change instead of a re-plan.
  // One start date for the estimate and the hand-over alike (T432): a date
  // left over from the exact picker no longer prices a flexible trip.
  const tripStartDate = (dateMode === 'exact' && startDate)
    || (flexMonth ? laterISO(`${flexMonth}-05`, dateMin) : dateMin) || '';
  const stopDates = useMemo(() => {
    const out = [];
    let cursor = 0;
    for (const id of orderedIncludedIds) {
      out.push({
        id,
        arrive: tripStartDate ? addDays(tripStartDate, cursor) : '',
        nights: nights[id] || 0,
      });
      cursor += nights[id] || 0;
    }
    return out;
  }, [orderedIncludedIds, nights, tripStartDate]);

  // Where the trip leaves from, as a point the link builders understand.
  // The airport the traveller flies from, chosen on the origin card; the
  // flight links on every leg start there.
  const [depIata, setDepIata] = useState(() => savedDraft.depIata || '');
  const depIataOk = depIata && nearAirports.some((a) => a.iata === depIata) ? depIata : '';
  const homePoint = useMemo(() => ({
    city: originPlace?.name || originCity,
    country: null,
    iso2: originPlace?.iso2 || originRec?.iso2 || null,
    lat: originPoint?.lat ?? null,
    lon: originPoint?.lon ?? null,
    iata: depIataOk || nearAirports[0]?.iata || originCode || null,
  }), [originPlace, originCity, originRec, originPoint?.lat, originPoint?.lon, nearAirports, originCode, depIataOk]);

  const pointOf = useCallback((id) => {
    const d = destinations[id];
    if (!d) return null;
    return {
      city: cityLabel(d.city),
      country: d.country,
      iso2: d.iso2,
      lat: d.city_lat ?? d.lat,
      lon: d.city_lon ?? d.lon,
      iata: d.iata || null,
      anchorIata: d.anchor_airport || null,
    };
  }, [destinations]);

  // Every hop of the trip, in order: out from home, stop to stop, home again.
  const travelLegs = useMemo(() => {
    if (!stopDates.length || !homePoint) return [];
    const legs = [];
    const first = pointOf(stopDates[0].id);
    const lastRow = stopDates[stopDates.length - 1];
    const last = pointOf(lastRow.id);
    const endDate = tripStartDate ? addDays(tripStartDate, totalNights) : '';
    if (first) {
      legs.push({
        key: 'out', kind: 'out', from: homePoint, to: first,
        date: stopDates[0].arrive,
        // A return search is what most people actually buy, so the outbound
        // link carries the way home too when both ends are flown.
        returnDate: endDate,
      });
    }
    for (let i = 0; i < stopDates.length - 1; i += 1) {
      const a = pointOf(stopDates[i].id);
      const b = pointOf(stopDates[i + 1].id);
      if (a && b) legs.push({ key: `leg${i}`, kind: 'inter', index: i, from: a, to: b, date: stopDates[i + 1].arrive });
    }
    if (last) {
      legs.push({ key: 'back', kind: 'back', from: last, to: homePoint, date: endDate });
    }
    return legs;
  }, [stopDates, homePoint, tripStartDate, totalNights, pointOf]);

  // ---- Getting there: what the step knows before anyone answers ----------
  // The airports that actually fly somewhere near the two ends of the trip,
  // and, where the dossier has it, how long the ride from the runway into town
  // takes. Only the two ends: the hops in between are not flown.
  const endIds = useMemo(() => {
    if (!stopDates.length) return { first: null, last: null };
    return { first: stopDates[0].id, last: stopDates[stopDates.length - 1].id };
  }, [stopDates]);
  const [endTransfers, setEndTransfers] = useState({});
  useEffect(() => {
    let live = true;
    const ids = [endIds.first, endIds.last].filter(Boolean);
    if (!ids.length) { setEndTransfers({}); return undefined; }
    Promise.all(ids.map((id) => loadDossier(id).then((d) => [id, d?.practical?.getting_there || null])))
      .then((rows) => { if (live) setEndTransfers(Object.fromEntries(rows)); });
    return () => { live = false; };
  }, [endIds.first, endIds.last]);

  /** The airports near one stop, each carrying the dossier's transfer time
   *  when that airport is the one the dossier names as the anchor. */
  const airportsFor = useCallback((id) => {
    const d = destinations[id];
    if (!d) return [];
    const got = endTransfers[id] || null;
    return nearbyAirports(data?.meta, d.city_lat ?? d.lat, d.city_lon ?? d.lon, { limit: 3 })
      .map((a) => (got && got.airport === a.iata
        ? { ...a, transferMin: got.transfer_min ?? null, transferMode: got.transfer_mode || null }
        : a));
  }, [destinations, endTransfers, data?.meta]);

  // The legs, with everything the step guesses on them: which airports serve
  // each end, what the trip's own composer measured for a hop, and the mode
  // that follows from both. A leg the traveller has already answered keeps
  // their answer; nothing here overwrites a choice.
  const gettingLegs = useMemo(() => {
    if (!travelLegs.length) return [];
    const inAir = endIds.first ? airportsFor(endIds.first) : [];
    const outAir = endIds.last ? airportsFor(endIds.last) : [];
    return travelLegs.map((leg) => {
      const isOut = leg.kind === 'out';
      const isBack = leg.kind === 'back';
      const pub = leg.kind === 'inter'
        ? publishedLeg(tripDetail, stopDates[leg.index]?.id, stopDates[leg.index + 1]?.id)
        : null;
      return {
        ...leg,
        airports: isOut ? inAir : isBack ? outAir : [],
        published: pub,
        // Travel they told us is already booked is not a question. Only the
        // legs that touch home were ever booked in that answer: the hops
        // between stops are the part this step is for.
        booked: booked.travel && (isOut || isBack),
      };
    });
  }, [travelLegs, tripDetail, stopDates, endIds, booked.travel, airportsFor]);

  // "Fly into BCN, home from GRO", when the far end of the trip has a
  // meaningfully closer airport than the one it started at.
  const jawHint = useMemo(() => {
    if (!booked.travel && gettingLegs.length > 1) {
      const jaw = openJaw(gettingLegs[0]?.airports, gettingLegs[gettingLegs.length - 1]?.airports);
      if (jaw) return t('travel.openJaw', { into: jaw.into.iata, home: jaw.home.iata });
    }
    return '';
  }, [gettingLegs, booked.travel, t]);

  // Every leg opens already answered. The guess is written into the same state
  // the traveller edits, once per leg, so it flows into finish() unchanged and
  // an answer already given is never overwritten.
  useEffect(() => {
    if (!gettingLegs.length) return;
    setTravelValues((prev) => {
      let next = prev;
      for (const leg of gettingLegs) {
        if (prev[leg.key]?.mode) continue;
        const mode = prefillMode(leg, {
          quiz,
          published: leg.published?.mode || '',
          // drivingThere, not the ownCarChosen alias below: that is declared
          // further down the component and this effect runs before it.
          drivingOwnCar: drivingThere,
        });
        if (!mode) continue;
        if (next === prev) next = { ...prev };
        // Marked as Carta's guess (T388): the draft and the recap only repeat
        // back what the traveller said, and a guess is not that.
        next[leg.key] = { ...next[leg.key], mode, guessed: true };
      }
      return next;
    });
  }, [gettingLegs]); // eslint-disable-line react-hooks/exhaustive-deps -- runs per new leg set only: re-running on quiz or drivingThere would refill a mode the traveller just cleared

  const setTravelLeg = (key, patch) => {
    // Anything the traveller sets on a leg makes it their answer (T388).
    setTravelValues((prev) => ({ ...prev, [key]: { ...prev[key], ...patch, guessed: false } }));
  };


  const [totalOpen, setTotalOpen] = useState(false);

  const toggleCountry = (name) => {
    setCountries((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  // ---- "Help me choose": the quiz, answered from the catalogue ------------
  // The five published layer indexes, loaded once, so a recommendation can say
  // "1,276 rated trails" rather than "great for hiking". They resolve null
  // until they arrive and matchCountries simply scores without them, so the
  // recommendations appear immediately and sharpen a moment later.
  const [layerIndexes, setLayerIndexes] = useState({});
  useEffect(() => {
    if (whereTab !== 'help' || stepName !== 'Where') return;
    let alive = true;
    Promise.all([
      loadTrailsIndex(), loadBeachIndex(), loadLakeIndex(),
      loadMountainIndex(), loadCyclingIndex(),
    ]).then(([trails, beaches, lakes, mountains, cycling]) => {
      if (alive) setLayerIndexes({ trails, beaches, lakes, mountains, cycling });
    }).catch(() => { /* a missing layer just means one less reason */ });
    return () => { alive = false; };
  }, [whereTab, stepName]);

  // The month the trip actually falls in, which the When step already asked.
  // The same answer as tripMonth, written the way a calendar writes it, for
  // the handful of places (Google Flights Explore) that want a real month.
  const tripYearMonth = useMemo(() => {
    const iso = startDate || (flexMonth ? `${flexMonth}-05` : '');
    const m = /^(\d{4}-\d{2})/.exec(iso);
    return m ? m[1] : '';
  }, [startDate, flexMonth]);
  const tripMonth = useMemo(() => {
    const iso = startDate || (flexMonth ? `${flexMonth}-05` : '');
    const m = /^\d{4}-(\d{2})/.exec(iso);
    return m ? Number(m[1]) : null;
  }, [startDate, flexMonth]);

  const countryMatches = useMemo(() => {
    if (!quiz.types?.length) return [];
    const rows = matchCountries({
      destinations,
      insights: countryInsights,
      layerIndexes,
      answers: quiz,
      month: tripMonth,
      origin: originPoint ? { lat: originPoint.lat, lon: originPoint.lon } : null,
    });
    // The card wants a photograph and three real places; the scorer returns
    // ids, because it stays node-runnable and knows nothing about images.
    return rows.map((r) => ({
      ...r,
      cover: countryCovers.get(r.country) || countryBriefs.get(r.country)?.cover || null,
      places: (r.topPlaces || [])
        .map((id) => ({ id, dest: destinations[id] }))
        .filter((x) => x.dest),
    }));
  }, [quiz, destinations, countryInsights, layerIndexes, tripMonth, originPoint,
    countryCovers, countryBriefs]);

  /** The names the quiz recommended, for the map's dotted outline. */
  const recommendedNames = useMemo(
    () => new Set(countryMatches.slice(0, 6).map((m) => m.country)),
    [countryMatches],
  );

  // Stops whose nights Carta is allowed to keep rebalancing (added by a map
  // tap and never touched by hand). A stepper touch makes a stop "manual".
  const [autoNightIds, setAutoNightIds] = useState(() => new Set());

  const setCityNights = (id, n) => {
    const v = Math.max(0, Math.min(21, n));
    setAutoNightIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setNights((prev) => ({ ...prev, [id]: v }));
    setOrder((prev) => {
      const has = prev.includes(id);
      if (v > 0 && !has) return [...prev, id];
      if (v === 0 && has) return prev.filter((x) => x !== id);
      return prev;
    });
  };

  // Split the trip window across the auto-added stops (hand-set stops keep
  // their nights and only the remainder is divided). So tapping three cities
  // on a 6-night trip reads 2/2/2 instead of assuming 1 night each.
  const rebalanceAuto = (nightsMap, orderArr, autoSet) => {
    const autoIds = orderArr.filter((x) => autoSet.has(x));
    if (!autoIds.length) return nightsMap;
    const manualTotal = orderArr
      .filter((x) => !autoSet.has(x))
      .reduce((sum, x) => sum + (nightsMap[x] || 0), 0);
    const pool = Math.max(autoIds.length, (windowNights || 0) - manualTotal);
    const base = Math.floor(pool / autoIds.length);
    let extra = pool - base * autoIds.length;
    const next = { ...nightsMap };
    for (const x of autoIds) {
      next[x] = Math.max(1, Math.min(21, base + (extra > 0 ? 1 : 0)));
      if (extra > 0) extra -= 1;
    }
    return next;
  };

  // Add/remove a city: in = share of the trip window, out = zero (and the
  // remaining auto stops re-split the freed nights).
  const toggleCity = (id) => {
    const cur = nights[id] || 0;
    if (cur > 0) {
      const nextAuto = new Set(autoNightIds);
      nextAuto.delete(id);
      const nextOrder = order.filter((x) => x !== id);
      setAutoNightIds(nextAuto);
      setOrder(nextOrder);
      setNights((prev) => rebalanceAuto({ ...prev, [id]: 0 }, nextOrder, nextAuto));
    } else {
      const nextAuto = new Set(autoNightIds);
      nextAuto.add(id);
      const nextOrder = order.includes(id) ? order : [...order, id];
      setAutoNightIds(nextAuto);
      setOrder(nextOrder);
      setNights((prev) => rebalanceAuto({ ...prev, [id]: 1 }, nextOrder, nextAuto));
    }
  };

  const canNext = (
    // Nothing booked is a valid answer, and so is no home address: those two
    // steps never block.
    stepName === 'Booked'
    // Saying the travel is booked means saying where it puts you down.
    || (stepName === 'From' && (!booked.travel || Boolean(arrivalId)))
    || (stepName === 'When' && (dateMode === 'flex'
      ? flexNights >= 1
      : Boolean(startDate && endDate && windowNights > 0)))
    || (stepName === 'Where' && countries.size > 0)
    || (stepName === 'Trips' && Boolean(tripPick))
    // Informational: it hands the traveller links and takes what they paid,
    // and none of that is something the trip needs before it can be arranged.
    || stepName === 'Getting'
    || (stepName === 'Stay' && includedIds.length > 0)
    || (stepName === 'Stays' && includedIds.length > 0)
    || stepName === 'Finish'
  );

  // One truth for "this trip is their own car" across both paths: it gates the
  // rental-car advice, asks where they drive from, and skips flight pricing.
  // Driving your own car changes the advice, the legs and the pricing, so it
  // is read from wherever that answer was actually given: the landed path
  // still asks it outright, the full path infers it from the way out.
  const ownCarChosen = drivingThere;

  // One inline calendar, two ends. A click with no start yet (or a complete
  // range, or a date before the current start) begins a new range; the next
  // click closes it. Same rule every booking calendar uses, so it needs no
  // explanation on screen.
  const pickTripDate = (iso) => {
    if (!startDate || endDate || iso <= startDate) {
      setStartDate(iso);
      setEndDate('');
      return;
    }
    setEndDate(iso);
    setCalOpen(false);
  };

  const hasProgress = countries.size > 0 || arrivalId || includedIds.length > 0 || step > 1;
  const handleCancel = () => {
    if (hasProgress && !window.confirm(t('wizard.confirmDiscard'))) return;
    onCancel();
  };
  // The modal mount is a dialog: focus moves in, Tab stays inside, Escape
  // closes through the capture-phase stack and focus returns to the opener
  // (T408, brief V5-1). The inline mount is the page itself and takes none.
  const modalRef = useRef(null);
  useFocusTrap(modalRef, handleCancel, { enabled: !inline });
  const startOver = () => {
    if (!window.confirm(t('wizard.confirmStartOver'))) return;
    setStep(1);
    setBooked({ travel: false, stays: false });
    setCountries(new Set());
    setWhereTab('help');
    setQuiz({ types: [], typesDone: false, spend: '', around: '', distance: '', pace: '', avoid: [], editing: '' });
    setDateMode('exact');
    setFlexPad(false);
    setStartDate('');
    setEndDate('');
    setCalOpen(true);
    setFlexNights(7);
    setFlexMonth('');
    setBuildMode('ready');
    setTripPick(null);
    setPendingTripPickId(null);
    setTripDetail(null);
    setTravelValues({});
    setBriefCountry('');
    setNights({});
    setOrder([]);
    setAutoNightIds(new Set());
    setStaySearch('');
    setStayMinRating(0);
    setStayMaxNightly(0);
    setStayView('map');
    setStayStyle('multi');
    setFocusedId('');
    setExpandedGroups(new Set());
    setDesignedNote(false);
    setDesignQuizOpen(false);
    setQuizStops(0);
    setQuizMust(new Set());
    setAdults(2);
    setKids(0);
    setBabies(0);
    setKidsOpen(false);
    setTravelStyle(TRAVEL_STYLES.find((st) => st.stayTier === stayTier)?.key || 'standard');
    setOriginQuery('');
    setOriginResults([]);
    setOriginPlace(null);
    plannerStore.reset();
    setPace('balanced');
    setArrivalQuery('');
    setArrivalId('');
    setStayQuery('');
  };


  // The trip the wizard will hand over, as a value (T432). The running
  // estimate prices exactly this through lib/tripTotal.js, the planned trip
  // loads exactly this, so the two figures are one figure.
  const handOver = useMemo(() => {
    const orderedIds = readyTrip ? includedIds : orderedIncludedIds;
    const stops = orderedIds.map((id) => ({
      destinationId: id,
      nights: Math.max(1, nights[id] || 1),
      activities: [],
    }));
    const start = tripStartDate;
    const end = start && totalNights ? addDays(start, totalNights) : null;
    const stopCountries = [...new Set(orderedIds.map((id) => destinations[id]?.country).filter(Boolean))];
    const label = readyTrip
      ? tripHeadline(readyTrip, t)
      : (selectedCountries.length
        ? selectedCountries.map((c) => c.country).slice(0, 2).join(' & ')
        : stopCountries.slice(0, 2).join(' & '));
    const out = travelValues.out || {};
    const back = travelValues.back || {};
    const legModes = {};
    const ownLegs = {};
    for (const leg of travelLegs) {
      if (leg.kind !== 'inter') continue;
      const v = travelValues[leg.key];
      if (!v?.mode) continue;
      legModes[leg.index] = v.mode;
      const paid = paidEur(v.eur);
      if (paid > 0) ownLegs[leg.index] = { mode: v.mode, eur: paid };
    }
    const paidOut = paidEur(out.eur);
    const paidBack = paidEur(back.eur);
    const ownStaysNow = {};
    for (const id of orderedIds) {
      const v = paidEur(ownStays[id]);
      if (v) ownStaysNow[id] = v;
    }
    return {
      startDate: start,
      // Adults; children and babies are priced by their own rule (T458).
      groupSize: adults,
      children: kids,
      babies,
      stayTier: effectiveStayTier,
      // Driving there means driving between the stops too.
      transport: ownCarChosen ? 'owncar' : 'auto',
      pace,
      baggage: PLANNER_BAG,
      anchorId: booked.travel && !ownCarChosen ? arrivalId : null,
      anchorOrigin: null,
      returnAnchorId: null,
      // Carta prices no transport, so this is always the traveller's own
      // figure, with each direction kept apart so an own car typed one way
      // keeps Carta's estimate for the other.
      ownFlight: {
        airline: [out.service, back.service].map((x) => (x || '').trim()).filter(Boolean).join(' / '),
        mode: out.mode || back.mode || 'fly',
        costTotal: Math.round((paidOut + paidBack) * 100) / 100,
        costOut: paidOut,
        costBack: paidBack,
        outDate: start || null,
        retDate: end,
      },
      carHome: ownCarChosen ? originPlace : null,
      legModes,
      ownLegs,
      ownStays: ownStaysNow,
      label,
      stops,
    };
  }, [readyTrip, includedIds, orderedIncludedIds, nights, tripStartDate, totalNights, destinations,
    selectedCountries, travelValues, travelLegs, ownStays, adults, kids, babies, effectiveStayTier, ownCarChosen,
    pace, booked.travel, arrivalId, originPlace, t]);

  const finish = () => {
    onComplete(handOver);
    // The launch metric "priced-trip completions" (migration 048, T215-b).
    trackLaunch('trip_priced', '', readyTrip ? 'ready' : 'built');
  };

  // The wizard's price request (T702, plan F6): its party, the stay tier and
  // the Lifestyle, the same question the trip it hands over is priced for.
  const dailyLifestyle = useMemo(
    () => lifestyle || data?.meta?.defaults?.lifestyle || null,
    [lifestyle, data],
  );
  const wizardRequest = useMemo(
    () => tripRequest({ groupSize: adults, children: kids, babies, stayTier: effectiveStayTier, lifestyle: dailyLifestyle }),
    [adults, kids, babies, effectiveStayTier, dailyLifestyle],
  );
  // The per-night stay price for the WHOLE group at a candidate city: the
  // engine's bed at a 2-night stay from the start date (so one-off fees
  // amortize), priced once for the catalogue per request.
  const nightBeds = useMemo(() => {
    const start = startDate || null;
    const req = start ? atDates(wizardRequest, start, addDays(start, 2)) : { ...wizardRequest, nights: 2 };
    return priceDays(destinations, req);
  }, [destinations, wizardRequest, startDate]);
  // A callback so the memos that call it can name it as a dependency.
  const nightlyFor = useCallback((id) => {
    const bed = nightBeds.get(id)?.stayEur;
    return bed > 0 ? Math.round(bed * groupSize) : null;
  }, [nightBeds, groupSize]);
  const passesStayFilters = useCallback((id, dest) => {
    if (stayMinRating > 0 && (dest.rating?.score ?? 0) < stayMinRating) return false;
    if (stayMaxNightly > 0) {
      const n = nightlyFor(id, dest);
      if (n != null && n > stayMaxNightly) return false;
    }
    return true;
  }, [stayMinRating, stayMaxNightly, nightlyFor]);


  // The whole trip priced by the planner's own function (lib/tripTotal.js,
  // T432): the hand-over above, as the planned trip will hold it.
  const priced = useMemo(() => (handOver.stops.length
    ? priceWholeTrip(
      wizardPlannerState(handOver, { stayTier: effectiveStayTier, lifestyle: dailyLifestyle }),
      { data, countryInsights },
    )
    : null), [handOver, effectiveStayTier, dailyLifestyle, data, countryInsights]);
  // Carta's figure for each leg the traveller has not priced, keyed the way
  // the Getting there rows are, so a row shows the estimate its own figure
  // replaces.
  const legEstimates = useMemo(() => {
    const out = {};
    if (!priced) return out;
    priced.legs.forEach((l, i) => {
      const m = l?.modes?.[l.mode];
      if (m && !m.own && m.eur_total > 0) out[`leg${i}`] = m.eur_total;
    });
    if (priced.driveLegs?.out?.ground_total) out.out = priced.driveLegs.out.ground_total;
    if (priced.driveLegs?.home?.ground_total) out.back = priced.driveLegs.home.ground_total;
    return out;
  }, [priced]);
  // Carta's bed estimate per stay, for the field that replaces it.
  const bedEstimate = (id) => {
    const i = priced ? priced.stopDetails.findIndex((sd) => sd.destinationId === id) : -1;
    const sc = i >= 0 ? priced.stayCosts[i] : null;
    return sc ? (sc.estAccomTotal ?? sc.accomTotal) : null;
  };

  // ---- The price from the first place (T388, rule "Cost on cards") --------
  // Every town's day per person at the traveller's Lifestyle, from the cost
  // index Explore prices its cards with, so a country here and a town there
  // never disagree. A country card says "from" the cheapest town (never an
  // average); the brief gives the range.
  const dayCosts = useMemo(() => priceDays(destinations, wizardRequest), [destinations, wizardRequest]);
  const countryDayCost = useMemo(() => {
    const out = new Map();
    for (const [id, row] of dayCosts) {
      if (row.dayEur == null) continue;
      const country = destinations[id]?.country;
      if (!country) continue;
      const cur = out.get(country);
      const national = row.stayLevel !== 'city' || row.foodLevel !== 'city';
      if (!cur) { out.set(country, { min: row.dayEur, max: row.dayEur, national }); continue; }
      if (row.dayEur < cur.min) { cur.min = row.dayEur; cur.national = national; }
      if (row.dayEur > cur.max) cur.max = row.dayEur;
    }
    for (const c of out.values()) {
      c.minText = eurDay(c.min);
      c.maxText = eurDay(c.max);
      // Whole euros, as Explore's cards print a day; equal once rounded is
      // one figure, not a range.
      if (c.minText === c.maxText) c.max = c.min;
    }
    return out;
  }, [dayCosts, destinations]);
  // A ready-made trip's beds and days for the party, stop by stop through
  // the engine (lib/price/stay.js), the receipt's own. null when a stop is missing.
  const cityIndex = useMemo(() => {
    const m = new Map();
    for (const [id, d] of Object.entries(destinations)) {
      if (!d?.city) continue;
      m.set(`${String(d.iso2 || '').toUpperCase()}|${cityKeyName(cityLabel(d.city)).toLowerCase()}`, id);
    }
    return m;
  }, [destinations]);
  // A ready-made trip's card carries one price line (owner T490-e): "From
  // (estimate) a person a day", the day per person at the traveller's
  // Lifestyle from the cheapest town it sleeps in, read from the same cost
  // index as a country card, so the two never disagree. Null when no stop is
  // in the catalogue with a price.
  const tripDayCost = useCallback((cities) => cheapestDay((cities || []).map((c) => {
    const id = cityIndex.get(`${String(c.cc || '').toUpperCase()}|${cityKeyName(cityLabel(c.city)).toLowerCase()}`);
    return id ? dayCosts.get(id) : null;
  })), [cityIndex, dayCosts]);

  // Every city of the chosen countries for the map picker, plus any selected
  // strays from outside them (search picks stay visible on the map). From
  // 1024 px the steps after Stay show the picked stops alone, on the right.
  const stopsMapStep = railOn && ['Stays', 'Trips', 'Getting', 'Finish'].includes(stepName);
  const mapCities = useMemo(() => {
    if (stepName !== 'Stay' && !stopsMapStep) return [];
    const out = [];
    for (const c of (stepName === 'Stay' ? selectedCountries : [])) {
      for (const { id, dest } of c.cities) {
        // Same minimum-rating / nightly-budget narrowing as the list view,
        // so switching between Map and List shows the same candidate pool.
        if (!passesStayFilters(id, dest)) continue;
        out.push({
          id,
          city: cityLabel(dest.city),
          lat: dest.lat,
          lon: dest.lon,
          tierKey: cityTier(dest).key,
          score: dest.rating?.score ?? null,
          selected: (nights[id] || 0) > 0,
          nights: nights[id] || 0,
          isAnchor: id === anchorId,
          focused: id === focusedId,
        });
      }
    }
    // The stops map numbers its pins in trip order (the same numbers as the list).
    const orderOf = new Map(orderedIncludedIds.map((id, i) => [id, i + 1]));
    for (const id of (stopsMapStep ? orderedIncludedIds : includedIds)) {
      if (out.some((o) => o.id === id)) continue;
      const dest = destinations[id];
      if (!dest || dest.lat == null) continue;
      out.push({
        id, city: cityLabel(dest.city), lat: dest.lat, lon: dest.lon,
        tierKey: cityTier(dest).key, score: dest.rating?.score ?? null,
        selected: true, nights: nights[id] || 0,
        isAnchor: id === anchorId, focused: id === (stopsMapStep ? pickedStopId : focusedId),
        order: stopsMapStep ? orderOf.get(id) : 0,
      });
    }
    return out;
  }, [stepName, stopsMapStep, selectedCountries, nights, includedIds, orderedIncludedIds, anchorId, focusedId,
    pickedStopId, destinations, passesStayFilters]);

  // Landing somewhere pins that country onto the trip, so the Stay step has a
  // region to talk about (more countries can still be added by search).
  const arrivalCountry = arrivalDest?.country || '';
  useEffect(() => {
    if (!booked.travel || !arrivalCountry) return;
    setCountries((prev) => (prev.has(arrivalCountry) ? prev : new Set([...prev, arrivalCountry])));
  }, [booked.travel, arrivalCountry]);

  // ---- The "planning around" recap: every earlier answer, always visible ----
  // Every chip is an answer, and an answer is somewhere you can go back to, so
  // each one carries the step it was given on. A chip whose step is behind the
  // traveller is a button that returns them to it; one for a step they have not
  // reached (or for a fact no single step owns, like the party size, which is a
  // stepper on Finish) stays a plain label rather than a dead-looking button.
  const stepNo = (name) => {
    const i = steps.indexOf(name);
    return i >= 0 && i + 1 < step ? i + 1 : null;
  };
  const recapChips = [];
  if (step > 1) {
    if (originPlace) {
      recapChips.push({ Icon: MapPinIcon, text: t('wizard.fromPlaceRecap', { place: originPlace.name }), to: stepNo('From') || stepNo('Getting') });
    }
    recapChips.push({
      Icon: PersonIcon,
      text: groupSize === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: groupSize }),
      to: stepNo('Booked'),
    });
    if (selectedCountries.length) {
      recapChips.push({
        Icon: MapPinIcon,
        text: selectedCountries.map((c) => c.country).slice(0, 3).join(', ')
          + (selectedCountries.length > 3 ? ` +${selectedCountries.length - 3}` : ''),
        to: stepNo('Where'),
      });
    }
    if (booked.travel && arrivalDest) {
      recapChips.push({ Icon: PlaneIcon, text: t('wizard.arrivingIn', { city: cityLabel(arrivalDest.city) }), to: stepNo('From') });
    }
    if (dateMode === 'exact' && startDate && endDate) {
      recapChips.push({ Icon: CalendarIcon, text: t('plan.dateRange', { a: fmtDate(startDate, true), b: fmtDate(endDate, true) }), to: stepNo('When') });
    } else if (dateMode === 'flex') {
      recapChips.push({ Icon: CalendarIcon, text: `${nightsText(t, flexNights)}, ${flexMonth ? months.find((m) => m.key === flexMonth)?.label || flexMonth : t('wizard.anyMonth')}`, to: stepNo('When') });
    }
    // How they get there is their own answer now, so the recap repeats it back
    // rather than naming an airport Carta chose.
    if (travelValues.out?.mode && !travelValues.out?.guessed) {
      recapChips.push({
        Icon: travelValues.out.mode === 'car' ? CarIcon : RouteIcon,
        text: t(TRAVEL_MODE_LABEL[travelValues.out.mode]),
        to: stepNo('Getting'),
      });
    }
    if ((stepName === 'Stay' || stepName === 'Finish') && stayStyle === 'single') {
      recapChips.push({ Icon: BedIcon, text: t('wizard.oneHomeBaseChip'), to: stepNo('Stay') });
    }
    if (includedIds.length && stepName === 'Finish') {
      recapChips.push({
        Icon: RouteIcon,
        text: t('wizard.staysNights', { stays: t(includedIds.length === 1 ? 'wizard.staysOne' : 'wizard.staysMany', { n: includedIds.length }), nights: nightsText(t, totalNights) }),
        to: stepNo('Stay') || stepNo('Stays') || stepNo('Trips'),
      });
    }
  }

  // ---- The global planner draft (plannerStore) ---------------------------
  // The wizard is the writer; the store makes the draft survive tab hops and
  // reloads and gives other surfaces one place to read the context from.
  useEffect(() => {
    plannerStore.set({
      origin: originPlace
        ? { name: originPlace.name, lat: originPlace.lat, lng: originPlace.lon, countryCode: originPlace.iso2 || '' }
        : null,
      nearbyAirports: nearAirports.map((a) => ({ iata: a.iata, name: a.name, distanceKm: a.km })),
      travelDates: {
        isFlexible: dateMode === 'flex',
        startDate,
        endDate,
        durationNights: windowNights || flexNights || 0,
        flexibleMonths: flexMonth ? [flexMonth] : [],
      },
      travelers: { adults, children: kids, babies, lifestyle: travelStyle },
      wizard: {
        step,
        // The step's name survives a renumbering of the list (T500).
        stepName,
        countries: [...countries],
        buildMode,
        tripPickId: tripPick?.id || null,
        dateMode,
        flexMonth,
        flexNights,
        quiz,
        // Everything else that decides which step a number means and what is
        // on it (T388, row T377-e): a reload lands on the same named step
        // with the same answers.
        booked,
        nights,
        order,
        travelValues,
        arrivalId,
        pace,
        stayStyle,
        ownStays,
        depIata,
      },
      selectedDestination: [...countries][0] || null,
      // How they told us they are getting there, and what they said it cost.
      // Carta no longer shops for a fare, so there is no cheapest or fastest
      // to claim and the store carries neither.
      selectedTransit: travelValues.out?.mode && !travelValues.out?.guessed
        ? {
          type: travelValues.out.mode === 'car' ? 'drive' : travelValues.out.mode,
          providerOrRoute: (travelValues.out.service || '').trim() || null,
          estimatedCostEur: Math.max(0, Math.round(Number(String(travelValues.out.eur ?? '').replace(',', '.')) || 0)),
          enteredByTraveller: true,
        }
        : null,
      stops: includedIds.map((id, i) => {
        const d = destinations[id];
        const nightly = d ? nightlyFor(id, d) : null;
        return {
          cityId: id,
          cityName: cityLabel(d?.city) || id,
          nights: nights[id] || 0,
          // Whole-group nightly from the same anchors the receipt uses.
          estimatedNightlyRateEur: nightly ?? 0,
          order: i,
        };
      }),
    });
    if (stayStyle === 'single') plannerStore.setItineraryType('single');
  }, [originPlace, nearAirports, dateMode, startDate, endDate, windowNights, flexNights,
    flexMonth, adults, kids, babies, travelStyle, countries, travelValues, includedIds, nights,
    stayStyle, step, buildMode, tripPick?.id, quiz, destinations, nightlyFor,
    booked, order, arrivalId, pace, ownStays, depIata, stepName]);

  // A new step starts at its own top. Without this the body keeps the previous
  // step's scroll offset, so a long screen can open halfway down its own
  // heading and read as broken.
  const bodyRef = useRef(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);


  /**
   * Choosing a trip from the list, or from its own page.
   *
   * Tapping the card that is already chosen un-chooses it, which is how every
   * other selection in this wizard behaves. Anything else replaces the pick and
   * leaves the traveller on the list, where the footer now says what they hold
   * and the Next button says where it goes. The page's own button is the one
   * that advances, because somebody who has read the whole trip has decided.
   */
  const pickReadyTrip = (trip, { advance = false } = {}) => {
    setPendingTripPickId(null);
    // Tapping the chosen card again un-chooses it. Deciding from the trip's own
    // page never does: somebody who read the whole thing and pressed the button
    // at the bottom of it meant yes, even if that trip was already the pick.
    const same = trip.id === tripPick?.id;
    setTripPick(same && !advance ? null : trip);
    if (!advance) return;
    setTripPageId('');
    const i = steps.indexOf('Getting');
    if (i >= 0) goStep(i + 1);
  };


  // ---- The finish summary: the trip in four facts and a photo ------------
  const summaryTitle = selectedCountries.map((c) => c.country).slice(0, 2).join(' & ')
    || [...new Set(includedIds.map((id) => destinations[id]?.country).filter(Boolean))].slice(0, 2).join(' & ')
    || t('wizard.planYourTrip');
  const summaryDates = (() => {
    // Once the trip has stops, its own nights and dates are the answer
    // everywhere (T432 critique: the card said 7 nights while the trip slept 6).
    if (totalNights > 0 && tripStartDate) {
      const nightsText = t(totalNights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: totalNights });
      return `${nightsText}, ${t('plan.dateRange', { a: fmtDate(tripStartDate, true), b: fmtDate(addDays(tripStartDate, totalNights), true) })}`;
    }
    if (dateMode === 'exact' && startDate && endDate) {
      return t('plan.dateRange', { a: fmtDate(startDate, true), b: fmtDate(endDate, true) });
    }
    const when = flexMonth ? (months.find((m) => m.key === flexMonth)?.label || flexMonth) : t('wizard.anyMonth');
    return `${nightsText(t, flexNights)}, ${when}`;
  })();

  // ---- How much canvas each step deserves --------------------------------
  // A form stretched across a 1600px monitor is unreadable: the eye has to
  // travel from a label on the far left to its control on the far right. So
  // every step declares the width its content actually needs, and the header,
  // estimate band, recap, body and footer all align to that same column.
  //   form - a single column of questions
  //   mid  - card decks and the trip summary
  //   wide - only where a map genuinely earns the room
  const layout = (() => {
    // Two columns of trip cards need the room as much as a map does.
    if (stepName === 'Where' || stepName === 'Stay' || stepName === 'Trips') return 'wide';
    // A summary, and a list of stops with their dates and nights, both read
    // better in one readable column than across a whole screen. Getting there
    // is the same shape: a journey on one line and three blocks of legs, which
    // the narrow form column squeezed into a stack of wrapped rows.
    if (stepName === 'Finish' || stepName === 'Stays' || stepName === 'Getting') return 'mid';
    return 'form';
  })();

  // Prices belong to the second half of the form. On the three opening
  // questions and on Where there is nothing priced yet worth a band across the
  // screen: a figure that reads "0" or holds only the flight someone typed is
  // an anchor set before the trip exists. It appears from the third step on,
  // which on every path is Trips, Stay or Stays.
  // Nights of the window a picked ready-made trip leaves unplanned, said in
  // words in the footer (T388, brief item 5). Counted once the trip's stops
  // have loaded, from the same nights the estimate prices.
  const pickFreeNights = stepName === 'Trips' && tripPick && tripDetail
    && windowNights > 0 && totalNights > 0 && totalNights < windowNights
    ? windowNights - totalNights : 0;

  // The party from the price card: adults move, children stay as answered.
  const party = { adults, children: kids, babies };
  const setParty = (p) => {
    setAdults(Math.max(1, p.adults ?? adults));
    setKids(Math.max(0, p.children ?? kids));
    setBabies(Math.max(0, p.babies ?? babies));
  };
  const gotoGetting = steps.includes('Getting')
    ? () => { setTotalOpen(false); goStep(steps.indexOf('Getting') + 1); }
    : null;

  // Where the trip leaves from, and the airport it flies from (T458): asked on
  // Getting there, and on From when the travel is booked.
  const originCard = (
    <OriginCard
      {...{ originPlace, setOriginPlace, originQuery, setOriginQuery, originResults, setOriginResults }}
      {...{ originBusy, setOriginBusy, nearAirports, depIataOk, setDepIata }}
    />
  );

  // Choosing a trip from inside a country's brief: straight to the Trips step
  // with this trip preselected; the brief's whole job is to end in a decision.
  const planTripFromBrief = (trip, country) => {
    if (!countries.has(country)) toggleCountry(country);
    setBriefCountry('');
    setBuildMode('ready');
    setPendingTripPickId(null);
    setTripPick(trip);
    const i = steps.indexOf('Trips');
    if (i >= 0) goStep(i + 1);
  };

  // ---------------------------------------------------------------- render --
  const answerQuiz = (patch) => setQuiz((prev) => ({ ...prev, ...patch }));
  const openTotal = () => setTotalOpen(true);
  return (
    <div
      className={inline ? 'guide-inline trip-wizard-inline' : 'guide-overlay trip-wizard-overlay'}
      onClick={inline ? undefined : handleCancel}
    >
      <div
        ref={modalRef}
        {...(inline ? {} : { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('wizard.planYourTrip') })}
        className={`guide-modal trip-wizard-modal wiz-${layout} ${inline ? 'wiz-inline' : ''} ${stepName === 'When' ? 'wiz-when' : ''} ${stepName === 'Stays' ? 'wiz-top' : ''} ${stepDir === 'back' ? 'wiz-back' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <WizardHead {...{ inline, steps, step, isDesktop, stepsOpen, setStepsOpen, goStep }} onClose={handleCancel} />

        <div className="guide-body" ref={bodyRef}>
          {/* What Carta is planning around, on a phone only and scrolling with
              the step: from 1024 px the right column shows the same answers
              (roadmap 1.3c section 1), so the desktop band is gone. */}
          {recapChips.length > 0 && !railOn && (
            <div className="guide-recap wiz-recap-inbody">
              <div className="guide-recap-inner">
                <span className="guide-recap-label"><CheckIcon size={10} /> {t('wizard.planningAround')}</span>
                {recapChips.map((c, i) => (c.to ? (
                  <button
                    type="button"
                    className="guide-recap-chip is-link"
                    key={i}
                    onClick={() => goStep(c.to)}
                    title={t('wizard.recapEdit', { step: t(STEP_LABEL_KEYS[steps[c.to - 1]]) })}
                  >
                    <c.Icon size={10} /> {c.text}
                  </button>
                ) : (
                  <span className="guide-recap-chip" key={i}><c.Icon size={10} /> {c.text}</span>
                )))}
              </div>
            </div>
          )}
          <div className={`wiz-main ${railOn ? 'has-rail wiz-split' : ''}`}>
            {/* Keyed on the step so each screen remounts and replays its
                entrance rather than silently swapping content in place. */}
            <div className="guide-canvas" key={`${stepName}-${step}`}>
              {stepName === 'Booked' && <StepBookedWho {...{ titleTag: StepTitle, booked, setBooked, party, setParty }} />}

              {stepName === 'From' && (
                <StepFrom
                  {...{ titleTag: StepTitle, originCard, booked, destinations, arrivalDest, arrivalQuery, setArrivalQuery, setArrivalId }}
                  {...{ travelValues, setTravelLeg }}
                />
              )}

              {stepName === 'When' && (
                <StepWhen
                  {...{ titleTag: StepTitle, dateMode, setDateMode, startDate, setStartDate, endDate, setEndDate, calOpen, setCalOpen }}
                  {...{ windowNights, dateMin, dateMax, pickTripDate, flexNights, setFlexNights, flexMonth, setFlexMonth, months }}
                />
              )}

              {stepName === 'Where' && (
                <StepWhere
                  {...{ titleTag: StepTitle, allCountries, countries, setCountries, toggleCountry, whereTab, setWhereTab }}
                  {...{ quiz, answerQuiz, tripMonth, countryMatches, countryDayCost, briefCountry, setBriefCountry, openBrief }}
                  {...{ nearAirports, tripYearMonth, whereView, setWhereView, favorites, destinations, countryCovers }}
                  {...{ recommendedNames, data, originCode, windowNights, flexNights, dateMode, startDate, endDate }}
                  {...{ onOpenDest, onOpenCountry, onOpenTrip }}
                  mapAside={railOn}
                  onPlanTrip={planTripFromBrief}
                />
              )}

              {/* A published itinerary off the shelf: what is in a trip is a
                  page, so "What's there" opens that page. */}
              {stepName === 'Trips' && (
                <>
                  <StepTitle className="guide-title">{t('wizard.tripsTitle')}</StepTitle>
                  <ReadyTripsStep
                    countries={countries}
                    allCountries={allCountries}
                    windowNights={windowNights}
                    destinations={destinations}
                    favorites={favorites}
                    selectedId={tripPick?.id || pendingTripPickId}
                    onPick={pickReadyTrip}
                    dayCostFor={tripDayCost}
                    onRestorePick={restoreTripPick}
                    onToggleCountry={toggleCountry}
                    onOpenTrip={(trip) => setTripPageId(trip.id)}
                    onBuildOwn={setBuildMode}
                  />
                </>
              )}

              {stepName === 'Getting' && (
                <StepGettingThere
                  {...{ titleTag: StepTitle, booked, originCard, tripPick, stopDates, destinations, tripLoading, tripFailed }}
                  {...{ tripDetail, tripMissing, gettingLegs, travelValues, setTravelLeg, adults, tripStartDate }}
                  {...{ dateMin, dateMax, jawHint, legEstimates, groupSize }}
                  cartaFlight={priced?.cartaFlight || null}
                  onPickAnother={() => { setTripPick(null); goStep(step - 1); }}
                  onRetryTrip={() => setTripTry((n) => n + 1)}
                  onSetStart={(d) => { setStartDate(d); setDateMode('exact'); if (totalNights) setEndDate(addDays(d, totalNights)); }}
                />
              )}

              {stepName === 'Stays' && (
                <StepStays
                  {...{ titleTag: StepTitle, stopDates, destinations, nights, setCityNights, ownStays, setOwnStay, bedEstimate }}
                  {...{ adults, kids, stayQuery, setStayQuery, pickedStopId }}
                />
              )}

              {stepName === 'Stay' && (
                <StepStay
                  {...{ titleTag: StepTitle, booked, setBuildMode, anchorDest, anchorId, ownCarChosen, readyTrip }}
                  {...{ destinations, countries, selectedCountries, includedIds, orderedIncludedIds, nights, setNights }}
                  {...{ setOrder, setAutoNightIds, windowNights, flexNights, totalNights, originPoint, pace, setPace }}
                  {...{ stayStyle, setStayStyle, stayStyleOpen, setStayStyleOpen, designedNote, setDesignedNote }}
                  {...{ designQuizOpen, setDesignQuizOpen, quizStops, setQuizStops, quizMust, setQuizMust }}
                  {...{ staySearch, setStaySearch, stayMinRating, setStayMinRating, stayMaxNightly, setStayMaxNightly }}
                  {...{ stayView, setStayView, focusedId, setFocusedId, expandedGroups, setExpandedGroups }}
                  {...{ mapCities, toggleCity, setCityNights, passesStayFilters, nightlyFor }}
                  mapAside={railOn}
                />
              )}

              {stepName === 'Finish' && (
                <StepReview
                  {...{ titleTag: StepTitle, handOver, summaryTitle, summaryDates, party, setParty, steps, goStep, priced, bedEstimate }}
                  {...{ ownStays, setOwnStay, adults, kids, gettingLegs, travelValues, legEstimates, gotoGetting, ownCarChosen }}
                  {...{ selectedCountries, includedIds, destinations, groupSize, countryInsights, railOn }}
                />
              )}
            </div>

            {/* From 1024 px: the price card before Where, the step's map from
                Where on, and the total bar at its foot (T500). */}
            {railOn && (
              <WizardAside
                {...{ stepName, priced, summaryDates, party, setParty, gotoGetting }}
                {...{ allCountries, countries, toggleCountry, recommendedNames, countryCovers }}
                {...{ mapCities, toggleCity, setFocusedId, setPickedStopId, anchorDest, includedIds }}
                onOpenTotal={openTotal}
                onBrief={(name) => setBriefCountry(briefCountry === name ? '' : name)}
              />
            )}
          </div>
        </div>

        <WizardFoot
          {...{ railOn, priced, hasProgress, isDesktop, startOver, stepName, tripPick, pickFreeNights }}
          {...{ windowNights, totalNights, includedIds, step, steps, goStep, canNext, finish }}
          onOpenTotal={openTotal}
        />
      </div>

      {stepsOpen && (
        <WizardStepsSheet {...{ steps, step, goStep, hasProgress, startOver }} onClose={() => setStepsOpen(false)} />
      )}

      {totalOpen && (
        <SheetShell
          title={t('plan.yourTrip')}
          onClose={() => setTotalOpen(false)}
          className="plan-total-sheet"
          labelId="plan-total-sheet-title"
        >
          <PlanTotal
            priced={priced}
            dates={summaryDates}
            party={party}
            onParty={setParty}
            onAddFare={gotoGetting}
            variant="sheet"
            defaultOpen
          />
        </SheetShell>
      )}

      {/* "What's there", answered by the page that answers it everywhere
          else. It covers the wizard; its big button is the decision: choose
          this trip, close the page, go to Getting there. */}
      {tripPageId && (
        <Suspense fallback={null}>
          <TripPage
            trip={{ id: tripPageId }}
            data={data}
            onClose={() => setTripPageId('')}
            onSelectDest={onOpenDest}
            primaryAction={{
              label: t('ready.chooseThis'),
              onClick: (trip) => pickReadyTrip(trip, { advance: true }),
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
