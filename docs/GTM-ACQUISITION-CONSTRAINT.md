# Carta Go-to-Market Strategy — Acquisition Constraint

## The Constraint

**€6.85 contribution per purchase, ~2.5% assumed purchase rate, therefore about €0.17 of allowable spend per visitor and about €3.04 of allowable CAC per payer at a 3:1 ratio. Therefore: no paid search, no paid social, no influencer fees, no sponsorships, until contribution per user is several times higher.**

This is not a marketing opinion. It is arithmetic. It saves you from the default startup instinct of buying traffic. It reframes the whole plan: coverage work in P7 is the marketing budget, spent in engineering hours rather than in ad spend.

---

## Financial Model Justification

### Purchase Rate and LTV

From CARTA_UNIT_ECONOMICS.md §5:

- **Blended assumptions:** 70% Trip Pass / 30% Year Pass mix
- **Trip Pass:** €6.99 gross = €5.39 net after VAT and Stripe (77.1% retention), €4.94 contribution after typical AI cost
- **Year Pass:** €14.99 gross = €11.84 net, €11.04 typical contribution
- **Blended net revenue:** €7.32 per purchase
- **Blended AI cost:** €0.47 per purchase
- **Blended contribution:** €6.85 per purchase

At a 2.5% monthly purchase rate across all users:

- **LTV per payer:** €9.11 (assumes 25% of payers repurchase within 12 months)
- **Blended LTV per registered user:** €0.38 (pass + affiliate revenue)
- **Allowable CAC at 3:1 LTV/CAC ratio:** €3.04 per payer, €0.08 per registered user
- **Allowable acquisition spend per visitor:** €0.17

### Why €0.17 is Binding

European travel-intent visitors cost €0.50–€1.50+ on paid search and paid social. No major traffic source delivers acquisition for €0.17 in this category. Consider:

- Google Ads for travel keywords: €0.30–€0.80 per click, <5% conversion to trial
- Facebook / Instagram travel ads: €0.20–€0.60 per link click, <2% conversion to signup
- Influencer sponsorships: €2,000–€10,000 per post, typically <0.5% conversion to DAU

Paid acquisition at any of these rates erodes margin immediately and destroys the unit economics.

---

## The Winning Channel: Organic Search

SEO is not chosen because it is pure. It is chosen because it is the only channel that works at €0.17 CAC.

### The Data Moat

Carta publishes:

- 3,868+ destinations with ground-cost estimates
- 17,619+ published trails with elevation, distance, and difficulty
- 22,289+ bathing waters with EEA compliance data
- 3,000–5,000 mountains with prominence and access data
- 14 curated journeys per destination with source attribution

No other platform publishes all of this with named sources in one place. Each page is indexable, low-competition, and answers high-intent queries:

