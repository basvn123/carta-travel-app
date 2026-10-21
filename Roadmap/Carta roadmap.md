# Carta roadmap

Oct 13, 2026, @Bas; bijgewerkt 20 oktober (T469 tot T472)

Eerst het design, de datakwaliteit en de voorpagina; daarna één land volledig, dan alles linken, dan zoeken en de launch. Launchdoel: dinsdag 4 mei 2027.

Waarom Carta bestaat staat in PRODUCT.md onder "Mission": een goedkope vlucht is nog geen goedkope reis, en Carta neemt de onzekerheid over wat de dagen ter plaatse kosten weg. Elke rij hieronder moet die belofte dichterbij brengen. Hoe reizigers beslissen staat in `user_knowledge.md`.

Vier plannen werken de rijen uit; de roadmap zegt wat en wanneer, het plan zegt waarom en hoe:

| Plan | Rijen |
| --- | --- |
| [Designsysteem 1.2](1.2-design-system-plan.md) | 1.2 |
| [Navigatie, pass en prijsweergave](1.15-navigatie-pass-prijsweergave.md) | 1.15 tot 1.18, 2.18 tot 2.21, 4.18 tot 4.21, 5.11, 5.12 |
| [Seizoen, rating en prijs per maand](2.10-seizoen-rating-prijs.md) | 1.10, 1.11, 2.10 tot 2.13, 3.9, 4.9 tot 4.12 |
| [Kosten en logistiek](2.14-kosten-en-logistiek.md) | 1.12 tot 1.14, 2.14 tot 2.17, 3.10, 4.13 tot 4.17, 5.9, 5.10 |

## Hoe je dit gebruikt

- **Elke maandag** kies je twee of drie items uit de fase die loopt, zet je hun week in de kolom Week en hun status op Bezig.
- **Klaar** betekent dat de kolom "Klaar als" klopt in de app zelf, op een telefoon. Niet in de code.
- **Hoe** je iets aanpakt, beslis je zelf. Dit document zegt wat er in de app moet veranderen, niet welke techniek. Per fase staan open vragen die je kunt onderzoeken.
- **Aanpassen mag altijd:** rijen toevoegen, weken verschuiven of iets op Geparkeerd zetten. De fasetabel in het overzicht is de samenvatting; zet een fase op Klaar als al haar items klaar zijn.

## Begin hier

**Deze week (W43, vanaf 19 oktober):** 1.2 is af in code (T474; alleen jouw besluit T435-i staat nog open), dus nu 1.3 en 1.3a (de app-schil, met de drie plekken uit 1.15 als uitgangspunt) en 1.10 (het weerbericht, nu stuk op productie). Daarna W44: 1.16 (de prijszin) en 1.14 (de kaartknop) zijn klein en gaan meteen live.

**Jouw besluiten, met de week waarin ze nodig zijn.** De voorstellen en de reden staan in het plan van elke rij; elk besluit staat ook als rij in `Execution/_OPEN.md`.

| Besluit | Vraag | Voorstel | Nodig vóór |
| --- | --- | --- | --- |
| T471-b | De één-zin voor kosten plus logistiek | Een van de drie opties in het plan | W45 (1.13) |
| T472-f | Hoofdacties op de telefoon 48 px | Ja in planners en onderbalk | W45 (1.17) |
| T472-g | Dagdelen boven de klok | Boven de klok | W45 (1.17) |
| T472-e | Buffer op het triptotaal | Regel van de reiziger, standaard uit | W46 (1.18) |
| T471-a | Numbeo vervangen of betalen | Vervangen (Eurostat plus eigen metingen) | W48 (2.14) |
| T470-a | LiteAPI-productiesleutel en Hostelworld-aanvraag (handstap) | Doen | W49 (2.12) |
| T471-d | MOTIS op de Hetzner-box | Ja, eerst Italië, Oostenrijk en Zwitserland | W51 (2.16) |
| T471-c | Alternatieven over de grens | Ja voor Europa, nee voor dichtbij | W7 (4.13) |
| T472-d | Delen en samen bewerken gratis | Ja; de pass houdt export, trips en AI | W13 (5.12, vóór 5.6) |

Besloten op 20 oktober (T473): drie plekken in de navigatie (Explore met Destinations erin, Plan, My trips) plus een accounticoon (T472-a); de pass heet Trip Pass en een knop zegt nooit "Get a pass" alleen (T472-b); de eerste trip bewaart op het toestel zonder account (T472-c).

## Overzicht

Vijf fases van design naar launch, met de handstappen uit je takenlijst als achtergrondspoor. De datums zijn een voorstel: schuif ze als een fase langer duurt.

&#91;embedded content: tijdlijn, 5 fases en 12 handstappen, oktober 2026 tot mei 2027\]

De fases lopen na elkaar; de handstappen lopen erachter mee. Blok 7 (de box) moet klaar zijn vóór fase 3, en blok 10 (bedrijf en Stripe) start vroeg omdat het lang duurt.

| Fase | Periode | Doel | Klaar als | Status |
| --- | --- | --- | --- | --- |
| 1. Design | 12 okt tot 15 nov (W42 tot W46) | Weten wat waar komt, in elke tab | Elk scherm heeft een goedgekeurd ontwerp en V6 staat live | Bezig |
| 2. Datakwaliteit en structuur | 16 nov tot 20 dec (W47 tot W51) | Wat je ziet klopt; elke bestemming heeft een vaste structuur | Steekproef van 200 items onder 2% fout, één prijs op elk scherm, nieuwe voorpagina live | Te doen |
| 3. Pilotland Italië | 4 jan tot 14 feb (W1 tot W6) | Eén land volledig en gecontroleerd | Elke Italiaanse regio op doel voor elke laag | Te doen |
| 4. Linken en planners | 15 feb tot 21 mrt (W7 tot W11) | Alles verwijst naar alles; de planners kloppen en zijn één werkruimte | Van elk item kom je in één tik bij alles in de buurt en in je trip | Te doen |
| 5. Zoeken, uitrol en launch | 22 mrt tot 9 mei (W12 tot W18) | Zoeken in gewone taal, meer landen, launch | Live op 4 mei 2027 | Te doen |

