---
status: accepted
date: 2026-11-15
decided-by: Bas
---

# 0012 · The house style: Waymark, in Line's colours, rounder

## Context
The owner asked on 2026-11-13 for "a full custom housestyle" that is "beyond top level", unique and modern, with rich motion, every page clean and clear, checked at phone, tablet and desktop, and no AI look. Four binding rules came with it: visual only (no logic removed), the umber brown stays, minimal text, and every function kept (Ask included). The look the app had (warm grey ground, white rounded cards, Figtree, a structure close to booking apps) read as a template: with the logo hidden it could have been any travel app (`G1` in `ROADMAP.md`).

A design run (`.work/2026-11-13-house-style/`) explored the current interface, the product's world, references, craft principles, the toolkit, interaction and the technical constraints, then had three proposers build three house styles as prototypes, critiqued by seven lenses over two rounds and scored by three judges on an 11-criterion rubric.

## Options considered
1. **A, Waymark.** The furniture of a European footpath, made for prices: the blaze (a painted waymark meaning "chosen" or "here"), the signpost plate that holds a place, minutes on foot and euros as one unit, and a relief drawn only from a place's real peaks. Overpass type. Judges' average 104.7 of 135 in round 2.
2. **B, Line.** A journey line through the app, a pale lichen-stone ground with umber and beige, rounded rail cards and the price "formation" (getting there, bed and food as coupled wagons before the day figure). Average 96.7.
3. **C, Ledger.** A receipt and ledger language: dotted leaders, rounding lines, careful screen-reader handling of figures. Average 100.7. Read as print rather than modern.

## Decision
We chose **a combination the owner asked for** after seeing the comparison: **Waymark as the base, in Line's colours, with Line's rail cards, price formation and journey line, and rounder than Waymark** (the owner: "combination of waymark and line ... a little more rounding ... use the colours from line more. the brown, beige."). From Ledger: dotted leaders on itemised receipt lines, a "Rounding" line where printed lines do not add up to the engine's total, and its screen-reader handling of changing figures.

- Colours: ground `#eef0ea`, band `#e3e7df`, paper `#ffffff`, ink `#1e2421`, `#465049`, `#59625c`; umber 600 `#8c5a2b` is the paint (action, selected, the blaze, the route, the chosen pin); beige (umber 100 and 200) for tints and the food wagon; the Score and signpost plates stay dark ink.
- Type: Overpass for every word and figure with tabular figures; Sofia Sans Extra Condensed only for plate names. Self-hosted, SIL OFL 1.1 (`docs/tos/fonts.md`).
- Shape: one radius scale (about 8 px controls, 12 px panels and sheets, 16 px photos and cards, full pills for chips, wagons and segments, round icon buttons).
- The interaction system: springs generated from one source (`src/lib/motionTokens.js`), overshoot only on the control the finger touched, figures move only when the traveller changed them, haptics only on a touch commit with a setting.

The full system lives in `DESIGN.md`; the product rules and the vocabulary in `PRODUCT.md`; the rules a session applies in `.claude/skills/carta-design/SKILL.md`; general practice in `docs/design/craft-guide.md`. This record supersedes `docs/design/direction.md` and the look rules of decision 0006 (its honesty and accessibility rules stand).

## Consequences
- Easier: every screen shares one token file, one kit, one motion vocabulary and one background graphic rule, so a page lane restyles a screen without inventing parts. The style is recognisable with the logo hidden (blaze, plate, relief, formation).
- Harder: about 85 stylesheets and 60 screens move to the new look in lanes (`.work/2026-11-13-house-style/lanes.md`); until a lane rebuilds a screen it wears the new tokens through the legacy aliases only. Print, share cards and social cards still use Figtree until the brand-surfaces lane moves them.
- The relief may appear only where the page's own place has peaks with a height in its dossier; no peak, no relief.
- Undo: revert the foundation commits on `p15-housestyle` (`git revert`); the old tokens come back with them. No data or schema change.
