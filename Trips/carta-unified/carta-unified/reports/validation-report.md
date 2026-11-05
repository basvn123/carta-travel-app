# Carta master dataset validation report

Dataset: **258 trips**, schema v2.0, generated 2026-09-02

**0 errors, 725 warnings, 30 notices**

## Issue counts by check

| Check | Level | Count |
|---|---|---|
| `word-cap` | WARNING | 236 |
| `no-sleep-lines` | WARNING | 183 |
| `missing-connectivity` | WARNING | 115 |
| `missing-type-detail` | WARNING | 44 |
| `missing-evening` | WARNING | 35 |
| `missing-gateway` | WARNING | 30 |
| `generated-summary` | INFO | 30 |
| `missing-difficulty` | WARNING | 21 |
| `missing-booking-windows` | WARNING | 20 |
| `coordinate-far-from-itinerary` | WARNING | 18 |
| `place-outside-country` | WARNING | 18 |
| `thin-pro-tips` | WARNING | 4 |
| `thin-accommodation` | WARNING | 1 |

## Errors

None. Every record satisfies the hard schema contract.

## Warnings by check

### `word-cap`: 236 record(s)

- `at-cycling-donauradweg-wachau`: 0 summary, 5 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 53; first: word-cap: itinerary[0].morning: 50 words, cap 45
- `be-cycling-flemish-ardennes-bergs`: 0 summary, 3 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 67; first: word-cap: itinerary[0].morning: 67 words, cap 45
- `be-cycling-vennbahn-ardennes`: 0 summary, 2 day blocks and 2 pro tips over their caps (120, 45 and 35 words); longest 51; first: word-cap: itinerary[1].morning: 47 words, cap 45
- `bg-cycling-danube-eurovelo6`: 0 summary, 3 day blocks and 1 pro tips over their caps (120, 45 and 35 words); longest 70; first: word-cap: itinerary[1].afternoon: 49 words, cap 45
- `cz-cycling-south-bohemia-ponds`: 0 summary, 0 day blocks and 1 pro tips over their caps (120, 45 and 35 words); longest 37; first: word-cap: proTips[0]: 37 words, cap 35
- `de-cycling-bodensee-radweg`: 0 summary, 2 day blocks and 1 pro tips over their caps (120, 45 and 35 words); longest 49; first: word-cap: itinerary[0].morning: 46 words, cap 45
- `dk-cycling-bornholm-round-granite-coast-smokehouse-loop`: 0 summary, 1 day blocks and 1 pro tips over their caps (120, 45 and 35 words); longest 49; first: word-cap: itinerary[0].morning: 49 words, cap 45
- `ee-cycling-saaremaa-muhu-juniper-island-loop`: 0 summary, 2 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 47; first: word-cap: itinerary[1].afternoon: 47 words, cap 45
- `es-cycling-girona-costa-brava`: 1 summary, 1 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 132; first: word-cap: summary: 132 words, cap 120
- `fr-cycling-alsace-vineyard-route`: 0 summary, 5 day blocks and 1 pro tips over their caps (120, 45 and 35 words); longest 82; first: word-cap: itinerary[0].morning: 82 words, cap 45
- `fr-cycling-loire-a-velo`: 0 summary, 2 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 50; first: word-cap: itinerary[0].afternoon: 50 words, cap 45
- `gr-cycling-peloponnese-arcadia`: 0 summary, 0 day blocks and 1 pro tips over their caps (120, 45 and 35 words); longest 39; first: word-cap: proTips[7]: 39 words, cap 35
- `hr-cycling-istria-parenzana`: 0 summary, 1 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 51; first: word-cap: itinerary[4].morning: 51 words, cap 45
- `hu-cycling-balaton-ring`: 0 summary, 1 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 73; first: word-cap: itinerary[5].afternoon: 73 words, cap 45
- `lu-cycling-pc-network-moselle-mullerthal`: 0 summary, 6 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 57; first: word-cap: itinerary[0].morning: 55 words, cap 45
- `md-cycling-country`: 0 summary, 2 day blocks and 5 pro tips over their caps (120, 45 and 35 words); longest 83; first: word-cap: itinerary[2].morning: 51 words, cap 45
- `me-cycling-kotor-lovcen`: 1 summary, 3 day blocks and 5 pro tips over their caps (120, 45 and 35 words); longest 124; first: word-cap: summary: 124 words, cap 120
- `nl-cycling-green-heart-waterline`: 0 summary, 1 day blocks and 1 pro tips over their caps (120, 45 and 35 words); longest 64; first: word-cap: itinerary[0].morning: 64 words, cap 45
- `nl-cycling-wadden-frisian-dikes`: 0 summary, 3 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 48; first: word-cap: itinerary[0].morning: 46 words, cap 45
- `pl-cycling-green-velo-podlasie`: 0 summary, 11 day blocks and 2 pro tips over their caps (120, 45 and 35 words); longest 142; first: word-cap: itinerary[1].morning: 47 words, cap 45
- `pt-cycling-alentejo-costa-vicentina`: 0 summary, 1 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 61; first: word-cap: itinerary[4].afternoon: 61 words, cap 45
- `se-cycling-kattegattleden-gothenburg-helsingborg`: 0 summary, 1 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 48; first: word-cap: itinerary[2].afternoon: 48 words, cap 45
- `sk-cycling-vah-danube`: 0 summary, 3 day blocks and 3 pro tips over their caps (120, 45 and 35 words); longest 53; first: word-cap: itinerary[1].morning: 53 words, cap 45
- `at-trail-running-innsbruck-nordkette`: 0 summary, 2 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 52; first: word-cap: itinerary[1].morning: 50 words, cap 45
- `be-trail-running-hautes-fagnes`: 0 summary, 2 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 61; first: word-cap: itinerary[0].afternoon: 61 words, cap 45
- `bg-trail-running-rila-pirin`: 0 summary, 1 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 55; first: word-cap: itinerary[3].morning: 55 words, cap 45
- `ch-trail-running-engadin-ridges`: 0 summary, 4 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 55; first: word-cap: itinerary[0].afternoon: 55 words, cap 45
- `cz-trail-running-krkonose-ridge`: 0 summary, 5 day blocks and 4 pro tips over their caps (120, 45 and 35 words); longest 64; first: word-cap: itinerary[1].afternoon: 64 words, cap 45
- `de-trail-running-berchtesgaden`: 0 summary, 4 day blocks and 1 pro tips over their caps (120, 45 and 35 words); longest 65; first: word-cap: itinerary[0].afternoon: 55 words, cap 45
- `es-trail-running-sierra-nevada-alpujarras`: 1 summary, 2 day blocks and 3 pro tips over their caps (120, 45 and 35 words); longest 136; first: word-cap: summary: 136 words, cap 120
- `fo-trail-running-faroese-ridgelines-streymoy-vagar`: 0 summary, 0 day blocks and 2 pro tips over their caps (120, 45 and 35 words); longest 41; first: word-cap: proTips[0]: 37 words, cap 35
- `fr-trail-running-chamonix-balcons`: 0 summary, 7 day blocks and 2 pro tips over their caps (120, 45 and 35 words); longest 73; first: word-cap: itinerary[0].afternoon: 62 words, cap 45
- `fr-trail-running-mercantour-vesubie`: 0 summary, 4 day blocks and 3 pro tips over their caps (120, 45 and 35 words); longest 66; first: word-cap: itinerary[1].morning: 54 words, cap 45
- `gr-trail-running-zagori-vikos`: 0 summary, 1 day blocks and 1 pro tips over their caps (120, 45 and 35 words); longest 48; first: word-cap: itinerary[2].morning: 46 words, cap 45
- `hr-trail-running-velebit-premuzic`: 1 summary, 1 day blocks and 3 pro tips over their caps (120, 45 and 35 words); longest 146; first: word-cap: summary: 146 words, cap 120
- `hu-trail-running-bukk-matra`: 0 summary, 4 day blocks and 3 pro tips over their caps (120, 45 and 35 words); longest 52; first: word-cap: itinerary[2].morning: 52 words, cap 45
- `ie-trail-running-wicklow-granite-dublin-mountains-lugnaquilla`: 0 summary, 3 day blocks and 2 pro tips over their caps (120, 45 and 35 words); longest 69; first: word-cap: itinerary[3].morning: 50 words, cap 45
- `it-trail-running-dolomites-cortina`: 1 summary, 4 day blocks and 4 pro tips over their caps (120, 45 and 35 words); longest 125; first: word-cap: summary: 125 words, cap 120
- `li-trail-running-fuerstensteig-drei-schwestern`: 0 summary, 6 day blocks and 1 pro tips over their caps (120, 45 and 35 words); longest 61; first: word-cap: itinerary[2].morning: 60 words, cap 45
- `lu-trail-running-mullerthal`: 0 summary, 2 day blocks and 0 pro tips over their caps (120, 45 and 35 words); longest 54; first: word-cap: itinerary[1].morning: 46 words, cap 45
- …and 196 more

