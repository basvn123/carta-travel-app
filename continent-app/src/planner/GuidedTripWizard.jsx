import React, { useEffect, useMemo, useState } from 'react';
import { DateField } from '../components/DateField.jsx';
import { GemIcon } from '../components/GemRating.jsx';
import { CountryPickerMap } from '../map/CountryPickerMap.jsx';
import { CityPickerMap } from '../map/CityPickerMap.jsx';
import {
  countriesFromData, cityInsight, activitiesForInterests, cityImage, flagUrl, isoToFlag,
  interestFitScore, cityTier, cityCompanions, designStays,
} from '../lib/tripGuide.js';
import { knownForFacts } from '../lib/knownFor.js';
import { gemScore } from '../lib/trip_planner_pricing.js';
import {
  flyInOptions, monthOptions, orderStaysFromAnchor, flightMeta, fmtFlightDuration, flightBadges,
} from '../lib/wizardFlights.js';
import { cheapestStartDates } from '../lib/tripCostOptimizer.js';
import { carAdvice } from '../lib/transport.js';
import { haversineKm, tripDaysBetween } from '../lib/runtime_pricing.js';
import { eur } from '../lib/format.js';
import { fmtDate } from '../lib/dates.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';
import {
  SparkIcon, CheckIcon, AlertIcon, TrainIcon, CarIcon, InfoIcon,
  MuseumIcon, TreeIcon, DiningIcon, ShoppingIcon, MoonIcon, MasksIcon,
  CameraIcon, CoffeeIcon, CastleIcon, BeachIcon, BallIcon, LotusIcon,
  LeafIcon, ScaleIcon, BoltIcon, StarIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { OriginPicker } from '../components/OriginPicker.jsx';

const STEPS = ['Where', 'When', 'Enjoy', 'Getting there', 'Stay', 'Travel'];
const ROUTES_PREVIEW = 14;
const CITIES_PREVIEW = 8;

// How many highlights Carta schedules per day for each pace when it arranges
// the trip (the traveller can still edit every day afterwards).
const PACE_PER_DAY = { relaxed: 1, balanced: 2, packed: 4 };

// "How do you want to get between your stops?" options (Travel step). The
// planner prices every leg for the chosen style and stays overridable per leg.
const TRANSPORT_CHOICES = [
  { key: 'auto', Icon: SparkIcon, label: 'Carta picks', sub: 'The cheapest sensible option for each leg' },
  { key: 'public', Icon: TrainIcon, label: 'Train & bus', sub: 'No driving, with operator links per country' },
  { key: 'car', Icon: CarIcon, label: 'Car', sub: 'One rental, fuel and tolls split by the group' },
];

// "How full should your days feel?" (Travel step) - used to decide how many
// highlights Carta schedules per day.
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
      {t.key === 'top' && <StarIcon size={8} />}
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
          {dest.beauty?.gems ? <span className="guide-city-gems"><GemIcon size={9} /> {dest.beauty.gems}</span> : null}
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
              <div className="guide-city-fact" key={label}>
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
 * "Let Carta guide you" - a six-step builder that assembles an itinerary:
 *   1. Where are we going?    pick one or more countries (map or flag list)
 *   2. When?                  exact dates, or "I'm flexible" (nights + month)
 *   3. What do you enjoy?     asked EARLY so flights and cities are already
 *      recommended around the traveller's interests
 *   4. Getting there          fly (real Ryanair routes, quality-signalled,
 *      with flight time) or drive from the chosen origin. No route = no fly:
 *      the traveller goes back for other dates/countries, or switches to car
 *   5. Where do you sleep?    every city on a MAP (worth-a-visit tiers) and a
 *      ranked list with smart-combo hints; or one tap lets Carta design it
 *   6. How do you travel?     car vs public transport + pace + group size
 *
 * On finish Carta arranges everything itself: orders the stays into a route
 * flowing from the arrival airport, picks each day's highlights from the
 * chosen interests, and (when flexible) finds the cheapest real fare dates.
 * The parent gets { startDate, groupSize, transport, pace, label, anchorId,
 * stops:[{destinationId, nights, activities}] } and shows the planned trip
 * on the map - still fully editable, and cancellable at any point here.
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

  const [step, setStep] = useState(1);
  const [countries, setCountries] = useState(() => new Set());
  const [dateMode, setDateMode] = useState('exact'); // 'exact' | 'flex'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [flexNights, setFlexNights] = useState(7);
  const [flexMonth, setFlexMonth] = useState(''); // '' = any month
  const [interests, setInterests] = useState(() => new Set()); // enjoyed themes
  // 'fly' = Ryanair route pick, 'car' = drive, 'other' = the traveller books
  // their own flight with another airline (Carta plans stays + ground only).
  const [arriveMode, setArriveMode] = useState('fly');
  const [flyInId, setFlyInId] = useState('');
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [nights, setNights] = useState({});      // { [id]: nights }
  const [order, setOrder] = useState([]);        // included city ids, pick order
  const [staySearch, setStaySearch] = useState('');
  const [stayView, setStayView] = useState('map'); // 'map' | 'list'
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [designedNote, setDesignedNote] = useState(false);
  // "Let Carta pick my cities" mini-questionnaire (open + its three answers).
  const [designQuizOpen, setDesignQuizOpen] = useState(false);
  const [quizStops, setQuizStops] = useState(0); // 0 = Carta decides
  const [quizMust, setQuizMust] = useState(() => new Set()); // must-include ids
  const [groupSize, setGroupSize] = useState(2);
  const [transport, setTransport] = useState('auto'); // 'auto' | 'public' | 'car'
  const [pace, setPace] = useState('balanced');

  const selectedCountries = allCountries.filter((c) => countries.has(c.country));
  const includedIds = order.filter((id) => (nights[id] || 0) > 0);
  const totalNights = includedIds.reduce((sum, id) => sum + (nights[id] || 0), 0);
  const windowNights = dateMode === 'exact' ? tripDaysBetween(startDate, endDate) : flexNights;
  const months = useMemo(() => monthOptions(dateMin, dateMax), [dateMin, dateMax]);

  // Every Ryanair route into the chosen countries for the chosen period,
  // cheapest first. The pick anchors the whole trip.
  const routeOptions = useMemo(() => {
    if (step < 4 || countries.size === 0) return [];
    return flyInOptions(destinations, countries, {
      startDate: dateMode === 'exact' ? startDate : '',
      flexMonth: dateMode === 'flex' ? flexMonth : '',
    });
  }, [step, destinations, countries, dateMode, startDate, flexMonth]);
  const flyIn = routeOptions.find((o) => o.id === flyInId) || null;
  const anchorDest = arriveMode === 'fly' && flyIn ? flyIn.dest : null;
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

  const setCityNights = (id, n) => {
    const v = Math.max(0, Math.min(21, n));
    setNights((prev) => ({ ...prev, [id]: v }));
    setOrder((prev) => {
      const has = prev.includes(id);
      if (v > 0 && !has) return [...prev, id];
      if (v === 0 && has) return prev.filter((x) => x !== id);
      return prev;
    });
  };

  // Map pill tap: in = default nights (gems 1, cities 2), out = zero.
  const toggleCity = (id) => {
    const cur = nights[id] || 0;
    if (cur > 0) setCityNights(id, 0);
    else setCityNights(id, destinations[id]?.tier === 'gem' ? 1 : 2);
  };

  // Carta designs the stays from the interests + arrival + window, steered by
  // the questionnaire: how busy the days should feel, how many stays, and any
  // must-include cities.
  const applyDesign = () => {
    const picks = designStays({
      destinations,
      countries,
      interests,
      anchorDest,
      anchorId: arriveMode === 'fly' ? flyInId : null,
      totalNights: windowNights || 5,
      maxStops: quizStops || null,
      mustIncludeIds: [...quizMust],
    });
    if (!picks.length) return;
    const nextNights = {};
    picks.forEach((p) => { nextNights[p.id] = p.nights; });
    setNights(nextNights);
    setOrder(picks.map((p) => p.id));
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

  const canNext = (
    (step === 1 && countries.size > 0)
    || (step === 2 && (dateMode === 'flex'
      ? flexNights >= 1
      : Boolean(startDate && endDate && windowNights > 0)))
    || (step === 3 && interests.size > 0)
    || (step === 4 && (arriveMode === 'car' || arriveMode === 'other' || flyIn != null))
    || (step === 5 && includedIds.length > 0)
    || step >= 6
  );

  // Choosing to arrive by car implies driving between stops too (they'll have
  // the car); still changeable on the Travel step.
  const pickArriveMode = (mode) => {
    setArriveMode(mode);
    if (mode === 'car') { setFlyInId(''); setTransport('car'); }
  };

  const hasProgress = countries.size > 0 || step > 1;
  const handleCancel = () => {
    if (hasProgress && !window.confirm('Discard this trip and start over later?')) return;
    onCancel();
  };
  const startOver = () => {
    if (!window.confirm('Clear everything and start this trip from scratch?')) return;
    setStep(1);
    setCountries(new Set());
    setDateMode('exact');
    setStartDate('');
    setEndDate('');
    setFlexNights(7);
    setFlexMonth('');
    setInterests(new Set());
    setArriveMode('fly');
    setFlyInId('');
    setShowAllRoutes(false);
    setNights({});
    setOrder([]);
    setStaySearch('');
    setStayView('map');
    setExpandedGroups(new Set());
    setDesignedNote(false);
    setDesignQuizOpen(false);
    setQuizStops(0);
    setQuizMust(new Set());
    setGroupSize(2);
    setTransport('auto');
    setPace('balanced');
  };

  // Data-driven "should this trip have a car?" verdict for the Travel step,
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

  // Carta arranges the trip: route the stays out from the arrival airport,
  // fill each day's highlights from the interests, and (when flexible) pick
  // the cheapest start date with real stored fares.
  const finish = () => {
    const orderedIds = orderStaysFromAnchor(includedIds, destinations, anchorDest);
    const perDay = PACE_PER_DAY[pace] || 2;
    const stops = orderedIds.map((id) => {
      const dest = destinations[id];
      const n = Math.max(1, nights[id] || 1);
      const picks = activitiesForInterests(dest, interests, Math.min(14, n * perDay));
      return { destinationId: id, nights: n, activities: picks.map((a) => a.name) };
    });

    let start = dateMode === 'exact' ? startDate : '';
    if (!start && stops.length && arriveMode === 'fly') {
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
      const candidates = flexMonth
        ? res.candidates.filter((c) => c.start.startsWith(flexMonth))
        : res.candidates;
      start = candidates[0]?.start || flyIn?.cheapest?.date || '';
    }
    // Car trips (or no fare data at all) still need a concrete start date.
    if (!start) start = flexMonth ? `${flexMonth}-05` : (dateMin || '');

    onComplete({
      startDate: start,
      groupSize,
      transport,
      pace,
      anchorId: arriveMode === 'fly' && flyIn ? flyIn.id : null,
      label: selectedCountries.map((c) => c.country).slice(0, 2).join(' & '),
      stops,
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
        rankBase: (dest.beauty?.score || 0)
          + (dest.tier === 'gem' ? 2 : 0)
          + interestFitScore(dest, interests) * 2.5,
      }))
      .filter((cd) => matchesQ(cd.dest))
      .sort((a, b) => {
        if (a.id === flyInId) return -1;
        if (b.id === flyInId) return 1;
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
    if (step !== 5) return [];
    const out = [];
    for (const c of selectedCountries) {
      for (const { id, dest } of c.cities) {
        out.push({
          id,
          city: dest.city,
          lat: dest.lat,
          lon: dest.lon,
          tierKey: cityTier(dest).key,
          selected: (nights[id] || 0) > 0,
          nights: nights[id] || 0,
          isAnchor: id === flyInId && arriveMode === 'fly',
        });
      }
    }
    for (const id of includedIds) {
      if (out.some((o) => o.id === id)) continue;
      const dest = destinations[id];
      if (!dest || dest.lat == null) continue;
      out.push({
        id, city: dest.city, lat: dest.lat, lon: dest.lon,
        tierKey: cityTier(dest).key, selected: true, nights: nights[id] || 0,
        isAnchor: id === flyInId && arriveMode === 'fly',
      });
    }
    return out;
  }, [step, selectedCountries, nights, includedIds, flyInId, arriveMode, destinations]);

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
              isAnchor={cd.id === flyInId && arriveMode === 'fly'}
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
    if (flyInId && step >= 4 && routeOptions.length && !routeOptions.some((o) => o.id === flyInId)) {
      setFlyInId('');
    }
  }, [routeOptions, flyInId, step]);

  return (
    <div className="guide-overlay" onClick={handleCancel}>
      <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header + progress */}
        <div className="guide-head">
          <button className="guide-close" onClick={handleCancel} aria-label="Close">×</button>
          <div className="guide-steps">
            {STEPS.map((label, i) => (
              <div key={label} className={`guide-step-dot ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}>
                <span>{i + 1}</span>{label}
              </div>
            ))}
          </div>
        </div>

        <div className="guide-body">
          {step === 1 && (
            <>
              <h2 className="guide-title">Where are we going?</h2>
              <p className="guide-sub">Tap countries on the map, or pick from the list. You can mix and match, and Carta can design the whole trip inside them for you.</p>
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

          {step === 2 && (
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

          {step === 3 && (
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

          {step === 4 && (
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
                        <span>~{n.km} km, about {n.hours}h of driving</span>
                      </div>
                    ))}
                  </div>
                  <p className="guide-note">
                    <CarIcon size={11} /> Fuel + tolls get priced per leg once your stops are set; no Ryanair fare is needed for this trip.
                  </p>
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
                  <button className="guide-back guide-noflight-back" onClick={() => setStep(2)}>← Change my dates</button>
                </div>
              ) : (
                <>
                  <p className="guide-sub">
                    Real routes{dateMode === 'exact' && startDate ? ` on ${fmtDate(startDate)}` : ''}, cheapest first. Your pick becomes the arrival point of the whole trip.
                  </p>
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
                              <PlaneIcon size={10} /> {o.origin} → {o.anchor}
                              {meta ? `, ~${fmtFlightDuration(meta.min)} in the air` : ''}
                              {o.dest.beauty?.gems ? <>, <GemIcon size={9} /> {o.dest.beauty.gems}</> : null}
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
                              {o.has_exact ? 'that day' : `${fmtDate(o.cheapest.date, true)}`} / person
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

          {step === 5 && (
            <>
              <h2 className="guide-title">Where do you want to sleep?</h2>
              <p className="guide-sub">
                Tap cities on the map or set nights in the list
                {anchorDest ? `, ranked around ${anchorDest.city} and what you enjoy` : ', most special first'}.
                Or let Carta design the whole route.
              </p>

              <button className="guide-design-btn" onClick={() => setDesignQuizOpen((v) => !v)}>
                <SparkIcon size={13} /> Let Carta pick my cities
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
                  <div className="guide-quiz-q">
                    <span className="trip-field-label">How many different stays?</span>
                    <div className="guide-months">
                      <button className={`guide-chip ${quizStops === 0 ? 'on' : ''}`} onClick={() => setQuizStops(0)}>Carta decides</button>
                      {[2, 3, 4, 5].map((n) => (
                        <button key={n} className={`guide-chip ${quizStops === n ? 'on' : ''}`} onClick={() => setQuizStops(n)}>{n}</button>
                      ))}
                    </div>
                  </div>
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
                    <SparkIcon size={12} /> Design my route
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
                  <CityPickerMap cities={mapCities} onToggle={toggleCity} />
                  <div className="guide-tier-legend">
                    <span className="guide-tier guide-tier-top"><StarIcon size={8} /> Must-visit</span>
                    <span className="guide-tier guide-tier-great">Great stop</span>
                    <span className="guide-tier guide-tier-good">Worth a look</span>
                    <span className="guide-tier-legend-note">Tap a city to add or remove it.</span>
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
                            isAnchor={id === flyInId && arriveMode === 'fly'}
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
                        isAnchor={id === flyInId && arriveMode === 'fly'}
                        companions={companionsFor[id]}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 6 && (
            <>
              <h2 className="guide-title">How do you want to travel?</h2>
              <p className="guide-sub">Between your stops, and how full the days should feel. Every leg stays adjustable later.</p>

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

              <div className="guide-transport-grid">
                {TRANSPORT_CHOICES.map((t) => (
                  <button
                    key={t.key}
                    className={`guide-transport ${transport === t.key ? 'on' : ''}`}
                    onClick={() => setTransport(t.key)}
                    aria-pressed={transport === t.key}
                  >
                    <span className="guide-transport-icon"><t.Icon size={18} /></span>
                    <span className="guide-transport-label">
                      {t.label}
                      {advice.verdict === 'yes' && t.key === 'car' && <span className="guide-reco-mark"><SparkIcon size={11} /></span>}
                    </span>
                    <span className="guide-transport-sub">{t.sub}</span>
                  </button>
                ))}
              </div>

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
                  <span className="trip-field-label">People</span>
                  <div className="guide-people">
                    <button type="button" onClick={() => setGroupSize(Math.max(1, groupSize - 1))} disabled={groupSize <= 1} aria-label="Fewer people">-</button>
                    <span>{groupSize}</span>
                    <button type="button" onClick={() => setGroupSize(Math.min(20, groupSize + 1))} disabled={groupSize >= 20} aria-label="More people">+</button>
                  </div>
                </label>
                <div className="guide-start-summary">
                  {includedIds.length} {includedIds.length === 1 ? 'stop' : 'stops'}, {totalNights} nights
                  {dateMode === 'exact' && startDate
                    ? `, leaving ${fmtDate(startDate)}`
                    : `, ${flexMonth ? months.find((m) => m.key === flexMonth)?.label : 'any month'}, Carta picks the cheapest dates`}
                  {anchorDest ? `, landing in ${anchorDest.city}`
                    : arriveMode === 'car' ? `, driving from ${originCity}`
                    : arriveMode === 'other' ? ', flying with your own airline' : ''}
                </div>
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
            {step > 1 && <button className="guide-back" onClick={() => setStep(step - 1)}>Back</button>}
            {step === 4 && arriveMode === 'fly' && routeOptions.length === 0 ? (
              // No Ryanair route: the way forward is booking your own flight.
              <button
                className="guide-next"
                onClick={() => { setArriveMode('other'); setStep(5); }}
              >
                I fly with another airline →
              </button>
            ) : step < 6 ? (
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
