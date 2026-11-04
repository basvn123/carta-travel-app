# Launch plan research, November 2026

Nov 4, 2026 (T1047). Four research lanes run to stress-test [ROADMAP.md](../../ROADMAP.md) before it was restructured into phases: SEO for a large data-generated site, marketing playbooks for a bootstrapped travel app, affiliate programmes and partner data, and a cold review of the roadmap's order. Sources were read on 2026-11-04. Figures marked (3p) come from third-party write-ups only and are unverified. Programme terms change; re-check before acting.

## 1. What changed in the plan because of this research

| Finding | Change in the roadmap |
|---|---|
| Google uses site-wide quality signals; thin generated pages can pull down the good ones | A page quality gate: pages below the bar ship `noindex,follow` and stay out of the sitemap (K2) |
| A new domain takes 6 to 12 months to earn organic traffic | SEO plumbing and the first indexable pages go live in November, not May (Phase 1) |
| Language parameters are "not recommended"; translated boilerplate risks duplicates | Language subfolders with hreflang, indexed only where text is really translated (I12) |
| The roadmap delivered visible quality in March and marketing in April | Five phases with gates; the marketing surface is clean by mid-January (section 4) |
| Most Europeans plan summer from January to March | Sunshine Saturday story on 2 January; open beta in March (K5, K9) |
| Licensing could remove the price engine's inputs; Google Flights has no licensed API | A plan B by mid-December; Aviasales Data API for "from" fares (D14, I3) |
| Affiliates add about 5 to 10% on top of the Pass, and some need a live site | Apply order timed to the phases; links only, no tracking scripts, so no cookie banner (I4, I15) |
| One person is the bottleneck, not session count | A must-for-launch list; Carta Intelligence beyond F1 and F6 offered as after-launch |

## 2. SEO for a large data-generated site

**Policy.**
- **Scaled content abuse:** Google's spam policy covers "many pages generated for the primary purpose of manipulating search rankings", however they are made. https://developers.google.com/search/docs/essentials/spam-policies ; https://developers.google.com/search/blog/2024/03/core-update-spam-policies
- **Site-wide signals:** the helpful content system is now part of core ranking, and "site-wide signals and classifiers are also used". https://developers.google.com/search/help/helpful-content-faq
- **Removing weak pages:** Google said in 2022 that removing unhelpful content could help the rest of a site. https://developers.google.com/search/blog/2022/08/helpful-content-update
- **noindex first:** John Mueller suggested noindexing weaker pages "until you see that they're doing really well". https://www.searchenginejournal.com/google-explains-content-pruning/371252/
- **Crawl budget:** Google's crawl-budget guide is aimed at 1M+ pages, or 10k+ pages that change daily. At about 32k mostly static pages, Carta's limit is quality, not crawl budget. https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget

**Timelines.**
- **Ranking:** only 1.74% of new pages reach the top 10 within a year (Ahrefs 2025). https://ahrefs.com/pt/blog/how-long-does-it-take-to-rank-in-google-and-how-old-are-top-ranking-pages/
- **Indexing:** "Discovered, currently not indexed" can last indefinitely. https://www.searchenginejournal.com/google-says-discovered-currently-not-indexed-status-can-last-forever/439104/

**Languages.**
- **URL structure:** subfolders are recommended; language parameters are not. https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
- **hreflang:** links must be reciprocal and self-referencing, with an x-default. https://developers.google.com/search/docs/specialty/international/localized-versions

**Cases.**
- **AllTrails:** about 68% of visits are estimated to come from organic search, driven by hyperlocal "best trails in X" hub pages with reviews and photos (3p). https://growthloopteardown.substack.com/p/how-alltrails-acquired-55-million
- **Nomad List:** most of its organic traffic comes from filtered combination pages (3p). https://upgrowth.in/how-nomadlist-programmatic-seo-delivers-43-2k-monthly-organic-traffic/

**Page quality gate (proposal):**
- **Place:** licensed photo, an intro of at least 120 words unique to the place, bed and food price, 12 months of climate and crowds, a rating, and at least 5 internal links. About 1,800 places pass today.
- **Trail:** photo, summary of at least 60 words, length, climb and difficulty, map, linked place, season. About 450 pass today.
- **Beach, lake, peak:** photo, at least 60 words, monthly data, a parent place. Otherwise listed only in hub pages.
- **Trip:** distinct and priced. Near-duplicates get a canonical to the representative trip.
- **Hubs** (country, region, "best X in Y"): always indexed.

## 3. Marketing playbooks