21 december tot 3 januari is buffer.

## Fase 1. Design: weten wat waar komt

*12 oktober tot 15 november*

Je hebt al veel: een ontwerpbrief per tab (T370 tot T379), één richtingsdocument met 94 aangenomen regels (T380) en de bouwgolven V3 tot V6 op de preview. Wat nog ontbreekt is jouw keuze per scherm: wat moet waar staan. Die leg je hier vast, vóór het werk aan de data eronder.

| # | Wat | Klaar als | Week | Status |
| --- | --- | --- | --- | --- |
| 1.1 | V6-design nakijken op een echte iPhone en Android, dan live zetten (blok 3) | Productie toont V1 tot V6 | W42 | Klaar (V1 tot V6 live op 13 okt; T464 tot T468 en T435 op 17 okt) |
| 1.2 | Designsysteem op één plek: kleuren, lettertypes en -groottes, knoppen, kaarten, chips en filters, iconen en de prijsnotatie, met voor elk een voorbeeld en wanneer je het gebruikt | Door alle tabs heen dezelfde knoppen, kaarten en prijsnotatie (nu nog 89 soorten knoppen, en hele euro's naast centen) | W43 | Klaar in code (T474, 21 okt): de restlijst T435-a tot T435-h gebouwd (journeylink, fotobronnen, één Lifestyle, één eenheid, één paginabalk, CSS per route 893 naar 741 KB, z-index-ladder, de kleine punten); open: jouw besluit T435-i (de tilde op de pins) en een telefooncheck (T474-f) |
| 1.3 | Per tab opschrijven wat er nu staat, met de ontwerpbrief van die tab (T370 tot T379) erbij | Per tab een lijst: houden, weg, nieuw | W43 | Ontwerp klaar, wacht op jouw akkoord ([inventaris](1.3-tabs-inventaris.md), T484) |
| 1.3a | App-schil: kop, navigatie, instellingenbalk en de onderbalk op een telefoon, met de drie plekken uit 1.15 | Goedgekeurde schets op telefoon en desktop | W43 tot W44 | Ontwerp klaar, wacht op jouw akkoord ([app-schil](1.3a-app-schil.md), T485) |
| 1.3b | Destinations-tab: categorieën, filters, de tripbibliotheek, land- en regiopagina's | Goedgekeurde schets op telefoon en desktop | W44 | Ontwerp klaar, wacht op jouw akkoord ([destinations](1.3b-destinations.md), T489) |
| 1.3c | Trip planner: de stappen van de wizard en het geplande resultaat | Goedgekeurde schets op telefoon en desktop | W44 | Ontwerp klaar, wacht op jouw akkoord ([tripplanner](1.3c-tripplanner.md), T490) |
| 1.3d | Day planner: de vragen, de dag en de kaart | Goedgekeurde schets op telefoon en desktop | W45 | Ontwerp klaar, wacht op jouw akkoord ([dagplanner](1.3d-dagplanner.md), T492) |
| 1.3e | Saved trips, account, het pass-scherm en de pagina over de cijfers | Goedgekeurde schets op telefoon en desktop | W45 | Te doen |
| 1.4 | Bestemmingspagina met eerst een overzichtstab: trails, stranden, meren, bergen en dingen te doen in de buurt, plus de eigen info om te downloaden | Ontwerp goedgekeurd op een stad, een dorp en een berggebied | W44 | Ontwerp klaar, wacht op jouw akkoord ([bestemmingspagina](1.4-bestemmingspagina.md), T491) |
| 1.5 | Explore: kaart en lijst, met hetzelfde overzicht per plaats | Goedgekeurde schets op telefoon en desktop | W45 | Te doen |
| 1.6 | Eén sjabloon voor alle itempagina's: berg, trail, strand, meer, fietsroute, trip | Zes pagina's met dezelfde opbouw | W46 | Te doen |
| 1.7 | Voorpagina ontwerpen: de negen blokken uit het voorstel | Ontwerp goedgekeurd, cijfers nog voorlopig | W46 | Te doen |
| 1.8 | Open ontwerpkeuzes beslissen: welke dagprijs elk scherm toont, hele euro's of centen, de eerste categorie van Destinations, de kleur van de ster | Elke keuze staat in DIRECTION.md | W46 | Te doen |
| 1.9 | Telefoonproblemen die je nu ziet: hoofdknoppen onder de onderbalk, knoppen afgekapt op 380 px, de wizard die 48% van een Pixel 5 inneemt | Geen hoofdknop verborgen op iPhone 13 en Pixel 5 | W47 | Klaar in code (T468, 17 okt); check op een echte telefoon open (T468-a) |
| 1.10 | Weerbericht herstellen: het 7-daagse weer wordt op productie geblokkeerd (de CSP mist `api.open-meteo.com`) en draait op een gratis licentie die geen commercieel gebruik toestaat; overstappen naar MET Norway (besloten 20 oktober) via een eigen proxy ([seizoensplan](2.10-seizoen-rating-prijs.md), punt 5) | Het weer staat op productie, met bron en tijdstip | W43 | Klaar (live 21 okt, T483 en T493) |
| 1.11 | Ontwerp seizoen: één reden per maand op de kaart, de maandbalk (prijs en weer) met een slimme tip en één knop naar betere datums, de zonsondergang en het binnenfilter in de dagplanner ([seizoensplan](2.10-seizoen-rating-prijs.md), punten 1, 4 en 5) | Goedgekeurde schets op telefoon en desktop, kleuren uit carta-design | W46 | Te doen |
| 1.12 | Ontwerp kosten en logistiek: het blok "Not quite right?" met goedkopere alternatieven, "Sleep nearby and save", het Lifestyle-paneel als bon per regel, een rit met tijd en kosten samen, de kaartknop bovenaan de dag ([kosten en logistiek](2.14-kosten-en-logistiek.md), punten 1, 2, 3, 6 en 7) | Goedgekeurde schets op telefoon en desktop, kleuren uit carta-design | W46 | Te doen |
| 1.13 | Positionering vastleggen: "wat de trip kost en hoe je er komt, in één plan" en "Carta navigeert nooit, je kaartapp brengt je er", in PRODUCT.md, carta-design, de voorpagina, de FAQ en de oude documenten die nog zeggen dat Carta vluchten prijst ([kosten en logistiek](2.14-kosten-en-logistiek.md), punt 4; jouw zin, T471-b) | Elk bestand uit de lijst in punt 4 zegt hetzelfde; geen document zegt nog dat Carta de vlucht prijst | W45 | Te doen |
| 1.14 | Kaartknop herstellen: Google Maps staat in een mobiele browser maar 3 tussenstops toe en de app stuurt er tot 9; de knop naar boven als "Open Day 2 in Google Maps", in stukken op een telefoon, Apple Maps op een iPhone ([kosten en logistiek](2.14-kosten-en-logistiek.md), punt 7) | Een dag met 8 stops opent volledig op een iPhone en een Pixel, in Google Maps en in Apple Maps | W44 | Klaar (live 21 okt, T487 en T493) |
| 1.15 | Ontwerp navigatie: drie plekken (Explore met Destinations erin, Plan met trip en dag, My trips) en een accounticoon (besloten 20 oktober, T473); "Get a pass" uit de kop, de pass alleen op het moment dat je iets betaalds aantikt, in Account en op de prijzenpagina; één zin over wat gratis is ("Planning is free. A Trip Pass adds exports, more saved trips and more AI plans."), nooit "100% free" ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punten 1 en 2; besloten T472-a tot c, T473) | Goedgekeurde schets op telefoon en desktop; elke betaalde actie heeft haar passblad; de zin staat in carta-design | W44 | Ontwerp klaar, wacht op jouw akkoord ([navigatieontwerp](1.15-navigatie-ontwerp.md), T488); de zin in carta-design volgt (T488-i) |
| 1.16 | Wat de prijs bevat, in één zin overal: de voorpagina en de FAQ zeggen nu "local transport" en de bestemmingspagina zegt dat het er niet in zit, terwijl de som bed plus eten is; zes talen, PRODUCT.md en carta-design gelijk; plus de tekst die aan elkaar plakt (wizard-landkaart, getallen buiten de vertaalsleutel) en de dode oude bon ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punten 4 en 6) | Geen scherm of document zegt dat lokaal vervoer in de dagprijs zit, tot 2.14 die regel bouwt; een schermlezer leest "Italy, from about 87 euros" | W44 | Klaar (live 21 okt, T486 en T493) |
| 1.17 | Ontwerp één werkruimte voor trip en dag: de dag klapt open in de trip met stad en datum ingevuld, desktop route of dag links en kaart rechts met een vaste kostenbalk, telefoon kaart met een schuiflade in drie standen, ochtend, middag en avond boven de klok, tikken in plaats van slepen, 48 px voor de hoofdacties ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punten 7 en 8; besluiten T472-f en g) | Goedgekeurde schets op telefoon en desktop, samen met 1.3c en 1.3d | W45 | Te doen |
| 1.18 | Prijsweergave vastleggen: één teken per prijs (`~€43 est.` of niets), het niveau één keer op de bon (stad of land), bron en datum in de uitklap, geen bandbreedtes op kaarten, de buffer als regel van de reiziger ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punten 4 en 5; besluit T472-e) | De regel staat in carta-design en DIRECTION.md, met 1.8 | W46 | Te doen |
| 1.19 | Ontwerp zoeken op totaalbudget: één zoekbalk bovenaan voorpagina en Explore ("Hoeveel heb je?", wie, hoe lang, wanneer, vanaf waar en hoe), resultaten in de groepen Past en Krap met wat je overhoudt, de volledige bon met lokaal vervoer, tickets, buffer en een budgetregel; het totaal voor jouw groep als kopprijs, met de dagprijs per persoon eronder (besloten 20 oktober, T475-c), en standaard 10% buffer (T475-d) ([budgetplan](2.22-budget-vervoer-dag-delen.md), punt 1; hoort bij 1.8) | Goedgekeurde schets op telefoon en desktop, met een voorbeeld "2 personen, €1.500, 5 dagen in oktober" | W45 | Te doen |
| 1.20 | Ontwerp dagplanner-flow, reisstukken en vergelijkkaart: verblijf eerst, de opties van een dag naast elkaar (blijven of dagtrip, met reistijd, lopen, tickets, wat dicht is en het effect op je trip), de kostbalk, tempo als vergelijking; een reisstuk met tijd, overstappen, prijsbandbreedte en bron; de vergelijk- en stemkaart voor de groep ([budgetplan](2.22-budget-vervoer-dag-delen.md), punten 3, 4 en 5) | Goedgekeurde schets op telefoon en desktop | W46 | Te doen |

