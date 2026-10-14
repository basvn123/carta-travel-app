# T446: The destination page through impeccable: critique, fixes, re-critique

## Task ID

T446

## Date

2026-10-14

## What changed

The owner asked, after T429, to repoint impeccable's project brief, to "ensure that impeccable has done everything possible" on the destination page, and to publish a before and after showcase.

**Impeccable's own records**
- The surface brief named a target, `continent-app`, that no longer resolves. Run from the nested app repo, impeccable's root is `continent-app`, so the target became `continent-app/continent-app`.
- It was rewritten through `impeccable surface-brief write src` as `continent-app/.impeccable/surfaces/src.md`, the body unchanged, and the old file was removed.
- The design sidecar `.impeccable/design.json` was stale against DESIGN.md. It was regenerated alone (document.md step 4b), DESIGN.md untouched.
- `impeccable doctor` now reports no findings at the root or for the app.

**The critique, as impeccable specifies it**
- Two isolated sub-agents: A, a design review; B, the detector plus a live browser overlay.
- Snapshot 1, before any fix: **25/40**.
- Fixes were applied in one batch.
- The same dual-agent critique ran again on the fixed build: **26/40**. Both snapshots are in `continent-app/.impeccable/critique/`.
- A second batch then fixed what the re-critique raised.
- Impeccable's rule is one confirming round, then stop. The second batch was confirmed by screenshots and the checks below, not by a third scoring.

**Fixed in the first batch**
- **Price on the first phone screen.** A day line under the name, below 1024 px.
- **Things to do.** Photographs matched from the gallery captions too. The items with a photo form the track; the rest are a hairline list instead of hollow tiles.
- **Route rows in two lines.** Name, then distance from the centre, length, climb and grade. The stretch code moves into the row's title, still announced to a screen reader.
- **Village list.** Hairline rows, without the Wikidata descriptions.
- **Parking.** The city's untranslated paragraph is dropped.
- **English-only "why" sentence.** Hidden in other languages.
- **Sources.** The route and forecast credits are collected into one line before the utility row.
- **Map.**
  - Pin numbers in ink at 12 px; only the committed pin is brown. They were brown at rest since `--ink-fill` became umber in T438.
  - The credit starts folded.
  - The credit button on touch no longer tiles its icon.
- **Estimate mark.**
  - One notation in every language: German showed "gesch." and "Schätzung" on one card.
  - A glossary dot after "est." explains it (new glossary term `estimate`).
- **German strings.** Real umlauts in the route and direction strings; "Unternehmungen" in the rail.
- **English rail label.** "Day trips" for the section the owner named so.
- **Size floor.** No functional text under 11 px or figure under 12 px (the crowd badge, month initials, forecast labels).
- **Line length.** The intro capped near 75 characters.
- **Phone tracks.** They run to the screen edge.
- **Layout shift.** Gallery slides take their width before the photographs load (desktop CLS 0, from 0.0099).
- **Keyboard focus.** It never lands under the sticky rail or on a half-shown track card.

**Fixed in the second batch**
- **Travel times.**
  - A day-trip time from the trip model now carries the estimate mark ("~23 min by car est.").
  - The place itself is never listed as its own day trip.
- **Contradictions.** "Time here" left the key facts: it contradicted the intro and the card's stay.
- **Car hire.** Where the page says a car is needed, the price card says car hire is extra, with the figure.
- **Names.**
  - Stage codes are stripped ("Roma, Castel Gandolfo", "Romea Strata in Italia") and capitals set in the name's case ("Dorsale Aniene", "Anagnina").
  - "7 (The Blue Eye)" reads "The Blue Eye".
- **Walk and ride order.** Walks and rides lead, then peaks, lakes and beaches.
- **Translation leaks.**
  - The country appears in the reader's language, once ("Spitze von Italien").
  - In other languages, the English intro and opening-hours line hide (the guide link stays), and so do the highlight kinds.
  - Festival and cheap-stay months are localised.
- **Palette and selection.**
  - The selected rail link carries an underline mark.
  - The crowd badge and the weak-transit dot moved onto the ink palette (they were orange, green and danger red).
- **Rating fold.** No legend, no "70% of the score" weights, parts as hairline rows.
- **Sleep tiers.** One per line.
- **Packing.** A plain list, not chips that look tappable.
- **Price card text.** The Stay value ends in an ellipsis instead of pushing its chevron off the row. The day unit moves under the figure, so the estimate dot ends the figure's line.
- **Layout fixes.**
  - The village heading and its list no longer split into two columns at 1280: a class collision.
  - The bar's page name sits on the content gutter.
- **Tracks.** "Show less" also at the end of an expanded grid.
- **Numbers.** Climbs grouped by thousands.
- **Map controls.** MapLibre's blue glow is gone on a pointer press; the house ring stays on keyboard focus.

**The showcase.** A private page with the before and after screenshots, the brief item by item, the figures and the impeccable scores. Its link is in the handover message.

## Files touched

**Modified (app):**
- `continent-app/src/browse/DestinationPage.jsx`, `DestPriceCard.jsx`, `DestTrack.jsx`, `RoutesFromHere.jsx`, `MemberPlaces.jsx`, `DestMap.jsx`
- `continent-app/src/lib/glossary.js`
- `continent-app/src/i18n/{en,de,nl,fr,es,it}.js`
- `continent-app/src/styles/24-destination-workspace.css`, `25-feature-pages.css`, `64-v6-destination.css`
- `continent-app/scripts/verify_destination_page.mjs`, `verify_routes_block.mjs`

