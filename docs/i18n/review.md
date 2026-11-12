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

- Resolved (T1210): `day.place`, `day.poiDepthNote` and `day.townDepthNote` were cut-off fragments with no code reference; the three dead keys were removed from all six catalogues.
- Resolved (owner sweep 2026-11-12): the three Italian `notfor.*` strings with masculine forms (`lakeSwimNo`, `lakeCurrent`, `trailGrade`) were rewritten gender-neutral.
- Registers: nl je, de du, fr vous, es tu, it tu. Decided in the owner sweep of 2026-11-12: French is vous everywhere (907 strings already were); the 103 tu strings (home, wizard, ask, travel, trip, chat) were rewritten. Exception: example queries the traveller types to Carta (`ask.placeholderPlan`, `ask.ex.plan`, `askChat.fu.plan`, `dayws.botPlan`, `bot.s.plan`) stay in the traveller's own voice.

## Owner sweep audit (2026-11-12)

A scripted audit of all six catalogues (10,219 keys each; scripts in the run folder `.work/2026-11-12-owner-review/`) found no missing keys, no empty strings and no English left in a translation outside loanwords (Trail running, Road trip, Power bank). It fixed:
- **Stripped diacritics:** 774 strings had been written without accents or ß ("etapes", "Fuhrt uber", "Strasse", "mas", "piu"): de 127, es 220, fr 346, it 67, nl 14. Only the diacritics changed, nothing else in the wording.
- **The shortlist word:** one word per language for the starred list (de Merkliste, es favoritos, fr favoris, it preferiti, nl favorieten); before, es, fr, it and nl mixed "preselección/présélection/shortlist/verlanglijst/lijstje" (T411-n).
- **Every row in "Fix these first" below**, and the borderline rows marked fixed there.
- Kept on purpose: `open.trail.sub` and `cov.reason.wayOnly` drop their `{country}` / `{things}` placeholder because the English country or noun cannot be inflected in the sentence ("in der Schweiz", "au Portugal"); short Intl month names stay lowercase with a period, as each locale writes them (T507-e).

## Back-translation check (T1196, provisional)

Every drafted string above (3,187: nl 583, de 651, fr 651, es 651, it 651) went through the T1196 check on 2026-11-07, before the native review. Each string had hard checks (placeholders, digits, dashes, empty), a blind back-translation into English (a separate pass that saw neither the English nor the key), a chrF++ score against the English, and, for the 2,056 strings flagged (short, holding a placeholder, low chrF++, or a soft check) plus a 5% control of the rest, a judge verdict (prompt `judge-text`, kind translation). Results: `data/reports/validation/texts/backtranslation-2026-11-07.md`, one row per string in `backtranslation-rows-2026-11-07.json`. The verdicts are provisional: the judge is not calibrated on a human's labels yet (T1188-a), and it is lenient. 6 of the 11 failures below were found by the lead session's own reading of the lowest scoring strings, after the batch judges had passed them. Read the 99.7% that holds as an upper bound, not as approval.

| Language | Holds | Traveller-facing holds | chrF++ median |
|---|---|---|---|
| nl | 578 of 583 | 173 of 175 | 93.2 |
| de | 650 of 651 | 242 of 243 | 84.7 |
| fr | 650 of 651 | 242 of 243 | 83.4 |
| es | 649 of 651 | 243 of 243 | 84.4 |
| it | 649 of 651 | 242 of 243 | 82.5 |

### Fix these first (all fixed in the owner sweep, 2026-11-12)

nl `notfor.mtnExposure` (steile afgrond), nl `trip.practicalParkRide` (buiten het centrum), nl `admin.reviewLate*` (moest herzien worden), de `crash.card` (Dieser Bereich), fr `trip.timedLabel` (Le bon moment compte), es `admin.colTarget` (Objeto), es `admin.fGroundUsed` (búsquedas fundamentadas), it `trip.practicalAirport` (per il centro), it `admin.colTarget` (Oggetto).

### Borderline (all settled in the owner sweep, 2026-11-12)

de `admin.fGroundUsed` (Suchen mit Quellenbindung), it and de `trip.timedLabel` (Conta il momento giusto, Lohnt gutes Timing), nl and de `trip.dayChipDrive` (over de weg, auf der Straße), nl `admin.attnOverdue` (Achterstallige), de `notfor.mtnExposure` (unwohl), fr `admin.banCancel` (Annuler), fr `notfor.tripMoves` (n'aimez pas), es and it `trip.practicalPark*` (a {dist} del centro / dal centro).