Open vragen om zelf te onderzoeken:

- Wat hoort op de overzichtstab van een bestemming, en wat krijgt een eigen tab?
- Hoe tonen andere apps "in de buurt": een kaart, een lijst per soort, of beide?
- Wat downloadt een gebruiker precies: een PDF, GPX-bestanden, of beide?
- Besloten 20 oktober: de kopprijs op kaart en lijst is het totaal voor jouw groep, met de dagprijs per persoon eronder (T475-c); het budgetzoeken rekent standaard met 10% buffer (T475-d); ook een gast mag een stemming maken (T475-b).

## Fase 2. Datakwaliteit en structuur

*16 november tot 20 december*

Voor er meer inhoud bijkomt, moet wat je nu ziet kloppen, en krijgt elke bestemming een vaste structuur waar de rest aan hangt. Daar hoort sinds 20 oktober ook het seizoen bij: per maand wat een plek waard is, wat het kost en waarom (2.10 tot 2.13, uitgewerkt in het [seizoensplan](2.10-seizoen-rating-prijs.md)). Die vier zijn vooral pipeline-werk in de datalane; jouw tijd gaat naar twee beoordelingen. Daarna komen kosten en logistiek (2.14 tot 2.17, uitgewerkt in [kosten en logistiek](2.14-kosten-en-logistiek.md)): een Lifestyle die per categorie rekent zonder Numbeo, eigen bedprijzen voor de buren van dure steden, de graaf met reistijden tussen bestemmingen, en kinder- en kinderwagendata. Daarna komt de rest van de reiskosten erbij: één totaalbon met lokaal vervoer, tickets en buffer, de feiten die een dag uitvoerbaar maken (openingsuren, toegangsprijzen), en waarom een prijs is wat hij is (2.22 tot 2.24, uitgewerkt in het [budgetplan](2.22-budget-vervoer-dag-delen.md)).

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
| 2.10 | Rating repareren vóór hij per maand mag bewegen: een UNESCO-geopark telt als nationaal park (Bochum 8,5 "Worth a detour", vlak onder Sevilla 8,6), scores schuiven nog bij elke nieuwe plaats, Rome en Parijs staan zeven keer in de top 15 (elk vliegveld een rij), de reden en "geschat" staan niet op de pagina; daarna een controle tegen externe ranglijsten ([seizoensplan](2.10-seizoen-rating-prijs.md), punt 2) | 100 plaatsen erbij verschuift geen bestaande score; de 30 grootste verschillen met de externe lijsten door Claude beoordeeld met bron en door jou nagekeken | W47 tot W48 | Te doen |
| 2.11 | Seizoensfiche per bestemming: klimaat ververst (2001 tot 2025, nu 2001 tot 2020) en aangevuld met regendagen, zon, daglicht, zeewater en sneeuw; tijdzone; drukte per maand; sluitingen (veerboten, passen, hutten, liften, open aanbod), elk met een bron | Elke bestemming, ook een nieuwe, heeft per maand feiten en beperkingen met bron en datum | W48 tot W49 | Te doen |
| 2.12 | Prijs per maand op elk scherm: de bon volgt de maand al, de kaart niet (Edinburgh ~€135 op de kaart, €182,61 op de bon); de seizoenscurve komt uit reviews in plaats van prijzen (augustus met de Fringe maar +5%), 3.251 plaatsen hebben geen eigen curve, de 284 prijzen per slaapsoort zijn testdata | Kaart, pin, pagina, bon en planner tonen dezelfde maandprijs uit echte, gratis gemeten tarieven (LiteAPI en Hostelworld, €0 per ronde); terugtest onder 15% fout; geen testdata in de wire | W49 tot W50 | Te doen |
| 2.13 | Maandoordeel en maandscore met één menselijke zin waarom, uit vaste regels en de feiten van die plaats, in zes talen (geen AI bij het laden) | Van 60 bestemmingsmaanden (door Claude beoordeeld met twee bronnen, tien nagekeken door jou) klopt 90% | W50 tot W51 | Te doen |
| 2.14 | Lifestyle-motor: elke instelling is een hoeveelheid maal een prijs; prijzen per categorie uit Eurostat (eten, drank, restaurant, vervoer, cultuur) met een stadsfactor, Numbeo eruit (T471-a); drie maaltijdslots zodat zelf koken een maaltijd vervangt; personen per kamer; vervoer in de stad en tickets op de dag ([kosten en logistiek](2.14-kosten-en-logistiek.md), punt 2) | Elke instelling verandert de prijs op elke bestemming; Foodie is nergens goedkoper dan Easygoing; 30 steden binnen 20% van twee publieke budgetbronnen; geen Numbeo-cijfer in de wire | W48 tot W50 | Te doen |
| 2.15 | Eigen bedprijs voor de buren van dure steden, in dezelfde gratis LiteAPI-ronde als 2.12; `source_km` meet de plaats zelf (Prato zegt nu 0,1 km van Florence) | Rond de tien dure steden uit punt 3 heeft elke buur binnen 45 minuten een eigen gemeten bedprijs | W49 tot W50 | Te doen |
| 2.16 | De graaf tussen bestemmingen: rijtijd (Valhalla) en trein- en busverbinding (MOTIS met open dienstregelingen) op de box, plus het gelijkenisprofiel `alike` (top 20 per bestemming) ([kosten en logistiek](2.14-kosten-en-logistiek.md), punten 1 en 6) | Elke bestemming kent haar buren binnen 2 uur met tijd, manier en verbinding; een nieuwe plaats krijgt ze vanzelf | W51 | Te doen |
| 2.17 | Kinderen en kinderwagen als data: rolstoel, speeltuin, verschoontafel, trappen en oppervlak uit OSM op de POI's, plus een tabel per soort plaats | Elke POI-soort heeft een waarde voor kinderen en voor stapvrij, met bron | W50 | Te doen |
| 2.18 | Navigatie en pass live volgens 1.15: drie plekken en account, "Get a pass" uit de kop, het passblad op elk betaald moment, de zin over gratis op voorpagina, FAQ en passcherm; oude links (`?tab=destinations`, `?tab=map`, `#trip=`, `#coplan=`) leiden naar de nieuwe plek ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punten 1 en 2) | Op een iPhone en een Pixel: drie plekken plus account, geen pass in de kop, elke oude link opent de juiste plek | W47 | Te doen |
| 2.19 | Opslaan zonder account: de eerste trip bewaart op het toestel ("Saved on this device"); inloggen pas bij een tweede toestel, samen bewerken of een tweede trip ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punt 2; besloten T472-c, T473) | Een nieuwe bezoeker bewaart een trip zonder inlogscherm en vindt hem na herladen terug in My trips | W48 | Te doen |
| 2.20 | Instellingen sturen elk getal: de balk toont de standaard als zin ("Prices for 14 to 21 Nov, 2 people"), duur apart te kiezen, groepsgrootte verandert de kaartprijs, een maandrail toont de prijs van die maand ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punt 3) | Datums, personen of Lifestyle wijzigen op Explore verandert kaart, pin, pagina, bon en planner naar hetzelfde bedrag; "Best in October" toont oktoberprijzen | W50 | Te doen |
| 2.21 | Prijsniveau eerlijk in de data: elk bed- en eetgetal draagt zijn niveau (eigen meting, geleend van een stad, land) met bron en datum; geen vulwaarden (Moldavië, Roemenië, Kosovo en Albanië staan alle vier op exact €48 per nacht) ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punt 5) | Geen twee landen delen een landprijs zonder bron; elke bonregel noemt haar niveau | W49 | Te doen |
| 2.22 | Eén totaalbon: `priceTrip` rekent ook lokaal vervoer (ritten per dag × ritprijs, dagkaart als plafond), tickets en een buffer, en een budget wordt een eigenschap van de trip; zoeken, bon, tripplanner en dagplanner rekenen met dezelfde functie. Fouten eruit: datums begrensd door het vluchtvenster (19 december), een getypt bedrag afgerond naar een dagtrede, de dagplanner met eigen tarieven per km, de og-tekst die lokaal vervoer belooft ([budgetplan](2.22-budget-vervoer-dag-delen.md), punt 1) | 25 met de hand nagerekende budgetvragen geven op elk scherm hetzelfde bedrag tot op de euro | W48 tot W49 | Te doen |
| 2.23 | POI-feiten voor een dag: openingsuren uit OSM, toegangsprijzen in drie treden (opgezocht met bron, mediaan per soort en land, gratis soorten), binnen of buiten, ritprijs en dagkaart per stad; elk met bron en datum (T433-b, T378-c) | Voor tien testdagen klopt elke openingstijd en elke prijs met de officiële site; zonder data staat er "onbekend", nooit "open" | W49 tot W50 | Te doen |
| 2.24 | Waarom deze prijs: de dagprijs ontleed in land, plaats en seizoen tegenover het Europese midden, als één zin uit de zinsdelenbank van 2.13; het label "Goedkoop, met een reden" als een goedkope maand ook een zwakke maand is; het filter "Not crowded" dat nu de 261 rustigste plaatsen weglaat | Edinburgh in november, Sevilla en Plovdiv in oktober zeggen elk in één zin waarom ze kosten wat ze kosten; elke goedkope zwakke maand uit de gouden set van 2.13 draagt het label | W51 | Te doen |