### `no-sleep-lines`: 183 record(s)

- `at-cycling-donauradweg-wachau`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `be-cycling-flemish-ardennes-bergs`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `be-cycling-vennbahn-ardennes`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `bg-cycling-danube-eurovelo6`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `cz-cycling-south-bohemia-ponds`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `de-cycling-bodensee-radweg`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `dk-cycling-bornholm-round-granite-coast-smokehouse-loop`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `ee-cycling-saaremaa-muhu-juniper-island-loop`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `fr-cycling-alsace-vineyard-route`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `fr-cycling-loire-a-velo`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `hu-cycling-balaton-ring`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `lu-cycling-pc-network-moselle-mullerthal`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `md-cycling-country`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `nl-cycling-green-heart-waterline`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `nl-cycling-wadden-frisian-dikes`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `pl-cycling-green-velo-podlasie`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `ro-cycling-via-transilvanica`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `se-cycling-kattegattleden-gothenburg-helsingborg`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `sk-cycling-vah-danube`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `at-trail-running-innsbruck-nordkette`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `be-trail-running-hautes-fagnes`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `bg-trail-running-rila-pirin`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `ch-trail-running-engadin-ridges`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `cz-trail-running-krkonose-ridge`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `de-trail-running-berchtesgaden`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `fo-trail-running-faroese-ridgelines-streymoy-vagar`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `fr-trail-running-chamonix-balcons`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `fr-trail-running-mercantour-vesubie`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `hu-trail-running-bukk-matra`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `ie-trail-running-wicklow-granite-dublin-mountains-lugnaquilla`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `li-trail-running-fuerstensteig-drei-schwestern`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `lu-trail-running-mullerthal`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `mc-trail-running-tete-de-chien-agel`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `no-trail-running-romsdal-ridges-andalsnes-skyrunning-week`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `pl-trail-running-karkonosze-stolowe`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `ro-trail-running-piatra-craiului-bucegi`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `sk-trail-running-mala-fatra-low-tatras`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `at-city-vienna-ring-and-beyond`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `be-city-antwerp-and-ghent`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- `bg-city-sofia-plovdiv`: no day names where the night is spent, so the accommodation strategy cannot be checked against the itinerary
- …and 143 more

