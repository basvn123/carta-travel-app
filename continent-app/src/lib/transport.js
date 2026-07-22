/**
 * transport.js, per-leg overland transport options between two stops.
 *
 * For every consecutive pair of stops the planner offers THREE priced ways to
 * travel (train / bus / car), each an honest distance-based ESTIMATE (there is
 * no free live intercity fare API), plus deep links to check & book the real
 * thing: the departure country's rail operator (from country_insights), FlixBus,
 * and Google Maps directions. Car costs come from the pipeline's car_model
 * (per-country petrol prices, EUR/100km tolls), split across the group, which
 * is exactly why a car often wins for 3-4 people and loses for solo travellers.
 */
import { haversineKm, withCityCoords } from './runtime_pricing.js';
import { round2 } from './math.js';
import { transportProfile, legRailQuality, RAIL_SCORE_BONUS } from './countryTransport.js';

const DETOUR = 1.3;             // road km vs straight-line (matches car_layer.py)
const CAR = { kmh: 82 };
const LONG_HAUL_KM = 800;       // beyond this, overland stops being sensible
// What an hour of travel time is worth when ranking modes, EUR. At the old
// value (3) a 5-euro-cheaper bus outranked a train that saves an hour on
// every short hop, which is not how anyone actually travels Ghent -> Antwerp.
const VALUE_OF_TIME_EUR_H = 6;


// Encode a stop as a bare "lat,lng". A place-name query ("City, Country", a
// stay address) can fail to geocode and drop the traveller on a Google Maps
// "can't find this place" search page with no route; a coordinate always
// resolves to that exact spot and always draws the route. Callers pass
// city-centre coordinates already (legTransportOptions runs withCityCoords),
// so the pin is downtown, never the runway.
function gmapsPoint(p) {
  return `${p.lat},${p.lon}`;
}

function gmapsDir(a, b, mode) {
  return `https://www.google.com/maps/dir/?api=1&origin=${gmapsPoint(a)}&destination=${gmapsPoint(b)}&travelmode=${mode}`;
}

/** The insight record for a destination's country (or null). */
export function insightFor(dest, countryInsights) {
  return (dest && countryInsights && countryInsights[dest.country]) || null;
}

/**
 * All transport options for the leg destA -> destB.
 *
 * @param carModel        data.meta.car_model (petrol/toll/rental tables)
 * @param countryInsights country name -> insight record (may be null; links degrade)
 * @returns null when either endpoint has no coordinates; `{ ferry: true }`-ish
 *          shape (modes: {}) when there's no road link (sea crossing).
 */
