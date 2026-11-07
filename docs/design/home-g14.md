# Home page G14, design note

Status: built behind the `HOME_G14` flag (off), T1209, ROADMAP G14. Follows the design direction draft `docs/design/direction.md` (not approved yet, row T1111-a). Preview with `?home=g14`.

## What it is

A compact Persuade page in three acts, about 1.9 viewports on a 390 px phone and 2 on a 1440 px desktop including the site footer:

1. **The promise.** The mission's short form as the h1 ("A cheap flight is not a cheap trip"), one line under it, one primary door (Explore) and one link (a sample trip). Text on the mist ground, no film, so the first paint is the promise.
2. **One real day.** The umber cost card from direction section 3: Bled this month, a person, its total in `--text-total`, a two-part bar that grows from the left once (bed, then food, `--dur-1` apart), two lines saying what moves each part, and the foot strip with one sentence and the one button ("Open Lake Bled").
3. **Join.** The K3 waitlist form beside a card with the referral share button.

## Where it departs from the draft, and why

- **Cost colours on the deep ground.** The draft draws bed in `--action` and food in `--lagoon-600`. On `--home-ground-deep` both fall under 3:1 against the ground, so the bar and the dots use the light steps of the same families (`--umber-200`, `--lagoon-100`). The figures are in text beside them, so colour is never the only carrier.
- **Shadow.** The soft umber shadow has no token yet; `--elev-3` stands in (design-lint bans literal shadows). Row T1209-c.
- **No flight on the card.** The sweep's cheapest return is any month, not this month, so a flight line on a "this month" card would mix two dates. The foot strip says the flight comes on top from Google Flights when you plan.
- **No count-up.** The draft keeps the one count-up for the v3 home. G14 has one motion moment, the bar growing once; reduced motion shows it whole.

## The seven questions (carta-design)

1. One coherent page: one card, the stage radius, one elevation, Figtree, the cost colour families. Yes.
2. More compact than v3: about 1,950 px tall on a phone against v3's several viewports of film, cost chapters, tour and plans. Yes.
3. One motion moment (the bar), reduced motion shows the end state. Yes.
4. Every figure from the price engine through `formatMoney()`; the sentences match the data (food line says "How you like to eat"). Yes.
5. Contrast, focus (`--focus` 2 px), 44 px targets (checked by `verify_home_g14.mjs`), real links and buttons. Yes.
6. Six languages, no dashes, no banned words (`tests/homeG14.test.mjs`). Yes.
7. Detector clean (`impeccable detect` returned nothing). One thing left to remove: the kicker could go if the owner finds it redundant with the h1.
