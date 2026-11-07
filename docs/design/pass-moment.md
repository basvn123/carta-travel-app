# The Pass moment

Status: **built behind a flag, off** (T1171, ROADMAP I14, 2026-11-07). The closed beta tests it before it is on for everyone (row T1171-a).

## What it is

One Carta card on the trip page, under "Your route", once the trip has a price. It answers the three questions the roadmap asks of the paid moment:

- **What is free.** Planning and pricing as many trips as you like, a share link and planning together, one saved trip and every GPX file, the free Carta bot day plans (`TIERS.free.aiPlans`, once for the account).
- **What the Trip Pass adds.** PDF, calendar and map exports; every trip saved; the Trip Pass day plans (`TIERS.trip.aiPlans`); booking confirmations read into the trip. Its heading carries the price and the days from `lib/pricing.js` (`TIERS.trip`).
- **When it shows.** Only on a priced trip page, only to a traveller who does not pay (guests included: the card is also the clearest statement of what is free), never as a dialog, never over anything. "Not now" hides it for 14 days; after two "Not now" it does not come back by itself. The hard gates (a PDF, a second saved trip, an import) and Account's prices stay where they are.

## Rules it keeps

- **No dead end.** The primary, "See the Trip Pass", opens the existing pass sheet (`openPrices('browse')`), which names the free way on and closes back to the same trip. "Not now" says how long it hides and where prices stay ("under Account"). The trip page under the card is never blocked.
- **Honest numbers.** No figure is typed into a string: price and days come from `TIERS`, the money through `formatPrice` (the pass sheet's formatter). "VAT included, no subscription" is true of the Trip Pass (`pricing.js`, VAT inclusive for EU consumers; mode `payment`).
- **One offer, no nagging.** No countdown, no urgency, "Not now" as reachable as the primary (both 44 px, side by side on desktop, stacked on a phone).

## The look

The Carta card: white surface, `--radius-stage`, one elevation (`--elev-1`), built in bands. The free list sits on a lagoon tint (lagoon is "fits"), the Trip Pass list on an umber tint (umber is action), side by side from 769 px and stacked on a phone. The foot strip is mist (`--home-ground-mist` 55 percent), the sentence on the left, "Not now" and the primary on the right. The card rises once (8 px, `--dur-3`, `--ease-out`); under reduced motion it is simply there. Forced colours give the card and both lists a `CanvasText` edge.

## Where it lives

- `continent-app/src/pass/PassMoment.jsx` (`PassMoment`, the rules; `PassMomentCard`, the card), `continent-app/src/pass/passMoment.js` (flag, rules, lines), `continent-app/src/pass/PassMoment.css`.
- The one call site: `continent-app/src/planner/TripSummary.jsx`, the overview, after the route.
- Copy: `paywall.*` in the six catalogues; the Pass list reuses the pass sheet's `pass.add*` lines.

## Turning it on

- Preview: `?pm=on` on any page (kept for the tab's session); `?pm=off` ends the preview.
- For everyone: `PASS_MOMENT = true` in `continent-app/src/pass/passMoment.js`.
- Check: `node scripts/verify_paywall.mjs --dom <served build>` from `continent-app/` walks it at 390 and 1440.
