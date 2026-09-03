<!-- Carta engineering plan. Generated for handoff to Claude Code. -->

# Carta — Explore rebuild & rating_v4

*Engineering plan. Every figure measured from the live 3,038-destination catalogue (schema v16, model rating_v3).*

A step-by-step brief for Claude Code, written against the live catalogue of 3,038 destinations. Five workstreams, thirty-one steps, each with the files to touch and a test that says when it is done.

**Stack:** Vite + React (`continent-app/`) · Python pipeline (`pipeline/`) · 3,038 places, 43 countries

Four things are wrong at once, and they compound. The score is 79% one hand-scored field that only half the catalogue has. The component meant to measure sights is a constant. Beauty quietly penalises cities. And Explore presents all of it as one undifferentiated rating-sorted wall where a Provençal village and a capital wear the same badge. Fix the maths first — the interface changes are cheap once the numbers are honest.

| Headline | Meaning |
|---|---|
| 87.2% | of destinations share one identical highlights value |
| 0.61 | score SD for fitted places, vs 0.95 curated |
| 2.3% | of fitted places reach tier 2, vs 12.9% |
| 0 | German destinations in the top tier, of 246 |

## Part 0 — What the data actually says

Everything below was measured directly from the 3,038 rows published in the Carta Catalogue. Numbers first, opinions after.

---

**[F1]**

### The highlights component is a constant `[critical]`

2,649 of 3,038 destinations (87.2%) carry *exactly* `h = 0.909`. The tenth percentile is 0.859 and the ninetieth is 0.909 — nine tenths of the catalogue sits inside a 0.05-wide band. Rome, Berlin, Bruges, Eger and a Hungarian hamlet of 533 people all score identically.

It holds 11% of every score and contributes **0.063** of the score's 0.95 standard deviation. The "saturating fast" curve saturates completely: it has become an additive constant of roughly +1.0 applied to almost every place, dressed as a measurement.

*Fig. 1 — where each component's weight actually goes*

*Appeal alone accounts for 79% of the spread between destinations. The score is not a four-part composite; it is the curated appeal score with decoration.*

---

**[F2]**

### The fitted fallback flattens half the catalogue `[critical]`

1,468 destinations (48%) have no curated appeal and get a least-squares fit instead. Because that fit regresses to the mean, their score distribution is **36% narrower**: SD 0.61 against 0.95, p95 of 7.5 against 8.3, maximum 8.8 against 9.5.

The consequence is arithmetic, not editorial. Tier 2 begins at 7.8 — which is above the 99th percentile of the fitted distribution. A destination without a curated score is **5.6× less likely** to be labelled at all: 2.3% reach tier 2 versus 12.9% of curated places. This is the single biggest source of "the rating feels too strict".

*Fig. 2 — score distribution, curated vs fitted*

*The fitted curve dies before it reaches the tier-2 line. Restoring the dispersion to match the curated distribution moves 160 destinations into tier 2 and 161 more into tier 1 — without a single new hand-scored judgement.*

---

**[F3]**

### Curation coverage varies by country, so the tiers do too `[critical]`

Appeal coverage runs from 27% (Netherlands) and 31% (Germany) to 77% (Portugal) and 88% (Ireland). Across countries with 20+ destinations, coverage correlates **+0.435** with the share of destinations reaching tier 2. Germany has 246 destinations and **zero** in the top tier. Fourteen countries have three or fewer labelled destinations of any kind.

A user filtering to Finland, Serbia, Latvia, Cyprus, Estonia or Lithuania sees an unbroken wall of unlabelled cards, and concludes the country is not worth visiting. What they are actually looking at is a backlog.

| Country | Places | Appeal cov. | Tier 3 | Tier 2+ | Any label |
|---|---|---|---|---|---|
| Italy | 340 | 47% | 18 | 68 | 209 |
| Germany | 246 | 31% | 0 | 9 | 73 |
| Netherlands | 136 | 27% | 1 | 4 | 44 |
| Sweden | 90 | 30% | 0 | 1 | 13 |
| Hungary | 53 | 47% | 0 | 1 | 6 |
| Serbia | 28 | 50% | 0 | 0 | 2 |
| Finland | 27 | — | 0 | 0 | 1 |

---

**[F4]**

### Beauty carries an anti-urban bias `[high]`

The Beauty Index correlates **−0.158** with log population. Median beauty by class: area 0.52, village 0.45, town 0.43, metro 0.43, city 0.40. Berlin scores 0.39; Sankt Andreasberg, a Harz village of 2,037 people, scores 0.67 and lands on **8.1** — above Heidelberg (8.0) and level with Berlin.

The index rewards fjord/alps/lake tags, Blue Flag density and UNESCO sites within ~60 km. That radius leaks prestige into whatever happens to be nearby, and none of its four inputs can see a beautiful built city. Urban beauty — squares, riverfronts, skylines, coherent old towns — is unmeasured.

