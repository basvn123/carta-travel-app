# T208: Press, partnerships and the open-data angle

## Task ID

T208

## Date

2026-10-02

## What changed

This report replaces a first draft that listed 31 outlets with audience figures nobody had cited. The new version is a short list of European outlets and communities, each tested against the acquisition constraint, plus a recommendation on whether to pursue press before there is traction. It carries no audience, reach or cost figures except those copied from a named repo file or read on the outlet's own page on 2026-10-02 with the URL beside them. Where a figure could not be verified, none is given.

The recommendation is not to pursue cold press before launch. Carta has no live fares and, per Execution/P12/T272-owner-decisions-2026-10-02.md, no longer prices flights, and checkout has never been live (Execution/P12/T207-launch-channels.md). An early announcement would say "we are building this". What is worth doing before launch is the work already running: the long-lead emails L1 to L3, which are a data source first and an announcement surface second, and the open-data community post that T207 already schedules for launch day. The outlets below are for after the launch gates have passed, not before.

## The constraint applied

docs/GTM-ACQUISITION-CONSTRAINT.md sets about 0.17 euro of allowable spend per visitor (6.85 euro contribution per purchase at an assumed 2.5% purchase rate, from CARTA_UNIT_ECONOMICS.md section 5). It asks for three things from any channel: cost per visitor with its source, the comparison with 0.17 euro, and a lever if above. That is register row T204-b. Every route below is earned and costs nothing in cash, so the cash test passes by construction. The cost is the owner's writing and reply time, which is not measured in any file, so no hours figure is given here. The yield in visitors per route is unknown before launch and no figure is offered. Sponsored slots, paid newsletter placements and any fee to an outlet fail the constraint on principle and are out. The third question does not arise, because no cash is spent.

## What Carta can honestly offer an outlet

