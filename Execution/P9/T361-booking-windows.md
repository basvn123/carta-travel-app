# T361 Booking windows for the 66 trips that had none

## Task ID

T361 (register row T169-a). Branch p9-booking-windows-66, root repo only.

## Date

2026-10-03

## What changed

T169 turned each trip's booking text into a "Book in this order" checklist, but 66 of the 253 trips had no booking text (no logistics.bookingWindows, no typeSpecific.bookingTimeline, no typeSpecific.hutBooking, the same test T169 used). Six research passes read official pages (park authorities, rail and ferry operators, huts, venues, tourist boards) and wrote a short booking paragraph for each trip into logistics.bookingWindows. 47 of the 66 now have text. 19 have none, because no page I could read gave a lead time or a rule for anything in the trip's record. I did not invent any. Hotel and hut lead times that exist only in the trip records were left out for the same reason.

Most official pages say "book in advance" without a number, so only part of the new text is a dated step. The parser reads 19 of the 47 as a checklist with 26 steps. The other 28 trips hold notes only (for example "no booking needed, buy on the day", season dates, "reserve through the operator"), which render as notes, not steps. The figures that did come with a source include Anne Frank House (tickets released every Tuesday for a visit six weeks later), bahn.de bike places (six months ahead), Czech Railways (180 days), Watzmannhaus (reservations open mid-December), the Rietveld Schroeder House (two months), TGV INOUI bikes (four months), the Bodo to Moskenes ferry (booking closes 20:00 the day before) and Hossegor private lessons (48 hours, by phone).

Spot check: I re-read 13 of the cited pages myself (Anne Frank, bahn.de, Hossegor, Watzmannhaus, Rietveld, Czech Railways, amsterdam-explorer, echoduvelo, guidetolofoten, Fort Rijnauwen, Cesky Krumlov, Hoge Veluwe, Kroller-Muller). Each lead time matched its page. Three claims did not hold up and I removed them: the Belgian train bike supplement (page returned 403), the Hofkellerei group rule (403), and the Hautes Fagnes zone C guide rule (the page does not say it). Those three trips are now in the empty list. I also corrected the Fort Rijnauwen text (the page gives April to October and a limited number of tours, and does not say registration is required), the Cesky Krumlov theatre text (the page says group reservation and 20 people, and gives no May to October season) and the Hoge Veluwe text (no priority entry claim on the page). Several sources are third-party guides rather than official pages (amsterdam-explorer.com for the Van Gogh Museum and Rijksmuseum, echoduvelo.com for TGV bikes, guidetolofoten.com for the Lofoten ferry, grapeguru.de for Alsace estates). Not every URL in the sidecar was re-read by me; the research passes state they opened each one, and I re-read the ones named above.

The text follows the parser's form: short clauses, plain hyphens in ranges, no em dash, en dash or middle dot, no price. No flight price appears. The sidecar Trips/carta-unified/carta-unified/data/booking_sources.json holds 47 trips and 70 source entries, each with the figure the page states.

The journeys wire rebuild that makes any of this visible in the app is the owner's (rows T085-a, T090-a, T091-a). I built no wire.

## Files touched

