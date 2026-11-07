# Machine-drafted translations awaiting native review (T1170, ROADMAP I8)

Every key below was translated in a Claude Code session (not the Claude API) on 2026-11-07 and added at the end of its catalogue under the comment "T1170 (I8): machine-drafted". Until a native speaker has read them they are drafts. Tick a group by deleting its row once reviewed; the parity test (`tests/i18nParity.test.mjs`) keeps the keys present either way.

Read first, per language: the traveller-facing groups (wizard, trip, notfor, journey, day, itin, auth, account, waitlist, support, press, aiPage, footer, maintenance, crash). The `admin.*` keys are staff-only and can be reviewed last.

Not drafted by this task: `support.*` and `footer.support` in nl.js were an earlier Dutch draft (row T1108-b).

| Language | Keys drafted | Traveller-facing | Staff only (admin.*) |
|---|---|---|---|
| Dutch (nl) | 583 | 175 | 408 |
| German (de) | 651 | 243 | 408 |
| French (fr) | 651 | 243 | 408 |
| Spanish (es) | 651 | 243 | 408 |
| Italian (it) | 651 | 243 | 408 |

## Keys by group

Same key list for every language; the Dutch list is shorter because it already had the rest.

### Dutch (nl)

- `itin.*`: 2 keys
- `auth.*`: 2 keys
- `day.*`: 3 keys
- `wizard.*`: 49 keys
- `account.*`: 2 keys
- `admin.*`: 408 keys
- `maintenance.*`: 4 keys
- `notfor.*`: 33 keys
- `trip.*`: 38 keys
- `journey.*`: 3 keys
- `aiPage.*`: 39 keys

### German (de)

- `waitlist.*`: 9 keys
- `itin.*`: 2 keys
- `auth.*`: 2 keys
- `day.*`: 3 keys
- `wizard.*`: 49 keys
- `account.*`: 2 keys
- `admin.*`: 408 keys
- `maintenance.*`: 4 keys
- `notfor.*`: 33 keys
- `trip.*`: 38 keys
- `journey.*`: 3 keys
- `crash.*`: 2 keys
- `footer.*`: 1 keys
- `support.*`: 31 keys
- `press.*`: 25 keys
- `aiPage.*`: 39 keys

### French (fr)

- `waitlist.*`: 9 keys
- `itin.*`: 2 keys
- `auth.*`: 2 keys
- `day.*`: 3 keys
- `wizard.*`: 49 keys
- `account.*`: 2 keys
- `admin.*`: 408 keys
- `maintenance.*`: 4 keys
- `notfor.*`: 33 keys
- `trip.*`: 38 keys
- `journey.*`: 3 keys
- `crash.*`: 2 keys
- `footer.*`: 1 keys
- `support.*`: 31 keys
- `press.*`: 25 keys
- `aiPage.*`: 39 keys

### Spanish (es)

- `waitlist.*`: 9 keys
- `itin.*`: 2 keys
- `auth.*`: 2 keys
- `day.*`: 3 keys
- `wizard.*`: 49 keys
- `account.*`: 2 keys
- `admin.*`: 408 keys
- `maintenance.*`: 4 keys
- `notfor.*`: 33 keys
- `trip.*`: 38 keys
- `journey.*`: 3 keys
- `crash.*`: 2 keys
- `footer.*`: 1 keys
- `support.*`: 31 keys
- `press.*`: 25 keys
- `aiPage.*`: 39 keys

### Italian (it)

- `waitlist.*`: 9 keys
- `itin.*`: 2 keys
- `auth.*`: 2 keys
- `day.*`: 3 keys
- `wizard.*`: 49 keys
- `account.*`: 2 keys
- `admin.*`: 408 keys
- `maintenance.*`: 4 keys
- `notfor.*`: 33 keys
- `trip.*`: 38 keys
- `journey.*`: 3 keys
- `crash.*`: 2 keys
- `footer.*`: 1 keys
- `support.*`: 31 keys
- `press.*`: 25 keys
- `aiPage.*`: 39 keys

## Known issues found while drafting

- `day.place`, `day.poiDepthNote` and `day.townDepthNote` in en.js are cut off mid-string (looks like a past extraction accident); the translations follow the fragments. Fix the English first, then redo these three (row T1170-c).
- Italian `notfor.*` uses some masculine forms ("sei venuto", "abituato"); an Italian reader should neutralise them.
- Registers: nl je, de du, fr vous (the existing fr.js mixes tu on the home page and vous in the wizard and trip; the owner picks one), es tu, it tu, matching each catalogue's existing wizard strings.
