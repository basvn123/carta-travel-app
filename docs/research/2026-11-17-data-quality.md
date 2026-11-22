# Data quality research: what travellers actually see (2026-11-17)

Research run `.work/2026-11-17-data-quality-research/` (L2, crew research playbook). Five explorers, three critics and one reconciliation pass, all measured on the shipped wire. This document is the hand-off for the session that will execute it, alongside the app logic audit (`.work/2026-11-17-app-logic-audit/`) and the Ask Carta and Gemini runs (`.work/2026-11-17-gemini-rag/`, `.work/2026-11-17-ai-north-star/`).

Every figure names its build. "Production" means what the data host (`data.carta-europetravel.com`, R2) served on 2026-11-17. "Local" means `continent-app/public/` at commit `93987631ff`. Where they differ, production is the number that counts.

## 0. Answers in one paragraph each

**Q1. Are all destinations in?** No, but the gaps are in the second tier, not the headline. 171 of 176 hand-picked famous destinations have their own page (97.2%) and 175 are findable. Against outside references: 97.5% of Wikivoyage settlements with 200+ Wikidata sitelinks, 92.9% of the "Cities" on 34 Wikivoyage country pages, 92.9% at 100 to 199 sitelinks, but only 68.7% at 60 to 99. UNESCO sites within 15 km of a place: 89.9%. About 100 places a traveller would expect are missing (Sirmione, Monteriggioni, Aigues-Mortes, Lincoln, Ely, Cognac, Thun, Livigno, Koper, Vlorë, Svalbard and more). The pipeline's own gap scan found Sirmione, Monteriggioni and Aigues-Mortes on 2026-09-03 and nothing acted on it, because D6 and D15 measure density per region, never "is this famous place in". The fix is a monthly report-only `destination_watch` task with a 30-row owner queue and a recall gate (section 5).

