# Content operations: who updates what, and how to correct it by hand

Built by T1173 (ROADMAP I13, audit P-54). For the owner and for any session that has to fix something a traveller sees in the catalogue. How the override step works in detail: `docs/HANDBOOK.md`, section "Hand corrections (pipeline overrides)".

## 1. Who updates which content

Carta has one operator, the owner. Nearly all content is written by the pipeline from open sources; a person only steps in to correct it. "Pipeline" below means `run_pipeline.py` on the build box (weekly timer) or by hand; the cadence is the task's `cadence` in the `TASKS` list of `run_pipeline.py`.

| Content | Written by | Source | How often | Who checks it |
|---|---|---|---|---|
| Place facts (name, country, coordinates, population, designations, fame) | pipeline `fame`, `geonames`, `unesco`, `nature` | Wikidata, Wikipedia, GeoNames, UNESCO list, OSM protected areas | monthly (`fame`), on new places (`geonames`), backfill for the rest | owner, through the Data health tab (rules in `scripts/quality/rules.yaml`) |
| Place intros and blurbs | pipeline `guide`, `place_intros` | Wikivoyage leads, Wikipedia leads (verbatim sentences, CC BY-SA 4.0) | quarterly (`place_intros`), backfill (`guide`) | owner; `check_grounded` refuses any sentence not in a source |
| Place photos | pipeline `images`, `hero_audit`, `place_gallery`, `image_audit` | Wikipedia lead image, Wikimedia Commons (licensed, with credit) | quarterly (`place_gallery`), backfill (`images`) | owner; the image audits flag maps, emblems and thumbnails |
| Beaches, lakes, mountains (names, photos, why lines) | pipeline `beaches`, `lakes`, `mountains` and their context tasks | OSM, EEA bathing water, Wikidata, Commons | quarterly | owner |
| Trail and cycle route text | trail and cycling pipeline (`trails_*`, `cycling_*`), `pipeline/trails/summaries.py` | OSM relations and the trail's own measured facts, templates only | after each trails run | owner; rules that pick or drop walks live in `pipeline/trails/curate.py`, one item's text or photo in the `trail` and `cycle` overrides below (T1214) |
| Food and drink prices | pipeline `food`, `tourist_premium` | Eurostat price levels, Open Prices | monthly | owner; formulas in `continent-app/config/pricing.json` |
| Bed prices | pipeline `stays` | Booking and Hostelworld scrape | monthly | owner; `docs/runbooks/build-box.md` for the scrape |
| Flight prices | Worker `flight-sweep` (routes from pipeline `flight_routes`) | Google Flights; routes from Eurostat airport pairs | sweep every minute, routes monthly | owner; the price is always Google Flights', never Carta's |
| Ready-made trips | pipeline `trips` | built from the layers above | after the layers | owner |

## 2. Two ways to correct something

| | Live correction (Content tab) | Pipeline override (this runbook) |
|---|---|---|
| Where | admin page, Content tab; table `content_overrides` (migrations 018, 043) | `data/overrides/{layer}.json`, in git |
| Reaches travellers | on their next page load, no deploy | after the pull request is merged, the next pipeline run and the next data push |
| Fields | name, image, blurb, hidden, featured | any field the record carries, except computed numbers (below) |
| Layers | beach, lake, mountain, trail, cycle, dest | dest, beach, lake, mountain, trail, cycle |
| Record | status, review date, reason; audit log row | who, when, why, source; the git commit |
| Use it for | an urgent fix: a wrong photo, an embarrassing entry | a fix that should hold for good |

A live correction that should hold for good is promoted: write it as a pipeline override (section 3), merge, run, push the data, then clear the live row in the Content tab (an empty patch deletes it).

