# T461 Assessment A (design review): Account area, AFTER

Reviewer: Assessment A, design review only (the detector was not run or read).
Source: the uncommitted working tree on `p11-account` (app repo), read on 2026-10-16: `AccountPanel.jsx`, `account/FaqView.jsx`, `FeedbackView.jsx`, `PlanSection.jsx`, `LegalDoc.jsx`, `PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Imprint.jsx`, `AuthModal.jsx`, `AuthGate.jsx`, `69-v6-account.css` (the T461 block from line 437), the `account.*`, `auth.*` and `gate.*` keys in `en.js`, `lib/contact.js`, `lib/billing.js`, `supabase/functions/billing/index.ts`.
Screens: `Execution/P11/T461-shots/after/`. Three fixes landed after those frames (white tiles, the Contents chevron, focus on the legal title) and are judged from source. `69-v6-account.css` changed while this review ran (line 460 appeared), so line numbers are as of reading.

## Score table

| # | Heuristic | Before | After | One line why |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | "Renews {date}" and "Ends {date}" now show. The balance bar renders as an empty 2 px rule, and a Trip Pass says "12 days left" twice. |
| 2 | Match with the real world | 2 | 3 | Flight claims and "Where the numbers come from" are gone. A new clash: "Your plan", "See plans", "yearly plan" and "Carta bot plans" share one word on one card. |
| 3 | User control and freedom | 1 | 3 | Cancel, keep and manage payment all work online from the hub. Sign out is still two levels down. |
| 4 | Consistency and standards | 2 | 2 | The new views use kit Button, Chip and Field, but the Profile, Security and Your data forms still use `auth-submit` and `book-btn`. The hub uses two group-label classes, and legal pages are still dialogs. |
| 5 | Error prevention | 3 | 3 | The cancel step confirms in place with Keep focused first. Re-auth gates are unchanged. |
| 6 | Recognition rather than recall | 2 | 2 | The phone hub still ends in two unlabelled menus, Sign out and Delete still hide behind names that don't mention them, and the Shield icon marks both Privacy and Terms. |
| 7 | Flexibility and efficiency | 2 | 3 | FAQ search and legal contents (sticky from 1024 px) are new. Answers and sections still have no anchors. |
| 8 | Aesthetic and minimalist design | 2 | 3 | White tiles, no captions, a calm FAQ. Without a caption the guest card is an empty grey box, and the rail is still 11 bordered tiles. |
| 9 | Error recognition and recovery | 3 | 3 | A failed feedback send keeps the text and needs no mail app. `planFailed` gives no reason. |
| 10 | Help and documentation | 1 | 3 | The FAQ is rewritten around traveller questions with interpolated figures, and its answers are correct. The Terms now point to a screen this task deleted. |
| | **Nielsen total** | **21** | **28 / 40** | |

| Dimension | Before | After | One line why |
|---|---|---|---|
| Design specificity | 2 | 3 | The T461 CSS uses tokens throughout and cards are `--surface`. The hub avatar is still a brown tint on something that does not act (`22-account-admin.css:43-45`), and older sections keep literal px. |
| Information architecture | 2 | 2 | The plan block was the big gap and it is filled. The rest of the suggested regrouping did not happen: unlabelled menus, Sign out deep, Friends twice, three full legal rows, no From or Travellers. |
| Copy | 1 | 3 | The owner-named captions, the Gmail and the factual FAQ errors are fixed. "Welcome back", "Almost there.", "You're all set." and the Terms' stale sentences remain. |
| Legal pages readability | 1 | 3 | 960 px, 14 px `--text` at 68ch, real headings, contents, focus on the title. Still an overlay over the app, headings at 16 px, a 200-word paragraph, a three-column table on a phone, no print styles. |

## What improved against the before P0 and P1s

