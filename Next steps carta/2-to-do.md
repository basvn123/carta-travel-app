# To do

Wat Claude nog moet doen voor Carta, in één lijst. Stand: 2026-10-13. Jouw eigen stappen staan in `1-manual-steps.md`, wat al gedaan is in `3-waves.md`. `Execution/_ORDER.md` (de takenlijst, input voor de scripts) en `Execution/_OPEN.md` (het register) blijven bestaan.

- Een wave starten, in een Fable-sessie in de hoofdcheckout: "Run waves N to M from Next steps carta/2-to-do.md back to back. Skip any session whose gate is still open, note it in the wave log, and stop at the first GATED wave whose stage is not done. Ask me before any push." De orchestrator volgt regel 10 onderaan.
- Prompts opnieuw maken: `python Execution/_queue/waves_md.py` (schrijft ze tijdelijk naar `Execution/_WAVES.md`; wis dat bestand na de wave, dit document blijft de enige lijst). Eén prompt per taak printen: `python Execution/_queue/xmind_prompt.py <TASK>`.
- Na elke merge: `python Execution/_queue/dedupe_open.py`.

## Waar staan we

- Waves 1 tot 16c en design-waves V1 tot V5 zijn gemerged. Van V6 is T411 (consistentiepass) gemerged op 2026-10-13; T412 (release) is nog niet klaar: alleen een plan-commit (0cef42376) op branch `p10-v6-release`, worktrees `wt/T411` en `wt/T411-app` staan nog open, geen rapport, nog niet in `3-waves.md`.
- Productie (Cloudflare Pages, project `carta-app`) draait waves 6 tot 16c (T413, 2026-10-07). De V1 tot V5 design-build staat alleen op de preview https://design.carta-app.pages.dev.
- Database live tot en met migratie 051, behalve de Stripe-set (T413). Root `main` staat 189 commits voor op `origin/main`; niet gepusht.
- Wave 17 is open: stages 2 en 3 zijn klaar en T041-a en T081 zijn beantwoord. Waves 18 tot 21 wachten op blok 7, 8, 10 en 12 van `1-manual-steps.md`. Geen enkele taak uit waves 17 tot 21 of de data lane heeft een rapport.
- Overgeslagen en nog niet ingehaald: T178 (wacht op de route-track-wire, F6).
- Register: 463 open rijen met Owner `next task`. Hieronder staan ze bij een wave, in de data lane of per thema; 11 vallen weg als al opgelost.

## Volgende waves

### Wave V6, rest: T412

Gate: T411 gemerged (klaar). Draai T412 af in de bestaande worktrees en zet daarna T412 in `3-waves.md`.

| Task | Wat | Model |
|---|---|---|
| T412 | Release: volledige check, voor/na-galerij per apparaat, preview-deploy naar `--branch design` | sonnet |

Rijen die T412 raken: T411-l (`verify_prerender` heeft build:pages-uitvoer nodig).

### Wave 17: feitenopslag en grounding

Gate: open. Stages 2 en 3 zijn klaar (T413), pg_cron en pg_net staan aan, T041-a (10 op de Trip Pass, 30 op de Year Pass) en T081 (alerts per e-mail) zijn beantwoord. T147 vraagt de eigenaar daarna om de vault-secrets `refresh_facts_url` en `refresh_facts_key` en om migratie 049 te plakken (owner-rij).

| Task | Wat | Model |
|---|---|---|
| T147 | Volatiele feitenopslag plus verloopjob, migratie 049 | opus |
| T148 | Kleine live-grounding-toelage voor echt gebruikersspecifieke vragen | sonnet |
| T149 | Pipeline in fill mode over de bestaande 253 reizen | sonnet |
| T081 | Alerts bij stille fouten, dalende rijtellingen en distributiedrift | opus |

Registerrijen voor deze wave:
- T147: T041-e, T041-f, T300-n, T327-a, T327-d, T144-d, T146-g, T093-c; daarna T327-b (discovery-log voor suggest-city).
- T149: T143-a, T146-a, T151-c, T093-b; daarna T160-c (footer op Trips en Journey zodra er `figures` zijn).

### Wave 18: de Hetzner-box

Gate: blok 7 van `1-manual-steps.md` (stage 7.9): de CAX11-box draait de wekelijkse pipeline. T046-g (eerste volle run op de box) sluit met stap G6.

| Task | Wat | Model |
|---|---|---|
| T079 | Ingest-cadans vastleggen naar volatiliteit | sonnet |
| T080 | Deterministische catalogus-rollbacks | opus |
| T328 | Pipeline-vervolg voor het box-tijdperk | sonnet |

Registerrijen voor T328: T047-i, T047-j, T048-h, T054-h, T072-c, T072-d, T255-b, T269-g, T297-a.

### Wave 19: beelden op de CDN

Gate: blok 8 van `1-manual-steps.md` (stage 8.6, minstens voor stranden). T127 heeft ook een Flickr API-sleutel nodig (H0).

| Task | Wat | Model |
|---|---|---|
| T329 | Elk oppervlak op de CDN, daarna haalt de CSP Wikimedia weg | opus |
| T127 | Commons en Flickr met bekende camerarichting (sport 1) | opus |
| T128 | Mapillary voor het zicht langs een route (sport 2) | sonnet |
| T129 | Panoramax als langetermijnbron (sport 3) | sonnet |
| T131 | Render-pipeline voor terreinbeelden | opus |
| T134 | Elk beeld een bijschrift, galerij geordend als wandeling | sonnet |
| T136 | Vooraf gerenderde 3D-hero's op kaarten en de flyover | opus |
| T137 | De afgeleide lagen tekenen | opus |
| T138 | Hero's die bij de activiteit passen, juistheid boven schoonheid | opus |
| T139 | Ondergrens van 1600 px en juiste afgeleide breedtes | haiku |

