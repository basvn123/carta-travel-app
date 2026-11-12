# Carta design direction

Status: **draft for owner approval** (T1111, roadmap G1, 2026-11-06). Until the owner signs it off, nothing here binds; G3 (S38) and G5 (S40) wait on that sign-off. Once approved, the carta-design skill takes over its decisions (row T1111-b) and stays the top design source, as CLAUDE.md says.

Built from: the carta-design skill, the impeccable skill, `PRODUCT.md`, `DESIGN.md` (Overview, Named Rules, Typography, Elevation, Shapes, Motion, Home page v3), `docs/research/2026-11-launch-plan-research.md` and the G rows of `docs/AUDIT-2026-11.md`. The user research G-R1 to G-R3 has not run yet; where it later disagrees with this page, the research wins and this page is revised.

## 1. What Carta looks and feels like

**One sentence:** a warm travel app whose photos sell the place and whose money is drawn on one deep umber card, the same card everywhere, so the traveller learns to trust it.

- **Warm and human.** Paper and mist grounds, blue-grey ink, Phosphor duotone icons, soft umber depth, plain sentences. Never black, never cold.
- **Clean and compact.** About ten places on a phone screen in a list. Fold a second explanation into the object it explains; never a loose row under a card.
- **Dynamic with meaning.** Things add up, grow in order and light up on cue. Nothing loops, nothing follows the scroll.
- **Honest about money.** Every figure through `formatMoney()`, the flight named as Google Flights', a missing figure hidden or `NotYet`, never guessed.

Two modes, two tempers. The home page is **Persuade**: film, big type, signature motion. App screens are **Operate**: dense, steady, figures that settle in place. They share one card, one shadow, one type scale, one set of springs and one set of cost colours.

## 2. What changes from today

| Today | After this direction |
|---|---|
| The home page (v3) has the owner's approved language; the app screens mostly do not | The home page's card, cost colours, springs and type reach the app, scaled down for Operate |
| Three money cards: the home receipt, the place page's trip card (umber), the plan tab's arc card (T1026-c) | One umber cost card (G3), arc retired |
| `motion` only on the home page; the app uses CSS tokens with no shared springs | One motion kit for app and home (G5) |
| 1,740 literal font sizes, 775 literal radii, 4,638 uses of legacy aliases | Every size and radius on the scale (G6) |
| Place head built 3 times, carousels 4 times, link buttons 3 times | One of each in `src/components/ui/` (G2) |
| About 22% of walks carry a photo; grey tiles while images load | A photo or a styled map thumbnail on every card (G8) |
| A selected tab on the place page is an ink filled pill | Selected is the light umber tint with an umber label (No Slab Rule, already in DESIGN.md) |

## 3. The signature moves

