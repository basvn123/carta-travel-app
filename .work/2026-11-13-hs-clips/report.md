# Clips lane: the home tour's recordings in the house style (G14, G1)

Run folder `.work/2026-11-13-hs-clips/`, branch `p15-housestyle` (worktree `wt/housestyle`), 2026-11-17. Level L2. crew:design was cut to fit: this lane re-records screens other lanes built, so there were no layout directions to propose. The run was probe, fix, record, then three rounds of fresh judges.

## What changed

### The recorder (`continent-app/scripts/record_home_clips.mjs`)
- **Frozen clips (the brief's known issue).** The house style moved My trips (`.saved-trips-panel`), a Together group (`.tg-panel`) and the trip page (`.pf.is-trip-page`; the old `.tpg-body` no longer exists) into their own scrollers. The Explore list stays mounted under them at the same size, so the "largest scroller" guess scrolled a hidden list. The trips, together and **plan** clips filmed one frame (plan was frozen too, not only the two the home lane found). Every chapter now names its scroller, and `glide` throws when a named scroller is missing, so a markup change can no longer freeze a clip without anyone noticing.
- **Real-time playback.** The FFmpeg concat list gave every 60 fps screencast frame at least one 25 fps tick. Moves played up to 40 percent slow, and every clip ran about 3 s longer than its move. Frames are now resampled to a true 30 fps sequence, so a clip lasts exactly as long as its move.
- **share** scrolls only the day drawer and stops with "Export and share" just above the tab bar. `scrollIntoView` had shifted an outer frame and left the bottom half of the phone empty.
- **ask** types the question in the clip's own language. It was English in all six before. The question is "A week by the sea in September", with no budget: the old "under €80 a day" sat over answers of €126 to €166 a day. The field is focused before recording starts, and a short answer is held still instead of scrolling a hidden list.
- **explore** scrolls Lake Bled's map (`.dmap`) into view off the record so its tiles load first. **place** and **explore** open on the story's July week.
- A take recorded at under 15 frames a second prints a warning. A loaded machine drops frames and stalls the typing.

### App fixes the clips exposed (visual only, in other lanes' files; please review)
- **Ask Carta's places** (`browse/ask/AskTurn.jsx`, `browse/AskSearchFull.jsx`, `styles/76-ask-chat.css`). They drew PlaceOverview's old row, which the house style no longer styles: names in link blue, no photo, and flag, country and save each on their own line. They now draw the house `PlaceRow` with the same props, as Explore and the map do. The sheet gives its rows the phone list's lines, because it is a narrow column at every width and is not an `xlist` container. The old 56 px media and gap overrides, which fought the grid, are gone. Checked at 360, 390, 820, 1180 and 1440 (`shots/ask-*.png`): every row carries `xrow-hs`, and nothing overflows. No behaviour changed: same click, same save, same names.
- **Trip page dock** (`planner/TripSummary.css`). On a phone, "Plan your days" ran off the screen in fr ("Planifiez vos journées") and it ("Pianifica le tue giornate"). The button may now shrink, and its label wraps to two lines.

## The clips (staged, not in `public/`)
`public-staging/home/clips/<lang>/<id>.mp4|webp`: 54 clips, 9 chapters in 6 languages. The table gives the mp4 size and length. Every clip is within the 20 KB to 1.6 MB budget. Every clip has a frame strip in `strips/<lang>-<id>.png` (frames at 5, 30, 55, 80 and 97 percent), and each strip was looked at by me and by a judge.

| chapter | en | nl | de | fr | es | it |
|---|---|---|---|---|---|---|
| ask | 339 KB, 11.5 s | 367 KB, 11.7 s | 376 KB, 11.7 s | 380 KB, 11.9 s | 383 KB, 12.1 s | 365 KB, 11.8 s |
| explore | 1285 KB, 12.5 s | 894 KB, 14.9 s | 1218 KB, 12.6 s | 1479 KB, 12.5 s | 1483 KB, 12.5 s | 1365 KB, 12.8 s |
| trips | 292 KB, 6.9 s | 228 KB, 8.1 s | 415 KB, 6.9 s | 378 KB, 6.9 s | 360 KB, 6.9 s | 363 KB, 7.0 s |
| together | 168 KB, 7.1 s | 175 KB, 7.1 s | 174 KB, 7.1 s | 158 KB, 7.1 s | 172 KB, 7.1 s | 168 KB, 7.1 s |
| find | 734 KB, 8.0 s | 755 KB, 8.0 s | 778 KB, 8.0 s | 770 KB, 8.0 s | 776 KB, 8.0 s | 771 KB, 8.0 s |
| place | 476 KB, 9.6 s | 439 KB, 9.6 s | 541 KB, 9.6 s | 429 KB, 9.5 s | 518 KB, 9.6 s | 454 KB, 9.9 s |
| plan | 537 KB, 10.4 s | 546 KB, 10.3 s | 636 KB, 10.4 s | 568 KB, 10.4 s | 591 KB, 10.4 s | 654 KB, 10.3 s |
| day | 117 KB, 7.7 s | 134 KB, 7.7 s | 151 KB, 7.9 s | 133 KB, 7.7 s | 116 KB, 7.7 s | 131 KB, 7.9 s |
| share | 96 KB, 7.8 s | 102 KB, 7.7 s | 104 KB, 7.8 s | 106 KB, 7.7 s | 105 KB, 7.8 s | 103 KB, 7.8 s |

What each clip shows:
- **together**: the group's members, the dates and places with votes, the shared budget, the trip's price and Settle up.
- **trips**: a saved trip's board, down to Upcoming, Planning and Friends.
- **plan**: from the trip's total down to its route.
- **day**: the day's map, then down to its stops.
- **share**: the day kit, ending on Export and share.
- **ask**: the question typed in the clip's language, then Carta's answer in house rows.
- **find**: lakes in the Alps in July.
- **place** and **explore**: Lake Bled's page, with explore going on to the loaded map and what to see.

## Judges
- `judgement-clips-1.md`: FIX. Found the unstyled Ask rows, the English and over-budget question, the blank Explore map, the share drawer's empty half and the fr and it dock overflow. All are fixed above.
- `judgement-clips-2.md`: FIX, 7/10, with 51 of 54 passing. nl explore had a blank map (the fixed warm-up scroll), it ask filmed an idle field, and de day dropped frames. All three are fixed and retaken, and all six ask clips were retaken with the new setup.
- `judgement-clips-3.md`: FIX, 7/10, on the eight retaken clips. Seven passed, and nl explore and de day are fixed. fr ask failed: 4 s of still dots and grey row photos. The ask clip now waits for the answer's places and their photos instead of a fixed 6 s (`451711986f`), and all six ask clips were retaken. I checked them at 1 fps: typing is done in about 4 s, the dots last about 1 s, and the rows arrive with photos. The clips run 11.5 to 12.1 s. No fourth judge ran on this last retake.
- What the ask clips still show: for under 1 s (about 1 s in es), the Explore tab appears between the home page and the Ask sheet, because Ask opens its sheet over Explore. That is the app's real behaviour, so it was not cut from the clip. The orchestrator may want to look at that transition.

## Checks
- `npm test`: 2141 tests, 23 fail both before and after this lane (`npmtest.log`, `npmtest2.log`). There are no new failures; the baseline is listed in `handbook-notes.md`.
- `npm run lint`: 0 errors. `design-lint`: 0 new violations. `token-contrast`: 0 under the floor.
- `verify_axe` home and trip at 390, 820 and 1440: home passes at every width, and trip passes at 390 and 1440. trip@820 has one serious issue on the cost card's food row, which was there before and is not touched here. An axe pass on the Ask sheet found the "See a trip to {place}" label mismatch, which was there before (handed over in `handbook-notes.md`).
- `verify_trip_page` was not run: it spawns its own preview of a full build and covers a different trip page (TripPage.jsx).
- The impeccable detector was not run. The only CSS changes are 14 lines in two files, and both were checked by screenshot.

## Not done, and why
- The clips are not copied into `continent-app/public/home/clips/`, which is protected: that is an owner step (`handbook-notes.md`).
- Ask honouring a typed day budget is engine logic, so it was not changed. It is recorded as a question for the owner.
- The fixture names stay English in every language ("Summer 2027", "Alps hut tour", "Lake weekend"). This is optional and noted.

## Undo
Revert the six commits on `p15-housestyle`, newest first. None is one-way; there are no data or schema changes:
`git revert 451711986f 0e6b5f9a79 dae50dd8f4 03f88ad2ef 133fc152a6 fb8631121c`.
To undo only the app fixes, revert `03f88ad2ef`. The staged clips live only in this run folder.

## Files changed
- `continent-app/scripts/record_home_clips.mjs`
- `continent-app/src/browse/ask/AskTurn.jsx`
- `continent-app/src/browse/AskSearchFull.jsx`
- `continent-app/src/styles/76-ask-chat.css`
- `continent-app/src/planner/TripSummary.css`
