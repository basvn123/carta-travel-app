# T448: Trip styles in plain words, people in the photographs, the library rebuilt

## Task ID

T448

## Date

2026-10-14

## What changed

The owner asked (2026-10-14) whether every trip style makes sense and is clear, whether valuable styles are missing (people who sleep in hostels was the example), and for photographs that show people doing the activity: someone riding a bike on the cycling card, not another view. The owner chose to rebuild the trip data in this session rather than only review it.

**The review.** A separate agent read all 253 trips against the ten styles and counted with Python on `trips.master.json`. Its full findings are summarised here; the working file was a scratchpad note.

- The typing is sound. Every trip was written to its own style's fields: hut booking for hiking, off-grid access for nature stays, snow reliability for skiing.
- Two trips were clearly in the wrong style:
  - `cz-nature-escape-jeseniky-cabin` is a chata-to-chata ridge walk of 75 to 95 km. It is now Hiking.
  - `mc-city-riviera-week` spends five of seven days on train trips to Riviera towns. It is now Small towns.
- Eight borderline trips stay where they are. One example is `hr-nature-escape-velebit-lika`, which shares a trail with a running week but is built around huts and bears.
- The problem is the names. Five joined two ideas with "&", and three promised the wrong thing:
  - "Coastal trips" are all kite, surf, sail or kayak weeks, and five are on lakes; none is a beach week.
  - "Alpine trekking" does not fit six of the 24 hiking weeks.
  - "Culinary and wine tours": none is guided, and four are about beer, mead or spirits.
- Hostel and backpacker travel is a filter across styles, not a style, and it does not belong inside Nature stays: about 20 of the 26 nature trips assume a car. 68 trips name a hostel, dorm, bunk, hut, refuge or campsite bed. None of the 52 city and small-town trips does, so a hostel filter today returns mountain trips only. That is a data gap (row T448-c).
- The style worth writing next is a beach week for families. No style or filter can serve that audience today (row T448-d).

**Applied.** All ten slugs are kept, so trip ids, wire keys and URLs do not move.

- Nine styles are renamed, each with a one-line description in six languages:

  | Old name | New name | Description |
  |---|---|---|
  | Hiking & Alpine Trekking | Hiking | Walking weeks on waymarked trails, from towns or huts |
  | Nature Escapes & Cabin Stays | Nature stays | |
  | Cycling Trips | Cycling | |
  | City Trips | Cities | |
  | Cozy Towns Trips | Small towns | |
  | Road Trips & Scenic Drives | Road trips | |
  | Culinary & Wine Tours | Food and drink | |
  | Water Sports & Coastal Trips | On the water | |
  | Winter Sports & Skiing | Ski and snow | |
  | Trail running | Trail running | (case only) |

- The styles now come in the audience order of T203: Hiking, Nature stays, Cycling, Cities, Small towns, Road trips, Food and drink, On the water, Ski and snow, Trail running.
- The two re-typed trips keep their ids, although each id still names the old style. The id is in shared links and saved favourites, and the validator checks only its shape. No alias map was needed.
- Each trip card on the wire now carries `beds` (hostel, hut, camp), read from its accommodation list. T428 uses it for a filter.

**Photographs.**
- `docs/IMAGE_BRIEF.md` rule 6 is narrowed: a portrait, a posed face, a group photo or a crowd is still refused, but a person doing the section's activity, small in a larger landscape, is not. A new section, "People doing the thing", sets the rule for style cards and section heads.
- `pipeline/photos/vision_prompt.py` changed with it, and `PROMPT_VERSION` is now `brief_v2`, as the brief requires.
- A research agent found two candidates per slot from Commons. Each was downloaded and looked at, and its licence checked: CC0, CC BY or CC BY-SA only.
- I reviewed all 30 on contact sheets and chose these ten style photos:

  | Style | Photo |
  |---|---|
  | Hiking | Hikers above Zermatt facing the Matterhorn |
  | Nature stays | A walker at the Sota Sæter turf-roofed lodge |
  | Cycling | A rider at the Col d'Aubisque |
  | Cities | Luža Square, Dubrovnik |
  | Small towns | Rua Direita, Óbidos |
  | Road trips | A car on Iceland's Ring Road under a rainbow |
  | Food and drink | Grape pickers at Beaumes-de-Venise |
  | On the water | A kayak at Praia de Benagil |
  | Ski and snow | Ski tourers on Storebjørn, not a second Matterhorn |
  | Trail running | A runner below Lonscale Fell |

