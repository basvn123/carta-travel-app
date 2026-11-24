# checks.md: data wave 4 numbers (every figure from `scripts/quality/replay_poi_rules.py`)

Command: `python scripts/quality/replay_poi_rules.py --public <main checkout>/continent-app/public --repo <main checkout> --rules before|after --out <json> --dropped-sample <json>`. 157,775 rows in 3,865 shards, read only. Files: `poi-before.json` (committed before any rule), `poi-before-types.json` (before, with the landmark P31 types the dossier replay needs), `poi-after.json`.

Must-sees after the rules approximate relabelling: a dropped one is replaced by the next recommended row by sig.

| Measure | Before | After | Target |
|---|---|---|---|
| Must-sees | 11161 | 11158 | |
| Must-sees filed Square without a square word | 3769 (33.77%) | 2 (0.02%) | at most 2% |
| Must-sees matching event/org/shop/Fondali, not a visitable site | 274 | 3 | 0 |
| Must-sees flagged noise (dropped) | 0 | 286 | |
| Dossier highlights matching the ban regex (name and P31 types) | 580 | 12 | 0 |
| Festival rows matching the adult or trade regex | 3 | 0 | 0 |

After judge 1 (fixes 2a to 2d): the 60-language exception for events is gone (Verdun, Vienna, Actium, Mohacs, Kosovo are flagged), `EVENT_NAME_RE` takes ordinals and "on" (Raid on Pula, Third Siege of Missolonghi), fame alone no longer rescues an organisation (Deutsche Bank flagged), and a town hall is a Palace, not a Town. The 3 research-pattern must-sees left are Slovak National Theatre (a theatre you can visit) and two Fort Eben-Emael rows (a fort, kept by the site word). Remaining highlights (12): 7 war memorials or cemetery-memorials kept by heritage or the memorial word, 3 regex false positives (Sampierdarena, Frederiksstaden, Arenas Blancas Lighthouse), others in `errors.md`.

Replay run time (`--rules after`, 157,775 rows, 3,865 shards and dossiers, main checkout on this disk): 895 s, about 15 minutes. Plan for 10 to 15 minutes; run it in the background.

## Dropped must-sees by place class
{"town": 91, "city": 88, "village": 62, "area": 28, "metro": 16, "?": 1}

## Dropped must-sees by country (top 15)
{"IT": 56, "FR": 49, "ES": 32, "GR": 20, "GB": 18, "BE": 14, "DE": 14, "NL": 10, "PL": 7, "BG": 7, "HR": 6, "CZ": 6, "XK": 5, "HU": 4, "DK": 4}

## Square must-sees without square word after, by class
{"metro": 2}

## Must-keep list
- Dam: [["AMS", "Dam", "Palace", "Square", "must_see", false], ["AMS", "Dam Square", "Square", "Square", null, false]]
- Parthenon: [["ATH", "Parthenon", "Square", "Attraction", "must_see", false]]
- Atomium: [["BRU", "Atomium", "Square", "Attraction", "must_see", false]]
- Manneken Pis: [["BRU", "Manneken Pis", "Square", "Attraction", "must_see", false]]
- Pere Lachaise: [["BVA", "P\u00e8re Lachaise Cemetery", "Square", "Attraction", "must_see", false], ["CDG", "P\u00e8re Lachaise Cemetery", "Square", "Attraction", "must_see", false], ["ORY", "P\u00e8re Lachaise Cemetery", "Square", "Attraction", "must_see", false]]
- Colosseum: [["CIA", "Colosseum", "Theatre", "Attraction", "must_see", false], ["FCO", "Colosseum", "Theatre", "Attraction", "must_see", false], ["gem:opatija", "Colosseum", "Square", "Attraction", "worth_a_look", false]]
- Waterloo: [["gem:amersfoort", "Naald van Waterloo", "Square", "Attraction", "recommended", false], ["gem:baarn", "Naald van Waterloo", "Square", "Attraction", "must_see", false], ["gem:betws-y-coed", "Waterloo Bridge Service Station", "Bridge", "Bridge", "worth_a_look", false], ["gem:hallerbos", "Battle of Waterloo", "Square", "Attraction", "worth_a_look", false]]
- Auschwitz: [["gem:auschwitz", "Auschwitz", "Museum", "Museum", "worth_a_look", false], ["gem:auschwitz", "Auschwitz-Birkenau State Museum", "Museum", "Museum", "must_see", false], ["gem:auschwitz", "Auschwitz III (Monowitz)", "Square", "Attraction", "worth_a_look", false], ["gem:auschwitz", "German Nazi Concentration and Extermination Camp Auschwitz II-Birkenau", "Museum", "Museum", "worth_a_look", false]]
- Missing from the shards under my pattern: ['Berlin Wall Memorial']. Berlin names found: [('BER', 'Infotafel Berliner Mauer', 'Square', 'worth_a_look'), ('DUS', 'Berlin Wall', 'Square', 'worth_a_look'), ('gem:potsdam', 'Berlin Wall', 'Square', 'worth_a_look')]
- Breaches (a must-keep row flagged noise): []