---

**[F5]**

### Real places are unreachable, and some are simply absent `[high]`

Two distinct failures. First, **cluster entries swallow their members**: searching Positano, Ravello, Vernazza, Manarola, Varenna, Bellagio or Menaggio returns nothing, because they live inside *Amalfi Coast*, *Cinque Terre* and *Lake Como*. Named places that a traveller types are dead ends.

Second, genuine gaps cluster geographically. Of the Côte d'Azur *villages perchés*, Biot and Saint-Paul-de-Vence are in; **Mougins, Valbonne, Vence, Tourrettes-sur-Loup, Gourdon** and **Peillon** are not. Same for Frigiliana, Gordes as a standalone, and Sirmione. When a whole micro-region is half-present, the omission is a pipeline artifact, not a judgement.

Compounding both: 454 destination names carry diacritics or hyphens (*Kuldīga*, *Český Krumlov*, *Cefalù*, *Sarlat-la-Canéda*), and there is no fold-and-alias index, so typing "cesky krumlov" or "eze" finds nothing.

---

**[F6]**

### Explore shows one axis, and it is 38% Italy `[high]`

The grid is a flat rating sort. In the first 60 cards, 23 are Italian. Every card wears the same "Worth the journey" ribbon, so the label carries no information at the point where a user is scanning. Nothing on the card says whether a place is a capital or a hamlet, whether it takes two hours or three days, whether it needs a car, or whether it is one of the **292 hidden gems** — a flag the catalogue computes and the interface never shows.

Meanwhile the data holds columns Explore does not spend: visit hours (median 5.2), transit quality (1,344 places rated *poor*), car-needed (1,810 places), crowding tier, best months, neighbourhood-level prices. Half of the product's real intelligence is sitting behind a card that shows a price and a number.

===

## Phase A — Rating model v4

Seven steps in `pipeline/`. The goal is not a softer score — it is a score whose spread reflects real differences instead of curation backlog. Keep the published 0–10 absolute scale and the Michelin idiom; change what feeds them.

---

**[A1]** *(pipeline)*

### Instrument the current model before changing it

> FILES: **new** pipeline/diagnostics/rating_audit.py  ·  **out** reports/rating_audit.json

Write an audit that runs against the current `app_data.json` and emits, per component: min, p10, median, p90, max, standard deviation, share at the modal value, and the component's realised contribution to score variance (weight × 10 × SD). Add per-country appeal coverage, tier counts, and the curated-vs-fitted split.

Freeze the current output as `reports/rating_audit_v3_baseline.json`. Every later step compares against it, so regressions are visible rather than argued about.

> **Done when:** The audit reproduces these figures: highlights modal share 87.2%, appeal contribution 0.750, fitted SD 0.615, curated SD 0.950.

---

**[A2]** *(pipeline)*

### Rebuild highlights so it discriminates

> FILES: **edit** pipeline/rating_layer.py  ·  **edit** pipeline/place_layer.py (POI significance)

The current best-six measure saturates because six slots at significance ≥1 is a low bar almost everywhere. Replace it with a **peak-and-depth** pair on a scale that stays open at the top:

```
peak   = max significance across all POIs, 0–3, normalised
depth  = sum over top 6 POIs of  sig_i / (1 + 0.55·i)      # i = 0..5
hl_raw = 0.55·peak + 0.45·(depth / depth_p99_of_catalogue)
hl     = clip(hl_raw, 0, 1)
```

Calibrate `depth_p99` from the catalogue at scoring time, not a hardcoded constant. Then verify: the modal share must fall below 15% and the SD rise above 0.15. If it does not, the significance ratings themselves are degenerate — check the distribution of per-POI `sig` before touching the formula again.

> **Done when:** Highlights SD > 0.15, modal share < 15%, and Rome / Bruges / Eger / Lovas no longer share a value. Spot-check that Siena outranks a village with one abbey.

---

**[A3]** *(pipeline)*

### Add an urban-fabric term to the Beauty Index

> FILES: **edit** pipeline/beauty_layer.py

Keep heritage / iconic / nature / beach, add a fifth input worth ~20 of the weighted total, redistributing from nature and beach. Build it from data already reachable in OSM and Wikidata:

- Protected old-town or conservation-area polygon present, and its area as a share of the built-up area
- Density of listed/heritage buildings inside a 1 km core radius
- Presence of a named principal square, waterfront, canal network or bridge ensemble
- Pedestrianised street length in the core

Separately, tighten the UNESCO proximity radius from ~60 km to a graded credit: full within 10 km, half to 25 km, quarter to 50 km, nothing beyond. A village should not inherit a neighbour's cathedral at full price.

