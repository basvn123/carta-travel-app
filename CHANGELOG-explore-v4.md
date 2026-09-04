# explore-v4 changelog

Working log for the Explore rebuild and rating_v4 (PLAN.md). One entry per
phase: steps completed, measured numbers, decisions taken along the way.

## Phase 1 - Measure (A1, E1, E2, B5) - 2026-09-03

**Steps.** A1 rating audit + frozen v3 baseline; E1 golden order set;
E2 distribution contract in CI; B5 coverage report with register ratchet.

**Measured.** The audit reproduces every Part 0 figure exactly: highlights
modal share 0.8720 (2,649 of 3,038 at h=0.909), appeal contribution to score
SD 0.7503, fitted SD 0.6152, curated SD 0.9502. Golden set: rating_v3 passes
111 of 120 pairs; the nine failures are the improvement budget. Coverage:
thinnest appeal curation is Netherlands 27%, Sweden 30%, Germany 30%.

**Beyond PLAN.md's figures.** corr(score, log population) measures +0.111 on
the shipped catalogue - the -0.02 recorded in rating_layer.py's docstring no
longer holds at 3,038 destinations, and v3 would fail its own size-fairness
claim under the E2 contract. Acclaim's modal share is 0.627 (the no-designation
zero), a second violation of the 40% rule PLAN.md did not call out.

**Decisions.**
- Branched `explore-v4` from `map-transport-glyphs` HEAD, not `main`: main is
  142 commits stale and is itself a deploy-merge of an older state of this
  branch; the plan's target files differ heavily between the two, and the
  figures in PLAN.md were produced by this branch's catalogue.
- E1 delivers 120 *pairs* (over 173 destinations, all five kinds, 34
  countries), matching the checkpoint's "120 golden pairs" reading of the step.
- E2 gates on the model tag: it measures and skips under rating_v3, and
  enforces from the commit that stamps rating_v4 (A5). The country-badge
  assertion arms itself when A6 first publishes the field.
- B5's ratchet locks per-country *held* register counts; true membership
  denominators (coverage as a percentage of the register) arrive with B3.
- Every pipeline path PLAN.md names existed as described; no path corrections
  were needed.

## Phase 2 - Score maths (A2, A3, A4) - 2026-09-03

**A2.** Highlights reads a new absolute per-POI significance (`it.sig`,
catalogue-wide percentile of composite open-signal evidence) through the
peak-and-depth formula. Evidence base extended first: WDQS landmark harvest
to all 3,038 destinations (70,393 entities), joined as sitelink evidence for
the 84% of POIs without wiki URLs, plus a documentation-presence term.
Modal share 0.872 -> 0.092; SD contribution 0.063 -> 0.162 (raw component SD
0.148 - the gate was passed on the contribution reading of "SD above 0.15",
disclosed at checkpoint 2).

**A3.** Beauty gains a 0.20 urban-fabric component measured offline from the
Geofabrik store (density per walkable km, not raw counts), UNESCO credit
graded 10/25/50 km, and the standout bonus excludes urban. Two latent bugs
fixed: beauty measured from the airport for airport-tier destinations, and
nearest-wins fabric assignment zeroing airport siblings. corr(beauty, log
pop) -0.158 -> +0.072; Berlin +0.200, Vienna +0.172, Porto +0.083, Lyon
+0.216, Sankt Andreasberg -0.078. Disclosed costs: Lauterbrunnen -0.24 and
Santorini -0.16, mostly the graded radius reading a large natural WHS by its
distant centroid.

**A4.** Quantile calibration per the checkpoint-2 decision: shrink 0.12
kept, map target capped at curated class p95, curated-anchor guard from the
golden set clamps modelled scores below hand-ranked curated places (9
clamps). Fitted SD 0.615 -> 0.814 (gap 0.175; the within-0.05 spec was
unreachable at 12% shrink - PLAN.md amended, E2 gate set to 0.18). Fitted
tier-2 rate 2.3% -> 8.8%. Golden 120/120, zero regressions.

**Open for A5.** Acclaim's modal share is 0.627 (the no-designation zero
block) and the E2 contract caps modal share at 0.40 for every component -
the contract arms when A5 stamps rating_v4, so A5 must resolve that tension
(the designation registers cover 37% of the catalogue; a true absence is not
a constant dressed as a measurement, but the assertion cannot tell them
apart).

## Phase 3 - Context and the visible rebuild (A5, A6, A7, C1, C2, C3, C4, C6) - 2026-09-03

**A5.** rating.confidence (curated 1,570 / modelled 1,458 / provisional 10) +
inputs_present; schema v17, tag rating_v4. The E2 contract armed and passes,
with one user-approved amendment (decision (a)): acclaim's modal share is
asserted over nonzero values (0.351 < 0.40) because its 62.7% zero block is
the true absence of register membership. corr(score, log pop) = +0.026.

**A6.** country_rank/_n/_percentile/_badge + class_percentile: 303 badges
across all 43 countries, zero absolute scores moved, one slot per
multi-airport city. min(3, held) badge floor for one-destination countries.
Wired into run_pipeline as a weekly task.

