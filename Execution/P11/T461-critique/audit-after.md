# T461 Account: technical audit, after the rebuild

I ran this audit on 2026-10-16 against the uncommitted working tree on `p11-account` (on top of `09f27e5`), following `impeccable/reference/audit.md`. It was read only: no project file was edited. The evidence, the method and the detector run are in `assessment-b-after.md`.

**Pinning.** The browser facts come from the built `dist/` of 22:54, served on port 4297. Port 4191 answered 404. Another session edited PlanSection, Imprint, Terms, the CSS and the i18n files at 23:06, and the code findings cite those files as they stood at 23:12. Three fixes landed after the shared screenshots and are verified in the build: white Account cards, the Contents fold chevron, and initial focus on the legal title.

**Dimensions.** These are the five the brief asked for: accessibility, performance, responsive, theming and anti-patterns. The before audit scored "implementation integrity" in place of anti-patterns, so its 10/20 is not a like-for-like total. Its first four rows compare directly.

## Audit Health Score

| # | Dimension | Before | After | Key finding |
|---|---|---|---|---|
| 1 | Accessibility | 2 | **2** | The close no longer scrolls away and fields are 16 px. But focus now leaves the legal `aria-modal` dialog on Shift+Tab, and the plan confirm and the feedback form drop focus to `body` on every exit. Feedback errors are not announced, and the desktop hub still has no h1. |
| 2 | Performance | 3 | **3** | Unchanged: the legal texts, LegalDoc, the FAQ and the whole panel ship in the entry chunk (726 KB, 226 KB gzip), and the CSS is one 883 KB (140 KB gzip) file. The Contents list mounts after the first paint and shifts the text column. Nothing expensive at runtime. |
| 3 | Responsive design | 2 | **3** | No horizontal scroll at 360, 390, 820 or 1440. The phone gets a full-height sheet with top and bottom safe areas, the close stays in view, and the Contents fold and links are 44 px on touch. The legal column runs 93 to 101 characters a line from 820 px (detector), and phone landscape was not measured. |
| 4 | Theming | 2 | **3** | The T461 CSS reads only Lagoon tokens: no legacy aliases, no hex, no invented tints. Cards are `--surface` on the page. The legal dialog has a shadow and no border. A few px literals remain (26, 36, 220, 960). The app has no dark mode, so there is nothing to theme there. |
| 5 | Anti-patterns (carta-design) | n/a | **3** | One brown action per view (the hub has none, guest one, feedback one). No gradients, no dashes or middots, no banned words. Disabled is sunken at rest, but hovering a disabled primary paints the brown hover fill under grey text (1.37:1). That is the "paler live button" the rules forbid. |
| **Total** | | | **14/20** | **Good (address the weak dimensions)** |

## Anti-patterns verdict

**Pass, with one kit defect.** The page reads as Lagoon in brown. The Account cards are white tiles, group labels are 12 px `--text-2` in sentence case, the plan card is bordered with no shadow, and there is one quiet danger control for the destructive action. The legal page is a dialog-family sheet with section headings and a Contents column. It has no gradient, glass, stripe, decorative dot or second brown. The single visual failure is inherited from the kit: `.btn-primary:hover` in `03-button.css:45` lacks `:not(:disabled)`, so the disabled Send turns brown with grey text under the pointer. The detector found no AI-slop tells on this surface. Its 96 URL findings are 63 line-length warnings in the legal body and 33 false positives from the Explore page behind the scrim.

## Executive summary

- Audit health score: **14/20 (Good)**
- Issues: **P0 0, P1 3, P2 9, P3 12**
- Detector: static scan `[]` (blind to stylesheets, as before). The URL scan found **96 findings, 63 true** (one cause: legal line length) and 33 false positives (the page behind the dialog).
- Top issues:
  1. Focus leaves the legal `aria-modal` dialog: Shift+Tab from the initially focused title goes to the Explore page behind.
  2. The plan's cancel confirm drops focus to `body` on Escape, on "Keep it" and after a successful cancel, and announces nothing.
  3. The Imprint now names no one, but still says "The information above identifies the natural or legal person responsible", and the terms point readers to it.

## Detailed findings by severity

### P0 Blocking

None.

### P1 Major

