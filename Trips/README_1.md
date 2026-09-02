# Carta — unified European trip dataset

253 seven-day itineraries from four separately generated regional batches, parsed out of
four incompatible formats into one schema, validated, and exported as JSON, a Supabase
migration pair, and TypeScript types.

```
carta-unified/
├── data/
│   ├── trips.master.json          253 records, one file, schema v2.0
│   ├── trips/<id>.json            one file per trip
│   └── trips.flat.csv             flattened for spreadsheets and bulk loads
├── schema/
│   ├── SCHEMA.md                  the field-by-field contract
│   └── types.ts                   TypeScript types (JSON shape + Supabase row shapes)
├── supabase/migrations/
│   ├── 20260902000001_carta_schema.sql   DDL, indexes, FTS, RLS, views
│   └── 20260902000002_carta_seed.sql     reference data + all 253 trips (idempotent)
├── reports/
│   ├── validation-report.md       0 errors, 482 warnings, 30 notices
│   ├── validation-issues.json     machine-readable issue list
│   ├── gap-matrix.md              country × trip-type coverage and fill priorities
│   └── gap-matrix.json            same, machine-readable
└── pipeline/                      the ingest itself (see "Running it")
```

## What went in

| Batch | Records | Source format |
|---|---|---|
| Western & Central Europe | 100 | one `.md` per trip, flat YAML frontmatter |
| Southern & Mediterranean Europe | 70 | one `.md` per trip, `## Metadata` bullet list + budget table |
| Eastern & Southeastern Europe | 53 | one `.md` per trip, nested YAML frontmatter |
| Northern Europe & Baltics | 30 | a single `.md` holding 30 `## Trip NN` records with fenced YAML |
| **Total** | **253** | 612,302 words, 1,771 days, 747 lodging options, 1,771 pro-tips |

Nothing was dropped and nothing was invented. `pipeline/verify_roundtrip.py` re-reads
every source file and asserts that each parsed field still appears verbatim in it —
currently **10,360 checks, 0 failures**.

## What the unification actually had to reconcile

- **Four trip-type vocabularies** (`trail_running` / `Trail Running` / `trail-running`)
  onto ten canonical types with stable ids 1–10.
- **Four difficulty scales** — an integer 1–5, a `"4/5 — prose"` string, the words
  `Easy–Moderate`/`Hard`/`Expert`, and a sentence — onto a 1–5 score plus a canonical
  label, with the source's own sentence kept in `difficultyNote`.
- **Four budget encodings** — integer arrays, a five-row markdown table, prose strings
  like `"€280–€520 (€40–€75/night)"` — onto `{lowEur, highEur, note}` per category,
  keeping the source's wording. Straddling tiers (`€–€€`) keep both their canonical tier
  and their raw form.
- **Two season encodings** — month arrays and prose windows — onto an integer month array
  plus the original prose.
- **Two day-block dialects** — `**Morning.** …` paragraphs and `- **Morning:** …`
  bullets — onto one `ItineraryDay`.
- **Divergent type-detail keys** (`surface_mix`, `Week surface split`, `Terrain split`,
  `Total Distance / Terrain`) onto normalised `typeSpecific` slots, with every original
  key kept in `typeSpecific.raw`. The refinements that survive as first-class fields are
  cycling surface/GPX, trail-running technical ratings, city transit passes, hut-booking
  paths, lift networks and wind conditions.
- **Ids**: source ids used three different conventions, so every record gets a canonical
  `{cc}-{type}-{name}` id and keeps its old one in `sourceId`.

## Known data gaps, honestly stated

`reports/validation-report.md` has the full list. The ones that matter:

| Gap | Records | Why |
|---|---|---|
| No `connectivity` line | 115 | The W&C batch mostly did not write one. |
| No `bookingWindows` line | 67 | Same batch, same reason. |
| Coordinates are a country-capital pin | 61 | No basecamp town resolved against GeoNames' cities>15k extract. |
| Coordinates sit on the gateway city | 54 | e.g. Bansko resolves to Sofia. Flagged, never silently presented as the trip location. |
| Breakdown sums drift >15% from the stated total | 60 | Source arithmetic, left as-is rather than quietly corrected. |
| No difficulty rating | 21 | The Nordic batch rated only 9 of its 30 records. |
| No gateway airport | 30 | The Nordic batch names gateways only in prose. |
| Day 7 has no evening block | 30 | Nordic departure days. |
| Summary composed from metadata | 30 | Nordic records carry no editorial summary or hook. |

None of these block ingestion; all are queryable (`coord_precision`, `summary_generated`,
`verify_flag_count`, `volatile_pricing`) so the app can degrade gracefully.

**Volatile content**: 417 inline `[VERIFY: …]` flags survive on the records as
`verifyFlags[]`. They mark prices, lift tariffs, opening hours and refuge dates — the
fields that must be re-checked before anything is published as a guarantee.

## Coverage and the gap matrix

39 countries × 10 trip types = 390 slots. **231 covered (59%)**, **139 fillable gaps**,
**20 geographically blocked** (no alpine terrain in Hungary or Moldova, no ski areas in
Ireland or Denmark, no coast in Andorra or Kosovo). `reports/gap-matrix.md` prints the
matrix per region, marks reduced-form slots separately from full ones, and ranks the
fillable gaps P1/P2/P3 by how thin the country and the trip type are today.

No gap was synthesized in this pass — every record in the dataset is source-derived, and
`provenance.synthesized` is `false` throughout. When a fill pass is commissioned, that
flag and the P-tiers are the scoping mechanism.

## Running it

```bash
python3 pipeline/build.py             # parse all four batches -> data/
python3 pipeline/validate.py          # -> reports/validation-report.md ; exits 1 on any ERROR
python3 pipeline/gap_matrix.py        # -> reports/gap-matrix.md
python3 pipeline/export_sql.py        # -> supabase/migrations/*.sql
python3 pipeline/verify_roundtrip.py  # every parsed field must exist in its source file
```

or `make all`. Dependencies: `pyyaml`, `geonamescache` (bundled offline GeoNames extract
— the pipeline makes no network calls).

## Loading into Supabase

```bash
supabase db push                      # applies both migrations in order
# or, against any Postgres:
psql -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -f supabase/migrations/20260902000001_carta_schema.sql
psql -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -f supabase/migrations/20260902000002_carta_seed.sql
```

Both were run against PostgreSQL 16 during the build: 253 trips, 1,771 day rows, 1,012
budget lines, 747 accommodations, 1,771 pro-tips, 254 trip-country links. The seed is
idempotent — re-running updates rows in place rather than duplicating them.

Schema notes for the app:

- `carta_trip_cards` is the denormalised view for list, filter and map screens.
- `carta_coverage_matrix` reproduces the gap matrix as a live view.
- GIN indexes on `tags`, `best_period_months` and `type_specific`; a trigram index on
  `title`; and a generated `search_vector` (title A, sub-region B, summary and tags C)
  with its own GIN index.
- Row-level security is on, with public read policies. The migration grants to
  `anon, authenticated` on Supabase and falls back to `public` on a bare Postgres, so it
  runs unmodified in CI.
