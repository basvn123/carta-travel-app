# Manual steps

Dit bestand is de enige lijst van wat jij (niet Claude) nog moet doen voor Carta. Stand op 2026-10-13.
Wat Claude nog doet staat in `2-to-do.md`, wat er al gebeurd is in `3-waves.md`.
`Execution/_OPEN.md` blijft het register: de rij-ids tussen haakjes wijzen daarheen, en het verslag achter de rij heeft de details.

## Waar staan we

- Productie (Cloudflare Pages, project `carta-app`) draait waves 1 tot en met 16c sinds 2026-10-07. De design waves V1 tot V6 zijn gemerged, maar staan alleen op de preview `https://design.carta-app.pages.dev`. De release-sessie T412 (Claude) moet nog draaien.
- De database is live tot en met migratie 051, behalve de Stripe-set 027, 031 en 044. `pg_cron` en `pg_net` staan aan, de moderation purge is ingepland.
- Gemini: plan-day versie 12 (80 s budget over de modelketen), de globale cap is live bewezen (T416). Open: de refund-proef en de weekmeting vanaf 2026-10-14.
- Root `main` staat 189 commits voor op GitHub (laatste push 2026-10-07).
- Nog niet begonnen: de Hetzner-box, de afbeeldingen op de CDN, de betaalde Gemini-runs, de eenmanszaak met Stripe, en de launch.
- Draai `push-data.mjs --live --prune` niet tot Claude rij T413-a heeft opgelost: het zou `data/status.json` wissen.

## Wat elk blok vrijgeeft

| Blok | Wat je doet | Geeft vrij |
|---|---|---|
| 1 | Push en CI nakijken | GitHub CI, de box kan later klonen |
| 2 | Gemini afronden, wave 17 starten | wave 17 (T147 tot T149), daarna blok 9 |
| 3 | Design V6 nakijken en live zetten | gebruikers zien V1 tot V6 |
| 4 | Admin en database nakijken | sluit de rest van stage 2 |
| 5 | Huishouden en monitoring | niets wacht, maar er zijn deadlines |
| 6 | Datalane op de laptop | echte data achter de features van waves 10 tot 16 |
| 7 | De Hetzner-box | wave 18 en de zware datalane |
| 8 | Afbeeldingen en terrein op de CDN | wave 19 |
| 9 | Betaalde Gemini-runs | de P9-metingen |
| 10 | Bedrijf, juridisch, Stripe | wave 20 |
| 11 | Prerender en zoekmachines | zoekverkeer |
| 12 | Launch | wave 21 |

Om een reeks waves te starten, zeg je tegen Claude:

> Run waves N to M from Next steps carta/2-to-do.md back to back. Skip any session whose gate is still open, note it in the wave log, and stop at the first GATED wave whose stage is not done. Ask me before any push.

---

## Blok 1. Push naar GitHub en CI nakijken

Waarom: GitHub loopt 189 commits achter, en een paar CI-jobs zijn nooit bekeken.
Geeft vrij: CI op de nieuwe code; de box (blok 7) kloont GitHub `main`.

- [ ] Wacht tot er geen wave draait (`git worktree list` toont alleen de hoofdcheckout). Push dan vanuit de repo-root. Een push deployt niets.
  ```
  git push origin main
  ```
  Gelukt als `git rev-list --count origin/main..main` 0 geeft.
- [ ] Open de Actions-tab op GitHub en kijk één keer: `admin-rpc-security` en `rls-policies` groen; `schema-contract` groen met twee regels "the gate failed, as it must"; `design-lint` groen. Rood verwacht tot later: `trip-validator` tot blok 6 F1, `rating-tests` tot F3. `coverage-contract` waarschuwt tot F2. <sub>(T083-c, T082-a, T196-c)</sub>
- [ ] Start de uptime-workflow één keer met de hand (Actions, `uptime.yml`, Run workflow) en kijk dat hij groen is. GitHub pauzeert hem na 60 dagen zonder activiteit. <sub>(T235-b)</sub>

## Blok 2. Gemini afronden en wave 17 starten

Waarom: de cap is bewezen, maar de refund-proef en de eerste weekmeting ontbreken nog.
Geeft vrij: wave 17 (de fact store, T147 tot T149). Die gate is al open.

- [ ] Zeg tegen Claude: "Run wave 17 from Next steps carta/2-to-do.md." De gate (stages 2 en 3, T041-a en T081 beantwoord) is gehaald.
- [ ] Refund-proef in het Supabase-dashboard: noteer op een testaccount de `ai_usage`-rij, vraag één plan, zet de secret `GEMINI_MODEL` op een foute waarde, vraag opnieuw. Gelukt als `ai_usage` terug op de eerdere waarde staat. Zet het model daarna terug (secret verwijderen). Let op de exacte naam van de secret: bij T416 bewaarde het dashboard eerst `AI_GLOBAL_DAILY_CAPValue`. <sub>(T037-b)</sub>
- [ ] Op of na 2026-10-14: lees in het admin-paneel de cache hit rate en de cap refusal counts, en geef beide aan Claude. Kijk in Google Cloud hoe de prepaid Gemini-uitgave in het budget verschijnt. <sub>(T039-c, T042-e, T259-b)</sub>
- [ ] Na wave 17, als T147 migratie 049 heeft geplakt en `refresh-facts` deployt: zet de Edge secret `REFRESH_FACTS_TOKEN` op een willekeurige waarde, bewaar dezelfde waarde als vault secret `refresh_facts_key` en de functie-URL als `refresh_facts_url`, en deploy `refresh-facts` met verify_jwt uit. T147 kan dit nog herhalen. <sub>(T327-c, T041-b)</sub>

## Blok 3. Design V6 nakijken en live zetten

Waarom: V1 tot V6 staan alleen op de preview; productie draait nog de stand van 2026-10-07.
Geeft vrij: gebruikers zien het nieuwe design. Wacht eerst op T412 (Claude, de release van wave V6).

- [ ] (controleren) De R2 CORS-regel moet de design-origin bevatten, anders toont de preview geen plaatsen. Vanuit `continent-app/`, met `CLOUDFLARE_API_TOKEN` en `CLOUDFLARE_ACCOUNT_ID` geëxporteerd:
  ```
  node scripts/r2/push-data.mjs --cors --live
  npx wrangler r2 bucket cors list carta
  ```
  Gelukt als de lijst `https://design.carta-app.pages.dev` toont.
- [ ] Test de preview op een echte iPhone en een echte Android-telefoon, staand en liggend. Emulatie op Windows bewijst dit niet. Loop deze punten af en noteer wat misgaat:
  - Toetsenbord: het echte toetsenbord tegen 100dvh in de planners, de zoekvelden, de datumvelden van het receipt, het aanmeldvenster en het past-trip-formulier; het veld blijft in beeld en de bottom nav verdwijnt.
  - Scrollen: momentum en snap op de foto-tracks, de dagtrack, de rails en de kaart; de iOS Safari-balk die inklapt in liggende stand.
  - Duim en tik: de 44 px-knoppen (ster, credit, sluiten, terug, kaartpins), de press-look en haptiek, de Undo-toast boven de home bar, safe areas onder de notch.
  - Native onderdelen: de deel-sheet (GPX naar een wandelapp), de printdialoog en PDF, de select- en datumpickers, de install-hint (iOS en Android), View Transitions van kaart naar pagina.
  - Schermlezer: VoiceOver en TalkBack op de live totaalprijs, de tabs, de menu's en de kaart.
  - Lettertype: of Fraunces op een echte iPhone zwaarder oogt; zo ja, laat Claude per maat opsz-waarden in DIRECTION.md zetten.
  <sub>(T414-a, T411-o, T380-f, T381-e, T382-f, T383-i, T384-i, T385-f, T386-c, T387-f, T388-a, T389-d, T390-j, T391-b, T392-g, T393-f, T394-d, T395-f, T396-b, T397-g, T398-a, T399-f, T400-h, T401-b, T401-c, T402-f, T403-d, T404-b, T405-e, T406-a, T407-b, T408-a, T409-h, T410-a, T184-a, T368-b)</sub>
