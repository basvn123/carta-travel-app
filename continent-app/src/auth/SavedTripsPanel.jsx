import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchSavedTrips, deleteTrip } from './tripStorage.js';
import { fetchTripPlans, deleteTripPlan } from './tripPlanStorage.js';
import {
  loadStandalonePlans, deleteStandalonePlan, loadAssignments, subscribeDayPlanStore,
  loadTripExtras, persistTripExtras, hasTripExtras,
} from '../planner/dayPlanStore.js';
import { tripsStore } from '../planner/tripsStore.js';
import { CalendarIcon, CameraIcon, RouteIcon, LinkIcon, PencilIcon, ReceiptIcon } from '../components/Icons.jsx';
import { shareReceiptOn } from '../lib/share/flag.js';
// T1175: the receipt sheet loads on first use; it is behind a flag.
const ShareReceiptSheet = lazy(() => import('../components/ShareReceiptSheet.jsx').then((m) => ({ default: m.ShareReceiptSheet })));
// T1215 (T1152-g): the taste card, its profile code and the taxonomy map load
// with the Your Europe tab, not with My trips.
import { Button } from '../components/ui/index.js';
import { loadDeviceTrip, clearDeviceTrip } from '../planner/deviceTripStore.js';
import { PastTripForm } from './PastTripForm.jsx';
import { TripMemoryView } from './TripMemoryView.jsx';
import {
  savePastTripToAccount, savePastTripOnDevice, pastTripAsPlanRow, defaultPastLabel,
  updatePastTripInAccount, updatePastTripOnDevice,
} from './pastTrip.js';
import {
  loadMemory, saveMemory, clearMemory, coverPhoto, memoryPoints, spendSummary, spendPerPerson, tripSpendPerPerson, emptyMemory, SPEND_CATS,
} from './pastTripMemory.js';
import { COUNTRY_ISO2 } from '../components/CountryFlag.jsx';
import { crewLabel, crewInitials, namedCrew, readCrew, writeCrew, MAX_CREW } from './tripCrew.js';
import { TripSharePanel } from './TripSharePanel.jsx';
import { ModerationNotice } from './ModerationNotice.jsx';
import { fetchMyStatements, contestStatement, latestByPlan } from './moderation.js';
import { fetchFriendLinks, listFriendTrips } from './friends.js';
import { ownersOf } from './useFriendTrips.js';
import { formatMoney } from '../lib/money.js';
import { countryName } from '../lib/countryName.js';
import { useI18n } from '../i18n/index.jsx';
import { activeLocale } from '../lib/localeState.js';
import { useFavoriteItems } from '../hooks/useFavoriteItems.js';
import { parseFavKey } from '../lib/favorites.js';
import { E2E_SEAMS } from '../lib/e2eSeams.js';
import { seedWatch } from '../lib/watchStore.js';
import {
  ONE_PLANS, STATEMENT_PLANS, FIRST_PAST_PLANS, FIRST_PAST_MEMS, YEARS_PLANS, YEARS_MEMS, LOTS_FAV_KEYS, LOTS_WATCH,
  SPEND_PLANS, spendExtras,
} from './mytrips/savedMocks.js';
import { DayPrice } from '../browse/ExploreCards.jsx';
import '../styles/70-mytrips.css';
import { InstallHint } from './InstallHint.jsx';
import { KeptTrips } from './mytrips/KeptTrips.jsx';
import { SavedJourneys } from './mytrips/SavedJourneys.jsx';
import { holdPlan, useKept } from '../lib/recommend/keptStore.js';
import {
  localToday, addDaysIso, classifyTrips, whenParts, dayPlanEndDate, orderedUnique, daysUntil,
  nightsBetween, tripFigure, visitedRecord, yearOf, deviceTripAsPlan, readinessSteps, tripStops,
  isHappening, tripToday, europeMilestones, planBedNudge,
} from '../lib/myTrips.js';
import { useVisitedCountries, toggleVisitedCountry } from '../lib/visitedCountries.js';
import { UNDO_MS, UndoToast, CrewBar, TripPrice, whenText } from './mytrips/parts.jsx';
import { SiteFooter } from '../components/SiteFooter.jsx';
import { MyTripsHead, TripsTab, VisitedCountriesSheet, MT_TABS } from './mytrips/MyTripsTabs.jsx';
import { BAND_CUTOFFS } from '../lib/rating.js';
import { YourEurope } from './mytrips/YourEurope.jsx';
import { AtlasSlot } from './mytrips/atlas/AtlasSlot.jsx';
import { NoPrice } from './mytrips/atlas/Ink.jsx';
import { useEuropeMap, NAME_OF } from './mytrips/atlas/plateData.js';
import { tripsLayer, europeLayer } from './mytrips/atlas/layers.js';
import { exportYearCard } from './mytrips/YearRecap.jsx';
import { YearStudio } from './mytrips/YearStudio.jsx';
import { defaultStudio, yearCardModel } from './mytrips/yearCardModel.js';
import { CountrySheet } from './mytrips/EuropeParts.jsx';
import { tripYear, yearCard } from '../lib/atlasFacts.js';
import { publishTasteInputs } from './mytrips/tasteInputs.js';
import { AddBookingSheet } from './mytrips/AddBookingSheet.jsx';
import { SavedTab } from './mytrips/SavedTab.jsx';
import { useSharedLists, MOCK_FRIENDS } from './sharedLists.js';
import { sharedKeys } from '../lib/sharedListModel.js';
import { useSavedLists, loadSavedLists, noteSaved, createList, setNote } from '../lib/savedLists.js';
import { scrollBehavior } from '../lib/motion.js';
import { TodayCard } from './mytrips/TodayCard.jsx';
import { UnitSheet, UnitButton, RateTrip, tripInUnit, unitWords } from './mytrips/TripParts.jsx';
import { pastAgainSeed } from '../lib/plan/seedWriters.js';
import { shareRouteImage } from './mytrips/atlas/routeImage.js';
import { project } from './mytrips/atlas/project.js';

/**
 * My trips (T434, rebuilt as Concept A by T923 to T927). One header with
 * three underline tabs:
 *   Trips        the next trip as the focal card with how ready it is, Today
 *                while a trip runs, Coming up and Being planned.
 *   Saved        everything saved, in the traveller's own lists.
 *   Your Europe  the record: the countries, the money, the past trips.
 *
 * This file keeps the state, the data and the undo; the tabs and cards are
 * drawn in ./mytrips/. Dates decide what is upcoming and what is past
 * (lib/myTrips.js); nobody files anything.
 */

// ?savedmock verify seam: fixture rows stand in for the Supabase tables so
// the account-only shapes render in headless checks. Never on in production.
const SAVED_MOCK = E2E_SEAMS && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('savedmock');
// G12: ?savedmock=<variant> picks a fixture state (./mytrips/savedMocks.js);
// a bare ?savedmock is the default set.
const MOCK_VARIANT = SAVED_MOCK ? (new URLSearchParams(window.location.search).get('savedmock') || '') : null;
// Nothing of the seam's own: signed out, or signed in with nothing at all.
const MOCK_BARE = ['guest', 'empty'].includes(MOCK_VARIANT);
// The variants built on the default trips (and their stored extras).
const MOCK_DEFAULT_TRIPS = ['', 'next', '1', 'lots', 'nopast', 'drafts'].includes(MOCK_VARIANT);
// The statement of reasons (DSA) has its own variant, one trip to come with
// it, so the busy variants stay about the lists (G12 round 4).
const MOCK_WITH_STATEMENT = MOCK_VARIANT === 'statement';
// Each variant starts from a clean device: the seam writes trip extras,
// memories, lists and watched prices into localStorage, and a variant must
// not show another's. Cleared once when the variant changes (dev only).
if (SAVED_MOCK) {
  try {
    const MARK = 'carta.savedmock.variant';
    if (localStorage.getItem(MARK) !== MOCK_VARIANT) {
      const keep = new Set(['carta.savedTripsTab', 'continent.homeSeen.v1']);
      Object.keys(localStorage).filter((k) => !keep.has(k)).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(MARK, MOCK_VARIANT);
    }
  } catch { /* private mode */ }
}
const MOCK_FAVS = [
  { id: 'mf1', destination_id: 'LIS', city: 'Lisbon', country: 'Portugal', depart_date: addDaysIso(34), return_date: addDaysIso(38), created_at: addDaysIso(-12) },
  { id: 'mf2', destination_id: 'OPO', city: 'Porto', country: 'Portugal', depart_date: addDaysIso(62), return_date: addDaysIso(65), created_at: addDaysIso(-30) },
  { id: 'mf3', destination_id: 'gem:bruges', city: 'Bruges', country: 'Belgium', created_at: addDaysIso(-45) },
];
// T925: saved places the seam adds to this browser's own shortlist, with the
// price each was saved at a little off today's so the moves render.
// T942: a lake and a trail too, so Plan a trip with these hands kinds over.
const MOCK_FAV_KEYS = ['dest:BCN', 'dest:SPU', 'dest:LJU', 'dest:NAP', 'lake:SI/si-lake-bled-Q648902', 'trail:AT/20050'];
const MOCK_SAVED_AT = { 'dest:BCN': 6, 'dest:SPU': -3, 'dest:LIS': 11 };
// T927: what the seam's booking reader "reads", in place of parse-booking.
const mockRead = () => new Promise((resolve) => setTimeout(() => resolve({
  ok: true,
  result: {
    bookings: [
      { kind: 'stay', title: 'Casa do Rio', city: 'Porto', eur: 318, date: addDaysIso(24) },
      { kind: 'activity', title: 'Port cellar tour', city: 'Porto', eur: 36, date: addDaysIso(25), code: 'PX7731' },
    ],
  },
}), 700));
const MOCK_FRIEND_TRIPS = [
  { ownerId: 'u-sofie', ownerHandle: 'sofie_v', ownerName: 'Sofie Vermeulen', tripPlanId: 'ft1', label: 'Two weeks in Portugal', startDate: addDaysIso(-90), endDate: addDaysIso(-80), cities: ['Lisbon', 'Porto'], countries: ['Portugal'], destinationIds: ['LIS', 'OPO'] },
  { ownerId: 'u-sofie', ownerHandle: 'sofie_v', ownerName: 'Sofie Vermeulen', tripPlanId: 'ft2', label: 'Alpine summer', startDate: addDaysIso(-200), endDate: addDaysIso(-193), cities: ['Innsbruck'], countries: ['Austria'], destinationIds: ['INN'] },
  { ownerId: 'u-jonas', ownerHandle: 'jonas', ownerName: 'Jonas Peeters', tripPlanId: 'ft3', label: 'A week in Rome', startDate: addDaysIso(-150), endDate: addDaysIso(-143), cities: ['Rome'], countries: ['Italy'], destinationIds: ['FCO'] },
];
const MOCK_STATEMENTS = [
  { id: 1, plan_id: 'ms1', plan_label: 'Lisbon and Porto', source: 'notice', notice_count: 2, facts: 'The guide copies a chapter of a published travel book word for word.', automated: false, created_at: addDaysIso(-3), contest_until: addDaysIso(180), complaint_status: 'none', complaint_note: null, reinstated: false, ground: 'terms', ground_ref: 'c6' },
];
// Stops carry their own windows so the seam can price the trips the way a
// real account's rows are priced (choices on the first stop, T434).
const mockStops = (list) => list.map(([id, a, b]) => ({ destination_id: id, city: '', country: '', arrive_date: addDaysIso(a), depart_date: addDaysIso(b) }));
const MOCK_PLANS = [
  // T943: saved with its plan bed prices, Porto's a little above today's.
  { id: 'mp1', label: null, cities: ['Lisbon', 'Porto'], countries: ['Portugal'], start_date: addDaysIso(21), end_date: addDaysIso(27), destination_ids: ['LIS', 'OPO'], stops: mockStops([['LIS', 21, 24], ['OPO', 24, 27]]).map((s, i) => ({ ...s, choices: { planBed: i ? { mockOver: 0.09, at: addDaysIso(-12) } : { mockOver: 0.01, at: addDaysIso(-12) } } })), choices: { groupSize: 2 } },
  { id: 'mp2', label: 'Autumn in Flanders', cities: ['Bruges'], countries: ['Belgium'], start_date: addDaysIso(-40), end_date: addDaysIso(-35), destination_ids: ['gem:bruges'] },
  { id: 'mp3', label: null, cities: ['Salzburg'], countries: ['Austria'], start_date: addDaysIso(-380), end_date: addDaysIso(-377), destination_ids: ['SZG'] },
  { id: 'mp4', label: null, cities: ['Munich'], countries: ['Germany'], start_date: addDaysIso(-9), end_date: addDaysIso(-7), destination_ids: ['MUC'] },
  { id: 'mp5', label: null, cities: ['Ljubljana'], countries: ['Slovenia'], start_date: addDaysIso(75), end_date: addDaysIso(79), destination_ids: [] },
  // T923: two drafts, no dates yet, for Being planned.
  { id: 'mp7', label: 'Alps hut tour', cities: ['Innsbruck'], countries: ['Austria'], start_date: null, end_date: null, destination_ids: ['INN'], stops: [{ destination_id: 'INN', nights: 6 }] },
  { id: 'mp8', label: 'Lake weekend', cities: ['Ljubljana'], countries: ['Slovenia'], start_date: null, end_date: null, destination_ids: ['LJU'] },
  // T926: past trips with stops (so Carta's estimate exists for them), one
  // completing Benelux with Bruges, one in Spain so Portugal completes Iberia.
  { id: 'mp9', label: 'Amsterdam and Luxembourg', cities: ['Amsterdam', 'Luxembourg'], countries: ['Netherlands', 'Luxembourg'], start_date: addDaysIso(-200), end_date: addDaysIso(-195), destination_ids: ['AMS', 'LUX'], stops: mockStops([['AMS', -200, -197], ['LUX', -197, -195]]), choices: { groupSize: 2 } },
  { id: 'mp10', label: null, cities: ['Seville'], countries: ['Spain'], start_date: addDaysIso(-430), end_date: addDaysIso(-424), destination_ids: ['SVQ'], stops: mockStops([['SVQ', -430, -424]]), choices: { groupSize: 2 } },
  // T924: a trip happening today, on its third day.
  { id: 'mp6', label: 'Rome and Naples', cities: ['Rome', 'Naples'], countries: ['Italy'], start_date: addDaysIso(-2), end_date: addDaysIso(3), destination_ids: ['FCO', 'NAP'], stops: mockStops([['FCO', -2, 2], ['NAP', 2, 3]]), choices: { groupSize: 2 } },
];

