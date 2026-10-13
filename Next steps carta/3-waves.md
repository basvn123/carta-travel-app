# Waves: alles wat er gebeurd is

Elke uitgevoerde taak van Carta in twee zinnen: waar het over ging, wat er gedaan is en waarom. Van de eerste taak op 22 september tot de laatste op 13 oktober 2026, in de volgorde waarin het gebeurde. 320 taken. Het volledige rapport van elke taak staat in `Execution/P*/T<nummer>-*.md`.

## Inhoud

1. Het fundament: back-up, juridisch, hosting en opruimen (22 september tot 24 september, 26 taken)
2. Betalingen, AI-kosten, opslag, server en beelden (24 september tot 28 september, 26 taken)
3. Beheer, moderatie en meten (28 september tot 29 september, 23 taken)
4. Sessies A en B: opruimen en klaarzetten (1 oktober, 13 taken)
5. Wave 1 (1 oktober tot 2 oktober, 11 taken)
6. Wave 2 (2 oktober, 10 taken)
7. Wave 3 (2 oktober, 12 taken)
8. Wave 4 (2 oktober, 10 taken)
9. Wave 5 (2 oktober, 10 taken)
10. Live naar Cloudflare en alles op een rij (2 oktober tot 3 oktober, 15 taken)
11. Wave 6 (2 oktober, 11 taken)
12. Wave 7 (2 oktober tot 3 oktober, 10 taken)
13. Wave 8 (3 oktober, 11 taken)
14. Wave 9 (3 oktober, 9 taken)
15. Wave 10 (3 oktober, 8 taken)
16. Wave 11 (3 oktober, 7 taken)
17. Wave 12 (3 oktober, 9 taken)
18. Wave 13 (3 oktober, 5 taken)
19. Wave 14 (3 oktober, 5 taken)
20. Wave 15 (3 oktober tot 6 oktober, 7 taken)
21. Wave 16 (6 oktober, 7 taken)
22. Jouw beslissingen verwerkt (3 oktober tot 7 oktober, 4 taken)
23. Wave 16b (7 oktober, 13 taken)
24. Wave 16c (7 oktober, 12 taken)
25. Wave V1 (7 oktober tot 8 oktober, 10 taken)
26. Wave V2 (8 oktober, 1 taak)
27. Wave V3 (8 oktober, 10 taken)
28. Wave V4 (8 oktober, 10 taken)
29. Wave V5 (8 oktober tot 9 oktober, 10 taken)
30. Wave V6 (13 oktober, 1 taak)
31. Live zetten en de laatste controles (7 oktober tot 9 oktober, 4 taken)

## 1. Het fundament: back-up, juridisch, hosting en opruimen

*22 september tot 24 september*

- **T001 Mappenstructuur en rapportsjabloon.** Er is een mappenstructuur voor alle fases gemaakt, met één vast sjabloon voor elk taakrapport. Zo blijven de ruim honderd rapporten die volgen vergelijkbaar en makkelijk terug te vinden.
- **T002 Werkregels voor Claude Code vastgelegd.** Er is een werkregelbestand geschreven met afspraken over taaknummers, rapporten, ontwerpkeuzes, één branch per taak en terugdraaien. Zo werkt elke volgende sessie op dezelfde manier en blijft alles te herleiden.
- **T003 Productiestand getagd als vast terugvalpunt.** De live versie van dat moment is getagd als terugvalpunt en de naamgeving van branches is vastgelegd. Als een latere wijziging misgaat, kun je altijd terug naar deze bekende goede stand.
- **T004 Versleutelde back-up van Supabase.** Er zijn scripts en uitleg gemaakt om de live Supabase-database versleuteld te back-uppen en weer terug te zetten, en dat is getest. Eerder bestond er helemaal geen back-up van gebruikersdata, terwijl handmatige databasewijzigingen geen undo hebben.
- **T005 Hoofdbestanden met data veiliggesteld.** Vijf grote hoofddatabestanden (samen 419 MB) zijn met controlegetallen gekopieerd naar een plek buiten de ontwikkelcomputer. Zo gaat weken pipelinewerk niet verloren als er later opgeruimd wordt.
- **T006 Controle of alles op ARM-servers draait.** Er is nagekeken of alle containers en programma's van de pipeline op goedkope ARM-servers werken. Bijna alles kan, op één database-image na, waarvoor een eenvoudige oplossing bestaat; het ARM-plan houdt dus stand.
- **T007 Aantal foto's in het archief geteld.** Er is nauwkeurig geteld hoeveel foto's Carta heeft: ongeveer 180.000 originelen, ruim vier keer meer dan gedacht. Daardoor kloppen de plannen en kosten voor de verhuizing van afbeeldingen naar de cloud nu met de werkelijkheid.
- **T008 Echte afbeeldingsgroottes gemeten.** Er zijn 199 echte foto's omgezet naar moderne formaten om te meten hoe groot ze worden. De uitkomst is gunstiger dan aangenomen, dus de opslag- en dataverkeerramingen in het architectuurplan waren te hoog.
- **T009 Bestanden geteld tegen Pages-limiet.** Er is geteld dat de app 52.089 bestanden heeft, ruim 2,6 keer boven de grens van 20.000 van Cloudflare Pages. Daarmee is duidelijk dat data naar aparte opslag moet verhuizen voordat de site kan verhuizen.
- **T010 Licentiecontrole op opgeslagen bronnen.** Alle 31 externe databronnen zijn nagelopen op de vraag of Carta hun data mag opslaan. Er is geen nieuwe overtreding gevonden, alleen Open-Meteo blijft een aandachtspunt zodra Carta geld gaat verdienen.
- **T011 Snelheids- en kostenmeting vooraf.** De laadtijd en grootte van drie pagina's zijn gemeten op desktop en telefoon, als nulmeting. Opvallend: het grootste element is overal een foto van Wikimedia, dus afbeeldingen zijn de echte snelheidswinst.
- **T012 Impressumpagina gebouwd, nog zonder echte gegevens.** Er is een Impressum-pagina toegevoegd in het accountpaneel, in zes talen. De bedrijfsgegevens zijn nog plaatshouders en de pagina staat dus nog niet live; zonder echte gegevens mag hij niet openbaar.
- **T013 Algemene voorwaarden geschreven en gekoppeld.** Carta heeft nu algemene voorwaarden, bereikbaar vanuit het account, het passenvenster en een link, en de betaalstap is klaar om de afstandsverklaring te vragen. Daarvoor bestond er geen contracttekst terwijl je al passen kon kopen.
- **T017 Rechtsgrond en bewaartermijnen in privacybeleid.** Het privacybeleid heeft nu een tabel met de juridische grondslag per soort gegevens en een stuk over hoe lang analysegegevens bewaard blijven. Dit vult twee gaten die in de juridische checklist stonden.
- **T018 Verwerkersovereenkomsten van leveranciers gecontroleerd.** De verwerkersovereenkomsten van vier leveranciers zijn nagelezen, ook die van Gemini. Cloudflare stond in de opdracht maar werd toen nog niet gebruikt (Vercel wel), en bij twee leveranciers is een besluit nodig.
- **T019 Kaartbronvermelding gecontroleerd.** Er is gecontroleerd dat de bronvermelding van CARTO en OpenStreetMap op alle negen kaarten zichtbaar is, op desktop en telefoon. Er was geen codewijziging nodig; de wettelijke eis blijkt al te kloppen.
- **T020 Gegevensdownload voor gebruikers (GDPR).** Een ingelogde gebruiker kan nu in het accountpaneel al zijn gegevens als JSON-bestand downloaden, na een wachtwoordcontrole. Dit hoort bij het recht op gegevensoverdracht en staat naast de optie om het account te wissen.
- **T021 Open licentierijen in het overzicht afgesloten.** De Belgische vervoerders hebben nu een volledige bronvermelding in het licentieoverzicht en in de app. Vier andere commerciële risicopunten zijn beoordeeld; één is afgesloten en drie blijven open met een duidelijke vervolgstap.
- **T022 Merkonderzoek en verwerkingsregister.** Er is onderzocht of de naam Carta als EU-merk te beschermen is, met als advies van niet te registreren omdat het woord te beschrijvend is. Daarnaast is een verwerkingsregister van één pagina opgesteld dat de wet vraagt.
- **T023 Schijfruimte op de laptop vrijgemaakt.** De schijf zat vol (0,8 GB vrij), dus bouwmappen en vier oude hoofdbestanden zijn verwijderd nadat ze eerst veilig op een USB-schijf waren gezet en gecontroleerd. Daardoor kan er weer gewerkt en gecommit worden.
- **T024 Voorbereiding verhuizing naar Cloudflare Pages.** De site draait nog op Vercel; de verhuizing is vastgelegd en gecontroleerd, maar niet uitgevoerd. Cloudflare weigert meer dan 20.000 bestanden en de app heeft er ruim 52.000, dus eerst moet de data naar aparte opslag.
- **T025 Bouwbestanden uit git halen: geblokkeerd.** Het uit git halen van gegenereerde bestanden is niet uitgevoerd, omdat Vercel er nog op leunt voor zijn bouw. Het rapport bewaart het bewijs, de exacte commando's voor later en een productiefout die onderweg opviel.
- **T026 Git-geschiedenis opruimen: uitgesteld.** De opschoning van de git-geschiedenis is niet gedaan, want er was geen goedkeuring en geen geverifieerde back-up. Wel is gemeten dat de winst kleiner is dan gedacht en is er een stappenplan geschreven.
- **T027 Ongebruikte onderdelen uit de app verwijderd.** Zes ongebruikte schermonderdelen (821 regels) zijn verwijderd, terwijl de werkende link-instelling voor bereikbaarheid is behouden. Dat maakt de code kleiner en overzichtelijker zonder dat de app verandert.
- **T028 Pipeline-scripts ingedeeld in niveaus.** Elk Python-script in de pipeline kreeg bovenaan een label of het gepland, handmatig, bibliotheek of eenmalig is, en twee verouderde scripts zijn gearchiveerd. Zo is duidelijk wat nog gebruikt wordt, wat bij de verhuizing naar de server helpt.
- **T029 Pipeline-uitleg geschreven en controles uitgebreid.** Er is een document dat precies uitlegt hoe de pipeline-planner werkt, met een regel per taak. Daarnaast voert de automatische controle (npm run ci) nu meer controles uit dan voorheen.

## 2. Betalingen, AI-kosten, opslag, server en beelden

*24 september tot 28 september*

