import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DateField } from '../components/DateField.jsx';
import { Dropdown } from '../components/Dropdown.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { CountryPickerMap } from '../map/CountryPickerMap.jsx';
import { CityPickerMap } from '../map/CityPickerMap.jsx';
import { FlightPickerMap } from '../map/FlightPickerMap.jsx';
import {
  countriesFromData, cityInsight,
  cityTier, cityCompanions, designStays,
} from '../lib/tripGuide.js';
import { knownForFacts } from '../lib/knownFor.js';
import { gemScore, BAGGAGE_OPTIONS, baggageFeePerLeg } from '../lib/trip_planner_pricing.js';
import {
  flyInOptions, flyHomeOptions, monthOptions, orderStaysFromAnchor, flightMeta, fmtFlightDuration, flightBadges,
} from '../lib/wizardFlights.js';
import { cheapestStartDates } from '../lib/tripCostOptimizer.js';
import {
  carAdvice, legTransportOptions, airportTransferOptions, preferredPublicMode,
} from '../lib/transport.js';
import { haversineKm, tripDaysBetween, accommodationPerPerson } from '../lib/runtime_pricing.js';
import { eur } from '../lib/format.js';
import { fmtDate, addDays } from '../lib/dates.js';
import { geocodeAddress } from '../lib/geocode.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import {
  SparkIcon, CheckIcon, AlertIcon, TrainIcon, CarIcon, InfoIcon,
  TreeIcon, DiningIcon, MoonIcon,
  CameraIcon, CastleIcon, BeachIcon,
  LeafIcon, ScaleIcon, BoltIcon, StarIcon, RouteIcon, BedIcon, MapPinIcon,
  CalendarIcon, PersonIcon, DiamondIcon, DotIcon, LuggageIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { OriginPicker } from '../components/OriginPicker.jsx';
import { useI18n } from '../i18n/index.jsx';
import { suggestedNights, Flag, CityThumb, StayRow } from './GuidedTripWizardParts.jsx';

const ROUTES_PREVIEW = 14;
const CITIES_PREVIEW = 8;
const NEARBY_KM = 140;

// The three ways into the wizard, how much is already booked decides how many
// questions Carta still gets to ask.
const PATHS = [
  {
    key: 'full',
    Icon: SparkIcon,
    labelKey: 'wizard.pathFull',
    subKey: 'wizard.pathFullSub',
  },
  {
    key: 'landed',
    Icon: PlaneIcon,
    labelKey: 'wizard.pathLanded',
    subKey: 'wizard.pathLandedSub',
  },
  {
    key: 'booked',
    Icon: CheckIcon,
    labelKey: 'wizard.pathBooked',
    subKey: 'wizard.pathBookedSub',
  },
];

// Step labels per path (index 0 is unused; the path picker is step 0).
// The values are logic keys (the render switches on them); STEP_LABEL_KEYS
// maps each to its translated display label.
const PATH_STEPS = {
  full: ['Where', 'When', 'Getting there', 'Stay', 'Getting home', 'Finish'],
  landed: ['Arrival', 'Stay', 'Finish'],
  booked: ['Your trip'],
};
const STEP_LABEL_KEYS = {
  'Where': 'wizard.stepWhere',
  'When': 'wizard.stepWhen',
  'Getting there': 'wizard.stepGettingThere',
  'Stay': 'wizard.stepStay',
  'Getting home': 'wizard.stepGettingHome',
  'Finish': 'wizard.stepFinish',
  'Arrival': 'wizard.stepArrival',
  'Your trip': 'wizard.stepYourTrip',
};

// "What kind of vacation?" tiles for the let-Carta-pick-countries quiz.
const VIBES = [
  { key: 'beaches', labelKey: 'wizard.vibeBeaches', Icon: BeachIcon },
  { key: 'nature', labelKey: 'wizard.vibeNature', Icon: TreeIcon },
  { key: 'cities', labelKey: 'wizard.vibeCities', Icon: CastleIcon },
  { key: 'food', labelKey: 'wizard.vibeFood', Icon: DiningIcon },
  { key: 'nightlife', labelKey: 'wizard.vibeNightlife', Icon: MoonIcon },
  { key: 'hidden', labelKey: 'wizard.vibeHidden', Icon: CameraIcon },
];

