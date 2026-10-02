# T206 Community credibility: the outdoor route

## Task ID

T206 (mind-map M06)

## Date

2026-10-02

## What changed

Carta now has a written map of where European hikers, bikepackers and trail runners gather, what each place tolerates from a product, which national bodies publish route data Carta may reuse and which forbid it, and two or three things Carta can bring to each group that are useful before they are promotional. Nothing in the app changed. The research corrected the premise the mind map was built on. The WHY says Carta "gives it away free on every route" and offers uploaders a licence choice that "costs nothing". Neither is true of the build today. The trail GPX is behind the Trip Pass: `continent-app/src/browse/TrailPage.jsx` line 492 calls `paywall.require('export')` before `trailGpx()` runs, and `export` is a hard gate in `src/hooks/usePaywall.jsx` (`GATES.export = { kind: 'hard' }`), so a signed-out or free-tier walker who presses "Download GPX" gets the pass modal with the copy "PDF, calendar and map files come with a pass". The cycling GPX is free: `src/browse/CyclePage.jsx` line 634 calls `downloadGpx()` with no gate. The journeys carry `typeSpecific.gpxReady` on 30 of 253 files and no button reads it. There is no upload path for a route or a photo, and so no licence choice; the terms (`src/components/TermsOfService.jsx`, "Your content and how you may use Carta") grant Carta a right to store, process and display trips and plans, and nothing transferable or sublicensable, nothing public.

So the plan below is written in two halves. The first half says what Carta can truthfully bring to each community today, which is the cycling GPX, the ODbL attribution inside every file, the day price at the trailhead town and the honest coverage line. The second half says what becomes sayable once the owner lifts the export gate from the trail GPX (T206-a) and once an upload path with the CC BY or CC BY-SA choice exists (T206-b). Going to these communities with the mind map's two claims before those land would be the one thing every forum in the list bans: a product saying something about itself that is not so.

## The two claims, checked against the repository

| Claim in the mind map | State on 2026-10-02 | Where |
|---|---|---|
| Free GPX on every route | Trails: gated behind the pass (hard `export` gate). Cycling: free, no gate. Journeys: 30 of 253 flagged `gpxReady`, no button wired. Beaches, lakes, mountains: no GPX by design. | `TrailPage.jsx` 491 to 495; `usePaywall.jsx` 44 to 46; `CyclePage.jsx` 257 and 634; `public/journeys/journey/*.json` |
| Uploaders choose CC BY or CC BY-SA on top of the platform licence | No upload path exists for routes or photos; no licence choice; the terms grant no public licence and no sublicensable right | `TermsOfService.jsx` 240 to 263; `src/community/` holds text guides only |
| Every file carries OSM attribution | True. The trail export and the cycling export both write the ODbL credit into the file and the terms tell the traveller to keep it | `src/lib/trailExport.js` header; `CyclePage.jsx` 46 to 47 and `gpxCredit()`; terms lines 257 to 263 |
| The "Send to a hiking app" path | True on phones that accept a file share; otherwise the same download. Named apps: Komoot, Gaia GPS, Garmin Connect, OsmAnd, Organic Maps, Suunto | `trailExport.js` header; `TrailPage.jsx` 473 to 495 |

The gate is deliberate, not a bug: `usePaywall.jsx` names "the GPX export, the KML, the PDF" as the gated actions and the paywall work that built the hook put them there. Removing it is a product decision with a revenue consequence, which is why it is an owner row and not a fix in this task.

## What the audience actually complains about

The complaint is real and it is recent, but its shape is narrower than "GPX paywalls". What people pay for, and resent paying for, is the step between a route and their own device.

Komoot changed on 2025-02-27: every account created after that date needs Premium (USD 59 a year or 4.99 a month at the time) to send a route to a Garmin, Wahoo or Hammerhead; accounts that had bought a region or Premium before that keep the sync. The GPX export itself needs the start region unlocked, and a free account gets one region. DC Rainmaker's write-up (2025-03) says the strategic problem out loud, "it's going to be hard for many users to justify yet another monthly/annual subscription, simply to sync a route", and the reaction road.cc collected carries the line that matters for Carta: "services like that grow from word of mouth. Who is going to be recommending komoot now when you need a subscription to use the most basic of functionality?" The same threads name cycle.travel and plotaroute as the alternatives people switch to, and a browser extension that pulls the GPX out so it can be pushed through Strava for free. Komoot's newsroom put its registered users at 40 million on 2024-06-19, so the people annoyed by this are not a niche.