**The umber cost card.** Every place where Carta adds up money (Explore card detail, place page, plan tab, receipt, the home page's real cost act) uses one component on `--home-ground-deep`, `--radius-stage` (28 px), the soft umber shadow and white or `--umber-50` text. In bands: the total in `--text-total` with tabular figures and its per person line; the choices that move it (way there, where you sleep, how you eat) as rows on a lighter umber tint; the cost bar in the three cost colours (flight `--sun-400`, bed `--action`, food `--lagoon-600`) with what is not priced drawn as a dashed track; the lines with what moves each one; a foot strip with the one primary action. On an Explore row or card the price stays a plain ink line; the umber card is where a figure is explained, not where it is listed.

**Motion.** One shared kit (springs `quick` 0.2 s, `surface` 0.32 s, `reveal` 0.64 s, no bounce in the app) built on the existing `--dur-*` and `--ease-*` tokens. One meaningful moment per surface: on the cost card the bar grows from the left and the total **settles** in place when an input changes (Operate never counts up, per the Tabular Rule); the home page alone keeps its one count-up from the flight's price to the week's total. The card-to-place photo move carries the photo from the Explore card into the place head. Reduced motion shows every end state at once.

**Type.** Figtree only, tabular figures everywhere. Showcase weight 800 with tight tracking for totals and home headings; the app keeps headline 700 and title 600. Every size from the `--text-*` scale, nothing under 11 px, no figure under 12 px.

**Radius and depth.** Three radii in use: `--radius-control` (10 px) for controls, `--radius-card` (16 px) for photos and app cards, `--radius-stage` (28 px) for the umber cost card and home panels; sheets keep 20 px, pills stay round. One elevation per object: a border at rest or the soft umber shadow for the cost card and what floats.

**Imagery.** Licensed photography leads, credit always shown, never AI images of places. Where no photo exists (routes, things to do) a map thumbnail in brand colours (mist ground, umber route line, lagoon water) replaces the grey tile. Loading shows a sized skeleton in mist, never an empty grey box.

## 4. What stays locked

- Accessibility: 4.5:1 text contrast (3:1 large), 44 px targets, visible 2 px umber focus, reduced motion honoured, colour never the only carrier, real buttons and links.
- Honest numbers and claims, `formatMoney()` for every euro, Google Flights' price shown as theirs.
- Copy: six languages through i18n keys, no em or en dashes, the banned words list, sentence case.
- The palette roles: umber acts and selects, saffron is best value and the flight, lagoon is food and "fits"; ink is blue-grey.
- Figtree, Phosphor duotone, licensed photos with credit, no text laid over a photo in the app (the home film is the one exception, v2 and v3).
- The home page v3 as approved; this direction carries it outward, it does not redo it.

## 5. How each later G item follows

| Item | Session | What it takes from this page |
|---|---|---|
| G2 Shared parts | S37 (T1121) | `PlaceHead`, `PhotoCarousel`, `Chip` tones (rank, UNESCO), `Button href` built to section 3's radii and depth, so G3 and G8 drop into them |
| G3 Umber cost card | S38 (T1122) | The card spec in section 3, one component in four places, arc retired (closes T1026-c), figures on `--text-amount` / `--text-total` with tabular numbers |
| G5 Motion | S40 (T1124) | The shared kit, the settle versus count-up split, the card-to-place photo move, reduced motion end states, INP measured before and after |
| G6 Type and radius | S41 (T1125) | The scale and the three radii in section 3; legacy aliases removed |
| G8 Imagery | S43 (T1127) | Photos first, styled map thumbnails second, mist skeletons; never a grey tile |

## 6. Before and after, from today's dev server

Screenshots taken on 2026-11-06 with `npm run dev` at 390 x 844 and 1440 x 900, saved in `.work/shots/T1111/` (gitignored, not committed). The container could not reach Wikimedia, so place photos show as grey tiles; that is the network, not the app, though it previews what a slow image load looks like (P-38).

1. **Place page, Rome (`place-desk.png`, `place-tcard-phone.png`).** Before: the trip card is already umber with a soft gradient, a €2,355 total for two, way-there rows with Fastest and Cheapest, stay chips and the lines; the selected "Overview" tab beside it is an ink filled pill. After: the same card becomes the one cost card, gains the three colour cost bar under the total and a foot strip with one action; the tab takes the umber tint.
2. **Explore, phone (`explore-phone.png`).** Before: rails of large photo cards with the Score and "€138 a person a day" in ink, grey tiles where photos have not arrived. After: unchanged structure and ink price line; mist skeletons sized to the photo, and walks without a photo show a brand map thumbnail.
3. **Plan home, phone (`plan-phone.png`).** Before: headline with an umber accent, two stacked buttons and a fanned deck of trip cards that stays grey while images load. After: the deck uses the shared carousel and skeletons; a trip's cost opens on the same umber card as the place page instead of the arc.

## 7. Sign-off

The owner approves this page, or tells Claude what to change. Open decisions for that review: (a) the plan tab follows the place page's trip card (T1026-c, this page says yes); (b) count-up only on the home page, settle everywhere else; (c) the 28 px stage radius on the app's cost card.
