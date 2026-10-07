# T158: Translate every number into a sentence a person would say

## Task ID

T158

## Date

2026-10-07

## What changed

There is now one translation table, `continent-app/src/lib/numberSentences.js`. For each metric the product surfaces it says what the figure means, in a sentence a person would say. The figure stays in mono where it was; the sentence sits under or beside it in sans (`.numsent`, `--ui` 13 px `--ink-soft`).

Each metric in the table carries its source field, the list of catalogue keys it can return, and a `say(value, ctx)` function that picks a band and returns a key and variables. A screen calls `numberSentence(metric, value, { t, lang })`. A figure that cannot be read returns an empty string, never an invented sentence. To surface a new metric, add it to the table with its sentences in the six catalogues in the same commit; `tests/numberSentences.test.mjs` fails if a metric has no sample, an unreachable key, a missing translation or a lost variable.

Ten metrics are in the table: height, prominence, isolation, mountain difficulty, view area, paved share, traffic-free share, steepest grade, sac scale and bathing water. Eight have new sentences (32 strings in each of the six languages). The sac scale entry points at the sentences the trail page already writes (`trailStory.js`, `SAC_KEY`) so those words live once.

They are shown on three screens. The mountain page's measurements list now has a sentence under height, prominence, easiest way up, view and isolation, for example "Rises 2,136 m above the lowest pass linking it to anything higher, so it stands alone rather than sitting on a ridge." The cycling page puts a sentence under the surface line and the traffic line ("Smooth tarmac all the way. A road bike is fine."). The bathing water block on a destination page puts one under the share of excellent sites. The sentences use the thresholds written in the table; the bands are mine and are open to the owner's edit.

## Files touched

Modified: `continent-app/src/browse/MountainPage.jsx`, `continent-app/src/browse/CyclePage.jsx`, `continent-app/src/browse/BathingWater.jsx`, the six catalogues in `continent-app/src/i18n/`, `continent-app/src/styles/31-infodot.css`.

Created: `continent-app/src/lib/numberSentences.js`, `continent-app/tests/numberSentences.test.mjs`, and this report.

Deleted: none.

## Commands run

In the app worktree: `npm run lint`, `node scripts/ci/design-lint.mjs`, `npm test`, `npm run build`, `rm -rf dist dist-data`, and the rule 8 catalogue parse loop. A Vite server on 5201 and a headless Chromium script checked the mountain page and a cycling route (#cycle=1150&cc=AT) at 380 and 1280 px; screenshots are in `wt/T156-shots/` (T158-*.png). The server was stopped.

## Config and secrets set

None. Supabase variables were unset; no live contact.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Metrics in the translation table | 0 | 10 | +10 |
| New sentence strings per language | 0 | 32 | +32 |
| Sentences shown on the Dachstein mountain page | 0 | 5 | +5 |
| Sentences shown on cycling route 1150 (AT) | 0 | 2 | +2 |
| Tests passing | 217 | 222 | +5 |
| Lint errors, new design-lint violations | 0, 0 | 0, 0 | 0 |

Test counts come from `npm test` in this worktree before and after. Sentence counts come from the headless run. The bathing water sentence was not seen in a browser; it is covered by the table test only.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first headless runs timed out | The cold dev server took four minutes to compile on a loaded laptop | Warmed it with curl before the browser run |
| A sentence inside a mono cell would have rendered in mono | The cell sets `font-family: var(--mono)` | `.numsent` sets its own face and number style |

## What is still open

The table covers every metric the pages above surface today. The trail page's steepest grade has a table entry and four sentences but is not shown: the trail page still prints its older sentence, "the steepest stretch runs at 36%". Wiring it needs a change to `trailStory.js`, which this task did not name. The swim season, wave height and the "ten seasons running" bathing figure from spec 4.2 have no data in the wire yet, so they have no entry; they join the table when the data lands. Row T158-a covers the trail wiring, row T158-b the missing data metrics, and row T158-c asks the owner to look at the band thresholds and the German, Spanish, French, Italian and Dutch wording.

Rollback: revert the app commit on `p10-numbers-as-sentences`. No data or migrations.

## The seven carta-design questions

1. No hex values; tokens only.
2. No gradient, no new colour, one accent unchanged.
3. Ochre, teal and `--danger` are not used.
4. Figures stay in mono; the sentences are prose and set in `--ui`, including inside mono cells.
5. No button was added.
6. Sentences are plain and carry the figure or its meaning; no em dashes, middots or banned words (checked by the test for marks).
7. Removed: the idea of a second line of badges beside each figure. The sentence alone carries it.
