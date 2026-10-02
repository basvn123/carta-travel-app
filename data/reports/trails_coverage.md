# Trails coverage: the famous-trail registry versus the wire

Generated 2026-10-02T00:19:51+00:00 by `pipeline/trails/coverage_report.py`.

This report answers one question: for every region Carta covers, are that region's best-known walks published? A miss is never silence; it carries a reason code, and three of those codes are this pipeline's bugs rather than the world's gaps.

## Totals

| Measure | Value |
|---|---|
| Walk candidates checked (`kind: trail`) | 17,289 |
| places a walk goes to (evidence, not gated) | 163,300 |
| Matched | 2,025 (11.7%) |
| Missing | 15,264 |
| **Walks missing for reasons that are ours** | **13,446** |
| Published rows read | 17,619 |
| Regions with a registry row | 1,235 |
| Regions failing the top-three gate | 1,142 |
| GMBA ranges with a registry row | 652 |
| GMBA ranges failing the top-three gate | 553 |

## Why the misses are missing

| Reason | Rows | Ours? |
|---|---|---|
| `way_only_not_derived` | 8,891 | **yes** |
| `failed_continuity` | 4,555 | **yes** |
| `unplaced` | 1,301 | no |
| `no_osm_data` | 377 | no |
| `unresolved_seed` | 137 | no |
| `out_of_scope` | 3 | no |

`way_only_not_derived`, `failed_continuity` and `below_quota` are the codes the strict gate refuses. They mean the data exists and this pipeline did not carry it through.

Most `no_osm_data` rows are `kind: place` (a named summit or lake with an article and no path), which is why the gate holds a region to its top three WALKS rather than to every row. The number that sizes the work is the bolded one above.

## Worst 20 misses by fame score

| Trail | Country | Region | Fame | Reason |
|---|---|---|---|---|
| Orla Perć | PL | PL219 | 0.735 | `way_only_not_derived` |
| Krk | HR | HR031 | 0.692 | `no_osm_data` |
| Fürstensteig | LI | LI000 | 0.688 | `way_only_not_derived` |
| Galdhøpiggen | NO | NO020 | 0.660 | `no_osm_data` |
| Peaks of the Balkans | ME | ME000 | 0.650 | `failed_continuity` |
| Peaks of the Balkans | XK | n/a | 0.642 | `unplaced` |
| Likya Yolu | TR | TR323 | 0.638 | `failed_continuity` |
| Śnieżka | PL | CZ052 | 0.630 | `no_osm_data` |
| Zugspitze | DE | DE21D | 0.624 | `no_osm_data` |
| Gjeravica | XK | XK007 | 0.620 | `no_osm_data` |
| Rysy | PL | SK041 | 0.620 | `no_osm_data` |
| Szlak Orlich Gniazd | PL | PL22B | 0.617 | `failed_continuity` |
| Vesuvio | IT | ITF33 | 0.612 | `no_osm_data` |
| Camino Lituano | LT | n/a | 0.607 | `unplaced` |
| Ruta del Cares | ES | ES120 | 0.605 | `way_only_not_derived` |
| Peaks of the Balkans | AL | n/a | 0.598 | `unplaced` |
| Główny Szlak Sudecki | PL | PL523 | 0.578 | `failed_continuity` |
| Sněžka | CZ | CZ052 | 0.566 | `no_osm_data` |
| Königssee | DE | DE215 | 0.565 | `no_osm_data` |
| Ślęża | PL | PL518 | 0.556 | `no_osm_data` |

## Regions failing the top-three gate