Besloten op 20 oktober (T470): weer van MET Norway; hotelprijzen alleen uit gratis, echte bronnen (jouw handstap: de LiteAPI-productiesleutel en de Hostelworld-aanvraag, T470-a, vóór W49); de kaart toont de maandscore en waarom; Claude doet de twee beoordelingen, jij kijkt ze na.

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
| 3.9 | Seizoen in Italië nakijken: maandoordelen, sluitingen en maandprijzen tegen lokale bronnen (Dolomieten in november, de eilanden in de winter, Sicilië in augustus) | Elke Italiaanse sluiting heeft een bron en een datum; de maandprijzen van tien steden binnen 15% van een echte zoekopdracht | W5 tot W6 | Te doen |
| 3.10 | Kosten en logistiek in Italië nakijken: de alternatieven voor Florence, Venetië, Cinque Terre en Amalfi, "sleep nearby" rond Florence en Venetië, en 20 ritten met auto, trein en bus tegen de sites van de vervoerders | 70% van de bekende alternatieven in de top drie; ritten binnen de doelen van punt 6 | W5 tot W6 | Te doen |
| 3.11 | Reistijden Italië zonder partners: MOTIS zelf gehost op de box met open dienstregelingen (Trenitalia, regionaal, FlixBus), een matrix van alle bestemmingen binnen 300 km plus de grote knooppunten, en een prijsmodel per land geijkt op 30 echte ritprijzen; Transitous zelf mag niet (alleen niet-commercieel) ([budgetplan](2.22-budget-vervoer-dag-delen.md), punt 3) | Verona, Padua en Ferrara tonen echte reistijd, overstappen en ritten per dag; 30 steekproefritten: tijd binnen 15%, prijs binnen 25% | W3 tot W5 | Te doen |

