# Owner steps

Everything only the owner can do: Dashboard settings, secrets, SQL pastes, sign-ups, paid runs, reviews and product decisions. One file per system. Claude never does these steps itself; it adds a step to the right file and says so in its run report. Why it works this way: `docs/decisions/0003-open-items-owner-steps-and-roadmap.md`.

How to use it:
1. Open the file for the system you are working on and follow its steps in order.
2. When a step is done, delete it from the file (or tell a session the step ID, for example `T030-a`, and it does).
3. Step IDs name the old task that raised them; `.work/INDEX.md` shows how to open that task's report. Paths that start with `Execution/` are in git history: `git show archive/execution-2026-11-11:"<path>"`.

| File | What it covers | Steps |
|---|---|---|
| `docs/owner/product-decisions.md` | product and design calls only the owner can make | 11 |
| `docs/owner/owner-checks.md` | other checks and clean-ups | 60 |
| `docs/owner/cloudflare.md` | Pages, R2, Workers, email routing | 21 |
| `docs/owner/translation-review.md` | native-reader review of the six languages | 6 |
| `docs/owner/data-and-pipeline-runs.md` | phone, people and drive checks left from the data runs | 6 |
| `docs/owner/legal.md` | legal, tax and brand | 4 |
| `docs/owner/hetzner-box.md` | the Hetzner box and workers | 4 |
| `docs/owner/supabase-migrations.md` | migrations, Edge Functions and secrets | 4 (063 to 075 applied 2026-11-12) |
| `docs/owner/stripe.md` | Stripe prices, keys, webhook, test purchases, legal review | 5 |
| `docs/owner/accounts-and-signups.md` | accounts, mailboxes and programme sign-ups | 7 |
| `docs/owner/google-and-search.md` | Google, Gemini billing, Search Console | 1 |
| `docs/owner/auth-settings.md` | Supabase Auth settings and admin MFA | procedure |
| `docs/owner/secrets-rotation.md` | secrets rotation and MFA | procedure |
| `docs/owner/web-hardening.md` | web and API hardening | procedure |
| `docs/owner/search-console.md` | Google Search Console setup | procedure, 1 step |
| `docs/owner/scraper-health.md` | scraper health on the box (no steps left) | procedure |
| `docs/owner/stays-box.md` | the monthly stay-price rebuild on the box | 1 |
| `docs/owner/explore-data-runs.md` | what the Monday explore data run does (no steps left) | procedure |
| `docs/owner/uploads.md` | switching on the upload path | procedure |
| `docs/owner/pass-subscription.md` | switching on the 12-month pass and the Trip Pass | procedure |
| `docs/owner/paid-runs.md` | paid runs, last in the order | procedure, 28 runs |
| `docs/owner/unsorted.md` | owner steps no procedure covers yet (emptied by round 2 of the 2026-11-12 sweep) | 0 |

Counts were recounted from the files by owner sweep round 2 on 2026-11-12 (`.work/2026-11-12-owner-round2/report.md`): a count is the numbered steps, step bullets and table rows in the file.
