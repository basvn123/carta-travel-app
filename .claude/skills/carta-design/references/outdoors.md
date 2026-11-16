# Outdoors rules (reference)

## The look (house style, outdoors lane 2026-11)

The trail, cycle, beach, lake and mountain pages wear the place page's template (`.pt-*`, `88-place-template.css`, the place lane's); `src/styles/89-outdoor-page.css` adds what only they draw, scoped to the root `.oxp`. Shell: `OutdoorPage` in `src/browse/OutdoorParts.jsx`.

- **Order of the first view:** photos, the head (name, where, the ink Score plate, standing tags), **the board**, the jump bar, the hook. The board is the first thing read after the name at every angle; at 1440 x 900 it ends above the fold (the mosaic is 320 px on these pages from 1024 px).
- **The board** (`.ox-board` around `KeyFacts`): one paper panel with a hairline frame (`--radius-panel`), hairlines between cells, label (`--text-label`, a bare 14 px icon, `--text-2`) over the figure (`--text-lead` on a phone, `--text-title` from 600 px, 800, tabular). Two across on a phone, three from 600 px (four in one row when there are four); an odd last cell takes the rest of its row. A long word hyphenates (German), never breaks mid-letter. Paper and hairline only: never an ink fill, never a pointed end (a plate is not a card).
- **Each figure once on screen.** Beside the board (1024 px up) the side card does not repeat a row whose value the board shows; a row only the card has (sea in a month, parking, entry) stays. The card's title is a screen-reader heading. Below 1024 px the foot bar's figures wait until the board has scrolled away (`is-post-in-view`); "Add to day" is always there.
- **The side card**: 380 px, paper, hairline, `--radius-panel`, no shadow (it is not floating), sticky. Inside: rows left, the one umber primary, the secondaries (44 px), the stay row.
- **Tablet (600 to 1023 px)**: its own layout: the board three across, the card's half as two columns (secondaries beside the stay row), rows two across from 700 px, cards three across; the foot bar holds the primary. 1024 px up: main column and the side card.
- **Rows on hairlines** for Before you go, Getting there, the shore, routes to the top: a bare 20 px icon in `--text-2`, the title 700, one line in `--text-2`, a rule under each row; warnings keep the amber icon and an amber title plus the words. No sunken tiles anywhere on these pages.
- **Panels on paper with a hairline**: the route block (map, then the profile), the grade, the water class, the months, the cells (waves, faces, storms), facilities, the surface mix, the safety line, stage signposts.
- **One umber ramp** for every drawn measure: steepness (umber 100, 300, 600), the best months (umber 600 over umber 200, the current month on the selected wash with an umber edge), the water class steps, the paved and traffic-free bars. The kind colours stay on pictograms only.
- **No grey tile (G8)**: a card without a photograph shows `WorldTile` in its kind's world (water: beach, lake; rock: mountain; lowland: trail, cycle). One missing-photo grammar.
- **Minimal text**: the season row says the months and only "Estimated" when it is; "Waymarked" says only the route reference; a loop or an out-and-back says only the word (the one-way sentence stays: it tells the walker to plan the way back); the Route section has no side note.
- **Motion**: the kit's press on every control; the 2D/3D Segmented, save and share are kit parts; the stay row and route rows nudge their chevron on hover; the foot bar's figures rise once when the board leaves the view. The signature act is the profile scrub (the traveller's own): the readout and the map pin follow the finger. No draw at load, no relief band on these pages (DESIGN.md does not allow it here). "Add to a day plan" opens the day planner, so it takes the press and no haptic.

> The rules below are the product rules these screens keep (what they show, what each control does, how numbers behave). They bind.

Covers the trail, cycle route and tour, beach, lake and mountain pages.

Numbers and money, ratings, data drawings (the profile, the five squares), tracks (the photo track), navigation and the page bar, the hand-over copy ("Open this ride in Google Maps", never "Navigate"), copy and the quality floor: see shared-product-rules.md. The outdoor tabs on Explore and their maps: see explore.md. Fields with no data yet (T630) and the one line of sources: see place.md. The ready-made trip page: see plan.md.

## Detail page grammar (owner decision 2026-10-15, T430 and T431)

Show first what makes the traveller want to go, then what decides it. Item pages (trail, beach, lake, mountain, cycle route and tour), top to bottom: the page bar (back naming the list, save, share); the photo gallery; the head (full name, the Score with its band, where, one hook line that sells the place, never a statistic about it); a fact band of four to six measured facts as label-over-value rows with an icon each (value tabular; a missing fact is left out, never "Not recorded"); Why go, a photo track of highlights; the map with the climb drawn under it on routes; Before you go (at most four short icon rows, safety first, never folded); one hand-off row with the page's one primary and at most four secondaries (Download PDF is one of them, the page's only PDF door); getting there; at most three folded rows; Not quite right? (alternatives as large photo cards); nearby; one line of sources. From 1024 px a receipt page may run a sticky side column. No bento grid: no tiles of mixed sizes.

Exception (T630 to T632): the explore-completeness fields keep their slot with `NotYet`; see place.md.

## Difficulty

The difficulty is a status chip in the head: five squares filled to the level, outlined beyond, plus the word, with an InfoDot (T431). The five squares stay the one difficulty drawing everywhere. Difficulty is one five-step scale in one i18n group.

## 3D terrain map (owner decision 2026-10-15, T430)

A map on an item page or a trip day may offer a 2D / 3D Segmented control in a toolbar row under it, never over it. 3D drapes the route and pins on real terrain (the Mapterhorn elevation tiles through `src/lib/terrainSource.js`) with a hillshade in token colours; it is off by default, tilts and rotates only under the traveller's hand, eases its camera and never moves by itself (no orbit, no fly-through). Charts, profiles and photographs stay flat: "no 3D" still holds for them. Maps on a page never ask for Ctrl or Cmd: a two-finger trackpad swipe pans, a pinch zooms, a mouse wheel zooms, and on a phone the map in the page flow stays still until the traveller expands it.

## Measured facts

With a month, a card may carry one measured month fact ("Swim season includes July"), never a forecast (see explore.md, Filters). A positive verdict ("You can swim here") follows the status rule in shared-product-rules.md.
