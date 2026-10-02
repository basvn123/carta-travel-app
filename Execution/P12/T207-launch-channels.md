# T207 Launch channels and the launch day plan

## Task ID

T207 (mind-map M07)

## Date

2026-10-02

## What changed

Carta now has a written launch plan: which surfaces to use, in what order, what each one needs, who answers each thread, and how to back out if the site falls over. Nothing in the app changed. The plan is a document, and it is deliberately honest about three things the mind map assumed.

First, the mind map says the pipeline "ingests forty open sources and credits all of them". Measured, the app carries 43 user-facing credit entries (continent-app/src/data/attribution.js, counted by its `source:` keys), and the ledger registry holds 150 source rows of which 147 are not retired (src/ingestion/core/registry.py, loaded and counted). 1.CARTA.md still says 24 sources are credited in the footer, which is stale on both counts: the credits render in the Account panel's Data sources block, not in a footer. Not every credit is open data (CARTO's basemap is under its own terms), so every post should say "credits 43 sources" and never "43 open datasets".

Second, there is one operator. docs/INCIDENT_RUNBOOK.md says "Owner and only responder: Bas". The task asks for named owners per thread, and the only honest name is Bas. The plan therefore spreads the channels over days so that one person is watching one live thread at a time, and Claude sessions are named only as preparers of artefacts, never as posters or repliers.

Third, the product Show HN and Product Hunt would see is not the product the mind map describes. Since 2026-10-01 no fare source is live, and since T272 (owner decision 2026-10-02) Carta does not price flights at all. The launch story is the priced day and the labelled receipt, not the flight price map. Checkout has never been live (Stripe is stage 10 of Execution/_OPEN-MASTER.md), so a launch before T228 means a free product with a paywall that cannot take money. That is a gate for the owner, listed below, not something this plan can paper over.

## The artefact, decided

Hacker News and Product Hunt reward something a stranger can use in thirty seconds, and punish a pitch. The Show HN guidelines (news.ycombinator.com/showhn.html, fetched 2026-10-02) say the work must be ready to try "without barriers like signups or emails", must be something the poster made and is around to discuss, and that landing pages, newsletters and "other reading material" are off topic. So the artefact is the live app at a deep link that lands on a destination receipt, no sign-in, no email wall. The explainer is a second artefact that travels with it: one write-up titled along the lines of "What a day costs in 3,868 places, from 43 credited sources, and where we have nothing". It is the thing the open-data and maps communities will read, and it is the first comment on HN. It carries three facts only, each already measured elsewhere: the destination count and the coverage statement from Execution/P12/T201-positioning.md (3,868 destinations, 43 countries, 2,077 regions with a status per layer in coverage.json), the five provenance sentences from the same report, and the 43 credits.

The write-up needs a home that is not a landing page and not behind sign-in. That choice belongs to T226 (content platform), so it is an open row here, not a decision.

The part of the story that no travel competitor in Execution/P12/T202-competitive-positioning.md can tell is the coverage honesty: a page that says what Carta cannot map yet. That is what open-data audiences reward, because it is what they do themselves. It is the headline of the explainer, ahead of any number about price.

## Channels

The test applied to every channel is the one in docs/GTM-ACQUISITION-CONSTRAINT.md: cost per visitor with its source, comparison with the ceiling of about €0.17 per visitor (derived there from CARTA_UNIT_ECONOMICS.md section 5: €6.85 contribution per purchase at an assumed 2.5% purchase rate), and a lever if above. Every channel below costs €0 in cash, so it passes the cash test by construction. What it costs is the owner's hours, and those are this report's planning estimates, not measurements. What each channel yields in visitors and in purchases is unknown before launch and no figure is given for it. T215 owns the metrics that will measure it. The third question (which lever raises the ceiling) is not triggered because no cash is spent. Paid placements of any kind (sponsored newsletter slots, Product Hunt promoted spots, Reddit ads) fail the constraint on principle and are out.

Order of use, with what each rewards and punishes. Facts marked verified were read from the named page on 2026-10-02. Facts marked unverified come from general knowledge and must be re-read before use.

Hacker News Show HN. Verified: rewards a working thing people can try, the maker present in the comments, respectful technical conversation. Punishes sign-up walls, landing pages, asking friends to upvote or comment ("That's not ok on HN"), promotional titles (newsguidelines.html: no uppercase, no exclamation points, no editorialising), and using HN "primarily for promotion". Submission shape: title starts "Show HN: Carta, ..." in one plain clause with no adjectives; the URL is the live app deep link; the first comment, posted by Bas at once, is the explainer in plain prose with the honest limits (no flights, estimates are labelled, AI is Gemini with a daily cap). Owner time estimate: 6 hours on the day, mostly replies. This is the lead channel because it is the one where the artefact is exactly what is being asked for.

