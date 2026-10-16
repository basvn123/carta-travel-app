# T461 critique, Assessment B (after): detector and evidence

Surface: the rebuilt Account area in the app working tree on branch `p11-account` (uncommitted, on top of `09f27e5`). Files: `src/auth/AccountPanel.jsx`, `src/auth/account/FaqView.jsx`, `FeedbackView.jsx`, `PlanSection.jsx`, `src/components/LegalDoc.jsx`, `PrivacyPolicy.jsx`, `TermsOfService.jsx`, `Imprint.jsx`, `src/auth/AuthModal.jsx`, `AuthGate.jsx`, the T461 section at the end of `src/styles/69-v6-account.css` (line 437 on). Context only: `src/lib/contact.js`, `src/lib/billing.js`, `src/lib/feedback.js`, `src/hooks/useFocusTrap.js`, `src/hooks/useEntitlement.js`, `src/components/ui/*`, `src/styles/03-button.css`.

Run 2026-10-16, about 22:55 to 23:15. Evidence only; the scores are in `audit-after.md`. No project file was edited.

## How the after state was pinned

- **The tree moved during this run.** Another session edited `PlanSection.jsx`, `Imprint.jsx`, `TermsOfService.jsx`, `69-v6-account.css` and the six i18n files at 23:06. Code findings cite the files as they stood at 23:12. The changes I saw land were these: the Imprint hides "[Awaiting T015]" lines, "See plans" became "See prices", the German cancel button became "Jetzt kündigen", the Trip Pass chip was dropped, and a `.acct-plan .account-pass-bar` fix was added.
- **Browser facts come from the built `dist/`** (index.html 22:54, after LegalDoc.jsx 22:49 and the CSS at 22:52, before the 23:06 edits). I served it with `vite preview` on port 4297. Port 4191 (an older `vite preview`, pid 5980) answered 404 on every path, so I did not use it. The dev server on 4260 serves the working tree, but every detector URL scan against it hit the detector's 30 s navigation timeout.
- The three fixes landed after the shared screenshots were verified in the build: the Account cards are white (`rgb(255,255,255)` on every `.acct-card`, `.account-profile-card` and `.account-menu`), the legal Contents fold has a chevron, and the dialog opens with focus on its title.
- Probes: `scratchpad/t461b-after/probe.mjs` (legal at 360, 390, 820 and 1440; account FAQ and feedback at 390 and 1440; plan cancel flow at 390 and 1440) and `probe2.mjs` (focus-trap edges, opening from Account, scrim). Auth is stubbed and `ai_status`, `entitlements`, `billing` and `submit_feedback` are routed in Playwright. Raw output is in `legal.json`, `acct2.json` and `plan2.json` in the same folder.

## 1. Impeccable detector

### 1a. Static scan of the eleven files

Command, from the repo root:
`C:/Users/Gebruiker/.claude/skills/impeccable/scripts/impeccable.cmd detect --json <the 11 files>`

Exit 0, output `[]`. This is the same blind spot as the before pass: the detector reads inline styles and utility classes in JSX. It does not apply a standalone stylesheet to class names. These components style everything through `69-v6-account.css` and the kit, so `[]` is no evidence either way.

### 1b. URL scan of the built app

Command: `impeccable.cmd detect --json --viewport <WxH> http://localhost:4297/?legal=<doc>`, for terms, privacy and imprint at 390x844 and 1440x900. Every run exited 2 (findings present).

| Target | Findings | Rules |
|---|---|---|
| terms 390 | 5 | clipped-overflow-container 2, edge-flush-cards 3 |
| privacy 390 | 5 | same |
| imprint 390 | 5 | same |
| terms 1440 | 48 | clipped-overflow-container 2, line-length 42, edge-flush-cards 4 |
| privacy 1440 | 18 | clipped-overflow-container 2, line-length 12, edge-flush-cards 4 |
| imprint 1440 | 15 | clipped-overflow-container 2, line-length 9, edge-flush-cards 4 |
| **Total** | **96** | 12 clipped-overflow, 63 line-length, 21 edge-flush-cards |

The detector reports `line: 0` for URL targets, so each finding below is traced to its element by DOM query.

