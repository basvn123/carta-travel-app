# Owner sweep 2026-11-12: decisions lane

Status: done
Level: L2 · playbook: crew:deep-task (run as the decisions lane of the owner sweep, autonomous; Stage 7 pre-approved by the owner)
Branch: `p15-owner-decisions` · ROADMAP items: section 19 (R-a to N-a), section 16 Launch runway, A2, C3, C9, D10, D13, D15, D19, D20, D21, D23, E5, F6, F8, G1, G3, G4, G5, G8, G9, G12, G14, H7, I1, I2, I3, I4, I7, I16, K3, K7, K9

## Goal
Close every decision, legal and business owner step in this lane's slice: the 211 walkthrough steps in stages "Decisions" and "Business and legal", plus every step in `docs/owner/product-decisions.md` and `docs/owner/legal.md`, for 269 distinct ids in all. Each step is decided, verified as already done or obsolete, done, or rewritten as a short and exact human step. The owner wrote on 2026-11-12: "human decision tasks, you launch a tool and make your own decision". Owner ticks were treated as final.

## Result
| Outcome | Count |
|---|---|
| decided | 166 |
| already-done | 31 |
| done | 23 |
| obsolete | 19 |
| human | 22 |
| handoff | 8 |
| **total** | **269** |

The per-step record is `ledger.json` in this run folder (local, not tracked: decision 0002). It has one entry per id with the outcome, the evidence, the decision and why, and, for steps that sit in another lane's file, that file and lane.

- `docs/owner/product-decisions.md`: 147 steps down to 6. Four are human: T220-c is the real purchase and refund on the owner's card, T207-a is the go or no-go at D-7, T300-s is the admin look and T605-c is the Claude app origin. Two are supabase handoffs: T033-d and T068-c.
- `docs/owner/legal.md`: 26 steps down to 3. T461-b (Imprint name and address before the beta, numbers after registration) and T336-a (send the outreach mails by hand) stay with the owner. T333-f, the 30-day Terms notice, is a supabase handoff.

## How it ran
1. **Batching** (`plan.md`). The 269 steps were split into six themed batches: plan (52), legal (53), pricing (48), planner (42), screens (41) and data (33). One decider agent per batch checked each step against the live repo and wrote `decisions-<batch>.json`. Stage 4 (diverge) was skipped, because the options come from the steps themselves.
2. **Critique.** Two critics reviewed the proposals.
   - Legal and money risk (`critique-legal-risk.md`): 0 blockers, 17 majors.
   - Cross-batch consistency (`critique-consistency.md`): 0 blockers, 9 majors.
   - All their fixes were accepted unless `decision.md` overrules them.
3. **Decision** (`decision.md`). The group calls are below.
4. **Build.** One writer per file set:
   - Legal texts.
   - ROADMAP and docs.
   - Four small code items.
   - The orchestrator wrote the owner files, the ledger and this report.
5. **Verify.** I ran the checks myself (`checks.md`). Judge 1 (`judgement-1.md`) failed criteria 5 and 7. Fixes 1 to 3 and the optional ones were applied. Fix 4, the test baseline, is answered by CI on the pushed branch (see Checks).

## Main decisions
- **Plan of record (ROADMAP section 19).** Every row is now marked "Decided 2026-11-12 by the owner" (owner ticks T1045-i and T1047-a: accept every recommendation; T1049-a: fast track).
  - Dates: registration about Mon 22 Feb 2027, public opening O on Tue 9 Mar 2027, campaign launch D on Tue 4 May 2027.
  - The dated runway with its gates is in the new ROADMAP section 16 "Launch runway". Gates:
    - Tue 16 Feb: the VAT regime is chosen.
    - Tue 2 Mar: T227 legal (with the Dutch legal pages and the AI Act Art 50(2) mark), T232 and T235.
    - Mon 8 Mar: T228 payments, which needs one purchase and refund, the new waiver text and mode=payment.
    - If T228 is late, the opening runs free until it passes.
  - Record: `docs/decisions/0009-launch-plan-fast-track.md`.
