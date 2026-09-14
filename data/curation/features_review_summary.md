# Natural features review, 43 countries

What eleven per-country reviews found in the beach and mountain layers, what
the pipeline should change, and what the two machine-usable artifacts beside
this file are for.

| | |
|---|---|
| Snapshot reviewed | `data/curation/wire_snapshot/`, generated 2026-08-17T16:34Z |
| Size | 5,472 shipped rows: 2,177 beaches, 3,295 mountains, 43 countries |
| Master behind it | `data/derived/features.json`, 17,858 entities |
| Per-country findings | `data/curation/research/{ISO2}_review.json` |
| Wrong entries found | 648 |
| Missing entries found | 526, of which 434 verified with a QID or a coordinate |
| Deliverable 1 | `data/curation/features_filter_rules.json`, 38 rules, every count measured against the snapshot |
| Deliverable 2 | `data/curation/top_picks_seed.json`, 434 must-include entries in 43 countries |

---

## 1. The short version

The reviewers were asked to check the data. What they found is a **ranking
problem wearing a data problem's clothes**, and behind both a **coverage
problem that neither filtering nor re-ranking can fix**.

1. **The pool is wrong before the ranker sees it.** `build_features.py` builds
   the entire feature spine from `continent-app/public/activities_full.json`,
   the POI list already harvested per priced destination. A feature that no
   catalogue destination happened to collect does not exist at any tier. The
   observed consequence: the maximum `near.km` in the whole wire is 19.4 km,
   the 99th percentile is 8.9 km, the median is 4.0 km, and exactly one row in
   5,472 is further than 15 km from its anchor. `NEAR_DEST_KM` is set to 60 in
   `rank_features.py` and is therefore decorative. This single fact explains
   Zugspitze (11.4 km from Garmisch), Grossglockner, Dufourspitze (13.0 km from
   Zermatt), Vorder Grauspitz (10.8 km from Vaduz), Marmolada, Tre Cime,
   Snowdon, Carrauntoohil, Teide, Triglav, Musala, Kekes, Snezka and Golem
   Korab all being absent from their own country's file.

2. **The mountain score has no shape term, because the shape data is not
   there.** `form` is 0.30 of the mountain score, the largest single weight,
   and `form_value()` returns prominence, else elevation, else **0.0**.
   `elevation_m` is present on **0 of 5,472 shipped rows**. So 30% of every
   mountain's score is a constant zero and the ranking runs on photo (0.25),
   fame (0.20), designation (0.15) and curation (0.10). That is why a 158 m
   Somerset hill is Britain's top mountain, a 123 m landscaped rock is
   Austria's, a 235 m Budapest park is Hungary's and a 110 m Athens assembly
   terrace is Greece's.

3. **The beach score has a term that is nearly constant.** `water` is 0.20 of
   the beach score and 2,005 of 2,177 beaches (92%) are rated Excellent, 75
   Good, 9 Sufficient. A term that pays out the same to nine beaches in ten is
   not a ranking signal, it is a bonus. Worse, three countries have **no EEA
   data at all** (GB 13 beaches, ME 4, NO 1), so their beach score silently
   loses a fifth of its range and collapses onto photo-plus-fame. That is
   precisely why three London lidos with Wikipedia articles are ranked 2, 3
   and 6 in the United Kingdom.

4. **The tie-break is alphabetical, in code.** `tier_country()` sorts by
   `(-score, id)` and the id is the slugified name. The shipped `score` is a
   percentile blend, so ties are not rare, they are the norm: **234 tier-1 rows
   share their score with another row in the same list**, and in **27 of the 74
   country-and-kind lists the tier-1 cut falls inside a tie**. In those 27
   lists the thing separating a top pick from a tier-2 row is the first letter
   of its name.

5. **Nothing checks what a row IS.** There is a lexical contamination gate in
   `build_features.py` and a misattribution gate in `rank_features.py`, but no
   landform type test. So a 1097 battle is Croatia's top mountain, a listed
   house is Latvia's, a football stadium is 6th in Spain, a wheel of cheese
   illustrates Portugal's, an islet is 8th in Italy and a geothermal power
   station is 10th in Iceland.

