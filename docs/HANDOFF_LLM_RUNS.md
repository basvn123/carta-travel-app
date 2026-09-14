# Brief for Claude Cowork: run the intro rewrite and the parking web check

You are finishing a piece of pipeline work in the Carta travel app repo.
Two Python scripts are written and tested. They need an Anthropic API key
with credit, they spend real money, and someone has to run them, judge the
output, and merge the result. That someone is you. Bas, the owner, will be
in the conversation and decides on every spend.

Read this whole file before doing anything.

## The one-paragraph version

The destination page shows a short "what this place is" paragraph and a
"where to park" section. Today the paragraph is composed by a template from
our own data, and the parking rows come from OpenStreetMap volunteers, who
are sometimes wrong. Script one asks Claude to rewrite every paragraph from
the facts we hold (3,868 places). Script two asks Claude, with web search,
what each city itself publishes about parking. Both write a cache file; a
third script (already written) merges those caches into the files the app
reads. You run a cheap pilot of each, show Bas the output, get his go-ahead,
run the rest, merge, check, and report.

## Where things are

The repo root is the folder that contains `pipeline/`, `continent-app/`,
`cache/`, `docs/` and `.env.example`. Every command below runs from there.

| Path | What it is |
|---|---|
| `pipeline/dossier/rewrite_intros.py` | script one, the intro rewrite |
| `pipeline/dossier/parking_check.py` | script two, the parking web check |
| `pipeline/dossier/build_dossier.py` | the merge: rebuilds every destination file |
| `pipeline/dossier/audit.py` | the checker that runs after a build |
| `cache/dossier/intros_llm.json` | output of script one (created on first run) |
| `cache/dossier/parking_web.json` | output of script two (created on first run) |
| `continent-app/public/dossier/*.json` | the 3,868 files the app reads, rebuilt by the merge |
| `.env` | the key goes here; gitignored |

Do not edit the scripts. If one misbehaves, stop and tell Bas what it
printed.

## Step 0: preflight

Run these and tell Bas the result before anything else:

```
python --version
pip show anthropic
```

Expected: Python 3.11 and the `anthropic` package (0.121 or newer). The
machine this was built on has both. If `python` is missing or the package
is not installed, stop; this work needs the developer machine, and Bas will
run the commands from the "If you cannot run things" section himself.

Also check nothing else is writing to the same files: no other Python
process should be running from this repo (on Windows, `Get-Process python`
in PowerShell lists them). Two writers on one cache file clobber each other.

## Step 1: the key

The key goes into the file `.env` in the repo root, on its own line:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Rules:

- Ask Bas to paste the key into `.env` himself if he can. If he gives it
  to you instead, write it to that one line and nowhere else.
- Never write the key into any other file, a report, a log, or a message.
  Never repeat it back.
- Never put it in `continent-app/.env`. That file belongs to the web build
  and anything in it can end up in the browser bundle.
- `.env` is gitignored (`git check-ignore .env` prints `.env`). Leave it that
  way.

The scripts read `.env` on their own through `pipeline/env_local.py`.

## Step 2: intro pilot (about 20 cents)

```
python pipeline/dossier/rewrite_intros.py --tier 3 --limit 20
```

This writes twenty rewrites for the twenty highest-rated places into
`cache/dossier/intros_llm.json` and prints three counts: `ok` (accepted),
`guarded` (refused by the code's own rules), `missing` (the model skipped
one). Open the file and pick five entries whose `text` is not null. Show
Bas each `text` exactly as stored, with its place name, and your judgement
against these rules:

- two or three sentences, 260 characters or fewer
- the first sentence names the place and says what kind of place it is
- it reads like a knowledgeable friend, not a brochure
- no exclamation marks, no "you", no em dash (the long dash), no middot
- none of these words: seamless, unlock, effortless, elevate, leverage,
  empower, curated, simply, nestled, hidden gem, must-see, breathtaking,
  stunning, vibrant, boasts

The script already drops any sentence that names something not in the facts
it was given, and any answer that copies six words in a row from
Wikivoyage. An entry with `"text": null` and a `why` field is one of those
refusals; that is the guard working, not a bug. If more than five of the
twenty are refused, stop and tell Bas the `why` values; do not retry on your
own.

Wait for Bas to say the pilot is good before Step 3.

## Step 3: intros, everything (roughly 15 to 25 euros)

```
python pipeline/dossier/rewrite_intros.py --all
```

About 390 calls, 20 to 40 minutes. It prints progress every ten places
with running token counts. Leave it running; do not start anything else
that writes to `cache/`. If it stops halfway (network, rate limit, closed
laptop), run the same command again: it skips places already done. Report
the final `ok / guarded / missing` line to Bas.

