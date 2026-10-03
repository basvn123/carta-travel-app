# T142: Embed webcams live, never store the frames

## Task ID

T142

## Date

2026-10-03

## What changed

The destination page can now show a "Live views" fold with the foto-webcam.eu player inside an iframe. The picture comes from their server to the traveller's browser, so Carta never fetches, stores or caches a frame. The fold reads `dossier.webcams`, an array of `{ provider, id, label, location }`. Today no dossier carries that field, so no page changes. With the field present, only entries with provider `fotowebcam` and a plain id (letters, digits, hyphen, underscore) render. Anything else is skipped, and a page with no usable entry draws nothing.

The first version of this task (a Haiku session) embedded three providers on guessed addresses and wrote their terms from memory. A fix session read the real terms and dropped two of them. Only foto-webcam.eu is kept. The content security policy `frame-src` now names that one host instead of three, in `public/_headers` and `vercel.json`.

What each provider's terms say, read on 2026-10-03.

foto-webcam.eu allows it. The camera info page (http://www.foto-webcam.eu/webcam/infos/passthurn/innsbruck/infos) says links to a camera are expressly allowed when the target is `https://www.foto-webcam.eu/webcam/<name>/`, that live embedding of the image is allowed if a click opens that address, and that use of the images in internet media is allowed when the source `www.foto-webcam.eu` is clearly legible and, online, a clickable link. Use without the source or link is explicitly forbidden. The embed page (https://www.foto-webcam.eu/webcam/iframe/?wc=ewa) documents the iframe player at `https://www.foto-webcam.eu/webcam/{id}/?frame=1`, with height equal to width times 9/16 plus 95 px, and 145 px instead of 95 when the frame is under 450 px wide. The player does not send X-Frame-Options or a frame-ancestors policy (checked with a HEAD request on 2026-10-03), and it loaded inside our frame in the browser test. The site has no separate terms page. Its front page (https://www.foto-webcam.eu/) points only to the impressum, and the wiki was not read. The terms are site wide, not per camera as the first version claimed.

Panomax is dropped. Its embed page (https://www.panomax.com/en/features/embed-panorama-webcam.html) names iframe, full width and thumbnail embeds but gives no address or conditions to an outsider. The embed codes sit in the operator's back end. Its terms of use (https://www.panomax.com/en/terms-of-use) say nothing on embedding by third parties. The host the first version guessed, `admin.panomax.com`, answers with `X-Frame-Options: SAMEORIGIN`, so a frame there would be blocked anyway.

Roundshot is dropped. Its Livecam service conditions of 28 January 2026 (https://www.roundshot.com/public/upload/assets/2713/Livecam-service-conditions.pdf) say the embed codes, including iframes, exist only in the operator's admin tool and may be shared by the camera owner at the owner's discretion. They are a contract between Roundshot and its customer, and the copyright of the images stays with the camera owner. Carta is not a customer and holds no code. `www.roundshot.com` also sends `X-Frame-Options: SAMEORIGIN`, and the guessed `/show/{id}` address was not confirmed.

The credit follows the foto-webcam.eu wording. Each card shows "Live view from www.foto-webcam.eu", with the name as a link to the camera's own page, opening in a new tab. The player carries its own foto-webcam.eu mark as well. The first version's claims "400+ cameras", "multi-year archives" and "each provider forbids bulk archival" had no source and are gone, as is the generic licence line.

Other changes in the fix. The iframe sandbox is `allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox`: the player needs scripts and its own origin, and its links need to open a tab. The `allow="camera; microphone"` attribute is removed, since a webcam viewer needs neither, and fullscreen uses the `allowfullscreen` attribute the provider's own code uses. The referrer policy is `strict-origin`, which tells the provider only that the request comes from Carta, never which destination. The note under the grid no longer talks about "device location and usage patterns" (the provider is not sent a location). It says the picture comes from the foto-webcam.eu server and opening the section connects the browser to it. The new keys exist in all six languages: `dest.webcamTitle`, `dest.webcamSummary`, `dest.webcamNote`, `dest.webcamFrom` and `dest.webcamFrameTitle`. The old `dest.webcamCredits` key is removed.

The CSS block is rewritten on tokens only (`--space-*`, `--ink`, `--ink-soft`, `--ink-mute`, `--paper-dim`, `--rule-soft`, and `--accent` for the focus ring), with no new colour or font, no uppercase label, and the 10 px card radius. The frame height follows the provider's formula with a container query on the card (95 px extra at 450 px wide and over, 145 px under). The player needs about 320 px, and on a 380 px phone the card is 311 px wide, which clipped the right edge. Under 400 px viewport width the frame therefore bleeds 8 px on each side, with 9 px more height to keep the ratio.

Browser checks, on Vite port 5210 with `dossier.webcams` injected in memory by route interception (nothing written to `public/`). A mock of four entries (two valid ids, one id with a slash, one Panomax entry) showed two cameras at both 380 px and 1280 px viewport widths, so invalid and unsupported entries are filtered. The real players loaded. The frame height matched the formula (331 px at 327 px wide, 344 px at 350 px wide), the player content was not clipped (scroll width equal to client width), and the page had no horizontal scroll and no script error. With the mock off, the fold does not exist at either width.

## Files touched

**Modified (continent-app, branch p8-webcams, commits 7f1893d then a96dc3c):**
- src/browse/WebcamEmbed.jsx
- src/browse/DestinationPage.jsx (first commit only: the import, the `webcams` read and the section)
- src/styles.css
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js
- public/_headers (frame-src directive only)
- vercel.json (frame-src directive only)

**Modified (root, branch p8-webcams):**
- Execution/_OPEN.md (rows T142-a to T142-d)

**Created:**
- Execution/P8/T142-webcam-embeds.md

## Commands run

```bash
cd wt/T142-app
npx vite --port 5210 --strictPort
node _t142_check.mjs mock   # throwaway Playwright harness, deleted after use
node _t142_check.mjs none
npx eslint src/browse/WebcamEmbed.jsx src/browse/DestinationPage.jsx
git add -A && git commit
```

All six i18n files were imported in Node after the edit and parsed. None of the five webcam strings contains an em dash, en dash or middot. ESLint reports no error. Its one warning (`credits` unused in DestinationPage.jsx) was there before this task.

## Config and secrets set

None. The only configuration change is the `frame-src https://www.foto-webcam.eu` directive in the content security policy of `public/_headers` and `vercel.json`. Production is Cloudflare Pages, which reads `_headers`. `vercel.json` is kept in step as the rollback host.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Hosts allowed in frame-src | 3, none verified | 1, verified | -2 |
| Languages with the new strings | 1 | 6 | +5 |
| Providers with terms read and cited | 0 | 3 (1 kept, 2 dropped with reasons) | +3 |
| Pages that change today | 0 | 0 (no dossier has `webcams`) | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Guessed embed addresses | The first version never read the provider documentation. `/webcam/{id}/live/1024/` redirects to the camera page, not to a player | Use the documented `/webcam/{id}/?frame=1` |
| Right edge of the player clipped at 380 px | The player is about 320 px wide, the card 311 px | 8 px bleed each side under 400 px viewport width |
| Whole-file diff in styles.css | A script rewrote the CRLF file with LF endings | Restored CRLF before the commit. The diff is the webcam block only |

## What is still open

The dossier builder does not write `webcams`, and no source for which foto-webcam.eu cameras sit near which destination has been found or checked (T142-a). A harness that loads each stored camera id and flags a dead one should follow once there is data (T142-c). Panomax and Roundshot need written permission and a documented embed address from each operator before they can come back, and then their hosts go into frame-src (T142-d, owner). The foto-webcam.eu wiki and impressum were not read, so a camera operator who asks to be removed is not covered by anything above. T142-b is closed. The rows are in `Execution/_OPEN.md`.

## Rollback procedure

In `continent-app`, revert the two commits (`git revert a96dc3c 7f1893d`), or reset the branch to `d9a0ff2`. To keep the feature but stop all framing, remove `frame-src https://www.foto-webcam.eu;` from `public/_headers` and `vercel.json`. The browser then blocks the frames, so also drop the `webcams` field from any dossier. No data, schema or pipeline change was made, so nothing else needs undoing.
