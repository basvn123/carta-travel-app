# T461 critique, Assessment B (before): detector and evidence

Surface: the Account area. `continent-app/src/auth/AccountPanel.jsx`, `FriendsSpoke.jsx`, `AuthModal.jsx`, `AuthGate.jsx`; `src/components/PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Imprint.jsx`; `src/lib/feedback.js`; CSS `src/styles/16-auth.css`, `22-account-admin.css`, `69-v6-account.css`.

Baseline: app commit `09f27e5` (Merge p11-pass, T460). Run 2026-10-16, about 22:20 to 22:50. Evidence only; the scoring is in `audit-before.md`.

## How the before state was pinned

Another session was rebuilding the Account area while this ran. When this started, the app repo had four files modified (one import line each, the contact address moved to `src/lib/contact.js`). By the time of the browser pass it had 16 modified files, a new `src/auth/account/` folder and a new `src/components/LegalDoc.jsx`, and the dev server on port 4260 was already serving the rebuild (15 FAQ items in new groups, a "Share Carta" rail row). So:

- Every file in scope was read from `git show 09f27e5:<path>` into `scratchpad/t461-before/`. All static findings cite line numbers in those copies, which match HEAD `09f27e5`.
- The lint meter was run twice: on the working tree (when only the four one-line edits existed) and on a scratch root built from the 09f27e5 copies (`--root`). The numbers are identical.
- For the browser facts I did not use port 4260. I exported `src/`, `index.html` and `package.json` at 09f27e5 into `scratchpad/before-app/`, junctioned the app's `node_modules`, and served it with Vite on port 4291 with `publicDir` and `envDir` pointing at the live app. A fetch of `/src/components/Imprint.jsx` from that server still carried the old address, which confirms it served the 09f27e5 source. The server was stopped afterwards.
- The screenshots in `Execution/P11/T461-shots/before/` and `measure-before.json` were taken at 21:04, before T460 was committed at 22:19. T460 changed only `TermsOfService.jsx` (date and pass wording) and `69-v6-account.css` (pass rules) among the files in scope. So the shots are a fair before for everything except the terms text: they show "Last updated 7 October 2026", where 09f27e5 says 16 October.

## 1. Impeccable detector CLI

Command, from the repo root: `"C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable.cmd" detect --json <file>`, on each scratch copy. I also ran `--no-config` on AccountPanel.jsx and 22-account-admin.css.

| File | Exit | Findings |
|---|---|---|
| AccountPanel.jsx | 0 | `[]` |
| FriendsSpoke.jsx | 0 | `[]` |
| AuthModal.jsx | 0 | `[]` |
| AuthGate.jsx | 0 | `[]` |
| PrivacyPolicy.jsx | 0 | `[]` |
| TermsOfService.jsx | 0 | `[]` |
| Imprint.jsx | 0 | `[]` |
| feedback.js | 0 | `[]` |
| 16-auth.css | 0 | `[]` |
| 22-account-admin.css | 0 | `[]` |
| 69-v6-account.css | 0 | `[]` |

Control tests in `scratchpad/ctl/`:

- An HTML file with gradient text, 9 px uppercase tracked text, `#000` and a purple gradient: **found** `gradient-text` and `undersized-ui-text`.
- A JSX file with the same content as inline styles and Tailwind classes: **found** `gradient-text` and `ai-color-palette`.
- A plain CSS file with `font-size: 9px; color: #000; linear-gradient(...)`: `[]`.

So the detector works, but it does not read standalone CSS files. On JSX it reads only inline styles and utility classes. These components use class names and stylesheets, so a clean result says nothing about them. Every finding below comes from the meter, from reading the code, or from the browser.

## 2. Project lint meter (`scripts/ci/design-lint.mjs --meter`, read only)

Run from `continent-app/`. `--update-baseline` was not run.

| Meter | raw-button | font-size | radius | legacy-token | money |
|---|---|---|---|---|---|
| `AccountPanel` | 30 | 0 | 0 | 0 | 0 |
| `FriendsSpoke` | 13 | 0 | 0 | 0 | 0 |
| `AuthModal` | 7 | 0 | 0 | 0 | 0 |
| `PrivacyPolicy` | 1 | 0 | 0 | 0 | 0 |
| `TermsOfService` | 1 | 0 | 0 | 0 | 0 |
| `Imprint` | 1 | 0 | 0 | 0 | 0 |
| `16-auth` | 0 | 27 | 11 | 74 | 0 |
| `22-account` (whole file) | 0 | 134 | 58 | 346 | 0 |
| `69-v6` | 0 | 11 | 7 | 43 | 0 |

