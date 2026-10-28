# Persona check, rating v5, gate 7 (T765)

Gate 7 asks whether the "For you" top 10 makes sense for real kinds of travellers. 12 personas x 10 places = 120 rows; the gate passes when 80% or more (96 rows) are judged sensible.

- Ranking under test: lambda 2, conflict factors busy 0.8, car 0.75, heat 0.85 (config/rating.json `match`).
- Input: `wt/persona_top10.lambda2.json`.
- Date: 2026-10-28. Run unattended; borderline rows were called conservatively and the reason is written in the row.
- Method: every one of the 58 distinct places was judged against a page opened with WebFetch (Wikivoyage first; Wikipedia en where Wikivoyage had no page or a disambiguation page). One page per place, reused across personas; a second page was opened only where the first was silent on the persona's main wish (Bled, Altaussee, Lednice-Valtice, St. Moritz, Kitzbuhel). No search snippets were used as sources.
- "Sensible" = a traveller of that kind told "Carta picked this for you" would agree it meets at least their main wishes and nothing on the page makes it clearly wrong for them in that month.

## Rerun after T786 (food rule) and T787 (2026-10-28)

What changed in the data: a like nothing measures now ships null and is left out of the match instead of counting as 0 (T786). On the owner's call that food data should count, food follows the app's own food rule: a food, wine or beer tag, or a metro or city with fame 1,200 or more. So Rome, Salzburg, Venice, Barcelona, Amsterdam and Bath read food 0.9 again, while Bruges, Split, Dubrovnik and towns without a tag stay not measured. The monthly crowd series is back, so quiet travellers see busy months; the heat conflict exists for travellers who explicitly avoid heat (no persona does, so it fires on no row). Ranking knobs unchanged (lambda 2, busy 0.8, car 0.75, heat 0.85). Input: `persona_top10.t786b.json` (printed by `scripts/persona_check_v5.mjs`).

Method: the first run's, unchanged. A (persona, place) pair already judged, in the first run or in the T786 round before the food rule, keeps its verdict and source unless the new row shows a match or conflict that changes the call. Places new to a persona got a fresh call; pages opened across both rounds: WV/Amsterdam, WV/Kotor, WV/Nesebar, WV/Ohrid (food and culture), WV/Venice (Eat and Drink sections), WV/Dubrovnik (Drink section and prices), WV/Bern (getting around, sights), WV/Bath (Eat, culture). Borderline rows are called conservatively with the reason in the row.

**85 of 120 sensible (70.8%). FAIL** (needs 96). First run: 87 of 120 (72.5%). The T786 round before the food rule also scored 85.

| Persona | Month | Sensible now | Before |
|---|---|---|---|
| Family with a toddler | 7 | 5 / 10 | 5 / 10 |
| Hiking couple | 9 | 8 / 10 | 8 / 10 |
| Friends going out | 6 | 6 / 10 | 6 / 10 |
| Slow culture | 10 | 8 / 10 | 9 / 10 |
| Backpacker (no car) | 8 | 4 / 10 | 5 / 10 |
| Beach family | 7 | 8 / 10 | 8 / 10 |
| Cyclist | 5 | 7 / 10 | 7 / 10 |
| Foodie | 4 | 8 / 10 | 8 / 10 |
| Skier | 2 | 8 / 10 | 8 / 10 |
| Wellness | 11 | 4 / 10 | 4 / 10 |
| Island hopper | 6 | 9 / 10 | 9 / 10 |
| No-car rail | 5 | 10 / 10 | 10 / 10 |
| **Total** | | **85 / 120** | **87 / 120** |

Seven of the twelve lists are the same ten places in the same order with the same match values as the first run (toddler family, hiking couple, beach family, cyclist, skier, wellness, island hopper); no-car rail differs by one row. Their verdicts are carried over unchanged.

### What moved

Against the first run:

- **Friends going out (6 to 6).** Out: Barcelona (yes), San Sebastian (yes), Siena (no). In: Venice (no, very few clubs, bars close about 01:00), Amsterdam (yes), Dubrovnik (yes). Cause, data fix: with food null on the places the food rule does not cover, the match runs on nightlife and city size, so Bruges (68 to 90), Salzburg (67 to 90) and Bern (91) ride their nightlife 95 to 98 values; Barcelona and San Sebastian no longer clear them on score.
- **Slow culture (9 to 8).** Out: Lednice-Valtice, Bayonne, Vevey, Porto (all yes), Malcesine (no). In: Ohrid, Kotor, Venice (yes), Nesebar (no, Old Town food described as touristy and "not very good quality"), Rome (no, a capital at town 30 flagged busy in October for a quiet town traveller). Cause, data fix plus food rule: dropping food 0 lifted Dubrovnik (58 to 87) and other culture cities, and food 0.9 under the rule lifted Rome from outside the list to rank 8 at match 52.
- **Backpacker (5 to 4).** Out: Prague (yes). In: Dubrovnik (no, "much more expensive and tourism-centered than other places in Croatia", hot and crowded in August). Cause, data fix: Dubrovnik rises on score 9.6 at match 41.
- **Foodie (8 to 8).** Out: Barcelona, Siena, Carcassonne (all yes). In: Venice (yes), Split (yes), Bath (yes). Bern and Bergen stay no. Cause, data fix: Bruges, Split, Dubrovnik and Bergen carry no food value, so their foodie match is culture 91 plus city size and score decides; the places that were in for their food fell below them.
- **No-car rail (10 to 10).** Out: Prague. In: Bern (yes, SBB hub, UNESCO old town). No verdict change.
- **Crowd series.** It changed no verdict on its own. Busy shows on Rome for the November wellness traveller and on Rome in the October slow culture list; Dubrovnik, Venice and Cesky Krumlov carry no busy flag in October, which matches the pages (crowds are a summer issue).

Against the T786 round before the food rule (85, same total):

- **Slow culture (9 to 8).** Split (yes) left, Rome (no) came in at rank 8 on food 0.9.
- **Foodie (7 to 8).** Ohrid (no) left, Bath (yes, food 0.9 under the rule) came in at rank 10.
- Friends going out: same ten, Rome 95 to 94, Venice 82 to 84, Amsterdam 99 to 97, Dubrovnik and Amsterdam swap ranks 9 and 10; no verdict change. Foodie: Venice and Dubrovnik swap ranks 6 and 7. Every other list is unchanged.

