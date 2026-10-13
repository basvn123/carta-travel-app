# Carta product roadmap

What is actually left to build before Carta is a product rather than a project,
in the order the dependencies demand. Written 2026-09-19 against the repo as it
stands on `trails-photos-and-card-overlay`.

This started as an external review. Every claim in it has been checked against
the code, and the corrections are recorded here rather than quietly dropped,
because a roadmap that flatters the codebase is worse than no roadmap.

## What Carta prices now

The product changed and the review it came from did not know it. . The
headline is **the total for a trip of N nights**, built from what a place costs
once you are there: bed, food, local transport, activities, all answering to
the Lifestyle panel. Where a flight enters the total at all, **the number comes
from the user**, because they are the only party who knows what they actually
paid.

This is a better product and a much better legal position, and most of this
document follows from it. It also means a chunk of the codebase is now lying
about where its numbers come from. That is the first section below.


---

## Priority zero: finish the fare removal

Not housekeeping. There is live code computing prices from data that is no
longer in the file, and it fails silently rather than loudly.

- `src/lib/runtime_pricing.js` reads `dest.routes` and `outbound_fare` at lines
  426 to 463. Those keys are absent from every destination record now. It does
  not throw; it reaches for a missing object and carries on.
- `src/lib/origins.js` is built entirely on the same shape.
- `src/lib/tripCostOptimizer.js` sweeps "every start date that has a real stored
  fare" and returns `fare_total`. There are no stored fares. It is called live
  from `src/hooks/useTripPlanner.js`.
- `src/components/FareProvenance.jsx` is mounted nowhere. Dead.
- `meta` still ships five `fares_model_*` blocks plus `flight_model` and full
  origin coverage tables.
- `OriginPicker` is still mounted in `TripPlannerTab.jsx`.

**Why this is first.** Every other item on this page assumes you can trust what
the app prints. A silent zero inside a total is the worst possible bug for a
product whose entire claim is "this number is honest". It is also the cheapest
fix on the list, and it shrinks the payload and the attack surface on the way
through.

**What to decide while doing it.** `OriginPicker` should either go, or be
repurposed as the door where the user enters what their flight cost. Those are
different products. Pick one deliberately rather than leaving the component
mounted and ambiguous.

---

## Accuracy and trust

Still the highest-leverage unbuilt thing, with a new target.

**Publish a ground-cost accuracy figure.** Take 40 or 50 destinations, price a
real few days in each by hand against booking sites and menus, and publish the
result as a sentence: "within EUR 15 a day for 80 per cent of places." That one
number is what separates a hobby project from a credible product, and it is the
most persuasive artefact you have for a recruiter.

**It is harder than the fare version, which is why it is worth more.**
`costIndex.js` already documents the weakness honestly: 88 per cent of food
baskets and 74 per cent of stay rates are national numbers carried down to every
town. An accuracy pass will mostly be measuring how much that national fallback
costs you, per country, and that result is directly actionable: it tells you
where city-level harvesting earns its keep.

**Provenance is already half-built and should be finished, not restarted.**
`costIndex.js` carries `city` versus `country` provenance on every figure. Put
it on the face of the trip total, not only in the detail panel. A user seeing
"food: national average for Portugal" trusts the app more than one seeing a
number with no story, even though the second looks more confident.

**The honest-number framing is now your strongest asset.** You no longer
republish anyone's prices. You publish measured and modelled costs with sources
named. Say this out loud in the product and in the Terms.

---

## Search visibility

The largest single finding, and it survives the product change intact.

Google sees one page with no content. You have 3,868 destinations of genuine,
low-competition long-tail content that nobody can find.

**The queries changed for the better.** "Dublin to Krakow flight cost" was a
query you competed for against Skyscanner and could not win. "What a week in
Krakow costs" is a query where you have better data than almost anyone and
nearly no competition. Dropping fares moved you from a crowded keyword space to
an empty one. Target cost-of-trip and cost-of-place queries per destination,
per country, and per trip length.

**The work.** Add static prerendering to the Vite build, give destinations real
paths, and generate the sitemap from `app_data.json`. `public/robots.txt` is
already written for a world where this exists, and the comment in `sitemap.xml`
names the script that was meant to do it. Write that script.

**Content is the other half.** Programmatic pages rank but nobody links to them.
Human-written pieces get links, and links are what make the programmatic pages
rank at all. Write a handful: what a week in Albania actually costs, with
receipts. Complementary, not alternatives.

**Performance gates this.** Core Web Vitals are a ranking factor, so the payload
problem below is the same problem, not a separate one.

---

## Payload and performance

`app_data.json` is 12.5 MB and `poi_credits.json` another 2.1 MB. On a phone on
mobile data the loading state is the product for the first several seconds, and
it is the least-designed screen in the app despite being the most seen.

Finishing the fare removal takes a bite out of this for free: the origin
coverage tables and five fares models in `meta` are pure dead weight now.

The deeper fix is sharding by region or viewport. Every new layer currently
makes first paint worse, so the constraint tightens every time you ship. Shard
once and it goes away permanently instead of being managed forever.

---

## Legal

Each item unlocks something specific.

**Imprint.** Legally mandatory for you specifically: EU-based, commercial site,
so EU and Belgian e-commerce law requires identifiable trader details. Without
it you are personally exposed in a way a portfolio project should never be. The
cheapest risk reduction on this page.

**Terms of Service.** Absent. Needed before live payments and any store
submission. It is also where the honest-number framing belongs: you publish
modelled and measured estimates with provenance, and you do not republish any
operator's live prices. That sentence is now simply true, which makes it easy to
write and easy to defend.

