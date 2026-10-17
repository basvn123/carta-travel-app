# Carta roadmap

Oct 13, 2026, @Bas

Eerst het design, de datakwaliteit en de voorpagina; daarna één land volledig, dan alles linken, dan zoeken en de launch. Launchdoel: dinsdag 4 mei 2027.

## Hoe je dit gebruikt

- **Elke maandag** kies je twee of drie items uit de fase die loopt, zet je hun week in de kolom Week en hun status op Bezig.
- **Klaar** betekent dat de kolom "Klaar als" klopt in de app zelf, op een telefoon. Niet in de code.
- **Hoe** je iets aanpakt, beslis je zelf. Dit document zegt wat er in de app moet veranderen, niet welke techniek. Per fase staan open vragen die je kunt onderzoeken.
- **Aanpassen mag altijd:** rijen toevoegen, weken verschuiven of iets op Geparkeerd zetten. De fasetabel in het overzicht is de samenvatting; zet een fase op Klaar als al haar items klaar zijn.

## Overzicht

Vijf fases van design naar launch, met de handstappen uit je takenlijst als achtergrondspoor. De datums zijn een voorstel: schuif ze als een fase langer duurt.

&#91;embedded content: tijdlijn, 5 fases en 12 handstappen, oktober 2026 tot mei 2027\]

De fases lopen na elkaar; de handstappen lopen erachter mee. Blok 7 (de box) moet klaar zijn vóór fase 3, en blok 10 (bedrijf en Stripe) start vroeg omdat het lang duurt.

| Fase | Periode | Doel | Klaar als | Status |
| --- | --- | --- | --- | --- |
| 1. Design | 12 okt tot 15 nov (W42 tot W46) | Weten wat waar komt, in elke tab | Elk scherm heeft een goedgekeurd ontwerp en V6 staat live | Bezig |
| 2. Datakwaliteit en structuur | 16 nov tot 20 dec (W47 tot W51) | Wat je ziet klopt; elke bestemming heeft een vaste structuur | Steekproef van 200 items onder 2% fout, één prijs op elk scherm, nieuwe voorpagina live | Te doen |
| 3. Pilotland Italië | 4 jan tot 14 feb (W1 tot W6) | Eén land volledig en gecontroleerd | Elke Italiaanse regio op doel voor elke laag | Te doen |
| 4. Linken en planners | 15 feb tot 14 mrt (W7 tot W10) | Alles verwijst naar alles; de planners kloppen | Van elk item kom je in één tik bij alles in de buurt en in je trip | Te doen |
| 5. Zoeken, uitrol en launch | 15 mrt tot 9 mei (W11 tot W18) | Zoeken in gewone taal, meer landen, launch | Live op 4 mei 2027 | Te doen |

21 december tot 3 januari is buffer.

## Fase 1. Design: weten wat waar komt

*12 oktober tot 15 november*

Je hebt al veel: een ontwerpbrief per tab (T370 tot T379), één richtingsdocument met 94 aangenomen regels (T380) en de bouwgolven V3 tot V6 op de preview. Wat nog ontbreekt is jouw keuze per scherm: wat moet waar staan. Die leg je hier vast, vóór het werk aan de data eronder.

