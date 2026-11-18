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
We chose **option 3**. A style bundles how you stay and how you explore. The active style's stay half sets the priced `choices`, and app-wide edits are written back into it; its explore half seeds every new trip (answers marked `'style'`, beaten by words and screens) and is the taste profile. The Lifestyle panel stays the one place to set the bed and the table. A change made for one trip (its party, bed or way there), a shared link that names priced choices, or a loaded saved trip holds the style instead (`choices.style_held`): the prices follow the trip or the link, the saved style stays as it was, and the header says "Changed for now" with Keep and Back, so neither ever overwrites the other. Each style card states its day (bed and food, a person, at the middle place) from the price engine.

## Consequences
- Good: the planner asks only what a style cannot know; every tab shows how prices are set; Explore's For you, the trip finder and every price read the same answers.
- Bad: one more object in `choices` (synced whole to the account); the taste and the style are kept in step by an effect, so a future editor of either must go through `hooks/useTravelStyles.js`.

## How we'll know it works
Fewer screens to a fitted trip for a returning traveller; no report of a price or a header that disagrees with the chosen style; `tests/travelStyles.test.mjs` stays green.

## 2026-11-18: one surface, the Style Studio
Decided by the owner (proposal approved 2026-11-18, run `.work/2026-11-18-style-studio/`).

**Why.** After the explore polish a style could be edited in five places: the Style dock's panel with inline editors and "Open all settings", the Travel styles sheet behind it, the separate Lifestyle dialog for the bed and the table, the taste sheet and its doors, and the planner's own pickers. Each showed a different slice, so a traveller could not tell which one owned what, and the owner asked to "remove all the old flows" so that nothing of the old setup is left.

**What changed.**
- One surface, the Style Studio (`browse/styles/`): an overview of the styles as cards (switch, day figure, the hold with Keep and Undo, Edit, Duplicate, Delete) and a ten-step wizard, one question a step, four for how you stay and six for how you explore. A draft reaches the store, and so a price, only on Save or Done.
- Every door leads into it and nothing else edits a style: the corner disc opens the overview; each former Lifestyle door (`openStyleSpend`) and the price sheet open the active style at its step. The Lifestyle panel stops being the place to set the bed and the table; the wizard's step 2 is.
- Removed: `TravelStylesSheet.jsx`, `LifestylePanel.jsx`, `TasteSheet.jsx`, `TasteDoor.jsx`, `StyleDoor.jsx`, the dock's panel body and "Open all settings", the template picker, "How I travel now", the start dialog's taste questions and the learning question after a save, with their keys in six languages and their CSS.
- A style gains `ways` (several ways there, the first the one Explore prices) and `tradeoffs` (an early flight, a change of planes, a hostel), which reach the trip's flights and the planner's stay slot. The persona question is cut: personas are derived from the other answers. Explore's filters lead with "Priced for", and the style is sent to Ask Carta and plan-day as enum values only.
- Colour: the studio is the umber family plus one saffron mark; no teal and no gradient, and its cost bar shows food in light umber (DESIGN.md "Colour rules").

**Consequences.** One place to learn and to test (`tests/styleStudioData.test.mjs`, `tests/styleStudioSteps.test.mjs`, `tests/style-doors.test.mjs`); a door is now a step name, not a component. The cost is a longer path for a one-field change (a door opens the wizard at that step, then Save), which the step doors keep short.

## More information
- Run report: `.work/2026-11-13-travel-styles/report.md`; the Style Studio: `.work/2026-11-18-style-studio/report.md`
- HANDBOOK "Travel styles"; ROADMAP G12.