AllTrails has required AllTrails+ for GPX and KML download for years (its own help page "Downloading files from AllTrails" and every third-party how-to say so). Strava is the counter-example: a free account can export the GPX of its own activities and of any public route, and only importing a route needs the subscription. Wikiloc lets a free web account download a track to a computer and puts send-to-device behind Premium.

The free sources this audience already names, and that Carta would be measured against, are Waymarked Trails (OSM relations, GPX under ODbL, "mass download is not allowed"), bikepacking.com ("clicking the Download GPX box below the map", free, with the waypoints and a date in the file), Wandelnet in the Netherlands (free GPX and PDF on every route), Schweizer Wanderwege (over 1,000 route suggestions with PDF, KML and GPX) and alpenvereinaktiv (the DAV, ÖAV and AVS portal built on Outdooractive). Carta's trail GPX sits today on the AllTrails side of that line.

Two consequences for the plan. First, "free GPX" is table stakes in the open-data corner of this audience and a differentiator only against the two commercial giants; the honest claim once T206-a lands is "the same free GPX as Waymarked Trails, with the elevation the wire measured, the stops as named waypoints and the price of the night in the town it starts from". Second, the thing people switch for is the device step, and Carta does not sync to anything. A GPX download plus the Garmin Connect or Wahoo app import is the free route and should be documented as one, in the same plain voice the FAQ uses. Audax UK's organiser handbook shows what this audience expects of the file itself: a track, not a route, through every control, at most 500 trackpoints per 100 km.

## Where the communities are, and what each one allows

Every rule below was read on 2026-10-02 from the community's own page unless marked "via search extract" (the page returned 403 to the fetcher and the text came from a search engine's excerpt of it). Reddit refused every fetch from this machine (403 on the rules endpoints of fifteen subreddits), so the Reddit rows carry only what search results and public listings showed, and the first post in any of them waits on a human reading of the rules page (T206-e). Facebook groups return only a title to a logged-out reader and are listed as a gap, not as a plan.

Four places the task named are not venues. trekking-forum.de and trail-forum.de are parked domains. Komoot has no community forum; its "community" is in-app comments and a help centre, and its guidelines only ban spam. ITRA is a race calendar and ranking database with no forum (forum.itra.run does not resolve). The Ramblers, the LDWA and Audax UK run members-only lists and forums.

Forums where a thread about a product is written as forbidden without prior approval:

| Community | Where, who, language, size as stated | The norm, in its own words or close to them |
|---|---|---|
| Walkhighlands forum | Scotland; English; classified adverts from GBP 75 plus VAT a year; the forum is advert-free | "The forum is not the place to promote your company, product, personal website or blog." A company poster pretending to be a member of the public "will lead to an immediate ban". New threads "cannot be started either praising or linking to third party businesses or websites, even if you have no connection". Via search extract. |
| UKHillwalking and UKClimbing | UK; English; the hillwalking forum of record | "Commercial messages are not allowed in the main forums." Products, services and lectures go in paid Premier Posts at GBP 25 to 75 plus VAT a week, "even if your site is non-commercial and contains no advertising". A Commercial Profile may carry the company name "so long as you do not try to overtly promote your products or services". Via search extract. |
| Singletrack World forum | UK; English; Bike Forum 339.6K topics and 4.7M posts | "No Trade or business advertising, except bona fide retailers may respond to genuine enquiries from potential customers by replying to an existing post. Trade accounts must NOT start a new topic ... If we suspect astroturfing we will delete first and ask questions later." Read directly. |
| Cycling UK forum | UK; English; where UK bikepacking threads live | "Postings of a commercial nature will be removed without warning, unless previously approved for posting by Cycling UK." No company in a username, signature, link or avatar. Read directly. |
| CycleChat | UK; English; volunteer-run | "Using our community for self-promotion, marketing, free advertising, affiliate/revenue links, or solicitation of our membership will result in your account being closed and your details reported to anti-spam databases." Read directly. |
| randonner-leger.org | France; French; owned and financed by one person, no advertising | "Les messages pouvant amener un intérêt pécuniaire pour son auteur sont interdits": sales, affiliate links, disguised advertising, promotions, market studies, contests. A professional may obtain a derogation and post only in "Avec les professionnels". No external URL in a signature. Read directly. |
| Garmin forums | Garmin; English and localised boards | "Advertising, spamming, solicitation, and commercial self-promotion are not allowed." The one carve-out is the Connect IQ Showcase for Connect IQ apps, with links allowed in posts and signatures; a web app without a Connect IQ companion does not qualify. Read directly. |
| Forum Gipfeltreffen | Austria; German; 59,308 registered members, 71,996 threads, 961,491 posts as stated | "Kommerzielle Werbung im Forum Gipfeltreffen ist kostenpflichtig"; advert posts "müssten vor Platzierung mit der Forumsleitung vereinbart werden". Read directly. |
| alpinforum.com | Austria and Germany; German | "Commerzielle Werbung und Verlinkungen zu externen Seiten werden gelöscht"; links that amount to advertising need prior approval. Read directly. |
| Avventurosamente | Italy; Italian; XenForo | "È vietato fare propaganda", "È vietato inserire messaggi pubblicitari"; commercial users may not reference their business in signature or messages unless they buy the advertising package. A live thread (65780) shows a developer announcing a guided-hike platform, asking whether the rules allow a link, and getting product feedback rather than a removal. Read directly. |
| bergfex | Austria; German and English; comments only | "The publication of comments that serve the purpose of advertising products or services is prohibited." Read directly. |
| hikr.org | Switzerland; German with IT, FR and EN sections; non-profit, two volunteer administrators | "Only the site administrators are permitted to publish advertising of any kind"; Pro accounts fund the site. Via search extract. |
| HORYINFO | Czechia; Czech | "Soukromá inzerce všeho druhu. Chcete-li firemní inzerci, kontaktujte redakci" (private adverts only; business advertising through the editorial office). Read directly. |