- [ ] (controleren) Affiliate-ids: zet in Cloudflare, Workers and Pages, `carta-app`, Settings, Environment variables, de partner-ids waarvoor Carta een account heeft (`VITE_TP_MARKER`, `VITE_OMIO_TRACKING_LINK`, `VITE_GYG_PARTNER_ID`, `VITE_VIATOR_PID`). Omdat `build:pages` op de laptop bouwt, moeten ze ook in de shell of in `continent-app/.env` staan. Zonder blijft de klikteller op de Launch-kaart 0. <sub>(T315-b)</sub>
- [ ] Bouw, upload de data en deploy eerst een preview. Vanuit `continent-app/`, met `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` en de vijf `RCLONE_CONFIG_R2_*` variabelen:
  ```
  npm run build:pages
  node scripts/r2/push-data.mjs --live
  node scripts/r2/verify-data.mjs
  npx wrangler pages deploy dist --project-name carta-app --branch preview
  ```
  Gelukt als `verify-data.mjs` PASS geeft en `https://preview.carta-app.pages.dev` werkt op telefoon- en desktopbreedte, console open.
- [ ] Deploy productie, na je akkoord op de preview. <sub>(T369-c)</sub>
  ```
  npx wrangler pages deploy dist --project-name carta-app --branch main
  ```
- [ ] Kijk in productie na wat nog nooit in een echte browser bekeken is:
  - `/?legal=privacy`, `terms` en `imprint` tonen de T319-tekst (privacy niet meer gedateerd 2 oktober).
  - `/about/numbers` geeft 200 met de security headers.
  - De ingeklapte rij "Where this comes from" op een bestemming met routes en een fietsroute.
  - Maintenance en announcement met `?paymock` en een maintenance-flag.
  - Met een pass: de PDF van een bestemming bij trails (bijvoorbeeld Valbona Valley), en lees de "around"-rijen; en één keer een mislukte PDF-export.
  - De share cards in de Facebook Sharing Debugger, LinkedIn Post Inspector, de X card validator, WhatsApp en iMessage (`https://www.carta-europetravel.com/og/site.png` en de home-URL).
  - Vraag Claude daarna `baseline_vitals.mjs` opnieuw te draaien tegen productie.
  <sub>(T227-b, T318-a, T313-a, T335-c, T286-e, T405-c, T212-a, T231-c)</sub>
- [ ] Pas als Claude T413-a heeft opgelost: lees eerst de dry run, dan de echte prune, en wis `dist/` en `dist-data/`.
  ```
  node scripts/r2/push-data.mjs --rclone-dry-run --prune
  node scripts/r2/push-data.mjs --live --prune
  ```
  Gelukt als geen purge-regel `data/status.json`, `data/.keep` of `data/_test` noemt.

Herhaal de laatste drie stappen na elke run uit blok 6: data bereikt gebruikers alleen met een deploy.

## Blok 4. Admin en database nakijken

Waarom: de migraties zijn live, maar een paar dingen zijn nooit in de echte app bekeken.
Geeft vrij: sluit de rest van stage 2.

- [ ] (controleren) Supabase, Authentication: TOTP MFA staat aan. Schrijf je in met een TOTP-factor op het owner-account via de admin-pagina. 032 is live, dus verwijderen en bannen vragen al om de code. <sub>(T063-b)</sub>
- [ ] Open de admin-pagina: Overview, Guides, Reports, Content en Audit laden zonder missing-function fout; de kaarten pipeline health en AI failures tonen; de vijf T270-kaarten (config, guides paging, OSS threshold, parse failures, content reports) tonen data. <sub>(T300-s, T270-b)</sub>
- [ ] Doe één takedown met statement of reasons via een echte ingelogde sessie. <sub>(T281-b)</sub>
- [ ] Stuur één echte melding (Report a problem), kijk dat de rij `kind` data en de report key heeft, en druk in de Feedback inbox op Open in Content: de Content-tab opent op het item. <sub>(T326-c, T326-b)</sub>
- [ ] Zeg tegen Claude: "stage 2 pasted on 2026-10-07; give me the read-only query to compare the live functions with the migrations." Plak die in de SQL editor en geef de uitkomst terug. <sub>(T077-b)</sub>
- [ ] Zet op de laptop `CARTA_SUPABASE_URL` en `CARTA_SUPABASE_SERVICE_KEY` voor `run_pipeline.py`, anders schrijft `report_pipeline_run()` geen rij. Op de box gebeurt dit in blok 7. <sub>(T072-a)</sub>
- [ ] Later, na de eerste echte content report:
  ```
  select source_header, count(*) from public.content_reports group by 1;
  ```
  `cf-connecting-ip` is goed. `x-forwarded-for` betekent dat Claude `report_guide` moet aanpassen. <sub>(T068-c)</sub>

## Blok 5. Huishouden, beheer en monitoring

Waarom: niets wacht hierop, maar twee punten hebben een datum.
Geeft vrij: niets direct; het houdt back-ups en alarmen op orde.

- [ ] Vóór 2026-11-06: dump de trails lab opnieuw (de dump van 2026-10-07 verloopt dan). In Git Bash, met de lab aan en de `RCLONE_CONFIG_R2_*` variabelen gezet:
  ```
  set -o pipefail
  PGPASSWORD=trailslab pg_dump -h 127.0.0.1 -p 5433 -U trailslab -d trailslab -Fc -Z 6 \
    | gpg --batch --yes --trust-model always --encrypt --recipient "Carta backups" \
    | rclone rcat r2:carta/archive/db/trailslab/trailslab-$(date +%F).dump.gpg
  ```
  Herhaal elke vier weken tot de box het overneemt, of vraag Claude een langere lifecycle-regel voor `archive/db/trailslab/`. <sub>(T288-b)</sub>
- [ ] (controleren) Verwijder het Vercel-project `carta-travel-app` (of koppel minstens beide domeinen los). 2026-10-09 is voorbij; daarna is de vorige Pages-deploy de rollback. <sub>(T293-a)</sub>
- [ ] Maak het adres `support@carta-europetravel.com` (alias naar jou, send-as aan, melding op je telefoon). Zeg dan "switch the CONTACT constant to support@"; Claude past `Imprint.jsx`, `TermsOfService.jsx`, `PrivacyPolicy.jsx` en `AccountPanel.jsx` aan. <sub>(T216-a)</sub>
- [ ] Merkenonderzoek: zoek "Carta" in klassen 9, 39 en 42 op euipo.europa.eu en geef de uitkomst aan Claude voor `additional docs/Carta/Plan/Legal/Legal.md`. Vóór de launch. <sub>(T300-a)</sub>
- [ ] Met D: aangesloten: gelukt als het FAT32 meldt en `lakes-cache` weigert. <sub>(T311-g)</sub>
  ```
  python pipeline/archive/pack.py --dry-run --out D:/carta-archive-out
  ```
