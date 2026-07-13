/**
 * knownFor.js - one short, human line per destination: what the place is
 * actually known for. Replaces the generic category chips (nature, romantic)
 * with something a traveller can act on.
 *
 * Airport-tier cities are curated here by id (IATA). Gems fall back to their
 * pipeline blurb. Anything else gets a modest category-based line so no
 * destination ever shows an empty space. No em dashes anywhere.
 */

const KNOWN_FOR = {
  // Belgium
  BRU: 'The Grand Place, art nouveau, comic murals and Belgian beer cafes',
  CRL: 'Gateway to Brussels and the walled medieval towns of Wallonia',

  // Spain
  MAD: 'The Prado, tapas at midnight and grand boulevards full of life',
  BCN: 'Gaudi’s Sagrada Familia, the Gothic Quarter and city beaches',
  AGP: 'Costa del Sol beaches, Picasso’s birthplace and a lively old town',
  VLC: 'Paella’s birthplace, futuristic City of Arts and long urban beaches',
  PMI: 'Mallorca’s capital: a huge Gothic cathedral above the marina',
  ALC: 'Castle views over white beaches and the Costa Blanca',
  SVQ: 'Flamenco, orange trees, the Alcazar and Europe’s largest Gothic cathedral',
  BIO: 'The Guggenheim museum and the Basque pintxos food scene',
  IBZ: 'World-famous clubs, boho markets and a UNESCO fortified old town',
  MAH: 'Menorca’s quiet turquoise coves and whitewashed fishing villages',
  SCQ: 'The end point of the Camino pilgrimage and its great cathedral',
  LCG: 'Roman lighthouse, glass-front harbour houses and Atlantic beaches',
  SDR: 'Elegant bay-side beaches and the green mountains of Cantabria',
  REU: 'Costa Daurada beaches, Gaudi’s hometown and PortAventura park',
  GRO: 'Medieval walled old town, Dali country and the Costa Brava coves',
  ZAZ: 'Moorish Aljaferia palace and the basilica on the Ebro river',
  VLL: 'Castilian old town, tapas bars and Ribera del Duero wine country',
  MJV: 'Baroque churches, warm-water beaches and Mar Menor lagoon',
  VIT: 'Green Basque capital with a beautifully preserved medieval hill town',
  ACE: 'Volcanic moonscapes, Cesar Manrique art and black-sand beaches',
  FUE: 'Endless white dunes and Europe’s best windsurfing beaches',
  LPA: 'Dunes of Maspalomas and a subtropical island of microclimates',
  TFS: 'Winter sun beaches under the Teide volcano',
  TFN: 'Colonial La Laguna, cloud forests and the north of Tenerife',
  SPC: 'Star-gazing skies, volcano hikes and banana groves',
  VDE: 'Europe’s remotest island: diving, calm and zero crowds',
  XRY: 'Sherry bodegas, dancing horses and whitewashed Andalusia',
  BJZ: 'Moorish fortress walls above the quiet Extremadura plains',
  OVD: 'Cider houses, pre-Romanesque churches and the green Asturian coast',
  PNA: 'The running of the bulls and a compact medieval old town',

  // Italy
  FCO: 'The Colosseum, the Vatican and 2,500 years of everything',
  CIA: 'The Colosseum, the Vatican and 2,500 years of everything',
  MXP: 'The Duomo, La Scala opera, fashion and aperitivo hour',
  BGY: 'The Duomo, La Scala opera, fashion and aperitivo hour',
  LIN: 'The Duomo, La Scala opera, fashion and aperitivo hour',
  VCE: 'Canals, gondolas and St Mark’s Square: the floating city',
  TSF: 'Canals, gondolas and St Mark’s Square: the floating city',
  VRN: 'Juliet’s balcony, a Roman arena and opera under the stars',
  BLQ: 'Medieval porticoes, Italy’s food capital and the oldest university',
  FLR: 'Renaissance masterpieces: the Duomo, Uffizi and Ponte Vecchio',
  PSA: 'The Leaning Tower and a lively Tuscan university town',
  NAP: 'Pizza’s birthplace, chaotic charm, Pompeii and Vesuvius next door',
  BRI: 'Old-town pasta ladies, seafront promenades and Puglia’s gateway',
  BDS: 'Whitewashed ports and the beaches of southern Puglia',
  PMO: 'Arab-Norman palaces, street markets and cannoli',
  CTA: 'Baroque lava-stone streets under Mount Etna',
  TPS: 'Salt pans, Egadi island ferries and west-Sicilian couscous',
  CAG: 'Sardinia’s capital: hilltop citadel and flamingo lagoons',
  OLB: 'The Costa Smeralda’s emerald bays and celebrity marinas',
  AHO: 'Catalan-flavoured old town on Sardinia’s coral coast',
  REG: 'The Riace bronzes and ferries to Sicily across the strait',
  LMP: 'Rabbit Beach: some of the clearest water in the Mediterranean',
  PNL: 'A wild volcanic island of capers, dammusi houses and hot springs',
  AOI: 'Adriatic port with Conero’s white cliff beaches nearby',
  PEG: 'Umbria’s hilltop capital: medieval lanes and chocolate',
  PSR: 'A long sandy Adriatic seafront and the Abruzzo mountains behind',
  CUF: 'Piedmont truffles, Barolo vineyards and Alpine foothills',
  TRN: 'Royal palaces, vermouth, chocolate and the Egyptian Museum',
  GOA: 'Europe’s biggest medieval old town and real pesto',
  TRS: 'Habsburg coffee houses on a blue Adriatic gulf',
  RMI: 'Italy’s classic beach resort with a Roman and Fellini heart',
  LMZ: 'Gateway to Tropea’s cliff beaches and the Calabrian coast',
  CRV: 'Ancient Greek ruins and an unspoiled Ionian coastline',
  QSR: 'Gateway to the Amalfi Coast and Paestum’s Greek temples',

  // Portugal
  LIS: 'Trams, tiled facades, fado and pasteis de nata',
  OPO: 'Port wine cellars, azulejo churches and the Douro riverfront',
  FAO: 'The Algarve’s golden cliffs, sea caves and beach towns',
  FNC: 'Levada walks, year-round spring and dramatic Atlantic cliffs',
  PDL: 'Crater lakes, hot springs and whale watching in the Azores',
  TER: 'A UNESCO harbour town and green volcanic countryside',

  // Greece
  ATH: 'The Acropolis, ancient agoras and rooftop views of it all',
  SKG: 'Byzantine walls, a waterfront promenade and Greece’s best food scene',
  HER: 'The Palace of Knossos and Crete’s big, lively north coast',
  CHQ: 'A Venetian harbour and the beaches of western Crete',
  RHO: 'A walled medieval old town and reliable island sunshine',
  CFU: 'Venetian old town, cypress hills and sandy west-coast bays',
  ZTH: 'Shipwreck Beach and electric-blue caves',
  KGS: 'Ancient ruins, long beaches and easy island cycling',
  JMK: 'Whitewashed lanes, windmills and famous nightlife',
  JTR: 'Caldera sunsets over white-and-blue cliff villages',
  EFL: 'Myrtos Beach and fjord-like Ionian coves',
  PVK: 'Gateway to Lefkada’s white beaches and Parga’s pastel port',
  KLX: 'Stone towers of the Mani and quiet Peloponnese beaches',
  VOL: 'Harbour tavernas under Mount Pelion’s stone villages',
  SMI: 'Pythagoras’ island: pine hills, coves and sweet wine',
  MJT: 'Ouzo distilleries, petrified forests and hot springs',
  KVA: 'An amphitheatre harbour town facing Thasos island',

  // Germany
  BER: 'The Wall’s history, world-class museums and all-night clubs',
  MUC: 'Beer gardens, the Englischer Garten and Alpine day trips',
  FRA: 'The banking skyline, apple wine taverns and big museums',
  HHN: 'Quiet Hunsrueck hills, and Moselle wine villages nearby',
  CGN: 'The great Gothic cathedral and Rhineland carnival spirit',
  DUS: 'Rhine promenade, Altbier pubs and Japanese food quarter',
  HAM: 'Harbour cranes, the Elbphilharmonie and canal-laced warehouses',
  STR: 'Car museums (Porsche, Mercedes) and vineyards inside the city',
  NUE: 'A medieval imperial castle, Christmas markets and bratwurst',
  LEJ: 'Bach’s churches and a young arts-and-nightlife scene',
  DRS: 'The rebuilt baroque Altstadt on the Elbe',
  BRE: 'A fairy-tale market square and the Schnoor lane quarter',
  FMM: 'Bavarian Allgaeu gateway: Neuschwanstein and Alpine lakes nearby',
  FKB: 'Black Forest spa towns and Baden-Baden elegance nearby',
  FDH: 'Zeppelin history on the shores of Lake Constance',

  // France
  CDG: 'The Eiffel Tower, the Louvre and cafe life on every corner',
  ORY: 'The Eiffel Tower, the Louvre and cafe life on every corner',
  BVA: 'The Eiffel Tower, the Louvre and cafe life on every corner',
  MRS: 'The Vieux-Port, calanque cliffs and bouillabaisse',
  NCE: 'The Promenade des Anglais and Riviera glamour',
  LYS: 'France’s food capital, traboule passages and Roman theatres',
  TLS: 'The pink city: brick squares, Airbus and southern warmth',
  BOD: 'Grand 18th-century quays and the world’s wine capital',
  NTE: 'The mechanical elephant, a castle and Loire creativity',
  MPL: 'A handsome student old town near Mediterranean beaches',
  BIQ: 'Surfing’s European home with Basque beach elegance',
  LDE: 'The pilgrimage sanctuary beneath the Pyrenees',
  CCF: 'Europe’s greatest walled medieval citadel',
  PGF: 'Catalan France: beaches, Salvador Dali’s favourite station',
  EGC: 'Dordogne castles, river villages and foie gras country',
  LRH: 'Twin harbour towers and Ile de Re’s bike-path beaches',
  BES: 'A deep natural harbour and wild Brittany coastline',
  RNS: 'Half-timbered lanes and the gateway to Mont Saint-Michel',
  BVE: 'Dordogne valley villages like Collonges-la-Rouge nearby',
  LIG: 'Porcelain workshops and green Limousin countryside',
  BZR: 'The Canal du Midi’s locks and Languedoc vineyards',
  NIM: 'A near-perfect Roman arena and the Pont du Gard nearby',
  FSC: 'Southern Corsica’s white cliffs and Bonifacio citadel',
  BIA: 'Cap Corse villages and a lively Corsican old port',
  AJA: 'Napoleon’s birthplace and blood-red island sunsets',
  CLY: 'A citadel above one of Corsica’s finest bays',
  RDZ: 'The Aveyron gorges and Soulages’ modern art museum',

  // Ireland + UK
  DUB: 'Georgian squares, Trinity’s Book of Kells and proper pubs',
  ORK: 'A foodie harbour city and the start of Ireland’s wild south coast',
  SNN: 'Gateway to the Cliffs of Moher and the Burren',
  KIR: 'The Ring of Kerry’s lakes, peaks and coast road',
  KOW: 'Gateway to Connemara, Galway and the Wild Atlantic Way',
  STN: 'Big Ben, the Tower, world museums and endless neighbourhoods',
  LTN: 'Big Ben, the Tower, world museums and endless neighbourhoods',
  LGW: 'Big Ben, the Tower, world museums and endless neighbourhoods',
  LHR: 'Big Ben, the Tower, world museums and endless neighbourhoods',
  MAN: 'Football, live music heritage and the Northern Quarter',
  EDI: 'The castle on the crag, the Royal Mile and festival August',
  GLA: 'Victorian grandeur, Mackintosh design and legendary music venues',
  BHX: 'Canal-side Brindleyplace, balti cuisine and Peaky Blinders land',
  LPL: 'The Beatles, two cathedrals and a UNESCO waterfront',
  LBA: 'Victorian arcades and the Yorkshire Dales on the doorstep',
  NCL: 'Tyne bridges, buzzing nightlife and Hadrian’s Wall nearby',
  BFS: 'Titanic Belfast and the Giant’s Causeway coast',
  BRS: 'Street art (Banksy’s home), harbourside and balloon fiestas',
  EMA: 'Sherwood Forest legends and Peak District villages nearby',
  BOH: 'Seven miles of sand and a Victorian pier',
  EXT: 'A Norman cathedral city between Dartmoor and the coast',
  CWL: 'A castle in the centre and the Welsh valleys beyond',
  NWI: 'A medieval lanes quarter and the Norfolk Broads waterways',
  JER: 'Beach coves, WWII tunnels and a mild island pace',
  GCI: 'Cliff walks, sea pools and quiet Channel Island charm',
  ACI: 'A tiny island of forts, puffins and empty beaches',
  IOM: 'The TT races, steam railways and glens down to the sea',
  INV: 'Loch Ness, castles and the Highlands’ capital',

  // Poland + Central Europe
  WAW: 'A rebuilt old town, Chopin concerts and a bold food scene',
  WMI: 'A rebuilt old town, Chopin concerts and a bold food scene',
  KRK: 'Europe’s finest medieval square and the Wawel castle',
  GDN: 'Hanseatic amber streets and the Solidarity shipyards',
  WRO: 'Bridges, islands and hundreds of bronze dwarfs',
  POZ: 'Renaissance square with fighting goats at noon',
  KTW: 'Post-industrial culture zone and Silesian heritage',
  LCJ: 'Piotrkowska street’s murals and film-school cool',
  RZE: 'Gateway to the Bieszczady mountains in Poland’s southeast',
  BZG: 'Granaries on the river and a music-filled old centre',
  LUZ: 'Renaissance old town and Poland’s eastern borderlands',
  SZZ: 'A maritime city of parks near the Baltic lagoon',
  PRG: 'The Charles Bridge, the castle and golden-age beer halls',
  BRQ: 'Functionalist villas, wine cellars and student energy',
  BTS: 'A compact old town beneath the castle on the Danube',
  KSC: 'Gothic cathedral and the gateway to Slovakia’s east',
  BUD: 'Thermal baths, the Parliament and ruin bars on the Danube',
  DEB: 'The great Calvinist church and Hortobagy plains nearby',
  VIE: 'Imperial palaces, coffee houses and classical music',
  SZG: 'Mozart’s birthplace and Sound-of-Music Alpine scenery',
  INN: 'A medieval old town ringed by cable-car mountains',
  GRZ: 'A UNESCO old town, courtyards and design-school flair',
  KLU: 'Lake Woerthersee and Austria’s sunny south',
  LNZ: 'Ars Electronica and a Danube culture mile',

  // Switzerland + Benelux + Nordics
  ZRH: 'Lakefront old town, luxury shopping and Alpine day trips',
  GVA: 'The lake jet, watchmaking and Mont Blanc views',
  BSL: 'World-class art museums where three countries meet',
  BRN: 'Arcaded UNESCO old town wrapped in a turquoise river',
  AMS: 'Canals, the Rijksmuseum, Anne Frank’s house and bikes',
  EIN: 'Dutch design capital with Van Gogh countryside nearby',
  MST: 'A grand old town of squares, forts and Burgundian food',
  GRQ: 'A young canal city with the north’s best cafe terraces',
  LUX: 'A fortress old town dramatically stacked over gorges',
  CPH: 'Nyhavn’s painted harbour, new Nordic food and hygge',
  BLL: 'The original LEGO house and Denmark’s toy heartland',
  AAL: 'A reborn waterfront and gateway to Denmark’s wild north tip',
  ARN: 'An old town on 14 islands and world-leading design',
  NYO: 'An old town on 14 islands and world-leading design',
  BMA: 'An old town on 14 islands and world-leading design',
  GOT: 'Seafood halls, canals and the west-coast archipelago',
  MMX: 'The Turning Torso, parks and a bridge to Copenhagen',
  OSL: 'Fjord-side opera house, Munch and forest trams',
  TRF: 'Fjord-side opera house, Munch and forest trams',
  BGO: 'Bryggen’s wooden wharf and the gateway to the fjords',
  TRD: 'Nidaros cathedral and colourful wharves on the Nid',
  SVG: 'Old-town wooden lanes and the Pulpit Rock hike',
  TOS: 'Northern lights, midnight sun and Arctic fjords',
  BOO: 'The world’s strongest maelstrom and Lofoten ferries',
  AES: 'Art nouveau town at the mouth of the great fjords',
  HEL: 'Design district, island fortresses and sea saunas',
  TMP: 'Sauna capital of the world between two big lakes',
  TKU: 'A medieval castle, river boats and archipelago ferries',
  RVN: 'Santa Claus Village and Lapland’s northern lights',
  OUL: 'Baltic boardwalks and midnight-sun cycling',
  KEF: 'The Blue Lagoon, volcanoes and the Golden Circle',
  AEY: 'Whale watching capital under north Iceland’s peaks',
  FAE: 'Grass-roofed villages, sea cliffs and puffins',

  // Baltics + Eastern Europe
  VNO: 'A baroque old town and the quirky Uzupis republic',
  KUN: 'Interwar architecture and a lively basketball-mad old town',
  PLQ: 'White-sand Baltic beaches and amber hunting',
  RIX: 'Art nouveau streets and a huge central market in Zeppelin hangars',
  TLL: 'A fairy-tale walled old town with a digital-age heart',
  OTP: 'The colossal Palace of Parliament and a buzzing old town',
  CLJ: 'Transylvania’s youthful capital of festivals and cafes',
  TSR: 'Habsburg squares where the 1989 revolution began',
  IAS: 'Monasteries, golden churches and Moldavian hills',
  SBZ: 'A Saxon old town with eyes in its roofs',
  CND: 'Romania’s Black Sea port and Mamaia’s beaches',
  CRA: 'Sculptor Brancusi’s homeland and Oltenian monasteries',
  BCM: 'Gateway to the wild eastern Carpathians',
  OMR: 'Art nouveau palaces on the Hungarian border',
  SUJ: 'The painted monasteries of Bucovina nearby',
  TGM: 'A citadel town in the heart of Transylvania',
  SOF: 'Golden-domed cathedral with a ski mountain at the tram stop',
  BOJ: 'Long Black Sea beaches and ancient Nessebar nearby',
  VAR: 'Beach-town summers and Roman baths by the sea',
  PDV: 'A Roman theatre still in use and Europe’s oldest city vibes',

  // Balkans + beyond
  ZAG: 'Austro-Hungarian squares, museums and a huge cafe culture',
  SPU: 'Life inside Diocletian’s Roman palace and island ferries',
  DBV: 'The marble-walled old city above the Adriatic',
  PUY: 'A giant Roman arena and Istria’s truffle hinterland',
  ZAD: 'The Sea Organ, Roman forum and famous sunsets',
  RJK: 'Habsburg port heritage and the Kvarner islands',
  OSI: 'A Habsburg fortress town on the Drava plains',
  LJU: 'A castle-topped, dragon-guarded riverside capital',
  MBX: 'The world’s oldest vine and Pohorje ski slopes',
  SJJ: 'Ottoman bazaars, Austro-Hungarian avenues and resilient spirit',
  BNX: 'A green riverside city and Krka waterfalls',
  TZL: 'Salt lakes in the city and Bosnian mountain day trips',
  BEG: 'Fortress views over two rivers and famous nightlife',
  INI: 'Ottoman fortress, Roman emperor Constantine’s birthplace',
  TIV: 'Superyacht marinas on the Bay of Kotor',
  TGD: 'Gateway to Kotor bay, canyons and mountain monasteries',
  TIA: 'Colourful Blloku cafes and Ottoman-to-communist history',
  SKP: 'Statues, an Ottoman bazaar and Matka canyon',
  OHD: 'A UNESCO lake town of churches and pearl workshops',
  LCA: 'A palm seafront, salt-lake flamingos and beach life',
  PFO: 'Aphrodite’s birthplace with ancient mosaics by the sea',
  MLA: 'Honey-stone Valletta, silent cities and blue lagoons',
  PRN: 'Europe’s youngest capital with lively cafe streets',
  KIV: 'Vast wine cellars and a leafy, low-key capital',
};

