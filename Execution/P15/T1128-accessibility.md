# T1128: Accessibility audit of the surfaces (ROADMAP G10, session S44)

## Date

2026-11-06

## What changed

Carta now has a repeatable WCAG 2.2 AA check: `continent-app/scripts/verify_axe.mjs` runs axe-core 4.14 on 15 surface screens (Home, Explore list and map, the places category, a place, trail and beach page, Plan start, the wizard, its review, a built trip page, Account signed in and as a guest, Pricing, Admin) at 390 px and 1280 px, and walks each with the Tab key for missing focus rings and stuck focus. Before the fixes 21 of the 30 runs failed the serious gate with 94 serious nodes on six rules; after them all 30 runs pass with 0 serious or critical nodes and 0 Tab stops without a focus mark. Most failures were WCAG 2.5.3 (label in name): `aria-label`s that reworded or reordered what a control shows, and label and value spans with no space between them, so the visible text read "FromBrussels". The rest: `aria-label` on a `<p>` (home headlines), white header labels over the home film whose soft shadow measured 2.7:1, three sideways scroll regions a keyboard could not reach, two unnamed empty admin charts, a phone search field with only a 1 px border tint on focus, and eight "Read more" links with the same name. 19 of the 29 register rows folded into G10 are closed (evidence per row in `_OPEN-CLOSED.md`); 10 carry on as T1128-a to T1128-e. The method and the result live in `docs/design/a11y-audit.md`.

## Files touched

Created:
- `continent-app/scripts/verify_axe.mjs` (the axe and keyboard audit)
- `continent-app/tests/a11yNames.test.mjs` (render checks for the name fixes)
- `docs/design/a11y-audit.md` (the G10 record ROADMAP names)
- `Execution/P15/T1128-accessibility.md` (this report)

Modified, app (`continent-app/`):
- Names (WCAG 2.5.3): `src/components/SettingsLine.jsx`, `src/components/OriginPicker.jsx`, `src/components/SearchDock.jsx`, `src/browse/OutdoorParts.jsx` (stay link, score link), `src/browse/DestinationPage.jsx` (score button), `src/components/RatingBadge.jsx` (`ScoreChip asText`), `src/planner/TripTotalBar.jsx`, `src/planner/wizard/WizardChrome.jsx`, `src/planner/wizard/StepReview.jsx`, `src/planner/TripSummary.jsx` (place line, trip bar cells, map card), `src/planner/trip/BookPasses.jsx`, `src/auth/AccountPanel.jsx` (identity card), `src/browse/PlaceOverview.jsx`, `src/browse/MapPlacePanel.jsx`, `src/browse/MemberPlaces.jsx` (link purpose, 2.4.4)
- Prohibited name: `src/browse/home/motionKit.jsx` (`MaskedText` reads from an `.sr-only` copy)
- Scroll regions: `src/browse/DestBefore.jsx`, `src/planner/wizard/StepReview.jsx`, the admin tables (10 in six files: `src/components/admin/{UsersList,AuditLog,PublicGuides,PriceProvenance,AiUsage,Margin}.jsx`)
- Unnamed image: `src/components/admin/Sparkbars.jsx`
- Styles: `src/styles/61-v6-home.css` (header shadow on the film), `src/styles/63-v6-destinations.css` (phone search ring), `src/styles/60-v6-shell.css` (origin city gap is now the space in the markup)
- i18n, all six languages: added `score.outOf10`, `plan.totalBarNameFoot`, `ac.editProfile`; reworded `wizard.revStayAria` to start with the button's words; removed four keys no code reads any more (`ox.seeTown`, `ac.editProfileAria`, `explore.openDest`, `mapPanel.show`)
- `package.json`, `package-lock.json`: `@axe-core/playwright` 4.14 as a dev dependency

Modified, repo: `ROADMAP.md` (G10 status), `Execution/_OPEN.md` (T1128-a to T1128-h), `Execution/_OPEN-CLOSED.md` (status of the 29 G10 rows).

Not touched, on purpose: the cost card (S38) and motion tokens or reduced-motion rules (S40).

## Commands run