- [ ] Een tweede uptime-laag: een externe probe (UptimeRobot of een Cloudflare health check) op `https://www.carta-europetravel.com/` (200), `https://data.carta-europetravel.com/data/beaches/index.json` (200 JSON) en `https://ntssxktaduxzpsmejwyv.supabase.co/auth/v1/health` (200 met de anon key header, 401 zonder), met e-mail naar jou. <sub>(T235-c)</sub>
- [ ] GitHub, Settings, Actions secrets: `CARTA_SUPABASE_URL`, `CARTA_SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` en `ALERT_WEBHOOK_URL` (Slack hook of ntfy topic). Zonder mailt de workflow nog bij een fout, maar slaat hij de pipeline-helft over. <sub>(T235-a)</sub>
- [ ] Een Cloudflare Cache Rule voor `data.carta-europetravel.com`: nu antwoordt de host `cf-cache-status DYNAMIC`, dus elke data-request is een R2 Class B operatie. <sub>(T231-d)</sub>

## Blok 6. Datalane op de laptop

Waarom: veel features van waves 10 tot 16 tonen pas echte data na deze runs.
Geeft vrij: de echte data; `trip-validator`, `rating-tests` en `coverage-contract` worden groen.

Eén run tegelijk, gestart door jou, met niets anders aan (kijk met `Get-Process python`). Haal uit R2 alleen terug wat een run nodig heeft, nooit alles (dat is ongeveer 70 GB). Na elke run: de deploy-stappen uit blok 3. De zin voor elke run:

> Data lane: run F<n> from Next steps carta/1-manual-steps.md. Pull only the archive classes it needs, tell me the disk it will take first, and nothing else runs meanwhile.

- [ ] **F1. De journeys wire opnieuw bouwen.** Eén `pipeline/journeys/build_wire.py` run met fetching aan en de image cache, dan committen. Gelukt als de trip-validator groen is, `ch-cozy-towns-appenzell` een hero heeft, en één trip goed oogt op 380 px en desktop. Hergebruik geen seed: `data/trips.flat.csv` en de seed SQL zijn niet opnieuw gemaakt (zie Vaste regels). <sub>(T085-a, T087-a, T089-a, T090-a, T091-a, T093-a, T102-b, T151-a, T175-a, T361-d)</sub>
- [ ] **F2. Coverage opnieuw draaien.** Daarna de stubs. <sub>(T112-a, T112-c, T160-a, T211-c, T124-a)</sub>
  ```
  python pipeline/regions/coverage.py
  python pipeline/regions/coverage_gate.py --check reports/coverage_contract.json --write-baseline reports/coverage_gate_baseline.json
  python pipeline/trails/export_stubs.py
  ```
  Commit `reports/coverage_contract.json`, de baseline en `reports/coverage.html`, en laat Claude `--require` toevoegen aan `.github/workflows/coverage-contract.yml`.
- [ ] **F3. De ratings herscoren.** `python pipeline/apply_rating_layer.py` op de master (heeft `cache/dest_pageviews.json` nodig), wire opnieuw bouwen, de twee rating-suites draaien. Verwacht: 1,616 van 3,868 scores bewegen. <sub>(T321-a)</sub>
- [ ] **F4. De trails lab runs** (lab op poort 5433, houd `TRAILSLAB_IMAGE=pgrouting/pgrouting:17-3.5-3.7` tot de box het nieuwe image heeft getest). In deze volgorde: `scenic.py --refresh` (Overpass, uren); de attributes run en export met uphill grading en credit gate; `famous_registry.py --all --refresh` met de blind-spot seeds; dan `python pipeline/trails/gate_attribution.py` en `python pipeline/trails/curate.py --dry-run --national-treks`. Zet de national pass alleen aan als de extra routes echte wandelingen zijn. <sub>(T311-d, T286-a, T280-a, T322-d, T322-a, T322-b)</sub>
- [ ] **F5. Geneve-prijzen.** `python pipeline/harvest_accommodation.py --refresh geneva`, dan `apply_accommodation_anchors.py` volledig met de footprint anchors (beslist op 2026-10-07). <sub>(T311-a)</sub>
- [ ] **F6. De route track wire** via de lokale Valhalla en BRouter. Geeft T178 en T334 vrij.
- [ ] **F7. Buren tussen lagen.** `python pipeline/joins/neighbours.py` na de laag-exports, dan de wire opnieuw bouwen. Zonder tonen de cross-layer blokken op strand-, meer-, berg-, trail- en fietspagina's niets. <sub>(T367-a)</sub>
- [ ] **F8. De zware datalane wacht op blok 7.** T104, T105, T120, T123, T106, T110, T114 tot T119, T122, T133, T109 en T125 hebben de OSM-extracten (30 GB) en hoogtetegels (24 GB) nodig. Draai ze op de box, in de volgorde van de datalane-tabel in `2-to-do.md`.
- [ ] **F9. De schrijfronde** (generation lane, na blok 2). Deels lezen en schrijven door jou, de sessie vraagt het: weerfallbacks per buitendag; aankomst- en vertrekfeiten; daling per routedag; ondergrond en verkeersvrij aandeel per fietstrip; boekingsvensters voor 66 trips; confidence notes voor 130 trips; de vier tegenstrijdige weektotalen (Berliner Hoehenweg, Stubai Hoehenweg, Donauradweg, Berner Oberland); meer gemeten maandcurves voor verblijf. <sub>(T170-a, T170-b, T174-b, T174-c, T169-a, T154-c, T151-g, T103-a)</sub>

## Blok 7. De Hetzner-box

Waarom: de wekelijkse pipeline heeft geen thuis; nu draait niets op een schema.
Geeft vrij: wave 18 en de zware datalane (F8). Ongeveer EUR 6.60 per maand, een CX23 (x86). Push eerst (blok 1): de box kloont GitHub `main`. Draai nooit een echte stap op de box terwijl er een laptop-run loopt.

- [ ] **G1. Project en token.** Hetzner Cloud Console: project "Carta", Security, API tokens, een Read & Write token. Installeer `hcloud` (`hcloud-windows-amd64.zip`, `hcloud.exe` in `~/bin`). Alleen in die Git Bash-sessie: <sub>(T046-c)</sub>
  ```
  export HCLOUD_TOKEN=<token>
  hcloud server-type describe cx23
  ```
- [ ] **G2. Provisionen.** Vanuit de repo-root, in hetzelfde venster (de lus wacht op voorraad):
  ```
  CARTA_SERVER_TYPE=cx23 bash infra/hetzner/cax11/provision.sh --dry-run
  while true; do
    for L in fsn1 hel1 nbg1; do
      if hcloud server-type describe cx23 | grep -A1 "Location:  *$L" | grep -q "Available: *yes"; then
        CARTA_SERVER_TYPE=cx23 CARTA_LOCATION=$L bash infra/hetzner/cax11/provision.sh && break 2
      fi
    done
    echo "$(date +%H:%M) no CX23 in stock, trying again in 2 minutes"; sleep 120
  done
  ssh -i ~/.ssh/carta_orchestrator_ed25519 carta@<address> 'cloud-init status --wait; tail -n 30 /var/log/carta-bootstrap.log'
  ```
  Gelukt als het log "ok: architecture amd64" toont en eindigt op "finished, all steps ok". Anders: `sudo carta-bootstrap` op de box. <sub>(T046-d)</sub>
