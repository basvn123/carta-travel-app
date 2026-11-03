# Batch R4: rating v5 on every screen (T763 to T766)

You are running unattended, started by `Execution/_queue/chain_rating_r4.ps1` once Batch R3's
report was committed. Nobody can answer a question. Never stop to ask: make the conservative
call, write it down under that task's "What is still open" with a register row for the owner,
and keep going. Only the R3 guard in step 1 below may stop the batch.

Read the plan first: `Roadmap/2.10b-rating-v5.md` (Carta rating v5), sections "Layer 1",
"Layer 2", "Layer 3", "Where it lands in the app", "Robustness" and "Execution plan", Batch
R4. If that file is not in the repo (register row T754-f), read the Claude Doc at
https://claude.ai/artifact/L6NrpP7jqSWHqQQqg8pPcm instead. All nine owner decisions are taken
(Owner decisions table).

This batch moves the app onto the v5 data that R1 to R3 put in the wire:
- one rating word set
- the taste profile and its questions
- the "% match" in Explore
- the same match in the planner and Ask Carta

## Every task in this batch
- Read `PRODUCT.md` and `DESIGN.md` before the first screen change. Load the carta-design
  skill and run /impeccable on every screen a task touches. Answer the seven carta-design
  questions per task in the report.
- carta-design wins over every other source. If it does not cover a case:
  - use the nearest pattern already in the app (same component, same tokens)
  - add a register row, owner `user`, that names the call you made
  - never invent a new token, colour or font
- No em dashes in any file or string. Where data is missing, use the NotYet slot, never a
  made-up number.
- Every new string goes in all six languages (en, nl, de, fr, es, it). Never read
  `src/i18n/en.js`, `styles.css` or a wire file whole: search, then read only the lines you
  need.
- Checks per task are static only: lint the touched files, `npm test`, and the fast
  NOPUBLIC build when the task promises a number. The browser round runs once, at the end.

## Before you start
1. R3 guard. Find the R3 report with `git log --all -- "Execution/P7/*rating-v5-profile*.md"`
   and read it.
   - The batch stops if any of these is true:
     - the R3 report says the wire is not at schema v19
     - the report says `taste` or `rating.band` is missing
     - `git show <R3 branch>:continent-app/public/app_data.json` has no `rating.band`
       (search with `git grep`, never read the file whole)
   - If the batch stops, write only `Execution/P7/T763-T766-rating-v5-screens.md` saying
     "Not started: R3 incomplete" and why. Add one register row, owner `user`, and commit
     both on a branch `p7-rating-v5-screens`.
2. Branches and the batch rules.
   - Read the "What is still open" sections of all three rating reports, T754 to T762, and
     their `open` rows in `Execution/_OPEN.md`. This batch takes T754-c, T755-b and
     T759-c, plus any R3 row whose Order points at T763 to T766.
   - Follow CLAUDE.md's batch rules.
   - Check task numbers first: `git log --all`, every worktree's `Execution/`,
     `wt/vite.t*.mjs`, ListAgents. If T763 to T766 are taken, count up from the highest
     number and use the new numbers everywhere.
   - Make new worktrees for branch `p7-rating-v5-screens` in both repos, from the R3
     branch (`p7-rating-v5-profile`). If R1 to R3 are already merged, branch from `main`
     and `master` instead.
   - Never `git stash`. Stage files by name, never `git add -A`, `git add .` or
     `git commit -a`.
   - Commit the `continent-app/` work in the app repo; the root mirror alone is not enough.
3. Baseline, measured once before any change:
   - Fast NOPUBLIC build: main JS chunk sizes, raw and gzip, and `app_data.json` raw and
     gzip.
   - Count the rating words in use: grep `continent-app/src` for "Worth a", "Highly rated",
     the five band words and `tier >=` style checks, per file.
   - For 20 fixed places (5 metros, 5 villages, 5 areas, 5 nature items), what each screen
     shows today: Explore card, destination page, PDF, trip page, planner.

## T763: one rating in the app
Files:
- `lib/rating.js`, `components/RatingBadge.jsx`, `lib/tripGuide.js`,
  `browse/RatingBreakdown.jsx`
- `browse/ExploreFilterRail.jsx`, `hooks/useExploreCatalog.js`, `lib/placeOverview.js`
- `lib/trailCards.js`, `beachStory.js`, `lakeStory.js`, `mountainStory.js`,
  `cycleStory.js`
- `planner/dayDraft.js` (labels only), `lib/destinationPdf.js`, `TripPage.jsx`
- delete `components/GemRating.jsx`
- the i18n files

Grep for every other reader of `tier`, `components`, `rate`, `confModelled` and
`confProvisional`, and list them in the report.

1. `lib/rating.js` is the only place that turns a score into words.
   - It reads the cutoffs from `config/rating.json`: 9.0 Exceptional, 8.3 Excellent,
     7.6 Very good, 6.9 Good, 6.0 Pleasant, nothing under 6.0.
   - Every screen calls it. The score always shows with one decimal next to its word.
