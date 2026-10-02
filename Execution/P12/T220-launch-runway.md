# T220 Launch runway calendar

## Task ID

T220 (mind-map M20)

## Date

2026-10-02

## What changed

Carta now has a dated runway for the last six weeks before launch, written backwards from the launch date D. Nothing in the app changed. The calendar is in this report and is the only copy; register row T220-a says who keeps it current.

There is no calendar date in it, and that is deliberate. The owner has not chosen D (T207-a, left open by T275), and a date invented here would be a figure with no source. Every entry is an offset from D, written D-42 to D+7, and the offsets T207 fixed (D-30, D-14, D-7, D-1, D, D+1, D+3, D+7, per T207-d) are kept exactly. What this report adds is the six weeks between them. D-42, D-35, D-28, D-21, D-14 and D-7 all fall on the same weekday as D. T207 says D is a Tuesday, Wednesday or Thursday, so the weekly checkpoints do too and never land on a weekend. The calendar becomes dates the moment the owner writes D in the register (see "Committing the launch date").

The commitment this report makes is a rule for committing, not a date. D is committed when the owner writes one Tuesday, Wednesday or Thursday into row T207-a and into the log, and that must happen no later than D-42, which is the first row of the table below. Until then no row in the calendar has a date, and the first thing the calendar asks of the owner is that day.

## The order, and why it runs this way

Three facts set the shape. First, search is the only channel that can work at the cost ceiling: contribution is 6.85 euros per purchase, which at a 2.5 percent purchase rate is about 0.17 euros of allowable spend per visitor, and "organic search is the only channel that works" (CARTA_UNIT_ECONOMICS.md section 5, repeated in docs/GTM-ACQUISITION-CONSTRAINT.md). So the pages that search will index go live early, at D-28, because the sitemap holds one URL today (T207-g) and nothing in the repository measures how long indexing takes. That lag is unmeasured, so the calendar gives search the longest lead it can and promises no result.

Second, the soft launch is meant to show a real purchase funnel and the things nobody who built the product can see. A funnel that cannot take money shows neither, so the soft launch cannot start before the legal gate (T227) and the payments gate (T228) have passed, and before Supabase is on Pro (T232) and uptime alerting is live (T235). Strangers should not be the first people to find an outage. T207 put all five gates at D-7. That is too late for this purpose, so T220 moves T227 and T228 to D-15 and keeps T229 to T231 at D-7. This is a sequencing choice made here. If the owner prefers to soft launch on a free product, the funnel half of the soft launch is lost.

Third, the pricing copy must be final before anyone outside sees the paywall, and the support inbox must exist before anyone outside can write to it. So pricing copy is final at D-21, the inbox is open at D-21, and the soft launch begins at D-14.

## The calendar

The owner for every row is Bas, the only responder (docs/INCIDENT_RUNBOOK.md; T207). Claude sessions prepare artefacts and never post, reply or send. A row's source is the report or register row that fixes it.

