# T174: Elevation profile and surface mix

## Task ID

T174 (mind-map number T178), trips spec E3 and E4, with destinations spec C6 and C9 for the shared side. Branch p10-e3-e4-elevation-surface in both repos.

## Date

2026-10-03

## What changed

Hiking, trail running and cycling weeks now open a fold right under the trip facts, titled "How much you climb each day" (or "How much you climb, and on what" on a ride). Its first module is a week profile: one column per day, the day's written climb as a rise above a line and its written descent as a fall below it, on one scale, with a hairline between days and the figures under each column (+1,120 over -750 over day 4). A sentence above reads it out: "5,460 m of climbing over 7 days, the most on day 5 with 1,380 m. The plan does not state the descent." for the Istria Parenzana week. Before this task no trip showed any figure of this kind; 72 of the 75 route weeks show it now.

On cycling weeks the same fold carries the surface split as one stacked bar with its key. The Istria sentence the spec quotes is now four segments: paved secondary road 45%, compacted limestone hardpack 40%, loose gravel 10%, cobbled hilltown setts 5%. Under it sits a second bar for traffic: away from cars 50%, shared with cars 45%, not recorded 5%, marked "est". 16 of 26 cycling weeks get the surface bar and 11 get the traffic bar; the rest say in a sentence that the plan does not state it.

The part that matters for the next person is that these are not journey-only widgets. The trail page and the cycling page each had their own copy of the elevation chart; there is now one, in src/browse/RouteFigures.jsx, and the week profile draws through the same plotting function with the same fills and strokes. The trail page's Underfoot bar, the journey's surface bar, both traffic bars and the cycling page's new surface bar are all one MixBar. The cycling route page gained the two bars too (destinations spec C6), read from the surface block its wire already carried.

## How it works, and why it was built this way

The data is the trip as written. The route track that would give a true profile does not exist yet (T177-b), so the week profile is built from each day's dayStats line, and the chart says so under itself: the figures are the written climb and descent, the hairlines mark the days, and the shape inside a day is drawn, not measured. Inside a column the area rises on a shoulder, holds level and falls on a shoulder; only the height is data. That was a deliberate choice over a flat bar chart, because the spec asks for an area chart in the Komoot idiom, and over a fake continuous profile, which would invent a shape between days that nobody measured.

Parsing lives where the week strip's parsing already lived. src/lib/weekShape.js gained dayRelief(day, typeSlug), which returns km, climb, descent and the rest flag for one day using the same readers as dayEffort, so the strip above the itinerary and the profile can never disagree on a day's climb. Descent is only ever read where the line states it ("800 m descent", "550 m down", a minus-signed figure, "negligible descent" as 0); a day that names no descent gets none, never a guess from the climb. While reading all 525 route days, three ways of stating the climb turned out to be missed: "12 km return, 1,470 m", "14 km flat-ish, 350 m" and "9 km / +850 / -620 m" with the unit only after the descent. ascentM now reads those, and refuses "11 km descent, 700 m negative", which the first version of the change misread as a climb. Because ascentM also feeds the week strip, 17 days in 10 trips moved up one effort level (the Tatras, Fagaras and Pirin hut weeks most of all). No day lost or gained a bar.

src/lib/routeFigures.js turns a trip into figures. weekRelief draws a week only for the three route styles and only when at least half its days state a climb, because a profile with most columns empty reads as a flat week; that leaves out Bornholm, Saaremaa and Kattegatt, whose day lines give only kilometres. surfaceMix reads typeSpecific.surface: each "N% label" pair, the label cut at the first comma, bracket or preposition, kept only if it names a surface. The shares must add up to between 80 and 102 percent, which is what rejects sentences that split two shores or seven days separately (Balaton, Vah and Danube, Moldova add up to 200 or more). A shortfall becomes a "Not split in the plan" segment, so the Wachau week shows 95% asphalt and 5% nobody described instead of stretching the asphalt, and "the remainder compacted crushed limestone" on the Loire is read as its own share.

Each segment gets one of the four surface tones the trail page already used (paved, gravel, path, other), chosen from its own label, so a trip and a trail read alike. Two segments of one tone sit side by side separated by a 1px gap, which is how Istria's hardpack and loose gravel stay two segments.

trafficSplit regroups the same segments as away from cars, shared with cars, or not recorded. It reads the whole clause, not just the label, so "72% paved (excellent chip-seal and asphalt)" counts as shared and "40% compacted limestone hardpack (the Parenzana formation)" as away. A clause that names both a greenway and roads is not recorded, and so is a hedged free claim ("90% asphalt, much of it dedicated cycleway"). This is the cycle.travel kind of inference applied to authored words, so the page marks it as an estimate and prints the rule under the bar. Below half placed, the bar is replaced by "The plan does not say how much of the route is shared with cars."