**[P1] Focus escapes the legal dialog through its tabindex=-1 anchors**
- **Location**: `src/components/LegalDoc.jsx:27` (`initialFocusRef: titleRef`), `:64` (`tabIndex={-1}` title), `:40-41` (the jumped-to h3 made focusable); the edge logic in `src/hooks/useFocusTrap.js:141-147`.
- **Category**: Accessibility
- **Impact**: The dialog says `aria-modal="true"`. Yet Shift+Tab straight after opening lands on "Add Capri to shortlist" on the page behind. On the privacy policy, Tab after a Contents jump to "Your rights" lands on the app header. A keyboard or screen-reader user leaves the document without knowing it. Verified on both documents at 1440.
- **WCAG**: 2.4.3 Focus Order, and the `aria-modal` contract (PRODUCT.md: every `aria-modal` overlay traps focus).
- **Fix**: In useFocusTrap's Tab handler, handle an active element that is inside the panel but not in `items`. Use `compareDocumentPosition` to find the next or previous tabbable item, and wrap when there is none. If the hook is out of scope, add a capture `onKeyDown` on `.legal-doc`: Tab or Shift+Tab while focus is on the title or an h3 goes to the first or last tabbable.
- **Suggested command**: `/impeccable harden`

**[P1] The plan confirm drops focus to `body` on every exit and announces nothing**
- **Location**: `src/auth/account/PlanSection.jsx:42` (`setAsk(false)` on success), `:75` (Escape), `:79` ("Keep it"), `:94` (Resume unmounts once `cancelling` turns false).
- **Category**: Accessibility, correctness
- **Impact**: A keyboard user cancels the yearly plan. The focused "Cancel plan" unmounts, focus goes to `body`, and the chip silently changes from "Renews" to "Ends". The next Tab starts from the top of the document. Escape and "Keep it" do the same, with the focused "Keep it" unmounting. A screen-reader user gets no confirmation that a legally significant action happened. Verified at 390 and 1440.
- **WCAG**: 2.4.3 Focus Order, 4.1.3 Status Messages.
- **Fix**: Keep a ref on "Cancel yearly plan" and focus it after Escape or "Keep it". After a successful cancel or resume, focus the plan heading (`tabIndex={-1}`) or the new primary action. Write the outcome ("Your yearly plan ends on {date}") into a `role="status"` line that is always mounted in the card.
- **Suggested command**: `/impeccable harden`

**[P1] The Imprint names nobody but claims it does**
- **Location**: `src/components/Imprint.jsx:35` (`known()` hides every ENTITY line), `:42-55`, `:74-79` ("The information above identifies the natural or legal person responsible ..."); `src/components/TermsOfService.jsx:62-63` ("the person or company named in the Imprint").
- **Category**: Content correctness (legal)
- **Impact**: Hiding "[Awaiting T015]" made the statutory page look finished. It now shows only a contact address under "Business information", followed by a sentence that is false, while the terms send readers there for the provider's identity. EU e-Commerce Directive Art 5 requires a name, a geographic address and the registration number.
- **Fix**: This is an owner item (T015). Until it lands, either say plainly that the business details are being registered and will appear here, or drop the "information above identifies" sentence. Never present the page as complete. Also guard `postalCode`, `city` and `country` (line 48 tests only `streetAddress`).
- **Suggested command**: `/impeccable clarify`

### P2 Minor

**[P2] A failed feedback send is not announced**
- **Location**: `src/auth/account/FeedbackView.jsx:63` (error via `Field`), `src/components/ui/Field.jsx` (`.field-error` has no live role).
- **Category**: Accessibility
- **Impact**: Focus stays on Send and the error appears below the field without being announced. The before state had `role="alert"`, so this is a regression.
- **WCAG**: 4.1.3 Status Messages.
- **Fix**: Give the kit's `.field-error` `role="alert"`, or render FeedbackView's error in its own always-mounted live region.
- **Suggested command**: `/impeccable harden`

**[P2] Feedback success and "Send another" drop focus to `body`**
- **Location**: `src/auth/account/FeedbackView.jsx:36-45`, `:28` (`setSent(true)` unmounts the form).
- **Category**: Accessibility
- **Impact**: Focus is lost twice. The "Sent. Thank you." status mounts together with its text, so some screen readers miss it.
- **WCAG**: 2.4.3, 4.1.3.
- **Fix**: Keep a `role="status"` container mounted and swap its text. Focus "Send another" after a send, and focus the textarea after "Send another".
- **Suggested command**: `/impeccable harden`

**[P2] Hovering a disabled primary paints it brown with unreadable text**
- **Location**: `src/styles/03-button.css:45` (`.btn-primary:hover` with no `:not(:disabled)`). It shows on Feedback Send (`FeedbackView.jsx:67`).
- **Category**: Anti-pattern, accessibility
- **Impact**: At rest the button is sunken at 4.91:1. On hover it becomes `rgb(116,72,32)` under `rgb(92,104,115)` text, 1.37:1. carta-design says disabled is "never a paler live button". The defect affects every disabled primary in the app.
- **Fix**: Change the kit rules to `.btn-primary:hover:not(:disabled)` (the same for danger and quiet). This is a kit task, not T461's scope.
- **Suggested command**: `/impeccable polish`

