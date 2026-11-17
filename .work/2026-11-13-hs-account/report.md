# Report: account lane of the house style run

- **Status:** done; final judge FAIL 100 of 135 after three rounds (hard criteria all pass; see "Judgement")
- **Date:** 2026-11-17
- **Level:** L2, `crew:design` playbook (autonomous; Stage 7 pre-approved by the owner)
- **Branch:** `p15-hs-account` (worktree `wt/hs-account`, from `p15-housestyle` at `e890b35789`)
- **ROADMAP:** G1 (house style), G5 (motion), G10 (accessibility)

## Result
Every account-area screen now speaks the house style, visual only: no handler, flow step, id or pinned class was removed (three judges checked the diff and scored function parity 5 of 5). Sign in is a paper sheet with the wordmark slot, the kit's segmented switch and fields, and a refused submit shakes once. Account reads as the traveller's ledger: section heads in ink over hairline panels with no shadow, the face drawn as Together draws "you" (an ink outline), the plan on the identity card as the umber mark plate ("you chose this"), and its older forms (profile, password, export, delete) in the kit's look, revealed in place. My trips says the unit once, draws readiness in umber without a card in the card, and its empty tab is the waiting path. Together lost its ink slab and its Lagoon and sun colours: you are an ink outline, friends neutral fills, polls are hairline rows. The pass plans are leg plates as radios, the Pass moment is one paper card, the AI is the boxed "AI" tag everywhere this lane draws it.

