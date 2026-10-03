# T191: Shared design tokens, and modularise styles.css

## Task ID

T191 (mind-map number T344). Branch p10-tokens-modular-css in both repos.

## Date

2026-10-03

## What changed

The 33,737-line `continent-app/src/styles.css` is now an entry file of 19 lines that imports 19 domain files from `src/styles/`, in the original source order. The split was made at existing section-comment boundaries, outside every `@media` block, so each file is a contiguous slice of the old one and nothing was reordered. Vite inlines the imports into one stylesheet, which means the cascade is exactly what the single file produced. I proved that rather than assumed it: the built `index-*.css` after the split is byte-identical to the one built from the old file (same md5, e33bc928cdf1709a7bce4d8003d96ab7). maplibre-gl.css is still imported lazily from the map components and still lands after the main sheet, as before.

The second half is the tokens. The 378 hex literals outside `:root` (T195-b) are gone. 368 were replaced by `var()` references and 10 were dead fallbacks such as `var(--paper, #fbf8f1)`, where the token is defined in `:root` so the fallback never fires; those became plain `var(--paper)`. Pure white (210 of the literals) now comes from one new token, `--on-fill` (labels, icons and strokes on a filled surface), or `--bg-card` when the property is a background. `#8f5a0c` and `#f7dcd4` already existed as `--rate` and `--accent-bg` and now use them. The other 61 colours were each used by one feature (water quality, trails, crowding, AI stops, warnings); they became 63 single-purpose tokens in `01-tokens.css`, grouped by family and each with a one-line note. No value changed, so nothing on screen moved. `:root` went from 47 custom properties to 111.

For session T335 (shared Button): read label colour from `--on-fill`, fills from `--accent`, `--ink-fill` and `--danger`, borders from `--rule`, and states from `--accent-hover` and `--accent-press` if it needs them. DESIGN.md has a new "Domain colours" section and an `--on-fill` row in the paper and ink table. It also now names `src/styles/01-tokens.css` as the source of truth, since `:root` moved there.

How the no-regression claim was checked, three ways. First, the byte-identical built CSS for the split alone. Second, for the token step, a script (not committed, kept in the wt folder as T191-verify.py) expands every `var()` this task introduced back to its literal and compares the whole stylesheet, comment-stripped, line by line, against the pre-task source; all 31,563 lines are equal. Third, screenshots of four screens (Explore home, Explore, My trips with ?savedmock, the terms page) at 380 px and 1280 px, before and after, with animations off. The two screens with no photographs are pixel-identical at both widths. The photo screens differ only inside the photo cards, and the same regions differ between two runs of the unchanged "before" build, so that is image-load timing and not CSS. I looked at the 380 px home screenshots side by side and they match.

## Files touched

Application repo (continent-app, branch p10-tokens-modular-css):

Modified: src/styles.css (now the import list), scripts/ci/design-lint.baseline.json (regenerated, only shrinks).

Created: src/styles/01-tokens.css, 02-base.css, 10-shell.css, 11-trip-planner.css, 12-guided-trip.css, 13-day-planner.css, 14-filters-panels.css, 15-map-overlays.css, 16-auth.css, 17-saved-trips.css, 18-detail-panel.css, 19-guide-ratings.css, 20-day-planner-flow.css, 21-chat-passes.css, 22-account-admin.css, 23-places-pages.css, 24-destination-workspace.css, 25-feature-pages.css, 26-shortlist-extras.css.

Root repo (branch p10-tokens-modular-css): DESIGN.md, Execution/_OPEN.md, this report.

## Commands run

All from the app worktree. A Python script cut the file at fixed line numbers and wrote the imports; a second script did the replacements and appended the token block; both are one-shot and were not committed.

```
npx vite build --outDir ../T191-before-dist     # before the split
npx vite build --outDir ../T191-after-dist      # after the split, same md5
node scripts/ci/design-lint.mjs --update-baseline
node scripts/ci/design-lint.mjs                 # 204 found, 204 in baseline, 0 new
node scripts/ci/design-lint.mjs --self-test     # ok
npx eslint src                                  # 0 errors, 72 warnings (no JS touched)
npx vite build --outDir ../T191-final-dist
node _t191shots.mjs <dist> <out>                # vite preview on 5205, before and after
```

The build output directories were written outside the repo and no `dist/` exists in either worktree.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Hex literals outside :root in src/styles | 378 (T195 count, recounted 378 by script) | 0 | -378 |
| design-lint baseline, hex-literal | 344 (baseline keys, one per distinct line) | 0 | -344 |
| design-lint baseline, total | 551 | 204 | -347 |
| Custom properties in :root | 47 | 111 | +64 |
| styles.css lines in the entry file | 33,737 | 19 | -33,718 |
| Largest single CSS file | 33,737 lines | 5,976 lines (24-destination-workspace.css) | -27,761 |
| Built main CSS, split only | 670,451 bytes | 670,451 bytes, identical hash | 0 |
| Built main CSS, split and tokens | 670,451 bytes | 675,541 bytes | +5,090 (var() is longer than #fff) |

Sources: scripts/ci/design-lint.baseline.json before (git show HEAD~2) and after; the byte counts are from the built `assets/index-*.css`. The total fell by 347 while the hex rule fell by 344; the other three came from the em-dash (11 to 9) and middot (16 to 15) rules, which had already been fixed elsewhere and were only picked up because the baseline was regenerated from the current tree. Nothing was added to it.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First split build failed | My cut dropped the closing brace of `:root` by one line | Restored styles.css from git, fixed the off-by-one, resplit |
| A heredoc with a long Python script aborted the shell | Quoting inside the heredoc | Wrote the script with the file tool instead |

## What is still open

Three items, all in the register. T191-a: 129 raw shadow values, 24 gradients and about 300 `rgba()` colours remain in the stylesheets; the lint checks shadows and gradients (they are in the baseline) but does not check `rgba()`. T191-b: the 19 files follow the old chronological order, so one domain such as the day planner still spans several files; grouping by domain means moving rules and needs a cascade check per move, so it is its own task. T191-c: the 63 domain tokens are single-feature colours lifted from literals and a design pass should decide which belong in the palette. T195-b is closed by this task.

Two cautions for whoever edits these files next. Never reorder the imports in `styles.css` and never import a domain file from JavaScript: later files override earlier ones, and 19-guide-ratings, 24-destination-workspace and 25-feature-pages repeat selectors on purpose. And the verify scripts used above are not in the repo, so the next person who splits further should rerun a before and after build and compare the CSS hash.

## Rollback procedure

In the app repo, `git revert` the two T191 commits (token step first, then the split), or reset the branch to its base, master 4547b00. In the root repo revert the report commit; DESIGN.md and the register edits come back with it. No schema, data or deployed state is involved.
