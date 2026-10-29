# T834: trip page v4 board

## Task ID

T834 (Batch 0 of the trip page v4 plan, `Execution/P15/_PLAN-trip-page-v4.md`). T833 was the highest number in `git log --all` and in `Execution/`.

## Date

2026-10-29

## What changed

The owner sent two screenshots of the live trip page, an audit (`Downloads/plan carta.md`) and a reference board (`Downloads/plan carta.pdf`, image only: Mindtrip, Booking, Airbnb, Wanderlog and Carta today). From these a plan was written: no edit mode, every fact changed where it is shown, and Undo for every change. The owner chose "board first".

The board is published at https://claude.ai/artifact/DkrztyyjBAdUd4AEnS69C4 (private). It draws eleven screens, each twice: at 390 px in a phone frame and at 1440 px in a desktop frame scaled to fit. They use Carta's token values from `continent-app/src/styles/01-tokens.css`, Figtree and the kit shapes, with the Austria trip's figures as examples. The screens are:

1. the head with chip editors;
2. People, From and the name in place;
3. Overview with the cost band, rail, budget card and dock;
4. Itinerary as the route editor;
5. nights balancing;
6. Change flight;
7. Swap city;
8. Costs as the editable receipt;
9. Days with pace, lock and Ideas;
10. Share apart from settings;
11. Undo.

Each panel has Keep, Change or Drop and a note. Four questions (D1 Undo and Redo, D2 stay per stop, D3 pace per day, D4 day trips) have their own choice buttons. Marks save to the artifact's `db` (collection `marks`, doc id = panel or question id, plus `notes/general`), so the next task reads them back with ArtifactData. No app code changed.

## Files touched

**Created:**
- `Execution/P15/_PLAN-trip-page-v4.md` (the plan: batches 0 to E, phone and desktop rules, decisions)
- `Execution/P15/T834-board/trip-page-v4-board.html` (the published board's source)
- `Execution/P15/T834-trip-page-v4-board.md` (this report)

**Modified:**
- `Execution/_OPEN.md` (two rows)

## Commands run

- `pdftotext` on the PDF returned no text, so the 16 embedded JPEGs were carved out with a short Python script in the scratchpad and read as images.
- One Playwright render of the board at 1280 and 390 px: no page errors, no horizontal scroll at 390.
- Artifact publish with `capabilities: {db: {}}`.
- ArtifactData `list marks`: the store answers and is empty, as expected before marking.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Desktop frames cut off beside the phone | A 960 px frame in a 640 px column | Desktop frame now spans the panel width, scaled with `zoom` (never below 0.5, then it scrolls); the phone sits under it beside the bullet list |
| Day cost and map labels wrapped to three lines | No nowrap on short figures | `white-space: nowrap` on them |

## What is still open

- **T834-a.** Mark the board: Keep, Change or Drop per panel, with notes. Owner. Batch A starts from those marks.
- **T834-b.** Answer D1 to D4 on the board. D1 changes Carta's Undo rule; D2 and D3 change the trip model and the price engine. Owner.

Rows this plan will take up later: T809-a, T812-a, T812-b, T818-a, T823-a and T832-a.

**Screens for the end check of each later batch:** every panel above, at 360, 390, 768, 1024 and 1440 px.

## Rollback

Revert the commit. The artifact can be deleted from claude.ai if it is no longer wanted. No app code or data changed.
