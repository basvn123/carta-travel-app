# Owner procedure: Product and design decisions only you can make (T1072, ROADMAP A3)

Each row asks for a call, a confirmation or an approval. Answer in chat with the row id; the session that picks it up edits PRODUCT.md or carta-design if the answer changes a rule.

Steps are the open register rows with Owner `user` that belong to this system, in register order: the Order column first, then task number. A row's own wording says what it waits on ("after", "before"); that is repeated beside the step. Nothing here is new: each step is a row, and the task report named in the row has the detail. When a step is done, delete it here (docs/decisions/0003-open-items-owner-steps-and-roadmap.md).

Rows: 18 (5 numbered, 13 in the tables); 7 added by the house style run on 2026-11-17.

Owner sweep 2026-11-12: every other step was decided, done or found obsolete by the decisions lane; `.work/2026-11-12-owner-decisions/report.md` lists each with its outcome.

## Steps

1. **T220-c**: (Mon 8 March 2027 at the latest, the T228 gate) Buy one Trip Pass (EUR 6.99) on your own card on the live site, then refund it in the Stripe dashboard and check the credit note arrives. Do it after registration and once the supabase lane says live checkout is on. If it is not done by 8 March, the public opening on 9 March runs as a free beta until it is (ROADMAP section 16, Launch runway).
2. **T207-a**: (Tue 27 April 2027, D-7) Read the run reports for T229, T230 and T231 and write go or no-go for the 4 May launch in your own words in `.work/INDEX.md` or tell a session. The dates are set: public opening Tue 9 March 2027, launch Tue 4 May 2027 (`docs/decisions/0009-launch-plan-fast-track.md`).
3. **T300-s**: After the supabase lane has applied migrations 040 and 041, sign in as owner (with your second factor), open Admin, Overview, and check that the pipeline health card and the AI failures card show figures or an honest empty state, not an error. Tell a session what you saw.
4. **T605-c**: In the Claude desktop app open Help, Troubleshooting, Review Pinned Git Origins and confirm the Carta repository's origin. Done when a session worktree can merge main's `.claude/skills/carta-design` without a pinned-origin warning.
5. **T033-d**: Handed to the supabase lane (2026-11-12): in Stripe test mode, check that a German and a Belgian address both show the Belgian rate (amount_tax 121 on 699). Waits on T033-a and T033-b.

## Moved from unsorted.md (owner sweep 2026-11-12)

| ID | Item | Order |
|---|---|---|
| T1131-b | Fill the journalist list: names and public editorial addresses per `docs/marketing/journalist-list.md`, grow it to about 40 rows (UK outlets later) and keep the filled copy out of the repo |  |
| T1135-h | Ask's free Workers AI Neurons cover about 560 answers a day (about 2,800 MAU); past that switch on the Workers paid plan or Ask answers with facts only |  |
| T1168-d | The ask-docs question set was written by its builder; replace with real questions and measure Material's built in search on the same set |  |
| T1172-a | Register the affiliate programmes and set the four partner ids; until then partner links stay plain (owner step) |  |
| T1213-f | Travelpayouts Data API signup and token for the P1 coverage run |  |
| T1213-i | Partner applications at the milestones in docs/data/access-ladder.md |  |

## From the house style run (2026-11-17)

Visual-only run: these were left as calls because they change logic or a rule. Report: `.work/2026-11-13-house-style/report.md`.

| ID | Item | Order |
|---|---|---|
| HS-a | The trip page counts bookings two ways: the head says "0 of 5 booked", Still to book says "0 of 7" (`TripSummary.jsx` vs `BookPasses.jsx`). Pick one count | |
| HS-b | The trip total prints cents (EUR 2,293.39) while lists show whole euros: keep cents on the total, or round it like the lists | |
| HS-c | Phone rail cards: two across (T968) or one large card at 76 % width (DESIGN.md now); say which | |
| HS-d | Mountain pages: add the relief drawn from the real peaks (needs a DESIGN.md rule for a page whose own peak is the subject) | |
| HS-e | At the next deploy: rewrite the CSP style hashes (`node continent-app/scripts/csp-hashes.mjs --write`), keeping the old prerender hash until R2's prerendered pages are re-uploaded | at the next deploy |
| HS-f | The new name: the wordmark slot holds "Carta" until you choose the name; the identity is name-free | |
| HS-g | Real-phone check of the haptic tick ("Vibrate on tap" in Settings) on an Android phone and an iPhone | before launch |

## 2026-11-19 defaults

The fix programs run without stops (`.work/2026-11-19-fix-programs/plan.md` section 3). Each line is a default a program applied; overrule any line and the program changes course.

| Program | Default applied | How to reverse |
|---|---|---|
| ai | North-star decision section 13 recommendations taken as approved (owner, 2026-11-17); owner-only steps are in `docs/owner/ai.md` and their gates stay open | say which recommendation to drop |
| ai | Per-user daily AI limit, the same for every tier: 20 plans and 10 grounded a day (wave 1, `ai_models.json` `capacity.user_daily_limit`) | change the two numbers in `ai_models.json`, run `node continent-app/scripts/ai/gen_ai_config.mjs`, deploy the functions; 0 means no limit |
| ai | Spend breaker: Ask guests cut at half the shared daily ceiling (lane 6), free accounts at the ceiling, Pass holders never (`capacity.breaker`) | change `guest_share` or `free_share` in `ai_models.json` and regenerate |
| ai | The `trips` batch job keeps its old Gemini chain until its golden set passes on Flash-Lite (owner step AI-9) | run AI-9; a session then moves it |