Forums with a sanctioned way in, or where declared participation is tolerated:

| Community | Where, who, language, size as stated | The norm, and the door |
|---|---|---|
| outdoorseiten.net | Germany, Austria, Switzerland; German; a registered non-profit association; 1,933,718 posts, 87,680 topics, 36,093 members on the day read | "Kommerzielle Angebote und Werbung sind grundsätzlich verboten." Commercial users "sind willkommen, sofern sie sich mit sachlichen und konstruktiven Beiträgen beteiligen" and must declare themselves at registration. One undisguised link per signature: "Es ist verboten, den Link mit Werbeaussagen anzupreisen oder das Ziel zu verschleiern." Read directly. |
| Ultraleicht-Trekking forum | Germany; German; the live successor to trekking-forum.de | Unwanted advertising banned; manufacturers and dealers may take part "sachlich und konstruktiv"; every paid or gifted link and every free sample must be disclosed. Read directly. |
| Backpacking Light forums | USA with European members; English | "Any postings regarding commercial deals or product announcements should be posted in the Gear Deals forum only and must include a full disclosure of any vested interest." Links "may not include affiliate, conversion, or other types of tracking codes." The clearest written "announce here, disclose, no tracking links" rule in the set. Read directly. |
| Camptocamp forum and topos | France, Switzerland, Italy, Spain; French first; a volunteer association; routes, waypoints and outings CC BY-SA 3.0 by policy, images CC BY-SA or CC BY-NC-ND at the author's choice; "Commentaires des documents" 72,086 topics | Promotional or commercial content is excluded from signatures; "private sale" sites are banned outright; new goods from a professional seller are refused in the classifieds. The licence culture is the point: the association calls CC BY-SA its founding principle and its forum argues about moral rights on its own topos. Via search extracts and the licence threads. |
| community.openstreetmap.org and the OSM France and OSM DE categories | Worldwide, per language; the OSMF on Discourse | "Don't post spam or otherwise vandalize the forum." No written rule on products; the thread "OSM usage in commercial product" (116065) shows commercial use welcomed when ODbL attribution and share-alike are honoured. OSM France's GR thread concludes that the mark may be cited as a reference while the FFRandonnée also claims copyright on the itineraries, "a gray zone" it has not enforced against OSM. Read directly. |
| OsmAnd GitHub Discussions and Organic Maps Telegram | Worldwide; English with language groups | GitHub's community guidelines only; "Show and tell" is the category for an OSM-based tool. Both communities are OSM-first and ad-free by identity. Read directly. |
| Mendiak.net | Spain, Basque Country; Spanish; phpBB since 1995; 36,142 topics, 456,482 messages, 20,228 users as stated; the site is CC BY-NC-ND 4.0 | GPS and track sections; photos belong to their authors; the full rules page was not read. Partly verified. |
| iRunFar and The Radavist comments | USA; English; single-publisher sites | iRunFar: "If it reads like an ad, chances are it's spam." The Radavist: "All we ask is that you are respectful to others." Read directly. |
| bikepacking.com and the Bikepacking Collective | US-run, global, English; over 300 routes with free GPX; a paid Collective at USD 39, 68 and 150 a year with a members-only Basecamp | No public forum and no documented Discord; the community is the comments under each route and Facebook messaging for route changes. Half of a Builder's dues go to a Routes Fund, which says what the site values. Read directly. |
| xc-run.de Community | Germany; German; "DER Online-Treffpunkt der Trailrunning-Szene"; ad-supported | No posted rule on member commercial posts found. Not verified. |
| Trek-lite | UK; English; the live UK ultralight forum | Conduct and trading rules, a "Shopping" section for "Shops, cottage industries etc."; no explicit commercial-post rule found. Partly verified. |

