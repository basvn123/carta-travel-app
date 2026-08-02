# Credential setup, source by source

Every account below is free unless marked otherwise. Work top to bottom: the
first block is instant self-service, the second needs a registration step
before URLs can be pasted into `.env`, the third is restricted or commercial.
All vars go in the repo root `.env` (copy from `.env.example`). After adding
keys, `python -m src.ingestion.run_all --list` shows what still reports
"needs:", and a normal run turns those SKIPs into pulls. Portal links probed
live 2026-07-31.

## Instant self-service keys

### 1. Kaggle (renfe_kaggle: Renfe AVE pricing archives) [DONE 2026-07-31]
1. Create an account at https://www.kaggle.com
2. Profile picture > Settings > API > create a token. New accounts get a
   unified token (`KGAT_...`): paste it into `KAGGLE_API_TOKEN=` (needs
   kaggle client 2.x, which requirements.txt installs)
3. Legacy alternative: a downloaded `kaggle.json` saved as
   `C:\Users\<you>\.kaggle\kaggle.json`, or its values in
   `KAGGLE_USERNAME=` and `KAGGLE_KEY=`

### 2. Trafiklab, Sweden (sweden + nordic_ferries regional feeds)
1. Create an account at https://www.trafiklab.se
2. Dashboard > create a project
3. Add APIs to the project, each issues its own key instantly:
   - "GTFS Sweden 3" -> `TRAFIKLAB_GTFS_SWEDEN_KEY=`
   - "NeTEx Sweden" -> `TRAFIKLAB_NETEX_SWEDEN_KEY=`
   - "GTFS Regional" (archipelago ferries) -> `TRAFIKLAB_GTFS_REGIONAL_KEY=`

### 3. Mobility Data Austria (austria: NeTEx + GTFS, rail/bus/tram/cableway)
1. Register at https://data.mobilitaetsverbuende.at
2. Confirm the email, accept the licence terms
3. Your login credentials ARE the config, no separate key:
   `MOBILITYDATA_AT_USER=` and `MOBILITYDATA_AT_PASSWORD=`
   (the collector fetches its own OAuth token via their Keycloak)

### 4. opentransportdata.swiss (switzerland: SBB GTFS, NeTEx, HRDF) [FIXED 2026-07-31]
1. Create an account at https://opentransportdata.swiss/en/, then open the API Manager
2. Select the **CKAN** API tile, "Read more", then "Access with this plan"
   (you must be logged in to see that button)
3. In "Select an App", give it a name (e.g. "carta-ingestion") and description
4. Open the app under "my apps"; copy the TOKEN shown there (not the token hash)
5. Paste into `OTD_SWISS_TOKEN=` — the collector sends it as
   `Authorization: Bearer <token>` (confirmed live; the bare header without
   "Bearer " 401s)
   You only need the CKAN plan: it's the one behind catalog/resource
   metadata and downloads, which is all this collector uses.

### 5. OpenSky Network (opensky: per airport arrival/departure histories)
1. Create an account at https://opensky-network.org
2. Account settings > API client: create a client, note client id + secret
3. `OPENSKY_CLIENT_ID=` and `OPENSKY_CLIENT_SECRET=`
   (without these the collector still takes the Europe states snapshot)

### 6. GitHub token, optional (ryanair_archive: higher search rate limits)
1. https://github.com/settings/tokens > "Generate new token (classic)"
2. No scopes needed for public repo search and zipballs
3. `GITHUB_TOKEN=`

### 7. De Lijn, Flanders (data.delijn.be portal) [DONE 2026-07-31]
1. Register at https://data.delijn.be
2. Subscribe to the free "Open Data Free Subscribe Here" product
3. The subscription page shows primary/secondary keys; either one goes in
   `DELIJN_API_KEY=`
   Not currently consumed by any collector (De Lijn's GTFS static/realtime
   duty moved to #8 below, the unified gateway); reserved for a possible
   future pull of "Open Data Timetables Other formats" (NeTEx/BLTAC), which
   only exists on this portal.

### 8. Unified Belgian opendata gateway (belgium: GTFS static + realtime for
    De Lijn, SNCB/NMBS, STIB/MIVB, TEC, all four operators in one place)
    [FOUND + WIRED 2026-07-31]