Never corrected by hand, in either path: prices, scores, tiers (`costs`, `accommodation`, `rating`, `score`, `v5`, `comp`, `tier`). They come from the price engine and the rating layer. A wrong price or score is fixed at its source (`continent-app/config/pricing.json`, the rating config, or the harvest that fed it), so every number stays honest. Both the pipeline step and the admin draft refuse those fields.

## 3. A hand correction, step by step

1. **Find the item.** Get its wire id: for a place, its key in `destinations` in `continent-app/public/app_data.json`; for a beach, lake or mountain, its `id` in `continent-app/public/{beaches,lakes,mountains}/<CC>.json`; for a trail or cycle route, its `id` in `continent-app/public/{trails,cycling}/<CC>.json`.
2. **Check the source.** Every correction needs one: a link (Wikipedia, Wikidata, an official site, an OSM object), a document, or a site visit with its date. No source, no correction.
3. **Draft it.** Admin page, Overrides tab, "Draft an override": layer, item id, field (dotted for a nested one, `place.visit_h`), value type, new value, who, when, why (10 to 500 characters, plain words, no en or em dashes) and source. "Check draft" runs the same rules as the pipeline. Nothing is saved.
4. **Take the output.** "Download {layer}.json" gives the whole layer file with the new entry appended; "Download JSON Patch" gives the same change as an RFC 6902 patch; "Copy pull request text" gives the title and body.
5. **Open the pull request.** Replace `data/overrides/{layer}.json` with the download on a new branch, paste the pull request text, and check: `python -I pipeline/apply_overrides.py --check`. CI runs the override tests.
6. **Apply it.** After the merge, the next pipeline run applies it last. To apply it now: `python pipeline/apply_overrides.py --snapshot`, then `npm run data` in `continent-app/` (writes the served wire from the master), then the data push the deploy runbook names (owner only).
7. **Look at it.** The Overrides tab shows the entry with "Applied in the last run" after the next build. On the place or item page, the new value shows.

One entry looks like this:

```json
{
 "id": "hallstatt",
 "patch": {"blurb": "Salt-mining village on the west shore of the Hallstaetter See."},
 "who": "owner",
 "when": "2026-11-06",
 "why": "The pipeline blurb named the wrong lake.",
 "source": "https://en.wikipedia.org/wiki/Hallstatt",
 "review_by": "2027-05-01"
}
```

## 4. What the run reports

`apply_overrides.py` prints one line per layer and flags each entry that needs a look:

- `applied`: the pipeline's value differed and the correction was written over it.
- `unchanged`: the output already holds the corrected value (an earlier apply, or the source caught up). When the source caught up, remove the entry.
- `orphan`: the item id is no longer in the output (the pipeline dropped or renamed it). Decide: remove the entry, or fix the id.
- `bad_path`: the field's parent does not exist in the record. Fix the path.
- `no_output`: the layer's output file is not there on this machine (for `dest`, the master `app_data/app_data.json`).

An invalid overrides file (a missing who, when, why or source; a computed field; an en or em dash; two entries for one field) stops the run before the ship, with exit 2 and every broken rule named. Nothing is half applied.

## 5. Review and undo

- Each entry may carry `review_by`; the Overrides tab shows it beside who and when. On or after that date, check the source again: keep the entry, or remove it when the source caught up.
- Undo one correction: delete its entry in a pull request. The next run of the task that owns the field writes the pipeline's own value back. A field no task writes (one the correction added) stays in the output until that layer is rebuilt, so to undo it at once, set the entry to the old value for one run first, then delete it.
- Undo the whole mechanism: `git revert` the T1173 commit. The overrides files are plain data and stay readable.

## 6. What the traveller sees

The corrected value, everywhere that layer's file is read: the card, the page, the map. For `beach`, `lake` and `mountain` the summary copies in `index.json` and `top.json` get the same field when they carry it. For `trail`, the detail file `trails/trip/<id>.json` gets the field too when it carries it. The dossier, guided search and Ask index carry a new place correction in the same run: the step applies `dest` before each of them (T1214).
