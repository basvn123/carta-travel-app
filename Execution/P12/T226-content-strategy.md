# T226 Content type and platforms

## Task ID

T226 (mind-map M26)

## Date

2026-10-02

## What changed

Carta now has a written decision on what it publishes beyond the catalogue and where. The decision is narrow on purpose. Carta produces one kind of content: pages generated from the catalogue's own records, every figure read from the record at build time and carrying its provenance word, and it publishes them on one platform, its own domain. Three pieces make up that content: the receipt-based editorial T225 already owns, the explainer T207 needs a home for, and a monthly data notes page with a feed. No social media account, no video, no podcast, no content newsletter and no third-party blog host at launch. The two empty nodes in the original mind map, Content Type and Content Platforms, close with that. Nothing in the app changed; the decision waits on the owner (T226-a), and the two pieces that are not yet owned by a task are registered as work (T226-b, T226-c).

## Where the two nodes come from

The master plan's P12.6 branch says it was built from the original map's Search Visibility and Marketing branches. That original is not in the repository. It was found at `C:\Users\Gebruiker\Downloads\Carta-structured.xmind` (and in an earlier flat form as `Carta.xmind` beside it) and read there. Its Marketing branch holds eight nodes and no notes: Content Type, Content Platforms, SEO method, Destination cost pages, Country and trip-length pages, Receipt-based editorial articles, Real destination routes, Sitemap generation. Six of the eight already have a task: the SEO method is T205, the two page families are T224, the editorial is T225, the sitemap is T222, and Real destination routes reads as the URL paths of T223 given its sibling "Create destination URL paths" in the Search Visibility branch. The two that are empty leaves are this task. Nothing else in either map, in the Economics and Decisions sheet or in the three sibling reports names a social platform, a video channel or a newsletter as something Carta wants; the only platforms the plan has ever named are the launch venues of T207 and the communities of T206.

## The test each candidate was put through

The mind map gives the first half of the test and docs/GTM-ACQUISITION-CONSTRAINT.md gives it a number: about EUR 0.17 of allowable spend per visitor (EUR 6.85 contribution per purchase at an assumed 2.5 percent purchase rate, from CARTA_UNIT_ECONOMICS.md section 5), so any platform that needs paid distribution to work is out, and a free channel is tested on the hours it costs and what it produces. The second half is the mind map's own: a candidate is worth considering only if it compounds organically or builds community credibility.

Three facts from the sibling reports bind just as hard and were applied to every candidate. There is one operator (docs/INCIDENT_RUNBOOK.md, "Owner and only responder: Bas"), so T207 already sequences the launch so that one thread is live at a time; any content programme that needs a weekly human post or a watched inbox is a cost in the same hours. The brand voice (PRODUCT.md) prefers the figure to the claim, has no testimonials, and treats data freshness as the only proof; a piece that cannot be generated from a record is a brochure in that voice. And T208's first draft showed what free prose does in this project: it invented audience figures, and every one had to be removed. The safe content is the kind where the number is read, not written.

So each candidate was asked four questions: does it cost cash; can the piece be generated from the records or does it need a person to write it each time; does it keep working after the week it is posted, by being indexed and linked; and does it give one of T206's communities a fact they would repeat.

## The decision on content type

Carta publishes pages derived from its records and nothing hand-written. A piece is built, not typed: its figures come from `continent-app/public/boot.json`, `coverage.json`, the layer files and `src/data/attribution.js` at build time, it carries the provenance word on every number the way `CostSummary.jsx` and `FareProvenance.jsx` already do, it is dated with the data vintage (`generated_at`) and not the build time, and it follows every T205 rule: the title pattern, the page floor, the honest coverage line as content, hreflang only where the text comes through `t()`. The reason for the rule is the one T201 measured: three documents in the repository still say 1,570 destinations when the catalogue holds 3,868. A content page with a typed number rots the same way, and a rotten number on a page written to prove that Carta's numbers are honest is worse than no page.

Three pieces.

