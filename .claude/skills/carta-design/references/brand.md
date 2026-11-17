# Brand rules (reference)

Covers everything the app makes that leaves the screen or stands beside it: the PDF exports, the share cards (OG) and the share receipt, the icons, favicon and PWA images, the emails, the KML and ICS exports, the blog, the reading pages (terms, privacy, imprint, cookies, help, press, partner, AI) and the 404. Look rules rewritten by the brand lane of the house style run (2026-11); the product rules under them bind as before.

Numbers and money (cents on exports), photography licensing, copy and the quality floor: see shared-product-rules.md. The site footer: see home.md.

## One system off the screen

Print and share carry the same objects as the screens, so a PDF on a table, a card in a chat and an icon on a home screen read as the same product with the name hidden:

| Object | Where it appears off the screen | Rule |
|---|---|---|
| **The blaze** (white halo, square umber stripe, short ink heel; 24 x 14) | The wordmark slot of every PDF page foot and cover, every OG card foot, the share receipt foot, the blog header, the 404; the app icon; "here" on a PDF pin map (the place itself) | Only "here" or the wordmark; never decoration. At 16 and 32 px (favicon frames) the heel is drawn heavier and the halo edge dropped |
| **The signpost plate** (ink, pointed end right, name in the plate face, second line in beige, figure on the square end) | The destination PDF cover (name, country, the day figure); every OG card for a record with a figure (a day, a height, a walking time, a Score) | Only where a name meets its figure. A trip, plan or day cover has no plate: a plain Overpass 800 title and its total on the **total plate** (ink, label above, figure big), once |
| **The Score plate** (ink, white figure) | PDF cover line, OG cards (beside the kind when the plate's figure is a price) | Never stars, never coloured |
| **The formation** (bed solid umber, food beige on the umber 500 edge, getting there outlined umber only when outside the total) | OG place cards (under the plate), the share receipt (cost bar and line wagons) | The figure stays the loudest; on the share receipt getting there is ink because it is inside the trip total |
| **The receipt** (dotted leaders, the total ruled in ink, the engine's own total) | Every PDF money row; the share receipt | A missing line is "Not in the total" or "Not yet", outside the sum, on a dashed wagon |
| **Umber wagons for months** (good months solid umber with bold white letters, the rest outlined on the control edge) | PDF month strip, OG month strip | The weight says it too, so it prints in black and white |
| **The relief** (contours from the place's real peaks, umber cut with the blaze, heights on the flat side) | The destination PDF cover, only when the dossier has peaks with a height | No peak, no relief; text never on the contours |

## Type and colour off the screen

- **PDF:** Overpass 400, 600, 800 and Sofia Sans Extra Condensed 700 as static TTFs (`src/assets/print-fonts/`, made by `scripts/print-fonts/build_print_fonts.py` from the screens' woff2; tabular figures frozen in; latin and latin-ext merged). Bundled by Vite, so they never touch `public/`. Colours read live from the role tokens (`pdfKit.js` `rgb()`), the mirror as fallback. White paper; the band (`--surface-sunken`) for frames.
- **OG cards and icons:** rendered in Chromium (`scripts/og/render.mjs`) with the screens' own `@font-face` blocks from `00-fonts.css` inlined; every colour from `01-tokens.css` (`scripts/og/tokens.mjs`); no hex typed in the card scripts (`check.mjs`). Stone ground, ink plates.
- **Share receipt:** canvas ops (`src/lib/share/receipt.js`) in the page's own Overpass; colours are token names from `SHARE_TOKENS`.
- **Emails:** inline hex by value (email clients read no CSS variables): stone `#eef0ea` ground, paper card on a `#cfd5cc` hairline at 12 px, ink `#1e2421`, second text `#465049`, links umber 700 `#744820`, the button umber 600 `#8c5a2b` at 8 px with white text, Overpass first in a web-safe stack.
- **KML:** the route and trail in umber 600 (`ff2b5a8c`, aabbggrr); the other day colours stay so days stay tellable apart after import.

## Formats

| Surface | Format | Gate |
|---|---|---|
| OG card | 1200 x 630 and 1080 x 1080, under 300 KB (house cards are 35 to 65 KB) | `node scripts/og/check.mjs` (`--data <dir>` for another wire, `--icons <dir>` for a staged set) |
| Icons | favicon.svg and .ico (16, 32, 48), 180, 192, 512, maskable 512 (blaze at 0.6 of the side, corners inside the 80 % circle), Android densities and Play 512, adaptive foreground (0.5), iOS 20 to 1024 without alpha | `check.mjs` measures the safe circle from the blaze box (`BLAZE_HALF_DIAGONAL`) |
| PDF | A4, 16 mm margins | `scripts/verify_item_pdf.mjs` (Overpass embedded) |
| Share receipt | 1080 x 1350 | `scripts/verify_share_receipt.mjs`, `tests/shareAssets.test.mjs` (every printed figure checked against the data) |
| Blog | a 720 reading column, the sheet as a file `/blog/blog.css` (the CSP refuses inline style) | `scripts/verify_blog.mjs` serves under that CSP |

New icons are made with `node scripts/og/icons.mjs --out <dir>` and staged: `public/` is protected, the owner copies them in.

## Reading pages and the 404

- **Reading pages** (`LegalDoc.jsx`, styled in `src/styles/brand-pages.css` under `.hs-legal`): a paper sheet on a hairline (the dialog shadow, since it floats), title at headline size in 800, text at 16 on a 720 column, section heads at title size in 800; the contents list beside the text from 1024 with the section you are in marked by the beige wash, umber 800 words and the painted blaze ("here"), folded above the text below 1024 behind a 44 px edged control that takes the selected wash when open. Help's status is a flat band panel (a warning takes the danger edge and says it in words); press facts are flat tiles with the figure loudest.
- **The 404** (`NotFoundPage.jsx`, `src/lib/notFound.js`): shown only for an address the URL scheme cannot read (never for `/`, a language root or any parsed path). The wordmark slot, the dashed blaze at rest (no motion; it is not loading), the title at display size, one line, "Open the map" in solid umber (puts the address back to the root and shows the app) and "Plan a trip" quiet. Focus starts on the heading; the trap keeps it inside.

## Exports

Exports take cents, like receipts and totals (see shared-product-rules.md, Precision by context). On an item page, Download PDF is one of the hand-off row's secondaries and the page's only PDF door (see outdoors.md, Detail page grammar). Flashcards print as the list (see shared-product-rules.md, Tracks).

Two styles still carry the old look because their CSP hashes live in protected `public/_headers`: the prerendered SEO page (`scripts/prerender/html.mjs` `STYLE`) and the HTML print popup (`src/lib/tripExport.js` `PRINT_CSS`). Ready patches were written by the brand lane; applying one means `node scripts/csp-hashes.mjs --write` in the same change and, for `STYLE`, a re-upload of the prerendered pages.

## Install hint (PWA)

The install hint is one line with a secondary "Add to home screen" in My trips, on a phone browser not running the installed app, after a saved trip, dismissed for good; never a modal or banner.

## Icons

The mark is the blaze on an umber 600 tile: no letters, so it holds through a rename. `Logo.jsx` draws the same blaze in a square 32 box (every caller's layout unchanged); the manifest's `theme_color` and `background_color` are the stone ground `#eef0ea`, as `index.html`.

## The numbers explainer

Where the numbers come from (`/about/numbers`) holds the method and the counts; they live on that page and nowhere else (see account.md).