| When | What happens | Source |
|---|---|---|
| D-42 | Commit D. Write the date into row T207-a. Check that the gates (T227 to T231), T232 and T235 can plausibly finish by their rows below; if they cannot, choose a later D now, not later. Create the Search Console property, a Bing Webmaster property and the IndexNow key. | T207-a, T205-f |
| D-35 | Analytics decision in effect: no third-party script and no cookie banner, confirmed by the owner. What is left is to make it true: Travelpayouts Drive snippet removed (T276), the Google Fonts stylesheet self-hosted (T214-c), visitors read from the host's server-side dashboard, which reads nothing on the device. Create the mailbox support@carta-europetravel.com. | T275, T214-a, T214-b, T214-c, T215-a, T216-a |
| D-30 | Open the Hacker News, Product Hunt, Reddit, OSM forum and OSMBC accounts and use each in the ordinary way until D. | T207-b |
| D-28 | Landing page live (T209) at the public address, with its sentence from T201, three proof points and honest coverage numbers. The page set and sitemap from T221 and T222 deployed and submitted to Search Console. The explainer's public home decided (T226). Trail GPX gate lifted (T176), because hikers are the launch audience. | T209, T221, T222, T226, T203-b, T205-f |
| D-26 to D-21 | The five-person first-run test on T099's build: five people who have never opened the site, ten minutes each, on a phone, protocol in docs/FIRST_RUN_RESULT.md. Pass is four of five on each question, and the time to the first answer is recorded. Fix what it finds in copy and layout. | T187-b |
| D-21 | Pricing page and every paywall reason-code string final in all six locales (T210; all six i18n files parsed before commit); pass prices read only from continent-app/src/lib/pricing.js. Support inbox open: each canned answer in docs/SUPPORT.md sent once against a test case, the CONTACT constants in the four app files switched to the new address, the refund path tried once (T217). Brand assets (T212) done. The soft launch roster written. Courtesy asks to the L1 to L3 partners sent, including whether they would co-announce. | T210, T216-a, T216-c, T217, T212, T208-c |
| D-15 | Legal gate (T227) and payments gate (T228) passed, including a real 6.99 euro purchase on a real card, refunded and reconciled. Supabase on Pro (T232). Uptime and error alerting live (T235). If any of these is not true, the soft launch starts late, not without it. | T227, T228, T232, T235 |
| D-14 | Soft launch opens (see below). Same day: read each target subreddit's rules and the Hacker News and Product Hunt guides again, and re-read the unverified outlets from T208 (EU-Startups, Culture Routes Society, the UK and EU outlets). | T207, T207-e, T208-b |
| D-10 | First triage of soft launch findings. Each becomes a fix, a reply-bank line or a log entry. | T220 |
| D-8 | Last day a soft launch fix that needs a migration or a function deploy may ship. From D-7 neither is allowed. | T207 |
| D-7 | Freeze, and the remaining gates: T229, T230 and T231 passed. Explainer and receipt screenshots finished and approved by Bas. Soft launch closes and its numbers are read. Go or no-go written in the log. | T207, T229, T230, T231 |
| D-3 | Final copy check of the landing page, the Show HN title and first comment, and the OSM forum post, against the reply bank. | T207 |
| D-1 | Dry run on a clean browser profile on a phone and a laptop: no sign-in prompt on the deep link, the receipt renders, the Data sources credits reachable without an account, language switch works, the site notice can be turned on and off from Admin, the AI cap message appears honestly. Reply bank written into one local file. Abandon rule below. | T207, T207-c |
| D | Launch. 09:00 status pages and the Admin Overview. 09:30 Show HN, explainer as first comment within two minutes. Around 11:30 the OSM forum post. Courtesy notes to the credited bodies sent after the posts are up. Evening: read the five numbers, write two lines on what was asked that Carta could not answer. | T207, T208-c, docs/LAUNCH-METRICS.md |
| D+1 | The Reddit data post, only if that community's rules allowed it. | T207 |
| D+3 | weeklyOSM item through OSMBC. | T207 |
| D+7 | Product Hunt at 12:01 Pacific, only if payments are live. The week-one metrics read once in full. | T207, docs/LAUNCH-METRICS.md |

## The soft launch

The group is called the first fifteen. It has three parts of five people. The roster is a private file the owner keeps outside the repository, because names and emails of private people are personal data that do not belong in a public history. This report fixes who qualifies, and the owner supplies the names by D-21 (T220-b).

The first five are strangers to the product: people who have never opened carta-europetravel.com and do not work on it. They are the same five as the first-run test (T187-b), so they run the test at D-26 to D-21 and then stay on as soft launch users. This part surfaces the confusing sentence and the flow that makes no sense to someone who did not build it.

The second five are hikers who start a walk from a town, the primary audience in T203. The trail pages, the free GPX and the day price in the nearest town are meant for them, so they test whether the product does what the launch says it does.

The third five are people who would plausibly pay for a pass, because only they can show a real purchase funnel. The invitation tells them the pass costs what pricing.js says, that nothing is expected of them, and that a refund is a message away (docs/REFUND_SOP.md). The purpose is to see where the paywall confuses or the checkout fails, not to make revenue.

Fifteen is a planning choice, not derived from anything in the repository. It is small enough that Bas can read every person's answer, and large enough that each kind of failure can show up more than once. The group excludes the L1 to L3 partners, the credited bodies and anyone from a launch channel, because those people hold something the launch needs later and should see the finished product, not a draft.

What is looked at. Daily during the soft launch, the five numbers in docs/LAUNCH-METRICS.md: purchases, new accounts, paywall shown, AI units against the daily cap, and AI failures, read from the admin Overview. Visitors come from the host's server-side dashboard. In addition, each of the first five answers the six questions in docs/FIRST_RUN_RESULT.md, and each of the other ten answers two: where did you get stuck, and what did you expect to see that you did not. Answers go to the support inbox, so the inbox is tested too, and into the log.