> **Done when:** corr(beauty, log population) sits between −0.05 and +0.10, and Berlin, Vienna, Porto and Lyon all move up at least 0.08 in beauty while Sankt Andreasberg falls.

---

**[A4]** *(pipeline)*

### Replace the least-squares fallback with quantile calibration

> FILES: **edit** pipeline/appeal_scale.py  ·  **edit** pipeline/rating_layer.py

This is the highest-value change in the plan. Keep the regression as the *ranking* device — it orders uncurated places acceptably — but stop using its raw output as a score. Map its rank onto the curated score distribution:

```
1. fit the model on curated places (as today) → ŷ for each uncurated place
2. compute the empirical CDF of ŷ within the same class
(metro / city / town / village / area)
3. read the curated score distribution for that same class
4. fitted_score = quantile(curated_scores_of_class, cdf_rank(ŷ))
5. shrink toward the class median by 12% to stay honest about
uncertainty, then apply the existing class ceiling
```

Quantile mapping is monotone, so it never reorders anything; it only restores the spread the regression destroyed. Do it *within class* so a village is calibrated against villages. Do **not** do it within country — that would grade on a curve, which the model explicitly refuses.

> **Done when:** Fitted SD lands within 0.05 of curated SD, the fitted tier-2 rate lands between 8% and 13%, and no destination's rank order changes relative to other fitted places in its class.

---

**[A5]** *(pipeline)*

### Publish a confidence field, and let the interface use it

> FILES: **edit** pipeline/rating_layer.py  ·  **schema** v16 → v17

Add `rating_confidence`: `"curated"` when a hand appeal score exists, `"modelled"` when it came from A4, and `"provisional"` when the place also lacks designations and has fewer than three rated POIs. Add `rating_inputs_present` as a small integer count.

This is the honest alternative to hiding the problem: a modelled 8.1 is shown as an 8.1 with a quiet mark, not silently demoted a tier and a half. Carry it into the card and the destination page in C3 and D2.

> **Done when:** Every record has the field, counts reconcile with the curated/fitted split, and `reports/rating_audit.json` reports tier distributions broken out by confidence.

---

**[A6]** *(pipeline)*

### Add a country-relative layer beside the absolute score

> FILES: **new** pipeline/country_context_layer.py  ·  **edit** run_pipeline.py

The absolute score stays absolute — that is the product's spine, and it should not become "good for Latvia". But a browsing user needs to know where a place stands *within the country they are actually going to*. Emit three new fields per destination:

- `country_rank` and `country_n` — position within its country by score
- `country_percentile` — 0–100
- `country_badge` — `"top_of_country"` for the highest-scoring destination in each country, `"best_of_country"` for the rest of the top `max(3, round(0.08 × n))`, else null

Under this rule 18 destinations across 13 currently label-less countries gain a first badge — Helsinki, Golubac, Riga, Tallinn, Troodos, the Curonian Spit — and no absolute score moves by a thousandth. Add a matching `class_percentile` so "one of the best villages in Europe" is expressible too.

> **Done when:** Every one of the 43 countries has at least three badged destinations, and no country's absolute scores changed.

---

**[A7]** *(pipeline)*

### Generate a prioritised curation queue

> FILES: **new** pipeline/diagnostics/appeal_queue.py  ·  **out** reports/appeal_queue.csv

A4 and A6 are compensations; the real fix is closing the 1,468-place appeal gap. Rank uncurated destinations by expected impact — modelled score × fame percentile × country-coverage deficit — so hand-scoring effort goes where it changes the most surfaces. Cap the queue at 300 rows per run and stamp it with the run date.

Expect Germany, the Netherlands and Sweden to dominate the first pages. That is correct: they are the countries where the interface is currently lying by omission.

> **Done when:** The CSV exists, the top 50 rows are dominated by countries with sub-40% coverage, and re-running after new curation shrinks the queue.

===

## Phase B — Coverage and findability

Five steps. Two problems dressed as one: places that exist but cannot be found, and places that were never ingested.

---

**[B1]** *(pipeline)*

### Model cluster members as first-class sub-destinations

> FILES: **edit** pipeline/place_layer.py  ·  **schema** add `members[]`, `parent_id`

Amalfi Coast, Cinque Terre, Lake Como, Luberon, Lake Garda and the other `area` entries are containers. Give each a `members[]` array of real named settlements with, at minimum: name, coordinates, one line of description, visit hours, and — where the data supports it — its own beauty and highlights values. Give each member `parent_id` pointing back.

Members are searchable and linkable but do not get their own tier badge unless they are promoted to full destinations. Seed the first pass from the obvious set: Positano, Amalfi, Ravello, Praiano; Vernazza, Manarola, Riomaggiore, Monterosso, Corniglia; Bellagio, Varenna, Menaggio, Tremezzo; Gordes, Roussillon, Ménerbes, Bonnieux, Lourmarin.

