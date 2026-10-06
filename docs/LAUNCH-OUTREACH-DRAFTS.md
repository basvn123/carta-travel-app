# Launch outreach drafts

Drafts only. Nothing here has been sent, and nothing may be sent until the owner has set the launch date D (register row T207-a) and approved the wording. This file was written by T336 to answer register rows T208-c and T204-b. The calendar these drafts hang from is the runway in Execution/P12/T220-launch-runway.md; this file does not repeat it. It fills the three places the runway points at: the partner emails at D-21, the courtesy notes at D, and the channel test for the acquisition constraint.

Every placeholder is written in double braces and filled by the owner: {{LAUNCH_DATE}}, {{OWNER_NAME}}, {{BODY}}, {{WHAT_WE_SHOW}}, {{LICENCE}}, {{CREDIT_URL}}. No date appears in any draft.

## Facts the drafts may state

Each figure is read from the file beside it. A draft may say nothing else about Carta's size or reach.

| Fact | Source |
|---|---|
| 43 credit entries | continent-app/src/data/attribution.js, counted by its `source:` keys on 2026-10-06 (43). The EEA appears twice, so there are 42 distinct bodies, and one entry is Carta's own image copies, so 41 outside bodies |
| 3,868 destinations | Execution/P12/T201-positioning.md, repeated in Execution/P12/T318-numbers-explainer.md |
| Credits are public without an account | Execution/P12/T318-numbers-explainer.md: the page /about/numbers repeats all 43 credits, and Account then Data sources shows them with no sign-in |
| Carta does not price flights | Execution/P12/T272-owner-decisions-2026-10-02.md |
| Say "credits 43 sources", never "43 open datasets" | Execution/P12/T207-launch-channels.md and attribution.js (CARTO is under its own terms) |

The credit link in the notes is {{CREDIT_URL}}, which should be https://www.carta-europetravel.com/about/numbers. Execution/P12/T318-numbers-explainer.md checked that path locally only; row T318-a asks the owner to confirm it on the Pages deploy before D-7. Do not send a note until that row is closed.

## Draft 1: courtesy note to a credited body (send at D, after the launch posts are up)

Timing is fixed by the runway row for D in Execution/P12/T220-launch-runway.md: "Courtesy notes to the credited bodies sent after the posts are up." Send from the owner's own address. One note per body, filled by hand, never a mail merge to a list.

Subject: Carta credits {{BODY}}

Hello,

I am {{OWNER_NAME}}, and I build Carta, a budget travel planner for Europe. Carta went live on {{LAUNCH_DATE}}. I am writing to say that it uses {{WHAT_WE_SHOW}} from {{BODY}}, under {{LICENCE}}, and that we credit it in the app.

The credit sits with the other 43 on one page that needs no account: {{CREDIT_URL}}. If the wording is wrong, or you would like it changed, reply and I will fix it the same week.

Nothing is needed from you. This is a courtesy, not a request, and it does not claim that you endorse Carta. Please tell me if anything we show from your data looks wrong.

Thank you for publishing it.

{{OWNER_NAME}}

Rules for the note. Fill {{WHAT_WE_SHOW}} from the `credit` line of that body's entry in attribution.js, shortened to one clause. Never write "open data", "partner" or "sponsor". Never ask the body to share, post or link. Never send it before the posts of D are up and the site is steady.

### Who gets the note

The table is generated from attribution.js (43 entries, in file order) with each entry's licence string. The last column says whether to send.

