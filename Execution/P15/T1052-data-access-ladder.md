# T1052: Data access ladder and the bed-price decision

## Date

2026-11-04

## What changed

`ROADMAP.md` gains **I16, the data access ladder**: the plan to earn legitimate access to commercial data with traffic. For each source it records today's state, the legal route, the milestone that unlocks the next step, and when:
- **Flight fares.** Move to the Aviasales Data API where its coverage is good. Scraping Google Flights has no legal route, so it stops before the first paid sale.
- **Live flight search.** Apply to Travelpayouts around 50,000 monthly users.
- **Beds.** Earn Booking.com's Demand API through managed-partner status, which comes from bookings sent through affiliate links.
- **Hostels.** No public API; approach Hostelworld directly with volume numbers after launch.
- **Activities.** Viator and Tiqets APIs, available now.

The owner decided the bed question: **option A (decision I-g)**. Bed prices keep coming from scraping Booking.com and Hostelworld, flagged as a known risk, until the Demand API opens. The safeguards are written in:
- slow scraping, and Carta shows only its own derived figures, never copied listings;
- an affiliate link to the real price, plus the kill switch and a band fallback, so stopping is easy;
- D5's block alerts;
- the risk written into the I-R5 checklist and an ADR.

There are two review dates. The first is before the Booking.com affiliate application in P4, because its terms likely forbid scraping and a breach could cost the account the ladder depends on. The second is when the Demand API opens. K12 tracks the unlock numbers in admin.

## Files touched

- Modified: `ROADMAP.md` (I16, I-g, P1 owner note, K12, must list, tracks table), `Execution/_OPEN.md` (row T1052-a)
- Created: `Execution/P15/T1052-data-access-ladder.md`

## Commands run

None that change the system.

## Config and secrets set

None.

## Before/after measurements

Not measured: documentation only.

## What broke and how it was fixed

No issues.

## Screens checked

None.

## What is still open

- T1052-a: stop scraping Google Flights before the first paid sale, after measuring Aviasales Data API coverage in P1; review decision I-g (keep scraping beds, or move to option C) before applying to the Booking.com affiliate programme in P4.

## Rollback procedure

`git revert` of the T1052 commit. Documentation only.
