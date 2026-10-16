# T434 critique, after (2026-10-16)

Method: dual-agent, as before. Assessment A (`assessment-a-after.md`) and Assessment B with the impeccable audit (`assessment-b-after.md`, `audit-after.md`) ran isolated. Frames: `../T434-shots/after/` (360, 390, 820, 1440 px; English and German).

## Score

| # | Heuristic | Before | After | Key issue left |
|---|---|---|---|---|
| 1 | Visibility of system status | 2 | 3 | The record map is a blank box until WebGL draws (no still drawing of the countries yet) |
| 2 | Match with the real world | 2 | 3 | Plain words now; German country names were English (fixed in the batch below) |
| 3 | User control and freedom | 3 | 3 | Undo everywhere; a new invite link on every copy (fixed below) |
| 4 | Consistency and standards | 1 | 3 | On the kit and Explore's own price and save controls; the record map still paints in brown (row T434-c) |
| 5 | Error prevention | 3 | 2 | "for 2" beside "Only you"; joining by link makes you friends without saying so (both fixed below) |
| 6 | Recognition rather than recall | 2 | 3 | The focal card answers cost, weather, days planned and who |
| 7 | Flexibility and efficiency | 2 | 3 | Type, order and year filters; plan a trip from the shortlist |
| 8 | Aesthetic and minimalist design | 2 | 3 | Much calmer; the empty map box |
| 9 | Error recovery | 3 | 3 | |
| 10 | Help and documentation | 2 | 2 | What an invite link lets its holder do was unsaid (fixed below) |
| | **Total** | **22/40** | **28/40** | Good (low) |

Audit: **10/20 before, 15/20 after** (accessibility, performance, responsive, theming and implementation 3 each). Issues: P1 9 to 1, P2 14 to 7, P3 6 to 5. The detector found no undersized text inside the page any more; its remaining in-page hits were a heading skip (fixed below) and false positives from the kit Card's stretched title button.

## The one fix batch after the critique

- The focal card's "Going" reads the same party the price is for, so it never says "for 2" beside "Only you". Days to plan are nights plus one (a six-night trip has seven days).
- "Copy invite link" reuses the trip's live link instead of minting a new one each tap, and one line says what it does: "Anyone with the link can sign in and join. Joining makes you friends."
- The share panel scrolls into view and takes focus when "Invite" opens it; the button carries `aria-controls`.
- Country names in titles, flags and the countries sheet go through `Intl.DisplayNames` (Deutschland, Österreich); the sheet sorts by the shown name. A country already on the record explains itself in a line, not a tooltip.
- The four facts stay two by two at 360 px, so "Open trip" rises.
- The German price may wrap in its cell instead of overflowing.
- Side-panel tiles: the arrow keys step one row; the phone row keeps three columns.
- On touch the inline map drops its zoom buttons (the shield opened the map instead of zooming).
- The year filter counts only that year's memories.
- Headings: h1, then the section's h2 (screen readers), then h3 sections and cards, h4 years.
- The card menu closes when focus tabs out of it.
- The guide map's padding is one object for the page, so "Copy link" no longer re-frames it.
- Old `.tshare` margin and border rules no longer leak into the new panel.

## What stays open

The past-trip form (raw buttons, storage-full loss, row T434-b), the brown record map (T434-c), no URL for the page (T434-d), and a still ink drawing while the record map loads (folded into T434-c). Guides and the share panel with live data were not opened in the browser by B: the share panel needs a signed-in account.