- **T030 Stripe-prijzen nagekeken.** De prijzen in de database kloppen met wat de migratie zegt: 6,99 euro voor een Trip Pass en 14,99 voor een Year Pass. De Stripe-kant zelf kon niet bekeken worden, omdat er geen sleutel is, dus dat blijft aan de eigenaar.
- **T031 Aankooptest voor Stripe, deels uitgevoerd.** Zonder Stripe-sleutel kon er geen echte testaankoop komen, maar met een lokale database en nagemaakte Stripe-berichten zijn elf van twaalf controles echt gedraaid. De bescherming tegen dubbel verwerken werkte; alleen het Stripe-betaalscherm bleef geblokkeerd.
- **T032 Afstandsverklaring in de betaalstap geregeld.** De kopersverklaring over het vervallen van het herroepingsrecht wordt nu opgeslagen samen met de verkoop, en boven de koopknoppen staat een uitleg. Dit is voorbereid in code, maar nog niet live omdat een geheim en een databasestap ontbreken.
- **T033 BTW-drempel voor EU-verkoop bewaken.** Bij elke verkoop wordt nu land, bedrag en munt vastgelegd, en een beheerfunctie rekent het jaartotaal uit tegen de grens van 10.000 euro. Zo zie je op tijd wanneer registratie voor BTW in andere EU-landen nodig wordt; de databasewijziging is nog niet toegepast.
- **T034 Meten van de betaalmuur-trechter.** De betaalmuurstatistiek maakt nu onderscheid tussen een geblokkeerde knop en een vrijblijvend aanbod. Zo kun je zien welke soort moment echt tot een aankoop leidt; de databasewijziging staat klaar maar is niet toegepast.
- **T035 Gemini-facturatie aantoonbaar maken.** In de koppen van de relevante bestanden staat nu hoe je zelf controleert dat het Gemini-project betalende facturatie heeft. Dat is nodig omdat de gratis variant volgens de voorwaarden andere regels voor data heeft.
- **T036 Test voor het dagelijkse AI-plafond.** Het testscript voor het globale AI-dagplafond was eigenlijk alleen tekst die altijd slaagde. Het is vervangen door een echte test met 49 controles die faalt als het plafond niet werkt.
- **T037 AI-quotatests geschreven.** Een tweede testscript met 112 controles bekijkt nu het verbruiken, terugboeken en het aparte tellen van plannen en live zoekacties. De verwachte fouten bleken er niet te zijn; de code klopte al, nu is dat bewezen.
- **T038 Terugval naar zwakker AI-model vastgelegd.** De dagplanner schrijft nu op welk Gemini-model elk antwoord gaf en of het een terugval was, en het beheerpaneel toont dat per dag. Zo zie je wanneer het product stilletjes slechter wordt omdat het hoofdmodel op is; de databasewijziging is nog niet toegepast.
- **T039 AI-cache slimmer gemaakt en gemeten.** De cachesleutel splitst niet meer op verschillen die er voor de planner niet toe doen, zoals groepsgrootte 6 of 9 of hoofdletters in een zoekwoord. Ook wordt het aantal cachetreffers nu bijgehouden en getoond in het beheerpaneel.
- **T040 AI-prompt ingekort tot 30 plekken.** De dagplanner stuurt Gemini nu maximaal 30 kandidaten, gerangschikt op score en afstand, en laat beschrijvingen weg van plekken die er niet zeker in zitten. Dat bespaart tokens en dus geld zonder het eindresultaat te verkleinen.
- **T041 Ontwerp voor gedeelde feiten over plekken.** Dit was alleen een ontwerp, geen code: gedeelde feiten over een plek (zoals prijzen) worden straks in een eigen tabel bewaard in plaats van per gebruiker opnieuw opgezocht. Dat bespaart later veel live AI-zoekopdrachten.
- **T042 AI-verbruik zichtbaar in beheerpaneel.** Het beheerpaneel toont nu een overzicht van AI-verbruik: limieten, cachetreffers, terugvallen en zware gebruikers. Daarvoor zag je alleen één kaal getal; de databasewijziging is nog niet toegepast.
- **T043 Marge-dashboard voor de eigenaar.** Er is een beheerfunctie die uit echte verkopen en kosten de marge berekent, zodat de aanname van 6,85 euro per aankoop uit het financiële model getoetst kan worden. Eerder kon niemand dat getal ooit tegen een echte verkoop leggen; de databasewijziging is nog niet toegepast.
- **T044 Cloudflare R2-bucket, procedure klaargezet.** Er zijn scripts geschreven om de R2-opslag en twee domeinen aan te maken, getest als proefrun. Er is nog niets aangemaakt, want er zijn hier geen Cloudflare-gegevens beschikbaar.
- **T045 Archief naar R2, nog niet verhuisd.** De hele archiefprocedure is uitgeschreven en deels beproefd, maar er is niets geüpload en niets lokaal gewist. De opslag bestaat nog niet, dus het aantal objecten in R2 blijft nul.
- **T046 Code voor altijd-aan Hetzner-server.** De code om een kleine Hetzner-server aan te maken is geschreven en zo ver mogelijk gecontroleerd, maar er bestaat nog geen server. De weekplanning daarop is voorlopig een leeg stukje tot de overzetting.
- **T047 Tijdelijke grote server op aanvraag.** De stroom om een grote Hetzner-server aan te maken, een zware klus te draaien en weer te verwijderen is als code klaar en met nepprogramma's getest. Er is nog nooit een echte server gestart, omdat toegang en sleutels ontbreken.
- **T048 Wekelijkse pipeline naar server-cron.** De weekplanning van de laptop is omgezet naar een server-timer, met een testprogramma per taak en een vergelijker voor de uitkomsten. De server bestaat nog niet, dus de laptop blijft de echte planner.
- **T049 Afbeeldingsladder met AVIF en WebP.** Er is een stap gebouwd die van elke foto meerdere kleine versies in moderne formaten maakt, getest op 81 echte strandfoto's. Niets is live omdat R2 en de servers nog niet bestaan.
- **T050 Verwijderverzoeken raken ook R2.** De verwijderfunctie voor foto's haalt nu ook de opgeslagen kopieën in R2 weg en ververst de cache bij Cloudflare. Zo blijft een weggehaalde foto niet een jaar lang op de snelle laag staan.
- **T051 Bronvermelding blijft bij de foto.** Er is bewezen dat elke foto in de nieuwe opslag een volledige bronvermelding heeft, en een gat in de controle is gedicht. De app kan nu ook een foto vanaf de eigen snelle server correct vermelden.
- **T052 Foto's via picture en srcset, achter vlag.** Strand-, meer- en bergpagina's kunnen nu kleinere moderne foto's laden, maar de vlag staat overal uit, dus productie is ongewijzigd. In een lokale meting werd de hoofdfoto op een telefoon ruim twee seconden sneller geladen.
- **T053 Beveiligingsregels voor afbeeldingen aangepast.** De beveiligingsregels laten nu ook het eigen snelle afbeeldingsadres toe, zowel bij Vercel als bij Cloudflare Pages, en een testscript controleert vijf pagina's. De oude Wikimedia-adressen blijven staan tot alle directe verwijzingen vervangen zijn.
- **T054 Datadelen verplaatst naar R2-opzet.** De app kan nu op twee manieren gebouwd worden, en met één instelling blijft er maar 61 bestanden over voor de sitehost in plaats van 52.000. Er is nog niets geüpload en productie bouwt nog op de oude manier.
- **T055 Nameting na de verhuisvoorbereiding.** De metingen uit T011 zijn herhaald, ook voor de gesplitste bouw op een lokale nabootsing. De splitsing werkt zoals beloofd, maar dit is nog geen uitkomst voor productie, want daar bestaat het nieuwe account nog niet.

## 3. Beheer, moderatie en meten

*28 september tot 29 september*

- **T056 Bewijs dat er geen live tarieven worden gelezen.** De app vroeg al nooit live een prijs op bij een reisbron, en dat is nu bewezen met een controlescript. Het script faalt zodra er een prijsverzoek of een onbekende netwerkaanroep bij komt.
- **T057 Overbodige tarief-gegevens weggehaald.** Oude prijsgegevens per dag en een paar ongebruikte velden zijn uit de data en de code gehaald, wat 1,96 MB (8 procent) scheelt. Hierdoor laadt de app lichter en gebruikt hij minder geheugen, zonder dat een reiziger iets merkt.
- **T058 Vastgelegd hoe vluchtprijzen binnenkomen.** Er is geen code veranderd: het rapport schrijft op hoe een vliegprijs bij de routeplanner en de prijskaart terechtkomt en wijst twee plekken aan waar de code afwijkt. Zo weet de volgende taak precies wat er moet worden rechtgezet.
- **T059 Bestemmingsdata in regioblokken verdeeld.** De bestemmingsdata is niet meer per land opgeknipt maar in 238 regioblokken van maximaal 253 KB, die pas laden als je ze nodig hebt, met ook een modus die meebeweegt met de kaart. Zo blijft de app snel als er veel meer bestemmingen komen.
- **T060 Laadgewicht van plekken en kaartlagen gecontroleerd.** De audit liet zien dat vrijwel alles al klein genoeg was; alleen de reistijdlaag laadde bij elke start, ook als je Explore nooit opende, en dat is nu gerepareerd. Zo laadt de app bij de start minder onnodige data.
- **T061 Eerste weergave op mobiel gemeten.** Er is niets in het product veranderd; er zijn twee cijfers gemeten: hoe snel een telefoon de eerste pagina ziet en hoeveel kaarttegels een Explore-sessie ophaalt. Die cijfers zijn nodig om te beslissen of we de gratis kaartdienst van Carto kunnen blijven gebruiken.
- **T062 Admin-pagina in modules gesplitst.** De admin-pagina van ruim 2000 regels is opgeknipt in 24 losse bestanden, zodat het hoofdbestand nog maar 151 regels telt. Voor gebruikers verandert niets, maar het beheerscherm is nu veel makkelijker te onderhouden en uit te breiden.
- **T062 Achtergebleven werk vastgelegd, queue-runner begrensd.** Drie vragen over eerdere commits zijn onderzocht: twee bleken geen probleem, de derde was echt en is opgelost, namelijk dat werk van veel eerdere taken onder een verkeerde commit zat. Zo kun je een taak weer terugdraaien zonder per ongeluk andere taken mee te draaien.
- **T063 Tweede inlogstap voor gevaarlijke admin-acties.** Het verwijderen en verbannen van een account kan nu alleen met een sessie waarin ook de tweede beveiligingsstap is gedaan. De wijziging staat klaar maar is nog niet op het echte Supabase-project toegepast, en zorgt dat een gestolen sessie niet genoeg is voor onomkeerbare acties.
- **T064 Auditlog bewaart de oude waarde.** Wijzigingen aan sitemeldingen, instellingen en inhoudscorrecties worden nu in het auditlog bewaard met zowel de oude als de nieuwe waarde. Daardoor kun je een foute wijziging terugzetten zonder een backup, al staat dit nog niet op het echte project.
- **T065 Zwaardere beveiliging op drie admin-functies.** Drie admin-functies die direct zichtbaar zijn voor iedereen (meldingen, onderhoudsmodus, correcties en de feedbackbox) vragen nu de strengste toegangscontrole. De migratie is getest op een proefdatabase maar nog niet live, en voorkomt dat te lichte rechten grote gevolgen hebben.
- **T066 Siteconfiguratie niet meer voor iedereen leesbaar.** Alleen instellingen die uitdrukkelijk als openbaar zijn gemarkeerd kunnen nog door bezoekers worden gelezen; de rest is standaard privé. In de test zag een anonieme gebruiker voorheen 4 van 4 rijen en nu 3 van 4, maar het staat nog niet live.
- **T067 Overzicht van openbare gidsen voor admin.** De admin-pagina heeft een nieuw tabblad Guides met alle openbaar gemaakte reisplannen, nieuwste eerst, met auteur en weergaven. Het is voorbereid en getest maar nog niet live, en geeft de beheerder voor het eerst zicht op wat er gepubliceerd is.
- **T068 Meldknop voor illegale gidsen.** Iedereen kan nu een openbare gids als illegaal melden, ook zonder account, en de melding komt in een nieuw Reports-tabblad voor admins terecht, met een limiet van 5 meldingen per uur. Dit is nodig om aan de Europese regels voor onlineplatforms te voldoen; het staat nog niet live.
- **T069 Gids offline halen zonder te verwijderen.** Een admin kan een openbare gids met een schriftelijke reden uit de galerij halen, waarbij hij privé in het account van de eigenaar blijft staan en het auditlog het vastlegt. Zo kan moderatie ingrijpen zonder gebruikersdata te vernietigen; de migratie is nog niet toegepast.
- **T070 Uitleg bij verwijdering en bezwaarroute.** Als een gids wordt verwijderd, krijgt de eigenaar in de app te horen waarom en kan hij bezwaar maken, waarna een moderator het bezwaar beantwoordt. Dat hoort bij de Europese regels voor platforms en is voorbereid maar nog niet live.
- **T071 AI-fouten worden voortaan vastgelegd.** Als een AI-functie mislukt, wordt dat nu naar een eigen databasetabel geschreven in plaats van alleen als melding aan de gebruiker getoond. Zo kun je zien wat er vaak misgaat; de migratie is getest maar nog niet op het echte project toegepast.
- **T072 Gezondheid van de datapijplijn zichtbaar in admin.** Na elke run schrijft de datapijplijn nu een rij weg met het resultaat, en de admin kan de laatste runs bekijken. Daarvoor wist buiten de terminal niemand of de pijplijn een slechte week had; het staat klaar maar is nog niet live.
- **T073 Wachtrij voor mislukte boekingsimports.** Als het importeren van een boeking mislukt, wordt nu opgeslagen waarom (kapotte data, ontbrekend veld, leeg resultaat) en wat voor invoer het was, 30 dagen lang. Zo kun je gericht verbeteren waar de import vastloopt.
- **T074 Controledatum en reden voor correcties.** Elke inhoudscorrectie moet nu een status, een reden en een datum hebben waarop iemand hem opnieuw bekijkt, en het admin-scherm toont wat te oud is. Zo blijven tijdelijke correcties niet eeuwig staan; de migratie is nog niet toegepast.
- **T075 Verweesde correcties opsporen.** Correcties die verwijzen naar items die de pijplijn inmiddels heeft laten vallen, worden nu herkend en apart in het admin-scherm getoond. Zo blijven er geen stille, nutteloze correcties rondslingeren.
- **T076 Voor en na van correcties tonen.** In de admin zie je nu per opgeslagen correctie naast elkaar hoe het item er oorspronkelijk uitziet en hoe het er na de correctie uitziet. Dat maakt het makkelijker om te zien wat een correctie in productie echt doet.
- **T077 Automatische test op admin-beveiliging.** Er is een test die alle 37 admin-functies in een proefdatabase afloopt en faalt als er ooit een functie zonder toegangscontrole bijkomt (123 controles, allemaal geslaagd). Zo kan een toekomstige migratie niet per ongeluk een beveiligingsgat maken.

