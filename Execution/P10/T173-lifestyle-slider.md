# T173: E2 + M6: The lifestyle slider, and the trade-off in words

## Task ID

T173 (mind-map number T177)

## Date

2026-10-07

## What changed

The receipt on a curated trip page ("What the week costs") used to print every figure as the authored range, "€780 to €1,250" for the Andorra hiking week, and nothing the traveller did changed it. It now carries the Lifestyle control as a stepped slider under the receipt. Moving it changes the four receipt lines and the total to one figure each, the figures run to their new value in 240 ms, and one sentence under the slider says in words what that figure buys: "€780 for the week, about €111 a day, means dorm or refuge beds, cooking most of your meals, local buses rather than taxis, and the free museum days." At the other end it says "€1,250 for the week, about €179 a day, means a hotel room, dinner out most nights with room for a tasting menu, a taxi where it saves time, and every paid entry."

The owner's rule of 2026-10-07 (carta-design, "Lifestyle control") decided the shape: there is one Lifestyle control, a surface that changes how you travel embeds it and never builds a second slider, and where it is a slider it is stepped, one stop per existing level, each stop labelled with its word. So the stops are not new "budget, standard, premium" levels. They are the Lifestyle panel's own "Where you sleep" answers, cheapest first: Dorm bed, Private room, Entire place, Hotel, as many of them as the dataset measured (all four in the current data, `meta.stay_tiers_available` in `public/boot.json` lists dorm, private, hotel and the three star grades, and the entire place is always offered). Moving the slider writes `choices.stay_tier`, the same field the panel's tiles write. The test drive confirmed it: dragging to Hotel on the trip page put `st=hotel3` in the URL, the Lifestyle button on Explore then read "3-star hotel", and the panel opened with the Hotel tile pressed. Change it in either place and the other follows, with every other price in the app.

How the figures are placed. A trip's budget is authored as a low and a high for the total, for each of the four lines and per day. Stop i of n sits at share i / (n - 1) of the way from low to high, and each figure is placed at that share of its own range, rounded to whole euros because the authored inputs are whole euros. With four stops the dorm shows the authored low, the hotel the authored high, and the private room and entire place sit a third and two thirds along. The total is placed on the authored total range rather than summed from the lines, so both ends always print the authored totals exactly. The default lifestyle (entire place) therefore leads with the Andorra week at €1,093, about €156 a day. The pure logic is `src/lib/lifestyleSlider.js`; the panel's group table gained `offeredSleepGroups` and `tierForGroup` in `src/lib/sleepGroups.js`, and the panel now reads them too, so the tiles and the slider come from one list and land on the same tier (a hotel means a 3-star hotel until somebody picks a grade, and a grade already picked is kept).

The slider is a native range input, so the arrow keys, Home and End move it and the focus ring is the house ring. That closes T190-b: `verify_keyboard.mjs --only journey,lifestyle` passes at 380 and 1280 px, with the slider one of the 54 journey stops and no stop without a ring. Under `prefers-reduced-motion` the figures change in one step. The words under the stops sit in equal columns with the track inset so each stop is over the middle of its word, which lets the longer labels in other languages wrap inside their column at 380 px instead of colliding (checked in Spanish, "Cama en dormitorio" and "Habitación privada", and in German). The trip page shows the slider only when the App hands it a setter and the dataset offers more than one way to sleep; without either it falls back to the old range, so no other caller of `JourneyPage` changes behaviour.

E6 asks two things. The first, saying what the cheapest figure assumes (self-catering, hostel beds, municipal transport, free museum days), is the dorm sentence. The second, long-stay accommodation discounts, has nothing to apply to yet: every one of the 253 trips is 7 days (`durationDays` is 7 on 253 of 253 in `public/journeys/journey/`), so it is left open for the long version of a trip (spec I2).

"Done when" asks for the real priced total from T095. T095 is the owner's hand-pricing of 40 to 50 destinations (`Execution/_ORDER.md`, "you, not Claude") and has not happened, so there is no measured trip total to move. The slider moves the authored total that the trip page already shows. When a measured total exists, only `tripFigures` needs new endpoints; that is register row T173-a.

## Files touched

