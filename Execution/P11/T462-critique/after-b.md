# T462 critique: the home page AFTER the rebuild, reviewer B (technical)

Method: independent technical review of the rebuilt home page. No project file was edited. Sources read in full: `continent-app/src/browse/home/HomePage.jsx`, `HomeDemo.jsx`, `useDemoClock.js`, `src/lib/homeDemo.js`, `src/styles/61-v6-home.css`, the `home.*` keys in all six catalogs, and the T462 diffs of `App.jsx`, `ExploreTab.jsx`, `GuidedSearch.jsx` and `styles.css`. Live checks ran with Playwright (Chromium, from `continent-app/package.json`) against the dev server at http://localhost:5202/ with fresh storage, so the first visit opens the home page. Scripts and raw output sit outside the repo in the session scratchpad (`critique-after-b/probe.mjs`, `keys.mjs`, `extra.mjs`, `credits.mjs`, with `probe.json`, `keys.json`, `extra.json` and screenshots `fold-*.png`, `full-*.png`, `share-360.png`, `scene*-360.png`, `place-1440.png`, `de-fold-*.png`).

Before: 11/20 (`before.md`). After: **16/20**.

## 1. Audit (impeccable `audit.md`)

| # | Dimension | Before | After | Key finding |
|---|---|---|---|---|
| 1 | Accessibility | 2 | 3 | Every text pair passes AA (lowest 5.23:1); focus is visible on every stop; the pause control is the first stop in the carousel and tabs take arrow keys, Home and End. But the kit's `Glyph` icons are `role="img"` with a name, and the home page does not hide them, so 8 accessible names are wrong ("Active Mountains", "Bike Cycling", "Search Search by vibe, place or month", a stray "Cost breakdown" image). |
| 2 | Performance | 3 | 4 | Transform and opacity only; measured 0 running animations off screen (11 paused), 1 to 13 running while it plays; 10 s on screen cost 0.159 s of main thread, 124 style recalcs and 4 layouts; 10 s off screen 0 recalcs and 0 layouts. The page chunk is lazy and prefetched on a first visit; every image is lazy with width and height set. |
| 3 | Responsive | 3 | 3 | No sideways scroll at 360, 390, 768, 1024 or 1440, every phone target at least 44 px, the primary above the bottom nav in English and German. But the Share scene overflows the demo at 360 and is cut on the right, and the stage takes the tallest scene's height, so shorter scenes float in large empty bands. |
| 4 | Theming | 2 | 3 | Tokens throughout (no hex, no font name, no literal duration or easing, no legacy alias); a handful of literal px remain (1180 px, 6 px dot, 2 px rules, 8 px rise, 2 px icon nudge). The app has no dark theme, so nothing to break there. |
| 5 | Implementation integrity | 1 | 3 | Coherent: built from the kit (Card, Tabs, IconButton, Money, ScoreChip, HeroImage), real catalogue figures that agree with Explore, real `<a href>` doors. Isolated issues: the links' `href` drops the state a plain click carries, the demo draws controls that look live but are inert, and the story's every figure is a national estimate. |
| **Total** | | **11/20** | **16/20** | **Good: address the weak spots below.** |

### Implementation integrity verdict

Pass. The page is specific to Carta and executes the written system: one `h1`, one primary, the home page exception used exactly as DESIGN.md "Home page exception (T462)" allows (one looping demo, labels on photos only inside solid `--surface` pills with `--elev-1`), and the demo is assembled from the app's own components fed by `buildDemo()` over the real catalogue rather than a recording or mock-up. The detector finds nothing in the sources. What keeps it from a 4 is a set of small truth gaps: an `href` that says less than the click does, decorative glyphs that speak, demo controls that look pressable, and a credits list that names author and licence for some photos but not others.

### Executive summary