On the cycling route page, the surface bar scales paved_share by surface_known_share and leaves the rest as unknown, and the traffic bar does the same with traffic_free_share and highway_known_share, because both shares are measured over the tagged length only. The bars stay away below a quarter known for surface (the same gate surfaceLine already uses) and a third for traffic (the gate the safety line uses).

Two visual changes reach the trail page. The surface tones were ochre for gravel and green for path, and the unknown share was a hatched repeating gradient. carta-design reserves ochre for ratings and green for good news in data, and bans gradients, and a shared component would have carried all three onto two more pages. The tones are now an ink ramp, smooth ground darkest (ink, ink-soft, ink-mute, rule), the same weight-not-hue rule as the place-kind ramp, and the unknown share is the bar's own paper-dim ground with an outlined key dot. Green is kept for exactly one segment, away from cars, because that is the good news a nervous rider is looking for. design-lint's count fell from 203 to 202 with this.

The fold opens on arrival (added to OPEN_BY_DEFAULT on JourneyPage), because difficulty is the decision these three styles turn on. JourneyPage changes by one import, one key in the open list and one mount line after the facts fold; everything else is in JourneyRoute.jsx, the same pattern WeekPlan.jsx used. The data sheet keeps the authored surface sentence untouched, so the tyre advice and the tunnel warning are still one tap away.

## Files touched

Modified (continent-app, commit 5f7fe48): src/browse/JourneyPage.jsx (import, open list, mount), src/browse/TrailPage.jsx (local ElevationChart removed, shared one imported), src/browse/CyclePage.jsx (local ElevationChart removed, shared chart plus surface and traffic bars), src/browse/RouteParts.jsx (SurfaceBar is now a MixBar adapter), src/lib/weekShape.js (dayRelief and descentM added, ascentM reads three more forms), src/styles/25-feature-pages.css (surface tones, traffic tones, week profile and cycle-bar spacing), src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (17 journey.route*, journey.relief*, journey.surf* and journey.traffic* keys after journey.wxSummary, and route.trafficFree, trafficShared, trafficUnknown and surfUnpaved after route.surfUnknown, in each file; CRLF kept; all six parse).

Created (continent-app): src/browse/RouteFigures.jsx, src/browse/JourneyRoute.jsx, src/lib/routeFigures.js, tests/routeFigures.test.mjs (five cases).

Root repo: this report and the register rows in Execution/_OPEN.md.

## Commands run

In C:\Users\Gebruiker\Documents\Portfolio\wt\T174-app: survey scripts (kept out of the commit, deleted afterwards) that ran weekRelief, surfaceMix and trafficSplit over the 253 files in public/journeys/journey, and compared weekShape at HEAD with the changed one for effort levels; a count over the 16,973 files in public/cycling/route for the cycling page bars; node --test tests/routeFigures.test.mjs tests/weekShape.test.mjs; npm run lint (0 errors, 72 warnings, none in touched files); npm test (161 pass); node scripts/ci/design-lint.mjs (202 in the baseline, 0 new); node scripts/ci/banned-terms.mjs (clean); the six-file i18n parse from the session rules; npm run build (passes), then dist/ and dist-data/ deleted; a Playwright pass against Vite on http://127.0.0.1:5205 with its own cacheDir (temporary config inside the worktree, deleted afterwards), at 380px and 1280px, over the Istria, Kattegatt, Berliner Hoehenweg and Innsbruck Nordkette weeks, the Tour des Combins trail page (#trail=10&tc=CH) and the Attert cycling page (#cycle=10&cc=LU). Screenshots are in C:\Users\Gebruiker\Documents\Portfolio\wt\T174-shots\. The dev server was stopped afterwards.

## Config and secrets set

None.

## Before/after measurements

Figures from the survey over continent-app/public/journeys/journey (253 trips; 75 route weeks, 525 days, 521 of them not rest days) and public/cycling/route.

| Metric | Before | After | Delta |
|---|---|---|---|
| Route weeks with a week profile | 0 of 75 | 72 of 75 (24 hiking, 25 trail running, 23 cycling) | +72 |
| Moving days with a stated climb drawn | 0 | 486 of 521 | +486 |
| Moving days with a stated descent drawn | 0 | 143 of 521 | +143 |
| Profiles with descent on every day / some days / none | not applicable | 11 / 26 / 35 | |
| Cycling weeks with a surface bar | 0 of 26 | 16 of 26 | +16 |
| Cycling weeks with a traffic-exposure bar | 0 of 26 | 11 of 26 | +11 |
| Week-strip days whose effort level changed (parser fix) | | 17 days in 10 trips, all one level up | |
| Days with an effort bar in the week strip | 1,091 | 1,091 | 0 |
| Elevation chart implementations in src | 2 | 1 | -1 |
| Pages drawing the shared stacked bar | 1 (trail) | 3 (trail, cycling, journey) | +2 |
| Cycling route pages with a surface bar | 0 of 16,973 | 15,093 of 16,973 | +15,093 |
| Cycling route pages with a traffic-exposure bar | 0 of 16,973 | 16,961 of 16,973 | +16,961 |
| design-lint violations (all in the baseline) | 203 | 202 | -1 |

