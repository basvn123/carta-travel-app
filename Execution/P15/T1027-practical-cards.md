# T1027: the place page's Practical section as swipe cards

## Task ID
T1027

## Date
2026-11-03

## What changed
The owner's asks:
- Book ahead was badly designed.
- Practical should be "really nice designed cards which I can swipe", with images where they suit the text: modern, clean, professional.
- The link buttons should be better structured and placed.
- The PDF button is not needed if the top bar offers it.
- "Prices may have changed, confirm on the booking site" goes.

A research agent looked at similar apps. It could load Lonely Planet's Rome page live and fetch Booking.com's; most other sites block automated reads, so the rest is product knowledge.
- **The rule they share:** photographs for things you can visit, colour fields and icons for facts.
- **Labels:** one or two words, with the fact as the hero.
- **Booking links:** they sit on the card that justifies them, one button plus a quiet alternative, never a wall of buttons.

**The cards** (`DestPractical.jsx`, `.pcard*`): a swipe row on a phone, bled to the screen with the next card peeking. From 700 px they form a grid where the photo card is two rows high.
1. **Book ahead:** the licensed photograph of the first sight to book (Colosseum for Rome). The sights show as tags, with "Tickets on GetYourGuide" as the button and Viator as a link. Without sights it reads "Tickets and tours".
2. **Airport:** the IATA code set large (FCO), on sun. The transfer line shows when we have one. Google Flights is the button, Skyscanner the link.
3. **Getting around** on lagoon, **Rhythm** on umber (clock icon). Transit legs and local rules are on lagoon too.
4. **Parking warning** and bans on amber.

**The quick facts** (language, money, tipping, plugs, tap water, emergency) are now soft tiles on the page ground instead of a white grid. Book ahead left them, since it is a card now.

**The PDF:** a download icon in the page bar, before Share. Share only shared the link. The button in the section is gone.

**Removed:**
- "Prices may have changed..."
- the wall of six link buttons
- the city's own parking note in Italian glued to our English sentence (see T1027-a)

## Files touched
**Modified:**
- `continent-app/src/browse/DestPractical.jsx`, `DestPracticalSlots.jsx`, `DestinationPage.jsx`, `PageBar.jsx`
- `continent-app/src/styles/88-place-template.css` (+ `.pcards`/`.pcard*`; − `.pt-out`, `.pt-outs`, `.pt-linkbtn`, `.pt-dl`; `.pt-qf` restyled)
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`:
  - +2 keys: `pc.tickets`, `pc.ticketsOn`
  - −3 keys nothing reads any more: `dest.bookGyg`, `dest.bookViator`, `prov.bookingNote`

**Created:** `Execution/P15/T1027-shots/` (gitignored)

## Commands run
- `npm test`: 1219 pass, 0 fail. `eslint` on the touched files: 0 errors, 0 warnings.
- `/simplify`, three review agents (reuse, simplification, efficiency with altitude).

  **Fixed:**
  - The sight photo now comes from the page's existing `photoMatcher` (accent folding, the `NOT_A_VIEW` filter, the gallery), not a second matcher.
  - The links are built where they land (`tours`, `flightLinks`). The unread Booking and Airbnb entries are gone.
  - The warning tone is set on the rows that warn, in `practicalSlotRows`.
  - The tones read the shared `--tone-bg`/`--tone-ink` set, and the secondary ink is one formula.
  - The swipe row joins the shared bleed rule with the tags and tabs.
  - The sight names reuse `.pt-tag`.
  - The airport line is passed only when there is one.
  - Dead imports and keys removed, stale comment fixed.

  **Skipped:** see T1027-a to T1027-c.
- Browser: `npx vite --port 5219`, then Playwright on Rome and Amsterdam at 390 × 844 and 1440 × 1000, before and after the cleanup.
  - Cards shown: Book ahead (photo loaded, 2 links), Airport (2 links), Getting around, Rhythm, Parking warning.
  - The row scrolls sideways on a phone and is a grid on desktop.
  - The PDF is in the bar ("Download PDF guide"), and not in the section.
  - The note and the Italian text are gone. No sideways page scroll.
  - One console error on one desktop run did not repeat on the next run.
  - Fixed after the first round:
    - the link buttons were underlined
    - the short cards stretched to the photo card's height on desktop

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Link buttons in Practical | 6 in a wall (Rome) | 2 cards with one button and one link each |
| Photographs in Practical | 0 | 1 (the sight to book) |
| White boxes in Practical | quick-facts grid + 4 white cells | 0 |
| Lines of disclaimer | 1 | 0 |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| Card buttons underlined | The page's link rule | `text-decoration: none` on the card button |
| Half-empty Airport card on desktop | The grid stretched every card to the photo card | The photo card spans two rows |

## What is still open
- **T1027-a:** `parking_check.py` asks for the restricted-zone note without asking for English, so Rome's is Italian. The card now shows only our sentence. Ask for English (or store the language) and refill, or stop shipping the note.
- **T1027-b:** the PDF moved to the bar on the place page only. Beach, lake, mountain and cycle pages still have it in the body. One task should give `PageBar` a generic actions slot and move them all.
- **T1027-c:** "an external link styled as a button" is hand-written in three places (`DestPractical`, `DestPriceCard`, `DayTripTransport`). Add an `href` mode to `Button`.

## Rollback procedure
`git revert` the T1027 commit (root repo). The old Practical grid, the link wall and the in-section PDF button come back.
