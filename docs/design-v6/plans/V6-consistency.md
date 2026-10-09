# V6 plan: one traveller, one trip, the consistency pass (T411)

Written by T411 (design wave V6, 2026-10-09) before the first app edit, as the planning step of the wave prompt. It sits on the merged result of V5 (root `main` 189bb5395, app `master` 95c26a6). Precedence as always: carta-design and DESIGN.md, then DIRECTION.md, then impeccable. App paths are `src/...` in the app repo. This pass makes consistency fixes only: no new feature, no new rule. Where a fix needs a rule DIRECTION.md does not have, or a product decision, it becomes a register row.

## How the critique ran

`impeccable context` ran from the root worktree; it resolved the app repo as root and reported NO_PRODUCT_MD (the known gap, row T372-g), so PRODUCT.md and DESIGN.md were read directly. The critique ran dual-agent: Assessment A (the design review) walked the whole journey in Playwright on iPhone 13 (WebKit), Pixel 5, 360 x 740 (Chromium, touch) and 1280 x 800, against the Vite dev server on 5201; Assessment B (the detector and the code tallies) ran in a separate sub-agent and A never saw its output. No decision page, live mode or question tool was opened (owner instruction 2026-10-07, unattended run); every open call below keeps Carta's palette, type and identity.

The journey A walked: landing, Explore, Lifestyle, Destinations, a town (Plovdiv), a trail, a journey, "Plan a trip here", the wizard and the planned view, Save, Share, the day planner (Day 1 and Day 2), My trips. Every step was reachable on all four devices. The on-screen keyboard case passed on every phone (field and submit visible, the bottom nav hidden, inputs 16 px).

Heuristics (A): 22 of 40. Consistency and standards scored 1, the subject of this pass. Cognitive load: 4 checklist failures.

Baselines on the merged V5 state, measured by this session: `verify_keyboard` 22 of 22 surface checks pass; `verify_quality_floor` fails two floor lines, "screens without exactly one h1: 4" (the destination page, both widths, opened and not) and "targets under 44 px, phone: 7" (a journey cost bar segment, 39 x 44, and five Explore cut chips at 34 px), plus 4 console errors (React rejects the `fetchPriority` prop on the trail and cycle pages). Detector: 9 side-tab findings, all CSS (18-detail-panel 7, 11-trip-planner 1, 19-guide-ratings 1); 3 are live stripes, 1 is already overridden by v6, 5 sit on dead rules. Design lint: 146 found, 146 baselined, 0 new.

## The inconsistency list

Numbered as the build works through them. "Fix" means this task fixes it; "Row" means it is carried as a register row with the reason.