**How comparable apps grew without ads.**
- **Polarsteps:** about 20,000 users a year after launch, from word of mouth through travellers' followers. https://www.iamsterdam.com/en/business/startupamsterdam/features/founders-fridays/koen-droste
- **Scott's Cheap Flights:** grew from a list for friends, through Reddit and press, on under 500 USD. https://www.cnbc.com/2016/11/29/how-a-29-year-old-turned-an-obsession-with-cheap-plane-tickets-into-a-1-million-business-in-under-2-years.html
- **Hopper:** a data research blog; AP picked up its fare data and the story was syndicated to 50+ outlets. https://www.phocuswire.com/Hopper-opens-to-all-also-fires-up-data-research-service
- **Komoot:** free partnerships with tourism boards. https://medium.com/komoot/100-women-campaign-by-switzerland-tourism-komoot-bc44dcd946e6
- **Atlas Obscura:** the founders seeded the first hundred places by hand. https://skift.com/2014/10/22/atlas-obscura-wants-to-become-the-national-geographic-of-the-digital-age

**Data PR.**
- **Post Office Holiday Costs Barometer:** a fixed basket of items, priced the same way every year, with a "cheapest resort" headline and local angles. https://travelweekly.co.uk/news/algarve-ranks-as-cheapest-destination-in-holiday-money-barometer
- **Price of Travel Backpacker Index:** the same pattern for a daily backpacker budget. https://www.priceoftravel.com/cheapest-places-visit
- **Sunshine Saturday:** the first Saturday of January is the UK's peak booking day; in 2027 that is 2 January. https://www.travelmole.com/news/sunshine-saturday-to-fuel-5-increase-in-january-holiday-bookings

**Communities.**
- **Show HN:** the product must be usable now, with no signup wall. https://news.ycombinator.com/showhn.html
- **Reddit:** subreddit rules are stricter than the site-wide 90/10 norm. https://redship.io/blog/reddit-self-promotion-rules
- **Product Hunt:** only about 10% of launches are featured now (3p). https://www.flowjam.com/blog/how-to-get-featured-on-product-hunt-2025-guide

**Waitlist.**
- **Referral mechanic:** queue position plus a jump per referral (Robinhood, 3p). https://thegrowthplaybook.substack.com/p/how-robinhood-turned-a-landing-page

**Campaign backlog (from this lane, rated effort / cost / effect).** Each needs its landing page to pass the marketing surface gate first.

| # | Idea | Effort | Effect | App quality it needs |
|---|---|---|---|---|
| 1 | Europe Cost Index 2027, yearly, local angle per country | M | High | Methodology page, stable numbers |
| 2 | "Europe on 100 EUR a day" interactive map | M | High | Fast map on phones |
| 3 | "Cheapest week" calendar per place | M | Med-High | Fresh fares, honest gaps |
| 4 | Sunshine Saturday release, 2 Jan 2027 | S | High (BE, NL, UK) | Good place pages |
| 5 | Shareable trip receipt image | M | High (viral loop) | Polished plan flow |
| 6 | Embeddable cost widget for bloggers | M | Med | Stable API, credit link |
| 7 | Open dataset (CC-BY subset) plus Show HN | S | Med | Clean schema, licences checked |
| 8 | "Quiet clean beaches" June ranking (bathing water plus crowds) | S | Med-High | Beach pages with sea temperature |
| 9 | Monthly "hidden trail" list | S | Med | Trail pages past the gate |
| 10 | Newsletter "this month's best-value places" | S per issue | Compounding | Consistent data |
| 11 | Quiz "which place fits your budget" | M | Med | Every result page good |
| 12 | Shorts: "what 50 EUR buys in X vs Y" | S each | Variable | Numbers match the app |
| 13 | Build in public (pipeline, data, AI) | S | Med users, high for career | Nothing extra |
| 14 | Belgian angle: "cheapest weekends from Brussels and Charleroi" | S | Med (Flemish press) | BRU and CRL fares |
| 15 | "Summer price shock" June report | S | Med | Month data |
| 16 | "Cost of a day in X in May" pages | M | Slow, large | Indexable fast pages |
| 17 | Tourism board data swaps | M | Low-Med | Press kit |
| 18 | "Five apps vs Carta" side-by-side video | S | Med | Polished end-to-end flow |

## 4. Affiliate programmes and partner data