- [ ] **G3. Secrets-bestand.** `nano ~/.config/carta/env` op de box, kopie van `env.example`, mode 600: de waarden uit de laptop-`.env`, `CARTA_SUPABASE_URL` en `CARTA_SUPABASE_SERVICE_KEY`, een eigen R2-paar `carta-box` (Object Read & Write, alleen bucket `carta`), `VITE_DATA_BASE=https://data.carta-europetravel.com/data`, en de URL van een nieuwe Healthchecks.io-check (wekelijks, ongeveer een dag speling, alarm naar jou) als `CARTA_HEARTBEAT_URL`. Zonder die URL meldt een mislukte run niets. <sub>(T046-e, T218-b)</sub>
- [ ] **G4. Verifiëren.** Minstens tien minuten na de laatste boot, vanaf de laptop. Gelukt bij ALL CHECKS PASSED, met "architecture x86_64" en "placeholder job fired N time(s)". <sub>(T046-f)</sub>
  ```
  bash infra/hetzner/cax11/verify.sh <address>
  ```
- [ ] **G5. Voorbereiden en de vier weekstappen.** Twee keer `--pull-only` (de tweede keer zonder waarschuwing over `app_data/app_data.json`), dan per stap `country_context`, `image_audit`, `ingestion`, `ship`. Bij een fout: stop en geef `~/carta/logs/arm64_verify/<step>.log` aan Claude. <sub>(T048-a, T048-b)</sub>
  ```
  bash ~/carta/infra/hetzner/cax11/run_pipeline.sh --pull-only
  bash ~/carta/infra/hetzner/cax11/verify_tasks.sh --next
  bash ~/carta/infra/hetzner/cax11/verify_tasks.sh <step>
  nohup bash ~/carta/infra/hetzner/cax11/verify_tasks.sh ingestion > ~/verify_ingestion.out 2>&1 &
  bash ~/carta/infra/hetzner/cax11/verify_tasks.sh --status
  ```
- [ ] **G6. Eerste volledige run en de vergelijking.** Gelukt als `~/logs/weekly.log` eindigt op exit 0 (exit 3: de pipeline was goed, een R2-stap faalde) en beide vergelijkingen SAME SHAPE printen. <sub>(T048-c, T048-d)</sub>
  ```
  CARTA_PIPELINE_ENABLED=1 nohup bash ~/carta/infra/hetzner/cax11/weekly.sh -- --only ingestion,country_context,image_audit > ~/first_run.out 2>&1 &
  ```
  Daarna op de box:
  ```
  cd ~/carta/infra/hetzner/cax11
  ~/venv/bin/python compare_wire.py summarize ~/carta/continent-app/dist      -o ~/box_shell.json
  ~/venv/bin/python compare_wire.py summarize ~/carta/continent-app/dist-data -o ~/box_data.json
  ```
  En op de laptop, vanuit de repo-root:
  ```
  (cd continent-app && npm run build:pages)
  python infra/hetzner/cax11/compare_wire.py summarize continent-app/dist      -o laptop_shell.json
  python infra/hetzner/cax11/compare_wire.py summarize continent-app/dist-data -o laptop_data.json
  scp -i ~/.ssh/carta_orchestrator_ed25519 carta@<address>:box_shell.json carta@<address>:box_data.json .
  python infra/hetzner/cax11/compare_wire.py compare laptop_shell.json box_shell.json
  python infra/hetzner/cax11/compare_wire.py compare laptop_data.json  box_data.json
  ```
- [ ] **G7. Het schema aanzetten.** Op de box, dan op de laptop kijken dat de oude taak nog uit staat. <sub>(T048-e)</sub>
  ```
  sudo bash ~/carta/infra/hetzner/cron/install.sh --dry-run
  sudo bash ~/carta/infra/hetzner/cron/install.sh
  schtasks /Query /TN TravelAppFareRefresh /V /FO LIST | findstr /C:"Scheduled Task State"
  ```
- [ ] **G8. Wekelijkse databasedumps.** <sub>(T048-g)</sub>
  ```
  pg_dump --version
  gpg --import carta-backups.pub.asc
  nano ~/.config/carta/env        # SUPABASE_DB_URL en CARTA_BACKUP_KEY toevoegen
  ```
- [ ] **G9. Het nieuwe lab-image.** Op de box `pipeline/trails/smoke_test.py` tegen het multi-arch image en noteer de pgRouting-versie. Op de laptop, vóór een wissel: `ALTER EXTENSION pgrouting UPDATE` in de lab-database. <sub>(T324-a)</sub>
- [ ] **G10. Na elke weekrun** die bestemmingen veranderde, vanaf de laptop (tot je beslist over een deploy-token voor de box, zie Beslissingen):
  ```
  python pipeline/archive/push.py --pull --only master-current
  cd continent-app
  npm run build:pages
  npx wrangler pages deploy dist --project-name carta-app --branch main
  node scripts/r2/push-data.mjs --live --prune
  ```
- [ ] **G11. De laptop leegmaken**, pas na G7. `data/raw`, `data/history`, `data/models` en de elf cache-lagen zijn al weg (2026-10-02). Houd `app_data/app_data.json` zolang je vanaf de laptop deployt. Eerst moet elke check die nog iets te checken heeft "0 differences found" geven: <sub>(T045-e)</sub>
  ```
  rclone check app_data/backups   r2:carta/archive/snapshots        --one-way
  rclone check "$CARTA_ARCHIVE_OUT" r2:carta/archive/caches         --one-way --include "*.tar.gz"
  rclone check app_data r2:carta/archive/master --one-way --include "/app_data.json"
  rclone ls r2:carta/archive/db/
  ```
  Dan vanuit de repo-root. Gelukt als `git status --short` geen verwijderingen toont (alles hieronder is gitignored):
  ```
  rm -rf data/raw data/history data/models        cache/photos/emb cache/photos/dumps cache/photos/models cache/photos/sheets cache/photos/geograph.sqlite        cache/beaches cache/cycling cache/lakes cache/iab cache/regions cache/trails cache/mountains cache/trips        app_data/backups        tools/trailslab/valhalla/data tools/brouter/segments data/trails/famous_registry_full.json        data/derived/tp_fares.json tools/reachability/cache logs pipeline/logs "$CARTA_ARCHIVE_OUT"
  git status --short
  ```

- [ ] **G12. Oefen de noodprocedures** uit `docs/operations/INCIDENT_RUNBOOK.md`: secties 2, 3 en 5 (Gemini-key leeg op een branch-project, een mislukte webhook in Stripe testmodus, Supabase plat) en sectie 1 op de box (een weekrun afbreken). Heeft de heartbeat uit G3 nodig. <sub>(T235-e)</sub>

Zeg daarna: "Stage 7.9 done; run wave 18 and move the heavy data lane to the box."

## Blok 8. Afbeeldingen en terrein op de CDN

Waarom: de afbeeldingen komen nog van derden; op de CDN zijn ze sneller en blijft de credit erbij.
Geeft vrij: wave 19. Heeft blok 7 nodig.

- [ ] **H0. Flickr API key.** Maak er een op flickr.com/services/api en zet hem als secret in het env-bestand, nooit in de repo. Zonder wordt wave 19 sessie 2 (T127) overgeslagen.
- [ ] **H1. De on-demand worker.** Een tweede Hetzner Read & Write token als `HCLOUD_TOKEN` in de env van de box; aangeraden een eigen R2-paar `CARTA_WORKER_R2_ACCESS_KEY_ID` en `CARTA_WORKER_R2_SECRET_ACCESS_KEY`. Dan op de box: <sub>(T047-a, T047-f)</sub>
  ```
  cd ~/carta && git pull
  bash infra/hetzner/cax41/verify.sh
  bash infra/hetzner/cax41/spawn.sh --dry-run selftest
  sudo install -m 0644 infra/hetzner/cax41/carta-worker-sweep.service infra/hetzner/cax41/carta-worker-sweep.timer /etc/systemd/system/
  sudo systemctl daemon-reload && sudo systemctl enable --now carta-worker-sweep.timer
  ```