Reddit, Facebook and Discord, which could not be read:

| Community | What is known | Status |
|---|---|---|
| r/bikepacking | 225,729 members per reddapi.dev (undated); English, US-weighted | Rules not readable from here; T206-e |
| r/hiking, r/Ultralight, r/trailrunning, r/Garmin, r/wahoofitness, r/komoot, r/AllTrails, r/openstreetmap, r/gravelcycling, r/cycling, r/wandern, r/Fahrrad, r/osmand | Reddit's site-wide spam rule treats "users who contribute primarily with links to businesses they own or benefit from" as spam; the customary ceiling is one promotional post in ten. r/Ultralight is where cottage gear brands were launched through r/MYOG, so the culture tolerates makers who show their work. r/komoot and r/Garmin are where the 2025 sync change was argued. | Rules not readable from here; T206-e |
| Facebook groups: Bikepacking, Bikepacking Europe, Long Distance Cyclists, Senderismo y Buen Rollo, Corsica GR20 Q&A, Tour du Mont Blanc Q&A, the Camino groups, Bergsüchtig, RANDONOS | Group pages return a title only; the member counts in circulation are third-party figures (70,000 for Long Distance Cyclists in a 2022 article, "más de 70.000" for Senderismo y Buen Rollo on a listing site) and are not claimed here. One Spanish group rule quoted in a listing: no advertising of any kind without the organiser's express permission. | Not verified; a logged-in manual pass is needed; T206-e |
| Discord | A 127-member "Bikepacking" server exists and does not identify itself as bikepacking.com's; route-specific servers are linked from some bikepacking.com pages (Gravel Challenge Across Switzerland) | Not verified |

## The federations: who publishes reusable route data and who forbids it

The federations and clubs are a different kind of place: not somewhere to post, but somewhere Carta's data touches theirs. Each has a written position on reuse, and the positions split cleanly.

Reusable, compatible with an ODbL product: EuroVelo (the ECF put its GPX tracks under ODbL in October 2024, with a required notice naming the download date; `src/data/attribution.js` already carries it), CAI Infomont in Italy ("INFOMONT è un dato aperto, distribuito con Open Data Commons Open Database License", attribution to OpenStreetMap contributors and "INFOMONT (© Club Alpino Italiano)"), FEDME's homologated GR, PR and SL trails via the CNIG download centre (about 50,000 km in KML, GPX and SHP under CC BY 4.0 with FEDME attribution), SchweizMobil's official route geometries ("Die Geodaten von SchweizMobil sind als Open Government Data (OGD) verfügbar und dürfen somit frei verwendet werden", licence "BY", source "Bundesamt für Strassen, Kanton, Stiftung SchweizMobil"; route texts CC BY-SA with source "SchweizMobil"), and the Sustrans National Cycle Network (now Walk Wheel Cycle Trust) under the Open Government Licence with an Ordnance Survey attribution. docs/TRAILS.md section on portal cross-checks already uses several of these as validation spines; Infomont and the Swiss OGD geometry are the two it could also publish from.

