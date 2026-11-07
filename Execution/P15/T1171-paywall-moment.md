# T1171: Where the paywall meets the journey (ROADMAP I14, session S87)

## Date

2026-11-07

## What changed

The Pass has one designed moment in the journey, built behind a flag that is OFF (`PASS_MOMENT = false` in `continent-app/src/pass/passMoment.js`, preview `?pm=on`). With the flag on, the trip page shows one inline card under "Your route" once the trip is priced, for a traveller who does not pay (guests included): "Planning this trip is free", a lagoon list of what stays free (plan and price as many trips as you like, a share link and planning together, one saved trip and every GPX file, the free Carta bot day plans), an umber list of what a Trip Pass adds headed with its price and days from `pricing.js` ("Trip Pass, €6.99 once for 60 days": exports, every trip saved, 60 day plans, booking import), and a mist foot strip ("VAT included, no subscription. Your trip carries on free either way.") with "Not now" and the one primary "See the Trip Pass". The primary opens the existing pass sheet, which closes back to the same trip; "Not now" hides the card for 14 days and says so ("Prices stay under Account"); after two "Not now" it does not come back by itself. Nothing opens by itself and nothing is blocked, which also keeps row T411-e (a dialog over the first success) out of this design. With the flag off nothing a traveller sees changes (unit test and the `?pm=off` browser check). `scripts/verify_paywall.mjs` was stale (it looked for REASON_COPY in PassModal.jsx since T497 moved it, row T1089-a lists it); it now reads `lib/passMoments.js`, checks that every hard gate's line names the price (what you get and how) and that the sheet keeps its free way on, and gains a `--dom` walk of the moment at 390 and 1440 (28 checks, all pass). Twelve `paywall.*` keys in all six languages.

## Research

A research subagent compared four ways to present the paid offer in a freemium app (sources as returned, read 2026-11-07):