## 4. Sessies A en B: opruimen en klaarzetten

*1 oktober*

- **T252 Git-opslag opgeschoond.** De map met de git-geschiedenis is van 3.215 naar 1.151 MB gegaan, een besparing van 2.064 MB, zonder dat een commit veranderde of er geforceerd is gepusht. Dat houdt de repository werkbaar en schijfruimte vrij.
- **T253 Databasecontrole gerepareerd.** Een controle op afbeeldings-URL's in een databasemigratie gebruikte een herhalingsgrens boven de 255 die niet werkt. Die is aangepast, zodat de migratie ook op een lokale stack kan draaien.
- **T254 Admin-inlog met tweede stap.** De beheerpagina kon geen sterk inlogniveau krijgen, terwijl verwijderen en blokkeren van gebruikers dat sinds een eerdere migratie eist. Er is nu een tweede-stapflow zodat beheerders die acties kunnen blijven uitvoeren.
- **T255 Alle vluchtbronnen stopgezet.** Wizz Air, Vueling, Volotea en Travelpayouts waren al stopgezet en op 1 oktober trok de eigenaar ook Ryanair in. Daarmee draait er geen vluchtprijsbron meer, wat de basis is voor het besluit dat Carta geen vluchten prijst.
- **T256 Vluchtprijzen als schattingen.** De vluchtprijzen in de app zijn bevroren, want er draait geen bron meer en de gegevens zijn bijna twee maanden oud. Ze worden nu getoond als schatting, wat eerlijker is dan een vaste prijs.
- **T257 R2-opzet naar de echte opslag.** Het script dat de Cloudflare R2-opslag inricht schreef eerst alleen lokaal, en schrijft nu naar de echte externe opslag. Dat was nodig zodat de eerste uploads echt in de bucket terechtkomen.
- **T258 Sessie A samengevoegd in main.** Alle taken van T001 tot T077 stonden op gestapelde losse branches, terwijl main achterliep. Ze zijn nu in main samengevoegd, zodat er één kloppende hoofdlijn is.
- **T259 Betaalbewijs voor Gemini.** Het Google Cloud-project achter de Gemini-sleutel heeft nu een betaald factureringsaccount met een maandbudget van 50 euro en waarschuwingen. Dat is de eis van Google voor gebruikers in de EER, Zwitserland en het VK; de sleutel zat in een ander project dan eerst gedacht.
- **T260 Beveiliging voor fietsscript.** Een fietsscript voerde al zijn code uit zodra iets het importeerde. Het is nu afgeschermd, zodat een test of linter niet per ongeluk datawerk start.
- **T261 Pijplijn klaar voor zelfstandig draaien.** Dit zijn de reparaties aan de pijplijn voor als die op een timer draait op de Hetzner-server, waar niemand de uitvoer leest. Het zorgt dat fouten niet stilletjes wegvallen.
- **T262 Server publiceert naar R2.** De drie ontbrekende stappen tussen de wekelijkse serverrun en de publicatie naar R2 en het archief zijn gedicht. Daardoor kan de server zijn resultaten zelf online zetten.
- **T263 Serverinrichting voorbereid.** De scripts om de Hetzner-server in te richten zijn klaargemaakt, als onderdeel van de stap naar zelfstandig draaiende pijplijn. Het is voorbereid werk en niet live.
- **T264 Anthropic-aanroep uit scripts gehaald.** Twee handmatige dossierscripts gebruikten nog een Anthropic-provider, wat tegen de projectregel is. Die is verwijderd, zodat er nergens meer een betaalde Claude API-route aanwezig is.

## 5. Wave 1

*1 oktober tot 2 oktober*

- **T078 Een bron voor licenties en dataregister.** Het licentieoverzicht wordt niet meer met de hand geschreven maar uit het register van databronnen gegenereerd, en een controle faalt als een bron zonder rij of met een afwijkende frequentie bijkomt. Zo kunnen licentiegegevens en wat er daadwerkelijk draait niet uit elkaar lopen.
- **T083 Tests op rijrechten en crashregistratie.** De tabelrechten die bepalen dat de ene reiziger de reizen van de ander niet ziet worden nu als geheel getest, en crashes in de app worden vastgelegd. Voorheen was alleen de beveiliging van admin-functies getest.
- **T084 Automatische controle op reisdata.** De validator voert nu zeven mechanische controles uit op alle reizen en draait automatisch bij elke wijziging. Hij keurt direct 606 fouten bij alle 253 reizen af, wat een duidelijke lijst met op te lossen werk oplevert.
- **T096 Nauwkeurigheid van kostenmodel gemeten.** Er is een herhaalbare test die de bed- en eetprijzen van de kostenmotor vergelijkt met data die hij nooit zag. Eten haalt de lat (88 procent binnen 6 euro per dag), maar de bewering over een middenklasseweek binnen 40 euro voor 80 procent kan nog niet worden gedaan.
- **T107 Betere titels voor wandelroutes.** Routetitels waren de ruwe naamtag: 1925 van 17.619 waren te lang en 621 waren codes als 'LK 08'. Een nieuwe vijfstappenladder kiest nu de beste titel, pas zichtbaar na de volgende pijplijnrun.
- **T108 Vijf zichtbare routefouten opgelost.** Vijf fouten in routedata (zoals richting en regio, getest met de Mount Korab-routes) zijn in code opgelost met regressietests; twee zijn pas zichtbaar na één extra regel buiten de taak. De data is niet aangepast, dus de wire verandert na de volgende run.
- **T111 Dekkingscontract per land en laag.** De dekkingscontrole geeft nu voor 45 landen en vijf lagen per cel het aantal, de ondergrens, een status en een reden bij elke fout. Zo weet je niet alleen dat een regio dun is, maar ook waarom.
- **T192 Tripplanner tekent kaart minder vaak.** De planner hertekende zijn kaart bij elke kleine wijziging; dat gebeurt nu alleen als een speld echt verschuift. Daardoor ging het aantal hertekeningen van 15 naar 0 en daalde de zware rekentijd van 11,8 naar 4,9 seconden.
- **T195 Product en ontwerpcontext vastgelegd.** In de hoofdmap staan nu PRODUCT.md en DESIGN.md die elke sessie eerst leest: voor wie Carta is, de toon en alle 47 ontwerpwaarden. Zo wordt ontwerp uit opgeschreven waarden gedaan in plaats van uit gokwerk.
- **T265 Betalingen en gebruikslimiet.** Een nieuwe migratie en twee Stripe-functies sluiten elf van dertien open punten, zoals dat een jaarpashouder die een trippas koopt zijn niveau houdt en 30 dagen extra krijgt. Geen pas loopt langer dan drie jaar, en de migratie moet nog door de eigenaar worden toegepast.
- **T266 Testscripts weer bijgewerkt.** Een twaalftal scherm- en beheertestscripts is weer in lijn gebracht met hoe de app nu werkt, en losse controles zijn vaste teststappen geworden. Er is geen appcode veranderd, dus je kunt weer vertrouwen op wat ze melden.

## 6. Wave 2

*2 oktober*

- **T085 Prijsbereiken kloppen weer.** Reispagina's toonden een prijsbereik als twee losse prijzen met een komma ertussen door een fout in het opschonen van streepjes; dat is in de bouwstap rechtgezet. Zo lezen prijzen weer als een echt bereik.
- **T113 Beroemde-routesregister uitgebreid.** Het register kreeg een vergelijking met Waymarked Trails en een kloofanalyse per berggebied. Zo kan het ook nationale routes vinden waar niemand een artikel over schreef.
- **T126 Beeldbrief en beoordelingsprompt.** De regels voor goede foto's zijn nu opgeschreven en ook als prompt voor een beeldmodel gebouwd, inclusief een vaste afstandsregel van 2 km. Het is nog nergens aangesloten, dus er verandert nog niets voor reizigers; het geeft wel een kant en klare basis voor de volgende stap.
- **T157 Controle op verboden vaktermen.** Er is een script dat de vertalingen scant op technische termen die reizigers niet horen te zien. Het vond 10 overtredingen, allemaal in bronvermeldingen; het rapporteert alleen en is nog niet aan de build gekoppeld.
- **T177 Besluit over routekaarten.** Er is niets gebouwd, alleen een aanbevolen besluit opgeschreven dat wacht op bevestiging van de eigenaar. Carta bewaart eigen sporen per routetrip en tekent ze op de eigen kaart, dus niet via komoot of Mapbox.
- **T187 Ontwerp voor het eerste resultaat.** Er is een document geschreven over het moment waarop een nieuwe bezoeker zijn eerste totaalprijs ziet, met negen vragen die het scherm moet beantwoorden. In de app is niets veranderd; het legt vast wat er wel en niet uitgelegd wordt.
- **T201 Positionering in één zin.** Carta heeft nu een opgeschreven positionering: een zin, een alinea en drie bewijspunten die elk naar bestaande code verwijzen. Er is niets in de app veranderd, maar alle marketing kan hier nu op leunen.
- **T267 Vluchtprijs in planner gelijkgetrokken.** De rondvlucht in de planner wordt nu net zo geprijsd als in Explore, met herkomstinformatie en een schattingsvlag. De chatplanner geeft ook duidelijkere foutmeldingen, zodat getallen overal hetzelfde zijn en fouten uitlegbaar.
- **T268 Admin-vervolgpunten in de database.** Een nieuwe migratie sluit veertien open punten aan de databasekant van beheer en moderatie, zoals een auditregel wanneer een verwijdering zonder sterke inlog wordt geweigerd. Hij is nog niet op het live project toegepast.
- **T269 Fotopijplijn klaar voor de grote run.** De voorbereidende code voor de foto's is verbeterd: plaatshouders, een markering voor foto's zonder bronvermelding en een eerste ronde met alleen gepubliceerde foto's, en negen openstaande punten zijn gesloten. Er ging niets live, want de laptop heeft geen R2-toegang, dus alles is offline getest. Zo kan de echte fotorun straks sneller en schoner starten.

## 7. Wave 3

*2 oktober*

- **T087 Maandstrip voor beste reismaanden.** De beste maanden staan nu als een strip van twaalf vakjes, met goede maanden groen en te vermijden maanden grijs doorgestreept. De uitleg zit achter een klein infoknopje; zo zie je in één oogopslag wanneer je het beste gaat.
- **T121 Besluit: knooppuntennetwerken zijn geen routes.** Er is geen code aangepast: het rapport legt vast dat knooppuntnetwerken (zoals knooppunten in Nederland) niet als routes worden opgenomen omdat het slechts 2 km fragmenten zijn. Of er ooit een lusroute-product op komt, blijft een productkeuze.
- **T130 Street View bewust uitgesloten.** Er is vastgelegd dat Google Street View niet gebruikt wordt voor foto's met de juiste kijkrichting, omdat de voorwaarden opslaan verbieden en het betaald is. Er is niets gebouwd; zo komt dit voorstel niet steeds terug en is het alternatief (zelf berekende uitzichten) duidelijk.
- **T132 Controle op Sentinel en Esri kaartlicenties.** Er is nagezocht of de app verboden satelliettegels gebruikt, en dat blijkt niet zo: alleen de CartoDB basiskaart wordt gebruikt. Er is niets aangepast; het geeft zekerheid dat er geen licentieprobleem op de kaart zit.
- **T197 Regels voor externe componenten.** Er is alleen een document geschreven dat uitlegt hoe Carta componenten van externe bibliotheken mag overnemen; er is geen component toegevoegd. Dat houdt de app consistent, want die bibliotheken draaien op Tailwind en Carta gebruikt dat niet.
- **T202 Vergelijking met concurrenten.** Carta is vergeleken met tien producten in vier categorieën, met per product wat het beter kan, wat het niet kan en waar Carta staat. Het is alleen een document; het geeft eerlijke argumenten voor wat Carta wel en niet moet claimen.
- **T204 De groeibeperking op papier.** Eén document zet de rekensom vast: ongeveer 6,85 euro marge per aankoop laat nauwelijks ruimte voor betaalde reclame. Daardoor ligt de keuze vast voor organische groei, en wijst het document naar de taken die dat werk doen.
- **T205 Plan voor programmatische SEO.** Er is een plan geschreven om de catalogus de belangrijkste bron van gratis bezoekers te maken; er is nog niets gebouwd. Nu is er maar één vindbare pagina, terwijl er ruim 31.000 rijen met genoeg feiten klaarstaan.
- **T217 Procedure voor terugbetalingen.** Er is een vijfstappenprocedure voor terugbetalingen geschreven: verkoop vinden, beslissen, terugbetalen in Stripe, toegang aanpassen en vastleggen. Dat is nodig omdat de code niet op een terugbetaling reageert, dus zonder procedure blijft toegang onterecht open.
- **T218 Incidentenhandboek.** Er is een draaiboek voor de vijf grootste storingen: pijplijn, Gemini-quota, Stripe-webhooks, Cloudflare en Supabase. Het kiest voor een melding in de app in plaats van een openbare statuspagina, omdat er maar één beheerder is.
- **T246 Besluit over mobiele strategie.** Er is niets gebouwd; het advies is om een webapp (PWA) te blijven en betalingen via het web te houden. De App Store en Play Store blijven dicht tot een van drie genoemde triggers gebeurt, en de eigenaar moet dit nog bevestigen.
- **T270 Admin-scherm krijgt opvolgwerk.** De adminpagina toont nu wat er op een mens wacht, met tellers, extra tegels en kaarten, en een Public of Private schakelaar per instelling; zeventien open punten zijn afgehandeld. Ook is een fout gerepareerd waardoor een mislukte lading alle overrides als verweesd zou markeren. Het admin-werk is daardoor betrouwbaarder en overzichtelijker.

