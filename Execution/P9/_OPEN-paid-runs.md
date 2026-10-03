# Paid runs, last in the order

Written 2026-10-03 by the wave orchestrator on the owner's instruction: everything that costs money goes to the back, after all free work. These are the register rows that spend real money on Gemini calls, and the steps that only make sense after them. Each row in `Execution/_OPEN.md` carries "LAST (paid, see Execution/P9/_OPEN-paid-runs.md)" in its Order cell and keeps its own ordering note after that.

Nothing here can start before stage 3 of `Execution/_OPEN-MASTER.md` (the Gemini setup and the billing proof, T259). Every run takes a spend cap: `--max-usd` on the generator and the expansion module, `--limit` on the backfill.

## The order

1. Stage 3 done, and the billing proof (T259) shows a spend cap that holds.
2. T153-b: add the `GEMINI_API_KEY` repository secret, only if the golden-set run is dispatched from CI. This costs nothing by itself.
3. T144-a with T145-a: one measured generator run on three to five briefs, which also gives the critic its first real calls. Read `cost` and the critique files (Execution/P9/T144-three-pass-generation.md, Execution/P9/T145-adversarial-critic.md).
4. T145-b: decide whether the critic runs on a different model (`--critic-model`). A decision, no spend.
5. T153-a: the first golden-set baseline, about 40 calls (Execution/P9/T153-golden-set.md), then `bless` and commit `golden/baseline.json`.
6. T323-b: about 30 live grounded calls to measure the search fan-out the cost table depends on (Execution/P2/T323-edge-function-followups.md).
7. T150-a, then T150-d: the packing and risk backfill. Start with `run --limit 5`, then the rest under `--max-usd`. T150 estimated USD 1.5 to 3.4 for all 253 trips before retries, as arithmetic from its price table, not a measurement (Execution/P9/T150-packing-and-risk-backfill.md). T150-d is reading a sample of the output.
8. T152-a, then T152-b: rewrite the 236 over-cap catalogue trips under the word caps (Execution/P9/T152-prose-caps.md).
9. T155-a, then T155-c: the catalogue expansion. T155-b (reading and editing the 60 wave-1 briefs) is free and comes first. T155 estimated EUR 15 to 27 for wave 1, and EUR 85.50 to 153.90 to fill every open cell (Execution/P9/T155-catalogue-expansion.md).

Wave 17 in `Execution/_WAVES.md` (T147 to T149, the fact store and the fill-mode pass) also spends on Gemini once stages 2 and 3 are done; it is gated already and stays after this list.
