# T960 to T966: the phone search dock, Carta's own trips, outdoor tabs on the dock

Batch on root branch `p15-search-dock`, one commit per task, merged into `main`. The owner asked (2026-10-30 and 2026-10-31) for an Airbnb and Polarsteps style phone top: a header on the page colour, one search pill with a sheet, an Ask door beside it, filters only after a search; then for the predefined trips to read as Carta's own and not as one more rail. Owner words: "be really unique", "don't necessarily have to follow the md rules" (design freedom, T878).

End check: one browser round on the merged batch, fast NOPUBLIC build (`wt/vite.t960.mjs`) served with `public/`, Playwright with service workers blocked, 390 and 1440 px. Lint 0 errors on every touched file (the old `TitleTag` warning in ExploreTab stays); `npm test` 1204 of 1204 pass; `impeccable detect` on the new block: no findings.

Rollback for the whole batch: `git revert e2f2589554 79ef2317d1 ed895885bf 3f711fc6ca 5218da0245 5bcc2f4d5a` (newest first), then rebuild and redeploy. Each task reverts alone with its own commit.

---

## Task ID

T960

## Date

2026-10-31

## What changed

The header's Together door has a Carta mark: two compass rings that meet, the logo's rust needle where they cross (Icons.jsx `TogetherIcon`). The logo keeps its original colours (an earlier pass in this session had recoloured it; reverted on owner request). The door opens the T928 Together page; no old friends view is left (FriendsSpoke.jsx went in T928, old `?view=friends` links redirect).

## Files touched

**Modified:** `continent-app/src/components/Icons.jsx`, `continent-app/src/components/AppHeader.jsx`

## Commands run

Fast build: `PF_OUT=<dir> node "Travel App/continent-app/node_modules/vite/bin/vite.js" build --config wt/vite.t960.mjs` from `Portfolio/`.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Owner saw "the old page" behind the friends icon | The code and production both open the T928 page (checked signed in with the friends seam at 390 and 1440); the owner's device was most likely serving a cached build | Nothing in code; a hard refresh or reopening the installed app. Register T960-a |

## What is still open

The owner should confirm the Together page after a hard refresh (T960-a).

---

## Task ID

T961

## Date

2026-10-31

## What changed

On a phone, Explore searches from one dock: a Where-to pill naming the activity (its own colour tile) and the From, When and People line, and a round Ask door with its word (Ask, Vraag, Fragen, Demander, Preguntar, Chiedi) that opens Ask Carta. The pill opens a sheet with What (places, trails, beaches, lakes, mountains, cycling), Where with recent searches, When, From, Who, Transport and Stay. The phone header sits on the page colour, without the white band or its line. The quick tabs' colours (T963) share the dock's stylesheet. Desktop is unchanged.

## Files touched

**Created:** `continent-app/src/components/SearchDock.jsx`, `continent-app/src/browse/searchDockStore.js`, `continent-app/src/styles/96-search-dock.css`
**Modified:** `continent-app/src/App.jsx`, `continent-app/src/components/SettingsLine.jsx`, `continent-app/src/i18n/{en,nl,de,fr,es,it}.js`

## Commands run

As T960.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Phone header stayed white with a line | `60-v6-shell.css` sets the header's surface and border with a stronger selector | `.top-bar .app-header` in 96-search-dock.css |
| Dev server hung in "scanning dependencies" twice | A busy machine (another node process) | Checked on the fast build with a static server instead |
| An early fast build without `PF_OUT` overwrote `continent-app/dist` | The config's outDir comes from `PF_OUT` | Always set `PF_OUT`; dist is rebuilt by `build:pages` before a deploy |

## What is still open

The DOM harnesses `scripts/verify_explore`, `verify_top_bar`, `verify_phone_chrome` and `verify_lifestyle` look for the phone's old top line and were not updated (T961-b). The dock is phone only; whether a desktop gets it is the owner's call (T961-c).

---

## Task ID

T962

## Date

2026-10-31

## What changed

On a phone, Places' overview loses its hero form, quick chips and settings line (the dock carries them). Once a search or a filter leaves the overview the dock shows Back and one Filters button with the count, and the results are named ("Places in Lisbon").

## Files touched

**Modified:** `continent-app/src/browse/ExploreTab.jsx`, `continent-app/src/browse/DestinationsTab.jsx`

## Commands run

As T960.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

No issues.

## What is still open

None.

---

## Task ID

T964

## Date

2026-10-31

## What changed

The "Trip styles" rail at the top of Places is replaced by Carta's own trips: a deep umber block, unlike the white-card rails under it, with a deck of trip-style photographs dealt out of its top edge (the Plan page's old fan from T747, which the owner pointed at), a route line drawn across it, the title, the library's own counts ("258 weeks in 39 countries, each one planned by Carta", from `coverageFacts`), and one See the trips button. The subline "A week around what you love doing." and See all are gone. Motion: the deck deals in when first seen and the route draws itself; then every 3.6 s the front photo goes to the back and the next style comes forward, its name under the deck. The shuffle pauses on hover, on focus, off screen and on a hidden page, and never runs with reduced motion. On a desktop the words sit left and the deck right. The whole block is one link to the trip library.

## Files touched

**Created:** `continent-app/src/browse/CartaOwnTrips.jsx`, `continent-app/src/styles/97-carta-own-trips.css`
**Modified:** `continent-app/src/browse/ExploreTab.jsx`, `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`xown.title`, `xown.facts`; the button reuses `pf.promo.link`)

## Commands run

As T960.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Desktop deck too large, cards cut by the viewport | `--pw` sized for a phone | `--pw: 19%` from 769 px |
| Route dot drawn as an ellipse | The route SVG stretches (`preserveAspectRatio="none"`) | Dot removed, the line alone |

## What is still open

`TripStylesRow` in `TripStylesRow.jsx` has no caller now (`WeeksRow` in the same file is still used); delete it or reuse it (T964-a). The departures from carta-design (the umber folder with two radial washes, the deck's motion) are not yet written into DESIGN.md or the skill (T964-b).

---

## Task ID

T965

## Date

2026-10-31

## What changed

On a walk's story card the difficulty pill ("Very hard") and the score pill shared the photo's top edge, and on a phone the score squeezed the difficulty to "V". With a score on the photo the difficulty now sits at the bottom left.

## Files touched

**Modified:** `continent-app/src/styles/80-story-rail.css`

## Commands run

As T960.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

No issues.

## What is still open

None.

---

## Task ID

T966

## Date

2026-10-31

## What changed

On a phone, Trails, Beaches, Lakes, Mountains and Cycling search from the dock too: their own What and Where bar is gone (it stays on a desktop), and the Map or List pill ends the quick row. A Where, a country, a near town or a filter turns the dock into Back plus Filters ("Trails in Andorra", count 1); Back clears everything back to the tab's opening. Closes T961-a.

## Files touched

**Modified:** `continent-app/src/browse/DestinationsTab.jsx`

## Commands run

As T960.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A typed country gave the dock the bare word "Trails" | The country is picked and the text cleared (T600) | The label names the country |

## What is still open

None.
