# T181: 5.5, the signature visuals, one instrument family

## Task ID

T181 (mind-map number T185). Branch p10-5-5-signature-visuals in both repos. App commit ad9b534 on top of master 49abb75; the root commit carries this report and the register rows.

## Date

2026-10-04

## What changed

Each of the five detail pages now carries one signature figure in slot 5 of the T180 skeleton, and four of the five card types carry a 6 px data strip along the bottom of their photograph. The figures measure different things but are drawn as one instrument: a --paper-dim panel, a caption in the sans with its figure in mono, either twelve month cells or one 100%-wide bar, and one hairline axis under the track with mono figures on it. No section has a colour of its own. Every fill is the ink ramp the surface bar already used (--rule, --ink-mute, --ink-soft, --ink), so on every page a darker mark means more of the thing measured. The one accent is the trail profile's marker, because it is the live point on the route. Put side by side, the five read as the same instrument with different readings in it, which is what spec 5.5 asks.

The trail page draws the measured profile with every stretch shaded by how steep it is, on the same two steps the trail wire already reports (10 and 15 percent, pipeline/trails/elevation.py steep_shares). The grade is read over a window of at least 90 m, the span the pipeline measures over, so a single 60 m sample of DEM noise does not stripe the profile with walls. The key under it gives the length in each class in kilometres, and those lengths are the wire's own steep10_pct and steep15_pct, not a recount, so the page and the card agree. The profile is scrubbable: a mouse hover, a sideways drag on a phone or the arrow keys (it is a slider to the keyboard and to assistive technology: arrows a fiftieth of the walk, Page Up and Down a fifth, Home and End) move a marker, the caption reads out distance, height and grade, and TrailPage's new highlightAt(along_m) puts an accent ring at the same point on the map. The profile's distances are measured along the full-resolution line, so highlightAt scales them onto the drawn line's own length before placing the ring. The map line was already --accent with a white casing and is unchanged.

The cycling page puts the surface bar and the traffic bar on one kilometre axis, 0 to the route length, with the keys under the axis so the two bars sit directly over the ruler they share; each class is now given in kilometres (shares times carta.surface.total_m) instead of percent. The sentences that explained the two bars stay under the instrument.

The beach page draws its three month rows on one axis, sea temperature, wave height and crowds. None of the three exists in the beach wire for any beach, so each row is an empty dashed track that says "Not measured yet", and a note under the panel says so in one sentence. The rows keep their places so that when the sea and wave arrays arrive each one becomes a twelve-bar row like the lake's, with nothing else to redesign. The beach map gains a 48 px compass rosette in its bottom-left corner: a filled wedge on a hairline circle pointing the way the shore faces, from the wire's aspect field, with "Faces south-west, 215 degrees from north" as its label.

The lake page draws the estimated water temperature as twelve bars on a fixed 0 to 28 degree scale: months at or above the Lifestyle warm threshold are filled, the rest are outlines, and the warmest month carries its figure at the crest. Under the month axis comes the depth-versus-area wedge of spec E4, hanging from a surface hairline, as wide as the square root of the area and as deep as the greatest depth, on two fixed log scales (0.1 to 100 km across, 1 to 500 m deep) so a tarn and Lake Geneva sit on one grid. The wedge is a glyph of two figures, not a measured bed, and the note says the cross-section is not in the data yet. The estimate note stays visible under the panel instead of behind an info button.

The mountain page draws the height on a fixed 0 to 5,000 m ruler (Mont Blanc, 4,806 m in the wire, is the top of what Carta publishes) with the prominence part solid and the rest pale, so a real mountain reads mostly solid and a bump on a ridge mostly pale. The horizon row is an empty track saying "Not computed yet", and the existing season strip (the shared MonthStrip) is the third row. Nothing on the map side changed for mountains; there is no viewshed polygon to draw.

The card strips: a trail card shows its slope mix (the same three classes and fills as the page's profile, from the list wire's steep.p10 and p15), a cycling card its paved against unpaved share, a lake card its twelve swim months with the warmest one darkest, and a mountain card its altitude bar with the prominence solid. A beach card has none, because there is no sea temperature to draw, and every strip returns nothing when its row has no reading, so no card shows an empty bar. The strips are aria-hidden; the button's name is the place and the figures are on the page.

