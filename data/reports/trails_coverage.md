# Trails coverage: the famous-trail registry versus the wire

Generated 2026-09-18T03:50:24+00:00 by `pipeline/trails/coverage_report.py`.

This report answers one question: for every region Carta covers, are that region's best-known walks published? A miss is never silence; it carries a reason code, and three of those codes are this pipeline's bugs rather than the world's gaps.

## Totals

| Measure | Value |
|---|---|
| Walk candidates checked (`kind: trail`) | 15,943 |
| places a walk goes to (evidence, not gated) | 163,300 |
| Matched | 1,630 (10.2%) |
| Missing | 14,313 |
| **Walks missing for reasons that are ours** | **12,411** |
| Published rows read | 17,619 |
| Regions with a registry row | 1,151 |
| Regions failing the top-three gate | 1,067 |

## Why the misses are missing

| Reason | Rows | Ours? |
|---|---|---|
| `way_only_not_derived` | 8,893 | **yes** |
| `failed_continuity` | 3,518 | **yes** |
| `unplaced` | 1,385 | no |
| `no_osm_data` | 375 | no |
| `unresolved_seed` | 139 | no |
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
| AT124 | AT | 35 | 9 | Braunaubachbrücke, Kremser Frauenbergstiege, Marienbrücke |
| DE21K | DE | 48 | 15 | Jakobsweg Böhmen-Bayern-Tirol Variante/Attel, Jakobsweg Böhmen-Bayern-Tirol Variante/Egg, Jakobsweg Böhmen-Bayern-Tirol Variante/Prien |
| DEA2D | DE | 33 | 13 | Jakobs-Pilgerweg Aachen-Maastricht, Jakobs-Pilgerweg Dortmund - Aachen, Via Mosana |
| BE332 | BE | 20 | 13 | Montagne de Bueren, Degrés des Tisserands, GRP 571 Tour des Vallées des Légendes - Amblève - Salm - Lienne |
| BE242 | BE | 12 | 12 | Grote Markt, Diestsestraat, Victor Broosplein |
| BE335 | BE | 57 | 13 | Kalvarienberg, Charmille du Haut-Marais, Rue Gérardheid |
| NL341 | BE | 17 | 12 | Grenslandpad - 24 - Variant Oost Zeeuws-Vlaanderen, Grenslandpad - 01, Grenslandpad - 02 |
| BE251 | BE | 9 | 12 | Stoofstraat, Vrijdagmarkt, Begijnenvest |
| NL411 | NL | 13 | 12 | Floris V-pad - 12, Floris V-pad - 13, Floris V-pad-GR 5 - Verbinding |
| BE234 | BE | 18 | 12 | Achterstraat, Achtervisserij, Adolf Samuëlstraat |
| NL415 | NL | 8 | 12 | Pelgrimspad 1 - 09, Pelgrimspad 2 - 02, Grenslandpad - 11 |
| BE213 | BE | 29 | 12 | Burgemeester van Gilsestraat, Hollandsebaan, Kruisweg |
| BE32B | BE | 2 | 12 | Chaussée Brunehault, Chaussée de Brunehault, Passage de la Bourse |
| FRE11 | FR | 16 | 10 | Drève des Boules d'Hérin, Trouée d'Arenberg, Chemin Communal de Viesly à Le Cateau |
| BE253 | BE | 12 | 12 | GR 128 Vlaanderenroute (hoofdtraject, Ledwidgepad, Vrijbosroute |
| BE231 | BE | 4 | 12 | Herenput, Jan de Lichtepad, Knutseweg |
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
| DE256 | DE | 25 | 11 | Ansbacher Jakobsweg, Jakobsweg Rothenburg - Bargau, Jakobsweg Rothenburg - Rottenburg (1 |
| DE135 | DE | 8 | 13 | Heuberg-Pilgerweg, Neckar-Baar Jakobsweg (2, Radweg Schiltach-Schramberg |
| DE136 | DE | 6 | 13 | Himmelreich-Jakobusweg, Wutach-Pilgerweg, Hugenotten- und Waldenserpfad, Etappe Hondingen - Öfingen |
| DEA22 | DE | 4 | 12 | Jakobs-Pilgerweg Bonn - Bad Münstereifel, Europäischer Fernwanderweg E8, Rheinland-Pfalz, Wanderweg der Deutschen Einheit (Bad Godesberg - Aachen |
| DE737 | DE | 34 | 13 | Jakobs-Pilgerweg Eisenach - Marburg (Teilstück Waldkappl - Ziegenhain, Elisabethpfad 2 (Teilstück Waldkappl - Ziegenhain, Barbarossaweg (Teilstück Reichenbach - Treffurt |
| DE735 | DE | 38 | 14 | Jakobs-Pilgerweg Eisenach - Marburg (Teilstück Ziegenhain - Marburg, Elisabethpfad 2 (Teilstück Ziegenhain - Marburg, ARS NATURA, X8 Teilstrecke 11, X8b |
| DEA13 | DE | 5 | 12 | Jakobs-Pilgerweg Essen - Düsseldorf, Bergischer Weg, Am Mühlengraben |
| DEA53 | DE | 4 | 12 | Jakobs-Pilgerweg Hagen - Lennep, Jakobs-Pilgerweg Variante Haspe - Hagen, Plessen-Viadukt |
| DEA59 | DE | 16 | 12 | Jakobs-Pilgerweg Heidenstraße (Teilstück Attendorn- Meinerzhagen - Marienheide - Lindlar, Hunauweg, X22 Kurkölner Weg [Drolshagen |