6. **26 of the 74 country cards lead with a row a reviewer classified as
   wrong.** Not ranked low. Wrong.

---

## 2. Systemic failures, in the order they cost the most

### 2.1 Coverage: the harvest radius is the biggest single defect

Nothing else in this document matters as much. The features layer is a
by-product of a POI harvest that was scoped to destinations, and it inherits
that scope. Consequences measured in the snapshot:

- Cyprus has **3 mountain rows in the entire country**, all three wrong, and
  Mount Olympus / Chionistra (1,952 m) is not among them at any tier.
- Latvia has 4 mountain rows, Estonia 5, Moldova 3, San Marino 5, Malta 3.
- Greece has 80 mountain candidates against Switzerland's 203, Spain's 279 and
  Britain's 223, for a country with Olympus, Parnassos, Psiloritis, Smolikas,
  Athos and Taygetos, none of which is in tier 1.
- Spain has 315 beaches of which **24 are in the Canary Islands** (Tenerife 3,
  Gran Canaria 2, Fuerteventura 3, Lanzarote 6, La Gomera 10), Menorca 5,
  Formentera 7.
- Norway ships **one** beach, because the beach candidate pool is the EEA
  bathing-water register and Norway does not report to it.
- Bosnia ships **zero** beaches despite 20 km of coast at Neum, and North
  Macedonia zero despite Lake Ohrid, while the same pipeline happily counts
  Strandbad Klagenfurt, Strandbad Wannsee and Geneve-Plage as lake beaches
  elsewhere. Czechia and Slovakia ship zero with no `bathing_year` and no EEA
  join at all, so the tab is empty because the join never ran, not because
  anyone decided it should be.

The fix is two changes, not one:
- sweep **nationally** and use the nearest destination only to compute
  `near`, instead of using it as the gate;
- add an independent candidate source per kind so the beach pool does not
  depend on an EEA join (OSM `natural=beach` plus Wikidata `P31=Q40080`), and
  join the national registers where EEA does not reach (Environment Agency
  Swimfo, SEPA, NIEA, Natural Resources Wales for the UK, plus AL, RS, MK,
  XK, BA, ME, NO).

### 2.2 The scoring formula, term by term

The weights in `rank_features.py` are researched and defensible on paper. In
practice four of the six terms misbehave.

| term | weight | what actually happens |
|---|---|---|
| `form` (mountain) | 0.30 | Zero for every mountain in Europe. `elevation_m` and `prominence_m` are null on 100% of rows. The largest weight in the mountain formula contributes nothing. |
| `form` (beach) | 0.05 | An extent proxy counting `dedupe_of` plus `dests`. It rewards a beach for having been harvested twice, which is the same thing the dedupe is trying to undo. |
| `water` (beach) | 0.20 | 92% Excellent. Near-constant where present, entirely absent in GB, ME and NO. Should gate (exclude Poor) and annotate, never rank. |
| `photo` | 0.25 | Effectively binary: `commons_images` is rarely an integer, so it is 1.0 or 0.0. A quarter of the score is "has a picture". |
| `designation` | 0.20 / 0.15 | Joined by radius, not by containment. `UNESCO_KM = 10.0` against the property **centroid**, `PROTECTED_KM = 5.0` for protected areas. This is a bug with visible national consequences (see 2.3). |
| `fame` | 0.20 | The only term doing honest work, and it is outvoted 4 to 1. |

Where the formula is wrong, concretely:

- **Mountains are ranked on photography and polygon membership.** With `form`
  at zero, `photo` 0.25 + `designation` 0.15 = 0.40 of the score is "was
  photographed" plus "is inside a polygon", against 0.20 for fame. Ten of
  Switzerland's top 25 mountains are unvisitable Jungfrau-Aletsch glacier
  peaks that scored in on polygon membership alone. Nine of France's twelve
  tier-1 mountains are Chaine des Puys cinder cones, because one UNESCO
  inscription was credited to each component cone individually. Seven of
  Norway's twelve are minor Geirangerfjord tops, three of them sharing the
  score 0.980. Six of Denmark's twelve are unnamed field knolls behind Mons
  Klint, all on 0.789. Six of Bulgaria's twelve are within 8 km of Bansko,
  inside Pirin.
