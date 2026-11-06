# Request paths

What the traveller's browser fetches, from where, on the seven paths that matter: first load, Explore, place page, Plan, Ask, plan-day and account sync. Written by T1166 (ROADMAP B5) from the code on 2026-11-06; file references are `continent-app/` paths unless they start with `supabase/`. The field by field lineage of what these files hold is in [lineage.md](lineage.md); the parts themselves are in [README.md](README.md). `scripts/docs/build_lineage.py --check` fails when a path heading below loses its diagram or a file named in backticks stops existing.

Hosts:

- **Pages**: the app host, same origin (Cloudflare Pages, project `carta-app`).
- **R2**: the data host, `data.carta-europetravel.com`. A path goes there only when it is in `R2_TIER` (`continent-app/src/lib/dataHost.js`) and the build sets `VITE_DATA_BASE`; until the owner cuts over, the same path is served by Pages. `search/ask` stays on Pages either way (`PAGES_KEEP`).
- **Function**: a Pages Function under `continent-app/functions/`.
- **Supabase**: Postgres through supabase-js (`.from()`, `.rpc()`), Auth, and Edge Functions under `supabase/functions/`.
- **CDN**: images on `cdn.carta-europetravel.com` (`continent-app/src/lib/imageLadder.js`); map style and tiles from CARTO basemaps.

Not found anywhere in the app: a Supabase realtime subscription, a fetch of `joins.json`, a screen that calls the `destinfo/` loader (`continent-app/src/lib/destInfo.js`).

## First load

The shell and the boot index come from Pages; the boot index preloads from `index.html`. The rank tier lets the first screen rank every place before any country file lands; the country files follow at low priority when the browser is idle (`continent-app/src/hooks/useAppData.js`). Auth is lazy: a guest with no stored session paints without waiting for Supabase (`continent-app/src/auth/AuthContext.jsx`). A crawler or a deep link to a place path goes through the catch-all Function `continent-app/functions/[[path]].js`, which splices a prerendered page from the private R2 bucket into the shell.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant P as Pages
  participant F as Function [[path]].js
  participant PR as R2 carta-prerender (private)
  participant R as R2 data host
  participant SA as Supabase Auth
  participant DB as Supabase Postgres
  alt crawler or deep link on a prerendered route
    B->>F: GET /{country}/{place} (routes in public/_routes.json)
    F->>PR: env.PRERENDER.get(key)
    F->>P: env.ASSETS.fetch(/) for the shell
    F-->>B: shell with the prerendered page spliced in
  else app route
    B->>P: GET / (index.html, JS, CSS, font)
  end
  B->>P: GET /boot.json (preloaded, appData.js)
  B->>R: GET /dest/_rank.json?v=hash (catalogue.ensureRank)
  Note over B: first paint from boot plus rank
  B->>R: GET /dest/{cc}.json?v=hash, one per country, idle and low priority
  opt stored session
    B->>SA: auth.getSession, onAuthStateChange (supabase-js lazy-loaded)
  end
  B->>DB: select site_config (maintenance gate, announcement bar)
  B->>R: stays manifest and files (see Plan)
```

## Explore

Pins come from the boot index already in memory. Country files load for the viewport and for a selected place; the search index and the guided search table load when the tab needs them. Region files belong to the Country and Region pages, not to the Explore tab (`continent-app/src/lib/regions.js`). `continent-app/src/hooks/useExploreCatalog.js` makes no request: it derives rows from the catalogue.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (ExploreTab.jsx)
  participant R as R2 data host
  participant C as CARTO basemaps
  participant I as Image CDN
  Note over B: pins from boot.json, already loaded
  B->>C: GET voyager-gl-style/style.json, then vector tiles (maplibre, prefetched on idle)
  B->>R: GET /search/guided.json (guidedData.js, when the tab is active)
  B->>R: GET /search_index.json (searchIndex.js, on first search)
  B->>R: GET /dest/{cc}.json for the viewport (catalogue.ensureViewport, from the detail zoom)
  B->>R: GET /dest/{cc}.json for a selected place (catalogue.ensureIds)
  B->>I: GET /img/{ab}/{cd}/{hash}/{w}.avif or .webp (card and hero images)
  opt Country or Region page
    B->>R: GET /region/index.json, /region/{file}
  end
```

## Place page

`continent-app/src/browse/DestinationPage.jsx` fetches two files: the dossier and the POI shard. Bed prices come from the stays store filled at boot, and photos from the image CDN. The forecast Function is called by trip and day planner widgets, not by the place page; it is drawn here because it is the one live call a place's weather makes.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (DestinationPage.jsx)
  participant R as R2 data host
  participant I as Image CDN
  participant F as Function api/forecast
  participant M as MET Norway
  Note over B: record from the country file, bed prices from the stays store
  B->>R: GET /dossier/{ID}.json (dossier.js)
  B->>R: GET /poi/{shard}.json (fetchDestPois in appData.js)
  B->>I: GET hero and gallery images (HeroImage, PhotoGallery)
  opt day planner, trip page or peak facts
    B->>F: GET /api/forecast?lat&lon&altitude (weather.js)
    F->>F: RATE_LIMIT binding check
    F->>M: GET locationforecast 2.0 complete (edge cache 30 min)
    F-->>B: seven daily rows, or 502 and no forecast
  end
