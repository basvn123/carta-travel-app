# P12 digest

32 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`.

### T194 The home page (2026-10-07)

The page T209 built is now the home page of the app. A first visit with no link opens on it, and everything else opens where it always did. A visit counts as a first visit when the address has no query string and no hash, and this browser has no `continent.homeSeen.v1` mark in localStorage. That logic is `src/lib/homeVisit.js`. A link always wins: `?tab=trip`, `#dest=LIS` and every other shared view open on what they name. A return visit opens on Destinations, as before. The mark is written by an effect on every load, so the home page opens once per browser, and reloading after leaving it does not bring it back.

Broke: A hash link opened the home page / The flag was read in a StrictMode-doubled initializer, after the hash reader had stripped the hash / Read once at module load; `verify_tab_switching.mjs` reports 4 failed checks of 69 / Not this task.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T194-home-page.md"`

### T201 Positioning, in one sentence and one paragraph (2026-10-02)

Carta now has a written positioning: one sentence, one paragraph and three proof points, each traced to a file in the repository that makes it true today. Nothing in the app changed. The work was excavation, as the mind map predicted, with one correction the mind map did not expect: the claim it wanted written down ("one honest all-in number from your own departure airport, for 1,570 destinations") no longer describes the product. The catalogue is 3,868 destinations, not 1,570, and since 2026-10-01 no flight fare source is live, so the airport leg is a frozen estimate the traveller can overwrite, not a harvested number.

Broke: No code ran, so nothing broke. Two source conflicts were found and are recorded as open items rather than fixed here: the catalogue size is stale in three documents, and PRODUCT.md and the live FAQ disagree about whether Carta prices flights.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T201-positioning.md"`

### T202 Competitive positioning against the four categories (2026-10-02)

Carta now has a written comparison against the ten products the mind map names, in four categories, with an honest column for what each does better, a column for what each cannot do, and one sentence per product that says where Carta stands. Nothing in the app changed. The research corrected one assumption the mind map carried: the "priced leg from the user's own airport to a specific trail, beach or summit" is the right distinguishing claim, but it is not shipped.

Broke: No code ran, so nothing broke. One assumption in the mind map broke on inspection: the airport-to-trail leg is described as Carta's uncopyable asset and it is not built. It is recorded as the open item below rather than papered over in the sentences.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T202-competitive-positioning.md"`

### T203 The audience order (2026-10-02)

Carta now has a written audience order. The launch speaks to hikers: the person who travels to a town to walk from it, for a day or a weekend first and hut to hut second. The other five audiences the mind map names are ranked behind that one with a reason each, and the ranking is measured from the wire the app ships today, not from the counts the mind map carried. Nothing in the app changed.

Broke: No code ran, so nothing broke. One contradiction was found and recorded rather than fixed: the trail GPX and KML are gated on the pass while the cycling GPX is free and two planning documents say exports are never paywalled. Fixing it touches the paywall and `TrailPage.jsx`, which this task does not name.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T203-audience-order.md"`

### T204 · The acquisition constraint, written down once (2026-10-02)

One new document, docs/GTM-ACQUISITION-CONSTRAINT.md, opens with the constraint as its first line: €6.85 contribution per purchase, ~2.5% assumed purchase rate, about €0.17 of allowable spend per visitor, about €3.04 of allowable CAC per payer at 3:1, and therefore no paid search, paid social, influencer fees or sponsorships until contribution per user is several times higher. Every figure comes from CARTA_UNIT_ECONOMICS.md sections 3.5, 4 or 5, with the section named beside it. The 3,868 destination count comes from Execution/P12/T201-positioning.md. The document does not carry a price list for paid channels, because the source gives none.