Explicitly restricted: FFRandonnée ("Aucun tiers ne peut reproduire, représenter ou encore exploiter commercialement ou gratuitement les itinéraires ainsi que les marques détenues par la FFRandonnée sans son autorisation, formalisé par un contrat"; GPX "seulement à des fins privées"; MonGR's terms forbid export and sublicensing; the federation also claims copyright on the itineraries, citing Cour de cassation 1998), alpenvereinaktiv (§11.2 of its terms forbids distributing other users' content), Wikiloc ("only for domestic and private purposes"), Wandelnet (all IP including database right rests with Wandelnet; copying beyond own use needs written consent), the SAC Tourenportal (subscription), SchweizMobil Plus user tours (partners only, the restriction is on the Plus product, not the OGD geometry), Grote Routepaden (copyright clause; no GPX clause), the KČT in Czechia (publishes only the list of routes as open data and sells the geometry). In Spain, as in France, GR, PR and SL are registered marks of the federation even though the tracks are open. docs/TRAILS.md line 901 already records that GR traces "are not open and will not become so" and keeps French rows on OSM `ref=GR*` relations; the title ladder (`pipeline/trails/names.py` lines 85 to 106) moves codes such as "GR 564" into a reference chip and out of the title, which is the OSM France practice. Whether citing the federation's itinerary name as a reference is nominative use or needs a contract is the question T206-d carries.

Not verified: Schweizer Wanderwege's GPX terms (its general conditions require written consent for public or commercial reproduction), Ramblers Routes (members-only in the app), DNT's UT.no (copyright held by DNT, no reuse licence published), PZS maPZS, PTTK, ADFC, Fietsersbond.

Channels rather than data: the ERA does not host E-path GPX at all and points visitors to Waymarked Trails and Wikipedia, with the note that unverified E-paths "may rely on sources such as Open Street Map ... for which ERA is not responsible"; it has partner, member and sponsor routes. Komoot's partner profile is free for "any organization or company that wants to share route suggestions", with embeds and QR codes, and more than 800 associations including the BMC and Cycling UK use it. Outdooractive runs a three-stage association programme from a free business account to a white-label app. The DAV books no classic advertising ("a non-profit association, not a commercial brand") and lists Outdooractive as its Tourenpartner. ITRA, UTMB and the Golden Trail series are race organisations with press desks and no route library.

## Which communities would find the two things notable

The free GPX is notable to the device communities and to nobody else. r/Garmin, r/wahoofitness, r/komoot and the DC Rainmaker comment threads are where the 2025 Komoot change was argued and where "which free source can I load onto my Edge" is asked every week; outdoorseiten.net's Ausrüstung boards are the German equivalent. For the open-data communities (OSM, Waymarked Trails users, Camptocamp, Mendiak) a free GPX from OSM data is expected, and the claim earns nothing unless Carta adds what Waymarked Trails does not: measured elevation in the file, the stops as waypoints, and the night's price in the town. Walkhighlands and Singletrack would find it notable and will not let it be said in a new thread.

