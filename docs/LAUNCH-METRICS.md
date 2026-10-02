# Launch metrics and where each one is read

This page names the numbers that matter in the first week after launch and says where each is read. Everything in the financial model (CARTA_UNIT_ECONOMICS.md section 5) scales off the purchase rate, so that number comes first and cannot be missing. Where no instrument exists yet, the row says so and points at the register item that owns the gap.

## The single place to look

The admin page, Overview section. It stacks, in this order: pipeline health, the paywall funnel, margin, AI usage, plan cache hit rate and AI failures, with the account counts above them. Every row below that says "Overview" is read there. It needs migrations 026, 027, 030, 031, 040, 041, 042, 044 and 045 pasted into the live project; a card whose function is missing hides itself, so a missing card means a missing migration, not zero traffic.

## The decision

Look at five numbers every day of week one: purchases, new accounts, paywall shown, AI units against the daily cap, and AI failures. Read the rest once at the end of the week. The purchase rate is purchases divided by visitors. The visitor half has no source yet, so until it does the working stand-in is purchases divided by new accounts, and the report must say which one it used.

## Metrics

| Metric | Read from | Where on screen | Status |
|---|---|---|---|
| Purchases, total and by tier | admin_paywall_funnel (purchased, byTier) and admin_margin (byTier, count) | Overview, Paywall funnel and Margin | Exists |
| Purchase rate | purchases over visitors | none | Gap: no visitor source (T215-a) |
| Visitors | none; no analytics is installed and no cookie banner exists | none | Gap (T215-a) |
| Priced-trip completions | none; no event is recorded when a traveller finishes a priced trip | none | Gap (T215-b) |
| Account creations | admin_stats (users, newWeek, newMonth) | Overview, account counts | Exists |
| Paywall shown, dismissed, converted per reason code | admin_paywall_funnel (byReason: shown, dismissed, checkout, bought, conversionRate; byKind groups them) | Overview, Paywall funnel, by gate | Exists |
| Paywall shown to guests | admin_paywall_funnel (shownGuest) | Paywall funnel | Exists |
| AI units consumed | admin_ai_usage (daily, today, globalCap, peakDay, daysAtCap, plan and ground units) and admin_margin (planUnits, groundUnits) | Overview, AI usage and Margin | Exists |
| AI refusals at the cap, by tier | admin_ai_usage (rejections, rejectionsByTier) | AI usage, refusals by tier | Exists |
| Cache hit rate | admin_ai_usage (cache.lookups, hits, rate) and admin_ai_cache_report (by key version, where the misses are) | Overview, Plan cache hit rate | Exists |
| Affiliate clicks | none; clicks leave through decorated links in affiliate.js, activityAffiliates.js and omio.js and nothing counts them | none | Gap (T215-c) |
| Error rate | admin_edge_errors (total, byCode, byFunction, byUpstream, daily) gives the numerator for AI functions only | Overview, AI failures | Partial: no denominator, no client errors (T215-d) |
| Contribution and margin per purchase | admin_margin (contribution, reconciled, ossBreached) | Overview, Margin | Exists |

## Reading notes

Paywall conversion per reason uses the reason stored on the grant when there is one and the nearest earlier checkout within an hour otherwise; the response field attribution says which the window used. Guest events carry no user, so shown includes guests while a purchase is always an account.

The error figure is a count of failed AI calls by code. It is not a rate. A rate for the AI functions can be had by dividing by plan units plus ground units from admin_ai_usage over the same window, which is close enough for week one and should be said as such.

Fares are frozen estimates and Carta does not price flights, so no metric here depends on a fare source.