```

## Plan

The planner reads more than any other path. Travel times come from the reach table of the chosen origin. Bed prices come from two copies, the baked `stays/` and the monthly `stays-live/`, and the newer `built` wins (`continent-app/src/lib/staysData.js`). Swept fares always come from the data host, even before the cut-over (`continent-app/src/lib/flights/flightData.js`). Live fares go through `continent-app/functions/api/flights.js`. Ready-made trips and journeys load on demand. A signed-in traveller's plan is saved to Supabase.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (PlanFlow, GuidedTripWizard)
  participant R as R2 data host
  participant F as Function api/flights
  participant G as Google Flights
  participant DB as Supabase Postgres
  B->>R: GET {meta.stays.url}manifest.json (stays-live, no-cache)
  B->>R: GET /stays/v1/{cc}.json and {liveBase}{cc}.json, newest built wins
  B->>R: GET /reach/{origin}.json (reach.js)
  B->>R: GET /flights/_index.json, /flights/{IATA}.json (always the data host)
  opt live fares for a date
    B->>F: GET /api/flights?o&d&date (useLiveFlights.js)
    F->>F: caches.default, then RATE_LIMIT
    F->>G: searchDay (workers/shared/flightSearch.mjs), edge cache 1 h
    F-->>B: fares
  end
  opt ready-made trips and journeys
    B->>R: GET /trips/index.json, top.json, {cc}.json, trip/{k}.json
    B->>R: GET /journeys/index.json, type/{k}.json, journey/{k}.json
  end
  opt signed in
    B->>DB: upsert trip_plans, trip_plan_stops (tripPlanStorage.js)
  end
```

## Ask

Retrieval runs twice in parallel: BM25 in the browser and a dense search in `continent-app/functions/api/ask.js`, which embeds the question with a static model and reads its index from the deploy's own assets (no KV and no AI call). The written answer streams from `continent-app/functions/api/ask/answer.js` on Workers AI, behind a KV answer cache and a daily Neurons counter. If the traveller turned it on, an on-device model answers instead. A cap or a failure leaves the facts-only answer; retrieval works on BM25 alone when the dense call fails.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (AskChat.jsx)
  participant P as Pages
  participant R as R2 data host
  participant FA as Function api/ask
  participant FW as Function api/ask/answer
  participant KV as KV ASK
  participant AI as Workers AI
  B->>R: GET /search_index.json
  B->>P: GET /search/ask/lexicon.json (Pages, PAGES_KEEP)
  par per question
    B->>P: GET /search/ask/bm25.json (once), BM25 in the browser
  and
    B->>FA: GET /api/ask?q&src&cc&d&u
    FA->>FA: RATE_LIMIT check
    FA->>P: env.ASSETS.fetch /search/ask/ manifest, vocab, emb, passages
    FA-->>B: dense hits (static model2vec embedding)
  end
  alt on-device answer switched on
    B->>R: model files from /ask/model/ (WebLLM)
  else server answer
    B->>FW: POST /api/ask/answer (server-sent events)
    FW->>FW: RATE_LIMIT check
    FW->>KV: get answer cache, get and put the daily Neurons counter
    FW->>AI: run qwen3-30b-a3b-fp8, fallback llama-3.2-3b-instruct
    FW->>KV: put the answer
    FW-->>B: streamed answer
  end
```

## plan-day

`continent-app/src/planner/aiDayPlan.js` invokes the Edge Function with the traveller's token. The function checks the key and the user, takes a pass quota through the `ai_consume` rpc, answers from `ai_plan_cache` when it can, and otherwise calls Gemini over its model chain. Never the Claude API (CLAUDE.md).

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (aiDayPlan.js)
  participant EF as Edge Function plan-day
  participant SA as Supabase Auth
  participant DB as Supabase Postgres
  participant GM as Gemini
  B->>EF: functions.invoke plan-day (dest, date, days, candidates, pace, vibe, lang)
  EF->>EF: no GEMINI_API_KEY gives 503 no_ai
  EF->>SA: auth.getUser with the caller's token (401 auth on failure)
  EF->>DB: rpc ai_consume (skipped for a valid refine token)
  alt over the user or global cap
    EF->>DB: insert ai_cap_events
    EF-->>B: 429 user_cap or global_cap
  else allowed
    EF->>DB: select ai_plan_cache, insert ai_cache_events
    opt cache miss
      EF->>GM: POST generateContent over the model chain
      EF->>DB: upsert ai_plan_cache, insert ai_model_events
    end
    EF-->>B: summary, stops, totals, pass tier and plans left, refine token
  end
  opt failure in the browser
    B->>DB: rpc log_edge_error (edgeFailure.js)
  end
```

## Account sync

Local storage stays the source for a guest. On sign-in the sync modules load lazily, merge the local kinds (kept, journey, trip, device trip) with `account_things`, and write back; they sync again on the app's save events, on `storage` and on `visibilitychange` (`continent-app/src/auth/accountSync.js`). Settings, saved trips, plans, day plans, Ask history and the Together tables are plain reads and writes; there is no realtime subscription.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant LS as localStorage
  participant SA as Supabase Auth
  participant DB as Supabase Postgres
  participant P as Pages
  B->>SA: signInWithPassword, signUp or Google OAuth (AuthContext.jsx)
  B->>DB: select account_things (accountThingsCloud.js)
  B->>LS: read kept, journey, trip, device_trip
  B->>DB: upsert account_things (merged)
  B->>LS: write the merged kinds
  loop on carta:kept, carta:journey-saves, storage, visibilitychange
    B->>DB: sync account_things again
  end
  B->>DB: select and upsert user_settings, insert saved_trips (useAccountSync.js)
  B->>DB: trip_plans, trip_plan_stops, profiles, day_plans, ask_chats
  B->>DB: select entitlements, rpc ai_status (useEntitlement.js), email_prefs
  opt Together
    B->>DB: friendships, group_trips and their options, votes, budgets, members, expenses
    B->>DB: rpcs list_friend_trips, get_friend_trip, group_trip_people, group_trip_band, group_pay_links
  end
  B->>P: GET /europe_map.json (My trips map)
```
