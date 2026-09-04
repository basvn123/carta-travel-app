/**
 * tripKinds.js, what KIND of trip the traveller is planning, and everything
 * that follows from that one answer.
 *
 * The guided wizard asks "what kind of trip?" right after the dates. The
 * answer drives four things downstream, all read from here so they never
 * drift apart:
 *
 *   1. Which countries Carta recommends on the Where step (recommendCountries):
 *      a curated, exhaustive table per kind (why each country earns its
 *      place, the regions to aim for, the months that work), joined to the
 *      live catalogue (how many fitting places are catalogued, the published
 *      trails, the cheapest stored fare into the country for the dates).
 *   2. How cities rank on the Stay step (kindFitScore): the catalogue's
 *      category tags and beauty components read through the kind's lens.
 *   3. The defaults the kind implies (one base or a moving route, how full the
 *      days feel, which interests the auto-designer weighs).
 *   4. What the Day planner opens on for a day of this trip (dayCat), so a
 *      cycling trip lands on active places and a chilling trip on beaches.
 *
 * Distinct from trip_kinds.js, which is the map's category filter chips.
 */
import {
  BikeIcon, RunIcon, MountainIcon, TreeIcon, BeachIcon, CastleIcon, DiningIcon, MoonIcon,
} from '../components/Icons.jsx';

export const TRIP_KINDS = [
  {
    key: 'cycling',
    labelKey: 'kind.cycling',
    subKey: 'kind.cyclingSub',
    Icon: BikeIcon,
    stayStyle: 'single',
    pace: 'balanced',
    interests: ['outdoors', 'sports'],
    dayCat: 'active',
    exploreCats: ['town', 'active'],
    strong: ['countryside', 'lake', 'lakes', 'valley', 'wine', 'island', 'coast'],
    soft: ['village', 'quiet', 'nature', 'national-park', 'town', 'family'],
    comp: 'nature',
  },
  {
    key: 'running',
    labelKey: 'kind.running',
    subKey: 'kind.runningSub',
    Icon: RunIcon,
    stayStyle: 'single',
    pace: 'balanced',
    interests: ['sports', 'outdoors', 'cafes'],
    dayCat: 'active',
    exploreCats: ['town', 'active'],
    strong: ['city', 'coast', 'lake', 'lakes'],
    soft: ['university', 'modern', 'iconic', 'countryside', 'beach'],
    comp: 'iconic',
  },
  {
    key: 'trail',
    labelKey: 'kind.trail',
    subKey: 'kind.trailSub',
    Icon: MountainIcon,
    stayStyle: 'single',
    pace: 'packed',
    interests: ['outdoors', 'sports'],
    dayCat: 'nature',
    exploreCats: ['town', 'active'],
    strong: ['mountains', 'alps', 'hiking', 'volcanic', 'fjord', 'fjords', 'carpathians', 'wilderness'],
    soft: ['national-park', 'valley', 'nature', 'lake', 'lakes', 'island', 'adventure', 'skiing'],
    comp: 'nature',
  },
  {
    key: 'hiking',
    labelKey: 'kind.hiking',
    subKey: 'kind.hikingSub',
    Icon: TreeIcon,
    stayStyle: 'multi',
    pace: 'balanced',
    interests: ['outdoors', 'photo'],
    dayCat: 'nature',
    exploreCats: ['town', 'active', 'sight'],
    strong: ['hiking', 'mountains', 'alps', 'national-park', 'wilderness', 'fjord', 'fjords'],
    soft: ['nature', 'lake', 'lakes', 'valley', 'countryside', 'volcanic', 'carpathians', 'village', 'island'],
    comp: 'nature',
  },
  {
    key: 'chilling',
    labelKey: 'kind.chilling',
    subKey: 'kind.chillingSub',
    Icon: BeachIcon,
    stayStyle: 'single',
    pace: 'relaxed',
    interests: ['beaches', 'wellness', 'food'],
    dayCat: 'all',
    exploreCats: ['town', 'beach'],
    strong: ['beach', 'island', 'spa', 'thermal'],
    soft: ['coast', 'lake', 'lakes', 'quiet', 'romantic', 'village', 'sailing', 'diving'],
    comp: 'beach',
  },
  {
    key: 'sightseeing',
    labelKey: 'kind.sightseeing',
    subKey: 'kind.sightseeingSub',
    Icon: CastleIcon,
    stayStyle: 'multi',
    pace: 'balanced',
    interests: ['culture', 'architecture', 'museums'],
    dayCat: 'sight',
    exploreCats: ['town', 'sight'],
    strong: ['city', 'historic', 'unesco', 'iconic', 'medieval', 'roman', 'baroque', 'renaissance', 'gothic'],
    soft: ['art', 'castle', 'cathedral', 'fortress', 'fairytale', 'ruins', 'byzantine', 'ottoman', 'monastery'],
    comp: 'heritage',
  },
  {
    key: 'food',
    labelKey: 'kind.food',
    subKey: 'kind.foodSub',
    Icon: DiningIcon,
    stayStyle: 'multi',
    pace: 'relaxed',
    interests: ['food', 'cafes', 'culture'],
    dayCat: 'food',
    exploreCats: ['town', 'sight'],
    strong: ['food', 'wine', 'beer'],
    soft: ['city', 'countryside', 'village', 'university', 'historic'],
    comp: 'heritage',
  },
  {
    key: 'nightlife',
    labelKey: 'kind.nightlife',
    subKey: 'kind.nightlifeSub',
    Icon: MoonIcon,
    stayStyle: 'single',
    pace: 'relaxed',
    interests: ['nightlife', 'food', 'beaches'],
    dayCat: 'food',
    exploreCats: ['town', 'beach'],
    strong: ['nightlife', 'party', 'music'],
    soft: ['city', 'university', 'beach', 'island', 'modern'],
    comp: 'iconic',
  },
];

export const KIND_BY_KEY = Object.fromEntries(TRIP_KINDS.map((k) => [k.key, k]));

export function kindByKey(key) {
  return KIND_BY_KEY[key] || null;
}

/* ── Who is going ─────────────────────────────────────────────────────────
   The party shape sets the traveller count and nudges the defaults: a family
   day is not a friends' day. Kept small on purpose, the count stays editable. */
export const PARTY_TYPES = [
  { key: 'solo', labelKey: 'who.solo', subKey: 'who.soloSub', size: 1 },
  { key: 'couple', labelKey: 'who.couple', subKey: 'who.coupleSub', size: 2 },
  { key: 'friends', labelKey: 'who.friends', subKey: 'who.friendsSub', size: 4 },
  { key: 'family', labelKey: 'who.family', subKey: 'who.familySub', size: 4 },
];