Registerrijen voor deze wave:
- T329: T052-d, T052-f, T053-a, T075-c.
- T138: T126-a, T091-b, T230-e.
- T139: T230-a.
- T131 en T136 (3D en flyover): T180-b, T181-f, T183-j, T186-d.

### Wave 20: Stripe live en de route-track

Gate: blok 10 van `1-manual-steps.md` (stage 10, Stripe live) voor T210 en verder. T140, T334 en T178 pas na data-lane-stap F6 (route-track-wire) en blok 8.

| Task | Wat | Model |
|---|---|---|
| T140 | Drie tot vijf foto's van genoemde hoogtepunten per reis | opus |
| T334 | Route-track-vervolg na de data lane | sonnet |
| T178 | Kaartminiatuur per dag op de reisdagkaarten (overgeslagen in wave 14) | sonnet |
| T210 | Prijspagina en paywall-tekst | sonnet |
| T330 | Refunds in de marge- en OSS-cijfers, migratie 050 | opus |
| T228 | Betalingen-gate | opus |
| T229 | AI-kosten-gate | haiku |
| T234 | Affiliate klik- en conversietracking aanzetten | sonnet |
| T331 | Store- en PWA-vervolg | sonnet |

Registerrijen voor deze wave:
- T334: T177-b, T177-d, T206-f (T176-a is dezelfde rij, samengevoegd), T174-a, T397-a.
- T140: T162-a.
- T210: T202-b.
- T330: T217-b.
- T331: T216-c, T246-c.

## Data lane

Nooit binnen een wave. Eén sessie tegelijk, door de eigenaar gestart, niets anders draait op de laptop (`Get-Process python`). Haal alleen de archiefklassen op die de run nodig heeft: `python pipeline/archive/push.py --pull --only <class>`. Zin voor de eigenaar: "Data lane: run F<n> from Next steps carta/1-manual-steps.md." Voor een taak uit de zware tabel: prompt via `xmind_prompt.py <TASK>` plus de regel 'Data lane: you may run the pipeline for this task only, in the main checkout, after the owner confirms the inputs are pulled; nothing else runs meanwhile.'

### Lichte lane (laptop)

| Stap | Wat | Registerrijen |
|---|---|---|
| F1 | Journeys-wire herbouwen met `build_wire.py` en committen | T094-a, T376-c; daarna code: T143-b, T170-e |
| F2 | Coverage opnieuw draaien (`pipeline/regions/coverage.py`), CI `--require` | (owner-rijen T111, T112-a) |
| F3 | Ratings opnieuw scoren met de nieuwe curve | T252-b; daarna T321-b, T286-c |
| F4 | Trails-lab: scenic refresh, attributes en export, famous registry rescan, Waymarked-telling | T107-a, T107-c, T108-g, T113-a, T286-b, T311-h, T313-b |
| F5 | Stayprijzen Genève verversen | (owner-rijen T311-a, T311-b) |
| F6 | Route-track-wire via lokale Valhalla en BRouter (T177-b) | opent T178 en T334 |
| F7 | Buren tussen lagen: `pipeline/joins/neighbours.py`, dan wire herbouwen | (owner-rij T367-a) |
| F9 | Schrijfpass: weer-fallbacks, aankomst en vertrek, afdaling, fietsondergrond, boekvensters, betrouwbaarheidsnoten | (owner-rijen T170-a, T170-b, T174-b, T174-c, T169-a, T154-c, T151-g, T103-a) |

Losse data-rijen voor deze lane: T375-c (lus-vlag trail 20050), T386-e (kabelbaan Hoher Dachstein), T386-h (twee wire-checks in verify_cycling), T406-f (fietsrecords exporteren het originele Commons-bestand), T179-c (`view.peaks` 0 op 188 bergen, viewshed controleren), T181-a, T181-b, T181-d, T181-e, T181-g, T181-i (zeetemperatuur, golfhoogte, GLOBathy, horizonsilhouet, ondergrond per segment en per klasse).

### Zware lane (na blok 7, op de box of een CAX41)

| Volgorde | Task | Wat | Model |
|---|---|---|---|
| 1 | T104 | `type=superroute` lezen (samen met T105 in één run) | opus |
| 2 | T105 | Groeperen op `cycle_network` (ook T183-d) | sonnet |
| 3 | T120 | EuroVelo inlezen | sonnet |
| 4 | T123 | Ouderpagina's voor etappefamilies | sonnet |
| 5 | T106 | Named-ways-afleiding overal (verifiëren) | sonnet |
| 6 | T110 | HydroLAKES en GLOBathy | sonnet |
| 7 | T114 | Zwitserland | sonnet |
| 8 | T115 | Noorwegen | sonnet |
| 9 | T116 | Frankrijk | sonnet |
| 10 | T117 | Spanje | sonnet |
| 11 | T118 | Verenigd Koninkrijk | sonnet |
| 12 | T119 | BE, DE, IT, FI, SE, NL | opus |
| 13 | T122 | Drie entiteiten, doel ongeveer 5.000 toppen | fable |
| 14 | T133 | Het uitkijkpunt kiezen uit data | sonnet |
| 15 | T109 | Stranden en meren op EEA-zwemwater | opus |
| 16 | T125 | Sorteren op bekendheid, geen cap per land | sonnet |

Rij die vóór deze lane op de box moet: T324-b (Windows-only trailslab-helpers).

### Betaalde Gemini-runs (Claude draait, eigenaar keurt elke cap goed)

Volgorde en details in blok 9 van `1-manual-steps.md`. Zin: "Run paid step I<n> from Next steps carta/1-manual-steps.md with a cap of USD <x>."

