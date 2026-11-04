# Carta — unit economics

22 September 2026. Three questions: what to charge, what it costs to run, what you keep.

---

## 1. Pricing — the recommendation

**Freemium, three tiers, one-off payments. Keep the prices you already have.**

| Tier | Price | Period | AI day-plans | Grounded searches |
|---|---|---|---|---|
| **Free** | €0 | forever | 2 for the life of the account | 0 |
| **Trip Pass** | **€6.99** | 30 days | 60 | 40 |
| **Year Pass** | **€14.99** | 365 days | 300 | 120 |

Everything that is not AI stays free at every tier: the price map, every receipt, every destination page, and GPX downloads. Only generation is metered.

**Why €6.99 and not €3.99.** Stripe's fixed €0.25 is 6.3% of a €3.99 ticket by itself and 3.6% of €6.99 — the cheap price hands a chunk of every sale to the processor for nothing. There is also a competitive floor: TripIt gives away a free 30-day trial and Wanderlog's month is about €5.20, so pricing a 30-day pass under both invites the comparison instead of winning it.

**Why €14.99 and not more.** The ratio is what matters. At 3.76× the Trip Pass, a traveller with two trips a year rationally bought two Trip Passes instead. At 2.1× the Year Pass becomes the obvious upgrade, and "two trips and it pays for itself" matches how people actually travel.

**Why one-off and not a subscription.** Nobody is auto-charged, nobody has to remember to cancel. The forgot-to-cancel revenue that funds a lot of subscription apps is revenue this product declines to take. Say that on the pricing page — in a category built on opaque pricing, it is a real differentiator.

**Keep the Year Pass at 120 grounded searches, not 200.** At 200 a fully used pass leaves €0.54 of margin. At 120 it leaves €2.84, and 120 is still 3× the Trip Pass and more live searches than a year of normal planning uses.

**What to test, in this order.** €7.99 first: if conversion holds, that is +€0.77 net per sale, +14%, for free. €4.99 only if €6.99 visibly suppresses conversion — it needs +40% conversion just to break even against €6.99. Wire test prices through separate Stripe Price objects, never by editing `TIERS` in place. `PRICE_TEST_ALTERNATIVES` is already in `pricing.js` and unused.

**Do not shrink the free tier.** Two lifetime plans cost you about €0.02 per user. Free users are the SEO and affiliate surface, not a cost problem.

---

## 2. Monthly hosting cost

| | Today, pre-launch | At launch, real traffic | 500k MAU, 25k destinations |
|---|---|---|---|
| Cloudflare Pages | €0 | €0 | €0 |
| Cloudflare R2 storage | €1.80 | €2.50 | €5.50 |
| **Egress, all of it** | **€0** | **€0** | **€0** |
| Hetzner CAX11 always-on | €5.99 | — | — |
| Hetzner CAX31 always-on | — | €20.99 | €41.98 (×2) |
| Hetzner CAX41 on demand | €0.45 | €0.90 | €1.70 |
| Supabase | €0 (Free) | €23 (Pro) | €33–78 |
| Mapterhorn terrain mirror | — | €1.40 | €1.40 |
| Sentry | €0 | €0–24 | €24 |
| Domain | €1 | €1 | €1 |
| **Total** | **≈ €9–11** | **≈ €50–75** | **≈ €110–155** |

Add an accountant at €40–100/month once you are invoicing.

Three things worth knowing about the shape of this:

Going from **80 GB to 200 GB of stored data costs about €1.40 a month.** Storage is not what bites.

**Egress is €0 at every tier.** That single decision — R2 behind Cloudflare — is what makes all of the above affordable. The same workload on AWS with S3 egress at scale is a four-figure monthly bill, essentially all of it data transfer.

**One thing would break this model:** a live *transactional* database growing large. Supabase Pro tops out at 8 GB before overages at $0.125/GB. Nothing in Carta points that way — the catalogue is static and the live tier is just auth and saved trips — but watch for user-generated content or live inventory quietly changing the shape.

**Variable cost per unit:** an AI day-plan is about €0.01. A grounded search is about €0.05, because Gemini 3 bills per search query the model chooses to run. A page view is €0.00. Grounded search is 5× a plan and is the only line that reliably costs money.

