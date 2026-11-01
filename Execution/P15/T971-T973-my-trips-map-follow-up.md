# T971-T973: My trips follow-up: tidy, tap to mark, DESIGN.md

Batch of three tasks on branch `p15-my-trips-clean` (root repo), right after T968-T970 and on the owner's "go on" of 2026-11-01. They take the two rows T968-T970 raised for the next task (T968-a, T970-b). T972 adds one feature from the T970 research brief: on the best visited-country maps (Polarsteps, WorldScratch), tapping a country fills it in.

Commits: `61681bc635` (T971), `7ba3e46dc3` (T972), `25ac1992f1` (T973). The commit convention is the same as T968-T970: root repo only (see row T970-a).

End check, on a phone at 375 px with the dev server and `VITE_E2E_SEAMS=1 ?savedmock`:
- Your Europe, tap a country not yet visited (the Faroe Islands): the pill reads "Faroe Islands · Been here".
- Press Been here: the count goes from 6 to 7, the country fills, and the action reads Remove.
- Press Remove: the count goes back to 6.
- No page errors.

Screenshot: `Execution/P15/T968-T970-my-trips/08-marked-375.png`. `npm test` passed 1204 of 1204. Lint: 0 errors.

---

## T971: delete what My trips stopped rendering

### Task ID
T971

### Date
2026-11-01

### What changed
Deleted 11 i18n keys from all six languages:
- unused since T968: `saved.deviceLine`, `saved.deviceLineShort`, `mt.savedEmptyLine`, `mt.journalEmptyLine`, `mt.dropLine`, `mt.takePhotoLine`, `mt.typeInLine`, `saved.pastAddDetailsSub`;
- unused since T970: `mt.tileMapLabel`, `mt.ofTotal`, `mt.nextIn`.

Also deleted two CSS rules, `.mt-drop-line` and `.mt-fig-of`. Before deleting, a grep over `src`, `scripts` and `tests` confirmed nothing reads any of them. `.mt-qk-s` stays, because the Today card uses it.

### Files touched
**Modified:** `continent-app/src/i18n/{en,de,es,fr,it,nl}.js`, `continent-app/src/styles/70-mytrips.css`

### Commands run
A usage grep per key and per class, a Python line filter, an import check that each of the six language files still loads, then `npm test`. The commit was staged by hunk (`git apply --cached`), because T972 touched the same files.

### Config and secrets set
None.

### Before/after measurements
Not measured (68 lines deleted).

### What broke and how it was fixed
Nothing.

### What is still open
Nothing.

### Rollback procedure
`git revert 61681bc635`.

---

## T972: tap a country to mark it

### Task ID
T972

### Date
2026-11-01

### What changed
The pill that names a tapped country on Your Europe's map now carries one action:
- **Been here** marks a country not yet visited by hand. It writes to the same list as the Mark a country sheet (`toggleVisitedCountry`).
- **Remove** unmarks a hand-marked country.
- A country a finished trip put on the record shows only its state, as in the sheet, where those countries are ticked and fixed.

The map works in ISO codes and the hand-marked list keeps country names. `SavedTripsPanel` therefore maps between them: on unmark it removes every spelling of that country stored in the list, and on mark it stores the first `COUNTRY_ISO2` name. The pill is 44 px tall and its action is a 36 px pill inside it. Two new keys in all six languages: `mt.markBeen`, `mt.unmarkCountry`.

### Files touched
**Modified:** `continent-app/src/auth/mytrips/YourEurope.jsx`, `continent-app/src/auth/SavedTripsPanel.jsx`, `continent-app/src/styles/70-mytrips.css`, `continent-app/src/i18n/{en,de,es,fr,it,nl}.js`

### Commands run
`npx eslint`, `npm test`, then the browser check in the header above.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
Nothing in the app. The first browser check used a forced click on a 5 px country and failed. Clicking at the country's centre worked.

### What is still open
Nothing new. The pill can cover part of the map's south-west corner (Iberia) while a country is picked. Tapping the sea dismisses it.

### Rollback procedure
`git revert 7ba3e46dc3`.

---

## T973: DESIGN.md records the atlas

### Task ID
T973

### Date
2026-11-01

### What changed
DESIGN.md has a new section, "Your Europe atlas (T970, T972)", under Components. It covers:
- the projection, and why it must stay equal-area;
- the two land greys, the hairline borders and the absence of labels;
- the three states and their tokens, and the dots for small countries;
- the 56 px count and the land share;
- the tap pill and its action;
- the accessibility route.

The carta-design skill also needs this record, but its SKILL.md has uncommitted owner edits that this batch must not mix into a commit. That part is row T973-a.

### Files touched
**Modified:** `DESIGN.md`

### Commands run
A Python insert that keeps the file's CRLF line endings, then `git commit`.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
The Edit tool missed its anchor because DESIGN.md uses CRLF line endings. The insert was redone in Python.

### What is still open
- T973-a: copy the atlas into the carta-design skill once its uncommitted owner edits are committed.

### Rollback procedure
`git revert 25ac1992f1`.