| Region | Country | Published | Quota | Blocking rows |
|---|---|---|---|---|
| AL033 | AL | 8 | 11 | Kordhoce Bridge, Ura e Kadiut, Ura e Ali Pasha |
| AT315 | AT | 17 | 14 | Europäischer Fernwanderweg E4 alpin (Bad Goisern/Eisenerz, Welser Höhenweg (Welser Variante, Kreuzweg |
| AT223 | AT | 16 | 11 | Europäischer Fernwanderweg E4 alpin (Eisenerz - Rax, Bärenschützklamm, Frauenmauerhöhle |
| AT211 | AT | 16 | 11 | Via Alpina Red R16, Via Alpina Red R17, Via Alpina Red R17 |
| AT212 | AT | 21 | 11 | Via Alpina Red R18, Via Alpina Red R21, Via Alpina Red R23 |
| AT333 | AT | 13 | 11 | Via Alpina Red R24, Via Alpina Red R25, Via Alpina Red R24 |
| AT334 | AT | 17 | 12 | Via Alpina Red R47, Mainzer Höhenweg, Augsburger Höhenweg |
| AT341 | AT | 14 | 18 | Via Alpina Red R53, Via Alpina Red R54, Via Alpina Red R55 |
| AT130 | AT | 9 | 12 | Strudlhofstiege, ST10 Kahlenberg - Stephansdom, ST11 Stephansdom - Rauchenwarth |
| AT313 | AT | 22 | 7 | ehem. Pferdeeisenbahn Budweis–Linz–Gmunden, European long distance path E6 - Main route Austria, European long distance path E6 - Main route Austria |
| AT221 | AT | 12 | 11 | Doppelwendeltreppe, Rettenbachklamm-Wanderweg, Jakobsweg Weststeiermark |
| AT122 | AT | 18 | 12 | Gutensteinerbahn, Dickenauer Tunnel, Türnitzer Bahnradweg |
| AT126 | AT | 7 | 6 | Lokalbahn Siebenbrunn – Engelhartstetten, Hagenbachklamm, Blutgasse |
| AT213 | AT | 19 | 10 | JK04, Kärntner Grenzweg, Eisenwurzenweg 08A |
| AT124 | AT | 35 | 9 | Braunaubachbrücke, Kremser Frauenbergstiege, Marienbrücke |
| DE21K | DE | 48 | 15 | Jakobsweg Böhmen-Bayern-Tirol Variante/Attel, Jakobsweg Böhmen-Bayern-Tirol Variante/Egg, Jakobsweg Böhmen-Bayern-Tirol Variante/Prien |
| AT311 | AT | 15 | 6 | Benediktweg, Donausteig Wanderungen, Wolfgangweg |
| AT125 | AT | 21 | 7 | Jakobsweg Weinviertel, Stezka Českem - Podyjí, Svatojakubská cesta, Česko, Moravskoslezská trasa |
| BE332 | BE | 20 | 13 | Montagne de Bueren, Degrés des Tisserands, GRP 571 Tour des Vallées des Légendes - Amblève - Salm - Lienne |
| BE211 | BE | 16 | 12 | Sint-Annatunnel, GR 12 Amsterdam - Bruxelles - Paris, GR 565 Sniederspad |
| BE351 | BE | 36 | 13 | Ligne 553, GR 125 Variante Meuse à Freyr, GR 16 Sentier de la Semois |
| BE242 | BE | 12 | 12 | Grote Markt, Diestsestraat, Victor Broosplein |
| BE335 | BE | 57 | 13 | Kalvarienberg, Charmille du Haut-Marais, Rue Gérardheid |
| NL341 | BE | 17 | 12 | Grenslandpad - 24 - Variant Oost Zeeuws-Vlaanderen, Grenslandpad - 01, Grenslandpad - 02 |
| BE251 | BE | 9 | 12 | Stoofstraat, Vrijdagmarkt, Begijnenvest |
| BE235 | BE | 8 | 12 | Ketse, Mijnwerkerspad, GR 122 |
| NL411 | NL | 13 | 12 | Floris V-pad - 12, Floris V-pad - 13, Floris V-pad-GR 5 - Verbinding |
| BE234 | BE | 18 | 12 | Achterstraat, Achtervisserij, Adolf Samuëlstraat |
| NL415 | NL | 8 | 12 | Pelgrimspad 1 - 09, Pelgrimspad 2 - 02, Grenslandpad - 11 |
| BE213 | BE | 29 | 12 | Burgemeester van Gilsestraat, Hollandsebaan, Kruisweg |
| BE32B | BE | 2 | 12 | Chaussée Brunehault, Chaussée de Brunehault, Passage de la Bourse |
| BE323 | BE | 4 | 12 | Chaussée Brunehaut, GR 129 HP Sentiers des Hauts-Pays, GR 412 Liaison gare de Thulin |
| FRE11 | FR | 16 | 10 | Drève des Boules d'Hérin, Trouée d'Arenberg, Chemin Communal de Viesly à Le Cateau |
| BE253 | BE | 12 | 12 | GR 128 Vlaanderenroute (hoofdtraject, Ledwidgepad, Vrijbosroute |
| BE343 | BE | 24 | 13 | GR 57 Sentier de l'Ourthe orientale, GR 17 Lomme Liaison GRP 151, GR 57 Sentier de l'Ourthe occidentale |
| BE231 | BE | 4 | 12 | Herenput, Jan de Lichtepad, Knutseweg |
| BE344 | BE | 38 | 13 | GR 129 Sud La Belgique en diagonale ! Variante crue Daverdisse - Lesse, GR 129 Sud Liaison gare de Bertrix, GR 129 Sud Liaison gare de Paliseul |
| BE336 | BE | 27 | 12 | GR 15 Variante Caillebotis, GR 56 Liaison Gare Hergenrath, GR 56 Sentiers de l'Est de la Belgique |
| BG412 | BG | 35 | 12 | European long distance path E8 - part Bulgaria, ST425 Dragoman - Slivnitsa, ST426 Slivnitsa - Bankya |
| BG413 | BG | 33 | 13 | ST508 khiza Makadoniya - Belitsa (Bear Park, ST509 Belitsa (Bear Park) - Yakoruda, ST510 Yakoruda - Yundola |
| BG423 | BG | 11 | 17 | ST511 Yundola - Velingrad, ST512 Velingrad - Batak, ST513 Batak - Orlovetz |
| BG424 | BG | 20 | 15 | ST516 Borino -  Yagodina, ST516a Devil's Gorge detour, ST517 Yagodina - Mugla |
| BG425 | BG | 4 | 9 | ST524 Ardino - Kitnitsa, ST525 Kitnitsa - Kardzhali, ST526 Kardzhali - Madrets |
| BG422 | BG | 3 | 9 | ST528 Rabovo - Madzharovo, ST529 Madzharovo - Gornoseltsi, ST530 Gornoseltsi - Ivaylovgrad |
| BG421 | BG | 41 | 12 | ST711 Stambolijski - Plovdiv, ST712 Plovdiv - Asenovgrad, ST713 Asenovgrad - Cherven |
| FRC21 | CH | 12 | 9 | Via Francigena, Via Francigena - Variante historique, Via Francigena - part France - 04 Besançon - frontière |
| DE139 | CH | 16 | 16 | Dreiländerbrücke, Dreiländerbrücke, Dreiländerbrücke |
| CH040 | CH | 27 | 13 | Chatzentobelweg, Farnerweg, Uerikon-Bauma-Bahn |
| CH013 | CH | 10 | 12 | Promenade de la Treille, Passerelle de la Colline, Passerelle de la Vi-de-Gueue |
| DE138 | CH | 8 | 13 | Hugenotten- und Waldenserpfad, Etappe Barzheim - Weiterdingen, Hugenotten- und Waldenserpfad, Etappe Barzheim - Weiterdingen, Hugenotten- und Waldenserpfad, Etappe Weiterdingen - Riedöschingen |
| CH051 | CH | 10 | 18 | Pantenbrücke, Gruebsteg, Löntschtobelbrücke |
| CZ053 | CZ | 16 | 14 | Svatojakubská cesta, Východočeská trasa, Pardubice - Přelouč, Svatojakubská cesta, Východočeská trasa, Přelouč - Záboří nad Labem, Sky Bridge 721 |
| DED44 | DE | 12 | 13 | Jakobsweg Vogtland (Etappe 2: Waldkirchen-Treuen, Jakobsweg Vogtland (Etappe 3: Treuen-Oelsnitz, Europäischer Fernwanderweg E3, Sachsen (West |
| CZ010 | CZ | 12 | 12 | Štvanická lávka, Trojská lávka, Zámecké schody |
| CZ042 | CZ | 23 | 15 | European long distance path E3 - part Czech Republic, North East, NS Podél Nového plavebního kanálu, Příhraniční naučná hornická stezka |
| CZ071 | CZ | 24 | 16 | Slavíčský tunel, Za mlýnem, Maroldova |
| CZ031 | CZ | 50 | 15 | Evropská dálková trasa E10, Česká republika, Rechle, Ant. Slavíčka |
| DED42 | DE | 19 | 15 | Jakobsweg an der Frankenstraße, Stollberg-Zwickau, Bodenmühl-Brücke, Hahnbrücke |
| DE235 | CZ | 17 | 10 | Ostbayerischer Jakobsweg (Eschlkam > Donauwörth, Ostbayerischer Jakobsweg (Eschlkam > Donauwörth, Blaue Brücke |
| DE24D | DE | 16 | 14 | Jakobsweg Marktschorgast-Weißenstadt, Jakobsweg Weißenstadt-Creußen, Burgenweg |

## GMBA ranges failing the top-three gate

The same rule as the regions, applied per mountain range: a range's three best-known walks are published, or each miss has a code that is the world's rather than ours.

| Range | Countries | Published | Blocking rows |
|---|---|---|---|
| Black Forest | DE | 88 | Jakobsweg Rottenburg - Thann (2, Lothar Path, Ravennaschlucht |
| Western Rhodopes | BG | 49 | ST510 Yakoruda - Yundola, ST512 Velingrad - Batak, ST513 Batak - Orlovetz |
| Bavarian Forest | DE | 49 | Nordwaldkammweg I+II+III und Verbindungswege, Nordwaldkammweg II, Pilgerweg St. Wolfgang |
| Bohemian Forest (nn) | AT, CZ, DE | 39 | European long distance path E6 - Main route Austria, European long distance path E6 - Main route Austria, European long distance path E6 - Main route Austria |
| Tosco Romagnolo Apennines (nn) | IT | 33 | Sentiero europeo E1, Italia - Umbria/Marche, Via Romea - Tratto Toscana, Via Romea - Tratto Toscana - Alternativa la Verna |
| Karawanks | AT, IT, SI | 32 | JK07, JK09, JK01 |
| Rila | BG | 30 | European long distance path E8 - part Bulgaria, ST506 khiza Mechit - Rila Monastery, ST507 Rila Monastery - khiza Makadoniya |
| Stari Vlah Mountains | RS | 28 | E7-10: Овчар бања – Ариље – Чајетина – Кремна, E7-12a: Бријач – Увац – Сопотница, Овчарско-кабларска трансверзала |
| Chiemgau Alps | AT, DE | 27 | E4 (alpin) Fernwanderweg (Bereich Lofer/Steinberge, Hausbachfall Klettersteig, Zollhausbrücke Erl |
| Mangfall Mountains | AT, DE | 23 | Europäischer Fernwanderweg E4 - Teil Deutschland (Region Wendelstein, Bockerlbahn-Weg, Prinzenweg |
| Lazio Anti-Apennines (nn) | IT | 23 | Via Francigena - Variante Albano Laziale, Ponte Cardona, Circumductio |
| Thuringian Forest | DE | 22 | Jakobsweg Erfurt - Coburg, Domberg, Internationaler Bergwanderweg Eisenach–Budapest (Thüringen Ost |
| Carnic Alps | AT, IT | 19 | Via Alpina Red R16, Via Alpina Red R17, Via Alpina Red R18 |
| Mont Leone and Saint Gothard Alps | CH, IT | 19 | Ponte Romano, Scangles-Brücke, Via Alpina Blue D4 |
| Hesse Highlands (nn) | DE | 19 | Studentenpfad (Abschnitt 3, Kassel - Bad Wildungen, Fulda-Diemel-Weg, Eco-Pfad Habichtswald |
| Vicentine Prealps | IT | 19 | strada delle 52 gallerie, Strada degli Eroi, Scanuppia |
| Monte Viso Alps | FR, IT | 18 | Via Alpina Red R135, Via Alpina Red R136, Via Alpina Red R133 |
| Grand Combin Alps | CH, IT | 17 | Via Francigena - 01 Valle d'Aosta, Via Francigena - 01 Valle d'Aosta, Via Alpina Red R116 |
| Adula Alps | CH | 16 | Alte Landbrugg, Pùnt da Suransuns, Via Santa Petronilla |
| Ore Mountains | CZ, DE | 16 | Anton-Günther-Weg, Anton-Günther-Weg, Schody hrůzy |
| Sierra de Gredos | ES | 15 | GR 10, Pozo de las Paredes, Puente Viejo |
| Serra do Marão | PT | 15 | Linha do Tâmega, Ponte Pedonal da Régua, Estação Arqueológica do Alto da Fonte do Milho |
| Cottian Alps (nn) | FR, IT | 14 | Via Alpina Red R137, Via Alpina Red R138, Via Alpina Red R139 |
| Ligurian Alps (nn) | FR, IT | 14 | Via Iulia Augusta, Pont du Coq, Ponte Romano |
| Lechtal Alps | AT | 13 | E4] Europäischer Fernwanderweg [004, Via Alpina Red R48, Via Alpina Red R49 |
| Karwendel | AT | 13 | E4] Europäischer Fernwanderweg [005, Via Alpina Red R42, Via Alpina Red R43 |
| Mischabel and Weissmies Alps | CH, IT | 13 | GTA: Molini di Calasca - Alpe del Lago, Charles Kuonen Hängebrücke, Merjubrücke |
| Glarus Alps (nn) | CH | 13 | Gruebsteg, Sagenbrücke, Spinnereisteg |
| Préalpes de Nice | FR, MC | 13 | chemin des Révoires, chemin des Révoires, Via Alpina Red R160 |
| Snežnik and Gorski Kotar mountain range | HR | 12 | Stube Petra Kružića, Riječki tunel, Via Dinarica White Trail |
| Garda Prealps | IT | 12 | Strada del Ponale, Pont del Diaol, Sentiero dei Serbi |
| Southern Valais Alps | IT | 12 | GTA: Campello Monti - Rimella, GTA: Maletto - Le Capanne, GTA: Oropa - Rifugio Coda |
| Serra de Montemuro | PT | 12 | Passadiços do Paiva, Rua da Ponte Cavalos, Ponte de Paço de Mato |
| Northwestern Pyrenees (nn) | ES, FR | 11 | Senda Pirenaica - E36, Senda Pirenaica - E37, Étape 02 |
| Carnic Prealps | IT | 11 | Alta via n. 6 delle Dolomiti, Via Alpina Yellow B17, Via Alpina Yellow B18 |
| Salzkammergut Mountains | AT | 10 | Europäischer Fernwanderweg E4 alpin (Bad Goisern/Eisenerz, Soleweg, historischer Wasserstollen |
| Como Prealps | CH, IT | 10 | Dorsale del Triangolo Lariano, Sentee di Sort, Sentiero delle Espressioni |
| Rhön Mountains | DE | 10 | Jakobsweg Bremen (Rhön)-Breitungen, Jakobsweg Bremen (Rhön)-Fulda, Jakobsweg Fulda-Würzburg (Teilstrecke Kreuzberg - Schweinfurt |
| Serra da Peneda | ES, PT | 10 | Ponte de Rubiães, Pasarela de Outariz, Ponte dos Liños |
| Apuan Alps | IT | 10 | Via Francigena - 06 Toscana, Via Francigena - Variante, Via Vandelli |
| Western Umbrian Apennines (nn) | IT | 10 | Via del Ponte, Ex Ferrovia Spoleto Norcia, Galleria San Martino |
| Monti Picentini | IT | 10 | Acquedotto di Capezzano Inferiore, European Long distance path E1 - part Italy - Campania, Ponte della Lavandaia |
| Hyblaean Mountains | IT | 10 | Chiasso Calabrò, Chiasso Pinto, Via Scale Duca |
| Ennstal Alps | AT | 9 | Europäischer Fernwanderweg E4 alpin (Eisenerz - Rax, Dr. Vogelgesang Klamm, Johnsbachsteg |
| Uri-Glarus Alps | CH | 9 | Pantenbrücke, Russeinerbrücke, Alte Brücke |
| Varese Prealps | CH, IT | 9 | European Long distance path E1 - part Italy - Lombardy, Anulare Valcuviano, Via Nostra Signora della Serta |
| Massif des Albères | ES, FR | 9 | Camí de Sant Jaume (Sant Pere de Rodes - Montserrat, Catalunya E01, Catalunya E03 |
| Fiemme Dolomites | IT | 9 | Via Romea - Tratto Trentino, Galleria Giuseppe Garbari, Pont dele Formighe |
| Matese | IT | 9 | Ponte Fabio Massimo, Ponte di Annibale, Decumanus Maximus |
| Bucegi Mountains | RO | 9 | Strada După Ziduri, Strada Sforii, Bușteni - Cabana Poiana Izvoarelor - Cabana Omu |
| Bregenz Prealps | AT | 8 | E4] Europäischer Fernwanderweg [003, Via Alpina Red R55, Gschwendtobel-Brücke |
| Chablais Massif | CH, FR | 8 | Route du Lac, Route du Lac, Balcon du Léman |
| Ammergau Alps | DE | 8 | Marienbrücke, Gelbe-Wand-Steig, Altherrenweg |
| Sauerland | DE | 8 | Auf der Burg, X6 Robert-Kolb-Weg (Etappe: Jagdhaus bis Münden, Hessenweg 6 |
| Macizo Central Ourensano | ES | 8 | A Ponte Navea, Ponte da Cabalar, Camino Portugués de la vía de la Plata |
| Serra de Gerês | ES, PT | 8 | Via Nova, Geira, Geira |
| Vanoise Massif | FR | 8 | Via Alpina Red R122, Via Alpina Red R123, GR 55 La Vanoise |
| Nonsberg Group | IT | 8 | Fennberg-Klettersteig - Ferrata di Favogna, Via ferrata del Burrone "Tullio Giovanelli", Cammino del beato Enrico |
| Southwestern Pyrenees (nn) | ES, FR | 6 | Arrobi, Senda Pirenaica - E35, 1938ko Ezkabako Ihesa |
| Sierras Litorales (nn) | ES | 6 | Pasarela Mariola, Sendeiro Rural de Galicia, Camiño Portugués Variante Espiritual |

## Where the registry itself is blind

A place the catalogue publishes walks in and the registry holds no walk for passes the gate by having nothing to fail. These are the places the gate cannot see.

| Measure | Value |
|---|---|
| GMBA ranges with a published walk | 870 |
| GMBA ranges with a registry walk | 652 |
| GMBA ranges published, no registry walk | 367 |
| NUTS3 regions with a published walk | 1,367 |
| NUTS3 regions with a registry walk | 1,235 |
| NUTS3 regions published, no registry walk | 217 |

The 25 blind ranges with the most published walks:

| Range | Published walks |
|---|---|
| Central Balkan Mountains | 69 |
| Cyclades (nn) | 65 |
| Agrafa Mountains | 39 |
| Kopaonik | 32 |
| Zagori Mountains | 28 |
| Euboean Mountains | 26 |
| White Mountains | 25 |
| Grammos | 24 |
| Galičica | 22 |
| Athos | 21 |
| Dodecanese (nn) | 19 |
| Parnon Oros | 19 |
| Gennargentu | 19 |
| Samos | 18 |
| Naxos | 17 |
| Papuk | 15 |
| Gorbes Mountains | 14 |
| Goljak (nn) | 14 |
| Beoetian/ Attican Peninsula (nn) | 13 |
| Lekanis Mountains | 13 |
| Bistra | 13 |
| Ceraunian Mountains | 12 |
| Hunsrück | 12 |
| Peloritani Range | 12 |
| Notranjska Highlands | 12 |

## Waymarked Trails: national and international routes

Every INT and NAT hiking route Waymarked Trails lists, placed in each country it crosses (pipeline/trails/waymarked.py) and merged into the registry as its fifth evidence source. New to the registry means no fame source had named it.

| Country | Routes | New to the registry | Published | Missing |
|---|---|---|---|---|
| AD | 10 | 0 | 1 | 9 |
| AL | 3 | 2 | 0 | 3 |
| AT | 99 | 60 | 18 | 81 |
| BA | 3 | 0 | 0 | 3 |
| BE | 110 | 86 | 14 | 96 |
| BG | 11 | 5 | 2 | 9 |
| CH | 41 | 17 | 14 | 27 |
| CY | 20 | 18 | 7 | 13 |
| CZ | 64 | 38 | 4 | 60 |
| DE | 311 | 131 | 41 | 270 |
| DK | 6 | 2 | 1 | 5 |
| EE | 9 | 7 | 2 | 7 |
| ES | 343 | 222 | 58 | 285 |
| FI | 10 | 6 | 1 | 9 |
| FR | 340 | 165 | 23 | 317 |
| GB | 71 | 17 | 25 | 46 |
| GR | 19 | 10 | 4 | 15 |
| HR | 16 | 11 | 4 | 12 |
| HU | 44 | 32 | 6 | 38 |
| IE | 59 | 20 | 23 | 36 |
| IS | 1 | 1 | 0 | 1 |
| IT | 82 | 43 | 20 | 62 |
| LI | 6 | 2 | 4 | 2 |
| LT | 8 | 5 | 3 | 5 |
| LU | 29 | 20 | 8 | 21 |
| LV | 33 | 30 | 20 | 13 |
| MC | 1 | 0 | 0 | 1 |
| ME | 29 | 27 | 15 | 14 |
| MK | 6 | 1 | 0 | 6 |
| MT | 2 | 1 | 2 | 0 |
| NL | 86 | 33 | 6 | 80 |
| NO | 31 | 17 | 7 | 24 |
| PL | 83 | 48 | 13 | 70 |
| PT | 53 | 39 | 18 | 35 |
| RO | 40 | 32 | 10 | 30 |
| RS | 14 | 7 | 4 | 10 |
| SE | 52 | 17 | 21 | 31 |
| SI | 39 | 26 | 10 | 29 |
| SK | 157 | 132 | 27 | 130 |
| TR | 7 | 3 | 0 | 7 |
| UA | 15 | 11 | 1 | 14 |
| XK | 4 | 2 | 0 | 4 |
