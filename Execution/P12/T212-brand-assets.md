# T212 Brand assets: OG images, favicon, app icon, social cards

## Task ID

T212 (mind-map M12)

## Date

2026-10-03

## What changed

Carta now has a generator for share images and a finished icon set, both drawn from the product's own tokens. Before this task the only share image was `icon-512.png`, a 512 pixel square the home page offered as `og:image`, which a large-card previewer crops. After it, `continent-app/scripts/og` turns one wire record into a 1200 by 630 card (or a 1080 by 1080 square for a post made by hand), and the home page points at a real site card, `public/og/site.png`.

A card carries what the page itself leads with. A destination card is a receipt: bed, food and the day total for one person, each line noted as measured in the town or a national figure, plus the two cheapest months to stay on the shared twelve cell strip. Beach, lake and mountain cards carry three measured facts and the score, the lake adds its swim season as a strip and the mountain its snow free months where the wire has them. A trail card draws the route itself, from the geometry on the wire, in the accent colour, above distance, ascent and walking time. The site card is the fallback and also carries one real example receipt, named on the card.

Icons were rebuilt from the compass mark on the current tokens (the old files still used the cool ink, rust and cream of the retired palette). The served set keeps its paths, so `sw.js`, the manifest and `index.html` need no new routes: `favicon.svg`, a new `favicon.ico` with 16, 32 and 48 pixel frames, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `icon-maskable.svg` and a new `icon-maskable-512.png`. The manifest used to offer the ordinary 512 icon as its maskable one, which a launcher mask would have cut through the needle; it now points at a PNG whose mark sits inside the 80 percent safe circle. For the store apps (T272) `continent-app/brand/store` holds the five Android launcher densities, the Play Store 512, an adaptive icon foreground with its background colour, and every iOS AppIcon size up to the 1024 master with no alpha channel.

Register row T205-b is closed here: the shell title, `og:title` and `twitter:title` are now "What a day in Europe costs, place by place | Carta", which follows the T205 pattern (title, then the separator " | Carta", no middot and no dash). The old description and og description also had a hyphen used as a dash and a true em dash; both are gone.

## How it works

Four small modules and three scripts, all ES modules that run under plain Node from `continent-app/`.

`tokens.mjs` reads every colour and the three font names out of the `:root` block of `src/styles.css` at run time, so a token change reaches the images the next time they are generated and no hex is typed in the generator (the check asserts this). `data.mjs` finds a record by the id its page URL carries: a destination by wire key or city name, a beach, lake or mountain by id, a trail by `CC/id`. `specs.mjs` turns a record into a plain description of a card and returns null when the record cannot carry one honestly, in which case the caller uses the site card. The destination total is computed by the same `costIndex.js` the receipt on the page uses, imported directly, so a card and its page cannot disagree about a euro. `cards.mjs` draws a spec as SVG for either format.

`render.mjs` rasterises in headless Chromium through Playwright, which is already a devDependency, so `package.json` is untouched. A browser is used because the fonts are the brand and Node cannot measure a glyph. Before the screenshot a script in the page shrinks text that overflows its box and wraps the header, with the title anchored to its last baseline so a one line name and a two line name both sit on the same spot. Anything that still does not fit at the smallest allowed size is cut with an ellipsis and listed in the returned report instead of being clipped silently. Fraunces is not in `public/fonts` yet (T199 self-hosts it), so the generator carries its own two subsets in `scripts/og/fonts` with a licence note; Plus Jakarta Sans and JetBrains Mono come from `public/fonts`.

`icons.mjs` writes the icon set, `static.mjs` writes the two non-page share images, and `check.mjs` is the gate: it renders the six sample cards in both formats and checks size, weight, truncation, the copy rules, the absence of typed hex, icon dimensions, absence of alpha on the App Store masters, the safe zone arithmetic, the manifest, and the head tags.

To make a card: `node scripts/og/render.mjs --type destination --id Brussels --out brussels.png`. To rebuild everything: `node scripts/og/icons.mjs`, `node scripts/og/static.mjs`, then `node scripts/og/check.mjs`.

## Design calls

The skill's banner and `DESIGN.md` win over the skill's older body, so the cards use the shipped palette and type: warm paper ground, white receipt with a 2 pixel rule border and 12 pixel radius, Fraunces for the place name only, Plus Jakarta Sans for words, JetBrains Mono for every measured number. No gradient, no shadow. The accent colour appears twice, on the compass needle and on a trail's route, which is the "live route" use the tokens allow; ochre is used for the score and nothing else, and green only for good months, as on the page. There is deliberately no photograph: the skill bans generated imagery and a licensed photo per page would need the credit line the image ladder already owns.

## Files touched

Root repo (`Execution/`): created `Execution/P12/T212-brand-assets.md`; modified `Execution/_OPEN.md` (T205-b closed, T212-a to T212-f appended).

