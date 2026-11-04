# Carta — unit economics and financial analysis

**Date:** 22 September 2026 · **Scope:** what it costs to run and upgrade Carta, what you keep from every user, and how to raise that without cheapening the product.

Built against the actual repository and the Carta plan folder: `Plan/Architecture/CARTA_CLOUD_ARCHITECTURE.md`, `Plan/BackEnd/Carta BackEnd.md`, `Plan/Legal/Legal.md`, the two Data Quality specs, `supabase/migrations/007_passes.sql`, `supabase/functions/{checkout,plan-day,_shared}`, and `continent-app/src/lib/pricing.js`.

---

## 1. The one-paragraph answer

Carta is a **fixed-cost-light, near-zero-marginal-cost** product. Infrastructure is about **€10/month today and about €50/month with real traffic** — it is a rounding error, not a constraint. The only variable cost that can actually hurt you is **grounded Gemini search at roughly €0.05 a unit**, and it is already capped. You keep **77–79% of a pass** after VAT and Stripe, and **71–74%** after typical AI use. A fully-exhausted Year Pass is the one place margin gets thin (19%), and that is an abuse case, not a customer.

The real lever is not cost. At €6.85 contribution per purchase, **paid acquisition does not work at any plausible conversion rate** — you can afford about €0.17 per visitor. So the financial plan is: keep marginal cost near zero (it already is), push mix toward the Year Pass, and win users through organic search and the data moat rather than spend.

---

## 2. What it costs to run — current and future

### 2.1 Recurring infrastructure

Straight from the architecture doc, which is the authoritative model.

| Tier | When it applies | Monthly |
|---|---|---|
| **Tier 0** — cheapest workable baseline | Today, pre-launch, ≤80 GB | **€9.50** |
| **Tier 0 at 200 GB** | Full 25k-destination catalogue | **€10.90** |
| **Tier 1** — real traffic, 50k–200k MAU | Supabase Pro + CAX31 | **≈ €48–53** |
| **Tier 2** — scale, 500k+ MAU, 25k destinations | 2nd CAX31, 250 GB R2, Supabase compute | **≈ €80–130** |

Going from **80 GB to 200 GB costs about €1.40 a month**. Storage is not the thing that bites; that is the whole point of the zero-egress design.

**Lines the architecture doc does not yet carry**, which you should budget:

| Item | Monthly | Trigger |
|---|---|---|
| Sentry (error telemetry, BackEnd Phase 3) | €0 free tier → €24 Team | When free-tier 5k events/mo is exceeded |
| Transactional email beyond Supabase's built-in | €0 → €18 | When auth email volume outgrows the free allowance |
| Open-Meteo Professional (historical endpoints) | $50 | Only if you need historical weather; ERA5 is free and covers the climatology |
| Accountant / bookkeeping (Belgium, sole trader) | €40–100 | From the moment you invoice |
| Domain | €1 | Now |

**Realistic all-in run rate:** €11/mo today, **€55–75/mo at launch with real traffic**, €130–190/mo at 500k MAU including Sentry and accounting.

### 2.2 Variable cost per unit of usage

| Unit | What it is | Worst-case cost |
|---|---|---|
| `plan` | One Gemini Flash day-plan: ~6k in, ~2.5k out | **~€0.01** |
| `ground` | One grounded generation; Gemini 3 bills **per search query the model runs**, and one generation can fan out | **~€0.05** |
| Page view | ~12 images at 640px + wire, from R2 via Cloudflare | **€0.00** (zero egress) |
| Free-tier user, lifetime | 2 plans, 0 grounded | **~€0.02** |

The asymmetry is the whole story: **grounded search is 5× a plan and is the only line that reliably costs money.** Everything else is free at the margin.

### 2.3 One-off cost to update the architecture — subdivided

Cash is trivial. Your time is the real budget.