| Stap | Wat |
|---|---|
| I1 | `GEMINI_API_KEY` als repo-secret, alleen als de golden set vanuit CI draait |
| I2 | Eén gemeten generatorrun op drie tot vijf briefs met de critic |
| I3 | Eerste golden baseline, ongeveer 40 calls |
| I4 | Ongeveer 30 grounded calls om de zoek-fan-out te meten |
| I5 | Backfill van paklijst en risico's, daarna T150-c (sidecars in de reizen) en T150-e (grounded critic beslissen) |
| I6 | Herschrijven van 236 reizen onder de woordcap (T152-b, als laatste) |
| I7 | Expansiebatches na het lezen van de 60 briefs |

## Losse open punten zonder wave

Alle open `next task`-rijen die geen wave of data-lane-stap hebben. Samengevoegde dubbels staan op één regel met alle ids.

### Design: shell en gedeelde onderdelen

- T381-a: instellingenregel laat op een telefoon herkomst en datums vallen; overflow-regel in DIRECTION schrijven.
- T381-b: Destinations tekent nog een eigen LifestyleButton naast de instellingenregel; die weg (Explore-helft is klaar).
- T391-d: accent-regels die de shell overschrijft staan nog in `24-destination-workspace.css` en `16-auth.css`; verplaatsen of wissen.
- T392-a en T395-a: gedeeld element van landing naar bestemmingsontvangst; `openShared()` moet een niet-afbeelding kunnen nemen; FirstRunReceipt mist kostenbalk, settleFigure en InfoDot.
- T393-b: Explore-chips gaan direct weg; FilterChips (shell) moet een vertrekkende chip vasthouden.
- T393-c: op- en neerbeweging van PlacesFilterSheet en de Lifestyle-dialoog bouwen (DIRECTION 2.3).
- T401-d: PlacesFilterSheet naar `useFocusTrap` en `useDialogExit` zetten.
- T386-d en T406-d: Report a problem-sheet zet Send onder de vouw als het toetsenbord open is (dubbel, samengevoegd).
- T402-d: bottom nav over een gefocust datumveld bij krimpende viewport; nav verbergen bij focus.
- T407-c: Vorige, Volgende en Alles tonen herhalen zich per deck; naam per deck of dag geven.
- T392-e en T394-c: Fraunces oogt zwaarder in WebKit; gewichtsbereik en font-synthesis controleren (dubbel).
- T411-i: kleine consistentiepunten: terugknoppen die hun lijst noemen, navlabels op 10,5 px, focus-offset van de instellingenregel, installatietip voor een gast.
- T162-b: dagkaarten `jday-1` tot `jday-7` hebben geen link vanuit lijst of rail.
- T185-b: sluiten van een bestemmings- of reispagina draait de foto-morph niet terug.
- T180-e: trail-, fiets-, strand-, meer- en bergkaarten roepen `openShared` niet aan.
- T180-f: HeroPreload laadt 860 px terwijl de hero volle breedte is.
- T184-b: klikbare divs zonder rol of tabindex krijgen geen drukfeedback.
- T184-c: dubbele `:active`-compressie op bottom nav, plusknop, kostenactie en gidskaarten weghalen.

### Design: InfoDot en glossary

- T383-b, T390-i en T099-e: InfoDot voor "national" en de rolwoorden op kaarten en in de ontvangst (dubbel, samengevoegd).
- T193-a: InfoDots op Explore- en plannertermen (tiergrenzen, est., spend-stijlen).
- T156-a: InfoDot op de trail-, strand-, meer- en fietspagina's.
- T158-a: zin over de steilste helling op de trailpagina via `trailStory.js`.
- T158-b: tabelregels voor zwemseizoen, golfhoogte en zwemwaterseizoenen zodra de wire ze heeft.

### Design: landing en eerste gebruik

- T382-b, T392-b, T402-b en T411-c: primaire knop valt onder de bottom nav op een telefoon (landing, vertalingen, dagplanner); richtingkeuze nodig (samengevoegd).
- T382-a: prijslijst op de landing opent steden met een knop; link maken zodra bestemmingen een URL hebben.
- T382-i: telt een op de landing gekozen lengte als gekozen datums? Productkeuze in de shell.
- T370-d: People, Nights en Stay op de landing schrijven niet naar de globale instellingen.
- T370-f: landing zegt 3.868 plaatsen, Explore 3.855; één bron kiezen.
- T402-a en T209-c: landing is client-rendered; hero en coverage in de prerender zetten (samengevoegd).
- T402-c: zin voor geen demostad heeft geen browsercheck; testhook of fixture.
- T405-a: FirstRunReceipt herhaalt de plaatsnaam als h2 en heeft 28 px-selects.
- T099-a: Finish-stap van de planner toont nog een eigen ontvangst.
- T099-b, T188-d en T411-f: reispagina en kaarten tonen de geschreven range naast de berekende ontvangst; één cijfer of als schatting markeren (samengevoegd).
- T100-a: geen groepsgrootte naast de Lifestyle-slider op de reispagina.
- T100-b: groepsgrootte wordt niet onthouden tussen sessies; beslissen.
- T100-c: correctie op het T100-rapport (cijfer was voor 5 personen, niet 2).
- T194-d: `docs/ONBOARDING_AND_EMPTY_STATES.md` gelijk trekken met de homepage-keuze.

### Design: Explore

- T383-d: telefoonkaart houdt het raster onder de kaart in plaats van een bottom drawer; regel en bouw.
- T383-f: kaartteller en prijslabels lopen uiteen; één set.
- T403-a: liggende telefoon toont de desktop-split met de kaart onder de vouw.
- T403-b: dode `.xgrid-count`-regel en de spatie in "3, 855" in PlacesFilterSheet.
- T393-h: oude Explore-regels in `24-` en `25-` verplaatsen en wissen.
- T372-b: Lifestyle-paneel vanuit Explore: twee accentselecties, letter-x, laatste rij onder de nav, geen afweegzin.
- T372-c en T376-d: vergelijkbak voor plaatsen en voor weken heeft geen regel en geen component (samengevoegd).
- T394-h: verify_country_cards faalt 4 van 28 op Explores gidskaarten (de keyboard-helft is opgelost).

