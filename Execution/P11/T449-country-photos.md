# T449: Country galleries, section photographs, and the moth

## Task ID

T449

## Date

2026-10-14

## What changed

The owner asked (2026-10-14) for a few things:
- each country to show the photographs people know it for, a few to swipe through, with a short line of text before they open it;
- a check on the images;
- an end to the Belgium card that showed "a leaf with an animal on it".

**Before.**
- A country card had no photograph of its own. It took the first photograph of the country's best-rated trail (`DestinationsTab.jsx` `askCover`). For Belgium that was trail 86628, "Promenade du Lac de Nisramont", whose photo is a Commons insect shot, `2018-11-04 Colotois pennaria (2).jpg` (a moth).
- The trail harvest's species filter matched a Latin binomial only at the start of a file name. The date in front defeated it, and the trail photo audit had no species rule at all.
- No line of text sat with a country.

**After.**
- **`src/lib/countryGallery.js`** holds three photographs for each of the 45 countries Carta covers: the view the country is best known for first, nature first where that is what it is known for, then two that complement it.
  - Belgium is now the Rozenhoedkaai in Bruges, the Tombeau du Géant on the Semois in the Ardennes, and the Grand-Place.
  - Each photograph carries its place, author, licence and Commons page.
- **One line per country**, at most ten words, in six languages (`country.known.{CC}`). For example: "Belfry towns, Ardennes forests and a long sandy coast"; "Lake Bled, Julian Alps, Soča river and Venetian Piran".
- **The five section-head photographs** that T448 chose under the narrowed rule 6 sit in the same file (`SECTION_PHOTOS`): walkers above Durdle Door, Praia da Falésia, rowing boats on Lago di Braies, the last metres to the Schneespitze summit cross, and riders on the Vlieland dike.
- T428 draws all of these. This task adds the data and the strings only.

**How the photographs were checked.**
1. Two curator agents split the countries.
   - They looked at every candidate (500 px thumbs, then contact sheets of the finals).
   - They took author and licence from the Commons metadata, including for the photographs that came from Carta's own pool.
   - Only CC0, public domain, CC BY and CC BY-SA, landscape, at least 1,600 px wide (one replacement at 1,280, noted below).
   - Of the 135 first picks, 23 came from Carta's pool. The pool's destination images were mostly weak or off-subject: a moth, a waxwork, a bear, a dog.
2. A third, independent agent fact-checked all 135 against their file pages and all 45 lines for truth, length and house rules.

It found five must-fix items. All are fixed:
- Andorra's line said "duty-free shopping". It now names Romanesque stone churches.
- The Alhambra credit dropped its photographer.
- A Lithuanian credit carried a wiki signature.
- The Jūrmala photograph was a washed-out snapshot of what is probably a different shore.
- Belgrade was under brown smog behind billboards.

I also acted on its softer points:
- **Photographs:** I replaced six more, each looked at on a contact sheet first:
  - Kirkjufell, whose CC0 rested on an unprovable Unsplash date;
  - the unnamed Moldovan vineyard stock image (now Saharna Monastery);
  - the Skopje street with a lamp post through it (now Galičica between Lake Ohrid and Lake Prespa);
  - the crowded San Marino piazza (now Guaita over the city);
  - Jūrmala;
  - Belgrade (now the Danube from the air).
- **Lines:** I rewrote six: Bulgaria, Monaco, Slovakia, Turkey, Finland (no "thousands of") and North Macedonia (it no longer names a Skopje photo the card does not show).
- **Credits:** I corrected eight from the file pages.

**The moth, at its source.**
- `pipeline/trails/trail_images.py` `SPECIES_RE` and a new `SPECIES_HEAD` rule in `continent-app/scripts/audit-trail-photos.mjs` now allow a date before the binomial. Tested on the moth's name in both spellings and on three place names that must not match.
- The file is added to `data/reports/trail_photo_patch.json` with the flag the audit now produces (`name:species`). The audit could not regenerate the patch on this machine: its category cache is missing, so a rerun would have dropped every category-based entry.
- The shipped trail wire still carries the photo until the trails are re-exported (row T449-a).

