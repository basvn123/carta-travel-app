# Model-written intros and parking web check: final report

2026-09-16. Both runs from `docs/HANDOFF_LLM_RUNS.md` had already completed
before this session picked the work back up (the intro rewrite was already
committed to `main`; the parking check had run but not yet been merged).
This session did the merge, the audit, the fix it surfaced, and this report.

## 1. Intros

3,868 of 3,868 destinations carry a model-written intro (`intro.short_src
== "rewrite"`). `cache/dossier/intros_llm.json` reports **3,868 accepted,
0 guarded**. No entry was dropped by the length, copying, style or
grounding rules described in the handoff brief.

Two examples, as stored:

> Rome, the 'Eternal City', is the capital and largest city of Italy and of
> the Lazio region. Colosseum, Saint Peter's Basilica and Vatican Library
> lead its 12 sights. Plan two days, ideally in April or May.

> Odda is a town in Norway. Trolltunga leads its sights. Half a day is
> enough here, ideally in June to August.

## 2. Parking

1,294 destinations carry a `parking.web` block (city pairs that share one
gateway, such as Rome's FCO and CIA, were checked once and copied to both,
per the handoff's dedupe rule).

| Confidence | Records |
|---|---|
| high | 652 |
| medium | 314 |
| low | 328 |
| **Total** | **1,294** |

1,215 of 1,294 records (94%) carry at least one source URL. The 79 without
one are exactly the `low`-confidence records where the model found nothing
reliable and correctly returned empty lists rather than guessing. Checked
by hand: **zero records name a car park with no source**, which was the
fabrication risk the brief called out.

Five records spot-checked by hand, sources opened and confirmed against
the city or operator page named:

- **Delft**: `delft.nl/parkeren`, four garages named, matches the
  municipal page.
- **Odda**: `oddaparkering.no/locations/` plus `trolltunga.com`, six named
  lots with fees, matches; the advice sentence (which car parks are for
  Trolltunga hikers versus the town centre, and the bus/camper
  restriction on the road to P2) is genuinely useful and specific.
- **Gotha**: the town's own tourist-information page, five named car
  parks, matches.
- **Provence-Luberon** and **Lipari-Aeolian**: both `low` confidence,
  empty lists, no source. Correct: these are regions/island groups, not
  single towns with a municipal parking page.

## 3. Merge

```
python pipeline/dossier/build_dossier.py --all
```

3,868 dossiers built, 2,017 rewritten (unchanged ones keep their old
content hash and are not rewritten, by design).

```
python pipeline/dossier/audit.py --strict
```

**One hard failure, pre-existing and unrelated to this work**: `IMG-3`
(every gallery image must be on a Wikimedia host) fails for 6
destinations whose hero photo is hotlinked from `geograph.org.uk`, from a
separate Geograph ingest done on another branch:

`gem:broughton-in-furness`, `gem:helston`, `gem:loop-head`,
`gem:salcombe`, `gem:slieve-league`, `gem:waterford`

This is not something the intro or parking work touched. It needs its own
fix in whichever script wrote those six hero images (point them at a
Wikimedia-hosted photo, or drop the ineligible ones), separately from this
task.

Post-merge counts:

```
3869 dossiers, 3868 with a rewritten intro, 1294 with a parking web block
```

## 4. App build and harness

```
cd continent-app && npx vite build
node scripts/verify_destination_page.mjs
```

The build succeeded. The harness caught one real regression: the "Where
to park" section's OSM provenance line
(`dest.parkSource`, "Locations and fees come from OpenStreetMap
contributors and can be out of date...") had been dropped from
`DestinationPage.jsx` at some point after the section was first built,
independent of this merge. Restored the one missing `<p>` element. After
the fix, **all 58 checks pass**.

## 5. Spend

Both scripts had already run before this session; no new model calls were
made here (only the merge, audit, build, and one JSX fix, none of which
call a model). Historical spend is not re-derivable from the cache files
alone since they do not carry a running token total; the per-batch numbers
the scripts printed at the time were not captured in a file. If exact
spend matters, check the Anthropic Console usage dashboard for the date
range these ran (`intros_llm.json` entries are dated 2026-09-14;
`parking_web.json` entries are dated 2026-09-15).

## 6. What this session did NOT touch

The working tree had 47 files modified and several new files unrelated to
this task (a sign-in gate rewrite in `App.jsx`, i18n changes, `robots.txt`
/ `sitemap.xml`, `.gitignore`, `vercel.json`, and others), from other
in-progress work on `main`. None of that was reviewed, changed, or
committed by this session. Nothing was committed at all: the branch is
`main`, and Bas decides when any of this goes in.
