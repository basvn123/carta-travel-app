# T763 to T766: rating v5 on every screen (batch R4)

## Shared header

Date: 2026-10-28. Batch R4 of the rating v5 plan (`Roadmap/2.10b-rating-v5.md`). App work is on `continent-app` branch `p7-rating-v5-screens` (head `69d8560`, with `p7-rating-v5-screens-t764` merged in); the root branch `p7-rating-v5-screens` carries the `continent-app/` mirror, this report and the register. Every task is its own commit (or few), message starting `T{n}:`.

Two agents of an earlier run stopped mid-work and left uncommitted edits: T763 in `wt/p7-rating-v5-screens-app` (63 files) and T764's screens in `wt/p7-rating-v5-screens-t764-app` (21 files). Both were reviewed (diff, lint, tests) and kept; they are now commits `964bb81` (T763) and `74f9160` (T764). Seven files of T763 had been rewritten from CRLF to LF wholesale; they were put back to their stored line endings so the commit holds only the real change (1,203 added and 679 removed lines instead of 3,244 and 2,720).

The end check ran once on the merged batch: a dev server on 5763 (`wt/vite.t763.mjs`, serving the root worktree's `continent-app/public` after one `sync-data`), Playwright with service workers blocked at 390 and 1440 wide, the DOM checks, screenshots, the impeccable critique and carta-design's lint. Screenshots: `C:\Users\GEBRUI~1\AppData\Local\Temp\claude\c--Users-Gebruiker-Documents-Portfolio-Travel-App\3d345edc-87bb-4f03-adaf-575e54a3c15d\scratchpad\r4-shots` (outside the repo).

Batch measurements (fast NOPUBLIC build of R3's app `7accc1b` against R4's, same config):

| Metric | Before (R3) | After (R4) | Delta |
|---|---|---|---|
| Entry chunk, raw / gzip | 816,612 / 257,031 B | 819,019 / 257,815 B | +2,407 / +784 B |
| All JS, raw / gzip | 6,478,645 / 2,025,307 B | 6,546,121 / 2,049,280 B | +67,476 / +23,973 B |
| Rank tier `_rank.json`, raw / gzip | 3,415,506 / 488,647 B | 4,363,103 / 546,439 B | +947,597 / +57,792 B |
| Boot index `boot.json`, gzip | 89,108 B | 89,853 B | +745 B |
| Wire `app_data.json`, gzip | 2,827,559 B | 2,827,559 B | 0 |
| Files mapping a score to a word outside `lib/rating.js` | 13 | 0 | -13 |
| v4 word keys in `en.js` (Worth a ..., Highly rated, tier, hiddenGemsOnly) | 3 | 0 | -3 |
| Unit tests | 850 of 856 pass (1 fail, 5 skipped) | 860 of 866 pass (same 1 fail) | +10 |
| design-lint violations (`scripts/ci/design-lint.mjs`) | 32 | 32 | 0 |

The one failing unit test (`catalogue.test.mjs`, first paint under 2 MB) fails identically on R3 (2,411,781 bytes): the v19 wire grew it, not R4.

## T763: one rating in the app

### What changed

`lib/rating.js` is now the only module that turns a score into words: the five bands and their cutoffs come from `config/rating.json` (9.0 Exceptional, 8.3 Excellent, 7.6 Very good, 6.9 Good, 6.0 Pleasant, nothing under 6.0), every screen calls `ratingWords()` and prints the score with one decimal next to its word ("about 8.1" when the confidence is estimated). The class rank line ("Top 1% of villages in Europe") shows for the top 10% of a class. RatingBreakdown shows the score, the word, Measured or Estimated, the class rank, the reason sentence in the UI language (the lazy `why_i18n` files, English fallback) and the four parts at the weights read from config; the v4 tier marks and the unused confidence strings are gone. Nature rows use the same badge, a rank line in words and a facts row; an unscored item shows NotYet. POIs show Must-see, Recommended or Worth a look with no number. The Explore rating filter is "Good and up, Very good and up, Excellent and up". Gateways (closes T755-b): airport rows of a multi-airport city never show as a place, pin, Ask answer or stay, and `#dest=<gateway>` opens its city. `GemRating.jsx` and `rating.hiddenGemsOnly` are deleted. The boot index `r` column is the v5 band rank. `scripts/verify_rating_words.mjs` is the DOM check.

Readers of the old keys, by grep after the change: `tier` (rating) none; `components` read through `ratingPart()`, which takes either name (`highlights`/`depth`, `acclaim`/`recognition`); `rate` on POIs still read by `poiLabel()` as the fallback for live city research, by `lib/cityResearch.js` and by `browse/ask/AskTripCard.jsx`; `confModelled`/`confProvisional` none. Because `rate` still has readers, step 9 (stop shipping the old wire keys and bump the contract) was not done: open as T763-a.

Measured on the twenty-place baseline: the brief named 20 places (5 metros, 5 villages, 5 areas, 5 nature items). `verify_rating_words.mjs` covers 15 places across the score range (FCO, VNO, CTA, ZAG, MJV, Hallstatt, Visegrad, Narni, Casoli, Lido di Castel Fusano, Lake Como, Bohemian Switzerland, Yorkshire Dales, Symonds Yat, Dugi Otok) and every Score chip on their pages and on Explore, nature tiles included: 165 chips, each carrying the band of its own figure, head and breakdown agreeing on all 15. The five nature items are covered as the nature tiles on those pages rather than as five named items. The PDF is not a DOM and was not read by the check.

### Files touched

Modified (app): `src/lib/rating.js`, `src/components/RatingBadge.jsx`, `src/browse/RatingBreakdown.jsx`, `src/lib/tripGuide.js`, `src/browse/ExploreFilterRail.jsx`, `src/hooks/useExploreCatalog.js`, `src/lib/trailCards.js`, `src/lib/{beach,lake,mountain,cycle}Story.js`, `src/lib/{beaches,lakes,mountains,nearby,bootIndex,countryBrief,countryMatch,exploreLayers,destinationPdf,trip_planner_pricing}.js`, `src/lib/ask/rank.js`, `src/planner/{dayDraft.js,dayExploreRails.js,DayAddPanel.jsx,DayPlannerTab.jsx,GuidedTripWizard.jsx,GuidedTripWizardParts.jsx,TripPlannerTab.jsx,CountryBrief.jsx,wizard/StepStays.jsx}`, `src/browse/{AroundHere,BeachPage,CyclePage,DestCards,DestOverview,DestPractical,DestTiles,DestinationPage,DestinationsTab,ExploreMap,ExploreTab,ItemParts,LakePage,MountainPage,NearbyOutdoors,SectionOpening,TrailPage,TripPage}.jsx`, `src/hooks/{usePlaceExits,usePlaceRows}.js`, `src/App.jsx`, `src/styleguide/StyleGuide.jsx`, `scripts/prerender/pages.mjs`, the six `src/i18n/*.js`, `tests/wireSplit.test.mjs`, `scripts/verify_destination_page.mjs`.
Created: `tests/gateways.test.mjs`, `scripts/verify_rating_words.mjs`.
Deleted: `src/components/GemRating.jsx`.

### Commands run

```
npx eslint <touched files>; npm test
node scripts/verify_rating_words.mjs http://localhost:5763/
node scripts/verify_destination_page.mjs http://localhost:5763/
```

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The commit counted 3,244 changed lines for 1,203 real ones | The stopped agent rewrote seven CRLF files as LF | Restored CRLF and staged those files with `core.autocrlf=false` |
| On a phone's Explore list the photo pill read "10.0 Exceptiona" | "10.0 Exceptional" does not fit the 112 px photo | The pill keeps the figure; the band word sits under the name (T763-b) |
| `verify_destination_page` "rating scale has three ticks" failed | The check tested v4's tier ticks, which T763 removes on purpose | The check now asks for one band word and no ticks |
| Two new design-lint hits | "Easy" as a new difficulty key; the new match styles used legacy `--ink-soft` and a literal 12 px | Difficulty reads the existing `dest.diff.*` group; styles read `--text-2` and `--text-caption` |

The other failing browser checks (`verify_explore` 11 of 19, `verify_destination_page` price card, Rome estimate mark, photo swipe; `verify_account_panel` profile card) fail the same way on R3 against the same data: stale selectors from earlier redesigns, not R4 (T763-c).

### What is still open

- **T763-a.** Step 9 is not done: the wire still ships `rating.tier`, the old `components` names, POI `rate` and the old confidence words, because POI `rate` still has three readers (live city research's fallback, `cityResearch.js`, `AskTripCard.jsx`). Move those to `label`, then drop the keys in the wire build and bump the contract.
- **T763-b (owner).** Design call without a written rule: on a phone, Explore's place card shows the figure alone on the photo pill and the band word under the name.
- **T763-c.** `verify_explore`, `verify_account_panel` and three `verify_destination_page` checks fail on R3 and R4 alike (stale selectors).
- **T763-d.** The first-paint unit test fails since R3 (2.41 MB against 2 MB), and R4's compact taste adds 58 KB gzip to the rank tier.
- **T763-e (owner).** The day planner's "Worth a detour" heading over far places stays (it means distance, not a rating); confirm the wording or rename it.

### Rollback procedure

`git revert` the T763 commits on `p7-rating-v5-screens` (app) in reverse order. The wire's old keys never left, so the app before R4 still reads them.

### The seven carta-design questions

1. No hex outside the tokens. 2. No gradient, no new colour. 3. Brown is the star only; the selected state is untouched. 4. The Score is 12 px or more, tabular. 5. One primary; nothing on a photograph but the existing Score pill. 6. No counts or method lines; no em or en dashes or middots in the diff. 7. Removed: the v4 tier ticks and "Worth a visit/detour/journey".

## T764: taste profile and onboarding

### What changed

`choices.taste` (`{party, likes (up to 3), size, quiet, lifestyle, noCar, asked}`, null answers are No preference) is read, written and merged by `lib/taste.js` (committed earlier, `52f95b2`) and now drawn: on a phone's first Explore visit with no taste the start dialog asks four questions (Who usually comes, What do you go for with the planner's like photos, Where do you like to stay, How do you travel), each with Skip; the Explore header chip reads "For you: hiking, lakes, villages +1" or "Tell Carta what you like" and opens the same four questions as a sheet; Account has "Your travel style"; after a save, when five saved places share a facet not picked and not asked, it asks once. The taste lives in the link (`ty=`) and local storage (a link without one keeps the stored taste) and in `user_settings.settings` when signed in, merged on sign-in with the account winning key by key. The like tiles are shared with the planner (`LikeTiles`), their CSS moved from the planners bundle to `86-plan-flow.css` because Explore draws them now. The GDPR export (`export_my_data`) returns the whole `user_settings.settings` object, so the taste is included.

Onboarding, measured by `verify_taste_onboarding.mjs` (15 of 15 pass): a taste is set in 3 taps (Next, Hiking, Skip) in 0.96 s scripted; Skip is 1 tap; the taste survives a reload.

### Files touched

Modified: `src/App.jsx`, `src/auth/AccountPanel.jsx`, `src/browse/{ExploreTab,StartDialog}.jsx`, `src/hooks/useAccountSync.js`, `src/lib/{taste,urlState}.js`, `src/planner/flow/setupScreens.jsx`, `src/styles/{84-explore-overview,86-plan-flow,planners/86-plan-flow}.css`, six i18n files. Created: `src/browse/TasteSheet.jsx`, `scripts/verify_taste_onboarding.mjs`, `tests/taste-wiring.test.mjs`.

### What broke and how it was fixed

The merge into the batch branch conflicted in the six i18n files (both sides appended a block); both blocks were kept and all six files load.

### What is still open

- **T764-a (owner).** The sign-in merge is unit-tested only; try it once on a real account.
- **T764-b (owner).** Design call: each question opens with No preference already selected (tinted), so Next means no preference.

### Rollback procedure

Revert merge `7016b81` (`git revert -m 1`) on the app batch branch.

### The seven carta-design questions

1 to 2: tokens only. 3: the selected state is the tint with a tick (ChoiceRows, LikeTiles). 4: no figures. 5: one primary (Next or Done) per screen. 6: questions are verbs; no dashes. 7: nothing added beyond the planner's own rows and tiles.

## T765: match in Explore

### What changed

`lib/match.js` (committed earlier, `2f2ab57`) is now on the screens through `browse/WhyItMatches.jsx`: Explore's cards and the map's card read "69% match: lakes, hiking" from 55% up beside the Score (never merged into it); the destination page shows the line after the rank lines and a "Why it matches you" fold under Why it rates: one bar per pick in the selection umber with its fact line ("6 nearby, the best is Hallstatter See, 2 min away"), the month it was read for, and every conflict on its own line. With a taste, "For you" is a sort choice and "Strong match" (70% and up, its title naming 70%) a toggle; with none, every screen is as before (checked: no match line without a taste). `taste` is in the rank tier in a compact form (likes as `[p]` only), so lists sort before the country files land (closes T762-b); the page reads the full profile.

Gate 7 fails: 87 of 120 sensible (72.5%) against 80% (`reports/persona_check_v5.md`). Why, from that report: quality dominates at lambda 2 (Rome 10, Bruges 9.7 and Salzburg 9.6 sit in 7 to 8 of the 12 lists at 29 to 52% match, 12 of the 33 misses), and the place profile's values are wrong in ways no knob in the plan can fix (0 meaning "not measured" for food, hidden, islands, wellness; lakes and nightlife at 71 to 98 for cities with neither; sights such as Pont du Gard filed as villages). The only knobs the plan allows are lambda (capped at 2 by owner decision 9; lower makes it worse) and the conflict factors; busy 0.6 was tried and made the toddler list worse. One more cause found here: the heat conflict never fires, because the taste has no "avoid heat" answer and no caller passes the month's high. So the conservative call: `match.for_you_default` is false in `config/rating.json`, "For you" is offered but is not the default sort, and the "Picked for you" rail is not drawn; the flag turns both on once the gate passes. No lambda or factor was changed in this session (lambda 2, busy 0.8, car 0.75, heat 0.85, as committed).

### Files touched

Created: `src/browse/WhyItMatches.jsx`. Modified: `src/hooks/useExploreCatalog.js`, `src/browse/{ExploreTab,ExploreCards,ExploreMap,PlaceOverview,DestPractical,DestinationPage}.jsx`, `src/lib/bootIndex.js`, `scripts/sync-data.mjs` (the rank tier proof applies a field's map), `config/rating.json` (`for_you_default`), `src/styles/{25-feature-pages,79-place-card,84-explore-overview}.css`, six i18n files (`fit.*`).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| sync-data refused the rank tier (3,855 fields) | Its proof re-implements the projection and did not know `map` | The proof applies `how.map` |
| Explore list showed no match line | The list draws `PlaceOverview`'s card, not `PlaceTile` | MatchLine added to the card body |
| Review (impeccable, single context) | Strong match had no pressed look on the overview; the head's match line split the two rank lines; bar names were lowercase; phone card ran band and match together; bars looked like the Score's; no month named; a middot joined the facts | Fixed in `a6bee82`, `f0863a4` |

### What is still open

- **T765-a (owner).** Check three personas in `continent-app/reports/persona_check_v5.md`: family with a toddler, wellness, backpacker.
- **T765-b (owner).** Gate 7 fails (87 of 120). For you is not the default and Picked for you is not drawn (`match.for_you_default` false). Decide: fix the profile data first (T765-c, T765-d) and re-run the gate, or accept a lower bar.
- **T765-c.** Place profile values: carry null for "not measured" and score it as neutral; cap likes by distance to the real feature; keep sights from taking the size bonus (the persona report lists every case).
- **T765-d.** The heat conflict never fires: the taste has no avoid-heat answer and no caller passes the month's high.
- **T765-e.** Not built: nature lists ordered by the facts for a taste (easy loops first for a family, the hard ridge first for a hiker), match lines on the rails' photo cards, the other rails sorting by fit.

### Rollback procedure

Revert the T765 commits (`4da503e`, `e56eb97`, `5a3e1d6`, `a6bee82`, `f0863a4`); T766 imports `WhyItMatches.jsx`, so revert T766 first.

### The seven carta-design questions

1. No hex. 2. No new colour: the match bars use `--select-border`, an existing role. 3. Brown marks the selected pick's bars and the pressed Strong match only. 4. Percentages at 12 px. 5. No new primary. 6. "Why it matches you" names a section; no counts; no dashes or middots. 7. Removed: the bold weight on the phone card's match line.

## T766: match in the planner and Ask Carta

### What changed

`matchCountries` ranks a country's places by `forYou()` (no taste: the month score), in place of rating x 1.5 + fame x 0.4 + dominance x 0.8; with a taste the type-tag gate drops, since Explore has none. "Help me choose" starts from the travel style's likes, ranks with the trip's likes for this trip only (`tripTaste`), and offers "Save as my travel style" under its recommendations, written only on that tap. The stay search orders by fit. Ask Carta's fame weight became the fit weight, live only with a taste. The day planner's four regex buckets read the T761 category set (the wire's `category`, else `kind_category` by kind) folded onto the existing four chips, and the picker orders each label by the traveller's likes.

`tests/same_top5.test.mjs`: for all twelve personas, over each one's top three countries (36 comparisons), "Help me choose" and Explore's For you order give the same top 5, within what the card can show (rated 7 and up, with a photograph, one row per city). Passes.

### Files touched

Modified: `src/lib/{countryMatch,taste}.js`, `src/lib/ask/rank.js`, `src/browse/ask/{AskChat,AskTurn}.jsx`, `src/planner/{GuidedTripWizard.jsx,wizard/StepWhere.jsx,wizard/StepStays.jsx,flow/setupScreens.jsx,dayDraft.js,DayAddPanel.jsx}`, `tests/{taste,countryMatch}.test.mjs`. Created: `tests/same_top5.test.mjs`.

### What broke and how it was fixed

`countryMatch.test.mjs` "a setting type prefers the place the setting dominates" failed once dominance left; the wizard always passes the trip taste, so the test now does too, and Barcelona still does not lead the Spanish beach card.

### What is still open

- **T766-a.** Likes order POIs in the day picker only; the day themes and the AI day plan keep their own order.
- **T766-b (owner).** Design call: "Save as my travel style" sits under Help me choose's recommended countries, as a secondary small button.

### Rollback procedure

Revert `1368f58`.

### The seven carta-design questions

1 to 2: tokens only. 3: no brown added. 4: no figures. 5: the save offer is secondary. 6: verb first ("Save as my travel style"). 7: nothing decorative added.

## Register

Closed: T754-c, T755-b, T759-c (T763), T762-b (T765). Opened: T763-a to T763-f, T764-a, T764-b, T765-a to T765-e, T766-a, T766-b. T763-f: merge R1 to R4 and run the shared-master chain before any deploy (done by T782 in this session).
