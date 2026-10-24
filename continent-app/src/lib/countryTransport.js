/**
 * countryTransport.js, per-country ground-transport profiles.
 *
 * The old leg estimator priced every European train at one speed and one fare
 * per km, which is how a Ghent -> Antwerp hop (a 10-minutes-frequency, 50-min
 * intercity line) got recommended as a bus ride. Reality differs per network:
 * Belgian rail is dense, cheap and frequent; Croatian rail barely connects the
 * coast; Albania has no passenger rail worth planning around; Luxembourg's
 * public transport is free. These profiles carry that per-country truth:
 *
 *   rail      'excellent' | 'good' | 'fair' | 'poor' | 'none'
 *             How strongly the network deserves to be the default intercity
 *             mode. 'none' removes the train option entirely.
 *   railKmh   effective door-to-door intercity speed (incl. typical stops)
 *   railEur   typical walk-up/advance fare per road km, EUR
 *   railOverheadH  station access + typical wait, hours (frequency proxy)
 *   busKmh / busEur / busOverheadH  same for intercity coaches. Coach
 *             frequency runs OPPOSITE to rail quality: sparse schedules where
 *             rail rules (a few FlixBuses a day), dense ones in the Balkans
 *             where the bus IS the network.
 *
 * Values are honest curated estimates per national network (2026), not live
 * fares; every consumer already labels these legs as estimates.
 */
import { rule } from './price/config.js';

// T690: the profiles and the fallback live in config/pricing.json
// (ground.country_profiles), the one copy the app and the pipeline read.
const PROFILES = rule('ground.country_profiles');

export const COUNTRY_TRANSPORT = PROFILES.countries;

const DEFAULT_PROFILE = PROFILES.default;

/** The ground-transport profile for a country (ISO2), with a sane fallback. */
export function transportProfile(iso2) {
  return COUNTRY_TRANSPORT[iso2] || DEFAULT_PROFILE;
}

const RAIL_RANK = { excellent: 4, good: 3, fair: 2, poor: 1, none: 0 };

/** A leg is only as good as its weaker rail network: 'excellent' Vienna ->
 *  'poor' Belgrade rides the Serbian half too. Returns the lower tier. */
export function legRailQuality(iso2A, iso2B) {
  const a = transportProfile(iso2A).rail;
  const b = transportProfile(iso2B).rail;
  return RAIL_RANK[a] <= RAIL_RANK[b] ? a : b;
}

/** How much the value-of-time score should favour (or distrust) the train on
 *  this leg, EUR-equivalent. Frequency, comfort and centre-to-centre arrival
 *  are real value that a bare price + hours score misses; a skeletal network
 *  (delays, transfers, no evening service) is a real cost it misses too. */
export const RAIL_SCORE_BONUS = rule('ground.rail_score_bonus');

/* --- Which landmass is a stop on? ----------------------------------------
 *
 * local_transport.road_connected=false means "no road from mainland Europe",
 * set country-wide for GB/IE/IS/MT/CY and per-dest for island places. Taken
 * literally per endpoint it declared London -> Edinburgh and Dublin -> Cork
 * "sea crossings" with zero priced modes. What actually decides whether an
 * overland leg exists is whether both stops share a LANDMASS: Great Britain
 * is one, the island of Ireland (Republic + Northern Ireland) another,
 * Sicily a third. Bridged or causeway-linked islands (Skye, Anglesey, Krk,
 * Ruegen, Oeland...) count as their mainland. */

// Northern Irish stops live on the Irish landmass: land border with IE,
// sea crossing to Great Britain.
const NI_CITIES = new Set([
  'Belfast', 'Derry', 'Cuilcagh Boardwalk', "Giant's Causeway",
  'Mourne Mountains', 'Portrush (Causeway Coast)', 'The Gobbins',
]);

// True offshore GB islands (ferry or flight only). Bridged ones (Skye,
// Anglesey) and tidal causeways (Lindisfarne, St Michael's Mount) are absent
// on purpose: they drive to the mainland.
const GB_ISLANDS = new Set([
  'Alderney', 'Guernsey', 'Jersey', 'Islay', 'Isle of Arran',
  'Isle of Harris (Luskentyre)', 'Isle of Man', 'Isle of Mull (Tobermory)',
  'Isle of Wight (The Needles)', 'Isles of Scilly',
  'Orkney (Kirkwall & Skara Brae)', 'Rathlin Island',
]);