### Design: Destinations en bestemmingspagina

- T384-b: eerlijke coverage-regel onder elke sectiekop; wacht op T373-e.
- T384-c: regiopagina's hebben geen ingang vanuit de Destinations-tab.
- T384-f: TRIPS-LAYER-regels staan nog in `24-destination-workspace.css`.
- T404-c: snijchips stapelen op een telefoon; kortere labels of twee kolommen.
- T404-d: LCP-element in de Destinations-flow is een alinea (middots zijn al weg).
- T404-e: verzamelrij van T394-a, T391-a en T396-d; zie die regels.
- T394-a en T386-a: kostenregel op outdoorkaarten en -pagina's; App moet de computeCosts-map doorgeven (samengevoegd).
- T373-g: twee fiets-iconen tonen een loods en een infobord.
- T373-h: zwemwaterchips tellen 237, de sheet zegt 240.
- T385-a en T389-a: één kostenwaarheid op bestemmings- en dagpagina; wacht op owner-keuze T374-d en T378-d.
- T385-b: SectionRail krijgt een slot achteraan voor Expand all.
- T385-c: maandblok staat 2,6 schermen diep op een iPhone 13.
- T385-d: ClimateStrip naar de gedeelde MonthStrip.
- T385-h: rest van de kleine tapdoelen en contrast op de bestemmingspagina.
- T385-i: kleine tekst- en cijferpunten (deels gedaan).
- T395-c en T405-g: binnen 20 km-pins in laaghue en kaartattributie onder 44 px; beslissen met outdoor (samengevoegd).
- T413-c: 'Plan a trip here' en 'Plan a day here' worden afgekapt op 380 px.
- T160-e: footerdatum is de auditdatum, geen controle per cijfer; regiopagina heeft geen footer (NUTS2 tegen NUTS3).
- T159-b: blok "niet voor" op de stads-DestinationPage en vertalingen.
- T167-a: bestemmings-, meer- en bergpagina tonen tips nog als lijst; FlashDeck hergebruiken.
- T374-c: geen autovrije-toegangsfeit in het dossier (pipeline).

### Design: outdoorpagina's

- T406-b: liggend staat de primaire knop niet op het eerste scherm.
- T406-c en T396-f: hero naast de kop vanaf 1024 px; één grid voor zes pagina's en de bestemmingspagina.
- T386-f: na T384 en T386 een `#tour=`-link openen en de tourscreenshots maken.
- T386-g: resten: fotostrips nog `role=tab`, groene vlakken, één titelgrootte, sectierail, fietsfamilie, dagprofiel per tour.
- T396-d: drie browse-checks in de outdoor-harnassen falen al op de basis.
- T174-e: fietskaartband (routeglyph, ondergrondstrip, hoogteprofiel) niet gebouwd.
- T180-c: "Take it with you" heeft geen checklist en geen GPX op strand, meer, berg en fietstour.
- T180-k: goedkopere uitgang werkt niet op fietspagina's (geen basisstad).
- T182-d: windblootstelling voor noordelijke stranden heeft een windklimatologie nodig.
- T182-f: klimslots en windroos ook op berg- en strandkaarten.
- T183-e: slechte eerste foto's in Band 1 (Tragumna, Hoverla, Monteluco) in de beeld-QA oplossen.
- T183-g: railbergen "zonder auto" heeft 4 van 208; toegangsafleiding verbreden.
- T183-h en T165-a: sticky sectierail op sectieschermen en op TripPage (samengevoegd).
- T183-i: filterrij op sectieschermen: chips 27 px, sort 32 px, twee primaire knoppen.
- T287-a: strandpagina heeft geen maanddata voor een MonthStrip.
- T287-b: meerstrip en seizoenregel verschillen een maand.
- T286-d: klimlezers buiten T286 tonen nog de opgeslagen stijging.
- T375-d: trails- en fietswires hebben geen ov-halte of frequentie (pipeline).

### Design: trips en reispagina

