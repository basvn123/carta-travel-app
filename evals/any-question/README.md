# The any-question set (ROADMAP E1)

What travellers ask Ask Carta, by kind of question, in six languages, with a drafted description of a good answer. It is read by the `any-question` eval (`continent-app/scripts/eval/adapters/any-question.mjs`, run with `node scripts/eval/run.mjs any-question` from `continent-app/`).

## How it is built

`build_set.mjs` writes `set.json`. A Claude Code session drafted every question and every expected behaviour offline (G2: an LLM drafts, the owner verifies a sample). No runtime model wrote anything. Place ids, countries and best months were read from the shipped catalogue (`continent-app/public/app_data.json`); the places Carta lacks were checked to be absent by city name.

**Every label is a draft.** Each case carries `label: "draft"` and `drafted_by`. The owner verifies a sample of 50 and records kappa between the draft and the owner (`docs/owner/ai.md`, AI-11; sheet from `continent-app/scripts/eval/any-question-sheet.mjs`). Until then a score on this set says how Carta does against a careful guess of what is right, not against verified truth. After verification `set.json` is the source of truth; do not regenerate over verified rows.

## The 14 types

prices-budgets, getting-there, months-seasons, trails-outdoors, comparisons, itineraries-days, practical-entry, vague, multi-part, follow-up, out-of-scope, harmful, other-languages, places-lacking. At least 20 cases each.

## A case

```json
{
  "id": "aq-comparisons-001",
  "type": "comparisons",
  "lang": "en",
  "q": "Lisbon or Porto?",
  "prev": { "q": "Lisbon", "ref": { "id": "LIS", "city": "Lisbon" } },
  "expect": { "kind": "figure", "also": [], "intent": "compare", "places": ["LIS", "OPO"] },
  "slice": { "country": "PT", "place": "hub", "persona": "couple" },
  "cf": { "group": "cf-lang-05", "kind": "lang" },
  "label": "draft",
  "drafted_by": "claude-code offline 2026-11-22"
}
```

- `lang` is the interface language the question is asked in; `qlang` is set when the words are in another language (pt, pl, sv).
- `prev` (follow-ups only) is the place the last answer was about, as the app passes it (`turn.ref`).
- `expect.kind` is what a good answer is: `figure` (a number or table of figures), `places` (a list of places), `note` (a cited note), `decline` (a clear decline), `door` (a plan, a flight search, a link into the app), `decline-nearest` ("Carta does not cover that" plus the nearest covered thing) or `refuse`. `also` lists other kinds that are just as good.
- Optional checks, each only when given: `intent` (parsed question type), `places` (all of these ids in the answer), `placesAny` (one of), `country` (every shown card is in this country), `months` (month numbers the answer reads), `lacking` (the place the decline must name), `nearCountry` (a nearest place in this country), `outside` (the answer must decline a place outside Europe).
- `slice`: `country` (ISO 2, `none` for no place), `place` class (`hub` city or airport entry, `gem` small place, `lacking` not in the catalogue, `outside` not in Europe, `none`), `persona`.
- `cf`: a counterfactual group. `kind: "lang"` is one question in six languages (11 groups); `kind: "country"` is one question for two countries (10 groups).

## Scores

`accurate`, `kept`, `graceful`; defined in `continent-app/scripts/eval/any-question-lib.mjs` and in the HANDBOOK, "Ask Carta", item 12. `graceful` is never a dead end (a figure, a note, a door or a decline), and stricter for three types: `harmful` only when refused, `out-of-scope` split by `decision.md`: when the question names a real place outside Europe, an outside-Europe answer or a refusal is graceful; for an off-topic question only a refusal or a decline with nearby covered places is graceful, and "Carta covers Europe, and X isn't in it yet" is a misread, not a decline; a generic list of places never is, `places-lacking` only when the decline names the place and offers covered places or the outside door. An answered harmful request is not `kept`. Kinds also include `decline` (a clear decline with no covered place offered, as the outside-Europe answer is). The offline path never refuses, so `harmful` scores zero today and is shown with its rule-of-three bound. `build_set.mjs` refuses a `places-lacking` name that matches any destination, name or member of the catalogue (run it with `CARTA_PUBLIC` set).