Open vragen om zelf te onderzoeken:

- Volgt "volledig" de officiële regio's, of je eigen indeling in streken?
- Welke bronnen gebruik je voor de controle, en wat doe je als ze elkaar tegenspreken?
- Hoe bouw je de zoekindex en wat kost een vraag? De AI in de app blijft Gemini (vaste regel in je takenlijst).

## Fase 4. Linken en planners

*15 februari tot 21 maart*

Nu de inhoud klopt, gaat alles naar elkaar verwijzen en moeten de twee planners logisch en juist zijn. Daarna worden ze één werkruimte (4.18 tot 4.21). Hier komt ook het zoeken op totaalbudget naar voren, en laten beide planners bij elke keuze zien wat die doet met je totaal (4.22 tot 4.24). Deze fase telt 24 rijen; daarom loopt ze tot en met W11, zonder dat de launch schuift. Past het niet, dan schuift 4.24 naar W11 en 4.12 naar fase 5.

| # | Wat | Klaar als | Week | Status |
| --- | --- | --- | --- | --- |
| 4.1 | Elk item verwijst naar zijn bestemming en omgekeerd; de overzichtstab uit 1.4 met echte data | Van elke pagina kom je in één tik bij alles in de buurt | W7 | Te doen |
| 4.2 | "Voeg toe aan trip" op elk item; bewaarde lijsten per soort item | Een strand, berg of trail komt met één tik in je trip | W7 | Te doen |
| 4.3 | Tripplanner: de gekozen stijl filtert de routes, stops zijn steden (geen "Rome (Fiumicino)"), de prijs komt van de basisstad, "Plan a trip here" houdt stad en datums | Trail running in Italië geeft trail-running-trips | W8 | Te doen |
| 4.4 | Dagplanner: suggesties uit de lagen, het juiste seizoen (uit de seizoensfiche van 2.11), echte rijtijden (uit de graaf van 2.16) | Een oktoberdag rond Chamonix zonder skiën of pleinen | W8 | Te doen |
| 4.5 | Beide planners controleren op tien voorbeeldtrips | Elk getal van de tien trips nagekeken | W9 | Te doen |
| 4.6 | Explore en Destinations delen filters, kaarten en zoeken | Hetzelfde filter geeft hetzelfde resultaat in beide tabs | W9 | Te doen |
| 4.7 | Voorpagina afwerken: elk blok linkt naar de echte item- en laagpagina's | Meer dan 60% van de nieuwe bezoekers klikt door | W10 | Te doen |
| 4.8 | Snel op een telefoon: nu halen laadtijd en reactietijd (LCP en INP) de norm niet | Core Web Vitals groen op een middenklasse telefoon | W10 | Te doen |
| 4.9 | Explore toont de maand: maandscore, dagprijs van die maand en de reden op kaart en lijst (besloten 20 oktober: met een gekozen maand de maandscore en waarom); "Best in October" zegt per plaats waarom | Cortina in november staat niet meer bij de besten, en de kaart zegt waarom | W7 | Te doen |
| 4.10 | Maandbalk met slimme tip op de bestemmingspagina en de bon: twaalf maanden prijs en weer, één uitgerekende zin, één knop die de datums verschuift (zelfde lengte, met Undo); nooit bij vastliggende datums ([seizoensplan](2.10-seizoen-rating-prijs.md), punt 4) | Edinburgh in november toont de tip, de knop zet september en kan terug | W8 | Te doen |
| 4.11 | Dagplanner: zonsondergang als lijn in de dag, een melding bij buiten na donker, een binnenfilter bij regen; de AI-dagplanner krijgt het uur van zonsondergang mee | Een novemberdag in Edinburgh met een wandeling na 16:09 krijgt de melding | W8 tot W9 | Te doen |
| 4.12 | Weer dat je kunt vertrouwen: bron en tijd bij elk getal, zekerheid in woorden, verversen op de dag zelf, na 10 dagen alleen "usually", en de nauwkeurigheid gemeten tegen de waarnemingen ([seizoensplan](2.10-seizoen-rating-prijs.md), punt 5) | Regen ja of nee voor morgen minstens 80% juist, en dat cijfer staat op de cijferpagina | W9 tot W10 | Te doen |
| 4.13 | Goedkopere alternatieven (dupes) waar een bestemming wordt voorgesteld: de bestemmingspagina, Explore en elke stop in de tripplanner; alleen bij een pijnpunt (duur, druk, piek, dicht, lastig), alleen met een eigen prijs, met één uitgerekende zin ([kosten en logistiek](2.14-kosten-en-logistiek.md), punt 1) | Florence in augustus toont een alternatief met reden en besparing; een plaats zonder pijnpunt toont niets; gouden set van 40 paren 70% in de top drie | W7 | Te doen |
| 4.14 | "Sleep nearby and save": bij dure steden een buur binnen 45 minuten, met de besparing na de trein en de laatste trein terug ([kosten en logistiek](2.14-kosten-en-logistiek.md), punt 3) | Amsterdam toont Naarden met de nettobesparing over jouw nachten; Florence toont niets zolang de buren geen eigen prijs hebben | W8 | Te doen |
| 4.15 | Elke rit met tijd en kosten: echte route, brandstof per land (Oil Bulletin, wekelijks), tol per tolkilometer, vignetten, parkeren; trein en bus met bandbreedte en "verbinding bestaat"; de tol van je eigen auto vanaf je eigen huis, niet Brussel ([kosten en logistiek](2.14-kosten-en-logistiek.md), punt 6) | 50 ritten in twaalf landen: rijtijd binnen 10%, tol en brandstof binnen 15%, de echte treinprijs in 80% binnen de bandbreedte | W8 tot W9 | Te doen |
| 4.16 | Dagplanner: een lege dag toont zes voorstellen en "start from a ready-made day"; één tempovraag in de wizard die elke dag meekrijgt; een baby zet stapvrij aan, kinderen zetten kindvriendelijk eerst; stappen zichtbaar tegen je budget ([kosten en logistiek](2.14-kosten-en-logistiek.md), punt 5) | Geen lege dag zonder voorstellen; een gezin met een baby krijgt een dag zonder trappen | W8 tot W9 | Te doen |
| 4.17 | Lifestyle-paneel als bon: per regel hoeveelheid, prijs en bedrag; één woordenlijst (de zes profielen) in wizard, dagplanner en reispagina's | Dezelfde Lifestyle geeft op kaart, bon, planner en reispagina hetzelfde bedrag | W9 | Te doen |
| 4.18 | Eén werkruimte live volgens 1.17: van Explore naar een trip naar een dag zonder tabwissel, de dag opent met de steden en datums van de trip, een vaste kostenbalk die naar de bon opent ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punt 7) | Een trip van drie steden en één uitgewerkte dag maken zonder van plek te wisselen; de kostenbalk en de bon tonen hetzelfde bedrag | W10 | Te doen |
| 4.19 | De dag in ochtend, middag en avond boven de klok, met de maaltijden eraan; tickets tellen mee in het dagtotaal waar de prijs bekend is (OSM `fee` en `charge`), anders "ticket, price not known" zonder bedrag ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punt 7) | Een museum met een bekende prijs verhoogt het dagtotaal; geen verzonnen ticketprijs | W9 | Te doen |
| 4.20 | Telefoon: kaart met een schuiflade in drie standen op Explore en in Plan, met het bedrag altijd in de strook; 48 px voor de hoofdacties ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punten 7 en 8; besluit T472-f) | Op een Pixel 5 met één hand een plaats vinden, toevoegen en de bon openen zonder de kaart te verliezen | W11 | Te doen |
| 4.21 | Lange trips snel: vensterlijsten in Explore, Plan en My trips, dagen standaard ingeklapt ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punt 9) | Een trip van 21 dagen: elke tik onder 100 ms (INP) op een middenklasse telefoon | W11 | Te doen |
| 4.22 | Zoeken op totaalbudget live, zonder AI: de zoekbalk uit 1.19 rekent voor elke bestemming in de browser het totaal met `priceTrip` (laag, midden, hoog), toont Past en Krap gerangschikt op maandscore, de vier feiten van die maand naast de prijs, en neemt alles mee naar de bon en de tripplanner; de begeleide zoekfunctie herkent bedragen, dagen, personen, maanden en vervoer in zes talen, ook voor gasten ([budgetplan](2.22-budget-vervoer-dag-delen.md), punt 1) | "2 personen, €1.500, 5 dagen in oktober, met de trein" geeft een lijst waarvan elk bedrag gelijk is aan de bon; de 25 gouden vragen kloppen | W7 tot W8 | Te doen |
| 4.23 | Reisstukken in de tripplanner: per stuk reistijd, overstappen, ritten per dag, prijs als bandbreedte met bron, en één knop naar de echte prijs; een routecheck (heen en weer, een reisdag boven 4 uur, geen goede verbinding) die voorstelt maar nooit zelf wijzigt; één adapterlaag waar partners later in passen ([budgetplan](2.22-budget-vervoer-dag-delen.md), punt 3) | Verona, Ferrara, Padua toont de betere volgorde en waarom; elk stuk zegt "geschat" of "dienstregeling" | W8 | Te doen |
| 4.24 | Dagplanner, nieuwe flow: verblijf eerst (één pin gedeeld met de tripplanner, buurten met prijs en looptijd naar de beste plekken), de opties van de dag naast elkaar, per stop open of dicht en de ticketprijs, een kostbalk die vóór elke keuze het effect op het triptotaal toont, tempo als vergelijking ([budgetplan](2.22-budget-vervoer-dag-delen.md), punt 4) | Een maandag in Verona toont welke stops die dag dicht zijn (nagekeken op de officiële sites), de dagtrip naar Padua met reistijd en kosten naast blijven, en de trip zegt hoeveel er over is | W8 tot W9 | Te doen |

