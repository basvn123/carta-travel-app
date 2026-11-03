# T1041: one desktop width system for every tab

## Date

2026-11-04

## What changed

Every desktop tab now takes its content width from one of three page caps instead of its own number. Before, the tabs used nine different caps (none, 920, 1120, 1180, 1240, 1280, 1320, 1440 and 1600 px), so the left edge jumped from tab to tab and on a 1920 px screen the Explore list ran to about 1840 px. The caps were measured on Airbnb, Booking, Wanderlog, Google Explore, Komoot and Lonely Planet on 2026-11-03:

- **Browse, 1440 px:** Explore and its category tabs, My trips, the Plan opening and library, the home page body and the footer.
- **Detail, 1240 px:** the place, item, library-trip, region and trip pages, plus a day-wizard step with its summary card.
- **Hub, 1120 px:** Account, Together and Pricing.

The side gutter grows with the screen: 16 px on a phone, then 24, 32 and 48 px from 769, 1024 and 1440 px (Airbnb's steps). The header, the settings line, the page bars and the browse pages share one left edge, `--page-inset`, which keeps T427's single gutter and moves it in with the cap on a wide screen.

The Explore map view on a desktop now gives the map the rest of the screen, as Google Explore and Airbnb do:

- the six category tabs keep their row (48 px tall, still spread across, T622);
- the back button, the filter chips and the tools share one row under it;
- the title is read by screen readers but not drawn;
- the map runs from gutter to gutter, down to the bottom of the screen.

The day wizard with its summary rail no longer stretches to 1600 px: its step bar, recap band, step and foot bar share one 1240 px frame. The phone layout is unchanged: every phone padding resolves to the same value as before.

## Files touched

- Tokens: `continent-app/src/styles/01-tokens.css` (`--w-browse`, `--w-detail`, `--w-hub`, `--w-form`, `--w-aside`, `--page-gutter`, `--page-inset`)
- Shell, header, settings line, page bar: `continent-app/src/styles/60-v6-shell.css`, `continent-app/src/styles/70-item-pages.css`
- Explore, category tabs, map view: `continent-app/src/styles/62-v6-explore.css`, `continent-app/src/styles/63-v6-destinations.css`
- Home and footer: `continent-app/src/styles/61-v6-home.css`, `continent-app/src/styles/62-home-story.css`, `continent-app/src/styles/82-site-footer.css`
- Place, item, library-trip and region pages: `continent-app/src/styles/88-place-template.css`, `continent-app/src/styles/25-feature-pages.css`, `continent-app/src/styles/items/66-v6-trips.css`, `continent-app/src/styles/28-detail-skeleton.css`, `continent-app/src/styles/34-section-rail.css`
- Plan and the planners: `continent-app/src/styles/86-plan-flow.css`, `continent-app/src/planner/TripSummary.css`, `continent-app/src/styles/planners/67-v6-tripplanner.css`, `continent-app/src/styles/planners/68-v6-dayplanner.css`
- My trips, Account, Together, Pricing: `continent-app/src/styles/70-mytrips.css`, `continent-app/src/styles/91-account.css`, `continent-app/src/styles/90-together.css`, `continent-app/src/styles/72-pricing.css`
- Written rules: `DESIGN.md` (Layout table and Breakpoints), `.claude/skills/carta-design/references/app-rules.md` (Breakpoints)

## Commands run

```
git worktree add -b p15-desktop-widths C:/Users/Gebruiker/Documents/Portfolio/wt/t1041 main
cd continent-app && npm test
CARTA_APP=<worktree>/continent-app FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
node scripts/css-routes.mjs --check ../.fastbuild/assets
node scripts/ci/design-lint.mjs
impeccable detect --json --scope layout <changed files>
```

## Config and secrets set

None.

## Before/after measurements

Measured in Chrome at the widths named, with the DOM (`getBoundingClientRect`), on the dev server.

| Metric | Before | After | Delta |
|---|---|---|---|
| Distinct desktop content caps across tabs | 9 | 3 (plus the uncapped map surface) | -6 |
| Explore list content width at 1920 px | about 1840 px | 1425 px (1440 less the scroller's bar) | -415 px |
| Left edge of header, Explore, Home, footer, page bars at 1920 px | 32 px (header, Explore), 372 px (Home), about 24 px (page bars) | 240 px for all (232 px inside a scroller with its own bar) | one line |
| Explore map view at 1440 x 732: map top and height | top 331, 420 px, bottom off screen | top 255, 461 px, whole map in view | +41 px, no page scroll |
| Explore map view at 1920 x 1080: map height in view | about 749 px (from the CSS: top 331, 836 px tall) | 808 px, bottom on screen | +59 px |
| Day wizard frame at 1920 px with the rail | 1600 px | 1240 px | -360 px |
| Pricing content width | 920 px | 1120 px | +200 px |
| Account content width at 1920 px | 1056 px | 1120 px | +64 px |
| Place page content width at 1920 px | 1176 px | 1240 px | +64 px |
| Phone (390 px) Explore gutter, horizontal scroll | 16 px, none | 16 px, none | 0 |
| `npm test` | not run on main | 1210 pass, 3 fail (`numbersPage.test.mjs`: no `public/boot.json` in a worktree; 4 of 4 pass on main) | |
| `css-routes --check` problems | 3 (T1040) | 3, the same plan-flow route-only sheets | 0 |
| Design lint output lines | 616 on main | 616, the same lines | 0 |
| Impeccable layout detector findings | | 0 | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Home, Plan opening, place page, footer, Account, Together, trip and region pages kept 32 or 40 px gutters after the caps moved | Each had a second desktop media rule with a literal `--space-6` or `--space-7` padding | Each of those horizontal paddings now reads `--page-gutter` |
| The day wizard's step bar, recap band and foot bar stayed 1600 px wide over a 1240 px step | They read `--wiz-max` from the wizard, not from `.wiz-main` | `--wiz-max` is set on the wizard with `:has(.wiz-main.has-rail)` |
| First dev server took about six minutes to answer | Vite watches the large `public/` folder on a cold start | Waited it out; worth knowing before a timed check |
| `npm test` in a worktree fails 3 numbers-page tests | They read untracked `public/boot.json` | Ran that file on main (4 of 4 pass); not caused by this task |

## Screens checked

Dev server from the worktree (with the live `public/` as its public folder), Chrome:

- 1920 x 1080: Explore list, Explore map view, place page (Rome), Plan opening, trip wizard Where step, day wizard Days step, My trips (empty), Account, Pricing, Home.
- 1440 x 732: Explore map view.
- 1024 x 768: Explore map view. The chip row scrolls inside its column; the map fills the rest.
- 390 x 844 phone: Explore.

Screenshots are in `Execution/P15/T1041-shots/` (gitignored).

Not seen in the browser:

- a trip page with a real saved trip;
- Together (needs a signed-in account);
- an item page (trail, beach);
- a region page.

Their containers moved onto the same tokens as the screens above.

## What is still open

- **T1041-a.** Pages inside their own scroller (My trips, the trip wizard) sit 8 px left of the header line at 1920 px. The scroller's bar takes that much from the width the page centres in. Fixing it needs either `scrollbar-gutter` on the header or a scroller-aware inset, and both touch the shell.
- **T1041-b.** Some screens were not seen in a browser: the trip page with a saved trip, Together, an item page and a region page. The next batch's end check should look at them at 1440 and 1920 px.
- **T1041-c.** Two rules were left in place for this task's scope:
  - `.destp-v3 .destp-grid` in `64-v6-destination.css` still caps at 1180 px, but no component renders `destp-v3` any more, so the rule looks like dead CSS for a cleanup task to confirm and remove.
  - `24-destination-workspace.css` and `23-places-pages.css` keep their 1180 px fallback caps for other hosts.

## Rollback procedure

`git revert` the T1041 code commit, then the report commit. CSS and docs only; nothing is one-way.
