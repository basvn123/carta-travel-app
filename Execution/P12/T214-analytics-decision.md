# T214: Decide the analytics stack, knowing what it costs you legally

## Task ID

T214

## Date

2026-10-02

## What changed

Nothing in the app. This is a decision document. The recommendation is recorded here and in the register as pending the owner, and no consent banner was built, because the recommendation is the one route on which no banner is needed.

The recommendation in one paragraph: add no third-party analytics script, not Plausible, not Sentry, not PostHog, not Google Analytics, not Vercel or Cloudflare Web Analytics in their script form. Answer traffic questions from the host's own server-side counts, which read nothing on the visitor's device, and answer product questions from the first-party event RPCs Carta already has (the paywall funnel, the AI failure record, the admin analytics over the account tables). If a route-level page count is ever wanted, add it as one more first-party RPC in the shape of migration 022, counting route and day and nothing else, under T243. Then there is no banner to build, and the privacy policy's sentence "no advertising identifiers, no tracking pixels" stays true.

The research also found that the premise of the task is not true today. The plan says there are no analytics libraries in the codebase and only strictly-necessary cookies, so no banner is needed. The first half is right: no analytics package is in package.json and no analytics host is in the source. But continent-app/index.html carries the Travelpayouts Drive snippet, which loads vendor code from emrldtp.com on every page view. I read that code on 2026-10-02. The loader itself stores nothing, but the chunk it pulls in writes three localStorage keys on the carta-europetravel.com origin (am_user_session, emerald_manual_placements_stub, emerald_poi_exclusions_stub), collects click, scroll position, viewport and page height events with a client timestamp and posts them to a collect endpoint, swaps outbound links for affiliate links, and reports its own errors to Sentry (which is why sentry.avs.io sits in the CSP connect-src). T056 counted it at 8 requests per page load. A session identifier stored on the device by a third party for the third party's purposes is exactly the thing Article 5(3) covers, and it is not strictly necessary for a service the traveller asked for. So while that snippet is in the page, Carta is already in the position the plan warns about, and already without a banner. The owner has had the removal question open since T056 (T056-a, recommended "remove") on revenue grounds; this task adds the legal ground and asks for the same answer. Removing it is what makes the "no banner" position true, and it is the single cheapest thing in this report.

## Why the choice falls this way

Article 5(3) of the ePrivacy Directive, carried into Belgian law as Article 10/2 of the Data Protection Act, needs consent before anything is stored on or read from the visitor's device unless it is strictly necessary for a service the visitor explicitly asked for. The EDPB's Guidelines 2/2023 on the technical scope of that article (final text October 2024) say it is technology-neutral: it covers cookies, localStorage, pixels, fingerprinting and scripts that actively make the browser hand over information it would not otherwise send. Information the browser sends on its own in an ordinary request, the URL and the IP address, is not "gained access to" by that reading. That line is what separates the options below.

Belgium matters because Carta is a Belgian operator. The Belgian DPA's cookie guidance (April 2020, still the reference) says analytics and audience-measurement cookies are not strictly necessary and need consent, and unlike France (CNIL) or the Netherlands it grants no audience-measurement exemption. So a tool that is "cookieless but reads the device" has a weaker footing in Belgium than its vendor's blog suggests, and a tool that stores anything at all has none.

The options, in order of legal weight:

| Option | Stores on device | Script reads device | Third party sees IP | Banner in Belgium | Verdict |
|---|---|---|---|---|---|
| Host-side counts (Vercel or Cloudflare zone analytics from server logs) | no | no | the host already does | no | use |
| First-party RPC events (022, 040, a future page_view) | no | no | Supabase already does | no | use, scoped |
| Cloudflare Web Analytics, Plausible, Fathom (cookieless scripts) | no | yes (viewport, UA, referrer sent by script) | yes, new processor | arguable, no exemption | do not add |
| Sentry, PostHog, Google Analytics | yes | yes | yes | yes | do not add |
| Travelpayouts Drive (present today) | yes, three keys | yes | yes, plus Sentry | yes | remove |

The third row is the tempting one. The vendors are honest that they set no cookie and keep no persistent identifier, and under the strict storage reading of 5(3) a cookieless script is outside it. But their scripts do instruct the browser to send viewport size and user agent, which is active collection under the EDPB's reading, and each one adds a processor outside the project who receives every visitor's IP. No regulator has certified any of them. For a site that does not yet have paying traffic, the honest expected value of that risk is small, but the gain is small too, because the host dashboard already gives page views, referrers and countries from server logs with nothing on the visitor's side. The only thing a cookieless script adds over the host's logs is a per-route count and a bounce rate, and the per-route count is one first-party RPC away.

The first-party route is the one T034 and T071 already took, and the reason is the same each time. The paywall funnel (022) stores reason, tier and event, with no page, no session, no device, no IP and no referrer, and guests write with a null user_id so the totals are complete but never attributable. The AI failure record (040) stores function, code and two HTTP statuses with the caller's user id for 90 days. Neither touches the device, so neither is a 5(3) question; both are GDPR disclosures under legitimate interest, and the privacy policy now carries both. A page_view RPC built the same way, route and day only, no identifier, no user id, would not even be personal data once written. The constraint is that it answers only the question it was built for, which is a feature: 022's comment says it plainly, a table that carries nothing extra cannot later become a way to watch one person plan a holiday.

What is given up: no session replay, no funnels across page views, no stack traces from the browser. The Phase 3 plan's Sentry idea for edge errors was already answered by T071 with the RPC. Browser-side JavaScript errors stay unrecorded; if they ever matter, the same RPC pattern (error name and route, no stack with user data, no device) is the answer, not a Sentry SDK.

