import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DateField } from '../components/DateField.jsx';
import { Dropdown } from '../components/Dropdown.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { CountryPickerMap } from '../map/CountryPickerMap.jsx';
import { CityPickerMap } from '../map/CityPickerMap.jsx';
import { FlightPickerMap } from '../map/FlightPickerMap.jsx';
import {
  countriesFromData, cityInsight, cityImage, flagUrl, isoToFlag,
  interestFitScore, cityTier, cityCompanions, designStays,
} from '../lib/tripGuide.js';
import { knownForFacts } from '../lib/knownFor.js';
import { gemScore, BAGGAGE_OPTIONS } from '../lib/trip_planner_pricing.js';
import {
  flyInOptions, monthOptions, orderStaysFromAnchor, flightMeta, fmtFlightDuration, flightBadges,
} from '../lib/wizardFlights.js';
import { cheapestStartDates } from '../lib/tripCostOptimizer.js';
import { carAdvice } from '../lib/transport.js';
import { haversineKm, tripDaysBetween } from '../lib/runtime_pricing.js';
import { eur, fmtHours } from '../lib/format.js';
import { fmtDate, addDays } from '../lib/dates.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import {
  SparkIcon, CheckIcon, AlertIcon, TrainIcon, CarIcon, InfoIcon,
  MuseumIcon, TreeIcon, DiningIcon, ShoppingIcon, MoonIcon, MasksIcon,
  CameraIcon, CoffeeIcon, CastleIcon, BeachIcon, BallIcon, LotusIcon,
  LeafIcon, ScaleIcon, BoltIcon, StarIcon, RouteIcon, BedIcon, MapPinIcon,
  CalendarIcon, PersonIcon, DiamondIcon, DotIcon, LuggageIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { OriginPicker } from '../components/OriginPicker.jsx';

const ROUTES_PREVIEW = 14;
const CITIES_PREVIEW = 8;
const NEARBY_KM = 140;

// The three ways into the wizard - how much is already booked decides how many
// questions Carta still gets to ask.
const PATHS = [
  {
    key: 'full',
    Icon: SparkIcon,
    label: 'Carta plans it start to end',
    sub: 'Countries, flights, stays, days. We design the whole trip together',
  },
  {
    key: 'landed',
    Icon: PlaneIcon,
    label: 'My travel there is booked',
    sub: 'Flights (any airline) or car sorted. Carta plans the stays and days',
  },
  {
    key: 'booked',
    Icon: CheckIcon,
    label: 'Flights and stays are booked',
    sub: 'Fill in where you sleep and jump straight to the trip overview',
  },
];

// Step labels per path (index 0 is unused; the path picker is step 0).
const PATH_STEPS = {
  full: ['Where', 'When', 'Enjoy', 'Getting there', 'Stay', 'Finish'],
  landed: ['Arrival', 'Enjoy', 'Stay', 'Finish'],
  booked: ['Your trip'],
};

// "What kind of vacation?" tiles for the let-Carta-pick-countries quiz.
const VIBES = [
  { key: 'beaches', label: 'Beaches & sun', Icon: BeachIcon },
  { key: 'nature', label: 'Nature & mountains', Icon: TreeIcon },
  { key: 'cities', label: 'Cities & culture', Icon: CastleIcon },
  { key: 'food', label: 'Food & wine', Icon: DiningIcon },
  { key: 'nightlife', label: 'Nightlife', Icon: MoonIcon },
  { key: 'hidden', label: 'Off the beaten path', Icon: CameraIcon },
];

// "How full should your days feel?"
const PACE_CHOICES = [
  { key: 'relaxed', Icon: LeafIcon, label: 'Relaxed', sub: '1-2 sights a day, long lunches' },
  { key: 'balanced', Icon: ScaleIcon, label: 'Balanced', sub: '2-3 sights, room to wander' },
  { key: 'packed', Icon: BoltIcon, label: 'See it all', sub: '4+ sights, early starts' },
];

// The "What do you enjoy?" tiles. Asked BEFORE the flight/stay picks so the
// recommended routes and cities are already tuned to what they love.
// Exported: the Day planner's "Shape your day" wizard shows the same tiles.
export const INTERESTS = [
  { key: 'museums', label: 'Museums', Icon: MuseumIcon },
  { key: 'outdoors', label: 'Outdoors', Icon: TreeIcon },
  { key: 'food', label: 'Food & Dining', Icon: DiningIcon },
  { key: 'shopping', label: 'Shopping', Icon: ShoppingIcon },
  { key: 'nightlife', label: 'Nightlife', Icon: MoonIcon },
  { key: 'culture', label: 'Local Culture', Icon: MasksIcon },
  { key: 'photo', label: 'Photo Spots', Icon: CameraIcon },
  { key: 'cafes', label: 'Cafés', Icon: CoffeeIcon },
  { key: 'architecture', label: 'Architecture', Icon: CastleIcon },
  { key: 'beaches', label: 'Beaches', Icon: BeachIcon },
  { key: 'sports', label: 'Sports', Icon: BallIcon },
  { key: 'wellness', label: 'Wellness', Icon: LotusIcon },
];

const BADGE_LABELS = {
  pick: { label: "Carta's pick", cls: 'pick' },
  cheapest: { label: 'Cheapest', cls: 'cheap' },
  fastest: { label: 'Fastest', cls: 'fast' },
};

// How long is this city genuinely worth staying? Driven by how much there is
// to see and do, so the info panel can recommend honestly.
export function suggestedNights(dest) {
  const score = dest?.rating?.score ?? dest?.beauty?.score ?? 0;
  const pois = dest?.activities?.items?.length || 0;
  if (score >= 8.8 && pois >= 10) return { n: 3, text: '3 nights - there is a lot here' };
  if (score >= 7.8 || pois >= 8) return { n: 2, text: '2 nights covers the highlights' };
  if (dest?.tier === 'gem') return { n: 1, text: '1 night, or a day trip from a nearby base' };
  return { n: 1, text: '1 night is enough for most travellers' };
}