## 8. Wave 4

*2 oktober*

- **T088 Moeilijkheidsmeter en vliegvelden netjes.** Moeilijkheid is nu vijf segmentjes met een score, en de aankomstvliegvelden staan als korte lijst met code, naam en transfertijd. Dat leest veel sneller dan lopende tekst.
- **T203 Doelgroepen op volgorde.** De lancering richt zich eerst op wandelaars die vanuit een stad een dag of weekend gaan lopen, met de andere vijf doelgroepen daarachter. De rangorde is gemeten op de data die de app nu heeft, dus niet op gevoel.
- **T206 Outdoor-gemeenschappen als route.** Er is in kaart gebracht waar Europese wandelaars en fietsers samenkomen, wat die plekken tolereren en wat Carta nuttig kan bijdragen. Het is alleen een plan, deels afhankelijk van een exportbesluit van de eigenaar, zodat de eerste berichten eerlijk blijven.
- **T207 Lanceerkanalen en lanceerdag.** Er ligt een plan met welke kanalen in welke volgorde, wat elk nodig heeft en hoe je terugtrekt als de site omvalt. Het is verspreid over dagen omdat Bas de enige beheerder is, en het corrigeert twee aannames uit de mindmap.
- **T208 Pers en samenwerkingen.** Een eerder concept met 31 media zonder bronnen is vervangen door een korte, getoetste lijst plus het advies om voor de lancering geen koude pers te doen. Carta heeft nog geen live betalingen of vluchtprijzen, dus er valt nog weinig te melden.
- **T214 Besluit over analytics.** Het advies is om geen analytics van derden toe te voegen en bezoekcijfers uit de eigen serverlogs te halen, zodat er geen cookiebanner nodig is. Dit staat als aanbeveling klaar voor de eigenaar; er is niets gebouwd.
- **T215 Lanceermetrieken en bronnen.** Eén pagina somt de lanceercijfers op met per cijfer waar je het vindt, vooral in het bestaande beheeroverzicht. Zeven van de tien hebben al een meetpunt, drie niet, zodat je weet wat je op lanceerdag blind bent.
- **T216 Supportmailbox vastgelegd.** Er is een supportpagina met één rolmailadres, een afgesproken reactietijd en vier standaardantwoorden. Het adres bestaat nog niet en de app wijst nog naar Bas' persoonlijke Gmail, dus de eigenaar moet het eerst aanmaken.
- **T273 Geen vluchtprijzen meer op schermen.** Alle geschatte vluchtbedragen zijn van de schermen gehaald: de planner toont alleen de route en telt een vlucht pas mee als de reiziger zijn eigen prijs invult. De goedkopere-startdata zijn ook weg. Dit maakt de eigenaarsbeslissing dat Carta geen vluchten prijst echt waar in de app.
- **T274 Uitnodigen als medeplanner repareren.** Een vriend uitnodigen om samen een reis te plannen zou nooit hebben gewerkt door een rechtenfout in de database. Een nieuwe migratie lost dat op, maar ze is nog niet toegepast op de live database. Zo werkt de functie meteen goed zodra de community-laag live gaat.

## 9. Wave 5

*2 oktober*

- **T092 Vaste overzichtstabel op reispagina's.** De tabel met de week in vogelvlucht heeft nu op elke reis dezelfde tien rijen in dezelfde volgorde, en een ontbrekend gegeven staat er als 'Not recorded'. Zo kun je twee reizen eerlijk naast elkaar leggen.
- **T176 GPX en KML gratis.** De traildownload van GPX en KML vraagt niet langer om een pass; de fietsroute was al gratis. PDF en planner-exports blijven achter de pass, en de tekst over de pass is in zes talen aangepast.
- **T219 Feedbacklus voor reizigers.** Er is een besluit vastgelegd over hoe reizigers een foute prijs, slechte foto of ontbrekend pad melden en waar dat landt. De bestaande feedbackvorm en het beheerscherm worden hergebruikt, en het wacht op de eigenaar.
- **T220 Lanceerplanning van zes weken.** Er is een planning voor de laatste zes weken geschreven, uitgedrukt in dagen voor en na lanceerdag. Er staat bewust geen datum in omdat de eigenaar die nog niet heeft gekozen.
- **T226 Besluit over contentstrategie.** Er ligt een besluit dat Carta alleen pagina's publiceert die uit de eigen records worden gegenereerd, met bij elk cijfer de herkomst. Er is geen redactionele inhoud erbij, zodat de strategie klein en eerlijk blijft.
- **T276 Travelpayouts-script uit de app verwijderd.** Het Travelpayouts-script en de bijbehorende toegestane websites zijn uit de app en de beveiligingsregels gehaald. Er laadt nu geen script van derden meer, en de affiliatelinks zelf blijven werken. Daardoor klopt het standpunt dat er geen cookiebanner nodig is weer.
- **T277 Productdocumenten volgen de besluiten.** PRODUCT.md en de schattingsdocumentatie zijn aangepast aan de besluiten: geen vluchtprijzen, de volgorde van doelgroepen met wandelaars voorop en een nieuwe openingszin. Het is alleen documentatie. Zo lezen toekomstige sessies dezelfde waarheid als de eigenaar.
- **T278 Eigen vlucht rekent vervoer van luchthaven mee.** Een door de reiziger ingevulde vlucht telde de reis van de luchthaven naar de stad niet mee, en dat doet het nu wel. Ook is er een knop om je eigen prijs weer te verwijderen en de gevonden route terug te zien. Daardoor kloppen de totalen van de reisplanner beter.
- **T279 Testscript voor vlucht zonder prijs herschreven.** Het controlescript voor de herkomst van prijzen paste niet meer bij de app en is opnieuw geschreven voor de regel dat Carta geen vluchten prijst. Het draait nu met 56 controles zonder fouten. Zo kan een oude regel niet ongemerkt terugkomen.
- **T280 Fotocredits ook bij routes verplicht.** De export van wandelroutes houdt nu foto's tegen waarvan de licentie een naam eist maar waar geen naam bij staat, net als bij stranden en meren. Het is alleen code en nog niet op echte data gedraaid. Zo tonen we geen foto's zonder de vereiste bronvermelding.

## 10. Live naar Cloudflare en alles op een rij

*2 oktober tot 3 oktober*

- **T272 Besluiten van de eigenaar vastgelegd.** De antwoorden van de eigenaar zijn vastgelegd: Carta prijst geen vluchten, routes lopen over de eigen kaart en er komen ook app-winkel-apps. De FAQ-vraag over vluchtprijzen is verwijderd en de open punten zijn gesloten. Zo spreken documenten en scherm elkaar niet meer tegen.
- **T275 Tweede ronde besluiten en plaklijst.** De eigenaar beantwoordde de nieuwe vragen: Travelpayouts weg, de GPX van routes gratis en meer. De lijst met database-stappen is gecorrigeerd, want de oude volgorde had gefaald omdat twee eerdere migraties nooit waren toegepast. Zo kan de eigenaar de stappen in één keer goed uitvoeren.
- **T288 Opslag en eerste back-ups staan live.** De eigenaar heeft de R2-opslag, het koude archief van 66 GiB en de eerste versleutelde back-ups van beide databases aangemaakt. Dit rapport legt dat vast en sluit acht open punten. Zo is alle data nu veilig bewaard buiten de laptop.
- **T289 Uploadscript werkt weer op Windows.** Het uploadscript voor de data gaf een foutmelding door spaties in het pad op Windows en is gerepareerd. Er is toen niets geüpload of aangeraakt in de opslag. Zo kan de eigenaar de data nu vanaf deze laptop uploaden.
- **T290 Datahost toegestaan en data op R2.** De datahost is toegevoegd aan de beveiligingsregels en alle 52.311 bestanden staan op R2 en zijn gecontroleerd. De live site draaide nog op de oude bouw. Zo was de weg vrij om de overstap te maken.
- **T291 Live site leest data van R2.** De live site gebruikt nu een app-schil van 64 bestanden en haalt alle data van R2, na een controle door de eigenaar. De oude uitval van 1 oktober is daarmee voorkomen. Hiermee is de verhuizing van de data klaar.
- **T292 Gegenereerde data uit git gehaald.** De hoofdrepository volgde 48.211 gegenereerde bestanden niet meer, ongeveer 1 GB. Dat werd later teruggedraaid, zie T297. Dit hield de repository eerst kleiner maar bleek te ver te gaan.
- **T293 Productie draait nu op Cloudflare Pages.** De site staat niet meer op Vercel maar op Cloudflare Pages, met uploads van de kant-en-klare bouw. Gebruikers zagen geen verschil in de code. Zo kan een git-bouw de site niet meer kapotmaken.
- **T294 Doorverwijzingsregels kloppen met Pages.** Een regel voor het kale domein in het doorverwijzingsbestand deed op Pages niets en is verwijderd, en de uitleg daarbij is gecorrigeerd. Een nieuw bestand houdt de regeleinden gelijk. Zo staat er geen misleidende configuratie meer.
- **T295 Eén bouwcommando voor productie.** Er is nu één commando voor de productiebouw dat de datahost goed instelt en meteen de limieten van Pages controleert. De controle is ook onderdeel van het standaard testcommando. Zo kan niemand de bouw nog vergeten of verkeerd instellen.
- **T296 Preview-adres mag data lezen.** De datahost laat nu ook het vaste previewadres van Cloudflare Pages toe. De regel werkt pas als de eigenaar hem met een token toepast. Zo kunnen previews straks echte data laden.
- **T297 T292 teruggedraaid, data weer in git.** De 48.211 bestanden worden weer door git gevolgd, omdat de meeste niet opnieuw te maken waren op de laptop. Een verse kloon, zoals de bouwserver, heeft ze nodig. Zo is er geen data kwijtgeraakt.
- **T298 Stap 7 klaar, wekelijkse taak uit.** De wekelijkse taak op de laptop is uitgezet, omdat die maandag zonder de gearchiveerde data veertig taken zou hebben geprobeerd. De voorbereiding voor de bouwserver is klaar. Zo draait er niets stuk op de laptop.
- **T299 Bouwserver mag x86 zijn.** De ARM-servers bij Hetzner bleken overal niet beschikbaar, dus de scripts werken nu ook op de goedkope x86 CX23 met een IPv4-adres. Het wachten op voorraad is ingebouwd. Zo kan stap 7 toch beginnen.
- **T300 Alle rapporten gecontroleerd en opgeruimd.** Negen agenten controleerden 150 rapporten tegen de code: 97 klopten, 39 hadden kleine fouten en 8 grote. De hoofdlijst met open punten is herschreven, met daarin alle taken voor de eigenaar. Zo is het overzicht weer betrouwbaar.

## 11. Wave 6

*2 oktober*