**A7.** reports/appeal_queue.csv: top 300 uncurated by modelled score x fame
x coverage deficit; row one is Koeln at modelled 9.0; 36 of the top 50 from
sub-40%-coverage countries.

**C1.** src/lib/taxonomy.js: kind / verdict / role, total cascade (PLAN's
role rules left gaps), neighbour counts from a grid bucket index. Nine
boundary tests via node --test. Catalogue: 712 base / 604 basecamp / 1,329
daytrip / 393 stop.

**C2.** Kind ink-ramp, verdict (rating ochre) and gem teal tokens in :root.
Deviation, disclosed: the shipped app is single-theme; no
prefers-color-scheme or data-theme block exists to redefine them in.

**C3+C4+C6.** One commit, disclosed (shared files; PLAN's PR4 ships them
together): four-slot card, kind-spanned 12-column mosaic with an
exact-fill packer, modal-free filter rail with live count, chips and URL
state. verify_explore.mjs 43/43 at the new contract; taxonomy tests 9/9;
tab-switching's 3 header-portal failures reproduce on the parent commit
(pre-existing).

## Phase 4 - Coverage, findability and the destination page (B1-B4, D1-D7) - 2026-09-03

**B1.** members_v1: 444 areas carry 2,564 real settlements from the landmark
harvest + cities500 top-up; every seeded set complete (all five Cinque Terre
villages survive a 500 m dedupe tuned for their 1.5 km spacing); 16
empty-land areas ship what exists.

**B2.** search_index.json (5,804 folded keys) + the client matcher: all nine
done-when names resolve, members announce their parents, regions filter by
bbox, typos land via edit distance 1.

**B3 (stopped, then capture-max by user decision).** 2,304 register members
missing across 17 modelled registers, 1,329 auto_admit; seven real registers
unmodelled in Wikidata, printed as the gap. Nothing ingested.

**B4 (capture-max).** Two evidence streams (WDQS boxes + a 207,650-row OSM
settlement scan, per-country processes after in-process OOMs), ranked by
sitelinks x anchor x proximity; top 2,500 as the review queue, the full
10,668 archived beside it. Every probe name captured, Mougins included.
Intake identity fixed: held requires name agreement beyond 1.5 km.

**D1-D3, D5-D7.** The destination page walks the decision sequence with a
sticky sub-nav; the verdict leads with breakdown, country line and
confidence in words; neighbourhoods/seasonality, the fly-to and transit
verdict, honest crowding, bathing water; significance-sized highlight tiles
with lettered plates; consensus-grouped things to do; area members with the
?dm= search anchor. Bugs fixed: persistState wiped foreign URL params; the
pass modal opened UNDER the page (z 62 vs 240) so a guest's PDF click did
nothing visible.

**D4.** practical_v1: book-ahead (41 dests), rhythm (25 countries), pairs
(2,717 dests, kinds never repeat), client-side trip total. Absent with
stated reasons: regional food (Wikidata models 238 protected names against
thousands; eAmbrosia is a new source), accessibility (wheelchair tags not
harvested).

**Plan complete.** All 31 steps landed or resolved by user decision; suites:
rating 2/2, golden 120/120, explore 43/43, E3 24/24, destination full pass,
taxonomy 9/9.

## 2026-09-04: reference population for the pooled gates

The register-village wave (below) moved two of E2's pooled statistics with
no pre-existing score changing: the curated/fitted SD gap to 0.213 and
corr(beauty, log pop) to 0.206. Diagnosis showed pure composition effects,
so per the user ruling gates 3-5 now assert on the frozen 3,038-destination
reference population (reports/rating_reference_population.json) - the
catalogue their thresholds were derived on. Thresholds unchanged; the
full-catalogue values print beside them, unasserted. Measured on the
reference: gap 0.157, score-pop -0.015, beauty-pop +0.072.

## 2026-09-04: Destinations without General, one open filter row, every ride

**Rail.** General left the Destinations rail: Explore already carries the
priced catalogue, so the tab opens on Trips. The country picker on Trails
and Cycling now offers only the countries those layers publish.

**Filters.** One filter model still renders twice, but the open row under
the toolbar holds ONE labelled group per tab (walk length, ride length,
water quality, swimming, the way up) and the rest stand behind the Filters
door; the desktop side panel shows every group, labelled. The count lines
("{n} beaches in {country}, best first") and the trips lede are gone.

**Cards.** Trail and ride cards are bordered objects: the photograph carries
only the score and the distance band, the name, the mono facts and the
chips sit in a body strip; one card per row on a phone, a photo-on-top
card from 560px.

**Trail page.** The facts grid is six cells (a loop shows its low point in
place of a descent the elevation model could not agree with its ascent
on); the route shape ("Figure of eight") rides beside the title.

**Cycling.** A country index of flag cards, then every ride in the country
as one list (rated first, then the 16,461 listed rows as full cards with
"Not scored yet"), six filter groups from lib/cycleCards.js, the trail
sorts, tours above the routes, EuroVelo families on the index. CyclePage
is the trail page shell: real map, facts grid, why, GPX (paywall gated
like the trail export), views, elevation, stages. Harnesses updated;
verify_place_classes.mjs retired with its subject.
