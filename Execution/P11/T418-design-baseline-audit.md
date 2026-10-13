# T418: design baseline, audit and critique (roadmap 1.2)

## Task ID

T418

## Date

2026-10-13

## What changed

The "before" for roadmap 1.2 is measured and written down in `Roadmap/1.2-baseline-audit.md`. The built V6 app was served locally and assessed four ways: an impeccable critique whose design review ran in an isolated agent (21 of 36 on the Nielsen heuristics, consistency 1 of 4), an impeccable technical audit (11 of 20), the impeccable detector by URL on 11 surfaces at two viewports, and the quality-floor walker over 107 screens. The floor holds (no horizontal scroll, heading order, one primary per view, no console errors); the system does not: seven visible button kinds, slate fills carrying eleven meanings, four rating renderings, ten price notations, 2,128 renders of functional text under 11 px, and 144 renders of accent text on the accent tint at 3.8:1. The document turns these into fifteen requirements for T419 to T424, and settles the one estimate notation (`~€87 est.`), which closes T417-c. The owner approved the T417 plan, which closes T417-a. No app code changed.

## Files touched

**Created:**
- Roadmap/1.2-baseline-audit.md
- Execution/P11/T418-design-baseline-audit.md

**Modified:**
- Execution/_OPEN.md (T417-a and T417-c closed; rows T418-a to T418-c)

Outside the repo: screenshots, walker JSON and detector JSON in `C:\Users\Gebruiker\Documents\Portfolio\design-1.2-baseline\`; the critique snapshot in `.impeccable/critique/` (gitignored).

## Commands run

```
cd continent-app
npx vite build
npx vite preview --port 5206 --strictPort        (background, stopped at the end)
node scripts/verify_quality_floor.mjs baseline --port=5206 --out=C:/Users/Gebruiker/Documents/Portfolio/design-1.2-baseline
impeccable detect --json --viewport 390x844|1440x900 http://127.0.0.1:5206/<route>   (11 routes)
impeccable critique-storage write http://127.0.0.1:5206/ <body>
```

## Config and secrets set

None.

## Before/after measurements

This task is the "before"; the table is in `Roadmap/1.2-baseline-audit.md` under Scores and Counts. "After" is measured by the last task of 1.2.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The quality-floor walker reports 0 usage contrast failures while the detector finds 144 | The walker does not resolve the accent text on `--accent-bg` pair the way the detector does | Recorded as T418-b; the baseline uses the detector figure |
| Critique order | The detector ran in the parent before the design review started, so the parent saw it first | The design review agent never saw detector output, so the review itself stays unanchored; noted here |

## What is still open

T418-a: the When step of the trip planner says "Carta will pick the cheapest departure with real stored budget fares", which contradicts the owner decision of 2026-10-02 that Carta does not price flights; a copy task fixes it. T418-b: the quality-floor walker misses the accent text on accent tint contrast pair; it should resolve tinted grounds before it is used as a contrast gate again. T418-c: five inputs have only a placeholder as their name (`AiDayPlanModal.jsx:343`, `CartaChatPlanner.jsx:569`, `SavedTripsPanel.jsx:594`, `PastTripForm.jsx:520`, `Dropdown.jsx:127`); the Field component in T421 requires a label, and the migration closes these. The three planner totals for one trip belong to roadmap 2.2 and are not raised again here.

## Rollback procedure

`git revert` the T418 commit; it holds documents only.
