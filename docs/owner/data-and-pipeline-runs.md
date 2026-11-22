# Owner procedure: Pipeline and data runs that wait on you (T1072, ROADMAP A3)

Since T1107 the box runs every pipeline task on a schedule, so a data run is no longer an owner step: the checks Claude does after each box run are in ROADMAP H9, and the data-lane exports that still need code are in ROADMAP D7, D10, D11 and D18 (owner sweep 2026-11-12, `.work/2026-11-12-owner-box/report.md`). Paid runs are in `docs/owner/paid-runs.md`. What is left here needs a person, a phone or a drive. When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Rows: 8.

## Steps

The wave 1 data fixes (2026-11-22) are in code and not yet on the box, so the live wire still has the bed loss. Do steps 5 to 8 in this order: 5, then 6, then 7. Step 8 can happen any time before 2027-01-16.

1. **T1054-a: sign out on a real phone.** On your phone, open the live site, sign in, add a trip, then Account, "Sign out and remove". Done when, signed in again on a second device, no trip, booking or crew from that phone is left (ROADMAP N5).
2. **T187-b: the five-person first-run test.** Five people who have never seen Carta each try the task in the last section of the first-run doc (`git show archive/execution-2026-11-11:archive/docs-2026-11/FIRST_RUN_RESULT.md`) on a preview build; time how long each takes to answer and send Claude the five times.
3. **T405-c: a failed PDF export, once.** Signed in with an account that has the pass, export a trip PDF with the network switched off in the browser's dev tools at the moment you press export. Done when the error line shows and the share fallback works.
4. **T311-g: the archive tool refuses a FAT32 drive.** Plug in the D: drive, then in Git Bash in the main checkout: `python pipeline/archive/pack.py --dry-run --out D:/carta-archive-out`. Done when it says the drive is FAT32 and refuses `lakes-cache`.
5. **D10, 0.3: pull the patch on the box.** SSH to the box and pull `main` in the box checkout once the data branch is merged (the box needs the publish guard and the bed rules; the guard refuses a publish until they are there). Done when `python -I scripts/quality/publish_guard.py` runs on the box. Not verified here: the box path and the pull itself, nothing was run on the box.
6. **D10: run the stays task, then publish.** On the box: `python pipeline/stays/box_stays.py` (usage from its docstring; verified to import and pass its tests, not run on the box). It writes the clean beds into the box master (dorm above hotel3 dropped, measured beds kept; it refuses if the measured share would fall more than 2 points). Then the box's next scheduled run publishes through the guard. Done when the guard prints PASS and the live `app_data` has about 3,340 measured places and no dorm above hotel3 (`python -I scripts/quality/launch_gate.py --public <dir>` shows the table).
7. **0.2: re-publish the laptop wire as a stopgap, only if you will not wait for step 6.** Default 19 (`docs/owner/product-decisions.md`): yes. The wire from commit `93987631ff` has 35 places with a dorm above hotel3, so the guard refuses it unless you override. In the main checkout, from `continent-app/`: `python ../scripts/quality/publish_guard.py --override "stopgap 0.2"` (no `-I`: the guard needs `yaml`, which sits in the laptop's user packages and `-I` skips them), then `node ../scripts/ship.mjs` (dry run), then `node ../scripts/ship.mjs --live` from `main`. Not verified: the three commands were not run together; `ship.mjs` has no guard step yet (a request to the orchestrator is open), so the first command is the only guard. Done when the live site shows measured beds again. Step 6 replaces this wire later.
8. **D7, 0.4: trail names deadline 2027-01-16.** Before the trails rebuild (T1092-a) runs on the box, 2027-01-16 at the latest, confirm `python -I scripts/quality/trail_names_replay.py` prints ACCEPT on the wire you are about to publish. Done when it prints ACCEPT and the rebuild has run.

## Moved from unsorted.md (owner sweep 2026-11-12)

| ID | Item | Order |
|---|---|---|
| T1149-b | Hand-label the 400 rows of continent-app/scripts/eval/taxonomy/gold.csv per docs/ai/taxonomy-labelling-guide.md, then run the taxonomy eval with --write --dashboard; until then the eval scores a 15-item seed set labelled by the session, which proves it runs and says nothing about quality | 2 |
| T1188-a | The text judge does not count: its only labels are seeded (T1144's blind session verdicts plus the planted key, two model raters); label the 50 texts (T1144-b) and run `python -I scripts/validation/judge.py calibrate --write` to see whether the session judge passes the threshold rule ([report](P15/T1188-llm-judge.md)) | 1 |
