# T410: V5 harden, adapt and polish for My trips, account, sharing, passes, guides and admin

## Task ID

T410 (design wave V5, session 10 of 10; surface key `account`). Branch `p10-v6-polish-account` in both repos.

## Date

2026-10-09

## What changed

The surface reaches its edge cases now. On a phone every control of My trips, the account hub and its spokes, the sign-in modal, the guides, the shared trip and the past-trip form reaches 44 px: the account back button, the Friends actions, the password reveal, the text links, the feedback kind pills, the guide chips, back and copy, the record map's expand, "Add a past trip", the crew plus and remove, the night steppers and the form's own fields and buttons. A fine pointer keeps its 32 px rows. The two controls that could not be fixed here are the date field's trigger in the past-trip form (28 px, the shell's shared DateField) and the map library's own attribution; both are register rows.

Hover no longer sticks after a tap. 87 of the 88 hover rules of the stylesheets this surface owns now sit inside `@media (hover: hover)` (eight of them, in the pass half of 21-chat-passes.css, were deleted there and rewritten gated in 69-v6-account.css under OWNERSHIP rule 5; 21 is otherwise untouched), the 24 literal transition durations in 16-auth and 22-account-admin and the one literal toast animation read `--dur-1` or `--dur-2` with `--ease-out`, and the one filter transition (the climate bar) is gone. The pass half's own literal transitions and its `92vh` card are overridden in 69-v6-account.css (tokens, `dvh`), not edited in 21. The app-wide reduced-motion floor in 02-base.css already reduces every duration, so no per-file branch was added. Twelve of the thirteen raw rgba values (one in 16, ten in 17, two in 22) became tokens: both modal scrims are now `--ink` at 28 percent with no blur (the pass modal's came from the day planner's rule, so 69-v6-account.css overrides it), and the one raw value left is a baselined flag ring in 17 that the design lint would count as new if its text changed.

The admin page matches the rest. The two accent and ochre side stripes (the warning callout and the site banner) are bordered boxes on the amber tokens, the selected admin tab, segment, feedback kind pill and flag switch wear the ink fill, the nav count is a neutral chip, the feedback kind chips left `--danger` and `--green` for the ink ramp, the Sparkbars print the busiest and latest figures in mono under the drawing, and the two actions that reach somebody or throw work away now arm in place: emailing a password reset ("Send it to zoe@example.com?") and reverting a content override (a sentence, "Keep my edit", and the danger button).

Dialogs and keyboard. The full-screen record map, the shared trip view and the admin item editor are real modals: `aria-modal`, a name, a focus trap, and Escape that closes only them (the shared view and the editor had no Escape). The shared trip now has its one h1. A card menu is a menu: opening it moves focus to its first item, the arrows, Home and End walk it, Escape closes it and returns focus to its button without closing My trips (before, one press closed both). After a removal the focus lands on the toast's Undo (row T400-d). A crew name is removed with Undo for six seconds and the house close glyph (row T400-e). The share panel's three radio groups, the feedback kind pills and the language list take arrow keys with one tab stop each; the visibility and language groups move focus only, so walking them never publishes or switches language.

Language. Twelve raw `err.message` paths (the Supabase text in English) became one-sentence strings in the traveller's language through a new `authErrorText`, six new auth keys cover the causes a person can act on, every `.auth-error` has `role="alert"`, the date ranges in the shared and friend trips are one `share.dateRange` string with the app language's month names, and My trips formats dates with the app language instead of `en-GB`.

Keyboard and edges. When a phone's keyboard leaves the sign-in modal about 440 px, its submit sticks to the foot of the visible area and the lede drops, so the field and its submit are both on screen; the past-trip form keeps Cancel and Save in a sticky bar; the modals scroll inside their overlay, keep clear of the notch and the home bar, and use `dvh`. A trip or plan name wraps to two lines before it is cut. The focal trip card's photograph is 5:2 on a screen shorter than 700 px, so the actions end inside an iPhone 13 screen again after the shell's V5 header pushed them out. The 10 px tracked labels of My trips and Account are gone (DIRECTION rule 12), the sign-in modal's close is a quiet outlined circle instead of a dark disc, and the install hint's dismiss is the house close glyph instead of a letter x. Three decisions of earlier rows are closed: T400-g (the paper-dim card ground is kept and moved into 69-v6-account.css) and T400-j (the motion audit); T390-h (the dead hub upsell rules in 21) stays open, because deleting rules that are not moved is not allowed in another surface's file.