export function legTransportOptions(destA, destB, groupSize = 1, { carModel = null, countryInsights = null, hasCar = false } = {}) {
  // Ground legs run town to town: for airport-tier stops the raw lat/lon is
  // the runway (Skavsta is 90 km from Stockholm), so measure from the city
  // centre instead, the flight is the only leg that belongs at the airport.
  destA = withCityCoords(destA);
  destB = withCityCoords(destB);
  if (!destA || !destB || destA.lat == null || destB.lat == null) return null;
  const group = Math.max(1, groupSize || 1);

  const straightKm = haversineKm(destA.lat, destA.lon, destB.lat, destB.lon);
  if (straightKm == null) return null;

  const ltA = destA.local_transport || {};
  const ltB = destB.local_transport || {};
  if (ltA.road_connected === false || ltB.road_connected === false) {
    return {
      straight_km: Math.round(straightKm),
      road_km: null,
      no_road: true,
      long_haul: false,
      modes: {},
      recommended: null,
      note: 'No overland route (sea crossing). Look at ferries or a flight.',
      estimated: true,
    };
  }

  const roadKm = straightKm * DETOUR;
  const insA = insightFor(destA, countryInsights);
  const insB = insightFor(destB, countryInsights);
  const crossBorder = destA.country !== destB.country;
  // Per-country network profiles (speed, fare level, frequency overhead):
  // a Belgian intercity hop and a Croatian coastal one are different products.
  const profA = transportProfile(destA.iso2);
  const profB = transportProfile(destB.iso2);
  const railQuality = legRailQuality(destA.iso2, destB.iso2);

  // Train ---------------------------------------------------------------
  const railKmh = (profA.railKmh + profB.railKmh) / 2;
  const railEur = (profA.railEur + profB.railEur) / 2;
  const railOverheadH = (profA.railOverheadH + profB.railOverheadH) / 2;
  // Fare floor scales with the network's price level (a Polish minimum fare
  // is not a Swiss one): ~40 km worth of that country's per-km rate, min EUR 4.
  const trainPp = railEur === 0 ? 0 : Math.max(4, railEur * 40, railEur * roadKm);
  const trainLinks = [];
  if (insA?.rail?.url && insA?.rail?.operator) {
    trainLinks.push({ label: insA.rail.operator, url: insA.rail.url });
  }
  if (crossBorder && insB?.rail?.url && insB?.rail?.operator && insB.rail.url !== insA?.rail?.url) {
    trainLinks.push({ label: insB.rail.operator, url: insB.rail.url });
  }
  trainLinks.push({ label: 'Google Maps (transit)', url: gmapsDir(destA, destB, 'transit') });
  const train = railQuality === 'none' ? null : {
    eur_pp: round2(trainPp),
    eur_total: round2(trainPp * group),
    hours: round2(roadKm / railKmh + railOverheadH),
    links: trainLinks,
    note: insA?.rail?.note || null,
  };

  // Bus -----------------------------------------------------------------
  const busKmh = (profA.busKmh + profB.busKmh) / 2;
  const busEurKm = (profA.busEur + profB.busEur) / 2;
  const busOverheadH = (profA.busOverheadH + profB.busOverheadH) / 2;
  const busPp = busEurKm === 0 ? 0 : Math.max(3, busEurKm * roadKm);
  const busOperators = (insA?.bus?.operators || []).slice(0, 2).join(', ') || 'FlixBus';
  const bus = {
    eur_pp: round2(busPp),
    eur_total: round2(busPp * group),
    hours: round2(roadKm / busKmh + busOverheadH),
    links: [
      { label: busOperators, url: insA?.bus?.url || 'https://www.flixbus.com' },
      { label: 'Google Maps (transit)', url: gmapsDir(destA, destB, 'transit') },
    ],
    note: insA?.bus?.note || null,
  };

  // Car -----------------------------------------------------------------
  const cm = carModel || {};
  const fuelByIso = cm.fuel_price_by_iso2 || {};
  const petrolA = fuelByIso[destA.iso2] ?? cm.fuel_price_eur_per_l ?? 1.8;
  const petrolB = fuelByIso[destB.iso2] ?? cm.fuel_price_eur_per_l ?? 1.8;
  const petrol = (petrolA + petrolB) / 2;
  const lPer100 = cm.consumption_l_per_100km ?? 6.5;
  // Big groups fill more than one car, fuel and tolls scale with car count
  // (previously this leg quietly assumed a single car for any group size).
  const cars = Math.max(1, Math.ceil(group / Math.max(1, cm.car_capacity || 4)));
  const fuelEur = cars * (roadKm / 100) * lPer100 * petrol;
  // Per-leg tolls: the leg's endpoint countries priced at the toll layer's
  // real per-country rates (avg of both ends), not the old flat 2.2/100 km.
  const tollRates = cm.toll_model?.distance_rates_eur_per_100km;
  const tollRate = tollRates
    ? ((tollRates[destA.iso2] ?? 0) + (tollRates[destB.iso2] ?? 0)) / 2
    : (cm.toll_eur_per_100km ?? 2.2);
  const tollEur = cars * (roadKm / 100) * tollRate;
  const carTotal = fuelEur + tollEur;
  const vignettes = [];
  for (const ins of crossBorder ? [insA, insB] : [insA]) {
    const v = ins?.driving?.vignette;
    if (v && !vignettes.includes(v)) vignettes.push(v);
  }
  const car = {
    eur_pp: round2(carTotal / group),
    eur_total: round2(carTotal),
    fuel_eur: round2(fuelEur),
    toll_eur: round2(tollEur),
    hours: round2(roadKm / CAR.kmh),
    links: [{ label: 'Google Maps (drive)', url: gmapsDir(destA, destB, 'driving') }],
    vignettes,
    note: vignettes.length ? `Vignette: ${vignettes.join(', ')}` : null,
  };

  // Recommendation: cheapest per person with a value-of-time nudge, plus the
  // leg's rail-quality bonus/penalty. On a dense network (Belgium, Holland,
  // Germany...) the train's frequency and centre-to-centre arrival are worth
  // real money the bare price+hours score can't see - that's what makes
  // Ghent -> Antwerp a train, not the marginally cheaper bus. On a skeletal
  // network the same honesty counts against the train.
  //
  // The car's fuel-split price only exists if there IS a car: unless the trip
  // says so (hasCar: a rental or the traveller's own car), recommending it
  // sells a mode the traveller would first have to go and arrange, so it
  // carries an arrangement friction. It stays offered - just not Carta's pick.
  const score = (m, key) => m.eur_pp + m.hours * VALUE_OF_TIME_EUR_H
    + (key === 'train' ? (RAIL_SCORE_BONUS[railQuality] || 0) : 0)
    + (key === 'car' && !hasCar ? 8 : 0);
  const modes = { ...(train ? { train } : {}), bus, car };
  // Same honesty rule the day planner applies: where either end has no real
  // rail (transit_quality 'poor'), don't offer, let alone recommend, a train.
  const trainDropped = !train
    || ltA.transit_quality === 'poor' || ltB.transit_quality === 'poor';
  if (trainDropped) delete modes.train;
  const recommended = Object.entries(modes)
    .sort((a, b) => score(a[1], a[0]) - score(b[1], b[0]))[0][0];

  return {
    straight_km: Math.round(straightKm),
    road_km: Math.round(roadKm),
    no_road: false,
    long_haul: roadKm > LONG_HAUL_KM,
    modes,
    train_dropped: trainDropped,
    rail_quality: railQuality,
    recommended,
    note: null,
    estimated: true,
  };
}

