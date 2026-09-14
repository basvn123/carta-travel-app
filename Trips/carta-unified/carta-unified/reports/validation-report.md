# Carta — master dataset validation report

Dataset: **253 trips** · schema v2.0 · generated 2026-09-02

**0 errors · 482 warnings · 30 notices**

## Issue counts by check

| Check | Level | Count |
|---|---|---|
| `missing-connectivity` | WARNING | 115 |
| `missing-booking-windows` | WARNING | 67 |
| `approximate-coordinates` | WARNING | 61 |
| `budget-sum-drift` | WARNING | 60 |
| `gateway-coordinates` | WARNING | 54 |
| `missing-type-detail` | WARNING | 44 |
| `missing-evening` | WARNING | 30 |
| `missing-gateway` | WARNING | 30 |
| `generated-summary` | INFO | 30 |
| `missing-difficulty` | WARNING | 21 |

## Errors

None. Every record satisfies the hard schema contract.

## Warnings by check

### `missing-connectivity` — 115 record(s)

- `at-cycling-donauradweg-wachau` — logistics.connectivity is empty
- `be-cycling-flemish-ardennes-bergs` — logistics.connectivity is empty
- `be-cycling-vennbahn-ardennes` — logistics.connectivity is empty
- `cz-cycling-south-bohemia-ponds` — logistics.connectivity is empty
- `de-cycling-bodensee-radweg` — logistics.connectivity is empty
- `fr-cycling-alsace-vineyard-route` — logistics.connectivity is empty
- `fr-cycling-loire-a-velo` — logistics.connectivity is empty
- `lu-cycling-pc-network-moselle-mullerthal` — logistics.connectivity is empty
- `nl-cycling-green-heart-waterline` — logistics.connectivity is empty
- `nl-cycling-wadden-frisian-dikes` — logistics.connectivity is empty
- `se-cycling-kattegattleden-gothenburg-helsingborg` — logistics.connectivity is empty
- `at-trail-running-innsbruck-nordkette` — logistics.connectivity is empty
- `ch-trail-running-engadin-ridges` — logistics.connectivity is empty
- `cz-trail-running-krkonose-ridge` — logistics.connectivity is empty
- `de-trail-running-berchtesgaden` — logistics.connectivity is empty
- `fr-trail-running-chamonix-balcons` — logistics.connectivity is empty
- `fr-trail-running-mercantour-vesubie` — logistics.connectivity is empty
- `li-trail-running-fuerstensteig-drei-schwestern` — logistics.connectivity is empty
- `lu-trail-running-mullerthal` — logistics.connectivity is empty
- `mc-trail-running-tete-de-chien-agel` — logistics.connectivity is empty
- `be-city-antwerp-and-ghent` — logistics.connectivity is empty
- `cz-city-brno-modernism` — logistics.connectivity is empty
- `cz-city-prague-layered` — logistics.connectivity is empty
- `de-city-berlin-neighbourhoods` — logistics.connectivity is empty
- `de-city-hamburg-hafencity` — logistics.connectivity is empty
- `dk-city-copenhagen-by-neighbourhood-block` — logistics.connectivity is empty
- `fr-city-paris-arrondissement-blocks` — logistics.connectivity is empty
- `lu-city-ville-fortress` — logistics.connectivity is empty
- `lv-city-riga-art-nouveau-market-halls-daugava` — logistics.connectivity is empty
- `mc-city-riviera-week` — logistics.connectivity is empty
- `nl-city-amsterdam-canal-belt` — logistics.connectivity is empty
- `at-cozy-towns-salzkammergut` — logistics.connectivity is empty
- `be-cozy-towns-bruges-damme-veurne` — logistics.connectivity is empty
- `ch-cozy-towns-appenzell` — logistics.connectivity is empty
- `cz-cozy-towns-south-bohemia-telc` — logistics.connectivity is empty
- `de-cozy-towns-mosel-villages` — logistics.connectivity is empty
- `de-cozy-towns-romantic` — logistics.connectivity is empty
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg` — logistics.connectivity is empty
- `fr-cozy-towns-alsace-villages` — logistics.connectivity is empty
- `fr-cozy-towns-dordogne-perigord` — logistics.connectivity is empty
- …and 75 more

### `missing-booking-windows` — 67 record(s)

- `at-cycling-donauradweg-wachau` — logistics.bookingWindows is empty
- `be-cycling-flemish-ardennes-bergs` — logistics.bookingWindows is empty
- `be-cycling-vennbahn-ardennes` — logistics.bookingWindows is empty
- `cz-cycling-south-bohemia-ponds` — logistics.bookingWindows is empty
- `de-cycling-bodensee-radweg` — logistics.bookingWindows is empty
- `fr-cycling-alsace-vineyard-route` — logistics.bookingWindows is empty
- `lu-cycling-pc-network-moselle-mullerthal` — logistics.bookingWindows is empty
- `nl-cycling-green-heart-waterline` — logistics.bookingWindows is empty
- `nl-cycling-wadden-frisian-dikes` — logistics.bookingWindows is empty
- `at-trail-running-innsbruck-nordkette` — logistics.bookingWindows is empty
- `be-trail-running-hautes-fagnes` — logistics.bookingWindows is empty
- `ch-trail-running-engadin-ridges` — logistics.bookingWindows is empty
- `cz-trail-running-krkonose-ridge` — logistics.bookingWindows is empty
- `de-trail-running-berchtesgaden` — logistics.bookingWindows is empty
- `fr-trail-running-mercantour-vesubie` — logistics.bookingWindows is empty
- `li-trail-running-fuerstensteig-drei-schwestern` — logistics.bookingWindows is empty
- `lu-trail-running-mullerthal` — logistics.bookingWindows is empty
- `mc-trail-running-tete-de-chien-agel` — logistics.bookingWindows is empty
- `de-city-berlin-neighbourhoods` — logistics.bookingWindows is empty
- `lu-city-ville-fortress` — logistics.bookingWindows is empty
- `mc-city-riviera-week` — logistics.bookingWindows is empty
- `nl-city-amsterdam-canal-belt` — logistics.bookingWindows is empty
- `at-cozy-towns-salzkammergut` — logistics.bookingWindows is empty
- `be-cozy-towns-bruges-damme-veurne` — logistics.bookingWindows is empty
- `ch-cozy-towns-appenzell` — logistics.bookingWindows is empty
- `cz-cozy-towns-south-bohemia-telc` — logistics.bookingWindows is empty
- `de-cozy-towns-mosel-villages` — logistics.bookingWindows is empty
- `fr-cozy-towns-alsace-villages` — logistics.bookingWindows is empty
- `fr-cozy-towns-dordogne-perigord` — logistics.bookingWindows is empty
- `lu-cozy-towns-little-switzerland` — logistics.bookingWindows is empty
- `nl-cozy-towns-hanseatic-ijssel` — logistics.bookingWindows is empty
- `at-road-trip-grossglockner-tyrol` — logistics.bookingWindows is empty
- `ch-road-trip-bernina-gotthard-ticino` — logistics.bookingWindows is empty
- `ch-road-trip-passes-furka` — logistics.bookingWindows is empty
- `cz-road-trip-bohemia-castles-spas` — logistics.bookingWindows is empty
- `de-road-trip-black-forest-b500` — logistics.bookingWindows is empty
- `fr-road-trip-route-des-grandes-alpes` — logistics.bookingWindows is empty
- `li-road-trip-rhine-triangle` — logistics.bookingWindows is empty
- `lu-road-trip-ardennes-moselle-loop` — logistics.bookingWindows is empty
- `mc-road-trip-three-corniches-turini` — logistics.bookingWindows is empty
- …and 27 more

### `approximate-coordinates` — 61 record(s)

- `gr-cycling-peloponnese-arcadia` — pin falls back to the Greece capital — no basecamp town resolved
- `hr-cycling-istria-parenzana` — pin falls back to the Croatia capital — no basecamp town resolved
- `it-cycling-puglia-valle-itria` — pin falls back to the Italy capital — no basecamp town resolved
- `me-cycling-kotor-lovcen` — pin falls back to the Montenegro capital — no basecamp town resolved
- `pt-cycling-alentejo-costa-vicentina` — pin falls back to the Portugal capital — no basecamp town resolved
- `si-cycling-soca-brda` — pin falls back to the Slovenia capital — no basecamp town resolved
- `de-trail-running-berchtesgaden` — pin falls back to the Germany capital — no basecamp town resolved
- `es-trail-running-sierra-nevada-alpujarras` — pin falls back to the Spain capital — no basecamp town resolved
- `fr-trail-running-chamonix-balcons` — pin falls back to the France capital — no basecamp town resolved
- `fr-trail-running-mercantour-vesubie` — pin falls back to the France capital — no basecamp town resolved
- `gr-trail-running-zagori-vikos` — pin falls back to the Greece capital — no basecamp town resolved
- `me-trail-running-durmitor` — pin falls back to the Montenegro capital — no basecamp town resolved
- `pt-trail-running-madeira` — pin falls back to the Portugal capital — no basecamp town resolved
- `si-trail-running-julian-alps-bohinj` — pin falls back to the Slovenia capital — no basecamp town resolved
- `ba-cozy-towns-slowly-mostar-blagaj-pocitelj-trebinje` — pin falls back to the Bosnia and Herzegovina capital — no basecamp town resolved
- `fr-cozy-towns-alsace-villages` — pin falls back to the France capital — no basecamp town resolved
- `fr-cozy-towns-dordogne-perigord` — pin falls back to the France capital — no basecamp town resolved
- `it-cozy-towns-umbria` — pin falls back to the Italy capital — no basecamp town resolved
- `mk-cozy-towns-ohrid-bitola` — pin falls back to the North Macedonia capital — no basecamp town resolved
- `pt-cozy-towns-alentejo-villages` — pin falls back to the Portugal capital — no basecamp town resolved
- `gr-road-trip-peloponnese-loop` — pin falls back to the Greece capital — no basecamp town resolved
- `me-road-trip-tara` — pin falls back to the Montenegro capital — no basecamp town resolved
- `si-road-trip-julian-alps-passes` — pin falls back to the Slovenia capital — no basecamp town resolved
- `sk-road-trip-orava-spis` — pin falls back to the Slovakia capital — no basecamp town resolved
- `ad-hiking-coma-pedrosa-madriu` — pin falls back to the Andorra capital — no basecamp town resolved
- `gr-hiking-mount-olympus-refuges` — pin falls back to the Greece capital — no basecamp town resolved
- `it-hiking-alta-via-1-dolomites` — pin falls back to the Italy capital — no basecamp town resolved
- `li-hiking-panorama` — pin falls back to the Liechtenstein capital — no basecamp town resolved
- `si-hiking-triglav-hut-to-hut` — pin falls back to the Slovenia capital — no basecamp town resolved
- `sk-hiking-high-tatras-hut-to-hut` — pin falls back to the Slovakia capital — no basecamp town resolved
- `xk-hiking-peaks-of-the-balkans` — pin falls back to the Kosovo capital — no basecamp town resolved
- `de-culinary-mosel-riesling` — pin falls back to the Germany capital — no basecamp town resolved
- `it-culinary-tuscany-chianti-montalcino` — pin falls back to the Italy capital — no basecamp town resolved
- `pt-culinary-douro-valley` — pin falls back to the Portugal capital — no basecamp town resolved
- `si-culinary-vipava-karst` — pin falls back to the Slovenia capital — no basecamp town resolved
- `ad-winter-sports-grandvalira` — pin falls back to the Andorra capital — no basecamp town resolved
- `ba-winter-sports-jahorina-bjelasnica` — pin falls back to the Bosnia and Herzegovina capital — no basecamp town resolved
- `fr-winter-sports-chamonix-freeride` — pin falls back to the France capital — no basecamp town resolved
- `gr-winter-sports-parnassos-arachova` — pin falls back to the Greece capital — no basecamp town resolved
- `it-winter-sports-dolomiti-superski` — pin falls back to the Italy capital — no basecamp town resolved
- …and 21 more

### `budget-sum-drift` — 60 record(s)

- `dk-cycling-bornholm-round-granite-coast-smokehouse-loop` — low: breakdown sums to €315 against a stated total of €1050 (-70%)
- `dk-cycling-bornholm-round-granite-coast-smokehouse-loop` — high: breakdown sums to €520 against a stated total of €1500 (-65%)
- `ee-cycling-saaremaa-muhu-juniper-island-loop` — low: breakdown sums to €215 against a stated total of €650 (-67%)
- `ee-cycling-saaremaa-muhu-juniper-island-loop` — high: breakdown sums to €390 against a stated total of €1000 (-61%)
- `se-cycling-kattegattleden-gothenburg-helsingborg` — low: breakdown sums to €345 against a stated total of €1150 (-70%)
- `se-cycling-kattegattleden-gothenburg-helsingborg` — high: breakdown sums to €555 against a stated total of €1650 (-66%)
- `fo-trail-running-faroese-ridgelines-streymoy-vagar` — low: breakdown sums to €505 against a stated total of €1700 (-70%)
- `fo-trail-running-faroese-ridgelines-streymoy-vagar` — high: breakdown sums to €865 against a stated total of €2500 (-65%)
- `ie-trail-running-wicklow-granite-dublin-mountains-lugnaquilla` — low: breakdown sums to €285 against a stated total of €900 (-68%)
- `ie-trail-running-wicklow-granite-dublin-mountains-lugnaquilla` — high: breakdown sums to €500 against a stated total of €1350 (-63%)
- `no-trail-running-romsdal-ridges-andalsnes-skyrunning-week` — low: breakdown sums to €460 against a stated total of €1600 (-71%)
- `no-trail-running-romsdal-ridges-andalsnes-skyrunning-week` — high: breakdown sums to €770 against a stated total of €2300 (-67%)
- `dk-city-copenhagen-by-neighbourhood-block` — low: breakdown sums to €345 against a stated total of €1600 (-78%)
- `dk-city-copenhagen-by-neighbourhood-block` — high: breakdown sums to €630 against a stated total of €2600 (-76%)
- `ee-city-tallinn-limestone-bastions-telliskivi` — low: breakdown sums to €195 against a stated total of €800 (-76%)
- `ee-city-tallinn-limestone-bastions-telliskivi` — high: breakdown sums to €390 against a stated total of €1300 (-70%)
- `lv-city-riga-art-nouveau-market-halls-daugava` — low: breakdown sums to €180 against a stated total of €700 (-74%)
- `lv-city-riga-art-nouveau-market-halls-daugava` — high: breakdown sums to €360 against a stated total of €1150 (-69%)
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg` — low: breakdown sums to €330 against a stated total of €1050 (-69%)
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg` — high: breakdown sums to €570 against a stated total of €1600 (-64%)
- `lt-cozy-towns-curonian-spit-nida-juodkrante-dune-villages` — low: breakdown sums to €240 against a stated total of €700 (-66%)
- `lt-cozy-towns-curonian-spit-nida-juodkrante-dune-villages` — high: breakdown sums to €450 against a stated total of €1100 (-59%)
- `lv-cozy-towns-kurzeme-slow-week-kuldiga-sabile-talsi` — low: breakdown sums to €235 against a stated total of €600 (-61%)
- `lv-cozy-towns-kurzeme-slow-week-kuldiga-sabile-talsi` — high: breakdown sums to €415 against a stated total of €950 (-56%)
- `fo-road-trip-subsea-loop` — low: breakdown sums to €675 against a stated total of €1800 (-62%)
- `fo-road-trip-subsea-loop` — high: breakdown sums to €1090 against a stated total of €2600 (-58%)
- `ie-road-trip-wild-atlantic-way-dingle-iveragh-burren` — low: breakdown sums to €615 against a stated total of €1600 (-62%)
- `ie-road-trip-wild-atlantic-way-dingle-iveragh-burren` — high: breakdown sums to €1010 against a stated total of €2400 (-58%)
- `no-road-trip-lofoten-e10-fishing-villages-arctic-light` — low: breakdown sums to €775 against a stated total of €2000 (-61%)
- `no-road-trip-lofoten-e10-fishing-villages-arctic-light` — high: breakdown sums to €1310 against a stated total of €3000 (-56%)
- `fi-hiking-hetta-pallas-wilderness-traverse` — low: breakdown sums to €202 against a stated total of €600 (-66%)
- `fi-hiking-hetta-pallas-wilderness-traverse` — high: breakdown sums to €365 against a stated total of €950 (-62%)
- `no-hiking-jotunheimen-hut-to-hut-besseggen-fannaraken` — low: breakdown sums to €400 against a stated total of €1300 (-69%)
- `no-hiking-jotunheimen-hut-to-hut-besseggen-fannaraken` — high: breakdown sums to €625 against a stated total of €1900 (-67%)
- `se-hiking-kungsleden-north-abisko-nikkaluokta` — low: breakdown sums to €430 against a stated total of €1100 (-61%)
- `se-hiking-kungsleden-north-abisko-nikkaluokta` — high: breakdown sums to €700 against a stated total of €1600 (-56%)
- `ie-culinary-west-cork-larder-ballymaloe-skibbereen` — low: breakdown sums to €660 against a stated total of €1900 (-65%)
- `ie-culinary-west-cork-larder-ballymaloe-skibbereen` — high: breakdown sums to €1170 against a stated total of €2900 (-60%)
- `lt-culinary-vilnius-aukstaitija-farmhouse-ale-mead` — low: breakdown sums to €350 against a stated total of €850 (-59%)
- `lt-culinary-vilnius-aukstaitija-farmhouse-ale-mead` — high: breakdown sums to €605 against a stated total of €1350 (-55%)
- …and 20 more

### `gateway-coordinates` — 54 record(s)

- `be-cycling-vennbahn-ardennes` — pin sits on the gateway city (Brussels), not on the trip's basecamp
- `lu-cycling-pc-network-moselle-mullerthal` — pin sits on the gateway city (Luxembourg), not on the trip's basecamp
- `be-trail-running-hautes-fagnes` — pin sits on the gateway city (Brussels), not on the trip's basecamp
- `bg-trail-running-rila-pirin` — pin sits on the gateway city (Sofia), not on the trip's basecamp
- `ch-trail-running-engadin-ridges` — pin sits on the gateway city (Zürich), not on the trip's basecamp
- `cz-trail-running-krkonose-ridge` — pin sits on the gateway city (Prague), not on the trip's basecamp
- `hr-trail-running-velebit-premuzic` — pin sits on the gateway city (Zadar), not on the trip's basecamp
- `lu-trail-running-mullerthal` — pin sits on the gateway city (Luxembourg), not on the trip's basecamp
- `pl-trail-running-karkonosze-stolowe` — pin sits on the gateway city (Wrocław), not on the trip's basecamp
- `at-cozy-towns-salzkammergut` — pin sits on the gateway city (Salzburg), not on the trip's basecamp
- `bg-cozy-towns-revival` — pin sits on the gateway city (Sofia), not on the trip's basecamp
- `ch-cozy-towns-appenzell` — pin sits on the gateway city (Zürich), not on the trip's basecamp
- `cz-cozy-towns-south-bohemia-telc` — pin sits on the gateway city (Prague), not on the trip's basecamp
- `de-cozy-towns-mosel-villages` — pin sits on the gateway city (Frankfurt am Main), not on the trip's basecamp
- `de-cozy-towns-romantic` — pin sits on the gateway city (Nuremberg), not on the trip's basecamp
- `gr-cozy-towns-pelion` — pin sits on the gateway city (Thessaloníki), not on the trip's basecamp
- `at-road-trip-grossglockner-tyrol` — pin sits on the gateway city (Innsbruck), not on the trip's basecamp
- `ch-road-trip-passes-furka` — pin sits on the gateway city (Zürich), not on the trip's basecamp
- `pt-road-trip-n2-serra-estrela` — pin sits on the gateway city (Porto), not on the trip's basecamp
- `at-hiking-berliner-hoehenweg` — pin sits on the gateway city (Innsbruck), not on the trip's basecamp
- `at-hiking-stubai-hoehenweg` — pin sits on the gateway city (Innsbruck), not on the trip's basecamp
- `ba-hiking-sutjeska-via-dinarica` — pin sits on the gateway city (Sarajevo), not on the trip's basecamp
- `be-hiking-ardennes-gr57-ourthe` — pin sits on the gateway city (Brussels), not on the trip's basecamp
- `bg-hiking-pirin-hut-to-hut` — pin sits on the gateway city (Sofia), not on the trip's basecamp
- `ch-hiking-berner-oberland-huts` — pin sits on the gateway city (Zürich), not on the trip's basecamp
- `ch-hiking-walkers-haute-route-valais` — pin sits on the gateway city (Geneva), not on the trip's basecamp
- `cz-hiking-bohemian-switzerland` — pin sits on the gateway city (Prague), not on the trip's basecamp
- `de-hiking-allgaeu-heilbronner-weg` — pin sits on the gateway city (Memmingen), not on the trip's basecamp
- `es-hiking-ordesa-pyrenees-gr11` — pin sits on the gateway city (Zaragoza), not on the trip's basecamp
- `fr-hiking-gr54-ecrins` — pin sits on the gateway city (Grenoble), not on the trip's basecamp
- `lu-hiking-escapardenne-eislek` — pin sits on the gateway city (Luxembourg), not on the trip's basecamp
- `at-culinary-wachau-gruner-veltliner` — pin sits on the gateway city (Vienna), not on the trip's basecamp
- `hr-culinary-istria-truffles` — pin sits on the gateway city (Pula), not on the trip's basecamp
- `lu-culinary-moselle-cremant` — pin sits on the gateway city (Luxembourg), not on the trip's basecamp
- `at-winter-sports-arlberg-st-anton` — pin sits on the gateway city (Innsbruck), not on the trip's basecamp
- `at-winter-sports-kitzbuehel-kitzski` — pin sits on the gateway city (Innsbruck), not on the trip's basecamp
- `be-winter-sports-hautes-fagnes-nordic` — pin sits on the gateway city (Liège), not on the trip's basecamp
- `bg-winter-sports-bansko-pirin` — pin sits on the gateway city (Sofia), not on the trip's basecamp
- `ch-winter-sports-engelberg-titlis-freeride` — pin sits on the gateway city (Zürich), not on the trip's basecamp
- `ch-winter-sports-verbier-4-vallees` — pin sits on the gateway city (Geneva), not on the trip's basecamp
- …and 14 more

### `missing-type-detail` — 44 record(s)

- `at-trail-running-innsbruck-nordkette` — no technical rating captured for this trip type
- `be-trail-running-hautes-fagnes` — no technical rating captured for this trip type
- `bg-trail-running-rila-pirin` — no technical rating captured for this trip type
- `ch-trail-running-engadin-ridges` — no technical rating captured for this trip type
- `cz-trail-running-krkonose-ridge` — no technical rating captured for this trip type
- `de-trail-running-berchtesgaden` — no technical rating captured for this trip type
- `fr-trail-running-chamonix-balcons` — no technical rating captured for this trip type
- `fr-trail-running-mercantour-vesubie` — no technical rating captured for this trip type
- `li-trail-running-fuerstensteig-drei-schwestern` — no technical rating captured for this trip type
- `lu-trail-running-mullerthal` — no technical rating captured for this trip type
- `mc-trail-running-tete-de-chien-agel` — no technical rating captured for this trip type
- `ro-trail-running-piatra-craiului-bucegi` — no technical rating captured for this trip type
- `at-city-vienna-ring-and-beyond` — no transit pass detail captured for this trip type
- `be-city-antwerp-and-ghent` — no transit pass detail captured for this trip type
- `cz-city-brno-modernism` — no transit pass detail captured for this trip type
- `cz-city-prague-layered` — no transit pass detail captured for this trip type
- `de-city-berlin-neighbourhoods` — no transit pass detail captured for this trip type
- `de-city-hamburg-hafencity` — no transit pass detail captured for this trip type
- `fr-city-paris-arrondissement-blocks` — no transit pass detail captured for this trip type
- `it-city-rome` — no transit pass detail captured for this trip type
- `lu-city-ville-fortress` — no transit pass detail captured for this trip type
- `mc-city-riviera-week` — no transit pass detail captured for this trip type
- `nl-city-amsterdam-canal-belt` — no transit pass detail captured for this trip type
- `at-hiking-berliner-hoehenweg` — no hut booking path captured for this trip type
- `at-hiking-stubai-hoehenweg` — no hut booking path captured for this trip type
- `be-hiking-ardennes-gr57-ourthe` — no hut booking path captured for this trip type
- `ch-hiking-berner-oberland-huts` — no hut booking path captured for this trip type
- `ch-hiking-walkers-haute-route-valais` — no hut booking path captured for this trip type
- `cz-hiking-bohemian-switzerland` — no hut booking path captured for this trip type
- `de-hiking-allgaeu-heilbronner-weg` — no hut booking path captured for this trip type
- `fr-hiking-gr54-ecrins` — no hut booking path captured for this trip type
- `li-hiking-panorama` — no hut booking path captured for this trip type
- `lu-hiking-escapardenne-eislek` — no hut booking path captured for this trip type
- `at-winter-sports-arlberg-st-anton` — no lift network / pass detail captured for this trip type
- `at-winter-sports-kitzbuehel-kitzski` — no lift network / pass detail captured for this trip type
- `be-winter-sports-hautes-fagnes-nordic` — no lift network / pass detail captured for this trip type
- `ch-winter-sports-engelberg-titlis-freeride` — no lift network / pass detail captured for this trip type
- `ch-winter-sports-verbier-4-vallees` — no lift network / pass detail captured for this trip type
- `cz-winter-sports-krkonose-spindleruv-mlyn` — no lift network / pass detail captured for this trip type
- `de-winter-sports-garmisch-zugspitze` — no lift network / pass detail captured for this trip type
- …and 4 more

### `missing-evening` — 30 record(s)

- `dk-cycling-bornholm-round-granite-coast-smokehouse-loop` — day 7 has no evening block
- `ee-cycling-saaremaa-muhu-juniper-island-loop` — day 7 has no evening block
- `se-cycling-kattegattleden-gothenburg-helsingborg` — day 7 has no evening block
- `fo-trail-running-faroese-ridgelines-streymoy-vagar` — day 7 has no evening block
- `ie-trail-running-wicklow-granite-dublin-mountains-lugnaquilla` — day 7 has no evening block
- `no-trail-running-romsdal-ridges-andalsnes-skyrunning-week` — day 7 has no evening block
- `dk-city-copenhagen-by-neighbourhood-block` — day 7 has no evening block
- `ee-city-tallinn-limestone-bastions-telliskivi` — day 7 has no evening block
- `lv-city-riga-art-nouveau-market-halls-daugava` — day 7 has no evening block
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg` — day 7 has no evening block
- `lt-cozy-towns-curonian-spit-nida-juodkrante-dune-villages` — day 7 has no evening block
- `lv-cozy-towns-kurzeme-slow-week-kuldiga-sabile-talsi` — day 7 has no evening block
- `fo-road-trip-subsea-loop` — day 7 has no evening block
- `ie-road-trip-wild-atlantic-way-dingle-iveragh-burren` — day 7 has no evening block
- `no-road-trip-lofoten-e10-fishing-villages-arctic-light` — day 7 has no evening block
- `fi-hiking-hetta-pallas-wilderness-traverse` — day 7 has no evening block
- `no-hiking-jotunheimen-hut-to-hut-besseggen-fannaraken` — day 7 has no evening block
- `se-hiking-kungsleden-north-abisko-nikkaluokta` — day 7 has no evening block
- `ie-culinary-west-cork-larder-ballymaloe-skibbereen` — day 7 has no evening block
- `lt-culinary-vilnius-aukstaitija-farmhouse-ale-mead` — day 7 has no evening block
- `se-culinary-skane-country-osterlen-kullabygden` — day 7 has no evening block
- `fi-winter-sports-levi-yllas-lapland-twin-resort-ski` — day 7 has no evening block
- `no-winter-sports-hemsedal-hallingdal-and-nordic` — day 7 has no evening block
- `se-winter-sports-are-lift-linked-capital` — day 7 has no evening block
- `fi-nature-escape-saimaa-lakeland-linnansaari-kolovesi-cabin-week` — day 7 has no evening block
- `fo-nature-escape-suduroy-mykines-faroese-isolation-week` — day 7 has no evening block
- `lv-nature-escape-gauja-slitere-latvian-forest-cabin-week` — day 7 has no evening block
- `dk-water-sports-cold-hawaii-klitmoller-vorupor-thy` — day 7 has no evening block
- `ee-water-sports-west-estonian-coast-parnu-ristna-sorve` — day 7 has no evening block
- `lt-water-sports-curonian-lagoon-svencele-nida-kite-week` — day 7 has no evening block