- Score 16/20 (Good), up from 11/20.
- Issues: P0 0, P1 2, P2 6, P3 13.
- Top issues: the Share scene is cut at 360 px; decorative icons garble 8 accessible names; Play pressed with a mouse does not resume the demo until the pointer leaves it; the chips' and tiles' `href` lose the question and the kind on a modifier click; the demo stage leaves large empty bands, most visibly the first thing a phone shows under the tab row.

### Findings by severity

**P0**: none.

**P1**

- **[P1] Share scene clipped at 360 px.** Location: `61-v6-home.css:209-223` (`.home-scenes`, `.home-scene` and `.home-sc` are grids with an implicit `auto` column), with the nowrap content at `:424-444` (`.home-share-link`, `.home-share-url`) and `:481-490` (`.home-pass`). Category: Responsive. Measured at 360: demo 16 to 344 px, `.home-share` 33 to 365 px; the trip name reads "Salzburg, Hallstatt and Zell am Se", the "Link copied" button and the "Trip Pass" tag are cut (`share-360.png`). The CSS header promises "Phone first at 360px". Fix: `grid-template-columns: minmax(0, 1fr)` on `.home-scene` and `.home-sc` (and `min-width: 0` on `.home-share`), let `.home-share-trip` wrap. Command: $impeccable adapt.
- **[P1] Decorative icons are announced and garble names.** Location: `HomePage.jsx:77`, `:81`, `:146`, `:279` (the kit's `Glyph`, `Icons.jsx:341-362`, always renders `role="img"` with an `aria-label` and has no way to opt out). Category: Accessibility. Measured accessible names: kind tiles "Trips Trips", "Trails Trails", "Beaches Beaches", "Lakes Lakes", "Active Mountains", "Bike Cycling"; the search link "Search Search by vibe, place or month"; an image "Cost breakdown" before "See what a day really costs". WCAG 1.1.1 (decorative image not ignored). Fix: wrap each of those icons in `<span aria-hidden="true">`, as the demo already does for its whole stage. Command: $impeccable harden.

**P2**

- **[P2] Play with a mouse does not resume.** Location: `HomeDemo.jsx:310` (`onPointerEnter` sets `hovering`) and `:323` (Play clears `hovering`). Category: Accessibility / implementation. Measured: hover the pause control, click Pause, click Play; the label returns to "Pause the demo" but `data-turning` stays `false` for 6 s and more, and turns `true` only when the pointer leaves. Swapping the glyph under a still pointer makes the browser fire a fresh `pointerover` with no `relatedTarget`, which React reports as a new `pointerenter`, so `hovering` goes straight back to `true`. Fix: on Play, set a `resumedByUser` ref that ignores hover until the next `pointerleave`, or stop hover pausing while the pointer is on the control bar (`.home-demo-bar`). Command: $impeccable harden.
- **[P2] `href` drops the state the click carries.** Location: `HomePage.jsx:287` (try chips: `tabHref('map')`, no `xe`, `xa`, `xm`, `xb`, `xc`), `:71` (kind tiles: `tabHref('places')`, no kind), `:172` ("See all"). Category: Implementation integrity. Measured: all three chips have the same `href` (`?tab=map&d=...`), while a plain click lands on `?xb=80&xe=beach&xc=PT&...&cf=PT`. A Ctrl or middle click, a copied link or a long press "open in new tab" opens Explore with no question, or Destinations on no kind. Fix: build the `href` from the same facets (Explore already reads them from the URL). Command: $impeccable harden.
- **[P2] Empty bands inside the demo.** Location: `61-v6-home.css:209-223` (every scene in one grid cell, shorter scenes centred). Category: Responsive. Measured (scene content of stage height): 390 px search 310 of 505, share 218 of 505; 768 px trip 254 of 543, share 218 of 543; 1440 px share 218 of 494. On a phone the part of the demo that shows in the first screen is the tab row over roughly 150 px of blank card (`fold-390.png`, `de-fold-360x740.png`). Fix: align scenes to the start on phones (`align-content: start`) or cap the stage at the Search and Trip height and let Place crop its photo. Command: $impeccable layout.
- **[P2] The demo draws controls that do nothing.** Location: `HomeDemo.jsx:123-130` (search field), `:133` (result rows), `:177-180` (`.btn` "Add to trip"), `:239-242` (Copy link), with `61-v6-home.css:217` (`pointer-events: none`). Category: Implementation integrity. Measured: a click on the first result hits `DIV.home-scenes`, cursor auto, no link. A visitor who clicks Hallstatt in the demo gets nothing. Fix: make the stage one link to the story's place (or to Explore with the story's question), or drop the kit's button shape from the drawn "Add to trip". Command: $impeccable clarify.
- **[P2] The showcase for "honest prices" is all estimates.** Location: `homeDemo.js:18-24` (STORY). Category: Implementation integrity. Measured: Hallstatt "~€113 est. a day", Zell am See "~€87 est.", Lake Bled "~€77 est.", every trip line and the total "~€714.68 est.". It is labelled honestly, but the one story the page tells never shows a measured figure. Owner call: pick towns with city level bed and food, or keep and accept. Command: $impeccable clarify.
- **[P2] The `h1` breaks into three lines.** Location: `61-v6-home.css:775` (hero split `5fr / 7fr` from 1024 px) and the German string. Measured: 3 lines at 1024 x 768 ("Plan any trip in / Europe, with / honest prices"), 3 lines in German at 360. Fix: split at 1180 px, or `minmax(0, 6fr) minmax(0, 6fr)` between 1024 and 1279 px. Command: $impeccable typeset.

