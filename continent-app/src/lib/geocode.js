/**
 * geocode.js, free-text address search via Nominatim (OpenStreetMap's
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
  // addressdetails gives the country as its own field. Reading it off the end
  // of display_name instead yields "Belgie / Belgique / Belgien", which is not
  // a country any later lookup can match.
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return [];
    const j = await r.json();
    return (Array.isArray(j) ? j : [])
      .filter((x) => x.lat != null && x.lon != null)
      .map((x) => {
        const parts = (x.display_name || q).split(',');
        return {
          label: x.display_name || q,
          // A compact label: the first two comma parts (street/house + town).
          shortLabel: parts.slice(0, 2).join(',').trim(),
          // The place's own name and country, kept apart from the display
          // label so a caller can look the place up again (city research
          // geocodes the town by name, not by a street-and-town string).
          name: x.name || parts[0].trim(),
          // Bilingual countries come back as "Belgie / Belgique / Belgien";
          // one name is enough for a later lookup to work with.
          country: (x.address?.country || '').split(' / ')[0],
          lat: Number(x.lat),
          lon: Number(x.lon),
        };
      });
  } catch {
    return [];
  }
}