1. Close controls drawn as a typed "×" or "x" in 18 buttons (the trip wizard, the trip planner, the itinerary, the extras, the expense ledger, the country brief, the country picker map, the AI day plan dialog, the day planner, the day builder, the add panel, the admin page and the config manager), and the desktop destination close as a dark disc (`.panel-close`, 14-filters-panels) with a bold glyph. Fix: CloseIcon at 16 px everywhere, the house close look on `.panel-close`.
2. Back controls: the destination page's back arrow is an inline 2.2-stroke SVG named "Close"; the region page and the country page draw a typed "←". Fix: ArrowLeftIcon in all three, the destination back named "Back". Naming the list each back returns to needs new strings per page and is a row.
3. One place, two names: four toasts and a tooltip say "Saved trips" where the nav and the page say "My trips"; the My trips tab says "Favorites" where Explore says "Shortlist". Fix: the four strings name the page by the nav's own word in each language; the tab takes the word Explore uses in each language (en and de change). Native review row.
4. Two h1 at once: the destination page opened over a tab (the quality floor's 4 screens), the Explore bar's h1 under the full-page My trips and Account views (row T410-c). Fix: the shell rule that hides a tab's h1 under a page also covers the destination page and an inert tab; the Explore title carries the tab-h1 class.
5. Motion literals in shared places: the shared Button (`03-button.css`, 0.15 s on every primary), `transition: all` (three rules in 15-map-overlays), the flashcard deck (0.25 s ease, row T395-b), the fold chevron (.18 s ease). Fix: the motion tokens. The other 230 legacy literals stay a row: each owner retimes its own.
6. Hover rules outside `@media (hover: hover)`: 378 rules, so a tap leaves a hover tint behind on a phone (A saw the wizard's picked chip turn accent on tap). Fix: wrap every top-level hover rule in every stylesheet in one mechanical pass (the T410 tool), order and specificity unchanged.
7. Full-height on `100vh` in five legacy rules (19-guide-ratings 4, 25-feature-pages 1). Fix: `100dvh`.
8. Selected and accent states off the house rule: the wizard step rail marks the current step in accent (row T399-c), the wizard's picked-country chip is `--accent-bg` with an accent border, the fold header icons are accent on every detail page but two (row T397-d), the AI and pass dialogs head with an accent disc tile (row T399-d), the pass feature ticks are accent. Fix: ink per the selected-state and accent-marks rules; fold icons `--ink-soft` at the source, the two page overrides dropped.
9. Side stripes (the detector): `.guide-car-advice`, `.day-stay-chosen`, `.day-plan-walk` draw a 3 px accent or ink left stripe. Fix: the plain `--rule` border, as the day trip card already has. The five dead rules the detector hit are deleted with the other dead rules in item 17.
10. Button shapes: the destination action row (`.panel-fav`) and several planner buttons are pills, 8, 12 or 14 px. Fix: 6 px on `.panel-fav`, `.destp-bar-btn`, `.day-save-btn`, `.dayp-cta`, `.dayws-stay-btn`, `.saved-empty-cta` (controls are 6 px in the house rule).
11. Tap floor on touch: the day planner's save (29 px) and "Back to trip" (15 px), the day explore map pins (19 px, no hit box), the Explore cut chips (34 px), the pass buy button (39 px), the shared DateField trigger (28 px, row T410-f), the receipt strip's selects and dates outside the destination page (row T405-a), the MonthStrip info button on a fine pointer (28 px, row T407-d). Fix: `--tap` on a coarse pointer, 32 px on a fine one, a 44 px hit box on the pins.
12. Type: page titles at 27 px (the destination and journey heads), a verdict label set in Fraunces, the day planner's town chips set in mono (the mono rule). Fix: the page titles to the scale's 28 px, the verdict label and the chips to `--ui`. The rest of the 63 off-scale Fraunces sizes and the 664 sub-12 px sizes are a row: each is its owner's.
13. Icons: fold icons at 14 px (row T395-b). Fix: 20 px. The wider spread (623 size props off 20) is a row: a default change in Icons.jsx would restyle every surface at once and needs its own walk.
14. Count chips: the My trips tab count is a light disc on the ink tile, not the count chip. Fix: the count chip form (`--mono` 11 px, `--paper-dim`, `--ink`).
15. Facts joined with middots on the country page (row T404-d). Fix: the facts as separate spans spaced by the gap, no separator.
16. The token mirror and the PDF: `destinationPdf.js` keeps a stale fallback palette (the pre-T363 accent and mute, rows T405-b, T410-g). Fix: mirror the tokens the PDF reads in `src/map/tokenColors.js` (T363 is done, so `--accent` and `--ink-mute` can now be mirrored and checked) and build the fallback from it.
17. Dead rules other waves could not delete (rows T390-h, T395-i, T399-b, T403-b and the detector's five): delete each after a grep shows no JSX builds the class, including template-built names.
18. `fetchPriority` on the trail and cycle hero images (4 console errors in the quality floor). Fix: the lowercase attribute the other pages use.
19. Rows already closed by earlier merges, verified here: T383-g (FilterChips uses CloseIcon), T394-f (the filter sheet is on the tokens and the one scrim), T399-e (the guide chip's on state is ink at the source), T409-c (Glyph labels go through the catalogues), T403-e, T405-f and T410-e (verify_keyboard is 22 of 22), T410-g (design lint 0 new).

Carried as rows, with the reason (each is a feature, a product call or a new rule, not a consistency fix):

- The planner hand-off drops the town and the dates: "Plan a trip here" on Plovdiv seeds Bulgaria only, skips When and starts today (GuidedTripWizard seed). A behaviour change of the wizard's seed contract.
- The same trip shows three figures (the planned total, "From €36 a day national" on the saved row, nothing in the day planner), and the destination head's day figure disagrees with its receipt. Needs one decision on which figure each surface reads.
- The landing and day planner primaries sit under the bottom nav on a phone (rows T392-b, T409-g carry the landing and fork; this adds `.dayp-cta`).
- The guest save path: sign-in opens with no word on the open trip, and My trips counts a trip it cannot show.
- The pass dialog opens by itself on the planned view (`paywall.nudge('celebrate')`): a product decision.
- The journey strip states the authored range without tilde or "est." while its receipt states a total.
- Trail figures formatted two ways (list "+1,568 m", page "1568 m"), and the ref shown twice.
- The wizard's fixed chrome takes about 48 percent of a phone; landscape leaves no content (rows T403-a, T406-b).
- Back controls that name their list, bottom nav labels at 10.5 px, the settings-line focus offset, the install hint for a guest with nothing saved.
- The remaining motion literals, box-shadow transitions, off-scale radii, sub-12 px type, off-scale Fraunces and icon sizes, and accent-selected legacy rules (about 100): each owner's next session.

## Order of work and files

Shared components and tokens first, then the surface files, each commit small enough to revert alone:

1. Shell: `src/components/Icons.jsx` (unchanged API), `src/map/tokenColors.js`, `src/styles/03-button.css`, `src/styles/10-shell.css`, `src/styles/14-filters-panels.css`, `src/styles/33-flashcards.css`, `src/styles/60-v6-shell.css`, `src/browse/Fold.jsx`, `src/i18n/*.js` (five keys, six files).
2. The close and back controls in the planner, day planner, account and destination files named in item 1 and 2.
3. Surface CSS: 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 62 to 69 for items 5 to 14 and 17, and the hover wrap over every stylesheet.
4. The rest: `ExploreTab.jsx`, `CountryPage.jsx`, `TrailPage.jsx`, `CyclePage.jsx`, `DestinationPage.jsx`, `RegionPage.jsx`, `PassModal.jsx`, `AiDayPlanModal.jsx`, `destinationPdf.js`, `SavedTripsPanel.jsx` if the count chip needs markup.

## Checks

App: `npm run lint` 0 errors, `npm test`, `node scripts/ci/design-lint.mjs` 0 new, `node scripts/check_ownership.mjs`, the six catalogues parse, `npm run build` then delete `dist/` and `dist-data/`. Every harness named in the ten briefs, plus `verify_keyboard` and `verify_quality_floor`, against Vite on 5201; a failure is named with its cause. The detector once on every changed file. The journey walked again on iPhone 13, Pixel 5, 360 x 740 and 1280 x 800, with landscape and the keyboard case; at most ten JPEGs to `design-v6-shots/consistency/V6-*`.
