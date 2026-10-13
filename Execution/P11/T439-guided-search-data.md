# T439: guided search data, precomputed and free (Explore redesign, step 3 of 9)

## Task ID

T439

## Date

2026-10-13

## What changed

The owner asked for a search people would use, free, and guided, so the traveller can only ask what Carta can answer. This task builds the data half. `pipeline/guided_search_layer.py` writes `continent-app/public/search/guided.json`: 366 KB, 70 KB gzipped, lazy-loadable. It holds three things the app cannot work out from a destination record alone.

**Areas.** Forty named areas with labels in all six languages:
- 11 mountain areas: the Alps, the Pyrenees, the Dolomites, the Carpathians, the Apennines, the Tatras, the Picos de Europa, the Scottish Highlands, the Black Forest, the Julian Alps and the Lake District;
- 15 coasts and islands: the Amalfi Coast, Crete, the Balearics, the Cyclades and others;
- 14 regions: Tuscany, Provence, Andalusia and others.

Each area is a hand-set box or outline, restricted to its countries, and each destination lists the areas it sits in. Every area holds places, from 203 in the Alps to 3 on the Amalfi Coast.

**Distances.** For each destination, the distance in km to the nearest rated beach, notable lake (tier 2 and up), notable peak (tier 1 and up) and trail end, from the layer files, when one is within 25 km.

**Vibes.** Twenty vibes with a 0 to 100 score each (quiet, old town, food and wine, romantic, family, beach town, island, mountain village, hiking base, lakeside, castles, art and museums, nightlife, nature, scenic views, spa, city break, village, World Heritage, outdoor adventure).

*Facts score first.*
- A category tag together with the thing close by scores 100. The tag alone scores 70, so an inland city tagged "beach" does not count as a beach town. The thing close by without the tag scores 80.
- Geography vibes are facts only: beach town, island, mountain village, hiking base, lakeside, spa and World Heritage.
- Beach proximity counts only for coastal places, because Germany's "beaches" are lake beaches.
- A hiking base needs three trail ends within 8 km.

*Text scores second.*
- Each destination's description (city, country, blurb, categories and tags, the first lines of its Wikivoyage guide, its sight names) is embedded on this laptop with `thenlper/gte-small` (MIT licence) and compared with each vibe's one-line description.
- Only the top tenth of the catalogue for a vibe counts, mapped to 55 to 75 so text never outranks a fact. A record under 80 characters claims nothing from text.

**What is deliberately not here.** Months, cost, car-free and crowding are not in the file. The app already computes them from the same records the cards read, so a search can never disagree with a card.

**Runtime.** No model and no call: the guided search (T442) filters on these facts and ranks by vibe score and rating. The Claude API is not involved anywhere.

**Golden set.** The 20 questions were written before any tuning, then checked against the output:

| Result | Count |
|---|---|
| Expected places the catalogue holds that appear in the top 10 | 49 of 72 (68 percent) |
| Questions where every held expectation is in the top 10 | 7 of 20 |

The misses fall in three groups:
- **Ties among equally strong matches, broken by the catalogue rating.** Albufeira (rating 5.9) ranks below higher-rated beach towns; Baden-Baden and Karlovy Vary rank below Aachen and Františkovy Lázně.
- **Naming.** The catalogue holds "Neuschwanstein", not "Füssen", and "Lake Como", not "Como".
- **Real misses.** Annecy is not in the top ten for "romantic in France"; Albufeira and Tavira for "beach town in Portugal".

The expected lists were not changed to fit the results.

## Files touched

**Created (root):**
- pipeline/guided_search_layer.py
- requirements-ml.txt (laptop-only ML dependencies)
- Execution/P11/T439-guided-search-data.md

**Modified (root):** pipeline/README.md (layer row), .gitignore (`cache/guided/*`), Execution/_OPEN.md

**Created (app, mirrored in root):** continent-app/public/search/guided.json

**Modified (app, mirrored in root):** continent-app/src/lib/dataHost.js (`search` joins `R2_TIER`)

## Commands run

```
python -m pip install --user "sentence-transformers==3.3.1"     (numpy 1.26.4, scikit-learn 1.6.1 unchanged)
python pipeline/guided_search_layer.py      (first run: 3,868 documents embedded in 253 s; 298 s in all)
python pipeline/guided_search_layer.py      (after the evidence rules; from cache, 53 s)
python pipeline/guided_search_layer.py      (after moving the cache to cache/guided/, 57 s, same result)
```

## Config and secrets set

None. The model downloads once from Hugging Face into the user's cache; no key is needed.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| What Explore search can answer | a place name, an alias, 27 region boxes | plus 40 named areas (mountains, coasts, regions), 20 vibes, four "nearby" facts |
| Destinations with at least one vibe | 0 | 3,704 of 3,868 |
| Destinations with a rated beach, notable lake, notable peak, trail end within 25 km | none recorded | 1,513, 633, 433, 3,520 |
| Golden set, held expectations in the top 10 | no search to test | 49 of 72 |
| Runtime cost per search | none (substring) | none (precomputed; no model, no call) |
| Payload | none | 366 KB raw, 70 KB gzipped |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Hallstatt and Karlovy Vary landed in "Bavaria" | Region boxes crossed borders | Every regional area lists its countries |
| Füssen was a "beach town" | Lake beaches sit in the beach layer | Beach proximity counts only for coastal places |
| Lagos was "lakeside" | Lagoons and reservoirs are in the lake layer | Only lakes of tier 2 and up count |
| Nearly every town was a "hiking base" | Most towns have a trail end nearby | Three trail ends within 8 km are required |
| Leiria led "beach town in Portugal" | A tag alone counted as proof (its nearest beach is 19 km away) | A tag without proximity scores 70, not 100 |
| Karlovy Vary scored "beach town" 65 from text | Text could claim geography | Geography vibes are facts only |
| The cache would have been committed | It was under `pipeline/cache`, which nothing ignores | Moved to `cache/guided/`, contents ignored per the `.gitignore` convention |

## What is still open

- **T439-a, owner.** A native review of the vibe labels (20) and area names (40) in nl, de, fr, es and it. They are data in `guided.json`, written in `VIBES` and `AREAS` in the layer.
- **T439-b.** The layer is Manual and laptop-only. Run it after every catalogue ingest, or new places have no vibe in search. Consider a reminder in `run_pipeline.py`'s manual list.
- **T439-c.** In the golden set, equally strong matches are ordered by rating. T442 could break the tie by fame (it is in `dest.rating`) so the place people expect comes first. Measure the change against the same golden set; do not edit the expectations.

## Rollback procedure

Revert the T439 commits in both repos. Delete `continent-app/public/search/` and `cache/guided/`. Uninstalling sentence-transformers is optional; it does not touch the pinned packages.