- T390-c en T391-a: een gesterde reis in Mijn reizen opent de week niet (samengevoegd).
- T387-b en T397-h: ster op de reiskaart; Destinations moet favProps doorgeven (accounthelft is klaar).
- T387-d: eerste reiskaart staat op 448 px in plaats van 360 px.
- T387-h: oude composed-pagina-regels in `24-destination-workspace.css` zijn dood.
- T387-j: ontvangst toont centen, kaart afgeronde euro's.
- T387-l: paklabels uit vrije tekst lezen ruw; `{country}` blijft Engels.
- T397-i: DIRECTION en carta-design: één regel voor foto's in een daytrack-kaart.
- T401-e: JourneyPage kan MutationObserver en pickDay vervangen door DayTrack `onSelect`.
- T407-e: InfoDot-Escape en toetsenbord-met-veld op de reispagina alleen in code bevestigd.
- T411-g: trailcijfers op twee manieren opgemaakt; één formatter.
- T089-c: tags op de reispagina openen de Trips-lijst niet.
- T094-c: lege combinatie land en stijl biedt geen drie reizen in de buurt.
- T101-c: korte versie schaalt de reiskosten lineair met de dagen.
- T101-d: goedkopere uitgangen, opgeslagen reizen, PDF en planner-overdracht volgen de gekozen lengte niet.
- T101-e: data-sheet, slapen en logistiek tonen in de korte versie de hele week.
- T188-a: samengestelde stadsroutes hebben geen kostenband.
- T188-b: stijlkaarten tellen alle reizen, niet de gefilterde.
- T188-e: `formatRange` schrijft het Engelse "to" in elke taal.
- T167-b: verify_journeys moet drie flash-decks en de 35-woordengrens checken.
- T167-c en T173-g: Prose-alinea binnen een `p` op de reispagina (dubbel).
- T164-b: 60-woordenregel alleen op de reispagina toegepast.
- T170-d: winter- en waterweken: dagkaarten labelen naar de nodige omstandigheid.
- T171-b: maar 81 van 253 hooks bevatten een getal.
- T171-c: uitgangen kunnen niet per regio matchen; regiosleutel in `build_wire.py`.
- T173-a: slider beweegt de geschreven range, geen gemeten prijs; wacht op T095.
- T173-b: sliderstops gelijk verdeeld; per slaapniveau spreiden.
- T173-c: maaltijdregel volgt de eetstijl niet.
- T173-d: langverblijfkorting pas met lange reisversies.
- T173-f: op 42 reizen tellen de lage ontvangstregels niet op tot het totaal.
- T175-b, T175-c en T175-d: slots voor afgelegenheid, wind per maand, ov-score en voedselindex ontbreken.
- T175-e: data-sheet toont ruwe `**`-markers.
- T169-b: 336 boekclausules zonder herkenbare termijn.
- T360-a: stijlcel pakt soms een plaatsnaam; 30 reizen tonen "Mixed".
- T361-a, T361-b en T361-c: boektekst ontbreekt op 19 reizen, 28 zonder datumstap, enkele bronnen zijn gidsen van derden.
- T102-a, T102-c en T102-d: trein-alternatief: echte reistijden via Transitous, start bij thuis, ook in de planner.
- T224-d en T224-e: reislengtepagina's: dagenpaden naar gefilterd Explore, korte versies op 3- en 4-dagenpagina's.
- T225-c: weekontvangsten alleen voor zevendaagse reizen.

### Design: tripplanner

- T411-a: "Plan a trip here" verliest stad en datums in de wizard.
- T411-h: vaste chrome van de wizard neemt 48 procent van een Pixel 5.
- T411-d: gast-opslaan: zeg wat er met de open reis gebeurt en tel alleen wat zichtbaar is.
- T408-b: koppenvolgorde in de geplande weergave en pijltjestoetsen voor quiz en maandchips.
- T408-c en T398-d: schaduwen buiten tokens, 999 px-radii, tekst onder 12 px en dode regels (samengevoegd).
- T408-d en T398-f: de en nl screenshots op 360 px en de fotoverhouding van de reiskaart (samengevoegd).
- T408-e: wizard-dialoog niet in de browser getest; volledige keyboard-, booked_route- en handoffs-run.
- T398-c en T400-a: gedeeld element naar de geplande weergave en vanaf Mijn reizen (samengevoegd).
- T388-c: wizardregels uit 24, 17, 18 en 20 naar `67-v6-tripplanner.css`.
- T388-h: verify_handoffs "Back to trip" faalt; oorzaak in de overdracht van de planner.
- T401-g: `tripKml()` schrijft Engelse woorden in de KML.
- T190-d: landkiezerkaart in de wizard is alleen voor een muis.
- T283-c: suggestNextStops geeft nog +1,2 voor een bevroren vliegprijs; beslissen onder de geen-vliegprijzenregel.
- T189-b: `friendsFailed` niet aangesloten (plannerhelft is klaar).

### Design: dagplanner

- T409-b: werkruimtekaart zonder foutregel en zonder skeleton tijdens het laden van 19 MB.
- T409-e: pins onder het bottom sheet op een telefoon.
- T409-f: dode CSS in `13-day-planner.css` en `20-day-planner-flow.css`.
- T389-i en T409-g: tweede forkkaart onder de bottom bar (samengevoegd).
- T409-d: dagtitels, lokale tips en wandelnotities zijn Engels in de data.
- T409-i: trip-planner-case in verify_keyboard is wisselvallig.
- T409-j: drie dode sleutels in `en.js` wissen.
- T409-k: vier verboden woorden in `en.js` herschrijven in zes talen.
- T389-b: benen en aankomsttijden; wacht op owner T378-e.
- T389-f en T388-e: dode `.day-flow-help` en daystijlen in tripplanner-bladen (samengevoegd).
- T389-g: Lifestyle-opener op de dagplanner wacht op de dagkost.
- T389-h: vier dagharnas-delen hebben Supabase-env of plan-day nodig.
- T399-a: inkt-pins van de dagplanner in de basisregels opnemen.
- T283-b: DayIdeasStep regel 348 gebruikt een middot.
- T378-c: POI-catalogus heeft geen openingstijden of entreeprijzen (pipeline).

### Design: account en Mijn reizen

- T410-h: actieknoppen van de volgende-reis-kaart onder de nav op een iPhone.
- T410-i: Admin Site-tab: één primaire knop vraagt een andere opbouw van ConfigManager.
- T410-j: verify_admin_panel nog twee keer draaien op een rustige machine.
- T400-b: recordkaart in de inktschaal; TripMap moet een vulkleur-prop krijgen.
- T390-f: vriendenregister naar de Friends-spoke.
- T326-a: melding van een ontbrekend item draagt geen regio of redencode.
- T326-d: drie admin-strings alleen in het Engels.
- T068-h: auteursnaam in de galerij heeft geen eigen meldpad.

### CSS-schuld en design-lint