The cycling route figures count the files in public/cycling/route whose surface block clears the gates above (surface known on at least a quarter of the line, highway class on at least a third).

Browser check: no page errors at either width, no horizontal scroll on any of the six pages, and no figure under the week profile wider than its column at 380px.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Every surface share after the first was dropped | The clause pattern consumed the next share's number before its percent sign | Clause runs lazily up to a look-ahead for the next share |
| "Sheep-pasture doubletrack" coloured as gravel | Tone was read from the whole clause, which mentions hard-packed earth | Tone from the label, traffic from the clause |
| Kattegatt claimed 100% away from cars | "much of it dedicated cycleway" read as all of it | A hedged free claim is not recorded |
| "11 km descent, 700 m negative" read as a 700 m climb | The widened distance-then-metres pattern | Refuse when the words after the distance say descent, or the metres say negative, down or loss |
| "-0" and "+0" under a column | Negligible descent and rest days are stated zeros | A stated zero prints as 0 |
| The two cycling bars sat flush against the sentences | No spacing on the cycling page | One wrapper with token spacing |
| First Vite start re-optimised the shared dependency cache | Started without the session's own cacheDir; node_modules is a link to the main checkout | Stopped within a minute and restarted with a temporary config whose cacheDir is inside the worktree; other sessions' Vite may re-optimise once on their next start |
| Desktop check could not find the Trips category | The desktop shell uses .side-cat, the phone .places-cat | The check script clicks either |

## Seven questions before shipping (carta-design)

No hex value outside :root: every fill and stroke is a token. No gradient: the hatched unknown share, a repeating-linear-gradient, is removed; no new colour. Ochre and green no longer colour surfaces; green marks only the away-from-cars share, which is good news in data, and teal and danger are not used. Mono carries only the measured figures (the metres under the columns, the percentages in the keys, the day numbers); every sentence and label is in the sans. No new button, so no second primary. Every new heading has a verb or a number ("How much you climb each day", "How much you share with cars"; "Underfoot" is the existing trail-page key), and the diff has no em dash, no middot and none of the banned words. Removed one thing: the traffic bar on weeks where less than half the route can be placed. A bar that is mostly "not recorded" carries nothing, so those weeks get one sentence instead.

## What is still open

The week profile is a stand-in for the real one. When the route track wire exists (T177-b), JourneyRoute should pass the track's elevation block to ElevationChart for the true profile and keep the week profile as the per-day summary under it; T177-d already asks the track task to write measured climb and descent back into dayStats as numbers, and dayRelief already reads the object form when it does (T174-a).

Descent is stated on only 143 of 521 moving days, so 35 of the 72 profiles show the climb alone with a sentence saying the plan does not state the descent. The authoring pass the owner starts for T170-a and T170-b should add a descent figure to every route day line (T174-b).

10 of 26 cycling weeks give no single whole-route surface split: Balaton and Vah-Danube split by section, Moldova by day, and seven (Bodensee, Alsace, Flemish Ardennes, South Bohemia, both Dutch weeks, Moselle-Mullerthal) describe surfaces with no shares. Only 11 can be read for traffic at all. The fix is in the data: a structured surface split and a traffic-free share per cycling trip in typeSpecific, filled in the same authoring pass (T174-c).

Three readings here are Carta's own and should be confirmed by the owner: the word lists that turn a surface clause into away from cars or shared with cars, the half-placed gate for drawing the traffic bar, and the move of the trail page's surface tones from ochre and green to the ink ramp, which changes a page that was not this task's to design but shares its component (T174-d).

Destinations spec C9 asks for a cycling card band made of the route glyph, a 6px surface strip along the bottom and the elevation sparkline behind it. Both pieces now exist as MixBar and AreaPlot, but the cards were not touched here (T174-e).

T171-a says the dev server crashes the journey page; it did not in this session, on a Vite dev server with its own cacheDir, across four journey weeks at two widths. T171-a is about T171's own checks, so it is left for its owner rather than closed here.

## Rollback procedure

In continent-app, git revert 5f7fe48. In the root repo, revert the commit that adds this report and the T174 register rows. No data, schema, migration or stored state is involved.