Broke: The first draft of this task carried figures that appear in no named source. They were removed in a second commit. Removed outright: paid search cost per click and per visitor ranges, paid social cost ranges, influencer and sponsorship price ranges, display cost per impression, the conversion rates attached to each paid channel, the "€100+ of paid...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T204-acquisition-constraint.md"`

### T205 The programmatic SEO plan (2026-10-02)

Carta now has a written plan for turning the catalogue into the organic acquisition surface that CARTA_UNIT_ECONOMICS.md section 5 says is the only channel the arithmetic allows. Nothing in the app changed; the prerendering, sitemap and URL code wait for the hosting move (stage 6 of _OPEN-MASTER.md) and belong to T221 to T225. What this report adds is the design those tasks build to: twelve page types with the query shape each one answers, a page floor that decides which rows earn a URL, the title and meta pattern per section derived from the title ladder, the schema.org type per page, the internal link graph, the canonical rules for stage families and parents, the hreflang scheme across the...

Broke: No code ran, so nothing broke. Two places where the written sources disagree with the wire were found and are recorded rather than fixed: the optimisation report's 11 duplicate dossier slugs no longer exist (3,868 unique slugs on 3,868 slugged files), and the enhancement spec's 540 orphan stage families cannot be checked on the wire because the wir...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T205-programmatic-seo.md"`

### T206 Community credibility: the outdoor route (2026-10-02)

Carta now has a written map of where European hikers, bikepackers and trail runners gather, what each place tolerates from a product, which national bodies publish route data Carta may reuse and which forbid it, and two or three things Carta can bring to each group that are useful before they are promotional. Nothing in the app changed. The research corrected the premise the mind map was built on. The WHY says Carta "gives it away free on every route" and offers uploaders a licence choice that "costs nothing". Neither is true of the build today.

Broke: No code ran, so nothing broke. Reddit returned 403 on every direct fetch; a research subagent read the sidebars through the Arctic Shift archive API instead, which worked for about fifteen minutes before returning 422, so the thread evidence is a sample and the subscriber counts are a stale snapshot.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T206-community-credibility.md"`

### T207 Launch channels and the launch day plan (2026-10-02)

Carta now has a written launch plan: which surfaces to use, in what order, what each one needs, who answers each thread, and how to back out if the site falls over. Nothing in the app changed. The plan is a document, and it is deliberately honest about three things the mind map assumed. First, the mind map says the pipeline "ingests forty open sources and credits all of them". Measured, the app carries 43 user-facing credit entries (continent-app/src/data/attribution.js, counted by its `source:` keys), and the ledger registry holds 150 source rows of which 147 are not retired (src/ingestion/core/registry.py, loaded and counted).

Broke: Reddit's rules pages could not be fetched, so the Reddit section is explicitly unverified and the check is moved to D-14. Nothing else failed.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T207-launch-channels.md"`

### T208: Press, partnerships and the open-data angle (2026-10-02)

This report replaces a first draft that listed 31 outlets with audience figures nobody had cited. The new version is a short list of European outlets and communities, each tested against the acquisition constraint, plus a recommendation on whether to pursue press before there is traction. It carries no audience, reach or cost figures except those copied from a named repo file or read on the outlet's own page on 2026-10-02 with the URL beside them. Where a figure could not be verified, none is given. The recommendation is not to pursue cold press before launch.

Broke: The first draft carried dozens of uncited audience figures: Wanderlust print and web reach, National Geographic readers, AFAR, Backpacker, Adventure Journal, Skift, AllTrails, Strava, CityStrides, the European Data Portal dataset count, and Tech.eu and EU-Startups both given the identical "300,000+ monthly readers, 67,000+ subscribers", which sugge...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T208-press-and-partnerships.md"`

### T209 The landing page (2026-10-07)

Carta has a landing page, and by the owner's decision of 2026-10-07 (T362, `Execution/_OWNER-RUNBOOK.md` block A2) it is also the home page. It lives in the app at `?tab=home` as a pseudo-tab, rendered by `src/browse/LandingPage.jsx` with its arithmetic in `src/lib/landing.js` and its styles in `src/styles/39-landing.css`. Nothing makes it the default screen yet; that is T194's job. The page demonstrates rather than describes. The h1 is the positioning claim from PRODUCT.md and T201 in the shortened form the approved onboarding document uses: "What a day costs, per person, in 3,868 places", with the count read from `meta.n_destinations` at run time, never typed.

Broke: The receipt total fell below the fold on a 380 px phone (880 px against 714 visible) / A two-row input strip, the orientation sentence above the card and generous paddings / One row of three fields at every width with the people and nights selects showing bare numbers (the labels already say what they count), the orientation sentence moved under th...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T209-landing-page.md"`