Open vragen om zelf te onderzoeken:

- Welke tab is de start voor wie al weet waar hij heen wil, en welke voor wie nog zoekt?
- Wat haalt een gebruiker uit een trip mee: PDF, GPX, agenda?

## Fase 5. Zoeken, uitrol en launch

*22 maart tot 9 mei*

Het recept uit Italië gaat naar meer landen, gebruikers kunnen zoeken in gewone taal, en Carta gaat live.

| # | Wat | Klaar als | Week | Status |
| --- | --- | --- | --- | --- |
| 5.1 | Zoeken in gewone taal voor gebruikers, eerst op Italië; voor budgetvragen vertaalt Gemini de zin alleen naar de filters van 4.22 (als chips die je kunt aanpassen) en rekent nooit zelf ([budgetplan](2.22-budget-vervoer-dag-delen.md), punt 1) | Het zoekvak op de voorpagina beantwoordt de twintig testvragen; 100 budgetzinnen in zes talen geven het juiste filter | W12 tot W13 | Te doen |
| 5.2 | Het recept uitrollen naar de volgende landen (voorstel: Oostenrijk, Zwitserland, Frankrijk) | Elk land op doel volgens het coverage-rapport | W12 tot W17 | Te doen |
| 5.3 | Launchdag vastleggen, minstens 42 dagen vooraf (blok 12) | Datum gekozen, uiterlijk 23 maart | W12 | Te doen |
| 5.4 | Eén pagina per item en een sitemap (blok 11) | De pagina's verschijnen in Google | W12 tot W13 | Te doen |
| 5.5 | Nederlands, Frans en Duits nagelezen | Een moedertaallezer keurde elke taal goed | W14 | Te doen |
| 5.6 | Betalingen live (blok 10), met wat de pass geeft na besluit T472-d | Testaankopen geslaagd, live keys aan | W14 | Te doen |
| 5.7 | Launch | Live op dinsdag 4 mei 2027 | W18 | Te doen |
| 5.8 | Later: de kosten van deur tot trail | Na de launch opnieuw bekijken | na W18 | Geparkeerd |
| 5.9 | Later: opslaan uit sociale media (TikTok via oEmbed, geplakte tekst, Google Takeout-lijsten) en de Carta-bon met de goedkopere versie ([kosten en logistiek](2.14-kosten-en-logistiek.md), punt 8a) | Na de launch opnieuw bekijken; heeft 4.13 en 4.17 nodig | na W18 | Geparkeerd |
| 5.10 | Later: gepland tegenover echt, een portemonnee onderweg met ECB-koersen, en met toestemming terug naar de catalogus vanaf 10 reizigers per plaats en maand ([kosten en logistiek](2.14-kosten-en-logistiek.md), punt 8c) | Na de launch opnieuw bekijken; heeft een privacyregel nodig | na W18 | Geparkeerd |
| 5.11 | Offline: de actieve trip, haar dagen en haar bon blijven op het toestel zodra je ze opent, met "Offline, last updated 14:02" ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punt 9) | Met vliegtuigmodus aan opent een bewaarde trip met elke dag en de bon | W13 | Te doen |
| 5.12 | Delen en samen plannen zonder account: een bewerklink naast de leeslink (alleen een naam, Undo per wijziging, intrekbaar), de kostenverdeler gaat mee in de link ([navigatie en pass](1.15-navigatie-pass-prijsweergave.md), punt 10; besluit T472-d) | Een reisgenoot zonder account past via de link een stop aan en ziet wie wat betaalt; de eigenaar ziet de wijziging en kan de link intrekken | W13 tot W14 | Te doen |
| 5.13 | Samen kiezen: een vergelijkkaart van twee tot vier opties (totaal voor de groep, erheen, de maand, weer en licht, drukte, waarom deze prijs) en een stemlink met een eigen voorbeeld in WhatsApp; maken en stemmen zonder account (T475-b), de winnaar opent als trip; getallen bewaard met datum ([budgetplan](2.22-budget-vervoer-dag-delen.md), punt 5) | Een stemlink in WhatsApp toont de kaart, drie mensen stemmen zonder account, "Plan de winnaar" opent de trip met hetzelfde totaal | W13 tot W14 | Te doen |
| 5.14 | Reistijden uitrollen naar de landen van 5.2, met het recept van 3.11 | Elk nieuw land: 30 steekproefritten binnen de grenzen van 3.11 | W12 tot W17 | Te doen |
| 5.15 | Live ritprijzen via partners (Omio, Trainline, Flix) in de adapter van 4.23 | Na de launch, als er verkeer is om mee aan te kloppen | na W18 | Geparkeerd |