| Rule | Where it really is | Verdict |
|---|---|---|
| `clipped-overflow-container`: "div clips a positioned child", "div.app clips a positioned child" (2 per run) | A DOM walk for `overflow: hidden/clip` ancestors of absolutely positioned children finds `html`, `body`, the root `div`, `div.app` and `article.card.card-tile`. **None is inside `.legal-doc`.** It is the Explore page under the scrim. | **False positive for this surface.** The app shell clips on purpose. `.legal-doc` has `overflow: hidden` (69-v6-account.css:519), but its only non-static child is the sticky `.legal-toc`, which sits inside the scrolling `.legal-cols` and is not clipped. |
| `edge-flush-cards`: "2 cards flush against the left edge of div.xrails-strip" (3 or 4 per run) | The Explore rails (`.xrails-strip`, `article.card.card-tile.xtile`) behind the dialog | **False positive for this surface.** These are Explore's scroll-snap rails, outside T461's scope. If they are a real issue, it belongs to Explore. |
| `line-length`: "~93 to 101 chars on N of M rendered lines (aim for <80)" (63, only at 1440) | Paragraphs in `.legal-body`. The text column measures 610 px at 820 and at 1440, and body text is 14 px / 21 px. None fire at 390 (column 358 px). | **True positive by the detector's 80-character rule.** It conflicts with the written rule: `.legal-body.privacy-body { max-width: var(--measure) }` (69-v6-account.css:557), where `--measure` is 68ch (01-tokens.css:123). carta-design says "Prose caps at `--measure` (68ch)", and the code honours that. `ch` is the advance of the digit 0, which is wider than the average letter, so 68ch at 14 px holds 93 to 101 characters. By CLAUDE.md the carta-design rule wins, so this goes to the owner as a token question, not a defect to fix in this task. |

Counted findings: **96 raw**. Of these, 33 are false positives for this surface (the page behind) and 63 are true (all line length in the legal body, one cause).

## 2. Design-lint meter (`scripts/ci/design-lint.mjs --meter`, read only)

| File | raw-button | font-size | radius | legacy-token | money |
|---|---|---|---|---|---|
| AccountPanel.jsx | 22 (was 30) | 0 | 0 | 0 | 0 |
| AuthModal.jsx | 7 (unchanged) | 0 | 0 | 0 | 0 |
| AuthGate.jsx | 4 (unchanged) | 0 | 0 | 0 | 0 |
| Privacy, Terms, Imprint | 0 each (was 1 each) | 0 | 0 | 0 | 0 |
| FaqView, FeedbackView, PlanSection, LegalDoc | 0 (not listed) | 0 | 0 | 0 | 0 |
| 69-v6-account.css | 0 | 11 | 7 | 43 (all three unchanged; the T461 section adds none) | 0 |

Nothing in the T461 diff contains an em dash, en dash, middot or bullet (checked by code point across the `+` lines of the diff and the seven JSX files). There are no banned words in the new English strings or the legal texts. The new CSS has no hex or rgb literals. Its px literals are 26 (search inset), 220 (Contents column), 36 (Contents link on a fine pointer), 960 (dialog cap), 8 and 6 (chevron, status dot) and 4 (margin).

## 3. Browser evidence

### 3a. Legal reading page (LegalDoc), built app

| Fact | 360x740 touch | 390x844 touch | 820x1180 touch | 1440x900 |
|---|---|---|---|---|
| Dialog rect | 0,0,360,740, radius 0 | 0,0,390,844, radius 0 | 24,24,772,1132, radius 20 | 240,24,960,852, radius 20 |
| Border and shadow | none and `--elev-3` | same | same | same (the before state had both) |
| Text column, body type | 328 px, 14/21 | 358 px, 14/21 | 610 px, 14/21 | 610 px, 14/21 |
| Section heading | 16 px | 16 px | 16 px | 16 px |
| Close | 44x44 | 44x44 | 44x44 | 44x44 |
| Close in view after scrolling to the end | yes | yes | yes | yes (before: -7,909 px) |
| Scroll owner | `.legal-cols` 9,210 / 668 (terms) | 8,580 / 772 | 5,814 / 1,038 | 5,754 / 758 |
| Horizontal overflow (document, `.legal-cols`) | 0, 0 | 0, 0 | 0, 0 | 0, 0 |
| Contents | fold, summary 44 px, links 44 px | same | same | side column, links 36 px |
| Privacy table rule | `solid 1px` (the before state rendered none: undefined `--stroke`) | same | same | same |
| Duplicate ids in the document | none | none | none | none |
| Initial focus | `h2#legal-*-title`, matches `:focus-visible`, outline `solid 2px` (deep link, no prior input) | same | same | same |

Contents jump (5th link, pointer): the target heading lands 16 px under the top of `.legal-cols` (scroll-margin works) and takes focus with no ring. On a phone the fold **stays open** after the jump.

**Focus leaves the modal (verified at 1440, both documents):**

