# Leesgids: Carta stap voor stap begrijpen

Deze gids is voor de eigenaar, in gewone taal. Hij legt uit hoe Carta in elkaar zit en hoe het werk georganiseerd is. Daarna geeft hij een leesroute langs de echte documenten, in een volgorde die je kunt volgen.

De rest van de documentatie is Engels en technisch. Deze gids is de brug ernaartoe. Hij beweert niets nieuws: elk feit komt uit een document dat hier gelinkt staat.

Geschreven op 2026-11-06, na de sessie van 2026-11-05 (taken T1053 tot T1084).

---

## Deel 1. Wat Carta is

Carta is een web-app om een reis door Europa te plannen. De kern staat in [PRODUCT.md](../PRODUCT.md):

> Een goedkope vlucht is nog geen goedkope reis; Carta laat zien wat de dagen daar kosten.

Vluchtzoekers als Skyscanner tonen alleen het ticket. Carta telt vlucht, bed en de dagen (eten, vervoer) op tot één totaal per persoon per dag. Je bekijkt plaatsen, wandelingen, stranden, meren en bergen, en je plant er een reis mee.

Eén web-app (Vite en React) draait in de browser, en dezelfde app wordt later ingepakt voor de App Store en Play Store. Lanceren gebeurt eerst in België en Nederland, in het Nederlands en het Engels (jouw keuze op de checklist).

---

## Deel 2. Hoe het in elkaar zit

Denk aan een restaurant met een keuken, een magazijn en een zaal.

### De keuken: de data-pipeline (Python)

- **Wat het doet:** honderden open bronnen (OpenStreetMap, Wikidata, Wikipedia, Eurostat, prijsdata, weerdata) worden opgehaald en samengevoegd. Er komen scores, prijzen en teksten uit.
- **Wat eruit komt:** één groot bestand, de **master** (`app_data/app_data.json`, 140 MB), plus aparte **lagen**: wandelingen, stranden, meren, bergen, fietsroutes.
- **Hoe je het start:** `python run_pipeline.py <taak>`. Elke taak heeft een ritme: wekelijks, maandelijks of per kwartaal.
- **Wie het draait:** de **Hetzner build box**, een kleine server die de pipeline wekelijks draait. Jij hebt bevestigd dat die in productie draait.

### Het magazijn: de wire en R2

- **De wire:** de master is te groot voor een telefoon. `sync-data.mjs` knipt hem daarom in porties: een kleine opstartindex, één bestand per land, en detailbestanden. Dat geheel heet de **wire**.
- **Het contract:** de vorm van de wire ligt vast in [SCHEMA.md](SCHEMA.md), en `check-contract.mjs` controleert dat bij elke wijziging.
- **R2:** de wire staat op **Cloudflare R2**, een opslagdienst achter `data.carta-europetravel.com`. De browser haalt de porties daar rechtstreeks op.

### De zaal: de app en Cloudflare Pages

- **De app:** draait in de browser en wordt geserveerd door **Cloudflare Pages** (project `carta-app`).
- **Pages Functions:** kleine stukjes servercode op Cloudflare. Ze beantwoorden Ask Carta-vragen, halen live vluchtprijzen en weersverwachtingen op, en serveren zo'n 32.000 vooraf gemaakte pagina's voor Google.
- **De regels:** beveiliging en caching staan in één bestand, `continent-app/public/_headers`.

### De administratie: Supabase

- **Database en accounts:** **Supabase** is de database (Postgres) met inloggen, opgeslagen reizen, groepen, lijsten en de admin.
- **RLS:** **row level security** zorgt dat een gebruiker alleen zijn eigen rijen ziet. Sinds T1078 is dat voor alle 34 tabellen getest.
- **Edge Functions:** servercode bij Supabase voor de AI-functies (`plan-day`, `suggest-city`, `parse-booking`, op Gemini van Google, nooit de Claude API) en voor betalingen via Stripe (`checkout`, `stripe-webhook`).
- **Migraties:** wijzigingen aan de database. Dat zijn genummerde SQL-bestanden in `supabase/migrations/`, die jij in de Supabase SQL-editor plakt. 061 tot 064 liggen klaar en zijn nog niet toegepast.

### De kwaliteitscontrole: GitHub en CI

- **Bij elke wijziging:** 14 GitHub-workflows draaien de tests, de lint, de build, de beveiligingsscans, het datacontract en de licentiecontrole.
- **Groen of rood:** groen betekent dat het samengevoegd mag worden. Sinds gisteren staat **branch protection** op `main`: rode code komt er niet meer in.