Not in the requested list: `AuthGate.jsx` has 4 raw buttons. The ten JSX and CSS files together hold **57 raw buttons, 172 font-size literals, 76 radius literals and 463 legacy-token reads**.

Running every lint rule on the scratch root with an empty baseline finds 770 violations. Besides the meter rules, the only one is `outline-none` ×2, both in the admin half of 22-account-admin.css. There were no em dashes, middots, hex literals in JS, font literals or `€` in these files.

`22-account-admin.css` is two files in one. Lines 1 to 272 are the account hub; line 273 onward is the admin back office, site notice and trails nearby. Split by line:

| Region | font-size | radius | legacy-token |
|---|---|---|---|
| Account hub (lines 1 to 272) | 15 | 7 | 48 |
| Admin and other (273 onward) | 119 | 51 | 298 |

`69-v6-account.css` also carries My trips rules. Its 43 legacy reads cover both surfaces.

None of the seven JSX files imports anything from `src/components/ui/` (the kit). Every control is a raw `<button>` with a local class.

## 3. Static checks

### Text under the floors (11 px functional, 12 px for figures)

Every px font-size under 12 in the account-relevant CSS:

| File:line | Size | What | Floor broken |
|---|---|---|---|
| 16-auth.css:276 | 11px | `.privacy-updated`, "Last updated 3 October 2026" | a date figure under 12 |
| 16-auth.css:264 | 11px | `.auth-divider`, "or with email" | at the floor |
| 16-auth.css:274 | 11px | `.auth-gate-privacy`, the gate's privacy link | at the floor; a link |
| 16-auth.css:289, 306, 315 | 10.5px, 10px, 11.5px | `.cheap-tip-*` | 10 and 10.5 are under 11, but no JSX in `src/` renders `cheap-tip` (dead CSS) |
| 69-v6-account.css:48 | 11px | `.saved-cat small` count chip | My trips, not Account |
| 69-v6-account.css:320 | 11.5px | `.adminpage-sparkfig` | admin figures under 12 |

Other sizes off the type scale on reading surfaces: `.privacy-body` 12.5px, `.privacy-body h3` 12px (smaller than the body it heads), `.privacy-table` 12px, `.account-faq-a` 13.5px, `.account-profile-meta span` 12.5px, `.account-credits li` 12.5px, `.account-invite-btn` 13.5px, `.auth-submit` 13.5px, and `.side-navrow` 12.5px (25-feature-pages.css:98).

### Literals and legacy tokens