### `missing-connectivity`: 115 record(s)

- `at-cycling-donauradweg-wachau`: logistics.connectivity is empty
- `be-cycling-flemish-ardennes-bergs`: logistics.connectivity is empty
- `be-cycling-vennbahn-ardennes`: logistics.connectivity is empty
- `cz-cycling-south-bohemia-ponds`: logistics.connectivity is empty
- `de-cycling-bodensee-radweg`: logistics.connectivity is empty
- `fr-cycling-alsace-vineyard-route`: logistics.connectivity is empty
- `fr-cycling-loire-a-velo`: logistics.connectivity is empty
- `lu-cycling-pc-network-moselle-mullerthal`: logistics.connectivity is empty
- `nl-cycling-green-heart-waterline`: logistics.connectivity is empty
- `nl-cycling-wadden-frisian-dikes`: logistics.connectivity is empty
- `se-cycling-kattegattleden-gothenburg-helsingborg`: logistics.connectivity is empty
- `at-trail-running-innsbruck-nordkette`: logistics.connectivity is empty
- `ch-trail-running-engadin-ridges`: logistics.connectivity is empty
- `cz-trail-running-krkonose-ridge`: logistics.connectivity is empty
- `de-trail-running-berchtesgaden`: logistics.connectivity is empty
- `fr-trail-running-chamonix-balcons`: logistics.connectivity is empty
- `fr-trail-running-mercantour-vesubie`: logistics.connectivity is empty
- `li-trail-running-fuerstensteig-drei-schwestern`: logistics.connectivity is empty
- `lu-trail-running-mullerthal`: logistics.connectivity is empty
- `mc-trail-running-tete-de-chien-agel`: logistics.connectivity is empty
- `be-city-antwerp-and-ghent`: logistics.connectivity is empty
- `cz-city-brno-modernism`: logistics.connectivity is empty
- `cz-city-prague-layered`: logistics.connectivity is empty
- `de-city-berlin-neighbourhoods`: logistics.connectivity is empty
- `de-city-hamburg-hafencity`: logistics.connectivity is empty
- `dk-city-copenhagen-by-neighbourhood-block`: logistics.connectivity is empty
- `fr-city-paris-arrondissement-blocks`: logistics.connectivity is empty
- `lu-city-ville-fortress`: logistics.connectivity is empty
- `lv-city-riga-art-nouveau-market-halls-daugava`: logistics.connectivity is empty
- `nl-city-amsterdam-canal-belt`: logistics.connectivity is empty
- `at-cozy-towns-salzkammergut`: logistics.connectivity is empty
- `be-cozy-towns-bruges-damme-veurne`: logistics.connectivity is empty
- `ch-cozy-towns-appenzell`: logistics.connectivity is empty
- `cz-cozy-towns-south-bohemia-telc`: logistics.connectivity is empty
- `de-cozy-towns-mosel-villages`: logistics.connectivity is empty
- `de-cozy-towns-romantic`: logistics.connectivity is empty
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg`: logistics.connectivity is empty
- `fr-cozy-towns-alsace-villages`: logistics.connectivity is empty
- `fr-cozy-towns-dordogne-perigord`: logistics.connectivity is empty
- `lu-cozy-towns-little-switzerland`: logistics.connectivity is empty
- …and 75 more

### `missing-type-detail`: 44 record(s)

- `at-trail-running-innsbruck-nordkette`: no technical rating captured for this trip type
- `be-trail-running-hautes-fagnes`: no technical rating captured for this trip type
- `bg-trail-running-rila-pirin`: no technical rating captured for this trip type
- `ch-trail-running-engadin-ridges`: no technical rating captured for this trip type
- `cz-trail-running-krkonose-ridge`: no technical rating captured for this trip type
- `de-trail-running-berchtesgaden`: no technical rating captured for this trip type
- `fr-trail-running-chamonix-balcons`: no technical rating captured for this trip type
- `fr-trail-running-mercantour-vesubie`: no technical rating captured for this trip type
- `li-trail-running-fuerstensteig-drei-schwestern`: no technical rating captured for this trip type
- `lu-trail-running-mullerthal`: no technical rating captured for this trip type
- `mc-trail-running-tete-de-chien-agel`: no technical rating captured for this trip type
- `ro-trail-running-piatra-craiului-bucegi`: no technical rating captured for this trip type
- `at-city-vienna-ring-and-beyond`: no transit pass detail captured for this trip type
- `be-city-antwerp-and-ghent`: no transit pass detail captured for this trip type
- `cz-city-brno-modernism`: no transit pass detail captured for this trip type
- `cz-city-prague-layered`: no transit pass detail captured for this trip type
- `de-city-berlin-neighbourhoods`: no transit pass detail captured for this trip type
- `de-city-hamburg-hafencity`: no transit pass detail captured for this trip type
- `fr-city-paris-arrondissement-blocks`: no transit pass detail captured for this trip type
- `it-city-rome`: no transit pass detail captured for this trip type
- `lu-city-ville-fortress`: no transit pass detail captured for this trip type
- `nl-city-amsterdam-canal-belt`: no transit pass detail captured for this trip type
- `at-hiking-berliner-hoehenweg`: no hut booking path captured for this trip type
- `at-hiking-stubai-hoehenweg`: no hut booking path captured for this trip type
- `be-hiking-ardennes-gr57-ourthe`: no hut booking path captured for this trip type
- `ch-hiking-berner-oberland-huts`: no hut booking path captured for this trip type
- `ch-hiking-walkers-haute-route-valais`: no hut booking path captured for this trip type
- `cz-hiking-bohemian-switzerland`: no hut booking path captured for this trip type
- `cz-nature-escape-jeseniky-cabin`: no hut booking path captured for this trip type
- `de-hiking-allgaeu-heilbronner-weg`: no hut booking path captured for this trip type
- `fr-hiking-gr54-ecrins`: no hut booking path captured for this trip type
- `li-hiking-panorama`: no hut booking path captured for this trip type
- `lu-hiking-escapardenne-eislek`: no hut booking path captured for this trip type
- `at-winter-sports-arlberg-st-anton`: no lift network / pass detail captured for this trip type
- `at-winter-sports-kitzbuehel-kitzski`: no lift network / pass detail captured for this trip type
- `be-winter-sports-hautes-fagnes-nordic`: no lift network / pass detail captured for this trip type
- `ch-winter-sports-engelberg-titlis-freeride`: no lift network / pass detail captured for this trip type
- `ch-winter-sports-verbier-4-vallees`: no lift network / pass detail captured for this trip type
- `cz-winter-sports-krkonose-spindleruv-mlyn`: no lift network / pass detail captured for this trip type
- `de-winter-sports-garmisch-zugspitze`: no lift network / pass detail captured for this trip type
- …and 4 more

### `missing-evening`: 35 record(s)

- `dk-cycling-bornholm-round-granite-coast-smokehouse-loop`: day 7 has no evening block
- `ee-cycling-saaremaa-muhu-juniper-island-loop`: day 7 has no evening block
- `se-cycling-kattegattleden-gothenburg-helsingborg`: day 7 has no evening block
- `fo-trail-running-faroese-ridgelines-streymoy-vagar`: day 7 has no evening block
- `ie-trail-running-wicklow-granite-dublin-mountains-lugnaquilla`: day 7 has no evening block
- `no-trail-running-romsdal-ridges-andalsnes-skyrunning-week`: day 7 has no evening block
- `dk-city-copenhagen-by-neighbourhood-block`: day 7 has no evening block
- `ee-city-tallinn-limestone-bastions-telliskivi`: day 7 has no evening block
- `lv-city-riga-art-nouveau-market-halls-daugava`: day 7 has no evening block
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg`: day 7 has no evening block
- `lt-cozy-towns-curonian-spit-nida-juodkrante-dune-villages`: day 7 has no evening block
- `lv-cozy-towns-kurzeme-slow-week-kuldiga-sabile-talsi`: day 7 has no evening block
- `fo-road-trip-subsea-loop`: day 7 has no evening block
- `ie-road-trip-wild-atlantic-way-dingle-iveragh-burren`: day 7 has no evening block
- `no-road-trip-lofoten-e10-fishing-villages-arctic-light`: day 7 has no evening block
- `fi-hiking-hetta-pallas-wilderness-traverse`: day 7 has no evening block
- `no-hiking-jotunheimen-hut-to-hut-besseggen-fannaraken`: day 7 has no evening block
- `se-hiking-kungsleden-north-abisko-nikkaluokta`: day 7 has no evening block
- `ie-culinary-west-cork-larder-ballymaloe-skibbereen`: day 7 has no evening block
- `lt-culinary-vilnius-aukstaitija-farmhouse-ale-mead`: day 7 has no evening block
- `se-culinary-skane-country-osterlen-kullabygden`: day 7 has no evening block
- `fi-winter-sports-levi-yllas-lapland-twin-resort-ski`: day 7 has no evening block
- `no-winter-sports-hemsedal-hallingdal-and-nordic`: day 7 has no evening block
- `se-winter-sports-are-lift-linked-capital`: day 7 has no evening block
- `fi-nature-escape-saimaa-lakeland-linnansaari-kolovesi-cabin-week`: day 7 has no evening block
- `fo-nature-escape-suduroy-mykines-faroese-isolation-week`: day 7 has no evening block
- `lv-nature-escape-gauja-slitere-latvian-forest-cabin-week`: day 7 has no evening block
- `dk-water-sports-cold-hawaii-klitmoller-vorupor-thy`: day 7 has no evening block
- `ee-water-sports-west-estonian-coast-parnu-ristna-sorve`: day 7 has no evening block
- `lt-water-sports-curonian-lagoon-svencele-nida-kite-week`: day 7 has no evening block
- `ba-hostel-sarajevo-mostar-kotor`: day 7 has no evening block
- `hr-beach-week-makarska-riviera`: day 7 has no evening block
- `cz-rail-prague-vienna-budapest`: day 7 has no evening block
- `es-pilgrim-camino-sarria-santiago`: day 7 has no evening block
- `gr-island-hopping-paros-antiparos-naxos`: day 7 has no evening block