- **Designation must be applied to the designated object, once.** A World
  Heritage property is inscribed as one thing. Crediting 0.55 to every summit
  within 10 km of its centroid is how nine cinder cones took France's tier 1
  and how a battle site 6.4 km from Plitvice inherited `unesco`.
- **The tier cut must not fall inside a tie.** `group.sort(key=lambda f:
  (-f["score"], f["id"]))` is the alphabetical tie-break, at
  `rank_features.py` line 550. Replace `f["id"]` with a merit key:
  sitelink count, then elevation or prominence, then Wikipedia pageviews, then
  the id as a last resort so the sort stays deterministic.
- **A score value shared by many rows is a fallback, not a ranking.** 2,530
  rows (46% of the wire) sit in a band shared by 8 or more rows of the same
  country and kind. Greece has 147 beaches on 0.442; Italy 141 on 0.876; the
  Faroes 60 mountains on 0.688. Demote whole bands below every row with a
  distinct score and never let one fill a tier-1 seat.
- **No spread constraint anywhere.** `TIER1_CAP = 12` limits how many, never
  from where. Sozopol supplies 11 of Bulgaria's 12 tier-1 beaches; Ksamil 8 of
  Albania's 12; Palanga 7 of Lithuania's 9; Domburg 15 of the Netherlands' 39
  beach rows; Mellieha Bay is 4 of Malta's 16 rows and the Marfa corner 11 of
  16; Salzburg supplies 6 of Austria's top 20 mountains and Garmisch 8 of
  Germany's top 30. Cap at 2 tier-1 rows per 10 km cluster and per anchor
  destination, and require coverage of every coastal NUTS2 and every inhabited
  island group before a cluster gets a third seat.
- **`TIER1_CAP = 12` is the wrong constant for large countries.** 42 of the 74
  country-and-kind lists sit exactly at the cap. Twelve is right for Malta and
  absurd for Italy, which spans Sardinia, Sicily, Puglia, the Alps, the
  Dolomites and the Apennines. Make the cap a function of area and coastline
  with a per-region quota, not a flat number.
- **The witness rule is too generous.** Tier 1 already requires a witness, but
  a bathing-water class counts as one. An EEA row says the water is clean, not
  that the place is worth the journey. 27 tier-1 rows today carry no article,
  no formal designation and no shippable photo.
- **`top_beach` / `top_mountain` must never point at a tier-2 row**, and must
  return null rather than promote the least bad row. Luxembourg advertises
  Lultzhausen-Plage while that row is tier 2 and no tier-1 beach exists.
  Moldova's top_mountain is a tier-2 vineyard hill scoring 0.40.
  Bulgaria's mountain tier 1 is not even monotone in rank: it holds ranks
  1 to 7, then 14, 17, 24, 40 and 47, while ranks 8 to 13 sit in tier 2.

### 2.3 Type: nothing asks what the row is

648 wrong entries fall into ten classes. The largest are duplicates (171),
"other" (126) and not_notable (105), then hospitality (67) and wrong_country
(60). A single Wikidata `P31` gate, applied transitively through `P279`,
removes most of "other", "island", "park_or_area" and "viewpoint_not_summit"
in one pass, and it is the only test that can. Examples no regex reaches:

- **San Marino's Guaita and Montale** are the names of two of Monte Titano's
  three sub-summits **and** of the two towers built on them, and Wikidata
  genuinely types both as `P31 Q8502 mountain`. Only a sub-500 m proximity
  collapse gets them. The user-visible symptom is that San Marino's number two
  mountain renders as a photograph of a castle.