Het hele plaatje met een diagram staat in [architecture/README.md](architecture/README.md).

---

## Deel 3. Hoe het werk georganiseerd is

### Het plan: ROADMAP.md

[ROADMAP.md](../ROADMAP.md) is het plan tot de lancering:
- **Fases:** P0 tot P5. Elke fase heeft een kwaliteitspoort.
- **Sporen:** A tot K, bijvoorbeeld A voor structuur, C voor beveiliging, D voor data, G voor ontwerp en K voor marketing.
- **Items:** elk item heeft een ID (`C4`, `D7`) en een status.

### Het register: Execution/_OPEN.md

Elk open punt is één regel met een ID (`T1070-a`), wie het opende, wat het is, van wie het is (`user` = jij, `next task` = Claude) en de status.
- Gesloten regels gaan naar `_OPEN-CLOSED.md`. Ze worden nooit gewist.
- Jouw regels zijn gegroepeerd in stappenplannen per systeem: `Execution/P15/_OPEN-*.md` (Stripe, Supabase, Cloudflare, de box, juridisch).

### Eén taak, van begin tot eind

1. Een taak krijgt een nummer (`T1078`) en een eigen branch (`p15-...`).
2. Claude doet het werk, alleen in de bestanden die bij de taak horen.
3. Checks lokaal: tests, lint, build.
4. Een **rapport** in `Execution/P15/` volgens [_TEMPLATE.md](../Execution/_TEMPLATE.md): wat er veranderde, cijfers voor en na, wat er misging, wat er openstaat en hoe je het terugdraait.
5. Nieuwe open punten gaan in het register. Verandert er iets aan hoe een feature werkt, dan wordt ook [HANDBOOK.md](HANDBOOK.md) bijgewerkt.
6. Een **pull request** op GitHub. CI draait, en **Auto-fix** repareert rode checks.
7. Jij merget. **Deployen** (live zetten) gebeurt alleen als jij het vraagt.

### Batches en subagents

- **Een batch:** meerdere taken samen, op één batch-branch, met één eindcontrole en één pull request.
- **Subagents:** helpers van Claude die tegelijk werken, elk in een eigen kopie van de repo (een **worktree**).
- **Zo liep gisteren:** de P1-batch had zes subagents, de security-batch vijf.

---

## Deel 4. Wat er gisteren gebeurde, en waarom

| Wat | Waarom het ertoe doet | Rapport |
|---|---|---|
| **P0-batch** (T1053 tot T1060): kwetsbare pakketten bijgewerkt, uitloggen dat je apparaat kan leegmaken, een bug op de kaart, veiliger opschonen van R2, CI opgezet, een overzicht van alle geheime sleutels, positionering | De eerste noodzakelijke stappen | [T1053-T1060](../Execution/P15/T1053-T1060-p0-batch.md) |
| **CI groen** (T1061) | Zeven controles waren al weken rood, dus niemand zag nieuwe fouten | [T1061](../Execution/P15/T1061-ci-green.md) |
| **Kleine fixes en upgrades** (T1062 tot T1067): verboden tekens en woorden uit de teksten, een zichtbare focusrand, jspdf 4 en maplibre 6, Vercel verwijderd | Twee kritieke beveiligingslekken in pakketten opgelost; je oude host is weg | [T1062-T1066](../Execution/P15/T1062-T1066-copy-focus-upgrades.md) |
| **P1-batch** (T1068 tot T1076): 55 kapotte tests gerepareerd, het dreigingsmodel, de upload-database, MFA voor de admin, het register opgeschoond, een nieuwe documentatiestructuur, scrapergezondheid, eerlijke prijzen, een SEO-kwaliteitsdrempel | Beveiliging en kwaliteit klaar voor de lancering | [T1068-T1076](../Execution/P15/T1068-T1076-p1-batch.md) |
| **Trip-foto's** (T1077) | 257 reizen hadden een te kleine hoofdfoto; nu staat geen enkele foto onder de 1600 pixels | [T1077](../Execution/P15/T1077-trip-heroes.md) |
| **Security-batch** (T1078 tot T1083): elke tabel getest op privacy, strengere headers en invoercontroles, vastgezette versies van externe code, een reden verplicht bij admin-acties | De gaten uit het dreigingsmodel gedicht | [T1078-T1083](../Execution/P15/T1078-T1083-security-batch.md) |
| **Licentieregister** (T1084) | Elke databron heeft nu een licentieregel; de laatste 3 uitgeschakelde tests draaien weer | [T1084](../Execution/P15/T1084-licence-registry.md) |

Er is **niets gedeployed**. Productie draait nog de versie van 3 november.

