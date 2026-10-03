# T189: Loading and error states across every surface

## Task ID

T189 (mind-map T342). Branch p10-loading-error-states in both repos.

## Date

2026-10-03

## What changed

Two shared components now carry every loading and failure state that this task reached: LoadingBlock and ErrorBlock in continent-app/src/components/StateBlocks.jsx, styled by the new src/styles/27-states.css (appended to the end of the styles.css import list, nothing reordered). LoadingBlock draws hairline-free paper-dim rows at the height of the content that will replace them: 56 px for a list row, 120 px for a card, 14 px for a text line. The words ("Loading") ride along in an sr-only span with aria-busy, so a screen reader still hears them. The rows breathe in opacity only, and prefers-reduced-motion turns that off. ErrorBlock takes one already-translated sentence that says what failed and what to do, plus an optional retry made with the shared Button (T335). It never prints a raw error.message.

Surfaces converted: saved trips and saved places (loading, and the two raw error strings, which now say the saved trips did not load and offer a retry), the friends list, a friend's trip (which also stops reporting a network failure as "this trip went private"), the shared trip view (loading only), the guides list (which had no catch at all, so a failed fetch read as "no guides"; it now has an error with retry), the region page, the ready trips step, the wizard's picked trip, the destinations layer error, and the app shell error button. The two spinners (AI day plan, document import) became skeleton lines, and the locate button and the custom-stop button now breathe instead of turning. The five spinner rules and their keyframes were deleted from the stylesheets.

The empty-state copy of T211 is not used by this task: every state touched here is a loading or failure state, not an empty list, so no string from docs/ONBOARDING_AND_EMPTY_STATES.md was needed. That copy is still the proposed version, awaiting owner approval (row T211-a), and nothing here depends on it.

Four new i18n keys in six languages, all parsed: state.savedFailed, state.guidesFailed, state.friendsFailed, state.friendTripFailed. state.friendsFailed is defined but not yet wired (see open items).

## Files touched

Modified, in continent-app: src/App.jsx, src/auth/FriendTripPanel.jsx, FriendsSpoke.jsx, SavedTripsPanel.jsx, SharedTripView.jsx, src/browse/DestinationsTab.jsx, RegionPage.jsx, src/community/GuidesPanel.jsx, src/planner/AiDayPlanModal.jsx, DayAddPanel.jsx, GuidedTripWizard.jsx, MagicImportZone.jsx, ReadyTripsStep.jsx, src/i18n/{en,de,es,fr,it,nl}.js, src/styles.css, and the stylesheets 17-saved-trips, 18-detail-panel, 20-day-planner-flow, 23-places-pages, 24-destination-workspace.

Created: continent-app/src/components/StateBlocks.jsx, continent-app/src/styles/27-states.css, this report. Deleted: nothing.

## Commands run

npm run lint (0 errors, 72 warnings, all existing), npm run build (passes; dist deleted afterwards), a throwaway Vite on port 5210 serving a temporary harness page that rendered every shape at 380 px and 1280 px (harness files removed), and the six-language i18n parse.

## Config and secrets set

None.

## Before/after measurements

Counted by grep in continent-app/src on the base commit 70cba6f and on the branch.

| Metric | Before | After | Delta |
|---|---|---|---|
| CSS spinner rules (border-top rotating ring) | 5 | 0 | -5 |
| Text-only "Loading" lines in the surfaces above | 10 | 0 | -10 |
| Raw error strings printed in the saved panel | 2 | 0 | -2 |
| Fetches whose failure showed as an empty or gone state (guides list, friend trip) | 2 | 0 | -2 |

Layout check at 380 px and 1280 px: no horizontal scroll (scrollWidth equals clientWidth), skeleton heights 56, 120 and 14 px as designed.

## What broke and how it was fixed

One slip: deleting the extras-spin keyframes while two other spinner rules still used them. Caught before commit; all three users were removed in the same change. No other issues.

## What is still open

The task's done condition, "no spinner and no bare error message anywhere", is met for loading states in the files above but not for every error. Thirteen places in non-admin screens still show a service message directly (err.message || key, in AccountPanel, AuthModal, GoogleButton, ResetPasswordScreen and similar forms). Those are form errors where Supabase text such as "Invalid login credentials" is the useful part, so they need a decision on which codes to map, not a blanket swap. ReadyTripsStep and the wizard's picked-trip load have no failure path (a failed load stays on the skeleton or goes quietly empty), and state.friendsFailed is unwired for the same reason: FriendsSpoke mixes action errors with load errors in one field. The shell splash and the TabFallback pulse line are an animated rule, not a spinner, and were left. SharedTripView still folds a network failure into "gone" on purpose (its own comment explains the privacy reasoning), so that choice needs the owner. The T211 copy approval (T211-a) is unchanged.

## Rollback procedure

Revert the app commit on branch p10-loading-error-states (git revert, or reset master to 70cba6f before merge). The change is code and CSS only; no migration, no data.
