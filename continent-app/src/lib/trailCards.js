/**
 * trailCards.js, the join between the published trails wire and the catalogue.
 *
 * The wire deliberately carries no images, ratings or prices (export_wire.py
 * keeps it a produced work of route data). Everything visual comes from the
 * app's own catalogue instead: a composed city day names its anchor
 * destination outright, a drawn hike gets the nearest catalogue place within
 * a sane radius. That association supplies the card photo, the rating chip,
 * the from-price and the beach/mountain theming, all from data the app has
 * already shipped.
 */
import { matchesAnyKind } from './trip_kinds.js';

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bboxCentre(bbox) {
  return bbox?.length === 4
    ? { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 }
    : null;
}

/** Where a trip sits on the map: the anchor city for a composed city day,
 *  the extent's centre for a drawn trail. */
export function tripCentre(tr) {
  if (tr.category === 'citytrip' && tr.anchor?.lat != null) {
    return { lat: tr.anchor.lat, lon: tr.anchor.lon };
  }
  return bboxCentre(tr.bbox);
}

// A hike further than this from any catalogue place shows its route, not a
// borrowed photo: a town's hero image 50 km away says nothing about the trail.
const PHOTO_MAX_KM = 35;
// Association radius for rating/price/theme context.
const ASSOC_MAX_KM = 80;

/** Nearest entry of a prebuilt dest index, or null outside maxKm. */
export function nearestDest(destIndex, lat, lon, maxKm = ASSOC_MAX_KM) {
  let best = null, bestKm = maxKm;
  for (const d of destIndex) {
    const km = haversineKm(lat, lon, d.lat, d.lon);
    if (km < bestKm) { bestKm = km; best = d; }
  }
  return best ? { dest: best, km: bestKm } : null;
}

/**
 * Associate one wire trip with the catalogue: the anchor destination for a
 * city day, the nearest place for a hike. Returns
 *   { dest, km, photoUrl }  (any of them null when nothing qualifies)
 */
export function associateTrip(tr, destinations, destIndex) {
  if (tr.category === 'citytrip' && tr.anchor?.dest && destinations[tr.anchor.dest]) {
    const dest = destinations[tr.anchor.dest];
    return { dest, destId: tr.anchor.dest, km: 0, photoUrl: dest.image?.url || null };
  }
  const c = tripCentre(tr);
  if (!c) return { dest: null, destId: null, km: null, photoUrl: null };
  const near = nearestDest(destIndex, c.lat, c.lon);
  if (!near) return { dest: null, destId: null, km: null, photoUrl: null };
  const full = destinations[near.dest.id] || near.dest;
  return {
    dest: full,
    destId: near.dest.id,
    km: near.km,
    photoUrl: near.km <= PHOTO_MAX_KM ? (full.image?.url || null) : null,
  };
}

/** 'beach' / 'mountains' membership for the themed category tabs. */
export function tripThemes(tr, assocDest) {
  const cats = assocDest?.categories || [];
  const themes = new Set();
  if (matchesAnyKind(cats, ['beach']) || cats.includes('coast')
    || assocDest?.beauty?.top_beach) themes.add('beach');
  if (matchesAnyKind(cats, ['mountains']) || (tr.ascent_m ?? 0) >= 600) themes.add('mountains');
  return themes;
}

/** i18n key for the small kind chip on a card. */
export function tripKindKey(tr, assocDest) {
  if (tr.category === 'citytrip') {
    const cats = assocDest?.categories || [];
    if (matchesAnyKind(cats, ['beach'])) return 'trails.coastalDay';
    if (matchesAnyKind(cats, ['mountains'])) return 'trails.mountainDay';
    if (matchesAnyKind(cats, ['cultural'])) return 'trails.cultureDay';
    return 'trails.cityDay';
  }
  if ((tr.distance_m ?? 0) > 40000 || (tr.duration_min ?? 0) > 720) return 'trails.multiDayTrek';
  if ((tr.distance_m ?? 0) <= 25000) return 'trails.dayHike';
  return 'trails.trail';
}

/** "poi:gem:theth:thethi-national-park" -> "Thethi national park". The slug is
 *  the app's own diacritic fold of the POI name, so titling it back is honest
 *  enough for a stop list without downloading the 35 MB activities file. */
export function stopNameFromRef(poiRef) {
  const slug = String(poiRef || '').split(':').pop() || '';
  const words = slug.split('-').filter(Boolean);
  if (!words.length) return '';
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}
