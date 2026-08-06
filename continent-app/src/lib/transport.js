/**
 * transport.js, per-leg overland transport options between two stops.
 *
 * For every consecutive pair of stops the planner offers THREE priced ways to
 * travel (train / bus / car), each an honest distance-based ESTIMATE (there is
 * no free live intercity fare API), plus deep links to check & book the real
 * thing: Omio (affiliate-tagged, first when configured, see omio.js), the
 * departure country's rail operator (from country_insights), FlixBus,
 * and Google Maps directions. Car costs come from the pipeline's car_model
 * (per-country petrol prices, EUR/100km tolls), split across the group, which
 * is exactly why a car often wins for 3-4 people and loses for solo travellers.
 */
import { haversineKm, withCityCoords } from './runtime_pricing.js';
import { round2 } from './math.js';
import { transportProfile, legRailQuality, RAIL_SCORE_BONUS, landmassOf } from './countryTransport.js';
import { buildOmioLink } from './omio.js';
import { resolveGroundFare } from './groundFares.js';
import { isNum } from '../map/coords.js';

const DETOUR = 1.3;             // road km vs straight-line (matches car_layer.py)
// Rail follows its own alignment, not the road network: dividing ROAD km
// (already x1.3) by train speed systematically overstated every rail leg.
const RAIL_DETOUR = 1.17;
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

// The affiliate-tagged Omio link for a leg, as a spreadable links-array
// fragment: one entry when a tracking link is configured and the route is
// expressible, empty otherwise so every links array keeps its current shape.
function omioLeg(a, b, mode) {
  const url = buildOmioLink({ fromCity: a.city, toCity: b.city, mode, subId: 'leg' });
  return url ? [{ label: 'Omio', url }] : [];
}

// One flat 82 km/h made a 60 km hop and a 600 km motorway run the same speed.
// Short legs are mostly urban egress and N-roads; long ones are mostly
// motorway. The +0.15 h is getting out of town and parked at the far end.
function carHours(roadKm) {
  const kmh = roadKm <= 60 ? 65 : roadKm <= 150 ? 74 : roadKm <= 400 ? 84 : 93;
  return roadKm / kmh + 0.15;
}

/** Fuel + tolls for a road leg, split into as many cars as the group fills. */
function carCosts(destA, destB, roadKm, group, carModel) {
  const cm = carModel || {};
  const fuelByIso = cm.fuel_price_by_iso2 || {};
  const petrolA = fuelByIso[destA.iso2] ?? cm.fuel_price_eur_per_l ?? 1.8;
  const petrolB = fuelByIso[destB.iso2] ?? cm.fuel_price_eur_per_l ?? 1.8;
  const petrol = (petrolA + petrolB) / 2;
  const lPer100 = cm.consumption_l_per_100km ?? 6.5;
  const cars = Math.max(1, Math.ceil(group / Math.max(1, cm.car_capacity || 4)));
  const fuelEur = cars * (roadKm / 100) * lPer100 * petrol;
  const tollRates = cm.toll_model?.distance_rates_eur_per_100km;
  const tollRate = tollRates
    ? ((tollRates[destA.iso2] ?? 0) + (tollRates[destB.iso2] ?? 0)) / 2
    : (cm.toll_eur_per_100km ?? 2.2);
  const tollEur = cars * (roadKm / 100) * tollRate;
  return { cars, fuelEur, tollEur };
}

// --- Priced sea crossings --------------------------------------------------
// The Channel and the Irish Sea are the two sea gaps people genuinely cross
// "overland-style": a train through the tunnel, a coach on a ferry, or the
// car on LeShuttle / a ferry deck. Returning "no route" here hid Eurostar
// from a Ghent traveller heading to London. Other island gaps (Sicily, the
// Balearics, the Azores...) stay unpriced: their ferry networks are too
// varied to estimate honestly and a flight usually wins anyway.
const EUROSTAR_COUNTRIES = new Set(['FR', 'BE', 'NL', 'DE']);

