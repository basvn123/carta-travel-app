# Carta master dataset validation report

Dataset: **253 trips**, schema v2.0, generated 2026-09-02

**606 errors, 624 warnings, 30 notices**

## Issue counts by check

| Check | Level | Count |
|---|---|---|
| `hero-below-floor` | ERROR | 253 |
| `comma-range-wire` | ERROR | 209 |
| `no-sleep-lines` | WARNING | 183 |
| `missing-connectivity` | WARNING | 115 |
| `budget-sum-mismatch` | ERROR | 98 |
| `missing-booking-windows` | WARNING | 67 |
| `approximate-coordinates` | WARNING | 61 |
| `gateway-coordinates` | WARNING | 54 |
| `accommodation-not-slept` | ERROR | 46 |
| `missing-type-detail` | WARNING | 44 |
| `missing-evening` | WARNING | 30 |
| `missing-gateway` | WARNING | 30 |
| `generated-summary` | INFO | 30 |
| `missing-difficulty` | WARNING | 21 |
| `place-outside-country` | WARNING | 19 |

## Errors by check

### `hero-below-floor`: 253 record(s)

- `at-cycling-donauradweg-wachau`: hero long edge is 1280px, floor is 1600px
- `be-cycling-flemish-ardennes-bergs`: hero long edge is 1000px, floor is 1600px
- `be-cycling-vennbahn-ardennes`: hero long edge is 1280px, floor is 1600px
- `bg-cycling-danube-eurovelo6`: hero long edge is 1280px, floor is 1600px
- `cz-cycling-south-bohemia-ponds`: hero long edge is 1280px, floor is 1600px
- `de-cycling-bodensee-radweg`: hero long edge is 1280px, floor is 1600px
- `dk-cycling-bornholm-round-granite-coast-smokehouse-loop`: hero long edge is 1280px, floor is 1600px
- `ee-cycling-saaremaa-muhu-juniper-island-loop`: hero long edge is 1280px, floor is 1600px
- `es-cycling-girona-costa-brava`: hero long edge is 1280px, floor is 1600px
- `fr-cycling-alsace-vineyard-route`: hero long edge is 1280px, floor is 1600px
- `fr-cycling-loire-a-velo`: hero long edge is 1280px, floor is 1600px
- `gr-cycling-peloponnese-arcadia`: hero long edge is 1280px, floor is 1600px
- `hr-cycling-istria-parenzana`: hero long edge is 1280px, floor is 1600px
- `hu-cycling-balaton-ring`: hero long edge is 1280px, floor is 1600px
- `it-cycling-puglia-valle-itria`: hero long edge is 1280px, floor is 1600px
- `lu-cycling-pc-network-moselle-mullerthal`: hero long edge is 1280px, floor is 1600px
- `md-cycling-country`: hero long edge is 1280px, floor is 1600px
- `me-cycling-kotor-lovcen`: hero long edge is 1280px, floor is 1600px
- `nl-cycling-green-heart-waterline`: hero long edge is 1280px, floor is 1600px
- `nl-cycling-wadden-frisian-dikes`: hero long edge is 1280px, floor is 1600px
- `pl-cycling-green-velo-podlasie`: hero long edge is 1280px, floor is 1600px
- `pt-cycling-alentejo-costa-vicentina`: hero long edge is 1280px, floor is 1600px
- `ro-cycling-via-transilvanica`: hero long edge is 1280px, floor is 1600px
- `se-cycling-kattegattleden-gothenburg-helsingborg`: hero long edge is 1280px, floor is 1600px
- `si-cycling-soca-brda`: hero long edge is 1280px, floor is 1600px
- `sk-cycling-vah-danube`: hero long edge is 1280px, floor is 1600px
- `at-trail-running-innsbruck-nordkette`: hero long edge is 1280px, floor is 1600px
- `be-trail-running-hautes-fagnes`: hero long edge is 1280px, floor is 1600px
- `bg-trail-running-rila-pirin`: hero long edge is 1280px, floor is 1600px
- `ch-trail-running-engadin-ridges`: hero long edge is 1280px, floor is 1600px
- `cz-trail-running-krkonose-ridge`: hero long edge is 1280px, floor is 1600px
- `de-trail-running-berchtesgaden`: hero long edge is 800px, floor is 1600px
- `es-trail-running-sierra-nevada-alpujarras`: hero long edge is 1280px, floor is 1600px
- `fo-trail-running-faroese-ridgelines-streymoy-vagar`: hero long edge is 1280px, floor is 1600px
- `fr-trail-running-chamonix-balcons`: hero long edge is 1280px, floor is 1600px
- `fr-trail-running-mercantour-vesubie`: hero long edge is 1280px, floor is 1600px
- `gr-trail-running-zagori-vikos`: hero long edge is 1280px, floor is 1600px
- `hr-trail-running-velebit-premuzic`: hero carries no size, floor is 1600px
- `hu-trail-running-bukk-matra`: hero carries no size, floor is 1600px
- `ie-trail-running-wicklow-granite-dublin-mountains-lugnaquilla`: hero long edge is 1280px, floor is 1600px
- …and 213 more (full list in validation-issues.json)

