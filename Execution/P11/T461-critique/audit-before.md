# T461 Account: technical audit, before the rebuild

I ran this audit on 2026-10-16 against app commit `09f27e5` (Merge p11-pass, T460), following `impeccable/reference/audit.md`. It was read only: no source was edited.

**How the before state was pinned.** Another session was rebuilding the Account area in the working tree at the same time, so the working tree could not stand in for the baseline. All code was read from `git show 09f27e5`. The browser checks ran on a scratch Vite server built from the 09f27e5 source (port 4291, the live `public/` and `.env`). The shared screenshots in `Execution/P11/T461-shots/before/` were taken at 21:04, before T460 was committed. Among the files in scope, T460 changed only the terms text and some pass CSS. Full evidence is in `assessment-b-before.md`.

**Scope.** JSX: `src/auth/AccountPanel.jsx`, `FriendsSpoke.jsx`, `AuthModal.jsx`, `AuthGate.jsx`, `src/components/PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Imprint.jsx`. JS: `src/lib/feedback.js`. CSS: `src/styles/16-auth.css`, `22-account-admin.css` (lines 1 to 272 are Account), `69-v6-account.css`. A finding that lives in another stylesheet names that file. The surface's CSS is spread across 12 files.

**Measured against.** carta-design SKILL.md: 44 px targets on a coarse pointer, nothing functional under 11 px, figures 12 px or more, one h1 per view with headings in order, inputs at 16 px, the dialog family, one primary per view, disabled drawn as sunken, border or shadow but not both, no new tints, no EUR in strings. Also PRODUCT.md accessibility constraints and the DESIGN.md tokens.

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | No h1 on the hub at 769 px and up. The legal dialogs' close scrolls off screen (8,810 px of terms on a phone). |
| 2 | Performance | 3 | The legal texts (about 44 KB of JSX) and the whole Account panel load in the entry bundle. Nothing expensive at runtime. |
| 3 | Responsive design | 2 | No horizontal scroll at 360 to 1440 px, but the iPad rail rows are 36 px on touch, the feedback box is 14 px (iOS zoom), and the legal text is a 318 px column at 1440. |
| 4 | Theming | 2 | 463 legacy-token reads, two undefined tokens, invented brown tints, cards filled sunken grey, and a dialog with both a border and a shadow. |
| 5 | Implementation integrity | 1 | No kit components and 57 raw buttons. The CSS is an override chain across 12 files. A personal address is hard-coded 4 times. The Imprint ships placeholders. The FAQ contradicts the terms. A hover makes a button's label vanish. |
| **Total** | | **10/20** | **Acceptable (significant work needed)** |

## Implementation integrity verdict

**Fail.** The Account area does not express the Lagoon system. It expresses the system the app had before Lagoon, re-skinned through aliases and then patched by later stylesheets. The evidence:

- Not one of the seven JSX files imports from `src/components/ui/`. The design-lint meter counts 57 raw `<button>` elements: AccountPanel 30, FriendsSpoke 13, AuthModal 7, AuthGate 4, and 1 in each legal text. The three CSS files carry 172 px font sizes, 76 px radii and 463 legacy-token reads.
- Twelve stylesheets style this surface. Later ones override earlier ones on the same selectors, and two of those overrides cause the defects below. `.auth-modal { max-height: none }` in 69-v6 un-scrolls the legal dialogs. `.account-shell .panel-tag { display: none }` in 25-feature-pages hides the only h1.
- The surface states things that are not true. The FAQ says passes are one-off and last 30 days; the terms and `lib/pricing.js` say 60 days and a renewing yearly plan. The FAQ points to the wrong place for deleting an account. A view titled "Where the numbers come from" holds only licence credits. The statutory Imprint shows "[Awaiting T015: ...]" to anyone who opens it.
- The traveller's feedback form is built from back-office classes (`admin-tone`, `admin-btn-secondary`).

The impeccable detector returned `[]` for all eleven files. That is a blind spot, not a pass: a control CSS file full of violations also returned `[]`. The detector reads only inline styles and utility classes in JSX, and these components use stylesheets. Every finding below was verified in code, and where marked, in the browser.

## Executive summary

- Audit health score: **10/20 (Acceptable)**
- Issues: **P0 0, P1 7, P2 15, P3 5**
- Top issues:
  1. The legal dialogs lose their close once you scroll: the terms run 7,890 to 8,810 px with the close at -7,909 px.
  2. A personal gmail address is hard-coded in four files. It is printed in the feedback note, and every feedback failure silently redirects the traveller to it by mailto.
  3. The Imprint shows six "[Awaiting T015]" placeholders publicly.
  4. The FAQ contradicts the terms on what a pass is (30 days, "not a subscription").
  5. The signed-in hub has no h1 from 769 px up.