- **Vulcano and Lipari** are typed as both mountain and island. For a volcanic
  island the island reading must win, and the volcano seeded from its own item
  (Stromboli the volcano is Q31445600, the island is Q131148).
- **Latvia's `Balta maja`** is Q4853021, `P31 Q41176 building`, a listed house
  in the Rundale Palace complex, ranked 1 and set as the country card. Estonia's
  rank 2 `Polluvahi maja` is the same family. Their wire coordinates match
  Wikidata to five decimals, so the join is free.

### 2.4 Country assignment by nearest city instead of by geometry

Measured directly: **124 rows sit more than 2 km inside another country's
boundary**, 22 of them at tier 1. The reviewers had found 60 of these by hand;
the point-in-polygon test found 64 more, including 20 Slovak Tatras summits
filed under Poland and back, the Krkonose ridge, Saxon Switzerland and the
Marbore family split across France and Spain.

Separately, **48 rows are the same coordinate published in two countries at
once**: Matterhorn, Trockener Steg and Furggen in both CH and IT; five Lochau
beaches in both DE and AT, one at German tier 1; Plage du Buse, Mont Agel,
Tete de Chien and Cime de Baudon in both FR and MC.

The correct action is **reassign, never delete**. A ridge-line summit is real
in both countries and must survive in exactly one file, chosen deterministically
(highest polygon share, tie-broken by nearest catalogue destination). Monaco is
the one country where the delete branch is safe: all six of its rows are in
France and three already ship in the FR file.

### 2.5 Duplication

171 of the 648 wrong entries are duplicates, the largest single class. Three
passes, in order:

1. **shared article**: rows in one country and kind resolving to the same
   Wikipedia article. Keep the row whose name matches the article title; do
   not blind-keep the highest score, or Sustenhorn folds into Hinter Tierberg.
2. **250 m geometry**: 549 rows collapse. This is the pass that fixes
   Mellieha Bay's four rows, Humlebaek's three, the Ystad Sandskog eleven,
   Sozopol, Palanga, Liepaja and Balatonfured.
3. **2 km plus name similarity**, on **romanised** names. This is the only
   pass that can meet a Greek or Cyrillic name with its Latin twin:
   Paralia Kalamakiou = Kalamaki Beach, Harmanite in both alphabets,
   Pancicev vrh = Panchichev vrh.

One guard the reviewers were explicit about: **name similarity alone must
never merge**. Heyggjurin Mikli names two different Faroese mountains 60 km
apart, Q2421269 on Streymoy (692 m) and Q31844565 on Skuvoy (391 m).

### 2.6 Images