/** Of a leg's public modes, the one Carta would pick (the trip planner's
 *  "Train & bus" preference): the recommended mode when it's already public,
 *  else the better-scoring of train and bus. */
export function preferredPublicMode(opts) {
  if (!opts || !opts.modes) return null;
  if (opts.recommended && opts.recommended !== 'car' && opts.modes[opts.recommended]) {
    return opts.recommended;
  }
  const { train, bus } = opts.modes;
  if (train && bus) {
    const s = (m) => m.eur_pp + m.hours * VALUE_OF_TIME_EUR_H;
    return s(train) <= s(bus) ? 'train' : 'bus';
  }
  return train ? 'train' : (bus ? 'bus' : null);
}

// --- Airport <-> accommodation transfer -----------------------------------
// The leg from the plane to where you sleep is NOT an inter-city drive: you
// just landed, so unless you rented a car you don't have one. The honest ways
// to cover it are public transport (airport train / bus / shuttle), a taxi or
// rideshare, or - only when the trip includes a rental you collect at the
// airport - that car (fuel for the short hop; its day rate is a separate line).
// It must NEVER be priced as your own car with tolls, which is what the generic
// legTransportOptions recommender does for a short hop, and the very thing that
// made the transfer read as "you drive from the airport" when you flew in.
const TRANSFER = {
  publicEurPerKm: 0.15, publicFloor: 10, publicCap: 60, publicKmh: 42, publicOverheadH: 0.35,
  taxiBase: 4, taxiPerKm: 2.0, taxiMin: 14, taxiKmh: 55, taxiMaxKm: 90,
  rentalKmh: 70,
};

