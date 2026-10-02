# T217 refund standard operating procedure

## Task ID

T217 (mind-map M17). Branch p12-refund-sop, root repo only.

## Date

2026-10-02

## What changed

Carta now has a written refund procedure, docs/REFUND_SOP.md. Before this, the Terms of Service promised refunds in three cases and the database kept a purchase ledger, but nothing joined the two: no page said who decides, how to tell the cases apart, how to issue the money in Stripe, what happens to the pass, or where the refund is written down.

The procedure is five steps, always in the same order: find the sale, decide, refund in Stripe, adjust access, record it. The order matters because nothing in the code reacts to a refund. The stripe-webhook function acts on checkout.session.completed and ignores every other event, so a refund issued in the Stripe Dashboard leaves the pass untouched. That is useful (it is how a pass can be left in place, or shortened rather than ended) but it means the access change and the record are hand steps that must not be forgotten. Money goes first because it is the promise to the customer; if Stripe refuses, nothing else has changed.

The decision table is the ToS Refunds section turned into rows, plus the cases the ToS implies elsewhere (honest-mistake abuse, Carta closing) and three it does not name but that will arrive: a duplicate purchase, a dispute, and a sale with no waiver on file. The last one is the statutory minimum. Under Article 16(m) the 14-day withdrawal right only ends when the buyer accepted the waiver, and since T032 that acceptance is stored in pass_grants.consent_tos. A sale within 14 days where consent_tos is not 'accepted' is refunded in full whatever was used, because the law gives that right, not Carta's goodwill. Everything above that line is a choice, and the table makes the choice the same every time.

Access is adjusted in one of two ways, and the choice follows from how the existing functions behave. Revoking a pass completely uses the Admin panel (admin_set_tier to free), which logs itself. Shortening or extending a live pass uses a one-line SQL update on entitlements.expires_at instead, because admin_set_tier with a day count also resets period_start, and a reset period is a fresh AI allowance: shortening a Year Pass by the 30 days of a refunded stacked Trip Pass would otherwise hand the customer a new 300-plan quota. Under the 044 stacking rule a Year holder who buys a Trip keeps tier year and gains 30 days, and pass_grants.expires_at records the account's expiry after that sale rather than the sale's own window, so the procedure works in days (30 or 365 per sale, newest sale used last) rather than trying to read a window off the row.

pass_grants rows are never edited or deleted. They are the purchase history and the only copy of the waiver evidence a dispute needs. Since pass_grants has no refund column and no migration was allowed in this task, the ledger entry is an admin note (admin_add_note, written to admin_audit_log against the user) in a fixed one-line shape that a LIKE query can list. The Stripe refund id in the note ties the two systems together.

"Used nothing" in ToS case 1 is checked against ai_usage_days (044), which counts plans and live searches by day. Exports leave no server record, so the procedure takes the customer's word for those. That is a deliberate choice: adding export logging for the sake of a refund on a 6.99 euro pass would cost more than it protects.

## Files touched

**Created:**
- docs/REFUND_SOP.md
- Execution/P12/T217-refund-sop.md

**Modified:**
- Execution/_OPEN.md (rows T217-a to T217-d)

No code, no migration, no app repo change.

## Commands run

```
git -C C:/Users/Gebruiker/Documents/Portfolio/wt/T217 add docs/REFUND_SOP.md Execution/P12/T217-refund-sop.md Execution/_OPEN.md
git -C C:/Users/Gebruiker/Documents/Portfolio/wt/T217 commit
git -C C:/Users/Gebruiker/Documents/Portfolio/wt/T217 show --stat HEAD
```

The SQL in the procedure was checked by reading the table definitions in 007, 014, 015, 025, 026 and 044; it was not run, since no database with sales exists.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Written refund procedures | 0 | 1 | +1 |
| ToS refund cases with a defined Stripe, access and ledger path | 0 of 3 | 3 of 3 | +3 |
| Refund situations covered, including statutory, duplicate, closure, dispute and refusal | 0 | 7 | +7 |
| Refunds tested against real Stripe | 0 | 0 | none (Stripe is not live) |

## What broke and how it was fixed

No issues. Two facts found while reading are now handled by the procedure rather than fixed: admin_set_tier resets the allowance period whenever it sets a paid tier, and deleting a user cascades to their pass_grants rows.

## What is still open

The done condition asks for the procedure to be tested once against a real refund in P13. Stripe has never been live, so that cannot happen yet; it follows the test purchases of T031-a. The test is to refund one of those purchases by following the page literally and correct any step where the Dashboard differs, including whether Stripe Tax shows the reversal and that the processing fee is kept (T217-a).

Refunds are invisible to the numbers. pass_grants has no refund field and the webhook ignores charge.refunded and charge.dispute.closed, so admin_oss_threshold and admin_margin keep counting a refunded sale at its full amount. That overstates the OSS figure (the safe direction for a warning) and overstates revenue on the margin panel. The fix is a migration adding refunded_cents, refunded_at and refund_id to pass_grants, a webhook branch for those two events that writes them without touching entitlements, and the two admin functions netting them. Until then the notes are the ledger (T217-b).

There is no audited way to move expires_at without resetting the allowance, which is why the procedure falls back to the SQL editor and leaves no audit row of its own (the note covers it). An admin_adjust_expiry(user, days) RPC that only moves the date and logs itself would replace that step (T217-c).

pass_grants references auth.users with on delete cascade, so deleting an account erases the purchase record and the waiver evidence, and a dispute filed after deletion has nothing to answer with. Belgian bookkeeping rules also ask for sales records to be kept for years. Stripe keeps its own copy, but the consent evidence lives only in Carta. Whether to keep pass_grants rows after deletion (user_id set null, or an archive table) is a retention decision for the owner, then a migration (T217-d).

## Rollback procedure

`git revert` the T217 commit on p12-refund-sop, or do not merge the branch. Nothing else changed: no database, no Stripe, no deploy.