**Cookie and consent.** You load Supabase auth and Stripe. The moment analytics
lands, ePrivacy requires consent. Build it alongside the analytics work. Two
hours now; a rewrite once you have users. A privacy-friendly analytics tool
keeps this simple.

**Close the 11 MISSING rows in the licence ledger.** The ledger and the derived
attribution screen both exist, which is rare. The gap is eleven sources owed a
credit they are not getting. ODbL is the sharp one: it carries share-alike
conditions on derived databases, and `app_data.json` is a derived database. Work
the list to zero.

**GDPR export.** Erasure is done via migration 005. Export is not. Same subject,
half the work already banked.

**Store requirements.** Only live if the mobile decision below goes that way.
Google's Data Safety form must match what the app actually does.

---

## Reliability, security and ops

**Error reporting.** `ErrorBoundary.jsx` catches errors and tells nobody. You
find out about production breakage by using your own app. Sentry is an afternoon
and it is the best value-to-effort ratio here. The silent-zero class of bug in
Priority Zero is exactly what it would have caught.

**RLS tests.** 14 migrations enable row level security, 14 create policies, zero
tests exercise them. RLS is the only thing between one user and another user's
saved trips, and RLS policies fail silently open, so the failure is invisible
until someone finds it. Both a real safety requirement and a portfolio-grade
thing to point at.

**Pipeline observability.** Collectors on weekly, monthly and quarterly
cadences. The failure that kills data products is not a crash, it is a collector
silently returning an empty list and degrading the dataset for six weeks. Alert
on row counts and distributions, not exit codes. The drift-gating is the right
instinct; it needs to page you.

**Schema contract in CI.** Pipeline and app are separate codebases sharing a
JSON file. Priority Zero is precisely what happens without a validated contract:
the data shape changed and the app kept reading the old keys. `npm run ci`
already gates lint, test, verify and build. A schema check belongs in that
chain, and it would have turned this into a build failure months ago.

---

## Interface

**First-run experience.** The hard part is that "what a trip actually costs" is
an unfamiliar idea. Someone landing on a map with filters has to learn the
concept before getting value. Someone landing on one concrete result, "5 nights
in Palermo, about EUR 340 on the ground", understands it immediately and then
explores. This screen decides whether everything else gets seen.

**Filters are the navigation system.** With 3,868 destinations that is true
regardless of what you price. What changed is which filters matter: cost band,
season, crowding and trip length now, rather than fare-driven date flexibility.

**Empty, loading and error states.** See payload. On a phone these are most of
the first experience.

**Accessibility.** An interactive map is the hardest thing to make accessible,
which is why solving it is a strong competence signal. It also forces keyboard
navigation, which makes the map better for everyone.

**Design tokens.** 30-plus components against a single `styles.css` means the
cost of a visual change scales with component count, which is why polish passes
stall on projects this size.

---

## Unit economics

**Map tiles are the dangerous line.** Tile providers bill per view and an
interactive map generates many views per session. This is the cost that goes
non-linear precisely when you succeed. Measure tiles per session before traffic
arrives, not after the bill.

**The funnel has a missing top.** `paywallEvents.js` and sub-ID attribution mean
you can already answer which gate converts. You cannot answer how many people
reach a destination view at all, so you will optimise the paywall when the
problem is the landing page.

**Affiliate economics changed and need rethinking.** `affiliate.js` is
Travelpayouts, which is flight-shaped. If you no longer route people to flights,
the natural affiliate surface is stays, activities and ground transport, where
`omio.js` already points. Decide whether Travelpayouts still earns its place or
whether the affiliate story is now accommodation-led.

**Break-even.** Not about profit: about knowing whether Carta needs 5,000 or
500,000 sessions a month to sustain itself, because that number decides whether
SEO is a nice-to-have or the whole strategy.

---

## Positioning

One sentence, because the differentiator is invisible in a screenshot.

The old answer was "ground costs, not just flights". That answer dies with the
fares: it was defined against a thing you no longer do. The new one is stronger
and needs stating plainly. Carta tells you what a place costs to actually be in,
for the way you travel, across 3,868 places in Europe, from open data with the
sources named. The test question is no longer "why not Skyscanner Everywhere",
because you are not in that business. It is "why not a cost-of-living site", and
the answer is that those price living there, not visiting, and they do not know
about your beaches, trails and lakes.

Write the sentence. It gives you a test to check future features against, which
is what stops a project this size sprawling.

---

## The order things happen in

1. **Finish the fare removal.** Nothing else can be trusted until the app stops
   computing with data that is not there.
2. **Decide the flight-cost input.** Does the user type what they paid, and
   where. This settles what happens to `OriginPicker` and what the total means.
3. **Decide mobile strategy.** PWA-only or wrapped. Decides whether the store
   sub-branch of Legal is live work or theory.
4. **Instrument.** Analytics plus Sentry, with consent alongside. Every decision
   in Marketing and Unit Economics is a guess until this exists.
5. **Measure ground-cost accuracy and publish the figure.**
6. **Prerender and generate the real sitemap.**

---

## What is already done

So none of it gets rebuilt: Stripe checkout and Edge Function with paywall tiers
(`checkout.js`, `pricing.js`), `PrivacyPolicy.jsx`, the licence ledger and its
derived attribution screen, `ErrorBoundary.jsx`, `paywallEvents.js`,
six-language i18n, service worker and web manifest, Playwright plus a
`node:test` suite, a `ci` script gating lint, test, verify and build, account
deletion end to end, backups, and the honest ground-cost model in
`costIndex.js` with provenance already threaded through it.
