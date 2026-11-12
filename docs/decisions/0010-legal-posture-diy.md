---
status: accepted
date: 2026-11-12
decided-by: Claude, under the owner's 2026-11-12 instruction to make the open owner decisions (owner ticks final)
---

# 0010 · Legal posture: a digital-service pass, checked by self-review

## Context
Decision 0007 runs Carta without an accountant or a lawyer: legal texts are written from official sources and checked against the `docs/legal/` checklist. Many owner steps still read "have a lawyer check". On 2026-11-12 the owner asked Claude to make those calls itself (owner-decisions run, `.work/2026-11-12-owner-decisions/`). A critique for a Belgian sole trader selling to EU consumers (`critique-legal-risk.md` in that run) found no blocker and 17 major points; its fixes are part of this decision.

## Options considered
1. **Pay for a one-off legal review before launch.** Safer wording, a fixed cost before revenue, against 0007.
2. **Self-review by a Claude session against the official texts**, with each clause recorded next to the text it supports, and the riskiest reading chosen where sources disagree.

## Decision
We chose **option 2**, with these rules:
- **A pass is a digital service**, not digital content. The checkout asks to start at once; a withdrawal within 14 days refunds pro rata for the days the pass has run (Directive 2011/83/EU Art 14(3)); the right ends only when the pass has fully run (Art 16(a)). The request to start is repeated in the purchase confirmation email (the durable medium of Art 8(7) and 8(8)), with the 14-day right, the pro-rata rule and the model form. The checkout text never says the buyer "loses" the right.
- **The Year Pass is a one-off 12-month pass that never renews** (also 0007, I-f): checkout mode `payment` for both passes.
- **Self-review replaces "have a lawyer check".** Each legal text names the articles it relies on; a session re-reads them when the text changes. The AI page says the check was done by Carta's owner with AI help and is not legal advice.
- **Conservative where sources disagree.** VAT and sale records are kept 10 years after the end of the year of the sale (the Law of 18 December 2025 restored 7 years, but the FPS Finance page still says 10).
- **No Booking-derived price is published.** Press stories, social images and data stories never show bed or stay prices derived from Booking.com scraping (customer terms A15.2, A18.3); they wait for a licensed source (I16). Scraped Google Flights fares stay in the free tier and trip totals only, never sold as "live flight prices" (owner tick T1052-a).
- **Gates.** Dutch Terms, Privacy and Imprint read by the owner, and the AI Act Art 50(2) machine-readable mark, are in the T227 gate; the Imprint carries the owner's name and address before the closed beta; the checkout text and mode are in the T228 gate (`ROADMAP.md` section 16).

## Consequences
- Good: no fixed legal cost before revenue; every legal choice is written down with its source.
- Bad: a mistake is the owner's to find and fix; the pro-rata refund costs a little more admin than a full waiver.
- If revenue grows, a one-off professional review stays an option and would be a new decision.

## How we'll know it works
T227 and T228 pass with the texts above; no refund dispute turns on the withdrawal wording; the yearly re-read of the cited articles finds no change that the texts missed.
