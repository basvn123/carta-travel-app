# Owner procedure: Pipeline and data runs that wait on you (T1072, ROADMAP A3)

Since T1107 the box runs every pipeline task on a schedule, so a data run is no longer an owner step: the checks Claude does after each box run are in ROADMAP H9, and the data-lane exports that still need code are in ROADMAP D7, D10, D11 and D18 (owner sweep 2026-11-12, `.work/2026-11-12-owner-box/report.md`). Paid runs are in `docs/owner/paid-runs.md`. What is left here needs a person, a phone or a drive. When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Rows: 4.

## Steps

1. **T1054-a: sign out on a real phone.** On your phone, open the live site, sign in, add a trip, then Account, "Sign out and remove". Done when, signed in again on a second device, no trip, booking or crew from that phone is left (ROADMAP N5).
2. **T187-b: the five-person first-run test.** Five people who have never seen Carta each try the task in the last section of the first-run doc (`git show archive/execution-2026-11-11:archive/docs-2026-11/FIRST_RUN_RESULT.md`) on a preview build; time how long each takes to answer and send Claude the five times.
3. **T405-c: a failed PDF export, once.** Signed in with an account that has the pass, export a trip PDF with the network switched off in the browser's dev tools at the moment you press export. Done when the error line shows and the share fallback works.
4. **T311-g: the archive tool refuses a FAT32 drive.** Plug in the D: drive, then in Git Bash in the main checkout: `python pipeline/archive/pack.py --dry-run --out D:/carta-archive-out`. Done when it says the drive is FAT32 and refuses `lakes-cache`.

## Moved from unsorted.md (owner sweep 2026-11-12)

| ID | Item | Order |
|---|---|---|
| T1149-b | Hand-label the 400 rows of continent-app/scripts/eval/taxonomy/gold.csv per docs/ai/taxonomy-labelling-guide.md, then run the taxonomy eval with --write --dashboard; until then the eval scores a 15-item seed set labelled by the session, which proves it runs and says nothing about quality | 2 |
| T1188-a | The text judge does not count: its only labels are seeded (T1144's blind session verdicts plus the planted key, two model raters); label the 50 texts (T1144-b) and run `python -I scripts/validation/judge.py calibrate --write` to see whether the session judge passes the threshold rule ([report](P15/T1188-llm-judge.md)) | 1 |