```
cd continent-app
npm ci && npm i -D @axe-core/playwright
node scripts/sync-data.mjs --split-only      # boot.json and dest/ from public/app_data.json (gitignored, the master is not in this checkout)
npx vite --port 5173 --strictPort --host 127.0.0.1
VITE_SUPABASE_URL=https://ntssxktaduxzpsmejwyv.supabase.co VITE_SUPABASE_ANON_KEY=stub npx vite --port 5174 --strictPort --host 127.0.0.1
node scripts/verify_axe.mjs --admin-port 5174 --out ../Execution/P15/T1128-shots/before
# fixes
node scripts/verify_axe.mjs --admin-port 5174 --shots --out ../Execution/P15/T1128-shots/after
npx eslint <touched files>; npm test
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
```

In this container the browser is the preinstalled one at `/opt/pw-browsers/chromium` (the script picks it up, or `CHROMIUM_PATH`), and every request off 127.0.0.1 is aborted, so photos and the home film never load.

## Config and secrets set

None. The admin run uses a stub Supabase URL and key on a local dev server; every Supabase call is answered inside the browser.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Screen and width runs failing the serious gate | 21 of 30 | 0 of 30 | -21 |
| Serious or critical axe nodes, all runs | 94 | 0 | -94 |
| Moderate and minor axe nodes (WCAG tags) | 0 | 0 | 0 |
| Tab stops without a focus mark (60 per run) | 2 | 0 | -2 |
| Tab stops stuck on one element | 0 | 0 | 0 |
| App tests | 1,557 | 1,560 | +3 |

Per screen (serious nodes):

| Screen | 390 before | 390 after | 1280 before | 1280 after | Rules before |
|---|---|---|---|---|---|
| home | 3 | 0 | 7 | 0 | aria-prohibited-attr, color-contrast |
| explore-list | 0 | 0 | 6 | 0 | label-content-name-mismatch |
| explore-map | 1 | 0 | 11 | 0 | label-content-name-mismatch |
| places | 0 | 0 | 6 | 0 | label-content-name-mismatch |
| place | 2 | 0 | 7 | 0 | label-content-name-mismatch, scrollable-region-focusable |
| trail | 1 | 0 | 7 | 0 | label-content-name-mismatch |
| beach | 1 | 0 | 7 | 0 | label-content-name-mismatch |
| plan-start | 0 | 0 | 0 | 0 | none |
| plan-wizard | 1 | 0 | 0 | 0 | label-content-name-mismatch |
| plan-review | 4 | 0 | 2 | 0 | label-content-name-mismatch, scrollable-region-focusable |
| trip | 5 | 0 | 9 | 0 | label-content-name-mismatch |
| account | 1 | 0 | 1 | 0 | label-content-name-mismatch |
| account-guest | 0 | 0 | 0 | 0 | none |
| pricing | 0 | 0 | 0 | 0 | none |
| admin | 4 | 0 | 8 | 0 | role-img-alt, scrollable-region-focusable, label-content-name-mismatch |

The "stuck" figure of the first walk (6 and 7 on the place page) was eight different "Read more" links with one name, not a trap; the walk now tells the two apart ("same name"). After the fix the place page has 0; the wizard review keeps 2 to 3 same-name pairs (its two "Edit" links), left as they are.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Every screen showed "We couldn't load Carta's travel data" | `public/boot.json` and `public/dest/` are generated and gitignored, and the master dataset is not in this checkout | `node scripts/sync-data.mjs --split-only` builds them from `public/app_data.json` |
| The pinned Playwright (1.61) found no browser | the container ships chromium 1243 only | the script uses `/opt/pw-browsers/chromium` when it exists, or `CHROMIUM_PATH` |
| Pages hung on remote requests | the data host, photo CDN and map tiles are unreachable here | the script aborts every request off 127.0.0.1 (Supabase too, except where the admin run answers it) |
| A space between two `<span>`s did not fix the label-in-name rule on the trip bar | a bare space between grid or flex items has no box, and axe drops text without a box | the space goes inside the first span (`{`${label} `}`); the same for the lifestyle value |
| The home header labels still failed after a darker shadow | axe compares white text with its own tight shadow; one layer at full ink measured 3.75:1 | a 1 px hairline plus the tight layer, both full ink: 0 nodes; looks the same at a glance (shot in the shots folder) |
| ScoreChip as `role="img"` inside a link | the link's name came from "Rated 9.1 out of 10, Exceptional", which does not hold "9.1 Exceptional" in order | `ScoreChip asText`: visible figure and word, then ", out of 10" visually hidden; used by the two score controls |

