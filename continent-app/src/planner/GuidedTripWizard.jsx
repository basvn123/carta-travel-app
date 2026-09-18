import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { DateField } from '../components/DateField.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryPickerMap } from '../map/CountryPickerMap.jsx';
import { CityPickerMap } from '../map/CityPickerMap.jsx';
import {
  countriesFromData, cityInsight,
  cityTier, cityCompanions, designStays,
} from '../lib/tripGuide.js';
import { knownForFacts } from '../lib/knownFor.js';
import { gemScore } from '../lib/trip_planner_pricing.js';
import { monthOptions } from '../lib/wizardFlights.js';
import {
  TRAVEL_STYLES, STYLE_BY_KEY, styleLifestyle, nearbyAirports,
} from '../lib/wizardTransit.js';
import { plannerStore } from './plannerStore.js';
import { CountryBrief } from './CountryBrief.jsx';
import { ReadyTripsStep } from './ReadyTripsStep.jsx';
// The trip's own page, the one the Destinations tab opens. Lazy because it
// pulls a map with it, and nobody reaching the Trips step has asked for one
// until they tap "What's there".
const TripPage = lazy(() => import('../browse/TripPage.jsx').then((m) => ({ default: m.TripPage })));
import { TravelLegsSection, TravelLegsSummary, travelTotal } from './TravelLegsSection.jsx';
import { prefillMode, openJaw, publishedLeg } from '../lib/gettingThere.js';
import { loadDossier } from '../lib/dossier.js';
import { TRAVEL_MODES, TRAVEL_MODE_LABEL, googleFlightsExploreLink } from '../lib/transportLinks.js';
import { buildCountryBriefs } from '../lib/countryBrief.js';
import { matchCountries, SPEND_CHOICES } from '../lib/countryMatch.js';
import { loadTrailsIndex } from '../lib/trails.js';
import { loadBeachIndex } from '../lib/beaches.js';
import { loadLakeIndex } from '../lib/lakes.js';
import { loadMountainIndex } from '../lib/mountains.js';
import { loadCyclingIndex } from '../lib/cycling.js';
import { WhereQuiz } from './WhereQuiz.jsx';
import { CountryMatchCards } from './CountryMatchCards.jsx';
import { PlannerSection } from './PlannerSection.jsx';
import { planRoute, routeOrder } from '../lib/cartaRoute.js';
import { loadTrip } from '../lib/trips.js';
import { tripHeadline } from '../lib/tripStory.js';
import {
  carAdvice, legTransportOptions, airportTransferOptions, preferredPublicMode,
} from '../lib/transport.js';
import { haversineKm, tripDaysBetween, accommodationPerPerson, groundSpendPerPerson } from '../lib/runtime_pricing.js';
import { eur } from '../lib/format.js';
import { cityLabel } from '../lib/placeName.js';
import { duplicateHeroes } from '../lib/heroImage.js';
import { pickWithDupes } from '../lib/countryCovers.js';
import { favDestIds } from '../lib/favorites.js';
import { fmtDate, addDays, laterISO, useToday, monthName, planningHorizon } from '../lib/dates.js';
import { geocodeAddress } from '../lib/geocode.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { SheetShell } from '../browse/SheetShell.jsx';
import {
  SparkIcon, CheckIcon, AlertIcon, TrainIcon, BusIcon, CarIcon, FerryIcon, InfoIcon,
  LeafIcon, ScaleIcon, BoltIcon, StarIcon, RouteIcon, BedIcon, MapPinIcon,
  CalendarIcon, PersonIcon, DiamondIcon, DotIcon, LuggageIcon, ChevronRightIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { suggestedNights, Flag, CityThumb, StayRow } from './GuidedTripWizardParts.jsx';

const ROUTES_PREVIEW = 14;
const CITIES_PREVIEW = 8;
const NEARBY_KM = 140;

// What can already be booked when someone opens the planner. This used to be
// three separate wizards behind a chooser screen, which meant the traveller
// had to classify their own trip before Carta had asked them anything, and
// then re-enter the same dates and party in whichever branch they landed in.
// It is one flow now, and these two answers take questions AWAY:
//
//   travel   Carta stops asking how you get there and asks where you arrive
//   stays    Carta stops choosing cities and you type the ones you hold
// The five ways in, as icons, for the "how did you get there" row. Same five
// the transport section offers, read from the same table.
const TRAVEL_MODE_ICON = {
  fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon, ferry: FerryIcon,
};

const BOOKED_BITS = [
  { key: 'travel', Icon: PlaneIcon, labelKey: 'wizard.bookedTravel', subKey: 'wizard.bookedTravelSub' },
  { key: 'stays', Icon: BedIcon, labelKey: 'wizard.bookedStays', subKey: 'wizard.bookedStaysSub' },
];

// The third answer, which used to be no answer at all. Holding nothing is the
// commonest way into the planner and it was the one state with no button: you
// said it by leaving both toggles off, and a screen whose correct answer is to
// touch nothing reads as a screen you have not finished. It is a card now, on
// the same row, and picking it clears the other two rather than adding a third
// flag, because "nothing" and "something" cannot both be true.
const BOOKED_NONE = { key: 'none', Icon: SparkIcon, labelKey: 'wizard.bookedNone', subKey: 'wizard.bookedNoneSub' };

// The three opening questions, one per step: what is already booked, where the
// trip leaves from, and when. Who travels used to be a fourth step; it is a
// stepper on the Finish summary now, because party size is an adjustment
// people make while reading a price, not a gate to get past before seeing one.
const BASICS_STEPS = ['Booked', 'From', 'When'];

// The step after those, whose real name is what the rail shows and what the
// render switches on: your own stays, a published trip, or the city picker.
const STEP3 = { stays: 'Stays', ready: 'Trips', custom: 'Stay' };
const STEP_LABEL_KEYS = {
  'Booked': 'wizard.stepBooked',
  'From': 'wizard.stepFrom',
  'When': 'wizard.stepWhen',
  'Where': 'wizard.stepWhere',
  'Trips': 'wizard.stepTrips',
  'Getting': 'wizard.stepGetting',
  'Stay': 'wizard.stepStay',
  'Stays': 'wizard.stepStays',
  'Finish': 'wizard.stepFinish',
};

// "How full should your days feel?"
const PACE_CHOICES = [
  { key: 'relaxed', Icon: LeafIcon, labelKey: 'wizard.paceRelaxed', subKey: 'wizard.paceRelaxedSub' },
  { key: 'balanced', Icon: ScaleIcon, labelKey: 'wizard.paceBalanced', subKey: 'wizard.paceBalancedSub' },
  { key: 'packed', Icon: BoltIcon, labelKey: 'wizard.pacePacked', subKey: 'wizard.pacePackedSub' },
];

// The two ways to answer "where", as a real tablist: the segmented control
// is keyboard-navigable with the arrow keys, which two adjacent buttons are
// not, and screen readers announce it as one control with two states.
const WHERE_TABS = ['help', 'hand'];

const BADGE_LABELS = {
  pick: { labelKey: 'wizard.badgePick', cls: 'pick' },
  cheapest: { labelKey: 'wizard.badgeCheapest', cls: 'cheap' },
  fastest: { labelKey: 'wizard.badgeFastest', cls: 'fast' },
};

// How long is this city genuinely worth staying? Driven by how much there is
// to see and do, so the info panel can recommend honestly.

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
/**
 * "Not sure where to go yet?", the one question Carta's own catalogue answers
 * from the wrong end.
 *
 * Carta ranks places by what they cost to BE in; Google Flights Explore ranks
 * them by what they cost to REACH. Somebody holding an airport and no
 * destination wants the second one, so the card hands them over rather than
 * pretending the catalogue answers it. It needs a departure airport and
 * nothing else, which is why it can stand on the From step before a single
 * country has been chosen.
 */
function ExploreFlightsCard({ airport, month = '', lang = 'en', t }) {
  const url = googleFlightsExploreLink({
    fromIata: airport?.iata, fromCity: airport?.city, month, lang,
  });
  if (!url) return null;
  return (
    <a className="guide-explore-card" href={url} target="_blank" rel="noopener noreferrer">
      <span className="guide-explore-icon"><PlaneIcon size={16} /></span>
      <span className="guide-explore-text">
        <b>{t('wizard.exploreTitle')}</b>
        <small>{t('wizard.exploreCta', { airport: airport.iata })}</small>
      </span>
      <span className="ext-arrow" aria-hidden="true">&#8599;</span>
    </a>
  );
}

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
  const { t, lang } = useI18n();
  const destinations = data?.destinations || {};
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
  const [booked, setBooked] = useState({ travel: false, stays: false });
  const toggleBooked = (key) => setBooked((prev) => ({ ...prev, [key]: !prev[key] }));
  // Picking "nothing yet" is not a third flag, it is the other two turned off.
  const clearBooked = () => setBooked({ travel: false, stays: false });
  const bookedNothing = !booked.travel && !booked.stays;
  // The saved draft, read once. plannerStore has already applied the v1->v2
  // migration and the staleness rules, so whatever it hands back here is
  // safe to reopen on.
  const savedDraft = useRef(plannerStore.getState().wizard || {}).current;
  // The dates were already written to the store; nothing ever read them back.
  const savedDates = useRef(plannerStore.getState().travelDates || {}).current;
  const [step, setStep] = useState(() => savedDraft.step || 1);
  // Which way the last move went, so the incoming screen slides in from the
  // side it came from. Steps should read as travel through one form.
  const [stepDir, setStepDir] = useState('fwd');
  // The phone's rail is one line plus a sheet (see the header). This is the
  // sheet, and every move through the form closes it.
  const [stepsOpen, setStepsOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const goStep = (n) => {
    setStepDir(n < step ? 'back' : 'fwd');
    setStep(n);
    setStepsOpen(false);
  };


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
  // The id from the draft, held until the Trips step has loaded the card it
  // names. Cleared as soon as a card arrives, or the moment the traveller
  // picks anything themselves, so a restore can never overwrite a fresh choice.
  const [pendingTripPickId, setPendingTripPickId] = useState(() => savedDraft.tripPickId || null);

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
      // BASICS_STEPS then Where: the index is fixed once stays are unbooked.
      goStep(BASICS_STEPS.length + 1);
    }
    onSeedConsumed && onSeedConsumed();
  }, [seed, allCountries.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Which trip's full page is open over the step. The page is the one the
  // Destinations tab shows, mounted here so "What's there" answers the
  // question in the place that already answers it properly.
  const [tripPageId, setTripPageId] = useState('');
  const [tripDetail, setTripDetail] = useState(null); // its stops, once loaded
  const [tripLoading, setTripLoading] = useState(false);
  const [tripMissing, setTripMissing] = useState(0);  // stops not in the catalogue
  // What the traveller says the moving about costs, per leg:
  // { [legKey]: { mode, service, eur } }. Carta prices none of it.
  const [travelValues, setTravelValues] = useState({});
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
  const [flexPad, setFlexPad] = useState(false);     // exact dates, +-2 days wiggle
  const [startDate, setStartDate] = useState(() => savedDates.startDate || '');
  const [endDate, setEndDate] = useState(() => savedDates.endDate || '');
  const [flexNights, setFlexNights] = useState(() => savedDraft.flexNights || 7);
  const [flexMonth, setFlexMonth] = useState(() => savedDraft.flexMonth || ''); // '' = any month
  // How the Where step shows the catalogue. Photo cards first: a country reads
  // faster from a picture of it than from its outline on a basemap.
  const [whereView, setWhereView] = useState('list'); // 'list' | 'map'
  const [nights, setNights] = useState({});      // { [id]: nights }
  const [order, setOrder] = useState([]);        // included city ids, pick order
  const [staySearch, setStaySearch] = useState('');
  // Narrowing filters for the (long) city list: a minimum traveller rating and
  // a per-night stay budget for the whole group. 0 = filter off.
  const [stayMinRating, setStayMinRating] = useState(0);
  const [stayMaxNightly, setStayMaxNightly] = useState(0);
  const [stayView, setStayView] = useState('map'); // 'map' | 'list'
  const [stayStyle, setStayStyle] = useState('multi'); // 'multi' | 'single'
  // Re-opens the (answered, folded) stay-style question for editing.
  const [stayStyleOpen, setStayStyleOpen] = useState(false);
  const [focusedId, setFocusedId] = useState(''); // city briefed next to the map
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
  // The children stepper stays folded until asked for: most trips have none,
  // and a zero counter on the summary card is a question nobody answered.
  const [kidsOpen, setKidsOpen] = useState(false);
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
  const [pace, setPace] = useState('balanced');

  // ---- Travel already booked: where does the trip start on the ground? ----
  const [arrivalQuery, setArrivalQuery] = useState('');
  const [arrivalId, setArrivalId] = useState('');

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
  const searchOrigin = async () => {
    const q = originQuery.trim();
    if (q.length < 3 || originBusy) return;
    setOriginBusy(true);
    setOriginResults(await geocodeAddress(q));
    setOriginBusy(false);
  };
  // Where the trip really starts on the ground: the typed address, else the
  // chosen departure airport itself.
  const originPoint = originPlace
    || (originRec && originRec.lat != null ? { name: originCity, lat: originRec.lat, lon: originRec.lon } : null);
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
  }, [originPoint?.lat, originPoint?.lon, data, originCode]); // eslint-disable-line react-hooks/exhaustive-deps
  // What a bed costs follows the travel style, not the app-wide lifestyle
  // panel; the panel's tier still stands when the style says nothing.
  const effectiveStayTier = STYLE_BY_KEY[travelStyle]?.stayTier || stayTier;

  // The steps for this path. On the full path the third one is the fork:
  // "Trips" offers the published itineraries, "Stay" builds a route out of
  // cities the traveller picks. Swapping between them keeps the step number,
  // so the rail below the header never renumbers under anyone's hand.
  const steps = useMemo(() => {
    const third = booked.stays ? STEP3.stays : (STEP3[buildMode] || 'Trips');
    // Choosing a published trip settles where you sleep and in what order, so
    // the only thing left to arrange is how you reach it and how you come
    // home. That used to hang off the bottom of the Trips step, roughly three
    // thousand pixels below the card that opened it; it is its own step now,
    // and only on the path that has a route to get to.
    // Getting there is a step on every path, not only the ready-made one: its
    // legs are built from the stops and the dates, which every path has by the
    // time it reaches here. Only a traveller who says their travel AND their
    // beds are booked skips it, because then there is nothing left to arrange.
    const rest = booked.travel && booked.stays ? ['Finish'] : ['Getting', 'Finish'];
    // Someone who has already booked their beds has chosen their cities, so
    // the country picker has nothing left to ask them.
    // The four opening questions are four steps, not one scrolling screen.
    return booked.stays
      ? [...BASICS_STEPS, third, ...rest]
      : [...BASICS_STEPS, 'Where', third, ...rest];
  }, [booked.stays, booked.travel, buildMode]);

  // A draft saved before the Who step was removed restores a step number one
  // past the end, which rendered Finish under a "6 of 5" rail. Clamp on
  // restore so an old draft lands on the last real step instead.
  useEffect(() => {
    if (step > steps.length) setStep(steps.length);
  }, [step, steps.length]);

  // Which step is which (so the render below reads by NAME).
  const stepName = steps[Math.min(step, steps.length) - 1] || 'Finish';

  // How many shortlisted places each country holds, so the grid can lead with
  // the countries the traveller has already been starring. The search box that
  // used to filter this grid is gone: 43 countries is a screen, not a corpus,
  // and the thing worth surfacing is the shortlist, not a substring.
  const favByCountry = useMemo(() => {
    const out = new Map();
    if (!favorites || !favorites.size) return out;
    for (const id of favDestIds(favorites)) {
      const d = destinations[id];
      if (d?.country) out.set(d.country, (out.get(d.country) || 0) + 1);
    }
    return out;
  }, [favorites, destinations]);

  // Alphabetical, but a country holding shortlisted places comes first: that
  // is the country the traveller has already told us they are interested in.
  const handCountries = useMemo(() => {
    const rows = allCountries.slice();
    rows.sort((a, b) => {
      const fa = favByCountry.get(a.country) || 0;
      const fb = favByCountry.get(b.country) || 0;
      return fb - fa || a.country.localeCompare(b.country);
    });
    return rows;
  }, [allCountries, favByCountry]);

  // The same shortlist, as its own row above the grid: only the countries that
  // actually hold starred places, most-starred first.
  const shortlistCountries = useMemo(
    () => allCountries
      .filter((c) => (favByCountry.get(c.country) || 0) > 0)
      .sort((a, b) => (favByCountry.get(b.country) || 0) - (favByCountry.get(a.country) || 0)
        || a.country.localeCompare(b.country)),
    [allCountries, favByCountry],
  );

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
    () => buildCountryBriefs(destinations, countryInsights),
    [destinations, countryInsights],
  );
  const openBrief = briefCountry ? countryBriefs.get(briefCountry) || null : null;


  // ---- Curated multi-stop templates for the Stay step --------------------
  // Duration-fitted route shapes (pair / triangle / grand tour), each a real
  // designStays() run, so a template card IS the route it promises. Hidden
  // once stops exist: the traveller is designing by hand at that point.
  const stayTemplates = useMemo(() => {
    if (stepName !== 'Stay' || stayStyle !== 'multi' || includedIds.length > 0) return [];
    const n = windowNights || flexNights || 7;
    const defs = [
      { key: 'pair', stops: 2, labelKey: 'wizard.tplPair', minNights: 4 },
      { key: 'triangle', stops: 3, labelKey: 'wizard.tplTriangle', minNights: 6 },
      { key: 'grand', stops: Math.min(5, Math.max(4, Math.round(n / 3))), labelKey: 'wizard.tplGrand', minNights: 9 },
    ].filter((d) => n >= d.minNights);
    const seen = new Set();
    const out = [];
    for (const d of defs) {
      const picks = designStays({
        destinations,
        countries,
        anchorDest,
        anchorId,
        totalNights: n,
        maxStops: d.stops,
        mustIncludeIds: [],
        // ownCarChosen is declared further down (after canNext); this is the
        // same answer read straight off the state it comes from.
        transport: drivingThere ? 'owncar' : 'auto',
      });
      if (picks.length < 2) continue;
      const sig = picks.map((x) => x.id).join('|');
      if (seen.has(sig)) continue; // two shapes resolving to one route are one choice
      seen.add(sig);
      const legs = [];
      for (let i = 0; i < picks.length - 1; i += 1) {
        const a = destinations[picks[i].id];
        const b = destinations[picks[i + 1].id];
        const km = a && b ? haversineKm(a.lat, a.lon, b.lat, b.lon) : null;
        if (km != null) legs.push(Math.round(km * 1.3));
      }
      out.push({ ...d, picks, legKm: legs.reduce((x, y) => x + y, 0) });
    }
    return out;
  }, [stepName, stayStyle, includedIds.length, windowNights, flexNights,
    destinations, countries, anchorDest, anchorId, drivingThere]); // eslint-disable-line react-hooks/exhaustive-deps
  const applyTemplate = (tpl) => {
    const nextNights = {};
    tpl.picks.forEach((x) => { nextNights[x.id] = x.nights; });
    setNights(nextNights);
    setOrder(tpl.picks.map((x) => x.id));
    setAutoNightIds(new Set());
    setDesignedNote(true);
    plannerStore.setItineraryType('curated');
  };

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
    originPoint?.lat, originPoint?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- A published trip, taken off the shelf ------------------------------
  // The card carries enough to choose by; the stops, their nights and their
  // coordinates arrive with the detail file. Loading it IS accepting it: the
  // stays become this wizard's stays, so the summary, the route and the
  // hand-over to the planner all work exactly as they do for a built trip.
  useEffect(() => {
    if (!tripPick) { setTripDetail(null); setTripMissing(0); return undefined; }
    let live = true;
    setTripLoading(true);
    loadTrip(tripPick.id).then((detail) => {
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
    });
    return () => { live = false; };
  }, [tripPick?.id, destinations]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- The trip as dates: one anchor, everything else relative to it ------
  // Nothing below stores a calendar date of its own. Move the start and the
  // whole itinerary moves with it, which is what makes "that flight is forty
  // euros cheaper two days later" a one-tap change instead of a re-plan.
  const tripStartDate = startDate
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
  const homePoint = useMemo(() => ({
    city: originPlace?.name || originCity,
    country: null,
    iso2: originPlace?.iso2 || originRec?.iso2 || null,
    lat: originPoint?.lat ?? null,
    lon: originPoint?.lon ?? null,
    iata: nearAirports[0]?.iata || originCode || null,
  }), [originPlace, originCity, originRec, originPoint?.lat, originPoint?.lon, nearAirports, originCode]);

  const pointOf = (id) => {
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
  };

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
  }, [stopDates, homePoint, tripStartDate, totalNights, destinations]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const airportsFor = (id) => {
    const d = destinations[id];
    if (!d) return [];
    const got = endTransfers[id] || null;
    return nearbyAirports(data?.meta, d.city_lat ?? d.lat, d.city_lon ?? d.lon, { limit: 3 })
      .map((a) => (got && got.airport === a.iata
        ? { ...a, transferMin: got.transfer_min ?? null, transferMode: got.transfer_mode || 'train' }
        : a));
  };

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
  }, [travelLegs, tripDetail, stopDates, endIds, endTransfers, booked.travel, destinations, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Fly into BCN, home from GRO", when the far end of the trip has a
  // meaningfully closer airport than the one it started at.
  const jawHint = useMemo(() => {
    if (!booked.travel && gettingLegs.length > 1) {
      const jaw = openJaw(gettingLegs[0]?.airports, gettingLegs[gettingLegs.length - 1]?.airports);
      if (jaw) return t('travel.openJaw', { into: jaw.into.iata, home: jaw.home.iata });
    }
    return '';
  }, [gettingLegs, booked.travel]); // eslint-disable-line react-hooks/exhaustive-deps

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
        next[leg.key] = { ...next[leg.key], mode };
      }
      return next;
    });
  }, [gettingLegs]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTravelLeg = (key, patch) => {
    setTravelValues((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };
  const travelSpend = travelTotal(travelValues);

  // ---- The Carta algorithm, on the cities the traveller chose -------------
  // Order and nights in one call. It runs live on the Stay step so the panel
  // can say what it did before the traveller commits to it, and it runs again
  // in finish() so the trip that reaches the planner IS the routed one.
  const cartaPlan = useMemo(() => {
    if (readyTrip || includedIds.length < 2) return null;
    return planRoute({
      ids: includedIds,
      destinations,
      totalNights: windowNights || totalNights || includedIds.length,
      start: anchorDest && anchorDest.lat != null
        ? { lat: anchorDest.lat, lon: anchorDest.lon }
        : (originPoint ? { lat: originPoint.lat, lon: originPoint.lon } : null),
      fixFirst: Boolean(anchorId && includedIds[0] === anchorId),
      pace,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyTrip, includedIds, destinations, windowNights, totalNights, anchorDest, anchorId,
    originPoint?.lat, originPoint?.lon, pace]);
  const nightsDiffer = Boolean(cartaPlan)
    && cartaPlan.order.some((id) => (nights[id] || 0) !== cartaPlan.nights[id]);
  const applyCartaNights = () => {
    if (!cartaPlan) return;
    const next = { ...nights };
    for (const id of includedIds) next[id] = 0;
    for (const id of cartaPlan.order) next[id] = cartaPlan.nights[id];
    // These nights are now a decision, not a placeholder, so adding a city
    // afterwards must not silently re-split them into equal shares.
    setAutoNightIds(new Set());
    setNights(next);
    setOrder(cartaPlan.order);
  };

  const [estimateOpen, setEstimateOpen] = useState(false);

  const toggleCountry = (name) => {
    setCountries((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  /** Merge one answer into the quiz. The whole object is stored, so the draft
   *  restores the walk exactly where it was left. */
  const answerQuiz = (patch) => {
    setQuiz((prev) => ({ ...prev, ...patch }));
    // The spend answer IS the travel style. It used to stop at the ranking
    // weight: "Shoestring" nudged the countries and then Finish priced the
    // standard apartment tier anyway, and "Hotels & comfort" never reached
    // hotel4. SPEND_CHOICES carries the mapping (budget -> private rooms and
    // hostels, luxury -> hotel4, see wizardTransit.TRAVEL_STYLES).
    if (patch.spend) {
      const style = SPEND_CHOICES.find((x) => x.key === patch.spend)?.style;
      if (style) setTravelStyle(style);
    }
  };

  /** Left/right moves between the two Where tabs, as a tablist must. */
  const onWhereTabKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = WHERE_TABS.indexOf(whereTab);
    const next = WHERE_TABS[(i + (e.key === 'ArrowRight' ? 1 : WHERE_TABS.length - 1)) % WHERE_TABS.length];
    setWhereTab(next);
    document.getElementById(`wtab-${next}`)?.focus();
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

  // Carta designs the stays from the arrival + window, steered by the
  // questionnaire: how busy the days should feel, how many stays, and any
  // must-include cities. A one-home-base trip designs exactly one stay.
  const applyDesign = () => {
    const picks = designStays({
      destinations,
      countries,
      anchorDest,
      anchorId,
      totalNights: windowNights || 5,
      maxStops: stayStyle === 'single' ? 1 : (quizStops || null),
      mustIncludeIds: [...quizMust],
      transport: ownCarChosen ? 'owncar' : 'auto',
    });
    if (!picks.length) return;
    const nextNights = {};
    picks.forEach((p) => { nextNights[p.id] = p.nights; });
    setNights(nextNights);
    setOrder(picks.map((p) => p.id));
    setAutoNightIds(new Set()); // designed nights are deliberate - don't rebalance them
    setDesignedNote(true);
    setDesignQuizOpen(false);
  };

  // The strongest candidate cities in the chosen countries, for the
  // "which cities do you really want?" chips.
  const mustChoices = useMemo(() => {
    if (!designQuizOpen) return [];
    return selectedCountries
      .flatMap((c) => c.cities)
      .map(({ id, dest }) => ({ id, dest, s: gemScore(dest) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 10);
  }, [designQuizOpen, selectedCountries]);

  const toggleQuizMust = (id) => {
    setQuizMust((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Rank a city for the Stay step: how special it is AND how well it fits what
  // this traveller enjoys, softened by distance from where they land.
  const stayRank = (cd) => {
    let r = cd.rankBase;
    if (anchorDest && anchorDest.lat != null && cd.dest.lat != null) {
      const km = haversineKm(anchorDest.lat, anchorDest.lon, cd.dest.lat, cd.dest.lon);
      if (km != null) r -= km / 140;
    }
    return r;
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

  // Data-driven "should this trip have a car?" verdict for the Finish step,
  // from the chosen cities' own transit data + each country's driving intel.
  const advice = useMemo(
    () => carAdvice(includedIds.map((id) => destinations[id]).filter(Boolean), groupSize, countryInsights),
    [includedIds, destinations, groupSize, countryInsights],
  );
  const drivingNotes = useMemo(() => {
    const notes = [];
    for (const c of selectedCountries) {
      const d = countryInsights?.[c.country]?.driving;
      if (!d) continue;
      if (d.side === 'left') notes.push(t('wizard.drivesLeft', { country: c.country }));
      if (d.vignette) notes.push(`${c.country}: ${d.vignette}`);
    }
    return notes;
  }, [selectedCountries, countryInsights, t]);

  // Carta arranges the trip: route the stays out from the arrival point, and
  // (when flexible) pick the cheapest start date with real stored fares.
  // "Getting between stops" is deliberately NOT asked here any more, Carta
  // defaults to its per-leg pick (or the car they arrive with) and every leg
  // stays adjustable in the planner.
  const finish = () => {
    // A published trip keeps the order pipeline/trips composed for it; a trip
    // the traveller built gets routed by the Carta algorithm one last time, so
    // what reaches the planner is the sequence, not the click order.
    const orderedIds = readyTrip ? includedIds : orderedIncludedIds;
    // Days start EMPTY on purpose: sights are chosen in the Day planner
    // ("Plan this day"), not pre-stuffed here, a pre-filled "2 to visit" on
    // every date read as a commitment nobody made.
    const stops = orderedIds.map((id) => ({
      destinationId: id,
      nights: Math.max(1, nights[id] || 1),
      activities: [],
    }));

    // One anchor date, everything else relative to it. Nothing reprices dates
    // any more: Carta holds no fare to shop for a cheaper day with, and the
    // traveller shifts the whole trip themselves from the transport section.
    let start = dateMode === 'exact' ? startDate : '';
    // The 5th of a flexible month is in the past when that month is THIS
    // month, so the floor applies here too.
    if (!start) start = flexMonth ? laterISO(`${flexMonth}-05`, dateMin) : (dateMin || '');
    const end = start && totalNights ? addDays(start, totalNights) : null;

    // Name it after the trip, then after the countries picked, then after the
    // countries the stops are actually in (a typed-in trip picks no country).
    const stopCountries = [...new Set(orderedIds.map((id) => destinations[id]?.country).filter(Boolean))];
    const label = readyTrip
      ? tripHeadline(readyTrip, t)
      : (selectedCountries.length
        ? selectedCountries.map((c) => c.country).slice(0, 2).join(' & ')
        : stopCountries.slice(0, 2).join(' & '));

    // What the traveller told us about the way there and the way home, in the
    // shape the planner already understands: one own-travel record for the
    // outbound and return together, and a per-leg mode and price for the hops
    // in between. A figure they typed always beats an estimate.
    const out = travelValues.out || {};
    const back = travelValues.back || {};
    const legModes = {};
    const ownLegs = {};
    for (const leg of travelLegs) {
      if (leg.kind !== 'inter') continue;
      const v = travelValues[leg.key];
      if (!v?.mode) continue;
      legModes[leg.index] = v.mode;
      const paid = Math.max(0, Math.round(Number(String(v.eur ?? '').replace(',', '.')) || 0));
      if (paid > 0) ownLegs[leg.index] = { mode: v.mode, eur: paid };
    }
    const paidOut = Math.max(0, Math.round(Number(String(out.eur ?? '').replace(',', '.')) || 0));
    const paidBack = Math.max(0, Math.round(Number(String(back.eur ?? '').replace(',', '.')) || 0));
    const ownTravel = {
      airline: [out.service, back.service].map((x) => (x || '').trim()).filter(Boolean).join(' / '),
      mode: out.mode || back.mode || 'fly',
      costTotal: paidOut + paidBack,
      outDate: start || null,
      retDate: end,
    };

    onComplete({
      startDate: start,
      groupSize,
      stayTier: effectiveStayTier,
      // Driving there means driving between the stops too, which is what
      // 'owncar' tells the planner. Everything else leaves each leg open.
      transport: ownCarChosen ? 'owncar' : 'auto',
      pace,
      // The bag add-on was a Ryanair seat-fare thing. Carta prices no seat
      // fare any more, so the planner keeps its own control and the wizard
      // stops asking a question whose answer changes no number here.
      baggage: 'cabin',
      // The airport (or station) they land at, when it is not where they
      // sleep: the planner prices that transfer and nothing else from it.
      anchorId: booked.travel && !ownCarChosen ? arrivalId : null,
      anchorOrigin: null,
      returnAnchorId: null,
      // Carta prices no transport at all, so this is always the traveller's
      // own figure, and always the signal to stop pricing one.
      ownFlight: ownTravel,
      // Where an own-car trip starts, so the planner prices the drive out and
      // home from the traveller's own door, not the origin airport.
      carHome: ownCarChosen ? originPlace : null,
      legModes,
      ownLegs,
      label,
      stops,
    });
  };

  // ---- Stay step data: per-country groups (big cities vs gems), exhaustive ----
  const q = staySearch.trim().toLowerCase();
  const matchesQ = (dest) => !q || dest.city.toLowerCase().includes(q);
  // Rough per-night stay price for the WHOLE group at a candidate city, from
  // the same accommodation model the receipt uses (a 2-night stay so one-off
  // fees amortize), at the traveller's chosen stay tier. Cached hard: the Stay
  // list can hold hundreds of rows, and the tier is in the key so switching it
  // does not serve stale prices.
  const nightlyCache = useRef(new Map());
  const nightlyFor = (id, dest) => {
    const key = `${id}|${groupSize}|${startDate || ''}|${effectiveStayTier}`;
    const cache = nightlyCache.current;
    if (cache.has(key)) return cache.get(key);
    const a = accommodationPerPerson(dest, 2, startDate || null, null, groupSize, effectiveStayTier);
    const v = a && a.total > 0 ? Math.round((a.total * groupSize) / 2) : null;
    cache.set(key, v);
    return v;
  };
  const passesStayFilters = (id, dest) => {
    if (stayMinRating > 0 && (dest.rating?.score ?? 0) < stayMinRating) return false;
    if (stayMaxNightly > 0) {
      const n = nightlyFor(id, dest);
      if (n != null && n > stayMaxNightly) return false;
    }
    return true;
  };

  // ---- Getting around on the ground -------------------------------------
  // The legs between the trip's own points: the airport to the first bed, each
  // stay to the next, the last stay to the airport you fly home from. These
  // are real money (a one-way rental, two bus tickets, a 180 km transfer) and
  // the estimate used to leave every one of them out, so the total under-read
  // the trip by the entire cost of moving around inside it and the traveller
  // met the difference only after committing.
  //
  // Priced with the same engine the planner uses afterwards, so the figure
  // here and the figure there come from one source: Carta's own pick per leg
  // (the car when the trip drives, otherwise train or bus), not a guess.
  const groundLegs = useMemo(() => {
    if (includedIds.length === 0) return null;
    const stops = orderedIncludedIds.map((id) => ({ id, dest: destinations[id] })).filter((s) => s.dest);
    if (!stops.length) return null;
    const carModel = data?.meta?.car_model || null;
    const gs = Math.max(1, groupSize || 1);
    const legs = [];

    // Airport hops: only when you actually fly, and only when the airport
    // city is not itself the stop (flying into Tirana and sleeping in Tirana
    // is not a transfer).
    //
    // The transfer engine deliberately offers nothing for a long hop into a
    // village with no rail or bus: it caps taxis at 90 km and drops public
    // transport where transit is poor. That is honest about TRANSFERS, but
    // silently dropping the leg is not honest about the TRIP, and it is
    // exactly how a 110 km airport-to-mountain run cost nothing at all. When
    // no transfer mode survives, the hop is really an intercity leg, so price
    // it as one.
    const transfer = (from, to, label) => {
      // Airport hops are Carta's own to price: the transport section asks
      // about the journey, not about the bus from the runway.
      const opts = airportTransferOptions(from, to, gs, { carModel, hasRental: false });
      const m = opts?.modes?.[opts.recommended];
      if (m) {
        legs.push({ label, eur: m.eur_total, km: opts.road_km, mode: opts.recommended, hours: m.hours, transfer: true });
        return;
      }
      const inter = legTransportOptions(from, to, gs, { carModel, countryInsights, hasCar: ownCarChosen });
      if (!inter || inter.no_road) return;
      const key = ownCarChosen ? 'car' : (preferredPublicMode(inter) || inter.recommended);
      const im = inter.modes[key];
      if (!im) return;
      legs.push({ label, eur: im.eur_total, km: inter.road_km, mode: key, hours: im.hours, transfer: true });
    };
    const flying = !ownCarChosen;
    // Stop-to-stop legs carry their index, so the running estimate can drop
    // the ones the traveller has already told us the real price of.
    if (flying && anchorDest && anchorId && anchorId !== stops[0].id) {
      transfer(anchorDest, stops[0].dest, t('wizard.legFromAirport', { from: cityLabel(anchorDest.city), city: cityLabel(stops[0].dest.city) }));
    }

    // Stay to stay.
    for (let i = 0; i < stops.length - 1; i += 1) {
      const a = stops[i].dest;
      const b = stops[i + 1].dest;
      const opts = legTransportOptions(a, b, gs, { carModel, countryInsights, hasCar: ownCarChosen });
      if (!opts) continue;
      if (opts.no_road) {
        // A sea crossing with no priceable ferry: say so rather than pricing
        // a road that isn't there.
        legs.push({ label: t('wizard.legSea', { a: a.city, b: b.city }), eur: 0, km: null, mode: null, unpriced: true, legIndex: i });
        continue;
      }
      const key = ownCarChosen ? 'car' : (preferredPublicMode(opts) || opts.recommended);
      const m = opts.modes[key];
      if (!m) continue;
      legs.push({ label: t('wizard.legBetween', { a: a.city, b: b.city }), eur: m.eur_total, km: opts.road_km, mode: key, hours: m.hours, legIndex: i });
    }

    if (!legs.length) return null;
    const total = legs.reduce((s, l) => s + (l.eur || 0), 0);
    return { legs, total };
  }, [includedIds, orderedIncludedIds, destinations, anchorDest, anchorId,
    ownCarChosen, groupSize, countryInsights, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Running price estimate, alive on every step ----------------------
  // Every choice that adds cost adds a line the moment it's made (flight,
  // stays, bags, drive), so the total grows honestly with the answers instead
  // of appearing only at the finish. Ground legs between cities and per-city
  // extras are priced properly by the planner afterwards; the breakdown says
  // so rather than pretending a number it can't know yet. (Placed after
  // nightlyFor on purpose: the memo body runs during this very render.)
  const runningEstimate = useMemo(() => {
    if (!includedIds.length && !travelSpend) return null;
    const gs = Math.max(1, groupSize || 1);
    const lines = [];
    // Getting there is the traveller's own number now: Carta holds no fare
    // for it, so the only honest line is the one they typed.
    if (travelSpend > 0) {
      lines.push({ key: 'travel', label: t('wizard.estTravel'), eur: travelSpend, sub: t('wizard.estYouEntered') });
    }
    if (includedIds.length > 0) {
      let stayTotal = 0;
      let priced = 0;
      for (const id of includedIds) {
        const d = destinations[id];
        const n = d ? nightlyFor(id, d) : null;
        if (n != null) { stayTotal += n * (nights[id] || 0); priced += 1; }
      }
      if (priced > 0) {
        lines.push({
          key: 'stays',
          label: `Stays, ${totalNights} ${totalNights === 1 ? 'night' : 'nights'} in ${includedIds.length} ${includedIds.length === 1 ? 'city' : 'cities'}`,
          eur: stayTotal,
          sub: 'whole group, from real market anchors',
        });
      }
    }
    if (includedIds.length > 0) {
      // What the days themselves cost at the chosen style: the same cost
      // basket the map's lifestyle panel prices from, per stop, whole party.
      const dailyLs = styleLifestyle(travelStyle, lifestyle || data?.meta?.defaults?.lifestyle);
      let daily = 0;
      let dailyOk = false;
      for (const id of includedIds) {
        const d = destinations[id];
        const g = d && (nights[id] || 0) > 0 ? groundSpendPerPerson(d, nights[id], dailyLs) : null;
        if (g && g.total > 0) { daily += g.total; dailyOk = true; }
      }
      if (dailyOk) {
        lines.push({
          key: 'daily',
          label: t('wizard.estDaily'),
          eur: Math.round(daily * gs),
          sub: t('wizard.estDailySub'),
        });
      }
    }
    // Carta still estimates the hops nobody has priced yet, and steps aside
    // for the ones they have: a figure the traveller entered is already on
    // the travel line above, and counting the same journey twice would be
    // worse than saying nothing.
    if (groundLegs) {
      const open = groundLegs.legs.filter((l) => l.transfer
        || !(Number(String(travelValues[`leg${l.legIndex}`]?.eur ?? '').replace(',', '.')) > 0));
      const openTotal = open.reduce((sum, l) => sum + (l.eur || 0), 0);
      if (open.length && openTotal > 0) {
        lines.push({
          key: 'ground',
          label: t(open.length === 1 ? 'wizard.estGroundOne' : 'wizard.estGroundMany', { n: open.length }),
          eur: openTotal,
          sub: t('wizard.estGroundSub'),
        });
      }
    }
    if (!lines.length) return null;
    const total = lines.reduce((s, l) => s + l.eur, 0);
    return { lines, total, gs };
  }, [travelSpend, travelValues, includedIds, nights, totalNights, destinations,
    groupSize, groundLegs, travelStyle, data, effectiveStayTier,
    lifestyle]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the last answer did to the total. estBump is a counter used as a React
  // key on the figure: a new key remounts it, which restarts the CSS bump, so
  // every step visibly moves the price instead of silently rewriting it. The
  // delta chip ("+ EUR 96") fades itself out after a couple of seconds.
  const [estBump, setEstBump] = useState(0);
  const [estDelta, setEstDelta] = useState(null);
  const prevEstTotal = useRef(null);
  const estTotal = runningEstimate?.total ?? null;
  useEffect(() => {
    const prev = prevEstTotal.current;
    prevEstTotal.current = estTotal;
    if (estTotal == null || estTotal === prev) return undefined;
    // No previous total means this answer is what put a price on the board, so
    // the whole figure is the delta.
    setEstDelta(prev == null ? estTotal : estTotal - prev);
    setEstBump((n) => n + 1);
    const id = setTimeout(() => setEstDelta(null), 2400);
    return () => clearTimeout(id);
  }, [estTotal]);

  const stayCountries = selectedCountries.map((c) => {
    const ranked = c.cities
      .map(({ id, dest }) => ({
        id,
        dest,
        rankBase: (dest.rating?.score ?? dest.beauty?.score ?? 0)
          + (dest.rating?.hidden_gem ? 1.5 : 0),
      }))
      .filter((cd) => matchesQ(cd.dest) && passesStayFilters(cd.id, cd.dest))
      .sort((a, b) => {
        if (a.id === anchorId) return -1;
        if (b.id === anchorId) return 1;
        return stayRank(b) - stayRank(a);
      });
    return {
      ...c,
      big: ranked.filter((cd) => cd.dest.tier !== 'gem'),
      gems: ranked.filter((cd) => cd.dest.tier === 'gem'),
    };
  });
  // Searching can also pull in places outside the chosen countries ("make sure
  // they can pick other cities").
  const elsewhereMatches = q
    ? Object.entries(destinations)
      .filter(([id, d]) => d && d.lat != null && !countries.has(d.country) && matchesQ(d) && passesStayFilters(id, d))
      .map(([id, d]) => ({ id, dest: d }))
      .slice(0, 12)
    : [];

  // Every city of the chosen countries for the map picker, plus any selected
  // strays from outside them (search picks stay visible on the map).
  const mapCities = useMemo(() => {
    if (stepName !== 'Stay') return [];
    const out = [];
    for (const c of selectedCountries) {
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
    for (const id of includedIds) {
      if (out.some((o) => o.id === id)) continue;
      const dest = destinations[id];
      if (!dest || dest.lat == null) continue;
      out.push({
        id, city: cityLabel(dest.city), lat: dest.lat, lon: dest.lon,
        tierKey: cityTier(dest).key, score: dest.rating?.score ?? null,
        selected: true, nights: nights[id] || 0,
        isAnchor: id === anchorId, focused: id === focusedId,
      });
    }
    return out;
  }, [stepName, selectedCountries, nights, includedIds, anchorId, focusedId, destinations,
    stayMinRating, stayMaxNightly, groupSize, startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the briefing panel shows before a pin is tapped: the best-rated
  // candidates in the chosen region, so an untouched panel still helps.
  // Countries take turns. A straight top-4 by score handed every slot to
  // whichever country rates highest, so an Austria + Germany trip listed four
  // Austrian cities and never named a German one.
  const topCityPicks = useMemo(() => {
    if (stepName !== 'Stay') return [];
    const byCountry = new Map();
    for (const c of mapCities) {
      if (c.selected || c.score == null) continue;
      const dest = destinations[c.id];
      if (!dest) continue;
      const key = dest.country || '';
      if (!byCountry.has(key)) byCountry.set(key, []);
      byCountry.get(key).push({ id: c.id, score: c.score });
    }
    for (const list of byCountry.values()) list.sort((a, b) => b.score - a.score);
    // Follow the order the countries were picked in, so the arrival country
    // leads; anything else (a selected stray from outside them) trails.
    const order = selectedCountries.map((c) => c.country).filter((k) => byCountry.has(k));
    for (const key of byCountry.keys()) if (!order.includes(key)) order.push(key);
    const limit = order.length <= 1 ? 4 : Math.min(8, order.length * 3);
    const out = [];
    for (let round = 0; out.length < limit; round += 1) {
      let added = false;
      for (const key of order) {
        const list = byCountry.get(key);
        if (round >= list.length) continue;
        out.push(list[round]);
        added = true;
        if (out.length >= limit) break;
      }
      if (!added) break;
    }
    return out
      .map(({ id }) => ({ id, dest: destinations[id] }))
      .filter((x) => x.dest);
  }, [stepName, mapCities, destinations, selectedCountries]);

  // "Pairs well with" hints for the selected cities (computed once per pick set).
  const companionsFor = useMemo(() => {
    const map = {};
    for (const id of includedIds) {
      const dest = destinations[id];
      if (!dest) continue;
      map[id] = cityCompanions(id, dest, destinations)
        .filter((c) => !(includedIds.includes(c.id)));
    }
    return map;
  }, [includedIds, destinations]);

  // Arrival-city matches for the "travel is booked" path.
  const arrivalMatches = useMemo(() => {
    const aq = arrivalQuery.trim().toLowerCase();
    if (!aq) return [];
    return Object.entries(destinations)
      .filter(([, d]) => d && d.lat != null && d.city.toLowerCase().includes(aq))
      .map(([id, d]) => ({ id, dest: d }))
      .sort((a, b) => (b.dest.rating?.score || 0) - (a.dest.rating?.score || 0))
      .slice(0, 8);
  }, [arrivalQuery, destinations]);

  // Anywhere in the catalogue, by name, for the traveller who already knows
  // which towns they hold. Same shape as the arrival search above it.
  const stayMatches = useMemo(() => {
    const sq = stayQuery.trim().toLowerCase();
    if (!sq) return [];
    return Object.entries(destinations)
      .filter(([id, d]) => d && d.lat != null && d.city.toLowerCase().includes(sq) && !(nights[id] > 0))
      .map(([id, d]) => ({ id, dest: d }))
      .sort((a, b) => (b.dest.rating?.score || 0) - (a.dest.rating?.score || 0))
      .slice(0, 8);
  }, [stayQuery, destinations, nights]);

  const renderStayGroup = (country, groupKey, title, list) => {
    if (!list.length) return null;
    const key = `${country}:${groupKey}`;
    const open = expandedGroups.has(key) || Boolean(q);
    const visible = open ? list : list.slice(0, CITIES_PREVIEW);
    return (
      <div className="guide-stay-group" key={key}>
        <div className="guide-stay-group-title">{title}</div>
        <div className="guide-city-list">
          {visible.map((cd) => (
            <StayRow
              key={cd.id}
              id={cd.id}
              dest={cd.dest}
              nights={nights[cd.id]}
              onNights={setCityNights}
              anchorDest={anchorDest}
              isAnchor={cd.id === anchorId}
              companions={companionsFor[cd.id]}
              nightlyEur={nightlyFor(cd.id, cd.dest)}
            />
          ))}
        </div>
        {!open && list.length > CITIES_PREVIEW && (
          <button className="guide-show-more" onClick={() => toggleGroup(key)}>
            {t(groupKey === 'gems' ? 'wizard.showAllGems' : 'wizard.showAllCities', { n: list.length })}
          </button>
        )}
      </div>
    );
  };

  // Landing somewhere pins that country onto the trip, so the Stay step has a
  // region to talk about (more countries can still be added by search).
  useEffect(() => {
    if (!booked.travel || !arrivalDest) return;
    setCountries((prev) => (prev.has(arrivalDest.country) ? prev : new Set([...prev, arrivalDest.country])));
  }, [booked.travel, arrivalDest?.country]); // eslint-disable-line react-hooks/exhaustive-deps

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
      recapChips.push({ Icon: MapPinIcon, text: t('wizard.fromPlaceRecap', { place: originPlace.name }), to: stepNo('From') });
    }
    recapChips.push({
      Icon: PersonIcon,
      text: `${groupSize} ${groupSize === 1 ? t('wizard.travellerOne') : t('wizard.travellerMany')}`,
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
      recapChips.push({ Icon: CalendarIcon, text: `${fmtDate(startDate, true)} → ${fmtDate(endDate, true)}${flexPad ? `, ${t('wizard.plusMinusDays')}` : ''}`, to: stepNo('When') });
    } else if (dateMode === 'flex') {
      recapChips.push({ Icon: CalendarIcon, text: `${flexNights} ${t('wizard.nights')}, ${flexMonth ? months.find((m) => m.key === flexMonth)?.label || flexMonth : t('wizard.cheapestMonth')}`, to: stepNo('When') });
    }
    // How they get there is their own answer now, so the recap repeats it back
    // rather than naming an airport Carta chose.
    if (travelValues.out?.mode) {
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
        text: `${includedIds.length} ${includedIds.length === 1 ? t('wizard.stayOne') : t('wizard.stays')}, ${totalNights} ${t('wizard.nights')}`,
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
      travelers: { adults, children: kids, lifestyle: travelStyle },
      wizard: {
        step,
        countries: [...countries],
        buildMode,
        tripPickId: tripPick?.id || null,
        dateMode,
        flexMonth,
        flexNights,
        quiz,
      },
      selectedDestination: [...countries][0] || null,
      // How they told us they are getting there, and what they said it cost.
      // Carta no longer shops for a fare, so there is no cheapest or fastest
      // to claim and the store carries neither.
      selectedTransit: travelValues.out?.mode
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
    flexMonth, adults, kids, travelStyle, countries, travelValues, includedIds, nights,
    stayStyle, step, buildMode, tripPick?.id, quiz]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new step starts at its own top. Without this the body keeps the previous
  // step's scroll offset, so a long screen can open halfway down its own
  // heading and read as broken.
  const bodyRef = useRef(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step]);

  const focusedDest = focusedId ? destinations[focusedId] : null;

  // On phones the map fills the screen, so the briefing panel that a pin tap
  // populates sits below the fold, it reads as "nothing happened". Nudge the
  // panel into view on selection (narrow screens only; desktop shows both).
  const citySideRef = useRef(null);
  const tripPickRef = useRef(null);
  const scrollPanelIntoView = (el) => {
    if (!el || typeof window === 'undefined') return;
    if (!window.matchMedia?.('(max-width: 700px)').matches) return;
    // Wait for the panel's picked-state content to render before scrolling.
    requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };
  useEffect(() => {
    if (stepName === 'Stay' && focusedId) scrollPanelIntoView(citySideRef.current);
  }, [focusedId, stepName]);
  // On the Getting there step the trip's stops and legs arrive under the
  // header, which on a phone is below the fold.
  useEffect(() => {
    if (stepName === 'Getting' && tripPick) scrollPanelIntoView(tripPickRef.current);
  }, [tripPick?.id, stepName]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const summaryHero = anchorDest || destinations[includedIds[0]] || null;
  const summaryTitle = selectedCountries.map((c) => c.country).slice(0, 2).join(' & ')
    || [...new Set(includedIds.map((id) => destinations[id]?.country).filter(Boolean))].slice(0, 2).join(' & ')
    || t('wizard.planYourTrip');
  const summaryDates = (() => {
    if (dateMode === 'exact' && startDate && endDate) {
      return `${fmtDate(startDate, true)} → ${fmtDate(endDate, true)}${flexPad ? `, ${t('wizard.plusMinusDays')}` : ''}`;
    }
    const when = flexMonth ? (months.find((m) => m.key === flexMonth)?.label || flexMonth) : t('wizard.cheapestMonth');
    return `${flexNights} ${t('wizard.nights')}, ${when}`;
  })();
  const summaryTransport = (() => {
    // Carta no longer picks anyone's flight, so this says what THEY said: the
    // way out, named, and the service if they named one.
    const out = travelValues.out || {};
    if (out.mode) {
      const how = t(TRAVEL_MODE_LABEL[out.mode]);
      return out.service?.trim() ? `${how}, ${out.service.trim()}` : how;
    }
    return t('wizard.transportNotSaid');
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
  const showEstimate = stepName !== 'Where' && !BASICS_STEPS.includes(stepName);

  // ---------------------------------------------------------------- render --
  // The step rail is the wizard's orientation, and there is no opening
  // screen without one any more, so it is always on.
  const showHead = true;

  return (
    <div
      className={inline ? 'guide-inline trip-wizard-inline' : 'guide-overlay trip-wizard-overlay'}
      onClick={inline ? undefined : handleCancel}
    >
      <div
        className={`guide-modal trip-wizard-modal wiz-${layout} ${inline ? 'wiz-inline' : ''} ${stepName === 'When' ? 'wiz-when' : ''} ${stepName === 'Stays' ? 'wiz-top' : ''} ${stepDir === 'back' ? 'wiz-back' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + progress: same one-step-at-a-time header the day planner's
            wizard wears - current step name, "step X of N", thin segments. */}
        {showHead && (
        <div className="guide-head">
          {!inline && <button className="guide-close" onClick={handleCancel} aria-label={t('wizard.close')}>×</button>}
          <div className="guide-head-inner">
            {steps.length > 0 ? (
              <>
                {/* The phone's rail already says "Step 4 of 6 - Where" on its
                    own line, so the header there is the step name alone; the
                    desktop rail names every step but numbers none, so the
                    header keeps the count. */}
                <div className="shape-head-title">
                  {steps[step - 1] ? t(STEP_LABEL_KEYS[steps[step - 1]]) : t('wizard.planYourTrip')}
                  {steps.length > 1 && isDesktop && (
                    <span className="shape-head-step">{t('wizard.stepOf', { x: step, n: steps.length })}</span>
                  )}
                </div>
                {/* Named steps, not anonymous hairlines: a bare segment bar
                    tells you how far along you are but never what is still
                    coming, which is exactly what makes a six-step form feel
                    open-ended. Done steps are tappable to go back.

                    On a phone seven of those overflow their own row: at 375px
                    each step gets 49px, which is a numbered circle and no name
                    at all, and the row scrolls sideways to hide the rest. So
                    below 769px the rail collapses to the step that is actually
                    happening, a progress bar, and a button that opens the whole
                    list as a sheet. */}
                {steps.length > 1 && !isDesktop && (
                  <button
                    type="button"
                    className="wiz-mini"
                    onClick={() => setStepsOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={stepsOpen}
                  >
                    <span className="wiz-mini-line">
                      {/* The step's NAME is the header title one line above,
                          so this line carries the count and the way into the
                          list, and does not say "Booked" a second time. */}
                      <span className="wiz-mini-now">
                        {t('wizard.stepOf', { x: step, n: steps.length })}
                      </span>
                      <ChevronRightIcon size={13} />
                    </span>
                    <span className="wiz-mini-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round((step / steps.length) * 100)}%` }} />
                    </span>
                  </button>
                )}
                {steps.length > 1 && isDesktop && (
                  <ol className="wiz-steps">
                    {steps.map((label, i) => {
                      const n = i + 1;
                      const state = n < step ? 'done' : n === step ? 'now' : 'todo';
                      return (
                        <li key={label} className={`wiz-step ${state}`}>
                          <button
                            type="button"
                            className="wiz-step-btn"
                            disabled={state !== 'done'}
                            onClick={() => goStep(n)}
                            aria-current={state === 'now' ? 'step' : undefined}
                          >
                            <span className="wiz-step-mark">{state === 'done' ? <CheckIcon size={10} /> : n}</span>
                            <span className="wiz-step-name">{t(STEP_LABEL_KEYS[label])}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </>
            ) : (
              <div className="shape-head-title"><SparkIcon size={13} /> {t('wizard.letCartaGuide')}</div>
            )}
          </div>
        </div>
        )}

        {/* Running price estimate: its own band under the header, the full
            width of the wizard, so the growing total is a part of the screen
            rather than a chip in a corner. What the last answer cost lands as
            a delta chip and a bump on the figure; tapping the band opens the
            line-by-line breakdown in place. */}
        {runningEstimate && showEstimate && (
          <div className={`guide-estimate-band ${estimateOpen ? 'open' : ''}`}>
            <span className="guide-estimate-flash" key={`flash-${estBump}`} aria-hidden="true" />
            <button
              className="guide-estimate-main"
              onClick={() => setEstimateOpen((v) => !v)}
              aria-expanded={estimateOpen}
              title={t('wizard.estWhatsIn')}
            >
              <span className="guide-estimate-heading">
                {t('wizard.estSoFar')}
                <small>{runningEstimate.gs} {t(runningEstimate.gs === 1 ? 'wizard.travellerOne' : 'wizard.travellerMany')}</small>
              </span>
              <span className="guide-estimate-figure">
                <b key={`total-${estBump}`}>{eur(runningEstimate.total)}</b>
                {estDelta != null && estDelta !== 0 && (
                  <span className={`guide-estimate-delta ${estDelta < 0 ? 'down' : 'up'}`} key={`delta-${estBump}`}>
                    {estDelta < 0 ? '-' : '+'}{eur(Math.abs(estDelta))}
                  </span>
                )}
              </span>
              <span className="guide-estimate-chips">
                {runningEstimate.lines.map((l) => (
                  <span key={l.key} className="guide-estimate-chip">
                    {l.label} <b>{eur(l.eur)}</b>
                  </span>
                ))}
              </span>
              <span className="guide-estimate-toggle">{estimateOpen ? t('wizard.estHide') : t('wizard.estDetails')}</span>
            </button>
            {estimateOpen && (
              <div className="guide-estimate-detail" role="region" aria-label={t('wizard.estSoFar')}>
                {runningEstimate.lines.map((l) => (
                  <div key={l.key} className="guide-estimate-line">
                    <span className="guide-estimate-label">
                      {l.label}
                      {l.sub && <small>{l.sub}</small>}
                    </span>
                    <b>{eur(l.eur)}</b>
                  </div>
                ))}
                <div className="guide-estimate-line guide-estimate-total">
                  <span className="guide-estimate-label">{t('wizard.estTotalSoFar')}</span>
                  <b>{eur(runningEstimate.total)}</b>
                </div>
              </div>
            )}
          </div>
        )}

        {/* What Carta is planning around - the running recap of every answer. */}
        {recapChips.length > 0 && (
          <div className="guide-recap">
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

        <div className="guide-body" ref={bodyRef}>
         {/* Keyed on the step so each screen remounts and replays its entrance
             animation rather than silently swapping content in place. */}
         <div className="guide-canvas" key={`${stepName}-${step}`}>
          {/* ---- Step 2: which countries ---- */}
          {stepName === 'Where' && (
            <>
              <h2 className="guide-title">{t('wizard.whereTitle')}</h2>
              <p className="guide-sub">{t('wizard.whereSub')}</p>

              {/* The shortlist lives above the tabs, because it belongs to neither
                  of them: a country added by the quiz and one added on the map are
                  the same country, and the traveller has to be able to see
                  everything they have chosen without first picking a tab. */}
              {countries.size > 0 && (
                <div className="guide-picked-row">
                  {allCountries.filter((c) => countries.has(c.country)).map((c) => (
                    <button
                      key={c.country}
                      className="guide-picked-chip"
                      onClick={() => toggleCountry(c.country)}
                      title={t('ready.dropCountry', { country: c.country })}
                    >
                      <Flag iso2={c.iso2} className="guide-flag-img-sm" />
                      {c.country}
                      <span className="guide-picked-x" aria-hidden="true">&times;</span>
                    </button>
                  ))}
                  <button className="guide-stay-filter-clear" onClick={() => setCountries(new Set())}>
                    {t('wizard.stayFilterClear')}
                  </button>
                </div>
              )}

              <div className="guide-datemode guide-wtabs" role="tablist" aria-label={t('wizard.whereTitle')}>
                {WHERE_TABS.map((tab) => (
                  <button
                    key={tab}
                    role="tab"
                    id={`wtab-${tab}`}
                    aria-selected={whereTab === tab}
                    aria-controls={`wpanel-${tab}`}
                    tabIndex={whereTab === tab ? 0 : -1}
                    className={whereTab === tab ? 'on' : ''}
                    onClick={() => setWhereTab(tab)}
                    onKeyDown={onWhereTabKey}
                  >
                    {t(tab === 'help' ? 'wizard.tabHelp' : 'wizard.tabHand')}
                  </button>
                ))}
              </div>

              <div className={`guide-where ${openBrief ? 'has-brief' : ''}`}>
                <div className="guide-where-col">
                  {whereTab === 'help' ? (
                    <div role="tabpanel" id="wpanel-help" aria-labelledby="wtab-help">
                      <WhereQuiz
                        answers={quiz}
                        onAnswer={answerQuiz}
                        monthLabel={tripMonth ? monthName(tripMonth, lang) : ''}
                      />

                      {countryMatches.length > 0 && (
                        <PlannerSection title={t('quiz.recommended')} className="wq-results">
                          <CountryMatchCards
                            matches={countryMatches}
                            picked={countries}
                            onToggle={toggleCountry}
                            onBrief={(name) => setBriefCountry(briefCountry === name ? '' : name)}
                          />
                        </PlannerSection>
                      )}

                      {quiz.types?.length > 0 && countryMatches.length === 0 && (
                        <p className="guide-empty">{t('quiz.noMatches')}</p>
                      )}

                      {/* Carta has just said where it thinks they should go.
                          The honest companion to that is the other ranking:
                          wherever happens to be cheap out of their own airport
                          that month. By now the dates are answered, so this one
                          carries the month. */}
                      <ExploreFlightsCard airport={nearAirports[0]} month={tripYearMonth} lang={lang} t={t} />
                    </div>
                  ) : (
                    <div role="tabpanel" id="wpanel-hand" aria-labelledby="wtab-hand">
                      <div className="guide-datemode guide-stay-view guide-where-view">
                        <button className={whereView === 'list' ? 'on' : ''} onClick={() => setWhereView('list')}>{t('wizard.grid')}</button>
                        <button className={whereView === 'map' ? 'on' : ''} onClick={() => setWhereView('map')}>{t('wizard.map')}</button>
                      </div>

                      {/* The countries the traveller has already starred
                          places in, pulled out above the grid. They are in the
                          grid too (sorted first), but 43 cards is three screens
                          on a phone and their own earlier decisions should not
                          need scrolling to. One tap adds the country. */}
                      {whereView === 'list' && shortlistCountries.length > 0 && (
                        <div className="guide-shortrow">
                          <span className="guide-shortrow-label">
                            <StarIcon size={11} /> {t('wizard.fromYourShortlist')}
                          </span>
                          <div className="guide-shortrow-chips">
                            {shortlistCountries.map((c) => (
                              <button
                                key={c.country}
                                type="button"
                                className={`guide-shortrow-chip ${countries.has(c.country) ? 'on' : ''}`}
                                onClick={() => toggleCountry(c.country)}
                                aria-pressed={countries.has(c.country)}
                              >
                                <Flag iso2={c.iso2} className="guide-flag-img-sm" />
                                {c.country}
                                <span className="guide-shortrow-n">{favByCountry.get(c.country)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {whereView === 'list' ? (
                        <div className="guide-cgrid">
                          {handCountries.map((c) => {
                            const on = countries.has(c.country);
                            const img = countryCovers.get(c.country);
                            const favN = favByCountry.get(c.country) || 0;
                            return (
                              <div key={c.country} className={`guide-ccard ${on ? 'on' : ''} ${briefCountry === c.country ? 'reading' : ''}`}>
                                <button
                                  className="guide-ccard-pick"
                                  onClick={() => toggleCountry(c.country)}
                                  aria-pressed={on}
                                  aria-label={c.country}
                                >
                                  {/* A card is ~170 css px on a phone and ~240 on
                                      a desktop grid, so it asks for the 330 or
                                      500 rendering, never the wire's 960. */}
                                  <HeroImage
                                    url={img}
                                    city={c.country}
                                    iso2={c.iso2}
                                    className="guide-ccard-img"
                                    maxWidth={960}
                                    ratio={[4, 3]}
                                    sizes="(max-width: 480px) 46vw, (max-width: 768px) 30vw, 240px"
                                  />
                                  <span className="guide-ccard-scrim" aria-hidden="true" />
                                  {on && <span className="guide-ccard-check"><CheckIcon size={12} /></span>}
                                  {favN > 0 && (
                                    <span className="guide-ccard-fav">{t('wizard.onShortlist', { n: favN })}</span>
                                  )}
                                  {/* Flag and name, and nothing else on the
                                      photograph. The place count was a number
                                      nobody choosing a country was reading,
                                      and what a day costs is a figure the
                                      brief prints properly, one tap away. */}
                                  <span className="guide-ccard-overlay">
                                    <span className="guide-ccard-name">
                                      <Flag iso2={c.iso2} className="guide-flag-img-sm" />
                                      {c.country}
                                    </span>
                                  </span>
                                </button>
                                {/* The second action on a card that is
                                    otherwise one big selection target: a round
                                    "i" in the corner, out of the way of the
                                    flag and the name, with a 44px hit area of
                                    its own. stopPropagation, or reading about
                                    a country would also add it. */}
                                <button
                                  className="guide-ccard-info"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBriefCountry(briefCountry === c.country ? '' : c.country);
                                  }}
                                  aria-expanded={briefCountry === c.country}
                                  aria-label={t('brief.whatsThereIn', { country: c.country })}
                                >
                                  <InfoIcon size={15} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="guide-where-map">
                          <CountryPickerMap
                            countries={allCountries}
                            selected={countries}
                            onToggle={toggleCountry}
                            recommended={recommendedNames}
                            covers={countryCovers}
                            onBrief={(name) => setBriefCountry(briefCountry === name ? '' : name)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* The country, opened. A right-hand drawer on a desktop,
                    where the grid reflows to make room; a bottom sheet on
                    anything narrower. Never injected into the grid flow,
                    which used to push the whole step down the page. */}
                {openBrief && (
                  <CountryBrief
                    brief={openBrief}
                    picked={countries.has(openBrief.country)}
                    onToggle={toggleCountry}
                    onClose={() => setBriefCountry('')}
                    destinations={destinations}
                    meta={data?.meta}
                    origin={originCode}
                    tripMonth={tripMonth}
                    nights={windowNights || flexNights}
                    startDate={dateMode === 'exact' ? startDate : ''}
                    endDate={dateMode === 'exact' ? endDate : ''}
                    quizTypes={quiz.types}
                    favorites={favorites}
                    onOpenDest={onOpenDest}
                    onSeeAll={onOpenCountry ? () => onOpenCountry(openBrief.iso2) : null}
                    onOpenTrip={onOpenTrip ? (trip) => onOpenTrip(trip.id) : null}
                    onPlanTrip={(trip) => {
                      // Straight to the Trips step with this trip preselected:
                      // the brief's whole job is to end in a decision. The card
                      // itself goes into the pick, which is what the step reads.
                      if (!countries.has(openBrief.country)) toggleCountry(openBrief.country);
                      setBriefCountry('');
                      setBuildMode('ready');
                      setPendingTripPickId(null);
                      setTripPick(trip);
                      const i = steps.indexOf('Trips');
                      if (i >= 0) goStep(i + 1);
                    }}
                  />
                )}
              </div>
            </>
          )}

          {/* ---- FULL PATH: Trips, the ready-made half ----
              One list of published itineraries, the same ones the Destinations
              tab shows. What is in a trip is a page, not a paragraph on a
              card, so "What's there" opens that page rather than unfolding
              anything here; and how you get there is the step after this one,
              not three thousand pixels below the card that chose it. */}
          {stepName === 'Trips' && (
            <>
              <h2 className="guide-title">{t('wizard.tripsTitle')}</h2>

              <ReadyTripsStep
                countries={countries}
                allCountries={allCountries}
                windowNights={windowNights}
                destinations={destinations}
                favorites={favorites}
                selectedId={tripPick?.id || pendingTripPickId}
                onPick={pickReadyTrip}
                onRestorePick={(card) => {
                  setPendingTripPickId(null);
                  setTripPick((cur) => cur || card);
                }}
                onToggleCountry={toggleCountry}
                onOpenTrip={(trip) => setTripPageId(trip.id)}
                onBuildOwn={setBuildMode}
              />
            </>
          )}

          {/* ---- FULL PATH: Getting there ----
              The trip is chosen, so the stops and the nights are settled. What
              is left is the way in, the way home, and the moving about in
              between: one question per leg, priced by the traveller because
              Carta does not sell any of it. */}
          {stepName === 'Getting' && (
            <>
              <h2 className="guide-title">{t('wizard.gettingTitle')}</h2>

              {!tripPick && <p className="guide-empty">{t('ready.noTripYet')}</p>}

              {tripPick && (
                <div className="wpicked" ref={tripPickRef}>
                  <div className="wpicked-head">
                    <span className="wpicked-label"><CheckIcon size={12} /> {t('ready.yourTrip')}</span>
                    <b className="wpicked-name">{tripHeadline(tripPick, t)}</b>
                    <button
                      className="guide-answered-edit"
                      onClick={() => { setTripPick(null); goStep(step - 1); }}
                    >
                      {t('ready.pickAnother')}
                    </button>
                  </div>

                  {tripLoading && <p className="guide-empty">{t('ready.loadingTrip')}</p>}

                  {tripDetail && (
                    <>
                      <div className="wpicked-stops">
                        {stopDates.map((s, i) => destinations[s.id] && (
                          <div className="guide-final-stop" key={s.id}>
                            <span className="wpicked-i">{i + 1}</span>
                            <b>{cityLabel(destinations[s.id].city)}</b>
                            <Flag iso2={destinations[s.id].iso2} className="guide-flag-img-sm" />
                            <span>{s.nights} {s.nights === 1 ? t('wizard.night') : t('wizard.nights')}</span>
                            {s.arrive && <small className="wpicked-date">{fmtDate(s.arrive)}</small>}
                          </div>
                        ))}
                      </div>
                      {tripMissing > 0 && (
                        <p className="guide-empty">{t('ready.stopsMissing', { n: tripMissing })}</p>
                      )}
                      <TravelLegsSection
                        legs={gettingLegs}
                        values={travelValues}
                        onChange={setTravelLeg}
                        adults={adults}
                        startDate={tripStartDate}
                        onSetStart={(d) => { setStartDate(d); setDateMode('exact'); if (totalNights) setEndDate(addDays(d, totalNights)); }}
                        dateMin={dateMin}
                        dateMax={dateMax}
                        openJawHint={jawHint}
                      />
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ---- FULL PATH: Trip basics (origin + dates + party + style) ----
              Origin-first: the departure address, the dates, the party and
              the travel style are ONE context question, answered before any
              destination, so every card afterwards carries a price from the
              traveller's own door. */}
          {/* One question per step, the way the day planner asks its three.
              These four used to be one screen you scrolled: what is booked,
              where you leave from, when, and who is coming, stacked as four
              cards with the Next button somewhere below the fold. Each is now
              its own stop on the rail, so the rail says what is still to come
              and every screen holds one answer. */}
          {stepName === 'Booked' && (
            <>
              <h2 className="guide-title">{t('wizard.alreadyBooked')}</h2>

              {/* The question that shapes the rest of the flow. It is first
                  because every answer below it, and every screen after it,
                  reads differently once something is already held. */}
              <div className="guide-card guide-booked-card">
                <div className="guide-booked-grid">
                  {BOOKED_BITS.map((b) => (
                    <button
                      key={b.key}
                      className={`guide-booked-bit ${booked[b.key] ? 'on' : ''}`}
                      onClick={() => toggleBooked(b.key)}
                      aria-pressed={booked[b.key]}
                    >
                      <span className="guide-booked-icon"><b.Icon size={17} /></span>
                      <span className="guide-booked-text">
                        <b>{t(b.labelKey)}</b>
                        <small>{t(b.subKey)}</small>
                      </span>
                      {booked[b.key] && <span className="guide-mode-check"><CheckIcon size={11} /></span>}
                    </button>
                  ))}

                  {/* Third card, same row: holding nothing, said out loud. */}
                  <button
                    className={`guide-booked-bit guide-booked-none ${bookedNothing ? 'on' : ''}`}
                    onClick={clearBooked}
                    aria-pressed={bookedNothing}
                  >
                    <span className="guide-booked-icon"><BOOKED_NONE.Icon size={17} /></span>
                    <span className="guide-booked-text">
                      <b>{t(BOOKED_NONE.labelKey)}</b>
                      <small>{t(BOOKED_NONE.subKey)}</small>
                    </span>
                    {bookedNothing && <span className="guide-mode-check"><CheckIcon size={11} /></span>}
                  </button>
                </div>
                {/* The note says what the answer takes away. With nothing
                    booked it has nothing to take away, and the card itself
                    already says Carta plans the whole trip, so it goes. */}
                {!bookedNothing && (
                  <p className="guide-note">
                    {booked.travel && booked.stays ? t('wizard.bookedBoth')
                      : booked.stays ? t('wizard.bookedStaysNote')
                        : t('wizard.bookedTravelNote')}
                  </p>
                )}
              </div>
            </>
          )}

          {stepName === 'From' && (
            <>
              <h2 className="guide-title">{t('wizard.originLabel')}</h2>

              {/* Where does the trip leave from? A typed address unlocks
                  every airport within 200 km; skipping it keeps the app's
                  own departure airport, so the step never blocks. */}
              <div className="guide-card guide-origin-home-card">
                {originPlace ? (
                  <div className="guide-origin-picked">
                    <div className="guide-origin-picked-main">
                      <b>{originPlace.name}</b>
                      <button className="guide-answered-edit" onClick={() => { setOriginPlace(null); setOriginResults([]); }}>
                        {t('wizard.change')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="guide-carfrom-row">
                      <input
                        className="guide-search"
                        type="search"
                        value={originQuery}
                        onChange={(e) => setOriginQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') searchOrigin(); }}
                        placeholder={t('wizard.originPlaceholder')}
                        aria-label={t('wizard.originLabel')}
                      />
                      <button
                        className="guide-back guide-carfrom-search"
                        onClick={searchOrigin}
                        disabled={originBusy || originQuery.trim().length < 3}
                      >
                        {originBusy ? t('wizard.searching') : t('wizard.search')}
                      </button>
                    </div>
                    {originResults.length > 0 && (
                      <div className="guide-city-list guide-carfrom-list">
                        {originResults.map((r, i) => (
                          <button
                            key={`${r.lat},${r.lon},${i}`}
                            className="guide-city guide-city-btn"
                            onClick={() => {
                              setOriginPlace({ name: r.shortLabel || r.name, lat: r.lat, lon: r.lon, iso2: r.iso2 });
                              setOriginResults([]);
                              setOriginQuery('');
                            }}
                          >
                            <MapPinIcon size={12} /> <span className="guide-carfrom-label">{r.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {nearAirports.length > 0 && (
                  <div className="guide-airport-chips" aria-label={t('wizard.airportsNear')}>
                    <span className="trip-field-label"><PlaneIcon size={11} /> {t('wizard.airportsNear')}</span>
                    <div className="guide-airport-chip-row">
                      {nearAirports.map((a) => (
                        <span key={a.iata} className="guide-airport-chip">
                          <b>{a.iata}</b> {a.name}
                          <small>{a.km} km</small>
                        </span>
                      ))}
                    </div>
                    {/* The airports are listed, and the obvious next thought
                        is "so where do they actually go". Undated here: on
                        this step the traveller has not answered When yet. */}
                    <ExploreFlightsCard airport={nearAirports[0]} lang={lang} t={t} />
                  </div>
                )}
              </div>


              {/* Travel booked: the one thing Carta then needs is where it
                  puts you down, and how, because that decides the transfer
                  and what the stay suggestions are near. */}
              {booked.travel && (
                <div className="guide-card">
                  <div className="guide-card-head"><MapPinIcon size={14} /> {t('wizard.whereLand')}</div>
                  {arrivalDest ? (
                    <div className="guide-city guide-arrival-picked on">
                      <CityThumb dest={arrivalDest} className="guide-city-thumb" />
                      <div className="guide-city-info">
                        <div className="guide-city-name">
                          {cityLabel(arrivalDest.city)}
                          <Flag iso2={arrivalDest.iso2} className="guide-flag-img-sm" />
                          {arrivalDest.rating?.score != null && <ScoreChip rating={arrivalDest.rating} size="xs" />}
                        </div>
                        <div className="guide-city-insight">{cityInsight(arrivalDest)}</div>
                      </div>
                      <button className="guide-answered-edit" onClick={() => { setArrivalId(''); setArrivalQuery(''); }}>
                        {t('wizard.change')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        className="guide-search"
                        type="search"
                        value={arrivalQuery}
                        onChange={(e) => setArrivalQuery(e.target.value)}
                        placeholder={t('wizard.searchAirportCity')}
                        aria-label={t('wizard.searchArrivalAria')}
                      />
                      {arrivalMatches.length > 0 && (
                        <div className="guide-city-list">
                          {arrivalMatches.map(({ id, dest }) => (
                            <button key={id} className="guide-city guide-city-btn" onClick={() => setArrivalId(id)}>
                              <CityThumb dest={dest} className="guide-city-thumb" />
                              <div className="guide-city-info">
                                <div className="guide-city-name">
                                  {cityLabel(dest.city)}
                                  <Flag iso2={dest.iso2} className="guide-flag-img-sm" />
                                  {dest.rating?.score != null && <ScoreChip rating={dest.rating} size="xs" />}
                                </div>
                                <div className="guide-city-insight">{cityInsight(dest)}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {arrivalQuery && !arrivalMatches.length && (
                        <p className="guide-empty">{t('wizard.noCityMatches', { q: arrivalQuery })}</p>
                      )}
                    </>
                  )}
                  {/* How they travel, asked once. The transport section on the
                      last screen asks what it cost, and reads this back. */}
                  <div className="guide-card-row">
                    <span className="trip-field-label">{t('travel.howLabel')}</span>
                    <div className="tleg-modes">
                      {TRAVEL_MODES.map((m) => {
                        const Icon = TRAVEL_MODE_ICON[m];
                        const on = travelValues.out?.mode === m;
                        return (
                          <button
                            key={m}
                            className={`tleg-mode ${on ? 'on' : ''}`}
                            onClick={() => setTravelLeg('out', { mode: on ? '' : m })}
                            aria-pressed={on}
                          >
                            <Icon size={14} />
                            <span>{t(TRAVEL_MODE_LABEL[m])}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {stepName === 'When' && (
            <>
              <h2 className="guide-title">{t('wizard.whenLabel')}</h2>

              {/* Every date control sits on one card: floating single-line
                  inputs across a wide screen read as unrelated fragments, a
                  card reads as one question with its parts. */}
              <div className="guide-card guide-when-card">
                <div className="guide-datemode">
                  <button className={dateMode === 'exact' ? 'on' : ''} onClick={() => setDateMode('exact')}>
                    {t('wizard.knowDates')}
                  </button>
                  <button className={dateMode === 'flex' ? 'on' : ''} onClick={() => setDateMode('flex')}>
                    <SparkIcon size={12} /> {t('wizard.imFlexible')}
                  </button>
                </div>

                {dateMode === 'exact' ? (
                  <>
                    {/* The calendar lives on the page. Two small triggers that
                        each opened a separate popover made picking a span a
                        trip through two modals, with no view of the trip as a
                        shape. One click sets the start, the next closes the
                        range, and the nights count updates as you go. */}
                    <div className="guide-card-row">
                      <div className="guide-range-head">
                        <span className={`guide-range-end ${!startDate ? 'empty' : ''} ${!endDate ? 'next' : ''}`}>
                          <span className="trip-field-label">{t('wizard.start')}</span>
                          <b>{startDate ? fmtDate(startDate, true) : t('wizard.departureDate')}</b>
                        </span>
                        <span className="trip-dates-arrow">→</span>
                        <span className={`guide-range-end ${!endDate ? 'empty' : ''} ${startDate && !endDate ? 'next' : ''}`}>
                          <span className="trip-field-label">{t('wizard.end')}</span>
                          <b>{endDate ? fmtDate(endDate, true) : t('wizard.returnDate')}</b>
                        </span>
                        {windowNights > 0 && (
                          <span className="guide-when-nights">{windowNights} {windowNights === 1 ? t('wizard.night') : t('wizard.nights')}</span>
                        )}
                        {(startDate || endDate) && (
                          <button
                            className="guide-stay-filter-clear"
                            onClick={() => { setStartDate(''); setEndDate(''); setCalOpen(true); }}
                          >{t('wizard.stayFilterClear')}</button>
                        )}
                      </div>
                      {/* Two months of calendar is 600px of screen, and once
                          the span is set it is 600px of screen saying what
                          the line above it already says. It folds, and the
                          dates themselves reopen it. */}
                      {calOpen ? (
                        <DateField
                          inline
                          panes={2}
                          value={startDate}
                          rangeStart={startDate}
                          rangeEnd={endDate}
                          min={dateMin}
                          max={dateMax}
                          onChange={pickTripDate}
                        />
                      ) : (
                        <button className="guide-when-reopen" onClick={() => setCalOpen(true)}>
                          <CalendarIcon size={12} /> {t('wizard.changeDates')}
                        </button>
                      )}
                    </div>
                    <div className="guide-card-row">
                      <button
                        className={`guide-chip guide-flexpad ${flexPad ? 'on' : ''}`}
                        onClick={() => setFlexPad(!flexPad)}
                        aria-pressed={flexPad}
                      >
                        <SparkIcon size={11} /> {t('wizard.flexPadBtn')}
                      </button>
                      {flexPad && (
                        <p className="guide-note">{t('wizard.flexPadNote')}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="guide-card-row">
                      <span className="trip-field-label">{t('wizard.howLong')}</span>
                      <div className="guide-people guide-people-lg">
                        <button type="button" onClick={() => setFlexNights(Math.max(1, flexNights - 1))} disabled={flexNights <= 1} aria-label={t('wizard.fewerNights')}>-</button>
                        <span>{flexNights} {flexNights === 1 ? t('wizard.night') : t('wizard.nights')}</span>
                        <button type="button" onClick={() => setFlexNights(Math.min(21, flexNights + 1))} disabled={flexNights >= 21} aria-label={t('wizard.moreNights')}>+</button>
                      </div>
                    </div>
                    <div className="guide-card-row">
                      <span className="trip-field-label">{t('wizard.whichMonth')}</span>
                      <div className="guide-months guide-month-grid">
                        <button className={`guide-chip ${flexMonth === '' ? 'on' : ''}`} onClick={() => setFlexMonth('')}>{t('wizard.anyMonth')}</button>
                        {months.map((m) => (
                          <button key={m.key} className={`guide-chip ${flexMonth === m.key ? 'on' : ''}`} onClick={() => setFlexMonth(m.key)}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <p className="guide-note"><SparkIcon size={11} /> {t('wizard.flexNote')}</p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* ---- Step 3, first shape: the cities you already hold ---- */}
          {stepName === 'Stays' && (
            <>
              <h2 className="guide-title">{t('wizard.staysTitle')}</h2>
              <p className="guide-sub">{t('wizard.staysSub')}</p>

              {stopDates.length > 0 && (
                <ol className="booked-route">
                  {stopDates.map((row, i) => {
                    const dest = destinations[row.id];
                    if (!dest) return null;
                    return (
                      <li className="booked-route-item" key={`${row.id}-${i}`}>
                        <div className="booked-stop">
                          <span className="booked-stop-index">{i + 1}</span>
                          <CityThumb dest={dest} className="booked-stop-thumb" />
                          <div className="booked-stop-info">
                            <div className="booked-stop-city">{cityLabel(dest.city)} <Flag iso2={dest.iso2} className="guide-flag-img-sm" /></div>
                            <div className="booked-stop-sub">
                              {dest.country}
                              {row.arrive && <span className="booked-stop-date">{fmtDate(row.arrive)}</span>}
                            </div>
                          </div>
                          <div className="guide-nights">
                            <button onClick={() => setCityNights(row.id, (nights[row.id] || 1) - 1)} aria-label={t('wizard.fewerNights')}>-</button>
                            <span className="guide-nights-val">
                              <b>{row.nights}</b> {row.nights === 1 ? t('wizard.nightOne') : t('wizard.nightMany')}
                            </span>
                            <button onClick={() => setCityNights(row.id, (nights[row.id] || 0) + 1)} aria-label={t('wizard.moreNights')}>+</button>
                          </div>
                          <button
                            className="trip-stop-remove"
                            onClick={() => setCityNights(row.id, 0)}
                            aria-label={t('wizard.removeStop', { city: cityLabel(dest.city) })}
                            title={t('wizard.removeStop', { city: cityLabel(dest.city) })}
                          >×</button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              <div className="guide-card">
                <div className="guide-card-head"><BedIcon size={14} /> {t('wizard.addStop')}</div>
                <input
                  className="guide-search"
                  type="search"
                  value={stayQuery}
                  onChange={(e) => setStayQuery(e.target.value)}
                  placeholder={t('wizard.searchCities')}
                  aria-label={t('wizard.searchCities')}
                />
                {stayMatches.length > 0 && (
                  <div className="guide-city-list">
                    {stayMatches.map(({ id, dest }) => (
                      <button
                        key={id}
                        className="guide-city guide-city-btn"
                        onClick={() => { setCityNights(id, 2); setStayQuery(''); }}
                      >
                        <CityThumb dest={dest} className="guide-city-thumb" />
                        <div className="guide-city-info">
                          <div className="guide-city-name">
                            {cityLabel(dest.city)}
                            <Flag iso2={dest.iso2} className="guide-flag-img-sm" />
                            {dest.rating?.score != null && <ScoreChip rating={dest.rating} size="xs" />}
                          </div>
                          <div className="guide-city-insight">{cityInsight(dest)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {stayQuery && !stayMatches.length && (
                  <p className="guide-empty">{t('wizard.noCityMatches', { q: stayQuery })}</p>
                )}
              </div>
            </>
          )}

          {/* ---- Step 3, third shape: pick the cities, Carta routes them ---- */}
          {stepName === 'Stay' && (
            <>
              <h2 className="guide-title">{t('wizard.stayTitle')}</h2>
              {/* Building your own is reached from the bottom of the trips
                  list, so the only thing this step owes it is one quiet way
                  back. The two-button mode switch that used to sit here was a
                  question nobody had at the top of a step they had chosen. */}
              {!booked.stays && (
                <button className="wready-link wready-back" onClick={() => setBuildMode('ready')}>
                  &larr; {t('ready.backToReady')}
                </button>
              )}
              <p className="guide-sub">
                {anchorDest
                  ? t(ownCarChosen ? 'wizard.stayIntroArrive' : 'wizard.stayIntroLand', { city: cityLabel(anchorDest.city) })
                  : t('wizard.stayIntroFree')}
              </p>

              {/* What the algorithm did with the cities, said out loud. The
                  order is not a suggestion the traveller has to accept: it is
                  already the order the trip will be built in, so the panel
                  reports rather than asks, and offers the one thing worth
                  choosing, whether the nights get shared out too. */}
              {cartaPlan && (
                <div className="wroute">
                  <div className="wroute-head">
                    <span className="wroute-label"><SparkIcon size={12} /> {t('route.title')}</span>
                    {cartaPlan.kmSaved > 20 && (
                      <span className="wroute-saved">{t('route.saved', { km: cartaPlan.kmSaved })}</span>
                    )}
                  </div>
                  <div className="wroute-line">
                    {cartaPlan.order.map((id, i) => destinations[id] && (
                      <React.Fragment key={id}>
                        {i > 0 && <span className="wroute-arrow" aria-hidden="true">&rsaquo;</span>}
                        <span className="wroute-stop">
                          {cityLabel(destinations[id].city)}
                          <b>{cartaPlan.nights[id]}</b>
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="wroute-foot">
                    <span className="wroute-fact">{t('route.km', { km: cartaPlan.km })}</span>
                    <span className="wroute-fact">{t('route.hours', { h: Math.round(cartaPlan.hours) })}</span>
                    {cartaPlan.crowded && <span className="wroute-warn"><AlertIcon size={11} /> {t('route.crowded')}</span>}
                    {nightsDiffer && (
                      <button className="wroute-apply" onClick={applyCartaNights}>
                        {t('route.applyNights')}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* One base, or changing stays? Decides how Carta designs.
                  Once stops are on the board the question is answered, so the
                  toggle folds into a read-only tag: it stays on screen (the
                  answer is still visible, still changeable) without competing
                  with the map for attention every time the step re-renders. */}
              <div className="guide-staystyle">
                {includedIds.length > 0 && !stayStyleOpen ? (
                  <div className="guide-answered">
                    <span className="guide-answered-label">{t('wizard.howStay')}</span>
                    <span className="guide-answered-value">
                      {stayStyle === 'single' ? <BedIcon size={11} /> : <RouteIcon size={11} />}
                      {t(stayStyle === 'single' ? 'wizard.oneHomeBase' : 'wizard.changeStays')}
                    </span>
                    <button className="guide-answered-edit" onClick={() => setStayStyleOpen(true)}>
                      {t('wizard.change')}
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="trip-field-label">{t('wizard.howStay')}</span>
                    <div className="guide-datemode guide-staystyle-toggle">
                      <button
                        className={stayStyle === 'multi' ? 'on' : ''}
                        onClick={() => { setStayStyle('multi'); setStayStyleOpen(false); }}
                      >
                        <RouteIcon size={12} /> {t('wizard.changeStays')}
                      </button>
                      <button
                        className={stayStyle === 'single' ? 'on' : ''}
                        onClick={() => { setStayStyle('single'); setStayStyleOpen(false); }}
                      >
                        <BedIcon size={12} /> {t('wizard.oneHomeBase')}
                      </button>
                    </div>
                    {stayStyle === 'single' && (
                      <p className="guide-note">{t('wizard.oneBaseNote')}</p>
                    )}
                  </>
                )}
              </div>

              {/* Curated route shapes, fitted to THIS trip's nights: each
                  card is a real designed route, cities and nights included,
                  one tap to take. Hand-picking below stays the full control. */}
              {stayTemplates.length > 0 && (
                <div className="guide-templates">
                  <span className="trip-field-label"><SparkIcon size={11} /> {t('wizard.templatesLabel', { n: windowNights || flexNights })}</span>
                  <div className="guide-template-row">
                    {stayTemplates.map((tpl) => (
                      <button key={tpl.key} className="guide-template" onClick={() => applyTemplate(tpl)}>
                        <b className="guide-template-name">{t(tpl.labelKey)}</b>
                        <span className="guide-template-route">
                          {tpl.picks.map((x, i) => (
                            <span key={x.id} className="guide-template-stop">
                              {i > 0 && <span className="guide-template-arrow">→</span>}
                              {cityLabel(destinations[x.id]?.city) || x.id} <small>{x.nights}{t('wizard.nightShort')}</small>
                            </span>
                          ))}
                        </span>
                        <small className="guide-template-legs">
                          {tpl.picks.length} {t('wizard.stays')}{tpl.legKm > 0 ? `, ~${tpl.legKm} km ${t('wizard.onTheRoad')}` : ''}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button className="guide-design-btn guide-design-btn-quiet" onClick={() => setDesignQuizOpen((v) => !v)} aria-expanded={designQuizOpen}>
                <span className="guide-design-spark"><SparkIcon size={13} /></span>
                <span className="guide-design-text">
                  {t(stayStyle === 'single' ? 'wizard.pickMyBase' : 'wizard.pickMyCities')}
                  <small>{t('wizard.nightsTuned', { n: windowNights || flexNights })}</small>
                </span>
              </button>

              {designQuizOpen && (
                <div className="guide-design-quiz">
                  <div className="guide-quiz-q">
                    <span className="trip-field-label">{t('wizard.howBusy')}</span>
                    <div className="guide-months">
                      {PACE_CHOICES.map((p) => (
                        <button
                          key={p.key}
                          className={`guide-chip ${pace === p.key ? 'on' : ''}`}
                          onClick={() => setPace(p.key)}
                        >{t(p.labelKey)}</button>
                      ))}
                    </div>
                  </div>
                  {stayStyle === 'multi' && (
                    <div className="guide-quiz-q">
                      <span className="trip-field-label">{t('wizard.howManyStays')}</span>
                      <div className="guide-months">
                        <button className={`guide-chip ${quizStops === 0 ? 'on' : ''}`} onClick={() => setQuizStops(0)}>{t('wizard.cartaDecides')}</button>
                        {[2, 3, 4, 5].map((n) => (
                          <button key={n} className={`guide-chip ${quizStops === n ? 'on' : ''}`} onClick={() => setQuizStops(n)}>{n}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {mustChoices.length > 0 && (
                    <div className="guide-quiz-q">
                      <span className="trip-field-label">{t('wizard.mustCities')}</span>
                      <div className="guide-months">
                        {mustChoices.map(({ id, dest }) => (
                          <button
                            key={id}
                            className={`guide-chip ${quizMust.has(id) ? 'on' : ''}`}
                            onClick={() => toggleQuizMust(id)}
                          >{cityLabel(dest.city)}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button className="guide-next guide-quiz-go" onClick={applyDesign}>
                    <SparkIcon size={12} /> {t(stayStyle === 'single' ? 'wizard.designMyStay' : 'wizard.designMyRoute')}
                  </button>
                </div>
              )}

              {designedNote && includedIds.length > 0 && (
                <p className="guide-note"><CheckIcon size={11} /> {t(includedIds.length === 1 ? 'wizard.designedOneStop' : 'wizard.designedStops', { n: includedIds.length })}</p>
              )}

              {/* Search, the narrowing filters and the view switch are one
                  toolbar: three separate full-width bands stacked on top of
                  each other pushed the actual map below the fold. */}
              <div className="guide-toolbar">
                <input
                  className="guide-search"
                  type="search"
                  value={staySearch}
                  onChange={(e) => setStaySearch(e.target.value)}
                  placeholder="Search any city or town…"
                  aria-label="Search cities"
                />
                {/* Narrow the pool before falling in love: minimum rating and a
                    nightly stay budget, with the per-night price on every row.
                    Applies to both the Map and List views below. */}
                <div className="guide-stay-filters">
                  <label className="guide-stay-filter">
                    <span>{t('wizard.stayFilterRating')}</span>
                    <select value={stayMinRating} onChange={(e) => setStayMinRating(Number(e.target.value))}>
                      <option value="0">{t('wizard.stayFilterAny')}</option>
                      <option value="6">6+</option>
                      <option value="7">7+</option>
                      <option value="8">8+</option>
                      <option value="9">9+</option>
                    </select>
                  </label>
                  <label className="guide-stay-filter">
                    <span>{t('wizard.stayFilterPrice')}</span>
                    <select value={stayMaxNightly} onChange={(e) => setStayMaxNightly(Number(e.target.value))}>
                      <option value="0">{t('wizard.stayFilterAny')}</option>
                      <option value="60">{t('wizard.stayFilterUpTo', { price: '€60' })}</option>
                      <option value="90">{t('wizard.stayFilterUpTo', { price: '€90' })}</option>
                      <option value="120">{t('wizard.stayFilterUpTo', { price: '€120' })}</option>
                      <option value="180">{t('wizard.stayFilterUpTo', { price: '€180' })}</option>
                      <option value="250">{t('wizard.stayFilterUpTo', { price: '€250' })}</option>
                    </select>
                  </label>
                  {(stayMinRating > 0 || stayMaxNightly > 0) && (
                    <button
                      className="guide-stay-filter-clear"
                      onClick={() => { setStayMinRating(0); setStayMaxNightly(0); }}
                    >{t('wizard.stayFilterClear')}</button>
                  )}
                </div>

                <div className="guide-datemode guide-stay-view">
                  <button className={stayView === 'map' ? 'on' : ''} onClick={() => setStayView('map')}>{t('wizard.map')}</button>
                  <button className={stayView === 'list' ? 'on' : ''} onClick={() => setStayView('list')}>{t('wizard.list')}</button>
                </div>
              </div>

              {stayView === 'map' && (
                <>
                  <div className="guide-stay-wrap">
                    <CityPickerMap
                      cities={mapCities}
                      onToggle={toggleCity}
                      onFocus={(id) => setFocusedId((cur) => (cur === id ? '' : id))}
                      anchor={anchorDest && anchorDest.lat != null ? { lat: anchorDest.lat, lon: anchorDest.lon } : null}
                    />
                    <div className="guide-city-side" ref={citySideRef}>
                      {!focusedDest ? (
                        // An empty rectangle with one line of grey text was the
                        // largest thing on this screen. Give the panel a job
                        // before anything is picked: the best-rated candidates,
                        // one tap from their briefing.
                        <div className="guide-side-idle">
                          <div className="guide-side-idle-head">
                            <MapPinIcon size={16} />
                            <p>{t('wizard.tapCityHint')}</p>
                          </div>
                          {topCityPicks.length > 0 && (
                            <>
                              <div className="guide-stay-group-title">{t('wizard.bestRatedHere')}</div>
                              <div className="guide-side-idle-list">
                                {topCityPicks.map(({ id, dest }) => (
                                  <button key={id} className="guide-side-idle-row" onClick={() => setFocusedId(id)}>
                                    <CityThumb dest={dest} className="guide-nearby-thumb" />
                                    <span className="guide-side-idle-text">
                                      <b>
                                        {cityLabel(dest.city)}
                                        {/* Which country each pick sits in, once the trip spans more
                                            than one: without it a mixed list reads as one region. */}
                                        {selectedCountries.length > 1 && (
                                          <Flag iso2={dest.iso2} className="guide-flag-img-sm guide-side-idle-flag" />
                                        )}
                                      </b>
                                      <small>{cityInsight(dest)}</small>
                                    </span>
                                    {dest.rating?.score != null && <ScoreChip rating={dest.rating} size="xs" />}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <>
                          <CityThumb dest={focusedDest} className="guide-city-side-photo" />
                          <div className="guide-city-side-title">
                            <b>{cityLabel(focusedDest.city)}</b>
                            <Flag iso2={focusedDest.iso2} className="guide-flag-img-sm" />
                            {focusedDest.rating?.score != null && <ScoreChip rating={focusedDest.rating} size="xs" />}
                            {focusedDest.rating?.hidden_gem && <HiddenGemTag />}
                          </div>
                          {focusedId === anchorId && (
                            <p className="guide-note"><PlaneIcon size={10} /> {t('wizard.youArriveHere')}</p>
                          )}
                          <p className="guide-city-side-insight">{cityInsight(focusedDest)}</p>
                          <div className="guide-city-facts">
                            {anchorDest && anchorDest.lat != null && focusedDest.lat != null && focusedId !== anchorId && (
                              <div className="guide-city-fact">
                                <span className="guide-city-fact-label">{t('wizard.fromArrival')}</span>
                                <span className="guide-city-fact-value">{Math.round(haversineKm(anchorDest.lat, anchorDest.lon, focusedDest.lat, focusedDest.lon))} km</span>
                              </div>
                            )}
                            {/* "Worth", not "Stay": this is Carta's advice on
                                how long the place deserves. Labelled "Stay" it
                                sat directly above the stepper holding the
                                nights actually booked and read as a second,
                                contradictory answer to the same question. */}
                            <div className="guide-city-fact">
                              <span className="guide-city-fact-label">{t('wizard.worthLabel')}</span>
                              <span className="guide-city-fact-value">
                                {t('wizard.worthValue', { n: t(suggestedNights(focusedDest).textKey) })}
                                {(nights[focusedId] || 0) > 0 && (
                                  <span className="guide-city-fact-booked">
                                    {t('wizard.youPlanned', {
                                      n: nights[focusedId],
                                      unit: nights[focusedId] === 1 ? t('wizard.night') : t('wizard.nights'),
                                    })}
                                  </span>
                                )}
                              </span>
                            </div>
                            {knownForFacts(focusedDest).map(([label, value]) => (
                              <div className={`guide-city-fact ${label === 'Known for' ? 'guide-city-fact-known' : ''}`} key={label}>
                                <span className="guide-city-fact-label">{label}</span>
                                <span className="guide-city-fact-value">{value}</span>
                              </div>
                            ))}
                          </div>
                          {(nights[focusedId] || 0) > 0 ? (
                            <div className="guide-city-side-actions">
                              <div className="guide-nights">
                                <button onClick={() => setCityNights(focusedId, (nights[focusedId] || 0) - 1)} aria-label={t('wizard.fewerNights')}>-</button>
                                <span className="guide-nights-val"><b>{nights[focusedId]}</b> {nights[focusedId] === 1 ? t('wizard.night') : t('wizard.nights')}</span>
                                <button onClick={() => setCityNights(focusedId, (nights[focusedId] || 0) + 1)} aria-label={t('wizard.moreNights')}>+</button>
                              </div>
                              <button className="guide-back" onClick={() => toggleCity(focusedId)}>{t('wizard.remove')}</button>
                            </div>
                          ) : (
                            <button
                              className="guide-next guide-city-side-add"
                              onClick={() => {
                                if (stayStyle === 'single' && includedIds.length >= 1) {
                                  // One home base: the new pick replaces the old.
                                  includedIds.forEach((id) => { if (id !== focusedId) toggleCity(id); });
                                }
                                toggleCity(focusedId);
                              }}
                            >
                              <BedIcon size={12} /> {t(stayStyle === 'single' ? 'wizard.makeMyBase' : 'wizard.addToTrip')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="guide-tier-legend">
                    <span className="guide-tier guide-tier-top"><StarIcon size={9} /> {t('wizard.legendMust')}</span>
                    <span className="guide-tier guide-tier-great"><DiamondIcon size={9} /> {t('wizard.legendGreat')}</span>
                    <span className="guide-tier guide-tier-good"><DotIcon size={8} /> {t('wizard.legendWorth')}</span>
                    <span className="guide-tier-legend-note">{t('wizard.legendNote')}</span>
                  </div>
                </>
              )}

              {/* The nights budget moved to the footer, beside Next: as small
                  text at the bottom of a scrolling column it was the one thing
                  gating progress and the easiest thing to miss. */}
              {(stayView === 'list' || q) && (
                <>
                  {stayCountries.map((c) => (
                    <div key={c.country} className="guide-country-block">
                      <div className="guide-block-head"><Flag iso2={c.iso2} className="guide-flag-img-sm" /> {c.country}</div>
                      {renderStayGroup(c.country, 'big', 'Cities', c.big)}
                      {renderStayGroup(c.country, 'gems', 'Gems & scenic stays', c.gems)}
                      {!c.big.length && !c.gems.length && (
                        <p className="guide-empty">No match in {c.country} for “{staySearch}”.</p>
                      )}
                    </div>
                  ))}
                  {elsewhereMatches.length > 0 && (
                    <div className="guide-country-block">
                      <div className="guide-block-head">Beyond your countries</div>
                      <div className="guide-city-list">
                        {elsewhereMatches.map(({ id, dest }) => (
                          <StayRow
                            key={id}
                            id={id}
                            dest={dest}
                            nights={nights[id]}
                            onNights={setCityNights}
                            anchorDest={anchorDest}
                            isAnchor={id === anchorId}
                            companions={companionsFor[id]}
                            nightlyEur={nightlyFor(id, dest)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Selected summary while in map view, so nights stay adjustable. */}
              {stayView === 'map' && !q && includedIds.length > 0 && (
                <div className="guide-stay-group">
                  <div className="guide-stay-group-title">Your stops</div>
                  <div className="guide-city-list">
                    {includedIds.map((id) => destinations[id] && (
                      <StayRow
                        key={id}
                        id={id}
                        dest={destinations[id]}
                        nights={nights[id]}
                        onNights={setCityNights}
                        anchorDest={anchorDest}
                        isAnchor={id === anchorId}
                        companions={companionsFor[id]}
                        nightlyEur={nightlyFor(id, destinations[id])}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---- Finish (full + landed) ---- */}
          {stepName === 'Finish' && (
            <>
              <h2 className="guide-title">{t('wizard.finishTitle')}</h2>
              <p className="guide-sub">{t('wizard.finishSubFull')}</p>

              {/* Every trip has to get to the first stop and home from the
                  last. The full section used to render again here, so the last
                  screen re-asked every question the step before it had just
                  answered. This reports instead, and its one control goes back
                  to the step that owns them. */}
              {gettingLegs.length > 0 && (
                <TravelLegsSummary
                  legs={gettingLegs}
                  values={travelValues}
                  onEdit={() => {
                    const i = steps.indexOf('Getting');
                    if (i >= 0) goStep(i + 1);
                  }}
                />
              )}

              {ownCarChosen ? (
                // They bring their own car: never pitch a rental at them, just
                // the practical driving notes for the countries on the route.
                drivingNotes.length > 0 && (
                  <div className="guide-car-advice no">
                    <div className="guide-car-advice-head">
                      <CarIcon size={13} /> {t('wizard.ownCarNotesTitle')}
                    </div>
                    {drivingNotes.map((n, i) => <p key={`d${i}`} className="guide-car-note"><AlertIcon size={11} /> {n}</p>)}
                  </div>
                )
              ) : (advice.verdict !== 'no' || drivingNotes.length > 0) && (
                <div className={`guide-car-advice ${advice.verdict}`}>
                  <div className="guide-car-advice-head">
                    {advice.verdict === 'no' ? <TrainIcon size={13} /> : <CarIcon size={13} />}
                    {' '}
                    {advice.verdict === 'yes' ? t('wizard.carAdviceYes')
                      : advice.verdict === 'maybe' ? t('wizard.carAdviceMaybe')
                      : t('wizard.carAdviceNo')}
                  </div>
                  {advice.reasons.map((r, i) => <p key={i}>{r}</p>)}
                  {drivingNotes.map((n, i) => <p key={`d${i}`} className="guide-car-note"><AlertIcon size={11} /> {n}</p>)}
                </div>
              )}

              {/* The trip itself, as one card: a photo of where you are going,
                  the four facts that define the trip, the stops, and what it
                  costs. The screen used to end on a single grey line of text
                  with the commit button alone in a far corner. */}
              <div className="guide-summary">
                {summaryHero && <CityThumb dest={summaryHero} className="guide-summary-hero" />}
                <div className="guide-summary-body">
                  <div className="guide-summary-title">
                    <b>{summaryTitle}</b>
                    <small>{totalNights} {totalNights === 1 ? t('wizard.night') : t('wizard.nights')}</small>
                  </div>

                  <div className="guide-summary-facts">
                    {/* The one fact on this card that is also a control.
                        Party size multiplies every figure below it, so it is
                        adjusted here, against a visible price, rather than
                        guessed at four steps earlier. */}
                    <div className="guide-summary-fact guide-summary-party">
                      <span className="guide-summary-fact-label"><PersonIcon size={10} /> {t('wizard.summaryTravellers')}</span>
                      <div className="guide-people">
                        <button type="button" onClick={() => setAdults(Math.max(1, adults - 1))} disabled={adults <= 1} aria-label={t('trip.fewer')}>-</button>
                        <span>{adults}</span>
                        <button type="button" onClick={() => setAdults(Math.min(20, adults + 1))} disabled={adults >= 20} aria-label={t('trip.more')}>+</button>
                      </div>
                      {kidsOpen || kids > 0 ? (
                        <div className="guide-summary-kids">
                          <span className="trip-field-label">{t('wizard.children')}</span>
                          <div className="guide-people">
                            <button type="button" onClick={() => setKids(Math.max(0, kids - 1))} disabled={kids <= 0} aria-label={t('trip.fewer')}>-</button>
                            <span>{kids}</span>
                            <button type="button" onClick={() => setKids(Math.min(10, kids + 1))} disabled={kids >= 10} aria-label={t('trip.more')}>+</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="guide-kids-add" onClick={() => setKidsOpen(true)}>
                          + {t('wizard.children')}
                        </button>
                      )}
                      {kids > 0 && <p className="guide-note guide-kids-note">{t('wizard.childrenNote')}</p>}
                    </div>
                    <div className="guide-summary-fact">
                      <span className="guide-summary-fact-label"><CalendarIcon size={10} /> {t('wizard.summaryDates')}</span>
                      <b>{summaryDates}</b>
                    </div>
                    <div className="guide-summary-fact">
                      <span className="guide-summary-fact-label"><RouteIcon size={10} /> {t('wizard.summaryGettingThere')}</span>
                      <b>{summaryTransport}</b>
                    </div>
                    <div className="guide-summary-fact">
                      <span className="guide-summary-fact-label"><BedIcon size={10} /> {t('wizard.summaryStays')}</span>
                      <b>{includedIds.length} {includedIds.length === 1 ? t('wizard.stayOne') : t('wizard.stays')}</b>
                    </div>
                  </div>

                  <div className="guide-summary-stops">
                    {includedIds.map((id) => destinations[id] && (
                      <div className="guide-final-stop" key={id}>
                        <BedIcon size={11} />
                        <b>{cityLabel(destinations[id].city)}</b>
                        <Flag iso2={destinations[id].iso2} className="guide-flag-img-sm" />
                        <span>{nights[id]} {nights[id] === 1 ? t('wizard.night') : t('wizard.nights')}</span>
                      </div>
                    ))}
                  </div>

                  {/* How you actually move between those stops, priced. The
                      old receipt jumped straight from stays to the total and
                      left every ground leg silently unpaid. */}
                  {groundLegs && (
                    <div className="guide-summary-legs">
                      <div className="guide-stay-group-title">{t('wizard.gettingAround')}</div>
                      {groundLegs.legs.map((l, i) => (
                        <div className="guide-summary-leg" key={i}>
                          {l.mode === 'car' ? <CarIcon size={11} /> : l.mode === 'train' ? <TrainIcon size={11} /> : <RouteIcon size={11} />}
                          <span className="guide-summary-leg-label">{l.label}</span>
                          {l.km != null && <small>{l.km} km</small>}
                          <b>{l.unpriced ? t('wizard.legUnpriced') : eur(l.eur)}</b>
                        </div>
                      ))}
                    </div>
                  )}

                  {runningEstimate && (
                    <div className="guide-summary-cost">
                      {runningEstimate.lines.map((l) => (
                        <div className="guide-estimate-line" key={l.key}>
                          <span className="guide-estimate-label">
                            {l.label}
                            {l.sub && <small>{l.sub}</small>}
                          </span>
                          <b>{eur(l.eur)}</b>
                        </div>
                      ))}
                      <div className="guide-estimate-line guide-estimate-total">
                        <span className="guide-estimate-label">{t('wizard.summaryTotal')}</span>
                        <b>{eur(runningEstimate.total)}</b>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* The "Let Carta arrange it" button lives once, in the sticky
                  footer where the action has sat on every previous step. A
                  second copy inside the summary card was the same control twice
                  on one screen; the footer one is always reachable without
                  scrolling the summary, so this is the copy that stays. */}
            </>
          )}

         </div>
        </div>

        {/* Footer: where the traveller has got to, and the way on. */}
        <div className="guide-foot">
          <div className="guide-foot-inner">
            <div className="guide-foot-summary">
              {hasProgress && (
                <button className="guide-startover" onClick={startOver} title={t('wizard.startOverTitle')}>
                  &#8634; {t('wizard.startOver')}
                </button>
              )}
              {/* The gate on this step, stated where the decision is made. */}
              {stepName === 'Trips' && tripPick ? (
                // The chosen trip, in the footer that is already on screen,
                // instead of a panel that used to open three thousand pixels
                // below the card that opened it.
                <span className="guide-nights-budget done">
                  <CheckIcon size={11} />
                  {t('ready.footPicked', {
                    route: (tripPick.cities || tripPick.stops || [])
                      .map((c) => cityLabel(c.city)).join(' → '),
                    days: tripPick.days,
                  })}
                </span>
              ) : stepName === 'Stay' && windowNights > 0 ? (
                <span className={`guide-nights-budget ${totalNights > windowNights ? 'over' : ''} ${totalNights === windowNights ? 'done' : ''}`}>
                  {totalNights === windowNights && <CheckIcon size={11} />}
                  {t('wizard.nightsPlanned', { n: totalNights, of: windowNights })}
                  {totalNights > windowNights && `, ${t('wizard.overWindow')}`}
                </span>
              ) : (
                includedIds.length > 0 && t('wizard.footSummary', { cities: includedIds.length, nights: totalNights })
              )}
            </div>
            <div className="guide-foot-actions">
              {/* Step one is the first thing anyone sees now, so there is
                  nothing behind it to go back to. */}
              {step > 1 && (
                <button className="guide-back" onClick={() => goStep(step - 1)}>{t('wizard.back')}</button>
              )}
              {step < steps.length ? (
                // "Next" says a step happens; it never says which. Naming the
                // destination is the difference between a form that could go
                // anywhere and one whose end is in sight.
                <button className="guide-next" onClick={() => goStep(step + 1)} disabled={!canNext}>
                  {/* The step name as written, not lowercased: German capitalises
                      its nouns and "Weiter: reisen" is a spelling mistake. */}
                  {t('wizard.nextTo', { step: t(STEP_LABEL_KEYS[steps[step]] || 'wizard.stepFinish') })}
                </button>
              ) : (
                // The Finish step's call to action sits in the sticky nav slot
                // the traveller has used on every step, so a long summary can
                // never hide the way forward.
                <button className="guide-next" onClick={finish} disabled={includedIds.length === 0}>
                  <SparkIcon size={13} /> {t('wizard.arrangeIt')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The phone's step list, opened from the one-line rail. Done steps are
          tappable; the one still to come are named but inert, which is the
          whole reason the list exists: it says what is still coming. */}
      {stepsOpen && (
        <SheetShell
          title={t('wizard.stepsTitle')}
          onClose={() => setStepsOpen(false)}
          className="wiz-steps-sheet"
          labelId="wiz-steps-title"
        >
          <ol className="wiz-sheet-list">
            {steps.map((label, i) => {
              const n = i + 1;
              const state = n < step ? 'done' : n === step ? 'now' : 'todo';
              return (
                <li key={label} className={`wiz-sheet-step ${state}`}>
                  <button
                    type="button"
                    disabled={state !== 'done'}
                    onClick={() => goStep(n)}
                    aria-current={state === 'now' ? 'step' : undefined}
                  >
                    <span className="wiz-step-mark">{state === 'done' ? <CheckIcon size={11} /> : n}</span>
                    <span className="wiz-sheet-name">{t(STEP_LABEL_KEYS[label])}</span>
                    {state === 'done' && <span className="wiz-sheet-edit">{t('wizard.editStep')}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </SheetShell>
      )}

      {/* "What's there", answered by the page that answers it everywhere else.
          It is position:fixed at z-index 240, so it covers the wizard rather
          than being injected into a step. Its big button is the decision:
          choose this trip, close the page, go to Getting there. */}
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