### `missing-gateway`: 30 record(s)

- `dk-cycling-bornholm-round-granite-coast-smokehouse-loop`: no gateway airport named on the record
- `ee-cycling-saaremaa-muhu-juniper-island-loop`: no gateway airport named on the record
- `se-cycling-kattegattleden-gothenburg-helsingborg`: no gateway airport named on the record
- `fo-trail-running-faroese-ridgelines-streymoy-vagar`: no gateway airport named on the record
- `ie-trail-running-wicklow-granite-dublin-mountains-lugnaquilla`: no gateway airport named on the record
- `no-trail-running-romsdal-ridges-andalsnes-skyrunning-week`: no gateway airport named on the record
- `dk-city-copenhagen-by-neighbourhood-block`: no gateway airport named on the record
- `ee-city-tallinn-limestone-bastions-telliskivi`: no gateway airport named on the record
- `lv-city-riga-art-nouveau-market-halls-daugava`: no gateway airport named on the record
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg`: no gateway airport named on the record
- `lt-cozy-towns-curonian-spit-nida-juodkrante-dune-villages`: no gateway airport named on the record
- `lv-cozy-towns-kurzeme-slow-week-kuldiga-sabile-talsi`: no gateway airport named on the record
- `fo-road-trip-subsea-loop`: no gateway airport named on the record
- `ie-road-trip-wild-atlantic-way-dingle-iveragh-burren`: no gateway airport named on the record
- `no-road-trip-lofoten-e10-fishing-villages-arctic-light`: no gateway airport named on the record
- `fi-hiking-hetta-pallas-wilderness-traverse`: no gateway airport named on the record
- `no-hiking-jotunheimen-hut-to-hut-besseggen-fannaraken`: no gateway airport named on the record
- `se-hiking-kungsleden-north-abisko-nikkaluokta`: no gateway airport named on the record
- `ie-culinary-west-cork-larder-ballymaloe-skibbereen`: no gateway airport named on the record
- `lt-culinary-vilnius-aukstaitija-farmhouse-ale-mead`: no gateway airport named on the record
- `se-culinary-skane-country-osterlen-kullabygden`: no gateway airport named on the record
- `fi-winter-sports-levi-yllas-lapland-twin-resort-ski`: no gateway airport named on the record
- `no-winter-sports-hemsedal-hallingdal-and-nordic`: no gateway airport named on the record
- `se-winter-sports-are-lift-linked-capital`: no gateway airport named on the record
- `fi-nature-escape-saimaa-lakeland-linnansaari-kolovesi-cabin-week`: no gateway airport named on the record
- `fo-nature-escape-suduroy-mykines-faroese-isolation-week`: no gateway airport named on the record
- `lv-nature-escape-gauja-slitere-latvian-forest-cabin-week`: no gateway airport named on the record
- `dk-water-sports-cold-hawaii-klitmoller-vorupor-thy`: no gateway airport named on the record
- `ee-water-sports-west-estonian-coast-parnu-ristna-sorve`: no gateway airport named on the record
- `lt-water-sports-curonian-lagoon-svencele-nida-kite-week`: no gateway airport named on the record

### `missing-difficulty`: 21 record(s)

- `dk-city-copenhagen-by-neighbourhood-block`: no difficulty rating in the source record
- `ee-city-tallinn-limestone-bastions-telliskivi`: no difficulty rating in the source record
- `lv-city-riga-art-nouveau-market-halls-daugava`: no difficulty rating in the source record
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg`: no difficulty rating in the source record
- `lt-cozy-towns-curonian-spit-nida-juodkrante-dune-villages`: no difficulty rating in the source record
- `lv-cozy-towns-kurzeme-slow-week-kuldiga-sabile-talsi`: no difficulty rating in the source record
- `fo-road-trip-subsea-loop`: no difficulty rating in the source record
- `ie-road-trip-wild-atlantic-way-dingle-iveragh-burren`: no difficulty rating in the source record
- `no-road-trip-lofoten-e10-fishing-villages-arctic-light`: no difficulty rating in the source record
- `ie-culinary-west-cork-larder-ballymaloe-skibbereen`: no difficulty rating in the source record
- `lt-culinary-vilnius-aukstaitija-farmhouse-ale-mead`: no difficulty rating in the source record
- `se-culinary-skane-country-osterlen-kullabygden`: no difficulty rating in the source record
- `fi-winter-sports-levi-yllas-lapland-twin-resort-ski`: no difficulty rating in the source record
- `no-winter-sports-hemsedal-hallingdal-and-nordic`: no difficulty rating in the source record
- `se-winter-sports-are-lift-linked-capital`: no difficulty rating in the source record
- `fi-nature-escape-saimaa-lakeland-linnansaari-kolovesi-cabin-week`: no difficulty rating in the source record
- `fo-nature-escape-suduroy-mykines-faroese-isolation-week`: no difficulty rating in the source record
- `lv-nature-escape-gauja-slitere-latvian-forest-cabin-week`: no difficulty rating in the source record
- `dk-water-sports-cold-hawaii-klitmoller-vorupor-thy`: no difficulty rating in the source record
- `ee-water-sports-west-estonian-coast-parnu-ristna-sorve`: no difficulty rating in the source record
- `lt-water-sports-curonian-lagoon-svencele-nida-kite-week`: no difficulty rating in the source record

