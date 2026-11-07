# content/blog

Posts of the data blog (ROADMAP K14, T1178). One Markdown file per post, one data file per post in `data/`.

- `pipeline/blog/blog_drafts.py` (pipeline task `blog_drafts`, monthly) writes `<slug>.md` with `status: draft` and `data/<slug>.json` from the current wire.
- `scripts/blog/check_draft.py` refuses a post whose numbers differ from its data file or the wire, that breaks a copy rule, uses an unlicensed image, adds no original data or repeats another post's question.
- `continent-app/scripts/blog/build.mjs` builds published posts to `/blog/`, `/blog/<slug>`, `/blog/rss.xml` and `sitemap-blog-en.xml`. Drafts build only with `--drafts` and say noindex.
- Publishing is the owner's: read the draft in the pull request, edit it, set `status: published`, run the check, merge.

Front matter is flat `key: value` lines (title, slug, type, question, description, status, date, data, snapshot, snapshot_sha256, author). Images go in the data file's `images` list with `src`, `license` (cc0, cc-by, cc-by-sa, public-domain, own, pexels, unsplash), `credit` and `alt`.

## Post types (T1174)

| Type | Slug | Needs | Written by |
|---|---|---|---|
| `where-to-go` | `where-to-go-in-<month>-<year>` | the wire | `pipeline/blog/blog_drafts.py` |
| `what-changed` | `what-changed-in-<month>-<year>` | an earlier snapshot in `data/snapshots/` | `pipeline/blog/blog_drafts_more.py` |
| `new-on-carta` | `new-on-carta-<month>-<year>` | an earlier snapshot | `pipeline/blog/blog_drafts_more.py` |
| `cheapest-week` | `lowest-fare-week-from-<airport>-<window>` | a fares file in `data/inputs/` | `pipeline/blog/blog_drafts_more.py` |

Every run writes `data/snapshots/places-<date>.json`, the figures the next month compares against (commit it with the drafts). Without an earlier snapshot, `what-changed` and `new-on-carta` are skipped and say so. The fares file is an export of the flight sweep: `{"generated_at", "origin", "origin_name", "window": {"label", "slug"}, "fares": [{"dest", "depart", "price_eur"}]}`, `depart` the Saturday that starts a week; pass it with `--fares`. The check refuses a post whose snapshot or fares file was edited after the post cited it.

## Monthly routine

`blog_drafts` then `blog_pr` (pipeline tasks, monthly tier, the second follows the first). `scripts/blog/monthly_pr.py` checks the drafts, commits `content/blog/` to a branch `blog-drafts-YYYY-MM`, pushes it and puts the checkout back. It is a dry run until `CARTA_BLOG_PR=1` is set in the box secrets file. The owner opens the pull request from the branch, edits, sets `status: published` on what to publish and merges.