- [ ] **H2. Een worker komt en gaat.** `bash infra/hetzner/cax41/spawn.sh selftest`: gelukt bij "outcome ok, exit 0", een lege `hcloud server list --selector role=worker` en `selftest.txt` in R2 met aarch64 en 16 cores. Start opnieuw en druk Ctrl-C na de eerste "worker:"-regel: hij moet "deleting carta-worker-selftest-..." tonen. <sub>(T047-b, T047-c)</sub>
- [ ] **H3. Eén zware job.** `bash infra/hetzner/cax41/spawn.sh valhalla_tiles switzerland`. Gelukt als `rclone ls r2:carta/archive/built/valhalla/switzerland/` drie bestanden toont. Geef de digest uit `SOURCE.txt` aan Claude. <sub>(T047-d)</sub>
- [ ] **H4. De stranden eerst.** Push de bronlijsten (`derive.py sources <layer>` naar `img/manifest/_sources/`) en de beaches-cache, dan de dry run en de echte runs; herhaal tot `left` 0 is (ongeveer acht runs van EUR 0.45). Daarna meren en bergen. Optioneel: een Cache Rule op `cdn.carta-europetravel.com/img/`. <sub>(T269-a, T324-c, T049-a, T049-b, T049-c, T049-d, T049-e)</sub>
  ```
  python pipeline/archive/pack.py --only beaches-cache --out <dir with 1 GB free>
  python pipeline/archive/push.py --only beaches-cache --out <the same dir>
  bash infra/hetzner/cax41/spawn.sh --dry-run image_transcode beaches
  bash infra/hetzner/cax41/spawn.sh image_transcode beaches
  ```
  Gelukt als `curl -sI` op een `640.avif` 200 geeft, `public, max-age=31536000, immutable` en `image/avif`.
- [ ] **H5. Takedown en credits live.** Kies een titel die niemand wil (de takedown is blijvend), met `CLOUDFLARE_API_TOKEN` (Zone, Cache Purge) en `CLOUDFLARE_ZONE_ID`. Gelukt bij `r2: ok`, `edge: ok`, `manifest[<layer>]: ok`, en exit 0 van de credit-check. <sub>(T050-a, T051-a)</sub>
  ```
  python pipeline/photos/takedown.py add "<title>" --dry-run
  python pipeline/photos/takedown.py add "<title>" --reason "T050-a proof"
  rclone cat r2:carta/img/manifest/beaches.json > beaches-live.json
  python pipeline/photos/verify_attribution_cdn.py --manifest beaches-live.json --head 5
  ```
- [ ] **H6. De snellere afbeeldingen aan.** Manifest joinen, `?pic=off` tegen `?pic=beaches` meten op een preview (vijf keer, Lighthouse mobile), en bij winst `VITE_PICTURE_LAYERS=beaches` in productie zetten. <sub>(T052-a)</sub>
  ```
  rclone copyto r2:carta/img/manifest/beaches.json cache/img_manifest/beaches.json
  python pipeline/beaches/export_beaches.py --img-manifest cache/img_manifest/beaches.json
  ```
- [ ] **H7. Opruimen.** Na de eerste echte derive-runs: `derive.py gc` (eerst zonder, dan met `--apply`). Vóór de eerste gepromote clip_sweep: de procedure "Moving the photo caches to the CAX41" in `docs/PHOTOS.md`. <sub>(T269-e, T269-d)</sub>
- [ ] **H8. Na de eerste maandfacturen.** Vergelijk de CAX41-regels met `python3 infra/hetzner/cax41/cost.py mtd --month YYYY-MM` (wall-clock of gestarte uren), zet het bedrag als `actual` in `infra_ledger`, vergelijk het totaal met de gemodelleerde EUR 9.50 tot 10.90, en meet eenmaal op een echte middenklasse telefoon. <sub>(T047-e, T055-b, T061-a)</sub>
- [ ] **H9. Terreintegels (reliëf op de routekaart).** Installeer go-pmtiles en lees eerst de grootte: <sub>(T233-a, T233-b, T233-c, T233-e)</sub>
  ```
  pmtiles extract https://download.mapterhorn.com/planet.pmtiles terrain-europe.pmtiles --bbox=-25,34,45,72 --dry-run
  rclone copyto terrain-europe.pmtiles r2:carta/tiles/terrain-europe.pmtiles --s3-upload-cutoff 200M --s3-chunk-size 100M --header-upload "Cache-Control: public, max-age=31536000, immutable" --header-upload "Content-Type: application/vnd.pmtiles"
  curl -s -D - -o /dev/null -H "Range: bytes=0-16383" -H "Origin: https://www.carta-europetravel.com" https://data.carta-europetravel.com/tiles/terrain-europe.pmtiles
  ```
  Draai de extract zonder `--dry-run` op een machine met genoeg schijf. Voeg in `continent-app/scripts/r2/data-cors.json` `"headers": ["Range", "If-Match"]` en `"exposeHeaders": ["Content-Range", "ETag", "Content-Length"]` toe en pas de CORS toe zoals in blok 3. Gelukt bij 206 met `content-range`. Zet dan `VITE_TERRAIN_PMTILES_URL` in de productiebuild. Vóór de launch: bevestig dat Mapterhorn een mirror toestaat (mapterhorn.com/attribution) en laat de credit toevoegen.

Zeg daarna: "Stage 8.6 done for beaches; run wave 19."

## Blok 9. Betaalde Gemini-runs

Waarom: alles wat geld kost komt na het gratis werk.
Geeft vrij: de P9-metingen. Jij keurt per stap een spend cap goed; Claude draait ze. De zin: "Run paid step I<n> from Next steps carta/1-manual-steps.md with a cap of USD <x>."

- [ ] **I1.** Alleen als de golden set vanuit CI draait: de repository secret `GEMINI_API_KEY` op GitHub. <sub>(T153-b)</sub>
- [ ] **I2.** Eén gemeten generator-run op drie tot vijf briefs, met de critic. Beslis daarna of de critic een ander model krijgt (`--critic-model`) en stel de drempel voor geschatte bedragen bij (150 euro, `ESTIMATE_MIN_EUR`). <sub>(T144-a, T145-a, T145-b, T154-a)</sub>
- [ ] **I3.** De eerste golden baseline, ongeveer 40 calls: `python pipeline/golden_set.py run --live`, dan `bless`. Beslis daarna over steekproeven en toleranties. Lever `Carta BackEnd.md` aan als je het hebt. <sub>(T153-a, T153-d, T153-f)</sub>
- [ ] **I4.** Ongeveer 30 grounded plan-day calls om de zoek-fan-out te meten. <sub>(T323-b)</sub>
- [ ] **I5.** De packing- en risk-backfill: `python -X utf8 pipeline/backfill_modules.py run --limit 5`, dan de rest met `--max-usd`. Lees daarna een steekproef, risks eerst. <sub>(T150-a, T150-d)</sub>
- [ ] **I6.** De prozaherschrijving van 236 trips binnen de woordlimieten. <sub>(T152-a)</sub>
- [ ] **I7.** Lees en bewerk eerst gratis de 60 wave-1 briefs (schrap bijvoorbeeld stadsweken in Liechtenstein, Andorra en San Marino, bevestig `MAX_PER_CELL` 2 en ongeveer 600 trips). Dan per batch `python pipeline/expand_catalogue.py run expansion/<batch>.json --live --max-usd <cap> --limit 3`, en na elke batch review, promote, join en een wire-rebuild. <sub>(T155-b, T155-a, T155-c)</sub>