**Modified (continent-app):**
- src/App.jsx (a `setStayTier` callback, passed to the Destinations tab)
- src/browse/DestinationsTab.jsx (the offered stay tiers and the setter, handed to the journey page)
- src/browse/JourneyPage.jsx (receipt lines and total follow the slider; the slider under the receipt note)
- src/browse/LifestylePanel.jsx (reads `offeredSleepGroups` and `tierForGroup` instead of its inline copy)
- src/lib/sleepGroups.js (`offeredSleepGroups`, `tierForGroup`)
- src/styles.css (one `@import` line at the end)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (five keys each: `journey.lsSayDorm`, `journey.lsSayPrivate`, `journey.lsSayHome`, `journey.lsSayHotel`, `journey.lsNote`)

**Created (continent-app):**
- src/browse/LifestyleSlider.jsx (the slider and `MovingEur`, the receipt figure that runs to its new value)
- src/lib/lifestyleSlider.js (stop index, share, placement, sentence key)
- src/styles/35-lifestyle-slider.css
- tests/lifestyleSlider.test.mjs (10 tests)

**Created (root):**
- Execution/P10/T173-lifestyle-slider.md

**Modified (root):**
- Execution/_OPEN.md (T190-b closed, T173-a to T173-g appended)

## Commands run

All in `C:\Users\Gebruiker\Documents\Portfolio\wt\T173-app` unless noted. The dev server ran from a config outside the repo, `wt\T173-shots\vite.config.mjs`, which imports the app config and sets a private `cacheDir` (`wt\T173-vitecache`) and port 5205, so it did not invalidate the other worktrees' dependency cache.

```
node node_modules/vite/bin/vite.js --config ../T173-shots/vite.config.mjs
node <scratch>/shoot.mjs before                 # receipt at 380 and 1280 before the change
node <scratch>/shoot.mjs after --drive          # Home, ArrowRight, End, back to the default stop
SHOOT_LANG=es node <scratch>/shoot.mjs es        # long labels at 380
SHOOT_LANG=de node <scratch>/shoot.mjs de
node <scratch>/panel.mjs                        # slider to Hotel, then Explore button and panel
node --test tests/lifestyleSlider.test.mjs
npm run lint
npm test
node scripts/ci/design-lint.mjs
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npm run build
node node_modules/vite/bin/vite.js preview --config ../T173-shots/vite.config.mjs --port 5205 --strictPort --host 127.0.0.1
node scripts/verify_keyboard.mjs --port 5205 --only journey,lifestyle --out ../T173-shots/keyboard
rm -rf dist dist-data
```

