# T478 to T482: the four T474 follow-ups, and batch mode

The first batch under the new batch rules (T482). Four app tasks ran in parallel, each in its own app worktree off `master` at `90b6553` (`wt/T478-app` to `wt/T481-app`). They were merged into one app batch branch, `p11-t474-followups`, checked once in the browser, and merged into app `master` at `7047a3c`. Root branch `p11-t474-followups` carries CLAUDE.md, this report, the register and the app mirror. Nothing is deployed and nothing is pushed.

## Batch measurements

These come from builds of master and the batch with the real `.env` and no `public/`, measured with `wt/t478-batch-measure.mjs` (it counts the bytes `index.html` loads before first paint). A build without Supabase settings drops supabase-js entirely, so the first shared baseline (412,699 B gzip) understated master by 56 KB. The figures below use the real settings.

| Metric | Before (master 90b6553) | After (batch 7047a3c) | Delta |
|---|---|---|---|
| JS before first paint, gzip | 469,222 B | 355,044 B | -114,178 B (-24.3%) |
| JS before first paint, raw | 1,522,105 B | 1,113,241 B | -408,864 B |
| CSS before first paint, gzip | 119,131 B | 114,695 B | -4,436 B |
| CSS before first paint, raw | 741,417 B | 712,915 B | -28,502 B |
| supabase-js before first paint | 50.9 KB gzip | 0 | -50.9 KB |
| English strings before first paint | 101.8 KB gzip (6,688 keys) | 40.3 KB gzip (2,514 keys) | -61.5 KB |
| Route selectors proven route-only (css-routes --check) | 1,825 | 2,322 | +497 |

## End check (once, on the merged batch)

Master and the batch were each served with the app's `public/` data behind them (`wt/t478-serve.mjs`, ports 5261 and 5262), and the same checks ran against both.

- **Computed styles:** `scripts/style-diff.mjs` (new, T482) records 26 properties of every visible element on 14 screens at 390 and 1280 px. The screens are home, Explore, Destinations, a destination, a region, and the trail, beach, lake, mountain, cycle and journey pages, plus the trip planner, the day planner and My trips. The first run found 341 T481 differences (the item-page alternatives track at 530 px instead of 239 px, the handoff margin, the journey bar title, the home wrapper, the planner input gap). T481 fixed them, and the final run is 0 apart from T478's new save button on the region page. Two single-element margin differences flipped direction between runs and were 0 on the rerun: a centring margin read before or after the scrollbar appears.
- **DOM harnesses:** 22 `scripts/verify_*.mjs` ran against both builds. Every exit code and every failure line is identical. Only 3 of 22 pass on master itself; the rest are stale after T473 and T474 (T482-a).
- **Slow network:** 400 ms latency, 200 KB/s, in English and in Dutch, on 7 screens each. No raw key showed in text, `aria-label`, `placeholder` or `title`, and no page error was raised. The supabase chunk and the English rest load at first paint as separate requests, not inside the first-paint bundle.
- **Region save:** phone and desktop, as a guest. The star turns on, stays on after reopening, the region is listed in My trips (Shortlist), and opening it from there shows the region page with the star on.
- **Static:** `npx eslint src` gives 0 errors. `npm test` gives 418 passed and 4 failed, all 4 in `passSubscription.test.mjs`, which needs the root checkout's `../../supabase` and `public/boot.json`. design-lint finds 0 new violations, and `scripts/i18n/check-en-split.mjs` reports 0 bad and 0 lazy-bad.
- **Not checked in the browser:** signing in with a real account (email, Google OAuth return, magic link, password recovery), a returning session, a pass-gated action while signed in, and session refresh. The harness has no test account. T479 reasoned through each path in code, but a person has to sign in once before this ships (T479-c).

## T478: region pages can be saved

### Task ID

T478 (register row T474-a)

### Date

2026-10-21

### What changed

