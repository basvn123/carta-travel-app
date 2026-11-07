# content/blog

Posts of the data blog (ROADMAP K14, T1178). One Markdown file per post, one data file per post in `data/`.

- `pipeline/blog_drafts.py` (pipeline task `blog_drafts`, monthly) writes `<slug>.md` with `status: draft` and `data/<slug>.json` from the current wire.
- `scripts/blog/check_draft.py` refuses a post whose numbers differ from its data file or the wire, that breaks a copy rule, uses an unlicensed image, adds no original data or repeats another post's question.
- `continent-app/scripts/blog/build.mjs` builds published posts to `/blog/`, `/blog/<slug>`, `/blog/rss.xml` and `sitemap-blog-en.xml`. Drafts build only with `--drafts` and say noindex.
- Publishing is the owner's: read the draft in the pull request, edit it, set `status: published`, run the check, merge.

Front matter is flat `key: value` lines (title, slug, type, question, description, status, date, data, snapshot, snapshot_sha256, author). Images go in the data file's `images` list with `src`, `license` (cc0, cc-by, cc-by-sa, public-domain, own, pexels, unsplash), `credit` and `alt`.
