# T156: One InfoDot and one glossary for the whole product

## Task ID

T156

## Date

2026-10-07

## What changed

There is now one component, `InfoDot`, and one glossary, written once. A term such as hardpack carries a small grey dot after the word. Tapping the dot opens a card with the precise name and one or two sentences. The words come from the catalogues, never from the screen that shows the dot, so a definition cannot drift between the trips side and the destinations side.

The glossary has 38 terms: the seven trip terms (hardpack, bora, hut to hut, singletrack, EHIC, vignette, TBE) and the destination set from spec 4.1, with the overlap (singletrack, hardpack, hut to hut) defined once. `src/lib/glossary.js` holds the ids, a `scope` note (trips, destinations or both) and, for terms that cannot mean anything else in running text, a `match` pattern. The two sentences per term live in all six catalogues as `glossary.<id>.term` and `glossary.<id>.text`, plus one shared aria label, `glossary.dotLabel` ("What {term} means").

The dot follows the InfoDot rule that T362 wrote into carta-design: a 6 px `--ink-mute` dot inside a real button with a 44 px box, a popover in `--bg-card` with a `--rule` border, 10 px radius, `--shadow-2`, at most 280 px wide. Escape, a second tap or a tap outside closes it and focus goes back to the dot. The Escape listener is bound on the window in the capture phase, so on a full-screen page one press closes the popover and not the page. The popover is portalled to the body and placed with `position: fixed`, flipped above the dot when there is no room and clamped inside a 380 px viewport.

Three places use it so far. The mountain page's measurements list puts a dot on Prominence and Isolation. `MixKeys` (the key under the surface and traffic bars, used by the cycling page and journeys) puts one dot after the first label that names a glossary term, so "Hardpack" explains itself. The trip page's "Why this trip" lines go through `GlossLine`, which adds a dot after the first mention of each matching term and leaves the authored words alone.

The rule behind this, from the spec, is for new content: write the simple word on the surface and put the precise word in the dot. It does not rewrite old copy.

## Files touched

Modified: `continent-app/src/browse/MountainPage.jsx`, `continent-app/src/browse/RouteFigures.jsx`, `continent-app/src/browse/TripPage.jsx`, the six catalogues `continent-app/src/i18n/{en,de,es,fr,it,nl}.js`, and `continent-app/src/styles.css` (one import line).

Created: `continent-app/src/components/InfoDot.jsx`, `continent-app/src/lib/glossary.js`, `continent-app/src/styles/31-infodot.css`, `continent-app/tests/glossary.test.mjs`, and this report.

Deleted: none.

## Commands run

In the app worktree: `npm run lint`, `node scripts/ci/design-lint.mjs`, `npm test`, `npm run build`, then `rm -rf dist dist-data`. The six catalogues were parsed with the rule 8 loop. A Vite server on port 5201 and a headless Chromium script (screenshots in `wt/T156-shots/`) checked the mountain page at 380 and 1280 px; the server was stopped afterwards.

## Config and secrets set

None. The Supabase variables were unset in every shell and nothing contacted a live project.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Glossary terms defined once | 0 | 38 | +38 |
| Catalogue keys per language for the glossary | 0 | 77 | +77 |
| Screens with an InfoDot | 0 | 3 (mountain facts, route key, trip "why" lines) | +3 |
|| Tests passing | 212 | 217 | +5 |
| Lint errors | 0 | 0 | 0 |
| design-lint violations beyond baseline | 0 | 0 (196 of 196) | 0 |

The test count before is 217 minus the five tests in `tests/glossary.test.mjs`. Lint, design-lint and test figures come from the runs in this worktree.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First headless run found no dot | The cold dev server took about a minute to compile and the page was read too early | Waited longer; the second run found both dots on the mountain page |
| Test could not import `InfoDot.jsx` | Node's test runner does not load JSX | Moved the cut-the-line logic into `glossarySplit` in `glossary.js`, which `GlossLine` now calls, and tested that |
| A multi-line scripted edit silently did nothing on three files | Those files use CRLF line endings | Edited through a helper that normalises line endings |

## What is still open

The dot is on three screens. The rest of the spec 4.1 surfaces (trail page, beach and lake pages, the cycling surface line) do not use it yet; each needs a screen that knows which term it is showing. The register row T156-a points at this.

The glossary wording in German, Spanish, French, Italian and Dutch was written for this task and has not been read by a native speaker. Row T156-b asks the owner for a read.

The rule "one dot per term per view" is kept by each caller (`MixKeys` and `GlossLine` dedupe within themselves), not by a shared scope. Two lists on one page could both show a dot for hardpack. Rolling out to more screens is the moment to decide whether a page-level scope is worth building.

Rollback: revert the app commit on `p10-c7-infodot-glossary`. Nothing is migrated and no data changes.

## The seven carta-design questions

1. No hex value was added outside `:root`; the CSS uses tokens only.
2. No gradient, no new colour, no second saturated hue. The dot is `--ink-mute`.
3. Ochre, teal and `--danger` are not used.
4. No mono text was added. The popover is all `--ui`.
5. No button was added that competes as a primary; the dot is a bare control.
6. The copy has no em dashes, no middots and no banned words (checked by the glossary test for marks, and by reading for words). The term is the headline of each card and the sentences carry the meaning.
7. Removed: a first idea of a glossary page and an "i in a circle" icon. The dot carries everything.