- **T086 Lege secties op reispagina's gecontroleerd.** In de app is niets veranderd: gecontroleerd is dat 153 van de 253 reizen (60 procent) geen paklijst en geen risicosectie hebben en dat de pagina die lege koppen al netjes verbergt. Zo staat vast dat er geen lege blokken zichtbaar zijn.
- **T094 Eerlijker vet gedrukt en leeftijd van cijfers.** Vetgedrukte tekst blijft nu alleen staan als er een getal in zit (maximaal twee per tekst) en de catalogus zegt eerlijker wat hij dekt en hoe oud de cijfers zijn. Voorheen stond bij 241 van de 253 reizen vet uit gewoonte.
- **T196 Ontwerpcontrole in CI.** Er is een automatische controle bijgekomen die faalt zodra een wijziging een verboden generiek ontwerppatroon toevoegt, zoals een losse hexkleur, verloop of gedachtestreepje. Oude overtredingen zijn vastgelegd als uitgangspunt, zodat alleen nieuwe fouten de bouw breken en het ontwerp strak blijft.
- **T211 Eerste gebruik en lege schermen.** Twee ontwerpdocumenten beschrijven de eerste negentig seconden en alle lege toestanden, nu zonder vluchtprijs van Carta omdat Carta geen vluchten meer prijst. Er is geen code geschreven, maar een openstaand punt over het eerste-gebruik-bonnetje is gesloten.
- **T281 Controlescripts van schermen hersteld.** Dertien open punten over testscripts zijn opgepakt, waarvan elf helemaal gesloten, zonder de app zelf te wijzigen. Verouderde scripts voor routes, beveiligingsregels en regio's werken weer. Zo zijn de controles weer te vertrouwen voor latere wijzigingen.
- **T282 App opgeruimd en toegankelijker.** Zes kleine open punten zijn gesloten: een lintregel faalt nu bij nieuwe fouten in hooks, twee vensters houden toetsenbordfocus netjes vast, en de admin kan routes per land bekijken. Een ongebruikt onderdeel is verwijderd. Dit houdt de code netter en het toetsenbord bruikbaarder.
- **T283 Planner minder verborgen waarschuwingen.** In de planner stonden eenendertig onderdrukte lintwaarschuwingen en dat zijn er nu tien met een uitleg erbij. De overige eenentwintig zijn echt opgelost. Dat voorkomt verborgen bugs bij latere aanpassingen.
- **T284 Migratie 047 met drie kleine fixes.** Er is een nieuwe migratie klaargezet die onder meer app-crashes in de foutlijst opslaat, wat eerst werd geweigerd. Ze is nog niet geplakt in de live database en wacht op de eigenaar. Zo kunnen crashes van reizigers straks echt worden gezien.
- **T285 Documentatie weer bijgewerkt.** Zeven documentatiepunten zijn rechtgezet, zoals het verouderde bestemmingsaantal dat nu naar de live data verwijst en het juiste aantal bronvermeldingen. Het is alleen documentatie. Zo staan er geen verouderde cijfers meer in de uitleg.
- **T286 Klim van routes overal gelijk.** Elke plek die één klim toont, laat die nu bergopwaarts zien, ook in de kaart, het pdf en het KML-bestand. Bij Mount Korab ging de klim van 7 naar 1423 meter. Zo zien wandelaars overal hetzelfde, juiste getal.
- **T287 Maandstrook op meer- en bergpagina.** De gedeelde maandstrook staat nu op de meerpagina en de bergpagina en laat zien welke maanden goed zijn. Op de strandpagina is hij niet toegevoegd omdat de data daar geen maandgegevens heeft. Zo ziet een reiziger overal in één oogopslag wanneer te gaan.

## 12. Wave 7

*2 oktober tot 3 oktober*

- **T143 Vast formaat voor gegenereerde trips.** Er is een strak schema met een poortwachter gebouwd waaraan elke door een model gemaakte trip moet voldoen, met getallen op vaste plekken in plaats van in zinnen. Het is alleen voorbereid en nog niet gebruikt; het voorkomt rommelige, onvergelijkbare AI-teksten.
- **T198 Typografiekeuze vastgelegd.** Drie documenten spraken elkaar tegen over de lettertypen, en nu staat er één besluit: Fraunces, Plus Jakarta Sans en JetBrains Mono, altijd via de ontwerpvariabelen. Zo hoeft niemand meer te gokken en blijft de app er hetzelfde uitzien.
- **T213 Ontwerp van e-mailstromen.** Er is niets gebouwd; het document bepaalt welke negen mails Carta stuurt en op welke juridische grond, en dat Carta bij de start alleen noodzakelijke mail verstuurt. De keuze van de verzendroute ligt nog bij de eigenaar.
- **T271 Explore sneller bij eerste scherm.** Explore en Destinations wachten niet meer op alle bestemmingsbestanden, maar tekenen eerst uit een kleine ranglijst; op een trage telefoon verschijnt de eerste kaart in 3,9 seconden in plaats van 13,9. De bestemmingspagina springt op een telefoon ook niet meer. Daarmee voelt de app veel sneller en haalt hij de Core Web Vitals.
- **T310 Licentieregister aangevuld.** Het register toont per bron of een kopie mag worden bewaard en welke bron bij elke van de 43 vermeldingen hoort. Oude bronnen staan nu apart in een geschiedenishoofdstuk. Zo is de juridische kant van de data beter te controleren.
- **T311 Elf datacodefouten opgelost.** Elf fouten in de dataverwerking zijn in code opgelost en met tests afgedekt, maar nog niet op echte data gedraaid. Ze gaan in werking bij de volgende run, ook op de bouwserver. Daarmee wordt de data straks zonder losse reparaties goed verwerkt.
- **T312 Verborgen hook-waarschuwingen in de rest.** Buiten de planner zijn 24 van de 44 onderdrukte waarschuwingen echt opgelost en de rest heeft een reden gekregen. Over de hele app gaat het van 55 naar 31. Zo blijven echte fouten beter zichtbaar.
- **T313 Licentienamen uit de teksten gehaald.** Op de pagina's staat nu gewoon wie de data levert, zoals OpenStreetMap-bijdragers, en de licentienamen zitten in een inklapbaar blokje Where this comes from. Ook is een fout in de taalcontrole gerepareerd waardoor Franse teksten ontbraken. Zo blijft de vereiste bronvermelding zichtbaar zonder jargon.
- **T314 Betalingsafsluiting wordt nu geteld.** Als iemand de betaalmuur sluit door het tabblad te sluiten of te herladen, wordt dat nu toch geteld. Twee punten zijn gesloten en één wacht op een databasestap. Zo kloppen de cijfers over de betaalmuur beter.
- **T315 Migratie 048 voor tellers en volledige export.** Er is een migratie klaargezet die drie lanceercijfers zonder persoonsgegevens bijhoudt en de GDPR-export uitbreidt naar alle tabellen met reizigersdata. Ze is nog niet geplakt in de live database. Zo kan de lancering gemeten worden zonder cookiebanner.

## 13. Wave 8

*3 oktober*

- **T082 Controle van datacontract in CI.** Er is nu één poort die controleert of de veldnamen tussen pijplijn, documentatie en app overeenkomen, en een GitHub-workflow draait die automatisch. Zo valt een hernoemde laag meteen op in plaats van pas als de app breekt.
- **T097 Nauwkeurigheidscijfer getoond in het product.** De bestemmingspagina toont nu onder het kostenoverzicht de regel dat eetprijzen voor 88 procent van de bestemmingen binnen 6 euro per dag kloppen, met een uitklapper over hoe dit gemeten is. Alleen het eetcijfer wordt getoond, omdat alleen dat de test haalde.
- **T098 Herkomst en bronnen in kostentekst.** Het kostenoverzicht zegt nu voor bed en eten apart of het een stadsmeting of een landgemiddelde is, en noemt de bron. Zo wordt het verschil tussen een gemeten Madrid-prijs en een landelijke schatting zichtbaar.
- **T112 Dekkingsdashboard en poort in de build.** Het dashboard bestond al, dus er is een rechter bijgebouwd die de build laat falen bij onvoldoende dekking, met een workflow die hem draait. Zo kan de dekking niet ongemerkt achteruitgaan.
- **T142 Live webcams als ingebed venster.** De bestemmingspagina kan nu een blok met live webcambeelden van foto-webcam.eu tonen, zonder dat Carta zelf beelden opslaat. Nog geen enkele pagina heeft webcamdata, dus er is voorlopig niets zichtbaar; twee andere aanbieders zijn geschrapt omdat hun voorwaarden het niet toestonden.
- **T199 Lettertypen zelf hosten.** Carta haalt de drie lettertypen niet meer bij Google op maar serveert ze zelf, in zes kleine bestanden. De voorgestelde stap naar React 19 en Tailwind is niet gedaan, alleen onderzocht; dat scheelt een externe afhankelijkheid en laadt sneller en privacyvriendelijker.
- **T200 Core Web Vitals gemeten.** Er is niets aangepast; de laadsnelheid van de prijskaart, een bestemmingspagina en een trip is gemeten op de echte site. Op mobiel faalt elke pagina op minstens één meting, dus dit is de nulmeting voor het verbeterwerk.
- **T212 Deelafbeeldingen en iconen.** Er is een generator voor deelafbeeldingen gebouwd en een afgewerkte icoonset, beide uit de eigen ontwerpwaarden. Voorheen was er alleen een vierkant icoon dat bij delen werd bijgesneden, dus links zien er nu veel beter uit.
- **T223 Vaste URL-structuur.** Er is een vaste opbouw voor alle webadressen vastgelegd en in één codemodule gezet. De regel is dat het id nooit verandert en de woorden wel, zodat oude links blijven werken.
- **T316 Storingsmelding los van Supabase.** Carta kan nu een storing melden via een klein bestand op de datahost, ook als Supabase zelf plat ligt. De balk gebruikt dezelfde stijl en het bestand wint als beide actief zijn. Zo hoor je een storing nog steeds.
- **T317 Echte 404 en veiliger opruimen.** Onbekende adressen geven nu een echte 404 in plaats van de startpagina met 200. Het opruimen op R2 ziet ook verwijderde mappen, en er staat een herstelhandleiding voor back-ups. Zo gedraagt de site zich netter.

## 14. Wave 9

*3 oktober*

- **T144 Trips genereren in drie stappen.** Er is een generator die een trip in drie stappen maakt (route, tekst, cijfers) met na elke stap een controle. De code en tests staan klaar; het maakt trips beter beheersbaar en minder onevenwichtig dan met één grote prompt.
- **T221 Statische pagina's voor zoekmachines.** Elke soort pagina krijgt nu statische HTML die zoekmachines zonder JavaScript kunnen lezen, met een route om dit via Cloudflare te serveren onder de bestandslimiet. Het staat nog niet live, want de eigenaar moet de opslag aanmaken, uploaden en uitrollen.
- **T318 Uitlegpagina over de cijfers.** Er is een nieuwe vaste pagina Where the numbers come from op het adres about/numbers, zonder script en zonder inloggen. Alle cijfers erop komen uit de echte data en niet uit getypte tekst. Zo kan een bezoeker zien waar de prijzen vandaan komen.
- **T319 Juridische teksten volgen de code.** Het privacybeleid en de gebruiksvoorwaarden zijn herschreven omdat er vijf stellingen niet klopten en acht dingen ontbraken. Het register van verwerkingen bestaat nu als bestand. De eigenaar moet de tekst nog goedkeuren.
- **T320 Poortcontrole voor golfrunners.** Er is een controlescript voor de golfrunners dat checkt of een taak een rapport heeft, alles is vastgelegd en de app-repo schoon is. Een tweede punt over strengere geheimenscans lukte niet. Zo gaan slecht afgeronde taken niet door.
- **T321 Scoreverdeling was fout, curve opnieuw.** De vaste scorecurve gaf de verkeerde verdeling, wat een controle liet falen. De curve is opnieuw gebouwd en er is een test bij gekomen. De echte scores veranderen pas na een nieuwe berekening.
- **T322 Waarom routes in de wire ontbreken.** Het onderzoek naar waarom 1.930 landelijke routes niet in de wire staan toonde dat drie filters ze weghouden en niet het netwerkfilter. Er is code toegevoegd, maar de data is niet aangepast. Zo weten we nu waar het zit.
- **T323 Opvolging van de AI-functies.** Vier punten rond de AI-functies zijn gesloten: het plan wordt niet meer vertraagd door het bijhouden van een log, en de kostenberekening is opnieuw gedaan. Drie functies worden nu echt uitgevoerd in tests met 145 controles. Zo gaat het plannen sneller.
- **T324 Code voor Hetzner-bouwserver klaargezet.** Vier kleine wijzigingen aan de scripts voor de bouwserver: een mislukte export schakelt nu het alarm in, beeldconversie slaat de nieuwe lagen over, en de PostGIS-image is vastgezet. Niets liep nog live. Zo gaat stap 7 veiliger van start.

## 15. Wave 10

*3 oktober*

