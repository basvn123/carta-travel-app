# T816 and T817: Review's total equals the planned trip's, and the summary's airline names

## Shared header

**Date.** 2026-10-29.

**Ask.** The owner, in chat, after the Plan flow v2 report (T809 to T815):
- fix the €22 gap between Review and the summary (row T813-a);
- check the summary's airline codes (row T814-a);
- "if done merge and deploy".

**Task numbers.** T816 and T817. T815 was the highest number in `git log --all` and in every worktree.

**Branch.** Batch branch `p15-plan-flow-v2` (worktree `Portfolio/wt/pf2-batch`), on top of the T809 to T815 report.

**Commits.** T816 is `0ab284a6f`. T817 has no code change.

**Checks.**
- `npm test`: 980 of 980.
- ESLint on the two touched files: 0 errors.
- End walk `wt/pf2-end-walk.mjs` on the rebuilt NOPUBLIC build: 34 of 34 at 390 and 1440 px, no page or console errors. That is the batch's 30 plus a Review-equals-summary total check and an airline-name check, each at both widths.

**Fast build.** The planner hook and the wizard grew a few hundred bytes. No new chunk, no new preload. Not measured separately.

---

## T816: Review's total and the planned trip's are one figure

### What changed
Probe `wt/t816-probe.mjs` printed Review's cost lines and the planned trip's line by line. Only the flight home differed:
- Review priced KL at €262, the flight the trip finder chose.
- The planned trip re-ranked the live answers itself and took SN at €284.

The outward flight matched only because it had been picked by hand (T812's end check fix).

A second probe, `wt/t816-probe2.mjs`, switched the preview to a 3-star hotel and eating out first. That was €420 apart:
- beds €910 against €491.30
- food €848.62 against €884.96

This is row T801-f: the planned trip did not read the stay tier or the eating habits the wizard priced.

At Finish the wizard now hands over three things.
- **The flight it priced each way.** This is the one picked on Getting there, else the one the trip came with. It goes as `flightPicks`, so `useTripPlanner` prices it the same way, keyed by day.
- **Its stay tier.** `loadFromWizard` now applies it.
- **A trip finder trip's eating habits (`lifestyle`).** The planner keeps them as `tripLifestyle` with the app's Lifestyle at the hand-over as its `base`. The planner still follows the app's Lifestyle live (the T432 rule): once the traveller changes the Lifestyle, the app's wins again. A trip built without the finder hands no lifestyle over and reads the app's, as the wizard did.

`clearPlan` resets both new fields, and the draft persists both.

### Files touched
- `continent-app/src/planner/GuidedTripWizard.jsx` (`finish`, `pricedFlight`)
- `continent-app/src/hooks/useTripPlanner.js` (`tripLifestyle`, `loadFromWizard`, `clearPlan`, the draft)

### Commands run
- `node wt/t816-probe.mjs 5820`
- `node wt/t816-probe2.mjs 5820`
- `node wt/pf2-end-walk.mjs 5820`
- `npm test`

### Config and secrets set
None.

### Before/after measurements
| Path | Review | Planned trip before | Planned trip after |
|---|---|---|---|
| The trip as the finder priced it, out flight picked | €1,931.20 | €1,953.20 | €1,931.20 |
| Hotel 3 stars and eat out chosen in the preview | €2,313.56 | about €1,953 (beds and food back to the defaults) | €2,313.56 |

### What broke and how it was fixed
A sed edit had left one CRLF line in `useTripPlanner.js`. The file was normalised to LF, as the repository stores it.

### What is still open
- The preview's figure (€2,322 for the group after the hotel and eat-out swap) and Review's (€2,313.56) still differ by a few euro. This is the finder's per-slot rounding and per-slot swap pricing against the planner's one quote: rows T801-a and T801-b, unchanged.
- No node test covers `loadFromWizard`, which is a React hook. The end walk holds the total check instead.

### Rollback procedure
`git revert 0ab284a6f`. A stored draft's `tripLifestyle` is then ignored.

## T817: the summary's airline names

### What changed
No code. The summary and Getting there read the same airline index, `flights/_index.json` on the data host. In the live file:
- 118 airlines are listed;
- FR is Ryanair, KL is KLM, SN is Brussels Airlines.

The local NOPUBLIC serve runs on localhost, so the page's fetch to the data host fails across origins. The walk files that error under its CORS noise filter, and the summary fell back to the code. Getting there showed "Ryanair" because the fixture's live flight carries `airlineName` itself.

The end walk now serves the live index (saved as `wt/t817-airlines-index.json`). With it the summary reads "Ryanair 06:30 to 13:15" at both widths. The live check after the deploy confirms it on the real site.

### Files touched
`wt/pf2-end-walk.mjs` only (outside the repository).

### Commands run
`curl https://data.carta-europetravel.com/data/flights/_index.json`, then the end walk.

### Config and secrets set
None.

### Before/after measurements
Not measured. No code changed.

### What broke and how it was fixed
Nothing.

### What is still open
Nothing.

### Rollback procedure
None needed.