- **K-b founding price.** No figure was invented. The rule:
  - A founding yearly price below EUR 14.99, for Year Passes bought before 9 Mar 2028.
  - It is set before 16 Feb 2027 from measured AI use, with at least EUR 2.00 net margin.
  - Referral rewards: once per account, double opt-in, can be withdrawn for abuse.
- **Legal posture**, recorded in `docs/decisions/0010-legal-posture-diy.md`:
  - A pass is a digital service. Withdrawing within 14 days refunds pro rata (EU directive 2011/83 Art 14(3)), and the Terms now include the model withdrawal form.
  - The yearly plan is a 12-month pass that never renews.
  - A careful self-review by Claude against the official texts replaces "have a lawyer check" (decision 0007).
  - VAT records are kept 10 years, the safe side.
  - Prices taken from Booking.com are never published in press stories, social images or data stories: T1130-c wins over T1175-c.
- **Rules travellers see** (PRODUCT.md, app-rules, HANDBOOK):
  - A saved trip keeps the stay and the Lifestyle it was saved with (T703-a; T432-m and T858-a reworded to match).
  - The step-free answer is advice only (T433-n).
  - Trip documents stay on the device that added them; a booking the traveller imports is sent once to the parse function and not stored (T1015-a, corrected).
  - The typical far-ahead fare is labelled "typical for this route, not for your dates" (owner tick T882-b).
  - A beach with several test points shows the worst water class (T1189-d).
  - A brand new traveller's default trip types lead with walking (T1103-f, overruled toward PRODUCT.md's hiker-first rule; follow-up only).
- **Owner ticks the repo did not yet reflect.** Each now has its ROADMAP follow-up:
  - T503-c (G9), T506-c and T855-a (D13), T534-a and T597-a (D10), T1019-a (G3), T1022-c (D20), T1045-d (G4).
  - T365-f is a C3 migration for the supabase lane.
  - T1161-e is the box's promote switch.
- **Box calls.** No `--yes` on the unattended prune until a guard against mass deletes lands (T1056-b, H7). Self-hosted routing only if a measurement on the box shows it fits (T433-o).
- **Sample trips T431-b to T431-e.** Claude did the audit; the corrections are written into ROADMAP D15. The `sample` mark stays until a second check with sources.

## Code changed in this run (small; each covered by a test)
- **T1054-b (owner tick):** deleting the account also clears this device's copy of trips, plans, bookings and chats, once the server delete succeeds. A failed delete clears nothing.
- **T503-g (owner tick):** the "See all prices" page link is gone from the account Plan view. The Trip Pass sheet, its own link, the menu row and the pricing page stay.
- **T812-b:** one stop may have up to 60 nights instead of 21. This covers the wizard stepper, imported bookings, the "trip under way" first stop and the automatic split. Long-stay discounts are still on hold, so a 60-night stop is priced without one.
- **T370-c:** a comment fix only.
- **`pass.legalTrip` in six languages:** now says the 14-day withdrawal right stays, matching the new Terms.