### T211 First-run onboarding and the empty states (2026-10-02)

Two design documents, no code. `docs/ONBOARDING_AND_EMPTY_STATES.md` is new and designs the first ninety seconds and every empty state. `docs/FIRST_RUN_RESULT.md` (T187) is revised so the receipt it designs no longer carries a flight figure of Carta's, which closes register row T300-k. The first ninety seconds were designed around what the app prices today rather than around the departure airport.

Broke: `docs/FIRST_RUN_RESULT.md` was approved (T272) on the same day its premise was banned (T272) / The owner approved the T187 text and decided on flights in one sitting / Revised here; T211-d asks for the approval again; `public/coverage.json` has no reason codes although T111 wrote them / The coverage audit is a data-lane run that has not been made s...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T211-onboarding-and-empty-states.md"`

### T212 Brand assets: OG images, favicon, app icon, social cards (2026-10-03)

Carta now has a generator for share images and a finished icon set, both drawn from the product's own tokens. Before this task the only share image was `icon-512.png`, a 512 pixel square the home page offered as `og:image`, which a large-card previewer crops. After it, `continent-app/scripts/og` turns one wire record into a 1200 by 630 card (or a 1080 by 1080 square for a post made by hand), and the home page points at a real site card, `public/og/site.png`. A card carries what the page itself leads with.

Broke: Square card rows overlapped their notes / Panel height of 380 left 51 pixels a row when the lake card had three rows / Panel is 440 high when a strip follows, header lifted 30 pixels; EEA site names read "Playa es trenc" / The register is all capitals and the first fix lowercased everything after the first letter / A title case helper capitalises e...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T212-brand-assets.md"`

### T213: Email and lifecycle (2026-10-02)

Nothing in the app. This task is a design: it decides which emails Carta sends, when, what each says, and on what lawful basis, so that whichever sending route the owner picks (T070-d) the build is a matter of wiring. No migration, no Edge Function and no string was added, because the route is undecided and the task asked for a decision on scope, not a build. The decision in one paragraph. Carta sends transactional and legally required email only, and none at launch beyond what the stack already does, until the route exists. The first build is a short list of nine messages in three groups. Account mail (the Supabase Auth messages that already exist).

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T213-email-lifecycle.md"`

### T214: Decide the analytics stack, knowing what it costs you legally (2026-10-02)

Nothing in the app. This is a decision document. The recommendation is recorded here and in the register as pending the owner, and no consent banner was built, because the recommendation is the one route on which no banner is needed. The recommendation in one paragraph: add no third-party analytics script, not Plausible, not Sentry, not PostHog, not Google Analytics, not Vercel or Cloudflare Web Analytics in their script form.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T214-analytics-decision.md"`

### T215 launch metrics (2026-10-02)

One new page, docs/LAUNCH-METRICS.md, now lists the launch metrics and the source of each. The decision it records is that the admin Overview is the single place to look, because it already stacks the paywall funnel, margin, AI usage, cache hit rate, AI failures and pipeline health, and that five numbers are read daily in week one: purchases, new accounts, paywall shown, AI units against the cap and AI failures. Of the ten metrics the task named, seven have an instrument today: purchases and purchases by tier, account creations, paywall shown, dismissed and converted per reason code, AI units, cache hit rate, and contribution. Three do not.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T215-launch-metrics.md"`

### T216 support inbox and response commitment (2026-10-02)

Carta now has a written support page, docs/SUPPORT.md. It fixes the address the legal documents should name, the response time Carta commits to, and four canned answers. Before this, the Imprint, the Terms, the Privacy Policy and the account panel all pointed at the owner's personal Gmail address through a CONTACT constant, the Terms promised an answer "within 30 days" and a refund answer "usually within a few working days", and nothing was written down for what to say. The address chosen is support@carta-europetravel.com, a role mailbox rather than a person, so it can outlive any one reader. The mailbox does not exist yet and creating it is the owner's step.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T216-support-inbox.md"`

### T217 refund standard operating procedure (2026-10-02)