// Real flag artwork (falls back to the emoji/letters if the image can't load).
function Flag({ iso2, className }) {
  const url = flagUrl(iso2, 40);
  if (!url) return <span className={className}>{isoToFlag(iso2)}</span>;
  return (
    <img
      className={className}
      src={url}
      srcSet={`${flagUrl(iso2, 80)} 2x`}
      alt=""
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

// A city's Wikipedia photo as a rounded thumbnail, with a lettered fallback
// when there's no image (mirrors the suggestion/nearby cards elsewhere).
function CityThumb({ dest, className }) {
  const url = cityImage(dest);
  return (
    <div className={className} style={url ? { backgroundImage: `url(${url})` } : undefined}>
      {!url && <span className="guide-thumb-fallback">{dest?.city?.slice(0, 1) || '?'}</span>}
    </div>
  );
}

/** The worth-a-visit chip: colour-tiered so the genuinely special stops leap
 *  out of a long city list. */
function TierChip({ dest }) {
  const t = cityTier(dest);
  if (t.key === 'ok') return null;
  return (
    <span className={`guide-tier guide-tier-${t.key}`}>
      {t.key === 'top' && <StarIcon size={9} />}
      {t.key === 'great' && <DiamondIcon size={9} />}
      {t.key === 'good' && <DotIcon size={8} />}
      {t.label}
    </span>
  );
}

/** One stay-city row: photo, name + tier + what it's known for, an info
 *  toggle with structured facts, and the nights stepper. */
function StayRow({ id, dest, nights, onNights, anchorDest, isAnchor, companions }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const km = anchorDest && anchorDest.lat != null && dest.lat != null && !isAnchor
    ? Math.round(haversineKm(anchorDest.lat, anchorDest.lon, dest.lat, dest.lon))
    : null;
  const n = nights || 0;
  return (
    <div className={`guide-city ${n > 0 ? 'on' : ''}`}>
      <CityThumb dest={dest} className="guide-city-thumb" />
      <div className="guide-city-info">
        <div className="guide-city-name">
          {dest.city}
          {isAnchor && <span className="guide-anchor-badge"><PlaneIcon size={9} /> you land here</span>}
          <TierChip dest={dest} />
          {dest.rating?.score != null && <ScoreChip rating={dest.rating} size="xs" />}
          {dest.rating?.hidden_gem && <HiddenGemTag />}
          <button
            className={`guide-city-info-btn ${infoOpen ? 'open' : ''}`}
            onClick={() => setInfoOpen(!infoOpen)}
            aria-expanded={infoOpen}
            title={`About ${dest.city}`}
          ><InfoIcon size={12} /></button>
        </div>
        <div className="guide-city-insight">
          {km != null ? `${km} km from arrival, ` : ''}{cityInsight(dest)}
        </div>
        {infoOpen && (
          <div className="guide-city-facts">
            {knownForFacts(dest).map(([label, value]) => (
              <div className={`guide-city-fact ${label === 'Known for' ? 'guide-city-fact-known' : ''}`} key={label}>
                <span className="guide-city-fact-label">{label}</span>
                <span className="guide-city-fact-value">{value}</span>
              </div>
            ))}
          </div>
        )}
        {n > 0 && companions && companions.length > 0 && (
          <div className="guide-city-combo">
            Pairs well with {companions.map((c, i) => (
              <span key={c.id}>{i > 0 && ' & '}<b>{c.dest.city}</b> ({c.km} km)</span>
            ))}
          </div>
        )}
      </div>
      <div className="guide-nights">
        <button onClick={() => onNights(id, n - 1)} disabled={n <= 0} aria-label="Fewer nights">-</button>
        <span className="guide-nights-val">
          {n === 0 ? <span className="guide-nights-zero">add</span> : <><b>{n}</b> {n === 1 ? 'night' : 'nights'}</>}
        </span>
        <button onClick={() => onNights(id, n + 1)} aria-label="More nights">+</button>
      </div>
    </div>
  );
}

/**
 * "Let Carta guide you" - the guided trip builder.
 *
 * Opens on ONE question: how much is already booked?
 *   - Carta plans it start to end: countries (map pick, or Carta recommends
 *     from a vacation-type quiz) -> dates (exact, exact +-2 days, or fully
 *     flexible) -> interests -> getting there (a MAP of real Ryanair fares;
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
  const destinations = data?.destinations || {};
  const dateMin = data?.meta?.start_date;
  const dateMax = data?.meta?.end_date;
  // The departure airport the fares are currently priced from (set globally in
  // the header); its city names the getting-there step so the copy follows it.
  const originCode = data?.meta?.selected_origin;
  const originRec = data?.meta?.origins?.[originCode] || null;
  const originCity = originRec?.city || 'your airport';
  const allCountries = useMemo(() => countriesFromData(destinations), [destinations]);
  const countryInsights = useCountryInsights();

  // ---- Wizard flow state ----
  const [path, setPath] = useState(null); // null = the "what are you looking for?" screen
  const [step, setStep] = useState(1);
  const steps = path ? PATH_STEPS[path] : [];

  const [countries, setCountries] = useState(() => new Set());
  const [countryQuizOpen, setCountryQuizOpen] = useState(false);
  const [vibes, setVibes] = useState(() => new Set());
  const [dateMode, setDateMode] = useState('exact'); // 'exact' | 'flex'
  const [flexPad, setFlexPad] = useState(false);     // exact dates, +-2 days wiggle
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [flexNights, setFlexNights] = useState(7);
  const [flexMonth, setFlexMonth] = useState(''); // '' = any month
  const [interests, setInterests] = useState(() => new Set()); // enjoyed themes
  // 'fly' = Ryanair route pick, 'car' = drive, 'other' = the traveller books
  // their own flight with another airline (Carta plans stays + ground only).
  const [arriveMode, setArriveMode] = useState('fly');
  const [flyInId, setFlyInId] = useState('');
  const [flightView, setFlightView] = useState('map'); // 'map' | 'list'
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [nights, setNights] = useState({});      // { [id]: nights }
  const [order, setOrder] = useState([]);        // included city ids, pick order
  const [staySearch, setStaySearch] = useState('');
  const [stayView, setStayView] = useState('map'); // 'map' | 'list'
  const [stayStyle, setStayStyle] = useState('multi'); // 'multi' | 'single'
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

  const selectedCountries = allCountries.filter((c) => countries.has(c.country));
  const includedIds = order.filter((id) => (nights[id] || 0) > 0);
  const totalNights = includedIds.reduce((sum, id) => sum + (nights[id] || 0), 0);
  const windowNights = path === 'landed'
    ? flexNights
    : (dateMode === 'exact' ? tripDaysBetween(startDate, endDate) : flexNights);
  const months = useMemo(() => monthOptions(dateMin, dateMax), [dateMin, dateMax]);

  // Which step is which, per path (so the render below reads by NAME).
  const stepName = path ? steps[step - 1] : null;

  // Every Ryanair route into the chosen countries for the chosen period,
  // cheapest first. The pick anchors the whole trip - so this must stay
  // resolvable AFTER the Getting-there step too (the Stay and Finish steps read
  // the chosen fly-in for the arrival anchor, the route ordering and the
  // flexible-date repricing). Gating it to only 'Getting there' silently
  // dropped `flyIn` to null everywhere else, which handed the planner a null
  // anchor and left ground-only first/last stops (gems like Toledo) with no
  // priceable flight - the "no single flight plan" dead end.
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

  // Rough driving reach per selected country, for the car option: straight-line
  // to the country's centroid with the app's road-detour factor - a scale
  // check ("Croatia is a 12h drive"), not a route plan.
  const driveNotes = useMemo(() => {
    if (!originRec || originRec.lat == null) return [];
    return selectedCountries.map((c) => {
      const km = haversineKm(originRec.lat, originRec.lon, c.centroid.lat, c.centroid.lon);
      if (km == null) return null;
      const roadKm = Math.round(km * 1.3);
      return { country: c.country, iso2: c.iso2, km: roadKm, hours: Math.round((roadKm / 90) * 10) / 10 };
    }).filter(Boolean);
  }, [selectedCountries, originRec]);

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
    // Each vacation type reads the real catalogue signals - the `categories`
    // tags a city carries plus its beauty-component intensities - so beaches,
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
            ? `${fits.length} great ${fits.length === 1 ? 'match' : 'matches'}, led by ${top.city}`
            : '',
        };
      })
      .filter((c) => c.n >= 1 && c.score > 0.9)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [countryQuizOpen, vibes, allCountries]);

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

  // Carta designs the stays from the interests + arrival + window, steered by
  // the questionnaire: how busy the days should feel, how many stays, and any
  // must-include cities. A one-home-base trip designs exactly one stay.
  const applyDesign = () => {
    const picks = designStays({
      destinations,
      countries,
      interests,
      anchorDest,
      anchorId,
      totalNights: windowNights || 5,
      maxStops: stayStyle === 'single' ? 1 : (quizStops || null),
      mustIncludeIds: [...quizMust],
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

  const toggleInterest = (key) => {
    setInterests((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
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
    || (stepName === 'Enjoy' && interests.size > 0)
    || (stepName === 'Getting there' && (arriveMode === 'car' || arriveMode === 'other' || flyIn != null))
    || (stepName === 'Arrival' && Boolean(arrivalId && startDate && flexNights >= 1))
    || (stepName === 'Stay' && includedIds.length > 0)
    || stepName === 'Finish'
  );

  // Choosing to arrive by car implies driving between stops too (they'll have
  // the car); still changeable per leg in the planner.
  const pickArriveMode = (mode) => {
    setArriveMode(mode);
    if (mode === 'car') setFlyInId('');
  };

  const hasProgress = Boolean(path) && (countries.size > 0 || arrivalId || bookedStops.length > 0 || step > 1);
  const handleCancel = () => {
    if (hasProgress && !window.confirm('Discard this trip and start over later?')) return;
    onCancel();
  };
  const startOver = () => {
    if (!window.confirm('Clear everything and begin this trip from scratch?')) return;
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
    setInterests(new Set());
    setArriveMode('fly');
    setFlyInId('');
    setFlightView('map');
    setShowAllRoutes(false);
    setNights({});
    setOrder([]);
    setAutoNightIds(new Set());
    setStaySearch('');
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
      if (d.side === 'left') notes.push(`${c.country} drives on the LEFT.`);
      if (d.vignette) notes.push(`${c.country}: ${d.vignette}`);
    }
    return notes;
  }, [selectedCountries, countryInsights]);

  // Carta arranges the trip: route the stays out from the arrival point, and
  // (when flexible) pick the cheapest start date with real stored fares.
  // "Getting between stops" is deliberately NOT asked here any more - Carta
  // defaults to its per-leg pick (or the car they arrive with) and every leg
  // stays adjustable in the planner.
  const finish = () => {
    const orderedIds = orderStaysFromAnchor(includedIds, destinations, anchorDest);
    // Days start EMPTY on purpose: sights are chosen in the Day planner
    // ("Plan this day"), not pre-stuffed here - a pre-filled "2 to visit" on
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
    // Car trips (or no fare data at all) still need a concrete start date.
    if (!start) start = flexMonth ? `${flexMonth}-05` : (dateMin || '');

    const label = path === 'landed' && arrivalDest
      ? arrivalDest.country
      : selectedCountries.map((c) => c.country).slice(0, 2).join(' & ');

    onComplete({
      startDate: start,
      groupSize,
      transport: (arriveMode === 'car' || landedMode === 'car') ? 'car' : 'auto',
      pace,
      baggage,
      anchorId: path === 'landed' ? (landedMode === 'car' ? null : arrivalId) : (arriveMode === 'fly' && flyIn ? flyIn.id : null),
      label,
      stops,
    });
  };

  // "Everything is booked": hand over exactly what they typed, straight to
  // the overview - no design pass, no repricing of decisions already made.
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
  const stayCountries = selectedCountries.map((c) => {
    const ranked = c.cities
      .map(({ id, dest }) => ({
        id,
        dest,
        rankBase: (dest.rating?.score ?? dest.beauty?.score ?? 0)
          + (dest.rating?.hidden_gem ? 1.5 : 0)
          + interestFitScore(dest, interests) * 2.5,
      }))
      .filter((cd) => matchesQ(cd.dest))
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
      .filter(([, d]) => d && d.lat != null && !countries.has(d.country) && matchesQ(d))
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
  }, [stepName, selectedCountries, nights, includedIds, anchorId, focusedId, destinations]);

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
  // Ranked to surface a genuine MIX - the small cozy villages and hidden gems
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

  // A fuller, data-driven "what's in this region" line for the arrival panel -
  // the texture the one-line blurb can't carry: how much small-town character
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
      pieces.push(`${gemN} small ${gemN === 1 ? 'town or village' : 'towns and villages'}`
        + (hiddenN ? `, ${hiddenN === 1 ? 'one a hidden gem' : `${hiddenN} of them hidden gems`}` : ''));
    }
    if (cityN) pieces.push(`${cityN} larger ${cityN === 1 ? 'city' : 'cities'}`);
    if (!pieces.length) return null;
    const list = pieces.length === 2 ? `${pieces[0]} plus ${pieces[1]}` : pieces[0];
    let s = `Within about a two-hour drive of ${d.city}: ${list}.`;
    if (unescoN) s += ` ${unescoN} of ${unescoN === 1 ? 'them is' : 'these spots are'} UNESCO-listed.`;
    return s;
  }, [flyIn, nearbyForFlight]);

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
            />
          ))}
        </div>
        {!open && list.length > CITIES_PREVIEW && (
          <button className="guide-show-more" onClick={() => toggleGroup(key)}>
            Show all {list.length} {groupKey === 'gems' ? 'gems & scenic stays' : 'cities'}
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
      recapChips.push({ Icon: PlaneIcon, text: `arriving in ${arrivalDest.city}${startDate ? `, ${fmtDate(startDate, true)}` : ''}` });
      recapChips.push({ Icon: CalendarIcon, text: `${flexNights} nights` });
    } else if (dateMode === 'exact' && startDate && endDate) {
      recapChips.push({ Icon: CalendarIcon, text: `${fmtDate(startDate, true)} → ${fmtDate(endDate, true)}${flexPad ? ', ±2 days' : ''}` });
    } else if (dateMode === 'flex') {
      recapChips.push({ Icon: CalendarIcon, text: `${flexNights} nights, ${flexMonth ? months.find((m) => m.key === flexMonth)?.label || flexMonth : 'cheapest month'}` });
    }
    if (interests.size) {
      const names = INTERESTS.filter((i) => interests.has(i.key)).map((i) => i.label);
      recapChips.push({ Icon: StarIcon, text: names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') });
    }
    if (path === 'full' && stepName !== 'Getting there') {
      if (arriveMode === 'fly' && flyIn) recapChips.push({ Icon: PlaneIcon, text: `fly into ${flyIn.dest.city}` });
      if (arriveMode === 'car') recapChips.push({ Icon: CarIcon, text: 'going by car' });
      if (arriveMode === 'other') recapChips.push({ Icon: PlaneIcon, text: 'own flight' });
    }
    if ((stepName === 'Stay' || stepName === 'Finish') && stayStyle === 'single') {
      recapChips.push({ Icon: BedIcon, text: 'one home base' });
    }
    if (includedIds.length && stepName === 'Finish') {
      recapChips.push({ Icon: RouteIcon, text: `${includedIds.length} ${includedIds.length === 1 ? 'stay' : 'stays'}, ${totalNights} nights` });
    }
  }

  const focusedDest = focusedId ? destinations[focusedId] : null;

  // On phones the map fills the screen, so the briefing panel that a pin tap
  // populates sits below the fold - it reads as "nothing happened". Nudge the
  // panel into view on selection (narrow screens only; desktop shows both).
  const flightSideRef = useRef(null);
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

  // ---------------------------------------------------------------- render --
  return (
    <div className="guide-overlay" onClick={handleCancel}>
      <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header + progress */}
        <div className="guide-head">
          <button className="guide-close" onClick={handleCancel} aria-label="Close">×</button>
          {path ? (
            <div className="guide-steps">
              {steps.map((label, i) => (
                <div key={label} className={`guide-step-dot ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}>
                  <span>{i + 1}</span>{label}
                </div>
              ))}
            </div>
          ) : (
            <div className="guide-steps"><div className="guide-step-dot active"><SparkIcon size={11} /> Let Carta guide you</div></div>
          )}
        </div>

        {/* What Carta is planning around - the running recap of every answer. */}
        {recapChips.length > 0 && (
          <div className="guide-recap">
            <span className="guide-recap-label"><CheckIcon size={10} /> Planning around:</span>
            {recapChips.map((c, i) => (
              <span className="guide-recap-chip" key={i}><c.Icon size={10} /> {c.text}</span>
            ))}
          </div>
        )}

        <div className="guide-body">
          {/* ---- Step 0: what are you looking for? ---- */}
          {!path && (
            <>
              <h2 className="guide-title">What are you looking for?</h2>
              <p className="guide-sub">Tell Carta how much is already booked, and it only asks about the rest.</p>
              <div className="guide-path-list">
                {PATHS.map((p) => (
                  <button key={p.key} className="guide-path" onClick={() => { setPath(p.key); setStep(1); }}>
                    <span className="guide-path-icon"><p.Icon size={18} /></span>
                    <span className="guide-path-text">
                      <b>{p.label}</b>
                      <small>{p.sub}</small>
                    </span>
                    <span className="guide-arrow">→</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ---- FULL PATH: Where ---- */}
          {stepName === 'Where' && (
            <>
              <h2 className="guide-title">Where are we going?</h2>
              <p className="guide-sub">Tap countries on the map or in the list - mix and match as many as you like. Not sure? Let Carta recommend some.</p>

              <button className="guide-design-btn" onClick={() => setCountryQuizOpen((v) => !v)}>
                <span className="guide-design-spark"><SparkIcon size={14} /></span>
                <span className="guide-design-text">
                  Let Carta pick the countries
                  <small>Say what kind of vacation you're after</small>
                </span>
              </button>

              {countryQuizOpen && (
                <div className="guide-design-quiz">
                  <span className="trip-field-label">What kind of vacation do you feel like?</span>
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
                        <span className="guide-interest-label">{v.label}</span>
                      </button>
                    ))}
                  </div>
                  {countrySuggestions.length > 0 && (
                    <>
                      <span className="trip-field-label">Carta recommends - tap to add:</span>
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
                    <p className="guide-empty">Pick a vacation type above and Carta will suggest countries.</p>
                  )}
                  {vibes.size > 0 && countrySuggestions.length === 0 && (
                    <p className="guide-empty">No standout matches for that mix - try another combination, or pick countries on the map below.</p>
                  )}
                </div>
              )}

              <CountryPickerMap countries={allCountries} selected={countries} onToggle={toggleCountry} />
              <div className="guide-country-grid">
                {allCountries.map((c) => (
                  <button
                    key={c.country}
                    className={`guide-country ${countries.has(c.country) ? 'on' : ''}`}
                    onClick={() => toggleCountry(c.country)}
                  >
                    <Flag iso2={c.iso2} className="guide-flag-img" />
                    <span className="guide-country-name">{c.country}</span>
                    <span className="guide-country-n">{c.cities.length} cities</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ---- FULL PATH: When ---- */}
          {stepName === 'When' && (
            <>
              <h2 className="guide-title">When are you travelling?</h2>
              <p className="guide-sub">Pick your dates, or stay flexible and Carta will find the cheapest real fares for you.</p>
              <div className="guide-datemode">
                <button className={dateMode === 'exact' ? 'on' : ''} onClick={() => setDateMode('exact')}>
                  I know my dates
                </button>
                <button className={dateMode === 'flex' ? 'on' : ''} onClick={() => setDateMode('flex')}>
                  <SparkIcon size={12} /> I'm flexible
                </button>
              </div>

              {dateMode === 'exact' ? (
                <>
                  <div className="guide-when-dates">
                    <label className="trip-field">
                      <span className="trip-field-label">Start</span>
                      <DateField value={startDate} min={dateMin} max={endDate || dateMax} onChange={setStartDate} placeholder="Departure date" />
                    </label>
                    <span className="trip-dates-arrow">→</span>
                    <label className="trip-field">
                      <span className="trip-field-label">End</span>
                      <DateField value={endDate} min={startDate || dateMin} max={dateMax} onChange={setEndDate} placeholder="Return date" />
                    </label>
                    {windowNights > 0 && (
                      <span className="guide-when-nights">{windowNights} {windowNights === 1 ? 'night' : 'nights'}</span>
                    )}
                  </div>
                  <button
                    className={`guide-chip guide-flexpad ${flexPad ? 'on' : ''}`}
                    onClick={() => setFlexPad(!flexPad)}
                    aria-pressed={flexPad}
                  >
                    <SparkIcon size={11} /> My dates can shift ±2 days if it's cheaper
                  </button>
                  {flexPad && (
                    <p className="guide-note">Carta keeps your dates unless a real fare within two days beats them.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="guide-flex-nights">
                    <span className="trip-field-label">How long, roughly?</span>
                    <div className="guide-people">
                      <button type="button" onClick={() => setFlexNights(Math.max(1, flexNights - 1))} disabled={flexNights <= 1} aria-label="Fewer nights">-</button>
                      <span>{flexNights} {flexNights === 1 ? 'night' : 'nights'}</span>
                      <button type="button" onClick={() => setFlexNights(Math.min(21, flexNights + 1))} disabled={flexNights >= 21} aria-label="More nights">+</button>
                    </div>
                  </div>
                  <span className="trip-field-label">Which month?</span>
                  <div className="guide-months">
                    <button className={`guide-chip ${flexMonth === '' ? 'on' : ''}`} onClick={() => setFlexMonth('')}>Any month</button>
                    {months.map((m) => (
                      <button key={m.key} className={`guide-chip ${flexMonth === m.key ? 'on' : ''}`} onClick={() => setFlexMonth(m.key)}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <p className="guide-note"><SparkIcon size={11} /> Carta will pick the cheapest departure with real stored Ryanair fares.</p>
                </>
              )}
            </>
          )}

          {/* ---- LANDED PATH: Arrival ---- */}
          {stepName === 'Arrival' && (
            <>
              <h2 className="guide-title">Where do you arrive?</h2>
              <p className="guide-sub">
                Your travel there is sorted - any airline, or your own car. Tell Carta where and when
                you arrive and it plans everything on the ground from that point.
              </p>

              <div className="guide-datemode guide-arrive-mode">
                <button className={landedMode === 'other' ? 'on' : ''} onClick={() => setLandedMode('other')}>
                  <PlaneIcon size={12} /> I fly in
                </button>
                <button className={landedMode === 'car' ? 'on' : ''} onClick={() => setLandedMode('car')}>
                  <CarIcon size={12} /> I drive there
                </button>
              </div>

              <span className="trip-field-label">{landedMode === 'car' ? 'First place you head to' : 'Where do you land?'}</span>
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
                  <button className="guide-back" onClick={() => { setArrivalId(''); setArrivalQuery(''); }}>Change</button>
                </div>
              ) : (
                <>
                  <input
                    className="guide-search"
                    type="search"
                    value={arrivalQuery}
                    onChange={(e) => setArrivalQuery(e.target.value)}
                    placeholder={landedMode === 'car' ? 'Search your first stop…' : 'Search the airport city…'}
                    aria-label="Search arrival city"
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
                    <p className="guide-empty">No city matches “{arrivalQuery}”.</p>
                  )}
                </>
              )}

              <div className="guide-when-dates guide-arrival-when">
                <label className="trip-field">
                  <span className="trip-field-label">{landedMode === 'car' ? 'Day you arrive' : 'Day you land'}</span>
                  <DateField value={startDate} min={dateMin} max={dateMax} onChange={setStartDate} placeholder="Arrival date" />
                </label>
                <label className="trip-field">
                  <span className="trip-field-label">How many nights?</span>
                  <div className="guide-people">
                    <button type="button" onClick={() => setFlexNights(Math.max(1, flexNights - 1))} disabled={flexNights <= 1} aria-label="Fewer nights">-</button>
                    <span>{flexNights}</span>
                    <button type="button" onClick={() => setFlexNights(Math.min(30, flexNights + 1))} disabled={flexNights >= 30} aria-label="More nights">+</button>
                  </div>
                </label>
              </div>
              {landedMode === 'other' && (
                <p className="guide-note">
                  <InfoIcon size={11} /> Since your flight is booked elsewhere, Carta leaves the airfare out of
                  the estimate and prices the stays and days from {arrivalDest ? arrivalDest.city : 'your arrival'} on.
                </p>
              )}
            </>
          )}

          {/* ---- Enjoy (full + landed) ---- */}
          {stepName === 'Enjoy' && (
            <>
              <h2 className="guide-title">What do you enjoy?</h2>
              <p className="guide-sub">Select all that interest you (at least one). Recommended cities and day plans are tuned to these.</p>
              <div className="guide-interest-grid">
                {INTERESTS.map((it) => (
                  <button
                    key={it.key}
                    className={`guide-interest ${interests.has(it.key) ? 'on' : ''}`}
                    onClick={() => toggleInterest(it.key)}
                    aria-pressed={interests.has(it.key)}
                  >
                    {interests.has(it.key) && <span className="guide-interest-check"><CheckIcon size={11} /></span>}
                    <span className="guide-interest-icon"><it.Icon size={20} /></span>
                    <span className="guide-interest-label">{it.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ---- FULL PATH: Getting there ---- */}
          {stepName === 'Getting there' && (
            <>
              <h2 className="guide-title">How do you get there?</h2>
              <p className="guide-sub">
                Fly with Ryanair from {originCity}, or drive there. Both start from the same place.
              </p>

              <div className="guide-datemode guide-arrive-mode">
                <button className={arriveMode === 'fly' ? 'on' : ''} onClick={() => pickArriveMode('fly')}>
                  <PlaneIcon size={12} /> Fly
                </button>
                <button className={arriveMode === 'car' ? 'on' : ''} onClick={() => pickArriveMode('car')}>
                  <CarIcon size={12} /> Car
                </button>
              </div>

              {arriveMode === 'fly' && onChangeOrigin && data?.meta?.origins && Object.keys(data.meta.origins).length > 0 && (
                <div className="guide-origin-row">
                  <span className="guide-origin-label"><PlaneIcon size={11} /> Flying from</span>
                  <OriginPicker data={data} origin={origin ?? originCode} onChangeOrigin={onChangeOrigin} />
                </div>
              )}

              {arriveMode === 'other' ? (
                <div className="guide-noflight">
                  <p className="guide-sub">
                    <CheckIcon size={12} /> You'll book your own flight with another airline.
                    Carta still plans your cities, stays, days and ground travel; only the
                    airfare stays out of the estimate.
                  </p>
                  <button className="guide-back guide-noflight-back" onClick={() => setArriveMode('fly')}>
                    ← Look at Ryanair routes instead
                  </button>
                </div>
              ) : arriveMode === 'car' ? (
                <>
                  <p className="guide-sub">
                    Your own car from {originCity}. Rough one-way reach into your {selectedCountries.length === 1 ? 'country' : 'countries'}:
                  </p>
                  <div className="guide-drive-notes">
                    {driveNotes.map((n) => (
                      <div className="guide-drive-note" key={n.country}>
                        <Flag iso2={n.iso2} className="guide-flag-img-sm" />
                        <b>{n.country}</b>
                        <span>~{n.km} km, about {fmtHours(n.hours)} of driving</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : routeOptions.length === 0 ? (
                <div className="guide-noflight">
                  <p className="guide-empty">
                    <AlertIcon size={12} /> No Ryanair fares are stored from {originCity} into these countries
                    {dateMode === 'exact' && startDate ? ` on ${fmtDate(startDate)}` : ' for this period'}.
                  </p>
                  <p className="guide-sub">
                    Try another departure airport above, change your dates, add a neighbouring
                    country, switch to the car option, or simply book a flight with another
                    airline and let Carta plan everything on the ground.
                  </p>
                  <button className="guide-back guide-noflight-back" onClick={() => setStep(step - 2)}>← Change my dates</button>
                </div>
              ) : (
                <>
                  <div className="guide-datemode guide-stay-view">
                    <button className={flightView === 'map' ? 'on' : ''} onClick={() => setFlightView('map')}>Map</button>
                    <button className={flightView === 'list' ? 'on' : ''} onClick={() => setFlightView('list')}>List</button>
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
                          <div className="guide-flight-side-empty">
                            <PlaneIcon size={16} />
                            <p>Tap a plane on the map to see the fare, the flight time, and the interesting places around where it lands.</p>
                          </div>
                        ) : (
                          <>
                            <div className="guide-flight-side-head">
                              <CityThumb dest={flyIn.dest} className="guide-city-thumb" />
                              <div className="guide-flight-side-title">
                                <b>{flyIn.dest.city} <Flag iso2={flyIn.dest.iso2} className="guide-flag-img-sm" /></b>
                                <small>
                                  <PlaneIcon size={9} /> into {flyIn.anchor}
                                  {(() => { const m = flightMeta(flyIn, data?.meta?.origins); return m ? `, ${fmtFlightDuration(m.min)} flight` : ''; })()}
                                  {', '}{eur(flyIn.has_exact ? flyIn.exact_eur : flyIn.cheapest.eur)}/pp
                                </small>
                                {!flyIn.has_exact && dateMode === 'exact' && flyIn.cheapest && (
                                  <small className="guide-route-warn">
                                    <AlertIcon size={9} /> No fare for {fmtDate(startDate, true)}; cheapest {fmtDate(flyIn.cheapest.date, true)}
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
                                  ? 'A rental car is recommended to explore this area.'
                                  : 'A car helps for parts of this area; the towns work without one.'}
                              </p>
                            )}
                            {nearbyForFlight.length > 0 && (
                              <>
                                <div className="guide-stay-group-title">Interesting places around</div>
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
                                        <div className="guide-nearby-sub">{km} km from {flyIn.anchor}. {cityInsight(dest)}</div>
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
                                  {badge && <span className={`guide-route-badge ${badge.cls}`}>{badge.cls === 'pick' && <SparkIcon size={9} />}{badge.label}</span>}
                                </span>
                                <span className="guide-route-sub">
                                  <PlaneIcon size={10} /> Fly into {o.anchor}
                                  {meta ? `, ${fmtFlightDuration(meta.min)} flight` : ''}
                                </span>
                                {!o.has_exact && dateMode === 'exact' && o.cheapest && (
                                  <span className="guide-route-warn">
                                    <AlertIcon size={10} /> No fare stored for {fmtDate(startDate, true)}, cheapest is {fmtDate(o.cheapest.date, true)}
                                  </span>
                                )}
                              </span>
                              <span className="guide-route-fare">
                                <b>{eur(o.has_exact ? o.exact_eur : o.cheapest.eur)}</b>
                                <small>
                                  {o.has_exact ? 'per person' : `${fmtDate(o.cheapest.date, true)}, per person`}
                                </small>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {!showAllRoutes && routeOptions.length > ROUTES_PREVIEW && (
                        <button className="guide-show-more" onClick={() => setShowAllRoutes(true)}>
                          Show all {routeOptions.length} routes
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
              <h2 className="guide-title">Where do you want to sleep?</h2>
              <p className="guide-sub">
                {anchorDest
                  ? `The map opens around ${anchorDest.city}, where you ${path === 'landed' && landedMode === 'car' ? 'arrive' : 'land'}. Tap any city for a proper briefing - and zoom out for places further afield.`
                  : 'Tap any city for a proper briefing, or let Carta design the whole route.'}
              </p>

              {/* One base, or changing stays? Decides how Carta designs. */}
              <div className="guide-staystyle">
                <span className="trip-field-label">How do you like to stay?</span>
                <div className="guide-datemode">
                  <button
                    className={stayStyle === 'multi' ? 'on' : ''}
                    onClick={() => setStayStyle('multi')}
                  >
                    <RouteIcon size={12} /> Change stays as we go
                  </button>
                  <button
                    className={stayStyle === 'single' ? 'on' : ''}
                    onClick={() => setStayStyle('single')}
                  >
                    <BedIcon size={12} /> One home base
                  </button>
                </div>
                {stayStyle === 'single' && (
                  <p className="guide-note">One hotel or apartment for the whole trip - Carta plans day trips out from it instead of new check-ins.</p>
                )}
              </div>

              <button className="guide-design-btn" onClick={() => setDesignQuizOpen((v) => !v)}>
                <SparkIcon size={13} /> Let Carta pick my {stayStyle === 'single' ? 'base' : 'cities'}
                <small>{windowNights || flexNights} nights, tuned to your interests</small>
              </button>

              {designQuizOpen && (
                <div className="guide-design-quiz">
                  <div className="guide-quiz-q">
                    <span className="trip-field-label">How busy should your days feel?</span>
                    <div className="guide-months">
                      {PACE_CHOICES.map((p) => (
                        <button
                          key={p.key}
                          className={`guide-chip ${pace === p.key ? 'on' : ''}`}
                          onClick={() => setPace(p.key)}
                        >{p.label}</button>
                      ))}
                    </div>
                  </div>
                  {stayStyle === 'multi' && (
                    <div className="guide-quiz-q">
                      <span className="trip-field-label">How many different stays?</span>
                      <div className="guide-months">
                        <button className={`guide-chip ${quizStops === 0 ? 'on' : ''}`} onClick={() => setQuizStops(0)}>Carta decides</button>
                        {[2, 3, 4, 5].map((n) => (
                          <button key={n} className={`guide-chip ${quizStops === n ? 'on' : ''}`} onClick={() => setQuizStops(n)}>{n}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {mustChoices.length > 0 && (
                    <div className="guide-quiz-q">
                      <span className="trip-field-label">Any cities you really want in the route?</span>
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
                    <SparkIcon size={12} /> Design my {stayStyle === 'single' ? 'stay' : 'route'}
                  </button>
                </div>
              )}

              {designedNote && includedIds.length > 0 && (
                <p className="guide-note"><CheckIcon size={11} /> Done: Carta lined up {includedIds.length} {includedIds.length === 1 ? 'stop' : 'stops'} below. Adjust anything you like.</p>
              )}

              <div className="guide-datemode guide-stay-view">
                <button className={stayView === 'map' ? 'on' : ''} onClick={() => setStayView('map')}>Map</button>
                <button className={stayView === 'list' ? 'on' : ''} onClick={() => setStayView('list')}>List</button>
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
                        <div className="guide-flight-side-empty">
                          <MapPinIcon size={16} />
                          <p>Tap a city on the map to read about it: what it's like, how it rates, how long to stay.</p>
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
                            <p className="guide-note"><PlaneIcon size={10} /> You arrive here.</p>
                          )}
                          <p className="guide-city-side-insight">{cityInsight(focusedDest)}</p>
                          <div className="guide-city-facts">
                            {anchorDest && anchorDest.lat != null && focusedDest.lat != null && focusedId !== anchorId && (
                              <div className="guide-city-fact">
                                <span className="guide-city-fact-label">From arrival</span>
                                <span className="guide-city-fact-value">{Math.round(haversineKm(anchorDest.lat, anchorDest.lon, focusedDest.lat, focusedDest.lon))} km</span>
                              </div>
                            )}
                            <div className="guide-city-fact">
                              <span className="guide-city-fact-label">Stay</span>
                              <span className="guide-city-fact-value">{suggestedNights(focusedDest).text}</span>
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
                                <button onClick={() => setCityNights(focusedId, (nights[focusedId] || 0) - 1)} aria-label="Fewer nights">-</button>
                                <span className="guide-nights-val"><b>{nights[focusedId]}</b> {nights[focusedId] === 1 ? 'night' : 'nights'}</span>
                                <button onClick={() => setCityNights(focusedId, (nights[focusedId] || 0) + 1)} aria-label="More nights">+</button>
                              </div>
                              <button className="guide-back" onClick={() => toggleCity(focusedId)}>Remove</button>
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
                              <BedIcon size={12} /> {stayStyle === 'single' ? 'Make this my base' : 'Add to my trip'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="guide-tier-legend">
                    <span className="guide-tier guide-tier-top"><StarIcon size={9} /> Must-visit</span>
                    <span className="guide-tier guide-tier-great"><DiamondIcon size={9} /> Great stop</span>
                    <span className="guide-tier guide-tier-good"><DotIcon size={8} /> Worth a look</span>
                    <span className="guide-tier-legend-note">Number = rating out of 10. Tap a city to read about it.</span>
                  </div>
                </>
              )}

              <input
                className="guide-search"
                type="search"
                value={staySearch}
                onChange={(e) => setStaySearch(e.target.value)}
                placeholder="Search any city or town…"
                aria-label="Search cities"
              />
              {windowNights > 0 && (
                <div className={`guide-nights-budget ${totalNights > windowNights ? 'over' : ''}`}>
                  <b>{totalNights}</b> of <b>{windowNights}</b> nights planned
                  {totalNights > windowNights && ' - over your window'}
                </div>
              )}

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
              <h2 className="guide-title">Last touches</h2>
              <p className="guide-sub">Who's going and how full the days should feel. Carta picks the best way between your stops; every leg stays adjustable in the planner.</p>

              {(advice.verdict !== 'no' || drivingNotes.length > 0) && (
                <div className={`guide-car-advice ${advice.verdict}`}>
                  <div className="guide-car-advice-head">
                    {advice.verdict === 'no' ? <TrainIcon size={13} /> : <CarIcon size={13} />}
                    {' '}
                    {advice.verdict === 'yes' ? 'We recommend renting a car for this trip'
                      : advice.verdict === 'maybe' ? 'A car could be worth it here'
                      : 'Public transport covers this trip well'}
                  </div>
                  {advice.reasons.map((r, i) => <p key={i}>{r}</p>)}
                  {drivingNotes.map((n, i) => <p key={`d${i}`} className="guide-car-note"><AlertIcon size={11} /> {n}</p>)}
                </div>
              )}

              <h3 className="guide-subtitle">Your pace</h3>
              <div className="guide-transport-grid">
                {PACE_CHOICES.map((p) => (
                  <button
                    key={p.key}
                    className={`guide-transport ${pace === p.key ? 'on' : ''}`}
                    onClick={() => setPace(p.key)}
                    aria-pressed={pace === p.key}
                  >
                    <span className="guide-transport-icon"><p.Icon size={18} /></span>
                    <span className="guide-transport-label">{p.label}</span>
                    <span className="guide-transport-sub">{p.sub}</span>
                  </button>
                ))}
              </div>

              <div className="guide-start">
                <label className="trip-field">
                  <span className="trip-field-label"><PersonIcon size={11} /> People</span>
                  <div className="guide-people">
                    <button type="button" onClick={() => setGroupSize(Math.max(1, groupSize - 1))} disabled={groupSize <= 1} aria-label="Fewer people">-</button>
                    <span>{groupSize}</span>
                    <button type="button" onClick={() => setGroupSize(Math.min(20, groupSize + 1))} disabled={groupSize >= 20} aria-label="More people">+</button>
                  </div>
                </label>
              </div>

              {/* Ryanair baggage - the seat fares are seat-only, so ask what each
                  traveller carries and add it to the flight cost. Only relevant
                  when Carta is booking the flights. */}
              {((path === 'full' && arriveMode === 'fly') || (path === 'landed' && landedMode !== 'car')) && (
                <>
                  <h3 className="guide-subtitle"><LuggageIcon size={13} /> Baggage per person</h3>
                  <p className="guide-sub">Ryanair seat fares don't include hold or cabin bags. Pick what each traveller brings - it's added to every flight. Fees are estimates.</p>
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
                        <span className="guide-transport-sub">{opt.per_leg_eur === 0 ? 'Included free' : `~${eur(opt.per_leg_eur)} / flight`}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* What Carta will arrange - the full recap before committing. */}
              <div className="guide-final-summary">
                <div className="guide-stay-group-title">Your trip so far</div>
                {includedIds.map((id) => destinations[id] && (
                  <div className="guide-final-stop" key={id}>
                    <BedIcon size={11} />
                    <b>{destinations[id].city}</b>
                    <span>{nights[id]} {nights[id] === 1 ? 'night' : 'nights'}</span>
                  </div>
                ))}
              </div>
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

              <div className="guide-when-dates guide-arrival-when">
                <label className="trip-field">
                  <span className="trip-field-label">First night</span>
                  <DateField value={bookedStart} min={dateMin} max={dateMax} onChange={setBookedStart} placeholder="Start date" />
                </label>
                <label className="trip-field">
                  <span className="trip-field-label"><PersonIcon size={11} /> People</span>
                  <div className="guide-people">
                    <button type="button" onClick={() => setGroupSize(Math.max(1, groupSize - 1))} disabled={groupSize <= 1} aria-label="Fewer people">-</button>
                    <span>{groupSize}</span>
                    <button type="button" onClick={() => setGroupSize(Math.min(20, groupSize + 1))} disabled={groupSize >= 20} aria-label="More people">+</button>
                  </div>
                </label>
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

        {/* Footer */}
        <div className="guide-foot">
          <div className="guide-foot-summary">
            {hasProgress && (
              <button className="guide-startover" onClick={startOver} title="Clear everything and begin again">↺ Start over</button>
            )}
            {includedIds.length > 0 && `${includedIds.length} ${includedIds.length === 1 ? 'city' : 'cities'}, ${totalNights} nights`}
          </div>
          <div className="guide-foot-actions">
            {path && (step > 1
              ? <button className="guide-back" onClick={() => setStep(step - 1)}>Back</button>
              : <button className="guide-back" onClick={() => { setPath(null); setStep(1); }}>Back</button>
            )}
            {!path ? null : stepName === 'Your trip' ? (
              <button className="guide-next" onClick={finishBooked} disabled={!bookedStart || bookedStops.length === 0}>
                Show my trip overview →
              </button>
            ) : stepName === 'Getting there' && arriveMode === 'fly' && routeOptions.length === 0 ? (
              // No Ryanair route: the way forward is booking your own flight.
              <button
                className="guide-next"
                onClick={() => { setArriveMode('other'); setStep(step + 1); }}
              >
                I fly with another airline →
              </button>
            ) : step < steps.length ? (
              <button className="guide-next" onClick={() => setStep(step + 1)} disabled={!canNext}>Next</button>
            ) : (
              <button className="guide-next" onClick={finish} disabled={includedIds.length === 0}>
                <SparkIcon size={13} /> Let Carta arrange it
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