- T411-j: oude stijlschuld per eigenaar: ongeveer 230 vaste duren, 347 afwijkende radii, 664 maten onder 12 px en meer.
- T191-a: 129 losse schaduwen, 24 gradients en ongeveer 300 rgba-kleuren op tokens zetten.
- T191-b: domeinen staan verspreid over meerdere stijlbestanden.
- T191-c: domeinkleurtokens in `01-tokens.css`: welke gaan op in het merkpalet.
- T335-a, T166-f en T193-e: 89 knopfamilies naar de gedeelde Button (samengevoegd).
- T363-a: tekst op `--accent-bg` blijft onder AA.
- T363-b en T364-b: oude accent- en mute-waarden en 17 hex-regels in PDF- en exportbestanden; tokens voor drie Explore-tierkleuren (samengevoegd).
- T364-c: dode `.dual-range`-CSS en checks.
- T287-c, T181-k en T406-e: dode `.lpage-month*`-, `.bpage-scorebtn`- en `.bpage-scorehint`-regels (samengevoegd).
- T179-b: Duitse waardenaam "Höherer Gipfel" wordt afgekapt.
- T179-e: kaarthook is chiplabels, geen zin.
- T179-f: overschreven kaartregels in 23 en 24 wissen.
- T196-a, T388-f en T400-f: design-lint-baseline opschonen met `--update-baseline` (samengevoegd).
- T198-b: Segoe UI-stack in `tripExport.js` naar type-tokens.
- T199-d: Inter Tight uit de `--ui`-fallback halen.
- T186-f: 167 losse cijfers zonder tabular-nums.
- T186-g: 431 keer `--ink-mute` buiten 12 tot 14 px.
- T212-e: CACHE_VERSION in `public/sw.js` ophogen.
- T380-c: design-lint-regel voor vaste duren in v6-bladen.
- T325-a en T325-b: carta-design-skill en `assets/tokens.css` opnieuw naast `:root` leggen na T191; de 378 hex-literals blijven bij T195-b (samengevoegd).

### Toegankelijkheid en prestaties

- T200-a, T200-d en T231-b: Core Web Vitals falen op de telefoon (LCP, INP); opnieuw meten na T271 en de beeldladder (samengevoegd).
- T200-b: CLS 0,309 op de bestemmingspagina.
- T200-c en T199-c: INP van de prijskaart op de telefoon (samengevoegd).
- T199-a: INP van de reislengteslider.
- T199-f: React 19 pas opnieuw bekijken na T199-a.
- T271-a: lite-record mist sights en zwemwater in kaart en tooltip.
- T271-d: rank-tier tot 16 MB bij 25.000 bestemmingen.
- T271-e: CLS van de reispagina iets gestegen.
- T401-i: INP en LCP opnieuw meten na de design-waves.
- T231-e: verzoekkosten van ingelogde en AI-sessies meten.
- T190-c: verify_keyboard bereikt geen toestanden met een gebouwd plan of de outdoorpagina's.
- T190-g en T186-h: verify_keyboard en verify_quality_floor in de launch-gate (samengevoegd).
- T183-k: verify_quality_floor moet de vijf sectieschermen openen.
- T411-k: quality floor moet een `::after`-trefvlak lezen.
- T189-a: dertien formulierfouten tonen `err.message`.

### Tests en harnassen

- T312-a en T194-c: verify_tab_switching faalt 4 van 69; verify_account_panel stopt bij de profielkaart (samengevoegd).
- T365-g en T368-c: verify_saved verwacht een accent-tab, maar die is ink-fill (samengevoegd).
- T367-e: verify_layer_errors en verify_places_search falen op master.
- T367-b: lege staten die headless niet bereikt worden.
- T411-l: harnassen met een vaste previewpoort; `CARTA_PORT` geven.
- T411-m: bestaande harnasfouten in verify_day_workspace en verify_trip_landing.
- T387-k en T398-e: harnassen laten hun vite preview draaien op Windows (samengevoegd).
- T381-h: PlacesFilterSheet heeft geen harnas.
- T281-c: verify_csp tegen een verse dist draaien.
- T200-e: `baseline_vitals.mjs` krijgt een BASE-optie en de juiste interactie.
- T200-f: CALL_SITES van verify_no_runtime_fares aanvullen.
- T142-c: harnas dat dode webcams vindt.
- T159-a en T160-d: niet-voor-blok en footers op elke detailpagina in de browser bekijken.
- T166-e: gevulde primaire knoppen niet gemeten op fietspagina's, account en latere plannerstappen.
- T405-f: verify_stay_tiers hangt op Explore (`.lifestyle-btn` niet gevonden); de keyboard-helft is opgelost.
- T193-d: quality-floor-audit staat buiten de repo en bereikt geen botresultaat.
- T164-c: geen check op blokken boven 60 woorden.
- T162-d: Vite-cache gedeeld tussen worktrees; elke sessie een eigen cacheDir.
- T372-g: impeccable context vindt PRODUCT.md niet in de app-repo; de bestanden direct lezen.
- T089-d: 30 trip-pipeline-tests falen al op main.
- T327-e: `pytest tests` faalt in één proces door botsende modulenamen.
- T323-d: `test_edge_exec.mjs` één keer onder echte Deno draaien.

### CI

- T143-f, T154-e en T155-f: generator-, review-queue- en expansie-selftests in `trip-validator.yml` (samengevoegd).
- T380-d: `check_ownership.mjs` in de gate of `npm run ci`.
- T310-b: data-licences-workflow draait `--check-app` niet.
- T153-c: `data/generated/` in `.gitignore` (taak met uitzondering op regel 4).
- T221-g: `dist-prerender/` in `.gitignore`.

### Trip-pipeline en reisdata

