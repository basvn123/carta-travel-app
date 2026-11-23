# Error analysis (G4): what still fails or is not covered after wave 1

Golden totals set with E1 on: 17 of 17. The harness with the flag at its default (old): 36 target cases open, 7 of them E1; they close when `E1` is flipped to `new`.

Remaining failure groups, largest first:
1. **Not measured on the published catalogue (3 sites).** A-13 (a missing food item makes a food price unknown) can remove food prices from real places whose basket lacks a Lifestyle item; A-9 (repair inside the catalogue) and the persona view ran on synthetic places. Fix: a shadow pass over the published wire before the owner flips `E1` (owner step in `docs/owner/product-decisions.md`).
2. **Rows left for later waves.** B-5 (Explore "any" hiding islands): moot on HEAD, the 2026-11-20 price chain keeps a row with no fare as a stay-only row sorted last (`lib/settings/ways.js` `notKnownWay`); G-6 median half: moot, `styleDay.js` `medianOf` already skips `tierFallback`; H-4 reach half, H-8 divisor half, G-6 ladder half are W3/W4.
3. **UI not seen with a real gap.** No place in the published catalogue has a missing bed price, so "Without beds in {city}" is pinned in node, not seen on a screen.
4. **E10 client half of J-5.** The server builds the way back and the app strips `?pass=ok` (W0a); the "confirm once and offer the blocked action again" moment is not built (EN-10), the server side is.
5. **Deno.** Not installed here: the webhook and checkout decisions are pure modules (`_shared/stripeEvents.mjs`, `_shared/checkoutUrls.mjs`) tested in node; the two `index.ts` wrappers were edited but not run.
6. **Baseline test failures unrelated to this wave:** `costCardUmber.test.mjs` two DOM checks need a running server (they time out here).
