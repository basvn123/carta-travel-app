# Owner and box steps: scraper health (T1074, T1075)

The scripts exist in the repo; these steps need the box or the laptop. Do them in order after the branch is merged and pushed.

1. **Switch on the monthly stays build (T1021-a).** The steps are in `docs/owner/stays-box.md` (box to main, rclone access to `carta-stays-state`, one manual `box_stays.py` run, add `stays` to `CARTA_EXTRA_TASKS`).

2. **Capture one real Hostelworld page.** The parser test in `pipeline/stays/tests/test_hostelworld_cards.py` uses card text built from the journal's own price text, because the scraper saves no page. On the laptop, run `python pipeline/stays/scrape_hostelworld.py --run 2027-03 --only FLR --months 3 --headed`, and while it runs save the list page's card texts (the output of `CARDS_JS`) into `pipeline/stays/tests/fixtures/hostelworld_cards.json`, replacing the synthetic cards. Strip nothing personal: a list page holds hostel names and prices only.

3. **Run the health check after each scrape and each box build.** On the laptop and on the box:

   ```
   python scripts/stays_health.py
   ```

   It writes `cache/stays/stays_health.json` (copy it next to the other admin reports) and exits 1 when a source's yield fell below 70% of its 7-run median, or a place's median price moved more than 25%, and 2 when it could read nothing.

4. **Email on a non-zero exit.** In the scheduled wrapper (`logs/run_*.cmd` on the laptop, the run script on the box), after the health line:

   ```
   python scripts/stays_health.py || <send the report with your mail command>
   ```

   The mail command is the owner's choice (the box's mail relay or the Task Scheduler "send an email" action). Attach `cache/stays/stays_health.json`.

5. **Booking stays paused.** Booking has blocked the scrape since 30 October. Do not resume it with proxies or by solving challenges. Resume only when the owner decides (ROADMAP I16, T1052-a), on the laptop, with the normal pace. The health check will show its yield alert until then; that is expected.

6. **Stop the empty hourly Hostelworld task.** The `CartaStaysHostelworld` task has had nothing left to read since the run finished (T1046-a): pause it. This is the owner step already on the register.

7. **Bed re-scrape of the missing places (T1075).** After step 2, run `python scripts/missing_beds.py --out cache/stays/missing_beds.json`, and give `cache/stays/missing_beds.json` to the next laptop scrape (`--only` takes ids: use `missing.ids`, comma separated). Check the places' Booking search terms first (T1021-d).

8. **Local transport fares (T714-b).** Waits on the owner's choice of fare source. Not built.
