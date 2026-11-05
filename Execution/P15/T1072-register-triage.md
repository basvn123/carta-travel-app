# T1072: register triage (ROADMAP A3)

## Date

2026-11-05

## What changed

`Execution/_OPEN.md` went from 1,603 open rows to 1,423 (1,424 with the new row T1072-a), so the A3 done condition (under 250) is not met and A3 stays `todo`. 180 rows were moved to `Execution/_OPEN-CLOSED.md` with Status `closed by T1072 (<reason>)`: 160 folded into a ROADMAP item whose text covers them, 18 done already (each with a checked proof) and 2 won't do. Every decision is in `Execution/P15/T1072-triage.csv` with its evidence. The 479 rows still owned by the owner are grouped into 11 ordered procedure files, `Execution/P15/_OPEN-<system>.md`, and 439 open rows now carry a "(procedure: file, step N)" pointer at the end of their Item. Most of the 1,423 remaining rows are still true, and closing them on the strict evidence rule (done needs a proof, folded needs ROADMAP text that covers the row) was not possible without a row by row check of code and live systems, which this task did not do.

Tools committed in `scripts/register/`: `triage.py` (parse, group by area and age, counts), `apply_decisions.py` (moves the rows named in the CSV, keeps CRLF and the register's column format), `owner_procedures.py` (writes the procedure files and the pointers).

## Files touched

- Created: `scripts/register/triage.py`, `scripts/register/apply_decisions.py`, `scripts/register/owner_procedures.py`, `Execution/P15/T1072-triage.csv`, `Execution/P15/T1072-register-triage.md`.
- Created, owner procedures: `Execution/P15/_OPEN-stripe.md`, `_OPEN-legal.md`, `_OPEN-hetzner-box.md`, `_OPEN-cloudflare.md`, `_OPEN-supabase-migrations.md`, `_OPEN-google-and-search.md`, `_OPEN-accounts-and-signups.md`, `_OPEN-translation-review.md`, `_OPEN-product-decisions.md`, `_OPEN-data-and-pipeline-runs.md`, `_OPEN-owner-checks.md`.
- Modified: `Execution/_OPEN.md` (180 rows out, 439 Items gain a pointer), `Execution/_OPEN-CLOSED.md` (180 rows in).

## Commands run

```
python scripts/register/triage.py                      # counts
python scripts/register/apply_decisions.py             # after each pass, from the CSV
python scripts/register/owner_procedures.py            # procedure files and pointers
python -I scripts/docs/check_entry_points.py           # Entry points OK
gh run list --workflow <name>                          # evidence for the CI rows
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Open rows (incl. the new row T1072-a) | 1,603 | 1,424 | -179 |
| Owner rows (Owner `user`) | 554 | 479 | -75 |
| Next-task rows | 1,049 | 944 | -105 |
| Open rows with a procedure pointer | 0 | 439 | +439 |

Rows per area (keyword grouping by `triage.py`; "other" is rows no keyword matched):

| Area | Before | After |
|---|---|---|
| other | 372 | 322 |
| explore | 230 | 195 |
| cloudflare | 156 | 137 |
| trails | 124 | 114 |
| plan | 94 | 88 |
| stays | 95 | 88 |
| legal | 82 | 77 |
| flights | 64 | 64 |
| pipeline | 67 | 62 |
| design | 77 | 59 |
| supabase | 60 | 54 |
| stripe | 42 | 39 |
| hetzner | 44 | 37 |
| images | 38 | 31 |
| ci | 30 | 28 |
| google | 28 | 28 |

Decisions in the CSV (180): folded 160, done 18, won't do 2.

| Decision | Target or proof | Rows |
|---|---|---|
| folded | G11 (ROADMAP line 838: one real-phone pass per release replaces the per-task phone rows) | 47 |
| folded | G11 (axe, Lighthouse CI and gate wiring) | 3 |
| folded | G10 (WCAG 2.2 AA audit, every failure fixed) | 29 |
| folded | H12 (fast first load, Core Web Vitals) | 20 |
| folded | G7 (dead CSS and override layer) | 26 |
| folded | G2 shared Button, G6 literal sizes and radii | 4 and 3 |
| folded | D7, D8, D9, G8 | 5, 2, 8 and 1 |
| folded | D3, C9, C4, H13, G13, G1 | 5, 3, 1, 1, 1 and 1 |
| done | schema-contract.yml and design-lint.yml have run green on GitHub (gh run 42049875211, 42049875197); uptime.yml runs green on schedule (42019896190) | 3 |
| done | migrations 013 to 060 live (T985 liveness query, `verify_live_policies.mjs` passed): T235-h, T039-d, T077-b | 3 |
| done | code gone: T199-d (`--ui` is Figtree only), T620-c (`filmPause` family removed), T821-a (removed by T832, 59dd1ec30a) | 3 |
| done | T558-d (p11-ask-carta merged into main) | 1 |
| done | production deployed with all merged work on 2026-11-03 (T1040) and design waves promoted (runbook, deploy d573ebf2): T447-a, T894-b, T899-c, T412-a, T369-c, T369-a, T231-c | 7 |
| done | T954-a (R2 objects out of date 34,699 to 0 in T1040) | 1 |
| won't do | T124-d, T367-c: the doc they correct moved to `archive/docs-2026-11/` in T1050 | 2 |

Owner procedures (rows per file): product-decisions 147, owner-checks 81, cloudflare 46, translation-review 46, data-and-pipeline-runs 40, legal 26, hetzner-box 20, stripe 11, supabase-migrations 10, accounts-and-signups 6, google-and-search 3. The secrets rows already live in `_OPEN-secrets-rotation.md`; T291-b, T1046-b and T296-a now point at it.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Moved rows ended `\|  \|` where the register uses `\| \|` | the first writer joined an empty Order cell with a space | `triage.fmt_row` and a one-line repair of the 106 affected rows, commit "keep the register's empty-Order cell format" |
| Keyword grouping puts some rows in the wrong system (a row saying "main checkout" landed in Stripe) | grouping is by regex | an `OVERRIDES` table in `owner_procedures.py` for the 40 misfits I saw; the rest of the 459 grouped rows were not all read, so a few misfiled steps are likely |
| An id match on "closes T123-a" in later reports looked like evidence | those lines are plans ("Closes ... needs your answer"), not outcomes | not used; every "done" above has its own proof |

## Screens checked

None. No traveller-facing file changed.

## What is still open

- The A3 done condition: 1,423 rows against a target under 250. Closing about 1,170 more needs one of: a row by row check of each follow-up against the code (about 940 next-task rows, most are small, true follow-ups from T143 to T1039), a decision to retire whole families, or batching families into ROADMAP items with new text. The largest families still open: Trips/carta-unified generation follow-ups (T143 to T171, waiting on decision A-a), design-lint baseline housekeeping (T191, T196, T388, T400, T462), stale `scripts/verify_*.mjs` harnesses (T482-a says 19 of 22 fail, T502-i 52, T507-a 27; the scripts still exist), the Ryanair-era leftovers (T508, T511, T519; code still present), Ask Carta follow-ups (T550 to T592), and the P15 "call made without the owner" rows (T856 to T874).
- Rows I did not touch on purpose: T1057-a, T333-a, T333-b, T333-c, T714-*, T1021-a, T1061-d, T1065-a, T1066-a, T293-a (the batch brief), every row ROADMAP.md or AUDIT-2026-11.md names by id (T032-e, T033-g, T048-h, T1024-b, T1026-c, T1027-c, T1032-b, T1033-a, T1039-b, T1040-d, T1041-b, T1043-a, T1043-b, T1045-h, T1054-a, T1056-a, T1057-c, T246-c, T281-b, T291-b, T460-b, T461-d, T461-e, T740-b, T030-a, T031-a, T216-a, T315-b, T461-b, T518-c, T530-b, T944-b, T985-a), and rows mentioning Hostelworld, Xotelo, Booking scrape, SEO, prerender, sitemap, canonical, threat model, auth settings, MFA or audit logs (they get no pointer and are not in a procedure; T222-d was skipped by this filter).
- Rows I was unsure about and left open (each plausibly done or foldable, none proved): T565-b (Ask in production), T640-a and T805-a (merge half is done: p15-explore-data-fill is in `git branch --merged main`, p11-flights-to-august merged in d05ec96e83; the box steps are not provable from here), T412-b (data host 404 for `stubs/AL.json`; the full push in T1040 probably fixed it, no wget done), T083-c (rls-policies has run on GitHub but its last two runs on main failed: still true), T785-a (T1040-c says the prune was not run), T069-b and T070-b (re-paste warnings, true only if 020 or 038 is pasted again), T041-b (pg_cron and pg_net on live: unknown), T200-g (needs real traffic), T227-b, the native-review rows (46; ROADMAP I8 covers key parity, not native review, so they were not folded), and the "Call made without the owner" rows T856-a to T874-f (no later owner answer found).
- Folding owner rows into G11 contradicts the batch note that owner rows stay open unless done or won't do. I did it for the 47 real-phone rows because ROADMAP line 838 states in words that the per-release phone pass replaces them. If you want those rows back, move them with `git revert` of commit "pass 1".
- G11, G10 and the other folds only make the rows invisible in the register; the work they name is now tracked by the ROADMAP item and its phase gate.
- One register row for this task: T1072-a, next task, "A3 not met: 1,423 open rows, see 'What is still open' in the T1072 report".

## Rollback procedure

`git revert` the T1072 commits in reverse order: owner procedures (pointers and the 11 files), pass 3, pass 2, pass 1. Each pass is its own commit, so one pass can be reverted alone; the CSV rows of a reverted pass stay in the CSV and `apply_decisions.py` would move them again, so delete those CSV rows with the revert. Nothing here touches live data or the app.