2. One word set. Remove "Worth a visit / detour / journey" (`tripGuide.js`) and
   "Highly rated". Delete `GemRating.jsx` and the key `rating.hiddenGemsOnly` once grep
   shows no reader.
3. Class rank line from `rating.class_rank`, for example "Top 2% of villages in Europe",
   shown only for the top 10% of a class.
4. RatingBreakdown (closes T759-c):
   - Show the score, the word, the class rank and the reason sentence `rating.why` in the
     UI language (the lazy language file R3 chose, falling back to en).
   - Show "Measured" for `curated` and `rubric` confidence, and "Estimated" for
     `estimated`.
   - Show the four parts with the weights read from config, never written in the text
     (no "70%").
   - Remove the v4 tier marks and the unused confidence strings.
5. Nature pages and lists:
   - The same badge everywhere.
   - The rank line in words: "Best walk in Flanders", "#2 of 41 lakes in Carinthia".
   - The facts row: difficulty, water quality, climb and the other facts R3 filled. A
     null fact is left out. An unscored item shows NotYet in place of the badge.
6. POIs:
   - Must-see, Recommended and Worth a look, with no number, in the day planner, on the
     destination page and in the PDF.
   - Do not touch the order yet (T766).
7. Explore rating filter by band: Good and up, Very good and up, Excellent and up. The
   default stays "any". Sort by quality reads `rating.score`.
8. Gateways (closes T755-b):
   - Airport rows never show as a place: not in Explore, not in pins, not in Ask, not in
     the planner's choose step.
   - `#dest=CIA` and every gateway id open their city.
9. When grep shows no reader left, stop shipping the old wire keys (`tier`, the old
   `components` names, `rate`, the old confidence words). Bump the contract test, and
   measure the wire before and after.
10. Write `scripts/verify_rating_words.mjs`, a DOM check (no screenshots). For the 20
    baseline places it reads the word on each screen.
11. Done when:
    - every screen shows the same word for the same place, for all 20
    - no file outside `lib/rating.js` maps a score to a word
    - T754-c and T759-c are closed

## T764: taste profile and onboarding
Files:
- new `lib/taste.js`, `browse/StartDialog.jsx`, new `browse/TasteSheet.jsx`
- the Explore header component (grep for the header chips)
- the account panel's Lifestyle row file
- `lib/urlState.js`, `hooks/useAccountSync.js`, the planner's `g:likes` and Who screens
  (reused, not copied)
- the i18n files

1. `choices.taste` is
   `{party, likes[] (up to 3, from LIKES), size, quiet, lifestyle, noCar, asked: {}}`.
   - Every question has "No preference", which means weight 0.
   - `lib/taste.js` holds reading, writing and merging. It is pure and unit-tested.
2. Persistence:
   - Local through `lib/urlState.js`, and `user_settings.settings` through
     `useAccountSync.js` when signed in.
   - On sign-in, a local taste the account does not have is kept, and the account wins
     key by key.
   - Check that the GDPR export already includes it (grep the export), and say so.
3. Explore start dialog:
   - A "Tell Carta what you like" path of four screens: Who usually comes, What do you go
     for (up to 3, with photos), Where do you like to stay (size, and lively or quiet),
     How do you travel (Lifestyle, no car).
   - Build them from the planner's existing likes and Who components. Skip is one tap on
     every screen.
   - Phone first. Measure the taps and the time to finish with the fewest taps, as a
     number in the report.
4. Everywhere after:
   - One chip in the Explore header, "For you: hiking, villages, quiet", that opens the
     same four questions as a sheet.
   - A "Your travel style" row beside Lifestyle in Account.
   - With no taste set, the chip reads "Tell Carta what you like".
5. Learning, only with consent:
   - When five saved places share a facet the traveller did not pick, ask once:
     "You save a lot of lake places. Add lakes to your style?"
   - Store the answer in `asked`, so a no is never asked again.
6. Done when:
   - a new visitor sets a taste in under 30 seconds, or skips in one tap
   - the taste survives a reload
   - the sign-in merge passes its unit tests. If a real sign-in cannot run unattended, say
     so and add a row for the owner to try it once.

## T765: match in Explore
Files:
- new `lib/match.js`, new `tests` for it in the app's test folder
- `hooks/useExploreCatalog.js`, `browse/ExploreTab.jsx`, `browse/ExploreFilterRail.jsx`
- the card and pin components (grep for where RatingBadge is drawn)
- `lib/placeOverview.js`, the destination page, new `browse/WhyItMatches.jsx`
- new `tests/personas_v5.json`, new `reports/persona_check_v5.md`
- `config/rating.json` (lambda and the conflict factors only)

1. `lib/match.js`, pure:
   - `fit(taste, profile, month)` returns `{F, pct, bars[], conflicts[], top}`.
   - F = sum of w_k times p_k, divided by the sum of w_k, times the product of the
     conflict factors c_j.
   - w is 1 per chosen like, and 0.5 each for size and quiet.
   - The conflicts:
     - busy in the chosen month for a quiet traveller
     - car needed for a no-car traveller
     - over 30 degrees in that month for someone avoiding heat
     Each factor sits between 0.6 and 1, set in config.
   - `forYou(place, taste, month)` = Q + lambda (F minus 0.5), with lambda 2 from config.
     Q is the month score when a month is set.
   - An empty taste returns null, so the screens behave exactly as today.
