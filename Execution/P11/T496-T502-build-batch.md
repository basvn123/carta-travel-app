# T496 to T502: the approved designs built (shell, pass, Explore, destination page, trip and day planner)

The owner approved the seven designs of T484 to T492 and answered all 55 open questions in the decision sheet (T495, https://claude.ai/artifact/UeUtVU7C7zXPQT5NwYXCZU). This batch built them in the app, at the owner's request with the impeccable skill and carta-design as the authority.

- **How it ran:** six build tasks, each an Opus agent in its own app worktree, merged into `p11-build-batch` in three waves:
  1. T496, T497 and T499;
  2. T498 and T500;
  3. T501.
- **End check:** T502 did the cleanup and the one browser check on the merged batch, at 390 px touch and 1440 px, and fixed what it found under the task that caused it.
- **Checks per task:** eslint, `npm test`, design-lint, `impeccable detect` (no findings in any task) and the fast build.
- **Shared header:** date 2026-10-21; rollback below.

| Metric | Before (T495) | After (T502) |
|---|---|---|
| Unit tests | 463 pass | 539 pass, 0 fail |
| Pages build | 163 files | 167 files, under the ceiling |
| `GuidedTripWizard.jsx` | 3,614 lines | 1,595 lines (steps in `src/planner/wizard/`) |
| `DestinationPage.jsx` | 1,375 lines | about 560 lines (tab modules) |
| `DestinationsTab.jsx` | 4,012 lines | about 3,815 lines (cards in `DestCards.jsx`) |
| i18n keys removed as unused | | 130 per language |
| Register rows closed | | 79 |

---

## T496: shell and navigation (roadmap 1.3a, 2.18)

### What changed
**Places and addresses**
- The app has three places plus an account icon: Explore, Plan and My trips.
- Home sits behind the logo on desktop, and behind "How Carta works" in Account on a phone.
- New addresses: `tab=explore|plan|trips|account|home|pricing`, `mode=new|trip|day` and `cat=`.
- `LEGACY_TABS` leads every old link (`map`, `places`, `destinations`, `trip`, `day`, the hashes) to its new place.
- My trips and Account have a history step, so phone Back closes them.
- `/pricing` works in every language path.

**Header and bottom nav**
- Desktop header: logo, then Explore, Plan (with a dot for an unsaved plan) and My trips (star count). Search and a 44 px account disc sit far right.
- Gone from the header: Home, Destinations, the two planner tabs, "Get a pass" and the strapline.
- Phone: a four-slot bottom nav at `--tap-main` 48 px. The plus and the chooser are gone, and the empty 56 px header row is removed.

**Plan, settings and page structure**
- Plan: "Plan something new" with Trip and One day tiles when nothing is in progress; otherwise it returns to the last view.
- Settings line: real dates with "Suggested dates" and a Nights stepper. On a phone it is one sentence ("Prices for 14 Nov to 21 Nov, 2 people") that opens one sheet.
- Language and currency moved into Account.
- Landmarks and a skip link were added.
- Dead pass CSS and the header px font sizes were removed.

### Files touched
- `App.jsx`, `lib/urlState.js`, `lib/pathBoot.js`
- `components/AppHeader.jsx`, `components/BottomNav.jsx`, `components/SettingsLine.jsx`
- `auth/AccountPanel.jsx`
- styles `01-tokens`, `10-shell`, `16-auth`, `24-destination-workspace`, `26-shortlist-extras`, `60-v6-shell`
- i18n (24 keys in six languages)
- `tests/urlPlaces.test.mjs`, `scripts/verify_bottom_nav.mjs`, `scripts/ci/smoke.mjs`
- Commits `e9c8ae1` and `1572a2e` (pricing Back on a cold visit).

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| Phone settings sentence cut to "2 ..." | "Prices for" hid only below 360 px | Hidden up to 440 px (T502) |
| Reset button showed a raw key | `settings.resetToCartaDates` never added | Uses `settings.useCartaDates` (T502) |
| Account sections at 28 px with a 16 px title, grey language tiles | Old panel padding and tokens | 16 px phone gutter, tiles on `--surface` (T502) |
| `/pricing` answered 404 live, then 308 to `/` | A real 404.html ends the Pages fallback; a rewrite to /index.html is answered with a 308 | Rewrites to `/` in public/_redirects |
| PricingPage add/add conflict at merge | T496 placeholder and T497 page at one path | Kept T497's page; App passes `onBack` (Explore on a cold visit) |

### End check
Done in T502: the header (guest), the bottom nav, Plan start, the settings sentence and sheet, Account, the old links and `/pricing`.

---

## T497: pass moments and the pricing page (roadmap 1.15, 2.18)

### What changed
- **Gates:**
  - Every PDF asks for a Trip Pass, including item, journey and TripPriceCard PDFs (gate in `useItemPdf`).
  - Calendar and map exports have their own headings.
  - Sharing and co-planners are free; the share gates and their sheet are gone.
  - The celebrate nudge is removed.
  - Booking import asks for the pass when a file is dropped and keeps the file with a "Read it" button.
- **Pass sheet:** logic in a pure `lib/passMoments.js`. The 1.15 headings always say "Trip Pass" with the price from `pricing.js`. The Trip Pass is listed first and preselected at every hard gate, and the button reads "See Trip Pass prices".
- **Free sentence:** one key, `pass.freeSentence`, in exactly six places. Account's Your plan block now shows to guests too.
- **New `/pricing` page** (`pass/PricingPage.jsx`, `styles/72-pricing.css`):
  - the free sentence;
  - Free against "A Trip Pass adds" as one bordered object;
  - the Trip Pass (€6.99, 60 days, the primary) and the yearly plan (€14.99);
  - answers on what happens after 60 days, accounts, cancelling, refunds and restoring a pass.

### Files touched
- `components/PassModal.jsx`, `hooks/usePaywall.jsx`, `hooks/useItemPdf.js`, `lib/passMoments.js`
- `auth/TripSharePanel.jsx`, `auth/account/PlanSection.jsx`, `auth/account/FaqView.jsx`
- `planner/MagicImportZone.jsx`, `planner/TripItinerary.jsx`, `planner/DayPlannerTab.jsx`, `planner/TripPlannerTab.jsx`
- `pass/PricingPage.jsx`, `styles/72-pricing.css`, i18n, `tests/passMoments.test.mjs`
- Commits `892cee7` and `5199fba`.

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| A lone green dot under "Free" for a guest | The empty status line still drew its dot | The empty line is hidden (T502) |

### End check
Done in T502: the pass sheet from a trail PDF, Account Your plan as a guest, and `/pricing`.

---

## T498: Destinations folded into Explore (roadmap 1.3b)

### What changed
**Explore and the trip library**
- Explore has six category tiles (Places, Trails, Beaches, Lakes, Mountains, Cycling), 3 by 2 on a phone and two across in the desktop panel. Every switch writes `cat=`, and the picked country carries over.
- The trip library is a "Trip styles" row on Places, "Weeks in {country}" on the country page and "Weeks here" on the region page. Every older trip path still works.
- In the library, chips hop between styles, back paths name where you came from, and trip cards say "From ~€X est. a person a day".

**Country and region pages**
- The country page is now a real page at `#country=IT`: page bar, facts with a `day-price` InfoDot, a month strip, a 48 px "Plan a trip in {country}", rows for best places, weeks and cities, and doors to the outdoor layers.
- The region page leads with a 3:2 photo, then "Bed and food in {city}:". Best months show only when at least half the towns have climate data. It ends with "Plan a trip here".

**Outdoor layers and filters**
- Outdoor layers have List and Map, and the "Bed and food in {city}" line.
- One shared empty result block.
- The filter sheet's primary reads "Show 38 beaches".
- "Trip type" is now "Kind of place".
- "Mock data" goes through i18n.

### Files touched
- `browse/ExploreTab.jsx`, `browse/DestinationsTab.jsx`, `browse/DestCards.jsx` (new), `browse/CountryPage.jsx`, `browse/RegionPage.jsx`
- `browse/JourneysSection.jsx`, `browse/TripFilters.jsx`, `browse/PlacesFilterSheet.jsx`, `browse/ExploreFilterRail.jsx`, `browse/PlaceCard.jsx`
- `lib/regions.js`, `lib/tripFilters.js`, `lib/glossary.js`, `App.jsx` (category, country and region addressing)
- styles 45, 62, 63; i18n; three new tests; `verify_regions.mjs`, `verify_destinations.mjs`
- Commit `8ef541a`.

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| T496 wrote `cat=trips` on every switch | Fixed category in the sections row | The address names the picked category |
| No Filters button in the phone trip list | `.xchips-lead` shown only inside `.explore-shell` | Shown in `.tlib-refine` (T502) |
| Rail tiles printed a length, not the price line | RailTile had no price | `bedFood` line added (T502) |
| "See all" in brown; back links 8 px off the gutter; hidden h1 read "Destinations" | Old selectors and margins | Fixed (T502) |

### End check
Done in T502: Places with tiles and the Trip styles row, Beaches List and Map, the filter sheet, the styles list and one style, `#country=IT`, `#region=COAST:IT-AMALFI` and an empty result.

---

## T499: the destination page in four tabs (roadmap 1.4)

### What changed
**Layout and tabs**
- Above the tabs: the PageBar, the gallery and the head. The head reads "~€87 est. a person a day" and "A bed plus food and drink.". That sentence comes from `dayIncludesText()`, with one key per part, so a transport estimate is one more part later.
- Four tabs: Overview, Nearby, When to go and Practical. They stick under the PageBar, are 48 px on touch, and use `replaceState` with `&tab=`. The section rail is gone.

**Overview**
- Key facts.
- Things to do (top four), or "What to see" when a place has no do items.
- "Around {city}" with category chips. The default is the category with the most items (at least two), and every empty category goes into one sentence with NearestLine.
- For areas, Around comes first.
- The compact year strip and the MET forecast.
- The phone price card after the year block.
- "Download PDF guide".

**Links, PDF and checks**
- Outdoor tiles, day trips and NearestLine are real links.
- The PDF lists the `nearby` rows and speaks the reader's units.
- Checked on Rome, Zungoli and Valbona data.

### Files touched
- `browse/DestinationPage.jsx` plus new `DestOverview`, `DestNearby`, `DestWhen`, `DestPractical`, `DestTiles` and `DestForecast`
- `destParts.js`, `lib/dayIncludes.js`, `lib/featureHref.js`, `browse/ClimateStrip.jsx`, `browse/CoverageEmpty.jsx`
- `lib/destinationPdf.js`, style 64, i18n, `tests/destOverview.test.mjs`
- Commits `f6be973` and `a20193e`.

### What broke and how it was fixed
No issues found in the end check. One limit stays: opening `#dest=` directly strips the hash, so `&tab=` is written only when the page was opened from a card (T502-b).

### End check
Done in T502: `#dest=FCO` on all tabs at both widths.

---

## T500: the trip planner in one workspace (roadmap 1.3c, 1.17)

### What changed
**Wizard**
- Six steps: Booked and Who are one step.
- From 1024 px the step takes the left 55%; the right column holds the price card, then the map. Picked countries are `--select-bg` with an ink edge.
- `TripTotalBar` reads only `priceTrip()` and opens the receipt.
- Country and match cards have one spoken name: "Italy, from about €87 a person a day".
- Plural keys replace numbers outside keys, and the arrival field has a visible label.

**Planned trip**
- List order: name, receipt, route, days, kit, Export & share. The Overview and Day by day tab is removed.
- Desktop: list and map side by side, with the total bar.
- Phone: the new reusable `MapDrawer` (strip `--drawer-strip`, half, full). The amount is always in the strip, the handle is a button, and the bottom nav hides when the drawer is full.
- The edit view uses `PlanTotal`.

**Saving and hand-off**
- A guest's trip saves to `carta.deviceTrip.v1` and shows "Saved on this device". There is an error state for private mode.
- A second trip opens the pass sheet.
- At sign-in, the traveller chooses which trip to keep.
- A day opens in `mode=day` with the trip's city, date, party and Lifestyle filled in.

### Files touched
- `planner/GuidedTripWizard.jsx` and `planner/wizard/*` (new)
- `planner/TripPlannerTab.jsx`, `planner/TripItinerary.jsx`, `planner/PlanTotal.jsx`, `planner/CountryMatchCards.jsx`, `planner/ReadyTripsStep.jsx`, `planner/PartyEditor.jsx`
- `components/MapDrawer.jsx`, `components/TripTotalBar.jsx`, `lib/mapDrawerState.js`, `lib/deviceTripStore.js`
- `hooks/useTripPlanner.js`, `map/CountryPickerMap.jsx`, planner styles, i18n, three new tests
- Commits `3d8aa9a` and `e35a93e`.

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The planned trip ran into both screen edges | No side padding on `.itin` | 16 px gutter (T502) |
| A raw key in the wizard; the recap wrapped with a large gap; calendar days 26 px high; "Change" misaligned | Missing key and layout gaps | Key added, one scrolling row, 44 px days, aligned (T502) |
| The empty total said "as soon as you choose where to go" after a country was picked | Wrong copy for the state | "Priced once the trip has its places." in six languages (T502) |
| A map console error and a font 404 | MapLibre rejects the dash pattern; the font is missing on CARTO | Separate dotted layer, and a font CARTO serves (T502) |

### End check
Done in T502: the wizard steps, the planned trip on desktop, and the drawer in strip and full.

---

## T501: the day planner (roadmap 1.3d, 1.17)

### What changed
- **Detail control:** a quiet control with three levels: List (default), Parts of the day, By the hour. The choice is kept per traveller.
  - Parts of the day shows Morning, Afternoon and Evening heads, each with an Add, plus Lunch and Dinner rows without amounts.
  - `DAY_BANDS` replaces the dead `DAY_PHASES`.
- **Order:** "Move earlier" and "Move later" cross parts. Adding never reorders the day, and "Best route" asks first.
- **Tickets:** they count per person where the price is known, with "Ticket, price not known" otherwise. The receipt has a Tickets line. The catalogue has no fee data yet.
- **Desktop:** a fixed cost bar that shows the trip first inside a trip.
- **Phone:** the map behind MapDrawer, with "~€108 est. a person a day" in the strip. Tapping it opens the receipt sheet, and the Google Maps parts sit in the drawer.
- **Removed:** the DayBar, the phone map card and the Segmented control.
- **Day from a trip:** the PageBar reads "Back to {trip name}", and an empty day opens at What.
- **Guest chat:** it keeps the answers through sign-in and runs the plan after.
- **Builder:** a 48 px "Add to day".

### Files touched
- `planner/DayPlannerTab.jsx`, `planner/DayPlanPanel.jsx`, `planner/DayOverview.jsx`, `planner/daySchedule.js`, `planner/dayDetail.js`
- `planner/CartaChatPlanner.jsx`, `planner/DayExploreBuilder.jsx`, `lib/dayTickets.js`
- `App.jsx` (props), day planner styles, i18n, `tests/dayBands.test.mjs`
- Commits `bc7b24a` and `5a58652`.

### What broke and how it was fixed
No issues found in the end check (T502 looked at Parts, the Best route ask and the desktop day).

---

## T502: cleanup and the batch end check

### What changed
- **Removed:**
  - dead CSS: `.trip-sheet*`, `.trip-mapcard*`, `.trip-mapfull*`, `.tf-chips`, `.tlib-bar`;
  - 130 unused keys in each language;
  - `FirstRunReceipt.jsx` (FlightSheet now lives in `components/FlightSheet.jsx`).
- **Small fixes:**
  - month ranges read "May to Jun";
  - the trip length control shows only in the sheet on a phone;
  - `journey.spendLabel` was restored;
  - Explore no longer jumps to the top on return;
  - a React key warning and a "Clear search" that looked disabled are fixed.
- **Harnesses:** the eight main-flow harnesses are updated.
- **CSS routes:** the proof is green again. 144 route rules are held in first paint, and the `--hold` script covers more cases. The design-lint baseline went from 7717 to 7720 because rules moved; no new violation.
- **End check:** every screen listed above, at 390 and 1440, with one fix round and one confirm round.
- 14 commits, `332ee4b` to `7152d8e`.

### What is still open
In the register:
- **T497-a:** add a link to `/pricing`.
- **T498-a to e:**
  - a country save button;
  - "Plan a trip here" seeds only the country;
  - back labels on item pages;
  - Back on a region page;
  - the number of rails (user).
- **T500-a and b:** the device trip in My trips; wizard pins.
- **T501-a:** chat resume window.
- **T502-a to i:**
  - month names are English;
  - the hash is stripped on a direct open;
  - a reload of a day drops the trip day;
  - two data slips (Naples pin, a duplicate "Napoli coast");
  - catalogue counts on the wizard cards (user);
  - icon labels read aloud;
  - a double "no match";
  - old `?tab=places` links (user);
  - 52 older harnesses.

Rows that stay open from before: T484-h, T491-m, T492-h, T492-i, T494-a.

## Deploy
- **Build and deploy:** app `master` merged the batch (`c1d030d`). `npm run build:pages` produced 167 files and was deployed to Cloudflare Pages as `46f0175e`.
- **Live probe:**
  - `/`, `?tab=explore` and `?tab=plan` answer 200, and `/api/forecast` answers 200.
  - The live bundle `index-DP9n8S2Q.js` matches the build.
  - `/pricing` answered 404, because the deploy now carries a real `404.html`, so Pages no longer falls back to the app.
- **Pricing fix:** `public/_redirects` rewrites `/pricing` and `/:lang/pricing` (`495b954`). The first version targeted `/index.html`, which Pages answers with a 308 to `/` and so drops the path. The target became `/` (`fcf1169`).
- **Final deployment:** `756c33ac`.
  - In a fresh browser, `/pricing` opens "Trip Pass prices" with the free sentence, €6.99 and €14.99.
  - A browser that hit `/pricing` during the few minutes of `94be1632` may have cached that permanent 308.

## Rollback
- **App:** `git -C continent-app revert -m 1` the merge of `p11-build-batch` into `master`, or revert one task's merge (each task merged as its own `Merge p11-t49x` commit), then redeploy.
- **Production:** roll `carta-app` back to `d52ff1a2` in the Pages dashboard.
- **Root:** revert the report commit and the mirror commit.
- **Data:** none changed.