## Plan and method

The plan is `docs/design-v6/plans/V5-account.md`, committed (root `e1eb531a5`) before the first app edit. `impeccable context --target src/auth/SavedTripsPanel.jsx` ran from the root worktree and loaded PRODUCT.md and DESIGN.md. The audit and critique of the V4 result ran in one context, not the dual-agent split of V3 and V4: the V4 result had been critiqued already and the open questions were measurements, so the audit is a measurement. It used Playwright scripts kept outside both repos (`wt/_scratch/T410`: `walk.mjs` for My trips and the pass modal, `census2.mjs` for the sign-in modal, the guides, the shared trip, the hub and each account spoke, `kb2.mjs` for the keyboard, `long.mjs` for German and long names, `keys.mjs` for the keyboard paths) on iPhone 13 (WebKit), Pixel 5, 360x740 (Chromium, touch) and desktop 1280x800, against the Vite dev server on port 5210. The run is unattended (owner instruction 2026-10-07): no question tool, decision page or live mode, and where impeccable would ask, the call that keeps Carta's identity was taken. The calls and their reasons:

- The focal photograph goes to 5:2 on a short phone rather than moving the actions above the bottom nav. With the install hint up, the page above the card is 332 px; the card's text band then ends 13 px under the nav top (591 against 578) and the actions end at 636 of a 664 px screen, behind the nav, one short scroll away. V4 had read "inside the screen" without subtracting the nav. The fix that would put the actions above the nav means dropping the hint or the name's second line; that is a design call recorded as row T410-h.
- Radio groups with a consequence (publishing, language) move focus on the arrows and select on Enter or Space; groups without one (scope, lifetime, feedback kind) select as they move, as a native radio group does.
- The 28 px date field trigger and the map library's attribution are not edited: the first is the shell's shared component, the second is third-party.
- Inline confirms stay on publish, withdraw a link, and now on the two admin actions; Undo covers the rest (the house undo rule of the direction check).
- The admin page is the owner's tool: consistency only. The "Site tab with one primary" item needs ConfigManager's layout reworked and is a row, not an edit.

## Files touched

Root repo (branch `p10-v6-polish-account`):

**Created:**
- docs/design-v6/plans/V5-account.md
- Execution/P10/T410-v6-v5-account.md

**Modified:**
- docs/design-v6/OWNERSHIP.md (the two new account logic files, `authErrors.js` and `radioKeys.js`)
- Execution/_OPEN.md (rows T410-a to T410-j; T400-d, T400-e, T400-g and T400-j closed)

App repo (branch `p10-v6-polish-account`):

**Created:**
- src/auth/authErrors.js (the sentence for a failed auth call)
- src/auth/radioKeys.js (arrow keys for a button radio group)

**Modified:**
- src/auth/AccountPanel.jsx, AuthModal.jsx, GoogleButton.jsx, ResetPasswordScreen.jsx (one-sentence errors, role="alert", radio keys)
- src/auth/SavedTripsPanel.jsx (card menu keyboard and Escape, Undo takes focus, crew removal with Undo, the record map dialog, dates in the app language, no raw error text)
- src/auth/SharedTripView.jsx, FriendTripPanel.jsx (dialog, trap, h1, date range string)
- src/auth/TripSharePanel.jsx, FriendsSpoke.jsx (role="alert", radio keys)
- src/auth/InstallHint.jsx (the close glyph)
- src/components/admin/ContentSection.jsx, UserDetail.jsx, Sparkbars.jsx
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (7 keys in each; 4 admin keys in en.js only, as every admin key is)
- src/styles/16-auth.css, 17-saved-trips.css, 22-account-admin.css, 40-upload.css, 42-feedback.css (hover gating, tokens, stripes, selected states)
- src/styles/21-chat-passes.css (eight pass-half hover rules deleted, rewritten in 69; no line added)
- src/styles/24-destination-workspace.css (two blocks deleted, `--bg-card` on the two shells and the tracked section labels, moved into the v6 file under OWNERSHIP rule 5)
- src/styles/69-v6-account.css (the V5 section: coarse-pointer targets, scrims, overlays and safe areas, the keyboard rules, two-line names, section labels, the quiet close, the decision on `--bg-card`)
- scripts/verify_friends.mjs, verify_admin_panel.mjs, verify_record_map_crew.mjs (each changed assertion carries a comment; the last reads `CARTA_PORT`)