> **Done when:** Every `area` destination with a parenthesised name or a known village set has ≥3 members, and each member resolves to its parent page with the member highlighted.

---

**[B2]** *(pipeline + app)*

### Build a fold-and-alias search index

> FILES: **new** pipeline/search_index_layer.py  ·  **edit** continent-app/src (search component)

Emit a `search_index.json` where every destination and every member contributes multiple keys:

- **Folded form** — NFKD-normalised, diacritics stripped, hyphens and apostrophes to spaces (`Kuldīga` → `kuldiga`, `Český Krumlov` → `cesky krumlov`)
- **Parenthetical split** — `Luberon (Gordes)` indexes under both *luberon* and *gordes*; `Bergamo (Città Alta)` under both
- **Endonym and common exonym** — Firenze/Florence, Wien/Vienna, München/Munich, Praha/Prague, Lisboa/Lisbon
- **Member names** — resolving to the parent, labelled "in Amalfi Coast"
- **Region and island names** — Provence, Tuscany, Andalusia, Algarve, Cyclades as query terms that filter rather than resolve

Match on prefix first, then folded substring, then a bounded edit distance of 1 for queries of 5+ characters. Never return zero results for a real European place name without offering the nearest three.

> **Done when:** These all resolve: *positano, eze, cesky krumlov, kuldiga, obidos, varenna, gordes, munich, firenze*. A search returning nothing shows suggestions, never an empty box.

---

**[B3]** *(pipeline)*

### Register-driven intake for missing destinations

> FILES: **new** pipeline/intake/register_intake.py  ·  **out** reports/intake_candidates.csv

Mougins is missing because nothing in the pipeline is responsible for asking "which villages in this register do we not have?". Build that. For each register, pull the full membership from Wikidata by property query, fold the names, diff against the catalogue, and emit the misses with coordinates and a first-pass beauty estimate:

| Register | Approx. members | Wikidata handle |
|---|---|---|
| Les Plus Beaux Villages de France | ~176 | Q1552368 |
| I Borghi più belli d'Italia | ~360 | Q2085187 |
| Los Pueblos más bonitos de España | ~120 | association list |
| Aldeias Históricas / Vilas de Portugal | ~40 | association list |
| Cittaslow, Cité de Caractère, Kleinod | ~300 | per-network |
| UNESCO tentative list | ~600 | UNESCO API |
| National parks & EU national heritage towns | ~450 | OSM + Wikidata |

Do not auto-ingest. Emit candidates with an `auto_admit` flag for the unambiguous ones (a register member with coordinates, population and a hero image available) and leave the rest for review. Run it as its own cadence tier in `run_pipeline.py`, monthly.

> **Done when:** The first run surfaces Mougins, Valbonne, Vence, Tourrettes-sur-Loup, Gourdon, Frigiliana and Sirmione, and the report states register coverage as a percentage per register.

---

**[B4]** *(pipeline)*

### Geographic gap detection

> FILES: **new** pipeline/intake/gap_scan.py

Registers do not catch everything. Add a spatial scan: grid Europe into ~25 km cells, and for each cell holding a destination, look for OSM settlements in adjacent cells that have a heritage designation, a tourism-relevant tag cluster, or a Wikivoyage article, and are absent from the catalogue. Rank by proximity to existing high-scoring destinations — half a micro-region present is the signature of a miss.

> **Done when:** The scan flags the Côte d'Azur hinterland cluster, and produces fewer than 800 candidates Europe-wide (otherwise the thresholds are too loose to act on).

---

**[B5]** *(pipeline)*

### Publish coverage honestly

> FILES: **new** pipeline/diagnostics/coverage_report.py

Per country: destinations held, per 10,000 km², per million residents, register coverage, appeal coverage, and layer coverage for the partial layers (designations 37%, nature 49%, crowding 46%, bathing water 30%, written guide 34%). This is the report that tells you where the catalogue is thin before a user does.

> **Done when:** The report runs in CI and fails the build if any country's register coverage drops below its previous run.

===

## Phase C — The Explore page

Nine steps in `continent-app/src/`. The organising idea: a card must answer *what kind of place is this*, *how good is it*, and *what would I do with it* — three separate questions currently collapsed into one orange ribbon.

---

**[C1]** *(react)*

### Define the three encodings before writing components

> FILES: **new** continent-app/src/lib/taxonomy.js

Three orthogonal axes, each with exactly one visual home on the card. Never encode two of them the same way, and never rely on colour alone.

| Axis | Values | Visual home |
|---|---|---|
| Kindwhat it is | metro · city · town · village · area | Glyph + word, top-left of the card body, plus card size |
| Verdicthow good | tier 3 / 2 / 1 / none, plus hidden-gem | Ribbon, top-left of the image — only for tier 2 and above |
| Rolewhat you do with it | base · day trip · stop · basecamp | Meta line, bottom of card, beside hours |