| # | Credit entry | Licence as written in attribution.js | Send a note |
|---|---|---|---|
| 1 | OpenStreetMap | ODbL 1.0 | Yes |
| 2 | CARTO | CARTO basemap terms | Owner decides (commercial or API terms) |
| 3 | Wikipedia | CC BY-SA 4.0 | Yes |
| 4 | Wikivoyage | CC BY-SA 4.0 | Yes |
| 5 | Wikimedia Commons | Per-file (CC BY-SA, CC BY, public domain) | Yes |
| 6 | Geograph Britain and Ireland | CC BY-SA 2.0 | Yes |
| 7 | Carta image copies | Per-file, as the original | No, these are Carta copies of images from the sources above |
| 8 | Mapillary | CC BY-SA 4.0 | Yes |
| 9 | GeoNames | CC BY 4.0 | Yes |
| 10 | Inside Airbnb | CC BY 4.0 | Yes |
| 11 | Eurostat | CC BY 4.0 | Yes |
| 12 | EuroGeographics | Eurostat GISCO conditions | Yes |
| 13 | European Environment Agency | EEA re-use policy (CC BY 4.0) | Yes |
| 14 | ONS Open Geography | Open Government Licence v3.0 | Yes |
| 15 | GMBA Mountain Inventory | CC BY 4.0 | Yes |
| 16 | geoBoundaries | Mixed per release (ODbL, public domain) | Yes |
| 17 | NASA POWER | US Government work (no restriction; acknowledgement appreciated) | Yes |
| 18 | UNESCO World Heritage Centre | UNESCO WHC terms of use (verify) | After the licence is confirmed (the file marks it verify) |
| 19 | CHELSA | CC BY 4.0 | Yes |
| 20 | OpenTripMap | OpenTripMap API terms | Owner decides (commercial or API terms) |
| 21 | Overture Maps | CDLA-Permissive 2.0 | Yes |
| 22 | EuroVelo | ODbL 1.0 (since October 2024) | Yes |
| 23 | Walk Wheel Cycle Trust (Sustrans) | Open Government Licence v3.0 | Yes |
| 24 | Spatial Hub Scotland (Improvement Service) | Open Government Licence v3.0 | Yes |
| 25 | SchweizMobil and the Federal Roads Office (ASTRA) | opendata.swiss terms (free reuse with the source named) | Yes |
| 26 | European Environment Agency, protected sites | EEA re-use policy (CC BY 4.0) | Same note as the EEA row above |
| 27 | Copernicus GLO-30 | Copernicus DEM instance terms (credit required) | Yes |
| 28 | swisstopo | swisstopo open government data terms | Yes |
| 29 | IGN | Etalab Licence Ouverte 2.0 | Yes |
| 30 | Kartverket | CC BY 4.0 | Yes |
| 31 | Natural England | Open Government Licence v3.0 | Yes |
| 32 | Transitous | Per underlying feed (see the national feeds below) | Yes |
| 33 | SNCB / NMBS | Open data terms (transportdata.be) | Yes |
| 34 | De Lijn | CC BY 4.0 | Yes |
| 35 | STIB / MIVB | Brussels open data licence | Yes |
| 36 | TEC | Walloon open data terms | Yes |
| 37 | GTFS.de / DELFI | CC BY-SA 4.0 | Yes |
| 38 | Entur | NLOD | Yes |
| 39 | Digitraffic | CC BY 4.0 | Yes |
| 40 | opentransportdata.swiss | opentransportdata.swiss terms of use | Yes |
| 41 | transport.data.gouv.fr | ODbL 1.0 | Yes |
| 42 | Open-Meteo | CC BY 4.0 (non-commercial API tier) | Owner decides (commercial or API terms) |
| 43 | Exchange Rate API | Open endpoint terms (credit link required) | Owner decides (commercial or API terms) |

Count by the last column: 36 yes (the EEA note is one of them and also covers the protected sites entry), 1 same note as the EEA row, 1 after the UNESCO licence is confirmed, 4 owner decides, 1 no. That is 43. So 36 notes are certain, and up to 5 more depend on the owner.

Three cautions, all from existing files. UNESCO's terms are marked "verify" in attribution.js, so no note goes to UNESCO until the owner has read its terms. A note must not imply endorsement (Execution/P12/T208-press-and-partnerships.md). EuroVelo already has the prescribed wording and needs no permission, only this note (same report).

## Draft 2: the co-announce question for the long-lead partners (add to the D-21 email)

Execution/P12/T208-press-and-partnerships.md says the L1 to L3 emails are already planned and that what they lack is one question. The runway sends those emails at D-21 (Execution/P12/T220-launch-runway.md, row D-21). Add this paragraph to each, near the end, after the request the email is about.