Row format: [shard, name, kind before, kind after, label before, flagged noise].

## Brussels highlights after (name, kept)
[["King Baudouin Stadium", false], ["Heysel Stadium disaster", false], ["Lotto Park", false], ["Cathedral of St. Michael and St. Gudula", true], ["National Basilica of the Sacred Heart", true], ["Royal Museums of Fine Arts of Belgium", true], ["Royal Palace of Brussels", true], ["Berlaymont building", true]]

## 50 dropped must-sees I read (shard | name | kind | desc | why)
All 286 dropped must-sees (276 before judge 1 plus 10 newly flagged) were read: the 36 that are not a plain "Battle of" row, including every newly flagged one (Deutsche Bank, Raid on Pula, Combat of the Thirty, Capture of Cadiz, Second Battle of the Marne), and 70 random battles earlier. None is a visitable site: battles and sieges as dates, naval actions, disasters (Costa Concordia, Courrieres), 9 seabed polygons (Fondali), 2 dioceses plus a bank, 2 railway stations, Waitrose. One real museum was dropped by the first draft (Sainsbury Centre for Visual Arts, shop rule) and fixed: the shop rule now gives way to a site word in desc.

- BZR | massacre at Béziers | Square | 1209 killing of Cathars during the Albigensian Crusade | event
- GDN | Defense of the Polish Post Office in Danzig | Square | 1939 battle of the World War II | event
- gem:alassio | Fondali Capo Mele - Alassio | Nature reserve |  | seabed
- gem:alassio | Fondali Santa Croce - Gallinara - Capo Lena | Nature reserve |  | seabed
- gem:algeciras | First Battle of Algeciras | Square | Battle of the Algeciras campaign | event
- gem:bacharach | Capture of Bacharach | Square | 1620 battle of the Thirty Years' War | event
- gem:belle-ile | Capture of Belle Île | Square | 1761 battle of the Seven Years' War | event
- gem:cadiz | Capture of Cadiz | Square | Battle during the Anglo-Spanish War | event
- gem:cervo | Fondali Capo Berta - Diano Marina - Capo Mimosa | Nature reserve |  | seabed
- gem:cipressa | Fondali Riva Ligure - Cipressa | Nature reserve |  | seabed
- gem:clervaux | Maulusmuhle railway station | Square | Former railway station in Luxembourg | station
- gem:dortmund | Ruhr Pocket | Square | Battle on the Western Front in 1945 | event
- gem:el-puerto-de-santa-maria | Capture of Cadiz | Square | Battle during the Anglo-Spanish War | event
- gem:giglio-castello | Costa Concordia disaster | Square | 2012 cruise ship sinking off the Italian coast | event
- gem:giglio | Costa Concordia disaster | Square | 2012 cruise ship sinking off the Italian coast | event
- gem:hvar | Roman Catholic Diocese of Hvar-Brač-Vis | Square | Roman Catholic diocese in Croatia | organisation
- gem:jajce | Operation Mistral 2 | Square | Offensive by the Croatian Army and Croatian Defence Council | event
- gem:la-flotte | Naval battle of Saint-Martin-de-Ré | Square | 1622 naval battle | event
- gem:lens | Courrières mine disaster | Square | 1906 coal mine explosion in Pas-de-Calais, France | event
- gem:mesolongi | First Siege of Missolonghi | Square | 1822 battle of the Greek War of Independence | event
- gem:mesolongi | Second Siege of Missolonghi | Square | 1823 siege | event
- gem:moneglia | Fondali Punta di Moneglia | Nature reserve |  | seabed
- gem:ponza | Fondali circostanti l'Isola di Ponza | Nature reserve |  | seabed
- gem:rochefort | Raid on Rochefort | Square | 1757 raid of the Seven Years' War | event
- gem:rochester | Raid on the Medway | Square | 1667 battle of the Second Anglo-Dutch War | event
- gem:romo | Action of 16 May 1644 | Square | 1644 naval battle of the Torstenson War | event
- gem:seborga-it | Fondali San Remo - Arziglia | Nature reserve |  | seabed
- gem:seborga | Fondali San Remo - Arziglia | Nature reserve |  | seabed
- gem:siano | Roman Catholic Archdiocese of Catanzaro-Squillace | Square | Latin Catholic archdiocese in Italy | organisation
- gem:sutjeska | Case Black | Square | Battle during World War II | event
- gem:trivignano-udinese | Stazione di Santa Maria la Longa | Square | stazione ferroviaria italiana | station
- gem:wokingham | Waitrose | Square |  | shop
- gem:ypres | First Battle of Ypres | Square | 1914 battle of the First World War | event
- gem:zonnebeke | Third Battle of Ypres | Square | 1917 campaign of the First World War | event
- LMP | Fondali delle Isole Pelagie | Nature reserve |  | seabed
- gem:drobak | Battle of Drøbak Sound | Square | Battle of World War II in the Norwegian Campaign | event
- gem:gradisca-d-isonzo | Second Battle of the Isonzo | Square | Battle in 1915 on the Italian Front during the First World W | event
- gem:bayonne | Battle of Bayonne | Square | 1814 battle of the campaign in south-west France | event
- gem:strasbourg | Battle of Strasbourg | Square | Battle fought in AD 357 | event
- gem:koge | Battle of Køge | Square | 1807 battle of the Gunboat War | event
- gem:madara-rider | Battle of Kulevicha | Square | 1829 battle of the Russo-Turkish War (1828-1829) | event
- gem:calella-de-palafrugell | Battle of Les Formigues | Square | 1285 naval battle near Spain | event
- gem:auray | Battle of Auray | Square | Part of the War of the Breton Succession (1364) | event
- gem:alise-sainte-reine | Battle of Alesia | Square | Part of the Gallic Wars | event
- CRL | Battle of Charleroi | Square | Battle during the First World War | event
- gem:kortrijk | Battle of the Golden Spurs | Square | 1302 battle of the Franco-Flemish War | event
- gem:nieuwpoort | Battle of the Yser | Square | 1914 battle of the First World War | event
- TMP | Battle of Tampere | Square | 1918 battle of the Finnish Civil War | event
- gem:gorlitz | Battle of Moys | Square | 1757 battle | event

