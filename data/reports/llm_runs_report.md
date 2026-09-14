# LLM runs report

Run by Claude Cowork, 12 to 13 September 2026, on branch `photos-geograph-fill`.
Nothing was committed.

## 0. How this run differs from the brief

The brief assumed an Anthropic API key in `.env` and two scripts spending real
money. Bas declined to use a key. No key was ever written, and
`rewrite_intros.py` and `parking_check.py` were never executed against an API.

Instead the intros were written inside the Cowork session and pushed through the
scripts' own `guard()` function, so every text faced exactly the checks a script
run would have applied: length, sentence count, banned words, the six-word
Wikivoyage shingle test, and the proper-noun grounding test. Selection and the
FACTS blocks came from `rewrite_intros.facts_block()` and the script's own filter
logic, reproduced without modification. The scripts themselves were not edited.

Helper files, all outside the repo, under `~/work/` on the developer machine:

| File | What it does |
|---|---|
| `dump_facts.py` | reproduces the script's selection and FACTS blocks |
| `apply_intros.py` | runs `guard()` over hand-written drafts, writes the cache |
| `variety.py` | fails a batch whose own connective phrasing repeats too often |
| `BRIEF.md` | the writing brief the session's writers worked from |
| `slices/`, `drafts/` | the 96 work slices and their draft JSON |

## 1. Intros

| | |
|---|---|
| destinations in `app_data.json` | 3868 |
| entries in `cache/dossier/intros_llm.json` | 3868 |
| accepted (`ok`) | 3868 |
| refused by the guard (`guarded`) | 0 |
| skipped (`missing`) | 0 |

Every destination carries a rewrite. No entry is `null`, so the composed
fallback in `compose_short` is no longer reached anywhere.

Shape of the corpus: 166 to 280 characters, median 234, mean 231, 2.53 sentences
on average. Twenty-seven entries sit between 261 and 280 characters, over the
260 target but inside the guard's own tolerance.

By tier: 48 tier 3, 218 tier 2, 1213 tier 1, 2389 tier 0.

The zero in the `guarded` row is the state of the cache after review, not a claim
that nothing was ever refused. Refusals were caught on draft batches, diagnosed,
and rewritten before being committed to the cache. Two worked examples:

- `VIE` (Vienna), `why: copied`. The draft read "Vienna, the capital of Austria,
  was the seat of the Habsburg court and is known for its musical life." The
  shingle test found the six-word run `seat of the habsburg court and` in the
  Wikivoyage extract. Rewritten to "grew up around the Habsburg court".
- `gem:hondarribia`, `why: copied`. The draft opened "a walled fishing town in
  the Basque Country of Spain, on the border with France", sharing
  `basque country of spain on the` with the extract. Reopened as "on the Basque
  coast of Spain".

## 2. Parking

Not run. `parking_check.py` needs Claude with web search, so without a key the
only route is manual research per city. Bas chose to do this in small steps after
the intros. `cache/dossier/parking_web.json` does not exist, and the merge
therefore wrote no `parking.web` block anywhere.

## 3. Spend

Zero. No API calls were made, so there are no input tokens, no output tokens and
no web searches to report, and the euro estimate is EUR 0.00 against the EUR 15
to 25 the brief budgeted for intros. The cost moved from the API bill to session
time.

## 4. Merge and check

`python pipeline/dossier/build_dossier.py --all`

    3868 built, 1134 written, 12612 duplicate highlights merged,
    avg gallery 7.1 (print-clean 5.0)

The `written` figure counts only files whose content hash changed in the final
pass; earlier partial passes had already written the rest. Every destination was
rebuilt.

`python pipeline/dossier/audit.py --strict`

    STRICT: 1 hard check(s) failing: IMG-3

| Check | Severity | Count |
|---|---|---|
| IMG-3 | HARD | 6 |
| DO-3 | soft | 227 |
| IMG-1 | soft | 74 |
| FEST-1 | soft | 20 |
| HL-4 | soft | 6 |

IMG-3 is "every image on a Wikimedia host". The six failures are all
`geograph.org.uk` gallery URLs: `gem:broughton-in-furness`, `gem:helston`,
`gem:loop-head`, `gem:salcombe`, `gem:slieve-league`, `gem:waterford`. This is
gallery data, not intro data, and it matches the in-flight work the current
branch is named for. It is not caused by this run, but the audit does not pass
strict until it is dealt with.

Counts in `continent-app/public/dossier/`:

    3869 files (3868 dossiers plus index.json)
    3868 rewritten intros
    0 parking web blocks

The rewritten count equals the accepted count from section 1.

## 5. The app check

Skipped. `node` v22.23.2 and `npx` both work, but `continent-app/node_modules`
was installed on Windows while the Cowork shell runs in a Linux VM over the same
mounted folder. `npx vite build` fails in rolldown with MODULE_NOT_FOUND on its
native binding, and `node scripts/verify_destination_page.mjs` fails because
Playwright has no Linux browser downloaded. Both are platform mismatches, not
code faults. Neither was worked around, because the fix would mean writing
platform binaries into the repo's `node_modules` and Playwright's cache. Run
both from a Windows terminal; the 58 checks have not been exercised against this
data.

## 6. Two things worth fixing in the scripts

Not asked for, but they cost real time and they will cost the next run the same.

**`guard()` drops sentences silently.** When a sentence fails the grounding test
it is removed and the remaining text is accepted and counted as `ok`. A batch can
report `ok 40 guarded 0` while several entries have quietly lost their closing
sentence. Nothing in the script's output says so. `apply_intros.py` reports these
as TRIMMED, which is how they were caught here; `rewrite_intros.py` would benefit
from the same line.

**The grounding test reads sentence-opening words as proper nouns.**
`proper_nouns()` matches any capitalised run, including the first word of a
sentence. So "Four hours covers it." is dropped because `four` is not in the
FACTS block, while "Six hours covers it." survives only because `Six` is three
letters and falls under the `len(pn) > 3` cut. The same rule kills "Its
Charterhouse is what most people come for" (the run `its charterhouse` is not in
the facts, though `Valldemossa Charterhouse` is) and "Best June to August" (the
pair `Best June`). Possessives fail too: `Estonia's` normalises to `estonia s`.
The effect is that a whole class of natural closing sentences cannot be written,
which pushes every writer toward the same few safe openers and works against the
variety the prompt asks for.

## 7. State

- `cache/dossier/intros_llm.json` complete, 3868 entries. The `model` field
  records which writer produced each text: 1848 `claude-opus-5 (cowork)`,
  2020 `claude-sonnet-5 (cowork)`. Tiers 3, 2 and 1 are almost entirely Opus;
  the Sonnet share is concentrated in tier 0. Sonnet's first batch came back
  templated and was rejected and rewritten, which is why `variety.py` exists and
  why every later batch had to clear it.
- `cache/dossier/parking_web.json` absent.
- All destination files rebuilt; `data/reports/dossier_audit.json` and
  `data/reports/dossier_build.json` refreshed.
- Nothing committed. Branch `photos-geograph-fill`.
