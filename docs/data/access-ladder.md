# Data access ladder (ROADMAP I16)

Carta earns legal access to commercial data with traffic. This page is the written record per source. Thresholds and flags live in `continent-app/config/access-ladder.json` (edit there, not in code). Every flag is off until its environment variable is set to `1`; nothing here switches anything live.

Terms checked: **2026-11-07** by a research subagent. Its limit: the official hosts could not be fetched from the build container, so the points marked UNVERIFIED rest on search snippets and need a manual read before Carta builds on them (owner step T1213-a).

| Source | Today | Legal route | Unlocks when | Flag (default off) | Code path |
|---|---|---|---|---|---|
| Flight fares | Scraped from Google Flights | Aviasales Data API (Travelpayouts), free token, cached fares, meant for content pages | Signup now. Coverage threshold 80% of routes (starting value, confirm after the P1 run) | `LADDER_STOP_GOOGLE_FLIGHTS` | `sweepMinute` in the flight sweep Worker returns without searching |
| Live flight search | Not available | Travelpayouts Flight Search API | About 50,000 monthly active users, by application | `LADDER_LIVE_FLIGHT_SEARCH` | Reserved, no code path |
| Bed prices | Owner-run Booking.com sample, twice a year (decision I-g, option A) | Booking.com Demand API, Managed Affiliate Partners only | Contract and account manager; no published volume | `LADDER_STOP_BOOKING_SCRAPE` | `scrape_booking.py` refuses to run |
| Hostel prices | Owner-run Hostelworld sample | Affiliate programme on Partnerize; no public API found | Approval of the campaign; direct partnership once there are numbers | `LADDER_STOP_HOSTELWORLD_SCRAPE` | `scrape_hostelworld.py` refuses to run |
| Activity prices | None | Viator Basic access, Tiqets self-service API, GetYourGuide partner programme | Available now (P3, with I4) | `LADDER_ACTIVITY_PRICES` | Reserved, no code path |

## Terms found (2026-11-07)

- **Aviasales Data API.** Free token. Cache 2 to 7 days. Limits since 2024-06-14: 300 a minute for latest prices, 600 for prices for dates and grouped prices. Travelpayouts advises using it to generate content pages. Links: https://support.travelpayouts.com/hc/en-us/articles/203956163 , https://support.travelpayouts.com/hc/en-us/articles/203956083-Requirements-for-Aviasales-data-API-access , https://support.travelpayouts.com/hc/en-us/articles/4402565416594 . UNVERIFIED: storage clause, marker requirement.
- **Flight Search API.** About 50,000 confirmed monthly users, traffic proof, a signature scheme and by-invitation access. https://support.travelpayouts.com/hc/en-us/articles/210995808-How-to-get-access-to-the-Aviasales-Search-API . UNVERIFIED: ban on collecting booking links ahead of a click.
- **Booking.com Demand API.** v3.1 current; Managed Affiliate Partners only, contract and account manager, no published volume. https://developers.booking.com/demand/docs/getting-started/prerequisites . Booking's customer terms (read via third parties) forbid automated collection; the affiliate contract wording was not seen. Booking cut thousands of affiliates in 2025 (https://skift.com/2025/05/30/why-booking-com-cut-thousands-of-affiliate-partners-and-what-comes-next/ ). This is why decision I-g is reviewed before the P4 application.
- **Hostelworld.** Partnerize campaign, reviewed before approval, 30-day last-click cookie, no fees. https://partners.hostelworld.com/faqs , terms https://partners.hostelworld.com/wp-content/uploads/2026/05/new-affiliate-tcs-1.pdf . UNVERIFIED: scraping and caching clauses.
- **Viator, Tiqets, GetYourGuide.** Viator Basic access is immediate and free (content and availability only): https://partnerresources.viator.com/travel-commerce/affiliate/ . Tiqets API is self-service and free: https://www.tiqets.com/partner-program/api-program . GetYourGuide affiliate is free; whether a partner manager is needed is UNVERIFIED: https://connectivity.getyourguide.com/partners1 .
- **Google Flights.** No public API since QPX closed in 2018; Google's terms are reported to forbid automated access (https://policies.google.com/terms , clause UNVERIFIED). There is no legal route, so scraping stops before the first paid sale.

## The steps

1. P1: measure Aviasales coverage on the 10,094 routes; switch fares route by route where covered.
2. Before the first paid sale: set `LADDER_STOP_GOOGLE_FLIGHTS=1` on the sweep Worker (and stop the late sweep box).
3. Before the Booking.com affiliate application (P4): review decision I-g; set `LADDER_STOP_BOOKING_SCRAPE=1` if moving to option C. Reviewed 2026-11-12 (owner, T1213-h): option A stays, keep scraping Booking.com and Hostelworld, flagged as a known risk.
4. About 50,000 monthly users: apply for the Flight Search API.
5. Steady Booking and Hostelworld clicks: apply or approach with the numbers.

The unlock numbers (monthly users, clicks and bookings per partner) are the K12 admin view; their reader is still open (T1109-b).
