# T438: the brown palette, the rules that go with it, and checks that work (Explore redesign, step 2 of 9)

## Task ID

T438

## Date

2026-10-13

## What changed

The app now has two base colours, the owner's call of 2026-10-13: blue-grey ink and one warm brown.

**Tokens.** A new `umber` ramp joins the primitives in `01-tokens.css`. Every role that read the lagoon teal now reads it:
- action, hover and press;
- the action tint;
- the selected state (tint, label and edge);
- the focus ring.

Only those lines changed; the rest of the hand-tuned file is untouched. The selected tint was made a little richer (`#f6e7d3`) so it sits 9.9 delta E from the sunken grey, so a selected item never looks like a quiet band.

**Ratings, gems and the old ochre tints** joined the brown family, possible because T437 had already taken the fill off the score:
- `--rate` is the umber star.
- `--rate-bg` and `--rate-soft` became neutral, so tips bands, festival tags and the travel-day number no longer look selected.
- Gems are a brown diamond on a neutral ground; plum is retired.

**Colours kept apart from the brown.**
- **Warnings:** the amber inks sat right on top of the brown and turned rust (`#a8400f`, 6.2:1). One of them had been under the floor at 4.25:1.
- **Best value:** its text is ink beside the sun marker, and its tint became clearly yellow.

**Teal everywhere else.**
- **Legacy aliases:** `--ink-fill`, `--accent-soft`, `--accent-wash` and `--wash` now point at umber.
- **Direct teal reads:** the two in the style guide and saved trips are gone.
- **Map:** the colour mirror (`tokenColors.js`) carries the new values. The lower map tier dots moved from ochre to ink shades.
- **Icons and share images:** the logo needle, the favicon, every app and store icon and the static share images are brown.

**Two share-card text overflows (T436-a) are fixed.**
- The site card's subtitle was a catalogue count plus a method line, the copy the owner wants gone. It now reads "Bed, food and local transport for one person, priced town by town across Europe."
- On a beach card, a long reserve name falls back to "Inside a protected area"; the full name moves to the alt text.

**Checks.**
- `token-contrast.mjs` now also checks non-text marks at 3:1: the focus ring, the selected edge, the rating star and the switch track. It also checks the colour distance that keeps warning, best value and the quiet tints apart from the brown.
- `verify_quality_floor.mjs` had two dead checks, because it hardcoded terracotta and the old grey: the one-primary check and the metadata-grey check. Both now read the live tokens. It runs at 390 x 844 and 1440 x 900.

**Written rules.** The carta-design skill, DESIGN.md (frontmatter and prose), PRODUCT.md, the direction contract and impeccable's `design.json` sidecar were rewritten for:
- two base colours;
- the Score as the rating;
- the estimate mark as the whole provenance on a page, and one day-cost basis (the Lifestyle, settling T374-d);
- no catalogue counts or method lines as page furniture, and "say less";
- rails without subtitles, position figures or counts;
- full-width browse pages (the 1180 px cap stays for reading pages);
- a map without number clusters;
- the settings line as a full-width booking bar.

The later tasks build to those rules.

## Files touched

