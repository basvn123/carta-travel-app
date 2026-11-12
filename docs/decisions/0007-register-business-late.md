---
status: accepted
date: 2026-11-04
decided-by: Bas
---

# 0007 · Register the business late, as a sole trader

## Context
Carta will sell passes. Registering a business, hiring an accountant or a lawyer, and taking live payments all cost money and admin before there is revenue (T1048, `ROADMAP.md` section 4 and Track I, item I1).

## Options considered
1. **Register now with professional help.** Safe, but cost and admin from day one.
2. **Register late as a sole trader, do legal and admin work from official sources.**

## Decision
We chose **option 2**:
- Register as a sole trader a couple of weeks before money first flows. Base plan week 13 (about 2027-03-29, week 14 at the latest); the fast track moves it to about week 8 (2027-02-22). `ROADMAP.md` has the current week.
- No accountant and no lawyer. Legal checklists live in `docs/legal/`.
- Until registration: a free beta and Stripe in test mode only.
- Sell only one-off passes; the yearly plan is a 12-month pass that does not renew.

## Consequences
- Good: zero fixed cost until revenue is real.
- Bad: legal work rests on the owner; live payments wait for the registration step.

## How we'll know it works
No live Stripe key is set before registration; no task proposes hiring professionals.

## Later decisions
- [0009](0009-launch-plan-fast-track.md) (2026-11-12): the fast track is the plan; registration about Mon 2027-02-22.
- [0010](0010-legal-posture-diy.md) (2026-11-12): a Claude session's self-review against the official texts takes the place of a lawyer's check; the legal choices this decision leaves to the owner are written down there.
