# T1048: Late registration, no accountant, no lawyer

## Date

2026-11-04

## What changed

The owner decided to start the business as late as possible and to run it without an accountant or a lawyer. `ROADMAP.md` now plans for that:
- **Phases.** Until registration, everything runs free and in Stripe test mode, and the closed beta in P3 is free. Registration as a sole trader is set for early P4 (week 13, about 29 March 2027; week 14 at the latest). That leaves about two weeks for the business number, the VAT status and Stripe's verification, plus a buffer before the 4 May launch. Payments go live and affiliate partner IDs switch on only after registration.
- **Research.** Two new owner research items, I-R4 (registering late and running the admin yourself) and I-R5 (do-it-yourself legal), replace the accountant's VAT answer and the lawyer reviews. Both start from official sources: FOD Economie, FOD Financien, the data protection authority APD/GBA, EU consumer law guidance and EUIPO TMview.
- **Legal checklist.** The legal texts are checked against a checklist in `docs/legal/`.
- **Simplifications.** The plan steers away from the hard legal areas: one-off passes only, the yearly plan as a 12-month pass that does not renew (new decision I-f), the EU model wording for the withdrawal waiver, privacy texts from APD/GBA templates, and affiliate links without tracking scripts.
- **Items rewritten.** I1, I2, I10, I15 and J1, plus the phases, the Track I exit criteria, the checklist and decision I-a (now recorded as decided).

## Files touched

- Modified: `ROADMAP.md`, `Execution/_OPEN.md` (row T1048-a)
- Created: `Execution/P15/T1048-late-registration-diy.md`

## Commands run

None that change the system.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Company start | P0 (now) | P4, week 13 (14 at the latest) |
| Accountant and lawyer in the plan | yes (I1, I15, J1) | no; replaced by I-R4, I-R5 and a legal checklist |
| Research items | 27 (about 33 days) | 29 (about 37 days) |

## What broke and how it was fixed

No issues.

## Screens checked

None: documentation only.

## What is still open

- T1048-a: do I-R4 and I-R5 before P4, decide I-f (yearly plan as a non-renewing pass), and retire T015, T033-g and the lawyer-review rows during the A3 triage with the reason in ROADMAP I1. Without a professional review, legal or tax mistakes are the owner's to find; the roadmap records this as a deliberate choice.

## Rollback procedure

`git revert` of the T1048 commit. Documentation only.
