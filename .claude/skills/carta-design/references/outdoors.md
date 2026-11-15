# Outdoors rules (reference)

> Look rules for these screens are rewritten by the outdoors lane of the house style run (2026-11). Until then the look comes from `DESIGN.md` and the carta-design `SKILL.md`; the rules below are the product rules these screens keep (what they show, what each control does, how numbers behave). They bind.

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
