/**
 * geocode.js - free-text address search via Nominatim (OpenStreetMap's
 * geocoder). Keyless and free, like the rest of the app's services (OSRM,
 * Wikipedia, Carto). Used by the Day planner so travellers can type the
 * address of their stay instead of hunting through dropdowns.
 *
 * Nominatim asks for fair use: requests are debounced by the caller and we
 * only fire on an explicit search action, never per keystroke.
 */

export async function geocodeAddress(query) {
  const q = (query || '').trim();
  if (q.length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return [];
    const j = await r.json();
    return (Array.isArray(j) ? j : [])
      .filter((x) => x.lat != null && x.lon != null)
      .map((x) => ({
        label: x.display_name || q,
        // A compact label: the first two comma parts (street/house + town).
        shortLabel: (x.display_name || q).split(',').slice(0, 2).join(',').trim(),
        lat: Number(x.lat),
        lon: Number(x.lon),
      }));
  } catch {
    return [];
  }
}