- T090-b, T151-b en T155-e: seed-SQL en `trips.flat.csv` opnieuw maken (samengevoegd).
- T090-c: validatierapport opnieuw maken op main.
- T090-d: twee basecamp-pins lijken fout (Baqueira, Moravië).
- T090-e: `derive()` moet `geocode_trip` aanroepen.
- T090-f: dorpen onder 500 inwoners via de landbestanden laten checken.
- T093-d: tonen hoeveel cijfers achtergehouden zijn; productkeuze.
- T093-e: validatierapporten niet opnieuw gemaakt (geen cities500).
- T094-b en T146-d: echte `reviewedAt` per reis; vraagt het K1-schema (samengevoegd).
- T143-c: `stripDashes` gelijk trekken met `build_wire.py`.
- T143-e en T150-b: 23 pak-icoonsleutels bevestigen (samengevoegd).
- T143-i: v2.1-types in `schema/types.ts`.
- T144-c: `export_sql.py` v2.1-objecten als jsonb.
- T146-b: achtergehouden hotelprijs moet ook `priceUnit` nullen.
- T146-e: typeSpecific-afstand en hoogte op de pagina en in SHOWN_FIGURE.
- T151-d: k2-numbers-prompt moet de slots per reistype uitleggen.
- T151-e: losse naalden in `normalize.py` of altijd `fill_type_specific.py` erna.
- T151-f: integer-grenscheck in `validate.py`.
- T151-h: basis van hoogtecijfers op de wire; beslissen.
- T152-c: woordcap ook voor hook, logistiek en risico's.
- T153-e: stamp moet `generation_gate.py` dekken.
- T155-d: `add_perishable_flags` in `generate()`.
- T168-a: pakgrid-backfill voor 153 lege reizen.
- T332-a: twee fouten bij ba-nature-escape-una-national-park.
- T332-b: README noemt nog 606 fouten.
- T366-a: P18-uitzondering in `vision_prompt.py` heeft nog geen aanroeper.

### Pipeline en data (overig)

- T311-c: 124 knooppuntnetwerk-wandelingen uitsluiten in `curate.py`.
- T311-f: docs beschrijven nog de oude fare-harvesters.
- T322-c: `coverage_report.py` telt grensoverschrijdende relaties per land.
- T142-a: welke foto-webcam.eu-camera's bij welke bestemming horen.
- T103-b: 563 bestemmingen zonder stadscoördinaat voor de prijsrij.
- T224-c: 383 bedrijen lenen de stadslistings; tekst klopt dan niet.
- T224-f: prerender-bestemmingen dragen geen iso2.
- T091-c: credit-gate geldt niet voor reishero's.
- T230-d: datastructuur voor zichtbeeld of terreinrender per rij.
- T227-a: Commons-credit per POI-thumbnail ontbreekt.
- T212-c: kaarttypes land, regio, ouderroute, fietsroute, reis en journey.
- T212-d: OG-kaart opnieuw maken uit de productiewire vóór de launch.

### SEO en prerender

- T207-g: `sitemap.xml` heeft in productie 1 URL tot T221-a (owner).
- T221-c en T225-d: homepage linkt geen land; daarna de wortels van de link-diepte-meting verplaatsen (samengevoegd).
- T221-e en T225-b: ruim 1.000 pagina's met minder dan zes interne links; drie uitwegen bouwen (samengevoegd).
- T221-i: prerender opnieuw bouwen vanaf de productiewire vóór T221-a.
- T225-a: vijf bestemmingen onbereikbaar vanaf landpagina's.
- T222-b en T368-a: hreflang en niet-Engelse paginachrome; `build.mjs --lang` (samengevoegd).
- T222-e: 894 listed-rijen halen de paginavloer maar hebben geen pagina.
- T223-b: `/routes/{ref}` voor grensoverschrijdende families.
- T223-c: `VITE_PATH_URLS=1` zodra de prerender HTML serveert.
- T223-d: deellinks naar padbouwers.
- T223-e: slugstap moet `reservedCollisions` aanroepen.
- T226-c: maandelijkse datanotities en Atom-feed.
- T124-b: stubpagina zonder eigen URL en zoekindex.
- T124-c: stubs alleen onder de wandellijst.

### Betalingen, admin en e-mail

- T032-d en T314-a: refund-exposure zichtbaar maken met `admin_refund_exposure()` (migratie) (samengevoegd).
- T284-b: kaart voor app-crashes in het admin-overzicht.
- T284-c: knop voor `admin_adjust_expiry` in UserDetail.
- T235-f: alert op Gemini-fallback en `ai_cap_events`.
- T235-g: dedupe van herhaalde monitoralerts.
- T213-d en T213-f: e-mail E1 tot E8 bouwen en de taal van de ontvanger (na owner T213-a, T213-b, T213-e).
- T365-d: DSA-ontvangst en besluit per e-mail, na J6.

### AI en Edge Functions

- T415-a: suggest-city en parse-booking krijgen het ketenbudget van plan-day.
- T415-b: tijd-van-de-dag-woorden uit de stopbeschrijvingen houden.
- T416-a: tekst `ai.quotaGlobal` noemt Carta twee keer; in zes talen herstellen.
- T323-c: EUR 0,05 per grounded unit in `pricing.js` en de unit economics herschrijven na T323-b.

### Privacy, juridisch en moderatie

- T319-b: prune voor `paywall_event` (180 dagen) in een migratie.
- T319-c: prune voor `ai_plan_cache`.
- T333-a: migratie voor het uploadpad (na 051).
- T333-c: app-helft: uploads tonen, melden, admin-review.
- T333-d: uploadknop ook op strand-, meer-, berg- en fietspagina's en de stub.
- T333-e en T365-e: privacybeleid over uploads, bewaartermijnen van meldingen en pass_grants (samengevoegd).
- T206-b: licentiekeuze voor uploads; open tot het uploadpad werkt.
- T124-e: `begin_upload` met een niet-numeriek id controleren.
- T124-d: microstatentabel in het onboardingdocument (San Marino).

### Infra, R2 en build

