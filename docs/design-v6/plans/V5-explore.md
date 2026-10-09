# V5 plan: Explore, the map tab (T403)

Written by T403 (design wave V5, 2026-10-08) before the first app edit, from `docs/design-v6/briefs/explore.md` (part 6, V5 list, and its Direction check), `docs/design-v6/DIRECTION.md`, `docs/design-v6/OWNERSHIP.md`, the T393 report and impeccable's audit, harden, adapt, polish and clarify references.

## Audit and critique of the V4 result

Impeccable context was run from the root worktree with `--target src/browse/ExploreTab.jsx`; as in V1, V3 and V4 it resolved the app repo and reported NO_PRODUCT_MD (row T372-g), so PRODUCT.md and DESIGN.md were read directly. The run is unattended under the owner's instruction of 2026-10-07: the decision page, live mode and every question are skipped, and each choice keeps Carta's palette, type and identity. The audit here is one session's own: the detector, the design lint and a Playwright scan on iPhone 13 (WebKit), Pixel 5 and 360 x 740 (Chromium) and 1280 x 800, in English, German and French. No sub-agent critique was run (cost, and the V4 critique of the same surface is under a day old); this is a refinement wave on a result that scored 26 of 40.

Findings, measured on the merged V4 state (dev server on 5203):

- Detector: 0 findings over the nine Explore files. Design lint: 166 violations, all in the baseline.
- Tap boxes on a phone (iPhone 13, Pixel 5, 360 x 740, same on all three): 51 interactive elements inside `.explore-tab` under 44 px by their own box. 48 are the card stars (27 px with an invisible 9 px ring around them, so the true hit area is 45 px but the control is not honest about it), 3 are the "See all" links (22 px high, a pseudo-element supplies the tap area). At 1280 with a fine pointer nothing is under 32 px, the owner's fine-pointer floor.
- Horizontal page scroll: none on any device or language.
- Truncation: card names, rail card names and country lines end in an ellipsis on every phone (Agrigento (Valley of the Templ..., Siena & Val d'Orcia, Dolomites (Cortina), Theth & Albanian Alps). German and French labels in the input row fit at 360. On a two-up phone card with a swim badge the country is dropped for the flag (Lisbon shows no "Portugal"; row T393-k).
- Map failure: the map has no error path. If the basemap style does not load the frame stays `--paper-dim` and empty for ever.
- Labels on the map are placed from an estimated box (`LABEL_CHAR_W`); row T393-g asks for the measured box.
- The Tab walk, the cheapest pin, the popover and the rail keys were fixed in V4 and are rechecked, not rebuilt.

## The changes, in order

1. Tap targets that are the size they claim. On a coarse pointer the card star becomes a `--tap` box at the card's top right with its 28 px disc drawn inside (the same construction the info control already has), the info control moves down to sit under it, "See all" gets a real 44 px box, and the rail arrows, the country arrows and the Score key control are checked and given `--tap` where they are not. Fine pointers keep 32. Files: `62-v6-explore.css`. Check: the scan counts 0 elements under 44 px inside `.explore-tab` at 360 on touch (51 today), by their own box.
2. Names that say the action. Checked first: chips already read "Remove ...", the shortlist chip says "Show only your shortlist, N saved", pins already add the day cost. The one gap found is changed if it exists. Files: i18n only if a string changes. Check: verify_keyboard's pin label and an axe pass on the chips.
3. Calmer keyboard walk. Rechecked: the popover opens on focus after 400 ms, so a Tab walk through the grid shows no strobe. Check: verify_keyboard explore-grid.
4. Names are whole. Card names, rail card names and the country line wrap to two lines instead of ending in an ellipsis (a two-line clamp keeps the card height bounded); on a two-up phone card the country and the swim badge share the place line, wrapping the badge under the country instead of dropping the country (T393-k). Files: `62-v6-explore.css`. Check: the de, fr and en walk at 360 and 1280 finds no card, rail card or country text clipped by an ellipsis on a visible element except at the two-line clamp, and the Lisbon card shows "Portugal".
5. Map failure and offline. When the basemap style or tiles fail to load, the frame says so in one line ("The map did not load. The list still works.") and offers "Back to the list" which switches the view; the list is untouched. A style that has not loaded after 12 seconds is treated as failed; a tile error after the style has loaded is not (the pins are drawn from our own data). Files: `ExploreMap.jsx` (an `onBack` prop and the failed state), `ExploreTab.jsx` (passes `onBack`), `62-v6-explore.css`, i18n `explore.mapFailed` and `explore.mapBack` in six languages. Check: blocking the style URL in Playwright shows the line and the button, and the button returns to the list.
6. Label collision from the drawn size. The label box is measured from the drawn label (a canvas text measurement in the label's own font) instead of 6.6 px a character (T393-g). Files: `ExploreMap.jsx`. Check: verify_map_size_cards and the Venice zoom-8 count still show 0 overlapping pairs.
7. Lifestyle door. Not changed: the Lifestyle control belongs to the shell. Checked only that it opens with a scrim on both widths.
8. Clean-up in files this surface owns: the stale "modal sheet is gone" comment in `ExploreFilterRail.jsx`. The dead `.xgrid-count` rule is in 24-destination-workspace.css and the sheet count spacing in `PlacesFilterSheet.jsx`; neither is Explore's, so both are register rows, as is the move of the old Explore rules out of 24 and 25 (T393-h).
9. Phone and final pass. Landscape (844 x 390), tap only, the on-screen keyboard (field and submit visible, bottom nav not over them), safe areas, 100dvh, thumb reach, no layout shift from motion, 360 to 1440, long names and empty data, six languages, and INP and LCP against `scripts/perf/baseline_vitals.mjs` where it covers the surface.
10. Harnesses: verify_explore (T393-a: the two destination-page checks fail on V4; confirm the cause and update with a comment or hand it back as a row), verify_map_size_cards, verify_shortlist (the star's new box), verify_fare_provenance, verify_keyboard. A changed assertion keeps a comment saying why.

Not in this wave, as register rows: the shortlist star's on colour (T393-d, owner), chip exit motion (FilterChips is the shell's), the sheet's count spacing and the dead `.xgrid-count` rule, the journey page's ring-less stop (T393-j, trips), moving the old rules out of 24 and 25.

## Checks

`npm run lint` 0 errors, `npm test`, `node scripts/ci/design-lint.mjs` 0 new, `node scripts/check_ownership.mjs`, the six i18n catalogues parsed, `npm run build` (dist and dist-data deleted after), the five Explore harnesses, verify_quality_floor (explore flows), `impeccable detect --json` over every changed file, and the phone walk above. After screenshots (at most ten) to `design-v6-shots\explore\V5-<view>-<device>.jpg`.