Pass is a set of minimums, so it cannot pass by saying nothing. At least one purchase recorded in the Overview's paywall funnel. At least one message through the inbox answered inside the two working days in docs/SUPPORT.md. Every finding triaged by D-10. No unresolved finding that stops a stranger reaching the receipt. These marks are this calendar's proposal and the owner may set others. A pass says nothing about the purchase rate: break-even is 9 Trip Passes or 5 Year Passes a month (CARTA_UNIT_ECONOMICS.md section 5), and fifteen people cannot test that.

## Committing the launch date

The task asks for a launch date committed, and the honest form of that is a procedure the owner cannot skip. D is set at D-42 by writing it into T207-a. Moving D is allowed until D-15, when it is known whether the gates have passed. From D-14 the soft launch group has been told, and a later move needs a note to them. After D-7 a move is an abandonment, not a postponement.

The abandon rule is T207's and is kept: on D-1, stop if checkout cannot take a test payment, if T235 alerts do not fire, or if the deep link needs a sign-in. This runway adds one: if D-15 arrives and T227 or T228 has not passed, the soft launch is not started and D moves back by the same number of days, because a launch with an unseen funnel is the case the soft launch exists to prevent.

## What is not scheduled, and why

No cold press before the gates pass (T208-a, confirmed by T275). No paid placement of any kind (docs/GTM-ACQUISITION-CONSTRAINT.md). No email lifecycle beyond transactional, since T213 is undecided and outside this runway. No store app: T247 and T248 depend on the owner steps in T272-b and are not part of the web launch. Flights are not priced (T272), so no row waits on a fare source. The Stripe paste procedure sits in Execution/_OPEN-MASTER.md and is a prerequisite of the D-15 row, not a row of its own.

## Files touched

Created: Execution/P12/T220-launch-runway.md. Modified: Execution/_OPEN.md (rows appended).

## Commands run

Read-only, in the worktree and the main checkout: reading the T207, T208, T203, T214, T215, T216, T272 and T275 reports, docs/LAUNCH-METRICS.md, docs/SUPPORT.md, docs/FIRST_RUN_RESULT.md and Execution/_OPEN.md; the mind map through Execution/_queue/xmind_prompt.py for the titles and gate wording of T209 to T213, T219, T221, T226 to T232, T235 and T236; section 5 of CARTA_UNIT_ECONOMICS_1.md under additional docs/Carta/Plan/Unit Economics. No code was run and no web page was fetched.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Launch milestones written as offsets from D | 8 (D-30, D-14, D-7, D-1, D, D+1, D+3, D+7, from T207) | 17 rows in the calendar | +9 |
| Soft launch group defined | no | yes, 15 people in three groups of 5 (a planning choice) | new |
| Calendar rows with a real date attached | 0 | 0 (D is not chosen; T207-a) | 0 |
| Gates required before the soft launch | not stated | 4 (T227, T228, T232, T235) | new |

The figures taken from elsewhere are 6.85 euros, 2.5 percent and about 0.17 euros (CARTA_UNIT_ECONOMICS.md section 5), 9 Trip Passes or 5 Year Passes (same section), the two working days (docs/SUPPORT.md), the five daily numbers (docs/LAUNCH-METRICS.md) and the four-of-five pass mark (docs/FIRST_RUN_RESULT.md). The row count is counted from the calendar table and the 8 from the T207 runbook.

## What broke and how it was fixed

No issues. One design conflict was resolved: T207 puts all gates at D-7, and the soft launch needs a working funnel at D-14. The legal and payments gates move to D-15, as set out in "The order, and why it runs this way".

## What is still open

The launch date itself, T207-a, is the owner's, and the runway cannot be run until it is written (T220-a). The soft launch roster of 15 names across the three groups is the owner's and stays outside the repository (T220-b). The soft launch needs T227, T228, T232 and T235 by D-15, and none has passed; the Stripe stage in Execution/_OPEN-MASTER.md says checkout has never been live, so this is the longest-lead item and the likeliest reason D moves (T220-c). The owner must approve the invitation wording, including the written statement that a pass is refundable (T220-d). The indexing lag for the D-28 sitemap is unmeasured; T239 should record when the first pages are indexed so a later launch can set the lead from evidence (T220-e). The courtesy note of T208-c is placed at D and still needs its draft; this report covers the part of that row that asked for it to be added to the runway.

## Rollback procedure

Delete Execution/P12/T220-launch-runway.md and the T220 rows from Execution/_OPEN.md, or git revert the single commit on branch p12-launch-runway. No app, pipeline or data file changed.