## Achtergrond: handstappen uit je takenlijst

Deze blokken uit `1-manual-steps.md` lopen naast de fases. Ze staan hier alleen om te zien wanneer ze een fase vrijgeven; de stappen zelf staan in dat bestand.

| Blok | Wat | Wanneer | Nodig voor | Status |
| --- | --- | --- | --- | --- |
| 1 | Push naar GitHub en CI nakijken | W42 | alles wat volgt | Te doen |
| 2 | Gemini afronden, wave 17 starten; weekmeting vanaf 14 oktober | W42 tot W43 | fase 3 (zoekproef) | Te doen |
| 3 | V6 nakijken en live zetten | W42 tot W43 | fase 1 (item 1.1) | Klaar (13 okt) |
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
| W43 | 19 okt | 1.2, 1.3, 1.3a, 1.10 (weerbericht) |
| W44 | 26 okt | 1.3a, 1.3b, 1.3c, 1.4, 1.14 (kaartknop), 1.15 (navigatie), 1.16 (prijszin, meteen live); blok 4 en 5 (dump vóór 6 november) |
| W45 | 2 nov | 1.5, 1.3d, 1.3e, 1.13 (positionering, na jouw zin T471-b), 1.17 (werkruimte), 1.19 (budgetzoeken); blok 10 starten (eenmanszaak, boekhouder); affiliate Flix en Trainline aanvragen (T475-a) |
| W46 | 9 nov | 1.6, 1.7, 1.8, 1.11, 1.12, 1.18 (prijsweergave), 1.20 (dagflow, reisstukken, stemkaart); fase 1 afronden |
| W47 | 16 nov | 1.9, 2.1, 2.2, 2.10, 2.18 (navigatie en pass live); datalane F1 |
| W48 | 23 nov | 2.3, 2.4, 2.10, 2.11, 2.14 (Numbeo-besluit T471-a vooraf), 2.19 (opslaan zonder account), 2.22; LiteAPI-sleutel en Hostelworld-aanvraag klaar (T470-a); jij kijkt de 30 rating-verschillen na |
| W49 | 30 nov | 2.4, 2.5, 2.11, 2.12, 2.14, 2.15, 2.21 (prijsniveau), 2.22, 2.23; blok 7 starten (box) |
| W50 | 7 dec | 2.6, 2.7 (datalane F2, F3, F7), 2.12, 2.13, 2.14, 2.15, 2.17, 2.20 (instellingen), 2.23; jij doet de steekproef van tien bestemmingsmaanden |
| W51 | 14 dec | 2.8, 2.9, 2.13, 2.16 (graaf op de box), 2.24; fase 2 afronden; box klaar |
| W52 | 21 dec | buffer (2.13 of 2.16 als die niet paste) |
| W53 | 28 dec | buffer |
| W1 | 4 jan 2027 | 3.1, 3.2 |
| W2 | 11 jan | 3.3 |
| W3 | 18 jan | 3.3, 3.4, 3.11 (MOTIS op de box, geheugen meten) |
| W4 | 25 jan | 3.4, 3.5, 3.11; blok 9 starten |
| W5 | 1 feb | 3.6, 3.7, 3.9, 3.10, 3.11 (steekproefritten) |
| W6 | 8 feb | 3.7, 3.8, 3.9, 3.10; fase 3 afronden |
| W7 | 15 feb | 4.1, 4.2, 4.9, 4.13, 4.22 |
| W8 | 22 feb | 4.3, 4.4, 4.10, 4.11, 4.14, 4.15, 4.16, 4.22, 4.23, 4.24 |
| W9 | 1 mrt | 4.5, 4.6, 4.11, 4.12, 4.15, 4.16, 4.17, 4.19 (dagdelen en tickets), 4.24 |
| W10 | 8 mrt | 4.7, 4.8, 4.12, 4.18 (één werkruimte) |
| W11 | 15 mrt | 4.20 (schuiflade), 4.21 (lange trips), 4.8; fase 4 afronden |
| W12 | 22 mrt | 5.1, 5.3 (launchdag uiterlijk 23 maart), 5.4; 5.2 en 5.14 starten |
| W13 | 29 mrt | 5.1, 5.4, 5.11 (offline), 5.12 (delen zonder account; besluit T472-d vooraf), 5.13 (jij plakt de migratie voor de stemmingen); 5.2 |
| W14 | 5 apr | 5.5, 5.6 (na 5.12), 5.12, 5.13 (voorbeelden nakijken in WhatsApp, iMessage, Telegram en Slack) |
| W15 | 12 apr | 5.2; soft-launch-lijst klaar (uiterlijk 13 april) |
| W16 | 19 apr | gates legal, payments, perf en uptime gehaald; regels van communities nalezen |
| W17 | 26 apr | outreach versturen; go of no-go |
| W18 | 3 mei | 5.7 launch op dinsdag 4 mei |
