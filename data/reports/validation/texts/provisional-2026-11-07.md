# Texts validation, provisional (T1196, ROADMAP D23)

PROVISIONAL: the judge counts only once calibrated on the owner's labels (T1144-a, T1144-b, T1188-a); labels are seeded, not a human's (T1144-b).

Judge: session (claude-code-session (blind subagents, T1196)), prompt judge-text a40e854e32a6. Items: `data/reports/validation/texts/items.json`. Judged 120 of 120.

| Stratum | Population | n | Supported | 95% | Unsupported | Contradicted |
|---|---|---|---|---|---|---|
| place_blurb | 771 | 40 | 2 (5%) | 1% to 16% | 38 | 0 |
| trail_summary/t1179 | 2080 | 20 | 20 (100%) | 84% to 100% | 0 | 0 |
| trail_summary/wire | 433 | 20 | 8 (40%) | 22% to 61% | 11 | 1 |
| trip_text | 258 | 40 | 11 (28%) | 16% to 43% | 24 | 5 |
| all | | 120 | 41 (34%) | 26% to 43% | 73 | 6 |

Supported share weighted by stratum population: 0.6671 (the T1179 summaries are not shipped yet; over the shipped strata only: 0.1934).

## Worst cases (contradicted first)

- `x018` trail_summary/wire, Camino Lituano Žemaitija (LT): **contradicted**. 215.6 km is 0.7 km off the source's 216.3 km.
  - contradicted: 215.6 km
- `x032` trip_text, Umbrian Hill Towns: Spello, Bevagna & the Sagrantino Hills (IT): **contradicted**. Bevagna gets three nights (days 4 to 6) and there is one town move, not four nights and two moves.
  - contradicted: Bevagna for four nights
  - unsupported: shutters down 13:30-16:00
  - unsupported: town reappearing on the corso at 18:30
- `x052` trip_text, The Rhine Alpine Triangle, Vaduz, the Silvretta and Graubünden (LI): **contradicted**. Only days 2 to 6 loop back to Vaduz; day 7 is a one-way exit to Zurich, so there are five loops, not six.
  - contradicted: six day loops
- `x059` trip_text, Lisbon on Foot: Seven Hills, Seven Days (PT): **contradicted**. The stated order conflicts with the data: Chiado is day 1 before Alfama, and Belem (day 3) comes before Principe Real (day 4).
  - contradicted: neighbourhood sequence: Alfama and Mouraria, then Chiado, then Principe Real, then the river
  - unsupported: trades tram 28
  - unsupported: Bairro Alto
- `x071` trip_text, Durmitor Ridges (ME): **contradicted**. Savin Kuk is day 6 and the last run is the katun loop; several headline numbers are also absent.
  - unsupported: 48 peaks over 2,000 m
  - unsupported: drive across in forty minutes
  - unsupported: highest town in the Balkans
- `x079` trip_text, Underground Streets and Feteasca Neagră: A Week Through Codru and Ștefan Vodă (MD): **contradicted**. Cricova is toured by electric train, so only one of the two underground cellars is driven.
  - unsupported: the only wine country where you tour cellars by car
  - contradicted: tour two of the cellars by car
  - unsupported: street signs that read Cabernet and Feteasca
- `x003` place_blurb, Vaduz, Liechtenstein (LI): **unsupported**. The source says nothing about mountains or views.
  - unsupported: mountain views
- `x005` place_blurb, Pécs, Hungary (HU): **unsupported**. Roman tombs and the Ottoman mosque are not in the source.
  - unsupported: Roman tombs
  - unsupported: Ottoman mosque
- `x007` place_blurb, Avignon, France (FR): **unsupported**. The source names a UNESCO historic centre but no papal palace.
  - unsupported: UNESCO papal palace
- `x009` place_blurb, Stevns Klint, Denmark (DK): **unsupported**. The source only describes the municipality and its farmland.
  - unsupported: UNESCO chalk cliff
  - unsupported: recording the dinosaur-killing asteroid
  - unsupported: medieval church teetering on the edge
- `x015` place_blurb, Klaipeda, Lithuania (LT): **unsupported**. The source mentions coast and historic sights but no port, timber houses or Curonian Spit.
  - unsupported: Lithuania's port city
  - unsupported: Prussian timber houses
  - unsupported: gateway to the Curonian Spit
- `x017` place_blurb, Fredrikstad, Norway (NO): **unsupported**. Moats and cobbled lanes are not mentioned in the source.
  - unsupported: moats and cobbled lanes still fully intact