## Blok 10. Bedrijf, juridisch, Stripe

Waarom: Stripe is nooit live geweest en wacht op de eenmanszaak.
Geeft vrij: wave 20 (stage 10).

- [ ] **J1. Schrijf de eenmanszaak in (T014).** Vul daarna de Imprint-placeholders (naam, nummer, adres). <sub>(T300-h)</sub>
- [ ] **J2. Het btw-antwoord schriftelijk van een boekhouder (T015).** De Belgische registratie in Stripe Tax moet ermee overeenkomen. <sub>(T033-g)</sub>
- [ ] **J3. Boekhouding en een kostenregister (T016).** `infra_ledger` (migratie 031) is de databasehelft. <sub>(T043-b)</sub>
- [ ] **J4. Juridische review** door iemand bevoegd, in één ronde:
  - de Article 16(m)-indeling (digitale inhoud, geen dienst) in de Terms;
  - de privacy-tekst van T319 in `PrivacyPolicy.jsx`, de Terms-sectie "Every figure is an estimate" en `account.exportHint`; bevestig dat de Supabase-regio EU is en teken `docs/legal/ARTICLE30.md`;
  - de OpenStreetMap-tick en de Terms-sectie "Photos and tracks you share" tegen de OSMF waiver template;
  - de content rule "Public guides" (c1 tot c7), de good-faith tekst op het meldformulier en de Terms-datum 7 oktober 2026.
  <sub>(T032-e, T319-a, T333-b, T206-c, T365-c)</sub>
- [ ] **J5. Commerciële voorwaarden van de databronnen**, vóór de eerste verkoop: Open-Meteo naar de betaalde API (dan ook de forecast-host in de CSP, rij T413-b); Numbeo, Ferryhopper en OpenSky per bron beslissen (licentie, vervangen of schrappen); de 22 ledger-rijen met `Verify` bevestigen; de partnerovereenkomsten van Hostelworld en LiteAPI regelen of die bronnen schrappen. <sub>(T300-e, T310-a, T227-c)</sub>
- [ ] **J6. Transactionele e-mail.** Kies de EU-provider, accepteer zijn DPA, zet SPF, DKIM en DMARC op `carta-europetravel.com`, bewaar de key als Supabase secret. Daarna: stuur minstens 30 dagen vóór uploads live gaan de aankondiging van de Terms-wijziging. <sub>(T213-e, T333-f)</sub>
- [ ] **J7. Stripe Dashboard, in deze volgorde.** Twee Prices: Trip Pass 699 en Year Pass 1499 EUR, `eur`, one_time; noteer ids en modus. Op beide `tax_behavior` inclusive. Settings, Business, Public details: Terms URL `https://carta-europetravel.com/?legal=terms` (vóór de secret in J8, anders geeft elke checkout 502). Settings, Tax: Belgische vestiging als origin, alleen België geregistreerd, threshold monitoring aan met een adres dat je leest. Live mode: receipt-mails aan met het imprint-adres en de btw-regel in de footer. <sub>(T030-a, T033-a, T032-a, T033-b, T213-c)</sub>
- [ ] **J8. Supabase.** Eerst een verse dump. Dan de secrets (testmodus eerst), dan plakken in de SQL editor: `027_paywall_funnel_kinds.sql`, `031_margin_dashboard.sql`, `044_payments_quota.sql` (021, 022, 025 en 026 zijn al live; zegt 044 dat pg_cron uit staat, draai de ene regel die hij print). Dan deployen, het webhook-endpoint aanmaken in het dashboard, en `STRIPE_WEBHOOK_SECRET` zetten uit de `whsec_`. Migratie 050 (wave 20) komt na 044. <sub>(T034-a, T043-a, T265-a, T030-b)</sub>
  ```
  supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_TRIP=price_... STRIPE_PRICE_YEAR=price_... CHECKOUT_TERMS_URL=https://carta-europetravel.com/?legal=terms --project-ref ntssxktaduxzpsmejwyv
  supabase functions deploy checkout --project-ref ntssxktaduxzpsmejwyv
  supabase functions deploy stripe-webhook --no-verify-jwt --project-ref ntssxktaduxzpsmejwyv
  ```
- [ ] **J9. Testaankopen.** De tien stappen van `supabase/functions/checkout/test_purchase_e2e.md` op twee nieuwe accounts, nooit het owner-account. Gelukt als de Stripe-pagina Carta's waiver-tick toont, `pass_grants` consent accepted met tijdstip toont, en een Duits en een Belgisch adres allebei `amount_total` 699 en `amount_tax` 121 geven. Volg één refund letterlijk volgens `docs/operations/REFUND_SOP.md`. Kijk dat Stripe webhook-foutmails in een gelezen inbox aankomen. Schakel dan naar live keys. <sub>(T031-a, T032-c, T033-d, T217-a, T218-d)</sub>
- [ ] **J10. De eerste maand.** Zet de echte facturen in `admin_set_infra_cost` met source `actual` en lees de reconciliation-regel. <sub>(T043-c)</sub>
- [ ] **J11. Store-apps.** Apple Developer Program, een Google Play developer account als bedrijf (na J1), een manier om iOS te bouwen vanaf Windows; daarna de signing key, het assetlinks-bestand en de App Store Connect-upload. Dan starten T247 en T248, Android eerst. <sub>(T272-b, T212-f)</sub>

Zeg daarna: "Stage 10 done; run wave 20."

## Blok 11. Prerender en zoekmachines

Waarom: 32,220 pagina's op echte paden voor zoekmachines.
Geeft vrij: zoekverkeer. Doe dit als je zoekverkeer wilt, ruim vóór de launch.

- [ ] Maak de Search Console-property voor `https://www.carta-europetravel.com/` (DNS-verificatie), een Bing Webmaster Tools-property en een IndexNow key. <sub>(T205-f)</sub>
- [ ] Beslis vóór de upload: trail- en fietspagina's staan op noindex omdat geen route een gelicentieerde foto heeft. Ofwel fotolicenties in de wire oplossen (pipeline-taak), ofwel het beeldcriterium voor routes laten vallen (dan past Claude `SEO.md` en `floor.mjs` aan). <sub>(T222-d)</sub>
- [ ] Draai de procedure vanuit `continent-app/` (de bucket `carta-prerender` bestaat al). Met `--cards` duurt stap 2 ongeveer twee uur. <sub>(T221-a)</sub>
  ```
  VITE_PATH_URLS=1 npm run build:pages
  node scripts/prerender/build.mjs --data public --cards
  node scripts/verify_prerender.mjs dist-prerender --shell dist/index.html
  node scripts/r2/push-data.mjs --live
  node scripts/prerender/push.mjs --live
  npx wrangler pages deploy dist --project-name carta-app --branch preview
  curl -sI https://preview.carta-app.pages.dev/austria/lakes/at-attersee-q698516
  npx wrangler pages deploy dist --project-name carta-app --branch main
  ```
  Gelukt als de curl 200, `x-carta-prerender` en de content-security-policy header toont, en in productie `/austria/trails/20050-x` 200 geeft en `/austria/trails/999999-x` 404. Daarna (na T413-a) `push-data.mjs --live --prune` en `prerender/push.mjs --live --prune`, en wis `dist/`, `dist-data/` en `dist-prerender/`.