Two departures from the spec, both forced by the data. The spec's trail card strip is an elevation sparkline, but the trail list wire carries no profile (only ele.min, max, start and end), and a sparkline drawn through four points would be a guess wearing a chart; the strip shows the measured slope mix instead (row T181-h). And the lake page no longer draws its month row through the shared MonthStrip: that component prints a month initial in a tinted cell and has no notion of a value per month, and the lake row needs a bar height and a crest figure. The new MonthBars uses the same twelve-column grid so the two line up, and the mountain page still uses MonthStrip unchanged.

How it is built, for whoever maintains it. lib/signature.js holds every number: the slope classes and runs, the shares, profileAt, pointAlong, monthCells, the fixed scales (TEMP_SCALE_C 28, ALT_SCALE_M 5000, the wedge ranges), compassPoint, and the kilometre and traffic helpers. It is pure and covered by tests/signature.test.mjs. browse/Signature.jsx holds the frame and the parts (Instrument, Row, MonthBars, MonthAxis, SpanAxis, EmptyTrack, AltitudeBar, DepthWedge, CompassRosette) and the three place compositions (BeachSignature, LakeSignature, MountainSignature). The trail profile lives in RouteFigures.jsx as SlopeProfile beside the T174 figures it extends, and MixBar there gained an optional per-part value and a keys switch, with its key split out as MixKeys. The card strip is its own small file, browse/CardStrip.jsx, because DestinationsTab ships in the main chunk; the first build with the strip inside Signature.jsx added 11.7 kB to the main chunk, the split brought that down to 5.9 kB, most of it the forty new English strings. The styles are one new file, styles/29-signature.css, imported last.

## Where T182 meets this

T182 owns the collapsed rows (beach orientation and walk-in time, how you get up, shore walkability) and this task did not touch any rows array. The beach orientation module T182 adds is prose in a row; the rosette here is the map's half of the same fact, and both read the wire's aspect field, so they cannot disagree. Both tasks append i18n keys and touch BeachPage, LakePage and MountainPage; the hunks here are the imports, the doc comments, and the map and signature props, so a merge should only need the import lines checked.

## Files touched

Modified (continent-app):
- src/browse/TrailPage.jsx (SlopeProfile in slot 5, highlightAt and the map ring)
- src/browse/CyclePage.jsx (the two bars on one kilometre axis, in the instrument frame)
- src/browse/BeachPage.jsx (BeachSignature, the rosette over the map)
- src/browse/LakePage.jsx (LakeSignature; the old SeasonStrip wrapper removed)
- src/browse/MountainPage.jsx (MountainSignature around the existing season strip)
- src/browse/RouteFigures.jsx (SlopeProfile; MixKeys; MixBar value and keys; TrafficBar totalM and keys)
- src/browse/DestinationsTab.jsx (one CardStrip line in the trail, cycling, lake and mountain cards, one import)
- src/styles.css (one import line)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (40 sig.* keys each, after route.surfUnpaved, CRLF and BOMs kept, all six parse)

Created (continent-app):
- src/browse/Signature.jsx, src/browse/CardStrip.jsx, src/lib/signature.js, src/styles/29-signature.css, tests/signature.test.mjs

Root: Execution/P10/T181-signature-visuals.md, Execution/_OPEN.md.

## Commands run

In C:\Users\Gebruiker\Documents\Portfolio\wt\T181-app, with a temporary vite.t181.local.mjs inside the worktree that only sets cacheDir to wt\vite-cache-t181 (deleted before the commit):

```
node node_modules/vite/bin/vite.js build --config vite.t181.local.mjs          (base, before any edit)
node node_modules/vite/bin/vite.js preview --config vite.t181.local.mjs --port 5204 --strictPort --host 127.0.0.1
CARTA_PORT=5204 node scripts/verify_{beaches,lakes,mountains,trail_page,cycling}.mjs http://127.0.0.1:5204/
node scripts/verify_keyboard.mjs --port 5204 --out ../T181-shots/keyboard-before
node ../T181-shots.mjs 5204 before
(edits)
python <scratchpad>/sig_i18n.py .
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
node --test tests/signature.test.mjs
npm run lint ; npm test ; node scripts/ci/design-lint.mjs ; node scripts/ci/banned-terms.mjs
rm -rf dist dist-data ; node node_modules/vite/bin/vite.js build --config vite.t181.local.mjs
node node_modules/vite/bin/vite.js preview ... --port 5204 --strictPort
node ../T181-shots.mjs 5204 after
CARTA_PORT=5204 node scripts/verify_{beaches,lakes,mountains,trail_page,cycling}.mjs http://127.0.0.1:5204/
node scripts/verify_keyboard.mjs --port 5204 --out ../T181-shots/keyboard-after
rm -rf dist dist-data
```