The receipt-based editorial (T225). An itemised week for a real destination with the real numbers and their provenance per line, used to interlink destinations, trips and country pages. The mind map's own argument holds: editorial generated from the data is cheap to produce and impossible for a competitor to copy, because they do not have the receipts. T225 already owns the format and the link-depth measurement, so this report only confirms it as the editorial form and adds nothing to it.

The explainer, "Where the numbers come from". T207 decided the launch artefact is the live app at a deep link plus one write-up that is the first Show HN comment and the OSM forum post's link, and left its home to this task (T207-c). The home is Carta's own domain, as one prerendered page at a path T223 reserves outside the country namespaces (`/about/numbers` is the proposal; T223 ratifies). Its content is already written elsewhere and is assembled, not authored: the sentence and paragraph from T201, the chain (harvested, then cached, then estimated, never blank) from 1.CARTA.md, the five provenance sentences, the per-layer counts and status split read from `coverage.json` (2,077 regions, five layers, each with r, l, quota, floor and status), the credit list read from `attribution.js` (43 entries today, counted by T207), and the two things Carta does not do: price flights (T272) and take bookings. It needs no sign-in, which T207 requires and which the Account panel's FAQ and Data sources block cannot promise today. It does not wait for T221: one static HTML file in `dist` is far inside the 20,000-file ceiling T024 measured, `vercel.json` already serves clean URLs, and `public/_headers` deliberately carries no SPA rewrite, so a page at its own path is served as a file on either host. The implementing task checks that on Pages before launch. It must exist by D-7 in T207's runbook, because the explainer is frozen with everything else at that point.

Data notes, monthly, with a feed. One page a month saying what changed in the catalogue, built from the difference between two builds of `coverage.json` (rows added per layer and country, regions whose status moved between ok, thin and empty), from the pipeline's freshness report (`data/derived/freshness_report.json`), from T222's page-floor count (rows above and below the floor per type), and from T239's indexed share once it exists. The page carries the honest coverage sentence per country that spec 4.6 wants and CARTA_UNIT_ECONOMICS.md section 5 calls the sentence that ranks: "we publish 12 walks in Albania and know of 31 more". It is also the home for the thing T206 found the OpenStreetMap community would actually repeat, the gap list: the relations that fail the continuity gate, published per country as a mapping to-do list. A bare count of them is a produced work under docs/tos/data_licenses.md section 12; a list of OSM relation ids is a database extract and ships under ODbL with the credit in the file, which costs nothing because every trail row already carries `license` and `attribution_text`. Beside the page the build writes one Atom feed of the notes, because a feed is what weeklyOSM editors, forum readers and any later microblog account subscribe to, and it is the one syndication mechanism that needs no account and no platform. The notes start after the first full sitemap (T222), because before that nothing changes that a reader can reach, and they are generated in the same build that writes the sitemap, so they cost no owner hours beyond reading them.

What is not content. The FAQ (14 questions in `account.faq1Q` to `faq14Q`), the terms, the privacy policy, the imprint and the Data sources block are product copy and stay where they are; T207-c's other half, that the credits must be reachable without an account, stands and is not closed here. The 253 journeys over ten types are catalogue, not content: they are generated prose under the trips spec's K-series controls (schema first, three passes, sourced numbers, a golden set), and that is the model for anything longer than a sentence that Carta ever generates. Comparison pages, listicles and "best of" pages are not made; the data-driven version of "where can I go for four days on sixty a day" is T224's country and trip-length page, and an opinion page beside it would be the brochure the voice forbids.

## The decision on platforms

One platform: carta-europetravel.com. Every link, every index entry and every mention accrues to the domain T205 is building 31,856 pages on; the prerender and R2 path T221 builds serves the pieces at no extra cost; the figures are read from the same records as the app, so there is no second copy to rot; and there are no platform terms, no second moderation surface and no second inbox for one operator to watch.

Every third-party platform was tested and none passes at launch.