## Screens checked

All 15 screens at 390 and 1280 px in headless Chromium against the dev server, before and after (axe plus a 60-stop Tab walk each); screenshots of every run are in `Execution/P15/T1128-shots/after/` (gitignored). Looked at: the home header at 1280 on the film fallback (labels read the same, a crisper edge), the trip page, wizard review, place page, account and admin at 390. Photos and the film are blank in this container (no CDN), so contrast on real photos and the film was not seen (T1128-h). No screen reader was run (T1128-a).

## Register rows folded into G10 (29)

Closed by T1128 (19): T190-c, T186-a, T186-b, T231-a, T231-f, T363-a, T392-d, T393-j, T396-c, T401-f, T405-a (won't do: the file is gone), T405-f, T409-i, T418-b, T429-d, T446-i, T430-i, T460-g, T506-g (won't do), T507-d (won't do). Still open, carried by new rows (10): T190-f (T1128-a), T620-a and T956-a (T1128-b), T409-e, T411-k, T440-b, T432-f (T1128-c), T190-d (T1128-d), T444-c (T1128-e). Each row's status in `_OPEN-CLOSED.md` names its evidence.

Note on T186-b: WCAG 2.2 AA asks 24 px targets (2.5.8), and axe's target-size rule found none under it; the 44 px floor is Carta's own rule and stays with G11.

## What is still open

- T1128-a (user): screen-reader pass on a real phone, VoiceOver and TalkBack.
- T1128-b (user): pause control for the home film and tour; WCAG 2.2.2 is Level A, so the page is not AA until this is decided.
- T1128-c (next task): the screens the script does not open yet (day workspace, journey, cycling, lake, mountain, region, Together, DateField).
- T1128-d (user): keyboard layer for the wizard's country map, or not.
- T1128-e (next task): Tab cost of the Explore rails.
- T1128-f (next task): CI. A full run is about 45 minutes on a dev server, too slow for `ci.yml`; a nightly or path-triggered workflow on a preview build with a short screen list is the way. No CI step was added.
- T1128-g (next task): Ask Carta's place rows use the same short-name pattern removed here.
- T1128-h (user): look at the home header on the real film at 1280 px.
- HANDBOOK: no feature's rules changed, so no section was edited; the audit record is `docs/design/a11y-audit.md`.

## Rollback procedure

`git revert` the T1128 commit. Nothing is one-way: no data, migration or deploy.

## Owner steps (for the checklist)

- [T1128-a] Screen-reader pass on a real phone | axe checks markup, not what a person hears, and G10 asks for screen readers | Turn on VoiceOver (iPhone: Settings, Accessibility) and TalkBack (Android); on each of Home, Explore list and map, a place, trail and beach page, the Plan wizard, the trip page and Account, swipe through every control and note anything read wrong, twice or not at all; send the notes to the next session | Execution/P15/T1128-accessibility.md
- [T1128-b] Decide the pause for the home film and tour | WCAG 2.2.2 (Level A) needs a way to pause motion that runs longer than 5 seconds, so the home page is not AA without it | Choose one: a small pause control on the film and tour, or both stop after 5 seconds, or keep as is and accept the gap; reply in chat | Execution/_OPEN.md (T1128-b)
- [T1128-d] Decide the wizard country map's keyboard layer | the map is pointer only; the card grid beside it is the keyboard path | Choose: keep the grid as the keyboard path, or ask for a keyboard layer like Explore's map | Execution/_OPEN.md (T1128-d)
- [T1128-h] Look at the home header on the real film | the white labels now carry a hairline ink shadow and the container could not load the film | Open the home page at desktop width on the deployed preview; check the header labels read well on every clip and the shadow does not look heavy | continent-app/src/styles/61-v6-home.css