- Legacy aliases throughout: `--paper`, `--paper-dim`, `--ink`, `--ink-soft`, `--ink-mute`, `--rule`, `--rule-soft`, `--accent`, `--accent-bg`, `--on-fill`, `--bg-card`, `--shadow-2`, `--display`, `--mono` (counts above). They resolve correctly through 01-tokens.css.
- **Undefined tokens**: `var(--stroke)` and `var(--stroke-soft)` at 16-auth.css:283 to 284 (the privacy table's rules). Neither exists in any stylesheet. In the browser the table cells compute `border-bottom: none 0px`, so the legal-basis table renders with no row rules.
- **Invented brown tints** (carta-design "No new tints"): `color-mix(in srgb, var(--accent) 14%/30%, var(--paper))` on the monogram disc (22-account-admin.css:43 to 45), `7%`/`32%` on the invite banner (122 to 124), `55%` on the invite button's edge (146).
- **Cards are sunken grey**: `.saved-shell, .account-shell { --bg-card: var(--paper-dim); }` (69-v6-account.css:330) turns every card on the page (profile, menu, pass, sign-in) into `--surface-sunken` on `--surface-page`. The screenshots show grey cards on a grey ground.
- Radii in use on this surface: 4, 6, 10, 12 px literals plus `--radius-sheet` from the shell.

### Buttons and primaries in code

- One accent primary per view holds on the hub (Sign in, or See passes), on Profile (Save changes), on Security (Update password) and on Feedback (Send).
- **Disabled primary**: `.auth-submit:disabled { opacity: 0.55 }` (16-auth.css:242). The browser shows the disabled Send as the brown fill at 0.55 with white text, which composites to rgb(188,160,133) under white text at 2.38:1. carta-design says disabled is a sunken ground with `--text-3`, never a paler live button.
- **`.book-btn` hover**: `.book-btn { background: var(--surface); color: var(--action) }` and `.book-btn:hover { background: var(--accent) }` (14-filters-panels.css:620 to 634). `--accent` is an alias of `--action`. Probed on the 09f27e5 server at 1440 px: at rest rgb(255,255,255) on rgb(140,90,43) text; on hover the background is **rgb(140,90,43) and the text rgb(140,90,43)**, so the label disappears. In the Account area this is the "Send reset link" confirm (AccountPanel.jsx:1175) and the export confirm "Download" (1335).
- Admin classes on traveller surfaces: the feedback kind picker is `admin-tone`/`admin-tone-opt` (AccountPanel.jsx:1478, 1486) and "Send another" is `admin-btn-secondary` (1467). Both are styled in the admin section of 22-account-admin.css (line 312 onward).

### Dialog semantics of the legal modals

| Check | PrivacyPolicy | TermsOfService | Imprint |
|---|---|---|---|
| `role="dialog"` | yes (line 32) | yes (68) | yes (45) |
| `aria-modal="true"` | yes | yes | yes |
| `aria-labelledby` points at its h2 | `legal-privacy-title` | `legal-terms-title` | `legal-imprint-title` |
| Focus trap (`useFocusTrap`), Escape, return focus | yes, focus starts on the close | yes | yes |
| Exit motion (`useDialogExit`), reduced-motion branch | yes (60-v6-shell.css:489) | yes | yes |
| Close control | `shell-close`, CloseIcon 16 in a 44 box, translated label | same | same |
| Headings | h2 title, 6 h3 | h2 title, 19 h3 | h2 title, 3 h3 |
| Language | English only, by decision (TermsOfService.jsx comment lines 12 to 15) | same | same |

The semantics hold. The layout does not:

- **The close scrolls away.** `.privacy-modal { max-height: 84dvh; overflow-y: auto; }` (16-auth.css:275) is beaten by `.auth-modal { max-height: none; }` (69-v6-account.css:357). Both are single-class selectors and 69 loads later. So the modal grows to its full height and the overlay scrolls instead. The "sticky" close (60-v6-shell.css:481 to 488) sticks inside `.privacy-modal`, which never scrolls, so it travels up with the content. Measured on the 09f27e5 server:

| Dialog | Viewport | Overlay scroll height | Close top after scrolling to the end |
|---|---|---|---|
| Terms | 390 x 844 | 8,810 px (10.4 screens) | -7,909 px (off screen) |
| Terms | 1440 x 900 | 7,890 px | -6,933 px |
| Privacy | 390 x 844 | 4,000 px | -3,099 px |
| Privacy | 1440 x 900 | 3,604 px | -2,647 px |
| Imprint | both | fits | stays in view |

  Escape and a tap on the scrim still close it. A touch reader at the end of the terms sees no close control.
- **Border and shadow together.** The modal computes `1px solid` border (from `.auth-modal`, 16-auth.css:141) plus `--elev-3` (from `.shell-dialog`). carta-design "Never do this" 3.
- **Width and type.** The legal text is 342 px wide on a phone and **380 px at 1440** (text column 280 px and 318 px). Body 12.5px/20px in `--text-2` (7.47:1, fine), h3 12px, date 11px. At 1440 the terms are a 318 px column of 3,352 words.

AuthModal (sign in) is a dialog with `role`, `aria-modal`, `aria-labelledby` and a focus trap (AuthModal.jsx:21, 101). It is not in the dialog family, though: no `shell-scrim`/`shell-dialog`, no `useDialogExit`, a 12px radius, and `--shadow-2` with a border. Its Sign in / Create account switch is two buttons whose state is a class only (`seg-on`, lines 112 to 127): no `role="tab"`/`aria-selected` or `aria-pressed`. Errors show in one `role="alert"` block that is not tied to a field.

AuthGate is a full-screen takeover, not a dialog (no role, no trap), titled with an h2 and no h1 (AuthGate.jsx:18 to 25). It opens PrivacyPolicy inside itself.

### Heading order

| View | Headings at 09f27e5 (browser, 09f27e5 server) |
|---|---|
| Hub, signed in, phone 390 | h1 "Account" at **12px** (the panel-tag, AccountPanel.jsx:817), then h2 "Your trip settings", "Language", "Your pass", all 12px |
| Hub, signed in, iPad 820 and desktop 1440 | h1 "Account" **hidden** (`.account-shell .panel-tag { display: none }`, 25-feature-pages.css:72), so **no h1 in the accessibility tree**, then the same three h2 |
| Hub, guest | the "Account" tag is a div and h1 is "Preferences" (AccountPanel.jsx:749, 816 to 823) |
| Profile, Security, Your data | h1 = the view name; the sections below are `div.section-title`, not headings (5 in AccountPanel, 6 in FriendsSpoke) |
| FAQ | h1 "Common questions", 4 h2 group labels at 12px, the questions are buttons |
| Feedback | h1 "Send feedback" only |
| Legal dialogs | h2, then h3 |

The invite card's title is a `<b>`, not a heading (AccountPanel.jsx:930).

### The personal email address

`git grep gmail 09f27e5 -- src` finds four copies of the same constant:

| File:line | Where it surfaces |
|---|---|
| AccountPanel.jsx:104 | the mailto fallback (714) and printed on screen in the feedback note (1513, `account.feedbackNote`, "addressed to {email}") |
| PrivacyPolicy.jsx:20 | mailto link in "Retention and deletion" (148) |
| TermsOfService.jsx:56 | mailto link in "Contact" (507) |
| Imprint.jsx:21 | "Contact:" mailto (66) |

The address appears nowhere else in the app repo at 09f27e5. In the browser at 390, 820 and 1440, the feedback view prints it in full in the note under Send.

### The mailto fallback in feedback

`handleSendFeedback` (AccountPanel.jsx:717 to 733) calls `sendFeedback` (feedback.js:36). On **any** error other than `too_many`, it calls `mailtoFeedback()` (711 to 715), which sets `window.location.href` to a `mailto:` to the personal address. That covers `auth_not_configured`, a network failure, an RPC error or a missing migration. There is no message in the panel before or after. With no mail client configured, nothing visible happens: the button re-enables and the text stays. With one, the traveller leaves the app for their mail client. `feedback.js` itself has no fallback; its header comment says the mailto was retired, but the panel kept it.

### FAQ structure

14 questions in 4 groups (AccountPanel.jsx:116 to 137; keys faq1 and faq3 to faq15, faq2 removed). Answer word counts from `en.js` at 09f27e5:

| Group | Question | Words |
|---|---|---|
| What Carta is | What does Carta do? | 55 |
| | Can I book through Carta? | 33 |
| | Why is my town not in Carta? | 52 |
| The numbers | What is the price a day made of? | 71 |
| | Why did the prices move when I changed Lifestyle? | 69 |
| | How is the rating built? | 63 |
| | How accurate are the prices? | 102 |
| Planning a trip | Do I have to work out the route myself? | 54 |
| | What does the Carta bot do? | 56 |
| | Can I share a trip with someone who has no account? | 31 |
| Your account | Do I need an account? | 37 |
| | Where do my saved trips live? | 29 |
| | What does a pass add? | 66 |
| | How do I remove my data? | 23 |
| **Total** | 14 answers | **741** (mean 53, max 102) |

One answer open at a time; each question is a full-width button (48 px tall in the browser), `aria-expanded`, answer 13.5px. The answers do not have `id`/`aria-controls`.

Content facts in the answers, checked against the code at 09f27e5:

- `account.faq13A`: the Trip Pass gives its plans "over 30 days", and "Both are a one-off payment, not a subscription". At 09f27e5, `lib/pricing.js` (lines 41 to 45, 112) and the terms say the Trip Pass runs 60 days and the yearly plan is a Stripe subscription that renews until cancelled. **The FAQ contradicts the terms.**
- `account.faq14A`: "Delete account, under profile details." Since T390, deletion lives in the "Your data" spoke (AccountPanel.jsx:1269 to 1395), not Profile.
- `account.faq15A`: "within EUR {accEur} a day" (twice). "EUR" in an i18n string breaks carta-design rule 9. The `money-literal` lint rule only matches `€`, so it does not catch it.
- `account.faq5A`: "the receipt says, for the bed and the food separately, whether the figure was measured in that city or is a country-level one". T438 (owner, 2026-10-13) made the estimate mark the whole pedigree on the page. Verify against the receipt before keeping the sentence.
- `account.faq1A` and `faq4A` hard-code "43 European countries" / "43 countries"; `faq1A` also prints the catalogue count `{n}` (falling back to 3038, AccountPanel.jsx:152).

### "Where the numbers come from" and what depends on it

The view (`view === 'data'`, AccountPanel.jsx:1448 to 1457) is a hint plus a hairline list of `ATTRIBUTIONS` from `src/data/attribution.js` (44 credit lines). Despite its name it holds only licence credits. Its hint (`account.dataHint`) says "the full ledger of what we use lives in the repo", which a traveller cannot open. A separate static page with the same title and the method content is built at `/about/numbers` by `scripts/explainer/numbers.mjs`, and it reads the same `ATTRIBUTIONS`.

What depends on the view, its label or its markup:

| Dependent | What it needs |
|---|---|
| `scripts/verify_account_panel.mjs:236 to 238` | the label "Where the numbers come from" among the help rows |
| `scripts/verify_account_panel.mjs:648 to 649` | navigates to it and reads `.account-credits li` |
| `scripts/verify_admin_panel.mjs:1770 to 1774` | the label in the expected list of account rows |
| `scripts/verify_trails_export.mjs:262 to 294` | `.account-credits li`, checks OpenStreetMap, swisstopo, IGN and others are credited |
| `scripts/explainer/numbers.mjs:12, 48, 71` | reads `ATTRIBUTIONS` directly (not the view); keeps working if the view goes |
| `src/data/attribution.js:17` | `python -m src.ingestion.core.ledger --check-app continent-app/src/data/attribution.js` checks it against `docs/tos/data_licenses.md` |
| Licence terms (ODbL, CC BY credits) | some in-app place must keep printing the credits if the view is removed |

Other scripts that drive Account selectors, which a rebuild will break: `verify_data_export.mjs` (`.account-delete-arm`, `.account-danger-title`, `.account-profile-card`), `verify_friends.mjs` (`.account-panel-close`), `verify_bottom_nav.mjs`, `verify_tab_switching.mjs`, `verify_quality_floor.mjs` (`?legal=terms`, `.account-shell`), `scripts/ci/smoke.mjs` (`?legal=privacy`, `?legal=terms`).

### Where the surface's CSS lives

Selectors starting `.account-`, `.auth-`, `.privacy-`, `.frn-` or `.pw-` appear in **12 stylesheets** at 09f27e5: 10-shell (2), 14-filters-panels (10), 16-auth (70), 17-saved-trips (1), 21-chat-passes (70), 22-account-admin (53), 23-places-pages (62), 24-destination-workspace (30), 25-feature-pages (21), 26-shortlist-extras (2), 60-v6-shell (7), 69-v6-account (54). Later files override earlier ones on the same selectors. Examples: `.account-shell .auth-submit` in 24-destination-workspace.css:4170, `.account-shell .panel-tag { display: none }` in 25-feature-pages.css:72, `.auth-modal { max-height: none }` in 69-v6-account.css:357.

### Bundle

`App.jsx` imports `AuthModal`, `AccountPanel` and `LegalFromUrl` statically (lines 98, 102, 107). `LegalFromUrl` imports all three legal texts. `PassModal` imports `TermsOfService` too. My trips and Guides are lazy (lines 84, 105). By source size, about 44 KB of legal JSX (12.3 + 28.3 + 3.9 KB) and 94 KB of AccountPanel plus FriendsSpoke load with the first screen. No `dist/` was present to measure the built chunk.

## 4. Browser facts

### From `measure-before.json` (account scenes, 21:04, the shoot script)

The script counts controls and words inside `.account-panel`, `.privacy-modal` and the other roots. The desktop and iPad side rail (`.account-side`) sits outside `.account-panel`, so **its rows were not measured** for size. Primaries means a visible control whose background equals `--action`.

| Scene | View | Words, first screen | Primaries | Small targets | H-scroll |
|---|---|---|---|---|---|
| account-guest | p360 | 29 | Sign in | 0 | no |
| | phone 390 | 53 | Sign in | 0 | no |
| | ipad 820 | 52 | Sign in | 0 | no |
| | desk 1440 | 52 | Sign in | 0 | no |
| account-hub | p360 | 30 | See passes | 0 | no |
| | phone | 52 | See passes | 0 | no |
| | ipad | 53 | See passes | 0 | no |
| | desk | 53 | See passes | 0 | no |
| account-faq | p360 | 77 | none | 0 | no |
| | phone | 94 | none | 0 | no |
| | ipad | 136 | none | 0 | no |
| | desk | 106 | none | 0 | no |
| account-feedback | p360 | 59 | Send | 0 | no |
| | phone | 59 | Send | 0 | no |
| | ipad | 58 | Send | 0 | no |
| | desk | 58 | Send | 0 | no |
| account-privacy (`?legal=privacy`) | p360 | 310 | none | 0 | no |
| | phone | 310 | none | 0 | no |
| | ipad | 507 | none | 0 | no |
| | desk | 310 | none | 0 | no |
| account-terms (`?legal=terms`) | p360 | 257 | none | 0 | no |
| | phone | 309 | none | 0 | no |
| | ipad | 474 | none | 0 | no |
| | desk | 331 | none | 0 | no |

No console errors were recorded. "Send" counts as a primary while disabled, because the fill is still `--action` (at 0.55 opacity).

### From my probe on the 09f27e5 server (port 4291)

| Fact | 390 x 844 (touch) | 820 x 1180 (touch) | 1440 x 900 |
|---|---|---|---|
| Visible h1 on the signed-in hub | "Account", 12px | **none** (hidden) | **none** (hidden) |
| Side rail rows | no rail | **11 rows at 181 x 36 px on a coarse pointer** | 11 rows at 217 x 36 px (fine pointer, allowed) |
| Rail label truncated | n/a | "Where the numbers come from" ellipsised (screenshot) | same (screenshot: "Where the numbers come f...") |
| Hub controls | menu rows 52, language tiles 44, See passes 44, Share Carta 44 | same | Share Carta 40 (fine pointer) |
| Feedback textarea font | **14px** (iOS zooms on focus under 16) | 14px | 14px |
| Feedback kind chips | 44 | 44 | 36 (fine pointer) |
| Disabled Send | rgb(140,90,43) at opacity 0.55, white text | same | same |
| Feedback note | prints the personal gmail address | same | same |
| FAQ | 14 questions, 48 px rows, answers 13.5px | same | same |
| Horizontal scroll | no | no | no |

Legal dialog geometry is in the table under "Dialog semantics" above. The Imprint dialog shows **six "[Awaiting T015: ...]" placeholders** to the public at both widths (legal name, street, postal code, city, country, enterprise number). Its headings "Business Information" and "Regulatory Notice" are in title case.

### From the screenshots

- Phone hub (`before-account-hub-phone-full.jpg`): the first screen is "Account" (small grey label), the profile card, Lifestyle, the six-tile language grid and the pass card with the one brown primary. The invite card, Friends, Security, Your data and the seven help rows are below the fold. The header's "Get a pass" and the pass card's "See passes" open the same thing on the same screen.
- Desktop hub (`before-account-hub-desk.jpg`): an 808 px content column with no title. The rail carries 11 doors as grey filled tiles, and the selected Overview is tint plus brown edge. The invite card is the brown-tinted box at the bottom.
- Guest phone: an h1 "Preferences" under the "Account" label. The sign-in card holds a grey avatar disc, one sentence and the primary.
- Feedback phone: three kind chips wrap to two lines at 390 px. The disabled Send is a pale brown bar. The hint and the note say the same thing twice ("lands directly with the person who builds Carta", "goes straight to the person who builds Carta").
- Privacy and terms (phone and desktop): the dialog over a dimmed Destinations page, a brown focus ring on the close (focus starts there), a 12.5px column. At 1440 the column takes about a quarter of the width.

## 5. What this pass could not see

- The detector found nothing because it cannot read this code's styling. That is a blind spot, not a clean bill.
- Profile, Security, Your data and Friends were not shot or probed in the browser. Their findings are from code.
- AuthModal and AuthGate were read, not driven.
- No screen reader was run; the accessibility tree statements come from `display: none` and DOM queries.
