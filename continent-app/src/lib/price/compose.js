/**
 * A composed trip (T702, plan F6): one destination, the traveller's dates
 * and choices, priced the way the Places list and its map show it: the way
 * there (a flight, a drive, a train or a bus) plus the stay. Moved here from
 * runtime_pricing.js composeTrip; the stay is now the engine's day row, so a
 * place costs in Places what it costs on Explore and its page (V1).
 */
import {
  tripDaysBetween, airRoute, driveOrigin, drivingEstimate,
} from '../runtime_pricing.js';
import { roundTripNear } from '../flights/flights.js';
import { tiersAt } from '../stayPrice.js';
import { round2 } from '../math.js';
import { rule } from './config.js';
import { atDates, priceRequest } from './request.js';
import { priceDay } from './priceDay.js';
import { carHire } from './car.js';

/** Hiring a car at a destination that needs one (local_transport.car_needed)
 *  for a composed plane trip: the engine's car (lib/price/car.js) for the
 *  party, or null. Was runtime_pricing.js rentalEstimate, the second hire
 *  table (T702: one hire model). */
function needHire(dest, nights, groupSize, departDate) {
  if (!dest.local_transport?.car_needed) return null;
  const h = carHire(dest.iso2, Math.max(1, nights), departDate, groupSize);
  if (!h) return null;
  return {
    cars: h.cars, days: h.days, rate: round2(h.eur_per_day / h.cars),
    total: round2(h.eur_total), per_person: round2(h.eur_total / groupSize),
  };
}

/** Full trip cost for these dates + choices. Prices the trip two ways and picks
 *  the one in `choices.transport_mode` ('plane' | 'car'):
 *    - plane: the air routes decide whether and where you can fly (this
 *      destination or an airport within PLANE_REACH_KM of it). The total is
 *      the return flight when the home airport's swept file has one near
 *      these dates (T518: `opts.flights`, flights/flights.js roundTripNear,
 *      fare and bags for every seat), the last leg in (shuttle or a rental
 *      car), a rental at the destination when one is needed there, and the
 *      stay. Without a flight near the dates the plane total leaves it out,
 *      as before (T511), and `flight` is null so the screen can say so.
 *    - car  : fuel + tolls to drive there and back (only if road-reachable and
 *      within max_drive_km); no rental, you brought your own car.
 *  Accommodation + on-the-ground are added the same way for both. Returns null
 *  if the destination cannot be reached either way.
 *
 *  `allDests` (the whole catalogue) is optional but enables the nearby-airport
 *  reach above; without it only destinations with their own air route can be
 *  flown to. `opts.flights` is the home airport's swept flight file
 *  (data.flights); without it no flight is priced.
 */
