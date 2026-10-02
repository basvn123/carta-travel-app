# T215 launch metrics

## Task ID

T215

## Date

2026-10-02

## What changed

One new page, docs/LAUNCH-METRICS.md, now lists the launch metrics and the source of each. The decision it records is that the admin Overview is the single place to look, because it already stacks the paywall funnel, margin, AI usage, cache hit rate, AI failures and pipeline health, and that five numbers are read daily in week one: purchases, new accounts, paywall shown, AI units against the cap and AI failures.

Of the ten metrics the task named, seven have an instrument today: purchases and purchases by tier, account creations, paywall shown, dismissed and converted per reason code, AI units, cache hit rate, and contribution. Three do not. Visitors have no source because no analytics is installed. Priced-trip completions are not recorded as an event. Affiliate clicks are decorated links with no counter. The error rate is partial: admin_edge_errors counts failed AI calls but there is no denominator and no client-side error source. The purchase rate, the number the unit economics scale off, is therefore not computable until visitors have a source; the page gives new accounts as a stand-in and says the report must name which it used.

No code was written. The task asks for one page, and building the missing instruments each needs a decision (an analytics tool and its consent position, a new event table and so a migration) that is not this task's to make.

## Files touched

Created:
- docs/LAUNCH-METRICS.md
- Execution/P12/T215-launch-metrics.md

Modified:
- Execution/_OPEN.md (four rows appended)

## Commands run

Read only: reads of supabase/migrations 016, 022, 027, 029, 030, 031, 040, 041, 042, 044 and the admin components in the main checkout. Then the files above were written in the worktree on branch p12-launch-metrics and committed.

## Config and secrets set

None.

## Before/after measurements

Not measured. The one count that changes is coverage of the named launch metrics: before, none had a stated source or an owner; after, seven are mapped to an RPC and card and three plus one partial are named as gaps.

## What broke and how it was fixed

No issues. One thing to know: the function bodies were read from migration 044, which supersedes 022 and 027 for the funnel and 031 for margin, so the field names in the page are the 044 ones.

## What is still open

Visitors have no source, so the purchase rate has no denominator (T215-a, owner decision: which analytics tool, and whether it stays cookie-free so no banner is needed). Priced-trip completions are not recorded (T215-b, needs an event and so a migration after 045). Affiliate clicks are not counted (T215-c; the unit economics lever 7 already asks for this). The error rate has no denominator or client-side source (T215-d). Until those land, the page uses new accounts as the purchase-rate stand-in.

## Rollback procedure

Revert the commit on branch p12-launch-metrics, or delete the branch before merge. Nothing else was changed.
