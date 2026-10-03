# T091: J2, 26 hero images are reused across 53 trips

## Task ID

T091 (mind-map number T087).

## Date

2026-10-03

## What changed

No photograph now fronts more than one trip. Before this task the tracked wire in `continent-app/public/journeys` held 226 distinct hero photographs across 253 trips: 26 photographs were each used by two trips (Krakow's square by three), which is 53 trips sharing a hero. A trial build into a scratch folder now gives 253 distinct photographs for 253 trips, and `validate.py` raises a new error, `hero-duplicate`, on any trip whose hero is also another trip's.

The cause was in how heroes are chosen. `build_wire.py` gives each trip a list of places (basecamps, sub-region, and since T090 the derived pin's town) and takes the first one whose Wikipedia lead image is a usable photograph. Neighbouring trips name the same town, so a Prague city week and a Moravia beer week, or a Vienna week and the Danube ride, both landed on the same lead image. Nothing compared one trip's pick with another's.

A new step, `make_heroes_unique`, runs after the picks and the audit-patch overrides. It groups trips by photograph, where "the same photograph" means the same Commons file name regardless of thumb width (`photo_key`: the last URL segment, query removed, a leading `1280px-` removed, percent-escapes decoded, case folded; this matters because `Mayrhofen.jpg` and `1280px-Mayrhofen.jpg` are one file). In each group one trip keeps the photograph and the others pick again. The keeper is the trip with the strongest claim: first any trip whose hero came from the audit patch (a person's choice is never moved), then the trip that has the photograph's place earliest in its own candidate list (a basecamp beats a sub-region), then a city trip over any other style (so the Prague city week keeps Prague), then the id, so the outcome does not depend on dictionary order. Each loser walks its own candidates again, skipping any photograph already taken, and then a second tier: the towns named in its day titles and sleep lines, the same structured slots `geocode.py` reads and never the free prose. The second tier is looked up on Wikipedia only for trips that need it, in one extra batch, so the first batch and the cache it fills are what they always were. Day titles are prose headings, so the second tier throws out words that are not places (a regex of arrival, stage, day, transfer, skiing, hiking, market and similar) and every country name in the catalogue. The first run without that filter gave the Malbun family week a photograph of "Nordic skiing", which is why the filter exists. A first-tier candidate is tried landscape first and portrait second, the same rule `pick_hero` uses.

If a trip still has no unique photograph, the build prints its id, says to add a place to `MANUAL_PLACES` or an audit-patch hero, and exits with an error before writing the wire. I chose a hard stop over shipping a duplicate or a grey card, because either would break the done condition without anyone noticing. In the trial build no trip was unresolved.

The replacements are other places the trip actually visits (Vienna's Wachau ride now opens on Wachau, the Moravia beer week on Mikulov, the Bansko ski week on Dobrinishte, its second base). They are still place photographs, not activity photographs. Matching the hero to the activity is spec B1 and belongs to the P8 task this one feeds.

The trial build also changes 39 heroes in all, not only the losers of a tie. The rest follow from T090's new pins, which the tracked wire predates (a derived pin's town is now a candidate, for example the Istria cycling week on Brtonigla instead of Pula, the Istria truffle week on Motovun, and the Brussels and Zurich photographs T090's report already predicted). The cause of each is visible in the candidate order; none was chosen by hand. Counted before the new step, that build already had 28 extra trips sharing a photograph, against 27 in the tracked wire (253 minus 226), so the pins moved the starting point slightly.

The validator check sits beside the other K5 hero checks. `validate.py` groups the wire's heroes by the same file-name key and raises `hero-duplicate` on every trip in a group, naming the others. The self-test seeds a fourth record that opens on the same photograph as the already-seeded bad one, and `hero-duplicate` joined `K5_CODES`, so CI proves the check can fail. The self-test now plants 12 defects and passes. Run against today's tracked wire the check reports 53 errors, exactly the 53 trips counted above, and against the trial wire it reports none.

The tracked wire is not rebuilt here. Generated `continent-app/public/**` is never committed by a session, and the real rebuild needs the live image cache and network on the main checkout. Until that rebuild the trip-validator CI will show the 53 `hero-duplicate` errors on top of the comma-range errors it already shows for the same reason.

## Files touched

Modified, root repo (branch p5-j2-hero-reuse):
- pipeline/journeys/build_wire.py (photo_key, itinerary_place_candidates, hero_claim_rank, make_heroes_unique, the call in main, and a `--cache` option so a trial build reads and writes a scratch copy of the image cache)
- Trips/carta-unified/carta-unified/pipeline/validate.py (hero_photo_key, the hero-duplicate check, the seeded twin in the self-test)
- Execution/_OPEN.md

Created, root repo:
- Execution/P5/T091-j2-duplicate-heroes.md

App repo: no changes. No screen, string or token changed, so DESIGN.md and the carta-design questions do not apply. Only which photograph a card shows changes, once the wire is rebuilt.

## Commands run

From the T091 root worktree. `S` is the session scratch folder. The image cache was copied from the main checkout into `S` and the wire built into `S`; nothing was written to `cache/`, `continent-app/public/` or any data folder. The only network use was Wikipedia API reads for 43 places T090 had added and a handful of day-title towns, stored in the scratch cache.

```
cp "<main>/cache/journey_images.json" $S/jcache.json
python pipeline/journeys/build_wire.py --no-fetch --cache $S/jcache.json --out $S/wire1   # offline, to see the shortfall: 3 trips unresolved
python pipeline/journeys/build_wire.py --cache $S/jcache.json --out $S/wire4              # with fetching into the scratch cache: 0 unresolved
cd Trips/carta-unified/carta-unified
python pipeline/validate.py --self-test --wire $S/wire4 --gazetteer "<main>/cache/geonames_cities500.txt"
python pipeline/validate.py --wire <main>/continent-app/public/journeys --gazetteer ... --json $S/v0.json   # tracked wire: 53 hero-duplicate
python pipeline/validate.py --wire $S/wire4 --gazetteer ... --json $S/v4.json                                # trial wire: 0
```

The offline build without fetching leaves three trips unresolved (Appenzell, the Malbun week, the Escapardenne week), because their new candidates are not in the cache. That is the reason the real rebuild must have fetching on.

## Config and secrets set

None. `--cache` is a new optional flag of `build_wire.py`; without it the cache path is unchanged.

## Before/after measurements

Photograph identity is by file name as described above. Before is the tracked wire in the main checkout (`continent-app/public/journeys/journey/*.json`); after is the trial wire in scratch built from this branch with T090's coordinates. Validator counts come from `validate.py` runs on those two wires.

| Metric | Before | After | Delta |
|---|---|---|---|
| Distinct hero photographs across 253 trips | 226 | 253 | +27 |
| Photographs used by more than one trip | 26 | 0 | -26 |
| Trips sharing a hero | 53 | 0 | -53 |
| hero-duplicate validator errors | 53 | 0 | -53 |
| Trips with no hero | 0 | 0 | 0 |
| Heroes that differ from the tracked wire | | 39 of 253 | |
| Validator self-test checks seeded | 11 | 12 | +1 |

The 39 changed heroes are the trips that lost a tie plus the trips T090's pins moved; the shared-photograph figures are what the task measures. A build with `--no-fetch` and the stored cache cannot reach zero, as noted above.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A ski week opened on the Nordic skiing article | Second-tier names came from day-title headings like "Steg: Nordic skiing and sledging" | A junk filter for non-place words and country names on the second tier only |
| The junk filter did nothing at first, then would have matched inside words | A patch script written through a shell heredoc turned a backslash-b in the regex into a backspace character, then the word boundaries were missing | Replaced the control characters with real `\b` and checked the file byte by byte |
| Offline build left three trips with no unique photograph | Their next candidates were not in the stored cache | Second-tier places are fetched on demand; with fetching the unresolved list is empty, and without it the build refuses to write |

## What is still open

The tracked wire still carries the 26 duplicated photographs. Rebuild it on the main checkout with fetching on, the same rebuild that T085-a, T087-a, T090-a and T094-a wait for, and expect the build to print "0 after, 0 trip(s) unresolved" (T091-a). The rebuilt wire's replacements come from the live cache, so they can differ from the trial in small ways; the validator will say whether any duplicate remains.

The replacements are other places on the trip, not photographs of the activity. Spec B1 and the P8 hero task own that, and they should read `make_heroes_unique` first: it is where an activity-matched candidate would be given priority (T091-b).

The wire's `hero` object carries only the Wikipedia page title as `credit` and the page URL, not a photographer or a licence, so the credit gate in `pipeline/photos/credit.py` is not applied to trip heroes. This task did not change that, and the replacements follow the same route as every earlier hero, but a licence-aware hero needs the Commons file's `extmetadata` and is a separate task (T091-c).

## Rollback procedure

Before merge, drop the branch p5-j2-hero-reuse. After merge, revert the T091 commit; that restores the old pick-first behaviour in `build_wire.py` and removes the `hero-duplicate` check and the seeded twin in `validate.py`. No data, wire, migration or cache was written, so production is unaffected until the wire rebuild in T091-a, and that rebuild is reversible by rebuilding from the reverted script or from the previous wire in git.