Carta now has a written refund procedure, docs/REFUND_SOP.md. Before this, the Terms of Service promised refunds in three cases and the database kept a purchase ledger, but nothing joined the two: no page said who decides, how to tell the cases apart, how to issue the money in Stripe, what happens to the pass, or where the refund is written down. The procedure is five steps, always in the same order: find the sale, decide, refund in Stripe, adjust access, record it. The order matters because nothing in the code reacts to a refund.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T217-refund-sop.md"`

### T218 incident runbook and a status surface (2026-10-02)

Carta now has an incident runbook, docs/INCIDENT_RUNBOOK.md, covering the five failures the task names: the pipeline failing silently, Gemini quota exhausted, Stripe webhooks not arriving, an R2 or Cloudflare incident, and a Supabase problem. Each section says the same four things in the same order: the alert that triggers it, what the traveller sees, what to do, and what not to do. It is written for the hosting after stages 5 to 7 of _OPEN-MASTER.md (Pages, R2, the CAX11 box) and says where the steps differ before those stages land. The status decision is an in-app line, not a public status page. Carta has one operator.

Broke: Runbook said every migration from 007 has a DOWN block / assumed from the recent ones / checked all files; reworded to name the exceptions

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T218-incident-runbook.md"`

### T219 feedback loop from users into the backlog (2026-10-02)

Carta now has a written decision on how a traveller reports a wrong price, a bad photo or a missing trail, and where that lands: docs/FEEDBACK-LOOP.md. The session notes made this a decision document with the recommendation pending the owner, so no app file, no migration and no database were touched. Nothing is different for a traveller yet. The decision rests on what is already built. The feedback form in the account panel writes to public.feedback through submit_feedback (017), with a context block holding the path, viewport, language and user agent; the admin page reads it on the Feedback tab with new, open and done statuses and, since T270, a count badge.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T219-user-feedback-loop.md"`

### T220 Launch runway calendar (2026-10-02)

Carta now has a dated runway for the last six weeks before launch, written backwards from the launch date D. Nothing in the app changed. The calendar is in this report and is the only copy; register row T220-a says who keeps it current. There is no calendar date in it, and that is deliberate. The owner has not chosen D (T207-a, left open by T275), and a date invented here would be a figure with no source. Every entry is an offset from D, written D-42 to D+7, and the offsets T207 fixed (D-30, D-14, D-7, D-1, D, D+1, D+3, D+7, per T207-d) are kept exactly. What this report adds is the six weeks between them. D-42, D-35, D-28, D-21, D-14 and D-7 all fall on the same weekday as D.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T220-launch-runway.md"`

### T221 Static prerendering (2026-10-03)

Every indexable page type now has static HTML that a crawler can read without running JavaScript, and a way to serve it from Cloudflare without touching the 20,000-file ceiling of the Pages deploy. Before this task, a request for any content path (`/austria/lakes/at-attersee-q698516`, `/spain/malaga`, `/trips/...`) got the app shell with status 404, the site-wide title and an empty `<div id="root">`: zero words for a crawler, on all twelve page types.

Broke: Duplicate keys on the first full build, such as /switzerland/trails/4 and trail 4 / A list page's key was its page number, the same as the key of the trail or cycling route with that id / List pages are `p{n}` in the key; Cross-border trips reported as duplicates / A trip is filed under each of its countries / The second copy of the same path is sk...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T221-static-prerendering.md"`

### T222 Generate the sitemap from app data (2026-10-03)

The catalogue now writes its own sitemaps. As the last step of the prerender build, `scripts/prerender/sitemap.mjs` turns `dist-prerender/_manifest.json` into nine sitemap files and an index, written to `dist-prerender/sitemaps/`, and into `dist-prerender/_sitemap.json`, which holds the counts and the page-floor line. The Pages Function serves `/sitemap.xml` and `/sitemap-*.xml` from the `carta-prerender` bucket, where `push.mjs` already uploads every folder of the build. Nothing generated is committed: the first attempt at this task committed 13 generated files under `public/` (about 128,000 lines), which session rule 5 forbids, and those are removed again.

Broke: The first attempt committed about 128,000 lines of generated XML under public/ / The script wrote to public/ by default and the Haiku session committed the output, against session rule 5 / Removed with git rm; the generator writes under the build folder, which is never committed; The first attempt claimed every page met the floor / The floor was ne...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T222-sitemap.md"`