- The five section-head photos are chosen and recorded for T449: Durdle Door walkers, Praia da Falésia, Lago di Braies, the Schneespitze summit, and the Vlieland dike path.

**The rebuild.** `build_wire.py` was run with fetching on, so this rebuild also ships every pending fix that had been waiting on it:
- the comma ranges (T085-a);
- the avoid months (T087-a);
- the snapshot strip and the card tags (T089-a);
- the gateway pins (T090-a);
- the duplicate heroes (T091-a);
- the bold rule (T094-a);
- the numeric type figures (T151-a);
- the booking text (T361-d).

The uniqueness pass and 43 newly cached places moved 32 trip photographs. A separate agent compared old and new for each by eye:
- 17 new photos were fine or better. Some old ones had been the wrong place: Appenzell had shown Zurich, and the Danube trip Schönbrunn.
- 12 were worse. For example, Bansko lost its snow and the Moldova loop got an office block with a watermark. Those keep their old photograph.
- 3 had no good photo either way. I picked replacements by eye: the Transfăgărășan switchbacks, the De Panne beach flats, and the Upper Sûre lake for Escapardenne.

Pinning moved ten neighbouring trips onto other photographs. I checked those, and one was a conflict I had caused (Esch-sur-Sûre belongs to the Upper Sûre trip), which I resolved. The last duplicate, the Paklenica canyon on two Velebit trips, was resolved with a Northern Velebit meadow for the nature stay. All 15 pins and 10 style photos live in `build_wire.py` (`JOURNEY_HERO_PINS`, `TYPE_HERO_FILES`), are pinned against the uniqueness pass, and answered HTTP 200.

## Files touched