/** The seam's own trip state, written once into this browser so the cards
 *  read it through the same stores a real trip uses (dev only). */
// The plans each variant starts with.
function mockPlansFor(v) {
  if (v === 'one') return ONE_PLANS;
  if (v === 'statement') return STATEMENT_PLANS;
  if (v === 'firstpast') return FIRST_PAST_PLANS;
  if (v === 'years') return YEARS_PLANS;
  if (v === 'spend') return SPEND_PLANS;
  if (v === 'drafts') return MOCK_PLANS.filter((p) => !p.start_date);
  if (v === 'nopast') return MOCK_PLANS.filter((p) => !p.end_date || p.end_date >= addDaysIso(0));
  if (v === 'next') return MOCK_PLANS.filter((p) => p.id !== 'mp6');
  return MOCK_DEFAULT_TRIPS ? MOCK_PLANS : [];
}

function seedMock() {
  if (!SAVED_MOCK) return;
  const ownMems = MOCK_VARIANT === 'firstpast' ? FIRST_PAST_MEMS : MOCK_VARIANT === 'years' ? YEARS_MEMS : null;
  if (ownMems) Object.entries(ownMems).forEach(([id, m]) => { if (!loadMemory(id)) saveMemory(id, { ...emptyMemory(), ...m }, {}); });
  if (MOCK_VARIANT === 'lots') seedWatch(LOTS_WATCH);
  if (MOCK_VARIANT === 'spend' && !hasTripExtras('msp1')) persistTripExtras('msp1', { ...loadTripExtras('msp1'), ...spendExtras() });
  if (!MOCK_DEFAULT_TRIPS) return;
  if (!hasTripExtras('mp6')) {
    const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return `${d.getTime()}`; };
    persistTripExtras('mp6', {
      ...loadTripExtras('mp6'),
      people: [{ id: 'p0', name: 'Sam', userId: null }],
      bookings: { 'flight-out': { ref: 'AZ611', price: '264' }, 'stay-0': { ref: 'RM2231', price: '420' }, 'stay-1': { ref: 'NP0912', price: '96' } },
      dayNotes: { 3: 'Trastevere and the river' },
      ideas: [{ id: 'i1', text: 'Breakfast at the market in Campo de Fiori', day: 3 }, { id: 'i2', text: 'Walk up the Gianicolo for the view', day: 3 }],
      dayExtras: { 3: [{ id: 'b1', name: 'Villa Farnesina', eur: 24, day: 3 }], 4: [{ id: 'b2', name: 'Train to Naples', eur: 39, day: 4 }] },
      expenses: [
        { id: at(9), desc: 'Coffee and cornetti', amount: 9.6, currency: 'EUR', paidBy: 0, sharers: null, date: addDaysIso(0), cat: 'food' },
        { id: at(11), desc: 'Bus passes', amount: 14, currency: 'EUR', paidBy: 0, sharers: null, date: addDaysIso(0), cat: 'transport' },
        { id: at(13), desc: 'Lunch', amount: 31.5, currency: 'EUR', paidBy: 0, sharers: null, date: addDaysIso(0), cat: 'food' },
        { id: at(12), desc: 'Dinner', amount: 58, currency: 'EUR', paidBy: 0, sharers: null, date: addDaysIso(-1), cat: 'food' },
      ],
    });
    try { localStorage.setItem('carta.mytrips.done.v1', JSON.stringify({ mp6: { 3: ['i:i1'] } })); } catch { /* private mode */ }
  }
  // T926: memories with spend, photos and a rating on three past trips.
  const MEMS = {
    mp2: { places: [{ id: 'gem:bruges', city: 'Bruges', country: 'Belgium', lat: 51.209, lon: 3.224, nights: 5 }], travellers: { adults: 2, children: 0 }, spend: { currency: 'EUR', stay: 380, food: 290, transport: 40, activities: 50 }, rating: 8, photos: [{ id: 'm1', src: '/home/film/bled.webp' }, { id: 'm2', src: '/home/film/porto.webp' }] },
    mp9: { places: [{ id: 'AMS', city: 'Amsterdam', country: 'Netherlands', lat: 52.37, lon: 4.9, nights: 3 }, { id: 'LUX', city: 'Luxembourg', country: 'Luxembourg', lat: 49.61, lon: 6.13, nights: 2 }], travellers: { adults: 2, children: 0 }, spend: { currency: 'EUR', stay: 520, food: 240, transport: 60 }, rating: 9, photos: [{ id: 'm3', src: '/home/film/hallstatt.webp' }, { id: 'm4', src: '/home/film/lagos.webp' }, { id: 'm5', src: '/home/film/dubrovnik.webp' }] },
    mp10: { places: [{ id: 'SVQ', city: 'Seville', country: 'Spain', lat: 37.39, lon: -5.98, nights: 6 }], travellers: { adults: 2, children: 0 }, spend: { currency: 'EUR', stay: 430, food: 310, activities: 70 }, rating: null, photos: [] },
  };
  Object.entries(MEMS).forEach(([id, m]) => { if (!loadMemory(id)) saveMemory(id, { ...emptyMemory(), ...m }, {}); });
  if (hasTripExtras('mp1')) return;
  persistTripExtras('mp1', {
    ...loadTripExtras('mp1'),
    people: [{ id: 'p0', name: 'Sam', userId: null }],
    bookings: { 'flight-out': { ref: 'TP1342', price: '312' }, 'stay-0': { ref: 'BK7781', price: '318' } },
  });
  try {
    localStorage.setItem(BED_BASE_KEY, JSON.stringify({ mp1: { beds: null, at: addDaysIso(-12), mockLower: 42 } }));
  } catch { /* private mode */ }
}

// T943: the seam's trip carries a plan price a share above today's bed, so
// the plan nudge renders against whatever today's price is (dev only).
function mockPlanBeds(p, figure) {
  if (!p?.stops?.some((s) => s.choices?.planBed?.mockOver)) return p;
  let i = -1;
  return {
    ...p,
    stops: p.stops.map((s) => {
      if (!s.destination_id) return s;
      i += 1;
      const over = s.choices?.planBed?.mockOver;
      const now = figure?.bedNights?.[i];
      return over && Number.isFinite(now) ? { ...s, choices: { ...s.choices, planBed: { night: now * (1 + over), at: s.choices.planBed.at } } } : s;
    }),
  };
}

// How many euros the beds of a trip must have fallen, for the whole party,
// before the card says so: a price model that moved by small change is not
// news (T923 price nudge).
const NUDGE_MIN_EUR = 5;
const NUDGE_MIN_SHARE = 0.03;
// The beds' price for the whole party the first time My trips priced a
// trip, by plan id: { beds, at }. The nudge compares today's price for the
// same dates against it and names the day it was first priced.
const BED_BASE_KEY = 'carta.mytrips.bedBase.v1';
const readBedBase = () => { try { return JSON.parse(localStorage.getItem(BED_BASE_KEY) || '{}') || {}; } catch { return {}; } };
const writeBedBase = (v) => { try { localStorage.setItem(BED_BASE_KEY, JSON.stringify(v)); } catch { /* private mode */ } };

const TAB_KEY = 'carta.savedTripsTab';
// T923: the tabs were renamed; a stored choice of the old names still lands.
const OLD_TABS = { planned: 'trips', favorites: 'saved', visited: 'europe' };
const readTab = () => {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return MT_TABS.includes(v) ? v : (OLD_TABS[v] || 'trips');
  } catch { return 'trips'; }
};
const writeStored = (key, v) => { try { localStorage.setItem(key, v); } catch { /* private mode */ } };

