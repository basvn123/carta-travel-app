# T390: V3 structure, information and flow for My trips, account, sharing, passes, guides and admin

## Task ID

T390 (design wave V3, session 10 of 10; surface key `account`). Branch `p10-v6-build-account` in both repos.

## Date

2026-10-08

## What changed

My trips now names itself and opens on the trip ahead. The panel carries a visible "My trips" h1 in the display face (it was a screen-reader-only heading under a desktop rail labelled "Saved trips"), the dead letter-x close is gone, the tabs read Planned, Favorites, Visited in that order, and a returning traveller lands on Planned whenever an upcoming plan exists instead of whatever tab was last open. Counts are the house count chip (mono, ink on `--paper-dim`) instead of an accent pill, the Day plans empty state asks with a secondary so each tab has one primary, and both "Browse the map" buttons now go to Destinations (one went to Explore). Every saved place, shortlisted destination, planned trip and day plan can carry one figure: the day cost per person at the traveller's Lifestyle, read from the same `computeCosts()` map and set with the same `eurDay()` formatter as the Explore card, "From" the cheapest town on a multi-town plan, with the word "national" when the bed or food figure is a country stand-in. The figure arrives through a new optional `costs` prop; App.jsx is the shell's file, so until shell passes `costs={exploreIndices}` the line renders nothing (row T390-a). With the prop patched in locally (not committed) the Favorites tab read "€79 a day", "€69 a day", "€100 a day national" and the Lisbon and Porto plan read "From €69 a day".

