# Design check (carta-design, seven questions) for the wave 1 copy

New strings, six languages: `plan.lineBedsMissing` "Without beds in {city}", `ask.beforeThere` "before getting there", `saved.pastNotConverted`. No new screen, no new component: the labels ride on existing rows (receipt line, the stay row's sub line, the Ask receipt summary, the past-trip note).

1. Who is it for and does it speak their language? An independent traveller reading a total. Plain words, no jargon, no "estimate" mark (PRODUCT.md: one amount and its unit).
2. Does it keep every function and every number honest? Yes, that is the point: a total that leaves a part out says which part. The figure itself is unchanged (V1).
3. Brown and saffron, no teal, minimal text? No new colour; the Ask note is `--text-2` at `--text-caption`. One short phrase each.
4. Accessible? Text, not colour alone; the missing receipt row keeps the existing `missing` tone plus its words; no new focus targets.
5. Copy rules? No em or en dashes, no exclamation marks, sentence case, six languages (i18nParity passes).
6. Three angles? DOM check at 390, 820, 1440 and a width sweep 360 to 1600 with flag E1 on: `verify-logic-w1.out.txt`, 10 of 10. The lines themselves need a trip with a missing bed price, which the published catalogue does not have; they are pinned in node (`tests/honestTotals.test.mjs`).
7. Does it need a visual change? No; so no screenshots.

Limit: the new lines have not been seen on a real device screen with a real missing bed (no such place in the catalogue today). They show only when flag E1 is `new`.
