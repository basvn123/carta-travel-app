# T1170: Six complete languages, code half (ROADMAP I8)

## Date

2026-11-07

## What changed

The five non-English catalogues now carry every English key: 0 missing in nl, de, fr, es and it (before: 583 in nl and 651 in each of the others, measured on en.js at 10,023 keys). The new strings were translated in this session (no Claude API) and sit at the end of each file under a "machine-drafted" comment; `docs/i18n/review.md` lists them for the owner's native review. `tests/i18nParity.test.mjs` is in `npm test` and fails on a missing key, an extra key, an empty value, an em or en dash, or a `{placeholder}` English lacks. The first visit now follows the browser language (`src/i18n/detect.js`, first shipped language in `navigator.languages`, else English); a saved picker choice still wins. The display currency choice does not fit this scope and is a register row.

## Research

None chosen as a tool or library: detection is a 15-line function over `navigator.languages`, and translation was done by the session itself as the brief requires.

## Files touched

- `continent-app/src/i18n/{nl,de,fr,es,it}.js` (appended keys)
- `continent-app/src/i18n/detect.js` (new), `continent-app/src/i18n/index.jsx` (first visit)
- `continent-app/tests/i18nParity.test.mjs` (new)
- `docs/i18n/review.md` (new), `docs/HANDBOOK.md` (Languages), `ROADMAP.md` (I8), `Execution/_OPEN.md`

## Commands run

`node --test tests/i18nParity.test.mjs`; `npm test` (1851 pass, 0 fail); eslint on `src/i18n` and the test; `node scripts/ci/design-lint.mjs` (0 new). Full pytest not run: the container has no pytest and this task touches no Python.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Missing keys nl | 583 | 0 | -583 |
| Missing keys de, fr, es, it | 651 each | 0 | -651 each |
| Parity tests in npm test | 0 | 21 | +21 |

The brief's 525 (2026-11-04) had grown to 583 and 651 by today (admin, support, press and aiPage keys were added since). Other batch 10 sessions add `pwa.*`, `paywall.*` and `partner.*` keys; the parity test will fail on them until those keys are translated, which is intended.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `npm test` failed on react import | node_modules absent in the container | `npm ci` |
| Placeholder check failed on 8 old strings | Existing translations drop a variable (`cov.reason.wayOnly`, `open.trail.sub`) | Test allows dropping a variable, forbids inventing one |
| `day.place`, `day.poiDepthNote`, `day.townDepthNote` | The English source strings are cut off mid-sentence | Translated as given; row T1170-c |

## Screens checked

Not checked in a browser (cloud container, no traveller screen changed beyond language choice). Static checks only.

## What is still open

Native review of every drafted string (T1170-a). Display currency choice (T1170-b). Cut-off English strings (T1170-c). Place intros in five languages (ROADMAP I8 rest, T1170-d). fr register is mixed (tu on the home page, vous elsewhere; the new strings use vous) (T1170-e).

## Rollback

`git revert` of the T1170 commits; the catalogues fall back to English per key as before.

## Owner steps (for the checklist)

- [T1170-a] Native review of drafted translations | the strings are machine-drafted and travellers read them | open docs/i18n/review.md; have a native speaker read nl, de, fr, es, it, traveller-facing groups first; send corrections | docs/i18n/review.md
- [T1170-e] Pick one French register | fr.js mixes tu and vous | decide tu or vous for French; tell the next session | docs/i18n/review.md