The default model is `claude-sonnet-5`. Only add `--model claude-opus-5` if
Bas asks for it; it costs about two and a half times more.

## Step 4: parking pilot (about 1 euro)

```
python pipeline/dossier/parking_check.py --tier 2 --limit 15
```

Fifteen well-known cities. Output goes to `cache/dossier/parking_web.json`.
For five of them, show Bas the record and open its `official_url` and one
of its `sources` links in a browser. What you are checking: the car parks
named in the record appear on that page, and the page belongs to the city,
a car park operator, or the tourist office, not a forum or a blog.

Two shapes of record are fine:

- a city with `car_parks`, an `official_url`, `sources` and `confidence`
  `high` or `medium`
- a small place with empty lists and `confidence` `low`: that means "found
  nothing reliable", which is an honest answer

One shape is not fine: several car parks named and no `sources`. That
means the model answered from memory. If you see more than one of those in
fifteen, stop and tell Bas.

Wait for Bas before Step 5.

## Step 5: parking, wider (up to about 40 euros for everything)

Run in this order, one at a time, and stop wherever Bas says:

```
python pipeline/dossier/parking_check.py --tier 2
python pipeline/dossier/parking_check.py --tier 1
python pipeline/dossier/parking_check.py --all
```

Tier 2 is the famous places (a few hundred), tier 1 the good ones, `--all`
every city and town with parking data. Villages with no parking rows are
skipped automatically. The script prints `searches` and tokens every five
places; web search costs 10 US dollars per 1,000 searches on top of tokens,
and each place uses one to four. Give Bas the running numbers when he asks.
Cities with two airport records (Rome has FCO and CIA) are checked once.

## Step 6: merge and check

```
python pipeline/dossier/build_dossier.py --all
python pipeline/dossier/audit.py --strict
```

The build rewrites all 3,868 destination files and takes about three
minutes. The audit must end with every `HARD` line reading `ok`. Then count
what landed:

```
python -c "import json,glob;n=r=w=0
for f in glob.glob('continent-app/public/dossier/*.json'):
    d=json.load(open(f,encoding='utf-8'));n+=1
    r+=(d.get('intro') or {}).get('short_src')=='rewrite'
    w+=bool((d.get('parking') or {}).get('web'))
print(n,'dossiers',r,'rewritten intros',w,'parking web blocks')"
```

The rewritten-intro count should be close to the `ok` count from Step 3,
and the parking count close to the number of places checked in Steps 4
and 5 (plus their airport twins).

If `node` and `npx` work on this machine, also build the app and run its
check from inside `continent-app/`:

```
cd continent-app
npx vite build
node scripts/verify_destination_page.mjs
```

It should end with `all checks passed` (58 checks). If `node` is not
available, skip this and say so in the report; the developer session will
run it.

## Step 7: the report

Write `data/reports/llm_runs_report.md` and give Bas the same summary in
the conversation. It needs, in this order:

1. intros: how many rewritten, how many guarded, how many missing, with
   two guarded examples and their `why`
2. parking: how many places checked, how many records carry at least one
   source, how many are `confidence: low`
3. spend: total input and output tokens and total searches from the
   scripts' final lines, and your estimate in euros
4. merge: the audit result and the three counts from Step 6
5. the app check: passed, or skipped and why

Do not commit anything. The work sits on branch `explore-v4` and Bas
decides when it goes in.

## If you cannot run things

If Python or the package is missing in your environment, hand Bas this
block to run in a terminal from the repo root, in order, pausing after the
two pilots to read the output:

```
python pipeline/dossier/rewrite_intros.py --tier 3 --limit 20
python pipeline/dossier/rewrite_intros.py --all
python pipeline/dossier/parking_check.py --tier 2 --limit 15
python pipeline/dossier/parking_check.py --tier 2
python pipeline/dossier/build_dossier.py --all
python pipeline/dossier/audit.py --strict
```

You can still do the judging: read `cache/dossier/intros_llm.json` and
`cache/dossier/parking_web.json` after each step and apply the rules in
Steps 2 and 4.

## Things that will bite

- Both output files are written whole after every batch. Never run two
  copies of a script at once.
- The merge reads the two cache files when it starts. Editing them during
  a build changes nothing until the next build.
- A parking record without a `checked` date is ignored by the merge. The
  script always sets it.
- Do not run any other `pipeline/` script "while you are at it". Several of
  them rewrite master files and one of them nulls destinations it does not
  know about.
- Costs above are estimates from token counts; the scripts print the real
  numbers as they go.
