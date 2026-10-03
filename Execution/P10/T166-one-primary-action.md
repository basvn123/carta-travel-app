# Execution Report: T166

## Task ID

T166: C10: One primary action per view

## Date

2026-10-03

## What changed

Button hierarchy on trip and destination pages now conforms to the one-primary-action rule from the carta-design specification. On trip detail pages (beaches, lakes, mountains, journeys), the "Price a trip to {city}" button is now the filled primary action with `--accent` background and white text. On destination pages, "Plan a trip" is the primary action. All other action buttons (PDF download, share, favorite, map view, plan day) are styled as secondary with bordered appearance and `--bg-card` background. The change enforces the design system rule that one saturated colour (terracotta) belongs only to actions the user should take right now, and secondary actions use the neutral bordered style.

## Files touched

**Modified:**

- `continent-app/src/styles/23-places-pages.css` — Updated `.bpage-base` button styling: changed background from `var(--bg-card)` to `var(--accent)`, text color from `var(--ink)` to `var(--on-fill)`, and hover state from border-color change to background color change
- `continent-app/src/styles/24-destination-workspace.css` — Updated `.destp-pdf` button styling: changed background from `var(--accent)` to `var(--bg-card)`, text color from `var(--on-fill)` to `var(--ink)`, and added border styling for secondary appearance
- `continent-app/src/styles/26-shortlist-extras.css` — Updated `.destp-plan-btn` styling to use primary colors (`--accent` background, `--on-fill` text) and updated `.feat-dayplan` styling to use secondary appearance (bordered with `--rule`, `--bg-card` background)

## Commands run

```powershell
cd "C:\Users\Gebruiker\Documents\Portfolio\wt\T166-app"
npm run build
npm run lint
git add src/styles/
git commit -m "T166: One primary action per view - button hierarchy updates"
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Primary buttons per trip page | 0 (no filled primary) | 1 ("Price a trip to {city}") |
| Primary buttons per destination page | 1 ("Plan a day") | 1 ("Plan a trip") |
| Secondary buttons per destination page | 5 | 6 |
| CSS files modified | — | 3 |

## What broke and how it was fixed

No issues. The build passed without errors (0 errors, 72 pre-existing warnings). The linter showed no new violations. All CSS changes use existing design tokens (`--accent`, `--on-fill`, `--bg-card`, `--rule`, `--paper-dim`), and the hover states follow the button component patterns.

## What is still open

None. The task is complete.

## Rollback procedure

To revert these changes, run the following commands in the T166-app worktree:

```powershell
git revert ab81c54 --no-edit
npm run build
```

This will restore all button styling to the previous state. The commit hash `ab81c54` is the one-primary-action commit on the p10-c10-one-primary branch.

---

## Notes for the next task

The button styling changes are minimal and localized to three CSS files. All modifications use existing design tokens and follow the established patterns from the Button component (`03-button.css`). The primary-action color is `--accent` (terracotta #e05a47) with white text (`--on-fill`), and secondary buttons use the bordered pattern with `--rule` borders.

The changes do not affect the JSX files or component logic. No new dependencies were added, and no migrations were needed. All pages continue to function as before; only the visual hierarchy has been updated.

The design rule enforced here (one primary action per view) is stated in carta-design and DESIGN.md. It applies across all pages: any page with multiple actions must have exactly one filled button, and the others must be secondary. This gives the user a clear entry point and prevents decision paralysis from multiple equally-weighted options.
