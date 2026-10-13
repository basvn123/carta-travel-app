# Launch metrics and where each one is read

This page names the numbers that matter in the first week after launch and says where each is read. Everything in the financial model (CARTA_UNIT_ECONOMICS.md section 5) scales off the purchase rate, so that number comes first and cannot be missing. Where no instrument exists yet, the row says so and points at the register item that owns the gap.

## The single place to look

The admin page, Overview section. It stacks, in this order: pipeline health, priced trips and partner clicks, the paywall funnel, margin, AI usage, plan cache hit rate and AI failures, with the account counts above them. Every row below that says "Overview" is read there. It needs migrations 026, 027, 030, 031, 040, 041, 042, 044, 045, 047 and 048 pasted into the live project; a card whose function is missing hides itself, so a missing card means a missing migration, not zero traffic.

## The decision

Look at five numbers every day of week one: purchases, new accounts, paywall shown, AI units against the daily cap, and AI failures. Read the rest once at the end of the week. The purchase rate is purchases divided by visitors. The visitor half comes from the host's server-side dashboard (T275 closed T215-a: no analytics script, no cookie banner). Read it in the Cloudflare dashboard: Workers & Pages, the project carta-app, Metrics (Cloudflare Pages analytics, counted at the edge). Take the unique visitors figure for the same window as the purchases, and say in the report that it is a server-side count of requests at the edge, not a count of people. If that panel is unavailable, fall back to purchases divided by new accounts and say so.

## Metrics

| Metric | Read from | Where on screen | Status |
|---|---|---|---|
| Purchases, total and by tier | admin_paywall_funnel (purchased, byTier) and admin_margin (byTier, count) | Overview, Paywall funnel and Margin | Exists |
| Purchase rate | purchases over visitors | Overview for purchases, host dashboard for visitors | Exists once both are read; the division is by hand |
| Visitors | Cloudflare Pages analytics for the project carta-app (server-side, no script on the page, no cookie banner) | Cloudflare dashboard, Workers & Pages, carta-app, Metrics | Exists, outside the admin page (T215-a, T275) |
| Priced-trip completions | admin_launch_metrics (tripsPriced: total, bySurface built or ready, daily); one tick per finished trip wizard, per day, no identifier, guests included | Overview, Priced trips and partner clicks | Exists once 048 is pasted (T315) |
| Account creations | admin_stats (users, newWeek, newMonth) | Overview, account counts | Exists |
| Paywall shown, dismissed, converted per reason code | admin_paywall_funnel (byReason: shown, dismissed, checkout, bought, conversionRate; byKind groups them) | Overview, Paywall funnel, by gate | Exists |
| Paywall shown to guests | admin_paywall_funnel (shownGuest) | Paywall funnel | Exists |
| AI units consumed | admin_ai_usage (daily, today, globalCap, peakDay, daysAtCap, plan and ground units) and admin_margin (planUnits, groundUnits) | Overview, AI usage and Margin | Exists |
| AI refusals at the cap, by tier | admin_ai_usage (rejections, rejectionsByTier) | AI usage, refusals by tier | Exists |
| Cache hit rate | admin_ai_usage (cache.lookups, hits, rate) and admin_ai_cache_report (by key version, where the misses are) | Overview, Plan cache hit rate | Exists |
| Affiliate clicks | admin_launch_metrics (affiliateClicks: total, byPartner, bySurface by sub-ID, daily); one document listener counts clicks on links that carry this build's partner id | Overview, Priced trips and partner clicks | Exists once 048 is pasted and a partner id is set in the build (T315) |
| Error rate | admin_edge_errors (the failures) over admin_launch_metrics (aiCalls: total, failures, rate, byFunction, countedSince) | Overview, AI failures, Failure rate tile | Exists once 048 is pasted (T315); client crashes are counted apart (047, crashes key) |
| Contribution and margin per purchase | admin_margin (contribution, reconciled, ossBreached) | Overview, Margin | Exists |

## Reading notes

Paywall conversion per reason uses the reason stored on the grant when there is one and the nearest earlier checkout within an hour otherwise; the response field attribution says which the window used. Guest events carry no user, so shown includes guests while a purchase is always an account.

The error rate is AI failures divided by AI calls, both as the app saw them: the app counts a call just before it asks plan-day, suggest-city or parse-booking, and records a failure when the answer is ai_timeout, ai_bad_output, url_unreachable or ai_error. Both count signed-in callers only. The rate counts from countedSince, the first day in the window with a counted call, so the days before 048 was pasted do not inflate it, and it is blank rather than zero until a call is counted. A quota refusal is a call, not a failure. Render crashes (047) are a fault in the app build, not in a model, and stay off the rate.

The priced-trip and click counts are per-day counters with no user, no time of day and no page, so they include guests and cannot be broken down by person. A click on a link inside an exported PDF is outside the app and is not counted. With no partner id set in the build, links are not decorated, nothing can earn, and nothing is counted.

Carta does not price flights, so no metric here depends on a fare source.
