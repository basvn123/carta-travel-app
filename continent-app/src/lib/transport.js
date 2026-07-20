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

const DETOUR = 1.3;             // road km vs straight-line (matches car_layer.py)
const TRAIN = { kmh: 95, eurPerKm: 0.15, floor: 8, overheadH: 0.4 };
const BUS = { kmh: 68, eurPerKm: 0.075, floor: 5, overheadH: 0.5 };
const CAR = { kmh: 82 };
const LONG_HAUL_KM = 800;       // beyond this, overland stops being sensible


// A bare "lat,lng" endpoint shows up in Google Maps as a nameless "Dropped
// pin"; a "City, Country" query geocodes to the real place. gmapsName (an
// exact stay address, say) overrides the city pair; when it's present but
// empty the point deliberately falls back to coordinates.
function gmapsPoint(p) {
  const name = p.gmapsName ?? (p.city && p.country ? `${p.city}, ${p.country}` : '');
  return name ? encodeURIComponent(name) : `${p.lat},${p.lon}`;
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
export function legTransportOptions(destA, destB, groupSize = 1, { carModel = null, countryInsights = null } = {}) {
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

  // Train ---------------------------------------------------------------
  const trainPp = Math.max(TRAIN.floor, TRAIN.eurPerKm * roadKm);
  const trainLinks = [];
  if (insA?.rail?.url && insA?.rail?.operator) {
    trainLinks.push({ label: insA.rail.operator, url: insA.rail.url });
  }
  if (crossBorder && insB?.rail?.url && insB?.rail?.operator && insB.rail.url !== insA?.rail?.url) {
    trainLinks.push({ label: insB.rail.operator, url: insB.rail.url });
  }
  trainLinks.push({ label: 'Google Maps (transit)', url: gmapsDir(destA, destB, 'transit') });
  const train = {
    eur_pp: round2(trainPp),
    eur_total: round2(trainPp * group),
    hours: round2(roadKm / TRAIN.kmh + TRAIN.overheadH),
    links: trainLinks,
    note: insA?.rail?.note || null,
  };

  // Bus -----------------------------------------------------------------
  const busPp = Math.max(BUS.floor, BUS.eurPerKm * roadKm);
  const busOperators = (insA?.bus?.operators || []).slice(0, 2).join(', ') || 'FlixBus';
  const bus = {
    eur_pp: round2(busPp),
    eur_total: round2(busPp * group),
    hours: round2(roadKm / BUS.kmh + BUS.overheadH),
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

  // Recommendation: cheapest per person, with a small value-of-time nudge so
  // a marginally-cheaper 9h bus doesn't beat a 4h train, and the car's group
  // economics can win for full cars.
  const score = (m) => m.eur_pp + m.hours * 3;
  const modes = { train, bus, car };
  // Same honesty rule the day planner applies: where either end has no real
  // rail (transit_quality 'poor'), don't offer, let alone recommend, a train.
  const trainDropped = ltA.transit_quality === 'poor' || ltB.transit_quality === 'poor';
  if (trainDropped) delete modes.train;
  const recommended = Object.entries(modes).sort((a, b) => score(a[1]) - score(b[1]))[0][0];

  return {
    straight_km: Math.round(straightKm),
    road_km: Math.round(roadKm),
    no_road: false,
    long_haul: roadKm > LONG_HAUL_KM,
    modes,
    train_dropped: trainDropped,
    recommended,
    note: null,
    estimated: true,
  };
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