const IE_ISLANDS = new Set(['Aran Islands (Inishmore)', 'Inishbofin']);

// Streymoy, Eysturoy, Vágar and the northern islands are joined by subsea
// tunnels and causeways and drive as one island; these are the ones you can
// only reach by ferry or helicopter. Treating every Faroese place as its own
// landmass priced Tórshavn -> Gjógv, a 40-minute drive, as a sea crossing.
const FO_FERRY_ONLY = new Set([
  'Mykines', 'Kalsoy', 'Suðuroy', 'Nólsoy', 'Sandoy',
  'Fugloy', 'Svínoy', 'Stóra Dímun', 'Skúvoy',
]);

// Multi-destination islands: stops here share a landmass with each other but
// not with the continent.
const ISLAND_GROUP = {
  Palermo: 'sicily', Catania: 'sicily', Trapani: 'sicily',
  Alghero: 'sardinia', Cagliari: 'sardinia', 'Olbia (Costa Smeralda)': 'sardinia',
  'Palma de Mallorca': 'mallorca', Soller: 'mallorca',
  'Tenerife North': 'tenerife', 'Tenerife South': 'tenerife',
  'Chania (Crete)': 'crete', 'Heraklion (Crete)': 'crete', 'Elounda & Spinalonga': 'crete',
  'Ponta Delgada (Azores)': 'sao-miguel', 'Sete Cidades (Sao Miguel)': 'sao-miguel',
  'Vila Franca Islet (Sao Miguel)': 'sao-miguel',
  'Ajaccio (Corsica)': 'corsica', 'Bastia (Corsica)': 'corsica',
  'Calvi (Corsica)': 'corsica', 'Figari (Corsica)': 'corsica',
  'Fårö (Gotland)': 'gotland', 'Visby (Gotland)': 'gotland',
  Saaremaa: 'saaremaa', Muhu: 'saaremaa',
};

// Flagged as islands in the data but road-linked in reality (bridge, causeway
// or plain mislabel), so they belong to the continent for leg purposes.
const MAINLAND_OVERRIDES = new Set([
  'Lake Bled', 'Sveti Stefan',                          // mislabelled: inland / tied island
  'Krk (Baška)', 'Pag Island (Novalja)',                // HR bridges
  'Öland', 'Svendborg', 'Romo',                         // SE/DK bridges + causeway
  'Rügen (Jasmund chalk cliffs)', 'Usedom', 'Sylt',     // DE bridges / rail causeway
  'Runde', 'Senja', 'Sommarøy', 'Vesterålen (Andenes)', // NO bridge networks
  'Nagu (Turku Archipelago)',                           // FI archipelago ring road
]);

/** Landmass id for a stop: 'continent', or a shared island id. Two stops can
 *  be joined overland iff their landmass ids are equal. */
export function landmassOf(dest) {
  if (!dest) return 'continent';
  const city = dest.city || '';
  const iso = dest.iso2;
  if (iso === 'IE') return IE_ISLANDS.has(city) ? `ie:${city}` : 'ireland';
  if (iso === 'GB') {
    if (NI_CITIES.has(city)) return 'ireland';
    return GB_ISLANDS.has(city) ? `gb:${city}` : 'britain';
  }
  if (iso === 'IS') return city === 'Vestmannaeyjar' ? 'is:vestmannaeyjar' : 'iceland';
  if (iso === 'MT') return (city === 'Gozo' || city === 'Comino') ? `mt:${city}` : 'malta';
  if (iso === 'CY') return 'cyprus';
  if (iso === 'FO') return FO_FERRY_ONLY.has(city) ? `fo:${city}` : 'fo-main';
  if ((dest.local_transport || {}).road_connected === false) {
    if (MAINLAND_OVERRIDES.has(city)) return 'continent';
    return ISLAND_GROUP[city] || `island:${city}`;
  }
  return 'continent';
}
