---
status: accepted
date: 2026-11-13
decided-by: Claude, under the owner's full delegation (2026-11-12)
run: .work/2026-11-13-travel-styles/
---

# 0011 · Travel styles: one switchable "how you travel" for the whole app

## Context
How a traveller stays (party, bed, eating and drinking, way there) lived in app-wide `choices` with four editors; how they explore (one base or moving, persona, likes, avoid, getting around, day rhythm) lived per trip in the planner, asked again for every trip; a third copy, the taste profile, was labelled "Your travel style". The owner asked for one clean, top-level, always-changeable setup, saved per company, that the price and the ranking really follow.

## Options considered
1. A second always-visible settings bar.
2. A richer per-trip settings page only.
3. Named travel styles, one active, behind a door in the header of every tab.

## Decision
We chose **option 3**. A style bundles how you stay and how you explore. The active style's stay half is the priced `choices` itself (one truth); its explore half seeds every new trip (answers marked `'style'`, beaten by words and screens) and is the taste profile. The Lifestyle panel stays the one place to set the bed and the table. A shared link that names priced choices, or a loaded saved trip, wins over the style and leaves no style active rather than overwriting it.

## Consequences
- Good: the planner asks only what a style cannot know; every tab shows how prices are set; Explore's For you, the trip finder and every price read the same answers.
- Bad: one more object in `choices` (synced whole to the account); the taste and the style are kept in step by an effect, so a future editor of either must go through `hooks/useTravelStyles.js`.

## How we'll know it works
Fewer screens to a fitted trip for a returning traveller; no report of a price or a header that disagrees with the chosen style; `tests/travelStyles.test.mjs` stays green.

## More information
- Run report: `.work/2026-11-13-travel-styles/report.md`
- HANDBOOK "Travel styles"; ROADMAP G12.
