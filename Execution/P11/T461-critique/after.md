# T461 critique, after: Account, help and legal pages

The same two isolated reviews ran on the working tree before the fix batch: `assessment-a-after.md` (design review) and `assessment-b-after.md` with `audit-after.md` (detector, browser evidence, audit). This file records the scores, then the one fix batch that followed, as impeccable's bounded loop asks. No third round was run.

## Scores

| Measure | Before | After (before the fix batch) |
|---|---|---|
| Nielsen heuristics | 21 / 40 | 28 / 40 |
| Design specificity | 2 / 4 | 3 / 4 |
| Information architecture | 2 / 4 | 2 / 4 |
| Copy | 1 / 4 | 3 / 4 |
| Legal pages readability | 1 / 4 | 3 / 4 |
| Audit | 10 / 20 (its fifth row was implementation integrity) | 14 / 20 (accessibility 2, performance 3, responsive 3, theming 3, anti-patterns 3) |
| Audit issues P0, P1, P2, P3 | 0, 7, 15, 5 | 0, 3, 9, 12 |
| Detector, static | 0 (cannot read stylesheets) | 0 (same) |
| Detector, by URL | not run | 96: 63 true `line-length` from the 68ch `--measure` token, 33 false (Explore behind the scrim) |

## The fix batch

| Finding | Fix |
|---|---|
| A P1: the Terms sent readers to the deleted Data sources screen, and claimed every measured figure names its source and date | Points to the data credits in the Imprint; the provenance sentence now describes the "est." mark the screen actually shows |
| A P1 / audit P1: the Imprint hid the "[Awaiting T015]" lines but still claimed to identify the operator | One plain line says the registration is in progress and the details will appear there; the regulatory sentence says "once published"; postal fields guarded too |
| A P1: German confirm said "Kündigen" | "Jetzt kündigen" |
| Audit P1: focus left the legal dialog from its parked title or a jumped-to heading | LegalDoc catches Tab from a `tabindex=-1` heading and moves to the next or previous control inside, wrapping |
| Audit P1: the cancel confirm dropped focus to `body` and announced nothing | Escape and "Keep it" return focus to "Cancel yearly plan"; a cancel or resume focuses the plan heading and writes "Cancelled. Your yearly plan runs until {date}." or "Kept. ..." to a status line that stays mounted; the question is the group's description |
| A P2: the balance bar collapsed to its border; days stated twice on a Trip Pass | `flex: none` on the card's bar; the chip shows only renew or end dates |
| A P2: "plan" meant three things on the card | "See plans" is "See prices" |
| Audit P2: feedback error not announced, focus lost after Send and Send another | One live line through every state; focus moves to Send another, then back to the message |
| Audit P2: Escape in the FAQ search closed Account | Escape clears a search first |
| Audit P2: Contents jump ignored reduced motion | `scrollBehavior()` from `lib/motion.js` |
| Audit P2: no h1 on the desktop hub | Kept for screen readers (visually hidden) instead of `display: none` |
| Audit P2: feedback chips and errors English in five languages | Translated |
| Audit P2: verify_admin_panel and verify_trails_export asserted the retired credits page | Both updated to Share Carta and the Imprint's Data credits |
| Audit P3s | FAQ opens results when two or fewer match overall; FAQ groups are not landmarks; feedback defaults to "Something else"; the phone Contents fold closes after a jump; contents built before paint; no ring on headings that only hold focus; a failed cancel's error clears with the confirm; a billing answer with no address counts as a failure; plan actions wait for the entitlement; dead imports gone |

## Left open on purpose

Kit hover on a disabled primary (`03-button.css`, outside the task's files), the text-form cancellation confirmation (a Stripe Dashboard setting or a function change, owner), the 68ch measure token (owner), the hub's remaining structure (Sign out two levels deep, the guest view titled twice, AuthModal focus on Close, legacy buttons in the Profile, Security and Your data forms). Each is a register row.
