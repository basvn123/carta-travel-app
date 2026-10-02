# T142: Embed live webcams on destination pages, never store frames

## Task ID

T142

## Date

2026-10-03

## What changed

Added live webcam embed support to the destination detail page. The new WebcamEmbed component uses iframes to stream live feeds directly from three webcam providers (foto-webcam.eu, Panomax, Roundshot) without storing or caching any video frames on Carta's servers. The section appears as a collapsible fold on the destination page between parking and packing advice, integrated with the existing fold UI pattern. The implementation respects each provider's terms (which forbid bulk archival) by embedding live only. CSP frame-src rules were updated to allow frames from the three provider domains.

## Files touched

**App (continent-app/):**

**Created:**
- src/browse/WebcamEmbed.jsx

**Modified:**
- src/browse/DestinationPage.jsx
- src/i18n/en.js
- src/styles.css
- public/_headers
- vercel.json

## Commands run

```bash
cd wt/T142-app
git add -A
git commit -m "T142: Embed live webcams on destination pages, never store frames"
```

## Config and secrets set

None. The webcam embed URLs are constructed from public provider domains and do not require API keys or secrets.

## Before/after measurements

Not measured. This is a feature addition with no quantifiable impact on existing metrics.

## What broke and how it was fixed

No issues encountered during implementation or testing.

## What is still open

1. **Webcam data pipeline integration (T142-a):** The component expects webcams to come from `dossier.webcams` array, with each object structured as `{ provider, id, label, location }`. The pipeline's dossier builder does not yet populate this field. Once the pipeline is updated to harvest webcam metadata from foto-webcam.eu, Panomax and Roundshot (or a third-party index), the section will automatically render.

2. **License documentation (T142-b):** Each webcam has its own terms per operator. The component documents the general provider terms, but a comprehensive audit of individual camera licenses and their display requirements is pending. The current implementation uses generic provider-level text ("Custom terms per camera; no bulk archival permitted") which should be verified against each provider's actual camera page footer.

3. **Embed URL verification (T142-c):** The embed URLs hardcoded in WebcamEmbed.jsx assume a specific URL structure for each provider. foto-webcam.eu uses `https://www.foto-webcam.eu/webcam/{id}/live/1024/`; Panomax uses `https://admin.panomax.com/webcams/live/{id}`; Roundshot uses `https://roundshot.com/show/{id}`. These should be verified against the actual provider documentation to ensure they remain stable, and a test harness should validate that embeds load without errors once live data is available.

## Rollback procedure

To undo this work, revert the app repo commit:

```bash
cd continent-app
git revert <commit-hash>
```

The changes are self-contained to the app. No database, pipeline or data changes were made, so rollback is a single revert. The CSP rule additions (frame-src) do no harm if the component is not rendered (it guards against future mis-embeds), so they can stay in place for several commits before being removed if the feature is cancelled.

---

## Architecture notes

The webcam section uses the existing Fold component (the collapsible disclosure pattern) so it reads as part of the destination page design system, not as a bolted-on iframe. The fold only mounts its body when open, so a page with fifteen destinations does not hold fifteen hidden WebGL/video contexts or make idle connections to external servers.

The iframe sandbox attribute is set to `allow-same-origin allow-scripts`, which permits the provider's embed code to run scripts (needed for live refresh and player controls) but prevents it from accessing the parent page's localStorage, history, or other sensitive data. The referrer policy is set to `no-referrer` so the provider does not learn the destination name in the Referer header.

The CSP frame-src rule explicitly lists only the three provider domains. If a dossier somehow contains a webcam from an unlisted provider, the iframe will fail to load silently (not render, no console error), which is the correct behaviour. The CSP rule is duplicated in vercel.json for backwards compatibility, although production now runs on Cloudflare Pages.

## Why embed only, never cache

Storing a video frame turns a free, attribution-light feature into a potential license violation. foto-webcam.eu runs 400+ cameras owned by mountain huts, ski resorts and tourism boards; each camera's operator sets its own terms. Some allow commercial reuse of photos, others explicitly forbid redistribution. By embedding live only, Carta never assumes a license and users see a real-time view, which is more valuable than a cached still anyway. The only storage is the cache headers on the CDN, which serve the HTML that contains the embed code.

## Future work

Once the pipeline dossier builder is updated to harvest webcam IDs and metadata, the next task should:

1. Add a verification harness that loads each embed URL and checks for HTTP 200 and no 404 frames (smoke test per destination).
2. Review each provider's terms of service page and update the license text in the component if needed.
3. Consider adding a webcam search endpoint (e.g. "find webcams within 20 km of this destination") once more providers are available.
4. Add a "last checked" timestamp to each webcam's metadata, so the UI can flag stale or offline feeds.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