**Modified (root):**
- `Trips/carta-unified/carta-unified/pipeline/common.py` (`TRIP_TYPES` names, new aliases first, old spellings kept)
- `Trips/carta-unified/carta-unified/data/trips.master.json`, `data/trips.flat.csv`, `data/trips/*.json` (253 files: the three style fields only)
- `Trips/carta-unified/carta-unified/schema/SCHEMA.md`, `schema/types.ts`, `schema/trip.generated.schema.json`
- `pipeline/journeys/build_wire.py` (`TYPE_ORDER`, `TYPE_HERO_FILES`, `JOURNEY_HERO_PINS`, `bed_kinds` and the card's `beds`)
- `docs/IMAGE_BRIEF.md` (rule 6, new section), `pipeline/photos/vision_prompt.py` (`brief_v2`)
- `cache/journey_images.json` (43 places fetched)
- `Execution/_OPEN.md`

**Created (root):**
- `Trips/carta-unified/carta-unified/pipeline/restyle.py` (applies names and re-types to the built dataset; idempotent, `--check`)
- this report, `Execution/P11/T448-shots/`

**Modified (app, mirrored in root):**
- `continent-app/src/i18n/{en,de,nl,fr,es,it}.js` (ten names and ten `journey.typeDesc*` lines each)
- `continent-app/src/lib/journeys.js` (`typeDesc`)
- `continent-app/public/journeys/` (index, 10 type files, 253 journey files)

## Commands run

```
python pipeline/restyle.py --check && python pipeline/restyle.py      # in Trips/carta-unified/carta-unified
python pipeline/validate.py                                           # same; then git checkout -- reports/
python pipeline/journeys/build_wire.py --out <scratch> --cache <scratch copy>   # dry run
python pipeline/journeys/build_wire.py                                # the rebuild, three times as pins were settled
npm test                                                              # continent-app, 375 of 375
npx vite build && npx vite preview --port 5298 --strictPort
CARTA_PORT=5298 node scripts/verify_journeys.mjs                      # all checks passed
node scripts/measure_destinations.mjs --port=5298 --label=t448 --cats=trips --shots=../Execution/P11/T448-shots
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Validator errors (with the shipped wire) | 517 | 256 | -261 |
| of which hero-below-floor (row T230-a, unchanged) | 252 | 252 | 0 |
| Duplicate trip heroes after the uniqueness pass | 26 photos on 53 trips (T091-a) | 0 | -26 |
| Style names joining two ideas with "&" | 5 | 0 | -5 |
| Styles with a one-line description in the app | 0 | 10 | +10 |
| Style photos showing a person doing the activity | 0 of 10 | 10 of 10 | +10 |
| Trip cards carrying a bed kind (hostel, hut, camp) | 0 | 68 | +68 |

Trips per style after re-typing:
- Hiking 25, Nature stays 25, Cycling 26, Cities 25, Small towns 27;
- Road trips 26, Food and drink 26, On the water 24, Ski and snow 24, Trail running 25.

These counts belong in this report only; the screen will not show them after T428.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The offline build refused to write (3 trips unresolved) | 43 places were never cached | Ran with fetching on, against a scratch cache first |
| 12 trips got a worse photograph | The uniqueness pass, plus new candidates | Pinned the old photograph (`JOURNEY_HERO_PINS`) |
| 10 more trips moved after pinning | Pinned trips took back photos their neighbours had borrowed | Looked at all ten; nine fine, one fixed (Esch-sur-Sûre back to Upper Sûre, Escapardenne on the lake) |
| Regexes written through a shell heredoc lost `\b` | Known heredoc trap | Rewrote the bytes; later edits through files, not heredocs |
| A Commons thumb path guessed by hand was wrong | The md5 path was not computed first | Computed it, checked HTTP 200 for all 26 hand URLs |

## What is still open

- **T448-a (owner).** The rebuilt `public/journeys/` must reach R2 (`node scripts/r2/push-data.mjs --live`, after T445-b) and the app must be deployed. Until then the live site shows the old names and photos.
- **T448-b.** `profile.carRequired` and `profile.familyFriendly` are unset on 153 of 253 trips. No car and good-with-children filters cannot ship until they are backfilled. This is content work from each trip's own text, and it extends row T376-c.
- **T448-c.** None of the 52 city and small-town trips names a hostel or dorm bed, so the beds filter only ever returns mountain trips. Add one budget bed line to each of their accommodation lists.
- **T448-d (owner decision).** Three things that would each need new trips written:
  - a Beach weeks style, about 25 trips, for the families audience no style serves;
  - about 10 hiking weeks walked from one town (the launch hiker; 21 of 24 hiking weeks are hut chains);
  - 2 or 3 Camino weeks.

  The Claude API is not an option here.
- **T448-e.** The trail and cycling photo scorers still penalise people (`trail_images.py` `PEOPLE_WORDS`, `CATEGORY_BAD`). Under `brief_v2` they may prefer a small figure doing the activity. That needs a photo run on trailslab.
- **T448-f.** The Liechtenstein trail run's photo (Schesaplana) is in the same range but over the border, and Kranjska Gora's has no snow. Both were judged acceptable by eye; a better file for each is a small follow-up.

Rows closed by this task:
- T085-a, T087-a, T089-a, T090-a (Appenzell now has its own photograph), T091-a (0 duplicates after the pass), T094-a, T151-a, T361-d.
- T143-b is now unblocked (the wire is rebuilt) but still open: it is a code removal.

## Rollback procedure

Revert the T448 commits in both repos (`git revert <sha>` on root main and on continent-app master, newest first). That restores:
- the style names;
- the two trip types;
- the brief;
- the builder;
- the shipped journeys wire, as one unit.

`restyle.py` is idempotent and only ever sets names from `common.TRIP_TYPES`, so reverting `common.py` and running it again also restores the data. No database, R2 object or live deploy was touched.