| # | Wat | Klaar als | Week | Status |
| --- | --- | --- | --- | --- |
| 1.1 | V6-design nakijken op een echte iPhone en Android, dan live zetten (blok 3) | Productie toont V1 tot V6 | W42 | Bezig |
| 1.2 | Designsysteem op één plek: kleuren, lettertypes en -groottes, knoppen, kaarten, chips en filters, iconen en de prijsnotatie, met voor elk een voorbeeld en wanneer je het gebruikt | Door alle tabs heen dezelfde knoppen, kaarten en prijsnotatie (nu nog 89 soorten knoppen, en hele euro's naast centen) | W43 | Te doen |
| 1.3 | Per tab opschrijven wat er nu staat, met de ontwerpbrief van die tab (T370 tot T379) erbij | Per tab een lijst: houden, weg, nieuw | W43 | Te doen |
| 1.3a | App-schil: kop, navigatie, instellingenbalk en de onderbalk op een telefoon | Goedgekeurde schets op telefoon en desktop | W43 | Te doen |
| 1.3b | Destinations-tab: categorieën, filters, de tripbibliotheek, land- en regiopagina's | Goedgekeurde schets op telefoon en desktop | W44 | Te doen |
| 1.3c | Trip planner: de stappen van de wizard en het geplande resultaat | Goedgekeurde schets op telefoon en desktop | W44 | Te doen |
| 1.3d | Day planner: de vragen, de dag en de kaart | Goedgekeurde schets op telefoon en desktop | W45 | Te doen |
| 1.3e | Saved trips, account, het pass-scherm en de pagina over de cijfers | Goedgekeurde schets op telefoon en desktop | W45 | Te doen |
| 1.4 | Bestemmingspagina met eerst een overzichtstab: trails, stranden, meren, bergen en dingen te doen in de buurt, plus de eigen info om te downloaden | Ontwerp goedgekeurd op een stad, een dorp en een berggebied | W44 | Te doen |
| 1.5 | Explore: kaart en lijst, met hetzelfde overzicht per plaats | Goedgekeurde schets op telefoon en desktop | W45 | Te doen |
| 1.6 | Eén sjabloon voor alle itempagina's: berg, trail, strand, meer, fietsroute, trip | Zes pagina's met dezelfde opbouw | W46 | Te doen |
| 1.7 | Voorpagina ontwerpen: de negen blokken uit het voorstel | Ontwerp goedgekeurd, cijfers nog voorlopig | W46 | Te doen |
| 1.8 | Open ontwerpkeuzes beslissen: welke dagprijs elk scherm toont, hele euro's of centen, de eerste categorie van Destinations, de kleur van de ster | Elke keuze staat in DIRECTION.md | W46 | Te doen |
| 1.9 | Telefoonproblemen die je nu ziet: hoofdknoppen onder de onderbalk, knoppen afgekapt op 380 px, de wizard die 48% van een Pixel 5 inneemt | Geen hoofdknop verborgen op iPhone 13 en Pixel 5 | W47 | Klaar in code (T468, 17 okt); check op een echte telefoon open (T468-a) |

Open vragen om zelf te onderzoeken:

- Wat hoort op de overzichtstab van een bestemming, en wat krijgt een eigen tab?
- Hoe tonen andere apps "in de buurt": een kaart, een lijst per soort, of beide?
- Wat downloadt een gebruiker precies: een PDF, GPX-bestanden, of beide?

## Fase 2. Datakwaliteit en structuur

*16 november tot 20 december*

Voor er meer inhoud bijkomt, moet wat je nu ziet kloppen, en krijgt elke bestemming een vaste structuur waar de rest aan hangt.

| # | Wat | Klaar als | Week | Status |
| --- | --- | --- | --- | --- |
| 2.1 | Zichtbare fouten rechtzetten: Mont Blanc toont zijn prominentie als hoogte en staat onder "Cable car to the top"; ruwe namen zoals "Chemin de Stevenson - Part 9/2 - utilisée"; onmogelijke lengtes zoals "Tour du Grand Luberon" van 3,5 km | Steekproef van 200 items onder 2% fout | W47 | Te doen |
| 2.2 | Eén prijs overal: op productie toonde dezelfde trip €1.268 in de planner en €1.821 gepland (9 oktober, nakijken op V6); Rome kost 87 of 99,54 euro per dag; de app telt 3.868 of 3.855 plaatsen; trippagina's tonen een geschreven bedrag naast het berekende | Zelfde bedrag en aantal op elk scherm | W47 | Te doen |
| 2.3 | "Dingen te doen" kloppen: geen museum onder Nature and trails, geen skiën in oktober, geen pleinen en kapelletjes bovenaan | Voor tien testbestemmingen een lijst die je zelf zou aanraden | W48 | Te doen |
| 2.4 | Woordenboek van bestemmingen: eerst uitbreiden met ontbrekende plaatsen en velden, dan één vaste fiche per bestemming met links naar natuur, trails, stranden, meren en bergen (jouw Gemini-document "1. Database structuur") | Elke bestemming heeft dezelfde velden en haar links | W48 tot W49 | Te doen |
| 2.5 | POI-structuur per bestemming: welke soorten je toont, hoeveel per soort, en wanneer het genoeg is | Een regel per soort; per bestemming zie je of ze eraan voldoet | W49 | Te doen |
| 2.6 | Coverage zichtbaar per land en regio (datalane F2) | Je ziet per land welke laag dun of leeg is | W50 | Te doen |
| 2.7 | Ratings en buren opnieuw berekenen (datalane F3 en F7) | Strand-, meer-, berg-, trail- en fietspagina's tonen hun buren uit andere lagen | W50 | Te doen |
| 2.8 | Kwaliteitsscore per item; "Report a problem" op elk item | Zwakke items blijven verborgen tot ze gefixt zijn | W51 | Te doen |
| 2.9 | Voorpagina live met de cijfers en voorbeelden van nu (het ontwerp uit 1.7) | Nieuwe bezoekers zien de nieuwe voorpagina | W51 | Te doen |

Open vragen om zelf te onderzoeken:

- Wat is een bestemming: elke gemeente, of alleen plaatsen met verblijf? En is "in de buurt" een afstand of een aantal rijminuten?
- Eén tabel met relaties of een graaf? Vergelijk met je Gemini-document.
- Welke bron wint bij een conflict: OpenStreetMap, Wikidata of de officiële site?

## Fase 3. Pilotland Italië

*4 januari tot 14 februari*

Eén land helemaal afmaken toont wat "volledig" betekent en levert een recept voor de rest van Europa. Italië is het voorstel: je noemde het zelf, het heeft elke laag (ook zeestranden), de planner telt er al 1.276 beoordeelde trails en 61 toppen, en de zware datalane neemt Italië mee in T119. Die draait op de Hetzner-box (blok 7), dus de box moet klaar zijn vóór deze fase.

Begin binnen Italië met één regio, bijvoorbeeld Trentino-Alto Adige: daar zitten bergen, meren, trails en trips dicht bij elkaar. Zo test je het recept in twee weken en rol je het daarna uit over de andere negentien regio's.

| # | Wat | Klaar als | Week | Status |
| --- | --- | --- | --- | --- |
| 3.1 | Pilotland en eerste regio bevestigen | Keuze en een doel per laag op papier | W1 | Te doen |
| 3.2 | Coverage-doel per laag voor Italië, gemeten per regio | Rapport per regio: op doel, dun of leeg | W1 | Te doen |
| 3.3 | Trailroutes vormen en combineren tot meerdaagse routes (jouw Gemini-document "2. Trails") | Meerdaagse routes in Trentino zichtbaar met hun etappes | W2 tot W3 | Te doen |
| 3.4 | Elk Italiaans item controleren tegen het internet (naam, lengte, hoogte, ligging), als aparte stap in de pipeline | Elk item heeft een controledatum en een bron | W3 tot W4 | Te doen |
| 3.5 | Alle Italiaanse bestemmingen in het woordenboek, gelinkt aan hun items | Elke bestemmingspagina in Italië toont haar trails, stranden, meren en bergen | W4 | Te doen |
| 3.6 | Trips: elke stijl aanwezig in Italië | Tien stijlen, minstens twee trips per stijl | W5 | Te doen |
| 3.7 | Zoekproef in gewone taal (RAG) op Italië, zoals "rustigste dorpjes binnen 45 minuten rijden van Bolzano" | Twintig testvragen met een juist antwoord en een bron | W5 tot W6 | Te doen |
| 3.8 | Het recept opschrijven: wat werkte en wat tijd kostte | Een checklist die je op het volgende land kunt toepassen | W6 | Te doen |

Open vragen om zelf te onderzoeken:

- Volgt "volledig" de officiële regio's, of je eigen indeling in streken?
- Welke bronnen gebruik je voor de controle, en wat doe je als ze elkaar tegenspreken?
- Hoe bouw je de zoekindex en wat kost een vraag? De AI in de app blijft Gemini (vaste regel in je takenlijst).

## Fase 4. Linken en planners

*15 februari tot 14 maart*

Nu de inhoud klopt, gaat alles naar elkaar verwijzen en moeten de twee planners logisch en juist zijn.

| # | Wat | Klaar als | Week | Status |
| --- | --- | --- | --- | --- |
| 4.1 | Elk item verwijst naar zijn bestemming en omgekeerd; de overzichtstab uit 1.4 met echte data | Van elke pagina kom je in één tik bij alles in de buurt | W7 | Te doen |
| 4.2 | "Voeg toe aan trip" op elk item; bewaarde lijsten per soort item | Een strand, berg of trail komt met één tik in je trip | W7 | Te doen |
| 4.3 | Tripplanner: de gekozen stijl filtert de routes, stops zijn steden (geen "Rome (Fiumicino)"), de prijs komt van de basisstad, "Plan a trip here" houdt stad en datums | Trail running in Italië geeft trail-running-trips | W8 | Te doen |
| 4.4 | Dagplanner: suggesties uit de lagen, het juiste seizoen, echte rijtijden | Een oktoberdag rond Chamonix zonder skiën of pleinen | W8 | Te doen |
| 4.5 | Beide planners controleren op tien voorbeeldtrips | Elk getal van de tien trips nagekeken | W9 | Te doen |
| 4.6 | Explore en Destinations delen filters, kaarten en zoeken | Hetzelfde filter geeft hetzelfde resultaat in beide tabs | W9 | Te doen |
| 4.7 | Voorpagina afwerken: elk blok linkt naar de echte item- en laagpagina's | Meer dan 60% van de nieuwe bezoekers klikt door | W10 | Te doen |
| 4.8 | Snel op een telefoon: nu halen laadtijd en reactietijd (LCP en INP) de norm niet | Core Web Vitals groen op een middenklasse telefoon | W10 | Te doen |

Open vragen om zelf te onderzoeken:

- Welke tab is de start voor wie al weet waar hij heen wil, en welke voor wie nog zoekt?
- Wat haalt een gebruiker uit een trip mee: PDF, GPX, agenda?

## Fase 5. Zoeken, uitrol en launch

*15 maart tot 9 mei*

Het recept uit Italië gaat naar meer landen, gebruikers kunnen zoeken in gewone taal, en Carta gaat live.

| # | Wat | Klaar als | Week | Status |
| --- | --- | --- | --- | --- |
| 5.1 | Zoeken in gewone taal voor gebruikers, eerst op Italië | Het zoekvak op de voorpagina beantwoordt de twintig testvragen | W11 tot W12 | Te doen |
| 5.2 | Het recept uitrollen naar de volgende landen (voorstel: Oostenrijk, Zwitserland, Frankrijk) | Elk land op doel volgens het coverage-rapport | W11 tot W17 | Te doen |
| 5.3 | Launchdag vastleggen, minstens 42 dagen vooraf (blok 12) | Datum gekozen, uiterlijk 23 maart | W12 | Te doen |
| 5.4 | Eén pagina per item en een sitemap (blok 11) | De pagina's verschijnen in Google | W12 tot W13 | Te doen |
| 5.5 | Nederlands, Frans en Duits nagelezen | Een moedertaallezer keurde elke taal goed | W14 | Te doen |
| 5.6 | Betalingen live (blok 10) | Testaankopen geslaagd, live keys aan | W14 | Te doen |
| 5.7 | Launch | Live op dinsdag 4 mei 2027 | W18 | Te doen |
| 5.8 | Later: de kosten van deur tot trail | Na de launch opnieuw bekijken | na W18 | Geparkeerd |

## Achtergrond: handstappen uit je takenlijst

Deze blokken uit `1-manual-steps.md` lopen naast de fases. Ze staan hier alleen om te zien wanneer ze een fase vrijgeven; de stappen zelf staan in dat bestand.

| Blok | Wat | Wanneer | Nodig voor | Status |
| --- | --- | --- | --- | --- |
| 1 | Push naar GitHub en CI nakijken | W42 | alles wat volgt | Te doen |
| 2 | Gemini afronden, wave 17 starten; weekmeting vanaf 14 oktober | W42 tot W43 | fase 3 (zoekproef) | Te doen |
| 3 | V6 nakijken en live zetten | W42 tot W43 | fase 1 (item 1.1) | Bezig |
| 4 | Admin en database nakijken | W44 |  | Te doen |
| 5 | Huishouden; de trails-lab-dump moet vóór 6 november | W44 |  | Te doen |
| 6 | Datalane op de laptop (F1 tot F9) | W47 tot W51 | fase 2 | Te doen |
| 7 | De Hetzner-box | W49 tot W51 | fase 3 (Italië in T119) | Te doen |
| 8 | Afbeeldingen en terrein op de CDN | W1 tot W6 | fase 3 en 4 | Te doen |
| 9 | Betaalde Gemini-runs | W4 tot W8 | metingen en de zoekproef | Te doen |
| 10 | Bedrijf, juridisch, Stripe (lange doorlooptijd, dus vroeg starten) | W45 tot W14 | fase 5 (item 5.6) | Te doen |
| 11 | Prerender en zoekmachines | W12 tot W13 | fase 5 (item 5.4) | Te doen |
| 12 | Launch, met de runway vanaf launchdag D | W12 tot W18 | fase 5 (item 5.7) | Te doen |

## Weekplan

Twee of drie items per week. De status houd je bij in de fasetabellen; schuif hier gerust items naar een andere week.

| Week | Maandag | Focus |
| --- | --- | --- |
| W42 | 12 okt 2026 | 1.1; blok 1, 2 en 3 |
| W43 | 19 okt | 1.2, 1.3, 1.3a |
| W44 | 26 okt | 1.3b, 1.3c, 1.4; blok 4 en 5 (dump vóór 6 november) |
| W45 | 2 nov | 1.5, 1.3d, 1.3e; blok 10 starten (eenmanszaak, boekhouder) |
| W46 | 9 nov | 1.6, 1.7, 1.8; fase 1 afronden |
| W47 | 16 nov | 1.9, 2.1, 2.2; datalane F1 |
| W48 | 23 nov | 2.3, 2.4 |
| W49 | 30 nov | 2.4, 2.5; blok 7 starten (box) |
| W50 | 7 dec | 2.6, 2.7 (datalane F2, F3, F7) |
| W51 | 14 dec | 2.8, 2.9; fase 2 afronden; box klaar |
| W52 | 21 dec | buffer |
| W53 | 28 dec | buffer |
| W1 | 4 jan 2027 | 3.1, 3.2 |
| W2 | 11 jan | 3.3 |
| W3 | 18 jan | 3.3, 3.4 |
| W4 | 25 jan | 3.4, 3.5; blok 9 starten |
| W5 | 1 feb | 3.6, 3.7 |
| W6 | 8 feb | 3.7, 3.8; fase 3 afronden |
| W7 | 15 feb | 4.1, 4.2 |
| W8 | 22 feb | 4.3, 4.4 |
| W9 | 1 mrt | 4.5, 4.6 |
| W10 | 8 mrt | 4.7, 4.8; fase 4 afronden |
| W11 | 15 mrt | 5.1; 5.2 starten |
| W12 | 22 mrt | 5.3 (launchdag uiterlijk 23 maart), 5.4 |
| W13 | 29 mrt | 5.4; 5.2 |
| W14 | 5 apr | 5.5, 5.6 |
| W15 | 12 apr | 5.2; soft-launch-lijst klaar (uiterlijk 13 april) |
| W16 | 19 apr | gates legal, payments, perf en uptime gehaald; regels van communities nalezen |
| W17 | 26 apr | outreach versturen; go of no-go |
| W18 | 3 mei | 5.7 launch op dinsdag 4 mei |
