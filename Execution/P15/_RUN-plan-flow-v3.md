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