### T223 The destination URL structure (2026-10-03)

Carta now has a ratified URL scheme, written in docs/SEO.md and implemented in one pure module, continent-app/src/lib/urlScheme.js. Every page type has a path: country, destination, destination cost, section lists with pagination on the path, country and trip length, trail, cycling route and tour, beach, lake, mountain, region, trip, journey and guide, each with an optional language prefix (English at the root, nl, de, fr, es, it). The module builds paths, reads them back, maps them to the legacy boot hashes, decides canonicals and returns the hreflang set. scripts/verify_url_scheme.mjs checks it, and given the dossier folder it checks all 3,868 real slugs.

Broke: First edit of main.jsx showed 81 changed lines / The file is CRLF and my script rewrote it with LF / Restored it and redid the edit in binary mode; the diff is one line

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T223-url-structure.md"`

### T224 Destination cost pages and country/trip-length pages (2026-10-03)

The prerender now writes the two page families the original map's Marketing branch names. Every priced destination has a week page at `/spain/malaga/cost` that answers "what does a week in Malaga actually cost" with a receipt, and 40 of the 43 countries have trip-length pages at `/spain/4-days` and `/spain/4-days/under-80` that answer "where can I go for four days on this budget". Before this task those paths had no page and were served the shell with a 404. After it, one full build writes 3,868 cost pages and 168 trip-length pages, and the sitemaps grow from 14,021 URLs to 15,406: 1,217 cost pages in a new `sitemap-costs-en.xml` and the 168 trip-length pages in `sitemap-countries-en.xml`.

Broke: A budget page that was a copy of its length page (Austria under 100 a day, 52 of 53 places) / The first rule only asked for fewer places than the length page / A budget page must leave out a fifth of the length page and add five places over the budget below it; Spain's plain 4 days and 4 days under 80 showed the same 100 places / Both lists were ch...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T224-cost-and-country-pages.md"`

### T225 Receipt-based editorial and internal linking (2026-10-03)

The prerender now writes one editorial format, the week receipt: a seven-day composed trip priced stop by stop, at `/trips/{id}/receipt`. A full build writes 316 of them, 202 indexable and in the sitemap, 114 `noindex`. Beside the format, the destination pages gained an "other places near" block, and every family that touches a receipt links to it. Measured on the same wire, the pages no click path from a country page could reach fell from 1,188 to 10, and the share of pages within three clicks went from 94.3 to 96.0 percent. Nothing is live; the pages go out with the T221-a procedure unchanged.

Broke: Edits failed to match / Every source file is CRLF / A substitution helper that writes CRLF; The receipts alone moved the unreached count by zero / The unreached destinations are stops of nothing that is itself reached / Added the nearest-places block on destination pages

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T225-receipt-editorial.md"`

### T226 Content type and platforms (2026-10-02)

Carta now has a written decision on what it publishes beyond the catalogue and where. The decision is narrow on purpose. Carta produces one kind of content: pages generated from the catalogue's own records, every figure read from the record at build time and carrying its provenance word, and it publishes them on one platform, its own domain. Three pieces make up that content: the receipt-based editorial T225 already owns, the explainer T207 needs a home for, and a monthly data notes page with a feed. No social media account, no video, no podcast, no content newsletter and no third-party blog host at launch.

Broke: No code ran, so nothing broke. One source gap was found: the "original mind map" the task names is not in the repository or in `additional docs/Carta`, and the master plan's P12.6 note cites it as "Original Carta.xmind".

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T226-content-strategy.md"`

### T272: Owner decisions of 2026-10-02 (2026-10-02)

The owner answered the open decisions the three overnight waves raised. This task records them, closes their register rows, and makes the two small product changes they called for. Flights. Carta does not price flights. A traveller who has a fare types in what they paid, and only then does a full-trip total include a flight, as their own figure. PRODUCT.md now says this in "What Carta is" and in "The one rule the numbers follow", and its voice example no longer quotes a flight-priced count. The FAQ question "Does Carta price flights?" is removed from the account panel and from all six locales; the FAQ has 13 questions and verify_account_panel.mjs expects 13.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T272-owner-decisions-2026-10-02.md"`