Derive **Role** in this module from fields already published — it is the single most useful thing you can add and it costs no pipeline work:

```
base      visit_hours >= 8  AND base_suitability high      → "Stay 2–3 days"
basecamp  visit_hours 5–8  AND >= 4 day-trips within 60 min → "Sleep here, ride out"
day trip  visit_hours 3–6  AND transit good/excellent       → "A day, from nearby"
stop      visit_hours < 3                                   → "Two hours, en route"
```

> **Done when:** Every destination resolves to exactly one kind, one verdict and one role, and the module has unit tests covering the boundaries.

---

**[C2]** *(css)*

### Extend the design tokens for kind and verdict

> FILES: **edit** continent-app/src/styles.css (`:root`)

Add a token block rather than hardcoding in components. Kind gets a neutral-weight ramp, not a rainbow — the hierarchy should read as ink density, so it survives greyscale and colour-blindness. Verdict keeps the existing accent, and gains one distinct hue for hidden gems that does not collide with it.

```
--kind-metro: solid square, ink at 100%    --kind-town:    circle, ink at 62%
--kind-city:  round-square, ink at 78%    --kind-village: small dot, ink at 45%
--kind-area:  triangle/leaf, ink at 50%
--verdict-3: --accent (filled ribbon)     --gem:      #2c6e63 teal, own chip
--verdict-2: --accent (outline ribbon)    --gem-bg:   tint for both themes
--verdict-1: ink-mute (text only)
```

> **Done when:** Tokens are defined in bare `:root` first and redefined in both the `prefers-color-scheme` and `[data-theme]` blocks, and every new component reads them rather than literals.

---

**[C3]** *(react)*

### Rebuild the card

> FILES: **edit/new** continent-app/src/DestinationCard.jsx

The current card is a photo with a name, a flag, a price and a number, and a ribbon that is always the same. Restructure into four fixed slots so a column of cards reads as a table:

- **Image** — verdict ribbon top-left only when tier ≥ 2; gem chip top-right when flagged; shortlist star stays where it is
- **Identity** — kind glyph + kind word + country, then the name in the display face
- **Verdict line** — score, and the country-relative line when it earns one: *"3rd best in Portugal"*, *"Top of Finland"*
- **Meta line** — role phrase · visit hours · price a day, with a car icon when `car_needed`

Worked examples (see the published plan for the rendered sketch and glyph legend):

```
[ image · ribbon "Worth the journey" ]     [ image · no ribbon ]        [ image · chip "Hidden gem" ]
■ Metro · Italy                            · Village · France           ▲ Area · Slovenia
Rome                                       Mougins                      Lake Bled
Stay 2-3 days · 17 h · EUR 85              Two hours, en route · EUR 71  Sleep here, ride out · 6 h · EUR 78
```

Kind glyphs, in decreasing ink weight: metro = filled square, city = rounded square,
town = circle, village = small dot, area = triangle. Weight encodes scale, so the
ramp survives greyscale and colour-blind viewing.

---

**[C4]** *(react)*

### Vary card size by kind — the grid becomes the legend

> FILES: **edit** continent-app/src/Explore.jsx · styles.css grid rules

This is the fastest route to the "clear from the start" requirement. Keep a 12-column CSS grid and let kind pick the span, so the page has a visible rhythm before anything is read:

- **metro, and any tier-3** — 6 columns, 16:10 image, larger name
- **area** — 6 columns, 21:9 letterbox image; landscapes read as landscapes
- **city** — 4 columns, 4:3
- **town, village** — 3 columns, 1:1, compact meta

Guard against ragged rows: run a small packer that fills each row exactly, and fall back to a uniform 4-column grid below 900 px. Add `prefers-reduced-motion`-safe hover only, no entrance animations.

> **Done when:** No row has a gap, the first viewport contains at least three different card sizes, and the mobile layout is a clean single column.

---

**[C5]** *(react)*

### Replace the flat wall with editorial rails

> FILES: **new** continent-app/src/ExploreRails.jsx

A rating sort puts 23 Italian entries in the first 60 cards. Lead instead with horizontally-scrolling rails, then the full grid below. Every rail is a query against fields that already exist:

| Rail | Query | Size |
|---|---|---|
| The 43 | tier == 3 | 43 |
| Hidden gems | gem == true, shuffled by country | 292 |
| The best of every country | country_badge != null, one row per country | ~150 |
| Villages worth the drive | kind == village AND tier >= 1 | ~340 |
| Great right now | current_month in best_months | varies |
| Go without a car | car_needed == false AND transit in (good, excellent) | ~900 |
| Under €70 a day | daily_cost = 1 | ~400 |
| Quiet in high season | crowding_tier = 1 | ~200 |