The scratch scripts lived in the session scratchpad and are not committed. Screenshots are in `C:\Users\Gebruiker\Documents\Portfolio\wt\T173-shots\` (`before-380.png`, `before-1280.png`, `after-380*.png`, `after-1280*.png`, `es-380.png`, `de-380.png`, `panel-380.png`, `panel-1280.png`, and the keyboard audit JSON).

## Config and secrets set

None. No migration, no data write, no environment variable.

## Before/after measurements

Figures for the Andorra week come from `public/journeys/journey/ad-hiking-coma-pedrosa-madriu.json`; the stop count from `meta.stay_tiers_available` in `public/boot.json`; the test counts from `npm test`.

| Metric | Before | After | Delta |
|---|---|---|---|
| Receipt figures that follow the Lifestyle setting, per trip | 0 | 5 (four lines and the total) | +5 |
| Positions a traveller can put a trip's price in | 1 (the range) | 4 stops | +3 |
| Trips with a sentence saying what the figure buys | 0 of 253 | 253 of 253 | +253 |
| Andorra total at the default lifestyle | €780 to €1,250 | €1,093 (about €156 a day) | one figure |
| Andorra total at the dorm and hotel stops | not shown | €780 and €1,250 | the authored ends |
| Unit tests passing | 212 | 222 | +10 |
| Keyboard audit, journey and Lifestyle at 380 and 1280 | slider absent | 4 of 4 pass, slider ringed | T190-b closed |
| Design-lint violations beyond baseline | 0 | 0 | 0 |
| Horizontal scroll at 380 and 1280, page errors | none | none | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first dev server timed out on 127.0.0.1 | 127.0.0.1 did not answer while localhost did; not investigated further | Pointed the shots at localhost, and ran preview with `--host 127.0.0.1` for the keyboard audit |
| The focus ring drew over the stop words | The words had a negative top margin to sit close to the track | Words moved below the ring; the input is 32 px on a fine pointer (the owner's compact-control exception) and `--tap` on a coarse one |
| Spanish and German stop words would collide at 380 px | Absolutely placed, unwrapped labels about 100 px apart | Equal grid columns that wrap, with the track inset so each stop sits over its column's middle |
| The Edit tool rewrote four LF lines of `styles.css` as CRLF | The file has mixed line endings | Rebuilt the file from HEAD with only the one new line added |
| The dependency cache was shared with other worktrees' servers | `node_modules` is a shared junction, so Vite's default cache is too | Private `cacheDir` through a config outside the repo |

Not caused by this task, seen in the dev console on the journey page: React warns that a `<p>` sits inside a `<p>` (the lede renders `Prose`, itself a paragraph, inside `p.bpage-lede`). Left alone, raised as T173-g.

## What is still open

The slider moves the authored range, not a measured price, because T095 has not been done. When the hand-priced holdout or the trip pricing of spec I1 produces a real total for a trip, `tripFigures` should place the stops on that instead (T173-a).

The stops are evenly spaced. The entire place sits two thirds along every trip's range, which is a reading of the panel's order, not a measurement. The nearest destination's measured nightly prices per tier (the trip page already loads them for the price row) could space the stops by what beds actually cost there (T173-b).

The receipt follows where you sleep but not how you eat. The food line moves with the bed, and the sentence describes the trip writers' assumption at that end of the range. A traveller on the Foodie preset in a dorm still reads "cooking most of your meals". Pricing food from the destination's cost basket with `groundSpendPerPerson` and the current eating preset would fix it; that is a larger change to the receipt and overlaps T172's bar (T173-c).

Long-stay discounts (spec E6) have nothing to apply to while every trip is 7 days; they belong with the long version of a trip (spec I2, T173-d).

The Facts fold ("Budget", "Per day") and the suitability strip under the hero still print the authored range while the receipt prints the slider's figure. That is consistent (range and your point in it) but the owner's rule says the figures the control drives update in place, and whether those two count as driven is a product call (T173-e, owner).

On 42 of 253 trips the four line lows do not add up to the total low, and on 57 the highs miss the total high. Between the ends the four printed lines therefore do not always add up to the printed total, which a receipt should. The fix is in the journey data, not the slider (T173-f).

The nested paragraph warning on the journey page (T173-g).

Merge note for T172: that session adds a stacked bar above the same receipt. This task changed only the figure inside each line's `jpage-budget-eur` span and the total's, and added the slider after the receipt note, so a conflict, if any, is in those few lines of `JourneyPage.jsx`. The bar should read the slider's figures (`figs.rows`) when they exist, so bar and lines agree.

## Rollback procedure

Revert the two commits on branch `p10-e2-lifestyle-slider` (app commit `bab6aa8`, and the root commit that carries this report), or after merge:

```
git -C continent-app revert bab6aa8
git revert <root commit of T173>
```

Nothing else to undo: no data, no migration, no stored setting format changed (`choices.stay_tier` already existed and already took these values).

## The seven carta-design questions

1. Hex values outside `:root`: none. The new CSS uses tokens only.
2. Gradients, colours outside DESIGN.md, a second saturated hue: none. The slider's fill and the focus ring are `--accent`, as on the Destinations trip-length slider; the words are `--ink-mute`, the current one `--ink`.
3. Ochre, teal and `--danger` are not used.
4. Mono is only on the receipt figures, which are measured facts in a column. The sentence and the stop words are `--ui`, and the figures inside the sentence are `--ui` because they sit in prose.
5. No button is added; the trip page keeps its one primary action.
6. The fold heading "What the week costs" already carries a verb. The diff has no em dashes, no middots and none of the banned words (design-lint found 0 new).
7. The block is a label, the track, the stop words, one sentence and one note. A link to open the full Lifestyle panel from the trip page was left out (the panel would open over a page that is itself a modal dialog). The candidate for removal was the note line; it stays, because moving this slider changes every price in Carta and the traveller should be told so where they move it.