/* ── City fit ─────────────────────────────────────────────────────────────
   0..1, how well one catalogued place suits a kind of trip. Strong tags are
   the honest signal; soft tags and the matching beauty component add texture
   so a list never ties at zero. */
export function kindFitScore(dest, kindKey) {
  const kind = KIND_BY_KEY[kindKey];
  if (!kind || !dest) return 0;
  const cats = new Set(dest.categories || []);
  let s = 0;
  let strongHits = 0;
  for (const c of kind.strong) if (cats.has(c)) strongHits += 1;
  s += Math.min(0.6, strongHits * 0.3);
  let softHits = 0;
  for (const c of kind.soft) if (cats.has(c)) softHits += 1;
  s += Math.min(0.2, softHits * 0.08);
  const comp = dest.beauty?.components?.[kind.comp] || 0;
  s += comp * 0.25;
  if (kindKey === 'chilling' && dest.beauty?.top_beach) s += 0.2;
  if (kindKey === 'chilling' && dest.bathing_water?.rating === 'Excellent') s += 0.05;
  if ((kindKey === 'running' || kindKey === 'nightlife') && dest.local_transport?.transit_quality === 'excellent') s += 0.1;
  if (kindKey === 'running' && (dest.geonames?.population || 0) >= 200000) s += 0.15;
  if ((kindKey === 'trail' || kindKey === 'hiking') && dest.nature?.park) s += 0.15;
  if (kindKey === 'sightseeing' && (dest.beauty?.unesco_count || 0) > 0) s += 0.1;
  return Math.min(1, s);
}

/* ── The curated country table ────────────────────────────────────────────
   Tier 1 is where the kind is the reason to go; tier 2 is a genuinely good
   choice with a narrower window or a smaller area. `months` are the months
   that work for that kind there (1..12); `regions` name where to aim.
   Kept as plain facts a traveller could check; nothing here is a slogan. */
const R = (iso2, tier, months, why, regions) => ({ iso2, tier, months, why, regions });
const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const span = (a, b) => {
  const out = [];
  for (let m = a; ; m = (m % 12) + 1) { out.push(m); if (m === b) break; }
  return out;
};