const CAT_WORDS = {
  village: 'A charming village', oldtown: 'A historic old town', medieval: 'A medieval town',
  fairytale: 'A fairytale town', coast: 'A coastal escape', beach: 'A beach town',
  island: 'An island getaway', alps: 'An alpine base', mountains: 'A mountain town',
  lake: 'A lakeside town', valley: 'A mountain valley', wine: 'Wine country',
  countryside: 'A countryside retreat', nightlife: 'A nightlife hub', party: 'A party town',
  luxury: 'A luxury escape', city: 'A city break', capital: 'A capital city',
};

/** The short "what is this place known for" line for a destination.
 *  Curated line first, then the gem blurb, then a category fallback. */
export function knownFor(dest) {
  if (!dest) return '';
  const curated = KNOWN_FOR[dest.id] || KNOWN_FOR[dest.iata];
  if (curated) return curated;
  if (dest.blurb && dest.blurb.trim()) return dest.blurb.trim();
  const cats = dest.categories || [];
  const word = cats.map((c) => CAT_WORDS[c]).find(Boolean);
  const lead = word || 'Worth a stop';
  if (dest.beauty?.unesco) return `${lead}, with UNESCO-listed heritage`;
  return lead;
}

/** Structured facts for the info popovers: label/value rows, only real data. */
export function knownForFacts(dest) {
  if (!dest) return [];
  const rows = [];
  const kf = knownFor(dest);
  if (kf) rows.push(['Known for', kf]);
  if (dest.beauty?.unesco_count > 0) {
    rows.push(['UNESCO', `${dest.beauty.unesco_count} listed ${dest.beauty.unesco_count === 1 ? 'site' : 'sites'} in the area`]);
  }
  if (dest.beauty?.top_beach) rows.push(['Beaches', 'Among Europe’s best beach destinations']);
  const nAct = dest.activities?.items?.length || 0;
  if (nAct) rows.push(['Things to do', `${nAct} catalogued places`]);
  if (dest.local_transport?.reason) {
    // Scrub dashes used as punctuation (em/en/spaced-hyphen) to keep the app
    // dash-free, since this line comes straight from the dataset.
    const reason = dest.local_transport.reason.replace(/\s*[–—]\s*|\s+-\s+/g, ', ');
    rows.push(['Getting around', reason]);
  }
  return rows;
}
