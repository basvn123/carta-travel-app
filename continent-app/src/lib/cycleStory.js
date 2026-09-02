/**
 * cycleStory.js, the ride explained to a cyclist rather than to a database.
 *
 * The wire carries codes and numbers, never prose (invariant 3). Every
 * sentence a rider reads is composed here through t(), which is what puts the
 * explanation in all six UI languages and what keeps it honest: each line
 * below is a restatement of something measured, so "83 percent paved" can be
 * checked against the map rather than admired.
 *
 * Four groups of code, and they come from four different places in the
 * pipeline:
 *
 *   why      cycle_index.py's reasons. The argument for the route.
 *   surface  enrich_cycling.py's surface block. What the riding is like.
 *   stage    stage_planner.py's per-day record. What today actually is.
 *   rail     seed_bike_rail.py's operator policy. Whether the train takes it.
 *
 * There is no review text anywhere in this layer, because there is no review
 * text anybody is allowed to give us: Komoot, Strava, Ride with GPS and
 * AllTrails all forbid reuse of their ratings. Everything here is derived
 * from open data, and it says so.
 */

/** A number the sentence can name, or nothing. Keeps "83 percent" out of the
 *  UI when the share was never measured. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pct = (v) => {
  const n = num(v);
  return n === null ? null : Math.round(n <= 1 ? n * 100 : n);
};

const WHY_ICON = {
  eurovelo: 'compass',
  national: 'compass',
  trafficFree: 'shield',
  paved: 'road',
  gravel: 'gravel',
  quiet: 'shield',
  climbing: 'mountain',
  flat: 'road',
  coast: 'coast',
  protected: 'leaf',
  views: 'eye',
  lakes: 'water',
  beaches: 'coast',
  peaks: 'mountain',
  trails: 'boot',
  loop: 'loop',
  longDistance: 'clock',
  dayRide: 'clock',
  served: 'bed',
  railAccess: 'train',
};

/**
 * One reason code to one sentence.
 *
 * Returns null when the code carries no number worth a sentence, which is how
 * a half-measured route says less rather than says something vague. The
 * caller takes the first few: the point is an argument for the ride, not an
 * inventory of it.
 */
export function whyText(reason, t) {
  if (!reason || !reason.code) return null;
  const { code } = reason;
  switch (code) {
    case 'eurovelo':
      return reason.ref ? t('cycle.whyEuroVelo', { ref: reason.ref }) : null;
    case 'national':
      return t(reason.net === 'icn' ? 'cycle.whyInternational' : 'cycle.whyNational',
        { ref: reason.ref || '' });
    case 'trafficFree': {
      const p = pct(reason.pct);
      return p === null ? null : t('cycle.whyTrafficFree', { pct: p });
    }
    case 'paved': {
      const p = pct(reason.pct);
      return p === null ? null : t('cycle.whyPaved', { pct: p });
    }
    case 'gravel': {
      const p = pct(reason.pct);
      return p === null ? null : t('cycle.whyGravel', { pct: p });
    }
    case 'quiet':
      return t('cycle.whyQuiet');
    case 'climbing': {
      const m = num(reason.m);
      return m === null ? null : t('cycle.whyClimbing',
        { m: Math.round(m), perKm: Math.round(num(reason.perKm) || 0) });
    }
    case 'flat': {
      const m = num(reason.m);
      return m === null ? null : t('cycle.whyFlat', { m: Math.round(m) });
    }
    case 'coast':
      return t('cycle.whyCoast');
    case 'protected': {
      const p = pct(reason.pct);
      return p === null ? null : t('cycle.whyProtected', { pct: p });
    }
    case 'views': {
      const n = num(reason.n);
      return n === null ? null : t('cycle.whyViews', { n });
    }
    case 'lakes':
      return t('cycle.whyLakes', { n: num(reason.n) || 0 });
    case 'beaches':
      return t('cycle.whyBeaches', { n: num(reason.n) || 0 });
    case 'peaks':
      return t('cycle.whyPeaks', { n: num(reason.n) || 0 });
    case 'trails':
      return t('cycle.whyTrails', { n: num(reason.n) || 0 });
    case 'loop':
      return t('cycle.whyLoop');
    case 'longDistance': {
      const km = num(reason.km);
      return km === null ? null : t('cycle.whyLongDistance', { km });
    }
    case 'dayRide': {
      const km = num(reason.km);
      return km === null ? null : t('cycle.whyDayRide', { km });
    }
    case 'served':
      return t('cycle.whyServed', { n: num(reason.n) || 0 });
    case 'railAccess':
      return t('cycle.whyRailAccess', { n: num(reason.n) || 0 });
    default:
      return null;
  }
}

