# T335: one shared Button, after the tokens

## Task ID

T335 (register rows T197-d and T197-a). Branch p11-shared-button in both repos.

## Date

2026-10-03

## What changed

Carta now has one shared button, `continent-app/src/components/Button.jsx`, styled by `src/styles/03-button.css`. It has four variants (primary, secondary, ghost, danger) and two sizes (md, sm). It defaults to `type="button"`, passes every other prop through, and is a `forwardRef` component because React 18 does not forward `ref` as a prop.

It was read from shadcn/ui's Button, as T197's contract says, not installed. From shadcn I took the idea of one component with named variants and sizes and the native button semantics. I left behind Tailwind, class-variance-authority, Radix Slot, the zinc palette, ring focus and every `dark:` class. No dependency was added. The file header records the source, date and MIT licence.

The CSS uses only tokens. The label on a fill is `--on-fill`. Fills are `--accent` (primary) and `--danger` (danger), with `--accent-hover` and `--danger-dark` for hover. The secondary border is `--rule`. Ghost is accent text with an `--accent-bg` hover. Focus is the 2px accent outline. Radius is 6 px. Height is `--tap`. Transitions are colour only and switch off under reduced motion. No hex, gradient or shadow. T191's note also named `--ink-fill`; no variant needs it, because it belongs to an active toggle, which a plain button is not.

It is adopted in three places as proof. ErrorBoundary's two buttons (Reload the app is primary, Try again is secondary) replace `.crash-btn`. MaintenanceGate's retry replaces `.maintenance-retry`. AnnouncementBar's "extend your pass" is a small ghost Button that keeps the `.site-banner-action` class for layout only. I removed `.crash-btn` and `.maintenance-retry`, and the look of `.site-banner-action`, from the style files. Visible changes at those three sites, by design: the crash buttons go from pills to 6 px radius and from about 38 px to 44 px high; the retry goes from 8 px to 6 px radius; the banner action keeps its look but gets a 32 px minimum height on a fine pointer and 44 px on a coarse one. Nothing else in the build's visual output changed.

T197-a, the detector gate: I ran T196's design lint on the result. `node scripts/ci/design-lint.mjs` reports 204 violations found, 204 in the baseline, 0 new, so Button.jsx and 03-button.css add nothing. `--self-test` passes (11 seeded violations across 9 rules caught, clean fixture silent). The lint scans src, so the two new files were in the scan. The grep checklist from COMPONENT_ROLES.md (hex, gradient, box-shadow, dark:, rounded-, outline none) also finds nothing in the new files. The detector exists now, so the gate is no longer vacuous. This is its first real run on a lifted component and it was silent. That is the expected result, not proof of coverage: the lint checks a handful of text patterns and does not judge layout or DESIGN.md's seven questions.

## Files touched

Application repo (continent-app, branch p11-shared-button, commit 798c357):

**Created:** src/components/Button.jsx, src/styles/03-button.css.

**Modified:** src/styles.css (one new import after 02-base, nothing reordered), src/styles/18-detail-panel.css (removed .crash-btn), src/styles/22-account-admin.css (removed .maintenance-retry, slimmed .site-banner-action to layout), src/components/ErrorBoundary.jsx, MaintenanceGate.jsx, AnnouncementBar.jsx.

Root repo: Execution/P11/T335-shared-button.md, Execution/_OPEN.md.

## Commands run

From the app worktree: `node scripts/ci/design-lint.mjs`, with `--self-test`, and with `--root scripts/ci/fixtures/design-lint/good`; `npx eslint` on the four component files (clean); `npx vite build --outDir ../T335-dist` (passes; the directory was deleted afterwards and no dist/ exists in the worktree). For the browser check I put a throwaway harness page (`_t335.html` and `_t335.jsx`) in the app worktree, ran Vite on 5209, and took screenshots with Playwright at 380 and 1280 px. The harness files were deleted before the commit and the Vite process was stopped.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Button class families in src/styles (T197's grep, `^\.[a-z][a-z0-9-]*(btn\|button)`) | 90 | 89 | -1 |
| design-lint, new violations against the baseline | n/a | 0 (204 of 204) | 0 |
| Built main CSS (assets/index-*.css) | 675,541 bytes (T191 report) | 676,020 bytes | +479 |
| Runtime dependencies | 5 | 5 | 0 |

The family count falls by one because `.maintenance-retry` and `.site-banner-action` never matched the pattern, so only `.crash-btn` left it. 89 families are still to migrate.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First Playwright load timed out | Vite was optimising dependencies on the first request | Reloaded with domcontentloaded and a longer timeout |
| Edited style files showed whole-file diffs | A Python read converted CRLF to LF | Normalised the touched files back to CRLF; the diff is now only the intended lines |

## Checked in the browser

At 380 and 1280 px, with the real ErrorBoundary rendering a thrown error, plus replicas of the maintenance card and the banner built from the real classes and the real Button. All three sites render. Buttons are 6 px radius and 44 px high (the banner action is 32 px under a fine pointer). The focus ring shows on Tab, and the disabled and danger variants look right. The maintenance and banner pages were replicas because those two components need site config and paywall context. I did not run the full app against a live Supabase.

## What is still open

T335-a: 89 button class families still restate their own height, radius and colour; migrate them in batches, one surface per task, each with a before and after screenshot. T335-b: the `sm` size is 32 px high on a fine pointer, which breaks the contract's "at least --tap" line. I kept it because the banner is a compact bar and a 44 px button changes its shape; it is 44 px on touch. Either bless the exception in COMPONENT_ROLES.md or drop `sm`; that is a design call for the owner. T335-c: the real MaintenanceGate and AnnouncementBar were checked as replicas; someone with the paywall mock (`?paymock`) and a maintenance flag should see both once. Closed by this task: T197-d and T197-a.

## Rollback procedure

In the app repo `git revert 798c357`, or reset the branch to its base, 2b187d5. In the root repo revert the report commit; the register edits come back with it. No schema, data or deployed state is involved.
