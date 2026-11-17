---
name: carta-design
description: The app's house style and way of working (the footpath style, decision 0012): stone ground, umber as the paint, the blaze, the signpost plate, the relief from real peaks, the price formation, Overpass. Use for any change a traveller sees in continent-app: a screen, a section, a component, a colour, motion, copy, a recording, the home page. Wins over every other design source. Always pairs with the impeccable skill.
---

# The house style

The app plans a whole trip in Europe in one place, with what each day really costs. The traveller counts money, so trust in the numbers is the product. The house style dresses prices in **the furniture of a European footpath**: the blaze painted where you choose, the signpost plate that holds a place, a time on foot and euros as one unit, the relief drawn only from a place's real peaks, and the formation, where getting there, the bed and food couple in front of the day figure. Modern, unique, alive, clean and honest.

This skill wins over every other design source (CLAUDE.md says so). Read, in this order:
1. `PRODUCT.md` (who, the voice, the vocabulary, the number rules) and `DESIGN.md` (every token, part and rule with values) at the repo root.
2. The reference file for your screens in `references/`: `explore.md`, `place.md`, `outdoors.md`, `plan.md`, `trip.md`, `account.md`, `home.md`, `brand.md`, and `shared-product-rules.md` for rules every screen keeps. Their product rules bind; their look sections were written by each screen's lane (2026-11) and win over any older dated section in the same file. `app-rules.md` is a pointer; `_split-log.md` records the 2026-11-15 split.
3. `docs/design/craft-guide.md` for general practice (process, tools, judging).
Token values live in `continent-app/src/styles/01-tokens.css` (copied in `assets/tokens.css` for sketches; the app file wins). The live index of every part: `/?styleguide`.

## 1. What binds, always

- **Every function stays.** A visual change never removes a feature, a control, a flow step, a setting or a data field, and never changes what a button does (owner, 2026-11-13). A secondary control may move into a menu only if it stays reachable and behaves the same. If a visual idea needs a logic change, write it down as a suggestion; do not build it.
- **Honest numbers.** Every euro through `formatMoney()`. No made-up figure; a missing one is "Not yet" and stays out of every sum. A total is the engine's own total, with a "Rounding" line where printed lines do not add up. The flight price is Google Flights', with a link and "prices may have changed"; its checked time shows where the screen has room (owner T840).
- **Accessibility.** Text 4.5:1, marks 3:1 (`scripts/ci/token-contrast.mjs`), 44 px targets, a visible 3 px focus ring, reduced motion shows the end state, colour never alone, real links and buttons, axe serious and critical 0.
- **Copy.** No em or en dashes, no middots as separators, no banned words (PRODUCT.md), six languages through i18n keys, sentence case, the vocabulary in PRODUCT.md (one name per object). Minimal text: no unit sentences or sublines the context gives; the unit is said once.
- **The umber brown stays** as the paint. Licensed photography with its credit; never AI pictures of places.

## 2. The look in one screen

- Ground stone `#eef0ea`, paper `#ffffff` for sheets and cards, ink `#1e2421`; umber 600 `#8c5a2b` for the one primary action, the selected edge, the blaze, the route and the chosen pin; beige (umber 100 and 200) for the selected wash and the food wagon; dark ink plates for the Score and the signpost.
- Overpass for every word and figure with tabular figures; Sofia Sans Extra Condensed for plate names only; nothing under 12 px.
- Radius: 8 controls, 12 panels and sheets, 16 photos and cards, pills for chips, wagons and segments. Panels flat on a hairline; only floating things cast a shadow.
- The figure is always the loudest thing in its row or card.
- Selected: the wash, umber 800 text, an umber edge, and a mark (tick, paint bar, thumb or blaze).
- Text never on a photo or on the relief's contours; no side stripes; no blaze as decoration; no plate as an ordinary card.

## 3. Build with the parts

Use the kit (`src/components/ui/`: Button, IconButton, Chip, Segmented, Tabs, Switch, Field, Card, CostRow, Money, DialogSheet and the rest) and the house parts (`Blaze`, `Plate`, `ScorePlate`, `Formation`, `Rail`, `RailCard`, `ReliefBand`, `StateBlock`, `Skeleton`, `NotYet`, `WorldTile`, `Figure`), the icons in `src/components/HouseIcons.jsx`, and the tokens. A screen's own CSS reads roles (`--surface`, `--text`, `--action`, `--select-bg`...), never a new hex, never a legacy name (`--paper`, `--ink`, `--accent`), never a literal duration, font size or radius (`node scripts/ci/design-lint.mjs` flags them). If the kit lacks something, ask for it (a foundation request) and build the closest thing from tokens meanwhile.