- [ ] Kijk na de deploy: `curl -sI https://www.carta-europetravel.com/sitemap.xml` geeft 200 en `application/xml`; dien de sitemap in bij Search Console. `curl -sI` op `/spain/malaga/cost` en `/spain/4-days` geeft 200 en `x-carta-prerender`. <sub>(T222-c, T224-a)</sub>
- [ ] Kijk de eerste maand naar de Functions request graph (gratis plan: 100,000 requests per dag). <sub>(T221-b)</sub>

## Blok 12. De launch

Waarom: alles telt terug vanaf launchdag D (`Execution/P12/T220-launch-runway.md`).
Geeft vrij: wave 21.

- [ ] **K1.** Kies launchdag D (dinsdag tot donderdag), minstens 42 dagen vooruit, en geef hem aan Claude voor het register en de runway. Je community-accounts zijn 30 dagen oud op 2026-11-06. <sub>(T220-a)</sub>
- [ ] **K2. Uiterlijk D-21.** De soft-launch lijst van 15 mensen in een privébestand buiten de repo (5 onbekenden die ook de testers van K3 zijn, 5 wandelaars, 5 waarschijnlijke pass-kopers). Keur de uitnodigingstekst (met de zin dat een pass terugbetaalbaar is) en de pass marks goed. <sub>(T220-b, T220-d)</sub>
- [ ] **K3. De vijf-personentest** uit `docs/product/FIRST_RUN_RESULT.md`, met mensen die Carta nooit zagen; noteer de time-to-answer. Bevestig of wijzig daarbij de demosteden van de landing (Edinburgh, Chamonix, Porto; standaard Edinburgh, entire place, 2 personen, 7 nachten). <sub>(T187-b, T209-e)</sub>
- [ ] **K4.** Prijs 40 tot 50 bestemmingen met de hand in `tools/benchmark/samples/hotels.csv` met een menuprijs-steekproef (T095); Claude draait dan de benchmark opnieuw. <sub>(T096-a)</sub>
- [ ] **K5. Moedertaallezers** voor de strings in de, es, fr, it en nl. Laat ze per taal de lijsten uit deze verslagen nalezen (elk verslag noemt de keys). <sub>(T156-b, T158-c, T165-c, T179-a, T180-j, T181-j, T182-e, T183-l, T193-g, T381-f, T382-e, T383-h, T384-j, T385-e, T386-b, T387-e, T388-b, T389-c, T390-k, T391-c, T392-f, T393-e, T394-e, T395-e, T396-a, T397-f, T398-b, T400-i, T401-a, T402-e, T403-c, T404-a, T405-d, T407-a, T409-a, T410-b, T411-n)</sub>
- [ ] **K6.** Eén schermlezer-ronde met NVDA, VoiceOver en TalkBack op de kaartpins, de pin-namen en de Lifestyle-dialoog; beslis daarna of axe in de gate komt. <sub>(T190-f, T231-f)</sub>
- [ ] **K7. Uiterlijk D-15.** De gates legal, payments, perf en uptime gehaald (T227, T228, T231, T235) en Supabase op Pro (T232). Zo niet, dan schuift D op. <sub>(T220-c)</sub>
- [ ] **K8. Op D-14.** Lees opnieuw de regels van elke subreddit, elke Facebook-groep en de inzendpagina's van de media, en noteer datum en regel. <sub>(T207-e, T206-e, T208-b)</sub>
- [ ] **K9. Outreach.** Keur de courtesy note en de co-announce tekst in `docs/launch/LAUNCH-OUTREACH-DRAFTS.md` goed, vul de placeholders in en stuur met de hand. Beslis wie een note krijgt (CARTO, OpenTripMap, Open-Meteo, Exchange Rate API) en lees eerst de gebruiksvoorwaarden van UNESCO. <sub>(T336-a, T336-b)</sub>
- [ ] **K10. Go of no-go, dan launch (T236).** Zeg daarna: "launched; run wave 21". <sub>(T207-a)</sub>
- [ ] **K11. Na de launch.** Core Web Vitals uit het veld na een maand verkeer; de eerste geïndexeerde datum en de datum van de eerste sitemap in het T239-sheet. <sub>(T200-g, T222-f)</sub>

---

## Langlopende contacten (start ze vroeg)

Deze contacten liggen op de klok van iemand anders: het versturen kost minder dan een uur, het antwoord duurt weken. Ze komen uit de oude long-lead tracker (nu `docs/history/LONG_LEAD_TRACKER.md`), die sinds 2026-09-28 overal "not started" zei. De advocaat, de boekhouder, Hostelworld en LiteAPI, Google Play en EUIPO staan al in blok 5 en blok 10.

- [ ] (controleren) **L1. Culture Routes Society** (Turkije, ontgrendelt de hele Turkse sectie). Bepaal eerst wat je terug aanbiedt.
- [ ] (controleren) **L2. Tasuleasa Social** (Via Transilvanica).
- [ ] (controleren) **L3. Via Dinarica-programma, HPS (Via Adriatica) en Greek NECCA.**
- [ ] (controleren) **L4. Omio en Flix.** De concepten staan in `docs/tos/omio_outreach.md` en `docs/tos/flix_outreach.md`.
- [ ] (controleren) **L6. Belgische vervoerders: SNCB, De Lijn, STIB, TEC.** Hun voorwaarden sluiten open rijen in het licentieregister.

## Beslissingen die nog van jou zijn

Geen ervan blokkeert een blok hierboven. Eén regel aan Claude per beslissing is genoeg; het verslag achter de rij heeft de opties.

**Prijzen en cijfers**
- [ ] Welke dagprijs elk scherm toont. De bestemmingspagina rekent op twee bases (Rome 87 tegen 99.54 euro per persoon per dag); één trip toont drie verschillende bedragen; de dagplanner volgt wat jij kiest; de landing-claim "no two screens disagree" hangt eraan. <sub>(T374-d, T378-d, T392-c, T411-b)</sub>
- [ ] Hele euro's of twee decimalen op prijzen (PRODUCT.md en carta-design zeggen twee, de kaarten en de Lifestyle trade-off tonen hele euro's). <sub>(T372-e, T391-f)</sub>
- [ ] Volgen de Facts-fold (Budget, Per day) en de suitability strip ook de Lifestyle-slider? <sub>(T173-e)</sub>
- [ ] Hut-tot-hut-weken: een huttentier, of een receipt-regel dat hutten niet geprijsd zijn. <sub>(T099-c)</sub>
- [ ] Het label "Food and drink" accepteren (en de doc aanpassen), of lokaal vervoer laten prijzen. <sub>(T099-d)</sub>
- [ ] Geleende verblijfsprijzen: houden plaatsen die listings van een nabije stad lenen het niveau city, en hoe ver mag een meting reizen? <sub>(T209-d)</sub>
- [ ] Een getypt budgetplafond aanbieden in plaats van de kostenband? <sub>(T188-c)</sub>
- [ ] Prijs bewaren bij opslaan, zodat My trips prijswijzigingen toont? <sub>(T379-c)</sub>