Only facts already measured elsewhere. 3,868 destinations (Execution/P12/T201-positioning.md). 17,619 published trails (docs/TRAILS.md, the published hikes row). 22,289 designated bathing sites in the EEA register (docs/BEACHES.md). 43 credited sources (continent-app/src/data/attribution.js, counted by its source keys, and Execution/P12/T207-launch-channels.md). The angle no competitor in Execution/P12/T202-competitive-positioning.md tells is coverage honesty: a page that says what Carta cannot map yet. Say "credits 43 sources", never "43 open datasets", because not every credit is open data (CARTO's basemap is under its own terms, per attribution.js).

## Partnerships as the announcement surface

The long-lead tracks L1 to L3 in the master mind map already cover the outreach, so this report adds no new emails and no new register row for them. What it adds is the question to put in each email: would you co-announce, and in what words. Each organisation below was read on 2026-10-02.

Culture Routes Society (L1, Turkey). The mind map describes it as a non-profit that ships GPX with its guidebooks and runs a live route-updates feed. Its website could not be reached from this environment (the domain tried did not resolve), so contact route and press page are unverified. Find the real address when sending L1.

Tasuleasa Social (L2, Via Transilvanica). https://www.viatransilvanica.com/en, read 2026-10-02: the operator is the Tasuleasa Social Association, based in Piatra Fantanele, Bistrita-Nasaud county, Romania. The page offers a press materials download and a contact address, and mentions an app and a Hiker's and Cyclist's Guide. It does not mention a GPX download, so L2 stays a request for permission, not a data pickup.

Via Dinarica, HPS and Greek NECCA (L3). https://www.viadinarica.com/, read 2026-10-02: the trail is coordinated per country, not by one body. Terra Dinarica in Sarajevo for Bosnia and Herzegovina, the Croatian Mountaineering Association (Hrvatski planinarski savez, Zagreb) for Croatia, and RRA Zeleni kras for Slovenia, each with its own listed contact. That means several conversations, and the Croatian one is the same body as HPS in L3. Greek NECCA was not checked.

EuroVelo. https://pro.eurovelo.com/news/2024-10-09_eurovelo-gpx-tracks-go-open-data, read 2026-10-02: the GPX tracks are distributed under ODbL, with attribution and share-alike, and the page reports 340,800+ downloads in 2023, up 124% on 2022. Carta already credits it with the prescribed wording (docs/tos/data_licenses.md, the EuroVelo row; attribution.js lists the licence as ODbL 1.0 since October 2024). EuroVelo is the one partner that needs no permission, only a courtesy note.

## The open-data angle, from the repo's own credit list

attribution.js holds 43 credits. The agencies and bodies in it are a ready list of people with a reason to care that a product shows their work correctly. Those that publish national or regional trail, cycling or transport data are the likeliest to share a short, accurate note: Sustrans (as Walk Wheel Cycle Trust), Spatial Hub Scotland, SchweizMobil with the Federal Roads Office, swisstopo, IGN, Kartverket, Natural England, the European Environment Agency, Eurostat, GeoNames, Transitous, SNCB, De Lijn, STIB, TEC, GTFS.de, Entur, Digitraffic, opentransportdata.swiss and transport.data.gouv.fr. Licences are as listed in that file and in docs/tos/data_licenses.md. One caution from the same file: UNESCO's terms are marked "verify". A note must not imply an endorsement the body has not given. The route is a courtesy note at launch with a link to the credit, not a pitch. Whether a body shares it is theirs to decide.

## The short list

None of these is paid. None has an audience figure here, because none was verified. Status says what was checked.

| Outlet or community | Why it fits | Status on 2026-10-02 |
|---|---|---|
| weeklyOSM (weeklyosm.eu) | OpenStreetMap is the first credit in attribution.js and the backbone of trails, beaches and cycling. The site has a Contribute form, is run by volunteers and is hosted by FOSSGIS | Read. T207 owns the post and its timing |
| OpenStreetMap community forum, regional groups | Same reason. T207 notes the forum has no showcase category | Per T207; re-read at D-14 |
| EuroVelo news (pro.eurovelo.com) | Cycling partner with ODbL data already credited | Page read; whether it takes outside news is unknown |
| Via Transilvanica press materials | Press contact on its own site | Read; use only after L2 gets a yes |
| Tech.eu and EU-Startups | European startup press; plausible only after launch and traction | Not verified. EU-Startups returned 403 to fetch. The audience figures in the first draft were removed |
| Wanderlust, Trail, The Great Outdoors (UK) | European walking and travel titles that cover route planning | Named from general knowledge, not fetched; not a pre-launch target |
| data.europa.eu (the EU open data portal) | European open-data community, relevant once Carta can say what it returns to the commons | Not fetched. Carta does not currently publish a dataset, and T207 warns not to promise one before the licence review |

Dropped from the first draft: Skift, PhocusWire, AFAR, National Geographic, Backpacker, Adventure Journal, Nomadic Matt, AllTrails, Strava, CityStrides and Open Data Barometer. They are US or global trade or consumer-scale outlets that do not fit a European budget product at this stage, and none could be checked against a source.

## Before and after measurements

Not measured. This is a research task and promises no number. The only counts used are those cited to a repo file above.

## Files touched

Modified:
- Execution/P12/T208-press-and-partnerships.md (rewritten)
- Execution/_OPEN.md (rows T208-a to T208-d replaced by T208-a to T208-c)

## Commands run

Read-only: the mind map prompt through Execution/_queue/xmind_prompt.py, greps over docs and attribution.js, and page fetches on 2026-10-02 (listed above). No code was run.

## Config and secrets set

None.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first draft carried dozens of uncited audience figures: Wanderlust print and web reach, National Geographic readers, AFAR, Backpacker, Adventure Journal, Skift, AllTrails, Strava, CityStrides, the European Data Portal dataset count, and Tech.eu and EU-Startups both given the identical "300,000+ monthly readers, 67,000+ subscribers", which suggests invention | The session wrote from memory and search snippets and cited no file, against the task's rule that every number is copied from a named source | Every one of those figures was removed. Three claims were re-read on the owner's own page and kept with URL and date: EuroVelo's ODbL licence and 340,800+ downloads in 2023, Via Transilvanica's operator and press materials, and Via Dinarica's per-country coordination. The old register rows quoted the same invented figures and were rewritten |
| The first draft leaned on US outlets | Outlet choice was by size, not fit | Re-centred on European outlets and on the credited bodies in attribution.js |

## What is still open

The press decision (T208-a): whether the owner accepts the recommendation of no cold press before the launch gates pass. Unverified outlets (T208-b) must be re-read, ideally at D-14 beside the Reddit check in T207-e. The courtesy note to credited bodies (T208-c) needs a draft and a date tied to the launch date in T207-a. The L1 to L3 outreach and the launch date are already tracked and not repeated here.

## Rollback procedure

Research only. Revert the commit on branch p12-press-partnerships; no code, data or schema changed.