- "What does a week in Krakow cost?" (Skyscanner does not answer this; Numbeo does, but with no trip context)
- "Best walks in Patagonia" (guide sites are high-authority but thin; Carta's crowdsourced data + visual grid converts better)
- "Bathing water quality in Croatian coast" (Carta publishes EEA WISE data; nobody else makes it searchable by trip)

### Positioning for Search

Carta's positioning is: "Ground costs and activities for 3,868 destinations in Europe, from open data with sources named."

Search intent mappings:

1. **Cost-of-place queries** ("How much does Barcelona cost?") → Destination page (cost breakdown, stay/activity options)
2. **Activity discovery** ("Hiking in Slovenia") → Trails and activities cards, geography filter
3. **Trip planning from budget** ("€50 a day in Poland") → Explore page price slider, Lifestyle filter
4. **Seasonal travel** ("When to visit Iceland?") → Crowding and weather data on destination page
5. **Data quality proof** ("Accurate trip cost planner") → "Modelled and measured" framing with sources in ToS

### Required Work Before Launch

- **Static prerendering:** Generate destination pages as static HTML for crawler indexing
- **Structured data:** JSON-LD for price, location, activities on every destination page
- **Sitemap.xml:** Auto-generate from the catalogue with hreflang for language variants
- **Load time:** Compress payload and cache aggressively; Core Web Vitals are a ranking signal
- **Human content:** 3–5 hand-written articles ("What a week in Palermo costs," with receipts) to earn backlinks

---

## Affiliate Revenue (Secondary Channel)

Free users cost €0.02 lifetime (2 plans, no grounding). They are the conversion funnel top and the SEO surface. Do not paywall them.

Affiliate monetisation:

- **Accommodation:** Airbnb, booking.com affiliate on stay recommendations (40–50% of free-user actions)
- **Ground transport:** Omio affiliate on booking suggestions
- **Activities:** GetYourGuide, Viator affiliate on ticketed activities

Conservative model: 10,000 MAU → 15% click affiliate link → 2% convert → 30 bookings at €3–5 per booking = €90–150/month, or €0.01 per MAU.

This is linear in traffic. At 100k MAU it is €900–1,500/month for zero marginal cost. Instrument click and conversion tracking from day one.

---

## Channels Ruled Out (and Why)

| Channel | Cost per visitor | Reason |
|---------|---|---|
| **Paid search (Google Ads)** | €0.50–€2.00 | Requires €0.17; travel keywords are expensive and crowded |
| **Paid social (Meta, TikTok)** | €0.30–€1.50 | Requires €0.17; travel is low-conversion, high-CPC category |
| **Influencer partnerships** | €0.10–€2.00 per follower | Fixed cost, unpredictable conversion, requires budget scale |
| **Sponsorships** (conferences, blogs) | €2,000–€50,000 per placement | Cannot be justified below €2M ARR |
| **Display / programmatic** | €0.05–€0.30 per impression | Brand awareness, not direct response; poor fit for travel tools |

### When Paid Acquisition Becomes Viable

Paid acquisition becomes a rational investment when:

1. **Contribution per user grows to €1.00+** (requires Lever 1 from §4 of Unit Economics: per-fact grounding reduces AI cost 60–80%)
2. **Repeat purchase rate exceeds 10%** (currently modelled at 2.5%; requires product confidence and word-of-mouth)
3. **Average LTV reaches €25+** (currently €9.11 per payer; requires cohort data proving retention)

At that point, a €1.00 CAC becomes defensible at a 1:4 LTV/CAC ratio. Until then, it destroys the model.

---

## What This Means for Every Workstream

### Product (P1–P15)

- **Not a constraint on features.** Build the product for organic reach, not for viral growth.
- **Coverage work (P7)** is the customer acquisition strategy. Every destination page, trail entry, and beach rating is part of the SEO investment. This changes how ROI is measured: a destination addition is not a feature, it is a marketing spend equivalent to €100+ of paid media.
- **Reliability and accuracy** matter more than flash. A page that says "we know 31 more walks in Albania and cannot map 19 of them" is more credible and more searchable than a blank grid.

### Content (P12)

- **Imprint and ToS** are legally required and required for Stripe checkout. The ToS is also where the honest-number framing belongs: "We publish modelled and measured estimates with provenance."
- **3–5 human-written articles** on cost-of-trip (one per season, one per signature destination) for earned backlinks. These are not product content; they are marketing content.
- **Attribution page** is already built; lean on it.

### Telemetry (P11)

- **Instrument the top of the funnel:** page-view → destination-click → booking-click. Without this you cannot measure whether the problem is SEO or product.
- **Measure affiliate conversion separately** so you can decide whether affiliate is flight-led (Travelpayouts) or accommodation-led (booking.com, Airbnb).
- **Capture cohort retention** so you can answer the repeat-purchase question that gates paid acquisition.

### Operations

- **Before paid acquisition is even considered,** run the Lever 2 and Lever 3 optimisations from Unit Economics §4 (cache key precision, prompt trim). These are free margin and free CAC reduction.
- **Decide the VAT question** (Unit Economics §3.5) with your accountant. A 23% increase in net proceeds is worth more than any paid channel.

---

## Success Criteria

This plan works if:

1. **First 500 users acquired organic** within 6 months of SEO launch (measure: search console clicks by destination, referrer=google.com)
2. **Paywall funnel instruments destination-view → checkout** before launch (measure: paywall_events conversion by traffic source)
3. **Affiliate tracks clicks and conversion** separately (measure: affiliate ROI per channel, booking.com vs Omio)
4. **No paid acquisition is authorized** until contribution per user reaches €2.00+ (measure: blended contribution per purchase from pass mix)
5. **Coverage metrics shift from feature count to keyword volume** (measure: indexed pages, rankings for top 100 cost-of-place keywords)

---

## References

- CARTA_UNIT_ECONOMICS.md §5: Financial model, contribution arithmetic, LTV/CAC math
- PRODUCT_ROADMAP.md: Positioning ("what a place costs to be in"), SEO work, accuracy proof
- supabase/migrations/: Stripe checkout, paywall_events schema
- continent-app/src/lib/pricing.js: Pass tiers, mix assumptions
- continent-app/scripts/paywallEvents.js: Funnel instrumentation (already scaffolded)

---

*Written to Execution/P12/T204-acquisition-constraint.md. The constraint is binding until contribution per user grows to €2.00+. Review this document before approving any new channel proposal.*
