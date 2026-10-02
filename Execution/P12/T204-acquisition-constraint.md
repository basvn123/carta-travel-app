# T204 · The acquisition constraint, written down once

## Task ID

T204

## Date

2026-10-02

## What changed

The acquisition constraint was written into a single authoritative go-to-market document that makes the unit-economic ceiling explicit. The document establishes that at €6.85 contribution per purchase and 2.5% purchase rate, the allowable acquisition cost is €0.17 per visitor and €3.04 per payer at 3:1 LTV/CAC ratio — below the cost of every major paid channel (search, social, influencer, sponsorship). Paid acquisition is therefore ruled out until contribution per user exceeds €2.00, a threshold that requires improved AI cost efficiency (Lever 1 from the Unit Economics document). The constraint reframes the entire marketing strategy: SEO and organic channels are not chosen for ideological reasons but because they are the only economically viable approach. Coverage work in P7 (3,868+ destinations, 17,619+ trails, 22,289+ bathing waters) becomes the customer acquisition strategy, measured in keyword volume and ranking position rather than feature count. Affiliate revenue (accommodation and ground transport) is identified as a secondary linear-scaling channel, currently unmeasured, at ~€0.01 per MAU under conservative assumptions and €900–1,500/month at 100k MAU.

Before: No binding strategic constraint on acquisition spend; risk of defaulting to paid media without performing the financial math. After: All channel proposals must reference this document and justify their spend against the €0.17 ceiling or wait for contribution-per-user to grow.

## Files touched

**Created:**
- docs/GTM-ACQUISITION-CONSTRAINT.md

**Modified:**
- None

**Deleted:**
- None

## Commands run

None. This task is pure documentation; no code or data changes.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Go-to-market documents citing the constraint | 0 | 1 | +1 |
| Channels with written veto until €2.00 contribution/user | 0 | 4 (search, social, influencer, sponsorship) | +4 |
| Affiliate revenue model instrumented and measured | No | Documented as open work | n/a |

The "Before" state is that the unit economics exist in CARTA_UNIT_ECONOMICS.md §5 as prose, but there is no single source of truth for how those numbers translate to channel viability. A marketer or founder could read the numbers and still choose to run paid acquisition out of habit or impatience. The "After" state is that GTM-ACQUISITION-CONSTRAINT.md makes the constraint the first line of the go-to-market story, tied directly to the arithmetic, with a clear threshold (€2.00) for when paid acquisition becomes possible again.

## What broke and how it was fixed

No issues. This is a documentation task with no runtime code or data changes.

## What is still open

1. **Affiliate instrumentation not wired into the app.** The document identifies affiliate revenue (Travelpayouts for flights, booking.com and Airbnb for stays, Omio for ground transport) as the secondary monetisation channel, currently running at an estimated €0.01 per MAU under conservative assumptions. This estimate is not validated. The `affiliate.js` file exists but lacks conversion tracking and click logging. Measurement is a prerequisite to answering whether the affiliate story is flight-led (if the fares layer ever returns) or accommodation-led (if the app stays focused on ground costs and stays). This belongs to T265 (Telemetry / P11) or later, where paywall funnel and affiliate tracking are instrumented together.

2. **Human-written content for SEO has not been created.** The document calls for 3–5 hand-written articles on cost-of-trip to earn backlinks. Examples: "What a week in Palermo costs, with receipts" or "Summer in Barcelona on €40 a day." These are identified as necessary before paid acquisition becomes a question (because they improve ranking and conversion on the organic channels that the constraint forces the plan to rely on), but they are not written. This belongs to T265+ as part of the "Content" workstream (P12 later stage).

3. **Static prerendering and structured data for destinations have not been shipped.** The PRODUCT_ROADMAP.md identifies static prerendering of destination pages as a blocker for SEO; the schema validation in CI (that would detect if the data shape changed, like the fares removal problem) does not exist. This is T260+ work in the "Search visibility" section of the roadmap and is a hard dependency before any organic channel investment is justified.

4. **Affiliate tracking and click capture have not been implemented.** Every affiliate surface currently runs blind to conversion. A quick instrumentation pass using Google Analytics and/or Segment events on every Travelpayouts and booking.com link is deferred, but it is a prerequisite to answering whether affiliate is worth expanding into a first-class channel. Estimate: 6 hours for analytics wiring + tracking pixel setup. Owner: next task (T265+, Telemetry).

5. **The €2.00 contribution/user threshold has not been tied to a concrete roadmap.** The document states that paid acquisition becomes viable when contribution grows to €2.00+. That requires Lever 1 from Unit Economics §4 (per-fact grounding, moving AI cost from per-user to per-fact amortised). The plan to ship Lever 1 is in the Unit Economics document but has not been scheduled into the phase roadmap. Before any marketer reads this constraint and asks "when?", someone must answer: when does Lever 1 ship? Estimate: 20–40 hours for implementation. Owner: product/backend roadmap (T270+).

## Rollback procedure

Rollback is trivial: delete `docs/GTM-ACQUISITION-CONSTRAINT.md` and revert the commit. The constraint is documented in CARTA_UNIT_ECONOMICS.md §5 regardless; removing the GTM file just removes the centralized copy that forces every channel proposal to reference it. No app state, data, or config was changed.

If the constraint itself proves incorrect (e.g., a new affiliate channel that delivers €0.17 CAC emerges), the file is edited in place and the edit is committed normally. The document is a living reference, not a law.

---

## Notes

The task's "Done when" was: "The constraint is the first line of the go-to-market document and every channel proposal is tested against it."

1. **Constraint is the first line:** Yes. The document opens with the €6.85 / 2.5% / €0.17 / €3.04 statement.
2. **Channel proposals tested against it:** This is an ongoing gate, not a one-time task. The document provides the template (cost-per-visitor vs €0.17, LTV/CAC ratio, time-to-profitability). Future channel proposals are assumed to cite this document before approval. There is no mechanism yet to block a proposal that ignores it, but writing the constraint here makes ignoring it visible.

The document also specifies what the constraint is not: it is not a pricing question (the pass prices are fine), not a product quality question (the app is good), and not a market size question (Europe has plenty of travellers). It is a pure unit-economics gate, and it is binding.

---

*This report closes T204. The constraint is now in writing, tied to source documents (CARTA_UNIT_ECONOMICS.md §5), and live for reference in future go-to-market work.*
