# T461 Assessment A (design review): Account area, BEFORE

Reviewer: Assessment A, design review only (the detector was not run or read).
Source: app repo at commit `09f27e5` (Merge p11-pass, T460): `src/auth/AccountPanel.jsx`, `FriendsSpoke.jsx`, `AuthModal.jsx`, `AuthGate.jsx`, `src/components/PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Imprint.jsx`, `src/lib/feedback.js`, `src/lib/billing.js`, `src/lib/pricing.js`, styles `16-auth.css`, `22-account-admin.css` (1 to 272), `69-v6-account.css`, `25-feature-pages.css` (1 to 120), the `account.*`, `auth.*`, `gate.*` strings in `src/i18n/en.js`.
Screens: `Execution/P11/T461-shots/before/` (guest, hub, faq, feedback, privacy, terms at p360, phone, ipad, desk) and `measure-before.json`.
Rules applied: PRODUCT.md, DESIGN.md, `.claude/skills/carta-design/SKILL.md` (these win), and the owner's wishes of 2026-10-16.

## Score table

| # | Heuristic | Score | One line why |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Pass balance as figure plus thin bar, still loading blocks, dismissible notices. A yearly subscriber is told "days left", never "renews on {date}". |
| 2 | Match with the real world | 2 | "Imprint", "Where the numbers come from", "Your trip settings" with one row; the invite and share text imply Carta prices flights. |
| 3 | User control and freedom | 1 | No way to cancel or manage the yearly plan although the Terms promise both on this page; Sign out sits two levels down. |
| 4 | Consistency and standards | 2 | Legacy controls (`auth-submit`, `book-btn`, `admin-tone-opt`) beside the kit; grey cards here, white kit tiles on Explore and Destinations; legal texts are dialogs while every other spoke is a page. |
| 5 | Error prevention | 3 | Re-auth before password, export and delete; arm then confirm; the Google-only path types the address. |
| 6 | Recognition rather than recall | 2 | On a phone the spokes are split across two unlabelled menus under the pass and invite; Sign out and Delete are hidden behind names that do not say they hold them. |
| 7 | Flexibility and efficiency | 2 | Desktop rail is good. No deep link per FAQ answer or legal section, no contents, no search across 14 answers and 3,327 words of terms. |
| 8 | Aesthetic and minimalist design | 2 | Grey boxes on a grey page with a full-width hairline under each, brown tints spent on decoration, captions that restate the heading. |
| 9 | Error recognition and recovery | 3 | Errors are specific and in the house voice ("That current password isn't right."). Feedback failure silently opens a mail app to a private address. |
| 10 | Help and documentation | 1 | The FAQ misinforms on billing (says no subscription, says 30 days), points to the wrong place to delete, and misses the questions people ask. |
| | **Nielsen total** | **21 / 40** | |

| Dimension | Score | One line why |
|---|---|---|
| Design specificity (does it read as Carta Lagoon in brown) | 2 / 4 | Figtree, brown primary and the selected tint are right; the page is grey on grey (`.account-shell { --bg-card: var(--paper-dim) }`), the avatar disc and invite banner are brown tints on things that neither act nor are selected, and a dozen literal px sizes and radii (12.5, 13.5, 15 px; 6, 4, 2 px radius; `.15s`) sit outside the tokens. |
| Information architecture | 2 / 4 | Hub and spoke is right; the grouping is not (see below). Home airport and travellers are missing, plan management is missing, legal and credits are mixed into Help. |
| Copy | 1 / 4 | Three factual errors in shipped strings, catalogue counts and method sentences the owner banned, and the captions the owner named. |
| Legal pages readability | 1 / 4 | A 380 px dialog, 12.5 px body in `--ink-soft`, 12 px headings smaller than the body, no contents, no section links, no h1. |

## What is there, in order (phone, signed in)