**P3**

- **[P3] Focus order runs right to left in the demo bar.** `61-v6-home.css:185` puts the pause control (DOM first, correct for WCAG 2.2.2) at the far right; measured focus goes Pause at x 1238, then the Search tab at x 653. Consider placing the control at the start of the bar so DOM and visual order agree. $impeccable polish.
- **[P3] Every slide reads the same sentence.** `HomeDemo.jsx:355`: the tabpanel's only accessible content is one summary, so picking "Share" announces the same paragraph as "Search". Give each scene its own one-line sentence. $impeccable clarify.
- **[P3] Duplicate names.** `HomeDemo.jsx:306` and `:330` both use `home.demoLabel` for the carousel region and the tablist. Name the tablist "Scenes". $impeccable clarify.
- **[P3] `go()` on the shown scene does not start it over.** `useDemoClock.js:39-42` resets `remaining`, then the timer effect's cleanup (`:35`) subtracts the elapsed time from the new value because `index` did not change; the doc comment at `:15` says it "starts it from the top". The CSS does not restart either. Harmless today (a pick also stops turning). $impeccable harden.
- **[P3] Mixed month abbreviations.** `HomeDemo.jsx:91` (`month: 'short'`) renders "Best in May, Jun, Jul, Aug and Sept" in English. $impeccable typeset.
- **[P3] "€0.00" for the free tier.** `HomePage.jsx:200`. Show "Free" alone or "€0". $impeccable clarify.
- **[P3] Under-resolved kind photos on tablets.** `HomePage.jsx:75` `sizes="(max-width: 768px) 46vw, 190px"`; at 900 px the tile draws 276 px from a 250 px file. Add a `(max-width: 1023px) 31vw` step. $impeccable optimize.
- **[P3] Credits are uneven.** `HomePage.jsx:225-227`: journey heroes credit author and licence ("Trail above Zermatt, Roy Egloff, CC BY-SA 4.0"), catalogue photos only the place name ("Lake Como", "Hallstatt", "Salzburg"). Same as elsewhere in the app, but here the two styles sit in one list. $impeccable polish.
- **[P3] Cross-fade ghosting.** `61-v6-home.css:218`: outgoing and incoming scenes overlap at partial opacity, so for `--dur-3` two layouts read through each other (caught in `fold-1440.png`: "Hallstatt" over "Lake Bled"). Fade the outgoing scene out faster or out before in. $impeccable animate.
- **[P3] A stale open request can pop the search later.** `ExploreTab.jsx:796-807` and `:828`: `openRequest` is cleared only when the field for the current width mounts and opens. If it never does (the visitor leaves Explore before the header slot renders, or the width class changes), the panel opens the next time Explore is shown. Clear it when `isActive` turns false. $impeccable harden.
- **[P3] Literal values.** `61-v6-home.css:33` (1180 px), `:197` and `:405` (2 px), `:466-467` (6 px), `:561` (8 px), `:664` (2 px), letter-spacing at `:44` and `:69`. $impeccable polish.
- **[P3] Doc drift.** DESIGN.md "Home page exception" describes "Sections reveal once on entering the viewport"; no reveal is built. Either is fine; the record and the code should agree. $impeccable document.
- **[P3] No `main` landmark and no skip link** in the shell, so the home page's regions sit outside any `main`. Shell scope, not T462. $impeccable harden.

