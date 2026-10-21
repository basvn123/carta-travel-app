# T510: the old logo back, and the browser tab reads Carta

## Task ID
T510 (P11), branch `p11-old-logo` in `continent-app/`, merged to app master `c135d9c`.

## Date
2026-10-21

## What changed
The owner asked for the old logo and for the app to be called Carta rather than the long name. They chose the 3 October (T212) mark: a cream tile with an ink compass and a rust north needle. They also chose to fix only the browser tab title.

- Favicon, app icons and store icons (`brand/store/`) restored byte for byte from `06f9c69` (T212). T436 and T438 had made them white on teal, then white on brown.
- In-app mark (`Logo.jsx`): north needle is rust `#e05a47` again, a fixed colour rather than `var(--action)`. Ring, inner ring and pivot keep their tokens.
- `scripts/og/icons.mjs` now draws the icons in fixed T212 colours, so rerunning it keeps this look.
- `index.html` `<title>`: "Carta". It was T505's positioning sentence, "Plan the whole trip in one place, with what each day costs | Carta". The description, og and twitter titles and the manifest name are unchanged, as the owner chose.

## Files touched
- `continent-app/src/components/Logo.jsx`
- `continent-app/index.html`
- `continent-app/scripts/og/icons.mjs`
- `continent-app/public/favicon.svg`, `favicon.ico`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `icon-maskable.svg`, `apple-touch-icon.png`
- `continent-app/brand/store/` (21 Android and iOS icon files, adaptive background colour)

## Commands run
- `npx eslint src/components/Logo.jsx`: clean
- `npm test`: 558 of 558 pass
- `npm run build:pages`: PASS, 168 files; `node scripts/css-routes.mjs --check dist/assets`: clean
- `npx wrangler pages deploy dist --project-name carta-app --branch main`: deployment `14e62ece`

## Config and secrets set
None.

## Before/after measurements
Not measured (no number promised). Live check after deploy: `https://www.carta-europetravel.com/` serves `<title>Carta</title>`, and `/favicon.svg` has the cream `#f8f6f0` ground and rust `#e05a47` needle.

## What broke and how it was fixed
Nothing. No browser end check was run beyond the live fetch above. The mark's shape is unchanged; only colours changed.

## What is still open
- The rust needle is a fixed hex outside the brown palette. carta-design and DESIGN.md still describe the brown-needle mark, so they need a line recording the owner's choice (T510-a).
- Share card titles (og/twitter) and the installed app name ("Carta, Europe Travel") still carry the longer names, as the owner chose. Change them only if the owner asks.

## Rollback procedure
`git -C continent-app revert -m 1 c135d9c`, rebuild with `npm run build:pages` and redeploy. Alternatively, promote the previous Pages deployment `a227f9f3` in the dashboard.

## Notes on filling this template
Single small owner request, deployed the same session.
