# Ratings layer: extra references (T1191, ROADMAP D23)

Files the ratings layer (`scripts/validation/layer_ratings.py`) reads when they exist. All are filled on a box with network (owner steps in `T1191`).

- `wikivoyage_status.json`: `{place id: "outline" | "usable" | "guide" | "star"}`. Written by `python -I scripts/validation/layer_ratings.py fetch-wikivoyage`.
- `eurostat_nights.json`: `{place id: nights spent per year}` from Eurostat `urb_ctour` (cities) for the metro and city rows. Attribution: Eurostat.
- `lists/*.json`: one file per published list (a national tourism board's top list, European Best Destinations), one row per entry, the same shape as `data/rating/external/tripadvisor.json`: `{"list", "year", "rank" (or null), "name", "country", "id" (a Carta place id or null), "url"}`. Store only the name, the rank and the page it was read from, never the list's prose. A list counts towards coverage only when its `list` names places (`cities`, `destinations`, `towns`, `villages`, `places`, `top destinations`, `trending`).