Cap each rail at 12 cards with a "See all 292" link that opens the grid pre-filtered. Rails render server-data-only — no client fetch, no skeleton state, everything visible at rest.

> **Done when:** The first screen shows at least four countries and three kinds, and every rail link lands on a grid with the matching filter chips already applied.

---

**[C6]** *(react)*

### Rebuild the filter rail

> FILES: **edit** continent-app/src (filter sidebar) · **new** FilterChips.jsx

Current problems: sort options are rendered as stacked buttons that look like filters, a separate "Filters" button hides most of the controls, active filters appear as one pink box, and there is no result count. Fix the whole rail:

- **Result count at the top** — "412 destinations" updating live; this is the single most reassuring element on a filter UI
- **Sort as a select**, visually distinct from filters, moved to the grid header where the results are
- **Kind** as a new filter group with the same glyphs as the cards — five toggles, multi-select
- **Verdict** group: worth the journey / a detour / a visit / hidden gems
- **Role** group: base / day trip / stop
- **Practical** group: no car needed · under €X a day · good in [month] · not crowded · near the sea · UNESCO
- **Active filters as removable chips** in one row above the grid, plus "Clear all"
- Filter state in the URL query string, so a filtered view is shareable and back works

> **Done when:** Every filter is reachable without opening a modal, the count never disagrees with the grid, and reloading a filtered URL restores the exact view.

---

**[C7]** *(react)*

### Add a map view

> FILES: **new** continent-app/src/ExploreMap.jsx

Travel is spatial and the catalogue is fully geocoded. Add a grid/map toggle in the header. Cluster below zoom 6; above it, draw markers whose *size* is kind and whose *fill* is verdict — the same encoding as the cards, so the legend is learned once. Filters apply to both views. Hovering a marker previews the card; the viewport syncs to a bounding-box filter so panning narrows the list.

> **Done when:** 3,038 markers render at 60 fps on a mid-range laptop, and switching views preserves filters, scroll intent and the result count.

---

**[C8]** *(react)*

### Explain the system on the page itself

> FILES: **new** continent-app/src/TierLegend.jsx

A strip below the header, dismissible and remembered, that states the four tiers in one line each with their counts, and shows the five kind glyphs. Link "How the score works" to the catalogue reference. Users trust a rating they can see the shape of; right now the meaning of "Worth the journey" is only inferable from the fact that everything has it.

> **Done when:** The legend is visible on first load without scrolling, dismisses to a small "?" affordance, and the state survives a reload.

---

**[C9]** *(react)*

### Country pages as a real destination of their own

> FILES: **new** continent-app/src/CountryPage.jsx

Clicking a country should not just filter the grid. Give it a page: the country's badged destinations first, then kinds broken out (its best cities, best villages, best landscapes), a coverage line stating how many places Carta holds there, typical daily cost, when to go, and whether a car is generally needed. This is where the country-relative work from A6 pays off — Finland gets a page with a top three instead of an unlabelled wall.

> **Done when:** All 43 countries render a page with at least three badged destinations and no empty sections.

===

## Phase D — Destination page depth

Seven steps. The Rome page is already dense — the problem is order and omission. It opens with prose and a map, and buries the things a traveller decides on. Meanwhile whole layers the pipeline computes never reach the screen.

---

**[D1]** *(react)*

### Reorder the page around the decision sequence

> FILES: **edit** continent-app/src (destination page composition)

People decide in a fixed order: *should I go → when → for how long → where do I sleep → how do I get there → what do I do → what does it cost*. Rebuild the page in that order, with a sticky sub-nav:

- **Verdict** — score, tier, why in one sentence, kind, country rank, confidence mark
- **When** — best months, weather strip, crowding by month, festivals
- **How long** — visit hours → a suggested shape ("two full days"), and the role phrase
- **Where to sleep** — neighbourhoods with their own prices *(already in the data, never shown)*
- **Getting there and around** — anchor airport, transfer leg, transit quality, car needed and why, parking
- **What to do** — highlights, best things to do, day trips
- **What it costs** — the existing panel, plus a trip total

> **Done when:** A user can answer "when, how long, where do I stay, how do I get there" without scrolling past the halfway point.

---

**[D2]** *(react)*

### Surface the rating breakdown honestly

> FILES: **edit** continent-app/src/RatingBreakdown.jsx

Show the four components as small bars on the same 0–10 scale, the country rank line from A6, and the confidence mark from A5 — *"Modelled: no curator has scored this place yet"* with a link to how that works. Where a component is unusually high, say so in words: *"Scores high on heritage density."* A visible breakdown is what makes a 7.4 feel measured rather than stingy.