### `missing-booking-windows`: 20 record(s)

- `be-cycling-flemish-ardennes-bergs`: logistics.bookingWindows is empty
- `lu-cycling-pc-network-moselle-mullerthal`: logistics.bookingWindows is empty
- `at-trail-running-innsbruck-nordkette`: logistics.bookingWindows is empty
- `be-trail-running-hautes-fagnes`: logistics.bookingWindows is empty
- `cz-trail-running-krkonose-ridge`: logistics.bookingWindows is empty
- `lu-trail-running-mullerthal`: logistics.bookingWindows is empty
- `mc-trail-running-tete-de-chien-agel`: logistics.bookingWindows is empty
- `mc-city-riviera-week`: logistics.bookingWindows is empty
- `nl-cozy-towns-hanseatic-ijssel`: logistics.bookingWindows is empty
- `li-road-trip-rhine-triangle`: logistics.bookingWindows is empty
- `lu-road-trip-ardennes-moselle-loop`: logistics.bookingWindows is empty
- `mc-road-trip-three-corniches-turini`: logistics.bookingWindows is empty
- `be-hiking-ardennes-gr57-ourthe`: logistics.bookingWindows is empty
- `cz-nature-escape-jeseniky-cabin`: logistics.bookingWindows is empty
- `se-hiking-kungsleden-north-abisko-nikkaluokta`: logistics.bookingWindows is empty
- `at-nature-escape-gesaeuse-almhuette`: logistics.bookingWindows is empty
- `fr-nature-escape-vosges-cabane`: logistics.bookingWindows is empty
- `be-water-sports-ostend-knokke-sail`: logistics.bookingWindows is empty
- `de-water-sports-ruegen-baltic-wind`: logistics.bookingWindows is empty
- `mc-water-sports-freedive-kayak`: logistics.bookingWindows is empty

