# T280 The trails export applies the credit gate

## Task ID

T280

## Date

2026-10-02

## What changed

The trails export (`pipeline/trails/export_wire.py`) now refuses any photograph whose licence owes a credit and which carries no author, using the same rule beaches, lakes, mountains and cycling use: `owes_credit` in `pipeline/photos/credit.py`. Before, the export copied every ranked row of the lab's `images` table to the wire. Now `main()` passes each trip's rows through a new `credited()` before anything else reads them, so a held-back photograph reaches neither the card hero nor the detail gallery. The author is tested after `clean_author()`, so a Commons Artist field that is only a licence blurb counts as no author, which is what a reader saw. A trip that loses every photograph falls back to its drawn route (TrailPicture), the same path a trip whose photos were all rejected by the audit already takes. The export prints how many photographs it held back. It recovers on its own: a name that appears on Commons later brings the photograph back at the next export.

Code only. The export was not run, the lab (port 5433) was not touched, and nothing under data/ or continent-app/public was written. The effect below was counted read-only against the published wire in the main checkout. Row T269-f is closed.

## Files touched

Root repo, branch p3-trails-credit-gate. No app repo change.

**Modified:**
- pipeline/trails/export_wire.py (credited(), the import of credit.owes_credit, the gate and its log line in main())
- Execution/_OPEN.md (T269-f closed, T280-a added)

**Created:**
- tests/test_trail_photo_credit.py (9 cases)
- Execution/P3/T280-trails-credit-gate.md

**Deleted:**
- None.

## Commands run

From the worktree in Git Bash.

```
python -m pytest tests/test_trail_photo_credit.py tests/test_trail_titles.py tests/test_trail_data_bugs.py -q   # 52 passed
python pipeline/photos/verify_credit.py          # 14 cases hold
python -m pyflakes pipeline/trails/export_wire.py tests/test_trail_photo_credit.py   # clean
python $SCRATCH/count_t280.py                    # read-only count over the main checkout's public/trails
git show --stat HEAD                             # after each commit
```

The test was also run with a planted fault (`credited()` returning every row): 7 of 9 cases fail, so it detects the missing gate.

## Config and secrets set

None.

## Before/after measurements

Counted on the published trails wire in the main checkout (17,670 detail files, 3,554 with photographs, 11,276 photo records). "After" is what the gate would remove at the next export, given the same lab rows; the wire itself has not changed yet (T280-a).

| Metric | Before | After | Delta |
|---|---|---|---|
| Photo records owing a credit with no author | 160 | 0 | -160 |
| Distinct Commons files among them | 150 | 0 | -150 |
| Trips with at least one such photo | 118 | 0 | -118 |
| Card heroes owing a credit | 53 | 0 | -53 |
| Trips left with no photograph (drawn route instead) | 0 extra | 6 | +6 |

By licence, the 160 are: CC BY-SA 4.0 80, CC BY-SA 3.0 47, CC BY 3.0 20, CC BY-SA 3.0 at 4, CC BY-SA 2.0 3, and one each of CC BY 2.5, CC BY 4.0, CC BY-SA 3.0 pl, dl-de/by-2-0, "Attribution" and CC BY 2.5 dk.

T269 reported 102 (48 / 35 / 11 / 8). This count is per photo record in the detail files, and the licence mix has the same shape, but it is higher. T269 counted through derive's sources pass, which reads titles once and may have applied a different unit; I did not reconcile the two. The gate removes whatever the rule says at export time, so the exact figure does not change the fix.

## What broke and how it was fixed

No issues.

## What is still open

The wire still carries the 160 records until the trails export next runs against the lab. Running it was outside this task's scope (no export, no lab writes), so it is T280-a for the owner, after this branch is merged. When it runs, the log line "N photograph(s) held back" should read close to 160 if the lab has not changed. No screen changed in this task, so no browser check was made; after the export, the 6 trips that lose every photo will show their drawn route on the card.

Nothing here calls the Claude API.

## Rollback procedure

Nothing live changed. Revert the two commits on p3-trails-credit-gate, newest first, or drop the branch before merging:

```
git revert <report commit> <code commit>
# or, unmerged:
git branch -D p3-trails-credit-gate
```

If the export has already run with the gate, a revert and a fresh export put the 160 records back on the wire.
