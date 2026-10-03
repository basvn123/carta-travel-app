/*
 * dataSheet.js (T175, spec E5): the order of the data sheet on a journey page.
 *
 * Every trip type leads with different numbers, so the sheet reads
 * trip.tripTypeSlug and picks a field order. A field is either a slot of
 * trip.typeSpecific or one of three derived fields:
 *   foodPerDay   the food line of the budget, spread over the days
 *   bestMonths   the months the trip is best in (bestPeriod)
 * A field with no value is skipped, so a half-filled trip still shows a
 * sheet; the rows that are left keep the type's order.
 *
 * Six types are the blueprint's. Four (cozy towns, road trips, culinary and
 * wine, nature escapes) are 104 of 253 trips and the blueprint gave them no
 * guidance, so their orders are designed here, from the slots the data has:
 *   cozy-towns     walked km first (the type is about walking), then terrain,
 *                  what a day of food costs, the months, and the transit pass
 *   road-trip      km driven, the highest pass, the road, the months (passes
 *                  close), then booking
 *   culinary       the months first (the season of the produce), food cost,
 *                  booking lead time for tables and tastings
 *   nature-escape  highest point, climbing, distance, then the terrain and the
 *                  hut or cabin booking. Remoteness and last-shop distance have
 *                  no slot yet (register row), so they cannot lead.
 */

// [field, label key]. A bare field uses the default label for the slot.
const L = {
  rideKm: 'journey.dsDistRide',
  runKm: 'journey.dsDistRun',
  walkKm: 'journey.dsDistWalk',
  driveKm: 'journey.dsDistDrive',
  sailKm: 'journey.dsDistSail',
  pisteKm: 'journey.dsDistPiste',
  km: 'journey.dsDist',
  high: 'journey.dsHigh',
  pass: 'journey.dsPass',
  climb: 'journey.dsClimb',
  drop: 'journey.dsDrop',
};

export const SHEET_ORDER = {
  cycling: [
    'surface', ['distanceKm', L.rideKm], ['verticalM', L.climb], ['elevationM', L.high],
    'technicalRating', 'windConditions', 'audience',
  ],
  'trail-running': [
    'technicalRating', ['verticalM', L.climb], ['distanceKm', L.runKm], 'surface',
    ['elevationM', L.high], 'hutBooking', 'audience',
  ],
  hiking: [
    'technicalRating', ['verticalM', L.climb], ['elevationM', L.high], ['distanceKm', L.km],
    'hutBooking', 'surface', 'bookingTimeline', 'audience',
  ],
  'winter-sports': [
    'snowReliability', ['verticalM', L.drop], 'liftNetwork', ['distanceKm', L.pisteKm],
    ['elevationM', L.high], 'bookingTimeline', 'surface', 'audience',
  ],
  'water-sports': [
    'windConditions', 'bestMonths', 'surface', ['distanceKm', L.sailKm],
    'technicalRating', 'bookingTimeline', 'audience',
  ],
  city: [
    'transitPass', 'foodPerDay', ['distanceKm', L.walkKm], 'bookingTimeline', 'surface',
    'audience',
  ],
  culinary: ['bestMonths', 'foodPerDay', 'bookingTimeline', 'surface', ['distanceKm', L.km], 'audience'],
  'cozy-towns': [
    ['distanceKm', L.walkKm], 'surface', 'foodPerDay', 'bestMonths', 'transitPass', 'audience',
  ],
  'road-trip': [
    ['distanceKm', L.driveKm], ['elevationM', L.pass], 'surface', 'bestMonths',
    'bookingTimeline', 'audience',
  ],
  'nature-escape': [
    ['elevationM', L.high], ['verticalM', L.climb], ['distanceKm', L.km], 'surface', 'hutBooking',
    'bestMonths', 'bookingTimeline', 'audience',
  ],
};

// A type the table does not know keeps the order the page had before T175.
const FALLBACK = [
  'surface', 'technicalRating', 'transitPass', 'hutBooking', 'liftNetwork', 'snowReliability',
  'windConditions', 'bookingTimeline', 'audience',
];

const TEXT_LABEL = {
  surface: 'journey.specSurface',
  technicalRating: 'journey.specTechnical',
  transitPass: 'journey.specTransit',
  hutBooking: 'journey.specHut',
  liftNetwork: 'journey.specLift',
  snowReliability: 'journey.specSnow',
  windConditions: 'journey.specWind',
  bookingTimeline: 'journey.specBooking',
  audience: 'journey.specAudience',
  bestMonths: 'journey.fBest',
  foodPerDay: 'journey.dsFood',
};
const NUM_UNIT = { distanceKm: 'km', elevationM: 'm', verticalM: 'm' };
// Distance gets a per-day note for the types that ride, run or walk it daily.
const PER_DAY = new Set(['cycling', 'trail-running', 'hiking']);

/** The field order for a trip type, as [field, labelKey] pairs. */
export function sheetOrder(slug) {
  return (SHEET_ORDER[slug] || FALLBACK).map((e) => (Array.isArray(e) ? e : [e, TEXT_LABEL[e]]));
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/**
 * The rows of the data sheet, in the type's order, empty fields dropped.
 * skip: slots to leave out (the booking slots the booking order already prints).
 * Row: { field, labelKey, kind: 'num'|'text'|'months'|'eur', value, note }.
 */
export function dataSheetRows(trip, { skip = [] } = {}) {
  if (!trip) return [];
  const spec = trip.typeSpecific || {};
  const days = trip.durationDays || 7;
  const out = [];
  for (const [field, labelKey] of sheetOrder(trip.tripTypeSlug)) {
    if (skip.includes(field)) continue;
    if (NUM_UNIT[field]) {
      const v = num(spec[field]);
      if (v == null) continue;
      const row = { field, labelKey, kind: 'num', value: v, unit: NUM_UNIT[field] };
      if (field === 'distanceKm' && PER_DAY.has(trip.tripTypeSlug)) row.perDay = Math.round(v / days);
      out.push(row);
    } else if (field === 'bestMonths') {
      const best = trip.bestPeriod || {};
      if (!best.months?.length) continue;
      out.push({ field, labelKey, kind: 'months', good: best.months, avoid: best.avoidMonths || [] });
    } else if (field === 'foodPerDay') {
      const f = trip.budget?.breakdown?.food;
      if (!f || !(f.lowEur > 0 || f.highEur > 0)) continue;
      out.push({
        field, labelKey, kind: 'eur',
        low: Math.round((f.lowEur ?? f.highEur) / days), high: Math.round((f.highEur ?? f.lowEur) / days),
      });
    } else if (spec[field]) {
      out.push({ field, labelKey, kind: 'text', value: spec[field] });
    }
  }
  return out;
}