### `coordinate-far-from-itinerary`: 18 record(s)

- `at-cycling-donauradweg-wachau`: pin is 60 km from the nearest place the itinerary names (Krems); check it is not a homonym
- `sk-cycling-vah-danube`: pin is 62 km from the nearest place the itinerary names (Trenčín); check it is not a homonym
- `bg-city-sofia-plovdiv`: pin is 132 km from the nearest place the itinerary names (Plovdiv); check it is not a homonym
- `es-city-seville`: pin is 438 km from the nearest place the itinerary names (Santa Cruz); check it is not a homonym
- `md-city-chisinau-tiraspol-comrat`: pin is 61 km from the nearest place the itinerary names (Tiraspol); check it is not a homonym
- `nl-city-amsterdam-canal-belt`: pin is 184 km from the nearest place the itinerary names (Oost); check it is not a homonym
- `pl-road-trip-eagles-nests`: pin is 69 km from the nearest place the itinerary names (Katowice); check it is not a homonym
- `cz-nature-escape-jeseniky-cabin`: pin is 159 km from the nearest place the itinerary names (Hrubý Jeseník); check it is not a homonym
- `no-hiking-jotunheimen-hut-to-hut-besseggen-fannaraken`: pin is 220 km from the nearest place the itinerary names (Oslo); check it is not a homonym
- `se-hiking-kungsleden-north-abisko-nikkaluokta`: pin is 81 km from the nearest place the itinerary names (Kiruna); check it is not a homonym
- `cz-culinary-moravia-and-beer`: pin is 181 km from the nearest place the itinerary names (Znojmo); check it is not a homonym
- `md-culinary-codru-stefan-voda`: pin is 54 km from the nearest place the itinerary names (Cimișlia); check it is not a homonym
- `pl-culinary-malopolska`: pin is 85 km from the nearest place the itinerary names (Zakopane); check it is not a homonym
- `ro-culinary-dealu-mare-dragasani`: pin is 109 km from the nearest place the itinerary names (Dealu Mare); check it is not a homonym
- `es-winter-sports-baqueira-beret`: pin is 122 km from the nearest place the itinerary names (Vielha); check it is not a homonym
- `ee-water-sports-west-estonian-coast-parnu-ristna-sorve`: pin is 76 km from the nearest place the itinerary names (Kuressaare); check it is not a homonym
- `ba-hostel-sarajevo-mostar-kotor`: pin is 71 km from the nearest place the itinerary names (Mostar); check it is not a homonym
- `cz-rail-prague-vienna-budapest`: pin is 253 km from the nearest place the itinerary names (Vienna); check it is not a homonym

