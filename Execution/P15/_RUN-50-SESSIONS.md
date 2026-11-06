# Run log: the 50 sessions (started 2026-11-05 23:14 UTC)

Orchestrator: session_0156MmZ6f186CZGSehFzMpjD, integration branch `claude/relaxed-dirac-l8enoy` (based on PR #10, `p15-p2-security`, because PR #10 is not merged yet).

How it runs:
- Each row of `_NEXT-50-SESSIONS.md` is one cloud session on its own branch `p15-sNN-<slug>`, started from the integration branch.
- About 8 run at once; a finished one is merged into the integration branch and the next one starts.
- Sessions in the same batch never share files; the trail sessions (S08, S09, S10) and the migration sessions (S03, S20, S33, S34) run one after another.
- Owner steps from each report's "Owner steps (for the checklist)" section go onto the owner checklist (https://claude.ai/artifact/UZ1QJRDYdowJZEi6y5JCvF), phase "7. From the overnight sessions".
- Not possible in the cloud container: the owner's box, laptop, Supabase, Wikipedia, ERDDAP and other hosts outside package registries. Those halves become owner steps.

| S | Task | Session | Branch | State | Merged | Owner steps |
|---|---|---|---|---|---|---|
| 01 | T1085 | session_0156MmZ4TDetsod3Jd5XwLj4 | p15-s01-docs-truth | done | yes | 1 |
| 02 | T1086 | session_0156MmZ4Muup4v7t4uhhm3bi | p15-s02-runbooks | done | yes | 3 |
| 03 | T1087 | session_0156MmZ7EaiBuWGxYvPNo4L9 | p15-s03-admin-harness-ci | done | yes | 2 |
| 04 | T1088 | session_0156MmZ3SPm4Y2EnZTdqua3E | p15-s04-supply-chain-gates | done | yes | 2 |
| 05 | T1089 | session_0156MmZ5VRsioL6jYDKbHUSW | p15-s05-verify-harness-refresh | done | yes |  |
| 06 | T1090 | session_0156MmZ675FBGFYLWfxY8p45 | p15-s06-csp-no-inline-style | done | yes | 1 |
| 07 | T1091 | session_0156MmZ6GNqyadqQA6n59dSe | p15-s07-attribution-ledger | done | yes | 0 |
| 08 | T1092 | session_0156MmZ2rL9aioyUBz7HyAUN | p15-s08-trail-names | done | yes | 2 |
| 09 | T1093 | session_0156MmZ2XaXpz3fPcyv1z5q5 | p15-s09-trail-photos | done | yes | 2 |
| 11 | T1095 | session_0156MmZ6PwzecPhXbvrLigr2 | p15-s11-place-intros | done | yes | 2 |
| 14 | T1098 | session_0156MmZ5CEX2gM2DENuNzhjF | p15-s14-uk-crowds | done | yes | 3 |
| 16 | T1100 | session_0156MmZ4kGZkoB8jKCfuWwoq | p15-s16-getting-there | done | yes | 3 |
| 17 | T1101 | session_0156MmZ6w6WEXK9HnWKK5sac | p15-s17-ask-cards-agree | done | yes | 2 |
| 10 | T1094 | session_0156MmZ2rgy78jkXQEiSe17U | p15-s10-recover-walks | done | yes |  |
| 12 | T1096 | session_0156MmZ35Nxx6zfuvSQ5mAXb | p15-s12-galleries-poi | done | yes |  |
| 13 | T1097 | session_0156MmZ5wqro6cFB3SnMutGq | p15-s13-sea-temp | done | yes |  |
| 18 | T1102 | session_0156MmZ5WLwZ33ihikTr8ux1 | p15-s18-trail-cards | done | yes |  |
| 19 | T1103 | session_0156MmZ6ZBdDcczVBqNPYaQU | p15-s19-plan-flow-short | done | yes |  |
| 20 | T1104 | session_0156MmZ6ef2wiQHb1UCRzFwf | p15-s20-account-sync | done | yes |  |
| 22 | T1106 | session_0156MmZ7DisRZv2LJoFwK5up | p15-s22-error-boundaries | done | yes |  |
| 15 | T1099 | session_0156MmZ4VQcUwbCiHkdcSgN7 | p15-s15-freshness | done | yes |  |
| 21 | T1105 | session_0156MmZ4MAme8kf8EefwKiYi | p15-s21-first-load | done | yes |  |
| 24 | T1108 | session_0156MmZ6jvXwmdbY6YVrkwbn | p15-s24-support-pages | done | yes |  |
| 25 | T1109 | session_0156MmZ35whMvqZkgorw7nEs | p15-s25-channel-counts | done | yes |  |
| 26 | T1110 | session_0156MmZ2nA8QKLasV6QWgJ4f | p15-s26-waitlist | done | yes |  |
| 27 | T1111 | session_0156MmZ547NMN6yW71L7vmvq | p15-s27-design-direction | done | yes |  |
| 28 | T1112 | session_0156MmZ48qMB7xQnSQHwCTUZ | p15-s28-aviasales-probe | done | yes |  |
| 23 | T1107 | session_0156MmZ2fmPnzbsSXeQ2RTAo | p15-s23-box-schedule | done | yes |  |
| 29 | T1113 | session_0156MmZ4ZG2oAzXvGVyDdeL1 | p15-s29-seo-bar | done | yes |  |
| 30 | T1114 | session_0156MmZ5QKZ1Frtsi7BNAnsa | p15-s30-not-yet-notes | done | yes |  |
| 33 | T1117 | session_0156MmZ7FkQnKnjXPjJPFFcQ | p15-s33-ai-security | done | yes |  |
| 34 | T1118 | session_0156MmZ2phvMcuvdm55wY1xR | p15-s34-privacy-gdpr | done | yes |  |
| 35 | T1119 | session_0156MmZ5EGodCo9t2t4cADQX | p15-s35-static-analysis | done | yes |  |
| 36 | T1120 | session_0156MmZ3KjB6LcKqDG2euFXy | p15-s36-error-tracking | done | yes |  |
| 31 | T1115 | session_0156MmZ5wRZPwiPqtw8XVAQf | p15-s31-local-fares-prep | done | yes |  |
| 37 | T1121 | session_0156MmZ3RSiRdFjZ1YTTWpE4 | p15-s37-shared-parts | done | yes | 0 |
| 45 | T1129 | session_0156MmZ6yoTqK9Y5LFkAgjZh | p15-s45-product-analytics | done | yes |  |
| 46 | T1130 | session_0156MmZ3d8Rghv4zZpw8JskF | p15-s46-data-stories | done | yes |  |
| 47 | T1131 | session_0156MmZ64CMZFCasJfsb7dye | p15-s47-press-kit | done | yes |  |
| 48 | T1132 | session_0156MmZ34vgRmZ5cd1uZABN1 | p15-s48-logic-catalogue | done | yes |  |
| 49 | T1133 | session_0156MmZ564CQE4NgVYTniJAC | p15-s49-data-contract | done | yes |  |
| 43 | T1127 | session_0156MmZ6DJnm6jstpJgd2gt1 | p15-s43-imagery-gaps | done | yes |  |
| 41 | T1125 | session_0156MmZ47nbZsBgrNoG2x14S | p15-s41-type-radius | done | yes |  |
| 42 | T1126 | session_0156MmZ371hGbeoa5s3ToCg7 | p15-s42-css-consolidation | done | yes |  |
| 50 | T1134 | session_0156MmZ5gHVZAjwixa2soZ5Z | p15-s50-drift-scorecard | done | yes |  |
| 39 | T1123 | session_0156MmZ6YxjUWnXqfKceVDgj | p15-s39-core-flow-fixes | done | yes |  |
| 44 | T1128 | session_0156MmZ2wZAr8cDNhxbYejCV | p15-s44-accessibility | running | | |
| 38 | T1122 | session_0156MmZ4HtK752CmGsWyfZcJ | p15-s38-cost-card | done (flag off) | yes |  |
| 40 | T1124 | session_0156MmZ6c8ERyuGHxJ6Y8yqX | p15-s40-motion-tokens | done | yes |  |
| 32 | T1116 | session_0156MmZ6P6QW3MyvyCtLPAdf | p15-s32-register-rule | done | yes | 1 |

Merge notes:
- 00:05 S02, S03, S06, S07, S08 merged. ROADMAP C4 and C5 rows came out doubled by the merge and were fixed by hand; npm test 1294 pass, trail and licence pytest 47 pass, entry points OK. 8 owner steps on the checklist.
- S01 and S04: GitHub refused the push (commit_refs); asked to retry, then push commit by commit.
- 00:45 S01, S04, S09, S11, S14, S16, S17 merged. Fixes at merge: S01 and S02 both edited docs/runbooks README and build-box (kept S02, added S01 backup.md row; row T1085-x to fold the two backup docs); ROADMAP B2, C4, C5, C6 rows doubled and were fixed; the T1098 harvester was missing from the licence registry (added, ledger regenerated). npm test 1328 pass; pytest 359 pass, 2 fail that also fail on the base commit (rating tests needing data this container lacks). 23 owner steps on the checklist.
- 01:19 S10, S12, S13, S18, S19, S20, S22 merged (only register and ROADMAP conflicts; D7, D8, D9, G12, G13 rows deduplicated by hand). npm test 1358 pass; pytest 399 pass with the same 2 base failures; fast build OK. 36 owner steps on the checklist. Migration 065 is T1104 (account sync); 066 is reserved for T1110 (waitlist); S33 and S34 take 067 and up. S05 asked to wrap up after two hours.
- 01:58 S05, S15, S24, S25, S26, S27, S28 merged. T1109 left its migration unnumbered on purpose; it became 067 with a down file. RLS suite 817 of 817 and all 16 admin harnesses green on a local Postgres with 065 to 067. Two rows closed by T1087 (T1078-b, T1082-a) had come back into _OPEN.md in the first merge round and were removed again; check_closed.py now runs after every merge. npm test 1375, pytest 411 pass (2 base failures), fast build OK. 50 owner steps on the checklist. Migration numbers: 068 is T1117, 069 is T1118. S32 (register rule) is held to run last and alone, because it rewrites the register every session appends to.
- 02:36 S21, S23, S29, S30, S33, S34, S35, S36 merged (S33 needed no migration, so 068 is unused; 069 is T1118, 070 reserved for T1129). ROADMAP C7, C8, C9 deduplicated. 17 of 17 admin harnesses green with 065 to 069; npm test 1469; pytest 435 pass (2 base failures); fast build OK. 68 owner steps on the checklist. The design items G2 to G10 run one at a time from S37 on, because they share CSS and components.
- 10:15 The run paused from about 03:00 to 10:11 (the 03:07 check-in was delivered seven hours late, most likely a usage limit). S37 and S49 had stopped with an error and S48 had pushed only one domain file; all three were asked to continue. S31, S45, S46, S47 merged (070 is T1129). 17 of 17 harnesses with 065 to 070; npm test 1478; pytest 435 pass (2 base failures); fast build OK. 79 owner steps on the checklist. S43 started, scoped away from src/components while S37 folds them.
- 10:30 S37 (G2) merged after it resumed: npm test 1483 pass, eslint clean, fast build OK. S41 (G6) started.
- 10:52 S41 (design-lint 7,697 to 6,479), S43, S48 (all eight logic domains, 129 register rows for missing tests), S49 merged. The contract gate found two non-literal RPC names from T1109 and T1110 and was fixed; it passes against a local Postgres. npm test 1540, pytest 483 pass (2 base failures), design-lint 0 new, token contrast OK. 83 owner steps on the checklist; the owner answered the admin MFA warning ("Understood") at 10:50. S42, S50 and S39 started (S39 without CSS edits while S42 runs).
- 11:22 S39, S42 (CSS 1.53 MB to 1.25 MB, 2,983 dead rules out; every class S39 added still has a rule), S50 (drift check 0 drift, 12-layer scorecard) merged. npm test 1545, design-lint 4,613 with 0 new, contract gate and css-routes check pass, pytest 502 (2 base failures). 88 owner steps on the checklist. S44, S38 (flag off until T1111-a) and S40 (tokens and reduced motion only) started with separate files. S32 follows when these merge.
- 11:58 S40 (motion literals 243 to 1, tokens in :root, one reduced-motion path) and S38 (umber cost card behind ?cc=umber, flag off) merged. Together they failed three checks that passed on each branch: S38 had baselined its new design-lint literals and S40 regenerated the baseline, so the motion-literal test, design-lint and css-routes went red. Fixed on the integration branch: the card now uses --dur-1, --radius-sm and card-scoped shadow variables, and the drawn-bar rule is scoped to .ccard.is-umber. npm test 1556, design-lint 0 new, css-routes OK, pytest 502 (2 base failures). S44 still running.
- 12:23 S44 still running (axe baseline). S32 started alongside it: it only adds scripts/register/ and its own rows, so it shares no files with S44.
- 12:47 S32 merged: register at 1,717 open rows; options a 1,157, b 1,437, c 877, d 1,717, none under 250 (owner step T1116-a). S44 still running.