### `comma-range-wire`: 209 record(s)

- `bg-cycling-danube-eurovelo6`: 12 comma range(s) in the shipped copy, e.g. '785}, "totalNote": "€430, €785", "breakdow'
- `de-cycling-bodensee-radweg`: 5 comma range(s) in the shipped copy, e.g. 'Tier": "€€ (approx. €880, €1,310 per person,'
- `es-cycling-girona-costa-brava`: 12 comma range(s) in the shipped copy, e.g. '400}, "totalNote": "€1,500, €2,400 per person,'
- `fr-cycling-alsace-vineyard-route`: 5 comma range(s) in the shipped copy, e.g. 'Tier": "€€ (approx. €950, €1,400 per person,'
- `gr-cycling-peloponnese-arcadia`: 15 comma range(s) in the shipped copy, e.g. '900}, "totalNote": "€1,200, €1,900 per person,'
- `hr-cycling-istria-parenzana`: 15 comma range(s) in the shipped copy, e.g. '850}, "totalNote": "€1,200, €1,850 per person,'
- `hu-cycling-balaton-ring`: 10 comma range(s) in the shipped copy, e.g. '130}, "totalNote": "€695, €1,130", "breakdow'
- `it-cycling-puglia-valle-itria`: 15 comma range(s) in the shipped copy, e.g. '100}, "totalNote": "€1,250, €2,100 per person,'
- `lu-cycling-pc-network-moselle-mullerthal`: 5 comma range(s) in the shipped copy, e.g. 'Tier": "€€ (approx. €820, €1,200 per person,'
- `md-cycling-country`: 8 comma range(s) in the shipped copy, e.g. '870}, "totalNote": "€480, €870", "breakdow'
- `me-cycling-kotor-lovcen`: 14 comma range(s) in the shipped copy, e.g. '650}, "totalNote": "€1,050, €1,650 per person,'
- `nl-cycling-green-heart-waterline`: 5 comma range(s) in the shipped copy, e.g. 'Tier": "€€ (approx. €980, €1,470 per person,'
- `nl-cycling-wadden-frisian-dikes`: 4 comma range(s) in the shipped copy, e.g. 'Tier": "€€ (approx. €850, €1,260 per person,'
- `pl-cycling-green-velo-podlasie`: 11 comma range(s) in the shipped copy, e.g. '950}, "totalNote": "€560, €950", "breakdow'
- `pt-cycling-alentejo-costa-vicentina`: 11 comma range(s) in the shipped copy, e.g. '850}, "totalNote": "€1,150, €1,850 per person,'
- `ro-cycling-via-transilvanica`: 9 comma range(s) in the shipped copy, e.g. '060}, "totalNote": "€610, €1,060", "breakdow'
- `si-cycling-soca-brda`: 13 comma range(s) in the shipped copy, e.g. '950}, "totalNote": "€1,350, €1,950 per person,'
- `sk-cycling-vah-danube`: 10 comma range(s) in the shipped copy, e.g. '950}, "totalNote": "€575, €950", "breakdow'
- `at-trail-running-innsbruck-nordkette`: 4 comma range(s) in the shipped copy, e.g. 'st.", "priceNote": "€45, €75 per night"}'
- `be-trail-running-hautes-fagnes`: 3 comma range(s) in the shipped copy, e.g. 'ds.", "priceNote": "€90, €140 per night"}'
- `bg-trail-running-rila-pirin`: 7 comma range(s) in the shipped copy, e.g. '870}, "totalNote": "€410, €870", "breakdow'
- `ch-trail-running-engadin-ridges`: 3 comma range(s) in the shipped copy, e.g. 'HF 250-420 (approx. €260, €440) per night '
- `cz-trail-running-krkonose-ridge`: 3 comma range(s) in the shipped copy, e.g. 'ds.", "priceNote": "€45, €80 per night w'
- `de-trail-running-berchtesgaden`: 3 comma range(s) in the shipped copy, e.g. 'es.", "priceNote": "€130, €190 per night f'
- `es-trail-running-sierra-nevada-alpujarras`: 6 comma range(s) in the shipped copy, e.g. '520}, "totalNote": "€980, €1,550 per person,'
- `fr-trail-running-chamonix-balcons`: 6 comma range(s) in the shipped copy, e.g. 'st.", "priceNote": "€40, €70 per night"}'
- `fr-trail-running-mercantour-vesubie`: 4 comma range(s) in the shipped copy, e.g. 'st.", "priceNote": "€75, €130 per night"}'
- `gr-trail-running-zagori-vikos`: 8 comma range(s) in the shipped copy, e.g. '530}, "totalNote": "€930, €1,530 per person,'
- `hr-trail-running-velebit-premuzic`: 9 comma range(s) in the shipped copy, e.g. '250}, "totalNote": "€780, €1,250 per person,'
- `hu-trail-running-bukk-matra`: 9 comma range(s) in the shipped copy, e.g. '550}, "totalNote": "€305, €550", "breakdow'
- `it-trail-running-dolomites-cortina`: 10 comma range(s) in the shipped copy, e.g. '660}, "totalNote": "€1,650, €2,600 per person,'
- `li-trail-running-fuerstensteig-drei-schwestern`: 2 comma range(s) in the shipped copy, e.g. 'HF 160-230 (approx. €165, €240) per night '
- `lu-trail-running-mullerthal`: 2 comma range(s) in the shipped copy, e.g. 'ut.", "priceNote": "€150, €230 per night f'
- `mc-trail-running-tete-de-chien-agel`: 2 comma range(s) in the shipped copy, e.g. 'ly.", "priceNote": "€110, €180 per night f'
- `me-trail-running-durmitor`: 10 comma range(s) in the shipped copy, e.g. '320}, "totalNote": "€780, €1,250 per person,'
- `pl-trail-running-karkonosze-stolowe`: 7 comma range(s) in the shipped copy, e.g. '830}, "totalNote": "€495, €830", "breakdow'
- `pt-trail-running-madeira`: 11 comma range(s) in the shipped copy, e.g. '740}, "totalNote": "€1,050, €1,700 per person,'
- `ro-trail-running-piatra-craiului-bucegi`: 9 comma range(s) in the shipped copy, e.g. '960}, "totalNote": "€560, €960", "breakdow'
- `si-trail-running-julian-alps-bohinj`: 9 comma range(s) in the shipped copy, e.g. '650}, "totalNote": "€1,050, €1,650 per person,'
- `sk-trail-running-mala-fatra-low-tatras`: 9 comma range(s) in the shipped copy, e.g. '000}, "totalNote": "€595, €1,000", "breakdow'
- …and 169 more (full list in validation-issues.json)

