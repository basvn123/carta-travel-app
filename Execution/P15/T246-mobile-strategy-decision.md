# T246 Mobile strategy: stay a PWA, do not wrap

## Task ID

T246

## Date

2026-10-02

## What changed

Nothing in the app or the pipeline. This task is the gate Legal.md and the mind map put in front of T247 (App Store) and T248 (Play Store): decide whether Carta stays a progressive web app or gets wrapped into a native shell for the two stores. The decision is recorded here as recommended, pending the owner's confirmation, and nothing was built on it.

The recommendation is to stay a PWA, keep every purchase on the web through the existing Stripe checkout, and leave T247 and T248 gated until one of three named triggers fires. The reasoning is below, followed by the economics, which were recomputed against Apple's EU terms that took effect yesterday and change one of the figures the task was briefed with.

## The decision

Stay a PWA. Reasons, in the order they weighed.

The store tax is larger than every other variable cost combined, and there is no legal route around it once the app is wrapped. A Trip Pass nets €5.39 on the web. Through Apple In-App Purchase at the Small Business Program rate it nets €4.91, so the store takes €0.48 on a pass whose entire typical AI cost is €0.33. The unit economics document assumed the DMA would let a wrapped app send buyers to the web and dodge that. It does not, not usefully. Under Apple's unified EU terms (effective 1 October 2026) a link-out from an App Store app to a web purchase carries a 10% Store Services Commission on any sale within seven days of the tap, and Stripe's fees come back on top. For a Trip Pass that is €0.58 and the pass nets €4.81, which is worse than paying Apple's 15% in the first place. The only EU route that gets Apple down to 5% is Web Distribution or an alternative marketplace, and the eligibility conditions for Web Distribution (a developer account in good standing for two years and a prior-year EU install count in the millions) are not ones Carta meets. So "keep purchase on the web wherever the DMA permits" collapses to "do not wrap", because a wrapped app cannot honour a web-bought pass without also selling it in-app.

That last point is the review guideline, not the fee schedule. App Store guideline 3.1.3(b) lets a multiplatform app unlock content bought on the web only if the same content is also offered as in-app purchase. A wrapped Carta therefore has exactly three shapes: it sells passes through IAP at 15%, or it links out at 10% plus Stripe, or it is a free-only shell that cannot unlock a Year Pass the traveller already paid for. The third one is a worse product than the web app. The first two are a 10 to 15 point tax on every mobile sale with no route back to the web price.

The acquisition argument for a store listing does not hold for this product. The economics document's governing constraint is that Carta can afford €0.17 per visitor and that organic search is the only viable channel. A store listing is a second organic surface, but App Store search sends traffic to apps people already know the name of, and the Destinations coverage work is the acquisition strategy precisely because people search for places, not for planners. The expected lift from a listing is small, and the economics say it would need to be large: a 15% cut on a Trip Pass needs 10.8% more purchases just to stand still, and the standard EU rate of 26% needs 29%. The table below has the full set.

The fixed cost is not trivial at Carta's scale. The Apple Developer Program is €99 a year, which is 20 Trip Passes or 9 Year Passes of contribution before the first iOS sale earns anything. The economics document's monthly break-even is 9 Trip Passes or 5 Year Passes, so an iOS presence adds roughly two Trip Passes a month to that line for as long as it exists. Google Play is a one-off $25, but a personal account opened after November 2023 must run a closed test with 12 testers for 14 continuous days before it may apply for production, which Legal.md already flagged as the long pole; a business account avoids it, and the entity question is open under the Economics sheet's "decide before P2" list.

The build and the maintenance are real, and the machine this project runs on is Windows. An iOS shell needs Xcode to sign and upload, which means a Mac or a hosted macOS build service on every release, not just the first. Every shell release then goes through review, while the web app ships several times a week and its data ships weekly through the service worker's cache rules. Keeping two release cadences in step, with a WebView whose storage and cache behaviour differs from Safari's, is a standing cost that produces no new feature.

The web app already does the mobile job. The manifest declares a standalone display, an id, maskable icons and the paper background; index.html carries the Apple home-screen tags; sw.js precaches the shell and serves the boot index and country files stale-while-revalidate so a repeat open is instant and the catalogue works offline; the share sheet is used in nine places through navigator.share; geolocation drives the trail page's live position and the Destinations near-me control; account deletion and the in-app privacy policy already satisfy guidelines 5.1.1(v) and 5.1.1(i). Web push on iOS has been available to home-screen web apps since 16.4. Nothing in the roadmap needs a capability that only a native shell provides.

What a wrapper would buy is a store icon, a store listing and a store rating. None of those changes a traveller's answer to "what does a week in Porto cost", which is the product.

## Economics attached

All figures are per pass, VAT stripped at 21% on a VAT-inclusive price (Trip Pass €6.99 is €5.78 ex VAT; Year Pass €14.99 is €12.39 ex VAT). Stripe is 1.5% plus €0.25 plus 0.5% Stripe Tax on EEA cards. Store commissions are charged on the ex-VAT price and replace Stripe when the store collects; a link-out keeps Stripe and adds the store's commission. Typical AI use is €0.33 on a Trip Pass and €0.80 on a Year Pass, and the Trip Pass carries a €0.12 infra share, all from CARTA_UNIT_ECONOMICS.md §3.