/** The reasons a card should show, longest-argument-first, already worded. */
export function whyLines(reasons, t, max = 4) {
  return (reasons || [])
    .map((r) => ({ icon: WHY_ICON[r.code] || 'dot', text: whyText(r, t) }))
    .filter((line) => line.text)
    .slice(0, max);
}

/**
 * What the riding is like, from the surface block.
 *
 * known_share is the honest half of this. A route where a tenth of the ways
 * carry a surface tag does not get to claim a paved percentage, so the
 * sentence says the surface is not recorded instead of inventing one.
 */
const SURFACE_MIN_KNOWN = 0.25;

export function surfaceLine(surface, t) {
  if (!surface) return null;
  const known = num(surface.surface_known_share);
  const paved = pct(surface.paved_share);
  if (paved === null || (known !== null && known < SURFACE_MIN_KNOWN)) {
    return t('cycle.surfaceUnknown');
  }
  if (paved >= 95) return t('cycle.surfaceAllPaved');
  if (paved >= 70) return t('cycle.surfaceMostlyPaved', { pct: paved });
  if (paved >= 35) return t('cycle.surfaceMixed', { pct: paved });
  return t('cycle.surfaceMostlyUnpaved', { pct: 100 - paved });
}

export function trafficFreeLine(surface, t) {
  const p = pct(surface && surface.traffic_free_share);
  if (p === null) return null;
  if (p >= 80) return t('cycle.freeAlmostAll', { pct: p });
  if (p >= 30) return t('cycle.freeSome', { pct: p });
  return t('cycle.freeLittle', { pct: p });
}

/** Which bike the WORST stretch demands, never the average one. */
export function bikeLine(bike, t) {
  switch (bike) {
    case 'touring': return t('cycle.bikeTouring');
    case 'gravel': return t('cycle.bikeGravel');
    case 'mtb': return t('cycle.bikeMtb');
    default: return null;
  }
}

/**
 * The safety score in words.
 *
 * Named a house metric out loud, because it is one: the ECF's own OSM-based
 * methodology computes infrastructure ratios and deliberately declines to
 * define a safety score, so there is no standard being claimed here.
 */
export function safetyLine(safety, t) {
  const score = num(safety && safety.score);
  if (score === null) return null;
  const known = num(safety.known_share);
  if (known !== null && known < 0.33) return t('cycle.safetyUnmeasured');
  if (score >= 8.5) return t('cycle.safetyVeryQuiet');
  if (score >= 7) return t('cycle.safetyQuiet');
  if (score >= 5) return t('cycle.safetyMixedTraffic');
  return t('cycle.safetyBusy');
}

/** How a route's line compares with what the official source draws. */
export function agreementLine(agreement, t) {
  if (!agreement) return null;
  const entries = Object.entries(agreement)
    .filter(([, v]) => v && typeof v === 'object' && num(v.share) !== null);
  if (!entries.length) return null;
  const [source, best] = entries.sort((a, b) => b[1].share - a[1].share)[0];
  const p = pct(best.share);
  const label = source === 'eurovelo_gpx' ? t('cycle.sourceEuroVelo')
    : source === 'sustrans_ncn' ? t('cycle.sourceSustrans')
      : t('cycle.sourceOfficial');
  if (p >= 85) return t('cycle.agreeHigh', { pct: p, source: label });
  if (p >= 50) return t('cycle.agreeSome', { pct: p, source: label });
  return t('cycle.agreeLow', { pct: p, source: label });
}

