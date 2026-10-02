# T287 shared MonthStrip on the lake and mountain pages

## Task ID

T287 (closes T087-b for lakes and mountains; beach split out as T287-a).

## Date

2026-10-02

## What changed

The shared `MonthStrip` from T087 now sits on the lake page and the mountain page. On the lake page it replaces the old bar strip. A month is good when the modelled water temperature in `lake.swim.temps` reaches the warm threshold (the `warmC` prop, default 18). The old subtitle and the season sentence open from the info button. On the mountain page a "When to go" section shows the climatology: good months are `season.months`, avoid months are months with `season.snow` of 75 or more that are not good. The best-months sentence and the estimate note open from the info button. A row with no `season.months` keeps the old Season line in the facts list.

The beach page is unchanged. Its wire carries only `water.class` and `water.site` (checked across all 41 files in `public/beaches`); there are no month, season or temperature fields. Raised as T287-a.

## Files touched

Modified (app repo, branch p7-layer-month-strip):
- src/browse/LakePage.jsx
- src/browse/MountainPage.jsx

Created (root repo): Execution/P7/T287-layer-month-strip.md. Modified: Execution/_OPEN.md.

## Commands run

```
npx eslint src/browse/LakePage.jsx src/browse/MountainPage.jsx   (clean)
npx vite --port 5208   (headless playwright, 380 and 1280 wide, Hoher Dachstein and Attersee)
```

No i18n file was edited, so the six-file parse was not needed. No dist built.

## Config and secrets set

None.

## Before/after measurements

Not measured beyond the wire counts: 948 of 948 mountain rows carry `season`; 1881 of 1881 lake rows carry `swim`; 0 of 2986 beach rows carry any month data (script over public/*.json).

## Visual checks

Hoher Dachstein: twelve cells, Jul and Aug good, Jan to May and Sep to Dec struck, June plain. Attersee: Jul, Aug, Sep good. Info panel hidden until pressed. No horizontal scroll at 380 or 1280.

## Design decisions

carta-design has no rule for the strip, so T087's choices stand. The 75 percent snow threshold for avoid months is my call; it is only a display rule over data already on the wire. Lakes have no avoid months.

## What broke and how it was fixed

Nothing broke. The first headless run timed out while Vite optimised dependencies cold; a longer timeout fixed it.

## What is still open

T287-a (beach has no month data), T287-b (lake strip threshold and info line can differ by a month), T287-c (dead `.lpage-months` CSS). All in Execution/_OPEN.md.

## Rollback procedure

Revert the app commit on p7-layer-month-strip. No data, migration or config changed.