| Channel | Trip Pass net | Trip Pass contribution | Lift needed to match web | Year Pass net | Year Pass contribution | Lift needed |
|---|---|---|---|---|---|---|
| Web, Stripe (today) | €5.39 | €4.94 | 0 | €11.84 | €11.04 | 0 |
| Apple IAP, Small Business 15% | €4.91 | €4.46 | +10.8% | €10.53 | €9.73 | +13.5% |
| Apple link-out, 10% plus Stripe | €4.81 | €4.36 | +13.3% | €10.60 | €9.80 | +12.7% |
| Apple IAP, EU standard 26% | €4.27 | €3.82 | +29.3% | €9.17 | €8.37 | +31.9% |
| Google Play Billing, first $1M, 15% | €4.91 | €4.46 | +10.8% | €10.53 | €9.73 | +13.5% |
| Google external offer, 10% plus Stripe | €4.81 | €4.36 | +13.3% | €10.60 | €9.80 | +12.7% |

Two corrections to the figures the task was briefed with. The 15% figure holds: €0.48 per Trip Pass and €1.31 per Year Pass. The "30% costs €1.35" figure is superseded for the EU: Apple's standard EU rate is 26% from 1 October 2026, which costs €1.12 per Trip Pass and €2.67 per Year Pass. The 30% rate still applies on non-EU storefronts, and Carta's buyers are European.

Fixed costs of being in the stores: Apple Developer Program €99 a year (20 Trip Passes or 9 Year Passes of contribution), Google Play $25 once, a Mac or a hosted macOS builder for every iOS release, and the 14-day closed test on a personal Play account.

The rate sources, read on 2026-10-02: Apple's "Changes for apps in the European Union" developer support page (IAP 26% standard and 15% Small Business; alternative payment in-app 20% and 10%; Store Services Commission on actionable links 15% and 10%, within seven days of the tap; Core Technology Commission 5% for alternative distribution), and Google's "General conditions of access for Google Play in the EEA" (10% plus 5% billing fee on the first $1M through Play Billing; 10% on external offers on the first $1M; alternative billing at the standard fee less three points). These terms have changed four times in two years; T247 and T248, if they ever run, must re-read both pages on the day.

## When to reopen this

The decision is not forever. Reopen it, as a new task that references this report, when any one of these is true.

The conversion funnel (T243) shows mobile web converting materially below desktop at the same gate, and the gap is attributable to the absence of an installed app rather than to the phone layout. Today this cannot be measured: paywall events carry no device, platform or display-mode information by design (paywallEvents.js), so the funnel task needs to add one coarse installed-or-not bucket before this trigger can fire. That is open item b.

A feature on the roadmap needs a capability the web does not have on iOS. The candidates are background location for recording a trail after the screen locks, and offline map tiles beyond what Cache Storage will hold (sw.js already documents iOS evicting an origin's storage all at once). Neither is on the roadmap.

Monthly contribution is high enough that a 15% tax on the mobile share is tolerable and a store rating has become a trust signal the product needs: in the economics document's terms, the Bull scenario (40,000 MAU) rather than Bear or Base.

If it is reopened and the answer is to wrap, the order is Android first through a Trusted Web Activity on a business Play account (the existing manifest and service worker carry over; a TWA is the PWA in a Chrome shell, not a port), with Play Billing at 15% as the in-app path and the pass honoured from the web. iOS follows only if the Android numbers justify €99 a year plus a Mac build; the in-app path there is IAP at the Small Business rate, because the link-out saves nothing on a Trip Pass.

## Files touched

Modified:
- Execution/_OPEN.md

Created:
- Execution/P15/T246-mobile-strategy-decision.md

No app, pipeline, data or migration files were touched. The app repo (continent-app) has no changes from this task.

## Commands run

python Execution/_queue/xmind_prompt.py T246 (main checkout, read only)

A Python one-liner over zipfile to dump the Economics and Decisions sheet of additional docs/Carta/Carta-Master-Plan.xmind (read only).

Grep over continent-app for the wrapper packages (none), the manifest, sw.js, the serviceWorker registration in main.jsx, navigator.share and navigator.geolocation call sites, the 5.1.1 citations, and paywallEvents.js.

Two web fetches, Apple's EU developer support page and Google's EEA conditions page, for the commission rates in the table.

## Config and secrets set

None.

## Before/after measurements

Not measured. The task is a decision; no figure in the app moves. The economics table above is the attached measurement the task asked for.

## What broke and how it was fixed

No issues.

## What is still open

The decision is recommended, not taken. The owner confirms or overrules it, and until then T247 and T248 stay gated as _ORDER.md already has them (item a).

The reopen trigger on conversion is unmeasurable today. The funnel work (T243) should record one coarse bucket per paywall event, installed home-screen app or browser tab, from the display-mode media query, with no user agent string, so that mobile-versus-desktop and installed-versus-not can be compared at the same gate (item b).

The purchase path on an installed home-screen web app has not been exercised end to end. checkout.js navigates the whole page to Stripe's hosted checkout, and on an installed iOS web app an out-of-scope navigation opens in an in-app browser sheet; the return to CHECKOUT_SUCCESS_URL has to land back inside the installed app with the session intact. Since the PWA is now the mobile strategy, that round trip needs a test on a real iPhone and a real Android phone (item c).

There is no written design rule for an install affordance. Carta has never shown an "add to home screen" hint, carta-design does not cover one, and CLAUDE.md says no design call is made without a written rule. Whether to surface installation at all, and where, is a design decision for the owner before any task builds one (item d).

## Rollback procedure

There is nothing to roll back in the app. To withdraw the decision, mark rows T246-a to T246-d closed in Execution/_OPEN.md in a new commit and write the superseding decision as a new report that references this one; this file is never edited after the task closes.
