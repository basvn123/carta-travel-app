# Owner runbook: your manual steps, in order, so the waves can run on their own

Written 2026-10-04 from everything that was still open: `_OPEN-MASTER.md` (stages
and Part E, written 2026-10-02), the 282 open rows with Owner `user` in
`_OPEN.md`, the wave log in `_WAVES.md` up to wave 15, and
`P9/_OPEN-paid-runs.md`. Use this file to see what you have to do. `_OPEN.md`
stays the record of every row, and a task report wins on detail. Every open
owner row from 4 October appears below under its id, so nothing was dropped.

## How it works

Claude's code work runs in waves (`Execution/_WAVES.md`). A wave runs its
sessions, skips any session that needs you, and the chain carries on. So
everything in this file does one thing: it opens a gate. Each block says what
you do, how long it takes, how you know it worked, what it unlocks, and the
sentence to say to Claude afterwards.

Work down the blocks in order. Blocks B and K are open at any time; do the
other blocks in the order given. Tick a box when its check has passed, not
when you have typed the command.

## Where things stand on 2026-10-04 at 20:30

- Waves 1 to 14 are merged. In wave 15, batch A (T103, T180, T193, T225) is
  merged and batch B (T181, T182, T186) is running now in another session.
  T179, T194 and T209 were skipped because they wait on you.
- Production (Cloudflare Pages, project `carta-app`) still runs the code of
  waves 1 to 5. Waves 6 to 15 are merged but **not deployed**. Root `main` is
  65 commits ahead of GitHub. `continent-app` has no GitHub remote; its code
  reaches GitHub through the root mirror commits.
- Database: 021, 022 and 024 to 048 are **not live**. 018, 019, 020 and 023
  were applied earlier (D1 checks them). 044 belongs to Stripe (block J).
- The laptop: C: has 42 GB free. `data/raw` and eleven cache layers are on R2
  only. Restoring everything takes about 70 GB, **which does not fit**, so the
  data lane pulls only what each run needs (block F).
- 20 skipped sessions are waiting on you: T089, T093, T099, T100, T101, T124,
  T156, T158, T162, T165, T167, T172, T173, T178, T179, T188, T194, T209, T326
  and T333. Block A frees all of them except T178, which waits for F6. (T161
  was settled by T360 on 2026-10-03.)

## What each block unlocks

| Block | You | Time | Unlocks |
|---|---|---|---|
| A | Decisions and approvals | 1 to 2 h reading | the catch-up wave (the skipped sessions), the inputs for waves 17 and 19 |
| B | Housekeeping and security | about 2 h, any time | nothing waits on it, but two items have deadlines (B4 by 2026-11-01, B14 after 2026-10-09) |
| C | Push and deploy waves 6 to 15 | 1 h | users see 4 days of work; GitHub CI runs; needed before block D |
| D | Stage 2: the admin migrations | 45 min | the admin panel, moderation and the GDPR export live; half of wave 17's gate |
| E | Stage 3: Gemini telemetry | 45 min, then 5 min a week later | wave 17 (with D), and the paid runs (block I) |
| F | Light data lane on the laptop | one sentence per run | real data behind the features of waves 10 to 15; T178 and T334 |
| G | Stage 7: the Hetzner box | about 2 days, mostly waiting | wave 18, and the heavy data lane |
| H | Stage 8: images on the CDN | short sessions over 2 weeks | wave 19 |
| I | Paid Gemini runs | approve each spend cap | the P9 measurements |
| J | Business, then Stripe | weeks (entity), then 2 h | wave 20 |
| K | Launch | your calendar | wave 21 |

## The automation, once a gate is open

| Wave | Gate | Opened by |
|---|---|---|
| 15 (rest), 16 | the previous wave merged | nothing from you; runs now |
| 16b, 16c (catch-up) | your answers in block A, applied by T362 | done 2026-10-07; say "run waves 16b and 16c" |
| 17 | stages 2 and 3, pg_cron and pg_net on, T041-a and T081 answered | D, E, A |
| 18 | stage 7.9: the box runs the weekly pipeline | G |
| 19 | stage 8.6 for beaches; a Flickr key for T127 | H |
| 20 | stage 10 (Stripe live) for T210 onward; T140 and T334 after F6 and H | J, F, H |
| 21 | the launch (T236) | K |

To start a chain of waves, say:

> Run waves N to M from Execution/_WAVES.md back to back. Skip any session whose
> gate is still open, note it in the wave log, and stop at the first GATED wave
> whose stage is not done. Ask me before any push.

---

# Block A. Decisions and approvals

Nothing here needs a tool. Fill in the **Answer** column: write `ok` to accept
the recommendation, your own answer to change it, or `later` to keep the gate
shut. A blank cell means not answered, and the gate stays shut. Wave sessions
read only what you write here, so a blank never turns into a yes by accident.

Each recommendation comes from the task report named in its row in `_OPEN.md`.
Where the report gives none, the recommendation is Claude's reading and says
"(inferred)". Answer A1 and A2 first: they free the skipped sessions.

## A1. Design rules (frees the P10 sessions)

carta-design has no rule for these, so the sessions stop. `ok` means: Claude
writes the rule as described into the carta-design skill and `DESIGN.md`, then
the session builds to it, as T360 did for the hero strip.