OpenStreetMap community forum and weeklyOSM. Verified: the forum (community.openstreetmap.org) has no showcase category; the nearest fits are General talk and the regional Communities groups. weeklyOSM accepts one link plus a short English text through OSMBC (osmbc.openstreetmap.de, OSM login), per its wiki page and the weeklyOSM contributing note. Rewards: a project that gives back or at least credits precisely, and says plainly what it did with the data. Punishes: a pitch, and anything that reads as a company using the data without saying so. What the post needs: the credit line wording from docs/tos/data_licenses.md, the produced-work versus database-extract review (section 12 of that file), and a clear statement of what Carta shows from OSM. Unverified and important: whether the community wants Carta's own derived data back is not known; do not promise a data release the licence review has not cleared. Owner time estimate: 2 hours. Post on the same day as Show HN, after it is up, and send the weeklyOSM item three days later so it lands in a clean edition.

Reddit. Reddit's own rules pages could not be fetched from this environment, so everything here is unverified and the first task is to read each subreddit's sidebar. What is verified from search results: r/dataisbeautiful requires "[OC]" in the title only for a visualisation the poster made, with the data source and the tool named. Candidate subreddits, from general knowledge and unchecked: r/dataisbeautiful and r/openstreetmap for the coverage map, r/EuropeTravel, r/budgettravel and r/hiking for the product. The general pattern is that many travel subreddits ban or restrict self-promotion and expect an account with a history; a brand-new account posting its own site is the failure case. Plan: one post, in one data community, built around the coverage visualisation and not around the product; the product subreddits get nothing at launch, and Bas answers questions there only when asked. Owner time estimate: 2 hours across the day after launch. Decision gate: if a subreddit's rules forbid the post, skip it. Do not ask a moderator for an exception on launch week.

Product Hunt. Verified from producthunt.com/launch: a product is submitted from its URL through a guided form; the guide recommends 12:01 am Pacific Time as the start; you "cannot ask people directly to upvote your product", you ask them to visit and comment; makers are encouraged to hunt their own product and stay active in the comments. 12:01 am Pacific is 09:01 in the Netherlands for most of the year, but 08:01 for the few weeks in March and in late October to early November when the US and EU clocks change on different dates, so check the offset for the chosen day. What it needs that the others do not: a gallery of images and a tagline, which means T212 (brand assets) and T209 (landing page) must be finished. Honest assessment: the audience is software enthusiasts, not European budget travellers, and the paywall cannot take money until Stripe is live. So Product Hunt goes last, one week after the main wave, and only if T228 has passed. If it has not, skip it; a launch that cannot convert a visitor is a wasted one-time slot. Owner time estimate: 6 hours.

European travel and outdoor newsletters. This is T208's territory (press and partnerships) and is only fixed here by interface: T207 supplies the explainer and the receipt screenshot, T208 decides which outlets and whether to pursue press before traction. Nothing is scheduled for them in the runbook beyond the explainer being ready by D-7.

## The runbook

D is the owner's launch day, a Tuesday, Wednesday or Thursday, chosen by the owner at T236 when the gates have passed; there is no date in the repository and this report does not invent one. Everything below is a day offset.

D-30. Open the accounts the plan needs (Hacker News, Product Hunt, Reddit, the OSM forum, an OSM account for OSMBC) and use each in the ordinary way for a month: comment, answer, upvote, contribute. A launch from an account created for the launch is the pattern every one of these communities distrusts. Owner: Bas.

D-14. Read each target subreddit's rules and record the outcome in the report that follows this one. Re-read the HN and Product Hunt guides, because they change. Owner: Bas.

D-7. Gates and freeze. T227 to T231 gates passed, T232 (Supabase Pro) done, T235 (uptime and error alerting) live, T216 (support inbox) live, T214 and T215 decided, the explainer and screenshots finished (preparer: a Claude session; approver: Bas). From here to D+2 no migration and no function deploy, since a bad paste is the likeliest self-inflicted outage (docs/INCIDENT_RUNBOOK.md section 5).

D-1. Dry run. Open the deep link in a clean browser profile on a phone and a laptop and confirm no sign-in prompt, the receipt renders, the Data sources credits are reachable, and the language switch works. Check the site notice can be turned on and off from Admin. Confirm the AI cap message appears honestly when the cap is spent (docs/INCIDENT_RUNBOOK.md section 2). Write the reply bank below into one local file.

D, hour by hour (Dutch time; adjust if the owner picks a different start).

09:00 Check status pages (status.supabase.com, www.cloudflarestatus.com, status.stripe.com) and the Admin Overview health line. 09:30 Submit Show HN; post the explainer as the first comment within two minutes. From submission until the post leaves the front page or goes quiet, Bas watches only that thread and the Admin Overview; no other post goes up in this window. 11:30 or when the HN thread has settled, post to the OSM forum, General talk, with the explainer and the credit wording. Afternoon: answer. Evening: read the numbers, write two lines in the log of what was asked that Carta could not answer.