| Programme | Network | Commission | Cookie | Notes |
|---|---|---|---|---|
| Booking.com | CJ | 25 to 40% of Booking's commission, tiered (3p) | conflicting (3p) | Needs a live site with travel content |
| Hostelworld | Partnerize | % of deposit, rate not published | 30 d | https://partners.hostelworld.com/faqs |
| GetYourGuide | Direct | 8% (3p) | 30 d (3p) | Partner API through a partner manager |
| Viator | Direct | up to 8% (3p) | 30 d | Basic tier instant; free content API https://partnerresources.viator.com/travel-commerce/affiliate/ |
| Tiqets | Direct, Travelpayouts, Awin | share of margin | ? | No traffic minimum; self-service API https://www.tiqets.com/en/partner-program/affiliate |
| Omio | Impact (wired), Travelpayouts | about 6% | 30 d | https://www.omio.co.uk/affiliate |
| Kiwi.com | Travelpayouts | 3% | 30 d | Instant |
| DiscoverCars | Direct, Travelpayouts | 70% of its profit | 365 d | No paid ads allowed https://www.discovercars.com/affiliate-conditions |
| Airalo | Direct, Travelpayouts | 10% | 30 d | |
| SafetyWing | Direct | about 10% of premium | 364 d | |
| Travelpayouts | Aggregator | per brand | per brand | Instant signup, 50 USD payout https://support.travelpayouts.com/hc/en-us/articles/360012173160 |

**Data, and whether it can replace scraping.**
- **Booking.com Demand API:** Managed Affiliate Partners only, after a contract. Not reachable at launch. https://developers.booking.com/demand/docs/getting-started/prerequisites
- **Google Flights:** no API since QPX Express closed in 2018, so scraping it has no licensed path. https://duffel.com/blog/google-flights-api
- **Aviasales Data API (Travelpayouts):** cached prices from user searches, meant for static pages. This is the realistic licensed source for "from" fares; coverage on thin routes is unknown. https://support.travelpayouts.com/hc/en-us/articles/203956163
- **Travelpayouts hotel data:** Hotellook closed on 20 Oct 2025, so there is no hotel data through Travelpayouts. https://support.travelpayouts.com/hc/en-us/articles/29534131568530
- **Activities:** Viator, Tiqets and GetYourGuide APIs are clean sources for activity prices.

**Rules.**
- **EU (UCPD):** the Commission's 2021 guidance says undisclosed commercial intent is a misleading omission, so disclosure must come before the user engages. https://marketinglaw.osborneclarke.com/advertising-regulation/european-commission-publishes-updated-guidance-unfair-commercial-practices-directive/
- **Google:** mark paid links `rel="sponsored"`. https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links
- **Cookies:** affiliate cookies set on Carta's own site need consent under ePrivacy. Plain decorated links set no cookie on Carta's domain; partner scripts or widgets would. That last point is a reading to confirm with a lawyer. https://www.linklaters.com/knowledge/publications/alerts-newsletters-and-guides/2023/october/27/the-belgian-dpa-issues-a-checklist-for-the-compliant-use-of-cookies

**Revenue model (assumption, not sourced).**
- About 8 to 15 EUR per 1,000 visitors from affiliates, against about 170 EUR per 1,000 from the Pass.
- So affiliates add 5 to 10%: useful, but not the main business.

**Apply order.**
1. Travelpayouts and Omio now.
2. Viator and GetYourGuide from January to March.
3. Booking.com and Hostelworld on a public preview in March or April.
4. DiscoverCars.
5. SafetyWing or Airalo after launch.

**Proposed wording for PRODUCT.md** (owner decides, T461-d): "Carta never sells you a ticket or a bed and never ranks by what it earns. Some links pay Carta a small fee at no cost to you."

## 5. The roadmap review

**Verdict.** The roadmap was "ordered like an engineering programme, not a product launch". Visible quality arrived in March and April, and marketing only in W14 to W17.

**Five order problems.**
- The clean look arrived late.
- Data work aimed at breadth and sat behind machinery.
- Marketing was missing until the end.
- Early sessions went to work with no launch value.
- The business chain was blocked or late, with I3 deciding after the re-scrape work.

**Proposals.**
- Five phases, each with a measurable gate.
- A marketing surface gate.
- A must-for-launch list of about 125 to 180 sessions.
- A journey review that found one missing item: nobody designs where the paywall meets the journey.

**Where the roadmap departs from the review.** The review suggested deferring most documentation, security and Carta Intelligence work. The owner named documentation, security and UI as key, so the restructured roadmap keeps them before launch, applied to the marketing surface first. Only Carta Intelligence beyond F1 and F6 is offered as after-launch (decision F-b).

**Sources the review used** (vendor blogs, weak evidence):
- https://echai.ventures/startingup/launching
- https://hub.causo.ai/guides/pre-launch-waitlist-zero-to-1000-emails-2026
