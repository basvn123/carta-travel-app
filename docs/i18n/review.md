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

## Back-translation check (T1196, provisional)

Every drafted string above (3,187: nl 583, de 651, fr 651, es 651, it 651) went through the T1196 check on 2026-11-07, before the native review. Each string had hard checks (placeholders, digits, dashes, empty), a blind back-translation into English (a separate pass that saw neither the English nor the key), a chrF++ score against the English, and, for the 2,056 strings flagged (short, holding a placeholder, low chrF++, or a soft check) plus a 5% control of the rest, a judge verdict (prompt `judge-text`, kind translation). Results: `data/reports/validation/texts/backtranslation-2026-11-07.md`, one row per string in `backtranslation-rows-2026-11-07.json`. The verdicts are provisional: the judge is not calibrated on a human's labels yet (T1188-a), and it is lenient. 6 of the 11 failures below were found by the lead session's own reading of the lowest scoring strings, after the batch judges had passed them. Read the 99.7% that holds as an upper bound, not as approval.

| Language | Holds | Traveller-facing holds | chrF++ median |
|---|---|---|---|
| nl | 578 of 583 | 173 of 175 | 93.2 |
| de | 650 of 651 | 242 of 243 | 84.7 |
| fr | 650 of 651 | 242 of 243 | 83.4 |
| es | 649 of 651 | 243 of 243 | 84.4 |
| it | 649 of 651 | 242 of 243 | 82.5 |

### Fix these first (they fail)

- nl `notfor.mtnExposure`: "een lange val" is a fall, not a drop beside the path ("steile afgrond naast het pad").
- nl `trip.practicalParkRide`: "verderop" loses "out of the centre".
- nl `admin.reviewLate`, `admin.reviewLateOne`, `admin.reviewLateToday`: "verschuldigd" means owed; "due for review" is meant.
- de `crash.card`: "Karte" reads as map; a UI card is meant ("Diese Kachel" or "Dieser Bereich").
- fr `trip.timedLabel`: "À chronométrer" (time it with a stopwatch) for "Worth timing".
- es `admin.colTarget`: "Destino" reads as a travel destination; the target of an admin action is meant ("Objeto").
- es `admin.fGroundUsed`: "con datos en directo" adds a claim; "grounded" searches are meant.
- it `trip.practicalAirport`: "dal centro" reverses the direction of "to the middle of".
- it `admin.colTarget`: "Destinatario" is a recipient, not a target ("Oggetto").

### Borderline (the judges passed them; a native reader should decide)

- de `admin.fGroundUsed` "Live-Suchen", it `trip.timedLabel` "Da programmare", de `trip.timedLabel` "Mit gutem Timing" (all for "Worth timing" or "Grounded searches").
- nl and de `trip.dayChipDrive` "met de auto" and "mit dem Auto" for "by road".
- nl `admin.attnOverdue` and related: "verlopen" leans towards "expired".
- de `notfor.mtnExposure`: "unheimlich" (eerie) for "uneasy".
- fr `admin.banCancel` "Pas finalement" for "Never mind"; fr `notfor.tripMoves` "détestez" (hate) for "dislike".
- es and it `trip.practicalParkFree`, `trip.practicalParkRide`: "a {dist}" for "{dist} out".
- `day.place`, `day.poiDepthNote`, `day.townDepthNote` in every language: the English is cut off (T1170-c), so the drafts are cut off too.
