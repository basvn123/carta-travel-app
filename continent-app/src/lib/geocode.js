/**
 * geocode.js, free-text address search via Nominatim (OpenStreetMap's
 * geocoder). Keyless and free, like the rest of the app's services (OSRM,
 * Wikipedia, Carto). Used by the Day planner so travellers can type the
 * address of their stay instead of hunting through dropdowns, and by the
 * Destinations tab so any place on earth, a home address included, can be
 * the centre the catalogue is measured from.
 *
 * Nominatim asks for fair use: requests are debounced by the caller and we
 * only fire on an explicit search action, never per keystroke.
 *
 * Options: `limit` (how many hits to ask for, default 5) and `signal` (an
 * AbortSignal, for callers that supersede their own in-flight search).
 */

/**
 * What KIND of thing a geocoder hit is, in the only three flavours a traveller
 * starting a day cares about: the hotel they are sleeping in, a street address
 * (a holiday rental, a friend's spare room, home) or a town. Nominatim answers
 * with its own taxonomy of ~100 `category`/`type` pairs, so this collapses
 * them: anything that sleeps people is a hotel, anything with a house number
 * or a road is an address, any populated place is a town. Everything else
 * (a museum, a station, a mountain) answers "address", because on a results
 * row the icon is a hint about the shape of the line, not a claim about what
 * the place does.
 */
function placeKind(x) {
  const cat = x?.category || x?.class || '';
  const type = x?.type || '';
  if (cat === 'tourism' && /^(hotel|hostel|guest_house|motel|apartment|chalet|alpine_hut|camp_site|caravan_site)$/.test(type)) return 'hotel';
  if (cat === 'building' && /^(hotel|dormitory)$/.test(type)) return 'hotel';
  if (cat === 'place' && /^(city|town|village|hamlet|municipality|suburb|borough|quarter|neighbourhood|locality)$/.test(type)) return 'town';
  if (x?.address?.house_number || cat === 'highway' || (cat === 'place' && type === 'house')) return 'address';
  return 'address';
}

/**
 * A geocoder hit as two lines: what the place is called, and where on earth it
 * is. Without the split, one long comma chain is unreadable on a narrow row and
 * buries the one part that tells the several Gents of this world apart.
 *
 * Nominatim's display_name leads with the place's own name for a named feature,
 * but with a bare house number for a street address ("12, Kerkstraat,
 * Knesselare, Aalter, ..."). A title of "12" is no use to anyone, so a numeric
 * first part pulls the street and the town in with it.
 */
export function geoLines(r) {
  const parts = String(r?.label || '').split(',').map((s) => s.trim()).filter(Boolean);
  // Bilingual country tails ("Belgie / Belgique / Belgien") are noise on a row
  // this narrow; the parsed country name says the same thing once.
  if (parts.length && r?.country) parts[parts.length - 1] = r.country;
  const first = parts[0] || '';
  // The house rule runs first: for a street address the geocoder backfills the
  // empty name with that same bare number, so testing the name would hide it.
  if (/^\d/.test(first) && parts.length > 2) {
    return { title: parts.slice(0, 3).join(', '), rest: parts.slice(3).join(', ') };
  }
  const named = (r?.name || '').trim();
  if (named && first.toLowerCase() === named.toLowerCase()) {
    return { title: named, rest: parts.slice(1).join(', ') };
  }
  return {
    title: parts.slice(0, 2).join(', ') || named || r?.shortLabel || '',
    rest: parts.slice(2).join(', '),
  };
}

export async function geocodeAddress(query, opts = {}) {
  const q = (query || '').trim();
  if (q.length < 3) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 5, 1), 20);
  // addressdetails gives the country as its own field. Reading it off the end
  // of display_name instead yields "Belgie / Belgique / Belgien", which is not
  // a country any later lookup can match.
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: opts.signal });
    if (!r.ok) return [];
    const j = await r.json();
    return (Array.isArray(j) ? j : [])
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
          // ISO2, uppercase, the shape the rest of the app keys countries by
          // (the trails wire publishes one CC file at a time, the catalogue
          // rows carry iso2). Null for the odd hit with no country, an ocean
          // or a border way.
          iso2: (x.address?.country_code || '').toUpperCase() || null,
          // hotel | address | town, so a results row can wear an icon that
          // says what it is before the words are read.
          kind: placeKind(x),
          lat: Number(x.lat),
          lon: Number(x.lon),
        };
      })
      // After the mapping, not before: a hit whose lat/lon does not parse to a
      // real number would otherwise travel on as NaN and blank the map the
      // moment something called fitBounds with it.
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  } catch {
    return [];
  }
}

/**
 * The other direction: what is at this coordinate. Used where the app already
 * knows the position and only needs a name for it, the device's own location
 * being the case that matters, so the answer keeps the CALLER's coordinate:
 * Nominatim replies with the matched feature's centre, which for a suburb can
 * sit a kilometre from where the traveller is standing.
 *
 * Resolves null when there is nothing there or the service is unreachable; a
 * point with no name is still a perfectly good point to measure from.
 */
export async function reverseGeocode(lat, lon, opts = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Street level. Higher zooms answer with a building, which names someone's
  // house back to them; lower ones lose the town.
  const zoom = Number(opts.zoom) || 16;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=${zoom}&lat=${lat}&lon=${lon}`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: opts.signal });
    if (!r.ok) return null;
    const x = await r.json();
    if (!x || x.error || !x.display_name) return null;
    const parts = String(x.display_name).split(',');
    return {
      label: x.display_name,
      shortLabel: parts.slice(0, 2).join(',').trim(),
      name: x.name || parts[0].trim(),
      country: (x.address?.country || '').split(' / ')[0],
      iso2: (x.address?.country_code || '').toUpperCase() || null,
      kind: placeKind(x),
      lat,
      lon,
    };
  } catch {
    return null;
  }
}
