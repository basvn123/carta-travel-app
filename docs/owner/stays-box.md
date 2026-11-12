# Owner steps: the box rebuilds stay prices each month (T1021)

After T1021 the scrape journal on R2 is the only source of bed prices. The laptop scrapes and uploads `state/journal_scrape.sqlite` to the private bucket `carta-stays-state`. The box builds the prices from it each month and publishes them to `data/stays-live/v1/`. The app already reads that folder, so no deploy is needed for new prices.

Do these in order, once T1021 is merged into `main` and pushed:

1. **Move the box to the commit.** On the box (`ssh -i ~/.ssh/carta_orchestrator_ed25519 carta@46.225.237.75`):

   ```
   cd ~/carta && git fetch origin main && git checkout -B carta-run origin/main
   ```

2. **Check that rclone reaches both buckets:**

   ```
   set -a; . ~/.config/carta/env; set +a
   rclone lsf r2:carta-stays-state/state/ | grep journal_scrape
   ```

   If the remote has no access to `carta-stays-state`, add that bucket to the R2 token the box uses.

3. **Run it once by hand to see the gate report:**

   ```
   python pipeline/stays/box_stays.py --dry-run     # prints the rclone steps only
   python pipeline/stays/box_stays.py               # downloads, builds, gates, publishes
   ```

   It exits 0 when published and 2 when the gate refused (the live files then stay). The report is at `cache/stays/gate_report.md`.

4. **Add the task to the monthly run.** In `~/.config/carta/env`, add `stays` to `CARTA_EXTRA_TASKS` (comma separated). The task is `monthly`, so it runs on the first Monday run of each month.

5. **Optional clean-up:**
   - Remove the GitHub secrets the deleted `stays-refresh` workflow used: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `SERPAPI_KEY`. Only remove them if no other workflow uses them.
   - Delete the Xotelo, Inside Airbnb and Eurostat state from `carta-stays-state`: everything except `state/journal_scrape.sqlite`.

The laptop side does not change: `scripts/stays_scrape.bat` still scrapes in March and September and uploads the journal after every run.