The licence choice is notable to the open-data communities and to nobody else. No mainstream route platform offers one: Komoot, AllTrails, Strava, Wikiloc, Bikemap, bergfex and alpenvereinaktiv all leave the user as copyright owner and take a broad non-exclusive licence (AllTrails' and Strava's are sublicensable, Komoot's survives deletion), and none lets the uploader pick a public licence. Camptocamp is the only route platform found where contributed routes are CC BY-SA by policy, and its images already carry an author's choice between two CC licences. So the choice is a real differentiator, and the communities that would notice are Camptocamp, the OSM forums, OsmAnd and Organic Maps users, Mendiak and the Waymarked Trails audience. These are the people the destinations spec (2.8) wants in order to fill the Balkan gap. The device communities would not care.

One correction to the spec on the way: a CC BY or CC BY-SA choice does not by itself make a route "legally clean" to contribute to OpenStreetMap. The OSM wiki's ODbL compatibility page lists CC BY 4.0 as "likely incompatible" without the OSMF's signed waiver for attribution and distribution, and every CC BY-SA version as incompatible with no waiver available, "consider contacting rights holder(s) for explicit permission". So the choice that actually lets a Carta upload flow into OSM is a third, explicit tick: "OpenStreetMap may use this track under its contributor terms", recorded per upload. The OSM community would notice that tick more than the CC choice. Legal has to confirm the wording before it is built (T206-c), and nothing is said to the OSM community about contributing back until it exists.

## The plan: showing up usefully

Six rules apply everywhere, because every community above enforces at least one of them.

One named person, declared. outdoorseiten.net and Ultraleicht-Trekking require a commercial account to say so at registration; Walkhighlands, Singletrack and CycleChat ban the undeclared company account on sight, and CycleChat reports it to anti-spam databases. The person posts under their own name with "I build Carta" in the profile and never a second account.

Reply, do not post. Singletrack allows a trade account only to answer an existing enquiry; Walkhighlands allows no new thread that links a business; Cycling UK removes commercial posts without warning unless approved. The default on every forum is to answer the question someone already asked, with the fact, and a link only where the forum's rules allow one and the fact lives there.

Bring the number, not the link. A reply that says what a night in Zernez measured at and when, with the provenance word, is useful without a URL; the URL can follow if someone asks. This is also the only voice the product has (PRODUCT.md, the brand voice section).

Name the alternatives. The free-GPX answer lists Waymarked Trails, bikepacking.com, Wandelnet, Schweizer Wanderwege, alpenvereinaktiv and Carta together, because that is the true answer and because a list of six is advice and a list of one is an advert.

Pay where the forum sells, disclose where it asks. Walkhighlands sells a classified from GBP 75 plus VAT a year and says freeloading is unfair on the companies that pay; UKHillwalking sells a Premier Post for GBP 25 to 75 plus VAT a week; Gipfeltreffen and Avventurosamente sell an advertising package. If Carta wants to be found there, it buys the slot; it does not post. Where a forum has a disclosed announce path (Backpacking Light's Gear Deals, randonner-leger's "Avec les professionnels" by derogation, bikeforums' Industry News via staff), it uses that path, with the vested interest stated in the first line and no tracking parameter on any link.

Never say the thing that is not yet true. Until T206-a, the trail GPX is a pass feature and is not mentioned; the cycling GPX is. Until T206-b and T206-c, the licence choice is not mentioned anywhere.

What to bring to each community, two or three things, each of which exists or is one named task away.

Device communities (r/Garmin, r/wahoofitness, r/komoot, DC Rainmaker comments, outdoorseiten Ausrüstung, Garmin forums only as a reply). First, a plain, tested walkthrough of the free path from a GPX file to a Garmin and to a Wahoo (Garmin Connect import, Wahoo app import), written in the FAQ voice, that works for any GPX from any of the six free sources. Second, the cycling GPX itself: a EuroVelo section with the surface share per kilometre and the quiet-road score in the page beside it, which no free source gives. Third, once T206-a lands, the trail GPX with measured elevation and named waypoints, built as a track and not a route, which is what Audax UK's handbook tells organisers this audience's devices want.

Bikepacking (r/bikepacking, bikepacking.com route comments, Cycling UK forum as a reply, Bear Bones if its rules allow). First, the day price: what a night and a day of eating out cost in the towns a published route passes, per person, with the provenance word, which is the question under every multi-day route thread and which bikepacking.com's pages do not answer. Second, the EuroVelo family pages (17 families, 16,973 sections on the wire) as a stage index with free GPX per section, because EuroVelo's own GPX going open was news on bikepacking.com ("EuroVelo Routes Finally Available as GPX Files") and the ODbL notice in `attribution.js` makes Carta's copies clean. Third, the honest coverage line for the Balkans: "we publish 12 walks in Albania and know of 31 more", which is the kind of sentence that community respects and that invites the upload path when it exists.

The OpenStreetMap community (community.openstreetmap.org, the OSM France and OSM DE categories, r/openstreetmap, OsmAnd "Show and tell"). First, the gap list: `coverage.json` and docs/TRAILS.md name the relations that fail the continuity gate ("142 of the first 545 published" routes teleported, TRAILS.md line 32); published per country as a mapping to-do list, that is a contribution to the map rather than a request of it. Second, the GR practice already in `names.py`, refs out of titles and into the chip, offered as a worked example in the OSM France GR thread. Third, after T206-c, the OSM permission tick on uploads, announced in the forum's import category with the waiver wording, because that is the one thing this community will repeat.

The walking forums (Walkhighlands, UKHillwalking, outdoorseiten Tourenvorbereitungen, Ultraleicht-Trekking, randonner-leger, Camptocamp, Gipfeltreffen, Mendiak). First, nothing promotional, ever; a declared account that answers cost questions with measured figures. Second, the coverage status as an answer to "is there anything on X in the app", given straight, including "no, and here is why". Third, on Camptocamp and Mendiak only, the licence choice when it exists, because those sites already run their content under CC licences and will understand it without explanation.

The federations. FFRandonnée: nothing until T206-d decides whether to ask for a contract (partenariats@ffrandonnee.fr is the published door) or to keep the French rows to OSM references; CAI: Infomont is ODbL and the one national trail register Carta could ingest as a spine without asking, a pipeline task to raise when the Italian rows are next touched; FEDME: the CNIG tracks are CC BY 4.0 and usable, the GR and PR marks are not; SchweizMobil: the official geometry is OGD "BY" and may be used with the three-part attribution, the Plus product output may not; Wandelnet and NKBV: nothing to ask, the Dutch rows stay on OSM; ERA: one email offering the twelve E-path parent pages as a free, attributed GPX source for a site that today sends people to Waymarked Trails, after T206-a; Komoot's free partner profile and Outdooractive's free business account are channels Carta can hold a profile on without handing over data, if the owner wants a presence where 800 associations already are. ITRA and the running associations: not a route channel; the useful thing for trail runners is the race-town day price, which the Destinations tab already gives.

The order is the order of the open items: lift the gate, build the upload path with the three-way licence choice, confirm the OSM waiver wording, then the first post. Before that, the only thing to do in these communities is to read them, which T206-e makes a logged step rather than an assumption.

## Files touched

**Modified:**
- Execution/_OPEN.md (six register rows appended)

**Created:**
- Execution/P12/T206-community-credibility.md

## Commands run

All reads were made in the main checkout; the sparse worktree holds no `continent-app/`.

```
python Execution/_queue/xmind_prompt.py T206
grep -n "gpx\|paywall" continent-app/src/browse/TrailPage.jsx continent-app/src/browse/CyclePage.jsx
sed -n 1,110p continent-app/src/hooks/usePaywall.jsx
sed -n 238,262p continent-app/src/components/TermsOfService.jsx
python - <<EOF   # count typeSpecific.gpxReady over continent-app/public/journeys/journey/*.json: None 222, True 30, False 1
EOF
grep -n "GR" pipeline/trails/names.py docs/TRAILS.md
```

Web reads on 2026-10-02, by this session and by two research subagents (web only, no files): dcrainmaker.com (Komoot paywalls, 2025-03), road.cc (Komoot subscription), newsroom.komoot.com (40 million users), komoot.com terms and community guidelines, komoot.business partner pages, support.alltrails.com "Downloading files from AllTrails", alltrails.com terms, strava.com terms, wikiloc.com terms (via search extract), blog.bikemap.net terms, bergfex.com AGB, alpenvereinaktiv.com AGB, ffrandonnee.fr "La propriété intellectuelle fédérale", mongr.fr CGU, forum.openstreetmap.fr "Un point sur les marques GR et GRP", community.openstreetmap.org guidelines and thread 116065, wiki.openstreetmap.org "Import/ODbL Compatibility" and Etiquette Guidelines, osmfoundation.org Licence and Legal FAQ, images.schweizmobil.ch Antrag Datenbezug PDF (June 2025), schweizer-wanderwege.ch AGB and media page, cai.it Infomont, centrodedescargas.cnig.es senderos FEDME, pro.eurovelo.com GPX licence PDF (2024-10-07) and news, datamap.gov.wales NCN metadata, wandelnet.nl algemene voorwaarden, groteroutepaden.be algemene voorwaarden, ut.no "om UT", dnt.no partner page, openstreetmap.cz turistika, era-ewv-ferp.org E-paths and LQT pages, utmb.world press, itra.run, business.outdooractive.com associations, outdoorseiten.net Nutzungsregeln and signature-rule threads, gipfeltreffen.at, alpinforum.com rules, ultraleicht-trekking.com terms, hikr.org FAQ (via search extract), singletrackworld.com terms, forum.cyclinguk.org guidelines, cyclechat.net terms, walkhighlands.co.uk moderation policy (via search extract), ukclimbing.com guidelines (via search extract), randonner-leger.org charte, forum.camptocamp.org rules and licence threads (via search extracts), camptocamp.org licence article, backpackinglight.com guidelines, trek-lite.com guidelines, avventurosamente.it terms and thread 65780, mendiak.net, horyinfo.cz, irunfar.com comment policy, theradavist.com about, bikepacking.com "Using routes" and "Join", hiking.waymarkedtrails.org about (via search extract), github.com/osmandapp discussions, organicmaps wiki, audax.uk organisers' handbook, reddapi.dev r/bikepacking, knifeedgeoutdoor.com and followthecamino.com group listings. Reddit returned 403 on every rules endpoint; Facebook group pages returned titles only.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Communities with a written norm in the repo | 0 | 25 forums and sites with a norm read from the source or its search extract; 14 subreddits, 9 Facebook groups and 1 Discord listed as unverified | +25 verified |
| Federations and clubs with a written reuse position | 0 | 20 (5 reusable, 8 restricted, 7 not verified) | +20 |
| Communities with two or three useful things named | 0 | 5 groups (device, bikepacking, OSM, walking forums, federations) | +5 |
| Route surfaces with a free GPX | 1 of 3 (cycling; trails gated; journeys unwired) | same | 0 |
| Journeys with `gpxReady` set | 30 of 253 | same | 0 |
| Upload paths with a licence choice | 0 | 0 | 0 |
| Mainstream route platforms found that offer uploaders a CC choice | not known | 0 of 8 checked (Camptocamp is CC BY-SA by policy, not by choice) | measured |
| Claims in the mind map's WHY that hold today | 0 of 2 | 0 of 2, both corrected and routed to owner rows | 0 |

## What broke and how it was fixed

No code ran, so nothing broke. Two sources could not be read from this machine: Reddit returned 403 on every subreddit rules endpoint, and Facebook group pages return only a title to a logged-out reader. Both are recorded as T206-e rather than filled in from memory. Several forum pages (walkhighlands moderation, hikr.org FAQ, ukclimbing guidelines, wikiloc terms, waymarkedtrails about) also returned 403 and were read through search extracts, which the tables mark. One correction was made mid-task: an early draft said SchweizMobil's data must not be touched; its June 2025 data-request form says the official geometries are open government data under "BY", and only the Plus product's user tours are restricted, so the federation table was rewritten.

## What is still open

The trail GPX is a pass feature, so the mind map's "free on every route" is false for the layer it was written about. The owner decides whether to remove `paywall.require('export')` from `onGpx` (and whether KML goes with it) in `TrailPage.jsx`, accepting the loss of the "map files come with a pass" line in the pass modal and whatever conversion it carried; until then the plan mentions only the cycling GPX. T206-a.

There is no upload path for routes or photos, so the licence choice has nothing to attach to. The task that builds it (destinations spec 2.8) needs the terms grant made transferable and sublicensable, an attribution commitment, EXIF stripping, start-and-end trimming on GPX, DSA notice-and-action on the moderation surface the T067 to T070 batch built, and a three-way licence choice: platform only, CC BY 4.0, CC BY-SA 4.0. T206-b.

A CC licence does not make an upload usable by OpenStreetMap: CC BY 4.0 needs the OSMF waiver and CC BY-SA is incompatible. The upload form needs a separate, explicit OSM permission tick with wording Legal confirms against the OSMF cover-letter and waiver template, before anything is said to the OSM community about contributing back. T206-c.

FFRandonnée claims copyright on GR itineraries and requires a contract for any reproduction; docs/TRAILS.md keeps the French rows on OSM references and `names.py` keeps the GR code out of the title. The owner decides whether to approach the federation for a contract through partenariats@ffrandonnee.fr, which would open its own route library, or to keep the current position and never cite the federation as a source. The same mark question exists in Spain, where the FEDME tracks are CC BY 4.0 but GR, PR and SL are registered marks. T206-d.

The Reddit and Facebook rules could not be read from here. Before the first post in any community in this report, the owner or the posting person reads its rules page in a browser (logged in, for Facebook), records the date and the rule that governs promotion next to the row in the plan, and only then posts. T206-e.

The journey GPX button of trips spec F4 is not wired: 30 of 253 journeys carry `gpxReady` and no page reads it. It follows T177-b (the track wire and the JourneyPage map) and should reuse `trailExport.js` so the file carries the same credit. T206-f.

Two data opportunities surfaced that belong to the pipeline, not to this plan, and are noted here for the next trails task rather than registered: CAI Infomont (ODbL) and SchweizMobil's OGD geometries could serve as publication spines for Italy and Switzerland, where docs/TRAILS.md today uses portal data only for cross-checks.

## Rollback procedure

Delete Execution/P12/T206-community-credibility.md and remove the six T206 rows from Execution/_OPEN.md, or `git revert` the single commit on branch p12-community-credibility. No app, pipeline or data file changed.