/**
 * One stage of a tour, in a sentence.
 *
 * Every number here was measured on that stage's own slice of the route, not
 * inherited from the route as a whole. That is the difference between "the
 * worst surface on this tour" and "the worst surface on day three", and it is
 * why harvest_cycling keeps its surface spans positioned along the line.
 */
export function stageLine(stage, t) {
  if (!stage) return null;
  const km = Math.round((num(stage.distance_m) || 0) / 1000);
  const asc = num(stage.ascent_m);
  const to = (stage.to && stage.to.name) || null;
  if (!to) return null;
  return asc === null
    ? t('cycle.stagePlain', { km, to })
    : t('cycle.stage', { km, m: Math.round(asc), to });
}

/** The bail-out answer. Remote is a legitimate answer; silence is not. */
export function bailoutLine(bailout, t) {
  if (!bailout || !bailout.kind) return null;
  if (bailout.kind === 'remote') return t('cycle.bailoutRemote');
  const km = num(bailout.km);
  if (!bailout.name) return null;
  return km ? t('cycle.bailoutNear', { name: bailout.name, km })
    : t('cycle.bailoutHere', { name: bailout.name });
}

/** What a stage end offers, from the counts the planner measured. */
export function overnightLine(town, t) {
  if (!town || !town.name) return null;
  const beds = (num(town.sleep) || 0);
  const camp = (num(town.camp) || 0);
  if (beds >= 3) return t('cycle.overnightBeds', { name: town.name, n: beds });
  if (camp >= 1) return t('cycle.overnightCamp', { name: town.name, n: camp });
  return t('cycle.overnightThin', { name: town.name });
}

/** Bike on trains, from the curated operator row. Codes, never prose. */
export function railPolicyLine(policy, t) {
  if (!policy) return null;
  const bits = [];
  switch (policy.reservation) {
    case 'required': bits.push(t('cycle.railReservationRequired')); break;
    case 'recommended': bits.push(t('cycle.railReservationAdvised')); break;
    case 'none': bits.push(t('cycle.railNoReservation')); break;
    default: bits.push(t('cycle.railReservationVaries')); break;
  }
  switch (policy.fee) {
    case 'free': bits.push(t('cycle.railFree')); break;
    case 'flat_fee': bits.push(t('cycle.railFlatFee')); break;
    case 'ticket_required': bits.push(t('cycle.railTicket')); break;
    case 'peak_ban': bits.push(t('cycle.railPeakBan')); break;
    case 'folded_only': bits.push(t('cycle.railFoldedOnly')); break;
    case 'limited_spaces': bits.push(t('cycle.railLimited')); break;
    default: break;
  }
  return bits.join(' ');
}

/** The pace a tour is set at, said plainly. */
export function paceLine(pace, t) {
  switch (pace) {
    case 'relaxed': return t('cycle.paceRelaxed');
    case 'balanced': return t('cycle.paceBalanced');
    case 'strong': return t('cycle.paceStrong');
    default: return null;
  }
}

/** The one line a listed row gets instead of a score. */
export function listedLine(t) {
  return t('cycle.unratedCoverage');
}

/** Months to a season sentence, using the app's own month names. */
export function seasonLine(season, t, monthName) {
  const best = (season && season.best) || [];
  if (!best.length) return null;
  const names = best.map((m) => monthName(m)).filter(Boolean);
  if (!names.length) return null;
  if (names.length === 1) return t('cycle.seasonOne', { month: names[0] });
  return t('cycle.seasonRange', {
    from: names[0], to: names[names.length - 1],
  });
}

/**
 * "1 country" or "6 countries", in the active language.
 *
 * Six languages with six plural rules is more than a template string can
 * carry, and "1 countries" on a EuroVelo chip is the kind of small wrongness
 * that makes a measured product look unmeasured. Two keys per language and a
 * count test is enough here because the only quantity is a country tally,
 * which has no zero case and no dual.
 */
export function countryPhrase(n, t) {
  return n === 1
    ? t('cycle.familyCountryOne')
    : t('cycle.familyCountryMany', { n });
}