| Platform | Cash | Hours and what they produce | Keeps working after the week | Credibility with T206's communities | Verdict |
|---|---|---|---|---|---|
| Instagram, TikTok, YouTube, Pinterest | None to post | Continuous visual production by a person; Carta owns no photography, and every Commons image it uses carries a per-image credit and licence that has to travel with each post | No: a feed post decays and carries no crawlable link to the page it is about | None; these communities read forums and route files, not feeds | No |
| X, Threads, Bluesky, Mastodon, LinkedIn | None | Minutes per post, but an account is an inbox, and T207's rule is one live thread at a time | No | Marginal: an announcement log the OSM crowd can mention, nothing more | Not at launch; see the revisit rule |
| Medium, Substack, dev.to, a hosted blog | None | Same hours as the own-domain page | Yes, but for the host: the backlink, the reader and the index entry land on the host's domain, with its tracking and its paywall prompts | None | No; the explainer lives on the domain |
| A content newsletter (Substack, Buttondown, Mailchimp) | Free tiers exist | A monthly write-up by a person; marketing email needs consent under Legal.md, a different lawful basis from the account contract | Yes, for subscribers only, and only while someone writes it | None | No; T213 decides email, and the data notes feed is the open substitute |
| Reddit, Hacker News, the OSM forum, weeklyOSM, the walking and cycling forums | None | T206 and T207 own them: reply, disclose, bring the number | Partly: a thread is indexed, but the link is to the page on the domain | High, when the post links a fact and not a pitch | Venues, not platforms: they link to the pieces above |
| GitHub, a public dataset portal | None | Publishing the pipeline or a dataset is not asked for anywhere in the plan, and T207 warns not to promise a data release the licence review has not cleared | Yes | High in the OSM community | No, apart from the ODbL gap list inside the data notes |
| Paid placements of any kind (sponsored newsletter slots, promoted posts, Product Hunt promotion, Reddit ads) | Yes | n/a | n/a | n/a | Out, by the constraint |

The revisit rule. The platform question comes back once at the first T240 monthly review after three data notes pages exist, because by then there is something to say each month and a measured indexed share to say it against. If the owner opens anything then, it is one account, declared under the owner's own name as T206's first rule requires, posting only the data notes links and the explainer, with no cadence target and no paid promotion. The candidate is a Fediverse account, because that is where the OpenStreetMap community T206 maps is most likely to read it; that last claim is general knowledge, not something read for this report, and it is marked as such.

## How the decision is used

The order is the order of the pieces. The explainer first, built before D-7 and ratified on its path by T223, because T207's launch day cannot run without it. The T225 receipts next, once T221 and T223 give them paths and links. The data notes and the feed after T222's first sitemap, in the same build. The platform question once, at the T240 review after three notes.

Every piece goes through T205's page floor like any catalogue row: a title from the pattern, a date from the data, at least three measured facts, and the honest coverage line. A generated piece whose figures cannot be read from a record is not published. The only adjectives on any of these pages are the provenance words. The owner's hours are the ones T207 already counts for replies; the pieces themselves cost build time, and that is the whole point of generating them.

PRODUCT.md should carry one sentence saying this once the owner has confirmed it, in the same edit that carries the positioning (T201-d) and the launch audience (T203-c) into the file. This task was not allowed to touch PRODUCT.md and did not.

## Files touched

**Modified:**
- Execution/_OPEN.md (four register rows appended)

**Created:**
- Execution/P12/T226-content-strategy.md

## Commands run

All reads were made in the main checkout or in the user's Downloads folder; the sparse worktree holds neither `continent-app/` nor the data. No code, data or config changed.