| Step | Focus lands on | In the dialog? |
|---|---|---|
| Open `?legal=terms`, then Shift+Tab | `button.icon-btn` "Add Capri to shortlist" | **no** (the Explore page behind) |
| Open `?legal=privacy`, then Shift+Tab | the same button | **no** |
| Title focused, Tab | Close | yes |
| Privacy: Contents link to the last section ("Your rights"), then Tab | `a.app-header-brand` "Carta" | **no** |
| Terms: Contents link to the last section ("Contact"), then Tab | the mailto link inside "Contact" | yes (by luck: a link follows the heading) |

Cause: `useFocusTrap` wraps Tab only when `document.activeElement` is the first or last *tabbable* element (useFocusTrap.js:141 to 147). LegalDoc parks focus on elements with `tabindex="-1"`, the title (LegalDoc.jsx:27 and 64) and the jumped-to h3 (LegalDoc.jsx:40 and 41). These are not in the tabbable list, so the trap lets the browser move focus out of an `aria-modal` dialog.

**Reduced motion:** with `reducedMotion: 'reduce'`, a Contents jump on the terms still animates. `.legal-cols` scrollTop sampled at 0, 60, 120, 250 and 600 ms reads 0, 41, 221, 1,695, 3,263. `scrollIntoView({ behavior: 'smooth' })` (LegalDoc.jsx:39) ignores `lib/motion.js` `scrollBehavior()`. The global CSS rule (02-base.css:111 to 118) cannot reach a scripted smooth scroll.

**Opened from Account (1440):** keyboard Enter on the rail row "Terms of service" puts focus on the title with a ring. Escape closes only the dialog, the panel stays open, and focus returns to the rail row. A pointer open puts focus on the title with no ring (`data-focus-quiet`). A scrim click closes it and focus returns to the row. A deep-link close (`?legal=`) leaves focus on `body`, which is expected because there is no opener. The `legal` parameter is removed from the URL.

### 3b. Account hub, FAQ, Feedback (signed in, stubbed)

| Fact | 390 touch | 1440 |
|---|---|---|
| Cards | profile, menu and plan cards all `rgb(255,255,255)` | same |
| h1 on the hub | "Account", 12 px, visible | "Account" **hidden** (no h1 in the accessibility tree; 25-feature-pages.css:72, carried over from before) |
| Plan card, free | one secondary "See plans" (44), no primary on the hub | same |
| FAQ rows | 15 questions in 4 groups, summary 44 px min | same |
| Search "refund" | 1 row, 1 open | same |
| Search "pass" | 3 rows in 1 group, **0 open** | same |
| Search "the" | 13 rows, **2 open** (the one group with 2 or fewer matches) | same |
| Search cleared | 15 rows, 0 open (a user-opened answer from before the search closed too) | same |
| No match | "No question matches "zzzz"." | same |
| **Escape in the search box** (value "refund") | **the whole Account page closes** | same |
| Feedback textarea font | 16 px (iOS no longer zooms) | 16 px |
| Kind chips | 3 radios, 44 px, "Something is broken" pre-selected | 32 px (fine pointer) |
| Send, disabled | `rgb(239,238,234)` on `rgb(92,104,115)`, 4.91:1 | same at rest |
| **Send, disabled, hovered** | n/a | **`rgb(116,72,32)` fill under `rgb(92,104,115)` text, 1.37:1** |
| Send fails (RPC 500) | "Your message did not send. Try again in a moment.", text kept, `aria-invalid="true"`, **no `role="alert"` or live ancestor, focus stays on Send** | same |
| Send succeeds | "Sent. Thank you." in a newly mounted `role="status"`, **focus on `body`** | same |
| "Send another" | **focus on `body`**, kind still "Something is broken" | same |
| Horizontal scroll | none | none |

The disabled-hover fill comes from the kit: `.btn-primary:hover` (03-button.css:45) is not guarded by `:not(:disabled)`, and it comes later in the file than `.btn:disabled` (line 35), at the same specificity.

### 3c. Your plan, yearly (subscription routed live and active)

| Step | 390 touch | 1440 | Focus after |
|---|---|---|---|
| Rest | chip "Renews 16 Oct 2027"; quiet "Manage payment", quiet red "Cancel yearly plan" (44, `rgb(179,55,42)`, 6.01:1) | same | |
| Cancel yearly plan | inline confirm: sentence with the date, "Keep it" (secondary sm) then "Cancel plan" (danger sm); 44 px on touch, 32 px on fine | same | "Keep it" (correct, carta-design inline confirm) |
| Escape | confirm closes, panel stays open (stopPropagation works) | same | **`body`** |
| Keep it | confirm closes | same | **`body`** |
| Cancel plan | spinner on the danger button, "Keep it" still live; billing called once (`cancel`) | same | |
| After success | chip "Ends 16 Oct 2027"; "Keep my yearly plan" (secondary), "Manage payment" | same | **`body`**, and nothing is announced |