**[P2] The Contents jump ignores reduced motion**
- **Location**: `src/components/LegalDoc.jsx:39` (`behavior: 'smooth'`).
- **Category**: Accessibility (motion)
- **Impact**: With `prefers-reduced-motion: reduce`, scrollTop animates 0 → 41 → 221 → 1,695 → 3,263 px over 600 ms. 02-base.css cannot reach scripted scrolls.
- **WCAG**: 2.3.3 Animation from Interactions.
- **Fix**: Use `behavior: scrollBehavior()` from `lib/motion.js`, as DestinationPage and ExploreRails do.
- **Suggested command**: `/impeccable animate`

**[P2] Escape in the FAQ search closes the whole Account page**
- **Location**: `src/auth/account/FaqView.jsx:44-51`, which has no key handling; the window Escape handler in `src/App.jsx:764` closes Account.
- **Category**: Correctness, accessibility
- **Impact**: A user types "refund" and presses Escape expecting to clear it. Account closes, and the search and position are lost. Verified at 390 and 1440.
- **Fix**: In the search field's `onKeyDown`, when Escape is pressed and the value is not empty, clear it and call `stopPropagation()`. An empty field may let Escape through.
- **Suggested command**: `/impeccable harden`

**[P2] The cancel confirm does not read its question**
- **Location**: `src/auth/account/PlanSection.jsx:71-77`.
- **Category**: Accessibility
- **Impact**: Focus lands on "Keep it" inside a group labelled "Cancel yearly plan". The sentence with the end date and "nothing more is charged" is not announced.
- **WCAG**: 1.3.1, 3.3.2.
- **Fix**: Give the paragraph an id and add `aria-describedby` on the group.
- **Suggested command**: `/impeccable harden`

**[P2] No h1 on the desktop and iPad hub (carried over)**
- **Location**: `src/styles/25-feature-pages.css:72` (`.account-shell .panel-tag { display: none }`), `src/auth/AccountPanel.jsx:720-726`.
- **Category**: Accessibility
- **Impact**: At 1440 the signed-in hub's only h1 is `display: none`, so screen-reader heading navigation starts at "Your trip settings". This is unchanged from before.
- **WCAG**: 1.3.1, 2.4.6.
- **Fix**: Keep the h1 in the tree as `sr-only` at desktop widths instead of `display: none`.
- **Suggested command**: `/impeccable harden`

**[P2] Feedback kind chips and "Send another" are English in five languages**
- **Location**: the `account.feedbackKind`, `account.feedbackKind.bug/idea/other` and `account.feedbackAgain` keys exist only in `src/i18n/en.js`. They are rendered by `FeedbackView.jsx:48-53` and `:41`.
- **Category**: i18n (carried over, but on a rebuilt view)
- **Impact**: A German traveller reads "Something is broken", "An idea" and "Something else".
- **Fix**: Add the five translations.
- **Suggested command**: `/impeccable clarify`

