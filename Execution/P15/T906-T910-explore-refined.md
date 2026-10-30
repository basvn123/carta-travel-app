# T906 to T910: Explore, one search field and rows that read at a glance

## Task ID

T906 to T910, one batch (CLAUDE.md "Batches"), branch `p15-explore-refined`.

## Date

2026-10-30

## Shared header

The owner sent four screenshots of Explore:

- a rail with its lead card;
- the hero;
- the "Trip styles" lead card;
- the People popover.

They asked for deep research and an artifact on six things:

- whether the lead card is needed on a phone;
- the hero's height;
- Ask Carta as the search bar on a phone;
- the footer;
- the settings questions that do not fit, such as Per person or Whole group under People;
- the map, and filters as tabs or behind a button.

They judged "Explore, Refined" (https://claude.ai/artifact/5wh2RjpfmuxgT7qVmNSexi): "go".

**Research behind the design, in the artifact:**

- **The top of the page:** Airbnb, Booking and Skyscanner ask three or four things. Kayak's AI Mode lives in the one search box, and Booking's Smart Filter reads plain words.
- **Rails:** no travel site leads a rail with a card. Smashing Magazine says dots alone move no one through a carousel.
- **Cards:** one price a card, as on Airbnb, Booking, Hostelworld and GetYourGuide.
- **Filters:** Baymard finds a filter toolbar works for a few filters.
- **Travellers:** no one puts the price basis in the travellers picker; Airbnb's total-price switch sat by the results.
- **Map:** split list and map, with prices on the pins.
- **Footer:** columns and one legal line.

**The owner's open decisions, defaulted as the artifact proposed:**

- the desktop photo stays, at a calmer height;
- the cost split stays as one muted line on wide cards;
- Per person or Whole group sits by the results.

**How it was checked.** Each task ran static checks: eslint on the touched files, `npm test` and design-lint. The full app still cannot load its travel data in this session (no `public/boot.json`). The end check was one throwaway harness (`continent-app/__t912/`, deleted). It rendered the real `StoryRail` and `StoryCard`, `PriceViewSwitch` and `SiteFooter` with the film stills, at 390 and 1440. There was no overflow and no page errors. The hero (`OverviewHero`) lives inside ExploreTab and needs the catalogue, so it was not seen (T906-b).

**What the harness showed:**

| Width | Result |
|---|---|
| 1440 | The rail opened on "Best in October", its facts divided by thin rules, See all and two arrows; four whole cards, each with one price. The footer showed logo, line and language, four columns, and the base line. |
| 390 | Two whole cards inside the edge; the rail header kept its first fact only (end check fix); the footer is hidden in the app on a phone, as the owner decided in T622. |

**Not built from the artifact**, each with a register row:

- **The phone search pill does not carry the trip summary.** The settings line stays its own row under the phone header (T906-a).
- **No From, When, Who segments in the desktop bar.** The full settings line above the page keeps them (T906-a).
- **No child ages in People** (T907-a).
- **Map:** already had price labels, the list beside it on a desktop, and the phone's floating Map pill and drawer. Clusters were left out, because the owner removed them in T441, so no map task ran.
- **"Tell Carta what you like" stays as a chip.** It opens the taste sheet for the personal match, not Ask Carta, and has no other door (T907-b).

## T906: one field for a place and for Ask Carta

### What changed

- **One field:** labelled "Where to? Ask Carta or search a place". A name searches the places as before. A question (it ends with "?", carries a figure or € sign, or has four words or more) opens Ask Carta with it. The separate Ask Carta button goes.
- **Desktop:**
  - the photograph is 300 to 420 px high (`clamp(300px, 40vh, 420px)`, was 240 to 340);
  - "Where to next?" sits on the photo;
  - the field sits on the photo's lower edge as a pill, so the photo's middle is never covered.
- **Phone:** no photo and a screen-reader-only title; the field is a round search pill.

### Files touched

- **Modified:** `continent-app/src/browse/ExploreTab.jsx` (OverviewHero, `isQuestion`), `styles/84-explore-overview.css`, i18n (1 key)

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Desktop hero photo height | 240 to 340 px | 300 to 420 px | +60 to +80 px |
| Doors into Ask Carta in the hero | 2 (button, plus the taste chip that looked like one) | 1 (the field) | -1 |

### What broke and how it was fixed

- **Two lint findings:** a literal € in the question rule and a literal text-shadow. Fixed with an escaped € and the `--elev-3` token, commit "T906: lint fix".

### What is still open

- **Merge the settings into the search:** the phone settings summary into the search pill, and From, When, Who into the desktop bar, with the settings line folded away (T906-a).
- **Not seen running:** the hero has not been looked at with the catalogue (T906-b).

### End check screens

Not reached (see the shared header).

### Rollback procedure

`git revert` the two T906 commits.

## T907: the chip row and how prices read

### What changed

- **The chip row now reads:**
  1. Filters, with its count;
  2. three quick doors (was every rail beyond the first);
  3. the taste chip and the strong-match chip;
  4. Per person or Whole group;
  5. the map.
- **Removed:** the Countries chip (the settings line has Countries) and "Show all places" (every rail has See all).
- **Per person or Whole group** leaves the People popover for a new `PriceViewSwitch`. It shows by the results only when more than one person travels.

### Files touched

- **Modified:** `browse/ExploreTab.jsx`, `components/SettingsLine.jsx`, `styles/84-explore-overview.css`
- **Created:** `components/PriceViewSwitch.jsx`

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Controls in the chip row (owner's screenshot) | 8 | 7 at most (Filters, 3 quick, taste, price view, map), 5 with one traveller and no taste | -1 to -3 |
| Questions in the People popover | 4 (adults, children, babies, price basis) | 3 | -1 |

### What broke and how it was fixed

Nothing found statically.

### What is still open

- **No child ages in People:** Booking asks them, and they drive the cost (T907-a).
- **The taste chip stays in the row:** it is the only door to the personal match (T907-b).

### End check screens

The price switch at 390 and 1440 (harness).

### Rollback procedure

`git revert` the T907 commit; the switch returns to People.

## T908: every rail opens on a header

### What changed

`StoryRail` is used by every browse rail (Explore, trip styles, journeys).

- **Lead card and dots gone:** the tilted box with a fan of photos, the figure and See all leaves, and so do the position dots.
- **Header:** the title, one line of the rail's facts divided by thin rules, See all, and the arrows on a fine pointer.
- **Cards:** whole and on the page's edge: two on a phone, three from 560 px, four from 860 px.
- **Phone header:** keeps the first fact only.
- **Removed code:** the `LeadCard` function and the `HeroImage` import.

### Files touched

- **Modified:** `browse/StoryRail.jsx`, `styles/80-story-rail.css`

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Whole place cards in view, phone | 0 on arrival (the lead card at 58 %), then 1 and a part | 2 | +2 |
| Whole place cards in view, 1440 desktop | 3 and a part beside the lead | 4 | +1 |

### What broke and how it was fixed

- **Fact line on a phone:** the facts wrapped with a stray comma at the line start. They are now divided by rules, and a phone shows the first only. End check fix.

### What is still open

- **Dead lead-card CSS:** the `.storyr-lead*` and `.storyr-stack*` rules in `80-story-rail.css` are unused now (T908-a).

### End check screens

The rail at 390 and 1440.

### Rollback procedure

`git revert` the two T908 commits.

## T909: one price on a rail card

### What changed

A rail card shows one price, a person a day. The bed, food and way-there split (PriceParts' list) shows as one muted line from 860 px of rail width. Everywhere, the price is a tap away from its items, as before.

### Files touched

- **Modified:** `styles/80-story-rail.css`

### Commands run

`npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Prices on a phone rail card | 4 | 1 | -3 |

### What broke and how it was fixed

Nothing.

### What is still open

Nothing.

### End check screens

The rail cards at 390 and 1440 (harness cards use a plain price).

### Rollback procedure

`git revert` the T909 commit.

## T910: the footer

### What changed

- **Look:** a white band with one rule above it, on a 1240 px column.
- **Brand block:** the logo, one line ("What a trip in Europe costs, a person a day.") and a language picker using the app's own `setLang`.
- **Columns:** Explore, Plan, Carta and Legal, as disclosures that are open from 769 px and folded below.
- **Bottom line:** the year, "Prices are Carta's estimates from its own data.", and Privacy, Terms and Imprint.
- **Phone:** inside the app the footer stays hidden on a phone (owner, T622). The home page shows it, folded.

### Files touched

- **Modified:** `components/SiteFooter.jsx`, `styles/82-site-footer.css`, i18n (3 keys)

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

Nothing.

### What is still open

- **Currency picker:** the artifact showed one, but the app prices in euros only, so none was built.

### End check screens

The footer at 1440 (harness).

### Rollback procedure

`git revert` the T910 commit.
