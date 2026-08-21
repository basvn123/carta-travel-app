/**
 * nearby.js, the answer to "what else is around here".
 *
 * The panel's POI section answers what to see INSIDE a town. This answers the
 * question a traveller asks straight after, and the one that actually decides
 * a trip: is there anything else worth the drive, and how far is it.
 *
 * Nothing is harvested for this. Every destination already carries a
 * coordinate and a rating, so a linear scan of the catalogue (3,038 rows, one
 * haversine each, run only while a panel is open) is the whole implementation.
 * Because it reads the same catalogue the grid reads, a place suggested here
 * is always a place you can open.
 *
 * Ranking is a deliberate compromise between "good" and "close". Sorting on
 * rating alone fills a Tuscan hill town's neighbours list with Florence and
 * Siena every time; sorting on distance alone fills it with three suburbs. The
 * score below multiplies the rating by a distance decay, so a very good place
 * an hour away beats a fair place ten minutes away, and a dull place at any
 * distance never appears.
 */

const R_KM = 6371;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(a));
}

// A day trip, not a relocation. Beyond this the answer is "that is a separate
// trip", which the grid already answers better than a list of three.
const MAX_KM = 110;
// Anything closer than this is the same place under another name (a gateway
// airport, an adjacent village already inside the same visit).
const MIN_KM = 6;
// Below this the suggestion is not worth a reader's attention, whatever the
// distance. The catalogue median is 6.6, so this keeps the upper half.
const MIN_RATING = 6.4;

const baseCity = (name) => String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

/**
 * The handful of catalogue destinations worth pairing with this one.
 * Returns [{ id, city, country, iso2, km, rating, image, categories }], nearest
 * first among the winners, capped at `limit`.
 */
export function nearbyPlaces(dest, destinations, limit = 4) {
  const lat = dest?.city_lat ?? dest?.lat;
  const lon = dest?.city_lon ?? dest?.lon;
  if (lat == null || lon == null || !destinations) return [];

  const self = baseCity(dest.city).toLowerCase();
  const scored = [];
  for (const [id, d] of Object.entries(destinations)) {
    if (id === dest.id) continue;
    const dlat = d.city_lat ?? d.lat;
    const dlon = d.city_lon ?? d.lon;
    if (dlat == null || dlon == null) continue;
    const rating = d.rating?.score;
    if (!(rating >= MIN_RATING)) continue;
    // Cheap box reject before the trigonometry: 1 degree of latitude is
    // ~111 km, so anything further than a degree cannot be inside MAX_KM.
    if (Math.abs(dlat - lat) > 1.05) continue;
    const km = haversineKm(lat, lon, dlat, dlon);
    if (km < MIN_KM || km > MAX_KM) continue;
    // A second gateway for the same town is the same town.
    if (baseCity(d.city).toLowerCase() === self) continue;
    // Rating carries, distance decays: half weight by MAX_KM.
    const score = rating * (1 - 0.5 * (km / MAX_KM));
    scored.push({
      id,
      city: baseCity(d.city),
      country: d.country,
      iso2: d.iso2,
      km,
      rating: d.rating || null,
      image: d.image?.url || null,
      categories: d.categories || [],
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // One per town name, so three gateways to the same city cannot fill the list.
  const seen = new Set();
  const out = [];
  for (const p of scored) {
    const key = `${p.city.toLowerCase()}|${p.iso2}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => a.km - b.km);
}

/**
 * How long the place is worth, from place.visit_h (place_layer.py), as the
 * number of days and the i18n key that phrases it. Returns null when the
 * place layer has nothing, rather than guessing a number.
 *
 * The thresholds mirror how a traveller actually books: under six hours is a
 * stop on the way somewhere, under fourteen is a full day, and past that you
 * are sleeping there.
 */
export function visitLength(dest) {
  const h = dest?.place?.visit_h;
  if (!(h > 0)) return null;
  if (h < 6) return { key: 'explore.stayHalfDay', days: 0.5, hours: h };
  if (h < 14) return { key: 'explore.stayOneDay', days: 1, hours: h };
  const days = Math.round(h / 9);
  return { key: 'explore.stayNights', days, hours: h, n: Math.max(2, days) };
}