- T413-a: `push-data.mjs --prune` wist `data/status.json`; eerst repareren.
- T221-h en T413-b: `api.open-meteo.com` ontbreekt in de CSP connect-src (samengevoegd).
- T233-d: `pmtiles`-pakket toevoegen en registreren (afhankelijkheidswijziging).
- T235-d: cdn-host in `targets.json` aanzetten zodra de CDN resolvet.
- T299-a: workers op x86 als CAX niet leverbaar is.
- T299-b: kostenlabel `hetzner_cax11` corrigeren na de eerste factuur.
- T317-c: commentaar in `verify_data_host.mjs` klopt niet meer.
- T324-b: Windows-only helpers vóór de data lane op de box.
- T310-c: ledger-sectie voor attribution.js afbouwen.

### Docs

- T082-b: RLS-test past `schema.sql` niet toe.
- T082-c: SCHEMA.md-contracttabel aanvullen.
- T082-d: contract ook op tweede niveau.
- T082-e: Supabase-stub-SQL in één gedeelde module.
- T097-a en T097-b: nauwkeurigheidscijfer bijwerken na een nieuwe benchmark; bed- en weekcijfer toevoegen (na T096-a).
- T098-c: herkomstniveau bij de dagprijs in de kop en de ontvangst.
- T367-c: zes afwijkingen van het onboardingdocument.
- T367-d: hardcoded Engels in de wizard en Dropdown.
- T218-e: de vijf incident-runbookreacties één keer oefenen.
- T205-e en T220-e: dup_of-canonicals en indexeringsvertraging (gaan mee met T239, wave 21).
- T214-d en T246-b: page_view-RPC en installatievlag voor de funnel (gaan mee met T243, wave 21).
- T271-b: INP van de reispagina meten op een echte telefoon na de launch.

## Na de lancering

### Wave 21

Gate: blok 12 van `1-manual-steps.md`, de launch (T236).

| Task | Wat | Model |
|---|---|---|
| T237 | De al opgezette prijstest draaien | fable |
| T238 | De Year Pass-mix pushen | opus |
| T239 | Het SEO-oppervlak bewust bouwen | sonnet |
| T240 | De vier cijfers bewaken die het plan kunnen veranderen | opus |
| T241 | Tier-upgrades, alleen als een trigger afgaat | opus |
| T242 | De incrementele eigenschap bewaken terwijl de catalogus groeit | sonnet |
| T243 | De conversiefunnel met echte cijfers | sonnet |
| T244 | De echte maandelijkse break-even | haiku |
| T245 | Accommodatie-affiliates opnieuw beoordelen | sonnet |

Registerrijen: T239 neemt T205-e en T220-e; T243 neemt T214-d en T246-b; na de launch ook T271-b.

### P15, met een trigger

- T247 App Store en T248 Play Store: na de store-accounts van de eigenaar (T272-b); Android eerst.
- T249: bij ongeveer 5.000 bestemmingen.
- T250: routering over knooppuntnetwerken (T121-a).
- T251: alleen als Carto zijn voorwaarden wijzigt.

Niet voor Claude (eigenaar): T014 entiteit, T015 btw-antwoord, T016 boekhouding, T095 handmatig prijzen, T232 Supabase Pro, T236 launch. T135 is gedaan als T233, T141 als T333.

## Regels voor elke sessie

1. Werk alleen in je worktrees onder `C:\Users\Gebruiker\Documents\Portfolio\wt\`; de hoofdcheckout is alleen-lezen. Root is `main`, de app (`continent-app/`, eigen git) is `master`.
2. Commit in beide repos als je beide wijzigde; `git show --stat` na elke commit. Nooit `git stash` (gedeeld tussen worktrees).
3. Alleen je eigen taaknummer voor branch, rapport en registerrijen. Rapport in `Execution/P{n}/<TASK>-<slug>.md` volgens `Execution/_TEMPLATE.md`; open punten als rij onderaan `Execution/_OPEN.md`, nooit een rij wissen.
4. Niet aanraken zonder uitzondering op naam: bestaande migraties, `vercel.json`, `public/_headers`, `public/_redirects`, `wrangler.toml`, `scripts/build-pages.mjs`, `scripts/r2/`, de `ci`- en `build:pages`-scripts, `.gitignore`, `infra/hetzner/`, `pipeline/archive/`, `run_pipeline.py`, de planbestanden, en geen pakketafhankelijkheden.
5. Geen dataschrijfacties (geen `run_pipeline.py`, niets in `app_data/`, `cache/`, `data/`, trailslab, R2 of productie); nooit gegenereerde `public/**`, `dist/` of `dist-data/` committen; wis `dist/` en `dist-data/` na elke build.
6. Poorten: Vite op 5200 plus sessienummer, Postgres op 55440 plus sessienummer; nooit 5432, 5433 of 55434. Elke Vite-server een eigen cacheDir; nooit `npm run dev`.
7. Nooit pushen, deployen of een migratie live plakken; een stap voor de eigenaar wordt een rij met Owner `user`. Nooit de Claude/Anthropic API; runtime-AI blijft Gemini.
8. carta-design wint elke visuele keuze; lees `PRODUCT.md` en `DESIGN.md` eerst. Geen em dashes, en dashes of middots.
9. Na een wijziging in `src/i18n`: parse alle zes de catalogi. Elk cijfer noemt het bestand waar het vandaan komt.
10. Orchestrator: preflight (schone repos, geen pipeline, vorige wave gemerged, 20 GB vrij), worktrees één voor één met `wave_worktree.ps1`, gate met `wave_gate.ps1`, merge met `merge_branch.sh`, mirror-commit met nieuwe app-bestanden, build en lint, per taak twee zinnen in `3-waves.md`, de taak hier schrappen, en vraag vóór elke push.