/** Priced transfer modes for a `roadKm` airport hop, `groupSize` people.
 *  petrol/consumption/capacity come from the car model; `hasRental` toggles the
 *  "drive the car you rented" option; `transitPoor` drops public transport
 *  where the stay has no real rail/bus; `publicOverride` pins the per-person
 *  public fare to one we already stored (a destination's own
 *  ground_transport_one_way_eur) instead of re-deriving it from distance.
 *  Returns `{ road_km, modes: { public?, taxi?, rental? }, recommended,
 *  estimated }`. */
export function transferModesFromKm(roadKm, groupSize = 1, {
  petrol = 1.8, consumption = 6.5, capacity = 4, hasRental = false,
  transitPoor = false, publicOverride = null,
} = {}) {
  const group = Math.max(1, groupSize || 1);
  const km = Math.max(0.5, roadKm || 0);
  const cap = Math.max(1, capacity || 4);

  const publicPp = publicOverride != null
    ? publicOverride
    : Math.min(TRANSFER.publicCap, Math.max(TRANSFER.publicFloor, TRANSFER.publicEurPerKm * km));
  const publicMode = {
    mode: 'public',
    eur_pp: round2(publicPp),
    eur_total: round2(publicPp * group),
    hours: round2(km / TRANSFER.publicKmh + TRANSFER.publicOverheadH),
  };

  // Taxi / rideshare is priced per cab (up to `cap` seats), so a family splits
  // one fare rather than paying a "per person" rate that doesn't exist.
  const cabs = Math.max(1, Math.ceil(group / cap));
  const perCab = Math.max(TRANSFER.taxiMin, TRANSFER.taxiBase + TRANSFER.taxiPerKm * km);
  const taxiTotal = perCab * cabs;
  const taxiMode = {
    mode: 'taxi',
    eur_pp: round2(taxiTotal / group),
    eur_total: round2(taxiTotal),
    cabs,
    hours: round2(km / TRANSFER.taxiKmh),
  };

  const modes = {};
  if (!transitPoor) modes.public = publicMode;          // no train/bus where transit is poor
  if (km <= TRANSFER.taxiMaxKm) modes.taxi = taxiMode;   // nobody taxis 200 km

  if (hasRental) {
    const cars = Math.max(1, Math.ceil(group / cap));
    const fuel = cars * (km / 100) * consumption * petrol;
    modes.rental = {
      mode: 'rental',
      eur_pp: round2(fuel / group),
      eur_total: round2(fuel),
      hours: round2(km / TRANSFER.rentalKmh),
      included_with_rental: true,
    };
  }

  // Carta's default: the car you already rented if you have one, otherwise the
  // cheapest sensible public option, falling back to a taxi where there's no
  // public transport at all.
  const recommended = modes.rental ? 'rental' : (modes.public ? 'public' : 'taxi');
  return { road_km: Math.round(km), modes, recommended, estimated: true };
}

/** Airport-transfer options between a fly-in airport city and the stay it
 *  serves (or the last stop and the fly-home airport). Measured centre to
 *  centre, the same withCityCoords rule the rest of the planner uses, and
 *  priced with transferModesFromKm so it can never come out as "your own car".
 *  @returns the transferModesFromKm shape plus `straight_km` and per-mode
 *           `links`, or null when either endpoint lacks coordinates. */
