# T381: shell V3, structure, information and flow

## Task ID

T381 (design wave V3, session 1 of 10; surface key `shell`). Root branch `p10-v6-build-shell`, app branch `p10-v6-build-shell`.

## Date

2026-10-08

## What changed

The shell now shows the traveller what every price on screen is computed from, and lets them change it in one tap. A new settings line sits in its own band under the header: origin, dates (or "Any dates" while Carta's pair stands), party, Lifestyle (bed and vibe), language and "Prices in EUR". It shows every part on Explore and Destinations, only Lifestyle, language and currency on the Trip planner (the planner keeps its own origin, dates and party), and nothing on the landing page or the Day planner, where no figure reads these inputs. On a phone it never wraps: container queries drop origin first, then dates, and keep Lifestyle. Navigation became real links: every section door in the header, the bottom nav and the plan chooser is an `<a href="?tab=...">` with `aria-current="page"`, a plain click still goes through `goToTab`, each section change writes one history entry, and Back and Forward restore the section and close the pages laid over it. The brand mark goes to the landing page on both widths. "Saved trips" is "My trips" on desktop too, with a mono count chip when the shortlist is not empty, and the planner door carries a small ink dot while an unsaved trip plan with stops is on the device. The six deep-link effects go through `goToTab(key, { replace: true })`. The lazy-chunk fallback is a still LoadingBlock inside the tab region, so the header and the bottom nav stay usable while a planner loads (it used to cover the whole window). The site notice, the pass expiry banner and the email-confirmed toast share one bottom slot above the nav, with `--tap` close boxes and the safe-area inset. The plan chooser's subtitle names no flights ("Route, stops and ground costs"). Four Destinations props nothing read were removed. The Lifestyle door's vibe word moved from accent on the accent tint (3.83:1) to ink, which clears 4.5:1.

The work was planned and started by an earlier run of this session that stopped on a usage limit (plan committed as root `4ee29211c`, sixteen uncommitted app changes). This run reviewed those changes against the plan, finished the harness baseline (plan item 1), the safe-area and contrast fixes, the checks, the device walk and the report.

The final SettingsLine contract, for Explore, Destinations and the destination page (register row T380-e):

```
import { SettingsLine, SettingsContext, useSettings, useTravelMonth, SETTINGS_PARTS } from '../components/SettingsLine.jsx';

<SettingsLine
  parts={['origin','dates','party','lifestyle','language','currency']}  // default: all six, drawn in this fixed order
  className=""     // extra class on the band
  slot={false}     // true only on the shell's own line: renders the empty #settings-line-slot portal target
>
  {children}       // a surface's own filters, drawn after the parts in the same band, secondary styling
</SettingsLine>

useSettings() -> { data, origin, setOrigin, departDate, returnDate, setDepartDate, setReturnDate,
                   defaultDates, dateBounds, ownDates, travelMonth, party, setParty, stayTier,
                   lifestyle, openLifestyle }   // null outside the app shell
useTravelMonth() -> 1..12 from the traveller's own departure date, or null while the dates are Carta's
```

The shell mounts one line in `.top-bar` with `slot`; a tab that wants its filters in that band portals them into `#settings-line-slot` rather than mounting a second line.

Choices taken where impeccable would have asked (the run is unattended; owner instruction 2026-10-07). The line sits in its own band on both widths, not in the desktop header row, because at 1280 px that row already holds the brand, five tabs, Explore's portalled search, the pass chip and the avatar. The five-slot phone bar and its plus stay. The landing page stays the first-visit home. Each choice keeps Carta's palette, type and identity; nothing in the line uses the accent.

## Files touched

**Modified (root):**
- docs/design-v6/OWNERSHIP.md (row for the new SettingsLine.jsx, shell)
- Execution/_OPEN.md (rows T381-a to T381-h; T370-a, T370-e and T380-g closed)

**Created (root):**
- docs/design-v6/plans/V3-shell.md (the plan, committed by the first run)
- Execution/P10/T381-v6-v3-shell.md

**Modified (app, continent-app/):**
- src/App.jsx
- src/components/AppHeader.jsx
- src/components/BottomNav.jsx
- src/components/AnnouncementBar.jsx
- src/components/OriginPicker.jsx
- src/lib/urlState.js
- src/styles/60-v6-shell.css
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (24 new keys and 2 changed, under `nav.`, `a11y.`, `state.` and `settings.`)
- scripts/verify_desktop_shell.mjs, verify_filter_sheet.mjs, verify_lifestyle.mjs, verify_tab_switching.mjs, verify_top_bar.mjs (assertion updates with comments)

**Created (app):**
- src/components/SettingsLine.jsx

**Deleted:** none.

## Commands run

In the app worktree `wt/T381-app`, with its node_modules junction on the private install `wt/_scratch/T381/deps/node_modules`:

```
npm run lint
npm test
node scripts/ci/design-lint.mjs
node scripts/check_ownership.mjs C:/Users/Gebruiker/Documents/Portfolio/wt/T381/docs/design-v6/OWNERSHIP.md
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npx vite build            # not npm run build: its prebuild sync-data reads app_data/, absent from the sparse root worktree; public/ data was already present
npx vite preview --port 5201 --strictPort
CARTA_PORT=5201 node scripts/verify_bottom_nav.mjs        (and verify_desktop_shell, verify_top_bar, verify_tab_switching, verify_filter_sheet)
node scripts/verify_lifestyle.mjs ; node scripts/verify_focus_trap.mjs     (own servers)
node scripts/verify_keyboard.mjs --port 5201
node scripts/verify_quality_floor.mjs after --port=5201 --vp=mobile  --out=<wt/_scratch/T381/qf>
node scripts/verify_quality_floor.mjs afterd --port=5201 --vp=desktop --out=<wt/_scratch/T381/qf>
sh ".../impeccable/scripts/impeccable" detect --json <every changed file>
rm -rf dist dist-data
```

The device walk (`wt/_scratch/T381/walk.mjs`, copied into scripts/ for the run and removed) drove iPhone 13 on WebKit, Pixel 5 and 360x740 (isMobile, hasTouch) on Chromium, and 1280x800 desktop on Chromium.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Global settings shown with a control on Explore or Destinations (brief part 5b) | 1 of 6 (Lifestyle) | 6 of 6 on desktop; 4 of 6 on a phone (origin dropped at 390 px, dates too at 360 px) | +5 desktop, +3 phone |
| Section doors that are links (header, bottom nav, chooser) | 0 of 9 | 9 of 9 | +9 |
| Calls to history.pushState in src | 0 | 1 (goToTab) plus a popstate handler | +1 |
| Tab changes that bypass goToTab | 6 deep-link effects | 0 | -6 |
| Controls added on the shell | | settings line parts 6 (5 buttons and a text), count chip 1, plan dot 1 | +8 |
| Destinations props removed | | onChangeOrigin, transportMode, driveHome, onChangeDriveHome | -4 |
| Shell harnesses passing on a preview build | not established (T370: 0 of 5 URL-driven ran to the end; this run's baseline before edits: verify_lifestyle failed, focus_trap and keyboard passed) | 9 of 9 (bottom_nav 0 failed; desktop_shell 41/41; top_bar 0 failed; tab_switching 74/74; filter_sheet 30/30; lifestyle OK; focus_trap all; keyboard 20/20; quality floor see below) | 9 of 9 |
| verify_quality_floor, phone, text under 4.5:1 [usage] | 17 | 12 (15 before the vibe fix; the remaining hits belong to trips, the day planner, account and outdoor) | -5 |
| verify_quality_floor, desktop, text under 4.5:1 [usage] | 19 | 15 (measured 19 before the vibe fix; 4 of them were the Lifestyle vibe word, 0 after on the explore flow) | -4 |
| verify_quality_floor, phone targets under 44 px | 8 | 8 (all on the destination page's selects and date inputs, not shell) | 0 |
| verify_quality_floor, h1 and heading order, all 102 screens | 0 failing | 0 failing | 0 |
| Impeccable detector, changed files | 0 | 0 | 0 |
| Design lint | 213 found, 213 baselined, 0 new | 213, 213, 0 new | 0 |
| npm run lint | 0 errors | 0 errors, 74 warnings (4 new: react-refresh on SettingsLine.jsx exporting a context and two hooks beside the component) | 0 errors |
| npm test | | 341 pass, 0 fail | |

Figures: the quality-floor numbers come from `wt/_scratch/T381/qf/{base,after,afterd,vibe}/summary.json` (base built before the first app edit); harness counts from their own output; "1 of 6" from docs/design-v6/briefs/shell.md part 5b.

The phone walk (what the prompt asks the report to say):

Portrait. The settings line is one row of 45 px at y 56 on all three phones; parts are 44 px tall; no shell control under 44 px on the phone; no horizontal scroll on any tab. Tap only: the plus, the chooser, the Lifestyle part and the party part all work by tap; nothing depends on hover (the hover styles sit under `@media (hover: hover)`). Back after the chooser's Trip planner returned to Destinations on WebKit and on Chromium. No page errors.

Landscape (844x390). Above 768 px the app uses the desktop chrome: all six settings parts show, no bottom nav, no horizontal scroll. The header tabs measure 35 to 38 px tall, the pass chip 38 px and the avatar 38 px, under `--tap` on a touch screen, and the header plus the line take 109 of 390 px. Both are written up for V5 (row T381-d).

On-screen keyboard. In portrait the line has no text field (origin is dropped and the date and party popovers use buttons and DateField), so there is nothing for the keyboard to cover. In landscape the origin search field, focused with the height cut by 40 percent to 234 px, sits at 125 to 161 px, fully visible; there is no bottom nav in that layout.

Safe areas and dvh. The bottom slot and the in-tab loading block now add `env(safe-area-inset-bottom)` to the nav height, because 10-shell.css pads the nav by that inset. The settings popover's height is capped with `100dvh`. Neither inset can be exercised on Windows WebKit; it is on the owner's real-phone row.

Thumb reach. The bottom nav and its plus are unchanged; the settings line is at the top, where a setting that is changed once per trip belongs. The main action of each tab is the tab's own.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| verify_filter_sheet crashed after opening the sheet | The phone Explore sheet now holds Explore's own rail (`.xrail`), not FilterControls fields, so `.fsheet-label` was null; the header pill `.mobile-seg-btn` was already gone at the baseline | The field checks run only when the sheet carries FilterControls fields and report "skipped" otherwise; the architecture checks run on whatever sheet opens; the trigger is Explore's Filters button; a checkbox inside its label is measured by its label row; the desktop rows-and-tray checks skip when Explore v5's bar is on screen. Comments say why |
| verify_top_bar: the pass chip did not wear the accent | The assertion was the pre-T363 accent fill; T360 (owner call on T166-a) made the chip a secondary | Asserts the secondary: no fill, `--rule` border, accent only on the glyph, read from the tokens |
| verify_tab_switching timed out on "Saved trips" and failed four keep-alive checks | Rename to "My trips"; Destinations no longer portals a search field into the header (only Explore does); the tab could not scroll 800 px at this data state | Labels updated; the slot is expected empty on Destinations and to hold one field on Explore; the scroll check compares with the position actually reached. Back and Forward checks added |
| verify_lifestyle found no Destinations door | The default Destinations category (the trip library) is unpriced and draws no side-panel door; this failed at the baseline too. Since T381 the settings line carries the door on every category | Accepts the side-panel door or the settings line's Lifestyle part, and still checks it states the tier just set; the door is found by link role since the tabs are links |
| Three harness files showed as rewritten whole | The patch scripts wrote LF over CRLF | Converted back to CRLF before committing |
| The bottom slot and the loading block could sit under a tall home-bar nav | `--bottom-nav-h` (86 px) does not include the safe-area padding the nav adds | Both add `env(safe-area-inset-bottom, 0px)` |

## What is still open

Plan items 1 to 11 are done. Item 12, the two h1 on `?tab=places` (row T380-g): the second h1 is Explore's `.xbar-title`, inside the hidden Explore tab block (`display: none`), so it is out of the accessibility tree and the quality floor counts exactly one visible h1 on all 102 screens. The row is closed; T384 reached the same finding. The brief's target table also asks for the Lifestyle panel's private steppers to become the shared Stepper (V3 merge); that was not in the plan and goes to V5 (row T381-c).

On a phone in portrait the line drops origin (and dates at 360 px) to stay on one row, so those two can only be changed where a tab draws its own control. The brief accepted the collapse; whether a phone needs an overflow ("More") or a second row is a V4 call that needs a DIRECTION rule (row T381-a).

Explore still draws its own Lifestyle door beside the settings line's, so Explore shows two doors to one dialog; Destinations draws one in its side panel on priced categories. Removing them is in explore's and destinations' files (row T381-b).

Landscape on a phone gets the desktop chrome with 35 to 38 px header targets and 109 px of chrome on a 390 px screen (row T381-d, V5).

T382-c asked whether the bottom nav's raised plus covers the landing primary at 380x800. It does by design of the bar: the plus rises above the 86 px nav, and the landing page does not reserve that space. The fix belongs to the landing page (bottom padding of `var(--bottom-nav-h)` plus the safe-area inset plus the plus's rise) or to shell V4's quieter bar; written as row T381-g for both. T384-d (destinations' stylesheet overriding FilterChips' ochre look) waits for shell V4, which restyles the chips.

verify_filter_sheet now skips its FilterControls field checks, because no phone sheet the harness opens carries those fields; PlacesFilterSheet, the sheet that does, has no harness (row T381-h). The new strings need a native reader (row T381-f), and the phone-only checks need a real phone (row T381-e). Landing's People, Nights and Stay still do not write the global settings (row T370-d, open, after T381). Car mode stays the owner's call (row T370-c).

## Rollback procedure

App: `git -C continent-app revert <T381 app merge commit>` (or, before the merge, drop branch `p10-v6-build-shell`); this restores App.jsx, the nav, the header, the six catalogues, the five harnesses and removes SettingsLine.jsx. Root: revert the T381 commits (`git revert <report commit> <ownership commit> 4ee29211c`), which removes the OWNERSHIP.md row, the plan and the report and restores the register rows. Rolling back the app without the root leaves an OWNERSHIP.md row for a missing file, which check_ownership.mjs reports; revert both. Explore, Destinations and the destination page build on SettingsLine in this wave (T380-e); revert them first or they lose their import. No data, schema or migration is involved.

## carta-design's seven questions

1. Hex values outside `:root`: none in src. Hex appears only in comments of verify_desktop_shell.mjs that name the old and new accent.
2. Gradients, colours outside DESIGN.md, a second saturated hue: none. The line, the chip and the dot use `--ink`, `--ink-soft`, `--ink-fill`, `--paper-dim` and `--rule`.
3. Ochre, teal, `--danger` out of role: none used.
4. Mono as prose: no. Mono carries the IATA code, the party count, the night count, the language code and the count chip, all measured or coded facts.
5. More than one primary in a view: no; the shell adds no filled control (quality floor: 0 views with more than one primary).
6. Headlines with a verb or a number, em dashes and banned words: the shell adds no headline; the new strings are labels. No em dash or middot in any changed file (one pre-existing em dash in a console format string of verify_tab_switching.mjs, untouched).
7. Remove one thing: the accent on the Lifestyle door's vibe word went; the word is ink now.

## Direction check

Rules used: R1 (home link), R2 (settings line), R3 (count chip and state dot, mono count, ink dot), R6 (one bottom slot), R9 (links with history), and DIRECTION.md part 9's "no tint on the Lifestyle door" only as far as the vibe colour; the tint itself is V4. No pattern was built without a rule.
