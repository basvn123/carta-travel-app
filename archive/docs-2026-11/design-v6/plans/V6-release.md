# V6 plan: the release check, the gallery and the preview deploy (T412)

Written by T412 (design wave V6) before any run. It sits on the merged result of T411 (root main 902de56de, app master 5f92632). No app source file is edited by this task; it only measures, shows and deploys.

## Order of the run

1. Static checks in the app worktree: `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`, `node scripts/ci/banned-terms.mjs`, the six i18n catalogues parse (session rule 8), `impeccable detect --json src`.
2. `npm run build`, then `vite preview` of that build on port 5201 (never 4209 or 4213, which belong to stale V5 servers). Against it: `verify_keyboard.mjs` (expect 22 of 22 surface checks) and `verify_quality_floor.mjs`.
3. Every surface harness, through the T411 sweep runner against Vite on 5201: shell, landing, Explore, Destinations, destination page, outdoor (beaches, mountains, trails, lakes, cycling), trips and journeys, trip planner, day planner, account and My trips. Record pass or fail per script. A failure that also failed on the V5 base (listed in the T411 report) is recorded as known, with its register row; anything new is investigated.
4. Delete dist/ and dist-data/. Stop every server started.
5. The gallery at design-v6-shots/index.html: one plain page, phones first, surface by surface. Each pair is the V1 "before" and the latest "after" of the same view (V5 first, or V6 where T411 saved one), with one line saying what changed. Written by a scratch script outside the repos. Then docs/design-v6/MORNING.md in the root worktree.
6. The preview deploy: `npm run build:pages`, then `npx wrangler pages deploy dist --project-name carta-app --branch design --commit-dirty=true`. Never `--branch main`. Then open https://design.carta-app.pages.dev on iPhone 13 (WebKit), Pixel 5 and 1280 x 800 (Chromium) with the console open: Explore, a destination, a trail, a journey, the trip planner, the day planner, My trips. Name any data file that fails. Delete dist/ and dist-data/ again.
7. Report Execution/P10/T412-v6-release.md, register rows (the owner row to promote the preview with runbook block C2 to C5), one commit per repo.

## Pass rule

The release passes when lint has 0 errors, tests pass, the design lint has 0 new violations, the banned-terms check and the catalogue parse pass, the build succeeds, verify_keyboard holds 22 of 22 and the quality floor and harnesses match the T411 result or better. A regression against T411 stops the deploy and is reported instead.

## Rollback

Nothing is merged or pushed. The preview deploy is on the `design` branch alias only; production is untouched. Drop the branches to undo the commits.
