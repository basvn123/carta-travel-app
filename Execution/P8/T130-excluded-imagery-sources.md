# Execution Report: T130

## Task ID

T130

## Date

2026-10-02

## What changed

Recorded the explicit exclusion of Google Street View as a source for view-direction imagery on Destinations pages. No code or configuration was changed. The decision was documented to prevent future re-proposals and to establish policy reasoning that will guide implementation when synthetic view rendering is built.

Google Street View was evaluated for the 17,600 trail cards and 740 mountain cards that require facing-the-right-way photography. The Static API accepts heading, pitch and field-of-view parameters, and the free metadata endpoint is available, but the terms of service prohibit pre-fetching, indexing, storing or caching anything except place and panorama IDs. This makes pre-rendering 17,600 card heroes to the CDN impossible. At $7 per 1,000 live requests with essentially no hiking coverage in the regions Carta serves (especially Eastern Europe, Turkey and Ukraine), the cost-benefit is unfavourable. The solution, documented in carta-destinations-enhancement-spec.md 2.3, is to render synthetic views from DEM and open national orthophotos instead, which covers all 47 countries without licensing restrictions.

## Files touched

**Modified:**
- None. This task records a decision that was already made in the enhancement spec, not a new implementation.

**Created:**
- None. The decision text exists in `additional docs/Carta/Plan/Data Quality/carta-destinations-enhancement-spec.md`, section 2.2, which was the reference document for this task.

**Deleted:**
- None.

## Commands run

None. No code changes or data pipeline runs were required.

## Config and secrets set

None.

## Before/after measurements

Not measured. This task documents a policy decision, not a feature addition.

## What broke and how it was fixed

No issues. This task involved reading and documenting existing decision criteria.

## What is still open

None. The decision is recorded and the reasoning is clear. Implementation of view rendering falls to future tasks (likely in Phase B or later) and will follow the synthetic-view approach with DEM and orthophoto layers documented in sections 2.3 and 3 of the enhancement spec.

## Rollback procedure

Not applicable. No code or configuration was changed. If the decision needs to be revisited, a new task will evaluate and document the change in reasoning.

---

## Notes

The reason this decision matters, per the enhancement spec: it belongs in the same category as the Google Photorealistic 3D Tiles exclusion. Both are high-confidence technology choices that avoid future surprise when someone later suggests re-evaluating them. The policy is recorded so implementation teams do not spend time on re-evaluation cycles.

The Street View terms prohibit the caching and pre-rendering that CDN distribution requires. The synthetic view approach (DEM + national orthophotos) is superior because it covers all 47 countries at consistent quality, requires no cache management policy, and costs approximately €5–15 per view image in one-time render costs, not per-request fees.