1. Portal: https://api-management-opendata-production.developer.azure-api.net
   (a separate subscription from data.delijn.be -- confirmed a different
   Azure APIM instance, not the same account)
2. Subscribe to the **Standard** product
3. Copy the Primary key into `BELGIUM_OPENDATA_KEY=`
4. Sent as `Ocp-Apim-Subscription-Key`. Confirmed live 2026-07-31: the real
   request host is `api-management-opendata-production.azure-api.net` (NO
   "developer." prefix -- that subdomain is the docs/subscribe portal only
   and 404s every API path). Auth was confirmed correct (quota/rate-limit
   responses came back instead of "invalid key" ones), but the account hit
   a ~24h call-volume quota during verification testing, so a first real
   run may need to wait out that window before files actually download.
   Supersedes the old separate TEC (opendata.tec-wl.be) and STIB
   (opendatasoft) sources previously listed here, and adds GTFS-realtime
   (alerts, trip updates, vehicle positions) for all four operators, which
   none of the old individual sources provided.

## Registration first, then paste account URLs

### 9. gtfs.de account links (germany: fv/rv/nv split feeds, currently 403)
1. Register at https://gtfs.de/en/ (free tier, attribution required)
2. Your account page lists personalised latest.zip download links for the
   long distance / regional / local splits
3. Paste them comma separated into `GERMANY_FEED_URLS=`
   (the full national aggregate already downloads without an account)

### 10. Mobilithek, Germany (germany: NeTEx publications)
1. Register at https://mobilithek.info (BundID or simple account)
2. Find a publication (e.g. DELFI NeTEx), create a subscription to it
3. Copy the subscription's download URL(s) into `MOBILITHEK_URLS=`

### 11. Rejseplanen Labs, Denmark (denmark: national GTFS incl. ferries)
1. Open https://labs.rejseplanen.dk in a browser (it 403s bots, loads fine
   interactively) and follow the data access signup
2. The developer account gives stable GTFS download URLs
3. Paste into `DENMARK_FEED_URLS=`

### 12. FinAP / Traficom, Finland (finland: operator NeTEx/GTFS downloads)
1. Register at https://finap.fi (free)
2. Browse the catalogue, copy the download URLs of the operator packages
   you want
3. Paste into `FINLAND_FEED_URLS=`
   (the open Digitraffic rail JSON needs nothing and already flows)

### 13. NDOV Loket, Netherlands (netherlands: gated NeTEx folders)
1. The front door redirects to https://govi.nu ; request an account via the
   contact/application form (they email credentials)
2. `NDOV_USER=` and `NDOV_PASS=` (used as basic auth on data.ndovloket.nl)
   (the national GTFS via OVapi is CC0 and already flows without this)

### 14. ERA / RINF (era: deep register exports)
1. Request an account through the RINF application at https://rinf.era.europa.eu
2. Once inside, copy the export/search URLs you want mirrored
3. Paste into `ERA_EXPORT_URLS=`
   (the public register pages and the data.europa.eu ERA catalogue are
   already scraped without an account)

## Restricted or commercial

### 15. EUROCONTROL DDR / ADRR (eurocontrol_ddr: trajectories, capacity files)
1. Requires a OneSky Online account plus a signed research data agreement:
   start at https://www.eurocontrol.int/ddr ("How to access")
2. Approval is manual and can take weeks; aimed at research bodies
3. There is no API: export files manually, drop them into
   `data/staging/eurocontrol/`, the sweeper manifests them on the next run

### 16. Ferryhopper (ferryhopper: Mediterranean schedules + base fares)
1. Commercial aggregator: request partner/API terms via
   https://www.ferryhopper.com/en/ (partnerships contact)
2. With an agreed endpoint, set `FERRYHOPPER_API_TMPL=` (placeholders
   {origin} {destination} {date}) and your `FERRYHOPPER_PAIRS=`
3. Until then the collector samples the public widget gently (3 s pacing);
   keep it that way, their ToS applies