| Workstream | Source | Cash one-off | Effort | New recurring |
|---|---|---|---|---|
| Local reclaim, delete redundant masters, compact WSL2 | Arch §8.1 | €0 | 3 h | €0 |
| R2 bucket, 4 prefixes, 2 custom domains | Arch §8.2 | €0 | 4 h | €0.41–3.00 |
| Pipeline → CAX11 + on-demand CAX41 (arm64 verify first) | Arch §6, §8.3 | €0 | 16 h | €5.99 + €0.45 |
| Image ladder: `derive.py`, libvips, 3 AVIF + 2 WebP, R2 takedown | Arch §4, §8.4 | **€0.35** (one 6 h CAX41 run) | 20 h | €0.41 |
| App `<picture>`/`srcset`, CSP tighten, LCP measurement | Arch §8.5 | €0 | 12 h | €0 |
| Data shards → R2, app → Cloudflare Pages | Arch §8.6 | €0 | 12 h | €0 |
| Pin tiles → PMTiles (deferred past 5,000 destinations) | Arch §8.7 | €0 | 10 h | €0 |
| **Infrastructure subtotal** | | **€0.35** | **77 h** | **€7–10/mo** |
| Legal: Imprint, ToS, lawful basis, GDPR export, TASL credit, DPAs, Art 30 | Legal.md | €0 | 16 h | €0 |
| Belgian lawyer review of Imprint + ToS (1–2 h) | Legal.md | **€300–500** | — | €0 |
| Entity registration (ondernemingsloket, KBO/BCE) | Legal.md | **€105–350** | 3 h | €500–1,200/yr accounting |
| EUIPO trademark (optional, not launch-blocking) | Legal.md | €850 | 1 h | €0 |
| **Legal subtotal** | | **€405–1,700** | **20 h** | **€500–1,200/yr** |
| Admin hardening, DSA, telemetry, overrides console, pgTap | BackEnd Phases 1–5 | €0 | 70 h | €0–24 (Sentry) |
| Trips: data defects, CI validator, structure, visuals | Trips spec A–G, J | €0 | 90 h | €0 |
| Trips: backfill 253 + expand to ~600 via generate-verify | Trips spec D, K | **€150–400** | 30 h | €100–200/yr refresh |
| Destinations: extractors, EEA/HydroLAKES ingests, coverage gate | Dest spec Parts 0–1, 6–10 | €0 | 100 h | €0 |
| Imagery: Commons filters, Haiku scoring pass | Dest spec 11.3 | **€30–60** | 25 h | €0 |
| Terrain renders (20k images, GPU spot) + 3D stack | Dest spec 3.4, 3.2 | **€10–15** | 40 h | **€5–6** |
| Frontend design system, accessibility, performance | Frontend research | €0–300 | 60 h | €0 |
| **Product subtotal** | | **€190–775** | **415 h** | **€105–230/yr + €5–30/mo** |
| **TOTAL** | | **€600–2,500 cash** | **≈ 510 h** | **€50–75/mo + €600–1,400/yr** |

**510 hours is 13 full-time weeks, or about 8 months at 15 hours a week.** At a notional €50/h that is €25,000 of your time against €600–2,500 of cash. Every scheduling decision in the plan should optimise your hours, not the cloud bill.

---

## 3. What you retain from every user

### 3.1 Trip Pass — €6.99, one-off, 30 days

| Line | Amount | % of gross |
|---|---|---|
| Gross (VAT inclusive) | €6.99 | 100.0% |
| − VAT @ 21% (BE place of supply below the €10k threshold) | −€1.21 | −17.3% |
| − Stripe, 1.5% + €0.25 (EEA card) | −€0.36 | −5.1% |
| − Stripe Tax, 0.5% | −€0.03 | −0.5% |
| **= Net receipts** | **€5.39** | **77.1%** |
| − AI, typical use (≈8 plans, 5 grounded) | −€0.33 | −4.7% |
| − Infra allocation (at ~300 payers/mo) | −€0.12 | −1.7% |
| **= Contribution, typical** | **€4.94** | **70.7%** |
| − AI, cap fully exhausted (60 plans + 40 grounded = €2.60) | −€2.60 | −37.2% |
| **= Contribution, worst case** | **€2.67** | **38.2%** |

### 3.2 Year Pass — €14.99, one-off, 365 days

| Line | Amount | % of gross |
|---|---|---|
| Gross | €14.99 | 100.0% |
| − VAT @ 21% | −€2.60 | −17.4% |
| − Stripe 1.5% + €0.25 | −€0.48 | −3.2% |
| − Stripe Tax 0.5% | −€0.07 | −0.5% |
| **= Net receipts** | **€11.84** | **79.0%** |
| − AI, typical (≈20 plans, 12 grounded) | −€0.80 | −5.3% |
| **= Contribution, typical** | **€11.04** | **73.7%** |
| − AI, cap exhausted (300 plans + 120 grounded = €9.00) | −€9.00 | −60.0% |
| **= Contribution, worst case** | **€2.84** | **19.0%** |