**[P2] Harnesses still assert the retired credits page**
- **Location**: `scripts/verify_admin_panel.mjs:1772-1774` (expects "Where the numbers come from" and has no "Share Carta"); `scripts/verify_trails_export.mjs:262-294` (drives `.account-credits li`, now `.legal-credits` in the Imprint).
- **Category**: Test debt (out of the task's file scope)
- **Impact**: Both scripts fail against this build.
- **Fix**: Update both to the Imprint's "Data credits" section and the new rail list in a follow-up task.

**[P2] No text-form confirmation of a cancel is visible**
- **Location**: `src/auth/account/PlanSection.jsx:36-44`. Only the chip changes.
- **Category**: Correctness (legal; related to T460-b)
- **Impact**: BGB 312k(4) asks for a confirmation of the cancellation and its date in text form. The panel shows a chip and nothing else. Whether Stripe emails a cancellation receipt is a Dashboard setting I cannot see.
- **Fix**: The owner checks Stripe's cancellation emails. The status line from the second P1 also gives the on-screen half.

### P3 Polish

- **[P3] FAQ auto-open is decided per group** (`FaqView.jsx:61`): "pass" matches 3 rows in one group and opens none. "the" matches 13 and opens 2. Fix: open when the total match count across groups is 2 or fewer, or never auto-open.
- **[P3] FAQ results are not announced** (`FaqView.jsx:53-55`): the empty `role="status"` mounts with its text, and match counts are never spoken. Fix: an always-mounted `sr-only` live line ("3 questions match").
- **[P3] Four region landmarks in the FAQ** (`FaqView.jsx:57`): `<section aria-labelledby>` per group. Fix: use `<div>` with the h2.
- **[P3] Feedback defaults to "Something is broken"** (`FeedbackView.jsx:16`, was `'other'`): every message that is not changed lands in the inbox as a bug. Fix: no default selection, or `'other'`.
- **[P3] The Contents fold stays open after a jump on a phone** (`LegalDoc.jsx:36-42`): 19 links at 44 px (836 px) stay above the text. Fix: close the `<details>` in `go`.
- **[P3] Contents mount after the first paint** (`LegalDoc.jsx:30-34`): from 1024 px the column shifts 260 px right after one frame. Fix: `useLayoutEffect`.
- **[P3] Focus ring on the title on a deep-link open** (`LegalDoc.jsx:27, 64`): with no prior input, the h2 matches `:focus-visible` and draws the 2 px ring around a heading. Fix: mark it `data-focus-quiet`, or suppress the ring on `.legal-title:focus-visible` since it is not an interactive target.
- **[P3] Legal line length 93 to 101 characters** (`69-v6-account.css:557`, `--measure` 68ch at 14 px): this follows carta-design's written cap. 68ch of "0" holds about 95 characters of prose. This is an owner token call. A stricter cap (for example `max-width: 36em`) would bring lines to about 75 characters.
- **[P3] A plan error outlives the confirm** (`PlanSection.jsx:41`, `:79`): a failed cancel followed by "Keep it" leaves "That did not go through" on the card. Fix: clear `err` when `ask` closes.
- **[P3] A portal answer without a url does nothing** (`PlanSection.jsx:97`, `billing.js:29`): `ok` without a URL is silent. Fix: treat a missing `url` as a failure.
- **[P3] Paying travellers see "See prices" while the entitlement loads** (`PlanSection.jsx:87-89`, `useEntitlement.js:17-31`): the tier defaults to free. Fix: render no actions until `e.known`.
- **[P3] Dead code in AccountPanel** (`AccountPanel.jsx:7` `ChevronDownIcon`, `:17` `canUpgrade` and `formatPrice`, `:643` `tier`). Fix: remove them.

## Patterns and systemic issues

- **Unmount-on-success loses focus.** PlanSection (confirm, cancel, resume) and FeedbackView (send, send another) both swap the focused control for different markup. A shared rule fixes all five: after a view swap, move focus to the new state's heading or primary and announce it through a persistent status line.
- **`tabindex="-1"` anchors versus the trap.** Any dialog that parks focus on a heading (LegalDoc now, and the carta-design navigation rule asks for it on pointer opens) will leak through `useFocusTrap`. Fix the hook once.
- **Kit hover rules are not disabled-safe.** `03-button.css` hover rules for primary, danger and quiet all lack `:not(:disabled)`.

## Positive findings

- The before P1 is gone. The legal close stays in view at every width: `.legal-cols` owns the scroll and the header is outside it.
- The legal page is now a reading page: a 610 px column, 16 px section headings, a Contents list as a column from 1024 px and a 44 px fold below that, heading ids with scroll margin, and a privacy table with real rules.
- Every new view is on the kit (Button, Chip, ChipGroup, Field, IconButton). There are 0 raw buttons in the new files and the AccountPanel count fell from 30 to 22.
- The personal address is gone. `CONTACT` lives in one file, feedback has no mailto fallback, and a failure keeps the typed text.
- The FAQ uses native `<details>`, which work from the keyboard. Search filters questions and answers, prices come from `lib/pricing.js`, and the answers match the terms (60-day Trip Pass, a yearly plan that renews, deletion under Your data).
- The inline confirm follows carta-design: the safe action comes first and is focused, Escape keeps the plan without closing the page, and the erasing action is `--danger`. The German label is now "Jetzt kündigen", as BGB 312k expects.
- Inputs are 16 px, and touch targets are 44 px on coarse pointers across hub, FAQ, Feedback, plan and legal.

## Recommended actions

1. **[P1] `/impeccable harden`**: make useFocusTrap wrap from non-tabbable anchors (LegalDoc), and restore and announce focus in PlanSection and FeedbackView.
2. **[P1] Owner (T015) + `/impeccable clarify`**: the Imprint must state its gap honestly until the business details exist.
3. **[P2] `/impeccable harden`**: announce the feedback error, and clear the search on Escape before Account closes.
4. **[P2] `/impeccable animate`**: route the Contents jump through `scrollBehavior()`.
5. **[P2] Kit task `/impeccable polish`**: add `:not(:disabled)` to the button hover rules.
6. **[P2] `/impeccable clarify`**: add the five missing feedback-kind translations. Update the two harnesses in a follow-up task.
7. **[P3] `/impeccable polish`**: the FAQ auto-open rule, the Contents fold, `useLayoutEffect`, dead imports, and the plan edge states.
8. **`/impeccable audit`**: re-run after fixes to confirm the score.