Paragraph to add:

Carta goes live on {{LAUNCH_DATE}}. If you are happy with how your route appears, would you be willing to announce it with us, in your own words and on your own channels? I would send you the screenshots and a short text beforehand, and you would see everything before it is public. A plain no is fine and changes nothing about the route.

Per recipient, from the read on 2026-10-02 in the T208 report:

| Track | Recipient | What to adjust |
|---|---|---|
| L1 | Culture Routes Society | The contact route is unverified: its site did not resolve. Find the real address first (row T208-b) |
| L2 | Tasuleasa Social Association, Via Transilvanica | Its site offers a press materials download, so send the screenshots in that format. The site does not mention GPX, so the email stays a request for permission and the co-announce paragraph stays optional |
| L3 | Via Dinarica coordinators (Terra Dinarica, Croatian Mountaineering Association, RRA Zeleni kras) and Greek NECCA | Several separate conversations, one email each. NECCA was not checked. The Croatian body is the same as HPS |

The soft launch group excludes these partners (Execution/P12/T220-launch-runway.md), so none of them sees a draft build. If the owner rewrites the paragraph, keep the two guarantees: they see the text first, and a no costs nothing.

## The channel test, closing T204-b

Register row T204-b asked that T205, T207 and T208 test every channel against the ceiling in docs/GTM-ACQUISITION-CONSTRAINT.md, using its three questions: cost per visitor with its source, the comparison with about EUR 0.17, and a lever if above. The ceiling is EUR 6.85 contribution per purchase at an assumed 2.5% purchase rate (docs/GTM-ACQUISITION-CONSTRAINT.md, from CARTA_UNIT_ECONOMICS.md section 5).

Result of reading the three reports:

| Report | Channels | Test applied | Finding |
|---|---|---|---|
| Execution/P12/T207-launch-channels.md | Show HN, OSM forum and weeklyOSM, Reddit, Product Hunt, newsletters by interface | Yes, in its "Channels" section. Cash EUR 0, so the first two questions pass by construction. Third question not triggered. Paid placements ruled out | Passes. Hours are stated as planning estimates, not measurements, and visitor yield is stated as unknown |
| Execution/P12/T208-press-and-partnerships.md | weeklyOSM, OSM forum, EuroVelo news, Via Transilvanica, startup press, UK walking titles, data.europa.eu | Yes, in "The constraint applied". Cash EUR 0. Sponsored slots and fees ruled out | Passes. No hours figure given because none exists in any file |
| Execution/P12/T205-programmatic-seo.md | Organic search, by page type | Not stated. A search of the report for the ceiling, the constraint document or "0.17" finds nothing | Gap, closed here below |

Organic search, tested here. Cost per visitor in cash: EUR 0, because the source states that organic is the only channel that works at this ceiling (CARTA_UNIT_ECONOMICS.md section 5, repeated in docs/GTM-ACQUISITION-CONSTRAINT.md). That is below EUR 0.17. The cost is engineering time on T221, T222 and T239, which the constraint document names as the work that replaces paid traffic. The third question is not triggered. The lag from sitemap submission to indexing is unmeasured (T220-e), so no visitor figure is claimed.

The two drafts in this file. The courtesy notes and the co-announce question cost EUR 0 in cash and the time to fill and send each note; no hours figure is given because none is measured anywhere. They are not a visitor channel: no visitors are expected from them and none is counted.

What is not enforced. The constraint document is cited by these reports, but no check fails when a later channel proposal omits the test. That is a habit, not a gate, and it stays one. A new channel proposal after this task must still state the three answers; this section is the model.

Conclusion: every channel in T205, T207 and T208 is at EUR 0 cash against the EUR 0.17 ceiling, none needs a lever, and paid channels of every kind remain out. T204-b is closed.

## What the owner must do

Set D (T207-a). Confirm /about/numbers on the Pages deploy (T318-a). Approve or rewrite the two drafts (T336-a). Decide the four "owner decides" bodies and confirm UNESCO's terms (T336-b). Strike any body the owner would rather not contact. Send the notes by hand at D.
