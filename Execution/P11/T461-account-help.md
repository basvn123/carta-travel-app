# T461: Account, help and the legal pages

## Task ID

T461

## Date

2026-10-16

## What changed

Account is now a settings page a traveller can read at a glance, with the yearly plan's controls where the law and the terms say they are.

**Your plan.** The hub's pass card became "Your plan" (`auth/account/PlanSection.jsx`):
- the tier and its balance;
- for a yearly subscriber, "Renews {date}", "Manage payment" (Stripe's billing page) and a plainly labelled "Cancel yearly plan". It confirms in place, in one sentence that names the end date, with the safe choice focused. It then says "Cancelled. Your yearly plan runs until {date}." and offers "Keep my yearly plan".

This is the online cancellation that BGB 312k, the terms and the Stripe checkbox all point at (row T460-e).

**Contact.** The owner's personal Gmail is gone from the app:
- One module, `lib/contact.js`, holds `hello@carta-europetravel.com` for Privacy, Terms and Imprint.
- Feedback has no address on screen and no mail fallback. A failed send says so in one line and keeps the text.

**Common questions.** Rewritten from what a traveller asks: 15 questions in four groups (Planning, Prices, Passes and payment, Account and data).
- A search filters them as you type.
- Every price and day count comes from `lib/pricing.js`.
- There are no catalogue counts or method paragraphs.
- The answers match the terms: a 60-day Trip Pass, a yearly plan that renews, deletion under Your data, and refunds within 14 days through hello@ (row T460-f).

**Legal pages.** Privacy, Terms and Imprint share one reading layout (`components/LegalDoc.jsx`), replacing a 380 px modal at 12.5 px:
- a 960 px dialog, a full-height page on a phone;
- 14 px body in full ink;
- the "Last updated" date under the title;
- a contents list built from the document's own headings: a column from 1024 px, a fold above the text below that.

**Data credits.** "Where the numbers come from" is gone at the owner's call. The licence credits it held are printed in a "Data credits" section of the Imprint, so the licences stay satisfied.

**Captions and copy.**
- Gone: the sign-in caption in the modal and on the entry gate, the guest hub's prompt, and the FAQ, feedback and data hint lines.
- The invite banner is one "Share Carta" row in Help.
- The share text no longer claims Carta prices flights.

**Account cards.** They are white tiles on the paper ground, as on My trips (T434) and Explore.

## Files touched

**Modified (app, `continent-app/`):**
- `src/auth/AccountPanel.jsx`: FAQ, feedback and credits out to their own files; plan card; share row; guest card one button; dead imports removed
- `src/auth/AuthModal.jsx`: no caption under sign in and sign up
- `src/auth/AuthGate.jsx`: no caption
- `src/components/PrivacyPolicy.jsx`, `src/components/TermsOfService.jsx`, `src/components/Imprint.jsx`:
  - all three on LegalDoc and the contact module;
  - the Terms point to the Imprint credits and describe the "est." mark;
  - the Imprint has data credits and an honest line in place of the T015 placeholders
- `src/data/attribution.js` (comment: the credits render in the Imprint)
- `src/styles/69-v6-account.css` (T461 section: plan card, FAQ, feedback, legal reading layout, white cards, hub h1 for screen readers)
- `src/i18n/{en,nl,de,fr,es,it}.js`: 54 keys added and 45 removed per language; feedback kinds translated; share text
- `scripts/verify_account_panel.mjs`:
  - new FAQ checks: count, search, no counts, no personal address;
  - Imprint credits;
  - the Share row;
  - selected state read from `--select-bg`;
  - keyboard walk;
  - a yearly subscriber's cancel and resume
- `scripts/verify_friends.mjs`:
  - Friends opened through Account (row T434-h);
  - the T434 share panel's kit markup;
  - `.shell-pass-btn`
- `scripts/verify_admin_panel.mjs`, `scripts/verify_trails_export.mjs` (the retired credits door)

**Created (app):**
- `src/auth/account/PlanSection.jsx`
- `src/auth/account/FaqView.jsx`
- `src/auth/account/FeedbackView.jsx`
- `src/components/LegalDoc.jsx`
- `src/lib/contact.js`

**Root:**
- the mirror of every app file above;
- `Execution/P11/T461-account-help.md`;
- `Execution/P11/T461-critique/` (before.md, after.md, assessments A and B, audits);
- `Execution/P11/T461-shots/` (before and after, jpg, with measure json);
- `Execution/_OPEN.md`

**Deleted:** none. FriendsSpoke.jsx was not touched (see open items).

## Commands run

```
git -C continent-app checkout -b p11-account ; git checkout -b p11-account
python <scratchpad>/i18n_keys.py keys_t461*.json src/i18n
python <scratchpad>/edit_account.py ; edit_legal.py ; fixbatch_t461.py ; edit_verify_*.py
npx vite build ; npm test ; node scripts/ci/design-lint.mjs ; banned-terms.mjs ; token-contrast.mjs
BASE=http://localhost:4191 node scripts/verify_account_panel.mjs ; verify_friends.mjs ; verify_paywall.mjs ; verify_admin_panel.mjs ; verify_trails_export.mjs
node <scratchpad>/shoot_t434.mjs --label=after --only=account [--lang=de --narrow=1] --url=http://localhost:4191
```

## Config and secrets set

None in the app.
- The owner sets up Cloudflare Email Routing so that `hello@carta-europetravel.com` forwards to their inbox (row T461-a).
- Until then, the address in the legal texts and the refund answer does not deliver.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Personal Gmail in src | 4 files, printed on the feedback view, mail fallback to it | 0; one contact module | gone |
| Cancel a yearly plan online | no route (billing.js unused) | Account > Your plan > Cancel yearly plan, confirmed in place, announced, resumable | P0 closed |
| FAQ | 14 questions, catalogue counts, a wrong 30-day pass answer, a wrong delete pointer | 15 questions, search, figures from pricing.js, no counts | |
| Legal dialog width, body size | 380 px, 12.5 px grey, 12 px headings, no contents | 960 px (phone full screen), 14 px ink, section headings, contents list | |
| Legal close on a phone | scrolled away (8,810 px overlay) | fixed header, the body scrolls | fixed |
| Words in the first screen, hub (phone, desk) | 52, 53 | 31, 29 | about -42% |
| Words, guest hub (phone, desk) | 53, 52 | 24, 17 | about -60% |
| Words, feedback view (phone) | 59 | 13 | -78% |
| Captions removed | | 9 strings (gate.sub, auth.subSignin, auth.subSignup, signInPrompt, faqHint, feedbackHint, feedbackNote, dataHint, faqMore) | -9 |
| Account doors | Data sources, invite banner | Share Carta row; credits in the Imprint | |
| Raw buttons (AccountPanel, legal pages) | 30, 3 | 22, 0; new files 0 | -11 |
| AccountPanel.jsx lines | 1,534 | 1,298 (plus 297 in three new files) | -236 |
| Horizontal scroll at 360, 390, 820, 1440 (EN and DE) | none | none | |
| Small targets in the panel on touch | 0 | 0 (the Imprint's inline mail link is exempt, WCAG 2.5.8) | |
| design-lint new violations | | 0 | |
| Tests | 449 | 449 | |
| Critique (Nielsen /40) | 21 | 28, then the fix batch | +7 |
| Audit (/20) | 10 | 14, then the fix batch | +4 |

The FAQ's first-screen word count rose from 94 to 311 on a phone. The probe counts text nodes in the viewport, and the collapsed answers of `<details>` are laid out in place. A reader sees about eight questions per screen, as before.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| verify_friends stopped at its second step | it clicked `.header-friends-btn`, removed by T426 | Friends is opened through Account (closes T434-h) |
| Further down, verify_friends failed on the share panel and the Passes check | the harness had never reached them since T426 and T434; the picker is a kit select, visibility a Segmented, the pass door `.shell-pass-btn` | selectors updated; 47 checks pass |
| design-lint: `outline: none` on the legal headings | the jumped-to heading's ring | rule removed; later a transparent outline on non-control headings only |
| Git Bash `sed -i` stripped CRLF from 69-v6-account.css | known trap | rewritten with CRLF through Python |
| Plan card balance right-aligned and its bar collapsed to a line | rules from the old hub card (21-chat-passes, `flex: 1 0 100%` in a column) | scoped overrides on `.acct-plan` |
| The after review's P1s and P2s | see `T461-critique/after.md` | one fix batch, then the harness walks above |

## What is still open

Each item is one row in `Execution/_OPEN.md`.

- **T461-a (user).** Cloudflare Email Routing for `hello@carta-europetravel.com`. The legal texts and the refund answer name it.
- **T461-b (user).** The Imprint's business details (T015: legal name, address, KBO/BCE number). The page now says the registration is in progress. EU e-Commerce Directive Art 5 needs them before the passes sell.
- **T461-c (user).** The legal texts stay English only in all six languages, as before. Translating them is a product and legal call.
- **T461-d (user).** The Terms say some outbound links earn a commission, but PRODUCT.md says Carta takes no commission on travel. One of the two has to change.
- **T461-e (user).** BGB 312k(4) asks for a cancellation confirmation in text form. Either switch on Stripe's cancellation email, or have the billing function send one. This goes with T460-b's legal review.
- **T461-f (next task).** Kit hover on a disabled primary paints it brown under grey text (`03-button.css`, `.btn-primary:hover` without `:not(:disabled)`). It is app-wide, so it was outside T461's files.
- **T461-g (next task).** The hub's remaining structure:
  - Sign out sits two levels down;
  - the guest view is titled twice;
  - AuthModal opens with focus on Close;
  - the Profile, Security and Your data forms still use 22 legacy buttons;
  - Home airport and Travellers rows (planned) were not added;
  - the unselected language options stay on the grey fill.
- **T461-h (next task).** FriendsSpoke (13 raw buttons) is not on the kit. The "Alongside your friends" ledger move planned for it was dropped from this task.
- **T461-i (user).** The legal body follows the 68ch `--measure` token, which holds about 95 characters of prose a line. The detector flags this 63 times. Whether to tighten it is a token call.

**Closed by T461:** T460-e (the cancel route), T460-f (the FAQ pass answer) and T434-h (verify_friends).

## Carta-design: the seven questions

1. **Hex values.** None. design-lint reports 0 new, and token-contrast reports 0 under the floor.
2. **Colour.** No gradient and no new colour. The invite banner's brown tint is gone. Brown marks only the selected language, the primary and the focus ring. Cancel uses `--danger`, the one red.
3. **Selection.** The rail's current page and the chosen language use the `--select-*` tint and a mark, and the harness reads the token.
4. **Figures.** Prices go through `formatPrice` in the FAQ. No figure is under 12 px, and the balance uses tabular figures.
5. **One primary.** Sign in on the guest view and Send on feedback. The hub has none, because it is settings. No photograph.
6. **Copy.** Every caption the owner flagged is gone. The FAQ answers are at most two sentences, and no banned words or dashes remain (banned-terms passes).
7. **What else could go.** The data credits view, the invite banner, nine captions, 236 lines of AccountPanel, and the mail fallback.

## Rollback procedure

- **App repo:** `git -C continent-app revert -m 1 <the T461 merge on master>`.
- **Root repo:** `git revert -m 1 <the T461 merge on main>`, then push.
- **Data:** no migration, and nothing written to user data.
- **Pages:** redeploy the previous production deployment from the Cloudflare dashboard.
