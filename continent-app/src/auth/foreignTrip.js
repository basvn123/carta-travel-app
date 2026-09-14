/**
 * foreignTrip.js, reading a trip that is not yours.
 *
 * A share link and a friend's trip arrive through different functions but come
 * back in the same shape, already whitelisted by the same SQL projection. What
 * the two viewers then do with that shape was drifting apart, so it lives here
 * once: neither viewer decides what to show, only how.
 *
 * PINNING SOMEBODY ELSE'S TRIP. The projection carries a stop's city and its
 * catalogue id, but not its coordinates: the catalogue is a client-side file,
 * so the database has no idea where Lisbon is. Coordinates therefore come from
 * three places, in the order of how sure they are:
 *
 *   1. the memory's own places, which a past trip geocoded when it was filed
 *   2. a stop's `choices`, which is where an off-catalogue town keeps its own
 *      coordinates (the only geodata project_stop_choices lets through)
 *   3. the reader's copy of the catalogue, looked up by destination id
 *
 * The third is why nothing new leaks by drawing the map: the reader already
 * had those coordinates, for every city in Europe, before they opened the
 * link. All the map does is say which of them this trip visited, which the
 * list of city names said anyway.
 */
import { readCrew } from './tripCrew.js';

/** The memory a foreign trip carries, in the shape TripMemoryView reads.
 *  Crew is hydrated from extras.people, exactly as loadMemory does for the
 *  owner's own copy, so the two views cannot drift. */
export function foreignMemory(payload) {
  const extras = payload?.extras || {};
  if (!extras.memory) return null;
  return { ...extras.memory, crew: readCrew(extras) };
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** A catalogue record's coordinates, city centre first: that is where a trip
 *  actually was, rather than the airport the fare quotes from. */
function destPoint(dest) {
  if (!dest) return null;
  const lat = num(dest.city_lat != null ? dest.city_lat : dest.lat);
  const lon = num(dest.city_lon != null ? dest.city_lon : dest.lon);
  return lat != null && lon != null ? { lat, lon } : null;
}

/**
 * The stops of a foreign trip as map pins, in visit order.
 *
 * Returns an empty array when nothing can be placed, which is a real state and
 * not a failure: an itinerary shared before the reader's catalogue has loaded
 * has names but no coordinates yet, and the caller simply shows no map until
 * it does.
 */
export function foreignTripPoints(stops, memory, destinations) {
  const byCity = new Map();
  (memory?.places || []).forEach((p) => {
    const lat = num(p.lat);
    const lon = num(p.lon);
    if (lat != null && lon != null && p.city) byCity.set(p.city.toLowerCase(), { lat, lon });
  });

  const out = [];
  const seen = new Set();
  (stops || []).forEach((s) => {
    const at = byCity.get((s.city || '').toLowerCase())
      || (num(s.choices?.lat) != null && num(s.choices?.lon) != null
        ? { lat: num(s.choices.lat), lon: num(s.choices.lon) }
        : null)
      || destPoint(destinations?.[s.destination_id]);
    if (!at) return;
    // One pin per place: a trip that returns to its first city should not
    // stack two pins on one coordinate.
    const key = (s.city || '').toLowerCase() || `${at.lat},${at.lon}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ lat: at.lat, lon: at.lon, city: s.city || '', plain: true });
  });

  // A memory can hold a place the stop list never named (an off-catalogue town
  // typed into the record), so anything left over is added at the end.
  (memory?.places || []).forEach((p) => {
    const lat = num(p.lat);
    const lon = num(p.lon);
    if (lat == null || lon == null) return;
    const key = (p.city || '').toLowerCase() || `${lat},${lon}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ lat, lon, city: p.city || '', plain: true });
  });

  return out;
}