export function SavedTripsPanel({
  data, onLoadTripPlan, onOpenAuth, onOpenDayPlan, onGoToTab,
  favorites = null, onToggleFav = null, onOpenFeature = null, onOpenDest = null,
  // The day-cost map Explore prints from, and the Lifestyle the trip planner
  // prices with, so every figure here is the figure there.
  costs = null, stayTier = 'home', lifestyle = null,
  onOpenFriends = null, onOpenDeviceTrip = null, onPlanStops = null, onPlanKept = null, onPlanTripCountry = null,
  // G12 B3 (L5): My trips' plan buttons hand Plan a seed (App's openPlan), not a bare tab.
  onPlanSeed = null,
  // T659: Plan's "Add a past trip" opens My trips on the past-trip form.
  startWithPast = false, onPastStarted = null,
  // G12 Phase C: the "Prijzen tonen" setting the trip plate and the rows
  // follow, and its writer (App's setChoices, through lib/price/priceView).
  choices = null, setChoices = null,
}) {
  const { user, configured } = useAuth();
  const { t, lang } = useI18n();
  const destinations = useMemo(() => data?.destinations || {}, [data]);
  const todayIso = localToday();
  useState(seedMock);

  const [tab, setTab] = useState(readTab);
  const pickedRef = useRef(false);
  const pickTab = (v) => { pickedRef.current = true; setTab(v); writeStored(TAB_KEY, v); };
  // G12 atlas: the tab's one authored moment plays after a tab change, never
  // at first paint; the tab bodies mount fresh on each change and read this.
  const [drawnTab, setDrawnTab] = useState(tab);
  const [tabDraw, setTabDraw] = useState(false);
  if (drawnTab !== tab) { setDrawnTab(tab); setTabDraw(true); }

  const authed = !!user || (SAVED_MOCK && MOCK_VARIANT !== 'guest');
  const [trips, setTrips] = useState(SAVED_MOCK && !MOCK_BARE ? MOCK_FAVS : []);
  const [loading, setLoading] = useState(!!user && !SAVED_MOCK);
  // ?savedmock=next leaves out the trip happening today, so the seam shows
  // the next trip's focal card instead of Today.
  const [tripPlans, setTripPlans] = useState(() => (!SAVED_MOCK || MOCK_VARIANT === 'loading' ? [] : mockPlansFor(MOCK_VARIANT)));
  const [tripPlansLoading, setTripPlansLoading] = useState((!!user && !SAVED_MOCK) || MOCK_VARIANT === 'loading');
  // A list that cannot be read is not a traveller with no trips (020 lesson).
  const [tripPlansError, setTripPlansError] = useState(() => (MOCK_VARIANT === 'error' ? t('saved.errLoad') : ''));
  const [statements, setStatements] = useState(SAVED_MOCK && MOCK_WITH_STATEMENT ? MOCK_STATEMENTS : []);
  const [dayPlans, setDayPlans] = useState(() => loadStandalonePlans());
  // The one trip kept on this device without an account (T500, carta.
  // deviceTrip.v1), read once per opening of My trips (T503, owner T500-a).
  const [deviceStored, setDeviceStored] = useState(() => (SAVED_MOCK ? null : loadDeviceTrip()));
  const devicePlan = useMemo(() => deviceTripAsPlan(deviceStored, destinations), [deviceStored, destinations]);
  // T923: the trips the Plan home lists on this device; the undated ones are
  // drafts, listed under Being planned with a link back to Plan.
  const [deviceDrafts, setDeviceDrafts] = useState(() => (SAVED_MOCK ? [] : safeList()));
  useEffect(() => tripsStore.subscribe(() => setDeviceDrafts(safeList())), []);
  // Any write to a trip's extras or day plans (the planner, the sync, the
  // booking sheet) re-reads what the cards show.
  const [storeTick, setStoreTick] = useState(0);
  useEffect(() => subscribeDayPlanStore(({ remote }) => {
    if (remote) setDayPlans(loadStandalonePlans());
    setStoreTick((n) => n + 1);
  }), []);

  const loadTrips = () => {
    setLoading(true);
    fetchSavedTrips(user.id).then(setTrips).catch(() => {}).finally(() => setLoading(false));
  };
  const loadTripPlans = () => {
    setTripPlansLoading(true);
    setTripPlansError('');
    fetchTripPlans(user.id)
      .then((rows) => { setTripPlans(rows); setTripPlansError(''); })
      .catch((e) => {
        console.error('trip plans failed to load', e);
        setTripPlans([]);
        setTripPlansError(t('saved.errLoad'));
      })
      .finally(() => setTripPlansLoading(false));
  };
  const loadStatements = () => {
    fetchMyStatements().then(setStatements).catch((e) => console.error('statements of reasons failed to load', e));
  };
  useEffect(() => {
    if (!user || SAVED_MOCK) { setLoading(false); setTripPlansLoading(MOCK_VARIANT === 'loading'); return; }
    loadTrips();
    loadTripPlans();
    loadStatements();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the account id; the loaders are rebuilt each render

  const handleDelete = async (id) => {
    setTrips((prev) => prev.filter((x) => x.id !== id));
    if (SAVED_MOCK) return;
    try { await deleteTrip(id); } catch { loadTrips(); }
  };

  // ── A trip that already happened, told by hand. ──
  const [pastOpen, setPastOpen] = useState(false);
  const [pastEdit, setPastEdit] = useState(null);
  const [pastBusy, setPastBusy] = useState(false);
  const [pastError, setPastError] = useState('');
  const [memTick, setMemTick] = useState(0);
  const [openMemory, setOpenMemory] = useState('');
  const [openShare, setOpenShare] = useState('');
  // G12 Phase C: the unit sheet, example mode (never saved, never counted)
  // and the route a hovered or focused row lifts on the map.
  const [unitOpen, setUnitOpen] = useState(false);
  // G12 Phase D: the slot's host for Saved's live map.
  const [savedMapEl, setSavedMapEl] = useState(null);
  const [euLift, setEuLift] = useState('');
  const [example, setExample] = useState(false);
  const [lift, setLift] = useState('');
  const [friends, setFriends] = useState([]);
  const [friendTrips, setFriendTrips] = useState(SAVED_MOCK && !MOCK_BARE ? MOCK_FRIEND_TRIPS : []);
  const [visById, setVisById] = useState({});
  // G12 Phase F: the year card studio's choices and the traveller's own
  // upload (a data URL held in memory on this device, never sent).
  const [yc, setYc] = useState(defaultStudio);
  const [studioOpen, setStudioOpen] = useState(false);
  const [ycUpload, setYcUpload] = useState('');
  const [ycBusy, setYcBusy] = useState('');
  const [ycNote, setYcNote] = useState('');
  // "Toon bewaard" from a country sheet opens Saved filtered to that country.
  const [savedCc, setSavedCc] = useState('');
  // T927: the Add a booking sheet, opened from the header or a trip's
  // readiness, with the trip it was opened from.
  const [book, setBook] = useState(null);
  const [countriesOpen, setCountriesOpen] = useState(false);
  const countriesRef = useRef(null);
  const manualCountries = useVisitedCountries();

  // ── Undo, not confirm: a removal hides the thing at once and is held for six
  // seconds behind one toast; only then does `commit` run. ──
  const [undo, setUndo] = useState(null);
  const undoRef = useRef(null);
  const flushUndo = useCallback(() => {
    const u = undoRef.current;
    if (!u) return;
    undoRef.current = null;
    window.clearTimeout(u.timer);
    setUndo(null);
    u.commit?.();
  }, []);
  const removeWithUndo = useCallback(({ key, label, text, commit, restore }) => {
    flushUndo();
    const timer = window.setTimeout(flushUndo, UNDO_MS);
    undoRef.current = { key, commit, restore, timer };
    setUndo({ key, label, text });
  }, [flushUndo]);
  const undoRemoval = () => {
    const u = undoRef.current;
    if (!u) return;
    undoRef.current = null;
    window.clearTimeout(u.timer);
    setUndo(null);
    u.restore?.();
  };
  useEffect(() => {
    window.addEventListener('pagehide', flushUndo);
    return () => { window.removeEventListener('pagehide', flushUndo); flushUndo(); };
  }, [flushUndo]);
  const heldKey = undo?.key || '';

  useEffect(() => {
    if (SAVED_MOCK) return undefined;
    if (!user) { setFriends([]); setFriendTrips([]); return undefined; }
    let live = true;
    fetchFriendLinks(user.id).then((rows) => { if (live) setFriends(rows.filter((r) => r.kind === 'friend')); }).catch(() => {});
    listFriendTrips().then((rows) => { if (live) setFriendTrips(rows); }).catch(() => {});
    return () => { live = false; };
  }, [user]);

  const spendLabels = useMemo(
    () => Object.fromEntries(SPEND_CATS.map((c) => [c, t(`saved.pastSpend_${c}`)])),
    [t],
  );
  const openPastForm = (initial) => { setPastError(''); setPastEdit(initial || null); setPastOpen(true); };
  useEffect(() => {
    if (!startWithPast) return;
    // The form lives on Your Europe.
    pickTab('europe');
    openPastForm(null);
    onPastStarted && onPastStarted();
  }, [startWithPast]); // eslint-disable-line react-hooks/exhaustive-deps -- a one-shot hand-off from Plan

  const handleSavePastTrip = async (form) => {
    const payload = { ...form, label: form.label || defaultPastLabel(form.places) };
    const editId = pastEdit?.id || null;
    setPastBusy(true);
    setPastError('');
    try {
      let planId = editId;
      if (SAVED_MOCK) {
        planId = editId || `mock:${Date.now()}`;
        setTripPlans((prev) => [pastTripAsPlanRow(planId, payload), ...prev.filter((p) => p.id !== planId)]);
      } else if (pastEdit?.local) {
        updatePastTripOnDevice(editId, payload);
        setDayPlans(loadStandalonePlans());
      } else if (editId && user) {
        await updatePastTripInAccount(user.id, editId, payload);
        setTripPlans((prev) => prev.map((p) => (p.id === editId ? pastTripAsPlanRow(editId, payload) : p)));
      } else if (user) {
        planId = await savePastTripToAccount(user.id, payload);
        setTripPlans((prev) => [pastTripAsPlanRow(planId, payload), ...prev]);
      } else {
        const saved = savePastTripOnDevice(payload);
        planId = saved.id;
        setDayPlans(saved.plans);
      }
      if (payload.memory) saveMemory(planId, { ...payload.memory, places: payload.memory.places }, spendLabels);
      setMemTick((n) => n + 1);
      setPastOpen(false);
      setPastEdit(null);
    } catch {
      setPastError(t('saved.pastSaveFailed'));
    } finally {
      setPastBusy(false);
    }
  };

  const handleDeleteTripPlan = async (id) => {
    setTripPlans((prev) => prev.filter((p) => p.id !== id));
    clearMemory(id);
    setMemTick((n) => n + 1);
    if (SAVED_MOCK) return;
    try { await deleteTripPlan(id); } catch { loadTripPlans(); }
  };

  const fmtDay = (s) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString(activeLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
  const fmtDate = (s) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
  const fmtRange = (a, b) => {
    if (!a) return '';
    if (!b || a === b) return fmtDay(a);
    return t('saved.dateRange', { from: fmtDay(a), to: fmtDay(b) });
  };

  // ── What is on show: the lists without the one removal Undo holds. ──
  const shownPlans = useMemo(
    () => (devicePlan ? [...tripPlans, devicePlan] : tripPlans).filter((p) => `plan:${p.id}` !== heldKey),
    [tripPlans, devicePlan, heldKey],
  );
  const shownDayPlans = useMemo(() => dayPlans.filter((sp) => `day:${sp.id}` !== heldKey), [dayPlans, heldKey]);
  const shownTrips = useMemo(() => trips.filter((x) => `fav:${x.id}` !== heldKey), [trips, heldKey]);
  const { upcomingPlans, pastPlans, upcomingDayPlans, pastDayPlans } = useMemo(
    () => classifyTrips({ plans: shownPlans, dayPlans: shownDayPlans, todayIso }),
    [shownPlans, shownDayPlans, todayIso],
  );
  // Dated trips ahead, and the drafts (no dates yet) apart from them.
  const datedPlans = useMemo(() => upcomingPlans.filter((p) => p.start_date), [upcomingPlans]);
  const draftPlans = useMemo(() => upcomingPlans.filter((p) => !p.start_date), [upcomingPlans]);

  const memories = useMemo(() => {
    const out = {};
    [...pastPlans.map((p) => p.id), ...pastDayPlans.map((sp) => sp.id)].forEach((id) => {
      const m = loadMemory(id);
      if (m) out[id] = m;
    });
    return out;
  }, [pastPlans, pastDayPlans, memTick]); // eslint-disable-line react-hooks/exhaustive-deps -- memTick re-reads localStorage

  const destCoords = useCallback((id) => {
    const d = destinations[id];
    if (!d) return null;
    const lat = d.city_lat != null ? d.city_lat : d.lat;
    const lon = d.city_lon != null ? d.city_lon : d.lon;
    return lat != null && lon != null ? { lat, lon } : null;
  }, [destinations]);

  // Images: a stop's own photo, then any catalogue entry in the same city,
  // then the best-rated photo of the same country.
  const imageLookup = useMemo(() => {
    const byCity = new Map();
    const byCountry = new Map();
    for (const d of Object.values(destinations)) {
      const url = d.image?.url;
      if (!url) continue;
      const score = d.rating?.score ?? d.beauty?.score ?? 0;
      const cityKey = (d.city || '').toLowerCase();
      const curCity = cityKey && byCity.get(cityKey);
      if (cityKey && (!curCity || score > curCity.score)) byCity.set(cityKey, { url, score });
      const curCountry = d.country && byCountry.get(d.country);
      if (d.country && (!curCountry || score > curCountry.score)) byCountry.set(d.country, { url, score });
    }
    return { byCity, byCountry };
  }, [destinations]);
  const resolveImage = useCallback(({ ids = [], cities = [], countries = [] }) => {
    for (const id of ids) { const u = destinations[id]?.image?.url; if (u) return u; }
    for (const c of cities) { const hit = imageLookup.byCity.get((c || '').toLowerCase()); if (hit) return hit.url; }
    for (const c of countries) { const hit = imageLookup.byCountry.get(c); if (hit) return hit.url; }
    return null;
  }, [destinations, imageLookup]);

  const planCountries = useCallback((p) => orderedUnique([
    ...(p.countries || []), ...(p.destination_ids || []).map((id) => destinations[id]?.country),
  ]), [destinations]);
  const planCities = useCallback((p) => orderedUnique([
    ...(p.cities || []), ...(p.destination_ids || []).map((id) => destinations[id]?.city),
  ]), [destinations]);
  const dayPlanCountries = useCallback((sp) => orderedUnique((sp.stops || []).map((s) => destinations[s.destinationId]?.country)), [destinations]);
  const dayPlanCities = useCallback((sp) => orderedUnique((sp.stops || []).map((s) => destinations[s.destinationId]?.city)), [destinations]);

  // The trip's headline: the country when it stays in one, else its label or route.
  const journeyParts = useCallback((p) => {
    const countries = planCountries(p);
    const cities = planCities(p);
    if (p.label) return { title: p.label, sub: cities.join(', '), countries };
    if (countries.length === 1) return { title: countryName(COUNTRY_ISO2[countries[0]], countries[0]), sub: cities.join(', '), countries };
    const cs = p.cities || [];
    const title = cs.length > 1 ? t('saved.routeTitle', { from: cs[0], to: cs[cs.length - 1] }) : (cs[0] || t('saved.untitledTrip'));
    return { title, sub: countries.map((c) => countryName(COUNTRY_ISO2[c], c)).join(', '), countries };
  }, [planCountries, planCities, t]);
  const dayJourneyParts = useCallback((sp) => {
    const countries = dayPlanCountries(sp);
    const cities = dayPlanCities(sp);
    if (sp.label && countries.length !== 1) return { title: sp.label, sub: cities.join(', '), countries };
    if (countries.length === 1) return { title: countryName(COUNTRY_ISO2[countries[0]], countries[0]), sub: cities.join(', ') || sp.label, countries };
    return { title: sp.label || t('saved.dayPlanFallbackTitle'), sub: cities.join(', '), countries };
  }, [dayPlanCountries, dayPlanCities, t]);

  const memoryLine = (m) => {
    const spend = spendSummary(m);
    return [
      crewLabel(m.crew, lang),
      m.rating != null ? t('saved.pastRatedN', { n: m.rating }) : '',
      spend.any ? formatMoney(spend.total) : '',
      m.photos?.length ? t(m.photos.length === 1 ? 'saved.pastPhotos1' : 'saved.pastPhotosN', { n: m.photos.length }) : '',
    ].filter(Boolean).join(', ');
  };

  // ── Who came, editable from the record (the same list the ledger splits by). ──
  const crewFor = (planId) => { const extras = loadTripExtras(planId); return readCrew(extras, { memory: extras.memory }); };
  const writeCrewFor = (planId, next) => { persistTripExtras(planId, writeCrew(loadTripExtras(planId), next)); setMemTick((n) => n + 1); };
  const crewBarFor = (planId) => (
    <CrewBar
      crew={crewFor(planId)}
      friends={friends}
      onAdd={(member) => {
        const cur = crewFor(planId);
        if (namedCrew(cur).length >= MAX_CREW) return;
        writeCrewFor(planId, [...cur, member]);
      }}
      onRemove={(i) => {
        const before = crewFor(planId);
        const name = before[i]?.name?.trim() || '';
        writeCrewFor(planId, before.filter((_, j) => j !== i));
        removeWithUndo({ key: `crew:${planId}:${before[i]?.id}`, label: name, restore: () => writeCrewFor(planId, before) });
      }}
    />
  );

  const statementByPlan = useMemo(() => latestByPlan(statements), [statements]);
  const statementFor = (planId) => (statementByPlan[planId] ? (
    <ModerationNotice
      statement={statementByPlan[planId]}
      contest={SAVED_MOCK ? async () => ({ ok: true, status: 'open' }) : contestStatement}
      onContested={SAVED_MOCK ? undefined : loadStatements}
    />
  ) : null);
  const sharePanelFor = (planId, title) => (openShare === planId && user ? (
    <TripSharePanel
      userId={user.id}
      tripPlanId={planId}
      title={title}
      visibility={visById[planId] || tripPlans.find((tp) => tp.id === planId)?.visibility || 'private'}
      onVisibility={(id, v) => setVisById((cur) => ({ ...cur, [id]: v }))}
      canInvite={!tripPlans.find((tp) => tp.id === planId)?.coplan}
    />
  ) : null);
  const toggleShare = (planId) => {
    if (!user && !SAVED_MOCK) { onOpenAuth?.(); return; }
    const opening = openShare !== planId;
    setOpenShare(opening ? planId : '');
    // The panel opens under the card: bring it into view and give it focus,
    // so a phone user is not left looking at a button that did nothing.
    if (opening) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = document.getElementById(`tshare-${planId}`);
        el?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
        el?.focus({ preventScroll: true });
      }));
    }
  };

  // ── Trips: view models for the focal card and the rows. ──
  const priceFor = useCallback((p) => tripFigure(p, { data, stayTier, lifestyle }), [data, stayTier, lifestyle]);
  // T1175 (K7): the receipt image sheet, for the trip whose menu asked.
  const receiptFlag = useMemo(() => shareReceiptOn(), []);
  const [receiptFor, setReceiptFor] = useState('');
  const isoFor = (countries) => COUNTRY_ISO2[countries?.[0]] || '';

  // Browser storage is read once per plan list and per store change, never
  // per render (T434 audit, P1-2): who is coming and how ready each trip is.
  const planLocal = useMemo(() => {
    const out = {};
    datedPlans.forEach((p) => {
      const extras = loadTripExtras(p.id);
      const crew = readCrew(extras, { memory: extras.memory });
      out[p.id] = {
        crew: crewInitials(crew, MAX_CREW).map((c) => ({ id: c.id, name: c.name, initials: c.initials })),
        crewLine: crewLabel(crew, lang, 3),
        readiness: readinessSteps(p, { assignments: loadAssignments(p.id), extras }),
      };
    });
    return out;
  }, [datedPlans, memTick, storeTick, lang]); // eslint-disable-line react-hooks/exhaustive-deps -- the ticks re-read storage after an edit
  const figures = useMemo(() => {
    const out = {};
    datedPlans.forEach((p) => { out[p.id] = priceFor(p); });
    return out;
  }, [datedPlans, priceFor]);

  // The price nudge (T923): the beds for the trip's own dates, priced by
  // Carta's model today, against the same beds the first time My trips
  // priced the trip. Only a fall is news, and only before the beds are booked.
  const [bedBase, setBedBase] = useState(readBedBase);
  useEffect(() => {
    const base = readBedBase();
    let changed = false;
    Object.entries(figures).forEach(([id, f]) => {
      if (!f || !Number.isFinite(f.beds) || f.beds <= 0) return;
      const cur = base[id];
      if (cur && Number.isFinite(cur.beds)) return;
      // The seam marks its trip's first price a little higher, so the nudge renders.
      base[id] = { beds: cur?.mockLower ? f.beds + cur.mockLower : f.beds, at: cur?.at || todayIso };
      changed = true;
    });
    if (changed) { writeBedBase(base); setBedBase(base); }
  }, [figures, todayIso]);
  const nudgeFor = (p, figure, readiness) => {
    if (readiness?.steps?.find((s) => s.key === 'beds')?.done) return null;
    // T943: a trip saved with its bed prices compares today's beds for the
    // same dates with the plan's, stop by stop; an older trip falls back to
    // the first price My trips saw in this browser (T923).
    const vsPlan = planBedNudge(SAVED_MOCK ? mockPlanBeds(p, figure) : p, figure?.bedNights || []);
    if (vsPlan.stored) {
      const n = vsPlan.nudge;
      if (!n) return null;
      const city = destinations[n.destId]?.city || '';
      let pct = `${Math.round(n.share * 100)}%`;
      try { pct = new Intl.NumberFormat(activeLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(n.share); } catch { /* the plain figure */ }
      return city ? { plan: true, city, pct } : null;
    }
    const base = bedBase[p.id];
    if (!figure || !base || !Number.isFinite(base.beds) || !Number.isFinite(figure.beds)) return null;
    const fall = base.beds - figure.beds;
    if (fall < NUDGE_MIN_EUR || fall < base.beds * NUDGE_MIN_SHARE) return null;
    return { eur: fall, since: fmtDate(base.at) };
  };

  // The trip's first town, where the countdown counts to.
  const firstTown = (p) => {
    const id = tripStops(p)[0]?.id || (p.destination_ids || [])[0];
    return destinations[id]?.city || (p.cities || [])[0] || '';
  };

  // The next missing step as the card's secondary: dates open the trip, a
  // booking opens the trip page where Ready to book lists where to book.
  const nextStepFor = (p, readiness) => {
    const step = readiness?.next;
    if (!step || step === 'days' || p.device) return null;
    const open = () => onLoadTripPlan?.(p.id);
    if (step === 'dates') return { label: t('mt.nextDates'), onClick: () => onLoadTripPlan?.({ id: p.id, edit: true }) };
    if (step === 'travel') return { label: t('mt.nextTravel'), onClick: open };
    const stops = tripStops(p);
    const extras = loadTripExtras(p.id);
    const i = stops.findIndex((s, k) => !(extras.bookings?.[`stay-${k}`]?.ref || extras.bookings?.[`stay-${k}`]?.price));
    const city = destinations[stops[Math.max(0, i)]?.id]?.city || '';
    return { label: city ? t('mt.nextBedIn', { city }) : t('mt.nextBed'), onClick: open };
  };

  const planMenu = (p, parts, device) => (device ? [] : [
    { key: 'edit', label: t('mt.editTrip'), icon: <PencilIcon size={16} />, onClick: () => onLoadTripPlan?.({ id: p.id, edit: true }) },
    { key: 'days', label: t('saved.planDays'), icon: <CalendarIcon size={16} />, onClick: () => onOpenDayPlan?.({ planId: p.id, stopIndex: 0, dayIndex: 0 }) },
    ...(p.coplan ? [] : [{ key: 'share', label: t('saved.shareInvite'), icon: <LinkIcon size={16} />, onClick: () => toggleShare(p.id) }]),
    // T1175 (K7): the trip as a shareable receipt image, behind its flag.
    ...(receiptFlag && figures[p.id] ? [{ key: 'receipt', label: t('share.receiptMenu'), icon: <ReceiptIcon size={16} />, onClick: () => setReceiptFor(p.id) }] : []),
  ]);

  const planModel = (p, focal) => {
    const parts = journeyParts(p);
    const nights = nightsBetween(p.start_date, p.end_date);
    const local = planLocal[p.id] || { crew: [], crewLine: '', readiness: null };
    const when = whenParts(p.start_date, p.end_date, todayIso);
    const figure = figures[p.id] || null;
    const removeLabel = t('saved.removeItem', { name: parts.title });
    // The trip on this device offers signing in as the way to keep it on a
    // second device (T503, owner T500-a); the "Saved on this device" line
    // went in T968 (owner 2026-11-01: clutter).
    const device = !!p.device;
    const onRemove = p.coplan ? null : device
      ? () => removeWithUndo({ key: `plan:${p.id}`, label: parts.title, commit: () => { clearDeviceTrip(); setDeviceStored(null); } })
      : () => removeWithUndo({ key: `plan:${p.id}`, label: parts.title, commit: () => handleDeleteTripPlan(p.id) });
    const below = device ? (!user && configured ? (
      <p className="mt-device-line">
        <Button variant="quiet" size="sm" onClick={onOpenAuth}>{t('saved.signIn')}</Button>
      </p>
    ) : null
    ) : <>{statementFor(p.id)}{sharePanelFor(p.id, parts.title)}</>;
    const common = {
      id: p.id,
      title: parts.title,
      img: resolveImage({ ids: p.destination_ids || [], cities: planCities(p), countries: parts.countries }),
      iso2: isoFor(parts.countries),
      onOpen: device ? () => onOpenDeviceTrip?.() : () => onLoadTripPlan?.(p.id),
      onRemove,
      removeLabel,
      below,
    };
    if (focal) {
      const n = p.start_date ? daysUntil(p.start_date, todayIso) : null;
      return {
        ...common,
        countries: parts.countries,
        countdown: n != null && n > 0 ? { n, place: firstTown(p) } : null,
        // G12 atlas: the journey line under the photo, every day still to come.
        lineStops: tripStops(p).map((s, i) => ({ ...s, city: destinations[s.id]?.city || s.city || planCities(p)[i] || '' })),
        when,
        dates: fmtRange(p.start_date, p.end_date),
        nights,
        figure,
        people: local.crew,
        crewLine: local.crewLine,
        party: figure?.party || null,
        readiness: local.readiness,
        nudge: nudgeFor(p, figure, local.readiness),
        nextStep: nextStepFor(p, local.readiness),
        onAddBooking: device ? null : () => setBook({ planId: p.id }),
        coplanBy: p.coplan ? (p.ownerName || '') : '',
        // A day plan and a share link belong to a trip in an account; the
        // device trip opens in Plan, where its days begin.
        onPlanDays: device ? null : () => onOpenDayPlan?.({ planId: p.id, stopIndex: 0, dayIndex: 0 }),
        menuActions: planMenu(p, parts, device),
        plateValue: tripInUnit(figure, choices),
        plateLabel: figure ? t('mt.unitPlateAria', { unit: unitWords(t, choices, figure.party), price: formatMoney(tripInUnit(figure, choices) || 0) }) : '',
        onUnit: () => setUnitOpen(true),
        onStep: (key) => stepDoor(p, key, device),
        onImage: () => shareRoute(p, figure),
        onShare: device || p.coplan ? null : () => toggleShare(p.id),
        onEurope: () => pickTab('europe'),
        countryLabel: parts.countries.length === 1 ? countryName(isoFor(parts.countries), parts.countries[0]) : '',
      };
    }
    return {
      ...common,
      meta: [whenText(t, when), fmtRange(p.start_date, p.end_date)].filter(Boolean).join(', '),
      figure: figure ? <TripPrice figure={figure} unitValue={tripInUnit(figure, choices)} /> : <NoPrice>{t('saved.factNoPrice')}</NoPrice>,
      menuActions: planMenu(p, parts, device),
    };
  };

  // A readiness tile opens its own step: dates edit the trip, the way there
  // and the beds open the trip page (Ready to book), the days open Plan the days.
  const stepDoor = (p, key, device) => {
    if (device) { onOpenDeviceTrip?.(); return; }
    if (key === 'dates') onLoadTripPlan?.({ id: p.id, edit: true });
    else if (key === 'days') onOpenDayPlan?.({ planId: p.id, stopIndex: 0, dayIndex: 0 });
    else onLoadTripPlan?.(p.id);
  };
  // "Deel deze route": the route on the plate, its name and figure, no dates.
  const shareRoute = (p, figure) => {
    const pts = atlasTrip(p).stops.map((x) => project(x.lat, x.lon)).filter(Boolean);
    const value = tripInUnit(figure, choices);
    shareRouteImage(atlasGeo, { pts, name: journeyParts(p).title, figure: value != null ? formatMoney(value) : '' });
  };

  // A draft: no dates yet. It lives in Plan; My trips lists it and opens it there.
  const draftModel = (p) => {
    const parts = journeyParts(p);
    const nights = tripStops(p).reduce((n, s) => n + s.nights, 0);
    return {
      id: `draft-${p.id}`,
      title: parts.title,
      img: resolveImage({ ids: p.destination_ids || [], cities: planCities(p), countries: parts.countries }),
      iso2: isoFor(parts.countries),
      meta: [t('saved.noDatesYet'), nights > 0 ? t(nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: nights }) : ''].filter(Boolean).join(', '),
      chip: <span className="ink-tag">{t('mt.draft')}</span>,
      onOpen: p.device ? () => onOpenDeviceTrip?.() : () => onLoadTripPlan?.(p.id),
    };
  };
  const deviceDraftModel = (x) => {
    const ids = x.meta.stops || [];
    const towns = orderedUnique(ids.map((id) => destinations[id]?.city)).slice(0, 2).join(', ');
    const nights = Number(x.meta.nights) || 0;
    return {
      id: `dev-${x.id}`,
      title: x.meta.name || towns || t('pf.home.newTripName'),
      img: x.meta.cover || resolveImage({ ids }),
      iso2: destinations[ids[0]]?.iso2 || '',
      meta: [t('saved.noDatesYet'), nights > 0 ? t(nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: nights }) : ''].filter(Boolean).join(', '),
      chip: <span className="ink-tag">{t('mt.draft')}</span>,
      onOpen: () => { tripsStore.open(x.id); onGoToTab?.('trip'); },
    };
  };

  const dayPlanMeta = (sp) => {
    const total = sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1;
    return [
      sp.startDate ? fmtDay(sp.startDate) : t('saved.noDatesYet'),
      t(total === 1 ? 'saved.days1' : 'saved.daysN', { n: total }),
    ].join(', ');
  };
  const dayPlanModel = (sp) => {
    const parts = dayJourneyParts(sp);
    const first = (sp.stops || [])[0]?.destinationId;
    const cost = first ? costs?.get?.(first) : null;
    const label = sp.label || t('saved.fallbackDayPlan');
    return {
      id: sp.id,
      title: sp.label || parts.title,
      img: resolveImage({ ids: (sp.stops || []).map((s) => s.destinationId), cities: dayPlanCities(sp), countries: parts.countries }),
      iso2: isoFor(parts.countries),
      meta: dayPlanMeta(sp),
      figure: cost ? <DayPrice cost={cost} t={t} /> : null,
      onOpen: () => onOpenDayPlan?.(sp.id),
      onRemove: () => removeWithUndo({ key: `day:${sp.id}`, label, commit: () => setDayPlans(deleteStandalonePlan(sp.id)) }),
      removeLabel: t('saved.removeItem', { name: label }),
    };
  };

  // T924: a trip happening today opens the tab on Today; every other trip
  // ahead is then a row under Coming up.
  const happening = datedPlans.find((p) => !p.device && isHappening(p, todayIso)) || null;
  const todayAt = happening ? tripToday(happening, todayIso) : null;
  const ahead = happening ? datedPlans.filter((p) => p !== happening) : datedPlans;
  const nextModel = !todayAt && ahead.length ? planModel(ahead[0], true) : null;
  const comingModels = (todayAt ? ahead : ahead.slice(1)).map((p) => planModel(p, false));
  const todayNode = todayAt ? (
    <div className="mt-next">
      <TodayCard
        key={happening.id}
        plan={happening}
        today={todayAt}
        destinations={destinations}
        figure={figures[happening.id] || null}
        todayIso={todayIso}
        draw={tabDraw}
        crewNames={planLocal[happening.id]?.crewLine || ''}
        spendLabels={spendLabels}
        title={journeyParts(happening).title}
        img={resolveImage({ ids: happening.destination_ids || [], cities: planCities(happening), countries: journeyParts(happening).countries })}
        userId={user?.id || null}
        onPlanDay={(stopIndex, dayIndex) => onOpenDayPlan?.({ planId: happening.id, stopIndex, dayIndex })}
        onOpenTrip={() => onLoadTripPlan?.(happening.id)}
        onCrew={() => toggleShare(happening.id)}
        onPhotoAdded={() => setMemTick((n) => n + 1)}
      />
      {statementFor(happening.id)}
      {sharePanelFor(happening.id, journeyParts(happening).title)}
    </div>
  ) : null;
  // Drafts the device's Plan home lists that no account plan or the device
  // trip already carries.
  const carried = useMemo(() => new Set(tripPlans.map((p) => p.id)), [tripPlans]);
  const planningModels = [
    ...draftPlans.map(draftModel),
    ...deviceDrafts
      .filter((x) => !x.meta.start && (x.meta.stops?.length || x.meta.name)
        && !(x.meta.planId && carried.has(x.meta.planId))
        && !(devicePlan && x.meta.deviceKey && x.meta.deviceKey === devicePlan.deviceKey))
      .map(deviceDraftModel),
  ];
  const dayModels = upcomingDayPlans.map(dayPlanModel);

  // ── Saved (T925): the starred things and the account's saved places, one list. ──
  const shownFavs = useMemo(
    () => (SAVED_MOCK && !MOCK_BARE
      ? new Set([...MOCK_FAV_KEYS, ...(MOCK_VARIANT === 'lots' ? LOTS_FAV_KEYS : []), ...(favorites || [])])
      : favorites),
    [favorites],
  );
  const shortlist = useFavoriteItems(shownFavs, destinations);
  const savedLists = useSavedLists();
  // T941: lists shared with friends (migration 059; nothing before it), and
  // their items resolved to photos and points like the traveller's own saves.
  const sharedState = useSharedLists(user, { mock: SAVED_MOCK && !MOCK_BARE });
  const sharedKeySet = useMemo(() => new Set(sharedKeys(sharedState.lists)), [sharedState.lists]);
  const sharedFav = useFavoriteItems(sharedKeySet, destinations);
  const sharedRowMap = useMemo(
    () => new Map(sharedFav.sections.flatMap((s) => s.rows).filter((r) => !r.missing && !r.pending).map((r) => [r.key, r])),
    [sharedFav.sections],
  );
  const favOrder = useMemo(() => {
    const m = new Map();
    [...(shownFavs || [])].forEach((k, i) => m.set(k, i));
    return m;
  }, [shownFavs]);
  const shortRows = useMemo(() => {
    const rows = shortlist.sections.flatMap((s) => s.rows)
      .filter((r) => `star:${r.key}` !== heldKey)
      .map((r) => ({ ...r, order: favOrder.get(r.key) ?? -1 }));
    const destIds = new Set(rows.filter((r) => r.kind === 'dest').map((r) => r.id));
    if (authed) {
      shownTrips.filter((x) => !destIds.has(x.destination_id)).forEach((x) => {
        rows.push({
          key: `acct:${x.id}`, account: x, kind: 'dest', id: x.destination_id,
          cc: COUNTRY_ISO2[x.country] || destinations[x.destination_id]?.iso2 || '',
          name: x.city, sub: x.country,
          img: resolveImage({ ids: [x.destination_id], cities: [x.city], countries: [x.country] }),
          order: -1 - new Date(x.created_at || 0).getTime() / 1e13,
        });
      });
    }
    // Newest save first.
    return rows.sort((a, b) => b.order - a.order);
  }, [shortlist.sections, favOrder, heldKey, authed, shownTrips, destinations, resolveImage]);

  // The seam's saves get a price at save time and two lists, once (dev only).
  useEffect(() => {
    if (!SAVED_MOCK || MOCK_BARE || !costs) return;
    const cur = loadSavedLists();
    Object.entries(MOCK_SAVED_AT).forEach(([k, off]) => {
      const now = costs.get?.(k.slice(5))?.dayEur;
      if (Number.isFinite(now) && !Number.isFinite(cur.meta[k]?.eur)) noteSaved(k, now + off, Date.now() - 27 * 864e5);
    });
    if (!cur.lists.length) {
      createList('Summer 2027', ['dest:BCN', 'dest:SPU', 'dest:LIS']);
      createList('City weekends', ['dest:LIS', 'dest:OPO', 'dest:LJU']);
      setNote('dest:LIS', 'For the birthday weekend');
    }
  }, [costs]);

  const openShortlisted = (row) => {
    if (row.kind === 'dest') { onOpenDest?.(row.id); return; }
    onOpenFeature?.(row.kind, { id: row.id, cc: row.cc });
  };
  const dropShortlisted = (row) => {
    if (row.account) {
      removeWithUndo({ key: `fav:${row.account.id}`, label: row.name, commit: () => handleDelete(row.account.id) });
      return;
    }
    const parsed = parseFavKey(row.key);
    if (!parsed) return;
    onToggleFav?.(parsed.id, parsed.kind, parsed.cc);
    removeWithUndo({ key: `star:${row.key}`, label: row.name || row.id, restore: () => onToggleFav?.(parsed.id, parsed.kind, parsed.cc) });
  };

  // ── Your Europe (T926): the record, every year. ──
  const allRecord = useMemo(() => visitedRecord({ pastPlans, pastDayPlans, memories, destinations }), [pastPlans, pastDayPlans, memories, destinations]);
  const fullRecord = useMemo(() => visitedRecord({
    pastPlans, pastDayPlans, memories, destinations, manualCountries,
  }), [pastPlans, pastDayPlans, memories, destinations, manualCountries]);

  const placesFromPlan = (p) => (p.cities || []).map((city, i) => ({
    id: (p.destination_ids || [])[i] || null, city,
    country: destinations[(p.destination_ids || [])[i]]?.country || '', lat: null, lon: null, nights: null,
  }));
  const editableFromPlan = (p, mem) => ({
    id: p.id, label: p.label || '', startDate: p.start_date, endDate: p.end_date,
    places: mem?.places?.length ? mem.places : placesFromPlan(p), memory: mem,
  });
  const editableFromDayPlan = (sp, mem) => ({
    id: sp.id, local: true, label: sp.label || '', startDate: sp.startDate, endDate: dayPlanEndDate(sp),
    places: mem?.places?.length ? mem.places : (sp.stops || []).map((s) => ({
      id: destinations[s.destinationId] ? s.destinationId : null,
      city: destinations[s.destinationId]?.city || s.city || '',
      country: destinations[s.destinationId]?.country || s.country || '',
      lat: s.lat ?? null, lon: s.lon ?? null, nights: null,
    })),
    memory: mem,
  });


  const recordRow = (row) => {
    if (row.kind === 'plan') {
      const p = row.item;
      const parts = journeyParts(p);
      const mem = memories[p.id];
      const showing = openMemory === p.id;
      const line = mem ? memoryLine(mem) : '';
      return {
        id: `p${p.id}`,
        title: parts.title,
        img: coverPhoto(mem) || resolveImage({ ids: p.destination_ids || [], cities: planCities(p), countries: parts.countries }),
        iso2: isoFor(parts.countries),
        meta: [parts.sub, fmtRange(p.start_date, p.end_date), line].filter(Boolean).join(', '),
        onOpen: mem ? () => setOpenMemory(showing ? '' : p.id) : () => onLoadTripPlan?.(p.id),
        menuActions: [
          { key: 'edit', label: t('saved.openTripPlanner'), icon: <RouteIcon size={16} />, onClick: () => onLoadTripPlan?.({ id: p.id, edit: true }) },
          ...(user || SAVED_MOCK ? [{ key: 'share', label: t('saved.shareTrip'), icon: <LinkIcon size={16} />, onClick: () => toggleShare(p.id) }] : []),
        ],
        onRemove: () => removeWithUndo({ key: `plan:${p.id}`, label: parts.title, commit: () => handleDeleteTripPlan(p.id) }),
        removeLabel: t('saved.removeItem', { name: parts.title }),
        below: (
          <>
            {showing && mem && <TripMemoryView memory={mem} onEdit={() => openPastForm(editableFromPlan(p, mem))} />}
            {showing && crewBarFor(p.id)}
            {statementFor(p.id)}
            {sharePanelFor(p.id, parts.title)}
          </>
        ),
      };
    }
    const sp = row.item;
    const parts = dayJourneyParts(sp);
    const mem = memories[sp.id];
    const showing = openMemory === sp.id;
    const line = mem ? memoryLine(mem) : '';
    return {
      id: `d${sp.id}`,
      title: parts.title,
      img: coverPhoto(mem) || resolveImage({ ids: (sp.stops || []).map((s) => s.destinationId), cities: dayPlanCities(sp), countries: parts.countries }),
      iso2: isoFor(parts.countries),
      meta: [parts.sub, fmtRange(sp.startDate, dayPlanEndDate(sp)), line].filter(Boolean).join(', '),
      onOpen: mem ? () => setOpenMemory(showing ? '' : sp.id) : () => onOpenDayPlan?.(sp.id),
      onRemove: () => removeWithUndo({
        key: `day:${sp.id}`,
        label: parts.title,
        commit: () => { clearMemory(sp.id); setMemTick((n) => n + 1); setDayPlans(deleteStandalonePlan(sp.id)); },
      }),
      removeLabel: t('saved.removeItem', { name: parts.title }),
      below: showing && mem ? (
        <>
          <TripMemoryView memory={mem} onEdit={() => openPastForm(editableFromDayPlan(sp, mem))} />
          {crewBarFor(sp.id)}
        </>
      ) : null,
    };
  };

  // The record's parts (T926): countries as ISO codes, the past trips with
  // their spend, Carta's estimate and the place's Score where each exists.
  const isoOf = (c) => COUNTRY_ISO2[c] || (/^[A-Z]{2}$/.test(c || '') ? c : '');
  const beenIso = useMemo(() => new Set(fullRecord.countries.map(isoOf).filter(Boolean)), [fullRecord]);
  // T972: the map marks by ISO code; the hand-marked list keeps country
  // names, under whichever spelling the sheet stored.
  const viaTripIso = new Set([...allRecord.fromTrips].map(isoOf).filter(Boolean));
  const toggleIso = (iso) => {
    const names = manualCountries.filter((c) => isoOf(c) === iso);
    if (names.length) names.forEach((c) => toggleVisitedCountry(c));
    else toggleVisitedCountry(Object.keys(COUNTRY_ISO2).find((n) => COUNTRY_ISO2[n] === iso) || iso);
  };
  const nextPlan = ahead[0] || null;
  const nextIsoAll = nextPlan ? planCountries(nextPlan).map(isoOf).filter(Boolean) : [];
  const nextIso = new Set(nextIsoAll.filter((c) => !beenIso.has(c)));
  const catalogueCountries = useMemo(() => new Set(Object.values(destinations)
    .map((d) => d.iso2 || d.cc || COUNTRY_ISO2[d.country]).filter(Boolean)).size, [destinations]);
  const fmtMonth = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(activeLocale(), { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

  const pastTrips = useMemo(() => {
    const scoreOf = (ids) => {
      const s = ids.map((id) => destinations[id]?.rating).filter((r) => r && Number.isFinite(r.score));
      return s.sort((a, b) => b.score - a.score)[0]?.score ?? null;
    };
    const rows = [
      ...pastPlans.map((p) => ({
        kind: 'plan', item: p, id: p.id, end: p.end_date, nights: nightsBetween(p.start_date, p.end_date),
        title: journeyParts(p).title, ids: p.destination_ids || [], est: priceFor(p)?.perPersonDay ?? null,
      })),
      ...pastDayPlans.map((sp) => ({
        kind: 'day', item: sp, id: sp.id, end: dayPlanEndDate(sp),
        nights: Math.max(0, (sp.stops || []).reduce((n, x) => n + (x.days || 1), 0) - 1),
        title: dayJourneyParts(sp).title, ids: (sp.stops || []).map((x) => x.destinationId), est: null,
      })),
    ];
    return rows.map((r) => {
      const mem = memories[r.id] || null;
      return { ...r, mem, spendPP: tripSpendPerPerson(r.id, mem), estDayPP: r.est, score: scoreOf(r.ids) };
    }).sort((a, b) => ((a.end || '') < (b.end || '') ? 1 : -1));
  }, [pastPlans, pastDayPlans, memories, destinations, journeyParts, dayJourneyParts, priceFor]);

  // G12 Phase B: the one map of the panel. Trips in the plain shape
  // atlas/layers.js reads; a stop is placed by its catalogue entry, or by the
  // memory's own place when the trip was logged by hand.
  const atlasGeo = useEuropeMap();
  const [atlasYear, setAtlasYear] = useState(null);
  const atlasStopsOf = (ids, cityOf) => ids.map((id, i) => {
    const c = destCoords(id);
    return c ? { id, city: cityOf(i) || destinations[id]?.city || '', ...c } : null;
  }).filter(Boolean);
  const atlasTrip = (p) => {
    const st = tripStops(p);
    const stops = st.length
      ? atlasStopsOf(st.map((s) => s.id), (i) => st[i].city)
      : atlasStopsOf(p.destination_ids || [], () => '');
    return { id: p.id, title: journeyParts(p).title, start: p.start_date, countries: planCountries(p).map(isoOf).filter(Boolean), stops };
  };
  // G12 Phase C, example mode: the Ready-made trip si-road-trip-julian-alps-passes
  // (lib/journeys.js; its stops Bled, Kranjska Gora and the Soca valley from
  // the catalogue, Bled's photo) as the next trip, and one real trip under
  // Coming up. Built here, priced by the engine, never saved or counted.
  const examplePlans = useMemo(() => [
    {
      id: 'example-julian-alps', label: t('mt.exTitle'), cities: [], countries: ['Slovenia'],
      start_date: addDaysIso(64), end_date: addDaysIso(71), destination_ids: ['gem:bled', 'gem:kranjska-gora', 'gem:soca-valley'],
      stops: mockStops([['gem:bled', 64, 66], ['gem:kranjska-gora', 66, 68], ['gem:soca-valley', 68, 71]]), choices: { groupSize: 2 },
    },
    {
      id: 'example-lisbon-porto', label: null, cities: ['Lisbon', 'Porto'], countries: ['Portugal'],
      start_date: addDaysIso(112), end_date: addDaysIso(120), destination_ids: ['LIS', 'OPO'],
      stops: mockStops([['LIS', 112, 116], ['OPO', 116, 120]]), choices: { groupSize: 2 },
    },
  ], [lang]); // eslint-disable-line react-hooks/exhaustive-deps -- t follows lang
  const exampleModel = (p, focal) => {
    const fig = priceFor(p);
    const parts = journeyParts(p);
    const val = tripInUnit(fig, choices);
    const toPlan = () => onGoToTab?.('planstart');
    const base = {
      id: p.id, title: parts.title, iso2: isoFor(parts.countries), onOpen: toPlan,
      img: resolveImage({ ids: p.destination_ids, cities: planCities(p), countries: parts.countries }),
    };
    if (!focal) {
      return {
        ...base,
        meta: [fmtRange(p.start_date, p.end_date), t('saved.nightsN', { n: nightsBetween(p.start_date, p.end_date) })].join(', '),
        figure: fig ? <TripPrice figure={fig} unitValue={val} /> : null,
      };
    }
    return {
      ...base, example: true, countries: parts.countries,
      countdown: { n: daysUntil(p.start_date, todayIso), place: firstTown(p) },
      dates: fmtRange(p.start_date, p.end_date), nights: nightsBetween(p.start_date, p.end_date),
      figure: fig, party: fig?.party || 2, readiness: readinessSteps(p, { assignments: {}, extras: {} }),
      plateValue: val,
      plateLabel: fig ? t('mt.unitPlateAria', { unit: unitWords(t, choices, fig.party), price: formatMoney(val || 0) }) : '',
      onUnit: () => setUnitOpen(true), onStep: toPlan, onPlanDays: toPlan,
      onEurope: () => pickTab('europe'), countryLabel: countryName('SI', 'Slovenia'),
    };
  };
  // Example mode only stands in for an empty tab; real trips end it.
  const showExample = example && !happening && !ahead.length;
  // Saved's example: the catalogue's top places by Score, real figures,
  // never saved or counted (G12 Phase D).
  const exampleSaved = useMemo(() => (example && !shortRows.length ? Object.values(destinations || {})
    // The Score lives in rating.score (an object), so the old number check
    // never matched and the example stayed empty; a priced place goes first.
    .filter((d) => d?.id && Number.isFinite(d.rating?.score))
    .sort((a, b) => (costs?.get?.(b.id) ? 1 : 0) - (costs?.get?.(a.id) ? 1 : 0) || b.rating.score - a.rating.score)
    .slice(0, 10)
    .map((d) => ({ key: `ex:${d.id}`, kind: 'dest', id: d.id, cc: d.iso2 || '', name: d.city || d.id, img: resolveImage({ ids: [d.id], cities: [d.city], countries: [d.country] }) }))
    : []), [example, shortRows.length, destinations, costs, resolveImage]);

  // "Hoe was {trip}?" (decision 8): the latest ended trip without a grade,
  // until it is graded; the grade is memory.rating, Je cijfer.
  const toRate = pastTrips.find((x) => x.kind === 'plan' && (x.mem?.rating ?? null) == null) || null;
  const rateIso = toRate ? journeyParts(toRate.item).countries.map(isoOf).filter(Boolean)[0] || '' : '';
  const rateNode = toRate && !showExample ? (
    <RateTrip
      title={toRate.title}
      shape={rateIso ? atlasGeo?.countries?.find((c) => c.cc === rateIso)?.d || '' : ''}
      onRate={(n) => {
        const before = loadMemory(toRate.id) || emptyMemory();
        saveMemory(toRate.id, { ...before, rating: n }, spendLabels);
        setMemTick((k) => k + 1);
        // One tap saves the grade, so it gets the house undo like a removal.
        removeWithUndo({
          key: `rate:${toRate.id}`,
          text: t('mt.ratedUndo', { trip: toRate.title, n }),
          restore: () => { saveMemory(toRate.id, before, spendLabels); setMemTick((k) => k + 1); },
        });
      }}
    />
  ) : null;
  // G12 Phase E: the past trips in lib/atlasFacts' plain shape, for the
  // plate and every Your Europe graphic.
  const atlasPast = useMemo(() => pastTrips.map((r) => {
      const mine = (r.mem?.places || []).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
      const stops = mine.length ? mine.map((x) => ({ id: x.id, city: x.city, lat: x.lat, lon: x.lon })) : atlasStopsOf(r.ids, () => '');
      const parts = r.kind === 'plan' ? journeyParts(r.item) : dayJourneyParts(r.item);
      return {
        id: r.id,
        title: r.title,
        start: r.kind === 'plan' ? r.item.start_date : r.item.startDate,
        end: r.end,
        nights: r.nights,
        countries: parts.countries.map(isoOf).filter(Boolean),
        stops,
        grade: Number.isFinite(r.mem?.rating) ? r.mem.rating : null,
        spendPP: Number.isFinite(r.spendPP) ? r.spendPP : null,
      };
    }), [pastTrips]); // eslint-disable-line react-hooks/exhaustive-deps -- the helpers follow destinations, which pastTrips already follows
  // With no trip ahead, the Trips plate shows the past routes and the
  // countries been to, so a returning traveller never sees a blank Europe.
  const tripsMap = tripsLayer(showExample ? { ahead: [atlasTrip(examplePlans[0])] } : {
    today: happening && todayAt ? atlasTrip(happening) : null,
    todayAt,
    ahead: ahead.filter((p) => p.start_date).map(atlasTrip),
    past: atlasPast,
  });
  tripsMap.nextIso = new Set(showExample ? ['SI'] : happening ? [] : nextIsoAll);
  tripsMap.been = tripsMap.state === 'past' ? beenIso : undefined;
  tripsMap.lift = lift;
  // Example mode on Your Europe: a record of real catalogue places, marked
  // Voorbeeld, held only here (never saved, counted or shared as a record).
  const [exGrades, setExGrades] = useState({});
  const euExample = example && !pastTrips.length && tab === 'europe';
  const exampleEurope = useMemo(() => (!euExample ? [] : YEARS_PLANS.map((p) => {
    const mem = YEARS_MEMS[p.id] || {};
    const places = mem.places || [];
    return {
      id: p.id,
      title: p.label || places.map((x) => x.city).join(', '),
      start: p.start_date,
      end: p.end_date,
      nights: places.reduce((n, x) => n + (x.nights || 0), 0),
      countries: [...new Set(places.map((x) => isoOf(x.country)).filter(Boolean))],
      stops: places.map((x) => ({ id: x.id, city: x.city, lat: x.lat, lon: x.lon })),
      grade: exGrades[p.id] ?? (Number.isFinite(mem.rating) ? mem.rating : null),
      spendPP: spendPerPerson(mem),
      ids: places.map((x) => x.id),
    };
  })), [euExample, exGrades]);
  const euTrips = euExample ? exampleEurope : atlasPast;
  const euBeen = useMemo(() => (euExample ? new Set(exampleEurope.flatMap((x) => x.countries)) : beenIso), [euExample, exampleEurope, beenIso]);
  const europeMap = useMemo(() => {
    const trips = euTrips;
    return europeLayer({ trips, been: euBeen });
  }, [euTrips, euBeen]);
  const milestones = useMemo(() => {
    const points = [];
    pastTrips.forEach((x) => {
      x.ids.forEach((id) => { const at = destCoords(id); if (at) points.push({ ...at, city: destinations[id]?.city || '' }); });
      memoryPoints(x.mem).forEach((pt) => points.push(pt));
    });
    return europeMilestones({
      beenIso: [...beenIso], nextIso: nextIsoAll, trips: pastTrips, points,
      legs: pastTrips.flatMap((x) => x.mem?.legs || []),
    });
  }, [pastTrips, beenIso, nextIsoAll.join(','), destCoords, destinations]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the codes

  const journalItem = (x) => {
    const row = recordRow({ kind: x.kind, item: x.item });
    const mem = x.mem;
    const edit = () => openPastForm(x.kind === 'plan' ? editableFromPlan(x.item, mem) : editableFromDayPlan(x.item, mem));
    const day = Number.isFinite(x.spendPP) && x.nights > 0 ? x.spendPP / x.nights : null;
    const vs = day != null && Number.isFinite(x.estDayPP) ? day - x.estDayPP : null;
    return {
      ...row,
      meta: [fmtMonth(x.end), x.nights > 0 ? t(x.nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: x.nights }) : '', mem ? crewLabel(mem.crew, lang, 2) : '']
        .filter(Boolean).join(', '),
      photos: mem?.photos?.length || 0,
      cost: day == null ? '' : vs == null || Math.round(vs) === 0
        ? t(vs == null ? 'mt.jDay' : 'mt.jDayOn', { price: formatMoney(day) })
        : t(vs < 0 ? 'mt.jDayUnder' : 'mt.jDayOver', { price: formatMoney(day), diff: formatMoney(Math.abs(vs)) }),
      rating: mem?.rating ?? null,
      onPhotos: mem?.photos?.length ? null : edit,
      onHow: mem?.rating != null || mem?.story?.trim() ? null : edit,
    };
  };


  // G12 Phase E: the example record's milestones, the past trips as rows,
  // the country sheet and the year card's Delen.
  const exMilestones = useMemo(() => (!euExample ? [] : europeMilestones({
    beenIso: [...euBeen], nextIso: [], trips: exampleEurope,
    points: exampleEurope.flatMap((x) => x.stops), legs: [],
  })), [euExample, euBeen, exampleEurope]);
  const pastRows = euExample
    ? exampleEurope.map((x) => ({
      id: x.id, year: tripYear(x), title: x.title, nights: x.nights, grade: x.grade, vs: null, start: x.start,
      img: resolveImage({ ids: x.ids }), flags: x.countries, iso2: x.countries[0],
    }))
    : pastTrips.map((x) => {
      const row = journalItem(x);
      const plain = atlasPast.find((a) => a.id === x.id);
      const day = Number.isFinite(x.spendPP) && x.nights > 0 ? x.spendPP / x.nights : null;
      const open = openMemory === x.id;
      const mem = x.mem;
      const edit = () => openPastForm(x.kind === 'plan' ? editableFromPlan(x.item, mem) : editableFromDayPlan(x.item, mem));
      // G12 L12: plan again, somewhere new, from this trip: its length, month
      // and party, every country been after the new ones, and its own spend
      // as a reference line only (decision 0013).
      const again = onPlanSeed ? () => onPlanSeed(pastAgainSeed({
        id: x.id,
        name: x.title,
        start: plain?.start || x.item?.start_date || '',
        nights: x.nights,
        spendPP: x.spendPP,
        party: mem?.travellers ? { adults: Number(mem.travellers.adults) || 0, kids: Number(mem.travellers.children) || 0 } : null,
      }, { been: [...beenIso] })) : null;
      return {
        ...row,
        year: tripYear(plain) ?? yearOf(x.end),
        start: plain?.start || null,
        flags: plain?.countries || [],
        nights: x.nights,
        grade: Number.isFinite(mem?.rating) ? mem.rating : null,
        vs: day != null && Number.isFinite(x.estDayPP) ? day - x.estDayPP : null,
        open,
        // A tap opens the trip's memory in place, or the form for one without.
        onOpen: () => setOpenMemory(open ? '' : x.id),
        below: open ? (
          <div className="atlas-prow-open">
            {mem ? row.below : (
              <span className="mt-jcard-acts">
                <Button size="sm" onClick={edit}>{t('mt.howWasIt')}</Button>
                <Button size="sm" variant="quiet" onClick={() => (x.kind === 'plan' ? onLoadTripPlan?.(x.item.id) : onOpenDayPlan?.(x.item.id))}>{t('saved.openTripPlanner')}</Button>
              </span>
            )}
            {mem && !mem.photos?.length && <Button size="sm" iconStart={<CameraIcon size={14} />} onClick={edit}>{t('mt.addPhotos')}</Button>}
            {again && <Button size="sm" variant="quiet" onClick={again}>{t('mt.planAgain')}</Button>}
          </div>
        ) : row.below && !mem ? row.below : null,
      };
    });
  const gradeTrip = (id, n) => {
    if (euExample) { setExGrades((g) => ({ ...g, [id]: n })); return; }
    const before = loadMemory(id) || emptyMemory();
    saveMemory(id, { ...before, rating: n }, spendLabels);
    setMemTick((k) => k + 1);
    // One tap saves the grade, so it gets the house undo like the Trips tab's.
    const title = pastTrips.find((v) => v.id === id)?.title || '';
    removeWithUndo({
      key: `rate:${id}`,
      text: t('mt.ratedUndo', { trip: title, n }),
      restore: () => { saveMemory(id, before, spendLabels); setMemTick((k) => k + 1); },
    });
  };
  const fillSpend = (id) => {
    const x = pastTrips.find((v) => v.id === id) || pastTrips.find((v) => !(v.spendPP > 0));
    if (!x) { openPastForm(null); return; }
    openPastForm(x.kind === 'plan' ? editableFromPlan(x.item, x.mem) : editableFromDayPlan(x.item, x.mem));
  };
  // The year card (G12 Phase F): the studio's year, else the map's filter, else the latest.
  const ycCard = useMemo(() => yearCard(euTrips, yc.year ?? atlasYear), [euTrips, yc.year, atlasYear]);
  const ycModel = useMemo(() => {
    const mf = new Intl.DateTimeFormat(activeLocale(), { month: 'long', timeZone: 'UTC' });
    return yearCardModel(ycCard, yc, {
      t,
      nf: (n, d) => Number(n).toLocaleString(activeLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }),
      money: formatMoney,
      month: (i) => mf.format(Date.UTC(2020, i, 1)),
    });
  }, [ycCard, yc, t]);
  // Only the traveller's own photos: a catalogue photo is another site's and would taint the canvas.
  const ycPhotos = useMemo(() => (euExample ? [] : [...new Set(pastTrips.map((x) => coverPhoto(x.mem))
    .filter((src) => src && (src.startsWith('data:') || src.startsWith('/'))))].slice(0, 8)), [euExample, pastTrips]);
  const ycExample = euExample ? t('mt.example') : '';
  const ycExport = async (share) => {
    setYcBusy(share ? 'share' : 'download');
    const r = await exportYearCard({ model: ycModel, geo: atlasGeo, share, exampleLabel: ycExample });
    setYcBusy('');
    setYcNote(r === 'saved' ? t('mt.stSaved') : r === 'failed' ? t('mt.stFailed') : '');
  };
  const [country, setCountry] = useState('');
  const countryInfo = useMemo(() => {
    if (!country) return null;
    const there = euTrips.filter((x) => (x.countries || []).includes(country));
    const spent = there.filter((x) => x.spendPP > 0 && x.nights > 0);
    const nightsSpent = spent.reduce((n, x) => n + x.nights, 0);
    const days = Object.values(destinations)
      .filter((d) => (d.iso2 || COUNTRY_ISO2[d.country]) === country)
      .map((d) => costs?.get?.(d.id)?.dayEur).filter(Number.isFinite).sort((a, b) => a - b);
    return {
      cc: country,
      name: countryName(country, NAME_OF[country] || country),
      years: [...new Set(there.map(tripYear).filter(Boolean))].sort(),
      trips: there.length,
      nights: there.reduce((n, x) => n + (x.nights || 0), 0),
      hand: euBeen.has(country) && !there.length,
      been: euBeen.has(country),
      saved: shortRows.filter((r) => r.kind === 'dest' && (r.cc || destinations[r.id]?.iso2) === country).length,
      dayYou: nightsSpent ? spent.reduce((n, x) => n + x.spendPP, 0) / nightsSpent : null,
      dayNow: days.length ? days[Math.floor(days.length / 2)] : null,
      canToggle: !euExample && !viaTripIso.has(country),
    };
  }, [country, euTrips, euBeen, destinations, costs, shortRows]); // eslint-disable-line react-hooks/exhaustive-deps -- viaTripIso follows the record
  const nextLine = nextPlan && nextIso.size ? t('mt.nextAfter', {
    country: countryName([...nextIso][0], NAME_OF[[...nextIso][0]] || [...nextIso][0]),
    date: nextPlan.end_date ? new Date(`${nextPlan.end_date}T00:00:00Z`).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '',
  }) : '';

  // The trips a booking can go to: every dated account trip ahead.
  const bookPlans = datedPlans.filter((p) => !p.device && !p.coplan).map((p) => ({
    id: p.id,
    title: journeyParts(p).title,
    start: p.start_date,
    end: p.end_date,
    party: figures[p.id]?.party || p.choices?.groupSize || 2,
    stops: tripStops(p).map((x) => ({
      id: x.id, city: destinations[x.id]?.city || x.city, country: destinations[x.id]?.country || '', arrive: x.arrive, nights: x.nights,
    })),
  }));
  const tripsCount = datedPlans.length + upcomingDayPlans.length;
  // T1152: what the taste profile reads (the traveller's own saves and trips).
  const keptAll = useKept();
  const tasteSaves = useMemo(() => shortRows.map((r) => ({ key: r.key, kind: r.kind, id: r.id, name: r.name })), [shortRows]);
  const tasteTrips = useMemo(() => [
    ...tripPlans.map((p) => ({ id: p.id, name: p.label || '', at: p.updated_at || p.created_at || p.start_date, destIds: p.destination_ids || [] })),
    ...(devicePlan ? [{ id: `device:${devicePlan.id || 'trip'}`, name: devicePlan.label || '', at: devicePlan.updated_at || devicePlan.start_date, destIds: devicePlan.destination_ids || [] }] : []),
    ...keptAll.map((r) => ({ id: `kept:${r.id}`, name: r.name || '', at: r.keptAt, destIds: r.plan?.order || [] })),
  ], [tripPlans, devicePlan, keptAll]);

  // Jouw smaak moved to the Style Studio (G12 decision 7); it reads these.
  useEffect(() => { publishTasteInputs({ saves: tasteSaves, trips: tasteTrips, userId: user?.id || null }); }, [tasteSaves, tasteTrips, user?.id]);

  // Land on Trips once a trip ahead is known, unless a tab was picked this visit.
  useEffect(() => {
    if (!pickedRef.current && tripsCount > 0 && tab !== 'trips') setTab('trips');
  }, [tripsCount]); // eslint-disable-line react-hooks/exhaustive-deps -- runs when the plans arrive

  const pastForm = pastOpen ? (
    <PastTripForm
      friends={friends}
      key={pastEdit?.id || 'new'}
      destinations={destinations}
      todayIso={todayIso}
      busy={pastBusy}
      error={pastError}
      initial={pastEdit}
      onCancel={() => { setPastOpen(false); setPastEdit(null); }}
      onSave={handleSavePastTrip}
    />
  ) : null;

  const receiptPlan = receiptFor ? datedPlans.find((p) => p.id === receiptFor) : null;

  return (
    <div className="saved-shell mytrips">
      {receiptPlan && (
        <Suspense fallback={null}>
          <ShareReceiptSheet plan={receiptPlan} data={data} stayTier={stayTier} lifestyle={lifestyle} onClose={() => setReceiptFor('')} />
        </Suspense>
      )}
      <div className="panel open account-panel saved-trips-panel">
        <header className="panel-header saved-panel-header mt-header">
          <MyTripsHead
            tab={tab}
            onTab={pickTab}
            onNewTrip={() => onGoToTab?.('planstart')}
            onAddBooking={() => setBook({ planId: '' })}
          />
        </header>

        <InstallHint hasSavedTrip={trips.length > 0 || tripPlans.length > 0 || dayPlans.length > 0 || !!devicePlan} />

        <div className={`mt-panel is-${tab}`} id="mytrips-panel" role="tabpanel" aria-labelledby="mytrips-panel-title">
          {/* The section's name as the page's h2, for the heading outline; the
              tab above already shows it. */}
          <h2 className="sr-only" id="mytrips-panel-title">{t(tab === 'trips' ? 'mt.tabTrips' : tab === 'saved' ? 'mt.tabSaved' : 'mt.tabEurope')}</h2>
          <div className={`atlas-body is-${tab}`}>
          {/* G12 atlas: with the past trips under the map, the slot follows the
              content in the DOM, so a screen reader meets the left column first;
              keys keep both mounted when they swap. */}
          {[
            <React.Fragment key="slot">
          <AtlasSlot
            tab={tab}
            geo={atlasGeo}
            trips={tripsMap}
            europe={{
              ...europeMap, lift: euLift, been: euBeen, next: euExample ? new Set() : nextIso, viaTrip: viaTripIso, total: catalogueCountries,
              nextLine: euExample ? '' : nextLine, example: euExample,
            }}
            onCountry={setCountry}
            year={atlasYear}
            onYear={setAtlasYear}
            onToggleCountry={toggleIso}
            onList={() => setCountriesOpen(true)}
            listRef={countriesRef}
            savedEmpty={!shortRows.length && !example}
            savedHost={setSavedMapEl}
          />
            </React.Fragment>,
            <React.Fragment key="content">
          <div className="atlas-content"><div className="atlas-full atlas-col">
          {tab === 'trips' && (
            <TripsTab
              authed={authed}
              configured={configured}
              loading={tripPlansLoading}
              error={tripPlansError}
              onRetry={loadTripPlans}
              today={showExample ? null : todayNode}
              next={showExample ? exampleModel(examplePlans[0], true) : nextModel}
              coming={showExample ? [exampleModel(examplePlans[1], false)] : comingModels}
              planning={showExample ? [] : planningModels}
              dayPlans={showExample ? [] : dayModels}
              example={showExample}
              onExample={() => setExample(true)}
              onExampleClose={() => setExample(false)}
              rate={rateNode}
              hasPast={pastTrips.length > 0}
              unit={<UnitButton choices={choices} onOpen={() => setUnitOpen(true)} />}
              onLift={setLift}
              friendsShared={friendTrips.length}
              friendFaces={ownersOf(friendTrips)}
              onOpenFriends={onOpenFriends}
              // G12 L5: with past trips, plan again somewhere new (the
              // countries been are the seed's avoidIso2; the finder honours
              // it in B6); else the door on Plan home.
              onPlanTrip={() => (pastTrips.length > 0 && beenIso.size > 0 && onPlanSeed
                ? onPlanSeed({ source: 'past', avoidIso2: [...beenIso] })
                : onGoToTab?.('planstart'))}
              onAllInPlan={() => onGoToTab?.('planstart')}
              onSignIn={onOpenAuth}
              signInLine={!devicePlan}
            />
          )}
          {unitOpen && <UnitSheet choices={choices} setChoices={setChoices} onClose={() => setUnitOpen(false)} />}
          {tab === 'saved' && (
            <SavedTab
              rows={shortRows}
              saved={savedLists}
              costs={costs}
              destinations={destinations}
              loading={shortlist.loading || (authed && loading)}
              onOpen={openShortlisted}
              onRemove={dropShortlisted}
              onPlan={(stops) => onPlanStops?.(stops)}
              onBrowse={() => onGoToTab?.('places')}
              onUndo={removeWithUndo}
              geo={atlasGeo}
              europe={{ ...europeMap, been: euBeen, next: euExample ? new Set() : nextIso }}
              shared={authed || SAVED_MOCK ? sharedState : null}
              friends={SAVED_MOCK ? MOCK_FRIENDS : friends}
              sharedRows={sharedRowMap}
              heldKey={heldKey}
              choices={choices}
              setChoices={setChoices}
              example={example && !shortRows.length}
              onExample={() => setExample(true)}
              onExampleClose={() => setExample(false)}
              exampleRows={exampleSaved}
              initialCc={savedCc}
              onCcUsed={() => setSavedCc('')}
              mapHost={savedMapEl}
              top={(
                <>
                  {/* Kept trips from the trip finder (T806): planning one hands
                      its plan to the Plan tab, which opens the planner on it. */}
                  {/* G12 B2: through App's openPlan, which keeps the finder's priced plan. */}
                  <KeptTrips onPlan={(r) => { if (onPlanKept) onPlanKept(r.plan); else { holdPlan(r.plan); onGoToTab?.('trip'); } }} />
                  {onOpenFeature && <SavedJourneys onOpen={(id) => onOpenFeature('journey', { id })} />}
                </>
              )}
            />
          )}
          {tab === 'europe' && (
            <YourEurope
              trips={euTrips}
              year={atlasYear}
              onYear={setAtlasYear}
              ramp={europeMap.ramp}
              geo={atlasGeo}
              milestones={euExample ? exMilestones : milestones}
              countries={euBeen.size}
              past={pastRows}
              onGrade={gradeTrip}
              onFill={fillSpend}
              ycModel={ycModel}
              ycExample={ycExample}
              onRecap={() => { setYcNote(''); setStudioOpen(true); }}
              onShare={() => ycExport(!ycExample)}
              sharing={!!ycBusy}
              onAddPast={() => openPastForm(null)}
              pastForm={pastForm}
              error={tripPlansError}
              fmtMonth={fmtMonth}
              onLift={setEuLift}
              example={euExample}
              onExample={() => setExample(true)}
              onExampleClose={() => setExample(false)}
            />
          )}
          </div></div>
            </React.Fragment>,
          ]}
          </div>
        </div>

        {countryInfo && (
          <CountrySheet
            info={countryInfo}
            onClose={() => setCountry('')}
            onToggle={(cc) => { toggleIso(cc); setCountry(''); }}
            onShowSaved={() => { setSavedCc(countryInfo.cc); setCountry(''); pickTab('saved'); }}
            onPlan={() => {
              // G12 B2: the saved towns as stops ({ dest, nights }, the shape
              // openTripInPlanner reads; bare ids were dropped there), else the
              // country itself as the place to plan.
              const stops = shortRows.filter((r) => r.kind === 'dest' && (r.cc || destinations[r.id]?.iso2) === countryInfo.cc)
                .map((r) => ({ dest: r.id, nights: 2, dayActivities: [] }));
              setCountry('');
              if (stops.length && onPlanStops) onPlanStops(stops);
              else if (onPlanTripCountry) onPlanTripCountry(countryInfo.cc);
              else onGoToTab?.('planstart');
            }}
          />
        )}
        {studioOpen && tab === 'europe' && ycCard.year != null && (
          <YearStudio
            model={ycModel}
            geo={atlasGeo}
            cfg={yc}
            onCfg={(patch) => setYc((cur) => ({ ...cur, ...patch }))}
            years={ycCard.years}
            year={ycCard.year}
            hasMoney={ycCard.hasMoney}
            photos={ycPhotos}
            upload={ycUpload}
            onUpload={setYcUpload}
            onClose={() => setStudioOpen(false)}
            onDownload={() => ycExport(false)}
            onShare={() => ycExport(true)}
            busy={ycBusy}
            note={ycNote}
            example={ycExample}
          />
        )}
        {countriesOpen && (
          <VisitedCountriesSheet
            fromTrips={allRecord.fromTrips}
            manual={manualCountries}
            onToggle={(c) => toggleVisitedCountry(c)}
            onClose={() => { setCountriesOpen(false); countriesRef.current?.focus(); }}
          />
        )}
        {book && (
          <AddBookingSheet
            plans={bookPlans}
            planId={book.planId}
            costs={costs}
            onClose={() => setBook(null)}
            onTypeIn={(id) => { setBook(null); if (id) onLoadTripPlan?.(id); }}
            mockRead={SAVED_MOCK ? mockRead : null}
          />
        )}
        {undo && <UndoToast key={undo.key} label={undo.label} text={undo.text} onUndo={undoRemoval} onClose={flushUndo} />}
        <SiteFooter />
      </div>
    </div>
  );
}

/** The Plan home's trips on this device, never throwing (private mode). */
function safeList() {
  try { return tripsStore.list(); } catch { return []; }
}
