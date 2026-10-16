# T457: Destinations lined up with Explore

## Task ID

T457

## Date

2026-10-16

## What changed

The owner looked at Explore and Destinations side by side on 2026-10-16 and asked for four things:

1. Destinations' sections should sit as close to the filter pane as Explore's "Explore Europe", "Top rated in Europe" and "Hiking bases" do.
2. The two left filter panes must be aligned; the example was that Destinations' "All countries" had no flags where Explore's country filter has one a country.
3. Trips, Trails, Beaches, Lakes, Mountains and Cycling needed a more professional switch than the small tab row, "like Explore's tabs".
4. "Browse the full list" should show three columns like Explore's "All places" and get a smarter placement than the bottom of the page.

Then merge, commit, push and deploy.

**The column.** Destinations used a centred 1180 px column, so at 1920 px its content started 255 px past the panel. It now uses Explore's full-width column, 32 px past the panel's hairline and 24 px under the settings line. The section head is Explore's 28 px head, and the first rail starts on Explore's line. The tab row that stood above everything on desktop is gone.

**The panels.** Both panels share one padding rule and Explore's rail grammar: sections under 12 px headings, kit tiles first, filter chips, then the country last in a fold. The fold is a new shared component, `RailFold.jsx`. It has a search field and one row a country with its flag; Ukraine and Türkiye flags were added.
- Explore's fold picks several countries (checkboxes).
- Destinations' fold picks one (radios, "All countries" first), because its country is one code that the URL, the country band and every layer read.
- Rows are 44 px on both tabs, and a chosen row takes the selected tint.

The side panel's Lifestyle button is gone; the settings line is the one door (row T381-b). The phone's country list, `CountryPicker`, also gained a flag a row, 44 px rows and a drawn chevron. Its button is now named by what it shows.

**The sections.** The six are kit tiles, an icon over the word, as Explore offers its trip types. On a desktop they head the side panel two across. On a phone they are the 2 x 3 grid that carta-design names for six categories, so all six show at once (Mountains and Cycling used to scroll off screen). The kit `Tile` gained a `tab` kind, so the tiles keep the tablist semantics, keys and test hooks of the old tabs. Up and Down move a whole row.

**The full list.** It keeps Explore's grid rule (400 px rows, auto-fill), so it shows the same columns as Explore at every width: three from about 1607 px wide, two below. The owner's screen shows Explore at three, and Destinations now matches it there.

It is also placed more smartly:
- **One choice from the top.** Each section's head carries "Highlights | Full list", where Explore keeps List | Map. Full list keeps the head and the saved cuts as door buttons, then shows the list directly.
- **Higher on Highlights.** The countries track counts as one of the four rails (three on a phone), rail tiles take Explore's widths and three lines, and "Try one" sits after the rails as Explore's doors do. Together these move the list up by about 860 px at 1440.
- **Trails with a country.** The switch sits in the country band.
- **Filtered sections.** The head stays, as Explore's does.

On a phone the section title is read but not drawn, as Explore's is: the selected tile names it. The crosshair in the search field is the near-me door there.

## Files touched

**Modified (app repo `continent-app`, mirrored in the root repo):**
- `src/components/ui/Tile.jsx`: `kind="tab"` and `TileGroup kind="tabs"` (tablist, arrows, Home, End; Up and Down step a row).
- `src/components/CountryFlag.jsx`: TR and UA.
- `src/components/CountryPicker.jsx`: flags, 44 px rows, chevron, the button named by its value, the search named by its job, the listbox around the options only.
- `src/browse/DestinationsTab.jsx`:
  - the section tiles in the panel (desktop) or the column (phone), and the panel on Explore's sections;
  - the country fold, and the Lifestyle door removed;
  - the countries track counted as a rail, the view switch, the doors of the Full list view;
  - the head kept while filtered, the switch in the country band;
  - the desktop crosshair hidden beside the head's near-me door;
  - the flag on rail tiles, and the All filters count without the country.
- `src/browse/SectionOpening.jsx`:
  - the head carries the view switch and a small near-me button, and is a div (it was a banner landmark);
  - "Try one" moved after the rails as Explore's door buttons;
  - rail tiles on Explore's three lines.