**Modified (app, mirrored in root):**
- continent-app/src/styles/01-tokens.css (umber ramp, roles, aliases, rate, gem, best, warning inks; header)
- continent-app/src/map/tokenColors.js (mirror values; map tier ramp on ink)
- continent-app/src/styles/17-saved-trips.css (direct teal hover read), 24-destination-workspace.css and 25-feature-pages.css (three tint borders)
- continent-app/src/styleguide/StyleGuide.jsx, styleguide.css (primitives list, wording, a radius token)
- continent-app/src/components/Logo.jsx, AppHeader.jsx, BottomNav.jsx, ui/Button.jsx, ui/Tabs.jsx (comments only)
- continent-app/scripts/ci/token-contrast.mjs (marks and distances), scripts/ci/design-lint.baseline.json
- continent-app/scripts/verify_quality_floor.mjs (live token colours, viewports)
- continent-app/scripts/og/tokens.mjs, icons.mjs, cards.mjs, specs.mjs (brown icons, two text fits)
- continent-app/public/favicon.svg, favicon.ico, icon-192.png, icon-512.png, icon-maskable-512.png, icon-maskable.svg, apple-touch-icon.png, og/site.png
- continent-app/brand/store/android/*, brand/store/ios/*, brand/social/site-square.png (regenerated)
- continent-app/.impeccable/surfaces/continent-app.md (direction contract)

**Modified (root):**
- .claude/skills/carta-design/SKILL.md
- DESIGN.md
- PRODUCT.md
- .impeccable/design.json
- Execution/_OPEN.md

**Created (root):** this report.

## Commands run

```
node scripts/ci/token-contrast.mjs                (31 text pairs, 7 marks, 6 distances, 0 under)
node scripts/ci/design-lint.mjs                   (0 new); --update-baseline
node scripts/og/icons.mjs                         (favicon, app icons, store masters)
node scripts/og/static.mjs                        (public/og/site.png, brand/social/site-square.png)
node scripts/og/check.mjs                         (all checks passed; was 2 failures)
npx vite build && npx vite preview --port 5231
node <scratchpad>/sweep.mjs                       (every tab plus My trips and Account, phone and desktop)
node scripts/verify_quality_floor.mjs t438 --port=5231 --only=explore,trip   (31 screens, every floor check passes)
node <scratchpad>/t438sidecar.cjs                 (design.json colours and narrative from the new tokens and DESIGN.md)
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Base colours carrying action and selection | ink plus teal, and ochre and plum for ratings and gems | ink plus brown | two base colours |
| Rules reading a teal primitive directly | 3 (style guide twice, saved trips) | 0 | -3 |
| Teal hex in icons and share images | favicon, maskable icon, 21 app and store icons, 2 share images | 0 | all regenerated |
| Contrast checks | 29 text pairs | 31 text pairs, 7 marks at 3:1, 6 colour distances | +15 |
| Warning text under 4.5:1 (`--amber-warm`) | 4.25:1 | 6.17:1 | fixed |
| Share card check failures (T436-a) | 2 | 0 | -2 |
| Quality floor checks that could not fire (primary, metadata grey) | 2 | 0 | both live again |
| Lint baseline total | 10,160 | 10,158 | -2 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `--rate-soft` failed contrast as "rating as text" | I first pointed it at the border colour, but it is read as text in about 20 rules | It points at `--text-3` (5.2:1); the three tints that used it as a border take `--border` |
| The selected tint and the sunken grey were only 5.4 delta E apart | The first umber 100 was very pale | Umber 100 became `#f6e7d3` (9.9 delta E; brown text on it still 4.8:1) |
| Edits to CRLF files missed their match | The edit helper did not respect line endings | A line-ending-aware helper (scratchpad `ed.cjs`), used for every edit since |

## What is still open

- **T438-a.** Share cards still render in a monospace fallback, because the card renderer has no Figtree file (part of T421-b). Their example panel also carries a provenance note ("Measured from 15,621 stays in this town"), which the owner's rule now removes. Both go in the share-card task.
- **T438-b.** The quality floor's metadata-grey check is live again. It reports 132 texts outside 12 to 14 px and 8 bare figures without tabular numerals on Explore and the trip planner. The per-surface migrations take them.
- **T438-c.** The `--lagoon-*` primitives are still defined, and nothing outside the token file reads them. Delete them, with their DESIGN.md frontmatter and `design.json` entries, once the remaining tasks confirm no reads.
- **T438-d, owner.** Look at the brown on a phone. The values sit in `01-tokens.css` under "Umber" for hand tuning; after a change, run `token-contrast.mjs` and update DESIGN.md.
- **T438-e.** The Explore map still colours dots by tier, with the top tier in the brown rating colour. T441 redraws them as ink dots.

## Rollback procedure

Revert the T438 commits in both repos (app repo `master`, root `main`). That restores the teal tokens, the old icons and share images, and the earlier docs. No data, schema or config changed.