### `missing-gateway` — 30 record(s)

- `dk-cycling-bornholm-round-granite-coast-smokehouse-loop` — no gateway airport named on the record
- `ee-cycling-saaremaa-muhu-juniper-island-loop` — no gateway airport named on the record
- `se-cycling-kattegattleden-gothenburg-helsingborg` — no gateway airport named on the record
- `fo-trail-running-faroese-ridgelines-streymoy-vagar` — no gateway airport named on the record
- `ie-trail-running-wicklow-granite-dublin-mountains-lugnaquilla` — no gateway airport named on the record
- `no-trail-running-romsdal-ridges-andalsnes-skyrunning-week` — no gateway airport named on the record
- `dk-city-copenhagen-by-neighbourhood-block` — no gateway airport named on the record
- `ee-city-tallinn-limestone-bastions-telliskivi` — no gateway airport named on the record
- `lv-city-riga-art-nouveau-market-halls-daugava` — no gateway airport named on the record
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg` — no gateway airport named on the record
- `lt-cozy-towns-curonian-spit-nida-juodkrante-dune-villages` — no gateway airport named on the record
- `lv-cozy-towns-kurzeme-slow-week-kuldiga-sabile-talsi` — no gateway airport named on the record
- `fo-road-trip-subsea-loop` — no gateway airport named on the record
- `ie-road-trip-wild-atlantic-way-dingle-iveragh-burren` — no gateway airport named on the record
- `no-road-trip-lofoten-e10-fishing-villages-arctic-light` — no gateway airport named on the record
- `fi-hiking-hetta-pallas-wilderness-traverse` — no gateway airport named on the record
- `no-hiking-jotunheimen-hut-to-hut-besseggen-fannaraken` — no gateway airport named on the record
- `se-hiking-kungsleden-north-abisko-nikkaluokta` — no gateway airport named on the record
- `ie-culinary-west-cork-larder-ballymaloe-skibbereen` — no gateway airport named on the record
- `lt-culinary-vilnius-aukstaitija-farmhouse-ale-mead` — no gateway airport named on the record
- `se-culinary-skane-country-osterlen-kullabygden` — no gateway airport named on the record
- `fi-winter-sports-levi-yllas-lapland-twin-resort-ski` — no gateway airport named on the record
- `no-winter-sports-hemsedal-hallingdal-and-nordic` — no gateway airport named on the record
- `se-winter-sports-are-lift-linked-capital` — no gateway airport named on the record
- `fi-nature-escape-saimaa-lakeland-linnansaari-kolovesi-cabin-week` — no gateway airport named on the record
- `fo-nature-escape-suduroy-mykines-faroese-isolation-week` — no gateway airport named on the record
- `lv-nature-escape-gauja-slitere-latvian-forest-cabin-week` — no gateway airport named on the record
- `dk-water-sports-cold-hawaii-klitmoller-vorupor-thy` — no gateway airport named on the record
- `ee-water-sports-west-estonian-coast-parnu-ristna-sorve` — no gateway airport named on the record
- `lt-water-sports-curonian-lagoon-svencele-nida-kite-week` — no gateway airport named on the record

### `missing-difficulty` — 21 record(s)

- `dk-city-copenhagen-by-neighbourhood-block` — no difficulty rating in the source record
- `ee-city-tallinn-limestone-bastions-telliskivi` — no difficulty rating in the source record
- `lv-city-riga-art-nouveau-market-halls-daugava` — no difficulty rating in the source record
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg` — no difficulty rating in the source record
- `lt-cozy-towns-curonian-spit-nida-juodkrante-dune-villages` — no difficulty rating in the source record
- `lv-cozy-towns-kurzeme-slow-week-kuldiga-sabile-talsi` — no difficulty rating in the source record
- `fo-road-trip-subsea-loop` — no difficulty rating in the source record
- `ie-road-trip-wild-atlantic-way-dingle-iveragh-burren` — no difficulty rating in the source record
- `no-road-trip-lofoten-e10-fishing-villages-arctic-light` — no difficulty rating in the source record
- `ie-culinary-west-cork-larder-ballymaloe-skibbereen` — no difficulty rating in the source record
- `lt-culinary-vilnius-aukstaitija-farmhouse-ale-mead` — no difficulty rating in the source record
- `se-culinary-skane-country-osterlen-kullabygden` — no difficulty rating in the source record
- `fi-winter-sports-levi-yllas-lapland-twin-resort-ski` — no difficulty rating in the source record
- `no-winter-sports-hemsedal-hallingdal-and-nordic` — no difficulty rating in the source record
- `se-winter-sports-are-lift-linked-capital` — no difficulty rating in the source record
- `fi-nature-escape-saimaa-lakeland-linnansaari-kolovesi-cabin-week` — no difficulty rating in the source record
- `fo-nature-escape-suduroy-mykines-faroese-isolation-week` — no difficulty rating in the source record
- `lv-nature-escape-gauja-slitere-latvian-forest-cabin-week` — no difficulty rating in the source record
- `dk-water-sports-cold-hawaii-klitmoller-vorupor-thy` — no difficulty rating in the source record
- `ee-water-sports-west-estonian-coast-parnu-ristna-sorve` — no difficulty rating in the source record
- `lt-water-sports-curonian-lagoon-svencele-nida-kite-week` — no difficulty rating in the source record

