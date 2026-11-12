# Owner procedure: Product and design decisions only you can make (T1072, ROADMAP A3)

Each row asks for a call, a confirmation or an approval. Answer in chat with the row id; the session that picks it up edits PRODUCT.md or carta-design if the answer changes a rule.

Steps are the open register rows with Owner `user` that belong to this system, in register order: the Order column first, then task number. A row's own wording says what it waits on ("after", "before"); that is repeated beside the step. Nothing here is new: each step is a row, and the task report named in the row has the detail. When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Rows: 6. Register rows point back here.

Owner sweep 2026-11-12: every other step was decided, done or found obsolete by the decisions lane; `.work/2026-11-12-owner-decisions/report.md` lists each with its outcome.

## Steps

1. **T220-c**: (Mon 8 March 2027 at the latest, the T228 gate) Buy one Trip Pass (EUR 6.99) on your own card on the live site, then refund it in the Stripe dashboard and check the credit note arrives. Do it after registration and once the supabase lane says live checkout is on. If it is not done by 8 March, the public opening on 9 March runs as a free beta until it is (ROADMAP section 16, Launch runway).
2. **T207-a**: (Tue 27 April 2027, D-7) Read the run reports for T229, T230 and T231 and write go or no-go for the 4 May launch in your own words in `.work/INDEX.md` or tell a session. The dates are set: public opening Tue 9 March 2027, launch Tue 4 May 2027 (`docs/decisions/0009-launch-plan-fast-track.md`).
3. **T300-s**: After the supabase lane has applied migrations 040 and 041, sign in as owner (with your second factor), open Admin, Overview, and check that the pipeline health card and the AI failures card show figures or an honest empty state, not an error. Tell a session what you saw.
4. **T605-c**: In the Claude desktop app open Help, Troubleshooting, Review Pinned Git Origins and confirm the Carta repository's origin. Done when a session worktree can merge main's `.claude/skills/carta-design` without a pinned-origin warning.
5. **T033-d**: Handed to the supabase lane (2026-11-12): in Stripe test mode, check that a German and a Belgian address both show the Belgian rate (amount_tax 121 on 699). Waits on T033-a and T033-b.
6. **T068-c**: Handed to the supabase lane (2026-11-12): after the first real content report, run `select source_header, count(*) from public.content_reports group by 1`; if any row says x-forwarded-for, open a ROADMAP C-track fix so report_guide takes the last trusted entry.