**Schermen en flow**
- [ ] Welke categorie de Destinations-tab opent voor een eerste bezoek (nu Trips, terwijl PRODUCT.md de wandelaar eerst noemt). <sub>(T373-c)</sub>
- [ ] De tekst van de dekkingsregel op Destinations goedkeuren zodra die het doel noemt. <sub>(T373-e)</sub>
- [ ] Opent de home alleen bij een eerste bezoek; blijven het merkteken en de navigatie zoals ze zijn? <sub>(T194-a)</sub>
- [ ] De Stay-stap van de wizard: verwijderen samen met beide build-your-own-ingangen, of houden. <sub>(T364-a)</sub>
- [ ] Blijft "What have you booked already?" de eerste wizardstap, of wordt het een vraag in From? <sub>(T377-d)</sub>
- [ ] De nieuwe tekst voor drie planner-strings die nog vluchtprijzen beloven (`trip.launcherSub`, `wizard.flexNote`, `wizard.flexPadBtn`). <sub>(T377-c)</sub>
- [ ] Autotrips: terug via de settings-regel, of de dode code en URL-keys (`choices.drive_home`, `transport_mode`, `baggage_key`) weg. <sub>(T370-c)</sub>
- [ ] Mag de pass-dialoog vanzelf opengaan op het moment dat een trip gepland is? <sub>(T411-e)</sub>
- [ ] Afstanden en aankomsttijden tussen stops terug in de dagplanner? <sub>(T378-e)</sub>
- [ ] De ster van de shortlist kleurt `--accent`, tegen de regel dat accent geen selectiekleur is: welke kleur? <sub>(T393-d)</sub>
- [ ] Bevestig de nav-wijziging (sentence-case, inactieve tabs in `--ink-soft`). <sub>(T186-e)</sub>
- [ ] De design calls die onder jouw delegatie zijn gemaakt (`docs/design-v6/DIRECTION.md` deel 9) laten staan of terugdraaien. <sub>(T380-a)</sub>
- [ ] V4-6, een eerste foto naast de kop vanaf 1024 px, alsnog bouwen? <sub>(T395-g)</sub>
- [ ] De dagtrack ook op de samengestelde trippagina (`TripPage.jsx`)? <sub>(T162-c)</sub>
- [ ] Een korte versie per trip laten cureren (`shortDays`), en een lange versie van tien tot veertien dagen maken (daar hangt T173-d aan)? <sub>(T101-a, T101-b)</sub>
- [ ] Een vertaalde, gecontroleerde tag-woordenlijst? <sub>(T089-b)</sub>
- [ ] De 20 px pack-iconen op ware grootte bekijken op een trippagina, ok zeggen of de slechte noemen. <sub>(T168-b)</sub>

**Buitenlagen**
- [ ] Drukte per maand voor stranden: de schatting van spec D7 bouwen of niet. <sub>(T181-c)</sub>
- [ ] Trail-kaart: een kort hoogteprofiel op de lijst-wire, of de hellingsmix houden. <sub>(T181-h)</sub>
- [ ] De bergpagina noemt de weg omhoog twee keer: banner inkorten tot de toegang? <sub>(T182-g)</sub>
- [ ] De rail of carrousel die T183 bouwde vastleggen of afwijzen. <sub>(T183-b)</sub>
- [ ] De twee geschrapte rail-intenties ("Under two hours from an airport", "Quiet in August") definitief schrappen of drukte koppelen. <sub>(T183-c)</sub>
- [ ] Plaatsen onder reisadvies (Hoverla) of met beperkte toegang (Mount Athos) in een "best-known"-band, of uitsluiten. <sub>(T183-f)</sub>

**Beheer en techniek**
- [ ] `admin_adjust_expiry` ook naar aal2, zoals `admin_set_tier`? <sub>(T365-f)</sub>
- [ ] Na de box: krijgt die een Pages deploy-token, of blijft de deploy na elke weekrun een handstap (G10)? <sub>(T262-a)</sub>
- [ ] Het project-exemplaar van impeccable bijwerken naar v4.5.0? <sub>(T369-b)</sub>
- [ ] De juridische teksten (Imprint, Privacy, Terms) vertalen; vraagt een juridische lezing. <sub>(T401-h)</sub>
- [ ] `src/lib/cheapTips.json` (103 KB, alleen Engels) laten vertalen? <sub>(T377-f)</sub>
- [ ] Een maand na het support-adres: de antwoordtermijn van twee dagen in de Terms zetten in plaats van 30 dagen? <sub>(T216-b)</sub>

## Ooit, geen haast

- [ ] Reflogs opruimen (maakt ruimte vrij; de bundle op `D:\carta-backups` maakt het veilig). Alleen als er geen wave draait: <sub>(T252-a)</sub>
  ```
  git for-each-ref --format='%(refname)' | grep -v '^refs/stash$' \
    | xargs git reflog expire --expire=now --expire-unreachable=now HEAD
  git gc --prune=now
  ```
- [ ] Datalane-wensen die eerst een pipeline-taak van Claude nodig hebben, en dan een run van jou:
  - meeroevers: lengte en swept-vlag uit `osm_water.py` exporteren; <sub>(T182-a)</sub>
  - strand: wandelminuten en daling vanaf parking; <sub>(T182-b)</sub>
  - berg: hoogte van het topstation van de lift; <sub>(T182-c)</sub>
  - trails: een Europese ranglijst `trails/top.json`, en een OV-feit per trailstart; <sub>(T183-a, T373-f)</sub>
  - lokale en exoniemnamen voor zoeken ("Gent"); <sub>(T384-h)</sub>
  - een maandveld voor stranden, bergen en wandelingen; <sub>(T394-b)</sub>
  - ontbrekende strandlengte en -oriëntatie en meeroppervlak. <sub>(T179-d)</sub>

## Vaste regels

- Nooit `supabase db push` tegen `ntssxktaduxzpsmejwyv`. Plak met de hand, eerst een verse dump.
- Productie deployt alleen met de hand: `npm run build:pages`, data push, `npx wrangler pages deploy dist --project-name carta-app --branch main`, dan de prune. Een push naar GitHub deployt niets.
- Eén schrijver tegelijk: geen wave, datalane of pipeline-run naast elkaar (`Get-Process python`).
- Nooit Docker Desktop Clean / Purge data zolang je de trailslab-, Valhalla- en BRouter-volumes wilt houden.
- Geen Claude API, nooit; AI in de app blijft op Gemini.
- Verander je `AI_GLOBAL_DAILY_CAP` ooit blijvend, zet dan de `site_config`-key `ai_global_daily_cap` op hetzelfde getal. <sub>(T042-c)</sub>
- Vóór een her-seed van de trips-tabel: maak de seed opnieuw met `export_sql.py`. <sub>(T332-c)</sub>
- De re-paste-val: bij het plakken faalt niets als een nieuwe plak een latere migratie ongedaan maakt; een feature stopt gewoon. Plak daarom na elke handmatige plak elke latere migratie die haar noemt opnieuw. <sub>(T069-b, T070-b)</sub>

  | Plak je ooit opnieuw | Plak dan ook opnieuw |
  |---|---|
  | 014 | 035 |
  | 016 | 040, en 047 |
  | 017, 040 of 045 | 047 |
  | 018, 033 of 034 | 043, maar nooit 043 na 045 |
  | 020 | 023, 038, 039, 046 |
  | 033 | 034 |
  | 037 of 038 | 039 |
  | 014 tot 019, 024, 032 tot 034, 036 | 045 |
  | 047 of iets dat 048 noemt | 048 |
