# T277: PRODUCT.md and ESTIMATION.md catch up with the owner decisions

## Task ID

T277 (register rows T273-a, T203-c, T201-d)

## Date

2026-10-02

## What changed

PRODUCT.md no longer says the fare-snapshot surfaces "are being removed". T273 removed them, so "The one rule the numbers follow" now says no screen shows or sums a Carta flight figure, and the tilde and "est." stay for every other estimate. "What Carta is" now opens with the T201 positioning: the one sentence and a short paragraph. The paragraph is the T201 paragraph minus its flight claims, because the owner decided Carta does not price flights. "Who it is for" now opens with the audience order: hikers lead (confirmed in T275), then beach families, cyclists, city-break travellers, car-free travellers and trail runners. docs/ESTIMATION.md near line 188 no longer points at the replaced two-ends contract. It says no screen shows the bands and points at the rewritten "Flight-cost input" in docs/SCHEMA.md. Docs only.

## Files touched

**Modified:**
- PRODUCT.md
- docs/ESTIMATION.md
- Execution/_OPEN.md (T273-a, T203-c, T201-d closed; T277-a added)

**Created:**
- Execution/P11/T277-product-md-decisions.md

## Commands run

Edits by a short Python script, then git diff --stat. No pipeline, no app, no migration.

## Config and secrets set

None.

## Before/after measurements

Not measured. The positioning figures (3,868 places, 43 countries) are T201's 2026-10-02 measurement and carry a note to read meta for today's.

## What broke

Nothing. No screen touched, so no browser check applies.

## What is still open

T277-a: the first paragraph of "The one rule the numbers follow" still describes the harvested, cached, estimate chain in flight terms ("a harvested fare", "an estimate ships only where a flight verifiably exists"). It was left because the row asked only for the removal line. A later docs task should reword it for ground costs. T202-b (carry the competitor comparison into PRODUCT.md) is now unblocked by T201-d and stays open.

## Rollback

git revert the T277 commit, or git checkout main -- PRODUCT.md docs/ESTIMATION.md Execution/_OPEN.md. Docs only, fully reversible.
