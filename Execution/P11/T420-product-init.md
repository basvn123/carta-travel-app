# T420: PRODUCT.md brought to impeccable's product record (init)

## Task ID

T420

## Date

2026-10-13

## What changed

PRODUCT.md now follows impeccable's product-record schema (stamp `impeccable:product-schema 1`) and carries the sections the doctor reported missing, filled only with facts the repo proves or the owner confirmed in one interview round. Platform is web: the store apps wrap the same web app, so there is one design language. Positioning summarises T201 and the four competitor clauses of T202. Operating Context records how a traveller uses Carta, the organic-search acquisition constraint, the launch date and the owner's first-year success (paid Trip Passes, visitors from search, trust and return). Evidence on Hand lists the real material and what must never be invented. Product Principles holds the one principle the owner confirmed: Carta prices and plans, it never sells. Two existing lines were brought in step with today's owner decisions: figures move from a separate mono face to the interface typeface with tabular figures (closes T419-a), and the "never rounded" rule now names the whole-euro exception for comparison contexts. The voice, the provenance rule and the accessibility constraints are unchanged. `impeccable doctor` no longer reports PRODUCT.md. The plan's future task numbers moved up one, with a note in the plan.

## Files touched

**Modified:**
- PRODUCT.md
- Roadmap/1.2-design-system-plan.md (renumbered steps, done markers, T420 row)
- Execution/_OPEN.md (T419-a and T419-b closed; rows T420-a and T420-b)

**Created:**
- Execution/P11/T420-product-init.md

## Commands run

```
impeccable doctor          (before: product-schema-legacy; after: only design-md-coverage)
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| impeccable doctor findings on PRODUCT.md | 1 | 0 | -1 |

## What broke and how it was fixed

No issues.

## What is still open

T420-a: PRODUCT.md says density is a feature (forty prices on one phone screen, whitespace spent only between groups), while Lagoon leads with large photo cards in the Airbnb manner; both are owner decisions, so the owner says where the dense view lives (the map, a compact list toggle, or both) before T421 sizes cards. T420-b: the planned numbers moved up one, so T418-c's "T421 Field" means T422 and T419-c's "T424" means T425. The DESIGN.md coverage finding from the doctor stays with T425, which rewrites DESIGN.md from the built system.

## Rollback procedure

`git revert` the T420 commit; PRODUCT.md returns to its T419 state.
