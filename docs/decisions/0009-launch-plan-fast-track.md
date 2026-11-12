---
status: accepted
date: 2026-11-12
decided-by: Bas (owner ticks T1045-i, T1047-a, T1049-a)
---

# 0009 · Launch plan: the fast track

## Context
`ROADMAP.md` section 4 offered two plans: the normal plan (about 6 to 8 sessions a week, register in week 13, one launch on Tue 4 May 2027) and a fast track (30 to 40 sessions a week, a public opening in March, the campaign still on 4 May). Section 19 held the other open plan-of-record questions as recommendations. On 2026-11-12 the owner ticked "accept every recommendation" (T1045-i, T1047-a) and "fast track" (T1049-a); the owner-decisions run turned them into dates and gates.

## Options considered
1. **Normal plan.** Register about week 13, open beta in April, launch 4 May. Less review load, no paying traveller before the campaign.
2. **Fast track.** Public opening on Tue 9 March 2027 for summer planners, campaign launch on Tue 4 May 2027 with real users behind it.

## Decision
We chose **option 2**:
- Registration as a sole trader about Mon 22 February 2027 (W8, decision 0007).
- Public opening O = Tue 9 March 2027 (W10): open to everyone, quiet channels only (waitlist, communities, data stories).
- Campaign launch D = Tue 4 May 2027 (W18): Product Hunt, press, OSM forum, courtesy notes.
- The dated runway lives in `ROADMAP.md` section 16, "Launch runway". Its gates:
  - O-42 (Tue 26 Jan): gate check; move O then, not later.
  - O-21 (Tue 16 Feb): I-R4 finished and the VAT regime written down; the K-b founding price set from measured AI use.
  - O-7 (Tue 2 Mar): T227 legal gate (Dutch Terms, Privacy and Imprint read by the owner; the AI Act Art 50(2) machine-readable mark shipped), T232 Supabase Pro, T235 alerting.
  - O-1 (Mon 8 Mar): T228 payments gate: one real purchase succeeded and refunded, credit note issued (payout reconciliation follows the first payout); checkout in mode `payment` for both passes; the withdrawal request text and the confirmation email as in decision 0010.
- Before the first closed-beta invitation (K9, January): the Imprint carries the owner's legal name, postal address and email.
- If Stripe verification is late, O opens as a free open beta and the paid Pass goes live the day after T228 passes. If T227 or T235 is late, O moves. The gates never move.
- Every other section-19 row is decided as recommended; K-b carries no invented figure (the rule is in section 19).

## Consequences
- Good: real travellers and testimonials before the campaign; summer planners reached in March.
- Bad: three outside approvals (enterprise number, VAT status, Stripe verification) must fit in about 14 days; the owner's review time (2 to 4 hours a day) is the real limit.
- If the weekly allowance or review time cannot carry 30 to 40 sessions, the dates stretch toward the normal plan.

## How we'll know it works
The Tue 26 Jan gate check passes or moves O on that day; T227 passes by Tue 2 March and T228 by Mon 8 March; the O+14 opening marks (one recorded purchase, every message answered within two working days) hold on Tue 23 March.
