# T097: Publish the accuracy figure in the product

## Task ID

T097 (mind-map number T332).

## Date

2026-10-03

## What changed

The destination page now carries a measured accuracy figure. Under the cost receipt, after the provenance lines, there is one underlined line: "Our food prices land within EUR 6 a day for 88% of destinations. How we measured it." Clicking it opens a short paragraph with the date, the sample, the method, the country-level interval and a plain statement of what is not claimed. It is a native details element, so it works without script, takes the keyboard and has a 44px touch target.

Only the food figure is published, as register row T096-d asked. It comes from tools/benchmark/results/2026-10-01.md, section "Food per person per day, country baskets": 88.2% of 2,673 destinations in 24 countries within EUR 6, with a 95% interval of 79.4% to 93.2% when countries are resampled. The product rounds to 88%, 79% and 93%, and quotes the country interval because that is the honest one: destinations in one country share a basket, so they are not independent. The paragraph says the test is about how food prices differ between countries, not the exact level in one town, because that is what a leave-one-out comparison against Eurostat's price level index can show. It also says, without a number, that no bed accuracy is published yet. The stay hold-out was 12 towns in 3 countries (T096-a), too small to quote, so the weekly headline stays unpublished.

The figure lives in one place, src/lib/accuracy.js, with the source file and section named in its header comment. CostReceipt reads it through accuracyVars, which formats the run date in the reader's language. The text is two new i18n keys, cost.accuracy and cost.accuracyMethod, in all six languages, with the figures as template variables so a re-run changes one file. The explore card receipt is compact and does not show the line.

I checked the page at 380px and 1280px against the dev server: the line wraps cleanly, no horizontal scroll, the paragraph opens in place.

## Files touched

Modified, app repo (branch p5-publish-accuracy):
- src/components/CostSummary.jsx
- src/browse/DestinationPage.jsx (passes lang to the receipt)
- src/styles.css (.cost-accuracy block, existing tokens only)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (two keys each)

Created, app repo:
- src/lib/accuracy.js

Modified, root repo:
- Execution/_OPEN.md

Created, root repo:
- Execution/P5/T097-publish-accuracy-figure.md

## Commands run

```
npx eslint src/components/CostSummary.jsx src/lib/accuracy.js src/browse/DestinationPage.jsx
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npx vite --port 5209 --strictPort     (playwright screenshot of #dest=CDG at 380 and 1280 wide; server stopped)
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Accuracy figures visible in the product | 0 | 1 (food, 88% within EUR 6, country interval 79% to 93%) | +1 |

The 88% itself is not a new measurement; it is the T096 figure of record.

## What broke and how it was fixed

A sed pass stripped the CRLF line endings of fr.js (7,900 lines showed as changed); I restored CRLF and the diff is 2 lines per language file. Eslint reports two warnings in CostSummary.jsx, an unused Icon argument that was there before.

## What is still open

The figure is a constant copied from a dated result file, so a re-run of the benchmark must update it (T097-a). The bed and weekly figures wait for the owner's hand-priced stays (T097-b, behind T096-a). The Explore card and the account FAQ do not carry the figure; whether they should is a product call (T097-c).

## Rollback procedure

In the app worktree or on master, revert the T097 commit (git revert). It adds one file and edits no data, schema or route, so nothing else needs undoing.
