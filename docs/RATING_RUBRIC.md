# Carta rating rubric (v5, appeal)

This rubric gives every destination its appeal score A, the part of the v5 quality score that judges the place as a whole (Q = 0.60 A + 0.15 B + 0.15 D + 0.10 R, see `continent-app/config/rating.json`). It is applied by Claude in Claude Code sessions, never through an API, one fact card at a time. The 1,570 hand scores in `app_data/curated_appeal.json` stay as they are and win over a rubric score.

Files a scorer reads:

- this rubric
- `continent-app/config/rating_anchors.json`: four hand-scored anchor places per class and band, with their score and reason
- `data/rating/fact_cards/anchors.jsonl`: the anchors' own fact cards, to compare like with like
- one shard, `data/rating/fact_cards/shard_XX.jsonl`

A scorer never opens `data/rating/hidden/`, the master data, `curated_appeal.json` or a v4 score. A score is written before any old number is seen.

## 1. Judge the place as what it is

Every place belongs to one of five classes, and appeal answers "is this worth the trip, for a place of this kind?" A village is compared with villages, never with Paris. Size, population and fame are not quality: a famous city with a dull centre scores lower than an unknown village that people detour for.

| Class | Rule | What "worth the trip" means |
| --- | --- | --- |
| Metro | 300,000 people or more | A capital-class city you can fill a week in |
| City | 50,000 or more | Two or three full days, a centre you remember |
| Town | 8,000 or more | A full day, a reason to stay one night |
| Village | under 8,000 | A place people detour for, like Conques or Hallstatt |
| Area | no centre, or nature-tagged under 1,200 | A landscape you base yourself in, like a valley or an island |

Some landscapes are filed as villages by population (a fjord, a gorge walk, a crater lake). Judge them as the landscape they are, keep their class, and add the flag `class_mismatch`.

## 2. Five criteria

Score each criterion 0 to 10 for the record. The criteria explain the score; the band test in section 3 decides it.

### Setting

The first impression and where the place sits: hilltop, lakeshore, coast, valley, plain.

- Metro and city: river or sea front, hills, skyline, how the old core meets its landscape.
- Town and village: the view on arrival, the site itself (a crag, a harbour, a bend in a river), what surrounds it within 5 km.
- Area: the landscape itself: relief, water, coast, how varied and how intact.
- On the card: `beauty_v2.setting`, `beauty_v2.water`, `beauty_v2.iconic_view`, `nature_30min`, `elevation_m`, tags such as `coast`, `lake`, `mountain`.

### Character

An intact old core, authenticity, how much traffic and sprawl.

- Metro and city: the size and coherence of the historic centre, whole quarters with their own life, how much modern sprawl you cross to reach it.
- Town and village: an intact core or street, local building materials, a living place rather than a stage set or a resort strip.
- Area: traditional villages, farmland and buildings that belong to the landscape; few resorts and roads.
- On the card: `beauty_v2.urban`, registers such as `heritage_town` and `beautiful_village`, tags such as `medieval`, `old-town`.

### Signature sights

What a visitor will still remember a year later.

- Metro and city: museums and monuments of European rank, and how many.
- Town and village: one or two sights people come for (an abbey, a castle, a Roman site, a viewpoint).
- Area: the named natural sights: a gorge, a waterfall, a beach, a summit, a cave.
- On the card: `depth.pois` (must-see first), `registers` (UNESCO World Heritage), `nature_30min` items scored 8 or more.
- A POI with a distance after its name ("Bled Castle (10 km)") lies outside the place. It makes the place a better base, which counts under setting for a village or an area, but it is not the place's own sight. The POI lists reach into neighbouring towns and even across a border (Kassiopi on Corfu lists Ksamil in Albania), and `depth.class_percentile` counts those POIs too, so read it together with the distances.

### Atmosphere

Life on the streets and in the evening for a city; calm and care for a village or an area.

- Metro and city: squares, markets, cafes, an evening life you want to be part of.
- Town and village: quiet lanes, a square with a terrace, care in the flowers and the shopfronts; crowds that swamp it count against.
- Area: space, quiet, dark skies, how it feels to stay several days.
- On the card: `crowds` (annual tier, nights per km2), `depth.items_by_category` (food_drink, nightlife, markets), the Wikivoyage lead.

### Uniqueness

Is there anything like it within 100 km, or in Europe?

- 9 or more: one of a kind in Europe.
- 7 to 8: the best of its kind in its region.
- 5 to 6: a good example of a common kind.
- 4 or less: one of many alike nearby.
- On the card: registers, the named sights, the blurb when it is specific (a generic blurb such as "A place with more to see than its size suggests" says nothing).

## 3. Five bands and their tests

Pick the band whose test fits first, then place the score inside the band (section 4).

