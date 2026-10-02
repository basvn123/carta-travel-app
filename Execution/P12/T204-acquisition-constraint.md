# T204 · The acquisition constraint, written down once

## Task ID

T204

## Date

2026-10-02

## What changed

One new document, docs/GTM-ACQUISITION-CONSTRAINT.md, opens with the constraint as its first line: €6.85 contribution per purchase, ~2.5% assumed purchase rate, about €0.17 of allowable spend per visitor, about €3.04 of allowable CAC per payer at 3:1, and therefore no paid search, paid social, influencer fees or sponsorships until contribution per user is several times higher.

Every figure comes from CARTA_UNIT_ECONOMICS.md sections 3.5, 4 or 5, with the section named beside it. The 3,868 destination count comes from Execution/P12/T201-positioning.md. The document does not carry a price list for paid channels, because the source gives none. It repeats the source's claim that no paid channel delivers a European travel-intent visitor for €0.17, and turns that into a test: a channel proposal must state its cost per visitor with a source, compare it with €0.17, and name which lever from section 4 would close any gap.

The document points at tasks that already exist for the work it describes: T205, T221, T222, T239 and T243 for the search surface, T106, T111 and T112 for coverage, T234 for affiliate tracking, T147 for per-fact grounding, T015 for the VAT answer.

Before: the constraint existed only as prose inside the unit economics file. After: it is the first line of a go-to-market document that every channel proposal can be tested against.

## Files touched

Created docs/GTM-ACQUISITION-CONSTRAINT.md and this report. Appended and then corrected rows T204-a and T204-b in Execution/_OPEN.md.

## Commands run

Reads of the source and of Execution/_ORDER.md and Execution/_OPEN.md. No code, data or config changes.

## Config and secrets set

None.

## Before/after measurements

Go-to-market documents carrying the constraint as first line: 0 before, 1 after. No other metric was promised.

## What broke and how it was fixed

The first draft of this task carried figures that appear in no named source. They were removed in a second commit. Removed outright: paid search cost per click and per visitor ranges, paid social cost ranges, influencer and sponsorship price ranges, display cost per impression, the conversion rates attached to each paid channel, the "€100+ of paid media" value of a destination page, the "€2M ARR" sponsorship cutoff, the 500 users in six months target, the 1:4 LTV/CAC ratio, and the 10% repeat rate and €25 LTV viability thresholds. Replaced: the invented €2.00 contribution threshold and the €1.00 CAC are gone, and the document now says what the source says, "several times higher", with no number. The Lever 1 hour estimates (20 to 40 hours) and the 6 hour affiliate estimate were also invented and removed. Also dropped: the claim of 14 curated journeys per destination and the reference to a paywallEvents.js script, neither of which was verified.

Task references were wrong. The draft sent telemetry to T265, which is payments and quota work. Telemetry tasks are T042 and T071 to T073, and the work the draft meant is already owned by T034 (paywall funnel) and T234 (affiliate tracking). The draft also pointed at T260, T265 and T270 as homes for prerendering, content and Lever 1. Those are now T221, T222, T205 and T147. Register rows T204-c, T204-d and T204-e duplicated work that T221, T234 and T147 already own, and were removed. T204-a and T204-b were rewritten.

Dashes: the draft used en and em dashes. None remain.

## What is still open

The source gives no number for "several times higher", so the point at which paid acquisition reopens is a product decision (T204-a, owner user). Nothing enforces that channel proposals are tested against the constraint, so the prompts for T205, T207 and T208 should cite the document (T204-b, next task, before T207). The source's claim that no paid channel delivers a visitor for €0.17 is the source's own and has not been checked against a quote or a test; if a channel proposal arrives with evidence, it is tested as described in the document.

## Rollback procedure

Delete docs/GTM-ACQUISITION-CONSTRAINT.md and revert the T204 commits. The constraint remains in CARTA_UNIT_ECONOMICS.md section 5. No app state, data or config changed.
