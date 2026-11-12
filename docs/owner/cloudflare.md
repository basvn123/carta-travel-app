# Owner procedure: Cloudflare (Pages, R2, Workers, email routing) (T1072, ROADMAP A3)

Deploys, data pushes, tokens and DNS. Data goes to R2 before the site (CLAUDE.md, Deploy). When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Checked against the live account and rewritten by the owner sweep of 2026-11-12 (`.work/2026-11-12-owner-deploy/report.md`): done and obsolete steps are gone, duplicates merged. Claude's Wrangler login has **zone read only**, so the dashboard clicks in part 2 (WAF, Cache Rules, email routing, Access) stay with the owner.

## 1. The next live ship (orchestrator or owner, from `main`, in this order)

1. **Ask index:** done 2026-11-12 (orchestrator) and shipped; `/api/ask` answers. Rebuild it before a ship whenever the destination data changed.
2. **Prerender (T221-a):** from `continent-app/`, `node scripts/prerender/build.mjs --data public` (add `--cards` for share cards), then `node scripts/prerender/push.mjs --rclone-dry-run`, then `node scripts/prerender/push.mjs --live`. The laptop's R2 key is scoped to the bucket `carta` and gets 403 on `carta-prerender`: if the push says AccessDenied, open Cloudflare, R2, Manage API tokens, edit that token, add the bucket `carta-prerender` with Object Read & Write, save, and run the push again. Today every content path (`/france`, `/belgium/ghent`) answers 404 and `/sitemap.xml` is the one-URL placeholder, because the bucket is empty. Delete `dist-prerender/` after the push.
3. **Pages secrets (T1139-b):** from `continent-app/`, run `npx wrangler pages secret put <NAME> --project-name carta-app` and paste the value at the prompt, for `SUPABASE_URL` (`https://ntssxktaduxzpsmejwyv.supabase.co`), `SUPABASE_SERVICE_ROLE_KEY` (the service_role row of `supabase projects api-keys --project-ref ntssxktaduxzpsmejwyv`) and `AI_EVENTS_SALT` (64 random hex characters: `python -c "import secrets;print(secrets.token_hex(32))"`). Check: `npx wrangler pages secret list --project-name carta-app` lists the three. They reach the site with the deploy in step 4. (The sweep's attempt was refused by the session's permission guard.)
4. **Ship (T1162-c, T1079-b, T1117-a, T1137-a, T1140-a):** shipped live 2026-11-12 by the orchestrator (build, css, data, preview, main; the laptop master was moved aside so the build kept the live schema-20 wire, see ROADMAP D3 note). **Left for the owner: the prune**, `node scripts/ship.mjs --live --from prune`, type `delete` when asked. For the next ship: `node scripts/ship.mjs`, then `node scripts/ship.mjs --live`. The preflight now fails if `continent-app/wrangler.toml` has a key Pages refuses (the T1157 `[[ratelimits]]` tables made every Pages deploy fail; removed 2026-11-12). Step 6 (prune) asks for a typed `delete` and also removes the 29 stale tile files of T785-a.
5. **Look at the live site (T883-b; the 2026-11-12 ship went straight to main):** at 390 and 1440 px, Help me choose, then Trips for you, then a planned trip page; the Kaart view draws its map.
   **Beach photos from Carta's own copies (T052-a), on a later preview:** `rclone copyto r2:carta/img/manifest/beaches.json cache/img_manifest/beaches.json`, rebuild the beaches layer (it must print "image ladder joined into N of M" with N above 0), build and deploy to the preview, then measure LCP (when the main photo appears) on one beach page with the switch in `continent-app/src/lib/pictureFlag.js` off and on, three runs each in Chrome DevTools Performance. Turn it on for production only if LCP is not worse.
6. **After production is live:** headers checked live 2026-11-12 (COOP, permissions-policy and CSP present; T1079-b); still to check: a trip's print view opens; `/?legal=privacy`, `terms` and `imprint` show the T319 text (T227-b); Ask answers in 2 or 3 warm sentences; `curl -sI https://www.carta-europetravel.com/sitemap.xml` is 200 `application/xml`, not the placeholder; `node continent-app/scripts/r2/verify-data.mjs` passes.
   Added by owner sweep round 2 (orchestrator after the ship, all Claude):
   - **T224-a:** `for p in /spain/malaga/cost /spain/4-days /spain/4-days/under-80 /sitemap-costs-en.xml; do curl -sI "https://www.carta-europetravel.com$p" | grep -iE '^HTTP|x-carta-prerender'; done` shows 200 and `x-carta-prerender` for each page.
   - **T1076-f, T1113-d:** a thin place and a trail send `noindex,follow` in the head (`curl -s <path> | grep -i 'name="robots"'`) and in `x-robots-tag` (`curl -sI`); a trip page's canonical points at itself; `sitemap-destinations` holds the expected count.
   - **T1212-d:** `curl -sI https://www.carta-europetravel.com/nl/` is 200 with `x-carta-prerender`.
   - **T1101-a, T1101-b:** from the main checkout, `node continent-app/scripts/ask-eval-live.mjs --endpoint https://www.carta-europetravel.com` (the "quiet lake" case is in the golden set since round 2); then ask five questions at 390 and 1440 px and check the written line names only places on the first three cards.
   - **T1114-a, T1125-a:** production before this ship had no price notes and no `?legal=support` / `?legal=press`; look at the price notes (en and nl) and at Help and the press kit at 375 and 1440 px. Explore and Plan already passed on 2026-11-12.
   - **T1090-a:** `cd continent-app && node scripts/verify_csp.mjs --url https://www.carta-europetravel.com` in Chromium and WebKit, plus one prerendered page and a trip's print view styled.