Sharing is one tap from the card. A secondary "Share" button sits beside "Plan its days" on every own trip plan when signed in (it was the second item of a 32 px menu), and the share panel reads in the order a traveller hands a plan on: what the link shows, how long it works, Make a link, the links that work, who may edit, who sees it in Carta. Publishing to the public guides ("Anyone") and withdrawing a link each ask once in place, the safe answer first and focused, Escape keeps; the publish button is `--ink-fill` and the withdraw button `--danger`. Every other erasing control on My trips is `--danger` now (the confirm button and the menu's Remove were accent). The past-trip form is two steps: where and when, then one "Add details" secondary that opens the six folds; while the record is empty its invitation is the only way in.

The account hub reads in the traveller's order: profile or sign in, "Your trip settings" (the Lifestyle row, its value in `--ink-soft` instead of accent), Language, Your pass (one status line and "See passes", with a still placeholder until the balance is known), the invitation, then the phone's account rows and help. The old Profile spoke held five jobs and two accent primaries; it is three spokes now, Profile details, Sign-in and security, Your data, one primary each. Friends has a row on the phone hub (its only phone door was a 38 px icon in the top bar). "Data sources" is "Where the numbers come from", and the feedback button says "Send" because the message is written to the inbox and email is only the fallback.

The pass modal states its limits as numbers and a period ("60 Carta bot day plans in 30 days", "40 live web searches for events and openings"), prints the three prices in mono through `formatPrice` (Free is "€0.00", was "€0" in Fraunces), names each buy button by its pass for a screen reader, closes with CloseIcon, and on a phone puts the recommended Trip Pass first so its button is inside the first screen (bottom at 611 px of 664 on an iPhone 13). Two wrong figures are fixed (row T379-e): the Year Pass line said "Costs the same as 2 Trip Passes" for €14.99 against 2 x €6.99 = €13.98; `yearPassTripsEquivalent()` in `src/lib/pricing.js` now returns floor plus one and the line reads "Costs less than 3 Trip Passes" (1499 / 699 = 2.14, from TIERS). `account.faq13A` said the free plans come "a month"; TIERS.free is 2 plans with `periodDays: null` (migration 021), so all six catalogues now say "for the life of the account".

The sign-in modal and the reset screen use the account's own password field, extracted to `src/auth/PasswordField.jsx` (reveal toggle, no eight-dot placeholder that read as filled in); the modal's submit is its one accent primary and its errors carry `role="alert"`. A guide that fails to load says so with Try again instead of "not published any more", a refused clipboard says so, and the upload dialog's signed-out state offers "Sign in" through App's existing door, which `usePaywall` now passes on as `signIn`. Two open rows aimed at this surface are done: a `journey` kind in the shortlist (`src/lib/favorites.js`, `src/hooks/useFavoriteItems.js`; row T387-b from the trips session) and the app language in the synced account settings (`src/hooks/useAccountSync.js`; row T379-d, whose premise was half wrong: origin, party, stay tier and Lifestyle already sync inside `choices`, only the language did not).

## Plan and method

The plan is `docs/design-v6/plans/V3-account.md`, committed before the first app edit. `impeccable context --target src/auth/SavedTripsPanel.jsx` ran from the root worktree and loaded PRODUCT.md and DESIGN.md. Shape was run unattended (owner instruction 2026-10-07): no question tool, no live mode; every place impeccable would have asked took the option that keeps Carta's palette, type and identity. The calls made that way: the tab order (Planned first, because the brief's job order puts the next trip first), "From" the cheapest town for a multi-town plan (the collection-card rule's "from the cheapest member", since no house rule covers a saved multi-town plan), the journey kind's label "Trip weeks" (`fav.*` is the trips surface's prefix, so it lives under `saved.favKindJourney`), and the Year Pass wording "Costs less than 3 Trip Passes" (the brief offered it or "€1.01 more than 2 Trip Passes"; the first is a whole-number claim that stays true for any prices).

## Files touched

Root repo (branch `p10-v6-build-account`):

**Created:**
- docs/design-v6/plans/V3-account.md
- Execution/P10/T390-v6-v3-account.md

**Modified:**
- docs/design-v6/OWNERSHIP.md (row for `src/auth/PasswordField.jsx`)
- Execution/_OPEN.md (rows T390-a to T390-k; T379-d, T379-e, T379-f closed)

App repo (branch `p10-v6-build-account`):

**Created:**
- src/auth/PasswordField.jsx

**Modified:**
- src/auth/SavedTripsPanel.jsx, src/auth/TripSharePanel.jsx, src/auth/PastTripForm.jsx, src/auth/AccountPanel.jsx, src/auth/AuthModal.jsx, src/auth/ResetPasswordScreen.jsx
- src/components/PassModal.jsx, src/community/GuidesPanel.jsx, src/community/UploadForm.jsx
- src/hooks/usePaywall.jsx, src/hooks/useAccountSync.js, src/hooks/useFavoriteItems.js
- src/lib/pricing.js, src/lib/favorites.js
- src/styles/17-saved-trips.css (count chip, confirm and menu Remove in `--danger`, changed in place), src/styles/69-v6-account.css (every new rule)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (account prefixes only: `saved`, `share`, `account`, `pass`, `guides`, `upload`; 28 keys added, 8 changed, 4 removed per catalogue)
- scripts/verify_saved.mjs, verify_account_panel.mjs, verify_friends.mjs, verify_past_trip.mjs, verify_trip_share.mjs, verify_admin_panel.mjs (each changed assertion carries a comment saying why)

Removed keys, unused after the change: `pass.featPlansPaid`, `pass.featSearchOn`, `pass.featValue`, `account.passAdds`.

## Commands run

In the app worktree: `npm test`, `npm run lint`, `node scripts/ci/design-lint.mjs`, `npm run build` then `rm -rf dist dist-data`, `node scripts/check_ownership.mjs ../T390/docs/design-v6/OWNERSHIP.md`, the six-catalogue parse of session rule 8, `npx vite --port 5210 --strictPort` (stopped after each round). From `wt/_scratch/T390/run` (so harness screenshots stay outside both repos): `CARTA_PORT=5210 node <app>/scripts/verify_saved.mjs` and likewise `verify_account_panel`, `verify_friends`, `verify_past_trip`, `verify_trip_share`, `verify_guides`, `verify_admin_panel`; `CARTA_REPO_ROOT=<root worktree> node <app>/scripts/verify_paywall.mjs`; `node <app>/scripts/verify_keyboard.mjs --port 5210`; `node <app>/scripts/verify_quality_floor.mjs --port=5210`; the scratch phone walk `walk.mjs` (iPhone 13 WebKit, Pixel 5 and 360x740 Chromium, desktop 1280x800). `impeccable detect --json` over every changed src file.

## Config and secrets set

None committed. To let the harnesses sign in against stubs, the main checkout's `continent-app/.env` (the public anon configuration, gitignored) was copied into the app worktree for the run and deleted before the end. The app worktree's `node_modules` junction pointed at the private install `wt/_scratch/T384/nmfull/node_modules` during the run and was pointed back at the main checkout's before finishing.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Visible h1 on My trips | 0 (sr-only) | 1 ("My trips") | +1 |
| Names for the page (phone / desktop rail) | "My trips" / "Saved trips" | "My trips" / "My trips" (header label is shell's, row T390-b) | one name inside the page |
| Taps from a planned card to the share panel | 2 (menu, then Share) | 1 | -1 |
| Accent fills in view, My trips Planned `?savedmock` (iPhone, Pixel 5, 360, desktop) | 1 count pill (brief part 2) | 0 | -1 |
| Accent primaries on the old Profile spoke | 2 | 1 per spoke, 3 spokes | one primary each |
| Accent fills in view, sign-in modal | 0 (ink submit) | 1 (the submit) | the modal has its primary |
| Erasing controls drawn in accent on My trips | 2 (the confirm Remove, the menu's Remove) | 0 | -2 |
| Pass modal, Trip Pass button on the first phone screen (iPhone 13) | below the fold (brief part 2) | bottom at 611 of 664 px | inside |
| Wrong figures on the pass surfaces | 2 (Year Pass line, faq13A) | 0 | -2 |
| Controls under 44 px on the account hub, phone | 0 | 0 | 0 |
| Controls under 44 px, sign-in modal, phone | 7 to 8 (brief part 2) | 5 (Google 43, two inputs 40, reveal 40, Forgot 15) | V5 item |
| Sideways scroll, every walked view at 360, 390, 393 and 1280 px and in landscape | 0 | 0 | 0 |
| impeccable detect, changed files | 1 (false positive, `<img>` in a comment) | 0 | -1 |
| Design lint | 213 baselined, 0 new | 213 baselined, 0 new | 0 |
| Harnesses of this surface passing | verify_saved failed on one line; verify_past_trip failed on one line (a stale cover-photo read) | 8 of 8 | +2 |
| verify_keyboard | 20/20 | 20/20 | 0 |
| Quality floor, phone targets under 44 px on My trips and Account | 4 (2 screens x 2) | 0 | -4 |

The quality floor run before the last CSS rule read one h1, 0 contrast failures and one filled primary at most on every My trips and Account screen, and two phone targets under 44 px on My trips (the card's 32 px "More actions" and the moderation toggle at 34 px); a `pointer: coarse` rule now lifts both to `--tap`. The final run, after that rule, reads 0 phone targets under 44 px, 0 contrast failures and exactly one h1 on all four My trips and Account screens (saved, saved-open, account, account-open); the app-wide phone-target count fell from 12 to 8, and those 8 and the 32 contrast failures are on other surfaces (the destination page's selects and inputs), so the run still exits 1 for reasons this surface does not own. Desktop targets (reported, not failing, until the owner rules on T335-b) read 2 on My trips (the 36 px rail tabs) and 8 on Account (the rail rows), the V5 touch-target item.

## Phone checks (T414)

iPhone 13 (WebKit), Pixel 5 and 360x740 (Chromium, mobile and touch), desktop 1280x800. Landscape (844x390 and the Pixel's 851x393): no sideways scroll on My trips; the tiles and the h1 hold one row. Tap only: nothing on the changed controls depends on hover (new hover rules sit inside `@media (hover: hover)`); the Share button, the asks, "Add details" and the secondary empty CTA are at `--tap`. On-screen keyboard (viewport cut by 40 percent): in the sign-in modal the focused email field and the submit stay visible on all three phones (submit bottom 190 of 398 px on the iPhone); in the past-trip form the bottom nav stays drawn over the lower screen while the field has focus, which is the shell's rule to implement (row T390-d). Safe areas and dvh: this wave adds no fixed or full-height layout, so no new `100vh` and no new inset; the full-screen record map and the panels keep the shell's insets. Thumb reach: on a phone the next trip's "Plan its days" and Share sit in the lower half of the first screen with the install hint shown; without it they move up. Swipe: nothing new depends on one. What only a real phone can prove is row T390-j.

## Screenshots

Nine "after" shots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\account\`, JPEG 80, viewport only, never committed: V3-mytrips-planned-iphone, V3-mytrips-planned-android, V3-mytrips-planned-desktop, V3-mytrips-visited-iphone, V3-account-hub-iphone, V3-account-hub-desktop, V3-signin-iphone, V3-passes-iphone, V3-passes-desktop. V1 saved its "before" set at 380 and 1280 under V1 names; V4 and V5 reuse these V3 view names.

## carta-design's seven questions

1. Hex outside `:root`: none; every new rule reads a token.
2. Gradients, colours outside DESIGN.md, a second saturated hue: none added. The two card gradients on My trips are still there; they are V4's (caption band).
3. Ochre, teal, `--danger`: `--danger` now marks only erasing (confirm Remove, menu Remove, Withdraw); publishing is `--ink-fill`; no ochre or teal touched.
4. Mono: prices, the day cost and the counts are mono with tabular figures; the words around them ("a day", "national", "From") are the UI face. The pass card's balance line stays a sentence in the UI face.
5. More than one primary in a view: walked at four sizes, at most one accent fill in view on every My trips tab, the account hub, the sign-in modal and the pass modal. "Continue with Google" and the gate's "Create an account" were kept off the new accent rule on purpose.
6. Headlines and words: "My trips", "Your trip settings", "Where the numbers come from", "Add details", "Show this trip in the public guides?"; no em dash or banned word in any added string (checked by grep on the diff).
7. Remove one thing: the hub's pass upsell (three ticks, a price and a sentence) went; the modal already says it in the same numbers.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| "Continue with Google" turned accent in the sign-in modal | `GoogleButton` carries the `auth-submit` class, so the new `.auth-modal .auth-submit` rule hit it | The rule excludes `.auth-google` and `.auth-submit-ghost` |
| The cost line read "€100 a daynational" to a screen reader | The pedigree word was separated by a margin, not a space | A real space before the word |
| verify_past_trip failed "the card did not take your own photo" on every run | It read a background-image from `.uptrip-photo`'s style; the cover has been an img element for some time | It reads the img's src now, with a comment |
| Four harnesses clicked the old controls | Tab order, Share out of the menu, the Profile split, the label "Data sources" | Assertions updated by label, each with a comment |
| Whole-file line-ending diffs while editing | The worktree mixes LF and CRLF blobs under `core.autocrlf=true` | Every file restored to its blob's ending before commit; the commit diff is the real change only |

## What is still open

The figure on saved cards and the friends' one line are built but dormant until App.jsx passes two props; App.jsx is the shell's file (row T390-a). The desktop header still says "Saved trips" (`nav.saved` is the shell's key), and signing in from My trips still closes My trips first (App.jsx), both shell hand-offs (row T390-b). A starred journey now shows in the shortlist but opening it needs a `journey` case in App's `openFeature` (row T390-c). The bottom nav does not hide while an input in the past-trip form has focus (row T390-d).

The house undo rule (remove at once, "Undo" for six seconds in the bottom slot) needs the shell's bottom slot, which T381 builds in this wave; until it lands, star, day-plan and saved-trip removal keep the inline Keep or Remove, now in `--danger` (row T390-e). "Alongside your friends" and the friends' shelf belong in the Friends spoke, but the ledger needs the record's counts, which only SavedTripsPanel computes; moving it means sharing that computation, which is V4 work, and the memory card's duplicate "See this trip" footer and the memory view's duplicate edit go with it (row T390-f). The hub's read-only rows for the home airport and group size need App to pass `choices` to AccountPanel (row T390-g). The pass upsell's old rules in `21-chat-passes.css` are dead now; that file is not this surface's, so they stay for its owner or V6 (row T390-h). The "national" word has no InfoDot because the figure sits inside a card button where a second button cannot go; one text key at the Favorites list head would carry it, V4 (row T390-i).

The new strings in de, es, fr, it and nl were written by this session and need a native read (row T390-k). What only a real phone can prove is row T390-j. T387-b (the journey kind) is done here but lands in the register with the trips session; mark it closed by T390 when both are merged. T379-c (store the price at save time to show "what changed") stays the owner's.

## Rollback procedure

In the app repo: `git revert ae4a705 76c1c23` on the merged branch (or drop the branch before merge). In the root repo: revert the three T390 commits (plan, OWNERSHIP row, report and register). No data, schema or migration was touched, and no key a stored object depends on changed: favourites keep their `kind:id` format (on a rolled-back build a stored `journey:` key falls through to the destination reading in `readFavToken` and shows as one "no longer found" row, the existing behaviour for an unknown token; unstarring it clears it), and the synced settings gain one optional `lang` field that an older build ignores.