export function quoteComposed(dest, departDate, returnDate, choices, allDests = null, opts = {}) {
  if (!dest || !departDate || !returnDate || returnDate <= departDate) return null;

  const groupSize = Math.max(1, choices.group_size || 1);
  const nights = Math.max(1, tripDaysBetween(departDate, returnDate));
  const home = driveOrigin(choices);
  const carModel = choices.car_model || null;

  // The stay is the engine's day at these dates (T702): the bed and the food
  // a person a day that Explore and the destination page show for the same
  // question, times the nights and the seats. `opts.day` is that row when the
  // caller priced the catalogue once (priceDays); a day the engine cannot
  // price leaves the trip unpriced rather than cheaper (rule 8).
  const req = atDates(priceRequest({ choices }), departDate, returnDate);
  const day = opts.day || priceDay(dest, req, allDests);
  if (day?.dayEur == null) return null;
  const bedLine = day.lines.find((l) => l.key === 'bed');
  const accomPerPerson = bedLine.status === 'included' ? round2(day.stayEur * nights) : 0;
  const accomTotal = accomPerPerson * groupSize;
  const groundPerPerson = day.lines.find((l) => l.key === 'food').status === 'included' ? round2(day.foodEur * nights) : 0;
  const groundTotal = groundPerPerson * groupSize;

  const stayTotal = accomTotal + groundTotal;

  // --- Plane option: the last leg in, and a rental if a car is needed there.
  const { route, via: viaAirport } = airRoute(dest, choices, allDests);
  const rental = needHire(dest, nights, groupSize, departDate); // null if not needed
  const rentalTotal = rental ? rental.total : 0;

  // Airport transfer: for gems / anchored dests the flight lands at an anchor
  // airport and you finish the trip by bus/shuttle. ground_eur is a per-person
  // one-way fare, so count it round-trip and per person. Zero for dests you fly
  // straight into (ground_eur = 0).
  const transferPpOneWay = route ? (route.ground_eur || 0) : 0;
  const transferPerPerson = transferPpOneWay * 2;          // there + back
  const transferTotal = transferPerPerson * groupSize;

  // The return flight (T518): out near the first day, home near the last,
  // into the airport the route lands at, for every seat that pays, with the
  // traveller's bag on both legs. Null when the sweep has no flight near
  // these dates, never a guess.
  const flightRt = route && opts?.flights
    ? roundTripNear(opts.flights, route.anchor_airport || dest.anchor_airport || dest.iata,
      departDate, returnDate, { paying: groupSize, bagKey: choices.baggage_key || rule('request.default_bag') })
    : null;
  const flightTotal = flightRt ? flightRt.total : 0;

  const planeGrand = route ? flightTotal + transferTotal + rentalTotal + stayTotal : null;

  // --- Car option: drive there & back. You have your car, so no rental.
  const driving = drivingEstimate(dest, home, choices, carModel); // null if not drivable
  const drivable = !!driving;
  const carGrand = drivable ? driving.total + stayTotal : null;

  // --- Train and bus (T582): the caller's ground pricer (lib/travelWay.js,
  // handed in as opts.ground so this module stays free of the leg
  // estimator), the party's return journey from the From point, or null.
  const want = choices.transport_mode || 'any';
  const wayTotal = (m) => {
    if (typeof opts?.ground !== 'function') return null;
    const r = opts.ground(dest, m);
    return r && Number.isFinite(r.total) ? r.total : null;
  };
  const trainWay = want === 'train' || want === 'any' ? wayTotal('train') : null;
  const busWay = want === 'bus' || want === 'any' ? wayTotal('bus') : null;
  const trainGrand = trainWay != null ? trainWay + stayTotal : null;
  const busGrand = busWay != null ? busWay + stayTotal : null;

  // --- Pick the effective mode. A chosen way prices that way; plane falls
  // back to the car as it always did; any way takes the cheapest that reaches.
  let mode;
  if (want === 'train' || want === 'bus') {
    if ((want === 'train' ? trainGrand : busGrand) == null) return null;
    mode = want;
  } else if (want === 'any') {
    const options = [['plane', planeGrand], ['car', carGrand], ['train', trainGrand], ['bus', busGrand]]
      .filter(([, v]) => v != null);
    if (!options.length) return null;
    mode = options.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  } else {
    mode = want === 'car' && drivable ? 'car' : 'plane';
    if (mode === 'plane' && planeGrand == null) {
      if (drivable && want !== 'plane') mode = 'car';  // no flight, but we can drive (never when only flying was asked, T597)
      else return null;                  // unreachable for these dates
    }
  }

  const grandTotal = { plane: planeGrand, car: carGrand, train: trainGrand, bus: busGrand }[mode];
  const grandPerPerson = grandTotal / groupSize;
  const lt = dest.local_transport || null;

  return {
    nights,
    transport_mode:     mode,            // the mode actually priced: plane | car | train | bus
    requested_mode:     want,
    // T582: the train or bus journey in the total, group return, when priced.
    way_total:          mode === 'train' ? round2(trainWay) : mode === 'bus' ? round2(busWay) : null,
    drivable,

    // Can you actually fly here for these dates? Distinct from transport_mode:
    // in plane mode a flightless destination is quietly priced as a drive, and
    // this is the flag that keeps the UI honest about that.
    plane_reachable:    planeGrand != null,
    // Set only when the flight lands at a *nearby* airport rather than this
    // destination's own: { kind: 'shuttle' | 'rental', city, iata, road_km, ... }
    via_airport:        viaAirport,

    // The air route (present when one exists; no fare, T511)
    origin:             route?.origin || null,
    anchor_airport:     route?.anchor_airport || null,
    ground_one_way_eur: route?.ground_eur || 0,
    ground_minutes:     route?.ground_minutes || 0,

    // The return flight in the plane total (T518), or null when none was
    // found near these dates: { out, back, total } for the group, the legs
    // as flights/flights.js returns them (airline, date, price a seat, checked).
    flight:             flightRt ? {
      out: flightRt.out, back: flightRt.back, total: round2(flightRt.total),
      perSeat: round2(flightRt.perSeat), bags: round2(flightRt.bags), bagsKnown: flightRt.bagsKnown,
    } : null,
    flight_total:       round2(flightTotal),

    // Airport->destination transfer (bus/shuttle), round-trip. 0 when you fly
    // straight in (no anchor). Included in the plane total.
    transfer_one_way_eur: round2(transferPpOneWay),
    transfer_per_person:  round2(transferPerPerson),
    transfer_total:       round2(transferTotal),

    // Driving (present when drivable)
    driving:            driving,         // group-total breakdown (fuel + tolls)
    // The point the drive was measured from, so the receipt can name it rather
    // than saying "from your airport" about a road trip. Null when the fallback
    // origin airport supplied the coordinates.
    drive_from:         driving ? (choices.drive_home?.name || null) : null,

    // Local transport / rental at the destination
    local_transport:    lt,
    rental:             rental,          // group-total breakdown (null if not needed)
    rental_total:       round2(rentalTotal),

    // Accommodation (per person + totals)
    // v18 (T534): how the bed was found, measured | nearby | modelled.
    accom_level:        bedLine.quality,
    accom_source:       bedLine.provenance?.from || null,
    accom_entire_home_night_eur: dest.accommodation?.beds?.bnb_home?.['4'] ?? null,
    accom_per_person:   round2(accomPerPerson),
    accom_total:        round2(accomTotal),
    // Stay tier actually priced ('home' when no tier chosen or none measured)
    // + the honesty flag for a requested-but-unmeasured tier.
    stay_tier:          bedLine.basis?.tier || 'home',
    stay_tier_fallback: !!bedLine.basis?.tierFallback,
    stay_tiers_available: tiersAt(dest),

    // On-the-ground (per person + totals)
    cost_level:         dest.costs?.level || null,
    price_source:       dest.costs?.price_source || null,
    ground_per_person:  round2(groundPerPerson),
    ground_total:       round2(groundTotal),

    // The plane and car totals (for the comparison) + the selected one.
    plane_grand_total:  planeGrand != null ? round2(planeGrand) : null,
    car_grand_total:    carGrand != null ? round2(carGrand) : null,
    grand_total:        round2(grandTotal),
    grand_total_pp:     round2(grandPerPerson),
  };
}