### `budget-sum-mismatch`: 98 record(s)

- `dk-cycling-bornholm-round-granite-coast-smokehouse-loop`: low: breakdown sums to €315 against a stated total of €1050 (-70%)
- `dk-cycling-bornholm-round-granite-coast-smokehouse-loop`: high: breakdown sums to €520 against a stated total of €1500 (-65%)
- `ee-cycling-saaremaa-muhu-juniper-island-loop`: low: breakdown sums to €215 against a stated total of €650 (-67%)
- `ee-cycling-saaremaa-muhu-juniper-island-loop`: high: breakdown sums to €390 against a stated total of €1000 (-61%)
- `fr-cycling-alsace-vineyard-route`: low: breakdown sums to €960 against a stated total of €950 (+1%)
- `fr-cycling-alsace-vineyard-route`: high: breakdown sums to €1420 against a stated total of €1400 (+1%)
- `hr-cycling-istria-parenzana`: low: breakdown sums to €1280 against a stated total of €1200 (+7%)
- `hr-cycling-istria-parenzana`: high: breakdown sums to €2050 against a stated total of €1850 (+11%)
- `me-cycling-kotor-lovcen`: high: breakdown sums to €1700 against a stated total of €1650 (+3%)
- `se-cycling-kattegattleden-gothenburg-helsingborg`: low: breakdown sums to €345 against a stated total of €1150 (-70%)
- `se-cycling-kattegattleden-gothenburg-helsingborg`: high: breakdown sums to €555 against a stated total of €1650 (-66%)
- `fo-trail-running-faroese-ridgelines-streymoy-vagar`: low: breakdown sums to €505 against a stated total of €1700 (-70%)
- `fo-trail-running-faroese-ridgelines-streymoy-vagar`: high: breakdown sums to €865 against a stated total of €2500 (-65%)
- `hr-trail-running-velebit-premuzic`: high: breakdown sums to €1290 against a stated total of €1250 (+3%)
- `ie-trail-running-wicklow-granite-dublin-mountains-lugnaquilla`: low: breakdown sums to €285 against a stated total of €900 (-68%)
- `ie-trail-running-wicklow-granite-dublin-mountains-lugnaquilla`: high: breakdown sums to €500 against a stated total of €1350 (-63%)
- `no-trail-running-romsdal-ridges-andalsnes-skyrunning-week`: low: breakdown sums to €460 against a stated total of €1600 (-71%)
- `no-trail-running-romsdal-ridges-andalsnes-skyrunning-week`: high: breakdown sums to €770 against a stated total of €2300 (-67%)
- `dk-city-copenhagen-by-neighbourhood-block`: low: breakdown sums to €345 against a stated total of €1600 (-78%)
- `dk-city-copenhagen-by-neighbourhood-block`: high: breakdown sums to €630 against a stated total of €2600 (-76%)
- `ee-city-tallinn-limestone-bastions-telliskivi`: low: breakdown sums to €195 against a stated total of €800 (-76%)
- `ee-city-tallinn-limestone-bastions-telliskivi`: high: breakdown sums to €390 against a stated total of €1300 (-70%)
- `lv-city-riga-art-nouveau-market-halls-daugava`: low: breakdown sums to €180 against a stated total of €700 (-74%)
- `lv-city-riga-art-nouveau-market-halls-daugava`: high: breakdown sums to €360 against a stated total of €1150 (-69%)
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg`: low: breakdown sums to €330 against a stated total of €1050 (-69%)
- `dk-cozy-towns-south-funen-archipelago-aeroe-faaborg-svendborg`: high: breakdown sums to €570 against a stated total of €1600 (-64%)
- `gr-cozy-towns-pelion`: high: breakdown sums to €1490 against a stated total of €1450 (+3%)
- `lt-cozy-towns-curonian-spit-nida-juodkrante-dune-villages`: low: breakdown sums to €240 against a stated total of €700 (-66%)
- `lt-cozy-towns-curonian-spit-nida-juodkrante-dune-villages`: high: breakdown sums to €450 against a stated total of €1100 (-59%)
- `lv-cozy-towns-kurzeme-slow-week-kuldiga-sabile-talsi`: low: breakdown sums to €235 against a stated total of €600 (-61%)
- `lv-cozy-towns-kurzeme-slow-week-kuldiga-sabile-talsi`: high: breakdown sums to €415 against a stated total of €950 (-56%)
- `es-road-trip-andalucia-ronda-alpujarras`: high: breakdown sums to €1650 against a stated total of €1600 (+3%)
- `fo-road-trip-subsea-loop`: low: breakdown sums to €675 against a stated total of €1800 (-62%)
- `fo-road-trip-subsea-loop`: high: breakdown sums to €1090 against a stated total of €2600 (-58%)
- `gr-road-trip-peloponnese-loop`: high: breakdown sums to €1540 against a stated total of €1500 (+3%)
- `ie-road-trip-wild-atlantic-way-dingle-iveragh-burren`: low: breakdown sums to €615 against a stated total of €1600 (-62%)
- `ie-road-trip-wild-atlantic-way-dingle-iveragh-burren`: high: breakdown sums to €1010 against a stated total of €2400 (-58%)
- `it-road-trip-sicily-circuit`: high: breakdown sums to €1690 against a stated total of €1650 (+2%)
- `me-road-trip-tara`: high: breakdown sums to €1380 against a stated total of €1350 (+2%)
- `no-road-trip-lofoten-e10-fishing-villages-arctic-light`: low: breakdown sums to €775 against a stated total of €2000 (-61%)
- …and 58 more (full list in validation-issues.json)

### `accommodation-not-slept`: 46 record(s)

- `es-cycling-girona-costa-brava`: 'Bike Breaks Girona Cycle Centre apartments' is in accommodationStrategy but no day sleeps there
- `hr-cycling-istria-parenzana`: 'La Parenzana' is in accommodationStrategy but no day sleeps there
- `me-cycling-kotor-lovcen`: 'A Njeguši village house' is in accommodationStrategy but no day sleeps there
- `si-cycling-soca-brda`: 'Nebesa Chalets' is in accommodationStrategy but no day sleeps there
- `me-trail-running-durmitor`: 'Guesthouse or apartman in Ivan Do' is in accommodationStrategy but no day sleeps there
- `es-city-seville`: 'Hotel Palacio de Villapanés' is in accommodationStrategy but no day sleeps there
- `es-city-seville`: 'Corral del Rey' is in accommodationStrategy but no day sleeps there
- `gr-city-athens`: 'Perianth Hotel' is in accommodationStrategy but no day sleeps there
- `gr-city-athens`: 'Athens Was' is in accommodationStrategy but no day sleeps there
- `it-city-naples`: "Casa D'Anna" is in accommodationStrategy but no day sleeps there
- `it-city-naples`: "Grand Hotel Parker's" is in accommodationStrategy but no day sleeps there
- `it-city-rome`: 'A Trastevere guesthouse' is in accommodationStrategy but no day sleeps there
- `it-city-rome`: 'A Prati apartment' is in accommodationStrategy but no day sleeps there
- `pt-city-lisbon`: 'Memmo Alfama' is in accommodationStrategy but no day sleeps there
- `pt-city-lisbon`: 'Casa Amora' is in accommodationStrategy but no day sleeps there
- `rs-city-belgrade`: 'Hotel Moskva' is in accommodationStrategy but no day sleeps there
- `rs-city-belgrade`: 'Square Nine' is in accommodationStrategy but no day sleeps there
- `ba-cozy-towns-slowly-mostar-blagaj-pocitelj-trebinje`: 'Hotel Kriva Ćuprija or a Blagaj pansion' is in accommodationStrategy but no day sleeps there
- `es-cozy-towns-pueblos-blancos`: 'Hotel Fuerte Grazalema or Casa Rural La Mimbrera' is in accommodationStrategy but no day sleeps there
- `it-cozy-towns-umbria`: 'Palazzo Brunamonti' is in accommodationStrategy but no day sleeps there
- `mk-cozy-towns-ohrid-bitola`: 'Villa Jovan or Hotel De Niro' is in accommodationStrategy but no day sleeps there
- `pt-cozy-towns-alentejo-villages`: 'Casa Pinto or Pousada de Marvão' is in accommodationStrategy but no day sleeps there
- `sm-cozy-towns-montefeltro`: 'Locanda San Leone or a Montefeltro agriturismo' is in accommodationStrategy but no day sleeps there
- `hr-culinary-istria-truffles`: 'San Canzian Village & Hotel' is in accommodationStrategy but no day sleeps there
- `it-culinary-tuscany-chianti-montalcino`: 'Castello di Velona' is in accommodationStrategy but no day sleeps there
- `mk-culinary-tikves`: 'Tikveš Winery guest accommodation / Kavadarci town hotels' is in accommodationStrategy but no day sleeps there
- `ad-winter-sports-grandvalira`: 'Sport Hotel Hermitage & Spa' is in accommodationStrategy but no day sleeps there
- `ad-winter-sports-grandvalira`: 'Andorra Park Hotel' is in accommodationStrategy but no day sleeps there
- `ba-winter-sports-jahorina-bjelasnica`: 'Hotel Bistrica' is in accommodationStrategy but no day sleeps there
- `es-winter-sports-baqueira-beret`: 'Hotel Val de Neu' is in accommodationStrategy but no day sleeps there
- `es-winter-sports-baqueira-beret`: 'Parador de Arties' is in accommodationStrategy but no day sleeps there
- `gr-winter-sports-parnassos-arachova`: 'Domotel Anemolia Mountain Resort' is in accommodationStrategy but no day sleeps there
- `gr-winter-sports-parnassos-arachova`: 'Polydrosos or Eptalofos guesthouses' is in accommodationStrategy but no day sleeps there
- `it-winter-sports-dolomiti-superski`: 'Hotel Portillo Dolomites 1966' is in accommodationStrategy but no day sleeps there
- `it-winter-sports-dolomiti-superski`: 'Hotel Gran Baita' is in accommodationStrategy but no day sleeps there
- `rs-winter-sports-kopaonik`: 'Konaci (Sunčani Vrhovi) apartments' is in accommodationStrategy but no day sleeps there
- `rs-winter-sports-kopaonik`: 'Brzeće village' is in accommodationStrategy but no day sleeps there
- `si-winter-sports-kranjska-gora-vogel`: 'Bohinj ECO Hotel' is in accommodationStrategy but no day sleeps there
- `al-nature-escape-prespa-shebenik`: 'A Prespa bujtina' is in accommodationStrategy but no day sleeps there
- `ba-nature-escape-una-national-park`: 'Camp Lučica' is in accommodationStrategy but no day sleeps there
- …and 6 more (full list in validation-issues.json)

## Warnings by check

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
- `mc-city-riviera-week`: logistics.connectivity is empty
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
- …and 75 more

### `missing-booking-windows`: 67 record(s)

- `at-cycling-donauradweg-wachau`: logistics.bookingWindows is empty
- `be-cycling-flemish-ardennes-bergs`: logistics.bookingWindows is empty
- `be-cycling-vennbahn-ardennes`: logistics.bookingWindows is empty
- `cz-cycling-south-bohemia-ponds`: logistics.bookingWindows is empty
- `de-cycling-bodensee-radweg`: logistics.bookingWindows is empty
- `fr-cycling-alsace-vineyard-route`: logistics.bookingWindows is empty
- `lu-cycling-pc-network-moselle-mullerthal`: logistics.bookingWindows is empty
- `nl-cycling-green-heart-waterline`: logistics.bookingWindows is empty
- `nl-cycling-wadden-frisian-dikes`: logistics.bookingWindows is empty
- `at-trail-running-innsbruck-nordkette`: logistics.bookingWindows is empty
- `be-trail-running-hautes-fagnes`: logistics.bookingWindows is empty
- `ch-trail-running-engadin-ridges`: logistics.bookingWindows is empty
- `cz-trail-running-krkonose-ridge`: logistics.bookingWindows is empty
- `de-trail-running-berchtesgaden`: logistics.bookingWindows is empty
- `fr-trail-running-mercantour-vesubie`: logistics.bookingWindows is empty
- `li-trail-running-fuerstensteig-drei-schwestern`: logistics.bookingWindows is empty
- `lu-trail-running-mullerthal`: logistics.bookingWindows is empty
- `mc-trail-running-tete-de-chien-agel`: logistics.bookingWindows is empty
- `de-city-berlin-neighbourhoods`: logistics.bookingWindows is empty
- `lu-city-ville-fortress`: logistics.bookingWindows is empty
- `mc-city-riviera-week`: logistics.bookingWindows is empty
- `nl-city-amsterdam-canal-belt`: logistics.bookingWindows is empty
- `at-cozy-towns-salzkammergut`: logistics.bookingWindows is empty
- `be-cozy-towns-bruges-damme-veurne`: logistics.bookingWindows is empty
- `ch-cozy-towns-appenzell`: logistics.bookingWindows is empty
- `cz-cozy-towns-south-bohemia-telc`: logistics.bookingWindows is empty
- `de-cozy-towns-mosel-villages`: logistics.bookingWindows is empty
- `fr-cozy-towns-alsace-villages`: logistics.bookingWindows is empty
- `fr-cozy-towns-dordogne-perigord`: logistics.bookingWindows is empty
- `lu-cozy-towns-little-switzerland`: logistics.bookingWindows is empty
- `nl-cozy-towns-hanseatic-ijssel`: logistics.bookingWindows is empty
- `at-road-trip-grossglockner-tyrol`: logistics.bookingWindows is empty
- `ch-road-trip-bernina-gotthard-ticino`: logistics.bookingWindows is empty
- `ch-road-trip-passes-furka`: logistics.bookingWindows is empty
- `cz-road-trip-bohemia-castles-spas`: logistics.bookingWindows is empty
- `de-road-trip-black-forest-b500`: logistics.bookingWindows is empty
- `fr-road-trip-route-des-grandes-alpes`: logistics.bookingWindows is empty
- `li-road-trip-rhine-triangle`: logistics.bookingWindows is empty
- `lu-road-trip-ardennes-moselle-loop`: logistics.bookingWindows is empty
- `mc-road-trip-three-corniches-turini`: logistics.bookingWindows is empty
- …and 27 more

### `approximate-coordinates`: 61 record(s)

- `gr-cycling-peloponnese-arcadia`: pin falls back to the Greece capital, no basecamp town resolved
- `hr-cycling-istria-parenzana`: pin falls back to the Croatia capital, no basecamp town resolved
- `it-cycling-puglia-valle-itria`: pin falls back to the Italy capital, no basecamp town resolved
- `me-cycling-kotor-lovcen`: pin falls back to the Montenegro capital, no basecamp town resolved
- `pt-cycling-alentejo-costa-vicentina`: pin falls back to the Portugal capital, no basecamp town resolved
- `si-cycling-soca-brda`: pin falls back to the Slovenia capital, no basecamp town resolved
- `de-trail-running-berchtesgaden`: pin falls back to the Germany capital, no basecamp town resolved
- `es-trail-running-sierra-nevada-alpujarras`: pin falls back to the Spain capital, no basecamp town resolved
- `fr-trail-running-chamonix-balcons`: pin falls back to the France capital, no basecamp town resolved
- `fr-trail-running-mercantour-vesubie`: pin falls back to the France capital, no basecamp town resolved
- `gr-trail-running-zagori-vikos`: pin falls back to the Greece capital, no basecamp town resolved
- `me-trail-running-durmitor`: pin falls back to the Montenegro capital, no basecamp town resolved
- `pt-trail-running-madeira`: pin falls back to the Portugal capital, no basecamp town resolved
- `si-trail-running-julian-alps-bohinj`: pin falls back to the Slovenia capital, no basecamp town resolved
- `ba-cozy-towns-slowly-mostar-blagaj-pocitelj-trebinje`: pin falls back to the Bosnia and Herzegovina capital, no basecamp town resolved
- `fr-cozy-towns-alsace-villages`: pin falls back to the France capital, no basecamp town resolved
- `fr-cozy-towns-dordogne-perigord`: pin falls back to the France capital, no basecamp town resolved
- `it-cozy-towns-umbria`: pin falls back to the Italy capital, no basecamp town resolved
- `mk-cozy-towns-ohrid-bitola`: pin falls back to the North Macedonia capital, no basecamp town resolved
- `pt-cozy-towns-alentejo-villages`: pin falls back to the Portugal capital, no basecamp town resolved
- `gr-road-trip-peloponnese-loop`: pin falls back to the Greece capital, no basecamp town resolved
- `me-road-trip-tara`: pin falls back to the Montenegro capital, no basecamp town resolved
- `si-road-trip-julian-alps-passes`: pin falls back to the Slovenia capital, no basecamp town resolved
- `sk-road-trip-orava-spis`: pin falls back to the Slovakia capital, no basecamp town resolved
- `ad-hiking-coma-pedrosa-madriu`: pin falls back to the Andorra capital, no basecamp town resolved
- `gr-hiking-mount-olympus-refuges`: pin falls back to the Greece capital, no basecamp town resolved
- `it-hiking-alta-via-1-dolomites`: pin falls back to the Italy capital, no basecamp town resolved
- `li-hiking-panorama`: pin falls back to the Liechtenstein capital, no basecamp town resolved
- `si-hiking-triglav-hut-to-hut`: pin falls back to the Slovenia capital, no basecamp town resolved
- `sk-hiking-high-tatras-hut-to-hut`: pin falls back to the Slovakia capital, no basecamp town resolved
- `xk-hiking-peaks-of-the-balkans`: pin falls back to the Kosovo capital, no basecamp town resolved
- `de-culinary-mosel-riesling`: pin falls back to the Germany capital, no basecamp town resolved
- `it-culinary-tuscany-chianti-montalcino`: pin falls back to the Italy capital, no basecamp town resolved
- `pt-culinary-douro-valley`: pin falls back to the Portugal capital, no basecamp town resolved
- `si-culinary-vipava-karst`: pin falls back to the Slovenia capital, no basecamp town resolved
- `ad-winter-sports-grandvalira`: pin falls back to the Andorra capital, no basecamp town resolved
- `ba-winter-sports-jahorina-bjelasnica`: pin falls back to the Bosnia and Herzegovina capital, no basecamp town resolved
- `fr-winter-sports-chamonix-freeride`: pin falls back to the France capital, no basecamp town resolved
- `gr-winter-sports-parnassos-arachova`: pin falls back to the Greece capital, no basecamp town resolved
- `it-winter-sports-dolomiti-superski`: pin falls back to the Italy capital, no basecamp town resolved
- …and 21 more

### `gateway-coordinates`: 54 record(s)

- `be-cycling-vennbahn-ardennes`: pin sits on the gateway city (Brussels), not on the trip's basecamp
- `lu-cycling-pc-network-moselle-mullerthal`: pin sits on the gateway city (Luxembourg), not on the trip's basecamp
- `be-trail-running-hautes-fagnes`: pin sits on the gateway city (Brussels), not on the trip's basecamp
- `bg-trail-running-rila-pirin`: pin sits on the gateway city (Sofia), not on the trip's basecamp
- `ch-trail-running-engadin-ridges`: pin sits on the gateway city (Zürich), not on the trip's basecamp
- `cz-trail-running-krkonose-ridge`: pin sits on the gateway city (Prague), not on the trip's basecamp
- `hr-trail-running-velebit-premuzic`: pin sits on the gateway city (Zadar), not on the trip's basecamp
- `lu-trail-running-mullerthal`: pin sits on the gateway city (Luxembourg), not on the trip's basecamp
- `pl-trail-running-karkonosze-stolowe`: pin sits on the gateway city (Wrocław), not on the trip's basecamp
- `at-cozy-towns-salzkammergut`: pin sits on the gateway city (Salzburg), not on the trip's basecamp
- `bg-cozy-towns-revival`: pin sits on the gateway city (Sofia), not on the trip's basecamp
- `ch-cozy-towns-appenzell`: pin sits on the gateway city (Zürich), not on the trip's basecamp
- `cz-cozy-towns-south-bohemia-telc`: pin sits on the gateway city (Prague), not on the trip's basecamp
- `de-cozy-towns-mosel-villages`: pin sits on the gateway city (Frankfurt am Main), not on the trip's basecamp
- `de-cozy-towns-romantic`: pin sits on the gateway city (Nuremberg), not on the trip's basecamp
- `gr-cozy-towns-pelion`: pin sits on the gateway city (Thessaloníki), not on the trip's basecamp
- `at-road-trip-grossglockner-tyrol`: pin sits on the gateway city (Innsbruck), not on the trip's basecamp
- `ch-road-trip-passes-furka`: pin sits on the gateway city (Zürich), not on the trip's basecamp
- `pt-road-trip-n2-serra-estrela`: pin sits on the gateway city (Porto), not on the trip's basecamp
- `at-hiking-berliner-hoehenweg`: pin sits on the gateway city (Innsbruck), not on the trip's basecamp
- `at-hiking-stubai-hoehenweg`: pin sits on the gateway city (Innsbruck), not on the trip's basecamp
- `ba-hiking-sutjeska-via-dinarica`: pin sits on the gateway city (Sarajevo), not on the trip's basecamp
- `be-hiking-ardennes-gr57-ourthe`: pin sits on the gateway city (Brussels), not on the trip's basecamp
- `bg-hiking-pirin-hut-to-hut`: pin sits on the gateway city (Sofia), not on the trip's basecamp
- `ch-hiking-berner-oberland-huts`: pin sits on the gateway city (Zürich), not on the trip's basecamp
- `ch-hiking-walkers-haute-route-valais`: pin sits on the gateway city (Geneva), not on the trip's basecamp
- `cz-hiking-bohemian-switzerland`: pin sits on the gateway city (Prague), not on the trip's basecamp
- `de-hiking-allgaeu-heilbronner-weg`: pin sits on the gateway city (Memmingen), not on the trip's basecamp
- `es-hiking-ordesa-pyrenees-gr11`: pin sits on the gateway city (Zaragoza), not on the trip's basecamp
- `fr-hiking-gr54-ecrins`: pin sits on the gateway city (Grenoble), not on the trip's basecamp
- `lu-hiking-escapardenne-eislek`: pin sits on the gateway city (Luxembourg), not on the trip's basecamp
- `at-culinary-wachau-gruner-veltliner`: pin sits on the gateway city (Vienna), not on the trip's basecamp
- `hr-culinary-istria-truffles`: pin sits on the gateway city (Pula), not on the trip's basecamp
- `lu-culinary-moselle-cremant`: pin sits on the gateway city (Luxembourg), not on the trip's basecamp
- `at-winter-sports-arlberg-st-anton`: pin sits on the gateway city (Innsbruck), not on the trip's basecamp
- `at-winter-sports-kitzbuehel-kitzski`: pin sits on the gateway city (Innsbruck), not on the trip's basecamp
- `be-winter-sports-hautes-fagnes-nordic`: pin sits on the gateway city (Liège), not on the trip's basecamp
- `bg-winter-sports-bansko-pirin`: pin sits on the gateway city (Sofia), not on the trip's basecamp
- `ch-winter-sports-engelberg-titlis-freeride`: pin sits on the gateway city (Zürich), not on the trip's basecamp
- `ch-winter-sports-verbier-4-vallees`: pin sits on the gateway city (Geneva), not on the trip's basecamp
- …and 14 more

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
- `mc-city-riviera-week`: no transit pass detail captured for this trip type
- `nl-city-amsterdam-canal-belt`: no transit pass detail captured for this trip type
- `at-hiking-berliner-hoehenweg`: no hut booking path captured for this trip type
- `at-hiking-stubai-hoehenweg`: no hut booking path captured for this trip type
- `be-hiking-ardennes-gr57-ourthe`: no hut booking path captured for this trip type
- `ch-hiking-berner-oberland-huts`: no hut booking path captured for this trip type
- `ch-hiking-walkers-haute-route-valais`: no hut booking path captured for this trip type
- `cz-hiking-bohemian-switzerland`: no hut booking path captured for this trip type
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

### `missing-evening`: 30 record(s)

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

### `place-outside-country`: 19 record(s)

- `md-cycling-country`: 'Lozova' is a town in UA and nothing in GB/MD/RO/RU carries the name
- `si-cycling-soca-brda`: 'Brda' is a town in NL and nothing in HR/IT/SI carries the name
- `de-trail-running-berchtesgaden`: 'Salt' is a town in ES and nothing in AT/DE carries the name
- `it-city-rome`: 'Pantheon' is a town in FR and nothing in ES/IT carries the name
- `at-cozy-towns-salzkammergut`: 'Salt' is a town in ES and nothing in AT/DE carries the name
- `it-road-trip-sicily-circuit`: 'Segesta' is a town in HR and nothing in GB/GR/IT carries the name
- `sk-road-trip-orava-spis`: 'Karst' is a town in DE and nothing in AL/AT/BY/CZ/GB/HU/MD/PL/RS/SK/UA carries the name
- `si-hiking-triglav-hut-to-hut`: 'Vrata' is a town in BG and nothing in SI carries the name
- `xk-hiking-peaks-of-the-balkans`: 'Albania' is a town in FR and nothing in AL/ME/RS/XK carries the name
- `bg-culinary-thracian-valley-melnik`: 'Melnik' is a town in CZ and nothing in BG/GB/GR/TR carries the name
- `mk-culinary-tikves`: 'Senigallia' is a town in IT and nothing in BG/GB/GR/MK/TR carries the name
- `pl-culinary-malopolska`: 'Salt' is a town in ES and nothing in FR/IT/PL/SK carries the name
- `si-culinary-vipava-karst`: 'Karst' is a town in DE and nothing in GB/IT/SI carries the name
- `hr-nature-escape-velebit-lika`: 'Bura' is a town in IT and nothing in BA/HR/NO/SI carries the name
- `md-nature-escape-orheiul-vechi-padurea-domneasca`: 'Lozova' is a town in UA and nothing in GB/MD/RO/RU carries the name
- `sk-nature-escape-slovensky-raj-cabin`: 'Muráň' is a town in FR and nothing in HU/SK carries the name
- `ee-water-sports-west-estonian-coast-parnu-ristna-sorve`: 'Kalana' is a town in DE and nothing in EE/GB/RU carries the name
- `es-water-sports-tarifa-costa-luz`: 'Bolonia' is a town in IT and nothing in ES/GI/PT carries the name
- `es-water-sports-tarifa-costa-luz`: 'Tangier' is a town in MA and nothing in ES/GI/PT carries the name

## Notices

- `generated-summary`: 30 record(s); e.g. `dk-cycling-bornholm-round-granite-coast-smokehouse-loop`: summary composed from metadata, no editorial summary in the source

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