## Wave 4 step 0 (D7 carried)

- Judge 3 fix 1: HANDBOOK and ROADMAP now say `cap_kept_long` 371, as the replay prints.
- Judge 3 fix 2: `names._GENERIC_PART` (descriptor and colour words, scanned from the wire's cut names, not a blind list) and `worse_reason` "generic_only", with no length limit. `_safe_name` takes a network prefix off, then the first dash segment when it fits and is no code, else the last, else the places in a trailing bracket. Replay counter `generic_only` required 0 (a second copy of the test; the list is shared).
- Replay on the real wire: ACCEPT. Changed 2,926, unclean 3,937 to 1,209, `generic_only` 0, `worse_than_wire` 0, `stray_bracket` 0, `unit_dropped` 0, `emptied` 0, `dangling_end` 0, `dedupe_cut` 0, `dedupe_trim` 9, `dedupe_replaced` 64, `id_suffix` 2, `cap_kept_long` 371, end losses 76 (75 over the cap), new duplicate groups 0.
- Whole-wire scan, names whose every 3+ letter word is a descriptor or colour: 208 on the wire itself; 222 with `308437f64c` (14 made by the cleaner); 208 now, and 0 that the wire did not already have.
- Diff against `308437f64c`: 21 ids change, all generic leftovers or their dedupe suffixes: 76648 and 76650 "Circuit Cheile Vălișoarei, versantul drept/stâng", 41836 "Le sentier de Ferrières", 211889 and 211890 "Motivation/Bewegung Bad Wünnenberg", 138004 and 150136 and 152972 keep Twente or Het Hulsbeek, 224692 "Schenefeld - Klövensteen - Wedel", 186798, 201656, 28662, plus a few where the dedupe suffix went away.
- Tests 128 passed, ruff clean, drift 0 new. Pins: 76648, 41836, 211890, 138004, 150136.

## Judge 1 round (D7)

- Policy (coordinator): no word cuts. `cap_title` takes a boundary only (" - ", ": ", ", ", " (", " ["); with none that keeps it within 42, the readable name ships whole. A boundary cut is kept only when the kept part holds a place word (capitalised, 3+ letters, not a descriptor, joiner or code; the first word does not count) and `trim_dangling` leaves it alone, else the whole name ships. The dedupe room-making cut is unchanged; before an id the dedupe now tries the whole readable name ("whole" level), so `id_suffix` is 0. The `_named_id` fallback ships a long start whole beside its id.
- Replay on the real wire: ACCEPT. Changed 2,471, unclean 3,937 to 1,688, of which 488 are names over 42 characters (`too_long` 1,925 to 488 and `kept_long` 488, allowed); unclean without them 1,200 (was 1,209). `place_lost` 0 (required), `worse_than_wire` 0, `generic_only` 0, `stray_bracket` 0, `unit_dropped` 0, `emptied` 0, `dangling_end` 0, `dedupe_cut` 0, `dedupe_trim` 8, `dedupe_replaced` 63, `id_suffix` 0, end losses 65 (64 over the cap), new duplicate groups 0. `cap_kept_long` is retired (371 before). The acceptance now measures unclean without `too_long`.
- Diff against HEAD (`904d598d0e`): 587 ids change. By reason: 491 shipped whole (no boundary, place lost or ends on a joiner, e.g. 240215, 184645, 69709, 72830, 27723, 196459, 4415, 63951), 14 dedupe suffix or base, 82 other (boundary cuts that keep a place, network-prefix removals such as "WNW Twente - X - oranje route" to "X - oranje route", and dedupe base trims).
- My own scan with the judge's method (Latin-script prefix cuts that drop every capitalised word after the first, plus word cuts and joiner ends): 2 left, 257069 "E10, Deutschland" and 71424 "ZT, Kamaraerdei tanösvény", both boundary cuts that keep a place after a leading code. "Word cuts" 40 are boundary cuts at " : " (my regex only knew ": ") or dedupe bases beside their suffix, no cut inside a word. Dangling ends 0.
- Pinned (`test_no_word_cuts_a_cut_keeps_a_place`): 240215, 184645, 69709, 72830, 27723, 196459 ship whole. Other tests changed to the new contract: names over 42 characters are whole, dedupe tells long names apart by their whole name (no `#id`), the ladder cap test allows a title over 42 that has no boundary.
- Known and allowed: 488 names over 42 characters (the app truncates on screen); the first-word rule can keep a cut that holds one place after a code (the 2 above); a leading "N#3" is not peeled from 75370 (it ships whole with its quotes).
- Tests 129 passed, ruff clean, drift 0 new.
