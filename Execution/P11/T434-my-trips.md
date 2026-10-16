# T434: My trips, rebuilt

## Task ID

T434 (P11), first of three tasks the owner asked for on 2026-10-16. The other two are T460 (pass and billing) and T461 (account and help). Branch `p11-my-trips` in both repos.

## Date

2026-10-16

## What changed

The owner wanted My trips to be top tier against Wanderlog, Polarsteps and Airbnb Trips: compact and clean, with human copy, aligned with the tabs around it, and actually useful. My trips was the last surface still in the look from before Lagoon. The critique scored it 22/40 and the audit 10/20.

**What a traveller sees now.** Three sections that work like Destinations' sections: tiles in the side panel on desktop, and tiles under the title on a phone.

**Trips.**
- The next trip is one focal card with:
  - a photo, with nothing written on it;
  - a countdown chip and flags;
  - the cities, and the dates written "Fri 6 Nov to Thu 12 Nov, 6 nights".
- Four facts sit under it:
  - **Trip cost.** The party's total, priced by the same `priceTrip()` the Trip planner uses, with the estimate mark: "~€1,343 est. for 2". Before, the card showed a town's day rate with no mark.
  - **Weather.** A live forecast within a week of leaving, otherwise the month's usual high from the climate normals.
  - **Days planned.** "2 of 6", with a thin ink bar.
  - **Who is going.**
- One primary, "Open trip", with "Plan days" and "Invite" beside it.
- Later trips, drafts and day plans are compact kit rows with their price. The Day plans heading only appears when there are day plans.
- Signed out, the empty tab says "No trips yet" with "Plan a trip" and "Sign in". The captions the owner flagged are gone.

