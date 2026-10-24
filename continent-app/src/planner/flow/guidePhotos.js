/**
 * guidePhotos.js (T656): one real photograph for each "what are you up for"
 * answer, taken from the catalogue: the best known place that is that kind of
 * place (its categories carry the trip type's tags, or the type's own match
 * rule says so) and has a photo. No photo is used twice, so the grid never
 * shows the same view under two names. Plain JS, node testable.
 */
import { TRIP_TYPE_BY_KEY } from '../../lib/countryMatch.js';

/**
 * The kinds that are a setting take the photograph of the best known place
 * of that kind from the layer that measures it (the beach, lake and summit
 * wires, comp.acclaim), each with its author and licence from the wire, so
 * the tile shows the setting itself rather than the town nearest it (T660
 * end check: the catalogue route put a city skyline under Beaches). Picked
 * once from the published wires on 2026-10-24 and looked at; the rest of the
 * kinds read the catalogue below.
 */
export const LAYER_PHOTOS = {
  beach: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Nissi_bay_aerial_Cyprus_%2842818864975%29.jpg/500px-Nissi_bay_aerial_Cyprus_%2842818864975%29.jpg", city: "Nissi beach", iso2: "CY", by: "dronepicr", lic: "CC BY 2.0", page: "https://commons.wikimedia.org/wiki/File%3ANissi_bay_aerial_Cyprus_%2842818864975%29.jpg" },
  islands: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Aerial_of_Navagio_Shipwreck_Beach_%2846470701841%29.jpg/500px-Aerial_of_Navagio_Shipwreck_Beach_%2846470701841%29.jpg", city: "Navagio", iso2: "GR", by: "dronepicr", lic: "CC BY 2.0", page: "https://commons.wikimedia.org/wiki/File%3AAerial_of_Navagio_Shipwreck_Beach_%2846470701841%29.jpg" },
  lakes: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Lake_Como_003.jpg/500px-Lake_Como_003.jpg", city: "Lake Como", iso2: "IT", by: "Sturm", lic: "CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File%3ALake_Como_003.jpg" },
  hiking: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Olympus_National_Park_30.jpg/500px-Olympus_National_Park_30.jpg", city: "Mount Olympus", iso2: "GR", by: "kallerna", lic: "CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File%3AOlympus_National_Park_30.jpg" },
  ski: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Panorama_of_Mont_Blanc_du_Tacul%2C_Mont_Maudit_and_Mont_Blanc_from_Aiguille_du_Midi%2C_Chamonix%2C_Haute-Savoie.jpg/500px-Panorama_of_Mont_Blanc_du_Tacul%2C_Mont_Maudit_and_Mont_Blanc_from_Aiguille_du_Midi%2C_Chamonix%2C_Haute-Savoie.jpg", city: "Mont Blanc", iso2: "FR", by: "Christian David", lic: "CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File%3APanorama_of_Mont_Blanc_du_Tacul%2C_Mont_Maudit_and_Mont_Blanc_from_Aiguille_du_Midi%2C_Chamonix%2C_Haute-Savoie.jpg" },
};

const SETTINGS = new Set(['beach', 'lakes', 'hiking', 'islands', 'ski', 'hidden', 'wellness', 'cycling']);
const BIG = new Set(['metro', 'city']);

export function likePhotos(destinations, keys) {
  const rows = Object.values(destinations || {})
    .filter((d) => d?.image?.url && d.city)
    .sort((a, b) => (b.rating?.fame || 0) - (a.rating?.fame || 0));
  const used = new Set();
  const out = {};
  for (const k of keys) {
    if (LAYER_PHOTOS[k]) {
      used.add(LAYER_PHOTOS[k].url);
      out[k] = LAYER_PHOTOS[k];
      continue;
    }
    const type = TRIP_TYPE_BY_KEY.get(k);
    if (!type) continue;
    const tags = new Set(type.tags || []);
    const main = (type.tags || [])[0];
    // A kind that is a setting (a beach, a lake, a mountain) is shown by a
    // town or village: a big city's photo is its skyline, not its beach.
    const setting = SETTINGS.has(k);
    const ok = (d) => !used.has(d.image.url) && (d.rating?.score || 0) >= 7.5
      && !(setting && BIG.has(d.place?.class));
    // The type's first tag says what the place IS (beach, lake, hiking); a
    // place carrying it beats one that only shares a looser tag ("coast"
    // put a city skyline under Beaches in the end check).
    // A hidden-gem kind first asks for a place the catalogue rates as one.
    const hit = (type.gem && rows.find((d) => ok(d) && d.rating?.hidden_gem === true))
      || rows.find((d) => ok(d) && main && (d.categories || []).includes(main))
      || rows.find((d) => ok(d)
        && ((d.categories || []).some((c) => tags.has(c)) || (type.match ? type.match(d) : false)));
    if (hit) {
      used.add(hit.image.url);
      out[k] = { url: hit.image.url, city: hit.city, iso2: hit.iso2 || null };
    }
  }
  return out;
}
