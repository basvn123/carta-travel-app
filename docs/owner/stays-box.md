# Owner steps: the box rebuilds stay prices each month (T1021)

The scrape journal on R2 (`r2:carta-stays-state/state/journal_scrape.sqlite`) is the only source of bed prices. The box scrapes Hostelworld in March and September (`carta-stays-scrape.timer`, `CARTA_STAYS_SCRAPE=1`, set 2026-11-12) and builds and publishes the prices to `data/stays-live/v1/` in its monthly run (`stays` is a monthly task; `carta-monthly.timer`). The app reads that folder, so no deploy is needed for new prices.

Checked 2026-11-12: the box is on `main`, the timers are in place, but the R2 key the box (and the laptop's rclone) uses is refused on the private bucket `carta-stays-state` (HTTP 403). Until that changes the scrape cannot upload and the monthly build cannot download, and `stays` has never succeeded.

Rows: 1.

## Steps

1. **T1021-a: let the box's R2 key reach `carta-stays-state`.** Cloudflare dashboard, R2, Manage R2 API Tokens, open the token whose Access Key ID is the box's (on the box: `grep RCLONE_CONFIG_R2_ACCESS_KEY_ID ~/.config/carta/env`), Edit, under bucket scope add `carta-stays-state` with Object Read and Write, Save. Done when, on the box, `set -a; . ~/.config/carta/env; set +a; rclone lsf r2:carta-stays-state/state/` lists `journal_scrape.sqlite`. Then tell Claude: it runs `python pipeline/stays/box_stays.py --dry-run` and the real build, reads `cache/stays/gate_report.md` (T645-a), and cleans the old Xotelo, Inside Airbnb and Eurostat state out of the bucket.

The laptop scrape stays (owner, 2026-11-13): `CartaStaysBooking` and `CartaStaysHostelworld` run `scripts/stays_scrape.bat` hourly in March and September and upload the journal through wrangler, which the 403 above does not touch. Booking runs from the laptop only (it turns away datacenter addresses), never with proxies or by solving challenges (ROADMAP I16, T1052-a). Before March 2027 one question is open for Claude (ROADMAP I16): the box timer and the laptop task would both scrape Hostelworld and both upload to the same journal key, where the copy with more rows wins and the other's new rows are lost.