- **P0 cancel and manage: resolved in the UI.** `PlanSection.jsx` shows renew and end dates, Manage payment (Stripe portal), Cancel yearly plan with an inline confirm (Keep focused, Escape backs out) and Keep my yearly plan. The FAQ has cancel and refund answers built from `TIERS`.
- **P1 legal dialog: mostly resolved.** It grew from 380 px and 12.5 px `--ink-soft` to 960 px and 14 px `--text` at `--measure`. Headings are larger than the body, the contents list sits beside the text on desktop and folds on a phone, and focus opens on the title.
- **P1 Gmail: resolved.** One `CONTACT` (`hello@`) in `lib/contact.js`, no address on the feedback screen, no mailto fallback, and the typed text survives a failure.
- **P1 FAQ: resolved.** 15 questions in four task groups, search with an empty state, no counts, no method paragraphs, no typed figures. `shareText` no longer claims flight prices.
- **P2 surfaces: partly.** White tiles and the kit in the new views; the grouping and Sign out are unchanged.

## Remaining issues

### P0
None.

### P1. The Terms describe a screen this task deleted
- **Where.** `TermsOfService.jsx:139-140`: "The Data sources screen in the Account panel names the source of every layer." Also `:120-122` ("the screen names its source and says when it was observed"), stale since T438.
- **Fix.** Point to "the data credits in the Imprint" and drop the provenance claim, or restate it as what the screen shows now (the est. mark). Bump `UPDATED`.
- **Command.** `/impeccable clarify`.