export const KIND_COUNTRIES = {
  cycling: [
    R('NL', 1, span(4, 10), 'Over 35,000 km of signed cycle paths in the flattest country in Europe. Every town is rideable from the door.', 'Utrecht, Friesland, the Wadden coast'),
    R('DK', 1, span(5, 9), 'Copenhagen has more bikes than people, and the national routes run coast to coast on separated lanes.', 'Copenhagen, Bornholm, Funen'),
    R('BE', 1, span(4, 10), 'Flanders is the home of the cobbled classics; Wallonia has the car-free RAVeL network on old railway lines.', 'Flanders, the Ardennes, the coast'),
    R('FR', 1, span(5, 10), 'The Loire à Vélo runs 900 km past the châteaux; Alpe d\'Huez and Mont Ventoux wait for the climbers.', 'Loire valley, Provence, the Alps'),
    R('IT', 1, [4, 5, 6, 9, 10], 'Tuscany\'s white gravel roads, the Dolomite passes and the lakeside paths of Garda in one country.', 'Tuscany, Dolomites, Lake Garda'),
    R('ES', 1, [2, 3, 4, 5, 6, 9, 10, 11], 'Mallorca is where the pros train in winter: smooth roads, Sa Calobra and sun in February. Girona is the road capital.', 'Mallorca, Girona, Andalusia'),
    R('AT', 1, span(5, 9), 'The Danube path from Passau to Vienna is nearly flat for 300 km and has a bike-friendly inn in every village.', 'Danube valley, Salzkammergut, Tyrol'),
    R('DE', 1, span(5, 9), 'Signed long-distance routes follow the Rhine, Mosel, Elbe and Bodensee, with a train home from every town.', 'Mosel, Bodensee, Berlin'),
    R('SI', 2, span(5, 9), 'Ljubljana to Bled to the Soča valley on quiet roads. Short distances, big mountains.', 'Bled, Soča valley, Ljubljana'),
    R('PT', 2, [3, 4, 5, 6, 9, 10, 11], 'The Ecovia runs the length of the Algarve coast and the Douro terraces climb from Porto. Warm in the off-season.', 'Algarve, Douro valley'),
    R('CH', 2, span(6, 9), 'Alpine passes for the strong, lake and river paths for everyone else, and every train carries bikes.', 'Lake Geneva, Valais, Graubünden'),
    R('HR', 2, [5, 6, 9, 10], 'The Parenzana rail trail crosses Istria\'s hill towns; the islands of Krk, Cres and Hvar ride as loops.', 'Istria, Kvarner islands, Hvar'),
    R('LU', 2, span(4, 10), 'More than 600 km of signed cycle paths in a country you can cross in a day, with free public transport.', 'Moselle, Müllerthal'),
    R('CZ', 2, span(5, 9), 'The Greenways link Prague and Vienna through castle towns; South Moravia\'s wine trails run cellar to cellar.', 'South Moravia, Bohemia'),
    R('IE', 2, span(5, 9), 'The Great Western Greenway and the Waterford Greenway are traffic-free rail trails through green country.', 'Mayo, Waterford, Kerry'),
    R('SE', 2, span(6, 8), 'The Kattegattleden follows 390 km of west coast from Helsingborg to Gothenburg, signed the whole way.', 'West coast, Gotland'),
    R('HU', 2, span(5, 9), 'The Lake Balaton loop is 200 km of flat, signed path around Central Europe\'s largest lake.', 'Lake Balaton, Danube bend'),
    R('PL', 2, span(5, 9), 'The Green Velo route runs 2,000 km through the quiet east; the Masurian lakes ride best in June.', 'Masuria, Podlasie'),
    R('EE', 2, span(6, 8), 'Flat, forested and empty. Tallinn to the islands of Saaremaa and Hiiumaa on roads with hardly a car.', 'Saaremaa, Hiiumaa'),
  ],
  running: [
    R('NL', 1, ALL_YEAR, 'Amsterdam\'s Vondelpark and the Amstel river path are flat, car-free and lit. Running culture is everywhere.', 'Amsterdam, Utrecht, Rotterdam'),
    R('DE', 1, ALL_YEAR, 'Berlin\'s Tiergarten and Tempelhof, the Isar path in Munich and the fastest marathon course in the world.', 'Berlin, Munich, Hamburg'),
    R('GB', 1, ALL_YEAR, 'The Royal Parks and the Thames path in London, Arthur\'s Seat in Edinburgh, and a free parkrun every Saturday.', 'London, Edinburgh, Bristol'),
    R('ES', 1, ALL_YEAR, 'Valencia\'s Turia gardens give 9 km of car-free running; Barcelona has the seafront, Madrid the Retiro.', 'Valencia, Barcelona, Madrid'),
    R('PT', 1, ALL_YEAR, 'Lisbon\'s riverside runs flat to Belém; Porto follows the Douro to the ocean. Mild even in January.', 'Lisbon, Porto, Cascais'),
    R('FR', 1, ALL_YEAR, 'The Seine quays and the Bois de Boulogne in Paris; the Promenade des Anglais in Nice for sea-level miles.', 'Paris, Nice, Lyon'),
    R('DK', 1, span(4, 10), 'Copenhagen\'s lakes loop and the Amager beach path, on the safest streets in Europe.', 'Copenhagen, Aarhus'),
    R('AT', 1, span(3, 11), 'Vienna\'s Prater Hauptallee is 4.4 km dead straight and car-free; the Danube island adds 20 km more.', 'Vienna, Salzburg'),
    R('IT', 2, [3, 4, 5, 6, 9, 10, 11], 'Rome\'s Villa Borghese and the Appia Antica, Florence\'s Cascine park, Milan\'s Parco Sempione.', 'Rome, Florence, Milan'),
    R('CZ', 2, span(4, 10), 'Prague\'s Stromovka and Letná parks sit above the river with the city as the backdrop.', 'Prague, Brno'),
    R('IE', 2, ALL_YEAR, 'Phoenix Park in Dublin is one of the largest walled city parks in Europe. Green, mild and rarely hot.', 'Dublin, Galway'),
    R('HU', 2, span(3, 11), 'Margaret Island\'s 5.3 km loop in Budapest has a rubber running track all the way round.', 'Budapest'),
    R('SE', 2, span(5, 9), 'Stockholm\'s Djurgården island and the waterfront run for hours without a traffic light.', 'Stockholm, Gothenburg'),
    R('BE', 2, ALL_YEAR, 'Bois de la Cambre and the Sonian forest in Brussels; Ghent and Bruges are flat and small enough to loop.', 'Brussels, Ghent'),
    R('CH', 2, span(4, 10), 'The lake paths in Zurich and Geneva are flat and clean; the hills behind them are not.', 'Zurich, Geneva, Lucerne'),
    R('PL', 2, span(4, 10), 'Warsaw\'s Vistula boulevards and Kraków\'s Błonia meadow, both open, flat and free of cars.', 'Warsaw, Kraków'),
    R('NO', 2, span(5, 9), 'Oslo\'s Akerselva river path climbs from the fjord into the forest in one run.', 'Oslo, Bergen'),
    R('FI', 2, span(5, 9), 'Helsinki\'s waterfront and Central Park trails, with a sauna at the end of every run.', 'Helsinki'),
  ],
  trail: [
    R('CH', 1, span(6, 10), 'Zermatt, the Eiger trail and Sierre-Zinal. Lifts take you up, the singletrack takes you down.', 'Valais, Bernese Oberland, Engadin'),
    R('FR', 1, span(6, 10), 'Chamonix is the home of the UTMB; the Pyrenees and the Vercors are quieter and every bit as steep.', 'Chamonix, Pyrenees, Vercors'),
    R('IT', 1, span(6, 10), 'The Dolomites: Lavaredo, Alta Via ridgelines and rifugios for lunch. Cinque Terre for coastal miles.', 'Dolomites, Aosta valley, Cinque Terre'),
    R('ES', 1, ALL_YEAR, 'The Canaries run year-round (Transvulcania on La Palma); the Pyrenees, Picos and Mallorca\'s Tramuntana in season.', 'Canary Islands, Pyrenees, Mallorca'),
    R('AT', 1, span(6, 10), 'Innsbruck calls itself the trail-running capital. Tyrol, the Glockner and Zugspitze regions back it up.', 'Tyrol, Salzburgerland'),
    R('PT', 1, ALL_YEAR, 'Madeira\'s levadas and ridgelines host the MIUT; the Azores add volcano rims. Mild all year.', 'Madeira, Azores, Sintra'),
    R('NO', 1, span(6, 9), 'Fjord-side trails in Romsdal and the Lofoten peaks, run under the midnight sun in June and July.', 'Romsdal, Lofoten, Jotunheimen'),
    R('SI', 1, span(6, 10), 'The Julian Alps around Triglav and the Soča valley, with mountain huts a day apart.', 'Julian Alps, Soča valley'),
    R('GB', 2, span(4, 10), 'Fell running in the Lake District, Snowdonia and the Highlands: boggy, steep and utterly free of lifts.', 'Lake District, Snowdonia, Highlands'),
    R('AD', 2, span(6, 10), 'Almost nothing below 1,000 m. The Ronda dels Cims circles the whole country in one race.', 'Ordino, Grandvalira'),
    R('GR', 2, [4, 5, 6, 9, 10], 'Mount Olympus, the Zagori gorges and Crete\'s Samaria. Spring and autumn only.', 'Olympus, Zagori, Crete'),
    R('IS', 2, span(7, 9), 'The Laugavegur trail crosses rhyolite hills, lava and glaciers in 55 km. Short season, long days.', 'Landmannalaugar, Snæfellsnes'),
    R('ME', 2, span(6, 9), 'Durmitor\'s peaks above the Tara canyon, Europe\'s deepest, on trails few people have heard of.', 'Durmitor, Prokletije'),
    R('DE', 2, span(5, 10), 'The Bavarian Alps around Garmisch and the Black Forest\'s long ridges. Well signed, well served by rail.', 'Bavarian Alps, Black Forest'),
    R('PL', 2, span(6, 9), 'The High Tatras rise straight out of Zakopane; the Bieszczady ridges are wild and empty.', 'Tatras, Bieszczady'),
    R('SK', 2, span(6, 9), 'The Slovak side of the High Tatras has the huts, the chairlifts and half the crowds.', 'High Tatras, Low Tatras'),
    R('FO', 2, span(6, 8), 'Eighteen islands of grass, cliff and sea. No trees, no shade, no flat kilometre anywhere.', 'Streymoy, Vágar'),
    R('BG', 2, span(6, 9), 'Rila and Pirin hold the highest peaks in the Balkans and the Seven Rila Lakes loop.', 'Rila, Pirin'),
    R('RO', 2, span(6, 9), 'The Carpathians: Făgăraș ridge, Piatra Craiului, and bears. Real wilderness, three hours from Bucharest.', 'Făgăraș, Bucegi'),
    R('IE', 2, span(4, 10), 'The Wicklow mountains from Dublin and the Kerry peaks around Killarney, green and soft underfoot.', 'Wicklow, Kerry'),
    R('AL', 2, span(6, 9), 'The Accursed Mountains: the Theth to Valbona pass is the best-known day in the Balkans.', 'Theth, Valbona'),
  ],
  hiking: [
    R('CH', 1, span(6, 10), 'Sixty-five thousand kilometres of signed paths, a hut or a train at the end of every one of them.', 'Bernese Oberland, Valais, Engadin'),
    R('AT', 1, span(6, 10), 'Hut-to-hut walking in Tyrol and the Hohe Tauern, with lifts to skip the dull bits and a lake to swim in after.', 'Tyrol, Salzkammergut, Hohe Tauern'),
    R('IT', 1, span(6, 10), 'The Dolomites\' Alta Via routes and the Tre Cime loop; Cinque Terre and Amalfi for walking by the sea.', 'Dolomites, Cinque Terre, Amalfi'),
    R('FR', 1, span(6, 10), 'The Tour du Mont Blanc, the GR20 on Corsica and the Pyrenean GR10. The GR network covers the whole country.', 'Alps, Pyrenees, Corsica'),
    R('NO', 1, span(6, 9), 'Trolltunga, Preikestolen and the Lofoten peaks: the famous views are day hikes from a road.', 'Lofoten, Hardanger, Jotunheimen'),
    R('ES', 1, [3, 4, 5, 6, 9, 10, 11], 'The Camino de Santiago, the Picos de Europa and the Canary Islands\' caldera paths, which walk all winter.', 'Picos de Europa, Pyrenees, Canary Islands'),
    R('PT', 1, [3, 4, 5, 6, 9, 10, 11], 'Madeira\'s levada paths and the Rota Vicentina down the Alentejo cliffs. Walkable most of the year.', 'Madeira, Alentejo coast, Azores'),
    R('SI', 1, span(5, 10), 'Triglav national park, the Soča valley and the Vintgar gorge, all within an hour of Ljubljana.', 'Julian Alps, Soča valley, Bled'),
    R('GB', 2, span(4, 10), 'The West Highland Way, the Lake District fells and the coast path of Cornwall. Pubs at every stage end.', 'Highlands, Lake District, Cornwall'),
    R('IS', 2, span(6, 9), 'Laugavegur, Fimmvörðuháls and the Snæfellsnes coast. Weather is the only thing you cannot plan.', 'Landmannalaugar, Snæfellsnes'),
    R('IE', 2, span(4, 10), 'The Wicklow Way, Kerry\'s Dingle peninsula and the Causeway coast in the north. Soft going, big skies.', 'Wicklow, Kerry, Connemara'),
    R('DE', 2, span(5, 10), 'Saxon Switzerland\'s sandstone towers, the Black Forest\'s ridge trails and the Bavarian Alps from Garmisch.', 'Saxon Switzerland, Black Forest, Bavaria'),
    R('GR', 2, [4, 5, 6, 9, 10], 'Samaria gorge on Crete, the Zagori villages and Mount Olympus in spring and autumn.', 'Crete, Zagori, Olympus'),
    R('HR', 2, [4, 5, 6, 9, 10], 'Plitvice\'s lakes on boardwalks, Paklenica\'s canyon and the island ridges of Brač and Hvar.', 'Plitvice, Paklenica, Dalmatian islands'),
    R('ME', 2, span(5, 10), 'Durmitor and the Bay of Kotor\'s ladder path, 1,000 m straight up from the old town.', 'Durmitor, Kotor'),
    R('SK', 2, span(6, 9), 'The High Tatras have a hut every few hours and the Slovak Paradise has ladders through its gorges.', 'High Tatras, Slovak Paradise'),
    R('PL', 2, span(6, 9), 'Zakopane\'s Tatras trails and the Bieszczady in the south-east, where the ridges are grass and empty.', 'Tatras, Bieszczady'),
    R('RO', 2, span(6, 9), 'The Carpathians\' Făgăraș ridge and Piatra Craiului, plus Transylvania\'s Saxon villages walked from town to town.', 'Făgăraș, Transylvania'),
    R('BG', 2, span(6, 9), 'The Seven Rila Lakes, the Pirin peaks and the monastery paths. Cheap huts, few visitors.', 'Rila, Pirin'),
    R('AL', 2, span(6, 9), 'The Theth to Valbona pass in the Accursed Mountains has become the Balkan classic, and it is still cheap.', 'Theth, Valbona, Llogara'),
    R('AD', 2, span(6, 10), 'Three national parks in 468 square kilometres and every trail above the tree line.', 'Ordino, Madriu valley'),
    R('FO', 2, span(6, 8), 'Cliff-edge paths between villages, the Slættaratindur summit and the lake that hangs above the sea.', 'Vágar, Streymoy'),
    R('CZ', 2, span(5, 10), 'Bohemian Switzerland\'s Pravčická arch and the sandstone Adršpach rocks, marked trails throughout.', 'Bohemian Switzerland, Adršpach'),
    R('BA', 2, span(5, 10), 'The Via Dinarica crosses the country; Sutjeska has one of the last primeval forests in Europe.', 'Sutjeska, Blidinje'),
    R('MK', 2, span(5, 10), 'Mavrovo and Galičica above Lake Ohrid, on paths that see more sheep than hikers.', 'Ohrid, Mavrovo'),
    R('SE', 2, span(7, 9), 'The Kungsleden runs 440 km through Lapland with a cabin every 10 to 20 km.', 'Lapland, Höga Kusten'),
    R('FI', 2, span(7, 9), 'Lapland fells and the lake-district forests, with free wilderness huts along the way.', 'Lapland, Koli'),
    R('LI', 2, span(6, 10), 'A 75 km trail crosses the whole principality, from the Rhine to the Alps.', 'Malbun, Vaduz'),
  ],
  chilling: [
    R('GR', 1, span(5, 10), 'Two hundred inhabited islands and warm sea from May to October. Naxos, Milos and Crete for the beaches.', 'Cyclades, Crete, Ionian islands'),
    R('ES', 1, ALL_YEAR, 'The Balearics and the Costa Brava in summer; the Canaries hold 20 degrees through the winter.', 'Mallorca, Menorca, Canary Islands'),
    R('PT', 1, [4, 5, 6, 7, 8, 9, 10], 'The Algarve\'s cliff-backed coves and the empty Alentejo beaches. Warm into October.', 'Algarve, Alentejo coast, Comporta'),
    R('IT', 1, span(5, 10), 'Sardinia\'s water, Puglia\'s whitewashed towns, Sicily\'s slow afternoons. Aperitivo is the schedule.', 'Sardinia, Puglia, Sicily'),
    R('HR', 1, span(5, 10), 'A thousand islands in clear Adriatic water and ferries between them. Vis and Korčula are the quiet ones.', 'Dalmatian islands, Istria'),
    R('CY', 1, span(4, 11), 'The warmest sea in the Mediterranean and swimming weather well into November.', 'Paphos, Ayia Napa, Akamas'),
    R('MT', 1, span(4, 11), 'Three small islands, Gozo\'s slow pace and the Blue Lagoon. Around 300 days of sun.', 'Gozo, Comino, Valletta'),
    R('FR', 1, span(5, 10), 'The Côte d\'Azur, Corsica\'s beaches and Provence villages where lunch takes three hours.', 'Côte d\'Azur, Corsica, Provence'),
    R('ME', 2, span(5, 10), 'The Bay of Kotor and the Budva riviera at a fraction of the Croatian price.', 'Kotor, Budva, Ulcinj'),
    R('AL', 2, span(5, 10), 'The Albanian riviera has Ionian water like Corfu\'s, a few miles away, at half the cost.', 'Ksamil, Dhërmi, Himara'),
    R('BG', 2, span(6, 9), 'The Black Sea coast is the cheapest beach week in the EU; Sozopol and Nesebar have the old towns.', 'Sozopol, Nesebar'),
    R('HU', 2, [4, 5, 6, 7, 8, 9, 10], 'Budapest\'s thermal baths in any season and Lake Balaton\'s shallow, warm water in summer.', 'Budapest, Lake Balaton'),
    R('SI', 2, span(5, 9), 'Lake Bled and Bohinj, the Portorož spa coast, all a short drive apart.', 'Bled, Bohinj, Portorož'),
    R('AT', 2, span(6, 9), 'Lakes you can drink from in the Salzkammergut and thermal spas in Styria.', 'Salzkammergut, Carinthia, Styria'),
    R('DE', 2, span(6, 9), 'Rügen and Sylt on the Baltic and North Sea, Baden-Baden\'s spas, the Bavarian lakes.', 'Rügen, Sylt, Baden-Baden'),
    R('DK', 2, span(6, 8), 'Skagen\'s dunes and the west-coast beaches, long summer evenings, hygge as the national policy.', 'Skagen, Bornholm'),
    R('NL', 2, span(6, 8), 'The Wadden islands, Zandvoort\'s beach an hour from Amsterdam, and everything flat and calm.', 'Texel, Zandvoort'),
    R('CZ', 2, ALL_YEAR, 'Karlovy Vary and Mariánské Lázně: spa towns built for doing nothing well.', 'Karlovy Vary, Mariánské Lázně'),
    R('IS', 2, ALL_YEAR, 'Hot springs in every valley and the Blue Lagoon. Cold outside, warm in the water.', 'Reykjavík, Golden Circle'),
    R('EE', 2, span(6, 8), 'Pärnu\'s long beach and spa hotels, the summer capital since the tsars.', 'Pärnu, Saaremaa'),
    R('LV', 2, span(6, 8), 'Jūrmala\'s 33 km of white sand and pine, 30 minutes from Riga.', 'Jūrmala'),
    R('IE', 2, span(6, 8), 'Not a beach holiday, but a slow one: west-coast villages, sea swims and a fire in the pub.', 'Dingle, Connemara'),
  ],
  sightseeing: [
    R('IT', 1, [3, 4, 5, 6, 9, 10, 11], 'More UNESCO sites than any country on earth. Rome, Florence and Venice are only the start.', 'Rome, Florence, Venice, Naples'),
    R('FR', 1, [3, 4, 5, 6, 9, 10, 11], 'Paris, the Loire châteaux, Mont-Saint-Michel and the Roman south. A lifetime of it.', 'Paris, Loire valley, Provence'),
    R('ES', 1, [3, 4, 5, 6, 9, 10, 11], 'Barcelona\'s Gaudí, Granada\'s Alhambra, Seville, Toledo and the Prado in Madrid.', 'Andalusia, Barcelona, Madrid'),
    R('PT', 1, ALL_YEAR, 'Lisbon\'s hills and tiles, Porto\'s river, Sintra\'s palaces, and it stays mild all year.', 'Lisbon, Porto, Sintra'),
    R('GB', 1, ALL_YEAR, 'London\'s free museums, Edinburgh\'s old town, Bath, Oxford and York. Rail links all of it.', 'London, Edinburgh, Bath, York'),
    R('DE', 1, [4, 5, 6, 7, 8, 9, 10, 12], 'Berlin\'s history, Munich and the Bavarian castles, Dresden rebuilt, and the Christmas markets in December.', 'Berlin, Munich, Dresden, Rhine'),
    R('AT', 1, ALL_YEAR, 'Vienna\'s palaces and coffee houses, Salzburg\'s baroque old town, Hallstatt on its lake.', 'Vienna, Salzburg, Hallstatt'),
    R('CZ', 1, ALL_YEAR, 'Prague\'s castle, bridge and old town survived the century intact; Český Krumlov is the small-scale version.', 'Prague, Český Krumlov, Kutná Hora'),
    R('NL', 1, [3, 4, 5, 6, 7, 8, 9, 10], 'Amsterdam\'s canals and the Rijksmuseum, Delft, the Hague, and tulips in April.', 'Amsterdam, Delft, Haarlem'),
    R('GR', 1, [3, 4, 5, 6, 9, 10, 11], 'The Acropolis, Delphi, Meteora\'s monasteries and Knossos on Crete.', 'Athens, Delphi, Meteora, Crete'),
    R('BE', 1, ALL_YEAR, 'Bruges and Ghent are medieval cities in walking size; Antwerp has Rubens and the diamonds.', 'Bruges, Ghent, Antwerp, Brussels'),
    R('HU', 1, ALL_YEAR, 'Budapest\'s parliament, baths and castle hill on both banks of the Danube.', 'Budapest, Eger, Pécs'),
    R('PL', 2, span(4, 10), 'Kraków\'s market square and Wawel, Gdańsk\'s rebuilt Hanseatic waterfront, Wrocław\'s islands.', 'Kraków, Gdańsk, Wrocław, Warsaw'),
    R('HR', 2, [4, 5, 6, 9, 10], 'Dubrovnik\'s walls, Split\'s Roman palace still lived in, and Zadar\'s sea organ.', 'Dubrovnik, Split, Zadar'),
    R('IE', 2, ALL_YEAR, 'Dublin\'s Trinity library and Georgian squares, Kilkenny\'s castle, the Rock of Cashel.', 'Dublin, Kilkenny, Galway'),
    R('MT', 2, ALL_YEAR, 'Valletta is a whole baroque capital in one square kilometre; Mdina is the silent city.', 'Valletta, Mdina'),
    R('RO', 2, span(4, 10), 'Transylvania\'s Saxon towns and fortified churches, Bran and Peleș castles, painted monasteries in the north.', 'Transylvania, Bucovina'),
    R('BG', 2, span(4, 10), 'Plovdiv\'s Roman theatre and old town, Rila monastery, Veliko Tarnovo\'s fortress.', 'Plovdiv, Rila, Veliko Tarnovo'),
    R('SI', 2, span(4, 10), 'Ljubljana\'s Plečnik architecture and river cafés, Bled\'s island church, Piran\'s Venetian square.', 'Ljubljana, Bled, Piran'),
    R('EE', 2, [5, 6, 7, 8, 9, 12], 'Tallinn\'s old town is the best-preserved medieval city in northern Europe.', 'Tallinn, Tartu'),
    R('LV', 2, span(5, 9), 'Riga has the largest set of art nouveau buildings anywhere, and a Hanseatic old town beside them.', 'Riga'),
    R('LT', 2, span(5, 9), 'Vilnius\'s baroque old town, Trakai\'s island castle and the Hill of Crosses.', 'Vilnius, Trakai, Kaunas'),
    R('CH', 2, span(5, 10), 'Bern\'s arcaded old town, Lucerne\'s wooden bridge, Geneva and Zurich on their lakes.', 'Bern, Lucerne, Zurich'),
    R('DK', 2, span(5, 9), 'Copenhagen\'s Nyhavn, Rosenborg and Tivoli; Roskilde\'s cathedral and Viking ships.', 'Copenhagen, Roskilde'),
    R('SE', 2, span(5, 9), 'Stockholm\'s Gamla Stan on its islands and the Vasa, a warship raised whole from the harbour.', 'Stockholm, Uppsala'),
    R('NO', 2, span(5, 9), 'Bergen\'s Bryggen wharf, Oslo\'s museums and the stave churches inland.', 'Bergen, Oslo'),
    R('BA', 2, span(4, 10), 'Sarajevo\'s Ottoman bazaar and Mostar\'s rebuilt bridge, history within living memory.', 'Sarajevo, Mostar'),
    R('RS', 2, span(4, 10), 'Belgrade\'s fortress at the meeting of two rivers and Novi Sad\'s Petrovaradin.', 'Belgrade, Novi Sad'),
    R('AL', 2, span(4, 10), 'Berat and Gjirokastër, two Ottoman towns on UNESCO\'s list, and Butrint\'s Greek and Roman ruins.', 'Berat, Gjirokastër, Butrint'),
    R('MK', 2, span(4, 10), 'Ohrid\'s lakeside churches, one for every day of the year by the old count.', 'Ohrid, Skopje'),
    R('ME', 2, [4, 5, 6, 9, 10], 'Kotor\'s walled old town inside a fjord-like bay, and Perast\'s island churches.', 'Kotor, Perast, Cetinje'),
    R('CY', 2, ALL_YEAR, 'Paphos mosaics, the painted churches of the Troodos and the divided old town of Nicosia.', 'Paphos, Nicosia, Troodos'),
    R('LU', 2, ALL_YEAR, 'The old city sits on a cliff above two river valleys, with the casemates cut into the rock beneath it.', 'Luxembourg City, Vianden'),
    R('SK', 2, span(4, 10), 'Bratislava\'s castle and old town, Spiš castle, the wooden churches of the east.', 'Bratislava, Spiš'),
    R('FI', 2, span(5, 9), 'Helsinki\'s design district and Suomenlinna\'s sea fortress, Turku\'s castle.', 'Helsinki, Turku'),
    R('IS', 2, ALL_YEAR, 'Reykjavík is small; the sights are the island itself, from the Golden Circle out.', 'Reykjavík, Golden Circle'),
  ],
  food: [
    R('IT', 1, [3, 4, 5, 6, 9, 10, 11], 'Every region eats differently: Bologna\'s pasta, Naples\'s pizza, Piedmont\'s truffles, Sicily\'s street food.', 'Emilia-Romagna, Piedmont, Naples, Sicily'),
    R('FR', 1, ALL_YEAR, 'Lyon\'s bouchons, the markets of Provence, Bordeaux and Burgundy\'s vineyards, Paris for everything.', 'Lyon, Bordeaux, Burgundy, Paris'),
    R('ES', 1, ALL_YEAR, 'San Sebastián\'s pintxos bars, Andalusian tapas, Rioja and the sherry towns near Cádiz.', 'Basque Country, Rioja, Andalusia'),
    R('PT', 1, ALL_YEAR, 'Port in the Douro, grilled fish on every coast, Lisbon\'s pastéis and the Alentejo\'s slow cooking.', 'Douro, Lisbon, Alentejo'),
    R('GR', 1, span(4, 10), 'Island tavernas, Crete\'s olive oil and cheeses, Athens\'s markets. Best when the tomatoes are in season.', 'Crete, Athens, Peloponnese'),
    R('BE', 2, ALL_YEAR, 'Trappist beers, chocolate, frites and moules. Belgium has more Michelin stars per head than France.', 'Brussels, Ghent, Antwerp'),
    R('DE', 2, [5, 6, 7, 8, 9, 10, 12], 'Riesling on the Mosel, beer gardens in Bavaria, Berlin\'s markets and the Christmas stalls.', 'Mosel, Bavaria, Berlin'),
    R('AT', 2, ALL_YEAR, 'The Wachau\'s Grüner Veltliner, Vienna\'s coffee houses and heurigen wine taverns on the city edge.', 'Wachau, Vienna, Styria'),
    R('HU', 2, ALL_YEAR, 'Tokaj\'s sweet wines, Budapest\'s market hall and the new-wave restaurants beside it.', 'Budapest, Tokaj, Eger'),
    R('HR', 2, [4, 5, 6, 9, 10], 'Istria\'s truffles and olive oil, Pelješac\'s reds, and oysters from Ston.', 'Istria, Pelješac, Dalmatia'),
    R('SI', 2, [4, 5, 6, 9, 10], 'Ljubljana\'s Friday market, Vipava\'s orange wines and a farmhouse restaurant scene that punches high.', 'Ljubljana, Vipava, Goriška Brda'),
    R('CZ', 2, ALL_YEAR, 'The best lager on earth at the price of water, and Prague\'s beer halls to drink it in.', 'Prague, Plzeň, South Moravia'),
    R('GB', 2, ALL_YEAR, 'London\'s restaurant scene, Scotland\'s whisky, Cornwall\'s fish and a pub lunch anywhere.', 'London, Edinburgh, Cornwall'),
    R('IE', 2, ALL_YEAR, 'Oysters in Galway, whiskey distilleries, and Cork\'s English Market.', 'Galway, Cork, Dublin'),
    R('DK', 2, ALL_YEAR, 'Copenhagen invented New Nordic; the smørrebrød lunch is the affordable way in.', 'Copenhagen'),
    R('MD', 2, span(5, 10), 'Cellars the size of towns (Cricova, Mileștii Mici) and wine at prices from another decade.', 'Cricova, Chișinău'),
    R('CY', 2, ALL_YEAR, 'Meze that runs to twenty plates, halloumi at source and Commandaria, the oldest named wine.', 'Limassol, Paphos'),
    R('MT', 2, ALL_YEAR, 'Rabbit stew, pastizzi and Gozo\'s cheeses, with Sicilian and Arab notes in everything.', 'Valletta, Gozo'),
    R('BG', 2, span(5, 10), 'Melnik\'s wine, banitsa for breakfast and shopska salad with every meal. Very cheap.', 'Melnik, Plovdiv'),
    R('RO', 2, span(5, 10), 'Transylvanian farm food, Dealu Mare wines and Bucharest\'s revived old town restaurants.', 'Transylvania, Bucharest'),
    R('NL', 2, ALL_YEAR, 'Cheese markets in Alkmaar and Gouda, Indonesian rijsttafel in Amsterdam, herring from the cart.', 'Amsterdam, Alkmaar'),
    R('SE', 2, span(5, 9), 'Stockholm\'s Östermalm hall, cinnamon buns as an institution, crayfish parties in August.', 'Stockholm, Gothenburg'),
  ],
  nightlife: [
    R('ES', 1, span(5, 10), 'Ibiza\'s clubs, Barcelona and Madrid until dawn, and dinner that starts at ten.', 'Ibiza, Barcelona, Madrid'),
    R('DE', 1, ALL_YEAR, 'Berlin: Berghain, weekend-long parties and no closing time. Hamburg\'s Reeperbahn for the rest.', 'Berlin, Hamburg, Cologne'),
    R('NL', 1, ALL_YEAR, 'Amsterdam\'s clubs and canalside bars, plus ADE in October, the largest dance festival on the calendar.', 'Amsterdam, Rotterdam'),
    R('GB', 1, ALL_YEAR, 'London\'s scene across every genre, Manchester\'s clubs, Glasgow\'s live music.', 'London, Manchester, Glasgow'),
    R('HR', 1, span(6, 9), 'Zrće beach on Pag, Ultra in Split and Hvar\'s harbour bars, June to September.', 'Pag, Split, Hvar'),
    R('GR', 1, span(6, 9), 'Mykonos and Ios for the beach clubs, Athens\'s Gazi district all year.', 'Mykonos, Ios, Athens'),
    R('HU', 1, ALL_YEAR, 'Budapest\'s ruin bars in the old Jewish quarter and Sziget in August, one of Europe\'s biggest festivals.', 'Budapest'),
    R('CZ', 1, ALL_YEAR, 'Prague\'s beer halls, clubs and the cheapest good night out in a capital.', 'Prague, Brno'),
    R('PT', 1, ALL_YEAR, 'Lisbon\'s Bairro Alto and Pink Street, Porto\'s Galerias, Albufeira in summer.', 'Lisbon, Porto, Albufeira'),
    R('IT', 2, span(5, 9), 'Rimini and Riccione on the Adriatic, Milan\'s aperitivo scene, Rome\'s Trastevere.', 'Rimini, Milan, Rome'),
    R('MT', 2, span(5, 10), 'Paceville packs the island\'s clubs into three streets; the summer festivals fill the rest.', 'St Julian\'s, Valletta'),
    R('CY', 2, span(6, 9), 'Ayia Napa\'s strip and beach parties, June to September.', 'Ayia Napa, Limassol'),
    R('BG', 2, span(6, 9), 'Sunny Beach is the cheapest big-resort party on the Black Sea; Sofia has the clubs the rest of the year.', 'Sunny Beach, Sofia'),
    R('RS', 2, span(5, 9), 'Belgrade\'s floating river clubs, the splavovi, and EXIT festival in Novi Sad every July.', 'Belgrade, Novi Sad'),
    R('PL', 2, ALL_YEAR, 'Kraków\'s cellar bars around the square and Warsaw\'s Praga district.', 'Kraków, Warsaw'),
    R('IE', 2, ALL_YEAR, 'Dublin\'s Temple Bar, Galway\'s pubs and live music seven nights a week.', 'Dublin, Galway'),
    R('BE', 2, ALL_YEAR, 'Antwerp\'s clubs, Brussels\'s bars, Tomorrowland in July.', 'Antwerp, Brussels'),
    R('DK', 2, span(5, 9), 'Copenhagen\'s Meatpacking District and Roskilde festival in late June.', 'Copenhagen'),
    R('AT', 2, ALL_YEAR, 'Vienna\'s Gürtel arches and Donauinsel festival, Europe\'s largest free open-air.', 'Vienna'),
    R('FR', 2, ALL_YEAR, 'Paris\'s Oberkampf and Pigalle, Lyon\'s riverboat clubs, the Riviera in summer.', 'Paris, Lyon, Nice'),
    R('SE', 2, span(5, 9), 'Stockholm\'s Stureplan clubs and Gothenburg\'s Way Out West festival in August.', 'Stockholm, Gothenburg'),
    R('AL', 2, span(5, 10), 'Tirana\'s Blloku district, once closed to everyone but the party elite, now all bars.', 'Tirana, Sarandë'),
    R('RO', 2, ALL_YEAR, 'Bucharest\'s old town bars and Untold festival in Cluj every August.', 'Bucharest, Cluj'),
    R('EE', 2, span(5, 9), 'Tallinn\'s Telliskivi creative city and old-town bars, with white nights in June.', 'Tallinn'),
    R('LV', 2, span(5, 9), 'Riga\'s old town bars and the Positivus festival.', 'Riga'),
    R('LT', 2, span(5, 9), 'Vilnius\'s Užupis and old-town bars at prices London forgot.', 'Vilnius'),
    R('SI', 2, ALL_YEAR, 'Ljubljana\'s Metelkova, a squatted barracks turned club quarter, and riverside bars.', 'Ljubljana'),
  ],
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "May to Sep", "Mar to Jun, Sep to Nov", or "All year": a compact reading of
 *  the months a country works for this kind. */
export function monthsLabel(months, allYearLabel = 'All year') {
  if (!months || months.length >= 12) return allYearLabel;
  const set = new Set(months);
  // Walk the calendar and collect contiguous runs, wrapping Dec -> Jan.
  const runs = [];
  let start = null;
  for (let m = 1; m <= 12; m += 1) {
    if (set.has(m) && start == null) start = m;
    if ((!set.has(m) || m === 12) && start != null) {
      runs.push([start, set.has(m) ? m : m - 1]);
      start = null;
    }
  }
  // A run that ends in Dec and one that starts in Jan are one wrapped run.
  if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1][1] === 12) {
    const last = runs.pop();
    runs[0] = [last[0], runs[0][1]];
  }
  return runs
    .map(([a, b]) => (a === b ? MONTH_SHORT[a - 1] : `${MONTH_SHORT[a - 1]} to ${MONTH_SHORT[b - 1]}`))
    .join(', ');
}