The preview servers were stopped after each run. Screenshots of every signature at 380 and 1280 px, the trail scrub on the profile and on the map, the beach map with its rosette, the first two cards of each list, the harness logs before and after and the keyboard audits are in C:\Users\Gebruiker\Documents\Portfolio\wt\T181-shots\, outside the repo; the throwaway scripts (T181-shots.mjs, T181-zoom.mjs, T181-card.mjs, T181-dbg.mjs) sit beside it in wt\.

## Config and secrets set

None.

## Before/after measurements

The browser figures are from T181-shots/before and after (report.json), on the T180 sample pages: trail 197956 in Italy, Guvano beach, Lake Como, Mont Blanc, and cycling route 2 in Luxembourg, plus the first 36 cards of each list (19 on the Cycling list). The coverage figures are counted over the wire files in continent-app/public (beaches, lakes, mountains, trails and cycling country files).

| Metric | Before | After | Delta |
|---|---|---|---|
| Detail pages with a figure in slot 5 | 4 of 5 (beach none) | 5 of 5 | +1 |
| Slot 5 figures on the instrument frame (--paper-dim panel, one hairline axis) | 0 of 5 | 5 of 5 | +5 |
| Card types with a 6 px data strip | 0 of 5 | 4 of 5 (beach none) | +4 |
| Cards with a strip, first page of each list at 380 and 1280 px | 0 | trail 36 of 36, cycling 19 of 19, lake 36 of 36, mountain 36 of 36, beach 0 of 36 | |
| Trail profile drives a point on the map | no | yes, by pointer and by keyboard | |
| Horizontal overflow on the five pages and five lists, 380 and 1280 px | 0 | 0 | 0 |
| Page errors while opening them | 0 | 0 | 0 |
| npm run lint | 0 errors, 72 warnings | 0 errors, 72 warnings | 0 |
| npm test | 176 pass | 187 pass (11 new) | +11 |
| design-lint new violations | 0 (196 in baseline) | 0 (196 in baseline) | 0 |
| Main chunk (index js) | 1,003.03 kB | 1,008.97 kB | +5.94 kB |
| Main stylesheet | 691.83 kB | 696.32 kB | +4.49 kB |
| Page chunks, kB (beach, lake, mountain, cycling, trail) | 9.68, 10.32, 10.66, 17.51, 24.93 | 9.91, 9.87, 10.59, 18.01, 25.55, plus the shared Signature chunk 19.39 (which now also holds trailExport, 13.46 before) | |

How much of each catalogue each visual can draw, which is what the empty states and the register rows are about:

| Visual | Rows with the data | Source field |
|---|---|---|
| Trail card slope strip | 17,400 of 17,404 trips that are not city days | trails list steep.p10, p15 |
| Trail page profile | every trip with a detail elevation block | trail detail elevation.profile |
| Cycling card surface strip | 705 of 706 ranked routes, 15,998 of 16,460 listed | cycling list paved |
| Cycling page bars | every route with surface_known_share 0.25 or more, as before | route detail carta.surface |
| Beach sea temperature, waves, crowds by month | 0 of 2,986 | none in the wire |
| Beach rosette | 2,002 of 2,986 | beaches aspect |
| Lake water temperature row | 1,877 of 1,881 | lakes swim.temps |
| Lake card swim strip (at least one month at 18 degrees) | 1,621 of 1,881 | lakes swim.temps |
| Lake wedge | 662 of 1,881 | lakes size.areaKm2 and size.depthM |
| Lake cross-section | 0 of 1,881 | none in the wire |
| Mountain altitude bar, page and card | 948 of 948 | mountains ele, prom |
| Mountain horizon | 0 of 948 | none in the wire |

The layer harnesses, PASS lines against a vite preview of each build:

| Harness | Before | After |
|---|---|---|
| verify_beaches | 68 of 68 | 68 of 68 |
| verify_lakes | 81 of 81 | 81 of 81 |
| verify_mountains | 83 of 83 | 83 of 83 |
| verify_trail_page | 50 of 50 | 50 of 50 |
| verify_cycling | 70 of 72 (two wire checks) | 70 of 72, the same two wire checks |
| verify_keyboard.mjs surface checks | 20 of 20 | 20 of 20 |