- **T090 Reizen op de juiste plek gezet.** Elke reis heeft nu een pin op een plaats uit de eigen route en in het juiste land, terwijl er eerst 61 reizen op de hoofdstad en 54 op een luchthavenstad stonden. De validator laat voortaan elke terugval op een hoofdstad falen.
- **T145 Aparte kritische controleur voor trips.** Elke gegenereerde trip gaat nu langs een vierde, losse aanroep die alleen fouten zoekt en het schrijfwerk niet te zien krijgt. Dat is gebouwd en getest; het vangt tegenstrijdigheden en rekenfouten die de schrijver zelf niet ziet.
- **T191 Stylesheet van 33.737 regels opgesplitst.** Het enorme stylesheet is gesplitst in 19 bestanden zonder iets te veranderen; het eindresultaat is bewezen identiek. Het maakt het werk voor wie het onderhoudt veel overzichtelijker.
- **T222 Sitemaps en kwaliteitsdrempel.** De bouw schrijft nu negen sitemaps en een index, en een echte drempel keurt elke pagina. Een pagina zonder titel, coördinaten, gelicentieerde afbeelding en minstens drie feiten komt er niet in, zodat zoekmachines geen leeg materiaal zien.
- **T224 Kosten- en landenpagina's.** De bouw maakt nu voor elke geprijsde bestemming een weekkostenpagina en voor 40 van de 43 landen pagina's per reisduur. Het is nog niet live; het volgt dezelfde uploadprocedure als de andere pagina's en vangt zoekopdrachten als wat kost een week in Malaga.
- **T325 Ontwerpvaardigheid weer bij de tijd.** De carta-design skill beschrijft nu de echte, gekozen stijl: warm papier, leisteen en één terracotta accent. Het oude, teruggedraaide koele palet is eruit. Zo ontwerpen nieuwe sessies in de juiste stijl.
- **T332 Fouten in reisroutes hersteld.** De validator vond fouten in de budgetten van 58 reizen, vooral per nacht of per dag in plaats van het weektotaal, en die zijn rechtgezet. Nu blijven er nog twee fouten over bij overnachtingen. Zo kloppen de reisbudgetten veel beter.
- **T335 Eén gedeelde knopcomponent.** Carta heeft nu één gedeelde knop met vier varianten en twee maten, gebouwd op de eigen kleuren zonder nieuwe pakketten. Hij is geïnspireerd door shadcn/ui maar niet daarvan geïnstalleerd. Zo worden knoppen overal gelijk.

## 16. Wave 11

*3 oktober*

- **T091 Geen dubbele heldenfoto's meer.** Zesentwintig foto's werden door 53 reizen gedeeld; nu heeft elke van de 253 reizen een eigen foto en de validator geeft een fout bij dubbelen. Dat voorkomt dat verschillende reizen er hetzelfde uitzien.
- **T146 Betrouwbaarheid per cijfer zichtbaar.** Elke trip houdt nu per cijfer bij of het uit een bron komt, berekend is of geschat, en de pagina laat dat zien. Dit staat in het schema en de poort; het maakt voor de lezer duidelijk hoeveel een getal waard is.
- **T150 Hulpmiddel voor paklijsten en risico's.** Er is een tool gebouwd die ontbrekende paklijsten en risicoblokken kan laten schrijven, maar er is nog geen model aangeroepen omdat de Gemini opzet van de eigenaar nog niet klaar is. Het doel van 253 gevulde trips is dus nog niet gehaald; de tool is wel getest met nepantwoorden.
- **T151 Afstand en hoogte per trip rechtgezet.** De drie cijfers voor afstand, hoogte en hoogteverschil worden nu per reistype volgens een vaste regel uit de bestaande tekst gehaald. Zestien foute waarden (zoals de hoogte van Engelberg als afstand) zijn gecorrigeerd of leeggemaakt, zodat er geen onzin meer getoond wordt.
- **T153 Vaste testset voor promptwijzigingen.** Er is een set van tien referentietrips met een programma dat ze opnieuw laat genereren en de cijfers vergelijkt met de laatst goedgekeurde run. Zo valt meteen op als een kleine promptwijziging honderden trips verkeerd zou maken.
- **T154 Menselijke review alleen op gemarkeerde punten.** Een reviewer leest nu een wachtrij met alleen gemarkeerde velden: betwiste cijfers, dure schattingen en de eerste trip per land of stijl. Dat is gebouwd; het houdt de handmatige controle betaalbaar.
- **T327 Voorwerk voor de feitenopslag.** De taak met de feitenopslag zelf wacht nog op de eigenaar, dus er is voorwerk gedaan: de lijst met geblokkeerde sites is gedeeld en parkeerdata kan omgezet worden. Er is nog geen migratie geschreven. Zo kan de echte opslag later sneller.

## 17. Wave 12

*3 oktober*

- **T152 Maximale lengte voor teksten afgedwongen.** De maximale lengtes voor samenvatting, dagteksten en tips worden nu op drie plekken uit dezelfde getallen gecontroleerd. De bestaande catalogus houdt zich er nog niet aan en dat is bewust alleen een waarschuwing; het houdt nieuwe teksten kort en leesbaar.
- **T155 Catalogus in batches uitbreiden.** Er is een stappenplan met acht commando's om de tripcatalogus per regio uit te breiden, met een uitgavenplafond en controles voordat iets de catalogus in mag. Er is nog geen enkele trip gegenereerd; de betaalde runs zijn aan de eigenaar.
- **T159 Voor wie het niet is, per pagina.** Zeven paginatypes tonen nu een blokje van maximaal twee regels dat begint met "Niet iets voor je als". De regels volgen automatisch uit de gegevens op de pagina, dus ze kunnen niet verouderen en zijn eerlijker naar de reiziger.
- **T160 Eerlijke dekkings en bronvoeters.** Lijsten tonen nu hoeveel items Carta publiceert, hoeveel er nog bekend zijn en waarom die niet te tonen zijn. Detailpagina's krijgen een voet met herkomst van de gegevens; het maakt de gaten in de data open en eerlijk zichtbaar.
- **T161 Geschiktheidsstrook bewust niet gebouwd.** Er is niets gebouwd, omdat de ontwerpregels voor een doorzichtige strook over de foto ontbreken. Er ligt nu een voorgestelde regel als vraag voor de eigenaar; zonder geschreven regel wilde de taak geen ontwerpkeuze verzinnen.
- **T166 Eén hoofdknop per pagina.** Op elke gemeten pagina is er nu precies één gevulde hoofdactie, bijvoorbeeld "Plan een trip hier". Twee uitzonderingen in de navigatie zijn aan de eigenaar voorgelegd; het maakt duidelijk wat je als eerste moet doen.
- **T169 Boeken in de juiste volgorde.** De alinea over boekingstermijnen is nu een lijst "Boek in deze volgorde" met de verste deadline bovenaan en vinkjes die op het toestel onthouden worden. Zo weet je wat je vandaag nog moet regelen.
- **T184 Directe reactie bij aanraken.** Elk aanraakbaar element wordt nu meteen iets lichter en kleiner zodra je het aanraakt, via één algemene regel. Zo voelt de app direct reageren, ook bij trage netwerken.
- **T189 Laad en foutschermen uit één bron.** Twee gedeelde blokken tonen nu laad en foutstaten op de hoogte van de inhoud die komt, met rustige animatie. Een foutmelding zegt wat misging en wat je kunt doen, zodat schermen niet meer leeg of onduidelijk blijven.

## 18. Wave 13

*3 oktober*

- **T163 Dagdetails openen op dezelfde plek.** De knop "Meer over deze dag" bestond al, maar sprong abrupt open. Nu groeit de kaart soepel op zijn plek en blijven verborgen links buiten bereik van toetsenbord en schermlezer.
- **T164 Inklapbare rijen bij Handig om te weten.** Het blok Handig om te weten drukte alle tekst in één keer af (gemiddeld 275 woorden). Nu is elk onderdeel een eigen gesloten rij met icoon en een voorproefje van zes woorden.
- **T168 Paklijst als raster van iconen.** Wat in te pakken is nu een raster van 16 tot 24 iconen waarbij een tik uitlegt waarom iets meegaat. Het blok verschijnt nu op alle trips, ook de 153 die eerder geen paklijst hadden.
- **T170 Weekvorm en terugvalopties op reispagina.** Boven de dagen staan nu drie nieuwe blokken, waaronder een strook "Hoe de week loopt" met inspanning per dag en wisselingen van bed. Het geeft in één blik de vorm van de week, iets wat er eerder niet was.
- **T171 Openingszin, uitwegen en afsluiter.** Elke reispagina opent nu met één pakkende zin met een cijfer, eindigt met drie berekende alternatieven en sluit af met een detail van de route. Het geeft de pagina een duidelijk begin en einde.

## 19. Wave 14

*3 oktober*

- **T102 Treinalternatief op de reispagina.** Onder het budget staat nu een blok 'By train instead' met een grove enkele prijs, reistijd en vertrekstad, gemarkeerd als schatting en buiten het totaal. Het zegt of de trein een echte optie is, zonder vluchten te vergelijken.
- **T174 Hoogteprofiel en wegdek per week.** Wandel, hardloop en fietsweken tonen nu hoeveel je per dag stijgt en daalt, en fietsweken ook de verdeling van het wegdek. 72 van de 75 routeweken laten dit nu zien, terwijl geen enkele trip dit eerder had.
- **T175 Gegevensblad dat zich per stijl schikt.** Het gegevensblad op de reispagina kiest nu een volgorde per reisstijl en laat voor het eerst afstand, hoogste punt en klimmen zien. Alle tien stijlen hebben een volgorde, dus ook de 104 trips die er eerder buiten vielen.
- **T185 Foto groeit mee bij openen van pagina.** Open je een bestemming of trip vanaf een kaart, dan groeit de foto uit naar de kop van de nieuwe pagina. Zonder ondersteuning of met verminderde beweging opent de pagina zoals vroeger.
- **T190 Kaarten bruikbaar met het toetsenbord.** Alle kaarten in de app zijn nu met het toetsenbord te bedienen, onder meer door echte knoppen over de Explore kaart te leggen. De controle slaagt nu voor 20 van de 20 punten, tegen 11 daarvoor.

## 20. Wave 15

*3 oktober tot 6 oktober*

- **T103 Prijs per maand onder weerrij.** De maandstrip heeft nu een tweede rij die laat zien welke maanden goedkoper of duurder zijn om te verblijven, met bronvermelding. Het gaat alleen om kosten ter plaatse, omdat Carta geen vluchten prijst.
- **T180 Eén skelet voor detailpagina's.** Pad, fiets, strand, meer en berg tonen nu allemaal via één component met dezelfde balk en dezelfde volgorde van tien plekken. De fietspagina was niet eens een echt venster; nu delen ze alle toegankelijkheid en ogen ze als één familie.
- **T181 Eén kenmerkende grafiek per detailpagina.** Elke van de vijf detailpagina's heeft nu één eigen figuur, en vier kaarttypes een dun datastrookje onder de foto. Ze zijn allemaal in dezelfde inktkleuren getekend, zodat donkerder altijd meer betekent.
- **T182 Afgeleide blokken voor strand, meer, berg.** Strand, meer en berg kregen blokken die iets uit de data afleiden, zoals oriëntatie van het strand, looptijd erheen en hoe je omhoog komt. Het vertelt wat een cijfer betekent in plaats van alleen het cijfer.
- **T186 Kwaliteitsvloer en toegankelijkheid gecontroleerd.** Alle gecontroleerde schermen halen nu de afgesproken kwaliteitsdrempel, behalve twee zaken die de eigenaar moet beslissen (drie kleurparen en de grootte van muisdoelen). Het controlescript staat nu in de repo, zodat iedereen het kan draaien.
- **T193 Explore en planners naar de kwaliteitsvloer.** Explore, de tripplanner en de dagplanner gebruiken nu dezelfde gedeelde onderdelen als de rest en halen de kwaliteitsdrempel op 380 pixels. Dit waren de drie schermen die in de specificaties ontbraken.
- **T225 Weekbonnetje als redactioneel formaat.** De bouw schrijft nu per samengestelde reis een bonnetje van zeven dagen, 316 stuks waarvan 202 vindbaar, plus een blok met plaatsen in de buurt. Alles komt uit de data en niet uit tekst, waardoor het goedkoop is en lastig na te maken.

## 21. Wave 16

*6 oktober*