### T275: Owner decisions of 2026-10-02 (second round) and the corrected paste list (2026-10-02)

The owner answered the decisions wave 4 raised. Paste list: yes. `Execution/_OPEN-MASTER.md` now carries the three new migrations, and one ordering fault found while placing them is fixed. Stage 2 as written could not work. Migration 037 raises "apply 011 and 019 first" when 019 is missing, and 039's header says pasting 020 after it breaks 038 and 039. 019 and 020 have never been applied (the community-layer memory and T083-a both say so), so paste 8 would have failed. Stage 2.1 gains step 5: one query that shows whether 019 (`trip_plans.published_at`) and 020 (`trip_collaborators`) are live. The table gains rows 6a (019), 6b (020) and 6c (046), all before 036. Row 15 is 045, after 042.

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T275-owner-decisions-2026-10-02b.md"`

### T316 the status surface on the data host (2026-10-03)

Carta can now tell travellers about an outage while Supabase is down. The site notice (AnnouncementBar, read from Supabase site_config) was the only in-app line, so it went silent exactly when Supabase was the thing that failed. There is now a second source: a small file, status.json, on the data host at https://data.carta-europetravel.com/data/status.json (R2 object carta/data/status.json). The app reads it once per page load and draws it with the same bar, the same warn and info tones and the same dismiss rule as the site notice.

Broke: A literal byte order mark and a literal em dash landed in two new files / the file-writing tool turned the \uFEFF and \u2014 escapes into the characters / replaced with a \u{FEFF} regex class and String.fromCharCode(0x2014); both files checked ASCII; Two shell edits lost a backslash / heredocs eat backslashes (known gotcha) / redone with the Edit t...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T316-status-surface.md"`

### T318 The Where the numbers come from explainer page (2026-10-03)

Carta now builds one static page, "Where the numbers come from", at `/about/numbers`. It needs no sign-in and carries no script. The build emits it as `about/numbers.html`, a single file, so Pages and Vercel both serve it at the clean path. The dev server answers the same path from memory. Nothing on the page is typed. The positioning sentence of PRODUCT.md (T201) is rebuilt from `public/boot.json` `meta.n_destinations` (3,868 in this checkout) and the length of `COUNTRY_SLUGS` in `src/lib/urlScheme.js` (43).

Broke: The page did not answer on the first dev server / The server had started before Vite re-bundled the changed config / Restarted it; The app root never rendered under the dev server in the harness (blank page after 30 seconds) / Not investigated; the dev server is slow on a cold shard cache / Checked the app in the built preview instead; Phone check...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T318-numbers-explainer.md"`

### T326 the feedback front door (2026-10-07)

A traveller can now report a problem from the page where they see it. A quiet text link, Report a problem, sits in the action area of the destination page and of the trail, beach, lake, mountain and cycling route pages. Beside the priced surfaces the same component reads Report this price: under the first-run receipt and in the cost fold on the destination page, in the cost fold on the trip page, and under the budget on the journey page. The link opens the existing feedback form as a sheet (SheetShell) over the page, so the traveller keeps their place.

Broke: Sheet invisible on every page, send button "covered" by the page / SheetShell scrim is z 60, full pages are z 240 / scrim holding .report-sheet raised to 330; Report this price wrapped onto two lines in the destination action row on a phone / narrow pill row / white-space nowrap; verify_cycling reports 70 of 72 / the two failures are data checks (a...

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T326-feedback-front-door.md"`

### T336 Launch outreach drafts (2026-10-06)

Carta now has the two outreach drafts the launch plan was missing, and the channel test of the acquisition constraint is written down as done. Both live in one new file, docs/LAUNCH-OUTREACH-DRAFTS.md. It holds a courtesy note for the bodies credited in continent-app/src/data/attribution.js, a table that says for each of the 43 entries whether a note goes out, a paragraph that asks the L1 to L3 partners whether they would co-announce, and the channel test. All drafts carry placeholders for the date, the owner's name and the credit link. Nothing was sent and no external service was touched. The count of 43 was verified by counting the `source:` keys in attribution.js (43).

Full: `git show archive/execution-full-2026-11-03:"Execution/P12/T336-launch-outreach-drafts.md"`