2. What it shows (the plan's "How it reads"):
   - The match shows from 55% up and never below.
   - Cards and pins: "8.9 Exceptional · 86% match" and the strongest reason
     ("86% match: hiking, quiet village"). The score and the match never merge into one
     number.
   - The overview and the destination page get "Why it matches you": one bar per pick,
     each with its fact line from the profile's fact, and every conflict on its own line.
     The bars are p, so they always agree with the percentage.
   - When a taste exists, the default sort is "For you". The first rail is "Picked for
     you", with its reason. The other rails keep their rule but sort by fit.
   - A "Strong match" toggle shows 70% and up. Hard needs (kids under 3, no car, a budget
     ceiling) stay filters the traveller sets. Fit never hides a place by itself.
3. Nature lists use the facts: a family sees easy loops first, and a hiker who picked
   hiking sees the Hard ridge first. POIs get no match number.
4. Persona gate 7:
   - `tests/personas_v5.json` holds the 12 travellers named in the plan: family with a
     toddler, hiking couple, friends going out, slow culture, backpacker, beach family,
     cyclist, foodie, skier, wellness, island hopper, no-car rail.
   - For each one, take the top 10 in the app's own "For you" order, for one fixed month
     each.
   - Judge every place against pages you open (a search snippet is not a source).
   - Pass at 80% or more sensible over all 120. Tune only lambda and the conflict factors,
     inside the ranges in the plan, and record every change.
   - Write it all to `reports/persona_check_v5.md`, with a row for the owner to check
     three personas.
5. Done when:
   - the unit tests cover empty taste, one like, a conflict and the 55% floor
   - gate 7 passes
   - no list shows fewer places with a taste than without one

## T766: match in the planner and Ask Carta
Files:
- `lib/countryMatch.js`, `planner/wizard/StepStay.jsx`, the "Help me choose" steps
- `lib/ask/rank.js`, `planner/dayDraft.js`
- new `tests/same_top5.test` in the app's test folder

1. `matchCountries`: places per country rank by `forYou()` in place of rating x 1.5 +
   fame x 0.4 + dominance x 0.8. The country score keeps its own rule, fed by those
   places.
2. "Help me choose":
   - It starts prefilled from `choices.taste`, and the trip's answers seed the taste for
     this trip only.
   - At the end it offers "Save as my travel style" and never overwrites the profile
     without that tap.
   - The likes reach `StepStay.jsx`, so the stay choice is ordered by fit.
3. Ask Carta (`rank.js`): the fame weight goes, and rating and fit come from
   `lib/rating.js` and `lib/match.js`, so Ask and Explore agree.
4. Day planner:
   - Replace the four regex buckets with the one category set from T761.
   - Within each label (Must-see, Recommended, Worth a look), order POIs by the
     traveller's likes.
5. Done when, for every one of the 12 personas, "Help me choose" and Explore give the
   same top 5 places for the same country and month, as a node test.

## End check (once, on the merged batch branch)
- Fast NOPUBLIC build, then a browser round with Playwright at phone (390 wide) and
  desktop (1440 wide), with service workers blocked.
- Run `scripts/verify_rating_words.mjs` and the existing `scripts/verify_*.mjs` checks.
- Take one screenshot per screen and width, and save them outside the repo (put the path
  in the report). The screens:
  - the start dialog's four taste screens and Skip
  - the Explore header chip and sheet, the Explore list with and without a taste, "Picked
    for you", and the filters
  - a card and a pin with a match
  - a destination page with "Why it matches you" and with no taste
  - one trail, beach, lake, mountain and cycling page each
  - the day planner labels
  - "Help me choose" from start to "Save as my travel style"
  - Ask Carta with one question
  - the PDF and the trip page
  - Account, "Your travel style"
- Run `npm test`, every rating test in the root, and the contract test.
- If something fails, fix it on the batch branch and note it under that task's
  "What broke". Kill any dev or preview server you started before you finish.

## Report and register
- One report, `Execution/P7/T763-T766-rating-v5-screens.md`, following
  `Execution/_TEMPLATE.md`. It includes:
  - a before/after table from the baseline: chunk sizes, wire size, word count, the 20
    places
  - the onboarding taps and time
  - the gate 7 result and every lambda or factor change
  - the seven carta-design answers per task
  - every design call made without a written rule
  - rollback: revert the batch commits in both repos. The wire's old keys come back with a
    revert of step 9 in T763, since the app before R4 reads only them.
- `_OPEN.md` rows, owner `user`:
  - check three personas in `reports/persona_check_v5.md`
  - try the sign-in merge once on a real account, if it was not tested
  - every design call without a written rule
  - merging R1 to R4 and running the shared-master chain (T754-a, T756-b) before any
    deploy
- Close T754-c, T755-b and T759-c, and any R3 row this batch resolved. Commit the report
  and the register together, in the root repo, on the batch branch.
- Do not merge and do not deploy. Leave the branches for the owner.