## 2. Cloudflare dashboard (owner: zone settings Claude cannot write)

- **T1079-a, T1157-a, rate limit on /api/:** Security, WAF, Rate limiting rules, Create rule. Name `api per IP`; when URI Path starts with `/api/`; counting by IP; 30 requests per 10 seconds; action Block for 10 seconds. Deploy. This is now the only cross-isolate limit, because Pages refuses rate limit bindings. Check: `for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code} " "https://www.carta-europetravel.com/api/forecast?lat=50&lon=4"; done` ends in 429s.
- **T231-d, T049-e, edge copies of the data and photo hosts:** Caching, Cache Rules, Create rule. Name `R2 data and photos`; when Hostname equals `data.carta-europetravel.com` OR Hostname equals `cdn.carta-europetravel.com`; Eligible for cache; Edge TTL: use the cache-control header if present. Deploy. Check: run `curl -sI https://data.carta-europetravel.com/data/beaches/index.json` twice; the second shows `cf-cache-status: HIT` (today `DYNAMIC`).
- **T461-a, the hello@ mailbox:** Email, Email Routing, Get started (it adds the MX and SPF records), destination = your own inbox; Routing rules, Create address `hello@carta-europetravel.com`, action Send to your inbox. Click the link in the verification mail. Check: a mail to hello@ from another account arrives. (Today Email Routing is off and the domain has no MX record. The same in Wrangler: `npx wrangler email routing enable carta-europetravel.com`, `npx wrangler email routing addresses create <you>`, `npx wrangler email routing rules create carta-europetravel.com --match-type literal --match-field to --match-value hello@carta-europetravel.com --action-type forward --action-value <you>`; the sweep's permission guard refused them.)
- **T1167-a, the private docs site:** Workers & Pages, Create, Pages, Direct upload, name `carta-docs`. Then Zero Trust, Access, Applications, Add, Self-hosted, domain `carta-docs.pages.dev`, policy Allow, Include Emails = your address. Build the site the way `.github/workflows/docs-site.yml` does and run `npx wrangler pages deploy .docs-site --project-name carta-docs`. Check: the URL asks for a login code. The docs Ask index step (T1168-a) is already in `docs-site.yml` and green in CI.
- **T221-b, Functions quota in the first month after launch:** Workers & Pages, carta-app, Metrics: Functions requests stay under 100,000 a day (a full crawl is about a third).

## 3. Owner only, outside Cloudflare

- **T315-b, affiliate IDs:** the site is built on the laptop and uploaded, so the IDs go in `continent-app/.env`, not in the Pages settings: `VITE_TP_MARKER` (Travelpayouts marker), `VITE_OMIO_TRACKING_LINK`, `VITE_GYG_PARTNER_ID`, `VITE_VIATOR_PID`, only for programmes you have joined. Check: after the next ship, an Omio or GetYourGuide link on a trip page carries the ID.
- **T235-c, an outside uptime monitor:** a free UptimeRobot account, three HTTP monitors every 5 minutes with your email as alert contact: `https://www.carta-europetravel.com/` (200), `https://data.carta-europetravel.com/data/beaches/index.json` (200), `https://ntssxktaduxzpsmejwyv.supabase.co/auth/v1/health` with header `apikey: <anon key>` (200). The GitHub `uptime.yml` probe already runs every 15 minutes; this is the second layer.
- **T212-a, share cards after the ship:** paste `https://www.carta-europetravel.com/` into the Facebook Sharing Debugger, the LinkedIn Post Inspector and an X post draft, and send it in a WhatsApp and an iMessage chat: each shows the Carta card (`/og/site.png` answers 200 today).

## 4. Flight sweep

- **T1213-g, stop Google Flights before the first paid sale** (decided 2026-11-12: at the moment Stripe goes live, not before, because the fares have no replacement yet). In `continent-app/workers/flight-sweep`: `npx wrangler secret put LADDER_STOP_GOOGLE_FLIGHTS`, value `1`. On the box: add `LADDER_STOP_GOOGLE_FLIGHTS=1` to `~/.config/carta/env`, then `sudo systemctl restart carta-late-sweep.service` (the late sweep reads the same switch since T1213-d, once the box runs this code). Check: `node scripts/flight-sweep.mjs nights --since <today>` shows no new jobs after the switch.

## 5. Waiting on another step

Round 2 (2026-11-12) moved the box, data and engineering steps that were here into their ROADMAP items (H9, D7, K2); what is left needs the R2 credential or the admin login.

- **T269-e**: After the first real derive runs, run `derive.py gc` against the live img/ listing and img/manifest copy, read gc-plan.json, then repeat with --apply (needs the R2 credential)
- **T039-c** (register order: 14): Read the live hit rate off the admin panel a week after the redeploy and record it; the offline replay (48 keys to 18) is a simulation, and the first week is depressed by the v5 cache starting cold
- **T042-e** (register order: 18): Read the cap refusal counts a week after the redeploy, in the same sitting as the cache rate T039-c asks for; both start empty and the first week of each is not a usable baseline

## Moved from unsorted.md (owner sweep 2026-11-12)

| ID | Item | Order |
|---|---|---|
| T1120-b | Add the exact ingest host to connect-src in public/_headers, set VITE_ERROR_DSN and the SENTRY_DSN Pages secret, redeploy |  |
| T1171-a | The Pass moment is built behind PASS_MOMENT (off); the closed beta tests it with ?pm=on and the owner decides whether to set the flag true (procedure in docs/design/pass-moment.md, Turning it on) |  |
| T1176-c | Post the Show HN draft (`report T1176`) only once the free part of Carta needs no signup |  |