## How the run went
1. **Explore** (3 explorers): `explore-trips-account.md`, `explore-together-pass-ask.md` (+ `-addendum.md`), `explore-small-kit.md`.
2. **Directions** (`directions.md`): A one ledger of rows, B plate and path (each screen's job drawn with a house part), C summary tiles. Proposers skipped (the look was decided; the open question was structure).
3. **Critique** (1 critic, 5 lenses, `critique-all-lenses.md`): B first with fixes (no blaze path for readiness, no mark plate on a trip figure, no umber as a person colour); C rejected (a bento).
4. **Decision** (`decision.md`): B with A's one row language; round-1 changes recorded there.
5. **Build** (this session), commits listed below; checks after each batch.
6. **Judge**: three rounds, each a fresh judge (see "Judgement").

## What changed, per screen (before, after)
- **Sign in** (`AuthModal`, `GoogleButton`, `16-auth.css`). Before: compass logo, serif-like title, hand-built tabs and inputs, an accent-tinted error slab, raw buttons. After: wordmark slot (blaze and name in the plate face), kit `Segmented`, `IconButton`, kit `Button`s (primary submit with a spinner, quiet links), inputs with the kit Field's edge and ring, danger errors with a "!" mark, a shake and the warn haptic on a refused submit; a sheet rising from the foot on a phone, a dialog that scales in from 600 px. Shots: `shots/signin-*.png`.
- **Entry gate** (`AuthGate`). One primary (Sign in), Create account secondary, Google third, guest and privacy quiet; wordmark slot. Not reachable for a screenshot without a live auth session; `shots/account-guestcard-*` shows Account's guest sign-in card from the same build.
- **Account overview and panes** (`AccountPanel`, `TravelView`, `91-account.css`, `22-account-admin.css`, `16-auth.css`). Section heads 800 in ink; ledger panels (control radius, one hairline edge, no shadow); plain row icons in second ink; the face an ink outline; identity counts as headline figures; the plan as the umber mark plate; the rail from 769 px (tablet two panes, was desktop only); panes arrive as pushed views. Older forms in the kit look: paper fields with the control edge, kit-like primary and secondary buttons, umber marks for ok and strength (no green), the success line on the beige wash with a 44 px close, the forgot step and the avatar picker revealed in place, Delete forever the one danger button (no red slab), the redundant "Profile" sub-heading for screen readers only, umber meter bars on Your plan. AI rows carry the AI tag.
- **My trips** (`MyTripsTabs`, `TripCards`, `TodayCard`, `parts`, `70-mytrips.css`). Before: "a person a day" under every card, a sunken readiness card inside the trip card with an ink bar, an eyebrow above Today, green and cost-bar colours, TripArt contours on the empty tab. After: "A day, a person" as a label before the focal figure and once in each priced section head (rows keep it for screen readers), readiness under a hairline in umber with its words, Today's day count after the place name, spend in the formation's paint with its legend, a waiting-path empty state, tablet actions sharing the width, the moderation statement as its own row, "Not priced yet" quiet, face stacks that no longer cover initials, Saved's list tiles on a hairline and on one row at 820.
- **Together** (`TogetherPage`, `90-together.css`, `22-account-admin.css` handle field). Before: the ink "Plans that meet" card, Lagoon and sun faces and bars, boxed poll options, three different-looking cards in the group view, a TripArt contour card when signed out. After: paper meet card with the shared days in a dashed umber outline, you an ink outline and friends neutral fills (also on the duo map and legend), polls as hairline rows with the vote share behind and a short over-budget line in second ink ("€745, over budget", six languages), budget, costs and the add-a-cost form as paper panels, a waiting-path signed-out card, views arriving as pushed views, menus and inline forms revealed.
- **Pass sheet, Pass moment, /pricing** (`71-pass.css`, `PassMoment.css`, `72-pricing.css`). Plans as leg plates (1.5 px edge; chosen: umber edge, row wash, the tick springing in), price at headline 800, sheet motion; the Pass moment one paper card split by a hairline (no Lagoon or umber tinted columns, the free plan never dimmed); the /pricing title a page title.
- **Ask chat and door** (`AskChat`, `AskChatButton`, `AiMark`, `CreditChip`, `76-ask-chat.css`). The boxed AI tag replaces the sparkle; the trip card in an answer is a section of the bubble; sending is a confirm haptic on touch.
- **Small surfaces.** Report sheet (no side stripe, Field-like inputs, the chosen reason on the row wash), install hint (paper row, round 44 px close), site banner (paper toast, umber icon, warn as a danger outline with bold words, no amber), maintenance gate (paper panel, headline title, an ink strip for admins), upload dialog and the dialog shell (roles and radius tokens), the email-confirmed toast (the ink house toast).

## Screenshots
- Final: `.work/2026-11-13-hs-account/shots/<screen>-<width>.png` at 390, 820, 1440 (31 screens), `shots/w1180/` (My trips, Your Europe, Account, Your travel, Together, the group view, /pricing), `shots-auth/` (sign in and the guest card from the auth-configured build). Sweep: `shots/sweep-*.json`, `sweep/sweep.json`, `sweep-europe.json`. Axe: `axe-lane*.log`, `axe-auth.log`.
- Start: `shots-start/` (390, a few screens) and the run's `shots-before/`.

## Checks
Full table in `checks.md`. In short, on the final code:
- `npm test`: 2122 tests, 25 failures, identical to the sparse-checkout baseline in every round (`baseline-failures.txt`, `npm-test-r2/r3/r4.txt`); round 1 had 2 new failures (a universal selector the route-sheet check flagged, `.auth-submit` on kit Buttons; inset shadows design-lint flagged), both fixed before the first commit.
- `npm run lint` 0 errors; `design-lint` 0 new (4094 in the baseline); `token-contrast` 0 under the floor; `css-routes --check` none overridable; fast build passes; impeccable detector `[]`.
- Width sweep: 0 horizontal scroll and 0 overflowing elements in every shot at 390, 820, 1180, 1440 and at 360, 600, 768, 1024, 1280, 1920 on 9 main screens; Your Europe at all ten widths (`sweep-europe.json`).
- axe (WCAG 2.2 AA tags): 15 screens at 390 and 1440 plus sign in and the guest page on the auth build: 0 serious or critical.
- verify scripts: `verify_plan_tiers`, `verify_paywall` pass; `verify_account_panel`, `verify_data_export` skip (need a Supabase account); `verify_ai_page` 39 of 40 (CORS console errors from the production data host on the lane server); `verify_paywall_funnel` fails on a migration in files this lane never touched; `verify_trip_crew`, `verify_friends`, `verify_friend_badges` wait for selectors of screens that no longer exist (the retired Friends spoke, the plan lane's `.pf-past`); `verify_keyboard`, `verify_focus_trap` crashed under the machine's memory pressure on non-account pages; `verify_status_banner` needs a vite dev server (the brief forbids it). Output of each in the run folder's `verify/` directory.
- Docs: `check_entry_points.py` OK; `drift.py` 1 drift (`docs/SCHEMA.md`, in the sparse baseline).

## Departures from the house style, and why
- The plan on Account's identity card uses the mark plate shape by CSS on a kit `Chip` (the kit has no mark-plate chip); a foundation request could add one.
- `components/AiTag.jsx` is a lane file until the foundation moves it into the kit (request 1).
- The removal fade (decision item 3) was dropped: the item leaves in the same state update that shows Undo; a fade needs a delayed removal, a logic change.

## Foundation requests, notes
`foundation-requests.md` (9 items), `handbook-notes.md` (ROADMAP lines, shared-file effects, stale scripts, owner suggestions).

## Files changed
- `.claude/skills/carta-design/references/account.md`: the account look rules (section "Look").
- `continent-app/src/auth/AuthModal.jsx`: wordmark slot, kit Segmented, IconButton and Buttons, the shake and warn haptic on a refused submit (checks unchanged).
- `continent-app/src/auth/AuthGate.jsx`: wordmark slot; Sign in primary, Create account secondary, Google third; guest and privacy quiet.
- `continent-app/src/auth/GoogleButton.jsx`: the kit secondary Button (same handler).
- `continent-app/src/auth/AccountPanel.jsx`: AI tag on AI rows; the pane keyed by view (Route motion).
- `continent-app/src/auth/account/TravelView.jsx`: the taste row's icon is the house pack (was a sparkle).
- `continent-app/src/auth/mytrips/AddBookingSheet.jsx`: AI tag on the booking reader line.
- `continent-app/src/auth/mytrips/MyTripsTabs.jsx`: the unit in priced section heads; the empty tab's waiting path.
- `continent-app/src/auth/mytrips/TodayCard.jsx`: the day count after the title (no eyebrow).
- `continent-app/src/auth/mytrips/TripCards.jsx`, `parts.jsx`: the unit as a label before the focal figure; rows keep it for screen readers.
- `continent-app/src/browse/ask/AskChat.jsx`: AI tag in the title; confirm haptic on send.
- `continent-app/src/browse/ask/AskChatButton.jsx`, `continent-app/src/components/AiMark.jsx`, `CreditChip.jsx`: AI tag (was a sparkle).
- `continent-app/src/components/AiTag.jsx`: new, the boxed AI tag as a component.
- `continent-app/src/together/TogetherPage.jsx`: the route frame keyed by view; the signed-out card's waiting path.
- `continent-app/src/i18n/en.js`, `nl.js`, `de.js`, `fr.js`, `es.js`, `it.js`: one new key `acc.authMode` (the sign-in mode switch's label) under the account marker.
- `continent-app/src/pass/PassMoment.css`: one paper card (no Lagoon), settle rise; test strings kept.
- `continent-app/src/styles/16-auth.css`: sign in, the gate, the confirm toast, the shared auth fields and errors.
- `continent-app/src/styles/22-account-admin.css`: traveller parts on roles; the handle field; the maintenance gate and site banner (admin region unchanged).
- `continent-app/src/styles/38-first-run.css`, `40-upload.css`, `items/40-upload.css`, `69-v6-account.css`: legacy names to roles, literal sizes and radii to tokens.
- `continent-app/src/styles/42-feedback.css`: the report sheet (no side stripe, Field-like inputs, row wash for the chosen reason).
- `continent-app/src/styles/46-owner-calls.css`: the install hint, the scrim token.
- `continent-app/src/styles/70-mytrips.css`: readiness, unit labels, spend colours, empty state, tablet actions, statement row, Today.
- `continent-app/src/styles/71-pass.css`, `72-pricing.css`: leg-plate plans, sheet motion, page title.
- `continent-app/src/styles/76-ask-chat.css`: the AI tag colour; the trip section in a bubble.
- `continent-app/src/styles/90-together.css`: meet card, tones, duo map, polls, panels, motion.
- `continent-app/src/styles/91-account.css`: Account's look (heads, discs, mark plate, figures), the older forms, the tablet rail, motion.
- Run folder `.work/2026-11-13-hs-account/` (the report is committed per decision 0002; the rest stays local).

## How to undo
`git revert` the lane's commits (`git log --oneline e890b35789..p15-hs-account`). No data migration, no schema change.

## Judgement
Three rounds, each a fresh judge (the crew limit). Final: **FAIL, 100 of 135** (`judgement-3.md`).

| Round | Total | Under the bar |
|---|---|---|
| 1 (`judgement-1.md`) | 97 | Ownable 3, Clear 3, Coherent 3, Craft 3, Sizes 3 |
| 2 (`judgement-2.md`) | 97 | Ownable 3, Clear 3, Coherent 3, Craft 3, Sizes 3 |
| 3 (`judgement-3.md`) | 100 | Ownable 3, Coherent 3, Docs 3, Sizes 3 |

Every hard criterion passed in every round: function parity 5 of 5 (no handler, control, flow step, id or pinned class removed), accessibility 4, honest numbers and copy 4. Clear and Craft reached 4 in round 3.

After round 3 (no fourth judge, per the crew limit) the lane fixed two of the four remaining items exactly as the judge named them: Saved's list tiles now fit one row at 820 (the "New list" orphan, criterion 10), and `references/account.md` has one panel rule for Account (criterion 7). Checks after that commit: `npm test` at the 25-failure baseline, css-routes clean, design-lint 0 new, entry points OK. Not re-judged.

**Still open for the orchestrator:**
- **Ownable (1), the main gap.** Account reads as a calm settings ledger (hairline panels, rows with icon, label, value and chevron); its only house signatures are the umber mark plate on the plan and the headline counts. The judges want something from the product's world on Account and Together (both have no background graphic; the relief rule allows it only where real peaks exist, so it cannot go there). A structural idea that would change what the overview shows is in `handbook-notes.md` (owner suggestion), not built.
- **Coherence (3).** Three panel treatments now live in the area: Account's ledger (8 px, hairline, no shadow, asked for by judge 1), My trips and Together (16 px card, `--elev-1`), the pass plates (1.5 px edge). The orchestrator should pick one for Account or bring Together to the ledger at integration. Accept and Join show a tick at 1180 but not at 390 (a kit Button icon choice by width; not traced).
- **Craft, small:** Together's Budget "Change" sits below the "Yours" line at 820 and 1180.

## Commits
`c84fe97df2` build; `21e7a1e083`, `32f5ba7ac7`, `99c3dc070d` fixes from the lane's own review; `8db852c0bd` judge round 1 fixes; `c1c9bcb052`, `92fd8335a2`, `2dc7aaa30f` judge round 2 fixes; `427d446ba2` judge round 3 small fixes.

## Next step
For the orchestrator: decide whether the account lane merges at 100 of 135 (every hard criterion passes) or gets one more design pass on Account's ownability and the panel split (see "Still open"); apply `foundation-requests.md` (AiTag into the kit, the sparkles left in other lanes, dialog motion in the kit, the dead account rules in `21-chat-passes.css` and `24-destination-workspace.css`); read `handbook-notes.md` for ROADMAP lines (G1, G5, G10) and the shared-file effects (`16-auth.css` is global). The `.work/INDEX.md` line and the project-map line for `components/AiTag.jsx` are the orchestrator's.
