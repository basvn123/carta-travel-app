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