### Patterns

- Kit glyphs speak by default (`Glyph` in `Icons.jsx`), so every new surface that puts an icon next to its own words garbles the name. A `decorative` prop on `Glyph` would fix it app wide; that is a separate task outside T462's files.
- Links are real `<a>` everywhere (good), but the `href` is a generic tab URL while the click handler carries the state. The same gap will recur wherever `door()` is used.

### Positive findings

- Headings in order (one `h1`, `h2` per section, `h3` per feature), labelled regions, the demo hidden from assistive tech with a sentence in its place.
- Contrast: kind pills and the price pill are `--text` on solid `--surface`, 14.61:1, independent of the photo; the weakest pair on the page is `--text-3` on `--surface-page`, 5.23:1.
- WAI-ARIA carousel done properly: pause first, rotation stops on hover, on focus and on a pick, and does not resume after a pick until Play; reduced motion shows the Trip scene with no pause control and 0 running animations.
- The clock is accurate and holds its remainder: measured scene changes at 5,037, 5,508, 4,504 and 4,515 ms against 5,000, 5,500, 4,500 and 4,500; off screen for 6 s it held "Search" and resumed with the 2.2 s left.
- No console errors or page errors at any width, in the hand-off, or under reduced motion.
- The seed hand-off works on desktop and phone: the search field opens Explore with the guided sheet open and the input focused; the second chip lands on `xb=80&xe=beach&xc=PT`, with no sheet; Back returns to the home page.
- Word count down from 613 to 435, catalogue counts gone, six photo tiles where there were none.

### Recommended actions

1. [P1] `$impeccable adapt`: fix the Share scene's overflow at 360 (minmax(0, 1fr) columns, wrap the trip name).
2. [P1] `$impeccable harden`: hide the decorative icons on the home page; fix Play under a still mouse; carry facets and kind in every `href`; clear a stale open request.
3. [P2] `$impeccable layout`: remove the empty bands in the demo stage, phone first.
4. [P2] `$impeccable clarify`: make the demo's drawn controls either live or plainly pictures; owner call on an all-estimate showcase; one sentence per slide.
5. [P2] `$impeccable typeset`: keep the `h1` to two lines at 1024 and in German at 360; month abbreviations.
6. [P3] `$impeccable polish`: focus order in the demo bar, literal px, credits, "€0.00".

## 2. Detector

Source scan, from the repo root:
`impeccable detect --json continent-app/src/browse/home/HomePage.jsx continent-app/src/browse/home/HomeDemo.jsx continent-app/src/browse/home/useDemoClock.js continent-app/src/lib/homeDemo.js continent-app/src/styles/61-v6-home.css`
Result `[]`, exit 0. Repeated with `--no-config`: `[]`, exit 0.

Live URL scans (the CLI supports URLs; `--viewport` set): `detect --json --viewport 390x844 http://localhost:5202/` and `--viewport 1440x900`. Exit 2 at both, 3 warnings each, identical:

- `clipped-overflow-container` x2 ("div clips a positioned child", "div.app clips a positioned child"): the app shell. Not this page. Note that `.home-demo` (`overflow: hidden`) and `.home-place-photo` also clip positioned children by design (the price pill sits inside the photo); the detector did not flag them, and they are intended.
- `layout-transition` (`transition: height`): no element of the home page carries a height transition (the home CSS transitions only `opacity`, `transform`, `border-color` and `background-color`); it comes from a shell or kept-alive tab component (Explore is mounted behind the home page from the first render, `App.jsx:450`).

Compared with before: the two `tiny-text` warnings are gone (the 11 px receipt "est." was removed with the old page); the three remaining warnings were shell level before and still are. The home page itself is detector clean at source and live.

## 3. Web Interface Guidelines (vercel-labs, command.md)

## continent-app/src/browse/home/HomePage.jsx

continent-app/src/browse/home/HomePage.jsx:77 - decorative icon not aria-hidden (Glyph role="img" named; tile name doubles)
continent-app/src/browse/home/HomePage.jsx:81 - decorative icon not aria-hidden; link names "Active Mountains", "Bike Cycling"
continent-app/src/browse/home/HomePage.jsx:146 - decorative icon announced as "Cost breakdown"
continent-app/src/browse/home/HomePage.jsx:279 - decorative SearchIcon in link name: "Search Search by vibe, place or month"
continent-app/src/browse/home/HomePage.jsx:71 - URL does not reflect state: href lacks the kind the click applies
continent-app/src/browse/home/HomePage.jsx:287 - URL does not reflect state: href lacks xe/xa/xm/xb/xc; Cmd/Ctrl/middle click opens a bare Explore
continent-app/src/browse/home/HomePage.jsx:172 - same: "See all" href lacks the question
continent-app/src/browse/home/HomePage.jsx:173 - non-specific label "See all" (name the set: the question)
continent-app/src/browse/home/HomePage.jsx:137 - door "My trips" under "Share it with friends" opens an empty overlay for a first visitor; label does not say what it does
continent-app/src/browse/home/HomePage.jsx:75 - sizes misses 769 to 1023 px (3 columns drawn ~276 px, sizes says 190px)
continent-app/src/browse/home/HomePage.jsx:167 - heading level: proof h3 followed by Card h3 titles at the same level (cards are its children)
continent-app/src/browse/home/HomePage.jsx:200 - "€0.00" for a free tier
continent-app/src/browse/home/HomePage.jsx:236 - target="_blank" with no new-tab cue in the name

## continent-app/src/browse/home/HomeDemo.jsx

continent-app/src/browse/home/HomeDemo.jsx:310 - hover pause re-arms after Play under a still pointer; Play does not resume (interruptible-motion rule)
continent-app/src/browse/home/HomeDemo.jsx:330 - tablist aria-label duplicates the region label at :306
continent-app/src/browse/home/HomeDemo.jsx:355 - same accessible description for all four slides
continent-app/src/browse/home/HomeDemo.jsx:177 - drawn button (.btn) with no action; looks interactive (also :123 field, :133 rows, :239 Copy link)
continent-app/src/browse/home/HomeDemo.jsx:238 - brand domain "carta-europetravel.com" needs translate="no"
continent-app/src/browse/home/HomeDemo.jsx:91 - Intl month 'short' gives "Jun" beside "Sept" in English
continent-app/src/browse/home/HomeDemo.jsx:54 - matchMedia listener with no addListener fallback (old Safari keeps the first value)

## continent-app/src/browse/home/useDemoClock.js

continent-app/src/browse/home/useDemoClock.js:39 - go(current index) does not restart the scene; the cleanup at :35 subtracts elapsed time from the fresh value (doc at :15 says it starts from the top)

## continent-app/src/lib/homeDemo.js

✓ pass (pure; Intl not needed, money formatted by callers)

## continent-app/src/styles/61-v6-home.css

