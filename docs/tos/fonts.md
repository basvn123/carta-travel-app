# Font licences

The app self-hosts every typeface; nothing loads from a font host (the CSP allows none). Each face below is under the SIL Open Font License 1.1, which allows bundling, self-hosting and embedding in PDFs, as long as the font is not sold on its own and the licence travels with it. The licence text sits next to the files.

| Face | Used for | Files | Licence | Source |
|---|---|---|---|---|
| Overpass (variable, 100 to 900) | Every word and figure in the app (house style 2026-11, decision 0012) | `continent-app/src/assets/fonts/Overpass-latin.woff2`, `Overpass-latin-ext.woff2` | SIL OFL 1.1, `continent-app/src/assets/fonts/Overpass-OFL.txt`. Copyright 2021 The Overpass Project Authors | fonts.google.com/specimen/Overpass, github.com/RedHatOfficial/Overpass |
| Sofia Sans Extra Condensed (variable) | Plate names only | `continent-app/src/assets/fonts/SofiaSansExtraCondensed-latin.woff2`, `-latin-ext.woff2` | SIL OFL 1.1, `continent-app/src/assets/fonts/SofiaSansExtraCondensed-OFL.txt`. Copyright 2019 The Sofia Sans Project Authors | fonts.google.com/specimen/Sofia+Sans+Extra+Condensed, github.com/lettersoup/Sofia-Sans |
| Figtree | PDFs and share images until print moves to the house faces | `continent-app/public/fonts/Figtree-*` | SIL OFL 1.1, `continent-app/public/fonts/Figtree-OFL.txt` | fonts.google.com/specimen/Figtree |
| Fraunces, Plus Jakarta Sans, JetBrains Mono | Social cards (`scripts/og/`) until they move to the house faces | `scripts/og/fonts/`, `continent-app/public/fonts/` | SIL OFL 1.1 | Google Fonts |

Checked 2026-11-15: the woff2 subsets were taken from Google Fonts (latin and latin-ext), and the glyph test passed for Č, Š, ť, ü, ñ, œ, Ž, ł, ő, Ě, € in both faces. Overpass maps all ten digits to one advance width under `tnum`, so prices line up in columns.