- `src/browse/ExploreFilterRail.jsx`: the shared fold and country list.
- `src/browse/ExploreTab.jsx`: an sr-only h2 for the panel.
- `src/browse/JourneysSection.jsx`: tile size hint for the wider column.
- Stylesheets:
  - `src/styles/23-places-pages.css`: comment only.
  - `30-section-opening.css`: the 28 px head, the head tools, the phone head, Explore's tile widths, the tile lines, the doors.
  - `62-v6-explore.css`: one panel padding rule, the panel and phone tiles, country rows, flag column, the selected row, "See all" as Explore's ink link.
  - `63-v6-destinations.css`: the full-width column, the section grid, the panel sections, the country band, the phone picker rows, the By country 4:3 photo, the header field padding.
  - `70-item-pages.css`: the trips grid's margin and four tiles from 1600 px.
- `src/i18n/en.js`, `de.js`, `fr.js`, `es.js`, `it.js`, `nl.js`: `dtab.viewLabel`, `dtab.viewTop`, `dtab.viewAll`.
- Harness scripts:
  - `scripts/verify_destinations.mjs`: the panel heads with six section tiles, the country is the fold, and the panel and column stand on Explore's lines.
  - `scripts/verify_places_tab.mjs`, `scripts/verify_trips.mjs`, `scripts/verify_trails.mjs`, `scripts/verify_trail_page.mjs`: picking a country through the fold.
  - `scripts/verify_places_tab.mjs` also: the settings line is the Lifestyle door.

**Created:**
- `continent-app/src/browse/RailFold.jsx`
- `Execution/P11/T457-destinations-align.md` (this report)
- `Execution/P11/T457-shots/`: before (live) and after screenshots, desktop and phone.

**Modified (root repo only):**
- `Execution/_OPEN.md`: rows T457-a to T457-h; T381-b closed.
- `.claude/skills/carta-design/SKILL.md`: the T457 note, and "further cuts are one row of door buttons".

## Commands run

```
git checkout -b p11-destinations-align                       (root and continent-app)
cd continent-app
npx eslint src                                               (1 error, the old ExploreMap.jsx one)
node scripts/ci/design-lint.mjs                              (9205 found, 9205 in the baseline, 0 new)
npm test                                                     (392 pass)
npx vite build && npx vite preview --port 5298 --strictPort --host 127.0.0.1
CARTA_PORT=5298 node scripts/verify_{destinations,places_tab,trips,journeys,trails,trail_page,beaches,lakes,mountains,cycling,explore}.mjs
node scripts/verify_quality_floor.mjs --port=5298
node scripts/verify_keyboard.mjs --port 5298 --out <dir>
npm run build:pages
npx wrangler pages deploy dist --project-name carta-app --branch preview
npx wrangler pages deploy dist --project-name carta-app --branch main
```

The two verification rounds ran as Claude Code workflows (parallel harness runs and adversarial reviewers), with screenshots in the session scratchpad.

## Config and secrets set

None. No data file, R2 object or setting changed.

## Before/after measurements

Measured with Playwright: before on the live site (build index-WR0HcjnI.js), after on the T457 build, both at 1440 x 900 unless stated.

| Metric | Before | After | Explore |
|---|---|---|---|
| Content column, distance past the panel (1440 / 1920) | 24 / 255 px | 32 / 32 px | 32 / 32 px |
| Section head, top and size | y 200, 40 px | y 144, 28 px | y 145, 28 px |
| First rail title | y 280 to 344 | y 203 to 205 | y 207 |
| Full list heading, beaches / lakes / mountains / cycling | 2642 / 2619 / 2595 / 2592 | 1785 / 1766 / 1766 / 1820 | 1736 ("All places") |
| Full list from the top of a section | scroll only | one choice ("Full list"), list at y 259 | |
| Full list columns at 1280 / 1440 / 1920 | 2 / 2 / 2 | 2 / 2 / 3 | 2 / 2 / 3 |
| Panel padding (top, right, bottom, left) | Explore 18/16/28/32, Destinations 18/18/28/28 | both 16/16/32/32 | |
| First panel heading | Explore x32 y137, Destinations x28 y137 | both x32 y135 | |
| Section switch | tabs 55 to 90 x 44 px, 14 px, row 532 px wide in a 358 px phone column | tiles 104 x 58 (panel), 104 to 114 x 60 (phone), all six visible | trip types 104 x 58 |
| Country control (desktop) | button, no flags | fold, search, 44 px rows, a flag each | the same fold |
| Country rows (phone) | 31 px, no flags | 44 px, a flag each | |
| Phone 390, beaches: first rail title / full list heading | 433 / about 2099 | 371 / 1648 | |
| Phone 360, Full list view: the list | (none) | y 524 | |

Harnesses on the final build:

| Harness | Result | Note |
|---|---|---|
| verify_destinations | 92/92 | |
| verify_places_tab | 45/45 | the earlier 'every card carries a picture' failure was a Wikimedia 429, also on live |
| verify_trips | 42/42 | |
| verify_journeys | 46/46 | |
| verify_trails | 34/34 | |
| verify_trail_page | 51/51 | |
| verify_beaches | 66/66 | |
| verify_mountains | 84/84 | |
| verify_explore | 103/103 | |
| verify_lakes | 80/82 | GB and IE lake floors, data, row T456-e |
| verify_cycling | 76/78 | two wire data checks, as before |
| verify_quality_floor | 10/11 | four day-planner views with two filled primaries, as before; heading skips 0 |
| verify_keyboard | 8/22 | identical to live: card-open buttons without a ring (T430-i) and surfaces waiting for removed selectors (T457-f) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Choosing "All countries" closed the new country fold and dropped keyboard focus to the page | The fold's `open` was a controlled attribute, re-applied from the selection | The code never closes the fold; a country that arrives from a link or the track opens it once and scrolls the row into view, in the list and in the panel |
| The panel's new h3 headings skipped a level after the page's h1 | The panel used p labels before T457 | An sr-only h2 heads each panel (Destinations and Explore) |
| verify_trips' desktop country gate failed | It looked for the removed panel button | The gate accepts the fold |
| Trails at rest drew five strips | The "Choose a country" index was not counted as a rail | It counts, so trails show three rails and the index |
| Trails with a country had no view switch | The switch lived only in the section head, which a picked country replaces with its band | The band carries the switch |
| The phone country list pushed names to the right edge | The shared option style justified its children apart | Start-justified, a flag column of fixed width |
| A stray 32 px gap on phone trails at rest | An empty tools box stayed in the opening's flex column | Hidden with the head |
| The chosen country's tint was cut on the left and the list scrolled 8 px sideways | The row bled outside its own scroller | The list bleeds instead, inside its scroller |
| String replacements with `$\`` inserted the file's text | `String.replace` patterns in a patch script | Function replacements |

## What is still open

**New strings to read (T457-a, owner).** `dtab.viewLabel`, `dtab.viewTop` and `dtab.viewAll` were written in German, French, Spanish, Italian and Dutch by Claude and need a native read.

**All filters (T457-b, owner decision).** Destinations keeps a short facet set and "All filters" in its panel, and its sort there. Explore shows every filter inline and its sort in the head bar.
- Why it stayed: Destinations' layers carry far more facets (beaches alone over forty options in eight groups), and six harnesses drive the sheet from that button.
- The alternative: every group in the panel, the long ones in folds, as Explore does.

**The view in the URL (T457-c).** Highlights or Full list is not in the URL, so Back and a shared link reopen Highlights. It belongs beside `dc` and `dn` (row T428-d).

**Sideways pan on a phone (T457-d).** This predates T457. Long row titles do not take their ellipsis, so the Destinations column pans sideways on a 360 to 390 px phone:
- Cycling: 249 px;
- Trails with a country: 424 px;
- German Trips: 5 px.

verify_quality_floor misses it because it measures the document, not `.places-tab`.

**Section grid on a phone (T457-e, owner call).** The 2 x 3 grid scrolls away with the page, where the old 45 px tab row was sticky. Switching section from deep in a list means scrolling back up.

**Stale keyboard surfaces (T457-f).** verify_keyboard's explore-grid, explore-map, lifestyle and destination surfaces wait for selectors Explore no longer has (`.xcard`, `.xview-toggle`, `.xcard-hit`) and time out on live as well.

**Rail tile heights (T457-g, owner decision).** Rail tiles keep full, wrapped titles (the owner's T430 "full names"), so tiles in one rail differ in height. Explore's tiles cut a long name to one line. Beach, lake and mountain tiles also carry the gallery's dot row under the photo, which Explore's do not.

**Cycling's Full list (T457-h).** This also predates T457 but now sits right under the head:
- a 54 px gap before "EuroVelo routes";
- the EuroVelo chip strip is cut at the right edge with no arrow.

## Rollback procedure

1. Revert the two merge commits, in the root repo and in continent-app: `git revert -m 1 <merge commit>`. Push the root.
2. Promote the previous production deployment (Pages d2b283ae, T430/T431) in the Cloudflare Pages dashboard, or rebuild the reverted tree with `npm run build:pages` and deploy it with `npx wrangler pages deploy dist --project-name carta-app --branch main`.

No data, R2 object or migration is involved, so nothing else needs undoing. Register row T381-b would reopen.