### P1. Online cancellation is in place but 312k is not complete
- **Why.** `billing/index.ts` sets `cancel_at_period_end` and sends nothing. §312k(4) BGB asks for an immediate confirmation of the cancellation in text form (an email with the end date). The German confirm button reads "Kündigen" (`de.js:6316`); the statute's model wording is "jetzt kündigen". The control exists only when signed in, and some German rulings read 312k as also requiring a route that works without a login.
- **Fix.** Send a cancellation email from the billing function (or turn on Stripe's subscription-cancel email). Set `de` `planCancelGo` to "Jetzt kündigen". Put the signed-out question to the owner as a register row.
- **Command.** `/impeccable harden`.

### P1. The Imprint shows placeholders publicly (owner, T015)
- **Where.** `Imprint.jsx:23-31`. "[Awaiting T015: ...]" now appears in a large, readable page that a privacy-minded reader and a subscriber will actually open.
- **Fix.** Owner fills T015. Until then, show the contact address and a single line naming the operator, not bracketed placeholders.
- **Command.** `/impeccable harden` (owner content).

### P2. The plan card's bar is broken and its figures repeat
- **Why.** `.account-pass-bar` keeps `flex: 1 0 100%` from the old row layout (`69-v6-account.css:240-248`). Inside the column `.acct-card` that basis applies to height, so the bar collapses to its 2 px border with no fill (the phone frame measures 1 of 2 with no fill pixels). A Trip Pass shows the chip "12 days left" and then "12 days left, 5 plans remaining." A yearly subscriber sees "Renews 16 Oct 2027" beside "365 days left".
- **Fix.** Add `.acct-plan .account-pass-bar { flex: none; height: 8px; }`. Outside Free, `PassBalance` (`AccountPanel.jsx:54-56`) should state only the plans ("5 Carta bot plans left") and leave the dates to the chip.
- **Command.** `/impeccable polish`.

### P2. "Plan" means three things on one card
- **Where.** `en.js:6918` "Your plan", `:6923` "See plans" (it opens the passes), `pass.statusFree` "Carta bot plans", the header's "Get a pass".
- **Fix.** Title the card "Your pass", make the button "See passes", keep "yearly plan" as the product name and "day plans" for the bot.
- **Command.** `/impeccable clarify`.

### P2. The hub grouping is unchanged
- **Where.** `AccountPanel.jsx:817-849` (two unlabelled menus), `:1128-1136` (Sign out inside Security), `:845-847` (three legal rows, Shield twice), `:741` (monogram even when an emoji avatar is set), `:723` with `25-feature-pages.css:72` (the signed-in desktop hub still has no h1: `display:none` removes it).
- **Fix.** Label the groups ("Account", "Help") and use one class for group titles (`acct-group-title`). Put Sign out last on the hub as a secondary button. Make legal one row of three text links. Show `avatarEmoji` on the hub. Make the desktop h1 visually hidden rather than `display:none`.
- **Command.** `/impeccable distill`, then `/impeccable polish`.

### P2. The guest view is a titled-twice empty box
- **Where.** `AccountPanel.jsx:656` ("Preferences" under "Account") and `:748-752` (a grey card holding an icon and a button).
- **Fix.** Drop `account.preferences` and use "Account" as the h1. Make the card one row: the guest disc, "Sign in" primary and "Create an account" secondary, with no caption.
- **Command.** `/impeccable distill`.

### P2. The legacy forms sit next to the kit
- **Where.** `AccountPanel.jsx:981, 1045-1048, 1100-1107, 1113, 1133, 1153, 1205-1208, 1225, 1256-1259` (`auth-submit`, `book-btn`). `AuthModal.jsx:20-21` still opens with focus ringing Close, which is the issue just fixed for the legal pages.
- **Fix.** Swap in kit `Button` (primary, secondary, danger) and `Field`. Move AuthModal's initial focus to its title or the first field.
- **Command.** `/impeccable polish`.

### P2. Captions the before list named are still shipped
- **Where.** `en.js:677` "Welcome back", `:665` "Almost there.", `:668` "You're all set.", `:106` "Find your next trip", `:583` errNameEmpty (a comma splice and an unkept promise), `:613` "so it's worth keeping somewhere private", `:634` "Your trip settings" over one row, `:6890` "The catalogue grows with every update."
- **Fix.** "Sign in", "Check {email} for the link", "Password changed", "Add your name", "Confirm it's you to download the file", "Trip settings" (or fold Lifestyle into the Language group), and drop the last sentence.
- **Command.** `/impeccable clarify`.

### P3
- Legal headings are `--text-lead` 16 px (`69-v6-account.css` `.legal-body h3`); carta-design sets section titles at `--text-title` 20 px. Use 20 px from 769 px up. (`/impeccable typeset`)
- `PrivacyPolicy.jsx:39-61` is one 200-word paragraph. Split it by recipient (host, accounts, routing, maps and photos). The table at `:138` should stack label over value under 600 px. (`/impeccable adapt`)
- Legal still opens as an overlay over the current tab (`LegalDoc.jsx:53`), has no print styles, and has no URL for its sections. Add `@media print` and `#section` support to `?legal=`. (`/impeccable adapt`)
- FAQ rows have no `id` (`FaqView.jsx:61`), so support replies cannot link to an answer. Answers are `--text-2`; use `--text` for body copy. (`/impeccable polish`)
- Feedback chips wrap 2 + 1 at 390 px. Use shorter labels ("Bug", "Idea", "Other") or a Segmented control. (`/impeccable adapt`)
- The desktop rail is 11 bordered and filled tiles (`25-feature-pages.css:88-114`). Use plain rows with the selected tint only on the current one. (`/impeccable quieter`)
- Dead code: unused `tier` (`AccountPanel.jsx:643`), unused imports (`TIERS`, `daysLeft`, `canUpgrade`, `formatPrice`, `ChevronDownIcon`, `:7-17`), a stale comment above `SHARE_URL` (`:104`), unused `account.feedbackKind.data`. (`/impeccable distill`)
- Terms say some links pay a commission; PRODUCT.md says no commission on travel. This is still unresolved and is an owner call.
- A `year` tier without a live subscription row shows no action and no explanation (`PlanSection.jsx:47, 83-101`). (`/impeccable harden`)

## Persona check

- **Yearly subscriber who wants to cancel:** can now do it in two taps with a clear end date. Gets no email confirming it.
- **Casey, phone:** the plan card and FAQ search work with one thumb. Sign out still needs Account, then Security, then a scroll.
- **Privacy-minded traveller:** the policy is readable and the contact is professional. The Imprint shows placeholders, and the Terms point to a screen that no longer exists.
- **Jordan, guest:** the page is still titled twice, and the sign-in card is a box with nothing in it but a button.