## Files changed
| File | What changed and why |
|---|---|
| `ROADMAP.md` | Section 19 decided; section 16 Launch runway (dated gates); section 4 fast track; follow-ups in A2, C3, C9, D10, D13, D15, D19-D23, E5, F6, F8, G1, G3, G4, G5, G8, G9, G12, G14, H7, I1-I4, I7, I16, K3, K7, K9; I2 gate on the renewing-plan strings |
| `PRODUCT.md` | I-e commission wording (T461-d), saved trip keeps its settings (T703-a), step-free is advice (T433-n), device-only documents (T1015-a), typical fare exception (T882-b), worst water class (T1189-d), 32-day fare age (T692-a) |
| `DESIGN.md` | Phone tab bar labels and inactive colour (T186-e), rail tile title rule (T457-g), no site footer in the planners (T594-a) |
| `docs/HANDBOOK.md` | Behaviour lines for T1054-b, T503-g, T812-b; stale lines for ticked decisions (T1019-a, T1021-c, T692-a and others) |
| `.claude/skills/carta-design/references/app-rules.md` | I-e wording, fare age, typical-fare exception, budget-search lines |
| `docs/decisions/0009-launch-plan-fast-track.md` | New record: fast track, O and D dates, gates |
| `docs/decisions/0010-legal-posture-diy.md` | New record: digital service, pro-rata withdrawal, non-renewing Year Pass, no Booking-derived prices published |
| `docs/decisions/0007-register-business-late.md`, `docs/decisions/README.md` | Fast-track registration date; index of the two new records |
| `docs/design/direction.md`, `docs/design/home-g14.md`, `docs/design/a11y-audit.md` | T1111-a direction approved; G14 status; T1128-b pause control, needed only if v3 stays |
| `docs/i18n/review.md`, `docs/ai/model-strategy.md` | French register is vous (T1170-e); grounded allowance per pass checked against cost (T1135-i) |
| `docs/marketing/beta-invitation.md`, `docs/marketing/launch-outreach.md` | New: closed beta invitation (T220-d, refund wording per critique, hello@ address) and launch outreach texts (T336-a, T336-b) |
| `continent-app/src/components/TermsOfService.jsx` | Withdrawal right as a digital service with pro-rata refund and model form (T032-e); non-renewing Year Pass (T460-b, T461-e); upload licence without indemnity or "irrevocable", plain OSM grant (T333-b, T206-c); flight paragraph (T519-a); when the 2026-11-12 changes apply |
| `continent-app/src/components/PrivacyPolicy.jsx` | Controller, complaint right, Cloudflare Workers AI, Resend, Ask chat storage, legal-basis rows, Art 13(2)(e), deletion paragraph true today (T319-a, T575-b, T1110-d, T1156-f) |
| `continent-app/src/i18n/en.js` | `aiPage.actP` (T1156-a), `press.whatP2` I-e wording (T1047-a), `pass.legalTrip` withdrawal line |
| `continent-app/src/i18n/nl.js` | `aiPage.actP` (T1156-a), `pass.legalTrip` |
| `continent-app/src/i18n/de.js` | `aiPage.actP` (T1156-a), `pass.legalTrip` |
| `continent-app/src/i18n/fr.js` | `aiPage.actP` (T1156-a), `pass.legalTrip` |
| `continent-app/src/i18n/es.js` | `aiPage.actP` (T1156-a), `pass.legalTrip` |
| `continent-app/src/i18n/it.js` | `aiPage.actP` (T1156-a), `pass.legalTrip` |
| `continent-app/src/auth/AuthContext.jsx`, `continent-app/tests/deviceData.test.mjs` | Account deletion clears this device's copy (T1054-b) |
| `continent-app/src/auth/account/PlanView.jsx`, `continent-app/src/auth/AccountPanel.jsx`, `continent-app/src/styles/69-v6-account.css` | "See all prices" page link removed, the unused prop and CSS rule with it (T503-g) |
| `continent-app/src/planner/GuidedTripWizard.jsx`, `continent-app/src/planner/wizard/StepStay.jsx`, `continent-app/src/planner/wizard/useWizardSelection.js`, `continent-app/src/planner/flow/importStays.js`, `continent-app/tests/importStays.test.mjs` | 60 nights per stop (T812-b) |
| `continent-app/src/App.jsx` | Comment only (T370-c) |
| `docs/legal/ARTICLE30.md` | Contact row hello@, Ask Carta and Workers AI rows, Resend DPA (SCCs), VAT records 10 years (T1118-a, T1118-d) |
| `docs/legal/terms-change-notice-2026-11-12.md` | New: the 30-day notice email for the Terms change (T333-f) |
| `docs/ai/model-card-ask.md`, `docs/ai/model-card-plan-day.md` | AI Act: Carta is the provider of its AI features (T1156-a) |
| `docs/brand/POSITIONING.md` | I-e wording; trademark kept, class 39 word plus logo (T1060-a) |
| `docs/brand/data-stories/method.md` | No Booking-derived prices in stories (T1130-c) |
| `docs/data/access-ladder.md` | Partner terms findings: Hostelworld 3.1(h) and 6.1(c), Booking A15.2 (T1213-a) |
| `pipeline/transit/feeds.json` | Swiss timetable and Delcomar licences checked against their publishers' terms (T641-a) |
| `docs/owner/product-decisions.md`, `docs/owner/legal.md`, `docs/owner/README.md` | 147 to 6 and 26 to 3 steps, counts and footer |
| `.work/INDEX.md` | Run line |