- **T183 Openingsschermen voor buitensecties.** Elke van de vijf buitensecties opent nu met negen bekende plekken met foto en daaronder rijtjes zoals "Zonder auto bereikbaar", pas dan het raster. Daarvoor opende elke sectie direct met een lange lijst.
- **T227 Juridische poortcontrole.** Alleen gecontroleerd: van tien juridische punten slagen er drie, falen er zes en kon er een niet worden nagegaan. Het belangrijkste is dat de live site nog een oudere versie draait dan de code, dus de privacypagina daar is verouderd.
- **T230 Poort voor datadekking.** Er is niets veranderd; de twee bestaande controles zijn gedraaid en geen van beide is groen. De tripcontrole meldt 517 fouten op 253 trips, dus de data is nog niet klaar voor de poort.
- **T231 Poort voor snelheid en toegankelijkheid.** De poort is niet gehaald: drie kleurparen halen de 4,5 contrastgrens niet en sommige muisdoelen op desktop zijn te klein, wat alleen de eigenaar kan beslissen. Wel zijn drie echte problemen gevonden en in zeven bestanden opgelost, zoals kaartpinnen en de Lifestyle-knop.
- **T233 Eén bron voor terreintegels.** De app heeft nu één plek die bepaalt waar de 3D-terreintegels vandaan komen, standaard Mapterhorn en met één instelling te wisselen naar een eigen spiegel. De app las die tegels nog helemaal niet, dus dit legt het fundament zodat een latere kaartfunctie niet van een derde partij afhangt.
- **T235 Uptimebewaking en alarmen.** Een script controleert elke 15 minuten via GitHub Actions de app, de dataopslag en Supabase en zet elke fout om in een alarmregel. Het draait los van de laptop en de server, dus je hoort van een storing zonder dat je zelf kijkt.
- **T336 Concepten voor lanceringsberichten.** Er is een bestand met twee conceptberichten: een beleefd bericht aan de bronnen die op de credits staan en een bericht aan partners over samen aankondigen. Niets is verstuurd. Zo kan de eigenaar bij de lancering snel mailen.

## 22. Jouw beslissingen verwerkt

*3 oktober tot 7 oktober*

- **T360 Ontwerpkeuzes van de eigenaar verwerkt.** Vijf openstaande ontwerpvragen werden beslist en twee ervan gebouwd: een vaste strook met moeilijkheid, stijl en kosten onder de reispagina-foto, en rustigere "Get a pass"-knoppen. De rest is alleen vastgelegd. Zo hoefden de volgende taken niet meer te gokken.
- **T361 Boekingstips voor 47 trips geschreven.** 66 van de 253 trips misten uitleg over wanneer je moet boeken. Uit officiële pagina's is voor 47 trips tekst gemaakt; voor 19 trips is niets verzonnen omdat er geen betrouwbare bron was. Zo krijgen reizigers echte boekingsadviezen in plaats van gokwerk.
- **T362 Antwoorden van de eigenaar doorgevoerd.** De eigenaar beantwoordde 81 beslissingen in één sessie, bijna allemaal volgens het advies, en deze taak zette ze om in regels en opdrachten voor de volgende golven. Zo wachten de volgende taken niet meer op vragen.
- **T369 Ontwerpgolven V1 tot V6 voorbereid.** De impeccable-ontwerptool is toegevoegd en er is een plan gemaakt voor een nachtelijke ontwerpronde over alle schermen, met onderzoek naar hoe mensen reizen plannen. Er is geen appcode veranderd. Het geeft de volgende 40 taken een vaste werkwijze.

## 23. Wave 16b

*7 oktober*

- **T099 Reis direct geprijsd op de reispagina.** De bestemmings- en reispagina tonen meteen een geprijsd totaal met verblijf en eten, zonder iets te vragen. Vluchten zijn bewust weggelaten omdat Carta geen vluchten prijst.
- **T100 Groepsgrootte kiezen, standaard twee.** Het kostenoverzicht heeft nu als eerste veld een keuze van 1 tot 12 personen die direct herprijst. De standaard is twee in plaats van het stille zeven dat eerst werd aangenomen.
- **T156 Eén infopunt en woordenlijst.** Er is nu één klein infopunt met een woordenlijst van 38 termen (zoals hardpack) in zes talen die overal hetzelfde werkt. Tik op het puntje en je krijgt een korte uitleg; zo lopen definities niet meer uit elkaar.
- **T158 Getallen omgezet in gewone zinnen.** Er is een tabel die voor tien soorten cijfers (hoogte, wegdek, zwemwater en meer) een zin maakt die mensen echt zouden zeggen. Het cijfer blijft staan, de zin komt eronder; een cijfer dat niet te lezen is geeft nooit een verzonnen zin.
- **T162 Dagen als veegbare kaartenrij.** De zeven dagen op de reispagina staan niet meer onder elkaar maar in één rij kaarten waar je doorheen veegt. Het blok is daardoor op een telefoon ruim twee keer zo kort (403 in plaats van 1389 pixels) en veel overzichtelijker.
- **T165 Vaste sectiebalk op reispagina.** Op de reispagina verschijnt na de openingsfoto een dunne balk met zes stops: Waarom, Kosten, Dagen, Slapen, Weten en Inpakken. Tik je erop, dan opent en scrollt de pagina naar dat blok, zodat je in een lange pagina niet kwijtraakt.
- **T167 Advieskaartjes in plaats van lange tekst.** Handig om te weten, Pro tips en Wat kan misgaan zijn nu drie stapels kleine kaartjes met icoon en maximaal 35 woorden, met knoppen, pijltoetsen en vegen. Een link "Alles tonen" geeft de lijst, zodat het lichter leest.
- **T172 Kosten als één gestapelde balk.** Het budgetblok opent nu met één gestapelde balk met een segment per kostenpost, waarop je kunt tikken voor het bedrag. De kassabon eronder blijft zoals de eigenaar besliste; de balk is alleen een samenvatting.
- **T173 Levensstijl schuif op de kassabon.** De kosten van een week zijn nu met een stapsgewijze schuif te veranderen, en één zin legt uit wat dat bedrag aan comfort oplevert. Eerder was alles een vast bereik dat niets deed bij het bewegen.
- **T179 Eén kaart en raster voor buitensecties.** De vijf buitensecties (stranden, meren, bergen, fietsen, paden) gebruiken nu allemaal dezelfde kaart met 16:9 foto, naam, plaats en drie metingen. Daarvoor had elke sectie een eigen kaart, dus het voelt nu als één product.
- **T194 Nieuwe startpagina als thuis.** De eerder gebouwde landingspagina is nu de thuispagina: een eerste bezoek zonder link opent daarop, en terugkerende bezoekers en gedeelde links openen waar ze altijd openden. Zo krijgt een nieuwe bezoeker een echte eerste indruk van Carta.
- **T209 Landingspagina als startpagina.** Carta heeft nu een landingspagina die ook de startpagina is, met de belofte "wat een dag kost, per persoon, in 3.868 plaatsen" en het aantal live uit de data gelezen. Hij laat het product zien in plaats van het te beschrijven, wat bezoekers meteen duidelijk maakt.
- **T363 Donkerder kleuren voor leesbaarheid.** De grijze tekstkleur en de rode accentkleur zijn iets donkerder gemaakt zodat tekst en knoppen goed leesbaar zijn. Op de acht gefotografeerde schermen daalde te zwakke tekst van 71 naar 3 plekken. Dat maakt de app toegankelijker voor iedereen.

## 24. Wave 16c

*7 oktober*

- **T089 Tags, basiskampen en snapshot afgehandeld.** Volgens het besluit van de eigenaar zijn tags nu een filter in de reisstijlen, en basiskampen en snapshot zijn uit de build gehaald omdat geen scherm ze gebruikte. Zo is elk los veld nu óf nuttig óf verdwenen.
- **T093 Eén model voor betrouwbaarheidssignalen.** De drie signalen over hoe betrouwbaar de cijfers van een reis zijn kwamen uit drie verschillende plekken; ze komen nu uit één model. Daardoor spreken telling, prijswaarschuwing en bronvermelding elkaar niet meer tegen.
- **T101 Elke reis in korte en lange versie.** Elke curated reis bestaat nu in twee lengtes, de volle week en een korte versie van de drie of vier beste dagen met een eigen totaal. De pagina zegt welke versie hij prijst; een versie van 10 tot 14 dagen is niet gemaakt.
- **T124 Eerlijke pagina's voor ontbrekende routes.** Beroemde wandelingen die we niet uit open data kunnen bouwen hebben nu een eigen pagina met de eerlijke zin en een verwijzing naar de track, en microstaten zonder aanbod tonen een duidelijke lege staat met drie plekken over de grens. Zo staat er nooit meer een kale of misleidende leegte.
- **T188 Kosten en lengtefilters voor trips.** De lijst met kant en klare trips heeft nu twee filters: de lengte waarin je leest en een kostenband. Lengte sluit geen trips uit omdat elke trip in twee lengtes bestaat, en de stadsroutes bleven ongemoeid.
- **T326 Meldknop voor problemen op pagina's.** Op bestemmings-, route-, strand-, meer- en bergpagina's staat nu een rustige link Report a problem, en bij prijzen Report this price. Hij opent het bestaande feedbackformulier als een scherm over de pagina. Zo kunnen reizigers fouten melden waar ze ze zien.
- **T333 Foto en track delen vanaf routepagina.** Een wandelaar kan nu een foto of GPX-track kiezen, ziet wat Carta weghaalt, kiest de licentie en gaat akkoord met de voorwaarden. Het serverdeel bestaat nog niet. Dit legt het fundament voor bijdragen van reizigers.
- **T364 Kleine interfacekeuzes van de eigenaar.** Zeven van de acht kleine keuzes zijn gebouwd, zoals de Filters-knop op de telefoon, een donkere laag achter het Lifestyle-paneel en een betere foutmelding bij gedeelde trips. Het weghalen van de Stay-stap is niet gedaan omdat de aanname niet klopte. Het geeft de app een nettere, consistentere indruk.
- **T365 Moderatie- en beheerregels vastgelegd.** Elf beslissingen over beheer en moderatie zijn omgezet in één databasewijziging plus schermen, getest tegen een wegwerpdatabase. Hij is nog nergens live toegepast. Hierdoor zijn kapers van een beheerderssessie, eindeloze overrides en verwijderde gidsen veel beter afgedekt.
- **T366 Kleine opruimklussen van de eigenaar.** Vier kleine beslissingen zijn in code gezet: de wekelijkse run roept de Ryanair-dienregeling niet meer aan, de herberg-ankers staan aan, een dubbel taaknummer is hernoemd en foto's van Wikidata krijgen een afstandsuitzondering. Het houdt de datapijplijn schoon en goedkoop.
- **T367 Lege schermen nuttig gemaakt.** Alle 71 lege toestanden in de app doen nu wat het document zegt: ze noemen de plek, bieden één echte knop en tonen waar nodig de drie dichtstbijzijnde alternatieven over de grens. Voorheen klopte maar 33 van de 71. Reizigers staan zo nooit meer voor een doodlopend scherm.
- **T368 Prijsuitleg en tekstkeuzes toegepast.** Vijf keuzes zijn gebouwd: het nauwkeurigheidscijfer in de FAQ, de labels City of Country op de kostenbon, de reistijd per trein of bus in Explore, een installatietip voor de telefoon en de vertaalregel. Dat maakt prijzen begrijpelijker en de app makkelijker te installeren.

## 25. Wave V1

*7 oktober tot 8 oktober*

- **T370 Ontwerpbrief voor de app-schil.** Voor het raamwerk van de app (kop, navigatie, instellingen) is een uitgebreid ontwerpplan geschreven met een loop door het scherm, kritiek en elf voorstellen voor nieuwe regels. Er is geen code veranderd. De bouwgolven kunnen er nu direct mee aan de slag.
- **T371 Ontwerpbrief voor de landingspagina.** Voor de startpagina en de eerste kostenbon is een ontwerpbrief geschreven, met een inventaris van alles wat erop staat en acht voorstellen voor nieuwe regels. Er is geen code veranderd. Zo is helder wat de bezoeker eerst moet zien om Carta te vertrouwen.
- **T372 Ontwerpbrief voor Explore.** Explore kreeg een volledige ontwerpbrief met ongeveer 60 soorten knoppen en besturing beoordeeld, een score van 23 op 40 en een bouwlijst voor drie golven. Er is geen code veranderd. Zo weten de bouwers wat de reiziger eerst nodig heeft.
- **T373 Ontwerpbrief voor Destinations.** Voor het Destinations-tabblad is een brief geschreven met 66 onderdelen beoordeeld, bouwlijsten voor drie golven en tien voorstellen voor nieuwe regels. Er is geen code veranderd. Het helpt reizigers straks sneller een shortlist te maken.
- **T374 Ontwerpbrief voor de bestemmingspagina.** De bestemmingspagina is doorgelopen met Rome en twee dorpjes als voorbeeld, ongeveer 100 onderdelen beoordeeld (score 26 op 40) en er staat een plan klaar voor drie golven. Er is geen code veranderd. De pagina kan zo gericht beter worden.
- **T375 Ontwerpbrief voor wandel- en fietspagina's.** Voor de pagina's van routes, stranden, meren en bergen is een brief geschreven. Daarbij vond men dat een gedeelde fietstourlink nu de hele app laat crashen. Er is verder geen code veranderd, maar deze fout staat nu als dringend punt genoteerd.
- **T376 Ontwerpbrief voor de tripbibliotheek.** De tripbibliotheek, de weekpagina's en de stedenroutes kregen een ontwerpbrief met een score van 18 op 40 en drie bouwlijsten. Er is geen code veranderd. Zo is duidelijk wat er moet verbeteren voordat er gebouwd wordt.
- **T377 Ontwerpbrief voor de tripplanner.** De tripplanner is helemaal doorgelopen met 154 onderdelen beoordeeld en er zijn bouwlijsten en acht regelvoorstellen geschreven. Er is geen code veranderd. Het legt de basis voor een planner die minder tegenstrijdig voelt.
- **T378 Ontwerpbrief voor de dagplanner.** De dagplanner is doorgelicht met 198 besturingselementen en 36 toestanden, met score 24 op 40 en bouwlijsten voor drie golven. Er is geen code veranderd. Zo kan de dagplanner gericht opgeknapt worden.
- **T379 Ontwerpbrief voor het account.** Mijn trips, de accountpagina's, inloggen en het passenscherm zijn doorgelicht met 224 onderdelen beoordeeld, en er liggen bouwlijsten klaar. Er is geen code veranderd. Zo wordt het accountdeel straks consistenter en eenvoudiger.