- Recommended next steps: `harden` the legal dialogs, the feedback path and the address first. Then `clarify` the FAQ and the data view, rebuild the surface on the kit (`polish`), and `typeset` the legal pages.

## Detailed findings by severity

### P1 Major

**[P1] The legal dialogs' close scrolls out of view**
- **Location:** 16-auth.css:275 (`.privacy-modal { max-height: 84dvh; overflow-y: auto }`), overridden by 69-v6-account.css:357 (`.auth-modal { max-height: none }`). The sticky close is at 60-v6-shell.css:481 to 488. Affects PrivacyPolicy.jsx, TermsOfService.jsx, and through them `?legal=` and the pass modal's terms link.
- **Category:** Accessibility / Responsive
- **Impact:** The modal grows to full height and the overlay scrolls instead, so the sticky close never sticks. Browser measurements:
  - Terms at 390 x 844: an overlay of 8,810 px, close at -7,909 px after scrolling to the end.
  - Terms at 1440: 7,890 px, close at -6,933 px.
  - Privacy: 4,000 px and 3,604 px.

  A touch reader who has scrolled has no visible way out. Escape and the 24 px scrim gutter still work, but are not discoverable on a phone. `?legal=terms` is the address Stripe Checkout links to.
- **Standard:** carta-design "Dialog family" (one close control). WCAG 2.4.3 and 3.2 (predictable navigation) in spirit.
- **Recommendation:** Make the legal text a page, or a dialog whose body scrolls under a fixed head. Do not let one max-height rule fight another across two files.
- **Suggested command:** `$impeccable harden`

**[P1] A personal email address is hard-coded and published, and feedback failures redirect to it**
- **Location:** The constant is at AccountPanel.jsx:104, PrivacyPolicy.jsx:20, TermsOfService.jsx:56 and Imprint.jsx:21. It is rendered at AccountPanel.jsx:1513 (`account.feedbackNote`), PrivacyPolicy.jsx:148, TermsOfService.jsx:507 and Imprint.jsx:66. The fallback is at AccountPanel.jsx:711 to 733.
- **Category:** Implementation integrity
- **Impact:**
  - The owner's private address is shown to every traveller who opens Feedback, at every width (verified in the browser), and in all three legal texts.
  - `handleSendFeedback` sends the traveller to a `mailto:` on any error except `too_many`. That includes an unconfigured client, a network failure or a missing migration, with no message in the panel. With no mail client, the press does nothing visible. With one, the traveller leaves the app.
  - `feedback.js` (header comment) says the mailto was retired; the panel kept it.
- **Recommendation:** One contact constant for a role address. On a failed send, keep the text and show one sentence saying it did not go and what to do. No silent navigation.
- **Suggested command:** `$impeccable harden`