- `x020` place_blurb, Saas-Fee, Switzerland (CH): **unsupported**. The source only covers the valley, winter sport and summer skiing.
  - unsupported: Car-free
  - unsupported: 'Pearl of the Alps'
  - unsupported: ringed by thirteen 4,000 m peaks
- `x022` place_blurb, Sankt Peter-Ording, Germany (DE): **unsupported**. Beach length, stilt houses and buggies are not in the source, and it says one of the prime spots, not the best.
  - unsupported: 12 km North Sea beach
  - unsupported: stilt-house restaurants
  - unsupported: kite buggies
- `x027` place_blurb, Koli National Park, Finland (FI): **unsupported**. Only the lake is in the source.
  - unsupported: Finland's national landscape
  - unsupported: white quartzite hills
  - unsupported: island-studded
- `x030` place_blurb, Jūrmala, Latvia (LV): **unsupported**. The source gives no beach length, villas or Riga link.
  - unsupported: 30 km Baltic beach
  - unsupported: wooden art-nouveau villas
  - unsupported: easy from Riga
- `x033` place_blurb, Waterford, Ireland (IE): **unsupported**. Oldest city, Viking Triangle and Reginald's Tower are not in the source.
  - unsupported: Ireland's oldest city
  - unsupported: the Viking Triangle
  - unsupported: Reginald's Tower
- `x036` place_blurb, San Marino, San Marino (SM): **unsupported**. UNESCO status and fortresses are not in the source.
  - unsupported: UNESCO
  - unsupported: fortress
- `x037` place_blurb, Mavrovo National Park, North Macedonia (MK): **unsupported**. Korab, the church and Galicnik are not named in the source.
  - unsupported: under Mt Korab
  - unsupported: half-submerged church
  - unsupported: stone village of Galicnik
- `x041` place_blurb, Znojmo, Czechia (CZ): **unsupported**. The Dyje gorge setting and the 27 km underground are not in the source.
  - unsupported: stacked above the Dyje river gorge
  - unsupported: 27 km medieval underground
- `x045` place_blurb, Herceg Novi, Montenegro (ME): **unsupported**. The source only compares Herceg Novi with Kotor and states none of these facts.
  - unsupported: stair-stepped fortress town
  - unsupported: town of flowers
  - unsupported: at the Bay of Kotor's mouth
- `x047` place_blurb, Seyðisfjörður, Iceland (IS): **unsupported**. Only the East Iceland location is in the source.
  - unsupported: rainbow street
  - unsupported: pastel Norwegian houses
  - unsupported: waterfall-lined fjord
- `x051` place_blurb, Hiiumaa, Estonia (EE): **unsupported**. Lighthouses, beaches and juniper heath are not in the source.
  - unsupported: slow-paced
  - unsupported: historic lighthouses
  - unsupported: empty beaches
- `x062` place_blurb, Torun, Poland (PL): **unsupported**. Gingerbread and the Copernicus house are not in the source.
  - unsupported: brick lanes
  - unsupported: gingerbread
  - unsupported: house of Copernicus
- `x064` place_blurb, Prizren, Kosovo (XK): **unsupported**. Bridges, the fortress and the old town ranking are not in the source.
  - unsupported: Ottoman bridges
  - unsupported: hilltop fortress
  - unsupported: Kosovo's prettiest old town
- `x067` place_blurb, Grazalema, Spain (ES): **unsupported**. Griffon-cliff hikes are not mentioned in the source.
  - unsupported: greenest
  - unsupported: hub for griffon-cliff hikes
- `x069` place_blurb, Kranjska Gora, Slovenia (SI): **unsupported**. Triglav, the Vrsic Pass and Planica are not named in the source.
  - unsupported: under Triglav's peaks
  - unsupported: gateway to the Vrsic Pass
  - unsupported: Planica's ski jumps
- `x070` place_blurb, High Fens, Belgium (BE): **unsupported**. The cited source is an unrelated High Desert disambiguation line.
  - unsupported: Belgium's rooftop
  - unsupported: plateau of peat bogs
  - unsupported: boardwalk trails
- `x072` place_blurb, Bojnice, Slovakia (SK): **unsupported**. The source mentions no castle or zoo.
  - unsupported: fairytale castle
  - unsupported: turrets and moat
  - unsupported: Europe's oldest zoo next door
- `x077` place_blurb, Hvar, Croatia (HR): **unsupported**. The source names neither the Adriatic nor any glamour.
  - unsupported: Adriatic
  - unsupported: glam
