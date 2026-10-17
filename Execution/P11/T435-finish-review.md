# T435: The finish review over the whole app

## Task ID

T435

## Date

2026-10-17

## What changed

T435 was reserved in `Roadmap/1.2-migration-handoff.md` as the end of roadmap 1.2: an impeccable finish review over the whole app, with "after" numbers measured against `Roadmap/1.2-baseline-audit.md`. The migration it closes ran from T426 to T434, with the second passes T446, T458 to T461 and T463 to T468 after it.

The review repeated the baseline's method.

**Two isolated assessments:**
- **The design review** never saw the detector output. It covered 36 shots of the same 11 surfaces at 390 x 844 and 1440 x 900, plus computed-style probes for fonts, selected states, button kinds and price strings.
- **The technical audit** scored five dimensions and ran the impeccable detector by URL on the same 11 surfaces at both sizes. It compared rule by rule against the baseline JSON in `design-1.2-baseline/detect/`. It also cross-checked with the CLI, and probed a 9 px test page to confirm the newer engine still fires the old rules.

**The quality-floor walker** ran over the built app: 76 screens at 390 x 844 and 1440 x 900, 4 aborted.

**What the review found and this task fixed:**
- **The day kit's copy (T463-c, T464-d).** It read "1 tips" (now `dayws.kitTips1` in six languages), and a long-walk flag ran into its transit link ("A long walk.Bus or tram"). The home page's day and share captures were reshot in six languages. Only the share captures changed; the day captures never showed the tip count and came out identical.
- **Broken photos.** A plan card on the day planner's start showed a broken image. Its `HeroImage` asked Wikimedia for a 240 px thumbnail, which Commons does not render, so it got a 400. `thumbAt()` in src/lib/heroImage.js now snaps any width to the next one Commons renders, which fixes every caller.
- **The photo placeholder.** The flag-and-name block left the retired display face and the paper tint for Lagoon roles.
- **"Every walk checked on real footpaths".** It was green text in a sentence. It is ink now, with the success tick.
- **The share-trip dialog (.guide-modal).** It sat on --paper, an 18 px radius and the old shadow. It now uses the dialog family's --surface, --radius-sheet and --elev-3.
- **Explore's removable filter chips.** They were 30 px, sunken and 12 px. They are now the same white, 32 px, label-size chip as on Destinations.
- **Text under the 11 px floor** on the item pages: the fact labels, the source credit and an itinerary card's "also" line, all now at --text-micro.
- **Three inputs named only by their placeholder** got an accessible name: the Dropdown search, a past trip's companion field, and the day bot's free text. The other two the baseline listed were already fixed.
- **The week's climb bars** grew by animating height. They grow by transform now, which the detector's layout-transition rule fired on for every page.

## Files touched

**Modified (app repo):**
- src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (dayws.kitTips1)
- src/planner/DayPlannerTab.jsx, src/planner/DayPlanPanel.jsx
- src/lib/heroImage.js (thumbAt snaps to a rendered width)
- src/styles/24-destination-workspace.css (the photo placeholder; the itinerary "also" line)
- src/styles/68-v6-dayplanner.css (the checked-route line)
- src/styles/12-guided-trip.css (.guide-modal)
- src/styles/62-v6-explore.css (.xchip)
- src/styles/23-places-pages.css (fact labels and credit at the floor)
- src/styles/70-item-pages.css and src/browse/TripWeek.jsx (the climb bars)
- src/components/Dropdown.jsx, src/auth/PastTripForm.jsx, src/planner/AiDayPlanModal.jsx (accessible names)
- public/home/{en,nl,de,fr,es,it}/share.webp (reshot)
- scripts/ci/design-lint.baseline.json (shrunk)

**Modified (root repo):**
- Roadmap/Carta roadmap.md (row 1.2)

**Created (root repo):**
- Execution/P11/T435-finish-review.md

## Commands run

```
cd continent-app
npx vite build
npx vite preview --port 5206 --strictPort --host 127.0.0.1
node scripts/verify_quality_floor.mjs t435 --port=5206 --out=C:/Users/Gebruiker/Documents/Portfolio/design-1.2-baseline/t435
node scripts/verify_focus_trap.mjs
node scripts/shoot_home_screens.mjs --port=5210 --only=day,share
npm test
node scripts/ci/design-lint.mjs --meter
node scripts/ci/design-lint.mjs --update-baseline
```

The assessments' scripts, shots and raw detector JSON are in the session scratchpad (`t435A`, `t435B`). The quality-floor JSON is in `design-1.2-baseline/t435/`.

## Config and secrets set

None.

## Before/after measurements

Before is `Roadmap/1.2-baseline-audit.md` (2026-10-13, T418). After is this review. For the design-lint meter only, before is T425's starting meter, since the baseline audit predates the lint rules.