continent-app/src/styles/61-v6-home.css:212 - grid item with implicit auto column; Share scene overflows at 360 (needs minmax(0, 1fr))
continent-app/src/styles/61-v6-home.css:222 - shorter scenes centred in the tallest one's height: empty bands
continent-app/src/styles/61-v6-home.css:121 - horizontal chip scroller without overscroll-behavior-x: contain (edge swipe can trigger back navigation)
continent-app/src/styles/61-v6-home.css:185 - order: 2 makes visual order differ from focus order
continent-app/src/styles/61-v6-home.css:218 - cross-fade overlaps two layouts at partial opacity
continent-app/src/styles/61-v6-home.css:775 - 5fr text column sets a three-line h1 at 1024 px

Rules checked and passed: icon-only buttons named (IconButton `label`), no form controls on the page, `<a>` for navigation and `<button>` for actions (pause, Compare passes, My trips), images have `alt=""` with width and height and `loading="lazy"`, focus rings on every stop via `:focus-visible` (cards draw it on the card through `:has()`), no `outline: none`, no `transition: all`, transforms and opacity only, SVG stops use `transform-box: fill-box; transform-origin: center` (`:378`), reduced-motion branch present (`:784-792`) and enforced in JS, autoplay over 5 s has a pause control, `text-wrap: balance` on headings, `.money` uses `tabular-nums` (`04-ui.css:289`), `min-width: 0` on flex and grid children in the hero and rows, Intl used for lists and months, safe-area inset on the bottom padding, no `autoFocus`, no layout reads during render, theme-color meta matches the page ground (`#f6f5f2`).

## 4. taste-skill tells (`references/tells.md`)

Carta's own tokens, faces and kit win; nothing below suggests a new font or colour.

Present:
- **Thin rules and 1 px outlined boxes (banned, boxes 3 or more).** Hairlines between the four feature rows (`61-v6-home.css:655`, `:662`), three outlined pass cards (`:704`), three outlined place cards (kit Card), the outlined demo frame, field and chips. Carta's `--border` and the kit Card are the written system, so this stands; but the page stacks four outlined treatments, and the pass cards could take a tone step (`--surface` on `--surface-page` without a border) per DESIGN.md, which is a Carta choice, not a new one.
- **Feature section as icon plus title plus line, repeated (first-wave tell, softened).** Four identical rows of icon, `h3`, sentence and door (`HomePage.jsx:143-164`). It is offset by the real priced places beside it, which is the strongest thing in that section.
- **Stock section order (no rule).** Hero, kinds, features, pricing, footer. The kinds row in second place breaks the template somewhat.
- **Headline as a full sentence at display size over two lines (banned over two lines).** Three lines at 1024 px and in German at 360 px; two lines elsewhere.
- **Identical fade-up inside the demo (motion tell).** `home-rise` drives results, pill, receipt lines, sum, note and share rows (`:498-548`). It is confined to the demo and each scene also has its own move (typing, route draw, copy swap), so this is mild.
- **Decorative status dot (lint).** `.home-dot` beside "Link copied" (`:465-470`); it carries meaning (success) and is small, so borderline.
- **Many near-equal small sizes (warned over 9).** Measured nine sizes: 11.9, 12, 13, 13.6, 14, 16, 20, 28, 40 px; five of them between 11.9 and 14 px. At the threshold, not over it.

