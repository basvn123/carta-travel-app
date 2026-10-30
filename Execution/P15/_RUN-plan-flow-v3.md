# Plan flow v3: overnight run log

Three lines per batch: branch shas, tests and end check, user rows raised.

- Batch A (T855 to T856), branch p15-plan-flow-v3-a: app a46b6db (from master d195640), root sync f43ed8b7a plus the report commit (from main d392962b9).
- npm test 1039 of 1039; end check walk-a.mjs on the NOPUBLIC builds at 1440 and 375: after 37 of 37, before 17 of 37 (every failure a fixed bug); T802-c closed by T855.
- User rows raised: T855-a (nearest-day flight vs the trip's dates), T856-a (finder flight wins over the way of travel), T856-b (coach or car at any distance).
- Batch B (T857 to T859), branch p15-plan-flow-v3-b: app 5dffb44 (from a46b6db), root sync ccb0463d9 plus the report commit (from 8edead415).
- npm test 1065 of 1065; end check walk-b.mjs on the NOPUBLIC build at 1440 and 375 plus Dutch at 1440: 38 of 38, no console errors; preloads 36; T856-c closed by T857.
- User rows raised: T857-b (budget and friends readings), T858-a (dashed chips before typing; words write stay and way app-wide), T859-c (named places skip weather, reach, likes for a town).
- Batch C (T860 to T862), branch p15-plan-flow-v3-c: app af96e17 (from 5dffb44), root sync f2a408976 plus the report commit (from 20dd4fc97).
- npm test 1082 of 1082; end check walk-c.mjs on the NOPUBLIC build at 1440 and 375: 70 of 70, no console errors; preloads 36; T858-b closed by T862.
- User rows raised: T860-a (drive estimate values, 2 hour reach, re-tick on a new town, car or train to the airport), T861-b (finder trip pinned to the card's airport), T862-c (typical night median a person, Either first, hostel private room under Hostel).
- Batch D (T863 to T866), branch p15-plan-flow-v3-d: app ebda863 (from af96e17), root sync 3ece322a5 plus the report commit (from 0c4ba3a0e).
- npm test 1090 of 1090; end check walk-d.mjs on the NOPUBLIC build at 1440 and 375: 86 of 86, no console errors; doors-lang.mjs 10 of 10; preloads 36; no earlier row closed (T859-b half done, stays open).
- User rows raised: T863-a (Carta's own trips a link, not a door), T863-b (Plan the rest opens Add a stop), T863-c (preselect order), T864-a (one base priced from the start, over budget left out), T866-b (a booked flight with no price shows no figure).
- Batch E (T867 to T869), branch p15-plan-flow-v3-e: app bfc7a0c (from ebda863), root syncs 0c781f5b0 and 0045729e1 plus the report commit (from 560ecf686).
- npm test 1096 of 1096; end check walk-e.mjs on the NOPUBLIC build at 1440, 800 and 375 plus the sort in five languages at 375: 102 of 102, no console errors; preloads 36; closed T803-a, T803-b, T803-d, T803-e, T811-b, T859-b (by T868) and T810-b (by T869).
- User rows raised: T867-a (no minimum stand on searching), T868-a (Best match without the flight pull, sort and map per visit, Compare in the toolbar, who and places in Edit answers), T869-a (group total on the card, budget said once, ticked photo edge).
- Batch F (T870 to T873), branch p15-plan-flow-v3-f: app 7a57107 (from bfc7a0c), root sync 5d30b78d1 plus the report commit (from 0edd7b8c4).
- npm test 1101 of 1101; end check walk-f.mjs on the NOPUBLIC build at 1440 and 375 plus Dutch at 1440: 85 of 85, no console errors; preloads 36; closed T811-a, T811-c, T825-a, T861-a, T868-d (by T870), T802-e, T811-d (by T871), T812-c (by T872).
- User rows raised: T870-a (pickers kept, gallery sights, alternatives' order, cents, no share), T871-b (the paragraph's words and thresholds), T872-a (Plan this trip does not press Save), T873-a (Ready to book built unmarked).
- Batch G (T874), branch p15-plan-flow-v3-g: app a0001d2 (from 7a57107), root sync 1dcfac4a7 plus the report commit (from d216e5180).
- npm test 1109 of 1109; end check walk-g.mjs on the NOPUBLIC build, four personas from the first sentence to Plan your days at 1440 and 375: 88 of 88, no console errors (before, on the F code at 1440: 35 of 40); preloads 36; closed T872-b, T864-c (by T874).
- User rows raised: T874-a (the way there answers How far, no fare no airport line, swept airport named, booked form filled), T874-c (day questions after the setup's spend style and way), T874-e (Family spend style for a family), T874-f (flight-first dates follow the picked flight, after T855-a).

## Morning summary

All seven batches ran (T855 to T874). Nothing is merged, pushed or deployed.

**Owner rows raised, T855 to T874** (Owner `user`, all open in `Execution/_OPEN.md`):

- T855-a: the finder prices a flight up to 4 days from the trip's day; the stays still start on the trip's day. Move the dates to the flight, or price exact days only?
- T856-a: a finder card priced on a flight flies there and home even when the way of travel is train, coach or car (narrowed by T874 for Train and Car).
- T856-b: a coach or car way of travel seeds the legs there and home at any distance.
- T857-b: a budget with no "a person" or "for us" is for the group; "with 4 friends" is five people.
- T858-a: Tell Carta shows the dashed question chips before typing; a stay type or way said in the words is written app-wide.
- T859-c: named places skip Help me choose's weather and how far; a named town also skips likes.
- T860-a: the airport drive estimate (straight line x 1.3 at 85 km/h, parking 12 a day), 2 hours ticks every airport inside it, the cheaper of car and train.
- T861-b: a finder trip is pinned to the card's airport; a trip planned without the finder flies from the cheapest ticked airport.
- T862-c: a stay type's typical night is the median over the named countries, a person a night; Either first; hostel private rooms under Hostel.
- T863-a: Carta's own trips is a quiet link under the four doors, not a door.
- T863-b: Plan the rest opens the Itinerary's Add a stop; no door picker on the trip page.
- T863-c: the doors' preselect order (a door said in the words, booked, a named place, else the whole trip).
- T864-a: a flight-first trip is one base priced from the start; a place over the budget is left out of the flight list.
- T866-b: a booked flight with no price shows Your own with no figure, out of the total until Add what you paid.
- T867-a: searching has no minimum stand.
- T868-a: Best match without the flight pull, sort and map per visit, Compare in the toolbar, who and places in Edit answers.
- T869-a: the card shows the group total, the budget badge left the card, a ticked photo takes the selected edge.
- T870-a: the trip page keeps the line pickers, sights in the gallery, alternatives in list order, cents on the page, no share control.
- T871-b: the "Who this trip is for" template's words and thresholds.
- T872-a: Plan this trip keeps the trip in progress; it does not press Save.
- T873-a: Ready to book built as proposed without the owner's mark.
- T874-a: the way there answers How far; a trip with no fare counts no airport line and names a swept airport; the booked form opens filled from the words.
- T874-c: Plan your days asks how they eat and get around after the setup's spend style and way were answered.
- T874-e: a family in the words does not preselect the Family spend style.
- T874-f (after T855-a): on Find my flight first the picked flight's days should probably set the trip's dates.

**Batch branch heads.**

| Batch | Root `p15-plan-flow-v3-x` | App `p15-plan-flow-v3-x` |
|---|---|---|
| A (T855 to T856) | 8edead415 | a46b6db |
| B (T857 to T859) | 20dd4fc97 | 5dffb44 |
| C (T860 to T862) | 0c4ba3a0e | af96e17 |
| D (T863 to T866) | 560ecf686 | ebda863 |
| E (T867 to T869) | 0edd7b8c4 | bfc7a0c |
| F (T870 to T873) | d216e5180 | 7a57107 |
| G (T874) | the report commit after 1dcfac4a7 (`git rev-parse p15-plan-flow-v3-g`) | a0001d2 |

Bases: root `main` d392962b9, app `master` d195640. Each branch stacks on the one before, so G holds all seven batches.

**Merge order.** One merge of each G branch is enough; merging A to G in turn gives the same result.

1. App first: `git -C continent-app checkout master` then `git -C continent-app merge --ff-only p15-plan-flow-v3-g` (master is still d195640, so it fast-forwards to a0001d2).
2. Then the root: `git checkout main` then `git merge --ff-only p15-plan-flow-v3-g` (main is still d392962b9). The root mirror of `continent-app/` then equals app master at a0001d2.
3. Run `npm test` (1109 of 1109) and a full build with `public/` before any deploy; the owner rows above are calls to read before shipping.
- T875 deploy: app master 8af8923, root main 7cece0092 pushed; Pages 8c452891 live (index-DdQJtM0h.js); walk-g 88 of 88 on preview and production; css-routes hold 3 rules (back to 1, T833-a).