| Metric | Before | After | Delta |
|---|---|---|---|
| Critique, Nielsen heuristics | 21 / 36 | 26 / 36 | +5 |
| Weakest heuristic | Consistency, 1 / 4 | Consistency, 2 / 4 | +1 |
| Audit, technical health | 11 / 20 | 12 / 20 (accessibility 3, performance 2, responsive 3, theming 2, integrity 2) | +1 |
| Design specificity | about 60% authored for Carta | about 85% | +25 points |
| Detector findings, 11 surfaces at both sizes | 2,487 | 368 (310 by the CLI) | -2,119 |
| Undersized UI text (detector) | 2,128 | 44 | -2,084 |
| Accent text on its tint at 3.8:1 (detector low-contrast) | 144 | 0 | -144 |
| Overused font / cream palette (detector) | 22 / 22 | 0 / 0 | -44 |
| Buttons through the kit | 22 of 773 | 316 kit (247 Button, 69 IconButton) beside 423 raw | +294 |
| Distinct font-size literals / radius literals | 52 / 48 | 40 / 17 (the audit counts 27 radii with rem and percent) | -12 / -31 |
| rgba literals | 191 | 161 | -30 |
| Distinct z-index values | 44 | 48 | +4 (worse) |
| Faces rendered | Fraunces, Figtree, JetBrains Mono and others | Figtree only (MapLibre's own controls excepted) | |
| Selected states | slate fills with 11 meanings | one: the light tint and a mark, on every one measured | |
| Phone targets under 44 px (quality floor) | 2 | 0 | -2 |
| Quality floor checks (hscroll, h1, heading order, one primary, fake controls, gradients, usage contrast) | pass | pass, 76 screens | |
| Design-lint meter: raw-button, font-size, radius, legacy-token, money | 767, 2,269, 1,074, 6,145, 77 (T425 start) | 423, 1,751, 782, 4,680, 47 | -344, -518, -292, -1,465, -30 |
| Design lint, whole app | 7,951 (start of this session) | 7,795 | -156 |
| CSS before first paint | 868 KB (137 KB gzip) | 893 KB (142 KB gzip) | +25 KB (worse) |
| Eager JS before first paint | about 430 KB gzip | 468 KB gzip | +38 KB (worse) |
| npm test | | 451/451 | |
| verify_focus_trap on the fresh build | | all pass (closes T465-a) | |

### Is roadmap 1.2 done?

Its "Klaar als" says: the same buttons, cards and price notation across all tabs. The base layer is unified. The face, the primary button, the selected state and the estimate mark are the same everywhere, nothing of the retired look renders, and the critique counts the app about 85% authored for Carta. Four things remain, so row 1.2 moves to "Grotendeels klaar" with this list rather than "Klaar":

- three page bars and two focus rules across the destination, item and region pages
- three compact-row looks and two radii for selects and search fields
- per-unit price wording that differs by screen ("a person a day", "a day", "a day here, a person", "each", "about €38")
- 423 raw buttons

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A broken photo on the day planner's plan cards | `HeroImage maxWidth={240}` asked Commons for a width it does not render (HTTP 400) | `thumbAt()` snaps every width to the next rendered one |
| The climb bars fired the layout-transition rule on every page | They animated height | `transform: scaleY()` from the bottom |

## What is still open

T435-a, P1: the journey page's deep link is dead on a cold load. `#journey=<id>` lands on the Destinations trips list and never opens the page. The tiles are not `<a href>` either. The fix: honour the pending journey after the library loads, and make the tile title a link (src/lib/journeys.js, JourneyPage.jsx).

T435-b, P1: the journey gallery's captions carry only the place name, no author or licence, unlike every other page.

T435-c, P1: the journey price card has its own two sliders ("Where you sleep", "How you spend"), a second Lifestyle control against carta-design's "there is one". It should be one Lifestyle row that opens the panel.

T435-d, P2: per-unit price wording differs by screen. Pick one order ("a person a day") and drop "each" and "a day here, a person". The receipt footnote's "about €38" should be `~€38 est.`.

T435-e, P2: one page bar and one focus rule.

- **Destination page:** it shows a close cross on desktop. It needs "back to the list" on both sizes, with focus on its title.
- **Region page:** it needs the item pages' page bar (back, save, share), with "Coast, Belgium" under the h1 rather than above it.

T435-f, P1 performance: the CSS ships as one 893 KB file before first paint, and plan requirement 15 (CSS per route) is still unmet. Two eager JS chunks are oversized: the i18n chunk (105 KB gzip, every language) and the useFocusTrap chunk (52 KB gzip, a large module bundled into a hook's chunk).

T435-g, P2: z-index has no token layer in use: 48 distinct values, 150 literal uses, 6 through a variable.

T435-h, P3:

- Pill search fields and Explore's pill sort control sit beside 10 px selects.
- "Read the statement" in My trips is a 12.5 px pill; it should be a kit small secondary.
- On a phone, Explore gives "Best match" a row of its own and floats the List | Map control over the list.
- The trail page's selected section has the tint but no underline.
- "VOIDOKILIA" arrives uppercase from the bathing-site data.
- Comments in three stylesheets still name the retired terracotta and Fraunces. They are comments only and affect nothing that renders.

T435-i, owner: map pins carry the tilde alone ("~€83"), a T441 decision that keeps the label compact (the tooltip and the accessible name carry "est."). The review read it as the retired bare tilde. The owner confirms the exception, or the pins move to `~€83 est.`.

## Deploy

Deployed to production on 2026-10-17, as the owner asked, and smoke-checked:

- **Build.** `VITE_E2E_SEAMS= npm run build:pages` built the app with the dev seams empty. A grep found no paymock, savedmock, badgemock or coplanmock in the bundle, and the Pages limit check passed at 158 files.
- **Deploy.** `npx wrangler pages deploy dist --project-name carta-app --branch main` deployed it as Pages `e0455baa`, carrying T464 to T468 and T435.
- **Data.** The data shards (dist-data/ to R2) did not change in this session and were not pushed.
- **Smoke check of carta-europetravel.com at 390 and 1440, no page errors:**
  - the home page is 2,639 px tall on a phone and 4,120 px on desktop
  - the traveller pills name their places ("Bovec ~€60 est. a day")
  - the Home tab is in the header
  - the phone peek is present

Rollback of the deploy: redeploy the previous build, Pages `204d4932`, from the Cloudflare dashboard (Deployments, then "Rollback to this deployment"). Or revert the merges and redeploy.

## Rollback procedure

In the app repo: `git revert -m 1 <merge of p11-finish-review>`. The six share captures come back with it. In the root repo, revert the report commit and the roadmap line.