Two things sit next to this decision and are not analytics but came up in the same audit. First, Supabase auth does not set a cookie: supabase-js keeps the session in localStorage under sb-<ref>-auth-token. It is strictly necessary for sign-in and exempt, but the plan's sentence about "Supabase cookies" is inaccurate and a privacy policy should say local storage, which the current text already does. Stripe loads nothing on Carta's origin at all: checkout.js redirects to Stripe's hosted page, so Stripe's cookies are set on stripe.com. Second, index.html loads its stylesheet from fonts.googleapis.com, so every visit sends the visitor's IP to Google before the app runs. That is a GDPR transfer question, not an ePrivacy one (LG München I, 20 January 2022, 3 O 17493/20, found exactly this unlawful without consent), and it has nothing to do with a banner. Two of the six families are already in public/fonts; the fix is to self-host the rest and drop the preconnect and the two Google hosts from the CSP. It is outside this task and is registered.

## Files touched

**Modified:**
- Execution/_OPEN.md (rows T214-a to T214-d)

**Created:**
- Execution/P12/T214-analytics-decision.md

No app file changed. No migration. The emrldtp.com script and the CSP hosts stay as they are until the owner answers T056-a and T214-b; vercel.json and public/_headers are off limits to this task in any case.

## Commands run

```
git -C "C:/Users/Gebruiker/Documents/Portfolio/wt/T214" status -sb
# read-only, in the main checkout
grep -n -i "analytics|sentry|plausible|posthog|gtag|umami|matomo|stripe|supabase" continent-app/package.json
grep -rn -i -l "plausible|sentry|posthog|gtag|googletagmanager|umami|matomo|@vercel/analytics|cloudflareinsights" continent-app/src continent-app/index.html
grep -rn "document.cookie" continent-app/src
grep -rn -o -h "'carta[._:][A-Za-z0-9_.:-]*'" continent-app/src | sort | uniq -c
grep -n "<script|<link" continent-app/index.html
grep -n -i "content-security-policy" continent-app/vercel.json continent-app/public/_headers
git -C continent-app log --oneline -S emrldtp -- index.html vercel.json
grep -rhoi "function public\.admin_[a-z_]*" supabase/migrations | sort -u
python Execution/_queue/xmind_prompt.py T214
# the vendor code, read once over the network on 2026-10-02
https://emrldtp.com/NTUzODIx.js?t=553821  and  https://emrldtp.com/chunk.Cn1nzZTl.js
```

The vendor chunk name is whatever the loader asked for on that day; the vendor can change it, and the behaviour, at any time. That is the point T056 made and it holds here.

## Config and secrets set

None.

## Before/after measurements

Measured in the main checkout's source and index.html, and in the vendor code as served on 2026-10-02. After equals before because the decision is pending the owner and no code changed.

| Metric | Before | After | Delta |
|---|---|---|---|
| Analytics packages in package.json | 0 | 0 | 0 |
| Analytics hosts referenced in src | 0 | 0 | 0 |
| Third-party scripts loaded per page | 1 (Travelpayouts Drive, 8 requests per T056) | 1 | 0 |
| localStorage keys written by third-party code | 3 | 3 | 0 |
| localStorage keys written by Carta itself (carta.* prefix) | 14 | 14 | 0 |
| First-party cookies set by Carta code | 0 | 0 | 0 |
| First-party event tables (022 paywall_events, 040 edge_errors) | 2 | 2 | 0 |
| Consent banner | none | none | 0 |

The 14 carta.* keys are drafts, dismissals and tab state, all strictly necessary for the thing the visitor is doing, and none leaves the device. The three third-party keys are the ones that need to go.

## What broke and how it was fixed

No issues. One grep over the whole checkout (including data/ and cache/) ran past two minutes and was stopped; the same search over Execution, docs and continent-app/src took seconds.

## What is still open

The decision itself is pending the owner (T214-a). The proposal is: no third-party analytics script of any kind, traffic from the host's server-side dashboard, product events from first-party RPCs, no banner. If the owner wants a cookieless script anyway (Plausible or Cloudflare Web Analytics), the price in Belgium is a consent banner or a defensible argument that the script reads nothing the browser would not send on its own; either way that becomes a new task with a carta-design rule for the banner, since the skill has none today and the ten-things list does not cover it.

The Travelpayouts Drive snippet has to leave index.html for the "no banner" position to be true (T214-b, same answer as T056-a, now with the legal reason beside the revenue one). Removing it also removes emrldtp.com, www.travelpayouts.com and sentry.avs.io from both CSPs, the script hash from script-src, and the T056 harness's host allowance for it. That edit touches vercel.json and public/_headers, which this task may not change, so it is a task of its own once the owner says yes.

Google Fonts should be self-hosted (T214-c). Four font files are already in public/fonts; the other families, and the preconnect and CSP entries for the two Google hosts, follow.

If T243 wants route-level traffic, it should add one first-party page_view RPC in 022's shape, route and day only, no identifier of any kind, guests included, capped per day the way 022 and 040 cap (T214-d). It should not add a script.

Not verified: what the Drive script does on any day other than 2026-10-02, and whether the host dashboard the app ends up on (Vercel today, Cloudflare Pages after T054-c) exposes referrers and countries at the granularity the owner wants. Neither changes the recommendation.

## Rollback procedure

Nothing to roll back. Revert the commit that carries this report and the four register rows, or drop the branch p12-analytics-decision before merge. If the owner later decides to add a script, that is forward work, not a rollback of this document.