---

## Deel 5. De leesroute

Volg de stappen op volgorde. Lees na elke stap gerust niet verder: elke stap staat op zichzelf.

| Stap | Open | Wat je leert | Tijd |
|---|---|---|---|
| 1 | Deze gids, deel 1 tot 4 | Het grote plaatje | 15 min |
| 2 | [PRODUCT.md](../PRODUCT.md), tot "Visual brand commitment" | Voor wie Carta is, hoe het praat, wat het belooft | 10 min |
| 3 | [architecture/README.md](architecture/README.md) | De onderdelen en hoe een verzoek door het systeem loopt | 10 min |
| 4 | [glossary.md](glossary.md) | De Carta-woorden (wire, master, layer, tier, gem) | 10 min, of opzoeken als je een woord tegenkomt |
| 5 | [_HANDOVER-2026-11-05.md](../Execution/P15/_HANDOVER-2026-11-05.md) | De stand van nu, jouw beslissingen, jouw stappen | 15 min |
| 6 | [Je checklist](https://claude.ai/artifact/UZ1QJRDYdowJZEi6y5JCvF) | Wat jij moet doen, op volgorde, met uitleg per stap | Werk het af in je eigen tempo |
| 7 | [areas/README.md](areas/README.md), daarna 2 of 3 gebieden die je interesseren (bijvoorbeeld `explore`, `plan`, `prices`) | Per productonderdeel: schermen, bestanden, tests, grenzen | 10 min per gebied |
| 8 | [ROADMAP.md](../ROADMAP.md), sectie 4 (de fases) en de tabellen van sporen C en D | Wat er tot de lancering nog moet gebeuren | 20 min |
| 9 | [security/threat-model.md](security/threat-model.md), de tabel met gaten onderaan | Waar het systeem kwetsbaar was en wat gedicht is | 15 min |
| 10 | Eén taakrapport van begin tot eind, bijvoorbeeld [T1077](../Execution/P15/T1077-trip-heroes.md) | Hoe een taak wordt vastgelegd, en hoe je die leest | 10 min |
| 11 | [_NEXT-50-SESSIONS.md](../Execution/P15/_NEXT-50-SESSIONS.md) | Wat de volgende sessies gaan doen, in welke volgorde, en wat ze van jou nodig hebben | 15 min |
| 12 | [HANDBOOK.md](HANDBOOK.md): zoek één feature die je kent (bijvoorbeeld "Destination price card") | Hoe een feature precies rekent, met de getallen erachter | Naar behoefte |

Tip: in de app kun je in het **Files**-paneel op een link klikken. In GitHub werken de links ook.

---

## Deel 6. Woorden die steeds terugkomen

| Woord | In gewone taal |
|---|---|
| Pipeline | Het Python-programma dat alle data maakt |
| Master | Het ene grote databestand dat de pipeline maakt |
| Wire | De master in kleine porties, zoals de app ze downloadt |
| Laag (layer) | Een aparte dataset: wandelingen, stranden, meren, bergen, fietsroutes |
| R2 | De opslag van Cloudflare waar de wire en de foto's staan |
| Pages, Pages Functions | Cloudflare serveert de app, en de kleine serverfuncties ernaast |
| Supabase | Database, accounts en de AI- en betaalfuncties |
| Migratie | Een genummerde databasewijziging die jij in Supabase plakt |
| RLS | De regel die zorgt dat elke gebruiker alleen zijn eigen gegevens ziet |
| Edge Function | Servercode bij Supabase (AI, betalingen) |
| Branch, pull request (PR), merge | Een aparte werklijn, het voorstel om die samen te voegen, en het samenvoegen zelf |
| CI, check | De automatische controles op GitHub; rood is fout, groen is goed |
| Auto-fix | Claude repareert rode checks op een PR zonder het eerst te vragen |
| Deploy | Live zetten voor bezoekers; gebeurt alleen op jouw vraag |
| Register | De lijst met alle open punten |
| Worktree, subagent | Een losse kopie van de repo, en een helper van Claude die daarin werkt |
| Build box | De Hetzner-server die de pipeline volgens schema draait |

Meer woorden: [glossary.md](glossary.md) (Engels).

---

## Deel 7. Als je iets niet snapt

Vraag het in een nieuwe sessie, met de bestandsnaam erbij. Bijvoorbeeld: "Leg uit wat migratie 063 doet, in gewone taal" of "Waarom daalt het aantal geïndexeerde plaatsen naar 337?". Elke sessie leest eerst CLAUDE.md, en die verwijst naar de overdracht en het sessieplan.