App repo (`continent-app/`):

Modified: `index.html`, `public/manifest.webmanifest`, `public/favicon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable.svg`, `public/apple-touch-icon.png`.

Created: `public/favicon.ico`, `public/icon-maskable-512.png`, `public/og/site.png`, `brand/social/site-square.png`, `brand/store/android/` (eight files), `brand/store/ios/` (thirteen files), `scripts/og/` (`tokens.mjs`, `data.mjs`, `specs.mjs`, `cards.mjs`, `render.mjs`, `icons.mjs`, `static.mjs`, `check.mjs`, and `fonts/` with two Fraunces subsets and a licence note).

## Commands run

From `continent-app/` in the app worktree (branch `p12-brand-assets`):

    node scripts/og/icons.mjs
    node scripts/og/static.mjs
    node scripts/og/check.mjs
    node scripts/og/render.mjs --samples <dir>
    node scripts/ci/design-lint.mjs

The Fraunces subsets were fetched once from Google Fonts (weight 600, optical size 72, latin and latin-ext woff2). No data was written and no dev server was started.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| og:image and twitter:image file | `icon-512.png`, 512 x 512 | `og/site.png`, 1200 x 630, 78,227 bytes | right shape for `summary_large_image` |
| Sizes declared in the head (width, height, alt) | none | 1200, 630, alt text on both tags | added |
| Page types with a generated card | 0 | 5 (destination, beach, lake, mountain, trail) plus the site card | +5 |
| Sample card weight, 1200 x 630 | not applicable | 53,102 to 78,227 bytes (limit set in check.mjs: 300 KB) | well under every previewer's cap |
| Sample card weight, 1080 x 1080 | not applicable | 59,121 to 91,341 bytes | |
| Manifest maskable PNG built for the safe zone | no (the ordinary 512 was reused) | yes, ring at 0.63 of the side against a 0.80 safe circle | fixed |
| Icon files in the store set | 0 | 21 (8 Android, 13 iOS) | +21 |
| Render time | not applicable | 8.5 s for 12 cards including browser start, measured with `time` | not projected to 3,868 pages |
| Rated names longer than 52 characters, which wrap to two lines at the smallest title size and may be cut | not applicable | 815 of 22,786 beach, lake, mountain and trail names read from `public/` (3.6 percent), a proxy for the number of cards that shrink or cut | |

The 52 character threshold is an estimate of two lines at 44 pixels in a 568 pixel column, not a render of each name; the exact count comes from running the generator across the wire, which is T221's job.

`check.mjs` passes with 123 checks. Files are the ones named above; the wire the samples were read from is the worktree's local copy, whose boot index is dated 2026-06-07 (see T212-d).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Square card rows overlapped their notes | Panel height of 380 left 51 pixels a row when the lake card had three rows | Panel is 440 high when a strip follows, header lifted 30 pixels |
| EEA site names read "Playa es trenc" | The register is all capitals and the first fix lowercased everything after the first letter | A title case helper capitalises each word |
| Two renderers crashed under `node -e` | The "run only as a script" guard read `process.argv[1]`, which is undefined there | Guard checks it exists |
| A heredoc ate the backslashes in a regular expression | Known bash behaviour | Edited the file in place instead |

## What is still open

Six items, all in `Execution/_OPEN.md`. T212-a (owner): paste the site card and the home URL into the Facebook, LinkedIn, X, WhatsApp and iMessage previewers after the next deploy; no previewer could be reached from this session, so what was verified is the published rules (PNG, 1200 x 630, far under every size cap, absolute https URL, alt text) and not a live render, and the done condition "render correctly in the major previewers" stays unmet until the owner does it. T212-b: no page calls the generator yet, because prerender and the R2 prefix belong to T221; the cards are English only until hreflang wave two. T212-c: country, region, trail parent, cycling route, trip and journey cards are not built, and the mountain horizon silhouette and the ten year beach water history are not on the wire, so the mountain card has no silhouette; the spec section the task cites, 5.5, does not exist in `carta-destinations-enhancement-spec.md` (its parts are lettered A to I), so the content of each card came from the T205 plan and the pages. T212-d: regenerate the site card from the production wire before launch, since the example figure comes from the local wire. T212-e: `sw.js` still precaches the old favicon under `carta-v7`; it was outside this task's files. T212-f: the store apps take their icons from `brand/store`; the signing key, assetlinks and store uploads are owner steps with T272.

## Rollback procedure

Revert the app commit (`git revert <hash>` in `continent-app`, or `git checkout <base> -- index.html public brand scripts/og` and delete `public/og`, `public/favicon.ico`, `public/icon-maskable-512.png`, `brand` and `scripts/og`), then revert the root commit to restore the register. Nothing else depends on the new files: no route, no service worker entry and no package script refers to them. If only the icons are unwanted, restore the seven modified public files and the manifest from the base commit and leave the generator in place.