## 4. Three angles, every time

Design and check every screen at phone (390 x 844, holding at 360), tablet (820 x 1180 portrait and 1180 x 820 landscape) and desktop (1440 x 900, and 1920). A tablet is its own layout: two panes where content allows, toolbars that wrap or move extras into a More menu, never a stretched phone. Run the width sweep (360, 390, 600, 768, 820, 1024, 1180, 1280, 1440, 1920): no horizontal scroll, no overflowing element. Touch and pointer both work; hover is never the only way.

## 5. Alive, from one system

Every selection, toggle, add, save, step and screen change answers from the interaction kit (DESIGN.md "Interaction"): the press springs back on `--ease-tick`, a selection paints, a switch thumb springs, a saved thing pops, a sheet follows the finger, a figure the traveller changed rolls once with a delta note (`Figure`). Overshoot only on the control the finger touched; figures, plates, pins and surfaces settle. One signature moment per screen. Never animate a price the traveller did not change, list order while reading, or anything at first paint. Haptics (`src/lib/haptics.js`) only on a touch commit, through the kit; never on navigation or opening a sheet. Reduced motion: the end state at once.

## 6. Always use impeccable

Every design task runs through the **impeccable** skill; it is the craft engine, this skill is the brand.
1. Context first: `impeccable context --target <file>` once per session, then the surface brief for the area.
2. Pick the command: `polish`, `animate`, `layout`, `distill`, `bolder`, `delight`, `critique`, `audit`, `clarify`. Home is **Persuade**, app screens are **Operate**.
3. Read `reference/craft-floor.md` right before editing UI.
4. When done, `impeccable detect --json <changed files>` once and fix what it finds.
5. Bounded verification: build, inspect all three angles together, fix in one batch, check once more, stop.

## 7. How a design task runs

1. **Read** PRODUCT.md, DESIGN.md, this skill and your screen's reference file.
2. **Map the screen**: its one job, its main action, the information order, every control it has today (that list is your function-parity checklist).
3. **Build** from the parts and tokens; restyle, never remove.
4. **Check**: a fast build served statically (CLAUDE.md commands), screenshots at 390, 820, 1180 and 1440, the width sweep, `verify_axe.mjs`, the `verify_*.mjs` scripts for the screen, `npm test`, `npm run lint`, `design-lint`, `token-contrast`, `verify_relief.mjs` if it draws a relief.
5. **Judge**: a fresh judge scores from the screenshots and code against the rubric in `docs/design/craft-guide.md`.
6. **Report** with crew's `document-run`: screens checked at three angles, before and after, what departed from DESIGN.md and why, how to undo.

## 8. Never

- Remove or change a function to make a screen look cleaner.
- Text on a photo or the relief's contours; a relief without real peaks and a printed height; a relief in a list header.
- A side stripe or coloured top border on a panel; a blaze as decoration; a plate as an ordinary card.
- A sparkle icon for AI (Ask has a boxed "AI" tag), a globe, a compass rose, a plane with a dashed trail, emoji.
- Gradient text, glassmorphism, card in card in card, an eyebrow above every heading, one big radius everywhere.
- A made-up number, a sum of rounded lines presented as the total, "free forever".
- An em or en dash.

## 9. Before you ship (the seven questions, plus two)

1. Is the screen's one job and main action obvious in 5 seconds at 390 and at 1440?
2. Is every function it had still there, working the same?
3. Does it read as the house style with the logo hidden (blaze, plate, formation, relief where real), from tokens and kit only?
4. Does every figure come from data through `formatMoney()`, is a missing one "Not yet", and does every sentence match the data?
5. Contrast, 3 px focus, 44 px targets, keyboard paths, axe clean?
6. All six languages fit (German for length), no dashes, no banned words, no redundant text?
7. Did impeccable's detector run clean, and is there one thing left to remove?
8. **Three angles:** phone, tablet and desktop each deliberate, and the width sweep clean?
9. **Interaction:** does every selection, toggle, add, save, step and screen change answer from the interaction kit, with haptics only on commits, and does reduced motion show the end state?