/** The month (1..12) the traveller is going, from an exact start date or a
 *  flexible "YYYY-MM" month; null when nothing is chosen yet. */
export function travelMonth({ startDate = '', flexMonth = '' } = {}) {
  const src = startDate || flexMonth;
  if (!src) return null;
  const m = Number(String(src).slice(5, 7));
  return m >= 1 && m <= 12 ? m : null;
}

/**
 * Rank the countries for one kind of trip: the curated table joined to the
 * live catalogue.
 *
 * @param kindKey       'cycling' | ...
 * @param allCountries  countriesFromData(destinations): [{ country, iso2, cities:[{id,dest}] }]
 * @param opts.month    the travel month (1..12) or null, for the in-season flag
 * @param opts.trails   loadTrailsIndex() result or null, for published trail counts
 * @param opts.fares    { [country]: { eur, origin, date } } cheapest stored fare
 *                      into each country for the dates, or null
 * @returns [{ country, iso2, tier, why, regions, months, monthsText, inSeason,
 *             fitCount, topCities:[dest...], trails, fare, score }]
 *          tier-1 first, then in-season, then fare/fit; every curated country
 *          present in the catalogue is returned (this list is meant to be
 *          exhaustive, not a top three).
 */
export function recommendCountries(kindKey, allCountries, { month = null, trails = null, fares = null } = {}) {
  const table = KIND_COUNTRIES[kindKey] || [];
  if (!table.length || !allCountries?.length) return [];
  const byIso = new Map(allCountries.map((c) => [String(c.iso2 || '').toUpperCase(), c]));
  const trailCounts = new Map((trails?.countries || []).map((c) => [String(c.country).toUpperCase(), c.n_trips || 0]));
  const out = [];
  for (const row of table) {
    const c = byIso.get(row.iso2);
    if (!c) continue; // not in this catalogue build
    const fits = c.cities
      .map(({ id, dest }) => ({ id, dest, fit: kindFitScore(dest, kindKey), score: dest.rating?.score ?? 0 }))
      .filter((x) => x.fit >= 0.3)
      .sort((a, b) => (b.fit * 4 + b.score) - (a.fit * 4 + a.score));
    const inSeason = month == null ? null : row.months.includes(month);
    const fare = fares?.[c.country] || null;
    const score = (row.tier === 1 ? 100 : 0)
      + (inSeason === false ? -40 : inSeason ? 10 : 0)
      + Math.min(20, fits.length)
      + (fare ? Math.max(0, 15 - fare.eur / 10) : 0);
    out.push({
      country: c.country,
      iso2: row.iso2,
      tier: row.tier,
      why: row.why,
      regions: row.regions,
      months: row.months,
      monthsText: monthsLabel(row.months),
      inSeason,
      fitCount: fits.length,
      topCities: fits.slice(0, 3).map((x) => x.dest),
      trails: trailCounts.get(row.iso2) || 0,
      fare,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score || a.country.localeCompare(b.country));
}

/**
 * Cheapest stored fare into each country for the chosen dates, read from the
 * destinations' route tables (the same fares the Getting-there step lists).
 * Country name -> { eur, origin, date }. Expensive over 1,570 destinations,
 * so callers memoize on (startDate, flexMonth).
 */
export function cheapestFareByCountry(destinations, { startDate = '', flexMonth = '', origin = '' } = {}) {
  const exact = {};
  const inMonth = {};
  // An exact date wins; when no fare is stored on that day the month around
  // it stands in, the same fallback the Getting-there step uses.
  const monthKey = startDate ? String(startDate).slice(0, 7) : (flexMonth ? String(flexMonth).slice(0, 7) : '');
  for (const d of Object.values(destinations || {})) {
    if (!d || !d.country || !d.routes) continue;
    for (const [from, r] of Object.entries(d.routes)) {
      if (origin && from !== origin) continue;
      const fares = r?.outbound_fare;
      if (!fares) continue;
      for (const [date, eur] of Object.entries(fares)) {
        if (eur == null) continue;
        if (startDate && date === startDate) {
          const cur = exact[d.country];
          if (!cur || eur < cur.eur) exact[d.country] = { eur, origin: from, date, exact: true };
        }
        if (monthKey && !String(date).startsWith(monthKey)) continue;
        const cur = inMonth[d.country];
        if (!cur || eur < cur.eur) inMonth[d.country] = { eur, origin: from, date, exact: false };
      }
    }
  }
  return { ...inMonth, ...exact };
}