function seaCrossingOptions(lmA, lmB, destA, destB, straightKm, group, { carModel = null, hasCar = false } = {}) {
  const pair = [lmA, lmB].sort().join('|');
  const channel = pair === 'britain|continent';
  const irishSea = pair === 'britain|ireland';
  if (!channel && !irishSea) return null;
  // Road km via the real crossing port (Calais, or Holyhead / Cairnryan),
  // a bigger detour than an ordinary road leg.
  const roadKm = straightKm * (channel ? 1.35 : 1.4);
  const modes = {};

  const sea = channel ? 'channel' : 'irishsea';
  if (channel) {
    const continentIso = lmA === 'continent' ? destA.iso2 : destB.iso2;
    if (EUROSTAR_COUNTRIES.has(continentIso)) {
      // Advance-fare band: London to Brussels/Paris runs about EUR 60 to 120
      // booked ahead; domestic rail on either side scales with distance.
      const fare = resolveGroundFare({ mode: 'train', sea, km: straightKm, straightKm });
      modes.train = {
        eur_pp: round2(fare.eur),
        eur_total: round2(fare.eur * group),
        hours: round2((straightKm * RAIL_DETOUR) / 140 + 1.3),
        links: [
          ...omioLeg(destA, destB, 'train'),
          { label: 'Eurostar', url: 'https://www.eurostar.com' },
          { label: 'Google Maps (transit)', url: gmapsDir(destA, destB, 'transit') },
        ],
        note: 'Eurostar through the Channel Tunnel. Book ahead: walk-up fares run far higher.',
        est: fare.est,
        src: fare.src,
      };
    }
    const busFare = resolveGroundFare({ mode: 'bus', sea, km: roadKm, straightKm });
    modes.bus = {
      eur_pp: round2(busFare.eur),
      eur_total: round2(busFare.eur * group),
      hours: round2(roadKm / 55 + 1.5),
      links: [
        ...omioLeg(destA, destB, 'bus'),
        { label: 'FlixBus', url: 'https://www.flixbus.com' },
        { label: 'Google Maps (transit)', url: gmapsDir(destA, destB, 'transit') },
      ],
      note: 'The coach crosses by ferry or LeShuttle; the crossing is included in the fare.',
      est: busFare.est,
      src: busFare.src,
    };
  } else {
    // Rail & Sail (train + ferry through Holyhead or Fishguard) is a real,
    // famously cheap through-ticket; so are the coach-and-ferry combos.
    const fare = resolveGroundFare({ mode: 'train', sea, km: straightKm, straightKm });
    modes.train = {
      eur_pp: round2(fare.eur),
      eur_total: round2(fare.eur * group),
      hours: round2(roadKm / 75 + 3),
      links: [
        // The multimode /travel/ page: no train crosses the Irish Sea, so the
        // per-mode /trains/ route page would be the wrong landing spot here.
        ...omioLeg(destA, destB, null),
        { label: 'Rail & Sail (Irish Ferries)', url: 'https://www.irishferries.com' },
        { label: 'Stena Line', url: 'https://www.stenaline.com' },
      ],
      note: 'Rail & Sail through-tickets combine the train and the ferry crossing.',
      est: fare.est,
      src: fare.src,
    };
    const busFare = resolveGroundFare({ mode: 'bus', sea, km: roadKm, straightKm });
    modes.bus = {
      eur_pp: round2(busFare.eur),
      eur_total: round2(busFare.eur * group),
      hours: round2(roadKm / 55 + 3.5),
      links: [
        ...omioLeg(destA, destB, null),
        { label: 'FlixBus', url: 'https://www.flixbus.com' },
        { label: 'Google Maps (transit)', url: gmapsDir(destA, destB, 'transit') },
      ],
      note: 'Coach-and-ferry through-fares include the crossing.',
      est: busFare.est,
      src: busFare.src,
    };
  }

  const { cars, fuelEur, tollEur } = carCosts(destA, destB, roadKm, group, carModel);
  const ferryFare = resolveGroundFare({ mode: 'ferry', sea, km: roadKm, straightKm });
  const ferryEur = cars * ferryFare.eur;
  const carTotal = fuelEur + tollEur + ferryEur;
  modes.car = {
    eur_pp: round2(carTotal / group),
    eur_total: round2(carTotal),
    fuel_eur: round2(fuelEur),
    toll_eur: round2(tollEur),
    ferry_eur: round2(ferryEur),
    hours: round2(carHours(roadKm) + (channel ? 2 : 3.5)),
    links: [
      channel
        ? { label: 'LeShuttle', url: 'https://www.leshuttle.com' }
        : { label: 'Stena Line', url: 'https://www.stenaline.com' },
      { label: 'Google Maps (drive)', url: gmapsDir(destA, destB, 'driving') },
    ],
    vignettes: [],
    note: channel
      ? 'Includes the Channel crossing (LeShuttle or the Dover to Calais ferry, roughly EUR 60 to 150 per car each way).'
      : 'Includes the car-ferry crossing (roughly EUR 100 to 160 per car each way).',
    est: true,
    src: 'model',
  };

  const score = (m, key) => m.eur_pp + m.hours * VALUE_OF_TIME_EUR_H
    + (key === 'car' && !hasCar ? 8 : 0);
  const recommended = Object.entries(modes)
    .sort((a, b) => score(a[1], a[0]) - score(b[1], b[0]))[0][0];

  return {
    straight_km: Math.round(straightKm),
    road_km: Math.round(roadKm),
    no_road: false,
    sea_crossing: true,
    long_haul: roadKm > LONG_HAUL_KM,
    modes,
    recommended,
    note: channel
      ? 'This leg crosses the Channel.'
      : 'This leg crosses the Irish Sea by ferry.',
    estimated: true,
  };
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
  // Number.isFinite, not `!= null`: a NaN coordinate used to sail through the
  // null check and price every mode of the leg as NaN (the coords.js lesson).
  if (!destA || !destB || !isNum(destA.lat) || !isNum(destA.lon)
    || !isNum(destB.lat) || !isNum(destB.lon)) return null;
  const group = Math.max(1, groupSize || 1);

  const straightKm = haversineKm(destA.lat, destA.lon, destB.lat, destB.lon);
  if (!isNum(straightKm)) return null;

  const ltA = destA.local_transport || {};
  const ltB = destB.local_transport || {};
  // Overland exists iff both stops share a landmass. The raw road_connected
  // flag means "no road from mainland Europe" and, read per endpoint, it
  // declared London -> Edinburgh a sea crossing; landmassOf() knows Great
  // Britain, Ireland, Sicily etc are each one drivable landmass.
  const lmA = landmassOf(destA);
  const lmB = landmassOf(destB);
  if (lmA !== lmB) {
    const sea = seaCrossingOptions(lmA, lmB, destA, destB, straightKm, group, { carModel, hasCar });
    if (sea) return sea;
    const irelandContinent = [lmA, lmB].sort().join('|') === 'continent|ireland';
    return {
      straight_km: Math.round(straightKm),
      road_km: null,
      no_road: true,
      long_haul: false,
      modes: {},
      recommended: null,
      note: irelandContinent
        ? 'No practical overland route. Direct ferries sail France to Ireland (Cherbourg or Roscoff to Dublin or Rosslare, 17 to 19 h with a car); without one, a flight is almost always the sensible choice.'
        : 'No overland route (sea crossing). Look at ferries or a flight.',
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
  // A 'poor' transit endpoint (rural village, no proper station) makes the
  // train slower to reach, and on weak national networks not worth offering;
  // on an excellent/good network the village usually still has its stop, so
  // the train stays but carries extra access overhead.
  const poorEnd = ltA.transit_quality === 'poor' || ltB.transit_quality === 'poor';
  const railKm = straightKm * RAIL_DETOUR;
  const railKmh = (profA.railKmh + profB.railKmh) / 2;
  const railOverheadH = (profA.railOverheadH + profB.railOverheadH) / 2
    + (poorEnd ? 0.35 : 0);
  // Fare via the resolver: real quote, then calibration, then the country
  // profile priors (a per-km rate with a floor of ~40 km at that rate, min
  // EUR 4, averaged across both endpoint networks).
  const trainFare = resolveGroundFare({
    mode: 'train', isoA: destA.iso2, isoB: destB.iso2, km: railKm, straightKm,
  });
  const trainLinks = [...omioLeg(destA, destB, 'train')];
  if (insA?.rail?.url && insA?.rail?.operator) {
    trainLinks.push({ label: insA.rail.operator, url: insA.rail.url });
  }
  if (crossBorder && insB?.rail?.url && insB?.rail?.operator && insB.rail.url !== insA?.rail?.url) {
    trainLinks.push({ label: insB.rail.operator, url: insB.rail.url });
  }
  trainLinks.push({ label: 'Google Maps (transit)', url: gmapsDir(destA, destB, 'transit') });
  const train = railQuality === 'none' || !trainFare ? null : {
    eur_pp: round2(trainFare.eur),
    eur_total: round2(trainFare.eur * group),
    hours: round2(railKm / railKmh + railOverheadH),
    links: trainLinks,
    note: insA?.rail?.note || null,
    est: trainFare.est,
    src: trainFare.src,
  };

  // Bus -----------------------------------------------------------------
  const busKmh = (profA.busKmh + profB.busKmh) / 2;
  const busOverheadH = (profA.busOverheadH + profB.busOverheadH) / 2;
  const busFare = resolveGroundFare({
    mode: 'bus', isoA: destA.iso2, isoB: destB.iso2, km: roadKm, straightKm,
  });
  const busOperators = (insA?.bus?.operators || []).slice(0, 2).join(', ') || 'FlixBus';
  const bus = {
    eur_pp: round2(busFare.eur),
    eur_total: round2(busFare.eur * group),
    hours: round2(roadKm / busKmh + busOverheadH),
    links: [
      ...omioLeg(destA, destB, 'bus'),
      { label: busOperators, url: insA?.bus?.url || 'https://www.flixbus.com' },
      { label: 'Google Maps (transit)', url: gmapsDir(destA, destB, 'transit') },
    ],
    note: insA?.bus?.note || null,
    est: busFare.est,
    src: busFare.src,
  };

  // Car -----------------------------------------------------------------
  // Big groups fill more than one car, fuel and tolls scale with car count;
  // toll rates come from the toll layer's real per-country figures.
  const { fuelEur, tollEur } = carCosts(destA, destB, roadKm, group, carModel);
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
    hours: round2(carHours(roadKm)),
    links: [{ label: 'Google Maps (drive)', url: gmapsDir(destA, destB, 'driving') }],
    vignettes,
    note: vignettes.length ? `Vignette: ${vignettes.join(', ')}` : null,
    est: true,
    src: 'model',
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
  // Drop the train where an endpoint has no real rail AND the national
  // network is too weak to assume a village station exists. In Switzerland
  // or Belgium a 'poor'-transit lake town almost always still has its train;
  // in Croatia or Serbia it almost never does.
  const trainDropped = !train
    || (poorEnd && railQuality !== 'excellent' && railQuality !== 'good');
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
// Speeds, overheads and taxi economics; the public FARE band lives with the
// other ground-fare priors in groundFares.js.
const TRANSFER = {
  publicKmh: 42, publicOverheadH: 0.35,
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

  // A stored per-person fare (a destination's own ground_transport_one_way_eur)
  // resolves as a real quote; without one the resolver prices the transfer band.
  const publicFare = resolveGroundFare({ mode: 'public', quote: publicOverride, km });
  const publicMode = {
    mode: 'public',
    eur_pp: round2(publicFare.eur),
    eur_total: round2(publicFare.eur * group),
    hours: round2(km / TRANSFER.publicKmh + TRANSFER.publicOverheadH),
    est: publicFare.est,
    src: publicFare.src,
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
    est: true,
    src: 'model',
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
      est: true,
      src: 'model',
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
  if (!fromDest || !toDest || !isNum(fromDest.lat) || !isNum(fromDest.lon)
    || !isNum(toDest.lat) || !isNum(toDest.lon)) return null;
  const straightKm = haversineKm(fromDest.lat, fromDest.lon, toDest.lat, toDest.lon);
  if (!isNum(straightKm)) return null;
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
