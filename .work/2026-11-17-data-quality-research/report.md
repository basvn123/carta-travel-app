# Run report · Data quality research (D2, D6, D7, D9, D10, D15, D17, D23, D24)

Status: done. Output: `docs/research/2026-11-17-data-quality.md`.

## What was asked
Deep research on the quality of the data Carta shows: destination completeness and a way to keep it complete; whether lakes, routes and trails are finished (clean names, clean routes, missing items, images); what data would make Explore text feel custom and hand-written; other gaps; all related ROADMAP items. The report is the hand-off for the later session that merges it with the app logic audit and the Ask Carta and Gemini runs.

## What ran
- Five explorers, one per area: destinations, trails and routes, lakes/beaches/mountains, editorial voice, other gaps (`explore-*.md`).
- Three critics: sources and measurement, coverage and ROADMAP, executability (`critique-*.md`).
- One reconciliation pass: the launch gate on the top 300 places and the top-band trails, and one canonical number per metric (`explore-gate-and-reconcile.md`).
- Synthesis into the research document, with a six-wave execution plan.

## Headline findings
- **Live incident:** the box published its own place build to production on 2026-11-13 (its publish step skips the contract check). Production shows measured bed prices on 243 places instead of 3,353, and 591 places with a dorm dearer than a 3-star hotel.
- Destinations: famous places about 97% in; second tier 69 to 93%; about 100 expected towns missing (Sirmione, Monteriggioni and Aigues-Mortes were found by the pipeline in September and never added).
- Trails: nothing from November on the wire; 20.4% photo, 1.4% summary, 22.6% unclean names; the committed name fix would damage about 1,200 names and must be repaired before the 2027-01-16 quarterly run.
- Outdoor: Lake Garda missing; sea temperature on 0 beaches; mountain route up 19%.
- Text: generic because each slot is written from too few facts; a sourced `editorial` block, written offline and judged, is the fix.
- Other: 28 to 30 wrong hero photos live; 3,769 must-sees filed as "Square"; 299 must-sees are battles or bombings; the quality gate passes through all of it.

## Verification
- The judge stopped at the session usage limit before scoring, so the orchestrator ran the checks. `check_entry_points.py`: OK, 298 paths. `drift.py`: 0 drift.
- Eight claims verified on the data:
  - Lake Garda Q6414 is absent from `lakes/IT.json`.
  - 0 of 6,618 beach rows carry `sea_temp`.
  - `gem:seborga` and `gem:seborga-it` both exist, and so does `gem:moncontour-fr`.
  - The `gem:tiverton` hero is the official Keir Starmer portrait.
  - Sirmione is absent.
  - The box master has 243 measured and 3,544 modelled beds.
  - `run_pipeline.sh` runs `push-data.mjs --live`.
- The sources critic checked 18 claims: 12 held as stated and the 6 wrong ones are corrected in the document.
- Not done: a full rubric scoring by an independent judge. Resume it with the saved judge agent after the limit resets if wanted.

## Files changed
- `docs/research/2026-11-17-data-quality.md` (new).
- `.work/2026-11-17-data-quality-research/` (run folder; only this report is tracked).
- `.work/INDEX.md` (one line).

`.work/.active` was not overwritten: it belongs to another active session.

## Notes
- During the run, the trails explorer overwrote the destinations explorer's `scripts/famous_check.py`. Its output `famous_check.csv` survives; rebuild the script before using the list as a gate seed.
- Undo: `git revert` of the commit that adds these files. No code or data changed.