**Created (app):**
- `continent-app/.impeccable/surfaces/src.md`
- `continent-app/.impeccable/critique/2026-10-14T12-26-41Z__src-browse-destinationpage-jsx.md` (25/40)
- `continent-app/.impeccable/critique/2026-10-14T13-55-00Z__src-browse-destinationpage-jsx.md` (26/40)

**Deleted (app):** `continent-app/.impeccable/surfaces/continent-app.md`

**Modified (root):** `.impeccable/design.json`, `Execution/_OPEN.md`

**Created (root):** this report, `Execution/P11/T446-shots/`

## Commands run

```
impeccable doctor --json [--target continent-app]
impeccable surface-brief write src <body>      # from continent-app; then git rm the old brief
impeccable critique-storage write src/browse/DestinationPage.jsx <body>   # twice, with the scores
impeccable detect --json <page files>           # by Assessment B, twice: 0 findings
npm test                                        # 375 of 375
npx vite build ; npx vite preview --port 5297
CARTA_PORT=5297 node scripts/verify_destination_page.mjs | verify_routes_block.mjs | verify_explore.mjs
node scripts/verify_quality_floor.mjs t446f --port=5297 --only=pages
node scripts/ci/design-lint.mjs ; node scripts/ci/token-contrast.mjs
ONLY=destination-page RUNS=3 node scripts/perf/baseline_vitals.mjs   # then git checkout its report file
node scripts/measure_destination_page.mjs --port=5297 --label=t446 --shots=../Execution/P11/T446-shots
```

Two checks ran as untracked copies with one line changed, as in T429: `verify_handoffs` (port, row T429-e) and `verify_keyboard` (Explore selector, row T429-c).

## Config and secrets set

None.

## Before/after measurements

| Metric | T429 | T446 | Delta |
|---|---|---|---|
| Impeccable critique (dual agent) | 25/40 | 26/40 after batch 1; batch 2 not re-scored | +1 measured |
| Impeccable detector findings on the page files | 0 | 0 | 0 |
| Impeccable doctor findings (root and app) | 2 | 0 | -2 |
| Day price on the first iPhone screen, Rome | no | yes | fixed |
| Things to do photos shown, Rome | 0 | 4 in a track, 6 in a list | +4 |
| Small-metadata flags on the destination page (quality floor "mute": text outside 12 to 14 px), phone | 14 | 0 | -14 |
| Covered or invisible keyboard stops, destination (380 / 1280) | 0 / 3 | 0 / 0 | -3 |
| Layout shift (CLS), desktop / phone, `#dest=gem:valbona` | 0 / 0.0038 (end of T429) | 0 / 0.0038 | 0 (phone shift is the tab behind the page) |
| Estimate notations on one German card | 2 | 1 | -1 |
| Words on the first screen, Rome phone / 1280 / 1440 | 135 / 168 / 201 | 134 / 161 / 193 | -1 / -7 / -8 |
| Words on the first screen, Valbona phone / 1280 / 1440 | 123 / 157 / 190 | 120 / 148 / 180 | -3 / -9 / -10 |
| "When to go" starts, Rome phone, in screens | 1.82 | 1.83 | +0.01 |

The phone count holds while the day line was added above the intro, because "Time here" and the English-only lines left; in English the intro is unchanged.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Village heading and list side by side at 1280 | The wrapper took the list's grid class `.destp-members` | Wrapper renamed `.destp-villages` |
| Rail stopped selecting When | Scroll padding on the scroller moved the landing point past the rail's 60 px line | Focus offset put on the focusable controls, sections keep their margin |
| Three track cards covered when tabbed to at 1280 | Snap left a focused card half outside its strip | The strip brings a focused card to its start, instantly |
| Name cleaner dropped "Roma" and "Theth" | A case-insensitive code pattern matched short words | Codes matched case-sensitively, stage words case-insensitively |
| Rail mark as box-shadow failed design-lint | `shadow-literal` rule | Drawn as a 2 px underline |

## What is still open

- **T446-a (owner):** how long the price card prices. It uses Carta's default 7 nights; the page may say half a day (Valbona) or three or four days (Rome's intro).
- **T446-b (owner):** what the day figure covers. It is bed plus food; PRODUCT.md says bed, food and local transport.
- **T446-c:** the trip model's drive times are straight-line ("Theth, 23 min by car" from Valbona). They are marked as estimates now but are wrong on mountain roads; the pipeline should route them or drop the minutes.
- **T446-d:** the same landmarks appear in the gallery, Things to do and Highlights, and the map labels only some of its numbered pins. One numbered track tied to the map would remove the repetition.
- **T446-e:** the dossier's intro, rhythm line and highlight kinds are English only; they now hide in other languages, so those pages are shorter until the text is translated.
- **T446-f:** impeccable run from inside `continent-app` (its own git repo) cannot see PRODUCT.md and DESIGN.md at the outer root; sessions read them directly.
- **T446-g:** the shared Lifestyle panel opened from the price card still carries method lines ("Two answers set what a day costs..."), "Fine tune the counts" and ten tiles at once.
- **T446-h (owner):** the kit Score draws an outlined star below tier 2 and a filled one above; reviewers read that as rated versus unrated.
- **T446-i:** `verify_keyboard` waits 60 ms after Tab, so a focused element still scrolling can read as invisible (seen once, not reproducible).

## Rollback procedure

`git revert -m 1 <merge of p11-destination-polish>` in both repos, then rebuild. To roll back only the brief: restore `continent-app/.impeccable/surfaces/continent-app.md` from git and remove `src.md`. No data, schema or deploy changed.