App commits: `ac8a8ca`, `d7948b3`, `abeb9fb`, `2ecfb2e`, `83eeee0`, `60bd5e2` (restores 21-chat-passes.css to master except the eight moved hover rules; `git diff --numstat` against master reads 0 added, 8 deleted). Root commits: `e1eb531a5` (plan), `d9670027d` (OWNERSHIP), then the report commit.

## Commands run

In the app worktree: `node node_modules/vite/bin/vite.js --port 5210 --strictPort` (stopped before the end), `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`, `node scripts/check_ownership.mjs ../T410/docs/design-v6/OWNERSHIP.md`, the six-catalogue parse of session rule 8, `node node_modules/vite/bin/vite.js build` then `rm -rf dist dist-data`, `impeccable detect --json` over the 23 changed JSX, JS and CSS files. From `wt/_scratch/T410/run`: `CARTA_PORT=5210 node <app>/scripts/verify_saved.mjs` and likewise verify_account_panel, verify_trip_share, verify_friends, verify_past_trip, verify_guides, verify_admin_panel and verify_record_map_crew; `CARTA_REPO_ROOT=<root worktree> node <app>/scripts/verify_paywall.mjs`; `verify_keyboard.mjs --port 5210`; `verify_quality_floor.mjs --port=5210`. The scratch scripts named above, and `wrap.py` (wraps each `:hover` selector in `@media (hover: hover)`, splitting a rule whose selector list mixes hover and non-hover selectors).

## Config and secrets set