Absent (checked): violet or neon gradients, gradient text, glass, soft shadow under every card, emoji icons, eyebrow kickers, pill badge above the headline, italic accent word, floating blurred nav, fake dashboard (the demo is real parts and real data), cream plus terracotta (the brown is Carta's locked action token), monospace labels, index numbering, design-tool chrome, agency micro-meta, tiny tracked capitals, everything centred (left anchored), invented social proof, banned copy verbs, em dashes.

## 5. Live checks (Playwright)

### Keyboard walk (1440 x 900, fresh visit)

Order after the shell header: search field, three chips, Plan a trip, Pause the demo, Search tab, six kind tiles, Explore, Hallstatt, Trip planner, My trips, three place cards (ring drawn on the card), See all, Compare passes, Photo credits, then back to the document. 23 home stops, every one with a visible 2 px `--focus` ring, no trap, no off-screen focus. One oddity: Pause sits at x 1238 and the next stop at x 653 (P3 above).

Carousel:
- Focus on Pause: rotation stops (`data-turning=false`), label still "Pause the demo" (APG allows it).
- Enter: frozen, label "Play the demo". Enter again: turning, label "Pause the demo".
- Tab from Pause lands on the selected tab only (roving tabindex). ArrowRight to Place, End to Share, Home to Search, ArrowLeft wraps to Share; each pick stops rotation and the control offers Play. 7 s later, focus moved on, still on Share: a pick is not undone by leaving (APG).
- Mouse: hover stops turning and leaving resumes it. Pause then Play with the pointer on the control: does not resume (P2 above).

### Headings

H1 "Plan any trip in Europe, with honest prices"; H2 "Pick what the trip is for"; H2 "Plan it from the first idea to the last day" with H3 x4 features, H3 "Lakes in the Alps in July", H3 Hallstatt, Zell am See, Lake Bled (Card titles); H2 "Plan for free, pay when you need more". Same at every width. Pass names in the pricing cards are not headings (acceptable inside a list).

### Accessible names

Correct: chips, Plan a trip, Pause/Play the demo, tabs, tabpanel named by its scene, region "How Carta plans a trip", place cards, Compare passes. Wrong: the 8 names listed under the P1 icon finding.

### Contrast (text over the photo pills and the small text)

| Pair | Ratio |
|---|---|
| Kind label `--text` on `--surface` pill (on photo) | 14.61:1 |
| Price pill figure `--text` on `--surface` (on photo) | 14.61:1 |
| Price pill unit "a day" `--text-3` on `--surface` | 5.70:1 |
| "Try", "a day", trade line, `--text-3` on `--surface-page` | 5.23:1 |
| Search field text `--text-2` on `--surface` | 8.15:1 |
| "Trip Pass" tag `--text-2` on `--surface-sunken`, 12 px | 7.02:1 |
| Line note, receipt head, pass notes, `--text-3` on `--surface` | 5.70:1 |

All pass WCAG AA; the pills are solid, so the photo never affects the ratio.

### Layout

| Width | Sideways scroll | Page height | Phone targets under 44 px | Notes |
|---|---|---|---|---|
| 360 x 844 | none | 3,322 px | 0 | Share scene overflows the demo by 21 px and is cut; 2 of 3 chips off the scroll row (cut chip is the cue) |
| 390 x 844 | none | 3,265 px | 0 | CTA ends at 378, nav at 758; demo top band blank about 150 px |
| 768 x 1024 | none | 3,559 px | 0 | Single column; trip scene 254 of 543 stage height |
| 1024 x 768 | none | 1,942 px | n/a (fine pointer, 32 px chips and doors, at least 24 px) | `h1` three lines |
| 1440 x 900 | none | 1,966 px | n/a | Clean two column hero; share scene 218 of 494 |
| de 360 x 740 | none | | | CTA 412, nav 654; `h1` three lines |
| de 390 x 664 | none | | | CTA 378, nav 578 |

### CPU and animations (1440 x 900)

- Playing, sampled each second for 10 s: 1 to 13 running animations, all inside `.home-demo`, none elsewhere.
- Scrolled off screen: 0 running, 11 paused, `data-paused=true`.
- Main thread over 10 s: on screen 0.159 s task time, 0.013 s script, 124 style recalcs, 4 layouts; off screen 0.085 s task time (idle baseline), 0 recalcs, 0 layouts.
- Reduced motion: Trip scene, no pause control, 0 running animations.

### Console

0 errors, 0 page errors at 360, 390, 768, 1024, 1440, in the keyboard run, in the CPU run, under reduced motion and through both hand-offs.

### Code read: logic

- `useDemoClock.js:22-37` timer accounting is correct: on a scene change React runs the timer cleanup (subtracting elapsed time from the old scene) before the reset effect sets the new duration, so the order comment at `:22-24` holds. Measured timings confirm it (above). StrictMode (enabled, `main.jsx:23`) mounts, cleans and remounts the timer effect within a millisecond, so `remaining` loses about 0 ms. Only flaw: `go()` on the shown index (P3).
- `HomeDemo.jsx:61-71` `useOnScreen` starts `true` and corrects on the observer's first callback; the observer uses the viewport root, which clips by the `.home-page` scroll container, so off screen works (measured). A stage taller than about 2.8 viewports would never reach the 0.35 ratio; not reachable at the sizes measured (stage 444 to 543 px).
- `HomeDemo.jsx:278-282` the reduced-motion jump runs once through a ref, safe under StrictMode.
- `HomeDemo.jsx:48-81` every listener and observer is removed on cleanup; `HomePage.jsx:256-260` guards the journey fetch with a `live` flag. No leak found. `loadGuidedData` is memoised (`guidedData.js:17-24`), so warming on every hover is free.
- `ExploreTab.jsx:796-807` seed hand-off: applies the facets with `replace`, resets paging, raises an open request, and consumes the seed; App clears it (`App.jsx:590-596`) and spreads a new object per hand-off, so the same chip twice still applies. Under StrictMode the effect runs twice with the same seed; `applyGuided(..., true)` is idempotent, so no visible double effect. Explore is mounted from the first render (`App.jsx:450` seeds `visitedTabs` with `'map'`), so the effect runs in the same commit as the tab switch. Gap: a stale `openRequest` (P3).
- `GuidedSearch.jsx:74-78` opens once per request and reports back; deps are stable (`clearOpenRequest` is a `useCallback`).
- `homeDemo.js:166-170` line amounts are integer cents times nights, so the sum is exact (measured 201.62 + 338.46 + 174.60 = 714.68).

## Prioritised fix list

1. **[P1] Share scene cut at 360 px.** `61-v6-home.css:209-223`: `grid-template-columns: minmax(0, 1fr)` on `.home-scene` and `.home-sc`, `min-width: 0` on `.home-share`, allow `.home-share-trip` to wrap.
2. **[P1] Hide decorative icons.** `HomePage.jsx:77`, `:81`, `:146`, `:279`: wrap in `aria-hidden="true"`; names become "Mountains", "Cycling", "Search by vibe, place or month".
3. **[P2] Play must resume under a still mouse.** `HomeDemo.jsx:310`, `:323`: ignore hover after Play until the next pointer leave, or exempt `.home-demo-bar` from hover pausing.
4. **[P2] Put the state in the `href`.** `HomePage.jsx:287`, `:71`, `:172`: chips and See all carry the guided facets; kind tiles carry the kind.
5. **[P2] Close the empty bands in the demo.** `61-v6-home.css:209-223`: start-align scenes on phones, or bound the stage to the Search and Trip height.
6. **[P2] Make the demo honest about clicks.** `HomeDemo.jsx:123-180`, `:239`: one link on the stage to Hallstatt or to Explore with the question, or drop the button shape from drawn controls.
7. **[P2] Owner call: the showcase is all estimates.** `homeDemo.js:18-24`: choose towns with measured bed and food, or accept the "est." throughout.
8. **[P2] Two-line `h1` at 1024 and in German at 360.** `61-v6-home.css:775`.
9. **[P3] Focus order in the demo bar** (`:185`), one sentence per slide (`HomeDemo.jsx:355`), tablist name (`:330`), `go()` restart (`useDemoClock.js:39`), stale open request (`ExploreTab.jsx:796`), month abbreviations, "€0.00", kind tile `sizes`, credits with author and licence, cross-fade ghosting, literal px, `overscroll-behavior-x` on the chip row, `translate="no"` on the domain, DESIGN.md reveal line.