Modified:
- Trips/carta-unified/carta-unified/data/trips.master.json (logistics.bookingWindows on 47 trips)
- Trips/carta-unified/carta-unified/data/trips/*.json (the same 47 trip files)
- Execution/_OPEN.md

Created:
- Trips/carta-unified/carta-unified/data/booking_sources.json
- Execution/P9/T361-booking-windows.md

Not touched: reports/validation-report.md and validation-issues.json (I ran the validator with reports sent to a scratch folder to avoid a merge conflict, as T090 did), trips.flat.csv, the seed migration, continent-app.

## Commands run

From the sparse worktree Trips/carta-unified/carta-unified. The edit script was a one-off in the scratchpad and is not committed. It rewrites each file with json.dumps(indent=2, ensure_ascii=False) and CRLF, which I first checked round-trips the originals byte for byte.

```
python pipeline/validate.py --wire "<main>/continent-app/public/journeys" --report <scratch> --json <scratch>
python pipeline/validate.py --self-test --wire "<main>/continent-app/public/journeys"
python <scratch>/apply.py --write
git diff -U0 | grep -E '^[-+] ' | grep -vc '"bookingWindows"'    # 0
node <scratch>/parse.mjs   # imports continent-app/src/lib/bookingOrder.js from the main checkout, read only
```

## Config and secrets set

None. No Claude API, no paid Gemini call.

## Before/after measurements

Checklist counts come from running bookingOrder.js and bookingSource over data/trips (253 files). Validator figures are full runs of pipeline/validate.py with the main checkout's tracked wire and no gazetteer, so place checks were skipped in both runs.

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips with booking text | 187 of 253 | 234 of 253 | +47 |
| Trips with a tickable checklist | 175 of 253 | 194 of 253 | +19 |
| Of the 66, trips with a checklist | 0 | 19 (26 steps) | +19 |
| Of the 66, trips with notes only | 0 | 28 | +28 |
| Of the 66, trips still empty | 66 | 19 | -47 |
| Validator errors | 517 | 517 | 0 |
| Validator warnings | 727 | 680 | -47 |

The 47 fewer warnings match the 47 trips now filled. The diff check shows that every changed line in master and the 47 trip files is a bookingWindows line. The validator self-test passes before and after.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A first launch of a research agent ran with a placeholder prompt | I sent the call before filling the prompt | It did nothing; I relaunched all six properly |
| Three claims had no readable source page | belgiantrain.be and tourismus.li returned 403; botrange.be does not state the rule | Removed; the three trips are listed as empty |
| Three texts said more than their page | Agents filled gaps from search snippets | Reworded to what the page says (Fort Rijnauwen, Cesky Krumlov, Hoge Veluwe) |

## What is still open

19 trips have no booking text. A lead time needs either a page that states it or a reply from the operator. The list, with the reason each has none:

- be-cycling-flemish-ardennes-bergs: belgiantrain.be returned 403 on a direct read; the bike supplement claim was not confirmed from a page read
- lu-cycling-pc-network-moselle-mullerthal: No official page opened that gave a lead time for the stays or CFL bike carriage (cfl.lu PDF returned 404).
- at-trail-running-innsbruck-nordkette: No sourced lead time found: Nordkettenbahn official page gave no booking window; Pfeishuette hut page not fetched and the record's stays are plain hotels with no sourced figures.
- be-trail-running-hautes-fagnes: botrange.be page does not state the zone C guide rule; not confirmed from a page read
- cz-trail-running-krkonose-ridge: Hut sites found gave no lead times for beds (only a one-day arrival-time notice, not a booking window).
- lu-trail-running-mullerthal: No official page found stating a lead time for any item in the record (stays, guided hikes); trail itself needs no booking.
- mc-trail-running-tete-de-chien-agel: No lead time for hotels, trains or other items in this record could be confirmed from a page opened; the Grand Prix is only an avoid-this-weekend note, not a booking item.
- mc-city-riviera-week: No lead time found on an official page that was opened (Oceanographic Museum site could not be fetched; only search snippets).
- nl-cozy-towns-hanseatic-ijssel: No official lead time found for ferries, stays or events.
- li-road-trip-rhine-triangle: tourismus.li returned 403 on a direct read; the Hofkellerei group rule was not confirmed from a page read
- lu-road-trip-ardennes-moselle-loop: No official booking page with a lead time found for the stays or sights in this record.
- mc-road-trip-three-corniches-turini: No sourced lead time found: searches returned nothing official for the Tende tunnel, Turini hotels or Monaco parking; hotel lead times exist only in the trip record.
- be-hiking-ardennes-gr57-ourthe: No official lead time found for Ardennes stays.
- at-nature-escape-gesaeuse-almhuette: No official page found with a lead time for a private Almhuette or park item; hut is a private rental with no common source.
- cz-nature-escape-jeseniky-cabin: No sourced lead time found: the only chata/hotel pages found for Ovcarna gave contact details and no booking window; Velka kotlina and Rejviz are walk-in reserves with no booking.
- fr-nature-escape-vosges-cabane: No official page found with a lead time for marcairie overnight stays; each farm sets its own rules.
- be-water-sports-ostend-knokke-sail: No official page found with a lead time for sailing courses, berths or stays named in the record.
- de-water-sports-ruegen-baltic-wind: No operator or authority page with a sourced lead time was found for the gear rental, camping or lodging items.
- mc-water-sports-freedive-kayak: No lead time found on an official page that was opened for the freedive or kayak operators.

28 further trips got notes with no dated step. The next move for those is to find the operator's own advance-booking figure (hotels and huts in particular). The wire rebuild that shows the new text is the owner's and is already in rows T085-a, T090-a and T091-a. All of this is in the register as T361-a to T361-d. T169-a stays open.

## Rollback procedure

Revert the commit on p9-booking-windows-66 (git revert). It only changes logistics.bookingWindows in trips.master.json and 47 trip files, adds the sidecar and the report, and adds register rows. No schema, migration or wire is involved.