> **Done when:** Every destination page renders the breakdown, and modelled places are marked without being visually demoted.

---

**[D3]** *(react)*

### Ship the layers that already exist but never render

> FILES: **new** Neighbourhoods.jsx, GettingThere.jsx, CrowdCalendar.jsx, BathingWater.jsx

| Held in the data | Coverage | What to render |
|---|---|---|
| Named neighbourhoods with prices | 100% | A "where to sleep" block, cheapest to dearest, with a one-line character note |
| Anchor airport + transfer leg | 100% | "Fly to FCO, 32 min by train" above the fold |
| Transit quality + car needed | 100% | A single verdict line — 1,344 places are rated poor and users must be told |
| 12-month accommodation seasonality | 100% | A price curve beside the weather strip — when is it cheap |
| Crowding tier + tourist nights/km² | 46% | A month-by-month crowd bar, not one word "Crowded" |
| Bathing water quality | 30% | On coastal and lake destinations only |
| Depth (0–1 breadth of things to do) | 100% | Feeds the "how long" section; do not show the raw number |

Every partial layer needs an honest absent state — omit the block entirely rather than rendering an empty shell, and say so in the sources footer.

> **Done when:** Rome shows neighbourhood prices, an airport line, a crowd calendar and a price curve; a 30%-coverage destination shows none of the missing blocks and no gaps.

---

**[D4]** *(pipeline + react)*

### Add the fields travellers ask for that Carta does not hold

> FILES: **new** pipeline/practical_layer.py

Ordered by how often they decide a trip, and all derivable without a new commercial data source:

- **Book ahead** — which highlights require timed entry (Sistine Chapel, Alhambra, Sagrada Família, Anne Frank House). From Wikidata + a maintained list. The most frequently regretted omission in travel content.
- **What to eat here** — regional dishes and products from Wikidata food-origin and PDO/PGI registers, which are complete for Europe and free
- **Opening rhythm** — closing day conventions, siesta hours, Sunday closures, by country with city overrides
- **Trip total** — daily cost × suggested nights + transfer, so the number is a budget rather than a rate
- **Pairs well with** — nearest destinations reachable in under 2 h that score ≥ 7 and differ in kind; a city + a village + a landscape is a better week than three cities
- **Accessibility and family fit** — step-free rating from OSM wheelchair tags on top POIs; a family flag from POI type mix

> **Done when:** Each field either renders or is absent by coverage rule, and "Pairs well with" never suggests a destination in the same kind twice.

---

**[D5]** *(react)*

### Fix the highlights grid

> FILES: **edit** continent-app/src (highlights component)

Currently a flat twelve-tile grid where the Pantheon renders as a broken image and Stadio Olimpico sits beside the Sistine Chapel with equal weight. Sort by significance, size the first three tiles larger, group by walking distance from the centre, and add a hard image fallback — a lettered plate in the paper tone, never a broken-image icon. Show significance as a small mark so the ordering is legible.

> **Done when:** No broken image renders anywhere in the catalogue, and the first three tiles on any page are its three most significant sights.

---

**[D6]** *(react)*

### Make "best things to do" scannable

> FILES: **edit** continent-app/src (things-to-do component)

The consensus count — "Named by 8 of 24 guides" — is the most trustworthy signal on the page and it is set in small orange text at the bottom of each row. Promote it to a visible strength mark. Group the list into *Essential* (5+ guides), *If you have time* (2–4), and *Off the trail* (1, or independent sources only). Add duration and a "book ahead" mark per item.

> **Done when:** The three groups render with counts, and a destination with fewer than three guide-sourced items falls back gracefully to the POI list.

---

**[D7]** *(react)*

### Render cluster members

> FILES: **new** continent-app/src/MemberPlaces.jsx

Consume `members[]` from B1. On Amalfi Coast, show Positano, Amalfi, Ravello and Praiano as a proper section with their own images, one line each, and their position on the area map. This is what a user searching "Positano" should land on, with that member scrolled into view and highlighted.

> **Done when:** A search for a member name lands on the parent page with the member highlighted, and the URL carries the anchor.

===

## Phase E — Verification

Three steps. A rating change without a regression harness is a guess.

---

**[E1]** *(tests)*

### A golden set of 120 destinations

> FILES: **new** tests/golden_ratings.json

Hand-pick 120 places whose relative order is not seriously disputable — Rome above Turin, Bruges above Charleroi, Hallstatt above Linz, Siena above Grosseto — spread across all five kinds and at least 20 countries. Assert *pairwise order*, never absolute values, so the harness survives recalibration. Run it against v3 first and record which pairs already fail: that is the improvement budget.

> **Done when:** v4 passes strictly more pairs than v3, with no pair that v3 passed now failing.

---

**[E2]** *(tests)*

### Distribution assertions in CI

