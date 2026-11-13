# Owner and box steps: scraper health (T1074, T1075)

No owner steps left (owner sweep 2026-11-12, `.work/2026-11-12-owner-box/report.md`):

- The monthly stays build waits on one Cloudflare token change: `docs/owner/stays-box.md`.
- The health check (`scripts/stays_health.py`) reports through the box run status instead of a mail, and the real Hostelworld card fixture and the missing-beds re-scrape are taken by Claude at the March 2027 box scrape: ROADMAP I16.
- The hotel scrape stays (owner, 2026-11-13). On the laptop, `CartaStaysBooking` and `CartaStaysHostelworld` run `scripts/stays_scrape.bat booking` and `hostelworld`, hourly in March and September only (next start 2027-03-01 00:16); each start resumes that month's plan from `cache/stays/journal_scrape.sqlite`. The owner sweep had disabled them on 2026-11-12 because every run read 0 pages, but that was the 2026-10 plan being finished (Booking 3,437 towns on 6 dates, Hostelworld 1,219 towns on 5 dates), not a block. `Disable-ScheduledTask -TaskName <name>` pauses one.
- Booking: the owner reopened the laptop Booking scrape on 2026-11-13 for the March and September seasons. Never with proxies or by solving challenges; a 403, 429 or challenge stops it for 20 hours (ROADMAP I16, T1052-a).
- The flight sweep stays: the `flight-sweep` Worker (searches every minute, publishes `data/flights/` every 10 minutes) and the box's `carta-late-sweep.service`. The laptop's `CartaFlightsAll` and `CartaFlightsNow` were never the sweep: they were one-off seeds of the Worker's D1 database that finished on 2026-10-23, so they stay disabled.
- Local transport fares (T714-b): decided "Not now" (owner tick, 2026-11-12); the price card keeps its honest "Not yet measured" row (ROADMAP D10).