export function airportTransferOptions(fromDest, toDest, groupSize = 1, { carModel = null, hasRental = false } = {}) {
  fromDest = withCityCoords(fromDest);
  toDest = withCityCoords(toDest);
  if (!fromDest || !toDest || fromDest.lat == null || toDest.lat == null) return null;
  const straightKm = haversineKm(fromDest.lat, fromDest.lon, toDest.lat, toDest.lon);
  if (straightKm == null) return null;
  const roadKm = straightKm * DETOUR;
  const cm = carModel || {};
  const fuelByIso = cm.fuel_price_by_iso2 || {};
  const petrol = fuelByIso[toDest.iso2] ?? cm.fuel_price_eur_per_l ?? 1.8;
  // If EITHER end has no real rail/bus, don't pretend a public transfer exists.
  const transitPoor = (fromDest.local_transport || {}).transit_quality === 'poor'
    || (toDest.local_transport || {}).transit_quality === 'poor';
  const opts = transferModesFromKm(roadKm, groupSize, {
    petrol,
    consumption: cm.consumption_l_per_100km ?? 6.5,
    capacity: cm.car_capacity ?? 4,
    hasRental,
    transitPoor,
  });
  opts.straight_km = Math.round(straightKm);
  const links = [
    { label: 'Google Maps (transit)', url: gmapsDir(fromDest, toDest, 'transit') },
    { label: 'Google Maps (taxi/drive)', url: gmapsDir(fromDest, toDest, 'driving') },
  ];
  for (const m of Object.values(opts.modes)) m.links = links;
  return opts;
}

/**
 * Should this trip have a car? Looks at how many stops are genuinely hard
 * without one (local_transport.car_needed) and at the group size, and returns
 * a recommendation the wizard/planner can show, with the reasons.
 *
 * @param dests array of destination records (the trip's stops, in order)
 * @returns { verdict: 'yes'|'maybe'|'no', carStops: [city], reasons: [..] }
 */
export function carAdvice(dests, groupSize = 1, countryInsights = null) {
  const stops = (dests || []).filter(Boolean);
  if (!stops.length) return { verdict: 'no', carStops: [], reasons: [] };

  const carStops = stops.filter((d) => d.local_transport?.car_needed).map((d) => d.city);
  const reasons = [];

  if (carStops.length) {
    reasons.push(`${carStops.length} of your ${stops.length} ${stops.length === 1 ? 'stop is' : 'stops are'} hard to reach or explore without a car: ${carStops.slice(0, 4).join(', ')}${carStops.length > 4 ? '…' : ''}.`);
  }
  const countries = [...new Set(stops.map((d) => d.country))];
  for (const c of countries) {
    const ins = countryInsights?.[c];
    if (ins?.driving?.car_recommended_for) {
      reasons.push(`${c}: a car shines for ${ins.driving.car_recommended_for}.`);
    }
  }
  if (groupSize >= 3) {
    reasons.push(`With ${groupSize} people, fuel + tolls split ${groupSize} ways often beats ${groupSize} train tickets.`);
  }

  const share = carStops.length / stops.length;
  const verdict = share >= 0.4 ? 'yes' : (carStops.length > 0 || groupSize >= 4) ? 'maybe' : 'no';
  return { verdict, carStops, reasons };
}

/** Rental-car cost for the whole trip (group total), from the pipeline's
 *  car_model: per-country day rate x seasonality x weekly discount. Groups
 *  bigger than one car's capacity pay for as many cars as they fill, the
 *  same carsForGroup rule the Map tab's pricing applies. */
export function rentalEstimate(carModel, iso2, days, startDate, groupSize = 1) {
  if (!carModel || !days || days <= 0) return null;
  const byIso = carModel.rental_eur_per_day_by_iso2 || {};
  let rate = byIso[iso2] ?? carModel.rental_eur_per_day_default ?? 40;
  const month = startDate ? Number(startDate.slice(5, 7)) : null;
  const season = month ? (carModel.rental_seasonality?.[String(month)] ?? 1) : 1;
  rate *= season;
  const cars = Math.max(1, Math.ceil((groupSize || 1) / Math.max(1, carModel.car_capacity || 4)));
  let total = rate * days * cars;
  if (days >= 7 && carModel.rental_weekly_discount_pct) {
    total *= 1 - carModel.rental_weekly_discount_pct / 100;
  }
  return { eur_total: round2(total), eur_per_day: round2(total / days), days, cars };
}
