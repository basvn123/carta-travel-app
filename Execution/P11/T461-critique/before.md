# T461 critique, before: Account, help and legal pages

Baseline: app commit 09f27e5 (T460 merged), read from git, not the working tree. Two isolated reviews ran as impeccable's critique asks: assessment A, a design review from the source and the before frames in `../T461-shots/before/`; and assessment B, the detector plus browser evidence, with the technical audit. Their full files sit next to this one: `assessment-a-before.md`, `assessment-b-before.md` and `audit-before.md`.

## Scores

| Measure | Score |
|---|---|
| Nielsen heuristics (assessment A) | 21 / 40 |
| Design specificity | 2 / 4 |
| Information architecture | 2 / 4 |
| Copy | 1 / 4 |
| Legal pages readability | 1 / 4 |
| Audit (accessibility 2, performance 3, responsive 2, theming 2, implementation integrity 1) | 10 / 20 |
| impeccable detector | 0 findings, which is not a pass: a control test showed it cannot see stylesheet-based components |

## What the two reviews agree on

1. A yearly subscriber cannot cancel or manage the plan. Since T460 the yearly plan renews, and the terms promise a "Cancel yearly plan" button in Account (German BGB 312k); `cancelYearly()` and `openBillingPortal()` exist in `lib/billing.js`, and nothing calls them. (P0 in A.)
2. The FAQ is wrong where it matters: `faq13A` says both passes are one-off 30-day payments; `faq14A` sends people to the wrong spoke to delete their account. It leads with catalogue counts and method paragraphs the owner struck.
3. The owner's personal Gmail is printed in the feedback note and is the contact in Privacy, Terms and Imprint (four files); a failed feedback send silently opens a mail client addressed to it.
4. The legal texts are a 380 px dialog at 12.5 px with 12 px headings and no contents. On a phone the overlay, not the dialog, scrolls, so the close button scrolls away (8,810 px of terms).
5. The Imprint prints "[Awaiting T015: ...]" placeholders publicly.
6. The hub is grey on grey (`--bg-card: var(--paper-dim)`), has no h1 at 820 px and up, and puts the invite banner in a brown tint the palette reserves for what acts.
7. Captions that read as filler: `account.signInPrompt`, `faqHint`, `feedbackHint`, `feedbackNote`, `dataHint`, `faqMore`, `gate.sub`, `auth.subSignin`, `auth.subSignup`.

## What T461 set out to do, in order

Your plan card with cancel, resume and the billing page (P0); FAQ rewritten from what travellers ask, with search and figures from `pricing.js`; contact moved to `hello@carta-europetravel.com` in one module, mail fallback gone; one shared reading layout for the three legal texts; data credits moved into the Imprint and the "Where the numbers come from" view removed; captions cut; invite banner folded into a Help row.
