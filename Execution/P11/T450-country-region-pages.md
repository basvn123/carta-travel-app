# T450: The country and region pages on the kit

## Task ID

T450

## Date

2026-10-15

## What changed

Roadmap 1.2 lists the country and region pages with the Destinations surface. The owner's brief of 2026-10-14 asked for one design language across the tab: the photographs people know a country for, a line of what it is known for, stats in the same professional system, no filler text, and easy movement between tabs.

### The country page (`browse/CountryPage.jsx`)

Before, the page opened on:
- a back arrow, a flag and the name;
- one run-on line of facts ("Carta holds 48 destinations in Belgium, a typical day runs €103, best Jun-Sep, a car helps outside the cities");
- four strips of raw mini cards with a kind glyph and a seal.

There was no photograph of the country.

Now, top to bottom:
- **The country's photographs.** The three from T449, swipeable, with arrows on a fine pointer.
- **The name and its line.** "Belfry towns, Ardennes forests and a long sandy coast".
- **Three key facts, label over value.**

  | Fact | Belgium |
  |---|---|
  | Typical day | ~€103 est. a day (the Lifestyle figure, with the estimate mark) |
  | Best months | Jun-Sep |
  | Getting around | A car helps outside the cities |

- **Two doors.**
  - "Show every place in Belgium" sets Explore's country filter and closes the page.
  - "Walks, beaches and rides" opens Destinations for that country, through App's existing `openCountryInPlaces`, now passed to Explore.
- **Four rails.** The best of the country, cities, towns and villages, landscapes. They use Explore's own `PlaceTile`, so the tiles carry the day price, the Score and the save control exactly as they do on Explore.
- **The photograph credits.** In one closed "Where this comes from" row.

"Carta holds N destinations" is gone.

### The region page (`browse/RegionPage.jsx`)

Opened from shared `#region=` links:
- Back is a kit IconButton and "Copy link" a quiet kit Button.
- A hero photograph from the region's best-rated member, filtered through the T428 photo veto.
- The cards are kit row Cards: a 72 px photograph, the name, where, and the Score. The listed tier is a dashed card with "Not scored yet" in the meta.
- The neighbours are secondary kit Buttons.
- The kind line names the country ("Coast, Spain", not "Coast, ES").
- "We list it so this area isn't empty" is cut.

### Styles

The `.cpage` and `.rgnp` rules in `25-feature-pages.css` are rewritten on the roles and scales, in the same place: no `--paper`, `--ink`, display face or literal sizes. The old `.cpage-facts` rule in `62-v6-explore.css` is deleted.

## Files touched

**Modified (app, mirrored in root):**
- `src/browse/CountryPage.jsx` (rewritten)
- `src/browse/RegionPage.jsx`
- `src/browse/ExploreTab.jsx`: the country page's new props, plus `onOpenCountryInPlaces`.
- `src/App.jsx`: one prop to ExploreTab.
- `src/styles/25-feature-pages.css`: the two pages' rules.
- `src/styles/62-v6-explore.css`: one rule deleted.
- `src/styles/63-v6-destinations.css`: the gallery arrows show on the country hero too.
- `src/i18n/{en,de,nl,fr,es,it}.js`: 5 new keys each, 3 changed (the car-share values stand alone now, so each starts with a capital).
- `scripts/ci/design-lint.baseline.json`.

**Created (root):** this report, `Execution/P11/T450-shots/`.

## Commands run

```
npx vite build && npx vite preview --port 5298 --strictPort
CARTA_PORT=5298 node scripts/verify_explore.mjs
CARTA_PORT=5298 node scripts/verify_regions.mjs
CARTA_PORT=5298 node scripts/verify_destinations.mjs
node scripts/verify_quality_floor.mjs t450 --port=5298 --only=pages,explore --out=<scratch>
node scripts/ci/design-lint.mjs --update-baseline && node scripts/ci/design-lint.mjs
node scripts/ci/banned-terms.mjs
npm test
node <scratch>/shots_t450.mjs 5298 ../Execution/P11/T450-shots after
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Country page: photographs of the country | 0 | 3 |
| Country page: catalogue counts on screen | 1 ("Carta holds N destinations") | 0 |
| Country page: doors to other tabs | 0 | 2 (Explore filtered, Destinations) |
| Raw buttons, CountryPage.jsx (meter) | 2 | 0 |
| Raw buttons, RegionPage.jsx (meter) | 8 | 1 (the not-found list's rows) |
| design-lint violations, whole app | 9,282 | 9,231 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The country hero was narrower than the page | `max-height` with an `aspect-ratio` shrinks the width | A clamped height on desktop, 4:3 on a phone |
| The gallery arrows never showed on the country hero | They showed on `.dgal-card` hover only | The hero added to the same rule |
| The quality floor found a skipped heading on the region page (H3 after H1) | The section labels were `<p>`, so the kit Card titles (h3) followed the page's h1 | The labels are `h2` |

## Checks

| Check | Result |
|---|---|
| `verify_explore` | 103 of 103; the country page is opened from Explore |
| `verify_destinations` | 62 of 62 |
| `verify_quality_floor`, pages and explore flows | 32 screens. 0 skipped headings after the fix, 0 fake controls. The only phone failure is the journey page's cost-bar segments (trips surface, T431, unchanged here). |
| `verify_regions` | Never reached this build: it hard-codes port 4213 and starts its own server, so its data checks read nothing (row T450-c). The region page itself was opened by hand on the T450 build: 18 cards and the hero, on a phone and a desktop. |
| design-lint | 0 new |
| banned terms | none |
| `npm test` | 375 of 375 |

## What is still open

- **T450-a.** A region card with no photograph, or a vetoed one, shows the plain sunken box. carta-design asks for the flag-and-name placeholder there; the region wire carries no country per card to draw it from.
- **T450-c.** `scripts/verify_regions.mjs` hard-codes port 4213 and spawns its own server, like `verify_handoffs` (row T429-e). Give it `CARTA_PORT` so it can test a given build.
- **T450-b.** The country page is still reached only from Explore (one country filtered, then "About {country}"). The Destinations country band opens Explore's filter, not this page, and the region door (T428-g) is still not on the tab.

## Rollback procedure

Revert the T450 commits in both repos. The pages, their props, the strings and the rules return as they were. No data or deploy was touched.