**Shortlist.**
- One list of compact rows. Before, there were two lists in two layouts.
- Each row is priced exactly as Explore prices it (Explore's own `DayPrice` and `SaveButton`).
- A type filter and a Newest | Cheapest order. On desktop they sit in the side panel, which is what the owner meant by aligning the filter pane; on a phone they are a refine row.
- New: "Plan a trip in Portugal" seeds the trip wizard with the country holding the most starred places.

**Visited.**
- The record map comes first: a third of a phone screen, still until it is opened, and it no longer asks for Ctrl to zoom.
- One band of figures: countries, cities, trips, nights away.
- The countries as flags, with a new "Edit" sheet to mark countries by hand (Polarsteps' scratch map). The list is kept on the device and synced through the account settings.
- A year filter, and the trips grouped by year.
- The "Alongside your friends" table left; Friends gets it in T461.

**Plan together (new).**
- The share panel under a trip now opens with "Plan together". "Copy invite link" makes a 7-day link. Whoever opens it signed in joins as a co-planner and becomes the owner's friend in one step, the way Wanderlog adds tripmates.
- Before, the person had to be a friend first. Migration 052 holds the links.
- The panel's three parts (plan together, a view-only link, who sees it in Carta) are on the kit's Segmented and Buttons.

**Guides.** The overlay is now a real dialog: role, focus trap, h1. It is on the kit, and its lede caption is gone.

**Under the hood.**
- `lib/myTrips.js`: upcoming and past, the countdown, the visited record and the trip price. It is pure and tested, so other screens can ask "which trip is next".
- The page is its own lazy chunk with its own stylesheet, and about 1,600 lines of old CSS are gone.
- Two audit P1 performance faults are fixed:
  - the record map was re-pinned on every render;
  - browser storage was parsed during render.

## Files touched

**App, created:**
- continent-app/src/auth/mytrips/parts.jsx (menu, undo toast, record map dialog, trip price, faces, crew bar)
- continent-app/src/auth/mytrips/TripCards.jsx (the focal card and the trip row)
- continent-app/src/auth/mytrips/MyTripsTabs.jsx (Trips, Shortlist, Visited, the filters, the countries sheet)
- continent-app/src/lib/myTrips.js
- continent-app/src/lib/visitedCountries.js
- continent-app/src/styles/70-mytrips.css (lazy, imported by SavedTripsPanel)
- continent-app/tests/myTrips.test.mjs (6 tests; 437 to 443 in all)

**App, modified:**
- continent-app/src/auth/SavedTripsPanel.jsx (rewritten as state, data and view models: 2,137 to 903 lines)
- continent-app/src/auth/TripSharePanel.jsx (Plan together with invite links, on the kit)
- continent-app/src/auth/coplanners.js (invite-link calls, the #coplan= hash)
- continent-app/src/auth/tripPlanStorage.js (reads the first stop's `choices`, so a trip can be priced)
- continent-app/src/hooks/useAccountSync.js (syncs the hand-marked countries)
- continent-app/src/community/GuidesPanel.jsx (dialog, kit)
- continent-app/src/App.jsx:
  - My trips is lazy;
  - an invite link is accepted, with a sign-in round trip;
  - stayTier, lifestyle and the trip seed are passed to My trips.
- continent-app/src/styles/17-saved-trips.css, 23-places-pages.css, 24-destination-workspace.css, 25-feature-pages.css, 26-shortlist-extras.css, 69-v6-account.css (dead My trips selectors pruned; the guides dialog rules)
- continent-app/src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (62 keys added, 6 updated)
- continent-app/scripts/verify_saved.mjs (rewritten for the new surface), verify_past_trip.mjs, verify_friends.mjs (selectors)

**Root, created:**
- supabase/migrations/052_coplan_links.sql
- supabase/diagnostics/052_coplan_links_test.sql
- Execution/P11/T434-my-trips.md
- Execution/P11/T434-critique/ (before.md and after.md; assessments A and B, before and after; audit-before.md and audit-after.md)
- Execution/P11/T434-shots/ (before and after, 360, 390, 820 and 1440 px, English and German)

**Root, modified:** Execution/_OPEN.md, and the continent-app mirror of the files above.

## Commands run

```
git -C continent-app checkout -b p11-my-trips ; git checkout -b p11-my-trips
impeccable context ; impeccable detect --json <files> (sub-agent B, before and after)
node <scratchpad>/shoot_t434.mjs --label=before --narrow=1   (from a worktree of 05c36df on port 4270)
node <scratchpad>/shoot_t434.mjs --label=after --narrow=1 ; --lang=de
initdb + pg_ctl on 55433 (throwaway) ; psql -f supabase/diagnostics/052_coplan_links_test.sql
python <scratchpad>/i18n_keys.py keys_t434.json src/i18n
python <scratchpad>/css_prune.py dead2.txt <the seven stylesheets>
npm test ; node scripts/ci/design-lint.mjs ; node scripts/ci/banned-terms.mjs ; node scripts/ci/token-contrast.mjs ; npx vite build
node scripts/verify_saved.mjs ; verify_trip_share ; verify_past_trip ; verify_guides   (all pass)
node scripts/verify_friends.mjs   (stops at .header-friends-btn, removed by T426; row T434-h)
node scripts/ci/design-lint.mjs --update-baseline
```

## Config and secrets set

None. Migration 052 is the owner's paste (row T434-a).

## Before/after measurements

The before frames were taken from a clean worktree of app HEAD 05c36df on its own port, so they never saw the new code. Both runs scope the measures to the My trips page; the Explore tab stays mounted behind it.

| Metric | Before | After | Delta |
|---|---|---|---|
| Words in the first phone screen, Trips (390x844) | 72 | 50 | -22 |
| Words in the first phone screen, Shortlist | 70 | 31 | -39 |
| Words in the first phone screen, Visited | 62 | 32 | -30 |
| Words on the empty first visit (phone) | 45 | 13 | -32 |
| Primary buttons on Trips (phone, with trips) | 0 | 1 ("Open trip") | +1 |
| What a planned trip's figure is | a town's day rate, no estimate mark | the trip's total for the party, `~ est.` | matches the Trip planner |
| Raw buttons (meter): SavedTripsPanel, TripSharePanel, GuidesPanel | 24, 12, 8 | 0, 0, 0 (plus 0 in the three new files) | -44 |
| 17-saved-trips.css, font-size, radius and legacy-token literals | 125, 72, 366 | 86, 42, 235 | -39, -30, -131 |
| 69-v6-account.css, same three | 26, 14, 86 | 13, 8, 56 | -13, -6, -30 |
| Stylesheet lines (17, 69, 23, 25, 26) | 10,259 | 8,769 | -1,490 |
| My trips JS and CSS in the first-paint bundle | yes | no (own chunk: SavedTripsPanel-*.js and .css) | lazy |
| Tap targets under 44 px on touch (iPad tabs) | 3 tiles at 36 px | 0 | -3 |
| Text under 11 px on the page | tab labels 10.5, counts 10, country names 10 | none (verify_saved check) | fixed |
| design-lint violations | 8,499 (T459 baseline) | 8,125 | -374 |
| Tests | 437 | 443 | +6 |
| Critique (Nielsen, /40) | 22 | 28 (then one fix batch, below) | +6 |
| Audit (/20) | 10 | 15 | +5 |
| Audit issues P1, P2, P3 | 9, 14, 6 | 1, 7, 5 | -8, -7, -1 |
| First-paint bundle (audit B) | My trips inside | JS 91,871 B and CSS 28,885 B smaller | lazy chunk |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first "before" desktop and iPad frames showed the half-built new page | The dev server reloaded while the rewrite landed mid-shoot | Re-shot every before frame from a worktree of 05c36df on port 4270, with its data and modules junctioned |
| The CSS pruner's first run dropped a live mobile @media block in 24-destination-workspace.css | The emptiness test let one comment pattern match across real rules | Restored every stylesheet from the copy taken first; the test now stops at the first `*/`; re-ran and checked the removed selectors one by one |
| Row photos were broken images | The rows asked Wikimedia for a 240 px thumbnail, which is not on its allowed list | 330 px (allowed, `WIKI_WIDTHS`) |
| The record map was a blank box | `TripMap`'s root is a plain div; the new frame did not stretch it | `.mt-map > div` fills the frame |
| The countries sheet's "Done" was off screen on desktop | The sheet was anchored to its button as a popover, with 43 chips | A centred sheet, with the chip grid scrolling inside it |
| design-lint found 7 new violations | Raw buttons in the menu, the toast close and the photo; a euro sign in a comment | Kit Buttons and IconButton; the photo and the map shield became non-interactive elements, because "Open trip" and the expand button are the real controls |
| The banned word "just" in "Just you" | Copy | "Only you" |
| verify_past_trip and verify_friends timed out | Old selectors (`.saved-tab`, `.uptrip-card`, `.uptrip-share`) | Updated to the tiles, rows and the Invite button. The co-planner line says again that a co-planner cannot delete the trip, which the harness rightly asks for |
| German section names broke mid-word in the side panel at 820 px | Three tiles abreast in a 216 px panel | The side panel shows the sections as full-width rows; the selected one keeps the brown edge and tint |
| The focal card's buttons were 40 px on an iPad | A fine-pointer size applied from 769 px | Removed; the kit's 44 px holds |
| After critique: "for 2" beside "Only you"; "0 of 6" days for a seven-day trip | "Going" read the device crew, the price read the stored party; days counted nights | "Going" reads the priced party; days are nights plus one |
| After critique: every "Copy invite link" minted a new link; joining made friends unsaid | Create on every tap; no copy | The live link is reused; one line says anyone with it can join and that joining makes you friends |
| After critique: German country names in English; the German price overflowed its cell | Catalogue names printed as is; nowrap on the price | `Intl.DisplayNames` through `countryName()`; the price may wrap |
| After critique: side tiles ignored the arrow keys | The tile group was declared three columns, drawn as one | One column declared; the phone row keeps three by CSS |
| After audit: h1 jumped to h3; the card menu stayed open after Tab; the guide map re-framed on every copy; old `.tshare` borders leaked in | | A section h2 for screen readers; close on blur; one padding object; the new panel resets margin and border |

## What is still open

Each item is one row in `Execution/_OPEN.md`.

- **T434-a (user).** Paste `supabase/migrations/052_coplan_links.sql` after 046, then run `node scripts/verify_live_policies.mjs`. Until then "Copy invite link" hides itself, and an opened link says it no longer works.
- **T434-b (next task).** `PastTripForm.jsx` is still on raw buttons (20) and controls of 22 to 35 px. Its photos sit in browser storage, and a full storage fails quietly (audit P1-3). It needs its own pass: the plan named it "kit only", but the form is 826 lines and was not reached.
- **T434-c (next task).** The record map paints visited countries in a brown tint, from `TripMap`'s record basemap. carta-design asks for the ink ramp there. The fix is in `map/TripMap.jsx`, outside this task.
- **T434-d (next task).** My trips has no URL and adds no history entry, so a phone's Back leaves it (audit P2). The tabs could carry `#trips=`, `#shortlist=` or `#visited=` through App's hash router.
- **T434-e (next task).** "Plan a trip in {country}" seeds the wizard with a country only. Seeding the exact starred places needs a `seed.destIds` path in `GuidedTripWizard.jsx`.
- **T434-f (user).** Native review of the 62 new and 6 changed strings in nl, de, fr, es and it.
- **T434-h (next task).** `verify_friends.mjs` stops at its second step. It clicks `.header-friends-btn`, the header Friends button T426 removed, so this predates T434 and never reaches My trips. The My trips steps in it are updated to the new markup. T461 owns the Friends page and will repair the entry.
- **T434-g (user).** A real-phone pass:
  - the focal card;
  - the invite link handed through the phone's share sheet;
  - the countries sheet;
  - the still map that opens full size on a tap.

## Carta-design: the seven questions

1. **Hex values.** No hex outside the tokens: design-lint reports 0 new; token-contrast reports 0 pairs under the floor.
2. **Colour.** No gradient and no new colour. The only brown is the one primary, the selected section's edge and tint, and the selected chips.
3. **Selection.** Selected states are the tint plus a mark: the tile's edge (and tick on a phone), the chip's tick, the Segmented thumb.
4. **Figures.** No figure is under 12 px. Every price goes through `<Money>`, with the estimate mark. The trip cost is a receipt figure in whole euros on a card, as card rules ask.
5. **One primary, no text on photos.** One primary per view: "Open trip", "Plan a trip in …" or "Plan a trip". No text on a photograph.
6. **Copy.** The headlines are plain section names or verbs. The retired captions are gone (sign-in sentence, day plans sentence, the friends "not a ranking" line, the guides lede, "national"). There are no dashes, middots or banned words; banned-terms passes.
7. **What else could go.** The day plans heading when empty, the friends table, the two-list shortlist, the old tile row's counts in mono, and 1,490 lines of CSS.

## Rollback procedure

- **App repo:** `git -C continent-app revert -m 1 <the T434 merge on master>`.
- **Root repo:** `git revert -m 1 <the T434 merge on main>`, then `git push origin main`.
- **Migration 052:** if it was pasted, run the DOWN block in its header. Co-planners and friendships made through links stay as ordinary rows of 011 and 020.
- **Data:** no other data changed.
  - Saved trips, day plans and the shortlist keep their shapes.
  - `carta.visitedCountries.v1` and the `visitedCountries` settings key are additive; older builds ignore them.
