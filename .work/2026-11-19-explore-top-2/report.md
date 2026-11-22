# Run report: Explore round 2 (search bar, filters, corners, speed)

- **Status:** pushed at the owner's request; judge 1 FAIL (3.56) with its UI fixes then made (9329d4485e); tab-switch speed still open
- **Date:** 2026-11-19 · L2 · crew:design via deep-task, the session orchestrated only · ROADMAP G12, D10
- **Proposal approved:** https://claude.ai/artifact/RYAU3z8nW8eoRcmxrFZLDh with owner changes O1 to O5 (`decision.md`)
- **Branch:** `p15-explore-top-2` from main 2130dd56ee, fast-forwarded to main
- **Undo:** `git revert` the run's commits (6b817428df to the report commit); no data or schema change

## Summary
The search field has its search button on the right; Ask Carta is its own button outside the field (side panel on desktop, sheet on a phone). Shortcuts and real filters live in the search: day high in the When month in °C bands, water, walking, kind of place, a day's budget, good to know, Sort (For you first with a style) and Saved, applied as one row of removable chips. The desktop band sits on one grid with equal 16 px gaps; the bottom nav keeps its words; the heart and the phone's Map sit in fixed corners; rail arrows sit on the photos' middle; Map is a List | Map switch on desktop. Explore is much faster: load blocking from 54 to 95 s down to about 4 to 8 s (CPU 4x), settings changes from 4 to 14 s down to 0.3 to 0.7 s, filter count in about 15 ms; no layout shift on switches and while the phone band folds.

## Checks
- Full npm test: 2353 tests, 2316 pass, 24 fail (the Windows and timeout base set seen on main).
- verify_band, verify_filters (300/300), verify_rail_arrows 38/38, verify_smooth 324/324, verify_destinations; eslint 0 errors; impeccable clean.
- Flow checkers (search, filters, corners and app) and judge 1 (`judgement-1.md`, owner screenshots in `result/`).

## Open
- Tab switch: the first switch to a layer prices every place in one render (about 0.9 to 1.4 s at CPU 4x); next: price in slices off the render, switch as a transition.
- Setting changes 0.4 to 0.7 s at CPU 4x on desktop (target 0.3 s); the remaining load task of about 3 s is the first Explore render.
- The trip-length row's sticky top shows a strip of list while the phone band is folded.
- Sea water warmth not in the data (no filter claims it).
