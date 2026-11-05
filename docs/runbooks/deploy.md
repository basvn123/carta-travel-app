# Runbook: deploy

Only when the owner asks (CLAUDE.md). Source of truth for the steps: the header of `continent-app/scripts/build-pages.mjs` and CLAUDE.md "Checks". Handbook: [Deploy](../HANDBOOK.md#deploy-cloudflare-pages-r2-prerender-seo).

## Before you start

- About 1.3 GB free disk (the full build copies `public/`).
- Cloudflare credentials in the environment for wrangler and the R2 push (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and the `RCLONE_CONFIG_R2_*` variables read by `scripts/r2/push-data.mjs`). Names only; see [../security/SECRETS.md](../security/SECRETS.md).
- The branch you deploy is merged and `npm test` passes in `continent-app/`.

## Steps, from `continent-app/`

1. `VITE_E2E_SEAMS= npm run build:pages`. This runs `npm run build` with `VITE_DATA_BASE` set to `https://data.carta-europetravel.com/data`, stages the data shards out of `dist/` into `dist-data/`, writes `dist/404.html` (a copy of `index.html`, so unknown paths return a real 404), then `check-pages-limits.mjs` (20,000 files per site, 25 MiB per file).
2. `node scripts/css-routes.mjs --check dist/assets` (per-route CSS check).
3. `node scripts/r2/push-data.mjs --live`. Phase 1: copy only, adds and replaces, deletes nothing, so the old site keeps working. Data goes first.
4. `npx wrangler pages deploy dist --project-name carta-app --branch preview`. The preview URL `https://preview.carta-app.pages.dev` is the one preview origin the data host's CORS rule admits (`scripts/r2/data-cors.json`); the per-deploy hash URLs cannot read R2. Look at it.
5. `npx wrangler pages deploy dist --project-name carta-app --branch main`. Production.
6. `node scripts/r2/push-data.mjs --live --prune`. Phase 2: removes stale objects after production is live. It refuses to prune from an empty listing and leaves prefixes other writers own (such as `data/flights/`) and the owner's top-level files (`status.json`, `.keep`, `_test`) alone.

Prerendered pages go to the private bucket `carta-prerender` with `scripts/prerender/push.mjs` (header of `continent-app/wrangler.toml`); the exact order relative to the steps above is not verified here, read that script's header before the first deploy that changes pages.

## After

- `node scripts/r2/verify-data.mjs` (or `npm run data:verify`) checks the data host.
- Open the production URL at phone and desktop width.

## Undo

- Shell: Cloudflare Pages keeps earlier deployments; promote the previous one in the Pages dashboard, or redeploy the previous commit through steps 1 to 5. Not verified here which of the two is faster.
- Data: phase 1 never deletes, so before step 6 the old data is still on R2. After the prune, rebuild from the previous good master (see [incident.md](incident.md), "The pipeline fails silently").
- Bad prices or places visible to travellers: the maintenance switch in Admin (Site tab) stops the whole app; use it only to stop damage.