### `place-outside-country`: 18 record(s)

- `md-cycling-country`: 'Lozova' is a town in UA and nothing in GB/MD/RO/RU carries the name
- `si-cycling-soca-brda`: 'Brda' is a town in NL and nothing in HR/IT/SI carries the name
- `de-trail-running-berchtesgaden`: 'Salt' is a town in ES/JO and nothing in AT/DE carries the name
- `it-city-rome`: 'Pantheon' is a town in FR and nothing in ES/IT carries the name
- `at-cozy-towns-salzkammergut`: 'Salt' is a town in ES/JO and nothing in AT/DE carries the name
- `it-road-trip-sicily-circuit`: 'Segesta' is a town in HR and nothing in GB/GR/IT carries the name
- `sk-road-trip-orava-spis`: 'Karst' is a town in DE and nothing in AL/AT/BY/CZ/GB/HU/MD/PL/RS/SK/UA carries the name
- `si-hiking-triglav-hut-to-hut`: 'Vrata' is a town in BG and nothing in SI carries the name
- `xk-hiking-peaks-of-the-balkans`: 'Albania' is a town in FR and nothing in AL/ME/RS/XK carries the name
- `mk-culinary-tikves`: 'Senigallia' is a town in IT and nothing in BG/GB/GR/MK/TR carries the name
- `pl-culinary-malopolska`: 'Salt' is a town in ES/JO and nothing in FR/IT/PL/SK carries the name
- `si-culinary-vipava-karst`: 'Karst' is a town in DE and nothing in GB/IT/SI carries the name
- `hr-nature-escape-velebit-lika`: 'Bura' is a town in IT and nothing in BA/HR/NO/SI carries the name
- `md-nature-escape-orheiul-vechi-padurea-domneasca`: 'Lozova' is a town in UA and nothing in GB/MD/RO/RU carries the name
- `sk-nature-escape-slovensky-raj-cabin`: 'Muráň' is a town in FR and nothing in HU/SK carries the name
- `ee-water-sports-west-estonian-coast-parnu-ristna-sorve`: 'Kalana' is a town in DE and nothing in EE/GB/RU carries the name
- `es-water-sports-tarifa-costa-luz`: 'Bolonia' is a town in IT and nothing in ES/GI/PT carries the name
- `es-water-sports-tarifa-costa-luz`: 'Tangier' is a town in MA and nothing in ES/GI/PT carries the name