A region (coast, range or NUTS-2 region) is now a favourite kind. Its page bar shows the same save button as a destination. A saved region resolves through `loadRegion`, appears in My trips with the other saved items, and opens its region page from there. It is stored on the device like every other kind, so guests can save too. The kind label is `saved.favKindRegion` in all six languages (Regions, Regio's, Regionen, Régions, Regiones, Regioni). It shows on the row's subtitle line and as a filter chip once more than one kind is saved.

### Files touched

Modified: `continent-app/src/lib/favorites.js`, `src/hooks/useFavoriteItems.js`, `src/App.jsx`, `src/browse/RegionPage.jsx`, `src/i18n/{en,nl,de,fr,es,it}.js`. Commit `58c2364`, run on Sonnet.

### Commands run

None beyond the batch's lint, tests and build.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| favorites.js turned LF in a CRLF file | A scripted edit wrote `\n` | Redone line-ending aware |

### What is still open

A saved region without a `country` shows an empty subtitle line in My trips. No current region lacks one, but the row does not guard against it (T478-a).

### Rollback

`git -C continent-app revert 58c2364`. Device-stored region favourites stay harmless after a revert: an unknown kind is skipped when parsed.

## T479: supabase-js loads after first paint

### Task ID

T479 (register row T474-b)

### Date

2026-10-21

### What changed

`src/lib/supabaseClient.js` no longer imports supabase-js at the top. `getSupabase()` loads it once and returns the one client as a shared promise (null when accounts are off; a failed chunk load is retried on the next call). `whenSupabase(cb)` runs a callback once someone else has loaded it. A guest with no stored session and no auth hash paints at once, and the client loads after mount. A load that may be signed in starts the import at once and keeps today's loading screen until the session arrives. An OAuth or recovery hash is saved at import and handed back just before the client reads it, because `urlState` would otherwise strip it first now that the client starts later. All 29 importers moved to the async accessor; none needed a synchronous client. AI, billing and checkout calls report a failed chunk load with their existing `'network'` code. Before and after with the real settings: 467,293 to 416,850 B gzip before first paint.

### Files touched

30 files: 29 under `continent-app/src/` (auth, community, admin hooks, lib, planner) plus `scripts/admin/test_edge_errors.mjs`, whose fake client needed the new exports. Commit `7a82e49`, run on Opus.

### Commands run

None beyond the batch's lint, tests and build.

### Config and secrets set

None.

### Before/after measurements

See the batch table; the supabase-js row is this task's.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Uncommitted T479 and T480 edits swapped places mid-task | `refs/stash` is shared by every worktree; two agents stashed and popped at once | Both diffs saved as patches, compared byte for byte, each restored to its own tree; rule added to CLAUDE.md (T482) |

### What is still open

`scripts/admin/test_edge_errors.mjs` needs a database and was not run. Failure logging now happens one tick later, so its event-order checks need confirming (T479-a). The guest fast path reads the default supabase-js storage key, `sb-<ref>-auth-token`; a custom `storageKey` would have to change `mayHaveSession` with it (T479-b). Signing in with a real account was not checked in the browser (T479-c, owner).

### Rollback

`git -C continent-app revert 7a82e49`. There is no data or config side.

## T480: only the first screen's English loads before first paint

### Task ID

T480 (register row T474-c)

### Date

2026-10-21

### What changed

A build-only Vite plugin, `scripts/i18n/enSplit.mjs`, cuts `src/i18n/en.js` into two virtual modules, so `en.js` stays the one file translators edit. The eager part holds every key named by a module that `main.jsx` reaches through static imports: as a token, as a string prefix before `${` or `+`, or as a template suffix. The rest is a lazy chunk the provider fetches after the first commit; it calls `addEnglish()` and triggers a re-render. Every lazy chunk that names a key imports the rest first, so it can never run without its strings. While the rest is still in flight, a key that English lacks resolves to an empty string rather than the raw key. Once it lands, or if the fetch fails, the old fallback applies. The dev server serves `en.js` whole. The other five languages load as before and layer over English.

### Files touched

Modified: `continent-app/src/i18n/index.jsx`, `vite.config.js`. Created: `scripts/i18n/enSplit.mjs`, `scripts/i18n/check-en-split.mjs` (the post-build proof, moved into the repo at the end check). Commits `8510bd0` and `23d0b0a`, run on Opus.

### Commands run

`node scripts/i18n/check-en-split.mjs . <dist>` after a build.

### Config and secrets set

None.

### Before/after measurements

See the batch table. Measured without Supabase settings, this task alone took first-paint JS from 412,699 to 349,330 B gzip.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first split put every key in the eager part | The scan read the language catalogues themselves | `src/i18n/` excluded from the scan |
| css-routes reported 5 problems once T480 and T481 met | Class tokens (`sig`, `notfor`, `staff`, `picked`) occur in string key names in the new `_virtual_carta-en-rest` chunk, which css-routes did not know was strings | Added to `STRINGS` in `scripts/css-routes.mjs` (`50f6ec5`) |

### What is still open

A key built at runtime from variables with no literal prefix, or taken from data or the server, is invisible to the scan and shows blank for the instant before the rest lands (T480-a). `check-en-split.mjs` is in the repo but not in `npm run ci`, so nothing yet enforces the split for future keys (T480-b).

### Rollback

`git -C continent-app revert 23d0b0a 8510bd0`. Revert the `STRINGS` line in `50f6ec5` too, or leave it; it is harmless without the chunk.

## T481: more planner, admin and item-page CSS out of the first paint

### Task ID

T481 (register row T474-d)

### Date

2026-10-21

### What changed

The first pass scoped wildcard child rules to the children the JSX renders, using `:where()` so specificity stays the same (a new `pcard-part` class on the Destinations card hook spans). It deleted four dead rules and added the item pages as a third route family, `items`. The end check then showed that css-routes' cascade proof had holes. It thought two classes could share an element only when one class set contained the other, so it missed classes built at runtime (`itrack-${size}`) and classes written together in one className string. It compared property names literally, so `gap` against `column-gap` or `margin` against `margin-left` looked unrelated. And it ignored rules an earlier run had already moved into the same sheet. The fix (`603fec4`) closes all three. With the stricter proof, 728 of T474's own moves on master turned out not provably safe. `--check --hold` now parks every flagged rule in `src/styles/planners-held.css` or `admin-held.css`, both imported last in `styles.css`, which keeps master's order (475 selectors). The one order change: held rules now always load before the lazy sheets (My trips, pass, style guide, maplibre), where on master that depended on which route opened first. The style diff confirms the result renders identically on the 14 screens it visits.

### Files touched

`continent-app/scripts/css-routes.mjs` and `scripts/ci/design-lint.baseline.json` (7,788 to 7,805, all from cutting rules apart, no new declarations); `src/browse/PlaceCard.jsx` and the eight item page entries (Stub, Trail, Beach, Lake, Mountain, Cycle, Trip, Journey); and under `src/styles/`: the edited partials, `planners/*`, `admin/*`, the new `items/*`, `items.css`, `planners-held.css` and `admin-held.css`. Commits `5ca0dbc`, `4d01e0c`, `50f6ec5` and `603fec4`, run on Opus.

### Commands run

```
NOPUBLIC=1 npx vite build --config ../vite.t481env.mjs --outDir ../t481-env --emptyOutDir
node scripts/css-routes.mjs --split ../t481-env/assets
node scripts/css-routes.mjs --check --hold ../t481-env/assets
node scripts/css-routes.mjs --check <dist>/assets
```

### Config and secrets set

None.

### Before/after measurements

See the batch table; the CSS rows and the route selector row are this task's. Before the cascade fix the saving looked like 119,131 to 98,948 B gzip. That number was wrong, because the screens it came from did not render the same as master.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Item page alternatives track rendered at 530 px instead of 239 px on desktop | `.itrack` moved after `.itrack-third`; the proof did not see runtime-built class names | Classes built from parts count as able to share an element |
| Handoff margin 32 to 24 px, journey bar title 16 to 13 px, back label width | Two classes in one className string read as two elements | A className expression that puts them together counts |
| Planner input gap 8px 16px to 12px | `gap` and its longhands compared as different properties; a re-run appended after an already-moved rule | Shorthands and longhands are one property; already-moved rules are rivals |
| Desktop home wrapper margin | Most likely the same shorthand hole; not traced rule by rule | Gone in the final diff |

### What is still open

The 475 held selectors still load before first paint; each needs its overriding pair resolved before it can move (T481-a). The style diff visits 14 screens. T474's 728 flagged moves are now held, which reproduces master's order, but master itself may differ from pre-T474 on a screen the diff never opened (T481-b). About 351 rules remain blocked, mostly tag-descendant rules (`.x svg`, `.y b`) and `.destp-grid > *`, `.bottom-slot > *` (T481-c). More dead CSS remains: `.dsk-alert` and the rest of `.xp-hero-badges` (T481-d).

### Rollback

`git -C continent-app revert 603fec4 4d01e0c 5ca0dbc` (newest first). `50f6ec5` can stay.

## T482: batch mode written into the working rules

### Task ID

T482

### Date

2026-10-21

### What changed

The owner asked to spend fewer tokens and run faster without doing shallower work. CLAUDE.md now has a "Batches" section. Several tasks in one prompt share one batch branch, each still as its own commit. Each task gets static checks only, the browser round runs once on the merged batch, and one report is written at the end, with register rows still per task. The section also adds the task number rule (the highest across `git log --all` and every worktree, after the T470 collision cost T477) and the 10-second NOPUBLIC build. Reading habits change too: search first, read only the lines needed, never `en.js` or `styles.css` whole, subagents get the measured baseline, DOM checks before screenshots, and the root mirror syncs once per batch. A second commit forbids `git stash` across parallel worktrees. `scripts/style-diff.mjs` keeps the end check's computed-style diff in the app repo for the next batch.

This batch cost about 952k subagent tokens (T478 89k on Sonnet; T479 160k, T480 138k and T481 565k on Opus, of which T481's cascade fix took 339k). There is no per-task-report baseline to compare against, so the saving is not measured. The visible saving was one browser round instead of four, one report instead of four, and one shared master build.

### Files touched

Root `CLAUDE.md` (commits `c0495fafe` and `87133ab0c` on root branch `p11-t474-followups`); app `scripts/style-diff.mjs` (`aa07b1f`).

### Commands run

None.

### Config and secrets set

None.

### Before/after measurements

Not measured (see above).

### What broke and how it was fixed

No issues.

### What is still open

Only 3 of the 22 DOM harnesses pass on master; the rest are stale after the T473 navigation and T474 bar changes (the My trips button selector, for one). An end check can only compare them against master, not rely on them; refreshing them makes every future end check cheaper and stronger (T482-a). `wt/` holds several thousand leftover logs, shots and builds from T089 onward. Nothing reads them, but they cost disk and clutter every directory listing (T482-b, owner, since some may be evidence worth keeping).

### Rollback

`git revert 87133ab0c c0495fafe` on the root, and `git -C continent-app revert aa07b1f`.