| Option | For | Against | Source |
|---|---|---|---|
| Modal at first success | Peak intent | Blocks the trip as it pays off; repeated prompts read as "nagging" under the UCPD | [RevenueCat SOSA 2025](https://revenuecat.com/state-of-subscription-apps-2025), [Wettbewerbszentrale](https://www.wettbewerbszentrale.de/?p=20189) |
| Inline card after value | Non-blocking, easy to dismiss, room to say what is free and the price with VAT | Lower conversion per view | [RevenueCat contextual paywalls](https://www.revenuecat.com/blog/growth/contextual-paywall-targeting), [Appcues](https://www.appcues.com/blog/how-freemium-apps-convert-users-with-brilliant-upgrade-prompts) |
| Hard gate at the paid action (today) | Highest intent, obviously relevant | Too late for someone who never reaches a paid action | [Lazyweb, 809 apps](https://www.lazyweb.com/research/where-freemium-apps-place-in-product-upgrade-prompts) |
| Quiet persistent link | No pressure | Banner blindness | [LogRocket](https://blog.logrocket.com/product-management/freemium-conversion-points/) |

Legal frame: EDPB and CNIL list "continuous prompting" as a deceptive pattern ([CNIL typology](https://linc.cnil.fr/sites/default/files/2026-03/2026-27-02_typology_of_deceptive_patterns-v4-en.pdf)); the Digital Fairness Act is expected to ban more ([Osborne Clarke](https://www.osborneclarke.com/insights/digital-fairness-act-unpacked-dark-patterns)). No published conversion data for inline cards was found, and RevenueCat's figures are for subscriptions, not a one-off pass.

**Choice:** the inline card as the one moment, keeping the hard gates and Account's prices as they are. Snooze: 14 days (common practice is 7 to 14, [ninety9](https://ninety9.dev/blog/popup-frequency-capping.html)), and no return by itself after two dismissals. Shown to guests, since the card also says what is free; buying still asks for sign-in at the sheet. The research also suggested carrying the snooze to the account on sign-in: left open (T1171-c).

## Files touched

- `continent-app/src/pass/PassMoment.jsx` (new: `PassMoment` with the rules, `PassMomentCard` the card)
- `continent-app/src/pass/passMoment.js` (new: `PASS_MOMENT`, `passMomentOn`, `readLater`, `hideForLater`, `showPassMoment`, `momentLines`)
- `continent-app/src/pass/PassMoment.css` (new, scoped `.pm*`)
- `continent-app/src/planner/TripSummary.jsx` (the one call site, after the route; 4 lines)
- `continent-app/src/hooks/usePaywall.jsx` (one side-effect import so a `?pm=on` preview is kept before the app rewrites the address, as T1122's `?cc=` does from main.jsx; main.jsx is outside this task's files)
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (12 new `paywall.*` keys each)
- `continent-app/tests/passMoment.test.mjs` (new, 8 tests)
- `continent-app/scripts/verify_paywall.mjs` (REASON_COPY from passMoments.js, section 8 no dead end, `--dom` walk)
- `docs/design/pass-moment.md` (new), `docs/HANDBOOK.md` (The Pass section), `ROADMAP.md` (I14 status), `Execution/_OPEN.md` (T1171-a to d)

## Commands run

```
cd continent-app && npm ci
node scripts/sync-data.mjs --split-only          # gitignored boot.json for the offline walk
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
node ../Execution/P15/T840-T843-walk/serve-a.mjs ../.fastbuild public 5871
PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/verify_paywall.mjs --dom http://localhost:5871 --shots ../Execution/P15/T1171-shots
node scripts/verify_paywall.mjs
npx eslint src/pass/PassMoment.jsx src/pass/passMoment.js src/planner/TripSummary.jsx src/hooks/usePaywall.jsx tests/passMoment.test.mjs
npm test; npm run lint; node scripts/ci/design-lint.mjs
bash ../.claude/skills/impeccable/scripts/impeccable detect --json src/pass/PassMoment.jsx src/pass/PassMoment.css
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_csp.mjs --dist ../.fastbuild
cd .. && python -m pytest tests -q $(grep -v '^#' tests/quarantine.txt | grep . | sed 's/^/--deselect /')
# base for the size figures: a worktree of origin/p15-round2 with CARTA_APP set, same fast build
```

## Config and secrets set

None. `PASS_MOMENT` stays `false`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Paid moments in the journey that say what is free and what the Pass adds without a tap on a paid action | 0 | 1 (flag on) | +1 |
| Card height on the trip page, 390 / 1440 (flag on) | none | 594 px / 310 px | |
| Hard gates whose sheet line names the price (no dead end), static check | not checked | 7 of 7 | |
| `verify_paywall.mjs` static | 10 problems (stale since T497) | ok | -10 |
| `verify_paywall.mjs --dom`, 390 and 1440 | did not exist | 28 of 28 ok | |
| Entry chunk (`index-*.js`), fast build | 853,225 B | 854,404 B | +1,179 B |
| All built assets, fast build | 10,048,983 B | 10,059,384 B | +10,401 B |
| npm test | full suite not run on the base; its 2 failing files run on the base: 3 fail there too | 1850 tests: 1842 pass, 3 fail (the same 3), 5 skipped; the 8 new pass | +8 tests |
| design-lint new violations | 0 | 0 | |
| impeccable detect on the new files | | [] | |
| CSP screen check | | 0 violations over 40 loads | |
| eslint on touched files | | 0 errors, 0 warnings | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| design-lint flagged `var(--shadow-card)` | `--shadow-*` are legacy names | `var(--elev-1)`, the role the others alias |
| The `?pm=off` walk timed out on the Plan home | the first walk's trip stays under way in the context's storage, so Plan home opens differently | a fresh browser context per walk |
| `verify_paywall.mjs` reported 10 problems before any change | REASON_COPY moved to `lib/passMoments.js` in T497 | reads it there |
| 3 npm test failures (`catalogue.test.mjs` boot index, `rankTier.test.mjs` lite record) | the container's local data split; they fail the same on an untouched `origin/p15-round2` worktree (row T792-b already holds them) | none here |

## Screens checked

Trip page (Rome, 7 nights, 2 adults, from Brussels, reached by the plan flow's shortest walk then "Plan this trip"), fast build, offline data, 390 x 844 and 1440 x 900, `?pm=on`: the card stands after the route, two lists side by side on desktop and stacked on a phone, buttons 44 px, no sideways scroll; "See the Trip Pass" opens the pass sheet (one primary, the free sentence, Close returns to the same trip with the card still there); "Not now" leaves the line "Hidden for 14 days. Prices stay under Account."; with `?pm=off` no card. No page errors. Screenshots in `Execution/P15/T1171-shots/` (gitignored).

## The seven carta-design questions

1. **One coherent page?** Yes: the Carta card (stage radius, one elevation, bands, mist foot strip like the refine card and the proof card), the cost colours' meanings (lagoon fits, umber action), Figtree with tabular figures.
2. **More compact?** It adds one card where there was none: 594 px on a phone, 310 px on desktop. Kept to four lines a list and one foot strip; the long pass sheet list is not repeated.
3. **One meaningful motion, reduced motion full?** The card rises once (8 px, `--dur-3`); the arrow on the primary nudges 3 px on hover. Under reduced motion both are off and the card is there.
4. **Figures from data, sentences true?** Price and days from `TIERS.trip`, free plans `TIERS.free.aiPlans`, Pass plans `TIERS.trip.aiPlans`, money through `formatPrice`. Each free line matches the product (share links free since T488-b, one saved trip from useTripSave, GPX free per `pass.subExport`). The free plans line does not yet subtract plans already used (T1171-d).
5. **Contrast, focus, 44 px, keyboard?** Text is `--text` and `--text-2` on white and tints of 70 percent surface; both buttons are the app's `Button` (real buttons, visible focus) at 44 px; forced colours draw edges.
6. **Six languages, no dashes, no banned words?** All 12 keys in six catalogues, same placeholders, no dash or euro sign (unit test); English checked against the banned list ("unlock" avoided).
7. **Detector clean, one thing to remove?** `impeccable detect` returned nothing. Removed before shipping: a lead sentence under the title (the lists say it).

Departures from defaults: none beyond the tinted list grounds, which use existing tokens.

## What is still open

- T1171-a (owner): the closed beta test, then the decision to set `PASS_MOMENT` true.
- T1171-b: no paywall event for the moment, so the beta cannot count views, opens or "Not now"; needs a reason in `paywallEvents.js` and migration 022's check, outside this task's files.
- T1171-c: "Not now" is per device, not carried to the account.
- T1171-d: the free plans line names the free allowance, not what is left of it.

## Owner steps (for the checklist)

- [T1171-a] Beta test the Pass moment | it is the one designed paid moment in the journey and is off until the beta says it reads right | open a priced trip page with ?pm=on on a tester's phone and desktop; watch whether "Not now" and "See the Trip Pass" feel fair; set PASS_MOMENT = true in continent-app/src/pass/passMoment.js or tell the next task what to change | docs/design/pass-moment.md

## Rollback procedure

`git revert` the T1171 commits. Nothing is one-way: no migration, no data, the flag is off. A traveller's `carta.pm.later.v1` and `carta.pm` keys are harmless leftovers.