// "How full should your days feel?"
const PACE_CHOICES = [
  { key: 'relaxed', Icon: LeafIcon, labelKey: 'wizard.paceRelaxed', subKey: 'wizard.paceRelaxedSub' },
  { key: 'balanced', Icon: ScaleIcon, labelKey: 'wizard.paceBalanced', subKey: 'wizard.paceBalancedSub' },
  { key: 'packed', Icon: BoltIcon, labelKey: 'wizard.pacePacked', subKey: 'wizard.pacePackedSub' },
];

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
export function GuidedTripWizard({ data, origin, onChangeOrigin, onCancel, onComplete }) {
  const { t } = useI18n();
  const destinations = data?.destinations || {};
  const dateMin = data?.meta?.start_date;
  const dateMax = data?.meta?.end_date;
  // The departure airport the fares are currently priced from (set globally in
  // the header); its city names the getting-there step so the copy follows it.
  const originCode = data?.meta?.selected_origin;
  const originRec = data?.meta?.origins?.[originCode] || null;
  const originCity = originRec?.city || t('wizard.yourAirport');
  const allCountries = useMemo(() => countriesFromData(destinations), [destinations]);
  const countryInsights = useCountryInsights();

  // ---- Wizard flow state ----
  const [path, setPath] = useState(null); // null = the "what are you looking for?" screen
  const [step, setStep] = useState(1);
  // Which way the last move went, so the incoming screen slides in from the
  // side it came from. Steps should read as travel through one form.
  const [stepDir, setStepDir] = useState('fwd');
  const goStep = (n) => {
    setStepDir(n < step ? 'back' : 'fwd');
    setStep(n);
  };

  const [countries, setCountries] = useState(() => new Set());
  const [countryQuery, setCountryQuery] = useState('');
  const [countryQuizOpen, setCountryQuizOpen] = useState(false);
  const [vibes, setVibes] = useState(() => new Set());
  const [dateMode, setDateMode] = useState('exact'); // 'exact' | 'flex'
  const [flexPad, setFlexPad] = useState(false);     // exact dates, +-2 days wiggle
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [flexNights, setFlexNights] = useState(7);
  const [flexMonth, setFlexMonth] = useState(''); // '' = any month
  // 'fly' = Ryanair route pick, 'car' = drive, 'other' = the traveller books
  // their own flight with another airline (Carta plans stays + ground only).
  const [arriveMode, setArriveMode] = useState('fly');
  const [flyInId, setFlyInId] = useState('');
  // When the traveller flies with another airline (arriveMode/landedMode ==
  // 'other'), they tell Carta which airline and what the fare cost so the
  // overview can include it instead of pricing a Ryanair flight they aren't
  // taking. Cost is the total return fare for the whole party, in EUR.
  const [ownAirline, setOwnAirline] = useState('');
  const [ownFlightCost, setOwnFlightCost] = useState('');
  // When those booked flights actually fly (full path only; the landed path
  // already asks "day you land"). The outbound date anchors the whole trip.
  const [ownOutDate, setOwnOutDate] = useState('');
  const [ownRetDate, setOwnRetDate] = useState('');
  // Where a car trip starts ("where do you drive from?"): typed by the
  // traveller, geocoded via Nominatim on an explicit search action. Everything
  // downstream (drive out/home legs, totals) prices from this point.
  const [carFromQuery, setCarFromQuery] = useState('');
  const [carFrom, setCarFrom] = useState(null); // { name, lat, lon }
  const [carFromResults, setCarFromResults] = useState([]);
  const [carFromBusy, setCarFromBusy] = useState(false);
  const [flightView, setFlightView] = useState('map'); // 'map' | 'list'
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  // The return flight home, picked AFTER the stays are pinned (its own step),
  // so the traveller flies out of the airport that suits where their trip ends.
  const [returnFlyId, setReturnFlyId] = useState('');
  const [returnFlightView, setReturnFlightView] = useState('map'); // 'map' | 'list'
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
  const [groupSize, setGroupSize] = useState(2);
  const [pace, setPace] = useState('balanced');
  const [baggage, setBaggage] = useState('cabin'); // Ryanair bag add-on per person per flight

  // ---- "Travel is booked" path: where and when do you arrive? ----
  const [arrivalQuery, setArrivalQuery] = useState('');
  const [arrivalId, setArrivalId] = useState('');
  const [landedMode, setLandedMode] = useState('other'); // 'other' (own flight) | 'car'

  // ---- "Everything is booked" path: type the trip in ----
  const [bookedStart, setBookedStart] = useState('');
  const [bookedStops, setBookedStops] = useState([]); // [{ destinationId, nights }]
  const [bookedCountry, setBookedCountry] = useState('');
  const [bookedCity, setBookedCity] = useState('');

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
  const windowNights = path === 'landed'
    ? flexNights
    : (dateMode === 'exact' ? tripDaysBetween(startDate, endDate) : flexNights);
  const months = useMemo(() => monthOptions(dateMin, dateMax), [dateMin, dateMax]);

  // The steps for this path. "Getting home" (the return-flight pick) only
  // applies when the traveller is actually flying, so it's dropped for a
  // drive/own-flight trip, no empty step to click through.
  const steps = useMemo(() => {
    const s = path ? PATH_STEPS[path] : [];
    return s.filter((x) => x !== 'Getting home' || arriveMode === 'fly');
  }, [path, arriveMode]);

  // Which step is which, per path (so the render below reads by NAME).
  const stepName = path ? steps[step - 1] : null;

  // Typing narrows the (43-country) grid; countries already picked always stay
  // on screen, so a filter can never hide what you chose a moment ago.
  const shownCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter((c) => c.country.toLowerCase().includes(q) || countries.has(c.country));
  }, [allCountries, countryQuery, countries]);

  // Every Ryanair route into the chosen countries for the chosen period,
  // cheapest first. The pick anchors the whole trip, so this must stay
  // resolvable AFTER the Getting-there step too (the Stay and Finish steps read
  // the chosen fly-in for the arrival anchor, the route ordering and the
  // flexible-date repricing). Gating it to only 'Getting there' silently
  // dropped `flyIn` to null everywhere else, which handed the planner a null
  // anchor and left ground-only first/last stops (gems like Toledo) with no
  // priceable flight, the "no single flight plan" dead end.
  const routeOptions = useMemo(() => {
    if (path !== 'full' || arriveMode !== 'fly' || countries.size === 0) return [];
    return flyInOptions(destinations, countries, {
      startDate: dateMode === 'exact' ? startDate : '',
      flexMonth: dateMode === 'flex' ? flexMonth : '',
    });
  }, [path, arriveMode, destinations, countries, dateMode, startDate, flexMonth]);
  const flyIn = routeOptions.find((o) => o.id === flyInId) || null;
  const arrivalDest = arrivalId ? destinations[arrivalId] : null;
  const anchorDest = path === 'landed'
    ? arrivalDest
    : (arriveMode === 'fly' && flyIn ? flyIn.dest : null);
  const anchorId = path === 'landed' ? arrivalId : (arriveMode === 'fly' && flyIn ? flyIn.id : null);
  const badges = useMemo(
    () => flightBadges(routeOptions.slice(0, 40), data?.meta?.origins),
    [routeOptions, data],
  );

  // ---- The return flight home (its own step, after the stays are pinned) ----
  // Route the pinned stays out from the arrival anchor so we know the genuine
  // LAST stop, then offer the airports you can fly home from near it. The exact
  // return date is the start plus the nights actually planned; when flexible we
  // fall back to the cheapest stored return.
  const orderedIncludedIds = useMemo(
    () => orderStaysFromAnchor(includedIds, destinations, anchorDest),
    [includedIds, destinations, anchorDest],
  );
  const lastStopDest = orderedIncludedIds.length
    ? destinations[orderedIncludedIds[orderedIncludedIds.length - 1]] : null;
  const returnDate = dateMode === 'exact' && startDate && totalNights
    ? addDays(startDate, totalNights) : '';
  const homeOptions = useMemo(() => {
    if (stepName !== 'Getting home' || arriveMode !== 'fly' || !flyIn) return [];
    return flyHomeOptions(destinations, {
      origin: flyIn.origin,
      lastDest: lastStopDest,
      returnDate,
      flexMonth: dateMode === 'flex' ? flexMonth : '',
      outAnchorId: flyIn.id,
    });
  }, [stepName, arriveMode, flyIn, destinations, lastStopDest, returnDate, dateMode, flexMonth]);
  const flyHome = homeOptions.find((o) => o.id === returnFlyId) || null;
  // The chosen home airport as a plain destination, resolvable on ANY step
  // (homeOptions only exists on the return step); used by the recap + finish.
  const flyHomeDest = arriveMode === 'fly' && returnFlyId ? destinations[returnFlyId] : null;

  // Rough driving reach per selected country: straight-line to the country's
  // centroid with the app's road-detour factor. Not shown as advice any more,
  // it only scales the fuel-and-tolls line in the running estimate below.
  const driveNotes = useMemo(() => {
    if (!originRec || originRec.lat == null) return [];
    return selectedCountries.map((c) => {
      const km = haversineKm(originRec.lat, originRec.lon, c.centroid.lat, c.centroid.lon);
      if (km == null) return null;
      const roadKm = Math.round(km * 1.3);
      return { country: c.country, iso2: c.iso2, km: roadKm, hours: Math.round((roadKm / 90) * 10) / 10 };
    }).filter(Boolean);
  }, [selectedCountries, originRec]);

  // The return-flight option list only exists while its step is showing (a
  // deliberate perf gate), but the running estimate needs the chosen fare on
  // every later step too, so cache it the moment it's picked.
  const [returnFareCache, setReturnFareCache] = useState(null); // { id, eur }
  useEffect(() => {
    if (flyHome) {
      setReturnFareCache({ id: flyHome.id, eur: flyHome.ret_exact_eur ?? flyHome.ret_cheapest?.eur ?? null });
    } else if (!returnFlyId) {
      setReturnFareCache(null);
    }
  }, [flyHome, returnFlyId]);

  const [estimateOpen, setEstimateOpen] = useState(false);

  const toggleCountry = (name) => {
    setCountries((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleVibe = (key) => {
    setVibes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ---- "Carta picks the countries": rank countries for the chosen vibes ----
  // Data-driven: each country is scored on how many genuinely strong matches
  // it holds for the selected vacation types (curated ratings + tags).
  const countrySuggestions = useMemo(() => {
    if (!countryQuizOpen || vibes.size === 0) return [];
    // Each vacation type reads the real catalogue signals, the `categories`
    // tags a city carries plus its beauty-component intensities, so beaches,
    // food and nightlife genuinely count. (The old code scored those three off
    // an activity-kind fit that only knew museums/churches, so they were always
    // zero and any beach/food/nightlife pick returned nothing.)
    const has = (cats, ...keys) => keys.some((k) => cats.has(k));
    const vibeFit = (dest) => {
      const cats = new Set(dest.categories || []);
      const comp = dest.beauty?.components || {};
      const score = dest.rating?.score ?? dest.beauty?.score ?? 0;
      let s = 0;
      if (vibes.has('beaches')) {
        s += (cats.has('beach') ? 1 : 0)
           + (has(cats, 'coast', 'island') ? 0.5 : 0)
           + (has(cats, 'surf', 'diving', 'sailing') ? 0.3 : 0)
           + (comp.beach || 0)
           + (dest.beauty?.top_beach ? 0.4 : 0);
      }
      if (vibes.has('nature')) {
        s += (has(cats, 'nature', 'mountains', 'national-park', 'wilderness') ? 1 : 0)
           + (has(cats, 'alps', 'hiking', 'lake', 'lakes', 'fjord', 'fjords', 'valley', 'volcanic', 'countryside', 'arctic', 'carpathians') ? 0.5 : 0)
           + (comp.nature || 0) * 1.2;
      }
      if (vibes.has('cities')) {
        s += (cats.has('city') ? 0.8 : 0)
           + (has(cats, 'historic', 'unesco', 'art', 'iconic', 'medieval', 'baroque', 'renaissance', 'gothic', 'roman', 'cathedral', 'architecture') ? 0.6 : 0)
           + (comp.iconic || 0) * 0.5 + (comp.heritage || 0) * 0.5;
      }
      if (vibes.has('food')) {
        s += (cats.has('food') ? 1.2 : 0) + (cats.has('wine') ? 0.9 : 0) + (cats.has('beer') ? 0.5 : 0);
      }
      if (vibes.has('nightlife')) {
        s += (cats.has('nightlife') ? 1.2 : 0) + (cats.has('party') ? 0.8 : 0) + (cats.has('music') ? 0.4 : 0);
      }
      if (vibes.has('hidden')) {
        s += (dest.rating?.hidden_gem ? 1 : 0) + (has(cats, 'quiet', 'remote', 'village') ? 0.6 : 0);
      }
      return s * (0.6 + score / 14); // a strong match in a strong place counts for more
    };
    return allCountries
      .map((c) => {
        const fits = c.cities
          .map(({ dest }) => ({ dest, s: vibeFit(dest) }))
          .filter((x) => x.s > 0.6)
          .sort((a, b) => b.s - a.s);
        const top = fits[0]?.dest;
        return {
          country: c.country,
          iso2: c.iso2,
          n: fits.length,
          score: fits.slice(0, 6).reduce((sum, x) => sum + x.s, 0),
          reason: top
            ? t(fits.length === 1 ? 'wizard.greatMatchOne' : 'wizard.greatMatches', { n: fits.length, city: top.city })
            : '',
        };
      })
      .filter((c) => c.n >= 1 && c.score > 0.9)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [countryQuizOpen, vibes, allCountries, t]);

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
      transport: (arriveMode === 'car' || landedMode === 'car') ? 'owncar' : 'auto',
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

  const canNext = !path ? false : (
    (stepName === 'Where' && countries.size > 0)
    || (stepName === 'When' && (dateMode === 'flex'
      ? flexNights >= 1
      : Boolean(startDate && endDate && windowNights > 0)))
    || (stepName === 'Getting there' && (arriveMode === 'car' || arriveMode === 'other' || flyIn != null))
    || (stepName === 'Arrival' && Boolean(arrivalId && startDate && flexNights >= 1))
    || (stepName === 'Stay' && includedIds.length > 0)
    || (stepName === 'Getting home' && (flyHome != null || homeOptions.length === 0))
    || stepName === 'Finish'
  );

  // Choosing to arrive by car implies driving between stops too (they'll have
  // the car); still changeable per leg in the planner.
  const pickArriveMode = (mode) => {
    setArriveMode(mode);
    if (mode === 'car') setFlyInId('');
  };

  // One truth for "this trip is their own car" across both paths: it gates the
  // rental-car advice, asks where they drive from, and skips flight pricing.
  const ownCarChosen = path === 'landed' ? landedMode === 'car' : arriveMode === 'car';

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
  };

  const searchCarFrom = async () => {
    const q = carFromQuery.trim();
    if (q.length < 3 || carFromBusy) return;
    setCarFromBusy(true);
    setCarFromResults(await geocodeAddress(q));
    setCarFromBusy(false);
  };

  const hasProgress = Boolean(path) && (countries.size > 0 || arrivalId || bookedStops.length > 0 || step > 1);
  const handleCancel = () => {
    if (hasProgress && !window.confirm(t('wizard.confirmDiscard'))) return;
    onCancel();
  };
  const startOver = () => {
    if (!window.confirm(t('wizard.confirmStartOver'))) return;
    setPath(null);
    setStep(1);
    setCountries(new Set());
    setCountryQuizOpen(false);
    setVibes(new Set());
    setDateMode('exact');
    setFlexPad(false);
    setStartDate('');
    setEndDate('');
    setFlexNights(7);
    setFlexMonth('');
    setArriveMode('fly');
    setFlyInId('');
    setOwnAirline('');
    setOwnFlightCost('');
    setOwnOutDate('');
    setOwnRetDate('');
    setCarFromQuery('');
    setCarFrom(null);
    setCarFromResults([]);
    setFlightView('map');
    setShowAllRoutes(false);
    setReturnFlyId('');
    setReturnFlightView('map');
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
    setGroupSize(2);
    setPace('balanced');
    setArrivalQuery('');
    setArrivalId('');
    setLandedMode('other');
    setBookedStart('');
    setBookedStops([]);
    setBookedCountry('');
    setBookedCity('');
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
    const orderedIds = orderStaysFromAnchor(includedIds, destinations, anchorDest);
    // Days start EMPTY on purpose: sights are chosen in the Day planner
    // ("Plan this day"), not pre-stuffed here, a pre-filled "2 to visit" on
    // every date read as a commitment nobody made.
    const stops = orderedIds.map((id) => ({
      destinationId: id,
      nights: Math.max(1, nights[id] || 1),
      activities: [],
    }));

    let start = (path === 'landed' || dateMode === 'exact') ? startDate : '';
    const canRepriceDates = path === 'full' && arriveMode === 'fly' && stops.length > 0;
    if (canRepriceDates && (dateMode === 'flex' || (flexPad && start))) {
      // Flight pricing keys off the first/last stop's own routes; when those
      // are ground-only gems, price via the chosen fly-in instead.
      const flyable = (id) => Object.keys(destinations[id]?.routes || {}).length > 0;
      const priceIds = orderedIds.slice();
      if (flyIn) {
        if (!flyable(priceIds[0])) priceIds[0] = flyIn.id;
        if (!flyable(priceIds[priceIds.length - 1])) priceIds[priceIds.length - 1] = flyIn.id;
      }
      const res = cheapestStartDates(
        priceIds.map((id) => ({ destinationId: id })),
        destinations, totalNights, groupSize, '', { limit: 60 },
      );
      let candidates = res.candidates;
      if (dateMode === 'flex' && flexMonth) {
        candidates = candidates.filter((c) => c.start.startsWith(flexMonth));
      }
      if (dateMode === 'exact' && flexPad && start) {
        // "My dates can shift +-2 days": keep the chosen start unless a real
        // fare within the wiggle room beats it.
        const lo = addDays(start, -2);
        const hi = addDays(start, 2);
        candidates = candidates.filter((c) => c.start >= lo && c.start <= hi);
      }
      start = candidates[0]?.start || start || flyIn?.cheapest?.date || '';
    }
    // Booked own flights fly on a known day: that day IS the trip start.
    if (path === 'full' && arriveMode === 'other' && ownOutDate) start = ownOutDate;
    // Car trips (or no fare data at all) still need a concrete start date.
    if (!start) start = flexMonth ? `${flexMonth}-05` : (dateMin || '');

    const label = path === 'landed' && arrivalDest
      ? arrivalDest.country
      : selectedCountries.map((c) => c.country).slice(0, 2).join(' & ');

    onComplete({
      startDate: start,
      groupSize,
      transport: (arriveMode === 'car' || landedMode === 'car') ? 'owncar' : 'auto',
      pace,
      baggage,
      anchorId: path === 'landed' ? (landedMode === 'car' ? null : arrivalId) : (arriveMode === 'fly' && flyIn ? flyIn.id : null),
      // The exact departure airport the traveller picked for their fly-in, so
      // the overview prices the same inbound flight (same origin) they saw here.
      anchorOrigin: arriveMode === 'fly' && flyIn ? flyIn.origin : null,
      // The airport they chose to fly HOME from (its own "Getting home" step,
      // after the stays were pinned), so the return leg matches too.
      returnAnchorId: flyHomeDest ? returnFlyId : null,
      // Flying with another airline (not Ryanair): carry the airline name and
      // the fare the traveller entered so the overview shows their real flight
      // instead of a Ryanair fare. Present whenever they chose "other", even
      // with blank fields, that's the signal to skip Ryanair pricing.
      ownFlight: (path === 'landed' ? landedMode === 'other' : arriveMode === 'other')
        ? {
          airline: ownAirline.trim(),
          costTotal: Math.max(0, Math.round(Number(ownFlightCost) || 0)),
          // When the flights fly: the landed path's "day you land" is the
          // outbound day; the full path asks both days explicitly.
          outDate: (path === 'landed' ? startDate : ownOutDate) || null,
          retDate: (path === 'landed' ? null : ownRetDate) || null,
        }
        : null,
      // Where an own-car trip starts, so the planner prices the drive out and
      // home from the traveller's own door, not the origin airport.
      carHome: ownCarChosen ? carFrom : null,
      label,
      stops,
    });
  };

  // "Everything is booked": hand over exactly what they typed, straight to
  // the overview, no design pass, no repricing of decisions already made.
  const finishBooked = () => {
    if (!bookedStart || !bookedStops.length) return;
    onComplete({
      startDate: bookedStart,
      groupSize,
      transport: 'auto',
      pace: 'balanced',
      baggage,
      anchorId: null,
      label: [...new Set(bookedStops.map((s) => destinations[s.destinationId]?.country).filter(Boolean))]
        .slice(0, 2).join(' & '),
      stops: bookedStops.map((s) => ({ ...s, activities: [] })),
    });
  };

  // ---- Stay step data: per-country groups (big cities vs gems), exhaustive ----
  const q = staySearch.trim().toLowerCase();
  const matchesQ = (dest) => !q || dest.city.toLowerCase().includes(q);
  // Rough per-night stay price for the WHOLE group at a candidate city, from
  // the same accommodation model the receipt uses (a 2-night stay so one-off
  // fees amortize). Cached hard: the Stay list can hold hundreds of rows.
  const nightlyCache = useRef(new Map());
  const nightlyFor = (id, dest) => {
    const key = `${id}|${groupSize}|${startDate || ''}`;
    const cache = nightlyCache.current;
    if (cache.has(key)) return cache.get(key);
    const a = accommodationPerPerson(dest, 2, startDate || null, null, groupSize);
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
    if (!path || path === 'booked' || includedIds.length === 0) return null;
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
      const opts = airportTransferOptions(from, to, gs, { carModel, hasRental: false });
      const m = opts?.modes?.[opts.recommended];
      if (m) {
        legs.push({ label, eur: m.eur_total, km: opts.road_km, mode: opts.recommended, hours: m.hours });
        return;
      }
      const inter = legTransportOptions(from, to, gs, { carModel, countryInsights, hasCar: ownCarChosen });
      if (!inter || inter.no_road) return;
      const key = ownCarChosen ? 'car' : (preferredPublicMode(inter) || inter.recommended);
      const im = inter.modes[key];
      if (!im) return;
      legs.push({ label, eur: im.eur_total, km: inter.road_km, mode: key, hours: im.hours });
    };
    const flying = path === 'landed' ? landedMode !== 'car' : arriveMode !== 'car';
    if (flying && anchorDest && anchorId && anchorId !== stops[0].id) {
      transfer(anchorDest, stops[0].dest, t('wizard.legFromAirport', { from: anchorDest.city, city: stops[0].dest.city }));
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
        legs.push({ label: t('wizard.legSea', { a: a.city, b: b.city }), eur: 0, km: null, mode: null, unpriced: true });
        continue;
      }
      const key = ownCarChosen ? 'car' : (preferredPublicMode(opts) || opts.recommended);
      const m = opts.modes[key];
      if (!m) continue;
      legs.push({ label: t('wizard.legBetween', { a: a.city, b: b.city }), eur: m.eur_total, km: opts.road_km, mode: key, hours: m.hours });
    }

    // Last stay to the airport you fly home from.
    const last = stops[stops.length - 1];
    if (flying && flyHomeDest && returnFlyId && returnFlyId !== last.id) {
      transfer(last.dest, flyHomeDest, t('wizard.legToAirport', { from: last.dest.city, city: flyHomeDest.city }));
    }

    if (!legs.length) return null;
    const total = legs.reduce((s, l) => s + (l.eur || 0), 0);
    return { legs, total };
  }, [path, includedIds, orderedIncludedIds, destinations, anchorDest, anchorId, arriveMode, landedMode,
    flyHomeDest, returnFlyId, ownCarChosen, groupSize, countryInsights, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Running price estimate, alive on every step ----------------------
  // Every choice that adds cost adds a line the moment it's made (flight,
  // stays, bags, drive), so the total grows honestly with the answers instead
  // of appearing only at the finish. Ground legs between cities and per-city
  // extras are priced properly by the planner afterwards; the breakdown says
  // so rather than pretending a number it can't know yet. (Placed after
  // nightlyFor on purpose: the memo body runs during this very render.)
  const runningEstimate = useMemo(() => {
    if (!path || path === 'booked') return null;
    const gs = Math.max(1, groupSize || 1);
    const lines = [];
    const flying = (path === 'landed' ? landedMode : arriveMode);
    if (flying === 'fly' && flyIn) {
      const pp = flyIn.exact_eur ?? flyIn.cheapest?.eur ?? null;
      if (pp != null) {
        lines.push({ key: 'flyIn', label: `Flight out to ${flyIn.dest?.city || 'your arrival city'}`, eur: pp * gs, sub: `${eur(pp)} pp one-way` });
      }
    }
    if (flying === 'fly' && returnFareCache?.eur != null && returnFlyId) {
      lines.push({ key: 'flyHome', label: `Flight home from ${destinations[returnFareCache.id]?.city || 'your last stop'}`, eur: returnFareCache.eur * gs, sub: `${eur(returnFareCache.eur)} pp one-way` });
    }
    if (flying === 'other' && Number(ownFlightCost) > 0) {
      lines.push({ key: 'ownFlight', label: `Your ${ownAirline || 'own'} flights`, eur: Number(ownFlightCost), sub: 'the fare you entered, whole party' });
    }
    if (flying === 'fly' && baggage !== 'cabin' && (flyIn || returnFlyId)) {
      const legs = (flyIn ? 1 : 0) + (returnFlyId ? 1 : 0);
      const fee = baggageFeePerLeg(baggage) * gs * legs;
      if (fee > 0) lines.push({ key: 'bags', label: 'Bags', eur: fee, sub: `${eur(baggageFeePerLeg(baggage))} pp per flight` });
    }
    if (flying === 'car' && driveNotes.length > 0) {
      // Rough scale check only: fuel + tolls out and home to the first chosen
      // country, at the app's average consumption and toll rates. The planner
      // prices the real route once the stops are pinned.
      const km = driveNotes[0].km;
      const cost = Math.round(km * 2 * 0.14);
      lines.push({ key: 'drive', label: 'Drive there & home (fuel + tolls, rough)', eur: cost, sub: `~${km} km each way` });
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
    if (groundLegs) {
      lines.push({
        key: 'ground',
        label: `Getting between your stops, ${groundLegs.legs.length} ${groundLegs.legs.length === 1 ? 'leg' : 'legs'}`,
        eur: groundLegs.total,
        sub: groundLegs.legs.map((l) => l.label).join(', '),
      });
    }
    if (!lines.length) return null;
    const total = lines.reduce((s, l) => s + l.eur, 0);
    return { lines, total, gs };
  }, [path, arriveMode, landedMode, flyIn, returnFareCache, returnFlyId, ownFlightCost, ownAirline,
    baggage, driveNotes, includedIds, nights, totalNights, destinations, groupSize, groundLegs]); // eslint-disable-line react-hooks/exhaustive-deps

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
          city: dest.city,
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
        id, city: dest.city, lat: dest.lat, lon: dest.lon,
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
  const topCityPicks = useMemo(() => {
    if (stepName !== 'Stay') return [];
    return mapCities
      .filter((c) => !c.selected && c.score != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ id }) => ({ id, dest: destinations[id] }))
      .filter((x) => x.dest);
  }, [stepName, mapCities, destinations]);

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

  // The interesting places around a picked flight: the sell for choosing it.
  // Ranked to surface a genuine MIX, the small cozy villages and hidden gems
  // close by, not only the big famous cities an hour or two away. Proximity and
  // character (gem/hidden-gem) count heavily so nearby charm isn't buried under
  // a distant metropolis's raw rating.
  const nearbyForFlight = useMemo(() => {
    if (!flyIn || !flyIn.dest || flyIn.dest.lat == null) return [];
    const a = flyIn.dest;
    return Object.entries(destinations)
      .filter(([id, d]) => id !== flyIn.id && d.lat != null && d.city !== a.city)
      .map(([id, d]) => ({ id, dest: d, km: Math.round(haversineKm(a.lat, a.lon, d.lat, d.lon)) }))
      .filter((x) => x.km != null && x.km <= NEARBY_KM)
      .map((x) => {
        const d = x.dest;
        const appeal = d.rating?.score ?? d.beauty?.score ?? 0;
        const proximity = 1 - x.km / NEARBY_KM; // 1 right next door, 0 at the edge
        const score = appeal
          + proximity * 3.5                    // strongly prefer what's actually close
          + (d.tier === 'gem' ? 1.2 : 0)       // small towns and villages, not just airports
          + (d.rating?.hidden_gem ? 1.1 : 0);  // pull the cozy hidden gems up the list
        return { ...x, score };
      })
      .sort((a2, b2) => b2.score - a2.score)
      .slice(0, 8);
  }, [flyIn, destinations]);
  const nearbyAdvice = useMemo(() => {
    if (!nearbyForFlight.length) return null;
    return carAdvice(nearbyForFlight.map((x) => x.dest), groupSize, countryInsights);
  }, [nearbyForFlight, groupSize, countryInsights]);

  // A fuller, data-driven "what's in this region" line for the arrival panel,   // the texture the one-line blurb can't carry: how much small-town character
  // and heritage sits within a short drive of where you land.
  const flightRegion = useMemo(() => {
    if (!flyIn?.dest || !nearbyForFlight.length) return null;
    const d = flyIn.dest;
    const gemN = nearbyForFlight.filter((x) => x.dest.tier === 'gem').length;
    const hiddenN = nearbyForFlight.filter((x) => x.dest.rating?.hidden_gem).length;
    const cityN = nearbyForFlight.length - gemN;
    const unescoN = nearbyForFlight.filter((x) => x.dest.beauty?.unesco).length
      + (d.beauty?.unesco ? 1 : 0);
    const pieces = [];
    if (gemN) {
      pieces.push(t(gemN === 1 ? 'wizard.smallTownOne' : 'wizard.smallTowns', { n: gemN })
        + (hiddenN ? t(hiddenN === 1 ? 'wizard.oneHiddenGem' : 'wizard.hiddenGems', { n: hiddenN }) : ''));
    }
    if (cityN) pieces.push(t(cityN === 1 ? 'wizard.largerCityOne' : 'wizard.largerCities', { n: cityN }));
    if (!pieces.length) return null;
    const list = pieces.length === 2 ? t('wizard.listPlus', { a: pieces[0], b: pieces[1] }) : pieces[0];
    let s = t('wizard.withinTwoHours', { city: d.city, list });
    if (unescoN) s += ` ${t(unescoN === 1 ? 'wizard.unescoOne' : 'wizard.unescoMany', { n: unescoN })}`;
    return s;
  }, [flyIn, nearbyForFlight, t]);

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

  const visibleRoutes = showAllRoutes ? routeOptions : routeOptions.slice(0, ROUTES_PREVIEW);

  // The traveller shouldn't sit on a stale fly-in that no longer exists after
  // going back to change dates/countries.
  useEffect(() => {
    if (flyInId && stepName === 'Getting there' && routeOptions.length && !routeOptions.some((o) => o.id === flyInId)) {
      setFlyInId('');
    }
  }, [routeOptions, flyInId, stepName]);

  // Default the return flight to the nearest home airport (top of the list) the
  // moment the step opens, and drop a pick that no longer fits after the stays
  // or dates changed, so the step is never blank and never stale.
  useEffect(() => {
    if (stepName !== 'Getting home') return;
    if (homeOptions.length && (!returnFlyId || !homeOptions.some((o) => o.id === returnFlyId))) {
      setReturnFlyId(homeOptions[0].id);
    } else if (!homeOptions.length && returnFlyId) {
      setReturnFlyId('');
    }
  }, [stepName, homeOptions, returnFlyId]);

  // Landing somewhere pins that country onto the trip, so the Stay step has a
  // region to talk about (more countries can still be added by search).
  useEffect(() => {
    if (path !== 'landed' || !arrivalDest) return;
    setCountries((prev) => (prev.has(arrivalDest.country) ? prev : new Set([...prev, arrivalDest.country])));
  }, [path, arrivalDest?.country]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- The "planning around" recap: every earlier answer, always visible ----
  const recapChips = [];
  if (path && step > 1) {
    if (selectedCountries.length) {
      recapChips.push({
        Icon: MapPinIcon,
        text: selectedCountries.map((c) => c.country).slice(0, 3).join(', ')
          + (selectedCountries.length > 3 ? ` +${selectedCountries.length - 3}` : ''),
      });
    }
    if (path === 'landed' && arrivalDest) {
      recapChips.push({ Icon: PlaneIcon, text: `${t('wizard.arrivingIn', { city: arrivalDest.city })}${startDate ? `, ${fmtDate(startDate, true)}` : ''}` });
      recapChips.push({ Icon: CalendarIcon, text: `${flexNights} ${t('wizard.nights')}` });
    } else if (dateMode === 'exact' && startDate && endDate) {
      recapChips.push({ Icon: CalendarIcon, text: `${fmtDate(startDate, true)} → ${fmtDate(endDate, true)}${flexPad ? `, ${t('wizard.plusMinusDays')}` : ''}` });
    } else if (dateMode === 'flex') {
      recapChips.push({ Icon: CalendarIcon, text: `${flexNights} ${t('wizard.nights')}, ${flexMonth ? months.find((m) => m.key === flexMonth)?.label || flexMonth : t('wizard.cheapestMonth')}` });
    }
    if (path === 'full' && stepName !== 'Getting there') {
      if (arriveMode === 'fly' && flyIn) recapChips.push({ Icon: PlaneIcon, text: t('wizard.flyIntoRecap', { city: flyIn.dest.city }) });
      if (arriveMode === 'car') recapChips.push({ Icon: CarIcon, text: t('wizard.goingByCar') });
      if (arriveMode === 'other') recapChips.push({ Icon: PlaneIcon, text: t('wizard.ownFlight') });
    }
    if (path === 'full' && stepName === 'Finish' && flyHomeDest) {
      recapChips.push({ Icon: PlaneIcon, text: t('wizard.flyHomeRecap', { city: flyHomeDest.city }) });
    }
    if ((stepName === 'Stay' || stepName === 'Finish') && stayStyle === 'single') {
      recapChips.push({ Icon: BedIcon, text: t('wizard.oneHomeBaseChip') });
    }
    if (includedIds.length && stepName === 'Finish') {
      recapChips.push({ Icon: RouteIcon, text: `${includedIds.length} ${includedIds.length === 1 ? t('wizard.stayOne') : t('wizard.stays')}, ${totalNights} ${t('wizard.nights')}` });
    }
  }

  // A new step starts at its own top. Without this the body keeps the previous
  // step's scroll offset, so a long screen can open halfway down its own
  // heading and read as broken.
  const bodyRef = useRef(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [step, path]);

  const focusedDest = focusedId ? destinations[focusedId] : null;

  // On phones the map fills the screen, so the briefing panel that a pin tap
  // populates sits below the fold, it reads as "nothing happened". Nudge the
  // panel into view on selection (narrow screens only; desktop shows both).
  const flightSideRef = useRef(null);
  const returnSideRef = useRef(null);
  const citySideRef = useRef(null);
  const scrollPanelIntoView = (el) => {
    if (!el || typeof window === 'undefined') return;
    if (!window.matchMedia?.('(max-width: 700px)').matches) return;
    // Wait for the panel's picked-state content to render before scrolling.
    requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };
  useEffect(() => {
    if (stepName === 'Getting there' && flyInId) scrollPanelIntoView(flightSideRef.current);
  }, [flyInId, stepName]);
  useEffect(() => {
    if (stepName === 'Stay' && focusedId) scrollPanelIntoView(citySideRef.current);
  }, [focusedId, stepName]);
  useEffect(() => {
    if (stepName === 'Getting home' && returnFlyId) scrollPanelIntoView(returnSideRef.current);
  }, [returnFlyId, stepName]);

  // Airline + fare inputs shown whenever the traveller flies with an airline
  // other than Ryanair (both the full-path and landed-path "other" branches).
  // The fare is the whole party's total return cost; leaving it blank simply
  // keeps the flight out of the estimated total (as before).
  const ownFlightFields = (
    <div className="guide-ownflight">
      <div className="guide-when-dates">
        <label className="trip-field">
          <span className="trip-field-label">{t('wizard.ownAirlineLabel')}</span>
          <input
            className="guide-search"
            type="text"
            value={ownAirline}
            onChange={(e) => setOwnAirline(e.target.value)}
            placeholder={t('wizard.ownAirlinePlaceholder')}
            aria-label={t('wizard.ownAirlineLabel')}
          />
        </label>
        <label className="trip-field">
          <span className="trip-field-label">{t('wizard.ownFlightCostLabel')}</span>
          <input
            className="guide-search"
            type="number"
            min="0"
            inputMode="numeric"
            value={ownFlightCost}
            onChange={(e) => setOwnFlightCost(e.target.value)}
            placeholder={t('wizard.ownFlightCostPlaceholder')}
            aria-label={t('wizard.ownFlightCostLabel')}
          />
        </label>
      </div>
      {path === 'full' && (
        <div className="guide-when-dates">
          <label className="trip-field">
            <span className="trip-field-label">{t('wizard.ownFlightOutLabel')}</span>
            <DateField value={ownOutDate} min={dateMin} max={dateMax} onChange={setOwnOutDate} placeholder={t('wizard.arrivalDate')} />
          </label>
          <label className="trip-field">
            <span className="trip-field-label">{t('wizard.ownFlightRetLabel')}</span>
            <DateField value={ownRetDate} min={ownOutDate || dateMin} max={dateMax} onChange={setOwnRetDate} placeholder={t('wizard.arrivalDate')} />
          </label>
        </div>
      )}
      <p className="guide-note"><InfoIcon size={11} /> {t('wizard.ownFlightCostHint')}</p>
    </div>
  );

  // "Where do you drive from?": shared by the full path's car branch and the
  // landed path's "I drive there" branch. Free-text with explicit search, the
  // same Nominatim flow the day planner's stay-address field uses.
  const carFromField = (
    <div className="guide-carfrom">
      <span className="trip-field-label">{t('wizard.carFromLabel')}</span>
      {carFrom ? (
        <div className="guide-city guide-arrival-picked on guide-carfrom-picked">
          <span className="guide-carfrom-icon"><CarIcon size={14} /></span>
          <div className="guide-city-info">
            <div className="guide-city-name">{carFrom.name}</div>
            <div className="guide-city-insight">{t('wizard.carFromPicked')}</div>
          </div>
          <button className="guide-back" onClick={() => { setCarFrom(null); setCarFromResults([]); }}>{t('wizard.change')}</button>
        </div>
      ) : (
        <>
          <div className="guide-carfrom-row">
            <input
              className="guide-search"
              type="search"
              value={carFromQuery}
              onChange={(e) => setCarFromQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') searchCarFrom(); }}
              placeholder={t('wizard.carFromPlaceholder')}
              aria-label={t('wizard.carFromLabel')}
            />
            <button
              className="guide-back guide-carfrom-search"
              onClick={searchCarFrom}
              disabled={carFromBusy || carFromQuery.trim().length < 3}
            >
              {carFromBusy ? t('wizard.searching') : t('wizard.search')}
            </button>
          </div>
          {carFromResults.length > 0 && (
            <div className="guide-city-list guide-carfrom-list">
              {carFromResults.map((r, i) => (
                <button
                  key={`${r.lat},${r.lon},${i}`}
                  className="guide-city guide-city-btn"
                  onClick={() => { setCarFrom({ name: r.shortLabel, lat: r.lat, lon: r.lon }); setCarFromResults([]); }}
                >
                  <MapPinIcon size={12} /> <span className="guide-carfrom-label">{r.label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  // ---- The finish summary: the trip in four facts and a photo ------------
  const summaryHero = anchorDest || destinations[includedIds[0]] || null;
  const summaryTitle = (path === 'landed' && arrivalDest)
    ? arrivalDest.country
    : (selectedCountries.map((c) => c.country).slice(0, 2).join(' & ') || t('wizard.planYourTrip'));
  const summaryDates = (() => {
    if (path === 'landed') {
      return startDate ? `${fmtDate(startDate, true)}, ${flexNights} ${t('wizard.nights')}` : `${flexNights} ${t('wizard.nights')}`;
    }
    if (dateMode === 'exact' && startDate && endDate) {
      return `${fmtDate(startDate, true)} → ${fmtDate(endDate, true)}${flexPad ? `, ${t('wizard.plusMinusDays')}` : ''}`;
    }
    const when = flexMonth ? (months.find((m) => m.key === flexMonth)?.label || flexMonth) : t('wizard.cheapestMonth');
    return `${flexNights} ${t('wizard.nights')}, ${when}`;
  })();
  const summaryTransport = (() => {
    const mode = path === 'landed' ? landedMode : arriveMode;
    if (mode === 'car') return t('wizard.goingByCar');
    if (mode === 'other') return ownAirline.trim() || t('wizard.ownFlight');
    if (flyIn) {
      return flyHomeDest && flyHomeDest.city !== flyIn.dest.city
        ? `${flyIn.dest.city} → ${flyHomeDest.city}`
        : flyIn.dest.city;
    }
    return t('wizard.fly');
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
    if (!path) return 'mid';
    if (stepName === 'Where' || stepName === 'Stay') return 'wide';
    if (stepName === 'Getting there') return arriveMode === 'fly' && routeOptions.length > 0 ? 'wide' : 'form';
    if (stepName === 'Getting home') return homeOptions.length > 0 ? 'wide' : 'form';
    if (stepName === 'Finish') return 'mid';
    return 'form';
  })();

  // ---------------------------------------------------------------- render --
  return (
    <div className="guide-overlay trip-wizard-overlay" onClick={handleCancel}>
      <div
        className={`guide-modal trip-wizard-modal wiz-${layout} ${stepDir === 'back' ? 'wiz-back' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + progress: same one-step-at-a-time header the day planner's
            wizard wears - current step name, "step X of N", thin segments. */}
        <div className="guide-head">
          <button className="guide-close" onClick={handleCancel} aria-label={t('wizard.close')}>×</button>
          <div className="guide-head-inner">
            {path ? (
              <>
                <div className="shape-head-title">
                  {steps[step - 1] ? t(STEP_LABEL_KEYS[steps[step - 1]]) : t('wizard.planYourTrip')}
                  {steps.length > 1 && <span className="shape-head-step">{t('wizard.stepOf', { x: step, n: steps.length })}</span>}
                </div>
                {/* Named steps, not anonymous hairlines: a bare segment bar
                    tells you how far along you are but never what is still
                    coming, which is exactly what makes a six-step form feel
                    open-ended. Done steps are tappable to go back. */}
                {steps.length > 1 && (
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

        {/* Running price estimate: its own band under the header, the full
            width of the wizard, so the growing total is a part of the screen
            rather than a chip in a corner. What the last answer cost lands as
            a delta chip and a bump on the figure; tapping the band opens the
            line-by-line breakdown in place. */}
        {runningEstimate && (
          <div className={`guide-estimate-band ${estimateOpen ? 'open' : ''}`}>
            <span className="guide-estimate-flash" key={`flash-${estBump}`} aria-hidden="true" />
            <button
              className="guide-estimate-main"
              onClick={() => setEstimateOpen((v) => !v)}
              aria-expanded={estimateOpen}
              title="What's in this estimate so far?"
            >
              <span className="guide-estimate-heading">
                Estimate so far
                <small>{runningEstimate.gs} {runningEstimate.gs === 1 ? 'traveller' : 'travellers'}</small>
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
              <span className="guide-estimate-toggle">{estimateOpen ? 'Hide' : 'Details'}</span>
            </button>
            {estimateOpen && (
              <div className="guide-estimate-detail" role="region" aria-label="Estimate so far">
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
                  <span className="guide-estimate-label">Total so far</span>
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
              {recapChips.map((c, i) => (
                <span className="guide-recap-chip" key={i}><c.Icon size={10} /> {c.text}</span>
              ))}
            </div>
          </div>
        )}

        <div className="guide-body" ref={bodyRef}>
         {/* Keyed on the step so each screen remounts and replays its entrance
             animation rather than silently swapping content in place. */}
         <div className="guide-canvas" key={`${path || 'root'}-${step}`}>
          {/* ---- Step 0: what are you looking for? ---- */}
          {!path && (
            <div className="guide-lede">
              <h2 className="guide-title">{t('wizard.pathTitle')}</h2>
              <p className="guide-sub">{t('wizard.pathSub')}</p>
              <div className="guide-path-list">
                {PATHS.map((p) => (
                  <button key={p.key} className="guide-path" onClick={() => { setPath(p.key); goStep(1); }}>
                    <span className="guide-path-icon"><p.Icon size={18} /></span>
                    <span className="guide-path-text">
                      <b>{t(p.labelKey)}</b>
                      <small>{t(p.subKey)}</small>
                    </span>
                    <span className="guide-arrow">{t('wizard.pathChoose')} →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ---- FULL PATH: Where ---- */}
          {stepName === 'Where' && (
            <>
              <h2 className="guide-title">{t('wizard.whereTitle')}</h2>
              <p className="guide-sub">{t('wizard.whereSub')}</p>

              {/* Picking list on the left, map on the right, both tall: the
                  map used to be a short wide strip where Europe's flags piled
                  on top of each other, with 43 country cards stacked below it
                  as a second, unrelated screen. Now the two are one control -
                  tap either side, the other follows. */}
              <div className="guide-split">
                <div className="guide-split-main">
                  {/* One number does not need a card of its own. People sits
                      on one line beside the "not sure?" escape hatch, and the
                      escape hatch is quiet: picking countries is the job of
                      this screen, so the shortcut must not outshout it. */}
                  <div className="guide-where-tools">
                    <div className="guide-inline-field">
                      <span className="trip-field-label"><PersonIcon size={11} /> {t('wizard.peopleLabel')}</span>
                      <div className="guide-people">
                        <button type="button" onClick={() => setGroupSize(Math.max(1, groupSize - 1))} disabled={groupSize <= 1} aria-label="Fewer people">-</button>
                        <span>{groupSize}</span>
                        <button type="button" onClick={() => setGroupSize(Math.min(20, groupSize + 1))} disabled={groupSize >= 20} aria-label="More people">+</button>
                      </div>
                    </div>
                    <button
                      className={`guide-design-btn guide-design-btn-quiet ${countryQuizOpen ? 'on' : ''}`}
                      onClick={() => setCountryQuizOpen((v) => !v)}
                      aria-expanded={countryQuizOpen}
                    >
                      <span className="guide-design-spark"><SparkIcon size={13} /></span>
                      <span className="guide-design-text">
                        {t('wizard.pickCountriesBtn')}
                        <small>{t('wizard.pickCountriesSub')}</small>
                      </span>
                    </button>
                  </div>

                  {countryQuizOpen && (
                    <div className="guide-design-quiz">
                      <span className="trip-field-label">{t('wizard.vibeQuestion')}</span>
                      <div className="guide-interest-grid guide-vibe-grid">
                        {VIBES.map((v) => (
                          <button
                            key={v.key}
                            className={`guide-interest ${vibes.has(v.key) ? 'on' : ''}`}
                            onClick={() => toggleVibe(v.key)}
                            aria-pressed={vibes.has(v.key)}
                          >
                            {vibes.has(v.key) && <span className="guide-interest-check"><CheckIcon size={11} /></span>}
                            <span className="guide-interest-icon"><v.Icon size={18} /></span>
                            <span className="guide-interest-label">{t(v.labelKey)}</span>
                          </button>
                        ))}
                      </div>
                      {countrySuggestions.length > 0 && (
                        <>
                          <span className="trip-field-label">{t('wizard.cartaRecommends')}</span>
                          <div className="guide-country-suggest-list">
                            {countrySuggestions.map((c) => (
                              <button
                                key={c.country}
                                className={`guide-country-suggest ${countries.has(c.country) ? 'on' : ''}`}
                                onClick={() => toggleCountry(c.country)}
                              >
                                <Flag iso2={c.iso2} className="guide-flag-img-sm" />
                                <span className="guide-country-suggest-text">
                                  <b>{c.country}</b>
                                  <small>{c.reason}</small>
                                </span>
                                {countries.has(c.country) && <CheckIcon size={13} />}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {vibes.size === 0 && (
                        <p className="guide-empty">{t('wizard.pickVibeHint')}</p>
                      )}
                      {vibes.size > 0 && countrySuggestions.length === 0 && (
                        <p className="guide-empty">{t('wizard.noVibeMatches')}</p>
                      )}
                    </div>
                  )}

                  <div className="guide-picklist-head">
                    <input
                      className="guide-search"
                      type="search"
                      value={countryQuery}
                      onChange={(e) => setCountryQuery(e.target.value)}
                      placeholder={t('wizard.countrySearchPlaceholder')}
                      aria-label={t('wizard.countrySearchPlaceholder')}
                    />
                    <span className="guide-picklist-count">
                      {countries.size > 0
                        ? t('wizard.countriesPicked', { n: countries.size })
                        : t('wizard.countriesNonePicked')}
                    </span>
                    {countries.size > 0 && (
                      <button className="guide-stay-filter-clear" onClick={() => setCountries(new Set())}>
                        {t('wizard.stayFilterClear')}
                      </button>
                    )}
                  </div>

                  <div className="guide-country-grid">
                    {shownCountries.map((c) => (
                      <button
                        key={c.country}
                        className={`guide-country ${countries.has(c.country) ? 'on' : ''}`}
                        onClick={() => toggleCountry(c.country)}
                        aria-pressed={countries.has(c.country)}
                      >
                        {countries.has(c.country) && <span className="guide-country-check"><CheckIcon size={11} /></span>}
                        <Flag iso2={c.iso2} className="guide-flag-img" />
                        <span className="guide-country-name">{c.country}</span>
                        <span className="guide-country-n">{c.cities.length} {t('wizard.cities')}</span>
                      </button>
                    ))}
                    {shownCountries.length === 0 && (
                      <p className="guide-empty">{t('wizard.noCountryMatches', { q: countryQuery })}</p>
                    )}
                  </div>
                </div>

                <div className="guide-split-side">
                  <CountryPickerMap countries={allCountries} selected={countries} onToggle={toggleCountry} />
                </div>
              </div>
            </>
          )}

          {/* ---- FULL PATH: When ---- */}
          {stepName === 'When' && (
            <>
              <h2 className="guide-title">{t('wizard.whenTitle')}</h2>
              <p className="guide-sub">{t('wizard.whenSub')}</p>

              {/* Every date control sits on one card: floating single-line
                  inputs across a wide screen read as unrelated fragments, a
                  card reads as one question with its parts. */}
              <div className="guide-card">
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
                            onClick={() => { setStartDate(''); setEndDate(''); }}
                          >{t('wizard.stayFilterClear')}</button>
                        )}
                      </div>
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

          {/* ---- LANDED PATH: Arrival ---- */}
          {stepName === 'Arrival' && (
            <>
              <h2 className="guide-title">{t('wizard.arrivalTitle')}</h2>
              <p className="guide-sub">
                {t('wizard.arrivalSub')}
              </p>

              <div className="guide-mode-cards">
                <button
                  className={`guide-mode-card ${landedMode === 'other' ? 'on' : ''}`}
                  onClick={() => setLandedMode('other')}
                  aria-pressed={landedMode === 'other'}
                >
                  <span className="guide-mode-icon"><PlaneIcon size={22} /></span>
                  <span className="guide-mode-text">
                    <b>{t('wizard.iFlyIn')}</b>
                    <small>{t('wizard.iFlyInSub')}</small>
                  </span>
                  {landedMode === 'other' && <span className="guide-mode-check"><CheckIcon size={12} /></span>}
                </button>
                <button
                  className={`guide-mode-card ${landedMode === 'car' ? 'on' : ''}`}
                  onClick={() => setLandedMode('car')}
                  aria-pressed={landedMode === 'car'}
                >
                  <span className="guide-mode-icon"><CarIcon size={22} /></span>
                  <span className="guide-mode-text">
                    <b>{t('wizard.iDriveThere')}</b>
                    <small>{t('wizard.iDriveThereSub')}</small>
                  </span>
                  {landedMode === 'car' && <span className="guide-mode-check"><CheckIcon size={12} /></span>}
                </button>
              </div>

              <span className="trip-field-label">{landedMode === 'car' ? t('wizard.firstPlace') : t('wizard.whereLand')}</span>
              {arrivalDest ? (
                <div className="guide-city guide-arrival-picked on">
                  <CityThumb dest={arrivalDest} className="guide-city-thumb" />
                  <div className="guide-city-info">
                    <div className="guide-city-name">
                      {arrivalDest.city}
                      <Flag iso2={arrivalDest.iso2} className="guide-flag-img-sm" />
                      {arrivalDest.rating?.score != null && <ScoreChip rating={arrivalDest.rating} size="xs" />}
                    </div>
                    <div className="guide-city-insight">{cityInsight(arrivalDest)}</div>
                  </div>
                  <button className="guide-back" onClick={() => { setArrivalId(''); setArrivalQuery(''); }}>{t('wizard.change')}</button>
                </div>
              ) : (
                <>
                  <input
                    className="guide-search"
                    type="search"
                    value={arrivalQuery}
                    onChange={(e) => setArrivalQuery(e.target.value)}
                    placeholder={landedMode === 'car' ? t('wizard.searchFirstStop') : t('wizard.searchAirportCity')}
                    aria-label={t('wizard.searchArrivalAria')}
                  />
                  {arrivalMatches.length > 0 && (
                    <div className="guide-city-list">
                      {arrivalMatches.map(({ id, dest }) => (
                        <button key={id} className="guide-city guide-city-btn" onClick={() => setArrivalId(id)}>
                          <CityThumb dest={dest} className="guide-city-thumb" />
                          <div className="guide-city-info">
                            <div className="guide-city-name">
                              {dest.city}
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

              <div className="guide-card">
                <div className="guide-when-dates guide-arrival-when">
                  <label className="trip-field">
                    <span className="trip-field-label">{landedMode === 'car' ? t('wizard.dayYouArrive') : t('wizard.dayYouLand')}</span>
                    <DateField value={startDate} min={dateMin} max={dateMax} onChange={setStartDate} placeholder={t('wizard.arrivalDate')} />
                  </label>
                  <label className="trip-field">
                    <span className="trip-field-label">{t('wizard.howManyNights')}</span>
                    <div className="guide-people">
                      <button type="button" onClick={() => setFlexNights(Math.max(1, flexNights - 1))} disabled={flexNights <= 1} aria-label={t('wizard.fewerNights')}>-</button>
                      <span>{flexNights}</span>
                      <button type="button" onClick={() => setFlexNights(Math.min(30, flexNights + 1))} disabled={flexNights >= 30} aria-label={t('wizard.moreNights')}>+</button>
                    </div>
                  </label>
                  <label className="trip-field">
                    <span className="trip-field-label"><PersonIcon size={11} /> {t('wizard.peopleLabel')}</span>
                    <div className="guide-people">
                      <button type="button" onClick={() => setGroupSize(Math.max(1, groupSize - 1))} disabled={groupSize <= 1} aria-label="Fewer people">-</button>
                      <span>{groupSize}</span>
                      <button type="button" onClick={() => setGroupSize(Math.min(20, groupSize + 1))} disabled={groupSize >= 20} aria-label="More people">+</button>
                    </div>
                  </label>
                </div>
              </div>
              {landedMode === 'other' && (
                <>
                  <p className="guide-sub guide-ownflight-lead">
                    <PlaneIcon size={12} /> {t('wizard.ownFlightAskCost')}
                  </p>
                  {ownFlightFields}
                </>
              )}
              {landedMode === 'car' && carFromField}
            </>
          )}

          {/* ---- FULL PATH: Getting there ---- */}
          {stepName === 'Getting there' && (
            <>
              <h2 className="guide-title">{t('wizard.gettingTitle')}</h2>
              <p className="guide-sub">
                {t('wizard.gettingSub', { city: originCity })}
              </p>

              {/* Two ways to get there, so two cards: a two-way segmented
                  control stretched across the screen said nothing about what
                  either option means. */}
              <div className="guide-mode-cards">
                <button
                  className={`guide-mode-card ${arriveMode === 'fly' ? 'on' : ''}`}
                  onClick={() => pickArriveMode('fly')}
                  aria-pressed={arriveMode === 'fly'}
                >
                  <span className="guide-mode-icon"><PlaneIcon size={22} /></span>
                  <span className="guide-mode-text">
                    <b>{t('wizard.fly')}</b>
                    <small>{t('wizard.flySub')}</small>
                  </span>
                  {arriveMode === 'fly' && <span className="guide-mode-check"><CheckIcon size={12} /></span>}
                </button>
                <button
                  className={`guide-mode-card ${arriveMode === 'car' ? 'on' : ''}`}
                  onClick={() => pickArriveMode('car')}
                  aria-pressed={arriveMode === 'car'}
                >
                  <span className="guide-mode-icon"><CarIcon size={22} /></span>
                  <span className="guide-mode-text">
                    <b>{t('wizard.car')}</b>
                    <small>{t('wizard.carSub')}</small>
                  </span>
                  {arriveMode === 'car' && <span className="guide-mode-check"><CheckIcon size={12} /></span>}
                </button>
              </div>

              {arriveMode === 'fly' && onChangeOrigin && data?.meta?.origins && Object.keys(data.meta.origins).length > 0 && (
                <div className="guide-card guide-origin-card">
                  <div className="guide-origin-row">
                    <span className="guide-origin-label"><PlaneIcon size={11} /> {t('wizard.flyingFrom')}</span>
                    <OriginPicker data={data} origin={origin ?? originCode} onChangeOrigin={onChangeOrigin} />
                    {/* What changing this airport actually buys you, in the
                        space the picker used to leave blank. */}
                    {routeOptions.length > 0 && (
                      <span className="guide-origin-facts">
                        <span className="guide-origin-fact">
                          <b>{routeOptions.length}</b> {routeOptions.length === 1 ? t('wizard.routeOne') : t('wizard.routeMany')}
                        </span>
                        <span className="guide-origin-fact">
                          {t('wizard.fromFare')} <b>{eur(Math.min(...routeOptions.map((o) => (o.has_exact ? o.exact_eur : o.cheapest.eur))))}</b>
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {arriveMode === 'other' ? (
                <div className="guide-noflight">
                  <p className="guide-sub">
                    <CheckIcon size={12} /> {t('wizard.ownFlightNote')}
                  </p>
                  {ownFlightFields}
                  <button className="guide-back guide-noflight-back" onClick={() => setArriveMode('fly')}>
                    ← {t('wizard.lookAtRyanair')}
                  </button>
                </div>
              ) : arriveMode === 'car' ? (
                // Asking where they drive from is the whole question here; the
                // old "you can reach these countries" distance list said
                // nothing they needed at this point.
                carFromField
              ) : routeOptions.length === 0 ? (
                <div className="guide-noflight">
                  <p className="guide-empty">
                    <AlertIcon size={12} /> {t('wizard.noFaresFrom', { city: originCity })}
                    {dateMode === 'exact' && startDate ? t('wizard.onDate', { date: fmtDate(startDate) }) : t('wizard.forThisPeriod')}.
                  </p>
                  <p className="guide-sub">
                    {t('wizard.noFaresAdvice')}
                  </p>
                  <button className="guide-back guide-noflight-back" onClick={() => goStep(step - 2)}>← {t('wizard.changeMyDates')}</button>
                </div>
              ) : (
                <>
                  <div className="guide-datemode guide-stay-view">
                    <button className={flightView === 'map' ? 'on' : ''} onClick={() => setFlightView('map')}>{t('wizard.map')}</button>
                    <button className={flightView === 'list' ? 'on' : ''} onClick={() => setFlightView('list')}>{t('wizard.list')}</button>
                  </div>

                  {flightView === 'map' ? (
                    <div className="guide-flight-wrap">
                      <FlightPickerMap
                        options={routeOptions.map((o) => ({
                          id: o.id,
                          city: o.dest.city,
                          lat: o.dest.lat,
                          lon: o.dest.lon,
                          eurLabel: eur(o.has_exact ? o.exact_eur : o.cheapest.eur),
                          selected: o.id === flyInId,
                        }))}
                        origin={originRec && originRec.lat != null ? { lat: originRec.lat, lon: originRec.lon, city: originRec.city } : null}
                        onPick={(id) => setFlyInId(flyInId === id ? '' : id)}
                      />
                      <div className="guide-flight-side" ref={flightSideRef}>
                        {!flyIn ? (
                          // Same idea as the stay panel: an untouched briefing
                          // column earns its space by offering the cheapest
                          // fares as one-tap shortcuts into the map pick.
                          <div className="guide-side-idle">
                            <div className="guide-side-idle-head">
                              <PlaneIcon size={16} />
                              <p>{t('wizard.tapPlaneHint')}</p>
                            </div>
                            <div className="guide-stay-group-title">{t('wizard.cheapestRightNow')}</div>
                            <div className="guide-side-idle-list">
                              {routeOptions.slice(0, 4).map((o) => (
                                <button key={o.id} className="guide-side-idle-row" onClick={() => setFlyInId(o.id)}>
                                  <CityThumb dest={o.dest} className="guide-nearby-thumb" />
                                  <span className="guide-side-idle-text">
                                    <b>{o.dest.city}</b>
                                    <small>{t('wizard.flyIntoList', { anchor: o.anchor })}</small>
                                  </span>
                                  <b className="guide-side-idle-fare">{eur(o.has_exact ? o.exact_eur : o.cheapest.eur)}</b>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="guide-flight-side-head">
                              <CityThumb dest={flyIn.dest} className="guide-city-thumb" />
                              <div className="guide-flight-side-title">
                                <b>{flyIn.dest.city} <Flag iso2={flyIn.dest.iso2} className="guide-flag-img-sm" /></b>
                                <small>
                                  <PlaneIcon size={9} /> {t('wizard.intoAnchor', { anchor: flyIn.anchor })}
                                  {(() => { const m = flightMeta(flyIn, data?.meta?.origins); return m ? t('wizard.flightDur', { dur: fmtFlightDuration(m.min) }) : ''; })()}
                                  {t('wizard.farePP', { fare: eur(flyIn.has_exact ? flyIn.exact_eur : flyIn.cheapest.eur) })}
                                </small>
                                {dateMode === 'flex' && flyIn.cheapest && (
                                  <small className="guide-flight-side-date">
                                    <CalendarIcon size={9} /> {t('wizard.flexDepartDate', { date: fmtDate(flyIn.cheapest.date, true) })}
                                  </small>
                                )}
                                {!flyIn.has_exact && dateMode === 'exact' && flyIn.cheapest && (
                                  <small className="guide-route-warn">
                                    <AlertIcon size={9} /> {t('wizard.noFareForDate', { date: fmtDate(startDate, true), date2: fmtDate(flyIn.cheapest.date, true) })}
                                  </small>
                                )}
                              </div>
                            </div>
                            {flyIn.dest.rating?.score != null && (
                              <div className="guide-flight-side-rating">
                                <ScoreChip rating={flyIn.dest.rating} size="xs" />
                                {flyIn.dest.rating.hidden_gem && <HiddenGemTag />}
                              </div>
                            )}
                            <p className="guide-flight-side-desc">{cityInsight(flyIn.dest)}</p>
                            {flightRegion && (
                              <p className="guide-flight-side-region"><MapPinIcon size={11} /> {flightRegion}</p>
                            )}
                            {nearbyAdvice && nearbyAdvice.verdict !== 'no' && (
                              <p className="guide-flight-side-car">
                                <CarIcon size={11} /> {nearbyAdvice.verdict === 'yes'
                                  ? t('wizard.carRecommendedArea')
                                  : t('wizard.carHelpsArea')}
                              </p>
                            )}
                            {nearbyForFlight.length > 0 && (
                              <>
                                <div className="guide-stay-group-title">{t('wizard.interestingAround')}</div>
                                <div className="guide-nearby-list">
                                  {nearbyForFlight.map(({ id, dest, km }) => (
                                    <div className="guide-nearby" key={id}>
                                      <CityThumb dest={dest} className="guide-nearby-thumb" />
                                      <div className="guide-nearby-info">
                                        <div className="guide-nearby-name">
                                          {dest.city}
                                          {dest.rating?.score != null && <ScoreChip rating={dest.rating} size="xs" />}
                                          {dest.rating?.hidden_gem && <HiddenGemTag />}
                                        </div>
                                        <div className="guide-nearby-sub">{t('wizard.kmFromPlace', { km, place: flyIn.anchor })} {cityInsight(dest)}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="guide-route-list">
                        {visibleRoutes.map((o) => {
                          const meta = flightMeta(o, data?.meta?.origins);
                          const badge = badges[o.id] ? BADGE_LABELS[badges[o.id]] : null;
                          return (
                            <button
                              key={o.id}
                              className={`guide-route ${flyInId === o.id ? 'on' : ''}`}
                              onClick={() => setFlyInId(flyInId === o.id ? '' : o.id)}
                              aria-pressed={flyInId === o.id}
                            >
                              <CityThumb dest={o.dest} className="guide-city-thumb" />
                              <span className="guide-route-main">
                                <span className="guide-route-city">
                                  {o.dest.city}
                                  <Flag iso2={o.dest.iso2} className="guide-flag-img-sm" />
                                  {badge && <span className={`guide-route-badge ${badge.cls}`}>{badge.cls === 'pick' && <SparkIcon size={9} />}{t(badge.labelKey)}</span>}
                                </span>
                                <span className="guide-route-sub">
                                  <PlaneIcon size={10} /> {t('wizard.flyIntoList', { anchor: o.anchor })}
                                  {meta ? t('wizard.flightDur', { dur: fmtFlightDuration(meta.min) }) : ''}
                                </span>
                                {!o.has_exact && dateMode === 'exact' && o.cheapest && (
                                  <span className="guide-route-warn">
                                    <AlertIcon size={10} /> {t('wizard.noFareStored', { date: fmtDate(startDate, true), date2: fmtDate(o.cheapest.date, true) })}
                                  </span>
                                )}
                              </span>
                              <span className="guide-route-fare">
                                <b>{eur(o.has_exact ? o.exact_eur : o.cheapest.eur)}</b>
                                <small>
                                  {o.has_exact ? t('wizard.perPerson') : t('wizard.datePerPerson', { date: fmtDate(o.cheapest.date, true) })}
                                </small>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {!showAllRoutes && routeOptions.length > ROUTES_PREVIEW && (
                        <button className="guide-show-more" onClick={() => setShowAllRoutes(true)}>
                          {t('wizard.showAllRoutesN', { n: routeOptions.length })}
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ---- Stay (full + landed) ---- */}
          {stepName === 'Stay' && (
            <>
              <h2 className="guide-title">{t('wizard.stayTitle')}</h2>
              <p className="guide-sub">
                {anchorDest
                  ? t(path === 'landed' && landedMode === 'car' ? 'wizard.stayIntroArrive' : 'wizard.stayIntroLand', { city: anchorDest.city })
                  : t('wizard.stayIntroFree')}
              </p>

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
                          >{dest.city}</button>
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
                                      <b>{dest.city}</b>
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
                            <b>{focusedDest.city}</b>
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

          {/* ---- FULL PATH: Getting home (return flight, after the stays) ---- */}
          {stepName === 'Getting home' && (
            <>
              <h2 className="guide-title">{t('wizard.gettingHomeTitle')}</h2>
              <p className="guide-sub">
                {lastStopDest
                  ? t('wizard.gettingHomeSub', { last: lastStopDest.city, city: originCity })
                  : t('wizard.gettingHomeSubFree', { city: originCity })}
              </p>

              {homeOptions.length === 0 ? (
                <div className="guide-noflight">
                  <p className="guide-empty">
                    <AlertIcon size={12} /> {t('wizard.noReturnFrom', { city: originCity })}
                  </p>
                  <p className="guide-sub">{t('wizard.noReturnAdvice')}</p>
                </div>
              ) : (
                <>
                  <div className="guide-datemode guide-stay-view">
                    <button className={returnFlightView === 'map' ? 'on' : ''} onClick={() => setReturnFlightView('map')}>{t('wizard.map')}</button>
                    <button className={returnFlightView === 'list' ? 'on' : ''} onClick={() => setReturnFlightView('list')}>{t('wizard.list')}</button>
                  </div>

                  {returnFlightView === 'map' ? (
                    <div className="guide-flight-wrap guide-flight-wrap-home">
                      <FlightPickerMap
                        options={homeOptions.map((o) => ({
                          id: o.id,
                          city: o.dest.city,
                          lat: o.dest.lat,
                          lon: o.dest.lon,
                          eurLabel: eur(o.has_exact ? o.ret_exact_eur : o.ret_cheapest.eur),
                          selected: o.id === returnFlyId,
                        }))}
                        origin={lastStopDest && lastStopDest.lat != null ? { lat: lastStopDest.lat, lon: lastStopDest.lon, city: lastStopDest.city } : null}
                        onPick={(id) => setReturnFlyId(id)}
                      />
                      <div className="guide-flight-side" ref={returnSideRef}>
                        {!flyHome ? (
                          <div className="guide-flight-side-empty">
                            <PlaneIcon size={16} />
                            <p>{t('wizard.tapHomeHint')}</p>
                          </div>
                        ) : (
                          <>
                            <div className="guide-flight-side-head">
                              <CityThumb dest={flyHome.dest} className="guide-city-thumb" />
                              <div className="guide-flight-side-title">
                                <b>{flyHome.dest.city} <Flag iso2={flyHome.dest.iso2} className="guide-flag-img-sm" /></b>
                                {/* One scannable line: route, fare, distance.
                                    It used to run "from SJJ home to Charleroi"
                                    across two stacked fragments. */}
                                <small>
                                  <PlaneIcon size={9} /> {t('wizard.homeFromTo', { anchor: flyHome.anchor, city: originCity })}
                                  {t('wizard.farePP', { fare: eur(flyHome.has_exact ? flyHome.ret_exact_eur : flyHome.ret_cheapest.eur) })}
                                  {flyHome.km != null && lastStopDest
                                    ? `, ${t('wizard.kmFromLastPlain', { km: flyHome.km, last: lastStopDest.city })}`
                                    : ''}
                                </small>
                                {flyHome.is_out_anchor && (
                                  <small className="guide-flight-side-breakdown">{t('wizard.roundTripNote')}</small>
                                )}
                                {dateMode === 'flex' && flyHome.ret_cheapest && (
                                  <small className="guide-flight-side-date">
                                    <CalendarIcon size={9} /> {t('wizard.flexReturnDate', { date: fmtDate(flyHome.ret_cheapest.date, true) })}
                                  </small>
                                )}
                                {!flyHome.has_exact && dateMode === 'exact' && flyHome.ret_cheapest && (
                                  <small className="guide-route-warn">
                                    <AlertIcon size={9} /> {t('wizard.noFareForDate', { date: fmtDate(returnDate, true), date2: fmtDate(flyHome.ret_cheapest.date, true) })}
                                  </small>
                                )}
                              </div>
                            </div>
                            {flyHome.dest.rating?.score != null && (
                              <div className="guide-flight-side-rating">
                                <ScoreChip rating={flyHome.dest.rating} size="xs" />
                                {flyHome.dest.rating.hidden_gem && <HiddenGemTag />}
                              </div>
                            )}
                            <p className="guide-flight-side-desc">{cityInsight(flyHome.dest)}</p>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="guide-route-list">
                      {homeOptions.map((o) => (
                        <button
                          key={o.id}
                          className={`guide-route ${returnFlyId === o.id ? 'on' : ''}`}
                          onClick={() => setReturnFlyId(o.id)}
                          aria-pressed={returnFlyId === o.id}
                        >
                          <CityThumb dest={o.dest} className="guide-city-thumb" />
                          <span className="guide-route-main">
                            <span className="guide-route-city">
                              {o.dest.city}
                              <Flag iso2={o.dest.iso2} className="guide-flag-img-sm" />
                              {o.is_out_anchor && <span className="guide-route-badge pick">{t('wizard.roundTripBadge')}</span>}
                            </span>
                            <span className="guide-route-sub">
                              <PlaneIcon size={10} /> {t('wizard.homeFromList', { anchor: o.anchor })}
                              {o.km != null ? t('wizard.kmAway', { km: o.km }) : ''}
                            </span>
                            {!o.has_exact && dateMode === 'exact' && o.ret_cheapest && (
                              <span className="guide-route-warn">
                                <AlertIcon size={10} /> {t('wizard.noFareStored', { date: fmtDate(returnDate, true), date2: fmtDate(o.ret_cheapest.date, true) })}
                              </span>
                            )}
                          </span>
                          <span className="guide-route-fare">
                            <b>{eur(o.has_exact ? o.ret_exact_eur : o.ret_cheapest.eur)}</b>
                            <small>
                              {o.has_exact ? t('wizard.perPerson') : t('wizard.datePerPerson', { date: fmtDate(o.ret_cheapest.date, true) })}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ---- Finish (full + landed) ---- */}
          {stepName === 'Finish' && (
            <>
              <h2 className="guide-title">Last touches</h2>
              <p className="guide-sub">Carta picks the best way between your stops; every leg stays adjustable in the planner.</p>

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

              {/* Ryanair baggage - the seat fares are seat-only, so ask what each
                  traveller carries and add it to the flight cost. Only relevant
                  when Carta is booking the flights. */}
              {((path === 'full' && arriveMode === 'fly') || (path === 'landed' && landedMode !== 'car')) && (
                <>
                  <h3 className="guide-subtitle"><LuggageIcon size={13} /> Baggage per person</h3>
                  <div className="guide-transport-grid">
                    {BAGGAGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        className={`guide-transport ${baggage === opt.key ? 'on' : ''}`}
                        onClick={() => setBaggage(opt.key)}
                        aria-pressed={baggage === opt.key}
                        title={opt.hint}
                      >
                        <span className="guide-transport-icon"><LuggageIcon size={18} /></span>
                        <span className="guide-transport-label">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </>
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
                    <div className="guide-summary-fact">
                      <span className="guide-summary-fact-label"><PersonIcon size={10} /> {t('wizard.summaryTravellers')}</span>
                      <b>{groupSize}</b>
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
                        <b>{destinations[id].city}</b>
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

              <button className="guide-next guide-summary-cta" onClick={finish} disabled={includedIds.length === 0}>
                <SparkIcon size={14} /> Let Carta arrange it
              </button>
            </>
          )}

          {/* ---- BOOKED PATH: type the trip in ---- */}
          {stepName === 'Your trip' && (
            <>
              <h2 className="guide-title">Fill in your trip</h2>
              <p className="guide-sub">
                Flights and stays are booked - just tell Carta where you're sleeping and from when,
                and it opens the overview with day planning, costs on the ground and the route map.
              </p>

              <div className="guide-card">
                <div className="guide-when-dates guide-arrival-when">
                  <label className="trip-field">
                    <span className="trip-field-label">First night</span>
                    <DateField value={bookedStart} min={dateMin} max={dateMax} onChange={setBookedStart} placeholder="Start date" />
                  </label>
                  <label className="trip-field">
                    <span className="trip-field-label"><PersonIcon size={11} /> {t('wizard.peopleLabel')}</span>
                    <div className="guide-people">
                      <button type="button" onClick={() => setGroupSize(Math.max(1, groupSize - 1))} disabled={groupSize <= 1} aria-label="Fewer people">-</button>
                      <span>{groupSize}</span>
                      <button type="button" onClick={() => setGroupSize(Math.min(20, groupSize + 1))} disabled={groupSize >= 20} aria-label="More people">+</button>
                    </div>
                  </label>
                </div>
              </div>

              {bookedStops.length > 0 && (
                <div className="guide-city-list guide-booked-list">
                  {bookedStops.map((s, i) => {
                    const dest = destinations[s.destinationId];
                    if (!dest) return null;
                    return (
                      <div className="guide-city on" key={`${s.destinationId}-${i}`}>
                        <CityThumb dest={dest} className="guide-city-thumb" />
                        <div className="guide-city-info">
                          <div className="guide-city-name">{dest.city} <Flag iso2={dest.iso2} className="guide-flag-img-sm" /></div>
                          <div className="guide-city-insight">{dest.country}</div>
                        </div>
                        <div className="guide-nights">
                          <button onClick={() => setBookedStops((prev) => prev.map((x, j) => (j === i ? { ...x, nights: Math.max(1, x.nights - 1) } : x)))} aria-label="Fewer nights">-</button>
                          <span className="guide-nights-val"><b>{s.nights}</b> {s.nights === 1 ? 'night' : 'nights'}</span>
                          <button onClick={() => setBookedStops((prev) => prev.map((x, j) => (j === i ? { ...x, nights: Math.min(30, x.nights + 1) } : x)))} aria-label="More nights">+</button>
                        </div>
                        <button
                          className="trip-stop-remove"
                          onClick={() => setBookedStops((prev) => prev.filter((_, j) => j !== i))}
                          aria-label={`Remove ${dest.city}`}
                          title="Remove"
                        >×</button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="trip-add-row">
                <Dropdown
                  className="trip-add-country"
                  value={bookedCountry}
                  onChange={(c) => { setBookedCountry(c); setBookedCity(''); }}
                  options={allCountries.map((c) => ({ value: c.country, label: c.country }))}
                  placeholder="Country"
                  searchPlaceholder="Search countries"
                />
                <Dropdown
                  className="trip-add-city"
                  value={bookedCity}
                  onChange={setBookedCity}
                  options={bookedCountry
                    ? Object.entries(destinations)
                      .filter(([, d]) => d.country === bookedCountry)
                      .map(([id, d]) => ({ value: id, label: d.city }))
                      .sort((a, b) => a.label.localeCompare(b.label))
                    : []}
                  placeholder={bookedCountry ? 'City' : 'Pick a country first'}
                  searchPlaceholder="Search cities"
                  disabled={!bookedCountry}
                />
                <button
                  className="trip-add-btn"
                  onClick={() => {
                    if (!bookedCity) return;
                    setBookedStops((prev) => [...prev, { destinationId: bookedCity, nights: 2 }]);
                    setBookedCity('');
                  }}
                  disabled={!bookedCity}
                >Add</button>
              </div>
            </>
          )}
         </div>
        </div>

        {/* Footer */}
        <div className="guide-foot">
          <div className="guide-foot-inner">
            <div className="guide-foot-summary">
              {hasProgress && (
                <button className="guide-startover" onClick={startOver} title="Clear everything and begin again">↺ Start over</button>
              )}
              {/* The gate on this step, stated where the decision is made. */}
              {stepName === 'Stay' && windowNights > 0 ? (
                <span className={`guide-nights-budget ${totalNights > windowNights ? 'over' : ''} ${totalNights === windowNights ? 'done' : ''}`}>
                  {totalNights === windowNights && <CheckIcon size={11} />}
                  <b>{totalNights}</b> of <b>{windowNights}</b> nights planned
                  {totalNights > windowNights && `, ${t('wizard.overWindow')}`}
                </span>
              ) : (
                includedIds.length > 0 && `${includedIds.length} ${includedIds.length === 1 ? 'city' : 'cities'}, ${totalNights} nights`
              )}
            </div>
            <div className="guide-foot-actions">
              {path && (step > 1
                ? <button className="guide-back" onClick={() => goStep(step - 1)}>Back</button>
                : <button className="guide-back" onClick={() => { setPath(null); goStep(1); }}>Back</button>
              )}
              {!path ? null : stepName === 'Your trip' ? (
                <button className="guide-next" onClick={finishBooked} disabled={!bookedStart || bookedStops.length === 0}>
                  Show my trip overview →
                </button>
              ) : stepName === 'Getting there' && arriveMode === 'fly' && routeOptions.length === 0 ? (
                // No Ryanair route: the way forward is booking your own flight.
                // Switch the step to the "own flight" view in place (don't skip
                // ahead) so the traveller can name their airline and fare first.
                <button
                  className="guide-next"
                  onClick={() => setArriveMode('other')}
                >
                  I fly with another airline →
                </button>
              ) : step < steps.length ? (
                <button className="guide-next" onClick={() => goStep(step + 1)} disabled={!canNext}>Next</button>
              ) : (
                // The Finish step's real call to action sits under the summary
                // card, where the reading flow ends. This keeps the sticky nav
                // slot the traveller has used on every step reachable without
                // scrolling, so a long summary can't hide the way forward.
                <button className="guide-next" onClick={finish} disabled={includedIds.length === 0}>
                  <SparkIcon size={13} /> Let Carta arrange it
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