Header: Carta, "Get a pass", "Friends". Then: overline "Account" (the h1), profile card (monogram, name, email), "Your trip settings" (one row: Lifestyle, "Entire place, Easygoing"), "Language" (six flag tiles, 2 x 3), "Your pass" (tier, "1 of 2 Carta bot plans left.", bar, brown "See passes" primary), invite banner ("Plan the next one together", "Share Carta"), an unlabelled menu (Friends, Sign-in and security, Your data), an unlabelled menu (Admin for staff, Send feedback, Common questions, Privacy policy, Terms of service, Imprint, Where the numbers come from). Sign out is inside "Sign-in and security". Delete account is inside "Your data".

Desktop: a 216 px rail with "Account" (Overview, Profile details, Sign-in and security, Your data, Friends) and "Help" (Send feedback, Common questions, Privacy policy, Terms of service, Imprint, "Where the numbers come f..." truncated at every desktop and iPad width), the hub in an 808 px column. The hub has no visible title: the h1 is `.panel-tag`, and `25-feature-pages.css` sets `.account-shell .panel-tag { display: none }` from 769 px, which also drops it from the accessibility tree, so the signed-in desktop hub has no h1 at all. Guest desktop shows "Preferences" as the title.

## Information architecture

**Grouping and order.** The hub mixes four kinds of thing at one level: who you are, how you travel, what you hold, and fine print. The phone order puts the upsell (one brown primary) and the invite banner above the doors to Friends, Security and Your data, so the account reads as a sales page before it reads as settings, the exact problem the T390 comment says it fixed. The two closing menus have no group label, so "Privacy policy" and "Send feedback" look like peers of "Sign-in and security".

**What belongs where.**
- Sign out is a session action; it belongs at the foot of the hub, one tap away, not inside a security form page.
- "Delete my account" belongs under "Your data" (right), but the FAQ sends people to "profile details" (wrong, `account.faq14A`).
- Friends has two doors on a phone (header button and hub row); one is enough.
- Privacy, Terms and Imprint are reference, not help. A single "Legal" group or a footer link row under Help keeps them reachable without three full menu rows.
- "Where the numbers come from" can go as a spoke. The credits cannot simply vanish, because CC BY, CC BY-SA and ODbL ask for a visible credit: move `ATTRIBUTIONS` into a "Credits and licences" section at the end of the Imprint or Terms page (carta-design already puts sources in "one line of links at the foot of the page" on item pages).

**Settings that are missing.**
- **Home airport (origin).** Every priced view's settings line opens with "From Charleroi CRL"; the account, which is where a person looks for a default, has no origin row.
- **Travellers (party).** Same: in the settings line, not in the account.
- "Your trip settings" holds one row today. With From, Travellers, Lifestyle and Language it becomes the one place that mirrors the settings line, and the overview gains the useful things the owner asked for from the other tabs without new furniture.
- **Plan and billing.** `src/lib/billing.js` exports `openBillingPortal()` and `cancelYearly()`; no component calls either (`git grep` at `09f27e5`). The Terms say: "You can cancel the yearly plan at any time, online, from your Account page ("Cancel yearly plan") ... You can also manage your card and download invoices there through Stripe's billing page." Neither control exists. `PassModal.jsx` only offers "Keep my yearly plan" after a cancel that the traveller has no way to make. The hub's pass card shows "{days} days left, {left} plans remaining." for a plan that renews by itself.