None committed. The main checkout's `continent-app/.env` (the public anon configuration, gitignored) was copied into the app worktree for the harness runs and deleted before the end. No new migration, no API call, no secret.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Controls under 44 px, coarse pointer, My trips (Planned, Favorites, Visited, pass modal), iPhone 13 / Pixel 5 / 360x740 (`walk.mjs`, map attribution excluded) | 5 / 5 / 5 | 0 / 0 / 0 | -5 each |
| Controls under 44 px, iPhone 13, sign-in modal, guides, guide open, shared trip, hub and eight account spokes (11 views, `census2.mjs`) | 32 | 1 (a native checkbox whose 44 px label is the hit target) | -31 |
| Controls under 44 px, 360x740, hub and spokes (6 views that loaded in the first run) | 20 | 1 (the same checkbox) | -19 |
| Focal card actions bottom, iPhone 13 with the install hint, screen 664 px | 671 | 636 | -35 px (inside the screen) |
| impeccable detect, changed files | 2 (`side-tab`, 22-account-admin.css 794 and 1858) | 0 | -2 |
| Design lint violations found (baselined, new) | 149 (147, 2) | 148 (146, 2) | -1; the 2 new are `src/lib/destinationPdf.js:40-41`, not this surface |
| Literal transition durations, 16 / 22 / 21 pass half (the last by override in 69) | 6 / 18 / 7 | 0 / 0 / 0 | -31 |
| Hover rules outside `(hover: hover)`, files this surface owns | 88 | 1 (`.pass-tier:hover` in 21, neutralised in 69) | -87 (8 more remain in the chat half of 21, the day planner's) |
| Raw rgba values, 16 / 17 / 22 | 1 / 10 / 2 | 0 / 1 / 0 | -12 |
| Raw `err.message` paths shown to the traveller | 12 | 0 | -12 |
| `.auth-error` elements without `role="alert"` | 11 | 0 | -11 |
| Visible h1 in the shared trip view | 0 | 1 | +1 |
| verify_keyboard | 20 of 20 at T400 | 16 of 20 | -4, all in `journey` and `trip-planner` at two widths (not this surface, rows) |
| Quality floor, targets under 44 px, phone | 11 at T400 | 7 | -4; the 7 are on `pages-journey` (2) and `pages-legal-open` (5) |
| Quality floor, My trips and Account, mobile | 0 failures | 0 failures | 0 |
| LCP and INP | Not measured | Not measured | `scripts/perf/baseline_vitals.mjs` does not cover this surface and no change adds a request or a long task |

Sources: `wt/_scratch/T410/base/walk-*.json`, `walk-*.json`, `census-base2-iphone.json`, `census-base-small.json`, `census-vF-iphone.json`, `census-vF-small.json`, `detect-base.json`, `detect-after.json`, `run/verify_keyboard.F.log`, `run/verify_quality_floor.F.log`; the design lint and the literal and hover tallies are from the commands above and `tally.cjs`, `hov.py`.

## Phone checks (T414)

Landscape (844x390 on the iPhone, 851x393 on the Pixel): no sideways scroll on Planned, Favorites, Visited or the pass modal; the focal card draws its photo beside the band from 769 px (walk `landscape` read 0 under 44 and hscroll false). Tap only: every hover rule of the surface now sits in `@media (hover: hover)`, so nothing sticks or hides behind a hover; every menu opens on a tap and has a keyboard path. Keyboard: with the viewport 40 percent shorter, the sign-in modal shows its field and a sticky submit without overlap on 360x740 (`kb2.mjs`: the password field ends at 370 and the submit starts at 370, both inside the 444 px screen) and the past-trip form's sticky Save bar and its focused field are both on screen with no overlap on all three phones (iPhone 13 at 398 px: field 202 to 246, bar 260 to 304; 360x740 at 444 px: 171 to 215 and 306 to 350; Pixel 5 at 436 px: 145 to 189 and 298 to 342). On the iPhone 13 at 398 px the sign-in field (280 to 324) and the submit (324 to 368) are both on screen; on the Pixel 5 at 436 px they are 318 to 362 and 362 to 406. The emulated viewport shrink does not set the shell's `html.kbd-open` class, so the bottom nav still draws in those reads; only a real keyboard proves that (row T410-a). Safe areas: the sign-in overlay and the shared trip pad by `env(safe-area-inset-*)`; the toast already lived in the shell's slot. `100dvh`: no `100vh` remains in the surface's files (`.privacy-modal` and `.pass-card` moved from `vh` to `dvh`). Thumb reach: the focal card's actions are within one short scroll; the pass modal's buy button is inside the first screen on a phone (V4, unchanged). Swipe: the photo track still swipes, and Previous, Next and the arrow keys do the same; no new swipe. Long names and German: an 84 character trip name wraps to two lines on 360x740 with no sideways scroll and a German walk of My trips shows no English word from this surface's strings (`long.mjs`). What only a real phone can prove is row T410-a.

## Screenshots

Ten "after" shots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\account\`, JPEG 80, viewport only, never committed: V5-mytrips-planned-iphone, V5-mytrips-planned-android, V5-mytrips-planned-desktop, V5-mytrips-favorites-iphone, V5-mytrips-visited-iphone, V5-undo-iphone, V5-passes-iphone, V5-signin-iphone, V5-account-hub-iphone, V5-guides-iphone. They pair with the V3 and V4 sets of the same view names.

## carta-design's seven questions

1. Hex outside `:root`: none added in any file of this surface; the design lint finds the same two hex literals as before in `src/lib/destinationPdf.js`, which this surface does not own.
2. Gradients, colours outside DESIGN.md, a second saturated hue: none added; two raw scrims and ten other raw rgba values became tokens. The admin selected states moved from the accent and `--green` to the ink fill, so the surface now spends the accent on actions only.
3. Ochre, teal, `--danger`: the ochre `--rate` on the admin warning callout and the site banner moved to the amber tokens (`--amber`, `--amber-bg`, `--amber-ink`) because those are warnings, not ratings; `--danger` stays on destructive controls and on overdue; the admin feedback kind chips left `--danger` and `--green` for ink.
4. Mono: the new Sparkbars figures, the date ranges of the shared trip and every earlier measured figure are mono; the words around them are the UI face.
5. More than one primary in a view: the sign-in modal's one primary is its submit, now sticky on a short screen; the quality floor reads 0 views with more than one filled primary (`run/verify_quality_floor.F.log`).
6. Headlines and words: the new strings are "That email and password do not match.", "Confirm your email first. The link is in your inbox.", "That email already has an account. Sign in instead.", "Choose a password of at least 8 characters.", "Too many tries. Wait a minute, then try again.", "No connection. Check it and try again.", "{start} to {end}", and the admin lines "Revert this item to the pipeline value? Your edit is removed.", "Keep my edit", "Send it to {email}?" and "Busiest day {peak}, latest day {last}". No em dash, no middot and no banned word in any added line (checked by a script over the diff).
7. Remove one thing: the 10 px tracked labels on My trips and Account, the letter x on the install hint and the crew chip, the pass tier's lift (overridden), and the two accent stripes on the admin page.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| verify_friends failed on the Planned tab (card not found) | The shell's T401 now passes `onOpenFriends`, so My trips shows one line pointing at Friends instead of friend cards, as the V3 brief asked; the harness still asserted the cards | Assertion rewritten with a comment: it asserts the line, that no friend card stands on the tab, then opens the same trip from the Friends page |
| verify_friends: the co-planner picker read empty | The picker's friends load in a second request; on a slow server the read raced it | Waits for the first option, with a comment |
| verify_admin_panel failed on the password reset and the revert | Both now arm on the first press (V5-8) | Both lines press twice, with a comment |
| verify_admin_panel failed once in three runs: "the deleted account still matches its own search" | The list refreshes after the delete returns and the assertion counted at once | Waits for the empty line first, with a comment |
| Escape in the card menu closed My trips as well | App's Escape stack is on window; the menu's listener was in the bubble phase | The menu listens in the capture phase and stops the key, like the record map |
| Dark grey disc as the sign-in modal's close | `.panel-close` is built for a photograph (a dark translucent fill) | Outlined paper circle in 69-v6-account.css |
| The close overlapped the toggle when the brand row hid | First version hid the brand on short screens | The brand row stays; only the lede drops |
| `design-lint` flagged a changed `.country-flag` line as new | The baseline matches the old text exactly | The line is restored; its raw value stays baselined |
| A new `react-refresh` warning on `AuthContext.jsx` | The error helper was exported next to components | Moved to `authErrors.js` |
| verify_past_trip could not find its fixture | The harness reads `scripts/fixtures` relative to the working folder | Fixtures copied into the scratch run folder (not the repo) |

## What is still open

The register rows below carry the same items. Not built, with a reason: the shared element from a trip card into the planner (T400-a, the trip planner's header) and the record map in the ink ramp (T400-b, `src/map/TripMap.jsx`) are other surfaces' files; the design lint baseline prune (T400-f) edits `scripts/ci/design-lint.baseline.json`, which no surface owns. The admin Site tab's one primary needs ConfigManager's layout reworked (T410-i). The focal trip card's actions still sit behind the bottom nav on a 664 px iPhone while the install hint is up (T410-h). Outside this surface and seen in the runs: verify_keyboard reads 16 of 20, the four failures being `button.guide-booked-none` on the trip planner and `button.tl-btn` on the journey page at both widths, each with no focus ring (T410-e); the shell's Explore bar keeps a visible h1 under the account pages (T410-c); the date field trigger is 28 px on a phone (T410-f); the chat half of 21-chat-passes.css still has 8 hover rules outside `(hover: hover)` and two literal transitions (T410-d, which also holds the dead `.account-pass-upsell` rules, T390-h); the design lint's two new hex literals sit in `destinationPdf.js` (T410-g); verify_admin_panel failed in two of eight runs after its update (one on a delete-then-search timing race that is now waited for, one whose log was overwritten before it was read) and passed the last two back to back; it should be run twice more on a quiet machine (T410-j). The 7 new strings in de, es, fr, it and nl were written by this session and need a native read (T410-b); what only a real phone can prove is T410-a.

## Rollback procedure

In the app repo: `git revert` the six T410 commits on the merged branch in reverse order (or drop the branch before merge). In the root repo: revert the report commit, `d9670027d` and `e1eb531a5`. No data, schema, migration or stored key changed. The two deleted blocks in 24-destination-workspace.css are restored by the revert, and the v6 file loses the rules that replaced them in the same revert.