| Score | Band | Test |
| --- | --- | --- |
| 9.0 to 10 | Exceptional | People plan a trip around it; among the very best of its class in Europe |
| 8.3 to 8.9 | Excellent | Worth adding a day or driving an hour for |
| 7.6 to 8.2 | Very good | A strong choice to stay a few nights or build a day around |
| 6.9 to 7.5 | Good | A good base or a rewarding half day |
| 6.0 to 6.8 | Pleasant | Nice if you pass; fine for a night |
| under 6.0 | no badge | Fine to sleep or change trains; not a reason to go |

The band is named in the output as `exceptional`, `excellent`, `very_good`, `good`, `pleasant` or `none`, and must match the appeal: 9.0 or more is exceptional, 8.3 to 8.9 excellent, and so on.

Keep each word's meaning. Exceptional is rare: a shard of about 150 places will usually hold none to three. Most places without a hand score are the long tail of the catalogue, and Good, Pleasant and no badge are honest answers for them, not failures.

## 4. Placing the score inside the band

1. Find the band.
2. Open the anchors of the same class and band in `rating_anchors.json`, and their cards in `anchors.jsonl`.
3. Ask: is this place clearly better than the anchors, about level with them, or weaker? Better goes to the top of the band, level to the anchors' own scores, weaker to the bottom.
4. Write the appeal with one decimal.

The hand scale is strict, and every rubric score must sit on it. `rating_anchors.json` also holds a `calibration` list: 30 famous hand-scored places in the Good and Pleasant range, such as Milan 7.0, Geneva 6.3, Monaco 6.0, Windsor 7.0 and Carcassonne 7.5. A card full of named sights does not lift a place by itself; a well-known place that is pleasant rather than compelling lands between 6.0 and 7.0. Before writing a score above 7.5, name to yourself the anchor or calibration place it beats.

When a class has fewer than four anchors in a band (city and town Exceptional have two each), compare with the anchors of the band below as well, and keep 9.0 or more for places that clearly pass the test.

## 5. The reason sentence

Each score is written with one reason in English, then in Dutch, German, French, Spanish and Italian, all in the same session, all saying the same.

- One sentence, at most 25 words in every language.
- Name the strongest criterion and one limit: "Walled hilltop village above the Alqueva lake; little to do after half a day."
- Only facts from the card or from a source listed in `sources`. Knowing a place helps to judge it, but a fact that is not on the card and not in a source does not go in the reason.
- No em dashes. Use a semicolon, a comma or a full stop.
- No superlative without a fact: not "the most beautiful village", but "a UNESCO-listed core of half-timbered houses".
- No score, band word, rank or the word "Carta" in the reason.
- Plain words a traveller uses; no "nestled", "hidden gem", "boasts", "charming" or "must-visit".

## 6. Confidence, flags and sources

- `high`: the card is rich (named must-sees, a Wikivoyage guide or registers) and agrees with what is known about the place.
- `medium`: the card is partial, or the score depends on one or two facts.
- `low`: a thin card (no named must-see or recommended POI, no Wikivoyage guide and no register) and no source found. A low-confidence score stays at 7.5 or below unless a source shows more.

A thin card may use web lookups: at most 10 per shard, each opened page (not a search snippet) written in `sources`. No guessing: a thin card with no source gets `low` and the flag `thin_card`.

Flags, any that apply:

- `thin_card`: the card has too little to judge.
- `class_mismatch`: the place is a landscape or a single sight filed under a settlement class, or the reverse.
- `name_ambiguous`: the name could be more than one place, or the card's facts point to a different place.
- `data_conflict`: the card says something that is known to be wrong (a POI that is elsewhere, a coast inland).
- `duplicate_suspect`: the place looks like another row under a different name.
- `airport_named`: the name is an airport or carries an airport code.
- `beyond_class`: the band test is met easily even against the strongest anchors of the class; the score is at the top of the scale.

## 7. Output

One JSON object per place, written to `data/rating/rubric_scores/shard_XX.json` as a JSON array in shard order:

```json
{
  "id": "gem:example",
  "appeal": 7.4,
  "band": "good",
  "criteria": {"setting": 8, "character": 7, "sights": 6, "atmosphere": 7, "uniqueness": 6},
  "why": {
    "en": "Walled hilltop village above the Alqueva lake; little to do after half a day.",
    "nl": "...", "de": "...", "fr": "...", "es": "...", "it": "..."
  },
  "confidence": "medium",
  "flags": [],
  "sources": []
}
```

`pipeline/validate_rubric_scores.py` checks the schema, the ranges, that the band matches the appeal, six languages of at most 25 words, no em dash, every id exactly once, and the hidden controls (section 8).

## 8. Drift check

Each shard holds five hidden controls: hand-scored places that are not anchors, on cards that look like every other card. The scorer does not know which they are. Their rubric scores must sit within 0.5 of the hand scores on average, or the shard is scored again.

## 9. Guards after scoring

- A gap of more than 1.5 between the rubric score and the v4 score or the estimate gets a second look.
- The owner checks a random 5% of every scoring round (`reports/rubric_spotcheck_v5.md`).
- The golden pairs (`tests/golden_ratings.json`) must still hold once the scores enter the formula.