**Q2. Are lakes, routes and trails finished products?** No. None of the November trail fixes are on the wire: the walk content is the 2026-09-13 build. Of 17,404 walks, 20.4% have a photo, 1.4% a summary, and 22.6% an unclean name (8.2% unreadable as a name at all: empty, codes, Cyrillic, "Wanderweg 543", "fixme"). The committed name fix (T1092) would make about 1,200 names worse and must be repaired before the next box export. Routes on the wire are continuous; broken routes are dropped instead, so famous walks are missing or cut up (of 56 checked: 27 whole, 21 fragmented, 8 missing, among them Offa's Dyke, Kerry Way, Moselsteig, Laugavegur). Lakes: water class 55.0%, Lake Garda missing, about 143 rated "lakes" are pools, marinas or campsites. Beaches: sea temperature on 0 of 6,618 rows; 1,833 beaches named after a nearby town or hotel; 200 names in Cyrillic or Greek; 11 of 45 famous beaches missing. Mountains: identity complete, but a route up on only 19.0%. Photos on rated outdoor rows are complete and licensed; trail photos are not.

**Q3. How to make the text feel custom and hand-written?** The text is generic because each slot is written from too few facts, not because a writer is missing. 62.9% of beach pages and 30.7% of lake pages open with the same bathing-water sentence. All 3,868 place intros were written from a thin fact sheet, so 99% spend a sentence on visit hours and months that the facts row right below already shows. "Eat and drink" is one national list (651 Italian places share one menu). Where Carta had a rich fact pack (237 places of web research, 1,502 "things to do" lines) the same kind of session wrote text that reads like a good guide. So: build a per-item fact sheet with source ids, add a small `editorial` block (hook, why go, best for, signature, local moment, best month, tip, honest downside), write it in offline Claude Code sessions under the existing guards and the D23 judge, translate with Gemini, and keep every number and warning in templates (section 7).

**Q4. What else is really lacking?** In order of harm: (1) **a live incident**: the box published its own place build to production on 2026-11-13 and travellers now see measured bed prices on 243 places instead of 3,353, with 591 places showing a dorm dearer than a 3-star hotel; (2) 28 to 30 wrong hero photos live (Keir Starmer's portrait on Tiverton, Hythe and both Rothwells; the EU flag on Eu; a grizzly on Fur); (3) 3,769 must-see POIs filed as "Square" and 299 must-sees that are battles or bombings; (4) local fares, sea temperature, POI opening hours all at 0, UK crowds on 2 of 526 places; (5) place text English-only in all six languages; (6) trust signals that do not tell the truth (every `_asof` stamp on the local build says 2026-06-07, link health never ran, 0 truth-set rows hand-verified, and the D2 gate passes while all of this is true). Section 8.

## 1. Read this before acting

1. **Start with the live bed regression (section 2).** It is the one finding that hurts travellers today and it sets the order of everything else that writes place data.
2. **One master.** Destination adds, POI fixes, hero swaps, bed sanity and stamps all write `app_data`. Decide which master receives them (wave 0) before any of that work starts, and express every change as pipeline code or an override, never a hand edit of a master file.
3. **Deadline 2027-01-16.** The next quarterly box run would export trails with the broken name code. The guard in wave 0 must land before then. Monthly runs fall on the first Saturday (next 2026-12-05).
4. **Box work is not Claude work.** Claude writes code and tests, queues the run, and checks the result after. Box runs, deploys, keys, Gemini spend and approvals are the owner's (`docs/owner/`). Each step below says which.
5. **Disk.** About 3 GB free on the dev machine. Anything with OSM extracts or bulk harvests runs on the box only.
6. **Re-run the audit scripts after the next box run** (the quarterly catch-up was still running on 2026-11-11). They are in `.work/2026-11-17-data-quality-research/scripts/` and run with `python -I`.

## 2. Live incident: production lost most measured bed prices

**What travellers see (production `boot.json` `generated_at` 2026-11-08T01:47:32Z; R2 `data/dest/*`, `poi`, `dossier/index.json`, `lakes` last modified 2026-11-13 16:16 to 16:18 GMT):**

| Field | Production | Local wire (`93987631ff`) |
|---|---|---|
| Beds measured | **243** | 3,353 |
| Beds modelled | 3,536 | 0 |
| Beds missing | 0 | 515 |
| Places with dorm above hotel3 | **591** | 96 |
| `taste` block | 3,847 (re-added at wire build) | 3,855 |
| `airports` | 3,597 | not in the contract |
| `_asof` | 2026-11-08 / 2026-11-13 | 2026-06-07 on all 49,328 |

**How it got there.** `infra/hetzner/cax11/run_pipeline.sh` step 9 runs `push-data.mjs --live` after a split build from the box's own master. The 2026-11-12 laptop ship refused that master on the contract (`airports`, D3) and kept the schema-20 wire (`.work/2026-11-12-owner-sweep/report.md:36`). The box's own weekly publish on 2026-11-13 went around that refusal. So there are two publish paths and only one runs the contract and quality checks.

**What to do (wave 0 and 1):**
- Claude, time-boxed: find why the box master has 243 measured beds and `captured` null. Read the stays apply path in `pipeline/` (`pipeline/stays/box_stays.py` and whatever merges stays into `app_data`), and `continent-app/scripts/sync-data.mjs`. Output: a one-page cause with function names and a patch.
- Owner decides: re-publish the `93987631ff` place wire now as a stopgap, or wait for the fixed box master. The stopgap brings back the 515 missing beds but restores true measured prices on 3,353.
- Claude: make the box publish step run the same contract and D2 checks as `scripts/ship.mjs`, and add D2 rules: measured-bed share may not drop more than 2 points; 0 places with dorm above hotel3; `taste` present on every place; `generated_at` under 16 days old.
- Acceptance: production `accommodation.q.measured` at least 3,300; dorm-above-hotel3 = 0; the box publish fails on a seeded regression.

The "frozen since June" figure that one explorer reported is wrong: the local place wire changed in git on 10-22, 10-27, 10-28, 11-03 and 11-06. Only `meta.generated_at` and `_asof` are stale, because the writer and the T1143 migration copy an old stamp (D3, D12 stamp bug). The freshness report's 163-day age for app_data is an artefact of that stamp.

## 3. Canonical numbers

Use these, not the older figures in ROADMAP section 5 and the D7 table. Evidence: `.work/2026-11-17-data-quality-research/explore-gate-and-reconcile.md` and `critique-sources.md`.

| Metric | Value | Definition and build | Where other numbers came from |
|---|---|---|---|
| Places | 3,868 (3,608 `gem` + 260 airport) | local and production | |
| Area members | 2,664 towns inside area pages | local | |
| Walks | 17,404 | hikes only, production | 17,619 includes 215 city days |
| Top-band walks | 2,133 | v5 exceptional + excellent, production | 2,089 locally (production re-rated `v5` on 4,010 rows in place) |
| Walks with photo | 20.4% (3,554) | hikes, production | 21.7% scorecard includes city days; ROADMAP 20.2% |
| Top-band photo | 59.6% (1,272) | production | ROADMAP says 64%: not reproducible |
| Walks with summary | 1.4% (243) | hikes, production; 158 of these are retired boilerplate | 2.9% scorecard and 2.6% ROADMAP include city days |
| Unclean walk names | 22.6% (3,937); severe 8.2% (1,425) | classifier in `trails_names_replay.py` (the 42-character rule drives 1,925 of the hits) | ROADMAP 93.6% clean is a non-empty check only |
| Lakes | 1,628 rated + 1,048 listed | built 2026-10-28, same on host | |
| Lake water class | 55.0% of rated | | ROADMAP 55.8% |
| Beaches | 2,745 rated + 3,873 listed = 6,618 | | 2,984 double-counted `top.json`: wrong |
| Mountains | 728 rated + 1,415 listed | | |
| Mountain route up | 19.0% of rated (138) | `routes` key; `routeUp` on 0 | ROADMAP 14.8% is all rows (12.8% today) |
| POIs | 157,775; must-see 11,161 | local, matches production on 5 sampled shards | |
| Wrong-subject heroes | 28 sure + 2 doubtful | file-name tokens, both builds | |
| Wires over freshness limit | not reliable | the stamps are wrong; re-measure after the stamp fix | 8 of 16 was computed from the stale stamp |

## 4. Distance to launch: the gate measured on its own surface

ROADMAP section 4 gates the marketing surface on "Places (top 300)" and "Trails (top band)". No list of the top 300 exists in code: the only `--top 300` is D9's FR, RS and IT harvest quota (`select_targets`). This run used the global top 300 by dossier score (scores 10 to 8.3). **Engineering step: define the top-300 surface list in code** (owner confirms it), so the gate can be measured every run.

| Gate row | Today on the top 300 | Target | Pass |
|---|---|---|---|
| Hero photo | 100% | 100% | yes |
| 5+ photos | 89.7% | 100% | no |
| Full intro (120+ words) | 0.7% (the harvest is not merged) | 100% | no |
| Must-see POIs described | 75.7% | 95% | no |
| Measured bed price | **16.7% production** (92.7% local) | 95%, the rest labelled | no |
| Local transport fare | 0 of 60 metros and cities | every one | no |
| Crowds by month | 94.3% (GB 0 of 16) | 100% | no |
| Sea temperature | 0 of 400 beach rows | every beach | no |

Note: the "Not yet measured" label is coded only for the transport line, so a modelled bed shows a figure with no label (code reading, not checked in a browser). That breaks the honest-numbers rule for 3,536 places in production.

| Trails gate (2,133 top band) | Today | Target | Pass |
|---|---|---|---|
| Photo | 59.6% | 95% | no |
| Summary | 5.6% (T1179 covers 2,085 of 2,133 but is not on the wire) | 100% | no |
| Clean display name | 74.1% | 100% | no |
| Climb-based difficulty | per-day grade on 0 of 356 multi-day walks; 72 graded harder than their climb explains | yes | no |
| Time and climb on card | yes | yes | yes |
| Own URL | yes | yes | yes |

## 5. Q1 in detail: destinations

### What is in
- Per country (places): IT 651, FR 591, GB 526, ES 300, DE 248, GR 155, NL 144, PT 122, SE 90, PL 82 and on down to LI, SM and MC at 1. Fair-share shortfalls (`docs/data/coverage-parity.md`): DE 0.56, AT 0.52, PL 0.47, FI 0.31, MD 0.37; over-represented IT 1.49, GB 1.58, ME 3.29.
- Areas work: Cinque Terre, Lofoten, Dolomites, Cotswolds, Saxon Switzerland, Meteora, Plitvice, the Azores, Madeira and the Canaries are area pages with members.
- Turkey, Ukraine, Georgia and Belarus are out of scope by decision (`docs/tos/data_licenses.md` about line 673). Istanbul and Cappadocia are the misses travellers would notice most: an owner scope question.

### Named misses (verified by folded name against pages, members and `search_index.json`)
| Region | Missing |
|---|---|
| IT | Sirmione, Desenzano del Garda, Monteriggioni, Livigno, Bormio, Bardonecchia, Cannobio, Arona, Lecco, Tarquinia, Tuscania, Anagni, Corleone, Castellammare del Golfo, Milazzo, Sciacca, Gravina in Puglia |
| FR | Aigues-Mortes, Tarascon, Cognac, Chantilly, Quimper, Dieppe, Granville, Douarnenez, Oradour-sur-Glane, Val-d'Isère |
| GB | Lincoln, Ely, Truro, St Albans, Lichfield |
| DE | Rostock (in D15 as a DE80 candidate), Greifswald, Fehmarn, Borkum, Husum, Brunswick, Sigmaringen, Landsberg am Lech, Starnberg |
| CH, AT | Thun, Zug, Winterthur; Kufstein, Hallein, Klosterneuburg, Neusiedl Lake (area) |
| North and Balkans | Narvik, Kirkenes, Molde, Svalbard; Vlorë, Pogradec, Koper, Nova Gorica, Nitra, Prešov; Mount Athos |
| LU | Schengen |
| Member-only (no own page) | Positano, Bellagio, Valletta: owner decides; at least label them in search ("Positano, Amalfi Coast") |

Before a place is added, confirm it by Wikidata QID or coordinates across pages, members, POIs and outdoor rows. Name matching has produced false hits both ways (Gullfoss and Geysir looked missing only because of the match radius). The full lists are in `wv_country_misses.csv`, `wv_wikidata_misses.csv` and `whs_misses.csv` in the run folder.

### Duplicates and junk
| Kind | Count | Fix |
|---|---|---|
| Exact duplicate pages (`-fr`/`-it` copies at the same point) | 6: Seborga, Brugnato, Aubeterre-sur-Dronne, Moncontour, Montreuil-Bellay, Plombières-les-Bains | merge into the base id with an alias map |
| Same place, two pages | 3: Lampedusa (LMP + gem), Elafonisos, Giglio / Giglio Castello | merge |
| Same name, different places | 4: Castel del Monte, Charroux, Montréal, Rothwell | keep both, add a region qualifier (do not merge Rothwell: 155 km apart) |
| Twin villages under 3 km | 27, such as the Sardinian cluster (Flussio, Tinnura, Suni, Magomadas, Tresnuraghes, Sagama) | fold into an area page |
| Member under two or more pages | 194 | one owner page per member |
| Member that is also its own page | 24, including Zermatt under `gem:breuil-cervinia` | drop the member row; fix cross-border membership |
| Thin places | 192 (fame under 20, score under 5.5), such as `gem:sagama`, `gem:kelsterbach`, `gem:roma` (a Gotland village, a search trap) | D15 "remove or fix" review |
| Wrong country | 0 confirmed | re-check 22 border cases with the GISCO 1:1M outline |

### Search aliases contradict ROADMAP
ROADMAP D15 says search folds "Sicily finds Sicilia" (T384-h). On the wire, Gent, Praha, Wien and Warszawa fold; **Brugge and Sicilia do not**. A 300-query search test (top places in six languages, exonyms, one-letter typos, accent-free forms, run through `lib/placeSearch.js` `nameRank`) is unbuilt and would catch this.

### Keeping it complete: `destination_watch`
Report-only; a cron job never adds a place (the rule in `pipeline/tasks/catalogue.py`).

1. **Task** `destination_watch` in `pipeline/tasks/catalogue.py`, monthly (first Saturday), `writes_app_data: False`. Runs a new `pipeline/intake/reference_recall.py` (port of the run's `wv_wikidata_check.py`, `wv_country_check.py`, `whs_check.py` with a fixed type map), then the existing `register_intake.py` and `gap_scan.py`. Caches references in `cache/references/<date>/` (about 10 MB, keep 3) on the box.
2. **Sources**, all open: Wikidata Query Service (items with an English Wikivoyage article, sitelinks, P31; CC0; one query, 9,420 rows, about 1 minute); the "Cities" and "Other destinations" markers of Wikivoyage country pages (names and ids only, no CC BY-SA text copied; needs a descriptive User-Agent with the owner's contact and 3 s pacing, since the API returned HTTP 429 to a generic one); UNESCO WHS and the place registers in `pipeline/place_registries.py`, plus 7 registers never loaded (es_pueblos_bonitos, de_schoenste_doerfer, wallonie_plus_beaux, ch_plus_beaux, ro_cele_mai_frumoase, pt_aldeias_historicas, eu_cittaslow); Wikimedia pageviews for ranking; the existing OSM settlement scan. EventStreams and OSM minutely diffs are not needed at a monthly cadence.
3. **Scoring and classification**: `expect = 0.35·log(sitelinks) + 0.25·log(pageviews/day) + 0.2·[on a Wikivoyage list] + 0.1·[register or WHS] + 0.1·[Wikivoyage usable+]`, with a tourism signal required to cut commuter suburbs. Each candidate is classed as new page, member of area X, alias of an existing page, duplicate, or out of scope. Add a test that the 100 hand-judged misses rank in the top 150.
4. **Owner queue**: `data/catalogue/watch/queue.json` and a generated `docs/owner/destinations-watch.md` with the top 30 rows. Verdicts in `data/catalogue/watch/decisions.json`, keyed by QID, so a rejected row returns only if its sitelinks double. The box cannot commit: the queue reaches git through the Data health `panel.json` upload, and a Claude session writes the owner page from it.
5. **Apply**: approved rows go through `pipeline/intake/ingest_candidates.py`, `promote_place_candidates.py --approve`, `apply_new_gems.py`, then the box fill tasks (prices, climate, photos, rating). New places reach travellers only with the next place-wire ship.
6. **Duplicate guard at the cause**: `apply_new_gems.py` and `promote_place_candidates.py` refuse an id whose base (without `-fr`/`-it`), QID, or folded name within 1 km already exists. Use one shared helper (folded name + distance + QID) that every layer's dedupe calls.
7. **Gate in D2 and D23, soft first**: rules `catalogue.recall_wv_200plus`, `recall_wv_100plus`, `recall_country_cities`, `famous_seed`, `duplicate_pages`, starting at today's measured baseline (97.5%, 92.9%, 92.9%, 97.2%, 9) and ratcheting like `pipeline/regions/coverage_gate.py --baseline`. The famous seed list needs verified coordinates and a rebuilt script before it enters `evals/` (the original `famous_check.py` was overwritten in this run; `famous_check.csv` survives).
8. **Generalise**: one must-have recall harness per layer (places, trails, lakes, beaches, mountains, cycling), each a seed file in `evals/` and a D23 layer, one monthly task, one owner queue. This replaces the separate H9 follow-ups T1187-h (trail famous seeds), T1181-b/i, T1192-a, T1191-g and T1146-e rather than adding to them.

Size: task and recall script S; queue and owner page S; guard and cleanup S (one-way for the master, with an alias map for saved trips and shared links); gate S; first 100 adds M plus box fill runs.

## 6. Q2 in detail: trails, cycling, lakes, beaches, mountains

### 6.1 Trails: built in code, not shipped

| Work | Code | Production wire |
|---|---|---|
| T1092 display names (`wire_name`, `src_name`), per-day difficulty (`f.d`) | done 2026-11-05 | no (`src_name` 0, `f.d` 0) |
| T1093 photo licence on the card (`img.lic`) and photo-audit drops | done | no (97 of 97 "drop" photos live: a 1975 Ford Capri on HRP Étape 32, trains on BergeSeen Trail 12 and GR 12) |
| T1094 walk recovery, Northern Ireland country fix | done | no (6 NI walks filed IE, including the Causeway Coast Way) |
| T1179 top-band summaries | `data/trails/summaries.json`, 2,089 written | no |
| T1180 downhill relief | done | no (needs re-rate) |
| T1183 route bridge, T1184 stages, T1185 way back | done behind flags | no |

**Names.** Real examples on the wire: "" (114 empty in AL, MK, XK, ME), "JK02" and "VR" (top band, AT), "Wanderweg 543", "Red", "blue bar", "fixme - fixme", "Златни мостове - Алеко" (top band), "ANELLO 13 - TORCIGLIANO - …", "European long distance path E7 - Andorra", "Bideam nam Bian Trail" (typo). The full list of 36 is in `explore-trails-routes.md` section 2.

The committed fix, replayed on the shipped names, cuts unclean names from 3,937 to 1,312, but:
- `cap_title` drops the end point on about 1,200 from-to names ("BergeSeen Trail 15: Gosau-Hintertal - Hallstatt" becomes "…: Gosau-Hintertal"; "Sultans Trail Section 1: Vienna - Bratislava" becomes "…: Vienna");
- it creates 73 new duplicate-name groups (402 rows);
- it writes "E7- Andorra" and "KREPOST STORGOZIYa", and cuts "P (Ágfalva …)" to "P".

**Routes.** Published lines are continuous (15,638 of 17,455 detail lines have no splice; 50 have more than 10% straight connector). Brokenness shows as absence: D24 counts 3,518 `failed_continuity` routes. 295 rows say `is_loop` while the ends are more than 1 km apart. 1,615 rows are published only as stages (442 in the top band), none linked to a parent.

**Famous walks** (56 judged): whole 27, of which three with a defect (Causeway Coast Way wrong country, Rila Seven Lakes Cyrillic name, Preikestolen ×5 and Eiger Trail ×2 duplicates); fragmented or partial 21 (Tour du Mont Blanc 83.8 of 170 km, Pennine Way, South West Coast Path, Camino Francés, Kungsleden, Westweg, Adlerweg, Karhunkierros); missing 8 by the explorer's tally, while its table marks 10 rows missing (Offa's Dyke, Kerry Way, Moselsteig with side loops only, Alta Via 2, Laugavegur, Tour of Monte Rosa, Peaks of the Balkans, Slovenian Mountain Trail, Orla Perć, Reinebringen); treat 8 to 10 as the range. The T1181 external check finds 157 of 282 reference trails (55.7%).

**Difficulty.** Three grades per row disagree (`difficulty`, the shown `f.g`, `v5.facts.difficulty`; `f.g` and v5 differ on 1,315 rows). 875 walks are hard or very hard with under 15 m climb per km (Thames Path, 313 km, 496 m, "very hard"). 10 old summaries call a walk easy where the card says hard.

**Photos.** Lowest shares: DE 4.3% of 4,715, XK 4.3%, MD 5.6%, MK 9.8%, AL 9.9%, IT 10.0%, GB 11.9%, PL 15.9%, FR 16.2%. Top band: DE 26.9%, ES 34.0%. All hot-linked from Commons. Licensed sources: Commons geosearch along the line (in use); Geograph for GB and IE (CC BY-SA 2.0, commercial use allowed with credit, https://www.geograph.org.uk/help/freedom, read 2026-11-17; code exists, needs owner key `CARTA_GEOGRAPH_KEY`); Mapillary (CC BY-SA 4.0 per search results, the help page returned 403: verify before use; gallery only; needs `CARTA_MAPILLARY_TOKEN`); Wikidata P18 on trail items (unmeasured). National portals: terms not checked, do not use until a D23 terms check.

### 6.2 Cycling
513 rated routes (100% photo, 0 summaries, no summary field on the wire); 44 rated routes have no name and 16 are EuroVelo stage codes ("EV3 France 27, Amboise, Tours"); 16,460 listed routes, 1.5% with a photo, 13.1% with no name. Italy has 0 rated routes. 16 tours, all in DE, BE or GB, none on a flagship (EV6 Loire or Danube, EV15 Rhine, Mosel). EuroVelo routes exist only as country pieces. The D23 cycling reference is "seed from memory, verified=no", so its 42% coverage is not a measured number.

### 6.3 Lakes
- 1,628 rated + 1,048 listed. Rated photos 100% (4 to 5, licensed). Listed: 374 with no photo.
- Water class 55.0% (GB 0 of 54, NO 0 of 42, CH 54 of 79 missing). Swim unknown on 256. Shore length 0 rows. Temperature estimated on 99.8%.
- **Missing**: Lake Garda (Q6414; the only "Garda" row is a campsite), Derwentwater, Buttermere, Lovatnet, Jökulsárlón (a POI in `app_data.json`). Ohrid is a listed AL row with no photo and no MK row. Weak: Windermere, Pragser Wildsee and Karersee tier 0; Königssee tier 1 with no class; Plitvice only as single lakes.
- **Junk**: 294 facility-named rows (143 rated), such as `gr-schinias-olympic-rowing-and-canoeing` (tier 2, 8.1), `hu-hajos-sports-pool` (a Budapest pool), `mt-portomaso-marina`, `fr-piscine-a-vagues-…`. 44 rows are rivers (La Seine three times). 256 rated lakes under 5 ha.
- Heroes: 85 "category" heroes, only 2 share a word with the lake (`ch-lago-di-muzzano` shows Lake Lugano).

### 6.4 Beaches
- 2,745 rated + 3,873 listed. Sea temperature 0 of 6,618 (`sea_temp` ran on the box 2026-11-09 per ROADMAP, 2,388 rows, but `beach_context` never re-ran; unverified locally). The beach strip draws only with 12 values, so no page shows it.
- Water class 82.6% of rated (GB 1 of 118: post-Brexit, needs the Environment Agency feed). Blue Flag 1.3%, lifeguard 5.8%, surface 57.5%.
- **Names are the worst problem in this area**: 1,833 rows named after the nearest place (`osm_near`: "Donau City", "Hotel Fusha e Gjesë", "Wocherhafen"); 720 after an EEA register site ("Vlore" three times, "Kleidersee Hassfurt Augsfeld Augsfeld Surferufer"); 200 in Cyrillic or Greek (13 of 24 BG beaches); 196 empty or register slugs in ids.
- **Missing** (11 of 45): Praia do Camilo, As Catedrais, Ses Illetes, La Pelosa, Cala Mariolu, Scala dei Turchi, Étretat, Dune du Pilat, Rhossili, Durdle Door, Ksamil. Six of these exist in `app_data.json` as POIs or places, so the beach harvest missed them. Weak: Luskentyre and Keem listed only with 1 photo; Sylt only as a register site.
- Duplicates: 48 same-name pairs within 3 km (Playa de Rodas twice, Falésia twice, four "La Concha").

### 6.5 Mountains
- 728 rated + 1,415 listed. Height, prominence 100%; Wikipedia 97.9%. Listed: 294 with no photo.
- Route up 19.0% (14 of the 53 tier 2 and 3 peaks; none on Matterhorn, Mont Blanc, Eiger). `routeUp` (T1186) on 0 rows. 189 of 312 lifts are only "lifts nearby"; the Swiss Matterhorn row points to the Italian Cervinia lift. 99.6% of difficulties are estimates.
- Missing: Tre Cime di Lavaredo (a POI in `app_data.json`). Zugspitze is tier 2 in AT and tier 3 in DE. A UA mountain file with 61 rows (including Crimea) exists while UA is otherwise out of scope: owner check.

### 6.6 Cross-layer identity
The same real place carries different identities across layers: Zermatt a member of Breuil-Cervinia; Matterhorn CH pointing to Cervinia; six famous beaches only as POIs; Tre Cime only as a POI; Hechtsee rated in AT, listed in DE. One join on QID and 400 m across `app_data`, POI shards and the three outdoor layers would list these in one pass (not built).

## 7. Q3 in detail: making the text feel written for the place

### 7.1 Where the text comes from today

| Slot | Screen | Source | Coverage | Language |
|---|---|---|---|---|
| Card reason line | Explore card | `overviewReason()`: "Best in {months}" from climate | 3,868; Jun to Aug alone on 1,007 | 6 |
| Card preview lead | Explore popover | `lib/knownFor.js`: 260 hand lines in code, then `blurb`, then sight lists | 3,868 | hand lines and blurbs English in every language |
| Place intro | Place page head | `dossier.intro.short`, model rewrite from a thin fact sheet (`pipeline/dossier/rewrite_intros.py`) | 3,868, median 234 characters | English, hidden in the other five |
| Eat and drink | Place page | `dossier.eat.dishes`, a country list | country 3,842, place 1 (Porto) | source language |
| Things to do details | Place page | `dossier.do[].detail` | real prose on 1,057 dossiers (from the 237-place research), 3,614 "N km away" stubs | English only |
| Highlights | Place page | names and kinds | 0 of 19,186 described | names |
| Opening rhythm | Place page | per country | one sentence on 651, 591, 526 pages | English |
| Lake, beach, mountain lead and "why" | Item page | reason codes through `lib/lakeStory.js`, `beachStory.js`, `mountainStory.js` | 100% | 6 |
| Trail lead | Trail page | `trailReasons()` | 17,619 | 6 |
| Trail summary | Trail page | retired boilerplate hidden by `looksTemplated()` | 458, of which 457 boilerplate | English |

### 7.2 Why it reads generic (measured)
1. **The lead is spent on a fact.** On item pages the strongest scoring code becomes the lead. 62.9% of beaches (1,726 of 2,745) and 30.7% of lakes open with "The last EU bathing season graded the water Excellent, the top of the four classes the Bathing Water Directive uses." Five sentence shapes cover 85.4% of beach, 78.4% of lake and 72.3% of mountain leads. On 361 lakes the whole four-line "why" stack is identical. 44.9% of mountain leads are "It is the highest point of X."
2. **The fact sheet sets the ceiling.** The intro writer was given sights, hours and months, so 99% of intros say "N hours … ideally May to September", which the facts row repeats. Only 8.3% say who the place suits, 7.4% name a downside, 9.5% name any food. 2,719 intros have "is" as their second word ("X is a town in…"). 153 contain the banned word "easy", 128 "just".
3. **National data posing as local colour.** One Italian menu on 651 places; one shop-hours sentence per country.
4. **Specific text is often unsupported.** The provisional T1196 judge found 2 of 40 place blurbs supported by their source. 269 cards say "Italian comune." (a raw Wikidata description `isTemplateBlurb()` does not catch).
5. **Small honesty slips.** "Most people pair it with {name}" (`tip.pairWith`, 3,171 dossiers) states a behaviour Carta never measured. Plural bugs ("1 water points", "1 official EU bathing sites"). Jajce's intro says five hours while the facts row says four.

The proof that richer facts fix it is in Carta's own data: the research-backed "things to do" lines ("Vienna's oldest market row mixes produce and cheese stalls with world food counters; go hungry and snack your way down") and the T1179 trail summaries (20 of 20 supported in their check).

### 7.3 The `editorial` block

One per place, trail, lake, beach and mountain. Prose fields are one sentence each and every claim names a source id from the item's fact sheet. Numbers are never baked into prose; templates word them at render time in six languages, so prices, months, temperatures and warnings stay current.

| Field | Purpose | Grounded in | Length |
|---|---|---|---|
| `hook` | the one concrete thing this place has (card and page lead) | highlights with Wikidata sitelinks (`cache/dossier/landmarks.json`, 3,037 places), Wikivoyage See, OSM, own `why` codes | 40 to 90 characters |
| `why_go` | the reason to choose it over the next card | the same plus research `do[].detail`, designations, ratings | at most 220 characters |
| `best_for` | who it suits | own codes (`bestFor`, tags, transport, trails) | 1 to 3 codes, worded in i18n |
| `signature` | one named local thing: dish, drink, street, viewpoint, market | Wikivoyage Eat, Drink, See; Wikidata P2012, P1435; regional dish tables | at most 120 characters |
| `local_moment` | what locals do (passeggiata street, market day) | Wikivoyage Do and Understand, Wikidata events with dates; never invented | optional, 1 sentence |
| `best_month` | month and the measured reason | climate, crowds, water temperature, festivals | template |
| `stay` | how long | `visit_h`, the same number as the facts row | template |
| `tip` | one practical move (park here, take this bus, start from this side) | OSM parking and access, `practical.getting_there`, trail `access` | at most 140 characters |
| `downside` | the honest catch, "skip if" | own codes: crowds, car needed, water class missing, steep, road share | template where coded |
| `sources[]`, `written_by`, `judged` | provenance for D23, admin and overrides | fact-sheet ids | |

Licence: facts are not covered by CC licences; only an adaptation of the wording is (Creative Commons FAQ, https://creativecommons.org/faq/, fetched 2026-11-17). Own sentences written from Wikivoyage facts carry no share-alike duty if wording is not copied. Keep `rewrite_intros.py`'s six-word shingle test and extend it to every source text in the pack. Pattern references: Wikivoyage "Tone" (https://en.wikivoyage.org/wiki/Wikivoyage:Tone, revision 5297886) and "Listings" (https://en.wikivoyage.org/wiki/Wikivoyage:Listings), both fetched 2026-11-17: no brochure language, say what makes a listing worth visiting.

### 7.4 Production method (recommended hybrid)
- **Templates** for every number, warning and code-backed field (`best_month`, `stay`, `best_for`, coded `downside`).
- **Offline Claude Code sessions** write the prose fields from the fact sheet (allowed by D23 and CLAUDE.md; no Claude API, no runtime Claude). Batches of one country, about 100 to 200 items. Guards: proper nouns must be in the fact sheet, shingle test, the full PRODUCT.md banned list, no digits in prose except names, sizes and heights from the sheet. The D23 judge on a stratified sample per batch; a batch stops if grounded share falls below the threshold.
- **Gemini** (pipeline, `pipeline/ai_gateway.py`) translates prose fields to nl, de, fr, es, it with the T1196 back-translation check, then native review. Gemini spend is an owner approval (`docs/owner/paid-runs.md`); no cost was measured in this run.
- **Overrides** for owner corrections: extend `lib/overrides.js` and `pipeline/apply_overrides.py` from `blurb` to `editorial.*` (I13).

**One text contract.** Do not ship three overlapping text plans. Decide in one schema bump (version 21, with a down path where the app ignores the block): `editorial.hook` and `why_go` are the new card and page leads for every layer; trail `summary` (T1179) stays as the long text; `intro.short` becomes per-language in the same writer change; the 260 `KNOWN_FOR` lines move into `editorial.hook` data. Run the intro rewrite once, from the new fact sheet, not twice.

### 7.5 Before and after (only facts already on the wire)
- **Jajce.** Before: "Jajce is a walled medieval town in Bosnia and Herzegovina, best known for the Pliva Waterfall. The Jajce Fortress and the Jajce Mithraeum round out about five hours, and May through September is the reliable stretch; buses are decent." After, hook: "A 20 m waterfall in the middle of town, under a hilltop fortress". Why go: "The waterfall, St Mary's Church with St Luke's belltower and the citadel are a seven minute walk apart, so the old town fits in a morning." Downside: "Most of what is listed sits within 500 m. For a second day, walk the 6.6 km Jajce in a day route that starts 1.4 km west."
- **Eremi del Monteluco (trail 197956).** Before: "Goes over Monte Luco, 804 m / Passes Convento francescano Ofm / 1 water points on the way". After, hook: "A 9.2 km loop from Spoleto up to Monte Luco, past two caves and a Franciscan convent". Tip: "Parking is 50 m from the start; follow the 405 signs." Downside: "One stretch reaches 31%, and about an eighth of the loop is on road." (Data fix first: the high point is 850 m in one field and 804 m in another.)
- **Lake Lauerz.** Before: "There is a mapped place to swim on the shore. / There is a beach on it. / There is a lido on the shore." After, hook: "A small swimming lake in Schwyz with a lido, a beach and 5.8 km of path along the shore". Downside: "Carta has no official water class for it, and the water temperature is estimated from climate, not measured."

## 8. Q4 in detail: other gaps, ranked by harm

| # | Gap | Evidence | ROADMAP |
|---|---|---|---|
| 1 | Production measured beds 243 of 3,868; 591 dorm above hotel3; modelled beds carry no "not yet measured" label | section 2 | D10, D3, D2 |
| 2 | Wrong hero photos: Starmer on `gem:tiverton`, `gem:hythe`, `gem:rothwell`, `gem:rothwell-gb`; Sarah Olney MP on Olney; Flag of Europe on Eu; grizzly on Fur; Japanese Emperor's flag on Tenno; dialling-code maps on Kington and Heathfield; Waterloo map on Battle. All 115 heroes the August audit flagged are still live; 336 of its 647 fixes show neither file | `scripts/other_hero_checks.json`; `data/reports/hero_images_audit.json` | D17 (T1198-a to h; owner T1198-f) |
| 3 | POI kinds: 56,593 of 157,775 POIs filed "Square", 54,350 with no square in the name; 3,769 must-sees wrongly Square (Atomium, Manneken Pis, Gdańsk Town Hall) | `other_poi_kind.json` | D15 part 3 (T433-l) |
| 4 | Non-places as POIs: 1,072 battles, sieges, bombings (299 must-see); Deutsche Bank, Monte dei Paschi, Waitrose must-sees; 74 "Fondali" seabeds; 278 junk names ("Dam", "Xi", "FRN1") | `other_poi_nonplaces.json` | D15 part 3 (T433-c) |
| 5 | Highlights and festivals: 320 stadiums, disasters, cemeteries (Brussels' top three: King Baudouin Stadium, "Heysel Stadium disaster", Lotto Park); two erotic trade fairs listed as festivals | dossier scan | D9 |
| 6 | Empty fields the targets promise: local fare 0 of 3,868; sea temperature 0; `climate.water_c` 0; UK crowds 2 of 526 (BA, FO, MD, XK none); POI opening hours 0 of 157,775; open months 0; accessibility rows 1 | wire | D8, D10, D11, D18, D21 |
| 7 | Language: `intro.short` English on all 3,868 and shown in every locale; about 13,569 of 41,133 POI descriptions in a local language (Danish, Spanish lines on English pages); `cheapTips.json` English in six languages. The rating "why" line is the only place text in six languages | `why_i18n`, `DestinationPage.jsx:389` | I8, D9 |
| 8 | Trust signals: `_asof` stale (local); link health never run (`linkHealth.json` 0 links); truth set 0 rows hand-verified (90 seeded); D2 gate passes with 0 failures and has no rule for heroes, POI kinds, bed tier order, non-places, recall or duplicate pages | `scripts/quality/engine.py --no-snapshot` | D2, D3, D4, D16, G9 |
| 9 | Images: 58.0% of places have 5+ photos (GB 29.5%, RO 36.1%, FR 36.9%, IT 46.5%); 114 places with no gallery; 0 self-hosted (all `upload.wikimedia.org`); hero `credit` equals the place name on 2,464 places; 105 gallery images without author or licence; 24 GFDL beach and 8 GFDL mountain images need licence text. CC BY and CC BY-SA require attribution, so a missing author is a compliance gap, not polish | `other_gaps_dossier_poi.py` | D9, G8, H12, D17 |
| 10 | Thin text: full intro 47.5%, 22.0% at 300+ characters; must-see POIs described 71.0%, recommended 40.6% | wire | D9 |

Also: Rome (Fiumicino) scores 10.0 (P-32); 4,058 candidate POI duplicate pairs on a loose test ("Dam" and "Dam Square", "Old Parthenon" and "Parthenon"); 8 places with a hotel3 more than three times the country median (Borsh, Torrevieja, Roseto degli Abruzzi, Wuppertal, Tropea); 3 places where visit hours disagree with the intro (Brussels 14 vs "seventeen"). Food prices are modelled from a Belgian baseline × price level (MAE 17.9%), plausible but not measured per city; label them as estimates.

## 9. Execution plan in waves

"Claude" = a Claude Code session in the repo. "Owner" = box run, deploy, key, approval or spend; the step goes in the named `docs/owner/` file. "Ship" = `node scripts/ship.mjs` (owner only; data to R2 before the site). Each wave ends in one ship, announced to the owner with the wires it carries. Every code step is undone with `git revert`; schema changes carry a down path; merges and id changes carry an alias map.

### Wave 0: stop the bleeding, decide, guard (nothing reaches travellers yet)
| # | Step | Who | Size | Acceptance |
|---|---|---|---|---|
| 0.1 | Diagnose the box master bed loss (section 2) | Claude, read-only | S | one-page cause with function names and a patch |
| 0.2 | Decide: re-publish the `93987631ff` place wire now, or wait for the fixed box master; and which master receives all app_data work from here on | Owner (Claude proposes) | S | decision recorded in `docs/decisions/` |
| 0.3 | Box publish step (`infra/hetzner/cax11/run_pipeline.sh` step 9) runs the same contract and D2 checks as `ship.mjs` | Claude, then owner pulls on the box | S | a seeded bed regression fails the box publish |
| 0.4 | Trail name guard: fix `pipeline/trails/names.py` (`cap_title` never drops the last segment of "A - B" or "X: A - B"; keep the space in "E7 - Andorra"; title-case all-caps before and after transliteration; strip "fixme"; refuse a one-letter split; dedupe pass adding the distinguishing piece); add the 36 examples to `tests/test_trail_difficulty_names.py`; put the 2027-01-16 deadline on D7 and in `docs/owner/data-and-pipeline-runs.md` | Claude | S | `trails_names_replay.py`: unclean at most 1,312, 0 end-segment losses, 0 new duplicate groups |
| 0.5 | Correct ROADMAP baselines (D7 top-band photo 59.6%, summaries 1.4%, clean names 77.4%, lake water class 55.0%, mountain route up 19.0%; D3 "done" note on stale `_asof`; D15 alias claim for Brugge and Sicilia) | Claude | S | ROADMAP matches section 3 |
| 0.6 | Owner paper batch: Wikimedia User-Agent contact; `CARTA_GEOGRAPH_KEY`; `CARTA_MAPILLARY_TOKEN`; licence rows for the 7 registers and for the EA bathing-water feed (verify OGL on the source); T1144-a/-b labels; T1146-a review; Turkey and member-only towns decisions; Gemini spend ceiling for translation; confirm which H9 timers are live (T1107-a) | Owner | S | each step dated in `docs/owner/*.md` |
| 0.7 | Define the top-300 surface list in code and a gate script that measures section 4 every run | Claude, owner confirms list | S | the section 4 table regenerates from one command |
| 0.8 | Quick app copy fixes: lead from a "hook order" in `lib/lakeStory.js` and `lib/beachStory.js` (water class, swim flag, designation, Wikipedia count never lead); plurals; `tip.pairWith` reworded in six languages; "Italian comune." and other bare Wikidata descriptions into `isTemplateBlurb()`; "Not yet measured" label on modelled beds | Claude | S | `scripts/editorial_hooks.mjs`: no single lead above 25% in any layer; HANDBOOK updated; looked at phone and desktop width |

### Wave 1: a correct place wire
| # | Step | Who | Size | Acceptance |
|---|---|---|---|---|
| 1.1 | `airports` into the contract (`continent-app/scripts/ci/contract.mjs`, `docs/SCHEMA.md`, `docs/wire.schema.json`) end to end; fix the bed merge and `taste` | Claude | M | pipeline run, artifact, wire build, app load pass; measured beds at least 3,300; `taste` on every place |
| 1.2 | D2 rules: measured-bed drop at most 2 points; dorm above hotel3 = 0; `taste` required; `generated_at` under 16 days; wrong-hero tokens (soft); POI-kind sanity (soft) | Claude | S | `engine.py --no-snapshot` shows the rules with today's true state |
| 1.3 | Truthful stamps: `_asof` from each block's source date (stays `captured`, food model date, crowding year, climate period); writer refreshes `generated_at`; freshness report uses T1099-d limits (app_data 16 days) | Claude | S | more than one distinct `_asof`; HANDBOOK note on what `_asof` means |
| 1.4 | Bed sanity in the stays build: a tier out of order or under €10 becomes "not measured" | Claude | S | 0 out-of-order tiers |
| 1.5 | Hero bans in `pipeline/photos/correctness.py` cheap signals and the hero picker (svg, flag, map, coat of arms, badge, portrait, official portrait, constituency, postcode, dialling); replace from the ladder | Claude; owner review T1198-f | S | 0 banned tokens on heroes in `other_hero_checks.py` |
| 1.6 | Box rebuild of app_data with the fills already coded | Owner (box) | — | scorecard shows no regression against the restored wire |
| 1.7 | Ship 1 | Owner | — | production measured beds at least 3,300; app_data under 16 days |

### Wave 2: ship what is already coded for outdoor and trails (one box session)
| # | Step | Who | Acceptance |
|---|---|---|---|
| 2.1 | Outdoor box runs in order, dry run before every `--apply`: `beach_context`, `outdoor_pages` (sea temperature, T1097-b); `pipeline/harvest_bathing_water.py --refresh`; `pipeline/lakes/fill_water.py --harvest-osm --apply`; `pipeline/mountains/fill_route_up.py --extract <cc>.osm.pbf --apply` (T1186); then the three exports | Owner (box) | `sea_temp` on at least 95% of coastal beach rows; `routeUp` above 0; lake water class above 55% |
| 2.2a | Trails box rebuild: names (after 0.4), per-day difficulty, card licence, NI fix, photo-audit drops wired into `export_wire.credited()`, takedown scrub (T449-a) | Owner (box) after Claude | unclean at most 1,312; 97 drop photos gone; 0 NI walks under IE |
| 2.2b | Trails: T1179 summaries through `export_wire.wire_summary` | Owner (box) | summaries on at least 2,085 top-band walks |
| 2.2c | Trails: stages, bridge, way back (T1183 to T1185) with the flags on | Owner (box), separate run | stage rows link to a parent |
| 2.3 | One difficulty: `difficulty` mirrors `f.g` or is dropped; v5 facts from the same per-day grade; retire the old describe.py summaries | Claude | 0 summaries say easy where `f.g` is hard |
| 2.4 | Ship 2: trails, lakes, beaches, mountains | Owner | host `last-modified` newer; three pages per layer checked at phone and desktop width |

### Wave 3: catalogue and POI quality
| # | Step | Who | Size | Acceptance |
|---|---|---|---|---|
| 3.1 | Shared duplicate helper (folded name + distance + QID) in a common module; guard in `apply_new_gems.py` and `promote_place_candidates.py`; merge the 9 duplicate pages with an alias map | Claude | S | 0 duplicate pages; old ids resolve in a saved-trip test |
| 3.2 | `destination_watch`, `reference_recall.py`, queue, owner page, soft recall gate (section 5) | Claude; box runs it | S to M | queue at most 30 rows; the 25 verified misses rank in it |
| 3.3 | POI kinds and non-places in `pipeline/pois/normalize_poi_kinds.py` (map the default "Square" from Wikidata P31 or OSM tags; drop events, organisations, shops unless P31 is a visitable site; drop Fondali); `pipeline/pois/dedupe_pois.py` for "Dam / Dam Square" pairs | Claude, then box rerun | M | must-sees filed Square without a square name at most 2%; 0 non-place must-sees; Atomium and Manneken Pis correct |
| 3.4 | Dossier filters: disasters, cemeteries, prisons never a highlight; stadiums only with a heritage designation; no adult or trade-fair festivals | Claude | S | 0 such highlights |
| 3.5 | Outdoor code, in this order: famous seeds (Q6414 Lake Garda, Ohrid MK, Derwentwater, Buttermere, Lovatnet, Jökulsárlón in `pipeline/lakes/seed_lakes.py`; Tre Cime in `pipeline/mountains/seed_peaks.py`; a new beach seed list for the 11); then the lake junk filter in `pipeline/lakes/export_lakes.py` `publishable` (pool, marina, harbour, campsite, hotel, sports centre, river); then re-run the country floor; then beach names (transliterate into `name`, keep `nameLocal`; clean EEA names; `osm_near` rows take a Wikidata or Wikipedia name or become "Beach at X" or move to listed; using the fixed `names.py` functions); then dedupe and one tier per cross-border QID; id aliases for the 196 empty slugs; a `must_have` list in each `continent-app/scripts/verify_*.mjs` | Claude | M | `must_have` passes; 0 rated non-Latin names; 0 duplicate ids in `top.json`; one tier per QID |
| 3.6 | Mountain way up: home-country base and lift (Zermatt for the CH Matterhorn); drop `liftsNearby` from key facts beyond 2 km or across a border (`peak_index.py`, `enrich_peaks.py`) | Claude | S | Matterhorn, Mont Blanc, Eiger hand-checked |
| 3.7 | First approved place adds through the apply path and box fill | Owner approves; box | M | named misses approved by the owner appear with prices, climate, photos |
| 3.8 | Ship 3 | Owner | — | |

### Wave 4: names, photos, routes, famous gaps
| # | Step | Who | Acceptance |
|---|---|---|---|
| 4.1 | Trail names to 100% in the top band: extend `title_ladder` so "Wanderweg 543", colours and node-network codes fall through to from-to, landmark or shape; name the 114 empty routes; emit `data/reports/trail_names_review.csv`; a Claude Code session proposes names from the row's own tags and citable Wikidata labels in batches of about 200; accepted names go to `data/overrides/trail.json` with `src_name` kept (first read `pipeline/apply_overrides.py` to confirm a name patch is allowed, and add a test); a fresh session re-checks 10% | Claude | top-band unclean 0 after export; severe at most 200 |
| 4.2 | Photo passes: trails DE, IT, FR, ES top band with the T1093 gate; Geograph for GB and IE; `photo_check` baseline (T1198-a) with lake category heroes and no-shared-word beach heroes first; gallery pass for GB, RO, FR, IT (T1096-c); author and licence into the app_data hero `credit`; R2 self-hosting (T1105, H12) | Owner keys and box; Claude code | top-band trail photo at least 80% interim; wrong heroes 0; hero credit is an author on every place |
| 4.3 | Famous trail repairs as one parent with stages (Offa's Dyke, Kerry Way and the Irish waymarked trails, Pennine Way, South West Coast Path, Moselsteig, Adlerweg, Westweg, full TMB, Kungsleden north); seeds for the missing (Laugavegur, Tour of Monte Rosa, Peaks of the Balkans, Slovenian Mountain Trail, Orla Perć, Reinebringen, Alta Via 2, Karhunkierros); merge Eiger Trail ×2, Preikestolen ×5, the two TMB halves; country of the NI and San Marino walks | Claude, box | `trails_famous_check.py`: whole at least 40 of 56, missing at most 2 |
| 4.4 | Cycling: name the 44 unnamed and the stage-code routes ("Loire: Amboise to Tours"); tours on EV6 Loire and Danube, EV15 Rhine, Mosel; replace the memory seed with the official EuroVelo list; find why IT has 0 rated routes; a summary field is a contract change | Claude, box | official reference in D23; IT has rated routes |
| 4.5 | Empty fields already coded: UK crowds (T1098-a/b inputs by Claude, then T1098-c); 127-metro fare table (T1115); POI opening hours from OSM (T433-b) and open months (T1202-a); `access_facts` (T1203-b); link health (T1197-a); GB water class via `pipeline/beaches/uk_bathing.py` | Claude, box | GB crowds above 95%; fares on 127 metros; hours above 0 |
| 4.6 | Ship 4 | Owner | |

### Wave 5: the editorial voice (after contracts are stable)
| # | Step | Who | Acceptance |
|---|---|---|---|
| 5.1 | One text contract, schema 21: `editorial` block on dossier and outdoor item wires plus per-language `intro.short`; down path: the app ignores the block | Claude | contract tests and app load pass with and without the block |
| 5.2 | `pipeline/dossier/fact_sheet.py`: claims with source ids from the dossier, `cache/dossier/research/*`, `landmarks.json`, Wikidata and a D9 Wikivoyage section harvest (See, Do, Eat, Drink, Understand), plus a content hash; regional dish lists replacing the country ones | Claude | fact sheets for the top 300 |
| 5.3 | Prompt and guard change in `pipeline/prompt_registry.py`: no hours or months in prose; full banned list; hours must match `visit_h` | Claude | guard rejects the 153 "easy" and 128 "just" |
| 5.4 | Judge calibration on the owner's 50 labels; threshold in `pipeline/judge/config.json` | Owner labels (T1144-b); Claude | kappa reported; e.g. at least 90% supported |
| 5.5 | Pilot: 100 places, 50 trails, 50 lakes; owner reviews 20 for voice | Claude, owner | at least 90% judged supported; owner signs off |
| 5.6 | Scale by country (top 300 first, then the rest, top-band trails, outdoor tier 2+); batches of 100 to 200 with a stop rule | Claude | per batch: judged sample passes |
| 5.7 | Gemini translation to five languages with back-translation; native review; then drop the English-only gate for `editorial` | Owner spend and native read; Claude | back-translation check passes |
| 5.8 | Move the 260 `KNOWN_FOR` lines into data (judge them first); allow `editorial.*` overrides | Claude | override patch test passes |

Waves 0.8, 0.4 and 0.1 can start in parallel. Waves 2 and 3.1 to 3.4 can run in parallel in separate worktrees (`node scripts/worktree.mjs add <slug>`), but never two writers on the same master.

## 10. ROADMAP cross-reference

| ID | ROADMAP status | What this research found | Wave |
|---|---|---|---|
| D1 Contract | done | enforced on the laptop ship only; the box publish skips it | 0.3, 1.1 |
| D2 Quality engine | in progress, 75 rules | passes while beds, heroes, POI kinds, non-places, recall and duplicates are wrong | 1.2, 3.2 |
| D3 Provenance | done in code | all local `_asof` read 2026-06-07; "done" overstates | 1.3 |
| D4 Truth set | in progress | 0 hand-verified rows | 0.6, 5.4 |
| D5 Scraper health | in progress | stays manifest still schema 18 | box 2026-12-05 |
| D6 Coverage fairness | done | true for density only; asks no identity question | 3.2 |
| D7 Trails and outdoor fill | in progress | nothing from November on the wire; baselines wrong; name code harmful | 0.4, 0.5, 2.x, 3.5, 4.1 |
| D8 Sea temperature | code ready | 0 of 6,618 | 2.1 |
| D9 Place text and photos | in progress | intros English only, 47.5% full; galleries 58%; top-300 intro 0.7% | 4.2, 5.x |
| D10 Prices | in progress | production beds regressed; fares 0; modelled beds unlabelled | 0.1, 1.x, 4.5 |
| D11 UK crowds | doing | GB 2 of 526 | 4.5 |
| D12 Freshness | in progress | stamps wrong, so the freshness count is unreliable | 1.3 |
| D13 Getting there | in progress | not measured here (logic audit) | — |
| D14 Licensed sources | probe built | scraped-bed licence risk not measured | owner T1112-a |
| D15 Catalogue gaps | part 1 done; part 2 waits on T1146-a | density-only; misses famous towns; alias claim false for Brugge and Sicilia; `-fr`/`-it` duplicates not on its merge list | 3.1 to 3.4, 3.7 |
| D16 Link health | built | never run | 4.5 |
| D17 Photo correctness | in progress | 28 to 30 wrong heroes live; 115 flagged still live | 1.5, 4.2 |
| D18 Seasons and closures | code done | 0 hours, 0 open months | 4.5 |
| D19 to D21 | done or code done | content not measured; access on 1 dossier | 4.5 |
| D23 External validation | in progress | trails 157 of 282; cycling reference unverified; no places-recall layer | 3.2, 4.4 |
| D24 Trail quality pack | in progress | nothing on the wire | 2.2, 4.3 |
| G8 Imagery gaps | partly done | trail photo 20.4% | 4.2 |
| G9 Trust made visible | partly done | dates come from stale stamps | 1.3 |
| H9 Schedules | done; owner enables timers | which timers are live is unverified; its follow-up list should merge into the recall harness | 0.6, 3.2 |
| H12 Self-hosted images | in progress | 0 self-hosted | 4.2 |
| I8 Six languages | half done | place prose English only; POI descriptions mixed language | 5.7 |
| I13 Content operations | in progress | override files exist with 0 entries | 4.1, 5.8 |
| K8 Open dataset | doing | 85 gems with no GeoNames match (not re-measured) | — |

## 11. What is uncertain, disputed or not measured

- **Production versus local.** Trails, outdoor layers, POIs, heroes and dossiers measured the same on both. Place-data figures (beds, `_asof`, `taste`, airports) differ; section 2 gives both.
- **Hand samples.** The 176 famous destinations, 45 lakes, 45 beaches, 42 peaks and 56 walks were written from memory; good for finding gaps, not for a completeness percentage. The "about 100 travel-worthy misses" is a hand reading of 417 candidates, not a list.
- **Heuristics as bounds.** Wrong heroes (file names only; image content unchecked, so a lower bound), events among POIs (a real battlefield is a fair POI, so an upper bound), non-English descriptions, POI duplicate pairs, the "Square" test.
- **Unverified sources.** Mapillary licence (help page 403), EA bathing-water OGL on the API page, the box `sea_temp` 2,388 rows, NASA MUR and Copernicus terms not re-checked. Lonely Planet and Michelin patterns are background only.
- **Disagreements settled here.** Rothwell is two different places (keep both, qualify the names, fix both heroes), not a duplicate. Lake Garda is missing (the "present" match was a campsite): 35 of 40 famous lakes present, 5 missing. Duplicate pages are 9, not 8.
- **Not measured at all.** Airports and flights data, region, country and journey pages, search alias quality beyond spot checks, place coordinates against Wikidata P625, the scraped-bed licence share, Gemini cost per 1,000 texts, the T1179 summary text quality, screens in a browser, non-English template renders. Treat these as open, not as fine.
- **Lost script.** The destinations `famous_check.py` was overwritten during the run; its output `famous_check.csv` survives. Rebuild it before using the list as a gate seed.

## 12. Sources

Repository evidence (all in `.work/2026-11-17-data-quality-research/` unless noted): `explore-destinations.md`, `explore-trails-routes.md`, `explore-outdoor-layers.md`, `explore-editorial-voice.md`, `explore-other-gaps.md`, `explore-gate-and-reconcile.md`, `critique-sources.md`, `critique-coverage.md`, `critique-executability.md`; helper scripts and outputs in `scripts/`, `data/`, `refs/`. Repo files: `ROADMAP.md` (Track D lines 555 to 765, section 4 gate lines 159 to 195), `infra/hetzner/cax11/run_pipeline.sh`, `.work/2026-11-12-owner-sweep/report.md`, `data/reports/validation/trails_external.md`, `data/reports/hero_images_audit.json`, `data/reports/trail_photos_audit.json`, `reports/gap_candidates_full.csv`, `docs/data/coverage-parity.md`.

External, fetched 2026-11-17:
- Wikidata Query Service, https://query.wikidata.org/ (CC0).
- English Wikivoyage API, country pages, https://en.wikivoyage.org/w/api.php
- WikiCite WDQS graph split, https://meta.wikimedia.org/wiki/WikiCite/WDQS_graph_split
- pyosmium replication manual, https://docs.osmcode.org/pyosmium/latest/user_manual/10-Replication-Tools/
- MediaWiki EventStreams, https://www.mediawiki.org/wiki/EventStreams
- MediaWiki API:Geosearch, https://www.mediawiki.org/wiki/API:Geosearch
- Geograph licence, https://www.geograph.org.uk/help/freedom
- Mapillary licence help page, https://help.mapillary.com/hc/en-us/articles/115001770409 (returned 403; unverified)
- EEA, European bathing water quality in 2025, https://www.eea.europa.eu/en/analysis/publications/european-bathing-water-quality-in-2025
- Environment Agency Bathing Water Quality API, https://environment.data.gov.uk/bwq/ and data.gov.uk record https://www.data.gov.uk/dataset/bathing-water1
- Blue Flag, https://www.blueflag.global
- Creative Commons FAQ, https://creativecommons.org/faq/
- Wikivoyage: Tone, https://en.wikivoyage.org/wiki/Wikivoyage:Tone ; Wikivoyage: Listings, https://en.wikivoyage.org/wiki/Wikivoyage:Listings
- Production data host: https://www.carta-europetravel.com/boot.json and https://data.carta-europetravel.com/data/ (headers and shards, 2026-11-17)