The same unmount pattern applies to "Keep my yearly plan" (resume). Its button disappears when `cancelling` turns false, so focus drops again. This was read from code, not driven.

## 4. Code facts behind the correctness review

- **PlanSection.jsx** (as of 23:12): `run` (36 to 44) clears `ask` only on success. A failed cancel shows `acct-error` (68) inside the open confirm, and "Keep it" (79) then closes the confirm while the error line stays. `openBillingPortal` returns `ok` without navigating when the function answers without `url` (billing.js:29), and the panel then does nothing visible. The action row renders from `e.tier`, which is `'free'` in `GUEST` until `ai_status` answers (useEntitlement.js:17 to 31). So a paying traveller sees "See prices" for the first read. The confirm group (71 to 76) is labelled "Cancel yearly plan" but does not reference the question sentence (77), so a screen reader landing on "Keep it" does not hear the date. With migration 053 absent (T460-a, still open), `subscription` is `null` and a yearly traveller would see no cancel door. That cannot happen before 053, because 053 is what creates subscriptions.
- **FaqView.jsx**: `open={!!needle && g.rows.length < 3 ? true : undefined}` (61) is decided per group, which produces the "pass" and "the" results above. The empty state (53 to 55) mounts a `role="status"` together with its text, and result counts are never announced. Each group is a `<section aria-labelledby>` (57), so the FAQ exposes four region landmarks. `vars` is memoised with `[]` (25 to 31). `formatPrice` reads the app language at call time, and the FAQ remounts after a language change on the hub, so this is safe today.
- **FeedbackView.jsx**: the default kind is now `'bug'` (16; it was `'other'`). The error goes through `Field`'s `error` prop (63), which renders `<p class="field-error">` with no live semantics (components/ui/Field.jsx). The success branch (36 to 45) replaces the form, so the focused Send unmounts.
- **LegalDoc.jsx**: Contents ids are assigned in a `useEffect` (30 to 34). The list renders after the first paint, so from 1024 px the text column starts full width and then moves right by 260 px. `go` (36 to 42) neither closes the phone fold nor uses `scrollBehavior()`.
- **Imprint.jsx** (as of 23:06): `known()` (35) hides every ENTITY line while T015 is open. With all fields still placeholders, the Business information section prints only "Contact". The Regulatory notice still says "The information above identifies the natural or legal person responsible for the content and operation of the Carta platform" (76 to 79), and the terms send the reader there: "the person or company named in the Imprint" (TermsOfService.jsx:62 to 63). The address block tests only `streetAddress` (48) and prints postal code, city and country unchecked.
- **i18n**: every T461 key exists in all six catalogues. `account.feedbackKind.bug/idea/other`, `account.feedbackKind` and `account.feedbackAgain` exist only in `en.js`, as they did at HEAD. So in German, Spanish, French, Italian and Dutch, the feedback chips, their group label and "Send another" render in English.
- **AccountPanel.jsx**: `ChevronDownIcon` (7), `canUpgrade` and `formatPrice` (17) are imported unused, and `const tier` (643) is unused.
- **Harnesses that the rebuild breaks** (out of scope, not edited): `scripts/verify_admin_panel.mjs:1772 to 1774` expects the retired "Where the numbers come from" door and has no "Share Carta". `scripts/verify_trails_export.mjs:262 to 294` drives `.account-credits li`, which is now `.legal-credits` in the Imprint. `scripts/ci/smoke.mjs:78` lists `.legal-modal`, which never existed. That one is harmless because other signals settle the route.

## 5. What this pass could not see

- The 23:06 edits (Imprint placeholders hidden, plan label, pass bar) are read from code only; the build predates them.
- Profile, Security, Your data and Friends were not driven. AuthModal and AuthGate were read, not driven. Their T461 change is the removal of a caption.
- No screen reader was run. Announcement claims rest on missing live-region semantics and on focus landing on `body`.
- Phone landscape (for example 844x390, where the legal page switches to the centred dialog with about 250 px of reading height) and the iPad rail rows on touch were not measured.
- The legal claim about BGB 312k text-form confirmation is about whether Stripe sends a cancellation email. That is a Dashboard setting I cannot see.