### `thin-pro-tips`: 4 record(s)

- `hr-beach-week-makarska-riviera`: 2 pro-tips
- `cz-rail-prague-vienna-budapest`: 2 pro-tips
- `es-pilgrim-camino-sarria-santiago`: 2 pro-tips
- `gr-island-hopping-paros-antiparos-naxos`: 2 pro-tips

### `thin-accommodation`: 1 record(s)

- `hr-beach-week-makarska-riviera`: 1 lodging options

## Notices

- `generated-summary`: 30 record(s); e.g. `dk-cycling-bornholm-round-granite-coast-smokehouse-loop`: summary composed from metadata, no editorial summary in the source

## Coverage

| Region | Trips |
|---|---|
| Western & Central Europe | 101 |
| Southern & Mediterranean Europe | 74 |
| Eastern & Southeastern Europe | 53 |
| Northern Europe & Baltics | 30 |

| Trip type | Trips |
|---|---|
| Cycling | 26 |
| Trail running | 25 |
| Cities | 25 |
| Small towns | 27 |
| Road trips | 26 |
| Hiking | 25 |
| Food and drink | 26 |
| Ski and snow | 24 |
| Nature stays | 25 |
| On the water | 24 |
| Hostel weeks | 1 |
| Beach weeks | 1 |
| Rail journeys | 1 |
| Pilgrim routes | 1 |
| Island hopping | 1 |

| Country | Trips |
|---|---|
| France | 16 |
| Germany | 13 |
| Austria | 12 |
| Czechia | 12 |
| Belgium | 11 |
| Italy | 11 |
| Spain | 11 |
| Bulgaria | 10 |
| Greece | 10 |
| Netherlands | 10 |
| Poland | 10 |
| Romania | 10 |
| Switzerland | 10 |
| Slovakia | 9 |
| Hungary | 8 |
| Luxembourg | 8 |
| Portugal | 8 |
| Croatia | 6 |
| Moldova | 6 |
| Slovenia | 6 |
| Bosnia and Herzegovina | 5 |
| Monaco | 5 |
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
