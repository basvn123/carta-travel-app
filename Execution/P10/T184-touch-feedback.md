# T184 Visible feedback inside 100 ms, on touch, before data

## Task ID

T184 (mind-map number T188)

## Date

2026-10-03

## What changed

Every control a finger can land on now changes the moment it is touched. The rule lives in `src/styles/02-base.css` as one `:active` block. It applies to buttons, links, summaries, labels, ARIA buttons, tabs and switches, checkboxes and radios, and anything focusable by `tabindex="0"`. A pressed control drops to 78 percent opacity (the shade shift) and compresses to 98 percent through the individual `scale` property. `scale` was chosen over `transform` so the press composes with any transform a rule already sets. A centred or rotated control would otherwise jump when the press rule replaced its transform. The press transition is 60 ms. Four existing rules, on the header pricing button, the bottom nav items and the plus button, set 150 to 200 ms transitions, which is too slow to count as feedback, and the press duration now overrides them while a finger is down. Release keeps the old duration. Under `prefers-reduced-motion` the shade shift stays and the compression and the transition are dropped.

Sliders get their own rules, because scaling the whole input would move the track under the thumb. The thumbs on the dual range and the single range grow to 1.3 times and take the `--accent-bg` fill while held. The trip length slider uses the native thumb, so its input dims and the value in its label turns `--accent`.

Two things CSS cannot do are in the new `src/lib/touchFeedback.js`, installed from `src/main.jsx`. iOS Safari only applies `:active` once a touchstart listener exists on the page, so a passive no-op one is registered on the document. The module also sends a short haptic tick (`navigator.vibrate(8)`) on touch for controls that flip a state: anything with `aria-expanded`, `aria-pressed` or `role="switch"`. That covers fold chevrons and toggle chips. It does nothing on iOS, where `vibrate` does not exist, and nothing under reduced motion.

The blueprint calls 100 ms the Doherty threshold. It is not: 100 ms is the older "feels instantaneous" bound, and Doherty and Thadhani (1982) is 400 ms. Neither the code nor this report relies on the attribution.

## How it was measured

`scripts/perf/touch_feedback_T184.mjs` opens three screens on a phone profile (390 by 844, touch): the Destinations tab, a destination page (`#dest=gem:valbona`) and a trip page (`#itin=at-salzburg-vienna-chain-6d`), with folds opened so their contents exist. It collects the visible controls, groups them by tag plus first class, and takes two per group. For each one it forces `:active` through the DevTools protocol, so no handler runs and no data is needed, and compares the computed style of the control and its direct children (and the slider thumb pseudo-element). It also reads the transition time on the properties that changed. A control with no change "does not respond". A control whose change takes longer than 100 ms is "slow".

Run against a Vite dev server on port 5209. Results are in `continent-app/reports/touch_feedback_T184_before.json` and `touch_feedback_T184.json`. The laptop had under 1 GB free, so everything was taken on a loaded machine. The counts are style comparisons and do not depend on speed.

## Files touched

Modified (continent-app): `src/styles/02-base.css`, `src/main.jsx`.
Created (continent-app): `src/lib/touchFeedback.js`, `scripts/perf/touch_feedback_T184.mjs`, `reports/touch_feedback_T184.json`, `reports/touch_feedback_T184_before.json`.
Root: this report and the register rows.

## Commands run

```
cd wt/T184-app
npx vite --port 5209 --strictPort
BASE=http://localhost:5209 node scripts/perf/touch_feedback_T184.mjs
node scripts/ci/design-lint.mjs
```

## Config and secrets set

None.

## Before/after measurements

Control groups across the three screens, source `reports/touch_feedback_T184*.json`.

| Metric | Before | After | Delta |
|---|---|---|---|
| Control groups audited | 59 | 59 | 0 |
| Groups with no change on touch | 47 | 0 | -47 |
| Groups that respond but slower than 100 ms | 12 | 0 | -12 |

Before, the groups that did not respond included the fold toggles, the category and class chips, the destination and trip cards, the back and share bars and the trip length slider. The slow groups were the header pricing button, the four bottom nav items and the plus button.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Trip length slider still reported no response after the first pass | The press rule changed the label but not the input itself, which is what the audit inspects | `.trip-slider-input:active` dims the input as well |

## What is still open

The audit forces the pseudo-class. It proves the style changes and how long the transition is, not that a real finger on a real phone sees it within 100 ms, nor that the haptic fires. That needs a check on an iPhone and an Android phone (T184-a, owner). Clickable elements that are plain divs with a JS handler and no pointer cursor, role or tabindex are invisible to both the CSS and the audit; a sweep for them is T184-b. Four controls had their own `:active` compression already (bottom nav, plus button, cost action, guide cards), so they now compress twice (0.95 times 0.98). Nothing looks wrong with that, but a task that touches those rules could remove the duplicate (T184-c).

## Rollback procedure

Revert the app commit on `p10-g1-feedback-100ms`. No data, schema or dependency was changed.