### 1. Family with a toddler (July; beach, lakes; town; quiet), 5 / 10, unchanged

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Bruges | 9.7 | 52 | no | no beach or lake in town (coast 15 km), "visited by a huge number of tourists" | WV/Bruges |
| 2 | Lake District | 9.0 | 81 | yes | 16 lakes, family cycle routes, boat trips, steam railways | WV/Lake_District_National_Park |
| 3 | Rome (Fiumicino) | 10 | 29 | no | big hot city in July, beach only at Ostia, no lake on the page | WV/Rome |
| 4 | Porto | 9.5 | 54 | no | a city; beach is 30 min by metro (Matosinhos), crowded sights, no lake | WV/Porto |
| 5 | Keswick | 8.9 | 81 | yes | Derwentwater at the edge of town, playgrounds and leisure pool | WV/Keswick |
| 6 | Dubrovnik | 9.6 | 39 | no | summer hot and crowded plus Summer Festival, no lake, quiet traveller | WV/Dubrovnik |
| 7 | Corfu | 9.3 | 52 | yes | sandy west coast beaches, Korission lagoon, "welcoming and safe for children" | WV/Corfu |
| 8 | Lake Como | 9.7 | 32 | yes | "full of lidos and beaches" on the lake, villages, ferries | WV/Lake_Como |
| 9 | Hondarribia | 9.1 | 62 | yes | town beach plus Ondarraitz across the bay, buses and ferry | WV/Hondarribia |
| 10 | Sintra | 9.2 | 56 | no | "extremely busy, particularly in summer", beach 13 km away, castle walls without railings | WV/Sintra |

### 2. Hiking couple (September; hiking, lakes; village; quiet), 8 / 10, unchanged

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Lake District | 9.0 | 98 | yes | over 200 fells, 16 lakes and 53 tarns | WV/Lake_District_National_Park |
| 2 | Lake Como | 9.7 | 63 | yes | many paths with lake views and mountain huts, lake villages | WV/Lake_Como |
| 3 | Puy de Dome | 9.2 | 87 | yes | volcano with two summit paths on the GR 4 (lakes not on the page) | WP/Puy_de_D%C3%B4me |
| 4 | Cesky Krumlov | 9.3 | 80 | yes | Kle and Sumava trails nearby, Lipno lake 32 km | WV/%C4%8Cesk%C3%BD_Krumlov |
| 5 | Hallstatt | 9.6 | 64 | yes | lakeside village with many trails behind it (busy with day-trippers, stay overnight) | WV/Hallstatt |
| 6 | Rome (Fiumicino) | 10 | 41 | no | a capital city, no hiking or lake on the page, wrong size for a village couple | WV/Rome |
| 7 | Keswick | 8.9 | 93 | yes | fells such as Catbells start from town, on Derwentwater | WV/Keswick |
| 8 | Salzburg | 9.6 | 56 | no | a city of festivals; lakes only as a bus trip to Fuschlsee, not a village | WV/Salzburg |
| 9 | Moustiers-Sainte-Marie | 9.4 | 66 | yes | 683-person village at the western entrance of the Gorges du Verdon | WP/Moustiers-Sainte-Marie |
| 10 | Orta San Giulio | 9.4 | 63 | yes | lake village, "fairly small-scale tourism", Sacro Monte path | WP/Orta_San_Giulio |