## 26. Wave V2

*8 oktober*

- **T380 Ontwerprichting voor alle golven vastgelegd.** De tien briefs zijn samengevoegd tot één richtingsdocument, en alle 96 voorstellen voor nieuwe regels zijn beslist: 94 aangenomen, 2 afgewezen. Daardoor kunnen de bouwgolven doorwerken zonder iemand te hoeven vragen.

## 27. Wave V3

*8 oktober*

- **T381 Instellingenbalk in de app-schil.** Onder de kop staat nu een balk met vertrekplaats, data, gezelschap, Lifestyle, taal en valuta, zodat je direct ziet waarop elke prijs gebaseerd is en het in één tik kunt veranderen. Navigatie bestaat uit echte links. Prijzen worden zo begrijpelijker.
- **T382 Landingspagina rekent als de rest.** De invoer op de landingspagina is nu gedeeld met de rest van de app, dus het bedrag klopt tot op de cent met dat op de bestemmingspagina. De kostenbon is één gedeeld onderdeel geworden. Dat voorkomt dat prijzen elkaar tegenspreken.
- **T383 Explore: eerst invoer, dan aantal, dan prijzen.** Explore toont nu bovenaan de invoer, dan het live aantal plaatsen en daarna de geprijsde plekken. Dertien bouwpunten uit de brief zijn klaar. Zo zie je sneller welke bestemmingen binnen je budget passen.
- **T384 Destinations korter en overzichtelijker.** Op de telefoon staan zes categorieën als raster waar er eerder vier zichtbaar waren, en onder de zoekbalk staat nog maar één korte filtergroep. De rest zit in een Filters-scherm, ook op desktop. Het tabblad is rustiger en sneller te gebruiken.
- **T385 Bestemmingspagina in vragenvolgorde.** De bestemmingspagina volgt nu de volgorde van vragen van een reiziger, met kostenbon eerst, en nog maar drie acties in de kop in plaats van zeven. Zo vind je sneller wat het kost en hoe je er komt.
- **T386 Beslissing eerst op routepagina's.** De pagina's voor wandelroutes, fietsroutes, stranden, meren en bergen kregen een vaste volgorde met een nieuwe band met kernfeiten en één blok Before you go. Alle zes veranderden samen via een gedeeld skelet. Reizigers kunnen zo sneller beslissen.
- **T387 Trips-overzicht met prijzen en lengte.** De tien stijlkaarten tonen nu een vanaf-prijs en lengte, wandelen staat eerst en de filters zijn teruggebracht tot één rij. De reispagina opent met titel, foto en geschiktheidsstrook. Zo zie je meteen wat een week kost.
- **T388 Tripplanner toont overal hetzelfde bedrag.** Eén trip toonde eerder 586 euro in de wizard en 771 euro een scherm later. Nu rekent alles met één functie en toont elk scherm hetzelfde bedrag (circa 1.248 euro in het voorbeeld). Dat voorkomt verwarring over wat een reis echt kost.
- **T389 Dagplanner: eerst de dag, dan de rest.** Wie al dagplannen heeft opent nu op "Your day plans" met één hoofdknop, en de stappenbalk verschijnt alleen bij de vier vragen. Er is overal één duidelijke volgende stap. Dat maakt de dagplanner minder rommelig.
- **T390 Mijn trips opent op de volgende reis.** Mijn trips heeft een zichtbare titel, de tabs staan als Planned, Favorites, Visited en wie een komende reis heeft, landt direct op Planned. Tellers en knoppen zijn eenvoudiger gemaakt. Je ziet zo meteen de reis die eraan komt.

## 28. Wave V4

*8 oktober*

- **T391 Schil rustiger met beweging.** De accentkleur is uit de kop en de onderbalk gehaald, zodat het actieve tabblad een rustige donkere pil is, en bewegingen komen uit gedeelde instellingen. Het geheel oogt minder schreeuwerig. Zo gaat de aandacht naar de inhoud.
- **T392 Landingspagina reageert op invoer.** Als je personen, nachten of stay wijzigt, dimt elk bedrag even en komt het weer terug, zonder dat de hele lijst opnieuw wordt opgebouwd. Dat respecteert ook de instelling voor minder beweging. Je ziet direct wat je keuze doet.
- **T393 Explore reageert en toont meer prijzen.** Het kaartvoorbeeld is nu een lichte popover in plaats van een donker paneel over de foto, en Explore laat meer prijzen per scherm zien. Oude gebreken als bewegende schaduwen en foto-zoom zijn verwijderd. Het voelt rustiger en informatiever.
- **T394 Geen tekst meer op foto's in Destinations.** Vlaggen, namen en aantallen staan nu in een effen band onder de foto in plaats van op de foto, en twee donkere verlopen zijn verwijderd. Ook de kaarten van routes en stranden zijn aangepast. Tekst is zo overal leesbaar.
- **T395 Bestemmingspagina als één instrument.** De uitklapblokken zijn nu secties onder een dunne lijn zonder kader, de feitenstrook lijkt op een dienstregeling en alleen de kostenbon heeft nog een rand. Het is een rustiger en professioneler beeld.
- **T396 Outdoorpagina's tonen eerst de plek.** De hero-foto is beperkt tot 40 procent van de telefoon, zodat de hoofdknop in het eerste scherm zichtbaar is. Alle elf bouwpunten zijn klaar. Reizigers zien eerst de plek en kunnen sneller handelen.
- **T397 Trips reageren op de Lifestyle-schuif.** Bij het verschuiven van Lifestyle of lengte veranderen alle bedragen direct tot op de cent, met één korte dimming, en de oude telanimatie met foute tussenbedragen is weg. De gekozen dag is nu zichtbaar op de weekgrafiek. Dat voelt betrouwbaarder.
- **T398 Tripplanner: accent voor één ding.** Geselecteerde kaarten en chips hebben nu overal een donkere rand of vulling en de accentkleur wordt per scherm maar voor één ding gebruikt. Daarvoor stond hij op zeven plekken tegelijk. Dat maakt keuzes duidelijker.
- **T399 Dagplanner tekent de route.** Op de kaarten zijn plaatsen nu donker en blijven alleen de genummerde stops en de routelijn gekleurd, en bewegingen laten zien wat er veranderd is. Terracotta wordt per scherm nog maar voor één ding gebruikt. De route is zo makkelijker te lezen.
- **T400 Mijn trips zonder tekst op foto's.** Favorieten- en reiskaarten hebben alle woorden in een effen band onder de foto, met aftelling en kosten, en de donkere verlopen zijn weg. Zo is alles leesbaar en ziet het er opgeruimder uit.

## 29. Wave V5

*8 oktober tot 9 oktober*

- **T401 Schil toegankelijk voor toetsenbord en taal.** Alle vensters in de schil houden nu de focus vast, sluiten met Escape en verdwijnen met animatie. Er zijn ook fixes voor schermlezers, kleine schermen en andere talen. Zo werkt de app voor meer mensen.
- **T402 Landingspagina geschikt voor aanraking.** Alle keuzemenu's en datumvelden zijn nu echte aanraakdoelen van ongeveer 56 pixels hoog, in plaats van 28 tot 32, en een grijze pil in Safari is weg. Er is niets herontworpen. Bedienen op een telefoon is zo veel makkelijker.
- **T403 Explore houdt zijn beloftes op telefoon.** Explore is getest op iPhone 13, Pixel 5 en een kleine Android in drie talen, en de bedieningselementen zijn aangepast voor de telefoon. Het is een verfijning van de vorige golf. Daardoor werkt het ook onderweg goed.
- **T404 Destinations strakker aan de randen.** Filterknoppen en landkiezer zijn nu 6 pixel afgeronde knoppen die op aanraking 44 pixels groot worden, lange Duitse en Nederlandse labels worden niet meer afgekapt en moeilijkheidswoorden kloppen in alle talen. Zo wordt het tabblad toegankelijker.
- **T405 Bestemmingspagina veilig met de duim.** Op een touchscreen is elk bedieningselement van de bestemmingspagina nu 44 pixels groot, de laaglabels springen niet meer weg en het werkt in zes talen en bij fouten. Dit maakt de pagina betrouwbaar op een telefoon.
- **T406 Outdoorpagina's sneller op slecht bereik.** De hero van een fietsroute downloadde 15 MB en is nu 0,4 MB, en de tourfoto is teruggebracht van 1,6 naar 0,36 MB. Ook de rest is versterkt voor een telefoon met zwak signaal. Pagina's laden zo veel sneller.
- **T407 Reispagina robuust en afdrukbaar.** De reispagina past nu op een kleine telefoon in een lange taal, kan als plan geprint worden en laat geen verouderde geschiedenisstap achter. Knoppen hebben ook duidelijkere namen voor schermlezers. Dat maakt de pagina bruikbaarder.
- **T408 Tripplanner deels toegankelijk gemaakt.** Alleen een deel van de laatste ronde is gedaan: de wizard is nu een echt venster met focusbeheer en Escape, en geselecteerde kaarten tonen de toetsenbordfocus weer. Dat maakt de planner beter bruikbaar zonder muis.
- **T409 Dagplanner werkt met duim en toetsenbord.** Op aanraking zijn alle bedieningselementen minimaal 44 pixels, getest over tien weergaven op drie apparaten, en de planner werkt met toetsenbord, schermlezer en in andere talen. Zo is de dagplanner voor iedereen bruikbaar.
- **T410 Account op de randgevallen getest.** Op een telefoon halen alle bedieningselementen van Mijn trips, accountpagina's en inloggen nu 44 pixels. Twee kleine uitzonderingen bleven staan: de datumkiezer in het formulier en de kaartbron. Zo is het hele accountdeel handig met een duim.

## 30. Wave V6

*13 oktober*

- **T411 Consistentie over alle tien schermen.** Een volledige planningsreis is op vier apparaten doorlopen en de aansluitingen tussen schermen zijn rechtgezet, zoals 18 sluitknoppen die nu hetzelfde pictogram gebruiken. Geen stap was kapot, alleen inconsistent. Carta voelt nu als één product.

## 31. Live zetten en de laatste controles

*7 oktober tot 9 oktober*

- **T413 Blokken C, D en E live gezet.** Productie op Cloudflare Pages draait nu golven 6 tot 16c, inclusief de donkerder kleuren, en de database staat op migratie 051, behalve de Stripe-set. Zo staan vier dagen werk eindelijk live voor echte bezoekers.
- **T414 Ontwerpgolven eerst voor de telefoon.** De eigenaar vroeg om een strengere telefoonregel, dus alle 43 sessieprompts hebben nu een "Phone first"-blok met controles op iPhone 13, Pixel 5 en desktop met echte apparaatprofielen. Eerder werd alleen een versmald desktopvenster bekeken. Zo zijn telefoongebruikers echt meegenomen.
- **T415 Dagplan van de Carta-bot niet meer timeouten.** De Carta-bot gaf twee keer een foutmelding omdat het eerste Gemini-model na 45 seconden de hele aanvraag stillegde. Nu deelt de hele keten één tijdsbudget zodat snellere modellen het kunnen overnemen. Daardoor werkt het dagplan betrouwbaarder.
- **T416 Dagelijkse limiet van de bot bewezen.** De limiet is op productie getest door hem op 1 te zetten, waarna de app netjes meldde dat het gedeelde budget op was met opties om door te gaan. Daarna is het geheim verwijderd en staat de limiet weer op 200. Het bewijst dat de kostenbeveiliging echt werkt.