Your 2026-07 cap review was right, and the arithmetic holds. **The Year Pass at 200 grounded would have been a €0.54 margin on a maxed-out pass. At 120 it is €2.84.** Do not raise it without redoing this table.

### 3.3 Free user

2 lifetime plans, 0 grounded, zero egress cost. **Lifetime cost ≈ €0.02.** Free users are not a cost problem — they are the affiliate surface and the SEO surface. Rationing them further saves nothing and shrinks the funnel.

### 3.4 The three things that quietly change these numbers

**Stripe's fixed €0.25 is 3.6% of a Trip Pass and 1.7% of a Year Pass.** Every point of mix shift toward the Year Pass is free margin.

**Non-EEA cards cost 2.9% + €0.25 instead of 1.5% + €0.25** — about €0.10 more per Trip Pass. Not material at your volumes, but it means a US or UK traveller is a slightly worse customer than a Belgian one.

**Apple's cut, if you ever wrap the PWA.** Selling a digital pass through the App Store means In-App Purchase:

| Channel | Trip Pass proceeds | Year Pass proceeds |
|---|---|---|
| Web (Stripe) | **€5.39** | **€11.84** |
| App Store, Small Business Program 15% | €4.91 | €10.53 |
| App Store, standard 30% | €4.04 | €8.67 |

**A 15% Apple cut costs you €0.48 per Trip Pass — more than the entire typical AI cost of that pass.** If you wrap, keep purchase on the web wherever the DMA permits and treat IAP as a conversion tax, not a default.

### 3.5 The VAT question worth an hour of your accountant's time

The tables above assume you charge 21% Belgian VAT. Under the Belgian small-enterprise exemption (*KMO-vrijstelling*, turnover threshold €25,000), and the EU cross-border small-business scheme that has applied since 2025, you may be able to sell **without charging VAT at all** until you cross the threshold.

If that applies, net receipts become:

| | With VAT | VAT-exempt | Difference |
|---|---|---|---|
| Trip Pass | €5.39 | **€6.63** | **+€1.24 (+23%)** |
| Year Pass | €11.84 | **€14.51** | **+€2.67 (+23%)** |

**That is worth more than every cost optimisation in this document combined.** It is also genuinely complicated — cross-border B2C digital services normally fall under OSS regardless of domestic exemptions. Do not act on this from a report. **Ask your accountant one specific question:** *"Can I apply the small-business VAT exemption to one-off digital passes sold to consumers in other EU member states, and if not, does OSS registration change anything below €10,000?"* Budget €150 for the answer; the payback is one month of sales.

---

## 4. How to maximise profit per user without cheapening the product

Ranked by return. The first three are pure margin with **no quality cost at all** — in two cases quality actually improves.

### Lever 1 — Make grounding per-fact, not per-request (biggest, and it raises quality)

Today a grounded generation spends the user's `ground` allowance and Google's per-query billing on facts that are identical for every user planning the same city that month.

Move grounding out of the request path and into the pipeline. The trips spec already defines the mechanism in K6: **per-field expiry — transport timetables 3 months, museum and lift prices 6 months, food and accommodation ranges 12 months.** Ground a *fact* when it expires, store it with its source URL and fetch date, and serve every user from that store.

- One grounded refresh of "Uffizi ticket price" serves every Florence planner that quarter instead of one.
- Cost moves from **per user per request** to **per fact per quarter**, amortised across the whole user base.
- Quality goes **up**: every user sees the same dated, sourced figure instead of whatever a live search returned that second, which is exactly the "last checked September 2026" promise the design system already wants to make.
- Expected effect: 60–80% reduction in grounded units, on the only line item that costs real money.

Keep a small live-grounding allowance for genuinely user-specific questions. Do not remove the feature; remove the *duplication*.

### Lever 2 — Raise the `ai_plan_cache` hit rate (free money, zero quality cost)

The cache table already exists. What limits it is key precision. Normalise the cache key before hashing:

- Round the date to a **month bucket** for anything not season-sensitive, rather than the exact ISO date.
- Quantise `groupSize` into 1 / 2 / 3–4 / 5+.
- Drop empty `freeText` and empty `mustInclude` from the key entirely.
- Sort candidate ids before hashing so list order never forks the cache.

Every 10 points of hit rate is 10% off both the plan and the grounded bill, and a **cache hit is faster than a generation**, so the user experience improves. Instrument the hit rate in the admin AI rollup (BackEnd Phase 3) so you can see the effect.

### Lever 3 — Cut the prompt, not the output (30% off plan cost, invisible to users)

The ~6k input tokens per plan are dominated by the serialised candidate list. In `plan-day`:

- Send the **top 30 candidates** by rating and proximity to the day's centroid, not everything.
- Strip `desc` from non-`mustSee` candidates.
- Keep the response schema exactly as it is.

The model sequences a shortlist either way. Roughly halves input tokens for no change in the plan the user receives.

### Lever 4 — Precompute the popular days (moves cost off the per-user ledger)

For the top ~200 cities, generate three canonical day plans (relaxed / balanced / packed) **offline on the weekly pipeline** and serve them instantly. Cost becomes per-city-per-quarter, amortised over thousands of users.

This makes the **free tier better and cheaper at the same time**: a free user gets an instant, high-quality day rather than spending one of their two lifetime generations, and the paid tier's value moves to where it should be — *your* dates, *your* group, *your* constraints.

### Lever 5 — Shift mix to the Year Pass (best pricing lever you have)

At €14.99 the Year Pass is 2.14× the Trip Pass and carries **€11.04 typical contribution against €4.94** — 2.2× the margin for 2.1× the price, with the fixed Stripe fee diluted by half.

- Keep the "two trips and it pays for itself" framing; it matches your own trip-frequency reasoning.
- Fire the `expiring` soft gate at day 25 of a Trip Pass with a credit-style upgrade offer.
- Do **not** add a subscription. One-off purchase is a real differentiator, and "forgot to cancel" revenue is not revenue you want in a trust product.

### Lever 6 — Run the price test you already scaffolded

`PRICE_TEST_ALTERNATIVES = { trip: [499, 599, 799] }` is in the code and unused. Travel has among the lowest conversion of any app category, so €6.99 is an empirical question:

- €7.99 holding conversion is **+€0.77 net per sale (+14%)**.
- €4.99 would need **+40% conversion** just to break even against €6.99 — a high bar.

Wire the alternatives through separate Stripe Price objects, never by editing `TIERS` in place, and run one variant at a time against the `paywall_events` funnel you already log.

### Lever 7 — Treat affiliate as the free-user monetisation, and measure it

Free users cost €0.02 and currently monetise at whatever Travelpayouts and Omio return, which nobody is measuring. Modelled conservatively: 10,000 MAU → ~15% click an affiliate link → ~2% convert → ~30 bookings at €3–5 → **€90–150/month, about €0.01 per MAU.**

That is small now and **linear in traffic**, which is the opposite of the pass business. At 100k MAU it is €900–1,500/month for zero marginal cost. Two actions: put click and conversion tracking on every affiliate surface so this stops being a guess, and resolve the open question in `PRODUCT_ROADMAP.md` about whether the affiliate story is flight-led or accommodation-led.

### Where **not** to economise

- **Never paywall GPX or exports.** The trips spec is explicit: the loudest complaint in the Garmin/Wahoo community is paywalled GPX, and it costs you essentially nothing to give away.
- **Never degrade the price data.** It is the only asset the product has.
- **Never cut quality inside a call.** Cap by *count*, not by swapping to a weaker model mid-plan. A user who gets a worse plan does not know they hit a limit — they conclude the product is bad.
- **Never shrink the free tier below 2 lifetime plans.** It saves €0.02 and costs you the top of the funnel.

---

## 5. Financial model — three scenarios, 12 months

**Blended assumptions:** 70% Trip / 30% Year mix → €7.32 net revenue per purchase, €0.47 typical AI cost → **€6.85 contribution per purchase.**