D+1. The Reddit data post, if the rules allowed it. Bas watches that thread and nothing else. D+3. Submit the weeklyOSM item through OSMBC. D+7. Product Hunt at 12:01 am Pacific (usually 09:01 Dutch), only if payments are live; Bas watches it for the day.

What gets answered, and how. Every question in the first six hours, including hostile ones. Never ask anyone to upvote or comment; never reply to a thread from a second account. The reply bank, drawn from facts already in the repository: Carta does not price flights (T272), the old fares are estimates labelled as such and are going away (T272-a); AI features run on Gemini, with a daily cap and an honest message when it is spent (docs/INCIDENT_RUNBOOK.md); the free tier needs no account for the map and destination pages; where the data comes from is the Data sources block and docs/tos/data_licenses.md; where a region is thin the page says so (coverage.json); the pass price is from continent-app/src/lib/pricing.js and nothing else. When a critic is right, say so and open a task; an item that cannot be answered goes in the log, not into an invented answer.

Who watches what. Bas watches every thread. This is not a staffing plan but a sequencing rule: one live thread at a time, which is why the posts are spread across D, D+1, D+3 and D+7. Claude sessions prepare the explainer and the reply bank and, after the day, summarise the threads for the log; they do not post or reply.

## If the site falls over

The runbook for this lives in docs/INCIDENT_RUNBOOK.md; this section only fixes the launch-specific choices. Static pages and the map come from static files, so a traffic spike on those is a hosting matter, and Supabase is the likelier weak point: sign-in, saved trips, the bot and checkout depend on it, which is why T232 is a gate. First move for any user-visible failure: switch on the site notice with one plain sentence. Use maintenance mode only if wrong prices or places are visibly showing. For a bad data push, restore the previous good build as in INCIDENT_RUNBOOK section 1. For a hosting problem, the rollback is the one in section 4: until the week after the Pages move, repoint to Vercel; after that there is no second host and the honest answer is to wait and say so. If a thread is live while the site is down, Bas posts one comment in that thread saying what is broken and when he will next update it, and does not delete the post. Do not post to a new channel while the site is degraded.

A launch should be abandoned, not postponed halfway, if on D-1 any of these hold: checkout cannot take a test payment without T228 passing, T235 alerts do not fire, or the deep link needs a sign-in. These are the owner's call.

## Files touched

Created: Execution/P12/T207-launch-channels.md. Modified: Execution/_OPEN.md (register rows appended).

## Commands run

```
python Execution/_queue/xmind_prompt.py T207
python Execution/_queue/xmind_prompt.py T208
python -c "from src.ingestion.core import registry as r; ..."   # SOURCES: 150 rows, 147 not retired
grep -c "source: '" continent-app/src/data/attribution.js        # 43
grep -c "<url>" continent-app/public/sitemap.xml                 # 1
```

Reads and web fetches were made from the main checkout and the web; the sparse worktree holds neither continent-app nor src. Fetched 2026-10-02: news.ycombinator.com/showhn.html, news.ycombinator.com/newsguidelines.html, producthunt.com/launch, community.openstreetmap.org, plus a web search for the weeklyOSM submission route. Reddit's pages were blocked in this environment.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Written launch plans in the repository | 0 | 1 (this report) | +1 |
| Credited sources, mind map claim | "forty" | 43 attribution entries measured | +3 |
| Credited sources, 1.CARTA.md claim | 24 | 43 measured | stale by 19 |
| Ledger source rows not retired | not stated | 147 of 150 | measured only |
| URLs in continent-app/public/sitemap.xml | 1 | 1 | 0 (unchanged, read-only) |
| Cash cost of the plan per visitor | not stated | €0, against the €0.17 ceiling | by construction; yield unmeasured |

The sitemap row matters for T222: it holds one URL today, so the search channel the whole constraint depends on is not live at launch unless T221 and T222 land first.

## What broke and how it was fixed

Reddit's rules pages could not be fetched, so the Reddit section is explicitly unverified and the check is moved to D-14. Nothing else failed.

## What is still open

The launch date and the go decision are the owner's (T207-a). The accounts need a month of history before launch, which makes D-30 the real critical path (T207-b). The explainer needs a home that is not behind sign-in, decided with T226, and the Data sources block needs to be reachable without an account (T207-c). T220's calendar must adopt the day offsets here (T207-d). The Reddit rules are unread (T207-e). No traffic ceiling for Supabase or the hosting has been measured, so the plan's rollback is written without a load figure; T235 and T231 are where one would come from (T207-f). The sitemap holds one URL, T207-g, tied to T222. T204-b stays open because T208 still has to apply the same test.

## Rollback procedure

Delete Execution/P12/T207-launch-channels.md and the seven T207 rows from Execution/_OPEN.md, or git revert the single commit on branch p12-launch-channels. No app, pipeline or data file changed.
