# T1024: the top of the place page, redesigned

## Task ID
T1024

## Date
2026-11-03

## What changed
The owner asked for the top of a place page to be modern, clean and compact. Point by point:
- **Photographs:** arrows to click, not "1 / 8"; credits off the image.
- **Identity:** a compact name, country and rating block, with the travel style removed.
- **Intro:** a nicer to read.
- **Tabs:** redesigned, without the line across the whole width.
- **Eat and drink:** the "Pricey, toward the cheap side" line removed.

Two research agents ran first:
- **Traveller research:** photos come first. Counters are overlooked, so use arrows, a peek and "show all". Credits belong in a caption. Use one compact header and an answer-first lead. Use a small sticky strip of section chips.
- **Code audit:** the phone carousel had no pointer arrows, and the credits were pills on the photo. The tab line was a border bled to the screen edges.

**Photographs** (`PhotoMosaic`, place, trip and outdoor pages):
- **Phone:** inset with 20 px corners. The next photograph peeks in. Round arrows sit on it (both tap and click), and "8 photos" opens every photograph.
- **From 700 px:** the 1 + 4 mosaic, every tile a door to all photographs, with a hover zoom.
- **Credit:** a caption line under the photographs ("Photo: Diliff, CC BY 3.0"). On a phone it follows the photo in view; from 700 px it is the large photo's. The full credits stay in the all-photos view.
- **Clean-up:** the mosaic no longer carries the old `.pgal` class.

**Identity** (`DestinationPage.jsx` head):
- the name (36 px, 48 px from 700 px)
- one line of the flag, the country, a dot, then the rating (still a jump to Why it rates)
- the standing as small tags: rank tags in umber, UNESCO in lagoon
- "Set your travel style" removed, with its `door` and `TasteLink` chain (no other caller). Your match still shows once a style is set.

**Intro:** the first sentence leads (20 px, ink), the rest follows quieter (16 px). It is split with the abbreviation-safe `sentences()` from `lib/journeys.js`, now exported. It is still English only (T446).

**Key facts:** soft tiles on the page's ground, with no box and no rules: an icon disc, the label, the value in bold. Two across on a phone, one row from 700 px.

**Tabs** (`.pt-jump`, shared with the outdoor page): a sticky row of pills inside the content column, with no line across the screen. The section in view is the filled ink pill; the others are soft.

**Eat and drink:** the price-feel verdict line is gone. The scale still says it, with its label for screen readers. The `lean` field and the two `feel.lean.*` keys went with it.

## Files touched
**Modified:**
- `continent-app/src/browse/PhotoGallery.jsx`, `DestinationPage.jsx`, `DestFood.jsx`, `WhyItMatches.jsx`, `TasteDoor.jsx`
- `continent-app/src/lib/journeys.js` (export `sentences`), `continent-app/src/lib/costIndex.js` (no `lean`)
- `continent-app/src/styles/88-place-template.css`, `74-dest-food.css`, `84-explore-overview.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (+2 keys: `destx.photosN`, `destx.photoCredit`; −2: `feel.lean.*`)
- `continent-app/tests/priceFeel.test.mjs`

**Created:** `Execution/P15/T1024-shots/`

## Commands run
- `npm test`: 1218 pass, 0 fail.
- `eslint`: 0 errors. The warnings are the files' existing fast-refresh exports.
- `impeccable detect`: `[]`.
- `/simplify`, four review agents. Fixed:
  - one slide step measured between two slides (no layout read with a hard-coded 8 px each scroll)
  - no `.pgal` override
  - the abbreviation-safe sentence split
  - the tags built as a list
  - the photo-count pill solid on the photograph, per the app's rule
  - dead code removed: the `Chip` import, the `TasteLink` chain and its CSS, the `lean` field, the `destp-match` class

  Skipped (register):
  - the intro split belongs in `build_dossier.py`
  - the tags as `Chip` tones
  - one arrow style for the four photo carousels
- Browser: `npx vite --port 5219`, then Playwright on `#dest=FCO` at 390 and 1440, full-screen shots. Two rounds plus a confirming one. The first showed:
  - **The white band behind the credit:** the shared `.pgal` rule. Fixed.
  - **The desktop price card dropped below the page:** my CSS replacement had cut the page-body column rules and the all-photos dialog styles (44 lines). They were restored from main.

  Final round: the next arrow moves the track (scroll 0 to 299), the credit sits under the photo, no travel-style link, the tab pills follow the section in view. No sideways scroll, no page errors.

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Ways to the next photo with a mouse below 700 px | 0 (swipe only) | arrows |
| Text on the photograph | counter + credit pill | "N photos" button only |
| Lines in the identity block (phone) | name, country, rating + 3 chips, style link | name, country · rating, tags |
| Line under the tabs | full width | none |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| Desktop price card below the page; all-photos dialog unstyled | My gallery CSS replacement ran up to `.pt-side` and cut 44 lines | Restored from main |
| White band and line behind the credit | The shared `.pgal` base rule | The mosaic no longer carries `.pgal` |
| Arrows unstyled | Selector `.iconbtn`; the class is `.icon-btn` | Fixed |

## What is still open
- **T1024-a:** the intro's lead sentence is split in the client. `build_dossier.py` should write the lead and the rest, and the intro should exist in all six languages (today English only, T446).
- **T1024-b:** the head's tags are a local `.pt-tag` look. Rank and UNESCO tones on `Chip` would keep the Explore cards and the place page alike.
- **T1024-c:** four photo carousels each style their own arrows (`destp-gallery-arrow`, `tphotos-arrow`, `pmos-arrow`, `.destp-v3`). Make one.
- **T1024-d (owner):** the key facts say "Sights: about 13 hours" while the intro says "about seventeen hours" (two different `visit_h` sources). Decide which one is true.

## Rollback procedure
`git revert` the T1024 commit.