## Notices

- `generated-summary` — 30 record(s); e.g. `dk-cycling-bornholm-round-granite-coast-smokehouse-loop`: summary composed from metadata — no editorial summary in the source

## Coverage

| Region | Trips |
|---|---|
| Western & Central Europe | 100 |
| Southern & Mediterranean Europe | 70 |
| Eastern & Southeastern Europe | 53 |
| Northern Europe & Baltics | 30 |

| Trip type | Trips |
|---|---|
| Cycling Trips | 26 |
| Trail Running | 25 |
| City Trips | 26 |
| Cozy Towns Trips | 26 |
| Road Trips & Scenic Drives | 26 |
| Hiking & Alpine Trekking | 24 |
| Culinary & Wine Tours | 26 |
| Winter Sports & Skiing | 24 |
| Nature Escapes & Cabin Stays | 26 |
| Water Sports & Coastal Trips | 24 |

| Country | Trips |
|---|---|
| France | 16 |
| Germany | 13 |
| Austria | 12 |
| Belgium | 11 |
| Czechia | 11 |
| Italy | 11 |
| Bulgaria | 10 |
| Netherlands | 10 |
| Poland | 10 |
| Romania | 10 |
| Spain | 10 |
| Switzerland | 10 |
| Greece | 9 |
| Slovakia | 9 |
| Hungary | 8 |
| Luxembourg | 8 |
| Portugal | 8 |
| Moldova | 6 |
| Slovenia | 6 |
| Croatia | 5 |
| Monaco | 5 |
| Bosnia and Herzegovina | 4 |
| Denmark | 4 |
| Liechtenstein | 4 |
| Montenegro | 4 |
| Norway | 4 |
| Sweden | 4 |
| Albania | 3 |
| Estonia | 3 |
| Faroe Islands | 3 |
| Finland | 3 |
| Ireland | 3 |
| Latvia | 3 |
| Lithuania | 3 |
| North Macedonia | 3 |
| Andorra | 2 |
| Kosovo | 2 |
| Serbia | 2 |
| San Marino | 1 |