**A bug found on the way.** An admin image override on a trail wrote `img` as a plain URL, but every reader expects a trail's `img` to be an object read as `img.u`. The override blanked the photograph instead of replacing it. `applyOverride` now keeps the wire's own shape: an object for a trail, a URL for a cycle route.

## Files touched

**Created (app, mirrored in root):**
- `continent-app/src/lib/countryGallery.js` (45 countries x 3 photographs, `SECTION_PHOTOS`, `countryPhotos`, `countryKnownKey`)

**Modified (app, mirrored in root):**
- `continent-app/src/i18n/{en,de,nl,fr,es,it}.js` (45 `country.known.*` keys each)
- `continent-app/src/lib/overrides.js` (trail `img` keeps its object shape)
- `continent-app/scripts/audit-trail-photos.mjs` (`SPECIES_HEAD`, flag `name:species`)

**Modified (root):**
- `pipeline/trails/trail_images.py` (`SPECIES_RE` allows a date first)
- `data/reports/trail_photo_patch.json` (one drop: trail 86628, the moth)
- `Execution/_OPEN.md`

**Created (root):** this report.

## Commands run

```
python <scratch>/make_gallery.py "<repo>"                         # merges the curated halves, applies the fact check, writes countryGallery.js
node <scratch>/apply_known.cjs <scratch>/gallery_final.json <scratch>/known_i18n.json   # in continent-app
npm test                                                           # 375 of 375
node scripts/ci/banned-terms.mjs                                   # no banned terms
node scripts/ci/design-lint.mjs                                    # 0 new
```

The curation, fact check and replacement searches ran through the Commons API with a Carta user agent, at most one or two requests a second, and backed off on HTTP 429. The working files are scratch, not repo files. `countryGallery.js` is the record.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Countries with their own curated photographs | 0 of 45 | 45 of 45 | +45 |
| Photographs per country card | 1 (a trail's) | 3 | +2 |
| Country cards whose photograph is an animal or plant close-up | 1 (Belgium) | 0 | -1 |
| Countries with a line of text | 0 | 45, in 6 languages | +45 |
| Gallery photographs with author, licence and page recorded | n/a | 135 of 135 | |
| Fact check: must-fix items open | 5 found | 0 | -5 |
| Trail photo drop list entries | 97 | 98 | +1 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Commons answered HTTP 429 while three agents downloaded at once | Rate limit | Backoff and slower pacing in every script |
| A 640 px thumb returned HTTP 400 | Commons renders only 250, 330, 500, 960, 1280 and 1920 | Used 500 px for checks (matches `WIKI_WIDTHS` in `heroImage.js`) |
| The JS species rule missed the underscore spelling | `_` is a word character, so `\b` never fired | A `(?![a-z])` lookahead |

## What is still open

- **T449-a (owner).** The moth stays on trail 86628's card until the trail wire is re-exported with the drop list (`pipeline/trails/export_wire.py` on trailslab, then the R2 push), or `python pipeline/photos/takedown.py add "2018-11-04_Colotois_pennaria_(2).jpg"` removes it from every wire, R2 and the edge cache in one step.
- **T449-b.** `components/admin/ContentSection.jsx` `leadImage` still reads a trail's `img` as a string, so the override diff viewer shows no current photo for a trail. Also, `overrides.js` loads no `cycle` layer and nothing applies `dest` overrides (found in the T428 exploration).
- **T449-c.** The fact check's weaker photos were kept: Jökulsárlón under a grey sky, the Gauja cliffs as a 2.7:1 panorama a card crop will cut, Monaco's harbour twice, the Rugova canyon in grey February light, San Marino's first two towers alike. The new Jūrmala photograph is a 1,280 px original, under the 1,600 px floor the others meet. Swap them in `countryGallery.js` when better files are found.
- **T449-d.** `countryGallery.js` is 55 KB raw, about 12 KB gzipped. T428 decides whether it rides the Destinations chunk or is loaded on first use.

## Rollback procedure

Revert the T449 commits in both repos. `countryGallery.js` and the `country.known.*` keys are new and read by nothing until T428, so removing them changes nothing on screen. Reverting the drop list entry and the two rules restores the old harvest behaviour. The `overrides.js` change only affects trail overrides, and there are none in production yet.