| | Bear | Base | Bull |
|---|---|---|---|
| MAU at month 12 | 3,000 | 12,000 | 40,000 |
| Purchase rate (of MAU, monthly) | 1.0% | 2.5% | 4.0% |
| Purchases / month | 30 | 300 | 1,600 |
| Net pass revenue / month | €220 | €2,196 | €11,712 |
| Affiliate revenue / month | €30 | €240 | €1,200 |
| Variable AI cost | −€14 | −€141 | −€752 |
| Infrastructure + tooling | −€35 | −€60 | −€150 |
| **Monthly contribution** | **€201** | **€2,235** | **€12,010** |
| **Annualised run rate** | **€2.4k** | **€27k** | **€144k** |
| Gross margin | 88% | 92% | 93% |

**Break-even is trivially low.** Against a €60/month fixed cost you need **9 Trip Passes or 5 Year Passes a month**. You will clear that in the first week of a functioning launch. The financial risk in this business is not cost — it is whether anyone shows up.

### The number that actually governs strategy

At €6.85 contribution and a 2.5% purchase rate, **each visitor is worth about €0.17.** No paid channel delivers a European travel-intent visitor for €0.17. Therefore:

- **Paid acquisition is off the table** until contribution per user is several times higher.
- **SEO and organic are the only viable channels**, which makes the Destinations coverage work (17,619 trails, 22,289 bathing waters, 3,000–5,000 mountains, each an indexable page with data nobody else publishes) the **single most important revenue activity in the whole plan** — it is not a data-quality project, it is the customer acquisition strategy.
- The "honest coverage" and reason-code work matters commercially too: a page that says *"we know of 31 more walks in Albania and cannot map 19 of them"* is a page that ranks and converts better than a blank grid.

### Lifetime value

One-off passes, no renewal. Assume 25% of buyers purchase again within 12 months:

- **LTV per payer ≈ €9.11**
- **Blended LTV per registered user ≈ €0.38** (pass + affiliate at a 2.5% purchase rate)
- **Allowable CAC at a 3:1 ratio ≈ €3.04 per payer**, i.e. €0.08 per registered user

---

## 6. Risks to the model, in order of how much they would hurt

| Risk | Impact | Mitigation |
|---|---|---|
| **Gemini raises grounded-search pricing** | The only real variable cost; a 3× increase makes a maxed Year Pass loss-making | Lever 1 removes most exposure; caps already hold; re-run §3.2 on any Google price change |
| **Conversion below 1%** | Everything in §5 scales off it, and travel is a low-conversion category | Run the §4.6 price test early; instrument the `paywall_events` funnel before launch, not after |
| **Selling without a ToS** | Live Stripe checkout with no terms is live consumer-law exposure in the EU | Legal.md item #2, half a day, blocks launch |
| **Vercel Hobby commercial-use violation** | Affiliate links on a Hobby plan breaches the plan terms today | Arch §5.5, move to Cloudflare Pages (free, commercial use permitted) |
| **A live transactional database grows to 200 GB** | Supabase Pro tops out at 8 GB, then $0.125/GB; this is the one path that breaks the whole cost model | Keep the catalogue static; watch for UGC/live-inventory features quietly changing the shape |
| **Apple IAP if you wrap the PWA** | 15–30% of every pass, more than all AI cost combined | Decide the mobile strategy before any store work (Legal.md gate) |
| **Wikimedia throttles hotlinking** | Your largest external dependency, outside your control | Arch §4 image ladder removes it entirely for under €1/month |
| **Affiliate networks change terms** | Currently unmeasured revenue | Instrument first, then decide flight-led vs accommodation-led |

---

## 7. What I would do, in order

1. **Ask the accountant the VAT question** (§3.5). One hour, potentially +23% on every sale.
2. **Write the ToS and Imprint** (Legal.md #1–2). You are selling without them today.
3. **Move off Vercel Hobby to Cloudflare Pages.** Fixes a terms violation and costs nothing.
4. **Instrument before optimising**: AI rollups, cache hit rate, paywall funnel, affiliate clicks. You cannot manage any of §4 blind.
5. **Ship Lever 2 (cache keys) and Lever 3 (prompt trim).** A weekend, no quality cost, permanent.
6. **Build Lever 1 (per-fact grounding).** The big one. It is the K6 work in the trips spec, so it pays for itself twice.
7. **Then everything else**, knowing infrastructure is €10–60/month and will not be what stops you.

---

*Estimates are modelled from the repository, the Carta plan documents and published vendor pricing as of September 2026. The VAT and entity items are not tax or legal advice — items §3.5 and Legal.md #1–2 are where a Belgian accountant and a Belgian lawyer each earn their hour.*