## Live-system changes
None. This lane changed no live system (Supabase, Cloudflare, GitHub settings, the box, Stripe). Everything is in the repo on this branch.

## Handoffs to other lanes
- **supabase**:
  - T030-a, T032-a and T033-a: one-off Year Pass test price, Terms URL in checkout, VAT-inclusive prices.
  - T033-d: Stripe test-mode tax check.
  - T068-c: content_reports header query.
  - T333-f: send the Terms notice once Resend works. Uploads go live no earlier than 30 days after it.
  - T365-f (owner tick): admin_adjust_expiry moves to aal2. ROADMAP C3 has the follow-up.
- **box**: T1161-e (owner tick), CARTA_TRAILSLAB_PROMOTE=1 after one clean worker run.
- **deploy**: T1108-a, open the support@ mailbox and set SUPPORT_EMAIL before Tue 16 Feb 2027.
- **Steps decided here that sit in other lanes' files.** The owning lane should remove each one, or reword it where marked * (human or handoff, with the replacement text in `ledger.json`):
  - unsorted (54): `docs/owner/unsorted.md`.
  - review (19): `owner-checks.md`.
  - box (15): `data-and-pipeline-runs.md`, `hetzner-box.md`, `paid-runs.md`, `scraper-health.md`.
  - supabase (10): `stripe.md`, `uploads.md`, `pass-subscription.md`.
  - deploy (6): `cloudflare.md`, `google-and-search.md`.
  - security (5): `accounts-and-signups.md`.
  - `ledger.json` (`other_lane_files`) lists every id.

## Checks
- `npm test` (continent-app, sparse worktree): about 35 failures. None names or imports a file this run changed. They come from the missing `public/`, the missing Python `yaml`, the worktree short-path test, CRLF checkouts and the design-lint baseline in untouched files.
- Targeted tests pass: deviceData, importStays, passSubscription, aiPage and i18nParity. `npm run lint`: 0 errors.
- Docs checks: 4 entry points missing, all `continent-app/public` (sparse worktree). drift.py adds the `docs/SCHEMA.md` wire table, which this run did not touch.
- CI on the pushed branch (run 43254745893): app, evals, edge-deno and csp green; python failed once because `docs/tos/data_licenses.md` is generated from the registry and had a hand-written line (T1175-c). The line was reverted (the rule stands in ROADMAP K7 and `docs/brand/data-stories/method.md`); `tests/test_data_licences.py` passes locally and the re-run is the final gate.
- Judge 1: FAIL on criteria 5 and 7. Fixes 1 to 3 were applied:
  - The I2 gate now names the renewing-plan strings.
  - The Privacy deletion line is now true.
  - The beta invitation uses hello@.
  - Fix 4 was the test baseline.

## Risks the orchestrator must look at before merging
1. **The Terms and Privacy texts change at the next deploy.** The new Terms say no pass renews. The in-app Year strings (`pass.legalYear`, `pass.holdYear`, `pass.subscribedNote` and others) and the checkout code still describe a renewing plan until the ROADMAP I2 follow-up lands. Nothing is sold, because Stripe is in test mode, and the I2 gate blocks live keys until then. If that is not acceptable for this deploy, ship this branch's Terms change later.
2. **Translations are Claude's, not native-reviewed.** The five non-English `aiPage.actP` texts and the `pass.legalTrip` lines need the review lane's native-speaker check.
3. **Not looked at in a browser.** The account Plan view (T503-g) and the Stay step stepper (T812-b) were not looked at on a phone or desktop: this worktree has no app data. Look at both before shipping.
4. **The Imprint still holds placeholders.** The owner must give a name and address before the January closed beta (T461-b).
5. **Several lanes add an INDEX line** at the same spot in `.work/INDEX.md`, which will need a trivial merge.

## How to undo
Revert the commits on `p15-owner-decisions` (`git revert <sha>..`), or do not merge the branch. There is no data migration and no schema change, and no live system was changed.

## Follow-ups
Every engineering follow-up is in its ROADMAP item, named by step ID. Every human step is in `docs/owner/product-decisions.md` or `legal.md`, or, for steps owned by another lane, in `ledger.json` for that lane.