**Suggested hub, phone first** (for the redesign to test, not a ruling):
1. Profile card (avatar as chosen, name, email) as a door to Profile.
2. Trip settings: From, Travellers, Lifestyle, then Language (keep the visible six-way choice the owner likes, as the kit's choice chips or tiles, smaller).
3. Your plan: tier, plans left as figure plus bar, "Renews on {date}" or "Runs until {date}"; actions Manage billing, Cancel yearly plan (inline confirm, danger) or Keep my yearly plan; See passes only for Free.
4. Friends (one door).
5. Account: Sign-in and security, Your data.
6. Help: Send feedback, Common questions.
7. Legal as one quiet row of links: Privacy, Terms, Imprint (credits inside).
8. Sign out, last, secondary.
The invite banner either becomes one quiet row ("Share Carta") in Help or goes.

## Copy: captions to drop or change

Each is quoted from `en.js` at `09f27e5`.

**Factually wrong (fix first).**
- `account.faq13A`: "The Trip Pass, {tripPrice}, gives {tripPlans} plans and {tripGround} live searches over 30 days. ... Both are a one-off payment, not a subscription". Since T460 the yearly plan renews until cancelled, and `TIERS.trip.periodDays` is 60. The 30 is typed in, the very drift the `faqVars` comment says interpolation prevents.
- `account.faq14A`: "Delete account, under profile details." It is under "Your data".
- `account.shareText`: "Carta prices the whole trip, flights, stay, food and local transport, before you book anything:". Carta does not price flights (PRODUCT.md, owner 2026-10-02).
- `account.inviteBody`: "Share Carta with a friend and compare what the same dates cost from each of your airports." Implies a flight comparison Carta does not make.

**Banned furniture (catalogue counts, method sentences).**
- `account.faq1A`: "{n} destinations across 43 European countries". Owner named this.
- `account.faq4A`: "The catalogue covers 43 countries and grows a batch at a time".
- `account.faq5A`: "Beds are priced from Inside Airbnb listings and food from Numbeo, with Eurostat's price level index scaling the gaps. Open a place and the receipt says ... whether the figure was measured in that city or is a country-level one". A method sentence, and since T438 the receipt no longer says that.
- `account.faq15A`: the whole accuracy paragraph is a method note, and it types "EUR" into an i18n string ("within EUR {accEur} a day"), which carta-design rule 9 forbids.
- `account.dataHint`: "Carta runs on open data. ... and the full ledger of what we use lives in the repo." A traveller has no repo.

**Captions that sound written by a machine or restate the heading (owner asked these to go).**
- `account.signInPrompt`: "Sign in to save trips and sync your settings across devices." (owner's example)
- `gate.sub`: "Sign in to save trips and sync your settings across devices, or jump straight in without an account."
- `auth.subSignin`: "Sign in to save trips and sync your settings."
- `auth.subSignup`: "Save trips, keep your preferences, pick up where you left off."
- `account.faqHint`: "Short answers about what Carta measures, what it plans, and what your account holds." (owner's example)
- `account.feedbackHint`: "Say what broke, what looked wrong, or what's missing. It lands directly with the person who builds Carta."
- `account.faqMore`: "Not answered here? Tell us what is missing and it lands with the person who builds Carta."
- `account.feedbackNote`: "Your message goes straight to the person who builds Carta. If it cannot be sent from here, your email app opens with it filled in, addressed to {email}." Prints the owner's Gmail; owner asked for it to go.
- `account.inviteTitle`: "Plan the next one together" (could sit on any product).
- `gate.title`: "Find your next trip" (generic).
- `auth.titleSignin`: "Welcome back"; `auth.noticeConfirmSent`: "Almost there. ..."; `auth.passwordUpdatedSub`: "You're all set. Continue into the app." Filler openers.
- `account.exportConfirmHint`: "... so it's worth keeping somewhere private." Editorial.
- `account.errNameEmpty`: "Add a name, it's what your saved trips are filed under." Comma splice, and a claim the product does not visibly honour.
- `account.preferences`: "Preferences" as the guest page title under the overline "Account": two names for one page.
- `account.tripSettings`: "Your trip settings" over a single row.

**Keep.** `pass.statusFree` ("1 of 2 Carta bot plans left."), the error strings (`auth.errBadLogin`, `account.errCurrentPassword`, `auth.errRate`), `friends.privacyNote`, `account.deleteHint`, `account.noPasswordHint` (could lose a clause).

## FAQ ("Common questions")

Fourteen questions in four groups, one open at a time, no search, no anchors. It answers what the builder wanted to explain (how the rating is built, how accurate food prices are) more than what travellers ask. Missing, in rough order of how often a support inbox sees them:
- How do I cancel my yearly plan, and will I be charged again?
- Can I get a refund? (Terms has a Refunds section.)
- Why are there no flight prices? (Carta's most surprising fact; today only implied.)
- What does "est." mean next to a price?
- How do I set my home airport, number of travellers or language?
- What happens to my trips when a pass ends? (`pass.keepNote` answers it elsewhere.)
- How do I plan a trip with a friend? (co-planning, invite links)
- I did not get the confirmation or reset email.
- Is my data sold or shared? (one line, link to Privacy)
- How do I install Carta on my phone?

Navigation: group headings become a row of jump links at the top (or one search field), each answer gets an anchor so support and feedback replies can link to it, and "Send feedback" stays as the way out. Every figure is interpolated from `TIERS` (price, plans, days, renewal), never typed.

## Legal pages readability

| Measure | Privacy | Terms | Carta rule |
|---|---|---|---|
| Container | `.auth-modal` max-width 380 px, padding 30 px, so about 320 px of text on a 1440 px screen | same | Reading pages cap at 1180 px; prose at `--measure` 68ch |
| Body size and colour | 12.5 px, `--ink-soft` (`.privacy-body`) | same | `--text-body` 14 px, `--text` for body copy |
| Section headings | `h3` at 12 px, smaller than the body | same, 20 sections | `--text-title` 20 px for section titles; headings in order |
| Page title | `h2` "Privacy policy" in a dialog; no h1 | `h2` | One h1 per view |
| Length | 1,221 words, one paragraph of about 200 words ("Services the app talks to") | 3,327 words | |
| Navigation | none | none (one `id="content-rule"`) | Sticky section rail for three or more sections |
| Table | three columns in 320 px | none | |
| Scroll | inside an 84dvh box inside a scrim | same | A page never opens inside a sheet |
| Initial focus | the Close button, so a heavy brown ring is the first thing on screen (visible in every shot) | same | Opened by pointer, focus goes to the page heading |

The narrowness the owner sees is the dialog, not the text: 320 px at 12.5 px is roughly 50 characters a line, a cramped column floating over an unrelated page (the desk shots show Destinations behind it). The fix is a reading page at its own URL (`?legal=privacy` already routes): a title and "Last updated" line, a three to five line plain summary, a contents list (sticky side column from 1024 px, a top list on a phone), section headings at `--text-title`, body `--text-body` in `--text` at `--leading-body`, prose capped at 68ch, the table as stacked label-over-value rows on a phone, a link back to Account, and print styles. Same shell for Terms and Imprint.

Content problems a reader will hit (owner or legal review, not design calls):
- Imprint shows placeholders publicly: "[Awaiting T015: Legal business name]", "[Awaiting T015: Street address]" and so on.
- Privacy, Terms and Imprint each name `bas.vannieuwenhuyse123@gmail.com` as the contact (`CONTACT` constant in all three files and in `AccountPanel.jsx`). A role address on the product domain is the professional answer; which address is the owner's decision.
- Terms "Every figure is an estimate": "Where a figure rests on a measured price, the screen names its source and says when it was observed". Since T438 the screen shows the estimate mark only.
- Terms say some links are affiliate links that may pay a commission; PRODUCT.md says Carta takes "no commission on travel". One of the two needs to change.
- Terms "Cancelling the yearly plan" describes controls that do not exist (P0 below).

## Strengths

1. **Hub and spoke from one list.** `NAV` is drawn as the phone menu and the desktop rail, so the two cannot drift; each spoke has one primary (T390 split Profile, Security and Your data for exactly that).
2. **Careful, honest account forms.** Re-auth before password change, export and delete; arm then confirm with the safe button first; a Google-only fallback that types the address; per-field marks that stay quiet until touched; a password checklist that gates the button; errors that say what happened in one sentence.
3. **Settings that read their value in place.** The Lifestyle row shows "Entire place, Easygoing" before it is opened, the language grid shows the current choice with tint and tick, and feedback goes to the database with a kind for triage, works signed out and handles the rate limit in plain words.

## Priority issues

### P0. A subscriber cannot cancel or manage the yearly plan
- **Why.** The yearly plan has been sold as a renewing Stripe subscription since T460. The Terms promise "Cancel yearly plan" and Stripe's billing page "from your Account page"; neither exists, `cancelYearly()` and `openBillingPortal()` are never called, the hub states "days left" instead of a renewal date, and `account.faq13A` tells the reader it is "not a subscription" and lasts "30 days". The only way out is mailing a private Gmail. This is a consumer-law and trust problem, not polish.
- **Fix.** A "Your plan" block on the hub: tier, plans left (figure plus bar), "Renews on {date}" or "Runs until {date}"; secondary "Manage billing" (portal: card, invoices); "Cancel yearly plan" as a `--danger` action with the one-sentence inline confirm carta-design allows where nothing can be held back, then the existing `pass.cancellingNote` and "Keep my yearly plan". Rewrite `account.faq13A` from `TIERS` (price, plans, `periodDays`, `recurring`) and add a cancel and refund question. Keep "See passes" only for Free and Trip.
- **Command.** `/impeccable harden` (account billing states), then `/impeccable clarify` (faq13A, status lines).

### P1. Legal pages are a narrow dialog of small grey text
- **Why.** Privacy (1,221 words) and Terms (3,327 words, 20 sections) sit in a 380 px dialog at 12.5 px in `--ink-soft`, with 12 px headings smaller than the body, no contents, no h1, initial focus ringing the close button. The owner named this directly; a privacy-minded reader or a subscriber checking cancellation terms cannot navigate it.
- **Fix.** One reading-page shell for Privacy, Terms and Imprint at their existing `?legal=` URLs: h1, last updated, short summary, contents (sticky side column at 1024 px and up, top list on a phone), `--text-title` section headings with anchors, `--text-body` in `--text`, 68ch measure inside the 1180 px cap, stacked table rows on a phone, print styles, focus to the heading on open. Move the data credits into it.
- **Command.** `/impeccable adapt` (layout and responsive), `/impeccable polish` (type scale).

### P1. The owner's personal Gmail is printed and used as a fallback
- **Why.** `account.feedbackNote` prints it under the Send button, the failure path silently opens a mail app addressed to it (`mailtoFeedback`), and the three legal texts and the Imprint name it. The owner asked for it to go; it also reads as a hobby project to a first-time visitor.
- **Fix.** Drop the address from the feedback note and the mailto fallback: on a failed send keep the typed text, say "Not sent. Try again." with a retry. Replace `CONTACT` in the legal texts with the address the owner chooses (a register row for the owner), and say in one line what the feedback carries (page, screen size, language, browser), since `feedbackContext()` attaches it.
- **Command.** `/impeccable clarify`.

### P1. The FAQ is wrong in places and answers the builder's questions
- **Why.** Three wrong answers (faq13A billing, faq14A delete location, plus the share text claiming flight pricing), catalogue counts and method paragraphs the owner banned, a typed "EUR", the "Short answers about..." caption, and no answers for cancel, refunds, flights, "est.", home airport or missing emails.
- **Fix.** Rewrite to 12 to 16 questions in four task groups (Prices; Planning; Passes and billing; Account and privacy), every figure interpolated, no counts, no method sentences, a jump row or search at the top, an anchor per answer, "Send feedback" as the foot. Fix `account.shareText` and `account.inviteBody` in the same pass.
- **Command.** `/impeccable clarify`, then `/impeccable distill`.

### P2. The hub's grouping and surface do not match Carta or the other tabs
- **Why.** Grey cards on a grey page (the shell redefines `--bg-card` to `--paper-dim`, against Lagoon's white surfaces on warm grey, while Explore and Destinations show white kit tiles); a hairline under every section plus a border round every object; brown tints on the avatar disc and invite banner (carta-design: brown only for what acts, is live or is selected); two unlabelled menus; Sign out two levels down; Friends twice; no home airport or travellers; no h1 on the desktop hub; the profile card shows the monogram even after an emoji avatar is chosen (`monogram()` on the hub, `avatarEmoji` only on Profile).
- **Fix.** The grouped hub sketched under Information architecture: white `--surface` objects on `--surface-page`, hairlines inside groups and no second divider, 12 px group labels on every group, kit Card, Button and choice chips in place of `auth-submit`, `book-btn` and `admin-tone-opt`, a visible h1 ("Account") at every width, neutral avatar disc showing the chosen emoji, Sign out last, legal as one row of links, "Where the numbers come from" removed with its credits moved to the legal page.
- **Command.** `/impeccable distill`, then `/impeccable polish`.

## Persona red flags

**Casey, on a phone, one thumb, distracted.**
- The signed-in hub runs about three screens at 390 px; the language tiles alone take a third of one.
- The Send button sits right under the textarea and is a paler brown when disabled, so it reads as live; the three feedback kinds wrap two plus one at 360 px.
- Legal text opens in a full-height dialog at 12.5 px with no contents; finding "Refunds" in 3,327 words means scrolling.
- Sign out needs Account, then Sign-in and security, then scrolling below the password form.

**Jordan, first time, guest.**
- The page is titled twice ("Account" over "Preferences").
- The first caption is the stock "Sign in to save trips and sync your settings across devices."
- Menu rows "Imprint" and "Where the numbers come from" mean nothing yet.
- The first FAQ answer opens with a catalogue count.
- Sharing Carta tells friends it prices flights, which the first destination page then contradicts.

**A privacy-minded traveller.**
- The privacy policy is the hardest page in the app to read.
- The controller is not identified: the Imprint shows "[Awaiting T015...]" placeholders, and the only contact is a personal Gmail.
- Feedback silently attaches path, viewport, language and user agent.
- The FAQ sends them to the wrong place to delete their account.
- In favour: export and delete are both present, re-authenticated and clearly worded.

**A yearly subscriber who wants to cancel.**
- No cancel control, no billing portal, no invoices, no renewal date.
- The FAQ says the plan is "a one-off payment, not a subscription"; the Terms promise a "Cancel yearly plan" button that is not there.
- The only route left is emailing a private address, or disputing the charge with the bank.

## Minor observations

- Disabled primary is a paler brown (`Send`, `Update password`); the kit's disabled state is `--surface-sunken` with `--text-3`.
- Feedback kind uses `admin-tone-opt` pills with no visible group label (aria-label only); the kit's choice ChipGroup or Segmented fits.
- `.account-feedback-input:focus { outline: none }` swaps the ring for a border and a darker fill, unlike every other Field.
- Icons repeat with different meanings: Shield for Privacy and Terms, Info for Imprint and credits, Lock for Security and Admin.
- Literal values outside tokens: font sizes 11, 12.5, 13.5, 15 px; radii 2, 4, 6 px; `transition: transform .15s` on the FAQ chevron; `.side-navrow` transitions `.15s` and a hover outside `@media (hover: hover)`.
- Pass figures still set in `var(--mono)` (an alias now, but the rule is retired).
- Desktop rail rows are each bordered and filled, eleven boxes stacked; Destinations' side panel uses tiles only for its six sections and plain rows below.
- The rail label "Where the numbers come f..." truncates at 216 px.
- The privacy link on the entry gate is 11 px in `--ink-mute`.
- iPad 820 px: the shell header wraps to two rows and the search field shows "Searc" (shell's issue, not Account's; note for the shell owner).
- `account.faq6A` mentions "the cheap-to-pricey gauge" and `account.faq7A` "the full breakdown"; check both still exist on the page after T437 and T438 before keeping them.
- `account.faq10A` promises PDF, calendar and map exports without saying they are pass features (`pass.addExports`).
