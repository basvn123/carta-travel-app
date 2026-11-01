# T980-T983: the phone header on My trips, an empty Trips tab, and a tighter Explore

Batch of four tasks on root branch `p15-explore-compact`, from the owner's message of 2026-11-01:
- the top of My trips should be the menu bar with the Carta logo, Together and the account icon, not the search dock;
- the line under "No trips yet" goes;
- Explore gets more room under its six tabs, less room before and between the rails, and a rail card caption one line shorter.

The work went through the impeccable skill (layout). Task numbers T980 to T989 were agreed with the other session in this checkout (travel-app-bc), which keeps T974 to T979.

Commits: `f6a110f6d8` (T980), `3bcce4c35a` (T981), `0f2ed825d3` (T982), `860ed1cfb0` (T983).

**End check** (once, on the batch). Dev server with `VITE_E2E_SEAMS=1`; Playwright at 375 px as a touch phone and at 1440 px. Screens: Explore (top and rails), Trails, Beaches, My trips (with `?savedmock` and empty), Account and Together.
- No horizontal scroll.
- On a phone the header sits at the top of My trips and Account: the panel's top went from 0 to 60 px, and its icon is lit.
- Desktop is unchanged: every rule is behind `max-width: 768px` or applies to a layout the desktop does not show.
- `npm test`: 1204 of 1204 pass. Lint: 0 errors.
- Screenshots: `Execution/P15/T980-T983-shots/`.

---

## T980: the shell header on My trips and Account

### Task ID
T980

### Date
2026-11-01

### What changed
On a phone, My trips and Account were full-screen pages pinned to `top: 0`, covering the shell header: z-index 40 over 25 (rule in `23-places-pages.css`). They now start under the 60 px phone header row, so the Carta logo, Together and the account door stay at the top, lit for the page that is open, as on Explore, Plan and Together.

The rule lives in `69-v6-account.css` because that file loads globally. `70-mytrips.css` loads only with the My trips panel, and the Account panel also carries `saved-trips-panel`.

The search dock that T969 put on My trips is removed by reverting 283e8e74c8 inside this commit. That also drops the dock's `plain` prop, the `topBar` plumbing and `.mt-topbar`.

### Files touched
**Modified:** `continent-app/src/App.jsx`, `continent-app/src/auth/SavedTripsPanel.jsx`, `continent-app/src/auth/mytrips/MyTripsTabs.jsx`, `continent-app/src/components/SearchDock.jsx`, `continent-app/src/styles/70-mytrips.css` (all from the revert), `continent-app/src/styles/69-v6-account.css`

### Commands run
`git revert --no-commit 283e8e74c8`, the CSS edit, `npx eslint`, then `git commit`.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After |
|---|---|---|
| My trips panel top on a 375 px phone | 0 px (header hidden) | 60 px (header shown) |

### What broke and how it was fixed
- The first version of the rule went into `70-mytrips.css`, which would have left Account uncovered until My trips had been opened once. It was moved to `69-v6-account.css` before the commit.
- The headless probe first failed because Vite bound to `localhost`, not 127.0.0.1.

### What is still open
Nothing.

### Rollback procedure
`git revert f6a110f6d8`. This brings back the dock on My trips and the panels at `top: 0`.

---

## T981: an empty Trips tab without its line

### Task ID
T981

### Date
2026-11-01

### What changed
"No trips yet" is now followed only by Plan a trip. The line "Plan one and it waits here..." is gone, and its key `mt.emptyTripsLine` is deleted from all six languages.

### Files touched
**Modified:** `continent-app/src/auth/mytrips/MyTripsTabs.jsx`, `continent-app/src/i18n/{en,de,es,fr,it,nl}.js`

### Commands run
A Python line removal, then `npm test`.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
Nothing.

### What is still open
Nothing.

### Rollback procedure
`git revert 3bcce4c35a`.

---

## T982: a rail card's caption is three lines

### Task ID
T982

### Date
2026-11-01

### What changed
On every StoryRail card (the Places rails and the rails on the five outdoor tabs), the flag now sits beside the country. Before, `.xstory-meta` was a block element and the flag a block `svg`, so the flag took a line of its own. The caption is now name, then flag and country, then the price: three lines instead of four.

Grid tiles (`.xtile-meta`, `.dtab-tile-meta`) were already flex rows. A long walk name still wraps to two lines, which is intended.

### Files touched
**Modified:** `continent-app/src/styles/80-story-rail.css`

### Commands run
Lint is not applicable (CSS only). Measured in the browser.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After |
|---|---|---|
| Rail card caption lines (Rome, Top rated, 375 px) | 4 | 3 |
| Rail card body height | about 95 px | 75 px |

### What broke and how it was fixed
Nothing.

### What is still open
Nothing.

### Rollback procedure
`git revert 0f2ed825d3`.

---

## T983: Explore's spacing on a phone

### Task ID
T983

### Date
2026-11-01

### What changed
This builds on the other session's commit 407db43479, which already squared the phone rail photos and tightened the rail head. All four changes apply to phones only (`max-width: 768px`):
- **Under the tabs.** The dealt deck of Carta's own trips starts 24 px lower (`margin-top: lift + space-5`). It had been touching the tab underline.
- **After Carta's own trips.** The first rail follows the folder at 16 px; it was 40 px.
- **Between rails.** Rails sit 16 px apart; they were 24 px. The value was edited inside 407db43479's rule.
- **Rail arrows.** They are hidden. A phone scrolls a rail by touch, and the arrows made "Top rated in Europe" wrap onto two lines whenever a fine pointer showed them.

### Files touched
**Modified:** `continent-app/src/styles/97-carta-own-trips.css`, `continent-app/src/styles/80-story-rail.css`

### Commands run
Browser measurement with Playwright, `npm test`. The commit was split from T982 by writing the T982-only version of the stylesheet first.

### Config and secrets set
None.

### Before/after measurements
At 375 px:

| Metric | Before | After |
|---|---|---|
| Tab row bottom to the deck's first photo | about 0 px | 46 px |
| Carta's own trips bottom to the first rail | 40 px | 16 px |
| Gap between rails | 24 px | 16 px |
| Rail title height ("Top rated in Europe", fine pointer) | 2 lines | 1 line (30 px) |

### What broke and how it was fixed
Nothing. The first rails screenshot did not scroll, because the page scrolls an inner container. It was redone with `scrollIntoView`.

### What is still open
Nothing new.

### Rollback procedure
`git revert 860ed1cfb0`.