| Row | Question | Recommendation | Frees | Answer |
|---|---|---|---|---|
| T156 | A rule for the InfoDot (one glossary marker) | --ink-mute dot that opens a popover, tap area at least 44 px (inferred) | T156, then T158 | ok (2026-10-07) |
| T162 | A rule for a carousel (day by day as a swipe track) | Snapping horizontal track with prev and next buttons, arrow keys and dots, as the trips spec describes (inferred) | T162 | ok (2026-10-07) |
| T167 | A rule for swipe flashcards | Swipe allowed only with visible buttons and keyboard equivalents, square corners, no gesture-only action (inferred) | T167 | ok (2026-10-07) |
| T165 | A rule for a sticky section rail | One thin --paper rail with a --rule border and an --ink-fill active item (inferred) | T165 | ok (2026-10-07) |
| T173 | A rule for the lifestyle slider | Extend the existing Lifestyle panel control, never a second one (inferred, from the session's gate note) | T173 | ok (2026-10-07) |
| T179, T180-a | A rule for a bento grid on detail pages | No bento: keep T164's collapsed row list in slot 6 (inferred) | T179 (it then builds the card without the grid) | ok (2026-10-07) |
| T172 | Stacked cost bar (spec E1) or carta-design's receipt rows? | Keep the receipt as the signature; add the bar as a summary above it (inferred) | T172 | ok (2026-10-07) |

Design calls that free no session but close rows:

| Row | Question | Recommendation | Answer |
|---|---|---|---|
| T193-b | Three token pairs fail 4.5:1 contrast (--ink-mute on --paper 3.51, --accent as text 3.40, white on --accent 3.67) | Darken --ink-mute and --accent until every pair passes, because PRODUCT.md promises AA; Claude shows you the new values before merge (inferred) | ok (2026-10-07) |
| T335-b, T193-c | The sm Button is 32 px on a mouse, under the 44 px rule; 719 desktop controls likewise | Bless a fine-pointer-only exception in COMPONENT_ROLES.md; touch stays 44 px (inferred) | ok (2026-10-07) |
| T166-c | Explore has no primary action; its Filters opener is its only filled control on a phone | Make Filters a bordered secondary, like T360's chrome controls (inferred) | ok (2026-10-07) |
| T190-e | Off Explore, the Lifestyle dialog has no scrim and the page behind takes clicks | Add the scrim (inferred) | ok (2026-10-07) |
| T185-a | A day card has no photo to expand into the map | Drop the shared-element morph for days; keep the plain transition (inferred) | ok (2026-10-07) |
| T174-d | Confirm the away-from-cars word lists, the traffic-bar gate, and the trail Underfoot bar on the ink ramp | Confirm as built (inferred) | ok (2026-10-07) |
| T180-h | Confirm the stand-in difficulty scales (cycling climb per km, beach and lake access 1 to 3, "Not graded") | Confirm as interim (inferred) | ok (2026-10-07) |
| T180-i | Move the journey page onto the DetailPage shell? | Not now; keep it on the trips spec layout (inferred) | ok (2026-10-07) |
| T196-b | design-lint does not scan hex colours in JS (map paint) | Allow hex only in one token-mirror module and lint the rest (inferred) | ok (2026-10-07) |
| T246-d | Show an add-to-home-screen hint at all? | Yes, one small secondary hint, rule written first (inferred) | ok (2026-10-07) |
| T168-b | The 20 px pack icons were drawn by hand | You look at them at full size on a trip page and say ok or name the ones to redraw | later: owner reviews the icons on a trip page |
| T059-a | Build production with VITE_CATALOGUE=viewport? | Not yet; there is no rule for the partial-list state | ok (2026-10-07) |

## A2. Product gates (frees the other skipped sessions and the waves after)

| Row | Question | Recommendation | Frees | Answer |
|---|---|---|---|---|
| T211-a | Approve `docs/ONBOARDING_AND_EMPTY_STATES.md` and its three calls: Destinations opens on walks, default dates from the calendar, the airport asked only inside the flight door | Read it (about 30 minutes) and approve or mark changes | T124, T211-b | approved (2026-10-07) |
| T211-d | Approve the revised `docs/FIRST_RUN_RESULT.md` (no Carta flight figure, test question 2 changed) | Read it (about 15 minutes) and approve | T099, then T100, then K3 | approved (2026-10-07) |
| T101 | Price two trip lengths, or state the seven-day assumption? | Two lengths: a short version (3 or 4 best days, own total) and the full week, as spec I2 says | T101, then T188 | ok (2026-10-07) |
| T089 | The orphan fields tags (223 trips), basecamps (177), snapshot (153): show or strip? | Surface tags as filters; strip the other two unless a screen uses them (inferred) | T089 | ok (2026-10-07) |
| T093 | OK the K3 confidence model (sourced, derived, estimated per field) as the one source for all three accuracy signals? | Yes, as the task text says | T093 | ok (2026-10-07) |
| T194, T209 | Is the home page the landing page? | One page: both briefs want the receipt demonstration, honest coverage and one primary action (inferred) | T194, T209 | ok (2026-10-07) |
| T219-a | Feedback loop option A (a Report a problem link, the existing form prefilled, into the existing inbox)? | Option A, with the link beside the price chips too, no migration | T326, T219-b | ok (2026-10-07) |
| T141, T206-c | Upload terms, and the OpenStreetMap permission | A separate per-upload tick "OpenStreetMap may use this track under its contributor terms", wording checked against the OSMF waiver template by Legal (J4) | T333 | ok (2026-10-07) |
| T041-a | Live-grounding allowance printed in the pass offer | 10 on the Trip Pass, 30 on the Year Pass | T148 (wave 17) | ok (2026-10-07) |
| T081 | The channel for silent-failure and drift alerts | Email to you, like the Healthchecks.io heartbeat (inferred) | T081 (wave 17) | ok (2026-10-07) |
| T122 | The mountain target, between 3,000 and 5,000 | The spec gives no number ("not 740, not 60,000"); name one, for example 4,000 | T122 (data lane) | about 5,000 (owner 2026-10-07) |
| T125 | The German trail cap | About 800 of 4,674 listed, the rest searchable but unlisted; other countries uncapped (spec 6.11) | T125 (data lane) | no cap: list broadly in every country, sorted by fame (owner 2026-10-07: 'broaden the coverage, we have space') |
| T311-e | Title rung 1: English Wikidata label first (38 of 92 hikes retitled, e.g. Red Wine Trail)? | Prefer the local label (inferred) | F4 (T107-a) | ok (2026-10-07) |
| T311-a, T311-b | Re-run the full stay anchors after the Geneva refresh? Turn on the footprint anchors? | Geneva refresh yes; footprint anchors on (Mallorca gets its own measured stays) and accuracy from K4 instead of the hold-out (inferred) | F5 | ok (2026-10-07) |
| T112-b, T111-a, T111-c, T113-f | The coverage contract: block only on cells passing today; 45 countries not 47; the three proxies; per NUTS3 only | Accept the ratchet; amend the spec to 45; confirm the proxies as built; keep per NUTS3 and report range misses apart (all inferred) | F2 | ok (2026-10-07) |
| T177-c | Basemap for route trips: Carto Voyager, or a hillshade from a terrain host? | Stay on Voyager until T233 mirrors the terrain tiles to R2, then decide (inferred) | F6 | ok (2026-10-07) |
| T224-b, T221-f | The cost floor that noindexes 2,651 of 3,868 cost pages; which day figure leads (83 or 87 euros for Achensee) | Keep the floor; lead with the app's default Lifestyle figure so page and app agree (inferred) | C6 | index all 3,868 cost pages (owner 2026-10-07); lead figure not chosen, default to the app's Lifestyle figure |
| T098-a | The receipt now names Numbeo, whose terms are unresolved; this is marked "before merge to production" | Deploy: the Numbeo figures are already live and naming the source does not add the risk; settle the use itself in J5 before the first sale (inferred) | Block C | ok (2026-10-07) |

## A3. Admin, moderation and legal (each becomes a small task; nothing waits)

| Row | Question | Recommendation | Answer |
|---|---|---|---|
| T074-c | Should an overdue temporary override stop applying? | Yes, after a 14-day grace period | ok (2026-10-07) |
| T063-e | Do set_tier, reset_quota and unban need TOTP too? | Yes for set_tier; no for reset_quota and unban | ok (2026-10-07) |
| T065-b | Count config, override and feedback saves in the rate budget? | Their own list, so a busy config day cannot block a ban | ok (2026-10-07) |
| T067-d | A public plan whose author has no profile row | Repair the missing profiles once, then refuse publishing without one | ok (2026-10-07) |
| T069-c | Can an owner republish a taken-down guide at once? | No, locked until a complaint is decided | ok (2026-10-07) |
| T069-d | Does a takedown revoke the plan's share links? | Yes | ok (2026-10-07) |
| T068-g, T070-g | How long to keep reports and statements | Reports 12 months with the email cleared on decision; statements 3 years | ok (2026-10-07) |
| T068-d | Notice form: name and good-faith statement; receipt to the notifier | Add the good-faith tick, name optional; receipt and decision by email once J6 exists (inferred) | ok (2026-10-07) |
| T070-c | A content rule in the Terms that moderators can cite, as a separate legal ground | Yes, then a small migration and a form change (inferred) | ok (2026-10-07) |
| T070-e | Is Carta a micro or small enterprise (DSA transparency database)? | Yes, a one-person eenmanszaak is micro, so exempt; confirm (inferred) | ok (2026-10-07) |
| T070-d, T213-a | Email route | One EU provider for Auth SMTP plus a send-mail Edge Function; never the Claude API | ok (2026-10-07) |
| T213-b | The email scope (nine messages, no marketing, reminder deferred); ask counsel about the day 25 offer? | Scope as written; the offer line only with consent | ok (2026-10-07) |
| T213-g | Day 25 offer: credit against the Trip Pass, or the plain Year Pass price? | Plain price until a credit is decided | ok (2026-10-07) |
| T217-d | pass_grants rows vanish when a user deletes the account | Keep the rows with user_id set to null (bookkeeping keeps sales records for years) (inferred) | ok (2026-10-07) |
| T315-e, T270-d | A partial revert on the Audit tab (config and overrides only)? | Decline and close T270-d (inferred) | ok (2026-10-07) |
| T226-a, T318-b | One content type, one platform (the domain), no social, video, podcast or newsletter at launch | Confirm; revisit at the first T240 review | ok (2026-10-07) |
| T204-a | The figure at which paid acquisition reopens | A multiple of the documented EUR 6.85 contribution per purchase, for example 3x, plus channel evidence as the trigger (inferred) | ok (2026-10-07) |
| T205-g | Translate the English-only intros or let derived sentences replace them | Let the derived sentences replace them; no translation cost (inferred) | ok (2026-10-07) |
| T202-a | Build the priced leg from your airport to a trail or summit? | Not now; revisit after launch (inferred) | ok (2026-10-07) |
| T206-d | Ask FFRandonnee for a GR contract? | No; keep French rows on OSM references | ok (2026-10-07) |
| T142-d | Ask Panomax and Roundshot for embed permission? | Leave both dropped until one of them writes | ok (2026-10-07) |
| T310-a, T300-e | 22 ledger sources marked Verify; Ferryhopper, OpenSky and Numbeo terms | Settle per source in J5, before the first sale | ok (2026-10-07) |

## A4. Product and code calls, and permissions

| Row | Question | Recommendation | Answer |
|---|---|---|---|
| T097-c | Show the accuracy figure on the Explore card or in the FAQ too? | FAQ only (inferred) | ok (2026-10-07) |
| T098-b | A short city or country provenance marker on the Explore card receipt? | Yes (inferred) | ok (2026-10-07) |
| T193-f | Travel time from your origin on the Explore card? | In the preview, not the compact card (inferred) | ok (2026-10-07) |
| T103-c | Measure a seasonal food and transport curve? | No; the price row stays stays-only (inferred) | ok (2026-10-07) |
| T146-c | Widen which figures may be estimated beyond food and timeMin? | No (inferred) | ok (2026-10-07) |
| T170-c | The week-shape cut points and timing assumptions | Confirm as written (inferred) | ok (2026-10-07) |
| T176-b | Make the planner's My Maps KML free like the trail GPX? | No, keep it behind the pass (inferred) | ok (2026-10-07) |
| T278-b | Ask which airport you fly home from, instead of inferring it? | Keep the inference (inferred) | ok (2026-10-07) |
| T189-c | A retry when a shared-trip fetch throws? | Yes, for thrown fetches only (inferred) | ok (2026-10-07) |
| T199-b | DualRange has no caller | Delete it (inferred) | ok (2026-10-07) |
| T312-b | The wizard's custom Stay step is unreachable | Remove its code (inferred; the report gives none) | ok (2026-10-07) |
| T255-a | The monthly flight_times task still calls Ryanair | Move it to manual (inferred) | ok (2026-10-07) |
| T121-a | A routable cycle node graph product (NL and BE)? | Not now; keep the mesh summary | ok (2026-10-07) |
| T126-b | May the new image rejects veto a Wikidata P18 image? | No, exempt P18 (inferred) | ok (2026-10-07) |
| T082-f | Should CI read POI shards from the live data host? | No, keep CI independent of production (inferred) | ok (2026-10-07) |
| T084-c | trip-validator as a required check now? | Informational until F1 makes it green (inferred) | ok (2026-10-07) |
| T062-c | Task number T062 is used twice | Renumber the P3 one to T062b in a housekeeping task | ok (2026-10-07) |
| T265-c | Edit applied migration 006's comment, or close T035-c as is? | Close as is; 044 carries the correction (inferred) | ok (2026-10-07) |
| T300-v | Commit `PARALLEL-WAVES-PLAN.md`, `_WAVES.md` and the `_queue` tools? | Yes (inferred) | ok (2026-10-07) |
| T320-b, T252-c | Apply the secret-scan workflow fix written as a diff in the T320 report (the classifier refused it) | Yes; Claude applies it with you present | ok (2026-10-07) |
| T320-a | Add the wave gate script to step 4 of `_WAVES.md` | Yes | ok (2026-10-07) |
| T143-d | Add `jsonschema>=4.23` to requirements.txt | Yes | ok (2026-10-07) |

## A6. Then say

**Done 2026-10-07 by T362** (`Execution/P11/T362-owner-decisions-applied.md`): the rules are in the
carta-design skill and `DESIGN.md`, 76 rows are closed in `_OPEN.md`, six work rows (T362-a to
T362-f) are claimed by the catch-up waves 16b and 16c in `_WAVES.md`, and the four permissions are
applied. The text below is kept as the record of what was asked.

Wait until no wave is running (the last line of the wave log in `_WAVES.md`
names the last wave, and `git worktree list` shows only the main checkout).
Then:

> Apply my answers in Execution/_OWNER-RUNBOOK.md block A: close or update each
> answered row in _OPEN.md as "decided by owner <date>: <answer>", write the
> approved design rules into the carta-design skill and DESIGN.md, apply the
> permissions in A4, tick the same items in _OPEN-MASTER.md Part E, and table a
> catch-up wave in _WAVES.md with every skipped session whose gate is now open.
> Then run the catch-up wave.

---

# Block B. Housekeeping and security, any time

None of these blocks a wave. Do B4 before 1 November.

- [x] **B1. Roll the exposed Cloudflare token (T291-b).** SKIPPED by the owner on 2026-10-06: sole user, accepts the risk. Cloudflare, My
  Profile, API Tokens: roll `carta-r2-admin`, whose value was pasted into a
  session on 2026-10-02, and delete the unused `Carta` user token. Keep the
  new value in the password manager only.
- [x] **B2. Finish the key and token swap (T288-a).** 2026-10-06: the secret key is already off the laptop keyring (only the public half remains); the rclone key swap was SKIPPED by the owner. Confirm the offline copy
  of the "Carta backups" gpg secret key opens, then delete the secret key from
  the laptop keyring (`gpg --delete-secret-keys 1F6E1DCD2DD731E1A2C088A7BCA9DCA8D738AC84`).
  Replace both `carta-rclone` R2 pairs with one new pair (Object Read and Write,
  bucket `carta` only), kept only in the password manager.
- [x] **B3. CORS for preview deploys (T296-a).** Already applied: on 2026-10-06 `wrangler r2 bucket cors list carta` showed all six origins. After B1, from
  `continent-app/` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
  exported: `node scripts/r2/push-data.mjs --cors --live`. Check: the list
  shows six origins, including `https://preview.carta-app.pages.dev`. Without
  it, block C cannot use a preview deploy.
- [x] **B4. Re-dump the trails lab before 2026-11-01 (T288-b).** Done 2026-10-07: `trailslab-2026-10-07.dump.gpg`, 4,866,135,520 bytes, expires 2026-11-06; next re-dump by then. The only
  trailslab dump in R2 expires on 1 November. In Git Bash, with the lab running
  and the `RCLONE_CONFIG_R2_*` variables set:
  ```
  set -o pipefail
  PGPASSWORD=trailslab pg_dump -h 127.0.0.1 -p 5433 -U trailslab -d trailslab -Fc -Z 6 \
    | gpg --batch --yes --trust-model always --encrypt --recipient "Carta backups" \
    | rclone rcat r2:carta/archive/db/trailslab/trailslab-$(date +%F).dump.gpg
  ```
  Repeat every four weeks until the box takes it over, or tell Claude to give
  `archive/db/trailslab/` a longer lifecycle rule.
- [ ] **B5. Git reflog expiry (T252-a).** Optional, frees space; the bundle on
  `D:\carta-backups` makes it safe. Only when no wave is running:
  ```
  git for-each-ref --format='%(refname)' | grep -v '^refs/stash$' \
    | xargs git reflog expire --expire=now --expire-unreachable=now HEAD
  git gc --prune=now
  ```
- [ ] **B6. Google Cloud tidy (T259-a).** Rename project
  `gen-lang-client-0445365032` (it holds the Gemini key and the EUR 50 budget)
  to something you will recognise, and delete the empty project `carta-503222`.
  T259-b (how prepaid spend shows in the budget) is read later, in E5.
- [ ] **B7. Cloudflare data processing addendum (T300-j).** Accept it in the
  Cloudflare dashboard and write the version and date into the T018 vendor
  list (tell Claude the version; it records it).
- [ ] **B8. Status pages (T218-d).** Subscribe your address to
  status.supabase.com, www.cloudflarestatus.com and status.stripe.com, and
  check Supabase usage emails reach an inbox you read.
- [ ] **B9. Support mailbox (T216-a).** Create `support@carta-europetravel.com`
  (an alias forwarding to you, send-as on, phone notification on). Then say
  "switch the CONTACT constant to support@" and Claude edits `Imprint.jsx`,
  `TermsOfService.jsx`, `PrivacyPolicy.jsx` and `AccountPanel.jsx`. T216-b
  (state a two-day answer time in the Terms) is decided a month after that.
- [ ] **B10. Trademark search (T300-a).** Search "Carta" in classes 9, 39 and 42
  on euipo.europa.eu and give the result to Claude for
  `additional docs/Carta/Plan/Legal/Legal.md`. Before launch.
- [ ] **B11. The original mind maps (T226-d, T187-d).** Copy `Carta-structured.xmind`
  and `Carta.xmind` from your Downloads folder into `additional docs/Carta/`,
  beside `Carta-Master-Plan.xmind`. Many prompts cite "your original mind
  map"; without the file those sessions guess.
- [ ] **B12. Search Console (T205-f).** Create the Search Console property for
  `https://www.carta-europetravel.com/` (DNS verification), a Bing Webmaster
  Tools property and an IndexNow key. Needed before any sitemap is submitted
  (T239, T222-f).
- [ ] **B13. FAT32 guard check (T311-g).** With D: attached:
  `python pipeline/archive/pack.py --dry-run --out D:/carta-archive-out`. It must
  report FAT32 and refuse lakes-cache.
- [ ] **B14. Delete the Vercel project after 2026-10-09 (T293-a).** Once a week
  on Pages has passed with no rollback, delete `carta-travel-app` in Vercel (or
  at least detach both domains). After that, rollback is the previous Pages
  deployment.
- [ ] **B15. Community accounts (T207-b).** Open the Hacker News, Product Hunt,
  Reddit, OSM forum and OSMBC accounts now and use them normally; they must be
  at least 30 days old at launch.

---

# Block C. Push and deploy waves 6 to 15

When: after the wave 15 log line exists, and before block D (the live app should
match the migrations you are about to paste). Needs: B1 to B3, and your answer
to T098-a (Numbeo named as the food source, marked "before merge to production").

A Claude session can run this block with you at the keyboard: say "Run block C
of the owner runbook; ask me before the push and before each deploy."

- [ ] **C1. Push (T291-c).** From the repo root: `git push origin main`. Then
  read the GitHub Actions tab once:
  `admin-rpc-security` and `rls-policies` green (T083-c);
  `schema-contract` green with two "the gate failed, as it must" lines (T082-a);
  `design-lint` green (T196-c). Expected red until later fixes:
  `trip-validator` until F1 (T084-c), `secret-scan` until A4 (T252-c, T320-b),
  `rating-tests` until F3 (T252-b). `coverage-contract` warns and passes until
  F2 (T112-a).
- [ ] **C2. Before the deploy.** From `continent-app/`, with
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and the five
  `RCLONE_CONFIG_R2_*` variables exported:
  1. Create the prerender bucket once, because `wrangler.toml` now binds it
     (T221-a step 1): `npx wrangler r2 bucket create carta-prerender`
  2. Upload the quiet status file (T316-a): `node scripts/status_notice.mjs --clear`,
     then run the `wrangler r2 object put ... --remote` line it prints. Check:
     `curl -s https://data.carta-europetravel.com/data/status.json` answers.
  3. Affiliate ids (T315-b): in Cloudflare, Workers and Pages, `carta-app`,
     Settings, Environment variables, set the partner ids Carta has an account
     for (`VITE_TP_MARKER`, `VITE_OMIO_TRACKING_LINK`, `VITE_GYG_PARTNER_ID`,
     `VITE_VIATOR_PID`). Note: `build:pages` builds on the laptop, so they must
     also be in the shell or `continent-app/.env` when you build. Without them
     the Launch card's click count stays 0.
- [ ] **C3. Build, upload the data, deploy a preview.**
  ```
  npm run build:pages
  node scripts/r2/push-data.mjs --live          # phase 1, adds dest/_rank.json (T271-c)
  npx wrangler pages deploy dist --project-name carta-app --branch preview
  ```
  Open `https://preview.carta-app.pages.dev`: Explore, a destination, a trail,
  a journey, at phone and desktop width, console open.
- [ ] **C4. Deploy production and check it.**
  `npx wrangler pages deploy dist --project-name carta-app --branch main`. Then:
  an unknown path answers 404 and the root 200 (T317-a); the console shows no
  blocked font or style (T199-e); the response header no longer names
  `emrldtp.com` (T276-b); the Carta bot day plan answers (LIVE-a);
  `/about/numbers` answers 200 with the security headers (T318-a); the collapsed
  "Where this comes from" on a destination with routes (T313-a); maintenance and
  announcement with `?paymock` (T335-c); a destination PDF near trails, such as
  Valbona Valley, with a pass (T286-e); the share cards in the Facebook, LinkedIn,
  X, WhatsApp and iMessage previewers (T212-a); the press look and haptic on a
  real phone (T184-a).
- [ ] **C5. Prune the old data (T317-b).** `node scripts/r2/push-data.mjs --rclone-dry-run --prune`,
  read every purge line, then `node scripts/r2/push-data.mjs --live --prune`.
  Delete `dist/` and `dist-data/`.

Then say: "Block C deployed on <date>; close the deploy rows." Repeat C2 to C5
after every block F run, because data-lane results reach users only with a
deploy.

**C6. Later, the prerendered pages (T221-a).** This puts 32,220 pages on real
paths for search. Do it when you want search traffic, after your answers to
T224-b and T221-f. The procedure, about 2 hours of build time, is in
`Execution/P12/T221-static-prerendering.md` under "Owner procedure"; it turns
on `VITE_PATH_URLS=1` (T223-c). Afterwards: the sitemap check (T222-c), the
cost pages (T224-a), and the Functions request graph for a month (T221-b).
T222-d explains why trail and cycling pages stay noindex until they have a
licensed image (block H).

---

# Block D. Stage 2: the admin migrations (45 minutes)

Rules: paste by hand in the Supabase SQL editor of `ntssxktaduxzpsmejwyv`, never
`supabase db push`. After every paste, look for the self-check notice; it is the
difference between "it ran" and "it is right". One after the other.

## D1. Before the first paste

- [ ] Block C is deployed.
- [ ] A fresh encrypted Supabase dump in R2 (the streamed `pg_dump "$SUPABASE_DB_URL"`
      line in `Execution/P3/T288-archive-live.md`).
- [ ] Supabase, Authentication: TOTP MFA is enabled. On the app's admin page,
      enrol a TOTP factor on the owner account (T063-b). Pasting 032 before
      this locks delete and ban.
- [ ] Run these four checks:
  ```
  select to_regclass('public.content_overrides');   -- 018: must return the name
  select to_regclass('public.feedback');            -- 017: must return the name (T219-d)
  select to_regclass('public.trip_collaborators');  -- 020: must return the name
  select count(*) from information_schema.columns
   where table_schema='public' and table_name='trip_plans' and column_name='published_at';  -- 019: must be 1
  ```
  If 018 or 017 returns null, paste that file first. If 019 or 020 is missing,
  paste it at 6a or 6b below, and **paste 023 straight after 020**: 020 alone
  hides every saved trip (the August incident). 019, 020 and 023 were
  confirmed live on 2026-08-30, so expect all four checks to pass.

## D2. The pastes, in this order

| # | Migration | Row | Look for |
|---|---|---|---|
| 1 | 022_paywall_events | T034-a (half) | runs clean |
| 2 | 024_export_user_data | T216-d | export user data self-check passed |
| 3 | 032_admin_mfa_destructive | T063-c | admin MFA self-check passed |
| 4 | 033_admin_audit_rollback | T064-a | admin audit rollback self-check passed |
| 5 | 034_admin_guard_tiers | T065-a | admin guard tiers self-check passed |
| 6 | 035_site_config_visibility | T066-a | site config visibility self-check passed |
| 6a/6b | 019 / 020 + 023, only if D1 says missing | | runs clean |
| 6c | 046_coplanner_invite_fix, always | | co-planner invite policy self-check passed |
| 7 | 036_admin_public_guides | T067-c | admin public guides self-check passed |
| 8 | 037_content_reports | T068-a | content reports self-check passed |
| 9 | 038_admin_unpublish_guide | T069-a | admin unpublish guide self-check passed |
| 10 | 039_statement_of_reasons | T070-a | statement of reasons self-check passed |
| 11 | 043_override_review_lifecycle | T074-a | override review lifecycle self-check passed |
| 12 | 040_edge_errors | T071-a | edge errors self-check passed |
| 13 | 041_pipeline_health | T072-b | pipeline health self-check passed |
| 14 | 042_parse_failures | T073-a | parse failures self-check passed |
| 15 | 045_admin_followups | T268-a | admin followups self-check passed |
| 16 | 047_small_schema_fixes | T284-a | small schema fixes self-check passed |
| 17 | 048_launch_metrics_and_full_export | T315-a | launch metrics and full export self-check passed |

After paste 6: `select key, public from public.site_config;` must show only
announcement, features and maintenance as public.

## D3. Two things that are not pastes

- [ ] On the laptop (and later the box), set `CARTA_SUPABASE_URL` and
      `CARTA_SUPABASE_SERVICE_KEY` for `run_pipeline.py` (T072-a).
- [ ] The parse-booking redeploy (T073-b) happens once, in E3.

## D4. Check it worked

- [ ] The admin page: Overview, Guides, Reports, Content and Audit load with no
      missing-function error; delete asks for the TOTP code; the pipeline
      health and AI failure cards render (T300-s); the five T270 cards show
      data where 026 is not needed (T270-b; the OSS card waits for 026 in J).
- [ ] A takedown with its statement of reasons, through a real signed-in
      session (T281-b).
- [ ] Say "stage 2 pasted on <date>". Claude closes the rows and compares the
      live functions with the migrations (T077-b).
- [ ] Later, after the first real content report:
      `select source_header, count(*) from public.content_reports group by 1;`
      (T068-c). `x-forwarded-for` means Claude must change `report_guide`.

## D5. The re-paste trap, keep this

Nothing fails at paste time when a re-paste undoes a later migration; a feature
just stops. After pasting any migration by hand, re-paste every later migration
that names it.

| If you ever re-paste | Paste again |
|---|---|
| 014 | 035 |
| 016 | 040, and 047 |
| 017, 040 or 045 | 047 |
| 018, 033 or 034 | 043, but never 043 after 045 |
| 020 | 023, 038 (T069-b), 039 (T070-b), 046 |
| 033 | 034 |
| 037 or 038 | 039 (T070-b) |
| 014 to 019, 024, 032 to 034, 036 | 045 |
| 047 or anything 048 names | 048 |

---

# Block E. Stage 3: Gemini telemetry (45 minutes, then 5 minutes a week later)

Billing proof (T259) is done. Paste first, then redeploy, never the other way
round: the telemetry writes swallow their own failures, so a redeploy before
its paste gives a week of zeroes.

- [ ] **E1.** Supabase, Database, Extensions: enable `pg_cron` and `pg_net`.
  Do not create the `refresh_facts_*` vault secrets yet; they belong to
  migration 049, which wave 17 writes (T041-b, T327-c).
- [ ] **E2.** `select to_regclass('public.ai_model_events');` If null, paste
  `028_model_fallback_events.sql` (T038-a). Then paste `029_cache_hit_instrumentation.sql`
  (T039-a; never run before, so a syntax error would show here first, T039-d)
  and `030_ai_usage_rollup.sql` (T042-a).
- [ ] **E3.** Redeploy all three functions once. This covers T038-b, T039-b,
  T042-b, T073-b and T323-a:
  ```
  supabase functions deploy plan-day --project-ref ntssxktaduxzpsmejwyv
  supabase functions deploy parse-booking --project-ref ntssxktaduxzpsmejwyv
  supabase functions deploy suggest-city --project-ref ntssxktaduxzpsmejwyv
  ```
- [ ] **E4. Prove the caps on the live functions**, one at a time:
  1. plan-day secret `AI_GLOBAL_DAILY_CAP=1`; from a signed-in test account
     request two plans: 200, then 429 with code `global_cap`; set it back to
     200 (T036-b). If you ever change the cap for good, set `site_config` key
     `ai_global_daily_cap` to the same number (T042-c).
  2. On a test account note its `ai_usage` row, request one plan, set
     `GEMINI_MODEL` to a bad value, request again: `ai_usage` must return to
     the earlier value; restore the model (T037-b).
- [ ] **E5. One week later, in your calendar now.** Read the cache hit rate and
  the cap refusal counts off the admin panel and give both to Claude for the
  rows (T039-c, T042-e). Read how prepaid Gemini spend shows in the budget
  (T259-b). Skipped on purpose: the v4 baseline (T039-e, impossible after E2)
  and the optional prompt-trim A/B and 20-plan read (T040-a, T040-b; the trim
  saves under 0.5 percent).

Then say: "Stages 2 and 3 done; run wave 17." Wave 17 also needs your A answers
to T041-a and T081.

---

# Block F. The light data lane, on the laptop

The data lane is never inside a wave: one run at a time, started by you, with
no wave or pipeline run on the laptop meanwhile (check with `Get-Process python`).
Each run pulls back from R2 only the archive classes it needs
(`python pipeline/archive/push.py --pull --only <class>`); never the full pull,
which needs about 70 GB against 42 GB free. Each result reaches users with the
next deploy (C2 to C5).

The sentence for every item:

> Data lane: run F<n> from Execution/_OWNER-RUNBOOK.md. Pull only the archive
> classes it needs, tell me the disk it will take first, and nothing else runs
> meanwhile.

- [ ] **F1. Rebuild the journeys wire.** One `build_wire.py` run with fetching
  on, then commit. Closes T085-a, T087-a, T090-a, T091-a, T094-a, T151-a,
  T175-a, T361-d and T102-b, makes the trip-validator CI green (T084-c), and is
  what makes the wave 10 to 15 trip modules show real data. Check one trip at
  380 px and desktop, and that `ch-cozy-towns-appenzell` has a hero. Before
  re-seeding anything, note T332-c: the seed files were not regenerated.
- [ ] **F2. Coverage rerun.** `pipeline/regions/coverage.py`, commit
  `reports/coverage_contract.json`, write the gate baseline and add `--require`
  to the CI step. Closes T111, T112-a, T112-c, T160-a and T211-c. Needs your
  A answers to T112-b, T111-a, T111-c and T113-f.
- [ ] **F3. Re-score the ratings (T321-a).** `apply_rating_layer.py` on the
  master with the rebuilt curve; 1,616 of 3,868 published scores move. Closes
  the failing rating-tests CI job (T252-b).
- [ ] **F4. The trails lab runs.** On the laptop lab (port 5433): keep the
  current lab image (`TRAILSLAB_IMAGE=pgrouting/pgrouting:17-3.5-3.7`) until the
  box has tested the new one (T324-a). In this order: the scenic refresh
  (T311-d, Overpass, hours), the attributes run and export with the uphill
  grading and the credit gate (T107-a, T108-g, T286-a, T280-a; needs your
  answer to T311-e first, and then T107-c reads the title rung mix), the
  famous registry rescan with the blind-spot seeds (T113-a, T322-d), and the
  Waymarked gate count and the national-treks dry run (T322-a, T322-b).
- [ ] **F5. Geneva stay prices (T311-a).** Refresh the Geneva snapshot; needs
  your answers to T311-a and T311-b about the full anchor re-run and the
  footprint anchors.
- [ ] **F6. The route track wire (T177-b).** Routing through the local Valhalla
  and BRouter; unlocks T178 (wave 14, skipped) and T334 (wave 20). Needs your
  answer to T177-c.
- [ ] **F7. The heavy data lane waits for block G.** T104, T105, T120, T123,
  T106, T110, T114 to T119, T122, T133, T109 and T125 need the OSM extracts
  (30 GB) and elevation tiles (24 GB). Run them on the box or a CAX41, in the
  order of the data-lane table in `_WAVES.md`. T122 and T125 need your answers
  in A3.
- [ ] **F8. The authoring pass** (owner-started generation lane, after block E):
  weather fallbacks per outdoor day (T170-a), arrival and departure facts
  (T170-b), descent per route day (T174-b), cycling surface splits (T174-c),
  booking windows on 66 trips (T169-a), confidence notes on 130 trips (T154-c),
  four contradicted week totals (T151-g), and more measured monthly stay curves
  (T103-a). Some are reading, not scripts; the session will ask.

---

# Block G. Stage 7: the Hetzner box (about 2 days, mostly waiting)

About EUR 6.60 a month. The full commands are in `_OPEN-MASTER.md` stage 7,
current since T299 (CX23, x86, IPv4 on). Never run a real step on the box while
a laptop pipeline run is active. Push `main` first (C1): the box clones GitHub.

- [ ] **G1. Hetzner project and token (T046-c).** Project "Carta", a Read and
  Write API token, `hcloud` on the laptop, `export HCLOUD_TOKEN=...` in the Git
  Bash window only. IPv4 is on by default (T046-a answered by T299).
- [ ] **G2. Provision (T046-d).** The stock-wait loop in `_OPEN-MASTER.md` 7.2;
  the bootstrap log must show "ok: architecture amd64" and end "finished, all
  steps ok".
- [ ] **G3. Secrets file (T046-e).** `~/.config/carta/env` from `env.example`:
  the laptop `.env` values, the D3 Supabase pair, a box-only R2 token pair
  `carta-box`, `VITE_DATA_BASE=https://data.carta-europetravel.com/data`, and a
  Healthchecks.io weekly check URL as `CARTA_HEARTBEAT_URL` (T218-b; without it
  a failed run alerts nobody).
- [ ] **G4. Verify (T046-f).** `bash infra/hetzner/cax11/verify.sh <address>`:
  ALL CHECKS PASSED.
- [ ] **G5. Prepare and verify the weekly steps (T048-a, T048-b).** `run_pipeline.sh --pull-only`
  twice, then `verify_tasks.sh` for `country_context`, `image_audit`,
  `ingestion` (in the background, watch `df -h`) and `ship`.
- [ ] **G6. First full run and the comparison (T048-c, T048-d).** `weekly.sh`
  ends exit 0; `compare_wire.py` prints SAME SHAPE for the shell and the data.
- [ ] **G7. Switch the schedule (T048-e).** `sudo bash ~/carta/infra/hetzner/cron/install.sh`;
  check the laptop task `TravelAppFareRefresh` is still disabled.
- [ ] **G8. Weekly database dumps (T048-g).** The backup public key on the box,
  `SUPABASE_DB_URL` and `CARTA_BACKUP_KEY` in the env file.
- [ ] **G9. The new lab image (T324-a).** On the box, `pipeline/trails/smoke_test.py`
  against the multi-arch lab image; record the pgRouting version.
- [ ] **G10. After each weekly run** that changed destinations, a deploy from
  the laptop (T262-a): pull `master-current`, `npm run build:pages`, deploy,
  prune. The commands are at the end of `_OPEN-MASTER.md` 7.9.
- [ ] **G11. Finish the laptop clean-out (T045-e)** with the rclone checks in
  `_OPEN-MASTER.md` 7.11, only after G7.

Then say: "Stage 7.9 done; run wave 18 and move the heavy data lane to the box."

---

# Block H. Stage 8: images on the CDN (short sessions over 2 weeks)

Needs block G. The commands are in `_OPEN-MASTER.md` stage 8.

- [ ] **H0. A Flickr API key (T127).** Create one at flickr.com/services/api and
  give it to Claude as a secret in the env file, never in the repository. Wave
  19 session 2 (T127) needs it; without it that session is skipped.
- [ ] **H1. The on-demand worker (T047-a, T047-f).** A second Hetzner token in
  the box env, optionally a worker-only R2 pair, `cax41/verify.sh` ends 0
  failed, the sweep timer installed.
- [ ] **H2. Prove a worker comes and goes (T047-b, T047-c).** `spawn.sh selftest`,
  then again with Ctrl-C after the first "worker:" line.
- [ ] **H3. One heavy job (T047-d).** `spawn.sh valhalla_tiles switzerland`;
  give the SOURCE.txt digest to Claude to pin.
- [ ] **H4. The beaches images (T049-a to T049-d).** First the source lists
  (T269-a: `derive.py sources <layer>` pushed to `img/manifest/_sources/`;
  T324-c), push the beaches cache, the dry run (T049-b), the first real run
  with the curl checks (T049-c), then repeat until `left` is 0 (T049-d). Optional Cache Rule on `cdn.../img/` (T049-e). Then lakes and mountains.
- [ ] **H5. Takedown and credits live (T050-a, T051-a).** One permanent takedown
  of a title nobody wants, and `verify_attribution_cdn.py` exits 0.
- [ ] **H6. Turn on the faster images (T052-a).** Join the manifest, measure
  `?pic=off` against `?pic=beaches` on a preview, then
  `VITE_PICTURE_LAYERS=beaches` in production.
- [ ] **H7. Garbage collection (T269-e)** after the first real derive runs, dry
  run first. Before the first promoted clip_sweep: the cache ownership
  procedure in `docs/PHOTOS.md` (T269-d).
- [ ] **H8. After the first month's bills:** wall-clock or started hours
  (T047-e), the modelled EUR 9.50 to 10.90 against the invoices (T055-b),
  entered in the infra ledger as actual; the real-device speed figures
  (T055-a, T061-a).

Then say: "Stage 8.6 done for beaches; run wave 19." T127 also needs the Flickr API
key from H0.

---

# Block I. Paid Gemini runs (after block E)

Everything that costs money comes last, in the order of
`Execution/P9/_OPEN-paid-runs.md`. Your part is to approve each spend cap;
Claude runs them.

- [ ] I1. Only if the golden set runs from CI: add the `GEMINI_API_KEY`
  repository secret on GitHub (T153-b).
- [ ] I2. One measured generator run on three to five briefs, with the critic
  (T144-a, T145-a); then decide the critic's model (T145-b) and tune the
  estimate threshold (T154-a).
- [ ] I3. The first golden baseline, about 40 calls (T153-a); then decide the
  spot-check and tolerances (T153-d). T153-f: supply `Carta BackEnd.md` if you
  have it.
- [ ] I4. About 30 grounded calls to measure the search fan-out (T323-b).
- [ ] I5. The packing and risk backfill (T150-a), then read a sample (T150-d).
- [ ] I6. The prose rewrite of 236 trips under the word caps (T152-a).
- [ ] I7. Read and edit the 60 wave-1 expansion briefs first, free (T155-b),
  then the expansion batches (T155-a, T155-c).

The sentence: "Run paid step I<n> from the owner runbook with a cap of USD <x>."

---

# Block J. The business, then Stripe

Stripe has never been live and nothing is half-finished. Wave 20 waits for this.

- [ ] **J1. Register the eenmanszaak (T014).** Then fill the Imprint
  placeholders (T300-h) and open the Google Play developer account as a
  business (T272-b).
- [ ] **J2. The VAT answer in writing from an accountant (T015, T033-g).** The
  Belgian Stripe Tax registration must match it.
- [ ] **J3. Bookkeeping and a cost ledger (T016, T043-b).** `infra_ledger`
  (migration 031) is its database half.
- [ ] **J4. Legal review.** Someone qualified reads the Article 16(m)
  classification in the Terms (T032-e) and the T319 privacy wording (T319-a).
- [ ] **J5. Commercial terms of the data sources (T300-e, T310-a).** Move
  Open-Meteo to the paid API before the first sale; decide Numbeo, Ferryhopper
  and OpenSky per source; confirm the 22 ledger rows marked Verify.
- [ ] **J6. Transactional email (T213-a, T213-e).** Choose the EU provider per
  your A answer, accept its DPA, set SPF, DKIM and DMARC, store the key as a
  Supabase secret.
- [ ] **J7. Stripe Dashboard (T030-a, T033-a, T032-a, T033-b, T213-c).** Two
  Prices, Trip Pass 699 and Year Pass 1499 EUR, one_time, `tax_behavior`
  inclusive; the Terms URL `https://carta-europetravel.com/?legal=terms` set
  **before** the secret in J8 (or every checkout returns 502); Tax with the
  Belgian origin and threshold monitoring; receipt emails on with the imprint
  footer.
- [ ] **J8. Supabase (T030-b, T034-a, T032-b, T033-c, T043-a, T265-a).** A fresh
  dump; secrets in test mode (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_TRIP`,
  `STRIPE_PRICE_YEAR`, `CHECKOUT_TERMS_URL`); paste 021, 025, 026, 027, 031, then
  044 (it refuses to run without the others; if it says pg_cron is off, run the
  one line it prints); deploy `checkout` and `stripe-webhook --no-verify-jwt`;
  create the webhook endpoint and set `STRIPE_WEBHOOK_SECRET`. Migration 050
  (wave 20, T330) pastes after 044 once written.
- [ ] **J9. Test purchases (T031-a, T032-c, T033-d, T217-a).** The ten steps of
  `supabase/functions/checkout/test_purchase_e2e.md` on two fresh accounts,
  never the owner account; the waiver tick and consent in `pass_grants`; a
  German and a Belgian address both give `amount_tax` 121 on 699; one refund
  following `docs/REFUND_SOP.md` literally. Then switch to live keys.
- [ ] **J10. The first month (T043-c, T047-e, T055-b).** Real invoices into
  `admin_set_infra_cost` with source `actual`, and read the reconciliation line.
- [ ] **J11. Store apps (T272-b, T212-f).** Apple Developer Program, Google Play
  (after J1), a way to build iOS from Windows; then T247 and T248 start,
  Android first.

Then say: "Stage 10 done; run wave 20."

---

# Block K. The launch

None of this blocks a wave before 21. Set the date first; everything else
counts back from it (`Execution/P12/T220-launch-runway.md`).

- [ ] **K1. Pick launch day D** (Tuesday to Thursday) at least 42 days ahead
  and write it into T207-a (T220-a).
- [ ] **K2. By D-21:** the soft-launch roster of 15 people in a private file
  outside the repository (T220-b), and approve the invitation wording and pass
  marks (T220-d).
- [ ] **K3. The five-person first-run test** on the T099 preview build, with
  people who have never seen Carta (T187-b). Needs the catch-up wave (T099).
- [ ] **K4. Hand-price 40 to 50 destinations** into `tools/benchmark/samples/hotels.csv`
  with a menu-price sample, then Claude re-runs the benchmark (T095, T096-a).
- [ ] **K5. Native readers** for the de, es, fr, it and nl strings of T180 and
  T193 (T180-j, T193-g), and one screen-reader pass with NVDA, VoiceOver and
  TalkBack on the map pins and the Lifestyle dialog (T190-f).
- [ ] **K6. By D-15:** the legal, payments, perf and uptime gates (T227, T228,
  T231, T235) passed and Supabase on Pro (T232) (T220-c). If not, D moves.
- [ ] **K7. At D-14:** read the subreddit sidebars, the Facebook group rules and
  the outlet submission pages again (T207-e, T206-e, T208-b).
- [ ] **K8. Go or no-go (T207-a), then launch (T236).** Then say "launched; run
  wave 21".
- [ ] **K9. After launch:** field Core Web Vitals after a month of traffic
  (T200-g), the first indexed dates into the T239 sheet (T222-f), and the
  answer-time line in the Terms (T216-b).

---

# Rules that hold everywhere

- Never `supabase db push` against `ntssxktaduxzpsmejwyv`. Paste by hand, fresh
  dump first.
- Production deploys only by hand: `npm run build:pages`, data push phase 1,
  `npx wrangler pages deploy dist --project-name carta-app --branch main`,
  then the prune. A GitHub push deploys nothing.
- One writer at a time: no wave, no data-lane run and no pipeline run on the
  laptop at the same moment as another (`Get-Process python` before starting).
- Never Docker Desktop's Clean / Purge data while you want the trailslab,
  Valhalla and BRouter volumes.
- No Claude API anywhere, ever; runtime AI stays on Gemini.

# Rows that need nothing more

Recorded so you do not look for them: T062-a (the commit `4b2d8e19f`
attribution stays as is; revert app commit `bdd125d` to undo T057), T039-e
(no v4 baseline, accepted), T040-a and T040-b (optional, skipped), T069-b and
T070-b (the re-paste trap in D5), T077-b (checked in D4).