**[P1] The Imprint ships placeholder text publicly**
- **Location:** Imprint.jsx:25 to 33 (the `ENTITY` constant), rendered at 57 to 71.
- **Category:** Implementation integrity
- **Impact:** In the browser, the statutory page shows six "[Awaiting T015: ...]" strings (legal name, street, postal code, city, country, enterprise number) at both widths. The terms tell readers to go there for the provider's identity. Its headings ("Business Information", "Regulatory Notice") also break sentence case.
- **Standard:** EU e-Commerce Directive Art 5 (the component's own docblock).
- **Recommendation:** This is an owner step (T015). Until the details exist, the page should say plainly who to contact, not show bracketed task notes.
- **Suggested command:** `$impeccable clarify`

**[P1] No h1 on the signed-in hub from 769 px up**
- **Location:** AccountPanel.jsx:813 to 823. When signed in, the h1 is the `panel-tag` "Account". 25-feature-pages.css:72 (`.account-shell .panel-tag { display: none }`) removes it.
- **Category:** Accessibility
- **Impact:** On the iPad (820) and desktop (1440) hub, the accessibility tree has three h2 and no h1 (verified). On a phone the h1 is a 12 px label, the same size as the h2 under it. Signed out, the h1 becomes "Preferences" for the same view.
- **Standard:** carta-design "Quality floor" (one h1 per view, headings in order). WCAG 1.3.1 and 2.4.6.
- **Recommendation:** One visible h1 naming the page at every width, the same word signed in or out.
- **Suggested command:** `$impeccable typeset`

**[P1] A button's label vanishes on hover**
- **Location:** 14-filters-panels.css:620 to 634 (`.book-btn` is `--action` text on `--surface`; `:hover` sets the background to `--accent`, an alias of `--action`). In Account: AccountPanel.jsx:1175 (send reset link) and 1335 (confirm data export).
- **Category:** Accessibility / Theming
- **Impact:** At 1440 px in the browser, the hover state was text rgb(140,90,43) on background rgb(140,90,43). The label is invisible exactly when the pointer is on it, on the two confirms that send a reset mail and download the account.
- **Standard:** WCAG 1.4.3 (contrast, the hover state).
- **Recommendation:** Use the kit Button: primary or secondary, with a defined hover.
- **Suggested command:** `$impeccable polish`

**[P1] The FAQ contradicts the terms and the app**
- **Location:** `src/i18n/en.js` at 09f27e5:
  - `account.faq13A`: "over 30 days", "Both are a one-off payment, not a subscription". `lib/pricing.js` lines 41 to 45 and 112 and the terms say the Trip Pass runs 60 days and the yearly plan renews.
  - `account.faq14A`: "Delete account, under profile details". Deletion moved to "Your data" (AccountPanel.jsx:1269).
- **Category:** Implementation integrity (content truth)
- **Impact:** Carta's only asset is trust in what it says. A traveller who reads the FAQ before buying is told the opposite of the contract they then accept.
- **Recommendation:** Answers that state a pass fact should read it from `lib/pricing.js` the way the prices already do. Re-check every answer against the shipped behaviour (see also faq5A in P2).
- **Suggested command:** `$impeccable clarify`

**[P1] The legal texts are set too small and too narrow to read**
- **Location:** 16-auth.css:137 to 146 (`.auth-modal` at most 380 px wide, 30 px padding), 276 to 284 (`.privacy-updated` 11px, `.privacy-body` 12.5px/1.6 in `--text-2`, `.privacy-body h3` 12px, `.privacy-table` 12px).
- **Category:** Responsive / Accessibility
- **Impact:**
  - About 4,700 words of legal text (terms 3,352, privacy 1,245, imprint 91) are set in a column 280 px wide on a phone and **318 px wide at 1440 px**.
  - Section headings at 12 px are smaller than the 12.5 px text they head, and the date (a figure) is at 11 px.
  - At 1440 the terms are 7,890 px of a quarter-width column.
  - Contrast is fine (7.47:1).

  I rated this P1 rather than P2 because the terms carry the withdrawal waiver a buyer consents to at checkout.
- **Standard:** carta-design type scale (body 14, figures at least 12) and `--measure` 68ch for prose.
- **Recommendation:** Set the legal texts as a reading page on the type scale (body `--text-body`, headings `--text-title`/`--text-lead`), capped at `--measure`.
- **Suggested command:** `$impeccable typeset`

### P2 Minor

**[P2] A disabled primary is drawn as a paler live button**
- **Location:** 16-auth.css:242 (`.auth-submit:disabled { opacity: 0.55 }`), on Send, Save changes and Update password.
- **Category:** Theming / Accessibility
- **Impact:** In the browser, the disabled Send is the brown fill at 0.55 opacity, so the white label sits at 2.38:1 and still reads as a button you can press. (WCAG exempts disabled controls, but the kit rule does not.)
- **Standard:** carta-design Kit, Button (disabled is a sunken ground with `--text-3`).
- **Recommendation:** Use the kit Button's disabled state.
- **Suggested command:** `$impeccable polish`

**[P2] The feedback box is 14 px, so iOS zooms on focus**
- **Location:** 22-account-admin.css:252 (`.account-feedback-input { font-size: 14px }`).
- **Category:** Responsive
- **Impact:** Verified at 390, 820 and 1440: the computed size is 14px. On iOS, focusing it zooms the page.
- **Standard:** carta-design Type ("Inputs are 16 px so iOS does not zoom").
- **Recommendation:** Use the kit Field at `--text-lead`.
- **Suggested command:** `$impeccable adapt`

**[P2] The iPad rail's targets are 36 px on a touch screen**
- **Location:** 25-feature-pages.css:88 to 101 (`.side-navrow` with 9 px padding at 12.5 px). The rail appears from 769 px.
- **Category:** Responsive
- **Impact:** In the browser at 820 x 1180 with touch, there are 11 rows at 181 x 36 px. The shoot script missed this because the rail sits outside `.account-panel`. "Where the numbers come from" is cut off with an ellipsis at 820 and at 1440.
- **Standard:** carta-design Touch (`--tap` on a coarse pointer); "Never do this" 10.
- **Recommendation:** Rail rows at `--tap` under `(pointer: coarse)`, and labels short enough to fit.
- **Suggested command:** `$impeccable adapt`

**[P2] The privacy table's row rules use tokens that do not exist**
- **Location:** 16-auth.css:283 to 284 (`var(--stroke)`, `var(--stroke-soft)`).
- **Category:** Theming
- **Impact:** These are not defined in any stylesheet. In the browser the cells compute `border-bottom: none 0px`, so the legal-basis table has no rules between its rows.
- **Recommendation:** Use `--border` and `--border-soft`.
- **Suggested command:** `$impeccable polish`

**[P2] The legal dialog has both a border and a shadow**
- **Location:** 16-auth.css:141 (`border: 1px solid var(--rule)`) plus `.shell-dialog` `--elev-3` (60-v6-shell.css:449 to 454).
- **Category:** Theming
- **Impact:** The computed style is `1px solid` plus the elev-3 shadow.
- **Standard:** carta-design "Never do this" 3; Elevation.
- **Suggested command:** `$impeccable polish`

**[P2] Account cards are filled in sunken grey**
- **Location:** 69-v6-account.css:330 (`.account-shell { --bg-card: var(--paper-dim) }`). It affects 22-account-admin.css:76, 115 and 164, and the language tiles in 24-destination-workspace.css:4254.
- **Category:** Theming
- **Impact:** Every card, menu and tile on the page is `--surface-sunken` on `--surface-page`. The screenshots show grey on grey, the reverse of Lagoon's white surfaces on a warm grey.
- **Standard:** carta-design Colour (`--surface` for cards; `--surface-sunken` for input fills and quiet bands).
- **Suggested command:** `$impeccable colorize`

**[P2] Brown tints are invented, and brown is spent on decoration**
- **Location:** 22-account-admin.css:43 to 45 (monogram disc at 14% fill, 30% edge, brown initials), 122 to 124 (invite banner at 7% fill, 32% edge), 146 and 157 (the invite button's 55% edge and brown icon).
- **Category:** Theming
- **Impact:** Three tints of the brown exist that are not in DESIGN.md. They sit on a monogram and an invitation, neither of which acts, is live or is selected.
- **Standard:** carta-design "No new tints"; "One action colour"; "Never do this" 2.
- **Suggested command:** `$impeccable quieter`

**[P2] The sign-in dialog is outside the dialog family and its switch exposes no state**
- **Location:** AuthModal.jsx:100 to 127.
- **Category:** Accessibility / Implementation integrity
- **Impact:**
  - It has no `shell-scrim`/`shell-dialog` and no `useDialogExit`, a 12 px radius, and a border plus `--shadow-2`.
  - The Sign in / Create account switch shows its selection with a class only, with no `aria-selected` or `aria-pressed`, so a screen reader cannot tell which form is showing.
  - Errors are not tied to their fields (no `aria-describedby`).
- **Standard:** carta-design Dialog family; Segmented (radio semantics); Field.
- **Suggested command:** `$impeccable harden`

**[P2] "Where the numbers come from" is a list of licence credits**
- **Location:** AccountPanel.jsx:1448 to 1457, `account.menuData`, `account.dataHint`.
- **Category:** Implementation integrity (content truth)
- **Impact:**
  - The title promises a method; the view holds 44 credit lines.
  - The hint sends the reader to "the repo".
  - The same title names the static `/about/numbers` page (`scripts/explainer/numbers.mjs`), which has the method.
- **Constraint for any change:** The credits must stay printed somewhere in the app (licence terms). `verify_account_panel.mjs` (236 to 238, 648 to 649), `verify_admin_panel.mjs` (1770 to 1774) and `verify_trails_export.mjs` (262 to 294) depend on the label and on `.account-credits li`. The ledger check reads `attribution.js`.
- **Suggested command:** `$impeccable clarify`

**[P2] An FAQ string carries "EUR", and an answer may describe retired receipt copy**
- **Location:** `account.faq15A` ("within EUR {accEur}", twice) and `account.faq5A` ("the receipt says ... whether the figure was measured in that city or is a country-level one").
- **Category:** Implementation integrity
- **Impact:** carta-design rule 9 bans EUR in an i18n string. The `money-literal` lint rule only matches `€`, so it passes. faq5A describes provenance copy that T438 removed from pages (the estimate mark is the whole pedigree); confirm against the receipt.
- **Suggested command:** `$impeccable clarify`

**[P2] The traveller's feedback form is built from back-office classes**
- **Location:** AccountPanel.jsx:1467 (`admin-btn-secondary`), 1478 and 1486 (`admin-tone`, `admin-tone-opt`), styled in the admin half of 22-account-admin.css (312 onward).
- **Category:** Implementation integrity
- **Impact:** A change to the admin pages restyles the public feedback form. The kind picker should be a ChipGroup (choice chips with a tick), not admin tone pills.
- **Suggested command:** `$impeccable polish`

**[P2] The legal texts and the Account panel load with the first screen**
- **Location:** App.jsx:98, 102 and 107 (static imports of AuthModal, AccountPanel and LegalFromUrl; LegalFromUrl pulls all three legal texts). PassModal imports TermsOfService.
- **Category:** Performance
- **Impact:** About 44 KB of legal JSX source and 94 KB of AccountPanel plus FriendsSpoke ship in the entry chunk to every visitor, though few ever open them. My trips and Guides are already lazy (App.jsx:84, 105). I did not measure the built size because there was no `dist/`.
- **Suggested command:** `$impeccable optimize`

**[P2] The feedback view says the same thing twice and duplicates the pass door**
- **Location:** `account.feedbackHint` ("lands directly with the person who builds Carta") and `account.feedbackNote` ("goes straight to the person who builds Carta"). On the hub, "See passes" in the pass card and "Get a pass" in the header open the same modal on the same phone screen.
- **Category:** Implementation integrity (copy)
- **Standard:** carta-design Copy ("Say less").
- **Suggested command:** `$impeccable distill`

**[P2] Section titles in Profile, Security, Your data and Friends are not headings**
- **Location:** AccountPanel.jsx:1018, 1123, 1256, 1276, 1344; FriendsSpoke.jsx:291, 314, 330, 368, 381, 450.
- **Category:** Accessibility
- **Impact:** Each spoke is one h1 over a run of `div.section-title`, so a screen reader cannot jump between "Change password" and "Sign out", or between "Your data" and "Delete account". The hub's invite title is a `<b>` (930).
- **Standard:** WCAG 1.3.1.
- **Suggested command:** `$impeccable typeset`

**[P2] The rail and hub draw the same doors twice and reach for the same classes**
- **Location:** AccountPanel.jsx:756 to 786 (the NAV list) next to 939 to 976 (the phone's MenuRow lists, admin row duplicated at 764 and 962 to 968). The CSS hides one set per width (25-feature-pages.css:83).
- **Category:** Implementation integrity
- **Impact:** The comment says "one set of doors, never two", but the JSX keeps two hand-written lists. The help list repeats the NAV entries rather than mapping them, so they drift: for example, the admin row is written out in both places.
- **Suggested command:** `$impeccable distill`

### P3 Polish

**[P3] The FAQ hard-codes counts**
- **Location:** `account.faq1A` and `faq4A` ("43 European countries", "43 countries"); `faq1A` prints the catalogue count `{n}` with a 3038 fallback (AccountPanel.jsx:152).
- **Category:** Implementation integrity
- **Standard:** carta-design Copy (catalogue counts are not page furniture).

**[P3] The entry gate has an h2 and no h1**
- **Location:** AuthGate.jsx:23. It is a full-screen takeover page, not a dialog.
- **Category:** Accessibility

**[P3] Motion literals instead of tokens**
- **Location:** `.account-faq-chev { transition: transform .15s }` (22-account-admin.css:214); `.account-lang-opt` (14-filters-panels.css:1386); `.side-navrow` (25-feature-pages.css:101); `.account-shell button.account-wide-btn` (24-destination-workspace.css:4231).
- **Category:** Theming
- **Impact:** Reduced-motion branches exist for these. Only the duration is off-token.

**[P3] Dead CSS under the floor**
- **Location:** `.cheap-tip-*` at 10px and 10.5px (16-auth.css:286 to 316). No JSX in `src/` renders `cheap-tip`.
- **Category:** Performance / Theming

**[P3] The FAQ answers are not tied to their questions**
- **Location:** AccountPanel.jsx:1416 to 1425. The buttons have `aria-expanded` but no `aria-controls`, and the answer has no `id`.
- **Category:** Accessibility

## Patterns and systemic issues

- **No kit, anywhere on the surface.** There are 57 raw buttons across 7 files and zero imports from `components/ui/`. Primaries, secondaries, chips, fields and the segmented switch are each a local class with its own disabled and hover states. That is how a hover can erase a label and a disabled button can look live.
- **One surface, twelve stylesheets, override by load order.** The `.account-`, `.auth-`, `.privacy-`, `.frn-` and `.pw-` selectors are spread across 10-shell, 14, 16, 17, 21, 22, 23, 24, 25, 26, 60 and 69. Two P1 defects are a later file overriding an earlier one: the max-height that un-scrolls the legal dialogs, and the display:none that hides the h1.
- **Pre-Lagoon values re-skinned through aliases.** There are 463 legacy-token reads and 172 px sizes in the three files. Sizes like 12.5 and 13.5 are off the scale, and the radii are 4, 6, 10 and 12. The aliases resolve, but nothing on the surface reads the Lagoon roles directly, so the type scale and the card surfaces never arrived.
- **Content that rots.** Pass facts, deletion location, country counts and receipt provenance are hand-written into FAQ strings. Two have already gone stale against T390 and T460.
- **One address, four copies.** The contact address is a constant repeated in four components, not one shared module. That is how a private address spread to every legal text.

## Positive findings

- **The dialog semantics are right.** All three legal texts are `role="dialog"`, `aria-modal`, labelled by their title, trapped, closed on Escape, and return focus. Focus starts on a 44 px translated close (verified). The failure is layout, not semantics.
- **No horizontal scroll** at 360, 390, 820 or 1440 in any account scene, and **no small targets inside the panel** on a phone. The menu rows are 52 px, the language tiles and pass button 44 px, and the FAQ questions 48 px.
- **One primary per view** holds on the hub, Profile, Security and Feedback, and the brown action contrasts at 5.81:1 with white.
- **The security model is careful.** Re-authentication comes before a password change, an export or a deletion. Google-only accounts have an email route. The reset link is armed before it is sent. Other devices are signed out only on request. Field errors sit under their fields.
- **The reduced-motion branches exist** for every transition in 22-account-admin.css (268 to 271) and for the dialog family.
- **The pass balance figure settles in place** through `useSettledFigure`, with a thin bar drawn by `transform: scaleX`, not width (AccountPanel.jsx:46 to 82).
- **The FAQ answers read the pass prices and the accuracy figure from their sources** (AccountPanel.jsx:143 to 161). Extending that to the pass length and the renewal rule fixes the worst content issue.

## Recommended actions

1. **[P1] `$impeccable harden`**: Fix the legal dialogs' scroll so the close stays reachable, or make them pages. Replace the four address constants with one role address. Remove the silent mailto redirect and say plainly when feedback fails. Bring AuthModal into the dialog family with an exposed switch state.
2. **[P1] `$impeccable clarify`**: Correct `account.faq13A` and `faq14A` against `lib/pricing.js` and the spokes, and drive pass facts from `TIERS`. Rename or rebuild "Where the numbers come from" around what it holds, keep the credits printed, and update the three verify scripts that read it. Replace the Imprint placeholders with an honest interim (owner step T015). Remove "EUR" from faq15A and re-check faq5A.
3. **[P1] `$impeccable typeset`**: Give the hub one visible h1 at every width, the same signed in and out. Set the legal texts as reading pages on the type scale at `--measure`. Make spoke section titles real headings.
4. **[P1/P2] `$impeccable polish`**: Rebuild the controls on the kit (Button with proper hover and disabled, ChipGroup for the feedback kind, Field at 16 px). That fixes the vanishing hover and retires the `book-btn`, `auth-submit` and `admin-*` classes from this surface. Use real tokens for the table rules, and use a border or a shadow on dialogs, not both.
5. **[P2] `$impeccable adapt`**: Make the rail rows `--tap` on a coarse pointer with labels that fit, and make the feedback box 16 px.
6. **[P2] `$impeccable colorize`**: Use `--surface` cards on `--surface-page`, and drop the `--bg-card` override.
7. **[P2] `$impeccable quieter`**: Remove the invented brown tints from the monogram and the invite card.
8. **[P2] `$impeccable distill`**: Say the feedback promise once, keep one pass door per screen, and drive the hub menu and the rail from the one NAV list.
9. **[P2] `$impeccable optimize`**: Lazy-load AccountPanel, AuthModal and the three legal texts.
10. **`$impeccable polish`**: Final pass, then delete the dead `.cheap-tip-*` CSS and move the motion literals onto tokens.

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `$impeccable audit` after fixes to see your score improve.
