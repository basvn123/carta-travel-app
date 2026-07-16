/** Researched iconic walks: the walk itself is the sight. Keyed by city name
 *  as it appears in the app's dataset (e.g. 'Paris', 'Rome', 'Dubrovnik').
 *  km is the approximate one-way length. ASCII only, curated from real,
 *  recognised routes (city walls, promenades, riverside quays, ridge paths). */
export const SCENIC_WALKS = {
  Paris: [
    { name: 'Seine banks, Pont de Sully to the Eiffel Tower', km: 4.5, note: 'UNESCO-listed riverside past Notre-Dame, the Louvre and the bouquinistes. Best in late afternoon light.' },
    { name: 'Canal Saint-Martin, Republique to Bassin de la Villette', km: 2.5, note: 'Iron footbridges, locks and plane trees made famous by Amelie; cafes line the quays.' },
  ],
  Rome: [
    { name: 'Heart of Rome, Piazza del Popolo to Piazza Navona', km: 3, note: 'Links the Spanish Steps, Trevi Fountain and the Pantheon through baroque lanes. Go early before the crowds.' },
    { name: 'Passeggiata del Gianicolo', km: 2.5, note: 'Ridge promenade above Trastevere to the Garibaldi terrace, the classic panorama over the domes. Cannon fires at noon.' },
  ],
  Venice: [
    { name: 'Riva degli Schiavoni to the Giardini', km: 2, note: 'Lagoon-front promenade from the Doge\'s Palace past San Zaccaria, with San Giorgio Maggiore across the water.' },
    { name: 'Zattere promenade', km: 1.5, note: 'Sunlit Dorsoduro quay along the Giudecca Canal, ending at Punta della Dogana where the Grand Canal meets the lagoon.' },
  ],
  Florence: [
    { name: 'Ponte Vecchio to Piazzale Michelangelo', km: 2, note: 'Climb through the San Niccolo gate and rose garden to the postcard terrace over the Duomo and the Arno.' },
  ],
  Milan: [
    { name: 'Duomo to Parco Sempione', km: 2.5, note: 'Through the Galleria Vittorio Emanuele II and Via Dante to Castello Sforzesco and the Arco della Pace.' },
    { name: 'Navigli towpath from the Darsena', km: 2, note: 'Historic canal quays along the Naviglio Grande, liveliest at aperitivo hour when the water reflects the bar lights.' },
  ],
  Naples: [
    { name: 'Lungomare Caracciolo, Castel dell\'Ovo to Mergellina', km: 3, note: 'Car-free seafront with Vesuvius and Capri on the horizon; detour onto the causeway to the sea castle.' },
    { name: 'Spaccanapoli', km: 2, note: 'The arrow-straight street slicing the old centre past Santa Chiara and Gesu Nuovo, Naples street life at full volume.' },
  ],
  'Cinque Terre': [
    { name: 'Sentiero Azzurro, Monterosso to Vernazza', km: 3.5, note: 'The most scenic leg of the Blue Trail, terraced vineyards and a first sight of Vernazza harbour from above. Steep steps.' },
    { name: 'Via dell\'Amore, Riomaggiore to Manarola', km: 0.9, note: 'Cliff-carved lovers\' promenade between the two villages, reopened in 2024 after a 12-year closure. Book a slot in summer.' },
  ],
  Barcelona: [
    { name: 'Gothic Quarter to Barceloneta seafront', km: 3, note: 'From the cathedral through medieval lanes to Port Vell and the palm-lined Passeig Maritim along the beach.' },
    { name: 'Montjuic, Miramar to the castle', km: 2.5, note: 'Harbour views from the Miramar terrace, then gardens up to Montjuic Castle ramparts overlooking the port.' },
  ],
  Madrid: [
    { name: 'Paseo del Prado and El Retiro', km: 3, note: 'UNESCO Landscape of Light: the Prado, the Neptune fountain, then the Retiro boating lake and Crystal Palace.' },
  ],
  Seville: [
    { name: 'Guadalquivir banks, Torre del Oro to Triana', km: 2.5, note: 'Riverside promenade past the bullring, over the Isabel II bridge into tiled Calle Betis. Golden at dusk.' },
    { name: 'Maria Luisa Park and Plaza de Espana', km: 2, note: 'Shaded 1929 Expo gardens leading to the great tiled semicircle and canal of Plaza de Espana.' },
  ],
  Valencia: [
    { name: 'Turia Gardens, Serranos Towers to the City of Arts', km: 4, note: 'A drained riverbed turned 9 km garden; this stretch links the medieval gate to Calatrava\'s white arches.' },
  ],
  Malaga: [
    { name: 'Gibralfaro path from the Alcazaba', km: 1.5, note: 'Zigzag climb beside Moorish walls to the castle mirador over the bullring, port and bay.' },
    { name: 'Muelle Uno and Paseo del Parque', km: 2, note: 'Palm-shaded park promenade and the modern quay under the striped Pompidou cube, ending at La Farola lighthouse.' },
  ],
  'Palma de Mallorca': [
    { name: 'Parc de la Mar and the Dalt Murada walls', km: 2, note: 'Seafront below the golden cathedral, then up onto the Renaissance sea walls to the Arab baths lanes.' },
  ],
  Lisbon: [
    { name: 'Alfama miradouros, Portas do Sol to the castle', km: 1.5, note: 'Terrace-to-terrace climb via the Santa Luzia azulejos to Sao Jorge Castle, tram 28 rattling past.' },
    { name: 'Riverside, Praca do Comercio to Belem Tower', km: 6, note: 'Tagus-side walk to the Jeronimos quarter, the Discoveries monument and pasteis de nata. Take the tram back.' },
  ],
  Porto: [
    { name: 'Ribeira to Jardim do Morro over the Dom Luis I bridge', km: 1.5, note: 'Cross the top deck of the iron bridge from the UNESCO quay to the Gaia viewpoint and port wine lodges.' },
    { name: 'Douro riverside to Foz do Douro', km: 5, note: 'Follow the river to the Atlantic, past the Arrabida bridge to the Felgueiras lighthouse waves. Historic tram 1 runs the same line.' },
  ],
  London: [
    { name: 'Thames South Bank, Westminster to Tower Bridge', km: 4, note: 'Big Ben, the London Eye, Tate Modern, Shakespeare\'s Globe and Borough Market in one riverside sweep.' },
    { name: 'Royal Parks line, St James\'s Park to Kensington Gardens', km: 4, note: 'Green corridor from Horse Guards past Buckingham Palace, the Serpentine and the Albert Memorial.' },
  ],
  Edinburgh: [
    { name: 'Royal Mile, Castle to Holyrood', km: 1.8, note: 'The medieval spine of the Old Town, closes and courtyards from the castle esplanade down to the palace.' },
    { name: 'Arthur\'s Seat and the Salisbury Crags', km: 3, note: 'Extinct volcano in Holyrood Park; the crags path gives castle-to-Firth views without the summit scramble.' },
  ],
  Dublin: [
    { name: 'Great South Wall to Poolbeg Lighthouse', km: 2, note: 'Granite sea wall striding into Dublin Bay, ending at the red lighthouse with the whole city skyline behind.' },
    { name: 'Georgian Dublin, Trinity to St Stephen\'s Green', km: 1.5, note: 'Grafton Street buskers, then the green and the coloured doors of Merrion Square.' },
  ],
  Amsterdam: [
    { name: 'Canal ring and the Jordaan', km: 3, note: 'UNESCO Grachtengordel: Prinsengracht past the Anne Frank House and Westerkerk into the Jordaan\'s hidden hofjes.' },
  ],
  Brussels: [
    { name: 'Grand Place to the Sablon via Mont des Arts', km: 2, note: 'From the gilded guildhalls up through the royal quarter; the Mont des Arts terrace frames the town hall spire.' },
  ],
  Bruges: [
    { name: 'Markt to Minnewater via Rozenhoedkaai', km: 2.5, note: 'The classic canal-corner photo stop, then Beguinage calm to the swans of the Lake of Love.' },
    { name: 'Kruisvest ramparts and the windmills', km: 3, note: 'Green ring on the old city walls past four surviving windmills, with quiet canal views back to the belfry.' },
  ],
  Berlin: [
    { name: 'Museum Island to the Brandenburg Gate', km: 3, note: 'Unter den Linden lime avenue past the cathedral and Bebelplatz, ending at the gate and the Reichstag lawns.' },
    { name: 'East Side Gallery along the Spree', km: 1.3, note: 'The longest surviving Berlin Wall stretch, open-air murals starting at the red-brick Oberbaum bridge.' },
  ],
  Munich: [
    { name: 'English Garden, Eisbach wave to the Chinese Tower', km: 3, note: 'Watch river surfers by the Haus der Kunst, then meadows, the Monopteros view and a beer garden finish.' },
  ],
  Hamburg: [
    { name: 'Speicherstadt and HafenCity to the Elbphilharmonie', km: 2.5, note: 'Red-brick warehouse canals, then new harbour promenades to the concert hall plaza high above the Elbe.' },
    { name: 'Outer Alster shore', km: 3, note: 'Sailboat lake ringed by villas and willows; the Schwanenwik bank looks back at the five church spires.' },
  ],
  Cologne: [
    { name: 'Rhine promenade and the Hohenzollern Bridge', km: 2.5, note: 'Cross the love-lock bridge for the classic cathedral panorama, then the Altstadt quay to the Rheinauhafen crane houses.' },
  ],
  Vienna: [
    { name: 'Ringstrasse loop', km: 5.3, note: 'The 1865 showcase boulevard: Opera, Hofburg, twin museums, Parliament and Rathaus in one circuit. Trams if you tire.' },
    { name: 'Schonbrunn gardens to the Gloriette', km: 2, note: 'Baroque parterres and zigzag paths up to the arcaded Gloriette, palace and city spread below.' },
  ],
  Salzburg: [
    { name: 'Monchsberg ridge to the fortress', km: 2.5, note: 'Cliff-top woods from the Museum der Moderne lift to Hohensalzburg, old town rooftops the whole way.' },
    { name: 'Kapuzinerberg bastion walk', km: 2, note: 'Steep lane by the Capuchin monastery to the bastion viewpoints, the best eye-level view of the fortress across the Salzach.' },
  ],
  Innsbruck: [
    { name: 'Inn promenade and the old town', km: 2, note: 'River path facing the pastel Mariahilf row against the Nordkette wall, looping past the Golden Roof and Marktplatz.' },
  ],
  Prague: [
    { name: 'Old Town Square to the Castle via Charles Bridge and Kampa', km: 2.5, note: 'Baroque statues on the bridge, Kampa island calm, then Nerudova lane up to the St Vitus spires.' },
    { name: 'Petrin orchards from Ujezd', km: 2, note: 'Blossom slopes and the mirror maze up to the little Eiffel lookout tower; funicular back down.' },
  ],
  Budapest: [
    { name: 'Danube Korzo and Chain Bridge to Fisherman\'s Bastion', km: 2.5, note: 'Cross under the bridge lions, then castle-hill lanes to the fairytale bastion facing Parliament.' },
    { name: 'Gellert Hill to the Citadella', km: 1.5, note: 'Paths from Elisabeth Bridge past the Gellert monument waterfall to the Liberty Statue panorama.' },
  ],
  Krakow: [
    { name: 'Royal Route, Florian Gate to Wawel', km: 2, note: 'St Mary\'s trumpeter, the Cloth Hall and Kanonicza lane, ending at the dragon\'s castle hill on the Vistula.' },
    { name: 'Planty ring', km: 4, note: 'Tree-lined park circling the entire Old Town on the line of the medieval moat.' },
  ],
  Warsaw: [
    { name: 'Royal Route, Castle Square to Lazienki Park', km: 4, note: 'Krakowskie Przedmiescie palaces and Chopin\'s heart at Holy Cross Church, ending among Lazienki peacocks.' },
    { name: 'Vistula boulevards', km: 2.5, note: 'Rebuilt riverside decks below the Old Town, the mermaid statue and the Copernicus Science Centre; lively on summer evenings.' },
  ],
  Gdansk: [
    { name: 'Royal Way and the Motlawa embankment', km: 1.5, note: 'Golden Gate to the Neptune fountain down Long Market, then the medieval Crane on the waterfront.' },
  ],
  Copenhagen: [
    { name: 'Nyhavn to the Little Mermaid via Kastellet', km: 3, note: 'The colourful quay, Amalienborg square and the star-shaped fortress ramparts out to the harbour icon.' },
  ],
  Stockholm: [
    { name: 'Monteliusvagen clifftop path', km: 1, note: 'Boardwalk on Sodermalm\'s edge with the definitive view over Riddarholmen spires and City Hall; start from Slussen.' },
    { name: 'Gamla Stan and Skeppsholmen', km: 2.5, note: 'Medieval lanes past the Royal Palace, then the bridge to the museum island for waterline views of the old town.' },
  ],
  Oslo: [
    { name: 'Harbour promenade, Opera House to Aker Brygge', km: 2.5, note: 'Walk the marble opera roof, then fjord-side boards past Akershus Fortress to the wharf restaurants.' },
  ],
  Bergen: [
    { name: 'Floyen walk from Bryggen', km: 3, note: 'The Hanseatic wharf, then forest zigzags to the Floyen terrace 320 m above the fjord. Funicular option down.' },
    { name: 'Fjellveien balcony lane', km: 3, note: 'Level hillside road above the wooden houses of Sandviken, a beloved local stroll with steady harbour views.' },
  ],
  Helsinki: [
    { name: 'Esplanadi to Kaivopuisto shore', km: 3, note: 'From the Kappeli pavilion via Market Square along the sea path to the city\'s oldest park, Suomenlinna ferries offshore.' },
  ],
  Reykjavik: [
    { name: 'Sculpture and Shore Walk on Saebraut', km: 2.5, note: 'Bay-front path linking Harpa\'s glass hall and the Sun Voyager, Mount Esja rising across the water.' },
  ],
  Athens: [
    { name: 'Grand Promenade, Dionysiou Areopagitou', km: 3, note: 'Marble pedestrian arc under the Acropolis linking the Temple of Zeus, the Odeon and the Filopappou pines.' },
    { name: 'Plaka and Anafiotika', km: 1.5, note: 'Whitewashed island-style lanes clinging to the Acropolis north slope, built by Cycladic stonemasons.' },
  ],
  Santorini: [
    { name: 'Caldera rim, Fira to Oia', km: 10, note: 'The signature cliff-edge trail via Imerovigli and Skaros Rock; shorten to Fira-Imerovigli for 3 km. Finish for sunset in Oia.' },
  ],
  Thessaloniki: [
    { name: 'Nea Paralia, White Tower to the Concert Hall', km: 3.5, note: 'Renewed waterfront with the Umbrellas sculpture and Alexander statue, Mount Olympus visible across the gulf.' },
    { name: 'Ano Poli walls to Trigonion Tower', km: 2, note: 'Byzantine walls above the upper town, the classic sunset balcony over the whole bay.' },
  ],
  Dubrovnik: [
    { name: 'City Walls circuit', km: 1.9, note: 'Complete rampart loop over terracotta roofs, Minceta Tower and the open Adriatic. Go at opening time to beat the crowds.' },
    { name: 'Stradun to the Porporela breakwater', km: 1, note: 'The polished limestone main street to the old-harbour pier below St John Fortress, swimmers off the rocks.' },
  ],
  Split: [
    { name: 'Marjan hill from the Riva', km: 3.5, note: 'Stairs through Veli Varos to the Telegrin flag and pine coves, Diocletian\'s Palace and the islands below.' },
    { name: 'Riva promenade and Diocletian\'s Palace', km: 1, note: 'Palm-lined waterfront against the 1700-year-old palace wall; enter through the cellars to the Peristyle.' },
  ],
  Zadar: [
    { name: 'Riva to the Sea Organ and Greeting to the Sun', km: 1.5, note: 'Marble waterfront ending at wave-played organ pipes; Hitchcock called this the world\'s most beautiful sunset.' },
  ],
  Kotor: [
    { name: 'Ladder of Kotor walls to St John Fortress', km: 1.2, note: 'Some 1350 steps up the ramparts, the fjord-like Bay of Kotor unfolding below the old town.' },
  ],
  Ljubljana: [
    { name: 'Ljubljanica embankments and Castle Hill', km: 2.5, note: 'Plecnik\'s Triple Bridge and riverside colonnades, then the wooded path from Stari trg up to the castle terrace.' },
  ],
  Zagreb: [
    { name: 'Upper Town and the Strossmayer Promenade', km: 2, note: 'Funicular or stairs to Lotrscak Tower, chestnut-shaded Strossmartre views, St Mark\'s tiled roof beyond.' },
  ],
  Zurich: [
    { name: 'Lake promenade to Zurichhorn', km: 3, note: 'From Bellevue along lakeside gardens and lidos, Alps on clear days; Le Corbusier\'s pavilion at the end.' },
    { name: 'Lindenhof and the Limmat quays', km: 1.5, note: 'Roman-era terrace over the river, then guild houses and the Grossmunster twin towers along Limmatquai.' },
  ],
  Geneva: [
    { name: 'Lakefront, Jardin Anglais to Bains des Paquis', km: 2.5, note: 'The Flower Clock, the Jet d\'Eau jetty and the harbour promenade to the 1930s bathing pier. Mont Blanc on clear days.' },
  ],
  Lucerne: [
    { name: 'Chapel Bridge and the Musegg Wall', km: 2.5, note: 'The 14th-century painted bridge, then nine medieval towers on the rampart walk above the old town.' },
    { name: 'Nationalquai lake promenade', km: 2, note: 'Chestnut-lined shore past the Hofkirche, with Pilatus and Rigi rising straight from Lake Lucerne.' },
  ],
  Nice: [
    { name: 'Promenade des Anglais', km: 4, note: 'The Belle Epoque seafront curve of the Baie des Anges, blue chairs and pebble beaches from the Negresco to the old town.' },
    { name: 'Castle Hill from Cours Saleya', km: 1.5, note: 'Steps from the flower market to waterfall gardens and the best aerial view of the bay and rooftops.' },
  ],
  Marseille: [
    { name: 'Corniche Kennedy', km: 4, note: 'Seafront balcony road from the Catalans beach towards the Prado, facing the Frioul islands and Chateau d\'If.' },
    { name: 'Vieux-Port to Notre-Dame de la Garde', km: 1.8, note: 'Climb from the harbour to the golden Bonne Mere basilica watching over the whole city and sea.' },
  ],
  Lyon: [
    { name: 'Vieux Lyon to Fourviere', km: 2, note: 'Renaissance traboule passageways, then the Rosary garden climb to the basilica esplanade above both rivers.' },
  ],
  Bordeaux: [
    { name: 'Garonne quays and the Miroir d\'Eau', km: 3, note: 'Place de la Bourse mirrored in the world\'s largest reflecting pool, then the quays to the Chartrons wine district.' },
  ],
  Strasbourg: [
    { name: 'Petite France to the Barrage Vauban', km: 2, note: 'Half-timbered tanners\' quarter on the Ill canals, the covered bridges and the dam rooftop view of the cathedral spire.' },
  ],
  Tallinn: [
    { name: 'Toompea viewpoints and the Old Town walls', km: 2, note: 'Patkuli and Kohtuotsa platforms over red roofs, down Pikk Jalg past onion domes to Town Hall Square.' },
  ],
  Riga: [
    { name: 'Old Riga to the Art Nouveau quarter', km: 2.5, note: 'From the House of the Blackheads and the Three Brothers across the canal park to Alberta iela\'s Eisenstein facades.' },
  ],
  Vilnius: [
    { name: 'Bernardine Gardens to Three Crosses Hill and Uzupis', km: 2.5, note: 'Riverside gardens, a birch-lined climb to the white crosses panorama, then the bohemian Uzupis republic.' },
  ],
  Valletta: [
    { name: 'Bastion loop, Upper to Lower Barrakka and Fort St Elmo', km: 3, note: 'Harbour-wall circuit above the Grand Harbour, the noon saluting battery and the Siege Bell memorial.' },
  ],
  Bratislava: [
    { name: 'Korzo to the Castle and the Danube promenade', km: 2.5, note: 'From Michael\'s Gate through the old town, castle stairs for river views, back along the embankment past the UFO bridge.' },
  ],
  Bucharest: [
    { name: 'Calea Victoriei to the Old Town', km: 2.7, note: 'The 1692 royal avenue past the Athenaeum and CEC Palace into Lipscani\'s lanes and Stavropoleos Church.' },
  ],
  Sofia: [
    { name: 'Vitosha Boulevard and the Alexander Nevsky loop', km: 2.5, note: 'Pedestrian mall aimed straight at Vitosha mountain, then the gold-domed cathedral and the Roman Serdika ruins.' },
  ],
  Belgrade: [
    { name: 'Knez Mihailova to Kalemegdan Fortress', km: 2, note: 'The city\'s 19th-century promenade ending on ramparts above the Sava-Danube confluence; the local sunset ritual.' },
  ],
  Sarajevo: [
    { name: 'Bascarsija to the Yellow Fortress', km: 1.5, note: 'From the Sebilj fountain and coppersmith lanes past the Kovaci cemetery to the sunset bastion over the minaret skyline.' },
  ],
  Tirana: [
    { name: 'Grand Park lake loop', km: 5, note: 'Flat circuit of the 1957 Artificial Lake, pines, lakeside cafes and skyline views; Tirana\'s favourite promenade.' },
  ],
  Palermo: [
    { name: 'Cassaro, Porta Felice to the cathedral', km: 2, note: 'Palermo\'s oldest street from the sea gate past Quattro Canti and the Pretoria fountain to the Arab-Norman cathedral.' },
    { name: 'Foro Italico seafront', km: 1.5, note: 'Lawned promenade along the old sea walls from Porta Felice towards the botanical garden, Monte Pellegrino rising across the bay.' },
  ],
  Catania: [
    { name: 'Via Etnea from Piazza del Duomo', km: 2, note: 'Lava-stone boulevard from the Elephant Fountain past the Crociferi baroque churches to Villa Bellini\'s gardens, Etna framed dead ahead.' },
  ],
  Bari: [
    { name: 'Muraglia walls of Bari Vecchia', km: 1.5, note: 'Rampart promenade above the old harbour, past the Basilica di San Nicola and the orecchiette makers of Strada Arco Basso.' },
    { name: 'Lungomare Nazario Sauro', km: 2, note: 'The grand 1930s seafront colonnade south from the old port, Bari\'s evening passeggiata over the Adriatic.' },
  ],
  Bologna: [
    { name: 'Portico di San Luca from Porta Saragozza', km: 3.8, note: 'The world\'s longest portico, 666 arches climbing to the Madonna di San Luca sanctuary above the plain. UNESCO listed; steady uphill.' },
    { name: 'Piazza Maggiore to the Two Towers and Santo Stefano', km: 1.5, note: 'Neptune\'s fountain, the Quadrilatero market lanes and the seven-church complex, ending under the leaning Asinelli tower.' },
  ],
  Verona: [
    { name: 'Ponte Pietra to Castel San Pietro', km: 1.5, note: 'Cross the Roman bridge and climb past the Roman theatre to the hillside terrace, the definitive panorama of Verona in its Adige bend.' },
    { name: 'Piazza Bra to Piazza delle Erbe', km: 1, note: 'From the Arena\'s pink arcades up marble-slabbed Via Mazzini to the frescoed market square and Juliet\'s courtyard nearby.' },
  ],
  Genoa: [
    { name: 'Via Garibaldi and the caruggi to the Porto Antico', km: 2, note: 'UNESCO Rolli palaces, then the medieval alley maze down to the old harbour, the Bigo crane lift and the Neptune galleon.' },
    { name: 'Corso Italia to Boccadasse', km: 2.5, note: 'Genoa\'s seafront corso ending in the pastel fishing cove of Boccadasse; gelato on the pebble beach.' },
  ],
  Turin: [
    { name: 'Po riverside to Monte dei Cappuccini', km: 2, note: 'From Piazza Vittorio Veneto over the stone bridge to the Gran Madre church, then up to the monastery terrace: Mole, rooftops and Alps.' },
    { name: 'Arcades, Porta Nuova to Piazza Castello', km: 2, note: 'Under the porticoes of Via Roma through Piazza San Carlo\'s twin churches to the royal square and palace gardens.' },
  ],
  Trieste: [
    { name: 'Rive waterfront to Piazza Unita d\'Italia', km: 1.5, note: 'Harbour promenade past the Canal Grande\'s moored boats to Europe\'s largest sea-facing square; walk out the Molo Audace pier at dusk.' },
    { name: 'Barcola pineta to Miramare Castle', km: 4.5, note: 'Pine-shaded swimming promenade loved by Triestini, ending at Maximilian\'s white castle on its headland gardens.' },
  ],
  Pisa: [
    { name: 'Lungarni and Borgo Stretto to the Field of Miracles', km: 2, note: 'River palaces and the spiky Santa Maria della Spina, then arcaded lanes north to the Leaning Tower\'s green lawn.' },
    { name: 'Mura di Pisa wall-top walk', km: 3, note: 'Restored medieval ramparts walked eleven metres up, with straight-down views over the Duomo, Baptistery and Leaning Tower.' },
  ],
  Cagliari: [
    { name: 'Bastione di Saint Remy and the Castello', km: 1.5, note: 'Grand stairway to the Umberto I terrace over the gulf, then citadel lanes to the Elephant Tower and the cathedral.' },
    { name: 'Poetto beach promenade', km: 4, note: 'Flat seafront along the city beach beneath the Sella del Diavolo headland; flamingos wade in the Molentargius ponds behind.' },
  ],
  Granada: [
    { name: 'Carrera del Darro to Mirador de San Nicolas', km: 1.5, note: 'Riverside lane beneath the Alhambra walls, then Albaicin alleys up to the terrace with the classic sunset view of the palace and Sierra Nevada.' },
    { name: 'Alhambra woods from Plaza Nueva', km: 1.5, note: 'Cuesta de Gomerez through the Puerta de las Granadas, elm-shaded paths past the Gate of Justice to the palace walls and Generalife lanes.' },
  ],
  'San Sebastian': [
    { name: 'La Concha promenade to the Peine del Viento', km: 3, note: 'The white-balustrade curve of La Concha bay via Ondarreta beach to Chillida\'s Comb of the Wind sculptures bolted into the rocks.' },
    { name: 'Monte Urgull ramparts from the old town', km: 2, note: 'Harbour-side paths up to the Mota castle batteries, the whole shell of the bay and Santa Clara island below.' },
  ],
  Bilbao: [
    { name: 'Nervion riverside, Casco Viejo to the Guggenheim', km: 2.5, note: 'From the Arenal bandstand along the river past the Zubizuri footbridge to Gehry\'s titanium museum and Puppy, the flower dog.' },
  ],
  'Santiago de Compostela': [
    { name: 'Camino finale, Monte do Gozo to the cathedral', km: 4.5, note: 'Walk the pilgrims\' final leg down into the granite old town, through Porta do Camino to the cathedral\'s Praza do Obradoiro.' },
    { name: 'Alameda park and the Paseo da Ferradura', km: 1.5, note: 'Oak grove of Santa Susana and a horseshoe balcony promenade with the postcard view of the cathedral\'s baroque towers.' },
  ],
  Santander: [
    { name: 'Paseo de Pereda to La Magdalena and El Sardinero', km: 5, note: 'Bay-front promenade past the Centro Botin to the royal palace headland of La Magdalena, then round to the Sardinero beaches.' },
  ],
  'A Coruna': [
    { name: 'Paseo Maritimo to the Tower of Hercules', km: 3, note: 'From the glass-galleried marina around Orzan bay to the world\'s oldest working lighthouse, Roman-founded and UNESCO listed.' },
  ],
  Ibiza: [
    { name: 'Dalt Vila walls from Portal de ses Taules', km: 1.5, note: 'Drawbridge gate and Renaissance bastion ramp up to the cathedral terrace, harbour and Formentera on the horizon. UNESCO walled town.' },
  ],
  Faro: [
    { name: 'Cidade Velha and the Ria Formosa front', km: 1.5, note: 'Through the Arco da Vila into the walled old town, storks nesting on the gate, then the marina promenade facing the lagoon islands.' },
  ],
  Funchal: [
    { name: 'Frente Mar promenade, Lido to the old town', km: 3.5, note: 'Ocean promenade past Reid\'s Palace and the harbour to the painted doors of Rua de Santa Maria; cable cars climb to Monte above.' },
  ],
  'Ponta Delgada': [
    { name: 'Avenida waterfront and the Portas da Cidade', km: 2, note: 'Harbour-front avenue past the three-arched city gates and the Sao Bras fortress, whale-watching boats heading out below.' },
  ],
  Coimbra: [
    { name: 'Arco de Almedina climb to the University', km: 1.5, note: 'From Rua Ferreira Borges through the Moorish gate up steep lanes to the Joanina Library and the Paco courtyard over the Mondego.' },
    { name: 'Parque Verde and the Pedro e Ines bridge', km: 1.5, note: 'Mondego riverside lawns and the colour-paned footbridge named for Portugal\'s tragic royal lovers.' },
  ],
  Toulouse: [
    { name: 'Garonne quays, Pont Neuf to the Prairie des Filtres', km: 2, note: 'Brick-pink embankments facing the Dome de la Grave; sunset crowds gather on the Saint-Pierre bridge.' },
    { name: 'Canal du Midi towpath from Port Saint-Sauveur', km: 2.5, note: 'Plane-shaded UNESCO canal cutting through the city, barges moored beneath the Jardin des Plantes.' },
  ],
  Nantes: [
    { name: 'Ile de Nantes, the Machines and the Loire banks', km: 2.5, note: 'Watch the Grand Elephant stride from Les Machines, then follow the quays to Buren\'s eighteen glowing rings over the river.' },
    { name: 'Castle to Passage Pommeraye', km: 1.5, note: 'From the ducal castle moat through the Bouffay lanes to the three-tiered 1843 shopping arcade.' },
  ],
  Montpellier: [
    { name: 'Ecusson lanes to the Promenade du Peyrou', km: 2, note: 'From Place de la Comedie through the medieval Ecusson to the royal esplanade: triumphal arch, water tower and Saint-Clement aqueduct.' },
  ],
  Ajaccio: [
    { name: 'Old town and the citadel shore', km: 1.5, note: 'From Maison Bonaparte through ochre lanes to Saint-Francois beach under the citadel walls, the Sanguinaires islands out in the gulf.' },
  ],
  Basel: [
    { name: 'Rhine promenade from the Mittlere Brucke', km: 2.5, note: 'Riverside path below the Munster terrace, cable ferries crossing; in summer locals drift downstream with waterproof swim bags.' },
    { name: 'Old town to the Spalentor', km: 1.5, note: 'From the scarlet Rathaus on Marktplatz through guild lanes to the 14th-century Spalentor, finest of the surviving city gates.' },
  ],
  Bern: [
    { name: 'Arcades, Zytglogge to the Bear Park', km: 1.5, note: 'UNESCO old town under six kilometres of arcades, past the astronomical clock and Einstein\'s flat, over Nydegg bridge to the bears.' },
    { name: 'Rose Garden viewpoint loop', km: 2, note: 'Climb from the Bear Park to the Rosengarten terrace for the full panorama of the old town wrapped in its turquoise Aare bend.' },
  ],
  Lausanne: [
    { name: 'Ouchy lakefront promenade', km: 2.5, note: 'Belle epoque quays past the Olympic Museum gardens, paddle steamers docking and the Savoy Alps across Lake Geneva.' },
    { name: 'Escaliers du Marche to the cathedral', km: 1, note: 'Covered wooden stairway from Place de la Palud up to the cathedral terrace; a night watch still calls the hours from the tower.' },
  ],
  Stuttgart: [
    { name: 'Schlossplatz and the Schlossgarten', km: 3, note: 'From the palace square\'s lawns through the Green U park chain past the opera lake towards Rosenstein park and the Wilhelma gardens.' },
  ],
  Frankfurt: [
    { name: 'Eiserner Steg and the Museum Embankment', km: 2.5, note: 'Cross the iron footbridge from the Romer to the Sachsenhausen museum bank, skyline mirrored in the Main; apple-wine taverns behind.' },
  ],
  Dresden: [
    { name: 'Bruhl\'s Terrace and the Altstadt', km: 2, note: 'The Balcony of Europe above the Elbe, from the Augustus Bridge past the Frauenkirche dome to the Zwinger courtyards.' },
    { name: 'Elbe meadows to the Blaues Wunder', km: 6, note: 'Flat riverside meadows with paddle steamers passing, ending at the 1893 Blue Wonder bridge beneath the villas of Loschwitz.' },
  ],
  Leipzig: [
    { name: 'Clara-Zetkin-Park and the Karl-Heine-Kanal', km: 3, note: 'Park lawns, then the canal towpath into Plagwitz\'s brick factory lofts, kayaks gliding under the iron bridges.' },
  ],
  Nuremberg: [
    { name: 'Kaiserburg and the city walls', km: 3, note: 'From Konigstor along the moated ramparts to the castle terrace over red roofs, down past Durer\'s house to the Hauptmarkt.' },
  ],
  Dusseldorf: [
    { name: 'Rheinuferpromenade to the Medienhafen', km: 2.5, note: 'From the Altstadt\'s brewery lanes along the plane-tree river promenade to Gehry\'s leaning towers and the Rhine Tower.' },
  ],
  Rotterdam: [
    { name: 'Erasmus Bridge and Kop van Zuid', km: 2.5, note: 'Cross the Swan to Hotel New York on Wilhelminapier, ocean-liner history under the skyline; return along the Maas boulevard.' },
    { name: 'Oude Haven and the Cube Houses', km: 1, note: 'From the tilted yellow cubes and pencil tower around the oldest harbour\'s historic barges to the Markthal\'s painted ceiling.' },
  ],
  Maastricht: [
    { name: 'City walls from the Helpoort', km: 2, note: 'From the 1229 Hell Gate along medieval ramparts and the Jeker millstreams of the Stadspark, then across the Sint Servaas bridge.' },
  ],
  Antwerp: [
    { name: 'Grote Markt to the Scheldt quays', km: 1.5, note: 'Guildhall square and the cathedral spire, then Het Steen castle on the riverfront promenade.' },
    { name: 'Sint-Anna tunnel to the left bank', km: 1.5, note: 'Ride the 1933 wooden escalators down, walk under the Scheldt and surface for the classic skyline view from Linkeroever.' },
  ],
  Ghent: [
    { name: 'Graslei and Korenlei to Gravensteen', km: 1.5, note: 'From St Michael\'s Bridge\'s three-tower view along the medieval guild quays to the moated Castle of the Counts; floodlit after dark.' },
  ],
  Luxembourg: [
    { name: 'Chemin de la Corniche and the Grund', km: 2, note: 'Rampart balcony above the Alzette gorge, called Europe\'s most beautiful balcony, dropping to the Grund below the Bock casemates.' },
  ],
  Graz: [
    { name: 'Schlossberg to the Murinsel', km: 2, note: 'Stone steps up to the Uhrturm clock tower above the red-tiled old town, then down to the floating steel island on the Mur.' },
  ],
  Brno: [
    { name: 'Old town to Spilberk Castle', km: 2.5, note: 'From the cabbage market and Petrov cathedral hill up wooded park paths to the fortress ramparts and their casemate prison.' },
  ],
  Wroclaw: [
    { name: 'Market Square to Ostrow Tumski', km: 2, note: 'Past the twin-spired Rynek and the university\'s baroque hall to Cathedral Island, where a lamplighter still lights the gas lamps at dusk.' },
  ],
  Aarhus: [
    { name: 'Aarhus river and the Latin Quarter', km: 1.5, note: 'Reopened river promenade of cafes from the cathedral square to the harbour bath, with a detour to ARoS\'s rooftop rainbow walkway.' },
  ],
  Gothenburg: [
    { name: 'Haga to Skansen Kronan', km: 1.5, note: 'Wooden-house lanes famous for giant cinnamon buns, then the steps to the 17th-century hilltop redoubt overlooking the rooftops.' },
  ],
  Malmo: [
    { name: 'Ribersborg boardwalk to the Kallbadhus', km: 2.5, note: 'Beach-park promenade with the Turning Torso behind you and the Oresund Bridge on the horizon, ending at the 1898 cold-bath pier.' },
  ],
  Trondheim: [
    { name: 'Bakklandet and the Old Town Bridge to Kristiansten', km: 2, note: 'Wharf houses on stilts along the Nidelva, the red portal of Gamle Bybro and a short climb to the fortress panorama.' },
  ],
  Stavanger: [
    { name: 'Old Stavanger and the harbour', km: 1.5, note: 'Cobbled lanes of white timber houses above Vagen harbour, then the rainbow-painted street of Ovre Holmegate for coffee.' },
  ],
  Tromso: [
    { name: 'Harbour to the Arctic Cathedral', km: 2.5, note: 'Waterfront past the Polar Museum, then the Tromso Bridge walkway to the iceberg-shaped cathedral; Fjellheisen cable car just beyond.' },
  ],
  Cork: [
    { name: 'River Lee loop via Fitzgerald Park', km: 2.5, note: 'Cross Daly\'s bouncing Shakey Bridge to the park\'s riverside gardens and back past the university\'s limestone quad.' },
  ],
  Galway: [
    { name: 'Salthill Promenade', km: 3, note: 'Galway Bay seafront to the Blackrock diving tower; kick the wall at the end as generations of locals have done.' },
    { name: 'Long Walk and the Claddagh', km: 1, note: 'From the Spanish Arch past the painted Long Walk terrace to the Claddagh quays where the swans gather.' },
  ],
  Belfast: [
    { name: 'Maritime Mile to Titanic Belfast', km: 2, note: 'Follow the Lagan from the Big Fish past the SS Nomadic and the slipways to the silver hull-shaped museum; the yellow cranes loom.' },
  ],
  Glasgow: [
    { name: 'Kelvingrove and the Kelvin Walkway', km: 2, note: 'Riverside park paths beneath the Gothic tower of Glasgow University, ending at Kelvingrove\'s red sandstone galleries.' },
    { name: 'Cathedral and the Necropolis', km: 1.5, note: 'From the medieval cathedral over the Bridge of Sighs into the Victorian garden cemetery, obelisks and city views from the hilltop.' },
  ],
  Manchester: [
    { name: 'Castlefield basin and the canals', km: 2, note: 'Roman fort corner, iron railway viaducts and narrowboat locks where the Bridgewater Canal began Britain\'s canal age.' },
  ],
  Liverpool: [
    { name: 'Pier Head and the Royal Albert Dock', km: 2, note: 'The Three Graces on the Mersey waterfront, the Beatles statue and the red-brick colonnades of the restored dock.' },
  ],
  Bristol: [
    { name: 'Harbourside to the Clifton Suspension Bridge', km: 4, note: 'From the SS Great Britain along the Avon to Brunel\'s bridge strung high across the gorge; climb to the observatory for the view.' },
  ],
  Bath: [
    { name: 'Royal Crescent and the Circus to Pulteney Bridge', km: 2, note: 'Georgian honey-stone showpieces linked by the Gravel Walk, ending at the shop-lined bridge and the horseshoe weir below.' },
  ],
  York: [
    { name: 'City Walls circuit', km: 3.4, note: 'England\'s most complete medieval walls; the Bootham Bar to Monk Bar stretch frames the Minster across the Dean\'s Park gardens.' },
  ],
  Heraklion: [
    { name: 'Venetian harbour and the Koules fortress', km: 1.5, note: 'Out along the sea mole to the 16th-century fort, then back past the arched arsenals to the Morosini lion fountain.' },
  ],
  Chania: [
    { name: 'Venetian harbour to the lighthouse', km: 1.5, note: 'Round the quay past the mosque and the shipyard arches, out the breakwater to the Egyptian lighthouse for sunset.' },
  ],
  Rhodes: [
    { name: 'Street of the Knights and the moat walk', km: 2, note: 'Cobbled avenue of the crusader inns to the Grand Master\'s Palace, then down into the dry moat between the Hospitaller walls.' },
  ],
  Corfu: [
    { name: 'Liston esplanade to the Old Fortress', km: 1.5, note: 'Arcaded Venetian promenade beside the cricket green, then the causeway over the moat to the fortress lighthouse viewpoint.' },
  ],
  Mykonos: [
    { name: 'Little Venice to the windmills', km: 0.8, note: 'Through Matoyianni\'s white lanes to the sea-splashed balconies of Little Venice and up to the Kato Mili windmills for sunset.' },
  ],
  Plovdiv: [
    { name: 'Old Town to Nebet Tepe', km: 1.5, note: 'Revival-era mansions and the Roman theatre on the way up to the Nebet Tepe ruins, the sunset rock above the city of seven hills.' },
  ],
  'Cluj-Napoca': [
    { name: 'Central Park and Cetatuia Hill', km: 2.5, note: 'The casino gardens and Somes riverside, then the stairs up Cetatuia for the panorama of St Michael\'s spire and the old town roofs.' },
  ],
  Brasov: [
    { name: 'Council Square to the White Tower', km: 2, note: 'From Piata Sfatului and the Black Church along the Graft canal bastions, up to the White Tower\'s red-roof panorama.' },
    { name: 'Aleea de sub Tampa rampart walk', km: 2, note: 'Promenade under Mount Tampa\'s forested wall, linking Catherine\'s Gate and the medieval bastions; cable car to the summit sign.' },
  ],
  Sibiu: [
    { name: 'Big Square to the Bridge of Lies', km: 1.5, note: 'Baroque squares beneath the town\'s eyelid rooftops, the 1859 iron bridge and stairways threading down to the Lower Town walls.' },
  ],
  Skopje: [
    { name: 'Stone Bridge to the Old Bazaar and Kale', km: 1.5, note: 'Cross the Ottoman bridge from Macedonia Square into the bazaar\'s coppersmith lanes, then the fortress walls above the Vardar.' },
  ],
  Pula: [
    { name: 'Roman Pula loop', km: 2, note: 'From the first-century Arena through the Arch of the Sergii to the forum\'s Temple of Augustus, up the Kastel for harbour views.' },
  ],
  Paphos: [
    { name: 'Coastal promenade, harbour castle to the Tombs of the Kings', km: 3.5, note: 'Seafront path past the mosaics of the archaeological park to the rock-cut necropolis; flat, with swimming coves on the way.' },
  ],
  Limassol: [
    { name: 'Molos seafront promenade', km: 3, note: 'Sculpture-park piers and palm groves from the castle quarter and old port along the bay; the marina extends the walk westward.' },
  ],
};

/** Dataset names that differ from the walk keys above. */
const CITY_ALIASES = {
  'Cologne-Bonn': 'Cologne',
  Malta: 'Valletta',
  'San Sebasti\u00e1n': 'San Sebastian',
  'Malm\u00f6': 'Malmo',
  'Troms\u00f8': 'Tromso',
  'D\u00fcsseldorf': 'Dusseldorf',
  'Bra\u0219ov & Bran': 'Brasov',
  'Galway & Cliffs of Moher': 'Galway',
};

export function scenicWalksFor(cityName) {
  if (!cityName) return [];
  if (SCENIC_WALKS[cityName]) return SCENIC_WALKS[cityName];
  // Dataset names may carry an airport suffix, e.g. 'Paris (CDG)', 'Oslo (Torp)'.
  const base = String(cityName).replace(/\s*\([^)]*\)\s*$/, '').trim();
  const key = CITY_ALIASES[base] || base;
  return SCENIC_WALKS[key] || [];
}