```
python Execution/_queue/xmind_prompt.py T226     # and T225, T213, T209
python - <<EOF   # zipfile + json over additional docs/Carta/Carta-Master-Plan.xmind: the P12.6 branch,
                 # every note mentioning a content platform; then the same over
                 # C:/Users/Gebruiker/Downloads/Carta-structured.xmind and Carta.xmind, Marketing and
                 # Search Visibility branches
EOF
sed -n 232,300p "additional docs/Carta/Plan/Finance/CARTA_UNIT_ECONOMICS.md"
grep -c 'twitter:site\|twitter:creator' continent-app/index.html         # 0
grep -c '"account.faq[0-9]*Q"' continent-app/src/i18n/en.js             # 13 double-quoted keys; faq1Q to faq14Q exist
python - <<EOF   # continent-app/public/journeys/index.json: n_trips 253, ten types; coverage.json keys,
                 # version coverage_v1, 2,077 regions, five layers; data/derived/freshness_report.json keys
EOF
cat continent-app/vercel.json; head -40 continent-app/public/_headers    # cleanUrls true; no SPA rewrite
sed -n 643,664p docs/tos/data_licenses.md                                # section 12, produced work or extract
```

## Config and secrets set

None.

## Before/after measurements

Nothing shipped, so the after column is the decision's inventory against the same baseline.

| Metric | Before | After | Delta |
|---|---|---|---|
| Open nodes in the original map's Marketing branch | 2 of 8 (Content Type, Content Platforms) | 0 of 8 | +2 decided |
| Content types with a written decision | 0 | 1 type, 3 pieces (receipt editorial, explainer, data notes with feed); 3 kinds ruled out (hand-written editorial, listicles and comparisons, generated free prose outside the K-series controls) | +1 |
| Content platforms with a written decision | 0 | 1 in (own domain); 7 groups tested and out at launch; 1 revisit rule | +1 |
| Social or content-platform handles referenced by the app (`twitter:site`, `twitter:creator` in index.html) | 0 | 0 | 0 |
| Prose surfaces beyond the catalogue in the app today | FAQ (14 questions), terms, privacy, imprint, Data sources (43 credits) | same; none reclassified as content | 0 |
| Generated prose rows in the catalogue | 253 journeys over 10 types | same | 0 |
| Indexable URLs on the production host | 1 | 1 (the explainer adds 1 before launch; the notes add 1 a month after T222) | 0 |
| Cash cost of the content plan per visitor | not stated | EUR 0, against the EUR 0.17 ceiling | by construction; yield unmeasured |

## What broke and how it was fixed

No code ran, so nothing broke. One source gap was found: the "original mind map" the task names is not in the repository or in `additional docs/Carta`, and the master plan's P12.6 note cites it as "Original Carta.xmind". It was read from the Downloads folder instead and is registered as T226-d so the next session that needs it does not have to look.

## What is still open

The owner confirms the decision: one content type, generated from the records; one platform, the domain; no social, video, podcast or newsletter platform at launch; the platform question revisited once at the first T240 review after three data notes. T226-a.

The explainer page needs building: one prerendered page on the domain at a path T223 reserves outside the country namespaces, assembled from T201's positioning, the five provenance sentences, the per-layer counts in `coverage.json` and the credits in `attribution.js`, with no sign-in, in place by D-7 of T207's runbook and not waiting for T221; the implementing task confirms a single `.html` is served at its clean path on Pages. This decides the platform half of T207-c; the credits-without-account check in that row stands. T226-b, before T207-a.

The data notes page and its Atom feed need building in the sitemap build: the `coverage.json` difference between builds, the freshness report, T222's page-floor counts, T239's indexed share, the per-country honest coverage sentence, and the OSM gap list under ODbL with the credit in the file (counts are produced work, relation ids are an extract, per data_licenses.md section 12). T226-c, after T222.

The original map (`Carta-structured.xmind` and `Carta.xmind`) lives only in the owner's Downloads folder; copy it into `additional docs/Carta` beside the master plan so T225 and any later task that the master plan sends to "your original mind map" can read it. T226-d.

## Rollback procedure

Delete Execution/P12/T226-content-strategy.md and remove the four T226 rows from Execution/_OPEN.md, or `git revert` the single commit on branch p12-content-platforms. No app, pipeline or data file changed.