---

## 3. What you keep per user

### Trip Pass — €6.99

| | € | % |
|---|---|---|
| Gross | 6.99 | 100.0 |
| − VAT 21% | −1.21 | −17.3 |
| − Stripe 1.5% + €0.25 | −0.36 | −5.1 |
| − Stripe Tax 0.5% | −0.03 | −0.5 |
| **Net receipts** | **5.39** | **77.1** |
| − AI at typical use | −0.33 | −4.7 |
| − infrastructure share | −0.12 | −1.7 |
| **You keep** | **4.94** | **70.7** |

If a buyer exhausts every unit (60 plans + 40 grounded = €2.60), you keep **€2.67, 38.2%**. That is the floor, and it is an abuse case rather than a customer.

### Year Pass — €14.99

| | € | % |
|---|---|---|
| Gross | 14.99 | 100.0 |
| − VAT, Stripe, Stripe Tax | −3.15 | −21.0 |
| **Net receipts** | **11.84** | **79.0** |
| − AI at typical use | −0.80 | −5.3 |
| **You keep** | **11.04** | **73.7** |

Fully exhausted (300 plans + 120 grounded = €9.00): **€2.84, 19.0%**.

### Free user

About **€0.02 for the life of the account.** Two AI plans, no grounded searches, zero egress.

### Two things that change these numbers materially

**VAT — worth +23% on every sale.** If the Belgian small-business exemption reaches one-off digital passes sold cross-border, net receipts go from €5.39 to €6.63 and from €11.84 to €14.51. That is worth more than every cost optimisation in this document combined. It is also genuinely complicated, because cross-border B2C digital services normally fall under OSS regardless of a domestic exemption. Ask your accountant one question, in writing: *can I apply the small-business VAT exemption to one-off digital passes sold to consumers in other EU member states, and if not, does OSS registration change anything below €10,000?* Budget €150; the payback is one month of sales.

**Apple, if you ever wrap the PWA.** Web keeps €5.39 per Trip Pass. App Store at the 15% Small Business rate keeps €4.91; at 30%, €4.04. **A 15% cut costs €0.48 per Trip Pass — more than that pass's entire typical AI cost.** Keep purchase on the web wherever the DMA permits.

---

## 4. The three changes that raise what you keep, with no quality cost

**Ground facts, not requests.** Today a grounded generation spends the user's allowance and Google's per-query billing on facts that are identical for every user planning the same city that month. Store volatile facts with a source URL, a fetch date and a per-field expiry — transport timetables 3 months, museum and lift prices 6 months, food and accommodation 12 months — and refresh them on a nightly job. One refresh of the Uffizi ticket price then serves every Florence planner that quarter. Expect a 60–80% cut in grounded units, and quality goes *up*, because everyone sees the same dated, sourced figure.

**Raise the plan-cache hit rate.** The cache table exists; key precision limits it. Round dates to month buckets where the answer is not season-sensitive, quantise group size, drop empty free text from the key, and sort candidate ids before hashing. Every 10 points of hit rate is 10% off both bills, and a cache hit is faster than a generation.

**Cut the prompt, not the output.** The ~6k input tokens per plan are mostly the serialised candidate list. Send the top 30 candidates by rating and proximity and strip descriptions from non-must-see entries. Roughly halves input tokens; the user cannot tell.

**Where not to economise:** never paywall GPX, never degrade the price data, never swap to a weaker model mid-generation. Cap by count, not by quality.

---

## 5. The number that governs strategy

Blended across a 70/30 Trip/Year mix, you keep **€6.85 per purchase**. At a 2.5% purchase rate that is about **€0.17 of allowable spend per visitor**, and about €3.04 of allowable cost per acquired payer.

No paid channel delivers a European travel-intent visitor for €0.17. So paid acquisition is off the table, and organic search is the only channel that works — which means the destinations coverage work is not a data-quality project, it is the customer acquisition strategy.

Break-even against a €60/month fixed cost is **9 Trip Passes or 5 Year Passes a month**. The financial risk in this business is not cost. It is whether anyone shows up.

---

*Modelled from the repository, the Carta plan documents and published vendor pricing as of September 2026. The VAT item is not tax advice — that one is worth a real accountant's hour.*