### 3. Friends going out (June; nightlife, city, food; city; lively), 6 / 10, before 6

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Rome (Fiumicino) | 10 | 94 | yes | San Lorenzo "vibrant nightlife", dining across Old Rome (match up from 71, same call) | WV/Rome |
| 2 | Bruges | 9.7 | 90 | no | small museum city; going out means two beer pubs, not a night scene (match up from 68 on nightlife 97, page unchanged) | WV/Bruges |
| 3 | Salzburg | 9.6 | 90 | no | a few late bars and a student pub; a culture city, not a night out (match up from 67, page unchanged) | WV/Salzburg |
| 4 | Porto | 9.5 | 85 | yes | "some of the finest restaurants in Portugal", bars, clubs, fado | WV/Porto |
| 5 | Bergen | 9.5 | 85 | yes | Norway's second city with a "thriving underground/indie music scene" | WV/Bergen |
| 6 | Split | 9.4 | 88 | yes | clubs on Bacvice beach, cocktail bars, Diocletian's Palace | WV/Split |
| 7 | Venice (Marco Polo) | 9.4 | 84 | no | new: "very few nightclubs" (go to Mestre or Lido), most bars close around 01:00 | WV/Venice |
| 8 | Bern | 9.2 | 91 | no | nightlife "not exactly what you might call spectacular", kitchens close 21:45 | WV/Bern |
| 9 | Dubrovnik | 9.6 | 68 | yes | new: Culture Club Revelin "Dubrovnik's liveliest night spot", Banje beach club, live music bars (a town, not a city; borderline, called yes on the page's night list) | WV/Dubrovnik |
| 10 | Amsterdam | 9.0 | 97 | yes | new: nightlife "famously wild", Leidseplein and Rembrandtplein, "vibrant tapestry" of food | WV/Amsterdam |

### 4. Slow culture (October; culture, food; town; quiet), 8 / 10, before 9

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Dubrovnik | 9.6 | 87 | yes | City Walls and Rector's Palace; top restaurants close only Nov to Mar (match up from 58, same call) | WV/Dubrovnik |
| 2 | Salzburg | 9.6 | 83 | yes | Mozart's birthplace, cathedral, Residenzgalerie, Salzburger Nockerl | WV/Salzburg |
| 3 | Bergen | 9.5 | 88 | yes | Bryggen UNESCO wharf and Philharmonic (rainy city, food average) | WV/Bergen |
| 4 | Cesky Krumlov | 9.3 | 95 | yes | UNESCO town, Baroque castle theatre; crowds are a summer issue | WV/%C4%8Cesk%C3%BD_Krumlov |
| 5 | Ohrid | 9.4 | 87 | yes | new for this persona: UNESCO since 1980, "one of the oldest human settlements in all of Europe", burek and fish soup; beaches "quiet the rest of the year" after summer | WV/Ohrid |
| 6 | Carcassonne | 9.2 | 94 | yes | UNESCO Cite with 52 towers, cassoulet; crowds are a summer issue | WV/Carcassonne |
| 7 | Venice (Marco Polo) | 9.4 | 83 | yes | new for this persona: early autumn named a best time (balance of weather and crowds), churches, opera at La Fenice, cicchetti in bacari | WV/Venice |
| 8 | Rome (Fiumicino) | 10 | 52 | no | new for this persona: culture and dining across Old Rome are plain on the page, but a capital at town 30 flagged busy in October is the wrong size and pace for a quiet town traveller; called no conservatively | WV/Rome |
| 9 | Kotor | 9.3 | 85 | yes | new: UNESCO walled Old Town, St. Tryphon's Cathedral, Maritime Museum, seafood; cruise crowds named for high season, low season "cheap and plentiful" (October cruise calls possible, still called yes) | WV/Kotor |
| 10 | Nesebar | 9.1 | 95 | no | new: UNESCO Old Town full of churches, but Old Town restaurants use touts and are "not very good quality", outline page silent on October in a beach resort; food wish not met, called no conservatively | WV/Nesebar |

### 5. Backpacker (August; city, nightlife, hidden; city; no car; backpacker budget), 4 / 10, before 5

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Rome (Fiumicino) | 10 | 68 | yes | city with San Lorenzo nightlife and good transit (not hidden, August closures) | WV/Rome |
| 2 | Bruges | 9.7 | 64 | no | small, tourist-heavy, no night scene, not hidden | WV/Bruges |
| 3 | Salzburg | 9.6 | 63 | no | Salzburg Festival in August, quiet nightlife, nothing hidden about it | WV/Salzburg |
| 4 | Bergen | 9.5 | 61 | no | one of Europe's busiest cruise ports in August, Norway prices for a backpacker | WV/Bergen |
| 5 | Porto | 9.5 | 59 | yes | metro city, cheap set lunches, bars and clubs | WV/Porto |
| 6 | Split | 9.4 | 62 | yes | clubs, buses and ferries to the islands, walkable centre | WV/Split |
| 7 | Venice (Marco Polo) | 9.4 | 59 | no | August is its most crowded month; the opposite of hidden | WV/Venice |
| 8 | Bern | 9.2 | 64 | no | nightlife "not exactly spectacular", pricey | WV/Bern |
| 9 | Dubrovnik | 9.6 | 41 | no | new for this persona: "much more expensive and tourism-centered than other places in Croatia", walls "hot and crowded" in midsummer; not hidden, not a budget pick | WV/Dubrovnik |
| 10 | Bath | 9.2 | 61 | yes | pubs, nightclubs and live music, direct trains | WV/Bath |

### 6. Beach family (July; beach, islands; town), 8 / 10, unchanged

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Malta | 9.3 | 85 | yes | Mellieha's large sandy beaches, Gozo and Comino by boat | WV/Malta |
| 2 | Corfu | 9.3 | 84 | yes | sandy beaches, safe for children | WV/Corfu |
| 3 | Dubrovnik | 9.6 | 58 | yes | sandy car-free Lapad beach, Lokrum 10 min by boat | WV/Dubrovnik |
| 4 | Santorini | 9.0 | 85 | yes | Kamari side suits families with larger rooms and pools (caldera side does not) | WV/Santorini |
| 5 | Menorca | 9.0 | 84 | yes | quieter than Mallorca, Cala en Porter and Son Bou singled out for kids | WV/Menorca |
| 6 | Bruges | 9.7 | 46 | no | inland city, no beach and no island | WV/Bruges |
| 7 | Taormina | 9.6 | 48 | no | hill town 200 m up, shingle beach by cable car, July "very hot and busy" | WV/Taormina |
| 8 | Portovenere | 9.5 | 51 | yes | beaches plus Palmaria island across a narrow strait | WP/Porto_Venere |
| 9 | Ibiza | 8.8 | 86 | yes | Santa Eularia "more ideal for families", long beaches | WV/Ibiza |
| 10 | Milos | 8.8 | 86 | yes | Sarakiniko, Paliochori beaches with tavernas | WV/Milos |

### 7. Cyclist (May; cycling; village), 7 / 10, unchanged

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Hallstatt | 9.6 | 92 | yes | Salzkammergut has "many trails for all levels of biker" (Hallstatt page itself silent) | WV/Hallstatt, WV/Salzkammergut |
| 2 | Bruges | 9.7 | 67 | yes | cycling popular, Damme 5 km and the coast by bike | WV/Bruges |
| 3 | Salzburg | 9.6 | 67 | yes | "over 100 km of bike paths", river routes to Hallein | WV/Salzburg |
| 4 | Lake Bled | 9.1 | 92 | yes | bikes rented at many agencies (no bike lanes, no off-road) | WV/Lake_Bled |
| 5 | Lednice-Valtice | 9.1 | 92 | yes | "numerous marked biking trails", rentals in Lednice | WV/Valtice |
| 6 | Santillana del Mar | 9.0 | 95 | no | "very touristy" village; no cycling on the page | WV/Santillana_del_Mar |
| 7 | Saint-Paul-de-Vence | 9.0 | 95 | no | an art village; no cycling on the page | WP/Saint-Paul-de-Vence |
| 8 | Pont du Gard | 9.0 | 95 | no | a Roman aqueduct (1.4M visitors), not a village base; no cycling on the page | WP/Pont_du_Gard |
| 9 | Lake Bohinj | 9.0 | 92 | yes | guided and self-guided cycling tours, e-bike rental | WV/Bohinj |
| 10 | Altaussee | 9.0 | 92 | yes | lake village in the Salzkammergut biking trails | WP/Altaussee, WV/Salzkammergut |

### 8. Foodie (April; food, culture, city; city), 8 / 10, before 8

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Rome (Fiumicino) | 10 | 94 | yes | laid-back dining across Old Rome, Via Veneto (match up from 68, same call) | WV/Rome |
| 2 | Bruges | 9.7 | 87 | yes | chocolate shops and celebrated beer pubs, museums | WV/Bruges |
| 3 | Salzburg | 9.6 | 88 | yes | Nockerl, Mozartkugeln, Cafe Sacher, strong culture | WV/Salzburg |
| 4 | Porto | 9.5 | 89 | yes | francesinha, bacalhau, "finest restaurants in Portugal" | WV/Porto |
| 5 | Bergen | 9.5 | 87 | no | fish market "touristy" with "OK quality"; a weak food pick | WV/Bergen |
| 6 | Venice (Marco Polo) | 9.4 | 88 | yes | new for this persona: cicchetti in bacari, sepe al nero; page warns of "mediocre eateries" with touts but names the good ones; culture strong | WV/Venice |
| 7 | Dubrovnik | 9.6 | 77 | yes | fresh seafood and Dalmatian dishes, walled old town | WV/Dubrovnik |
| 8 | Split | 9.4 | 87 | yes | new for this persona: pasticada, risotto, Obrov fish market, Diocletian's Palace | WV/Split |
| 9 | Bern | 9.2 | 88 | no | food described as pricey Swiss fare, kitchens close 21:45 | WV/Bern |
| 10 | Bath | 9.2 | 88 | yes | new for this persona: "an excellent choice of eateries for any budget and taste", Sally Lunn bun, Walcot Street weekend markets; double UNESCO, Roman Baths | WV/Bath |

### 9. Skier (February; ski; village), 8 / 10, unchanged

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Lauterbrunnen | 9.3 | 100 | yes | ski by riding up to Murren or Wengen, train from Interlaken | WV/Lauterbrunnen |
| 2 | Zermatt | 9.3 | 100 | yes | 200 km of winter pistes, car-free village | WV/Zermatt |
| 3 | Neuschwanstein | 9.3 | 99 | no | a castle; Tegelberg is a cable car hill, not a ski village | WV/Neuschwanstein_Castle |
| 4 | Grindelwald | 9.2 | 100 | yes | season mid Dec to mid Apr, 155 km | WV/Grindelwald |
| 5 | Sixt-Fer-a-Cheval | 9.2 | 100 | yes | part of the 265 km Grand Massif | WP/Sixt-Fer-%C3%A0-Cheval |
| 6 | Zell am See | 9.2 | 100 | yes | Schmittenhohe and Kitzsteinhorn by ski bus | WV/Zell_am_See |
| 7 | Berchtesgaden | 9.2 | 97 | yes | Jenner, Rossfeld, Gotschen slopes (smaller area) | WV/Berchtesgaden |
| 8 | Ortisei (Val Gardena) | 9.1 | 100 | yes | 175 km, Dolomiti Superski and Sella Ronda | WV/Ortisei |
| 9 | Dolomites (Cortina) | 9.1 | 100 | yes | three ski areas, about 120 km | WV/Cortina_d%27Ampezzo |
| 10 | Lake Bled | 9.1 | 97 | no | no ski area on either page; "winter is quieter" | WV/Lake_Bled, WV/Bled |

### 10. Wellness (November; wellness, lakes; quiet), 4 / 10, unchanged

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Lake Como | 9.7 | 91 | yes | the lake itself and lakeside villas, quiet out of season (no spa on the page) | WV/Lake_Como |
| 2 | Altaussee | 9.0 | 99 | yes | designated climatic spa town on its lake | WP/Altaussee |
| 3 | Corfu | 9.3 | 84 | no | most rain falls Nov to Mar; no spa, lake is a coastal lagoon | WV/Corfu |
| 4 | Hallstatt | 9.6 | 60 | yes | lakeside village, quieter in winter (no spa on the page) | WV/Hallstatt |
| 5 | Rome (Fiumicino) | 10 | 36 | no | a capital city; no spa and no lake on the page (now also flagged busy in November) | WV/Rome |
| 6 | Kitzbuhel | 8.9 | 89 | no | a ski town; no spa on either page, Schwarzsee is a summer bathing lake, November is between seasons | WP/Kitzb%C3%BChel |
| 7 | Salzburg | 9.6 | 52 | no | city; no spa on the page, lakes only by bus | WV/Salzburg |
| 8 | Epidaurus | 8.9 | 86 | no | an ancient healing sanctuary; no modern spa and no lake on either page | WP/Epidaurus, WV/Epidaurus |
| 9 | Bruges | 9.7 | 46 | no | city; no spa (one B&B hammam) and no lake | WV/Bruges |
| 10 | St. Moritz | 8.8 | 90 | yes | historic mineral springs and Lake St. Moritz | WP/St._Moritz |

### 11. Island hopper (June; islands, beach; mix), 9 / 10, unchanged

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Malta | 9.3 | 96 | yes | three islands, sandy Mellieha beaches | WV/Malta |
| 2 | Corfu | 9.3 | 95 | yes | Ionian island, sandy west coast | WV/Corfu |
| 3 | Santorini | 9.0 | 96 | yes | June is the shoulder season, black and red beaches | WV/Santorini |
| 4 | Menorca | 9.0 | 96 | yes | Cala Macarella, Cala en Turqueta | WV/Menorca |
| 5 | Ibiza | 8.8 | 97 | yes | many long beaches | WV/Ibiza |
| 6 | Milos | 8.8 | 97 | yes | Sarakiniko, Kleftiko by boat | WV/Milos |
| 7 | Funchal (Madeira) | 8.8 | 96 | yes | island hop to Porto Santo by ferry or 15 min flight (beaches not on page) | WV/Madeira |
| 8 | Gozo | 8.7 | 96 | yes | Ramla il-Hamra "one of Malta's finest beaches" | WV/Gozo |
| 9 | Dubrovnik | 9.6 | 48 | yes | boat trips to Lokrum and the Elaphiti islands | WV/Dubrovnik |
| 10 | Taormina | 9.6 | 45 | no | mainland hill town; Aeolian ferries leave from Milazzo an hour away | WV/Taormina |

### 12. No-car rail (May; city, culture; city; no car), 10 / 10, before 10

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Rome (Fiumicino) | 10 | 95 | yes | buses, metro and trams, contactless tickets | WV/Rome |
| 2 | Bruges | 9.7 | 87 | yes | an hour by train from Brussels, walkable | WV/Bruges |
| 3 | Salzburg | 9.6 | 87 | yes | Mozart, cathedral, bike paths | WV/Salzburg |
| 4 | Porto | 9.5 | 87 | yes | metro, funicular, "you don't need a car" | WV/Porto |
| 5 | Bergen | 9.5 | 87 | yes | Bergen Line from Oslo, May the driest month | WV/Bergen |
| 6 | Dubrovnik | 9.6 | 77 | yes | buses from Split and the airport, pedestrian old town | WV/Dubrovnik |
| 7 | Venice (Marco Polo) | 9.4 | 87 | yes | spring "probably best", no cars at all | WV/Venice |
| 8 | Split | 9.4 | 87 | yes | trains, buses, ferries, Diocletian's Palace | WV/Split |
| 9 | Ohrid | 9.4 | 77 | yes | UNESCO churches, hourly buses from Skopje | WV/Ohrid |
| 10 | Bern | 9.2 | 87 | yes | new for this persona: "at the hub of the SBB network", "excellent public transportation", UNESCO old town, Kunstmuseum, Einsteinhaus | WV/Bern |

### Profile values that still look wrong after T786 (food rule)

- food null on Bruges, Split, Dubrovnik, Bergen and Ohrid: the pages name their food (chocolate and beer, WV/Bruges; pasticada and the Obrov market, WV/Split; seafood, WV/Dubrovnik). The food rule misses them because they carry no food, wine or beer tag and sit below fame 1,200 or are filed as towns; Bruges's beer is the plainest miss.
- food 0.9 now lifts Rome into the October slow culture list at match 52 with a busy flag: the rule is right on food, but it lets a metro outrank quieter towns for a quiet town traveller.
- culture 91 on every culture row in the slow culture, foodie and no-car lists (Rome, Bruges, Bergen, Ohrid, Nesebar alike): one value for all reads as a default, not a measurement.
- city 84 (size 85) on every city of the friends, backpacker, foodie and no-car lists: same default pattern.
- Bruges nightlife 97, Bern 98, Salzburg 95, Venice 80: with food gone these now drive the friends list (Bruges and Salzburg at match 90); pages say otherwise (WV/Bern "not exactly spectacular", WV/Venice "very few nightclubs").
- hidden 0 on all ten backpacker rows: still 0, not null, so T786 did not reach this like.
- islands 0 on Dubrovnik, Portovenere and Taormina; lakes 95 on Rome; wellness 95 on Epidaurus, Corfu, Kitzbuhel and 0 on Hallstatt; ski 96 to 98 on Bled and Neuschwanstein; Pont du Gard and Puy de Dome village 100: all unchanged from the first run's list below.
- Kotor filed as class village with town 60: it is a walled town (WV/Kotor).

## First run (T765)

### Result

**87 of 120 sensible (72.5%). FAIL** (needs 96).

| Persona | Month | Sensible |
|---|---|---|
| Family with a toddler | 7 | 5 / 10 |
| Hiking couple | 9 | 8 / 10 |
| Friends going out | 6 | 6 / 10 |
| Slow culture | 10 | 9 / 10 |
| Backpacker (no car) | 8 | 5 / 10 |
| Beach family | 7 | 8 / 10 |
| Cyclist | 5 | 7 / 10 |
| Foodie | 4 | 8 / 10 |
| Skier | 2 | 8 / 10 |
| Wellness | 11 | 4 / 10 |
| Island hopper | 6 | 9 / 10 |
| No-car rail | 5 | 10 / 10 |
| **Total** | | **87 / 120** |

Sources used (abbreviated below as WV = https://en.wikivoyage.org/wiki/, WP = https://en.wikipedia.org/wiki/).

## 1. Family with a toddler (July; beach, lakes; town; quiet)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Bruges | 9.7 | 52 | no | no beach or lake in town (coast 15 km), "visited by a huge number of tourists" | WV/Bruges |
| 2 | Lake District | 9.0 | 81 | yes | 16 lakes, family cycle routes, boat trips, steam railways | WV/Lake_District_National_Park |
| 3 | Rome (Fiumicino) | 10 | 29 | no | big hot city in July, beach only at Ostia, no lake on the page | WV/Rome |
| 4 | Porto | 9.5 | 54 | no | a city; beach is 30 min by metro (Matosinhos), crowded sights, no lake | WV/Porto |
| 5 | Keswick | 8.9 | 81 | yes | Derwentwater at the edge of town, playgrounds and leisure pool | WV/Keswick |
| 6 | Dubrovnik | 9.6 | 39 | no | summer hot and crowded plus Summer Festival, no lake, quiet traveller | WV/Dubrovnik |
| 7 | Corfu | 9.3 | 52 | yes | sandy west coast beaches, Korission lagoon, "welcoming and safe for children" | WV/Corfu |
| 8 | Lake Como | 9.7 | 32 | yes | "full of lidos and beaches" on the lake, villages, ferries | WV/Lake_Como |
| 9 | Hondarribia | 9.1 | 62 | yes | town beach plus Ondarraitz across the bay, buses and ferry | WV/Hondarribia |
| 10 | Sintra | 9.2 | 56 | no | "extremely busy, particularly in summer", beach 13 km away, castle walls without railings | WV/Sintra |

## 2. Hiking couple (September; hiking, lakes; village; quiet)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Lake District | 9.0 | 98 | yes | over 200 fells, 16 lakes and 53 tarns | WV/Lake_District_National_Park |
| 2 | Lake Como | 9.7 | 63 | yes | many paths with lake views and mountain huts, lake villages | WV/Lake_Como |
| 3 | Puy de Dome | 9.2 | 87 | yes | volcano with two summit paths on the GR 4 (lakes not on the page) | WP/Puy_de_D%C3%B4me |
| 4 | Cesky Krumlov | 9.3 | 80 | yes | Kle and Sumava trails nearby, Lipno lake 32 km | WV/%C4%8Cesk%C3%BD_Krumlov |
| 5 | Hallstatt | 9.6 | 64 | yes | lakeside village with many trails behind it (busy with day-trippers, stay overnight) | WV/Hallstatt |
| 6 | Rome (Fiumicino) | 10 | 41 | no | a capital city, no hiking or lake on the page, wrong size for a village couple | WV/Rome |
| 7 | Keswick | 8.9 | 93 | yes | fells such as Catbells start from town, on Derwentwater | WV/Keswick |
| 8 | Salzburg | 9.6 | 56 | no | a city of festivals; lakes only as a bus trip to Fuschlsee, not a village | WV/Salzburg |
| 9 | Moustiers-Sainte-Marie | 9.4 | 66 | yes | 683-person village at the western entrance of the Gorges du Verdon | WP/Moustiers-Sainte-Marie |
| 10 | Orta San Giulio | 9.4 | 63 | yes | lake village, "fairly small-scale tourism", Sacro Monte path | WP/Orta_San_Giulio |

## 3. Friends going out (June; nightlife, city, food; city; lively)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Rome (Fiumicino) | 10 | 71 | yes | San Lorenzo "vibrant nightlife", dining across Old Rome | WV/Rome |
| 2 | Porto | 9.5 | 85 | yes | "some of the finest restaurants in Portugal", bars, clubs, fado | WV/Porto |
| 3 | Bruges | 9.7 | 68 | no | small museum city; going out means two beer pubs, not a night scene | WV/Bruges |
| 4 | Bern | 9.2 | 91 | no | nightlife "not exactly what you might call spectacular", kitchens close 21:45 | WV/Bern |
| 5 | Salzburg | 9.6 | 67 | no | a few late bars and a student pub; a culture city, not a night out | WV/Salzburg |
| 6 | Barcelona | 9.0 | 97 | yes | lively after dark, Sonar in June, Barceloneta seafood | WV/Barcelona |
| 7 | San Sebastian | 9.1 | 90 | yes | pintxos bars and Bataplan club, city beach | WV/San_Sebasti%C3%A1n |
| 8 | Bergen | 9.5 | 64 | yes | Norway's second city with a "thriving underground/indie music scene" | WV/Bergen |
| 9 | Siena & Val d'Orcia | 9.1 | 82 | no | evenings are the passeggio and a few bars; food yes, nightlife no | WV/Siena |
| 10 | Split | 9.4 | 66 | yes | clubs on Bacvice beach, cocktail bars, Diocletian's Palace | WV/Split |

## 4. Slow culture (October; culture, food; town; quiet)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Carcassonne | 9.2 | 94 | yes | UNESCO Cite with 52 towers, cassoulet; crowds are a summer issue | WV/Carcassonne |
| 2 | Lednice-Valtice | 9.1 | 83 | yes | UNESCO chateaux landscape with many wine cellars and tastings | WP/Lednice%E2%80%93Valtice_Cultural_Landscape |
| 3 | Dubrovnik | 9.6 | 58 | yes | City Walls and Rector's Palace; top restaurants close only Nov to Mar | WV/Dubrovnik |
| 4 | Porto | 9.5 | 59 | yes | Serralves, Casa da Musica, port cellars, strong food | WV/Porto |
| 5 | Bergen | 9.5 | 59 | yes | Bryggen UNESCO wharf and Philharmonic (rainy city, food average) | WV/Bergen |
| 6 | Salzburg | 9.6 | 53 | yes | Mozart's birthplace, cathedral, Residenzgalerie, Salzburger Nockerl | WV/Salzburg |
| 7 | Bayonne | 8.8 | 90 | yes | Musee Basque, half-timbered old town, ham and chocolate | WV/Bayonne_(France) |
| 8 | Malcesine | 9.2 | 70 | no | a Lake Garda summer resort; culture is one castle, one restaurant listed | WV/Malcesine |
| 9 | Vevey | 8.8 | 90 | yes | Chaplin's World, Alimentarium food museum, Lake Geneva | WV/Vevey |
| 10 | Cesky Krumlov | 9.3 | 64 | yes | UNESCO town, Baroque castle theatre; crowds are a summer issue | WV/%C4%8Cesk%C3%BD_Krumlov |

## 5. Backpacker (August; city, nightlife, hidden; city; no car; backpacker budget)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Rome (Fiumicino) | 10 | 68 | yes | city with San Lorenzo nightlife and good transit (not hidden, August closures) | WV/Rome |
| 2 | Bruges | 9.7 | 64 | no | small, tourist-heavy, no night scene, not hidden | WV/Bruges |
| 3 | Salzburg | 9.6 | 63 | no | Salzburg Festival in August, quiet nightlife, nothing hidden about it | WV/Salzburg |
| 4 | Bergen | 9.5 | 61 | no | one of Europe's busiest cruise ports in August, Norway prices for a backpacker | WV/Bergen |
| 5 | Porto | 9.5 | 59 | yes | metro city, cheap set lunches, bars and clubs | WV/Porto |
| 6 | Split | 9.4 | 62 | yes | clubs, buses and ferries to the islands, walkable centre | WV/Split |
| 7 | Venice (Marco Polo) | 9.4 | 59 | no | August is its most crowded month; the opposite of hidden | WV/Venice |
| 8 | Prague | 9.2 | 68 | yes | discos on Wenceslas Square, night trams | WV/Prague |
| 9 | Bern | 9.2 | 64 | no | nightlife "not exactly spectacular", pricey | WV/Bern |
| 10 | Bath | 9.2 | 61 | yes | pubs, nightclubs and live music, direct trains | WV/Bath |

## 6. Beach family (July; beach, islands; town)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Malta | 9.3 | 85 | yes | Mellieha's large sandy beaches, Gozo and Comino by boat | WV/Malta |
| 2 | Corfu | 9.3 | 84 | yes | sandy beaches, safe for children | WV/Corfu |
| 3 | Dubrovnik | 9.6 | 58 | yes | sandy car-free Lapad beach, Lokrum 10 min by boat | WV/Dubrovnik |
| 4 | Santorini | 9.0 | 85 | yes | Kamari side suits families with larger rooms and pools (caldera side does not) | WV/Santorini |
| 5 | Menorca | 9.0 | 84 | yes | quieter than Mallorca, Cala en Porter and Son Bou singled out for kids | WV/Menorca |
| 6 | Bruges | 9.7 | 46 | no | inland city, no beach and no island | WV/Bruges |
| 7 | Taormina | 9.6 | 48 | no | hill town 200 m up, shingle beach by cable car, July "very hot and busy" | WV/Taormina |
| 8 | Portovenere | 9.5 | 51 | yes | beaches plus Palmaria island across a narrow strait | WP/Porto_Venere |
| 9 | Ibiza | 8.8 | 86 | yes | Santa Eularia "more ideal for families", long beaches | WV/Ibiza |
| 10 | Milos | 8.8 | 86 | yes | Sarakiniko, Paliochori beaches with tavernas | WV/Milos |

## 7. Cyclist (May; cycling; village)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Hallstatt | 9.6 | 92 | yes | Salzkammergut has "many trails for all levels of biker" (Hallstatt page itself silent) | WV/Hallstatt, WV/Salzkammergut |
| 2 | Bruges | 9.7 | 67 | yes | cycling popular, Damme 5 km and the coast by bike | WV/Bruges |
| 3 | Salzburg | 9.6 | 67 | yes | "over 100 km of bike paths", river routes to Hallein | WV/Salzburg |
| 4 | Lake Bled | 9.1 | 92 | yes | bikes rented at many agencies (no bike lanes, no off-road) | WV/Lake_Bled |
| 5 | Lednice-Valtice | 9.1 | 92 | yes | "numerous marked biking trails", rentals in Lednice | WV/Valtice |
| 6 | Santillana del Mar | 9.0 | 95 | no | "very touristy" village; no cycling on the page | WV/Santillana_del_Mar |
| 7 | Saint-Paul-de-Vence | 9.0 | 95 | no | an art village; no cycling on the page | WP/Saint-Paul-de-Vence |
| 8 | Pont du Gard | 9.0 | 95 | no | a Roman aqueduct (1.4M visitors), not a village base; no cycling on the page | WP/Pont_du_Gard |
| 9 | Lake Bohinj | 9.0 | 92 | yes | guided and self-guided cycling tours, e-bike rental | WV/Bohinj |
| 10 | Altaussee | 9.0 | 92 | yes | lake village in the Salzkammergut biking trails | WP/Altaussee, WV/Salzkammergut |

## 8. Foodie (April; food, culture, city; city)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Rome (Fiumicino) | 10 | 68 | yes | laid-back dining across Old Rome, Via Veneto | WV/Rome |
| 2 | Porto | 9.5 | 89 | yes | francesinha, bacalhau, "finest restaurants in Portugal" | WV/Porto |
| 3 | Bern | 9.2 | 88 | no | food described as pricey Swiss fare, kitchens close 21:45 | WV/Bern |
| 4 | Bruges | 9.7 | 62 | yes | chocolate shops and celebrated beer pubs, museums | WV/Bruges |
| 5 | Barcelona | 9.0 | 94 | yes | Barceloneta seafood and rice, Gaudi, Sant Jordi on 23 April | WV/Barcelona |
| 6 | Siena & Val d'Orcia | 9.1 | 88 | yes | "difficult to find truly bad food", pici and panforte | WV/Siena |
| 7 | Salzburg | 9.6 | 62 | yes | Nockerl, Mozartkugeln, Cafe Sacher, strong culture | WV/Salzburg |
| 8 | Carcassonne | 9.2 | 81 | yes | cassoulet and foie gras, the Cite | WV/Carcassonne |
| 9 | Bergen | 9.5 | 62 | no | fish market "touristy" with "OK quality"; a weak food pick | WV/Bergen |
| 10 | Dubrovnik | 9.6 | 55 | yes | fresh seafood and Dalmatian dishes, walled old town | WV/Dubrovnik |

## 9. Skier (February; ski; village)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Lauterbrunnen | 9.3 | 100 | yes | ski by riding up to Murren or Wengen, train from Interlaken | WV/Lauterbrunnen |
| 2 | Zermatt | 9.3 | 100 | yes | 200 km of winter pistes, car-free village | WV/Zermatt |
| 3 | Neuschwanstein | 9.3 | 99 | no | a castle; Tegelberg is a cable car hill, not a ski village | WV/Neuschwanstein_Castle |
| 4 | Grindelwald | 9.2 | 100 | yes | season mid Dec to mid Apr, 155 km | WV/Grindelwald |
| 5 | Sixt-Fer-a-Cheval | 9.2 | 100 | yes | part of the 265 km Grand Massif | WP/Sixt-Fer-%C3%A0-Cheval |
| 6 | Zell am See | 9.2 | 100 | yes | Schmittenhohe and Kitzsteinhorn by ski bus | WV/Zell_am_See |
| 7 | Berchtesgaden | 9.2 | 97 | yes | Jenner, Rossfeld, Gotschen slopes (smaller area) | WV/Berchtesgaden |
| 8 | Ortisei (Val Gardena) | 9.1 | 100 | yes | 175 km, Dolomiti Superski and Sella Ronda | WV/Ortisei |
| 9 | Dolomites (Cortina) | 9.1 | 100 | yes | three ski areas, about 120 km | WV/Cortina_d%27Ampezzo |
| 10 | Lake Bled | 9.1 | 97 | no | no ski area on either page; "winter is quieter" | WV/Lake_Bled, WV/Bled |

## 10. Wellness (November; wellness, lakes; quiet)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Lake Como | 9.7 | 91 | yes | the lake itself and lakeside villas, quiet out of season (no spa on the page) | WV/Lake_Como |
| 2 | Altaussee | 9.0 | 99 | yes | designated climatic spa town on its lake | WP/Altaussee |
| 3 | Corfu | 9.3 | 84 | no | most rain falls Nov to Mar; no spa, lake is a coastal lagoon | WV/Corfu |
| 4 | Hallstatt | 9.6 | 60 | yes | lakeside village, quieter in winter (no spa on the page) | WV/Hallstatt |
| 5 | Rome (Fiumicino) | 10 | 36 | no | a capital city; no spa and no lake on the page | WV/Rome |
| 6 | Kitzbuhel | 8.9 | 89 | no | a ski town; no spa on either page, Schwarzsee is a summer bathing lake, November is between seasons | WP/Kitzb%C3%BChel |
| 7 | Salzburg | 9.6 | 52 | no | city; no spa on the page, lakes only by bus | WV/Salzburg |
| 8 | Epidaurus | 8.9 | 86 | no | an ancient healing sanctuary; no modern spa and no lake on either page | WP/Epidaurus, WV/Epidaurus |
| 9 | Bruges | 9.7 | 46 | no | city; no spa (one B&B hammam) and no lake | WV/Bruges |
| 10 | St. Moritz | 8.8 | 90 | yes | historic mineral springs and Lake St. Moritz | WP/St._Moritz |

## 11. Island hopper (June; islands, beach; mix)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Malta | 9.3 | 96 | yes | three islands, sandy Mellieha beaches | WV/Malta |
| 2 | Corfu | 9.3 | 95 | yes | Ionian island, sandy west coast | WV/Corfu |
| 3 | Santorini | 9.0 | 96 | yes | June is the shoulder season, black and red beaches | WV/Santorini |
| 4 | Menorca | 9.0 | 96 | yes | Cala Macarella, Cala en Turqueta | WV/Menorca |
| 5 | Ibiza | 8.8 | 97 | yes | many long beaches | WV/Ibiza |
| 6 | Milos | 8.8 | 97 | yes | Sarakiniko, Kleftiko by boat | WV/Milos |
| 7 | Funchal (Madeira) | 8.8 | 96 | yes | island hop to Porto Santo by ferry or 15 min flight (beaches not on page) | WV/Madeira |
| 8 | Gozo | 8.7 | 96 | yes | Ramla il-Hamra "one of Malta's finest beaches" | WV/Gozo |
| 9 | Dubrovnik | 9.6 | 48 | yes | boat trips to Lokrum and the Elaphiti islands | WV/Dubrovnik |
| 10 | Taormina | 9.6 | 45 | no | mainland hill town; Aeolian ferries leave from Milazzo an hour away | WV/Taormina |

## 12. No-car rail (May; city, culture; city; no car)

| # | Place | Score | Match | Sensible | Why | Source |
|---|---|---|---|---|---|---|
| 1 | Rome (Fiumicino) | 10 | 95 | yes | buses, metro and trams, contactless tickets | WV/Rome |
| 2 | Bruges | 9.7 | 87 | yes | an hour by train from Brussels, walkable | WV/Bruges |
| 3 | Salzburg | 9.6 | 87 | yes | Mozart, cathedral, bike paths | WV/Salzburg |
| 4 | Porto | 9.5 | 87 | yes | metro, funicular, "you don't need a car" | WV/Porto |
| 5 | Bergen | 9.5 | 87 | yes | Bergen Line from Oslo, May the driest month | WV/Bergen |
| 6 | Dubrovnik | 9.6 | 77 | yes | buses from Split and the airport, pedestrian old town | WV/Dubrovnik |
| 7 | Venice (Marco Polo) | 9.4 | 87 | yes | spring "probably best", no cars at all | WV/Venice |
| 8 | Split | 9.4 | 87 | yes | trains, buses, ferries, Diocletian's Palace | WV/Split |
| 9 | Prague | 9.2 | 95 | yes | metro, trams, opera and concerts | WV/Prague |
| 10 | Ohrid | 9.4 | 77 | yes | UNESCO churches, hourly buses from Skopje | WV/Ohrid |

## Profile values that look wrong

Data findings for the owner, separate from the verdicts above.

- Rome, food 0: page lists dining across Old Rome and Via Veneto (WV/Rome).
- Bruges, food 0: chocolate and beer are the page's highlights (WV/Bruges).
- Salzburg, food 0: Nockerl, Mozartkugeln, Cafe Sacher (WV/Salzburg).
- Dubrovnik, food 0: fresh seafood and Dalmatian dishes (WV/Dubrovnik).
- Split, food 0: pasticada, risotto, Obrov fish market (WV/Split).
- Cesky Krumlov, food 0: page lists restaurants and good value (WV/%C4%8Cesk%C3%BD_Krumlov).
- Bergen, food 0: fish market exists, though "OK quality"; 0 is too low, not too high (WV/Bergen).
- hidden 0 for all ten backpacker places: the value is 0 everywhere, which reads as missing data rather than a measurement; Venice's own page names quieter Cannaregio and Torcello (WV/Venice).
- Rome, lakes 95: no lake on the page (WV/Rome).
- Bruges, lakes 81; Porto, lakes 81; Hondarribia, lakes 90; Sintra, lakes 71 (Pena park ponds only); Epidaurus, lakes 71: none of these pages names a lake.
- Salzburg, lakes 97: page mentions Fuschlsee only as a bus destination (WV/Salzburg).
- Lake District and Keswick, beach 84: the national park has one coastal town, Ravenglass; Keswick's page has no beach (WV/Lake_District_National_Park, WV/Keswick).
- Bruges, nightlife 97; Bern, nightlife 98; Salzburg, nightlife 95: Bern's page says nightlife is "not exactly spectacular"; Bruges and Salzburg list a few pubs (WV/Bern, WV/Bruges, WV/Salzburg).
- Dubrovnik, islands 0: Lokrum 10 min by boat and the Elaphiti islands (WV/Dubrovnik).
- Portovenere, islands 0: Palmaria, Tino and Tinetto at the tip (WP/Porto_Venere).
- Neuschwanstein, ski 98: a castle; only Tegelberg cable car is "popular with skiers" (WV/Neuschwanstein_Castle).
- Lake Bled, ski 96: no ski area on WV/Lake_Bled, WV/Bled or WP/Bled.
- Epidaurus, wellness 95: an ancient healing sanctuary, no modern spa on either page; looks name-driven (WP/Epidaurus).
- Corfu, wellness 95; Lake Como, wellness 95; Kitzbuhel, wellness 95: no spa on any of their pages (WV/Corfu, WV/Lake_Como, WP/Kitzb%C3%BChel).
- Hallstatt, wellness 0 next to Altaussee wellness 100: neighbouring Salzkammergut lake villages scored at opposite ends.
- Santillana del Mar, Saint-Paul-de-Vence, Pont du Gard, cycling 93 (and many places at exactly 88 or 93): no cycling on their pages; the repeated identical values look like a country or region default, not a place measurement.
- Pont du Gard and Puy de Dome, village 100: an aqueduct and a volcano summit, not places to stay (WP/Pont_du_Gard, WP/Puy_de_D%C3%B4me).
- Bergen, quiet 100: "one of Europe's busiest cruise ports" (WV/Bergen).
- St. Moritz, quiet 100: page calls it a "champagne atmosphere" resort (WV/St._Moritz).

## Patterns

- **Quality dominates at lambda 2.** Rome (10), Bruges (9.7) and Salzburg (9.6) appear in 7, 8 and 8 of the 12 lists, often at match 29 to 52%. They cause 12 of the 33 misses. Rome sits third for the toddler family at match 29%. Fix inside the allowed knobs: none of the conflict factors touches a plain weak match, so this needs either a lower lambda (outside this gate's knobs, owner call) or the data fixes below that stop these places scoring 80 to 97 on likes they do not have.
- **Busy is too gentle for quiet travellers.** The toddler family has 8 of 10 rows flagged busy, and all five of its misses are busy summer places (Bruges, Rome, Porto, Dubrovnik, Sintra). Fix: busy 0.8 to 0.6 for quiet personas, the bottom of the allowed range.
- **Zero means missing.** food 0, hidden 0, islands 0 and wellness 0 appear on places where the page plainly shows the thing (seven food cities, all backpacker rows, Dubrovnik and Portovenere islands). When a like is 0 the quality term fills the gap and the same famous cities rise. Fix in the pipeline: carry null for "not measured" and score it as neutral, and fill food from the food layer for the seven cities listed.
- **Inflated proxy values.** lakes 71 to 97 for cities with no lake, nightlife 95+ for Bruges, Bern and Salzburg, ski 96 to 98 for Bled and Neuschwanstein, wellness 95 for Epidaurus, cycling at exactly 88 or 93 for whole countries. These look like radius or name proxies. Fix in the pipeline: cap a like by distance to the actual feature (lake area within reach, lift-served piste km, a spa POI), not by region.
- **Month blindness.** November wellness rows include Corfu in its rainy season and Kitzbuhel between seasons; the backpacker gets Venice and Salzburg in their busiest August. No row in the file carries a heat conflict, even Rome and Taormina in July for families. Fix: check the heat conflict is wired for family personas (factor 0.85 can stay), and add an off-season or rain conflict from the climate layer in the pipeline.
- **Sights treated as bases.** Pont du Gard, Puy de Dome and Neuschwanstein score village 100 and fill cyclist and skier lists. Fix in the pipeline: classify sight-only rows so they do not take the size bonus, or roll them up into their nearest town.

## For the owner

Check these three by hand:

1. **Family with a toddler (5 / 10).** It is the example the brief itself gives (toddler family to central Rome in July) and it still happens at rank 3. It is also the clearest test of the busy factor, since 8 of 10 rows carry busy.
2. **Wellness (4 / 10).** The worst list. It mixes both data problems (wellness 95 on places with no spa, wellness 0 on a lake village next door) with month blindness (Corfu and Kitzbuhel in November), so one check covers both kinds of fix.
3. **Backpacker (5 / 10).** hidden is 0 on every row, so one of three wishes is not scored at all, and the no-car, budget and August angles are untested by the other lists. It shows whether "hidden" works anywhere in the app.

## Tuning tried (batch lead, 2026-10-28)

Only lambda and the conflict factors may be tuned. Owner decision 9 (2026-10-27) caps the move at one point, so lambda cannot go above 2, and a lower lambda lets quality dominate more, which is the main cause of the misses. The one factor the patterns point at is busy:

| Change | Effect on the top 10 lists | Kept |
| --- | --- | --- |
| busy 0.8 to 0.6 (car 0.75) | Family with a toddler loses Corfu, Hondarribia and Sintra (beach places) and gains Caernarfon (55%), Salzburg (26%) and Hallstatt (26%), all busy in July with no beach; hiking couple swaps Salzburg, Moustiers-Sainte-Marie, Orta San Giulio for Banska Stiavnica, Lake Myvatn, Scanno; slow culture swaps Porto for Ohrid; wellness swaps Rome for Orta San Giulio | No: the toddler list gets worse, because every July place is busy, so a stronger busy factor does not separate them |
| busy 0.6, car 0.6 | As above; no persona list changes from the car factor | No |

Result: the factors stay at busy 0.8, car 0.75, heat 0.85 and lambda 2. Gate 7 stays at 87 of 120 (72.5%), FAIL. What would move it is outside this task's tuning room: the place profile values (a 0 that means not measured, region-wide values, sights filed as villages) in the pipeline, and the owner's call on decision 9.
