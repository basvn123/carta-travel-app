# Carta becomes Viantra in the app, with the signed-off logo (K1)

2026-11-26 · L1 · feature · branch `p15-viantra-rename` · ROADMAP K1, decision `docs/decisions/0018-name-viantra.md`

## What changed

- **The name.** Every user-visible "Carta" in the app, the functions, the Edge Functions, the e-mail templates and the MCP and intelligence services became "Viantra" (`scripts/rename_viantra.py`: the standalone word only, so identifiers, lowercase keys, the domain, Italian "carta" and "Carta d'identità" stay). That includes all six i18n catalogues, Ask's name ("Vraag Viantra" and its translations), `index.html` title and meta, the PDF, ICS and KML export headers, prerendered pages and the share cards.
- **The logo.** `src/components/BrandMarks.jsx` (generated from the kit by `scripts/gen_brand_component.py`) gives `BrandMark` (the terracotta arch) and `BrandWordmark` (outlined Fraunces), used in all eight places that showed the blaze: header, footer, sign-in gate and dialog, reset password, shared trip, maintenance, 404. The arch is sized `1.15em` of the name's own font-size token (the lockup's arch to capitals), so it follows the name on every angle (`60-v6-shell.css`, `16-auth.css`, `24-destination-workspace.css`). New token `--brand-mark: #b5532c` (logo only, 4.3 on stone), recorded in `DESIGN.md`.
- **Icons and manifest** (owner said yes to writing `public/`): the kit's seven files over `public/` (favicon.svg, favicon.ico, icon-192, icon-512, icon-maskable-512, icon-maskable.svg, apple-touch-icon), `store/ios/*` and `store/android/*` over `brand/store/`, `social/site-square.png` over `brand/social/`. Manifest: name "Viantra, Europe Travel", short_name "Viantra", description "Plan the whole trip in one place, with what each day costs, across Europe." (PRODUCT.md's voice; the old one ranked "real total trip cost"). `theme-color` and manifest colours stay the stone ground: the palette move is a later step.
- **Share cards.** `scripts/og/cards.mjs` draws the kit's lockup SVG in the foot instead of the blaze plus a typed name; `public/og/site.png` re-rendered (copied in by the owner, the crew hook guards `public/`).
- **AI prompts.** Versioned, not edited in place: `security-rules` v2, `ask` v2, `plan-day` v2, `suggest-city` v3, `parse-booking` v2 change only Carta to Viantra; scores recorded (injection 1.0, ask ndcg@10 0.6026 against v1's 0.6003, plan-day 1.0, suggest-city 1.0, parse-booking 1.0); `prompts.js` rebuilt. The golden tests compare with the old outputs with that one word swapped. The guard's override pattern now also catches "Viantra's rules" (JS twice, Python once).
- **Docs.** HANDBOOK (product name throughout, installable app, opening screen, prompt registry), `docs/brand/POSITIONING.md` (name parts, decision line, assets), `docs/logic/*.md` (four test names), ROADMAP K1 status, owner step K1-a.
- **Fixed on the way.** `tests/aiGateway.test.mjs` reads Python's stdin as UTF-8 (with `-I` on Windows it was the codepage, so the Python twin never ran here); the seed-edit test no longer assumes plan-day is v1; `scripts/og/icons.mjs` refuses to run without `--legacy-blaze`, so nobody redraws the old icons over the kit.

## Kept internal "carta" identifiers (on purpose)

- **Persisted keys** (renaming loses travellers' saved trips and settings): every `carta.*` localStorage and sessionStorage key, 80-odd, for example `carta.trips.v1`, `carta.keptTrips.v1`, `carta.deviceTrip.v1`, `carta.plannerDraft.v1`, `carta.travelStyles.v1`, `carta.savedLists.v1`, `carta.ask.chats.v1`, `carta.accountSync.v1`, `carta.splash.seen.v1`, `carta.haptics.v1`; and the event and message names `carta:*` (`carta:warm` to the service worker, `carta:kept`, `carta:reprice`, `carta:account-sync` and the rest). The service worker cache `carta-v8`.
- **Infrastructure names:** Pages project `carta-app`, R2 bucket `carta-prerender`, KV and worker names `carta-ask`, the `carta-mcp` bin, Supabase tables and functions as they are, the API routes.
- **Environment variables:** all `CARTA_*` (CARTA_APP, CARTA_PORT, CARTA_EVAL_OUT, CARTA_BLOG_PR, CARTA_R2_BUCKET, CARTA_SUPABASE_URL and about 75 more).
- **Code identifiers and paths code reads:** `cartaRoute.js`, `CartaTrips.jsx`, `useCartaDates`, `openInCarta`, i18n keys such as `nav.howCartaWorks`, `isCartaBasemap`, `verify_carta_route.mjs`, `Trips/carta-unified/`, the temp-dir prefixes `carta-*`.
- **The domain and e-mail:** `carta-europetravel.com` in `contact.js` (`hello@`), `og:url` and `og:image`, the share cards' `DOMAIN`, the sitemap base. Owner step K1-a.
- **Internal prompts:** `ask-docs` (questions over the docs, which still say Carta), `eval-judge` (its rubric hash pins the judge verdicts), `truth-judge` and the pipeline prompts (`intros`, `blog-intro`, `backtranslate`, `judge-text`): not seen by travellers; a bump of the pipeline ones would also change cache keys.
- **History:** the comment-only renames in applied SQL migrations stay as the rename script made them (comments, no behaviour); `CartaFreccia` is Trenitalia's card.

## Checks

- `npm run lint`: 0 errors (27 warnings, as before).
- Fast build: passes; built `index.html` has title "Viantra" and no "Carta".
- `node scripts/prompts/registry.mjs check --base main`: OK, 23 prompts. Python `tests/test_prompt_registry.py` and `tests/test_ai_gateway.py`: 43 passed. ruff, `check_entry_points.py`, `drift.py` (0 drift): pass. design-lint: 0 new.
- `npm test` in the sparse worktree with part of the wire copied in (for the ask eval): 2668 tests, 2621 pass, 28 fail, 19 skipped. Every prompt, guard, brand and golden test passes. The 28 are not the rename: files the sparse checkout lacks (`_redirects`, `_routes.json`, `coverage.json`, the films, the splash images, `stays/`), Windows-only faults that `main` shows too (the worktree script's 8.3 temp path, CRLF in the journalist template, the CSP scan's `C:\C:\` path), and failures `main` has on the same machine (`/api/ask` dense hits, the 100 a day map, the cheapest week calendar, the ask-docs eval drop to recall1 0.792, the linking `set.json` check). Two pass on `main` and fail here only because the copy is partial: the Andorra prerender test (the dossiers are there, `stays/` is not, so no page has a bed price and none is indexable) and the catalogue compare test. CI runs the full suite on Linux after the push.
- `scripts/eval/ask-docs/set.json`: four questions name Viantra, as the renamed HANDBOOK does; the eval's scores are the same either way.
- DOM checks (`.work/2026-11-26-viantra-rename/check_brand.mjs`, the build served with `main`'s wire): at 390, 820, 1180 and 1440 the header shows the arch (terracotta, labelled Viantra) at 1.1 to 1.25 times the wordmark, no "Carta" on screen, no sideways scroll; a sweep from 320 to 1600 px every 40 px keeps the mark whole and the page inside; the served manifest and favicon are Viantra's. Footer slot: arch 25 px to wordmark 22 px. Screenshots in the run folder only.

## Owner steps

- **K1-a** (new, `docs/owner/accounts-and-signups.md`): after T1060-d, move the app to the Viantra domain.
- T1060-c handles and T1060-d domains and clearance search, as before. The trademark clearance search is still open.

## Undo

`git revert <commit>`. Not one-way: no data migration, no schema change, persisted keys untouched. A revert also takes the registry back to the v1 prompts; the prompts CI job may then ask for a forward bump instead (its rule is one version up at a time), in which case bump the five prompts again with the Carta text.
