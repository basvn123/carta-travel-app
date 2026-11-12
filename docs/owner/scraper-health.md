# Owner and box steps: scraper health (T1074, T1075)

No owner steps left (owner sweep 2026-11-12, `.work/2026-11-12-owner-box/report.md`):

- The monthly stays build waits on one Cloudflare token change: `docs/owner/stays-box.md`.
- The health check (`scripts/stays_health.py`) reports through the box run status instead of a mail, and the real Hostelworld card fixture and the missing-beds re-scrape are taken by Claude at the March 2027 box scrape: ROADMAP I16.
- The laptop's hourly `CartaStaysHostelworld`, `CartaStaysBooking`, `CartaFlightsAll` and `CartaFlightsNow` tasks were disabled on 2026-11-12 (Task Scheduler; `Enable-ScheduledTask -TaskName <name>` undoes it).
- Booking stays paused: never resume it with proxies or by solving challenges; only the owner reopens it (ROADMAP I16, T1052-a).
- Local transport fares (T714-b): decided "Not now" (owner tick, 2026-11-12); the price card keeps its honest "Not yet measured" row (ROADMAP D10).