The lake count is the same but two of its checks changed from vacuous to real. Before, "the month strip has twelve months" and "the month strip is labelled an estimate" passed on their no-strip branch ("no climate sample for this lake"); after, they read 12 cells and the estimate note on Lake Como. The trail harness's "elevation profile renders" check reads .tpage-elev-svg, which the slope profile keeps.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The lake's bars hung from the top of their cells | The old .lpage-months li rule (a centred column flex, 23-places-pages.css) still matched, because the new list keeps that class for the harness | The cell rule is two classes deep (.sig-cells .sig-cell) and sets its own direction and alignment |
| The axis figures under every 100% bar stacked on the left | The axis spans are absolutely placed and had no position | SpanAxis places each figure at its share and slides it inside its own width by the same share, so the ends sit flush and the middle centres |
| The trail profile was striped with one-sample walls | Grades read per 60 m step pick up DEM noise | Grade read over at least 90 m, the pipeline's own span; a coarser profile (cycling, 450 m) is read as it is |
| The map ring looked the same as the start pin | Both were solid accent dots | The scrub marker is an accent ring on the card white, on the profile and on the map |
| The main chunk grew by 11.7 kB | The card strip lived in Signature.jsx, which pulled the page figures into the list's chunk | CardStrip.jsx on its own; the main chunk grows 5.9 kB |
| The rosette's N was clipped | The ring filled the 48 px box | A 15 px ring with the N above it |
| The shot script found no trail cards | The Trails list opens on its country index | The script picks Italy first, as verify_trail_page does with Albania |

## Seven questions before shipping (carta-design)

1. No hex outside :root; the new stylesheet uses tokens only (the white casing hex on the trail map line is T180's and unchanged).
2. No gradient, no new colour, no second saturated hue: the fills are --rule, --ink-mute, --ink-soft and --ink, the traffic bar keeps its existing --green.
3. Ochre, teal and --danger are untouched by this diff.
4. Mono carries only measured figures (axis figures, the scrub readout, the crest temperature, caption figures, the rosette's N); captions, keys and notes are in --ui.
5. No button added; each page keeps its one accent primary.
6. The five headings each carry a verb ("Where the climbing is", "What you ride on and who you share it with", "What each month is like here", "How warm it gets and how deep it goes", "How high it stands"); no em dashes, middots or banned words (banned-terms clean).
7. Removed: the month initial in every lake cell (one axis carries them), the lake's info button (the estimate note is visible), and the 1,000 m ticks on the altitude axis (three figures, as on every other bar).

## What is still open

The data behind three of the visuals does not exist yet and is not invented here. The beach's sea temperature and wave height by month need the Copernicus Marine OSTIA and wave products sampled at each beach (spec D3 and D6, T181-a and T181-b); crowding by month has no open source and the spec's estimate (population, parking, hotels, photo density, three bands labelled estimated) is a product decision (T181-c). The lake cross-section needs the GLOBathy depth-area curves, and 1,219 lakes have no greatest depth for the wedge either (T181-d). The mountain horizon needs the GLO-30 horizon run and a peak table (T181-e); the DEM is one of the layers no longer on the laptop, so it starts with an owner pull.

The map side is drawn only where the 2D map can show it. Slope bands in 3D, the mountain viewshed overlay and the lake and beach shore polygons (with the walkability ring) wait on the terrain work of waves 16 and 19 and on polygon wires that do not exist (T181-f, beside T180-b). The cycling line coloured by surface and dashed where unpaved needs a surface class per segment on the route geometry; the wire carries shares only (T181-g).

The trail card shows the slope mix where the spec asks for an elevation sparkline, because the list wire has no profile; a 24-point profile on the list wire would allow it, and whether the slope mix should stay is the owner's call (T181-h). The cycling card can show only paved against unpaved over the tagged length, two parts where the spec asks for three or four with an unknown share; the card wire needs surface_known_share and the gravel and path split (T181-i). The 40 sig.* strings in de, es, fr, it and nl are my translations (T181-j). The dead .lpage-month-* rules in 23-places-pages.css (the old strip's bars) can go once nothing needs the .lpage-months class (T181-k). T180-l is closed: the lake's month row carries .lpage-months li and the estimate note sits in .lpage-season .bpage-note again, so the two lake checks test a real strip instead of taking their no-strip branch.

Checked by hand: the five pages at 380 and 1280 px, the trail scrub by mouse and by keyboard with the map ring following, the beach rosette, the four card strips zoomed at 3x. Not checked: a touch drag on a real phone (the pointer handling was exercised by mouse and keyboard only) and any screen reader.

## Rollback procedure

In continent-app, git revert ad9b534 (or drop the branch before merging). In the root repo, revert the report commit, which also removes the T181 rows from Execution/_OPEN.md and reopens T180-l. No data, schema, migration, wire or stored state changed.