`other.image_name_incoherent` flags 724 rows whose Commons filename shares no
token with the feature name, 154 of them at tier 1. About two thirds are
correct but uninformative filenames (the Eiger's photo is `North face.jpg`),
so the shippable primary test is the **Commons geotag**: reject an image whose
coordinate is more than 1 km from the feature. The remainder are real
mis-joins that are visible on the card: Portugal's Estrela ships a wheel of
cheese, the Faroes' Arnafjall a postage stamp of Gasadalur, San Marino the same
relief map on two rows, Malta's Kattrumpan a bastion, Finland's Hangon
uimaranta an Orthodox church.

---

## 3. Per country, where it matters

Counts are rows in the snapshot; wrong and missing are the reviewers' findings.

| iso | beaches | mountains | wrong | missing | the one thing to know |
|---|---|---|---|---|---|
| GB | 13 | 223 | 15 | 20 | 3 of the 13 "beaches" are London lidos. No Scottish and no English east-coast beach exists. `top_mountain` is Glastonbury Tor, 158 m, above Ben Nevis. Snowdon absent. |
| IE | 23 | 60 | 15 | 15 | Three tier-1 slots go to one Kerry massif (Purple Mountain NE Top, Tomies, Shehy all resolve to one article). Carrauntoohil, Croagh Patrick, Lugnaquilla absent. |
| IS | 0 | 61 | 7 | 13 | Zero beaches loses Reynisfjara and Diamond Beach. Four of the top ten mountains are a peninsula, a massif, a valley and a geothermal power station. Two Reykjavik streets sit at tier 2. |
| FO | 0 | 75 | 5 | 8 | Ranks 1 and 2 exactly right, then the order collapses: a 284 m hill occupies ranks 9 and 10 twice while the 841 m Villingadalsfjall is absent. 60 rows share one score. |
| FR | 228 | 163 | 48 | 12 | **Mont Blanc is not in the file.** Nine of twelve tier-1 mountains are Chaine des Puys cones. Tier-1 beaches contain no famous French beach; Palombaggia is rank 49, Dune du Pilat 213. |
| MC | 3 | 3 | 6 | 3 | 100% wrong. All six rows are in France, five with a French commune in their own `near.city`. Correct answer: 1 beach (Larvotto), 0 mountains. |
| AD | 0 | 18 | 3 | 2 | Almost no junk, but the harvest never reached Arinsal or La Massana, so the whole Comapedrosa massif including the national high point is a hole. 0 beaches is correct. |
| LU | 1 | 18 | 17 | 10 | Inverted: 1 beach against ~13 official bathing sites, and 18 mountains in a country topping out at 560 m, 17 with no article, no image and no elevation. One is named "365.5". |
| ES | 315 | 279 | 38 | 18 | Teide is not in the dataset at any tier. Nor Mulhacen, Aneto, Montserrat, Roque Nublo, Penalara, Almanzor. 7 of 12 tier-1 mountains unusable, including a football stadium. Picu Urriellu is rank 279 of 279 while its own photo illustrates the rank-3 card. |
| PT | 192 | 155 | 34 | 17 | `top_mountain` rank 9 "Estrela" is linked to Serra da Estrela **cheese** and illustrated with one. Monte Aloia at tier 1 is in Spain. Peneda-Geres, the only national park, returns zero rows. |
| IT | 483 | 327 | 20 | 19 | 4 of 12 tier-1 mountains are islands, one of them the same island twice. Isola Bella, a one-hectare islet, is Italy's 8th mountain. Marmolada, Gran Paradiso, Tre Cime, Mont Blanc absent; Vesuvius rank 264 of 327. |
| MT | 16 | 3 | 8 | 7 | 7 of 16 rows are two beaches. Gozo essentially unharvested. 3 of 6 tier-1 beaches ship with no image, including the Blue Lagoon. |
| SM | 0 | 5 | 2 | 2 | The cleanest file reviewed. Only defect is that two of five mountains are sub-summits of the first, and both render as photographs of castles. |
| GR | 225 | 80 | 22 | 13 | `top_mountain` is the Pnyx, a rock-cut assembly terrace in Athens. Eleven of twelve tier-1 mountains are not mountains. Olympus is tier 2 rank 28. Six Crete beach rows are snapped onto the Chania town centroid, which is why Balos does not exist at its true position. |
| CY | 53 | 3 | 18 | 7 | The whole mountain layer is 3 rows, all wrong. Chionistra absent. 5 of 12 tier-1 beaches are on 2.5 km of Ayia Napa coast, two of them the same beach. |
| HR | 142 | 145 | 12 | 10 | `top_mountain` is the 1097 Battle of Gvozd Mountain, location disputed. `top_beach` is Lokrum, an island with no beach. Dinara, Ucka, Risnjak, Medvednica, Zlatni Rat all absent. |
| SI | 18 | 82 | 15 | 15 | **No Triglav at any tier.** Eight of twelve tier-1 mountains are in one valley. |
| ME | 4 | 101 | 8 | 13 | 4 beaches for 293 km of Adriatic coast, none with a water class. Prokletije, Komovi, Orjen, Bjelasica and Sinjajevina all absent. `top_mountain` Bobotov Kuk is one of the few clearly right cards. |
| BA | 0 | 64 | 5 | 12 | `top_mountain` Crnogorski Maglic is the Montenegrin summit; the Bosnian Maglic, the actual high point, sits 500 m away at tier 2 rank 29. |
| AL | 38 | 68 | 34 | 10 | Four beaches are on Corfu, in Greece, one at tier 1. The Ksamil strand is shattered into nine concession rows. `top_beach` is 3.1 km inland. Korab absent. |
| MK | 0 | 33 | 5 | 10 | `top_mountain` is a battlefield memorial. Golem Korab, Titov Vrv, Solunska Glava all absent. Zero beaches is a gap, not a fact: Lake Ohrid yields nothing while the same pipeline counts lake baths in AT, DE and CH. |
| RS | 0 | 54 | 10 | 8 | A 134 m Belgrade city district is rank 4 and an 1809 battlefield rank 5. Kopaonik's summit occupies four slots under three spellings. Ada Ciganlija absent. |
| XK | 0 | 18 | 5 | 5 | Every row is within 9 km of one of five anchors, and Gjeravica, the country's highest, is absent. The clearest evidence in the whole review that the radius is the root cause. |
| NO | 1 | 116 | 4 | 19 | One beach in the entire country, and it is an 1890s Oslo bathing establishment which is also the country card. Lofoten, Jaeren, Refviksanden, Sjosanden absent. |
| SE | 32 | 28 | 14 | 18 | Tier-1 beaches include a 1677 naval siege and a Stockholm housing cooperative. Eleven of 32 beaches are one strand at Ystad. |
| FI | 34 | 18 | 11 | 12 | Twelve municipal uimarannat in tier 1, eleven sharing one score, and Helsinki does not appear. Ukko-Koli, the national landscape, is demoted below Paha-Koli and Akka-Koli. |
| DK | 49 | 33 | 18 | 18 | Three tier-1 rows are the same Humlebaek beach at one coordinate. Six of twelve tier-1 mountains are unnamed knolls behind Mons Klint, all on 0.789. `top_beach` Bellevue resolves to Aarhus, not Klampenborg. |
| DE | 35 | 125 | 22 | 18 | Tier-1 mountains: a Rhine cliff, a Dutch hill, a Heidelberg wood, a Stuttgart war-rubble mound and an Aachen park before the first Alpine summit at rank 6. 7 of 12 tier-1 beaches are inland lake baths and one is in Austria. |
| AT | 17 | 162 | 17 | 11 | `top_mountain` is the Grazer Schlossberg, a 123 m landscaped rock with a funicular. No 3000 m peak in the top 30. Six Salzburg city hills carry a false `national_park` designation. |
| CH | 15 | 203 | 15 | 16 | Tier 1 spends slots on "View to Aletschgletscher", a lift station and a Jungfrau satellite while Dufourspitze, Piz Bernina, Saentis and Rigi are absent. 2 of 6 tier-1 beaches are German and Italian. |
| LI | 0 | 11 | 3 | 5 | Tier-1 rank 3 Gauschla is Swiss; the country's own high point is not in the file. |
| PL | 25 | 101 | 28 | 16 | `top_beach` is a holiday-let advert with a booking URL in the name. Six Swinoujscie rows are one beach. Sopot, Miedzyzdroje, Mielno, Krynica Morska absent. |
| CZ | 0 | 79 | 15 | 10 | **Snezka is not in the Czech file**, while the identical feature sits at Polish tier 1 rank 5. `top_mountain` is Petrin, a 327 m Prague park. |
| SK | 0 | 119 | 11 | 10 | Trzy Korony, a Polish mountain, appears twice in Slovak tier 1 and is absent from Poland's file. Lomnicky stit, Dumbier, Chopok absent. |
| HU | 23 | 58 | 24 | 15 | **Kekes, the country's high point, is not in the file.** `top_mountain` is Gellert Hill, a 235 m Budapest park. Eight Balatonfured rows are one strip; Siofok is absent. |
| RO | 16 | 73 | 11 | 12 | Two Bulgarian points are filed under Romania, one named after Cape Kaliakra. Moldoveanu, Omu, Piatra Craiului, Mamaia all absent. |
| BG | 52 | 67 | 16 | 19 | Sozopol supplies 11 of 12 tier-1 beaches, Bansko 6 of 12 tier-1 mountains. Musala, the highest peak in the Balkans, is absent. Tier 1 is not monotone in rank. |
| MD | 0 | 3 | 3 | 2 | 3 rows total. `top_mountain` is promoted out of tier 2 at score 0.40. `top_beach` correctly returns null. |
| LT | 24 | 18 | 12 | 12 | Palanga supplies 7 of 9 tier-1 beaches. `top_mountain` Parnidis dune is one of two picks in the whole group that survive review. |
| LV | 32 | 4 | 13 | 11 | Tier-1 rank 1 and the country card is a listed house. Gaizinkalns, the national high point, is absent. A guest house is the 8th best beach because B precedes P. |
| EE | 16 | 5 | 10 | 9 | 4 of 6 tier-1 beaches are inland lakes, ponds and a city river beach. Parnu Beach is tier 2 rank 8 because its water class is Sufficient and a Viljandi lake is Excellent. |
| NL | 39 | 17 | 33 | 22 | **No North Sea resort beach in tier 1.** Scheveningen, Zandvoort, Texel all absent while 8 of 12 tier-1 slots are inland lake spots. Domburg ships under 7 names. Three mountain rows are Dutch heritage-register sentences; one is 143 characters long. |
| BE | 13 | 17 | 16 | 22 | Opposite failure: beaches fail on recall (3 of 15 coastal resorts), mountains fail on precision (4 coal spoil heaps, a war memorial, a Brussels garden). Cheapest fix in the review: swap ranks 1 and 2 so Signal de Botrange, the country's high point, displaces a lieu-dit. |

---

## 4. What the pipeline should change

### 4.1 Filters

Ship `data/curation/features_filter_rules.json`. 38 rules in the ten classes
the reviewers used, each with its test, the rows it removes counted against the
snapshot, and the good entries it would wrongly remove. Notes on reading it:

- **Rank is wrong-entries-removed per good-entry-lost.** Rules that lose
  nothing rank above rules that lose something.
- **Action matters more than the pattern.** 20 of the 38 are not deletes:
  merge, reassign, renormalise, quarantine the image, cap the tier, flag for
  the type test. Shipping `town.geocoder_breadcrumb` as a delete would remove
  Elafonisi, Chora Beach, Makarska, Camogli and Los Escullos. Shipping
  `view.self_anchor` as a delete would remove Puy de Dome, Mont Ventoux,
  Preikestolen and Voidokilia.
- **Name patterns alone reach 300 of the 648 wrong entries.** The other 348
  need OSM tags (27 hospitality rows whose names are clean), Wikidata P31 (61
  island, viewpoint and park rows plus most of "other"), elevation (91
  not_notable rows) or a second dedupe pass over script pairs (65).
- **Language scoping is not optional.** `lido` means a pool in GB and a shore
  in IT and FR. `maja` means a house in Latvian and a peak in Albanian.
  `plaza` is a beach everywhere but Spain. `marina`, `villa`, `club` and `bar`
  are deliberately absent from the hospitality name test because Marina Piccola
  on Capri, Spiaggia di Villa Romana, Agia Marina and the Montenegrin town of
  Bar are real. Those four need the tag test, never the name test.

### 4.2 Seeds

Ship `data/curation/top_picks_seed.json`. 434 entries in 43 countries, 168
beaches and 266 mountains, every one marked verified by its reviewer, carrying
a coordinate and a source URL, and re-tested against the country boundary
before inclusion. 422 carry a Wikidata QID; the 12 that do not are Hungarian
and Polish bathing beaches with no Wikidata item, and they carry coordinates.

Three contract points:

1. **Seed before the harvest, by QID**, so a famous feature does not depend on
   a POI having been collected near a priced city.
2. **The ranker may reorder a seed but may not drop it.** Add the assertion to
   `validate_features.py` and fail the build: for every country, every seed of
   a kind must be present in that country's tier 1 for that kind.
3. **Seeds bypass the filters.** A curated entry outranks a pattern. Three
   seed entries would otherwise be caught by their own class rules: Ilha da
   Barreta (PT), Castle Hill / Gediminas Hill (LT) and Serra do Marao (PT).

Extend the seed automatically as well as by hand: pull each country's `P610`
highest point, every peak with 8 or more Wikipedia sitelinks and every beach
with an article in 3 or more languages, and fail the build if a seeded item is
absent from the candidate pool entirely. That is the only gate that catches an
omission, and omission was the dominant failure in 7 of the 11 review groups.

### 4.3 Ranking

In `pipeline/features/rank_features.py`:

1. **Backfill `elevation_m` and `prominence_m`** from Wikidata `P2044` and
   `P2660` and from OSM `ele`. Until this lands, 30% of the mountain score is
   a constant and no elevation floor can be applied anywhere.
2. **Replace the tie-break.** Line 550, `key=lambda f: (-f["score"], f["id"])`.
   Use `(-score, -sitelinks, -elevation, -pageviews, id)`.
3. **Demote constant score bands.** Any score value shared by 8 or more rows in
   one country and kind goes below every row with a distinct score, and never
   fills a tier-1 seat.
4. **Fix the designation join.** Point-in-polygon, not `UNESCO_KM = 10.0`
   against a centroid and not `PROTECTED_KM = 5.0`. Apply the designation
   bonus to the inscribed property once, not to each component feature. Cap the
   total designation contribution.
5. **Demote `water` from a ranking term to a gate plus an annotation.** Exclude
   Poor, print the class, stop paying 0.20 for a rating 92% of beaches share.
6. **Add a landform type gate before scoring**, on Wikidata `P31` resolved
   transitively through `P279`, with the island reading winning over the
   mountain reading for volcanic islands.
7. **Add a spread constraint**: at most 2 tier-1 rows per 10 km cluster and per
   anchor destination, and require every coastal NUTS2 and inhabited island
   group with harvested features to be represented before a cluster gets a
   third seat.
8. **Make `TIER1_CAP` a function of country size**, with a per-region quota.
9. **Tighten the witness rule**: a bathing-water class is not a witness.
10. **Never promote a tier-2 row to `top_beach` or `top_mountain`**, and return
    null when the best available row is below a score floor.

### 4.4 Country assignment and geometry

Add `country_at()` as a hard gate in `build_features.py`, using a real
admin_level=2 polygon. Reassign, do not delete. For a border feature, choose
one country deterministically and suppress the row in the other file. Flag any
row within 5 km of a border for manual review, and any coordinate rounded to
two decimal places, which is a centroid tell.

---

## 5. Method and limits

- Every rule count in `features_filter_rules.json` is a real count over the
  5,472-row snapshot, produced by running the rule. Nothing is estimated.
- Every rule was run against a regression corpus of the 434 seed entries plus
  46 endorsed top picks, and tightened until it stopped hitting it. The first
  draft of `area.extent_string` deleted 40 real Portuguese beaches because the
  Portuguese article "do" matched its separator list; the first draft of
  `hosp.possessive_brand` deleted Arthur's Seat and Pancic's Peak; the first
  draft of `view.urban_hill` deleted Puy de Dome, Mont Ventoux and Kjerag.
  Those drafts are not in the file.
- Collateral was read row by row for every rule with fewer than 120 hits. For
  the four high-volume rules the tier-1 collateral was read in full and the
  tier-2 tail sampled; this is stated per rule.
- Point-in-polygon uses NUTS3 2021 where it covers the country and Natural
  Earth 50m elsewhere, with a 2 km depth threshold so coastline generalisation
  cannot produce a false positive. Andorra, Monaco, San Marino, Kosovo, Bosnia,
  Moldova and the Faroes fall back to the coarser layer, so their border cases
  carry more uncertainty than the rest.
- 92 of the 526 missing entries are marked `verified:false` by their reviewers
  and are deliberately **not** in the seed. They are recorded in the per-country
  review files and should be confirmed before use.
