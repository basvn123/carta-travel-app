# T1178: Data blog, part 1 (K14, S94)

## Date

2026-11-07

## What changed

Carta has the first half of an automated data blog (ROADMAP K14). `pipeline/blog_drafts.py` (pipeline task `blog_drafts`, monthly) writes a structured "Where to go in <month>" draft from the wire: ten quiet, rated places with weather, rain, crowds, an indicative day price and rating, as a JSON data file (rows, counts, chart, the snapshot cited and its hash) plus Markdown from a template. `scripts/blog/check_draft.py` refuses a draft whose numbers differ from its data file or the wire, that breaks a copy rule, uses an unlicensed image, adds no original data or repeats another post's question. `continent-app/scripts/blog/build.mjs` renders published posts to `/blog/`, `/blog/<slug>`, `/blog/rss.xml` and `sitemap-blog-en.xml` with BlogPosting and breadcrumb JSON-LD. One sample draft (December 2026) is committed with `status: draft`; nothing is published. Winter months have no place in their best months, so the generator falls back to the top tenth for comfort and says so in the post.

## Research

No tool, library or service was chosen that needed a comparison: Markdown is a 90 line renderer with no dependency (posts are machine written, so the subset is small and everything is escaped), and the optional prose uses the existing gateway (Gemini) with a new registry prompt `blog-intro`. A Markdown library or a static site generator was not added because the blog must share Carta's tokens and the existing prerender helpers, and a dependency would add supply chain surface for no gain.

## Files touched

- New: `pipeline/blog_drafts.py`, `scripts/blog/check_draft.py`, `content/blog/` (README, sample draft, data file), `prompts/blog-intro/v1.md` (and its `prompts/registry.json` entry), `continent-app/src/blog/markdown.js`, `continent-app/src/blog/feed.js`, `continent-app/scripts/blog/build.mjs`, `continent-app/scripts/verify_blog.mjs`, `tests/test_blog_drafts.py`, `continent-app/tests/blog.test.mjs`
- Edited: `run_pipeline.py` (task `blog_drafts`), `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (ten `blog.*` keys each), `continent-app/.gitignore` (`dist-blog/`), `docs/HANDBOOK.md` (Data blog), `ROADMAP.md` (K14 status), `Execution/_OPEN.md`

No existing screen or shared component was edited.

## Commands run

`python pipeline/blog_drafts.py --month 12 --year 2026`; `python scripts/blog/check_draft.py --wire continent-app/public/app_data.json`; `node scripts/blog/build.mjs --drafts`; `node scripts/verify_blog.mjs`; `npm test`, `npm run lint`, `node scripts/ci/design-lint.mjs`, fast build, `verify_csp.mjs`, full pytest minus quarantine, `node scripts/prompts/registry.mjs check --no-eval`.

## Config and secrets set

None. `--prose` needs `GEMINI_API_KEY` on the box (gateway feature `blog_intro`); the default run needs no key.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Blog posts built | 0 | 1 draft (0 published) |
| December 2026 places with figures / in the top comfort tenth / quiet / rated 7.0+ / listed | n/a | 2,285 / 246 / 225 / 82 / 10 |
| Seeded bad drafts refused by the check | n/a | 14 kinds (number, hash, wire, dash, banned word, superlative, exclamation, three image faults, no original data, duplicate, missing header, unlisted image) |
| `npm test` | 1,889 tests, 2 failures from this work (CSP inline style, prompt text in code), both fixed | 0 from this work |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| December returned no places | The comfort rule's best months are empty for every place in winter | Top-comfort fallback, recorded in the data file and the post |
| Crowd word was "unknown" | I used a 1 to 4 scale; the wire's tier is 0 quiet to 3 crowded | Scale and filter follow `lib/crowdMonth.js` |
| CSP test failed | The chart bars used `style="width"` | Bars are SVG rects |
| Prompt registry test failed | The prompt repeated the banned word list that other files hold | List removed from the prompt; the code guard keeps it |

## Screens checked

Index and sample post at 390 and 1280 px with `scripts/verify_blog.mjs` (DOM): one h1, canonical, noindex on the draft, JSON-LD parses, ten table rows and ten chart bars equal the data file, no horizontal page scroll, no console error, no dash, feed holds no draft. All passed. One screenshot per width was looked at (`Execution/P15/T1178-shots/`, gitignored); the table scrolls inside its own frame on a phone.

## Tests

`tests/test_blog_drafts.py` (24) and `continent-app/tests/blog.test.mjs` (7) pass. `npm test` 1,889 with 0 failures from this work (2 earlier failures fixed). Lint: 0 errors. Design lint: 0 new. Fast build and CSP check: pass (0 violations over 40 loads). Full pytest minus quarantine, with `test_uk_crowds.py` ignored (collection error, a missing module in this container): 870 passed, 9 failed in `test_trail_recover_walks`, `test_pipeline_code_fixes`, `test_rating_inputs`, `test_rating_stability`, none touching this work.

## What is still open

T1178-a to T1178-e in `Execution/_OPEN.md`: wire the build into the deploy and the sitemap index (shared files), a link to the blog, the other post types and Dutch, the box schedule and monthly pull request routine, and the owner's approval of the sample.

## Rollback

`git revert` the T1178 commits. No data migration, nothing deployed.

## Owner steps (for the checklist)

- [T1178-d] Run the monthly draft on the box | the draft needs a current wire and a pull request each month | on the box run `python run_pipeline.py --only blog_drafts` after the monthly data run; open a pull request with the new `content/blog/` files (a scheduled Claude Code routine can do this); add `--prose` to the task cmd if you want the Gemini opening | run_pipeline.py task blog_drafts, content/blog/README.md
- [T1178-e] Approve the first post | publishing is yours and the sample uses a wire dated 2026-06-07 | regenerate the December draft on a fresh wire; read and edit it; set `status: published`; run `python scripts/blog/check_draft.py` | content/blog/where-to-go-in-december-2026.md
