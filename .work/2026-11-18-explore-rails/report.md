# Explore rails (G12)

- Status: done on branch `p15-explore-rails` (built on `p15-explore-polish`), then merged with the other sessions' branches on `p15-integrate-2026-11-18` (see "Merge")
- Date: 2026-11-18
- Level: L2, design playbook (lean: one builder, explore and research in the main session, impeccable as the craft method)
- Roadmap: G12

## What the owner asked (five points) and what changed
1. **Spacing between sections.** One rule for Explore's overview in `styles/85-explore-rails.css`, from the proximity principle (inside a group tight, between groups about three times that, more room above a heading than below it; Canva's app spacing guide uses 8 inside and 24 between sections, Ant Design's proximity spec steps 8, 16, 24). Measured at 390 before: a title sat 14 px from its own strip and 16 px from the rail above, so it read as the foot of the previous rail. After: title to strip 12 px (16 from 1024), rail to rail 40 px (56 from 1024), the head one 28 px line, dock to first title 24 px. T983's 16 px rule in `80-story-rail.css` loaded later and won, so it went.
2. **See all.** The word stays (Baymard: a heading alone is missed as a door) and wears a 24 px beige disc with the arrow that takes the paint and nudges on hover; named "See all: {rail}" for screen readers. Every Explore strip now ends on a See all tile the size of a photo: the next places as three round photo faces, "See all" and the rail's name, the 44 px umber arrow disc.
3. **More rails, criteria, more scrolling.** Thirteen theme rails from the guided vibe data (Old towns, Islands, Mountain villages, World Heritage, By a lake, Food and wine, Places with a view, Castles, Villages, City breaks, Good for families, For two, Art and museums): vibe 80 or more and Good or better, best Score first, round-robin by country; See all is the same vibe filter. Criteria fixes: Top rated and Hidden gems now sort by Score and spread countries; Hiking bases gains the Good floor. Every rail with four places is drawn (T427's cap of 3 on a phone and 4 on a desktop is lifted); 16 places a strip (was 12) plus the tile. Fresh leads: a place that led an earlier rail moves behind the fresh ones (`railLeads.js`), so twenty rails do not open on Rome. Seventeen rails show in November in dev data (Best in, Under {price} and Beach towns hide honestly when fewer than four places are in season); off-screen rails skip layout (`content-visibility`).
4. **Account button.** Signed out, Account and Sign in are one split pill: the person face (Account) and "Sign in" (the dialog), two 44 px targets in one outline; the header shows two shapes, not three. Signed in, the initial on beige with a thin umber ring.
5. **Under the image.** Three lines: the name, its Score and the day figure on one line (a long name wraps to two, never cut); the flag and country; then bed plus food (the figure's parts) and the return fare apart, outlined because it is outside the figure. The photo is the link, stretched over the card, so the figure and parts stay buttons to the price sheet. The figure used to sit alone on a fourth line.

Found on the way: the desktop strip's `minmax(256px, 25%)` never grows in an overflowing grid, so every desktop card sat at 256 px; now `max()`, about 290 px with a quarter of the fifth card showing.

## Decisions made on the way
- Score stays off the photo (PRODUCT.md: text never on a photo).
- No middle dot between the parts (banned separator); the gap and the outline carry the split.
- No polaroid stack for the tile (AI-slop catalogue); round faces in a row.
- Departures from the defaults: none of the look rules; the T427 rail cap, an owner rule from 2026-10, is reversed on the owner's new request.

## Checks
| Check | Result | Evidence (run folder) |
|---|---|---|
| eslint on touched files | 0 errors (4 old warnings in untouched files) | |
| design-lint | 0 new | |
| impeccable detect | `[]` | |
| Targeted tests | 63/63 (exploreRails new, hs-explore-parts, headerPills, i18nParity, rowFigures, hs-integration-kit) | |
| `npm test` | see "Full suite" | final-npm-test.txt |
| verify_explore | 105/105 (two checks rewritten to the new rules: many rails, every rail ends on its tile) | final-verify_explore.txt |
| verify_bottom_nav | 0 failed | final-verify_bottom_nav.txt |
| verify_together_signin | 10/10 with AUTH_OFF=1 (this dev server has no Supabase variables, as the base check) | |
| verify_explore_states | see "Full suite" | final-verify_explore_states.txt |
| Screens | 390, 820, 1440: shot-r4-*, shot-final-* | |

## Not verified
- Signed-in avatar look on a live account (dev has no auth).
- A real phone (touch, reduced motion on a device).

## Changed files
App: `src/browse/ExploreRails.jsx`, `src/browse/explore/useExploreRails.js`, `src/browse/explore/railLeads.js` (new), `src/browse/explore/HouseParts.jsx` (`slot`), `src/components/ui/Rail.jsx`, `src/components/AppHeader.jsx`, styles `05-house.css`, `80-story-rail.css`, `85-explore-rails.css` (new), `90-together.css`, six i18n catalogues (14 keys each). Tests: `tests/exploreRails.test.mjs` (new), `tests/hs-explore-parts.test.mjs`, `tests/headerPills.test.mjs`. Scripts: `scripts/verify_explore.mjs`. Docs: `docs/HANDBOOK.md` (Explore item 10, header pills), `DESIGN.md` (Rail and RailCard), `ROADMAP.md` (G12).

## Undo
`git revert` the Explore rails commit (or `git revert -m 1` its merge). No data, schema, settings or URL change.
