# Viantra logo kit

Signed off by the owner on 2026-11-26 (ROADMAP K1, decision 0018). Built from `.work/2026-11-26-viantra-logo/` (`gen3.py`, `kit.mjs`); the record of the owner's choices is `.work/2026-11-26-viantra-logo/finish.md`.

The mark: an arch whose opening is a V ("the way through", via + tra). Wordmark: Fraunces (SIL OFL 1.1), opsz 144, weight 600, SOFT 100, outlined, hand-spaced. Colours: `svg/colours.md`.

## Where each file goes
Same names and sizes as today's Carta files, so wiring it in is a copy, done together with the rename from Carta (never a Viantra icon next to the name Carta).

| Kit folder | Replaces | Note |
|---|---|---|
| `public/*` | `continent-app/public/` (favicon.svg, favicon.ico, icon-192, icon-512, icon-maskable-512, icon-maskable.svg, apple-touch-icon) | `public/` is protected: the owner says yes first |
| `store/ios/*` | `continent-app/brand/store/ios/` | opaque RGB, no rounded corners (iOS masks) |
| `store/android/*` | `continent-app/brand/store/android/` | foreground inside the 66 dp safe zone; background `#b5532c` |
| `social/site-square.png` | `continent-app/brand/social/site-square.png` | |
| `svg/*` | new | vector masters for print, press and the share cards |

Also to change with the rename: `theme-color` in `continent-app/index.html` and `manifest.webmanifest` colours if the palette moves to terracotta; `public/og/site.png` and the cards from `continent-app/scripts/og/`; the header wordmark slot.

## Checks run
Every PNG matches its current counterpart in size; App Store and opaque icons have no alpha; `favicon.ico` holds 16, 32 and 48 (16 is a hand-tuned pixel version); maskable mark inside the 40% circle; Android mark inside 66 of 108 dp.