> FILES: **new** tests/test_rating_distribution.py

Fail the build when any of these break: no component's modal share exceeds 40%; every component contributes at least 0.10 to score SD; |curated SD − fitted SD| < 0.08; |corr(score, log population)| < 0.10; |corr(beauty, log population)| < 0.12; every country has ≥ 3 badged destinations; tier-3 count stays between 35 and 70.

> **Done when:** The suite runs on every pipeline change and the thresholds are documented next to the assertions.

---

**[E3]** *(app)*

### Visual regression on Explore

> FILES: **new** continent-app/tests/explore.spec.js (Playwright)

Screenshot Explore at 390 / 768 / 1440 px in both themes, plus a filtered view, a map view and an empty-result state. Assert no horizontal body scroll, no broken images, and that every kind glyph has an accessible label. Because deploys land as Vercel previews needing manual promotion, run this against the preview URL and post the result before promoting.

> **Done when:** Six baseline screenshots are committed and the suite gates promotion.

===

## Delivery — Ship order

Five pull requests. The dependencies are real: C depends on A6 for country badges and on A5 for confidence; D7 depends on B1.

| PR | Contains | Why here |
|---|---|---|
| 1 · Measure | A1, E1, E2, B5 | Nothing changes yet. Build the instruments and freeze the baseline, so every later claim is checkable. |
| 2 · Score | A2, A3, A4, A5 | The four maths fixes, shipped together because they interact. Expect the tier-3 count to move; E2 catches it if it moves too far. |
| 3 · Context | A6, A7, C1, C2 | Country badges and the taxonomy module. Pure additions — no visual change yet, which makes the diff easy to review. |
| 4 · Explore | C3–C9, E3 | The visible rebuild. This is the PR the user sees, and it lands on top of numbers that are already honest. |
| 5 · Depth | B1–B4, D1–D7 | Coverage and the destination page. Largest surface area, lowest risk, best done last with real traffic on the new Explore. |

**One sequencing warning.** Do not ship Phase C before Phase A. A prettier Explore built on a score where 87% of places share a highlights value, and half the catalogue cannot reach tier 2, makes the strictness problem more visible, not less — the better the cards look, the more obviously wrong the badges are.

## Handoff — Prompts to paste into Claude Code

One prompt per pull request. Each assumes this document is saved at the repo root.

**PR 1 — Measure**

```
Read PLAN.md. Implement steps A1, E1, E2 and B5 exactly as specified.
Do not change any scoring logic in this PR. Run the audit against the
current app_data.json and commit reports/rating_audit_v3_baseline.json.
Report which of the 120 golden pairs the current model already fails.
```

**PR 2 — Score**

```
Read PLAN.md. Implement A2, A3, A4 and A5 in pipeline/. After each step,
re-run pipeline/diagnostics/rating_audit.py and show the delta against
reports/rating_audit_v3_baseline.json. Stop and report if any acceptance
criterion in the step fails rather than adjusting the criterion. Bump the
schema to v17 and the model tag to rating_v4.
```

**PR 3 — Context**

```
Read PLAN.md. Implement A6, A7, C1 and C2. A6 and A7 are pipeline work;
C1 and C2 add continent-app/src/lib/taxonomy.js and extend the :root token
block in styles.css. No component may change in this PR. Confirm that no
absolute score moved, and that all 43 countries carry at least three
badged destinations.
```

**PR 4 — Explore**

```
Read PLAN.md. Rebuild the Explore page per C3 through C9, using the
taxonomy module and tokens from PR 3. Build C3, C4 and C6 first and show me
a screenshot before continuing. Then C5, C8, C7, C9. Add the Playwright
suite from E3 and run it against the Vercel preview before asking me to
promote.
```

**PR 5 — Depth**

```
Read PLAN.md. Implement B1–B4 in the pipeline and D1–D7 in continent-app.
Start with B1 and B2, since D7 and search both depend on the members model.
For D3, render only the layers whose coverage rule passes for that
destination, and omit the block entirely otherwise.
```

## What changes for the user

After Phase A, a village in Lower Saxony with a real old town stops being invisible because nobody has hand-scored it yet — the fitted tail reaches tier 2 at the same rate as the curated one, and roughly 160 destinations gain a label they had already earned. After A6, no country is an unlabelled wall; Finland has a top three. After Phase B, Mougins exists, Positano is reachable, and typing "cesky krumlov" finds Český Krumlov. After Phase C, the first screen of Explore tells you at a glance that Rome is a metropolis you plan a trip around and Mougins is a two-hour stop in Provence — which is the whole point, and currently the one thing the page cannot say.

All figures computed from the 3,038-row catalogue published in *The Carta Catalogue*, schema v16, model rating_v3. Component dispersion, country coverage and correlation figures are reproducible from the same source.
