# T1164: Security testing (ZAP baseline, auth tests, ASVS L2 walk)

ROADMAP item C10. Round 2 session S80, batch 8. Branch `p15-s80-security-testing`.

## Date

2026-11-07

## What changed

Carta now has the three C10 pieces. (1) A ZAP baseline workflow, `.github/workflows/zap.yml`, scans either a local Pages preview of the fast build (on pull requests that touch headers, functions, index.html or the ZAP files) or the deployed preview (on demand). It fails on any High alert by reading the JSON report, since ZAP rule levels are set per plugin and not per risk. Run here against `wrangler pages dev` serving the fast build with the real `_headers`, `_redirects`, `_routes.json` and Pages Functions, ZAP 2.17.0 found 0 High, 1 Medium (Pages' own `Access-Control-Allow-Origin: *`), 1 Low and 3 Informational, with 58 rules passing. (2) Auth tests run in `npm test`: `edgeAuth.test.mjs` imports the real Edge Function handlers under Node, with `npm:` imports mapped to stubs: a small Supabase Auth that checks HS256 JWTs, and Stripe with its documented signature scheme. It proves that all six user-facing functions refuse 9 kinds of bad credential with 401 before any database, Stripe or AI call. It also covers wrong-user cases (billing `not_yours`, checkout and notify keyed to the token user whatever the body says, refine and unsubscribe tokens bound to their user), the cron secrets, Stripe signatures (forged, replayed, body swapped) and admin without MFA. `pagesAuth.test.mjs` proves that the anonymous Pages Functions ignore and never forward a caller's credential. In total, 83 new tests; a mutation that made the stub accept every token turned 54 of them red. (3) `docs/security/asvs.md` walks all 253 OWASP ASVS 5.0.0 Level 2 requirements: 158 met, 45 not applicable, 50 gaps. Every gap names a register row: 12 new rows (T1164-c to T1164-n), plus existing ones. Before this task, no scan, no behavioural auth test of any Edge Function and no ASVS walk existed.

## Research

A research subagent compared the options (2026-11-07). www.zaproxy.org and supabase.com were unreachable from the container, so it read the GitHub sources and the official ASVS CSV, and it ran a local Deno test.

| Question | Options | Choice and why |
|---|---|---|
| ZAP in CI | `zaproxy/action-baseline` v0.15.0 (SHA `de8ad967d3548d44ef623df22cf95c3b0baf8b25`) vs the ZAP container running `zap-baseline.py` | **Container, run directly.** The action defaults `fail_action` to false, fails on WARN when set to true, and opens GitHub issues by default. Neither option gates by risk. The direct run plus a JSON `riskcode == 3` check is the simplest High-only gate, needs no third-party action SHA and writes no issues. The image is pinned by digest (`zaproxy/zap-stable@sha256:9624...`, 2.17.0, the image used here; ghcr.io blobs were blocked by the proxy, so the Docker Hub mirror was used). |
| ASVS version | 4.0.3 (286 requirements, 14 chapters) vs 5.0.0 (May 2025, 345 requirements, 17 chapters, 253 at L2) | **5.0.0 at L2.** It is the current OWASP release, and its V9 (self-contained tokens) and V10 (OAuth) chapters fit Supabase JWTs. Cite rows as `v5.0.0-V6.2.1`. |
| Edge Function auth tests | (a) Node 22 type stripping, a resolve hook for `npm:` stubs and a fake `Deno`; (b) `deno test` with a test import map; (c) `supabase functions serve` with a local stack | Research recommended **(b)** for runtime fidelity. **This task built (a)** because it runs inside the existing `npm test` gate in `ci.yml`, with no new workflow, toolchain or pinned action, and the brief limits the files this session may touch. The handlers use only Web APIs, so Node and Deno behave the same for these paths. (b) is row T1164-k; (c) costs minutes per run and needs Docker. |

Links: https://github.com/zaproxy/action-baseline, https://github.com/zaproxy/zaproxy/blob/main/docker/zap-baseline.py, https://github.com/OWASP/ASVS/tree/master/5.0, https://docs.deno.com/runtime/fundamentals/modules/, https://github.com/denoland/setup-deno, https://nodejs.org/api/typescript.html.

## Files touched

Created:
- `.github/workflows/zap.yml`
- `.zap/rules.tsv`
- `docs/security/asvs.md`
- `continent-app/tests/edgeAuth.test.mjs`
- `continent-app/tests/pagesAuth.test.mjs`
- `continent-app/tests/fixtures/edge-auth/loader.mjs`, `world.mjs`, `supabase-stub.mjs`, `stripe-stub.mjs`
- `Execution/P15/T1164-security-testing.md`

Modified:
- `Execution/_OPEN.md` (14 rows appended)
- `ROADMAP.md` (C10 status)

## Commands run

```
cd continent-app && npm ci
node --test tests/edgeAuth.test.mjs tests/pagesAuth.test.mjs
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
# the local job of zap.yml, run step for step from the parsed YAML:
#   copy _headers/_redirects/_routes.json into .fastbuild, wrangler.toml minus [ai],
#   npx wrangler@4.158.0 pages dev --port 8788, then
docker run --rm --network host -v "$PWD/zap:/zap/wrk:rw" zaproxy/zap-stable@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af \
  zap-baseline.py -t http://127.0.0.1:8788/ -c rules.tsv -I -j -J zap.json -r zap.html -w zap.md
# then the Gate step on zap/zap.json (exit 0), and again on a copy with one alert set to High (exit 1)
npm test
python -m pytest tests -q -rs (quarantine deselected): 804 passed, 2 failed on LFS pointers, 9 skipped
```

The ASVS table was generated from the official 5.0.0 CSV with a throwaway script (requirement text shortened to its first sentence) plus one hand-written verdict per requirement; the script is not committed.

## Config and secrets set

None. The preview job needs no secret. The local job strips the Workers AI binding from a temporary copy of `wrangler.toml`, because `pages dev` can only run that binding remotely with a Cloudflare token.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `npm test` tests (pass / total) | 1717 / 1729 | 1800 / 1812 | +83 |
| Edge Functions with behavioural auth tests | 0 of 9 (static checks only, `edgeHttp.test.mjs`) | 9 of 9 | +9 |
| Bad-credential refusals tested per user-facing Edge Function | 0 | 9 (6 functions, 54 cases) | +54 |
| Mutation check: stub accepts every token | n/a | 54 of 80 edgeAuth tests fail | refusals are real |
| ZAP baseline scans | none | 1 local preview run: 0 High, 1 Medium, 1 Low, 3 Info, 58 PASS, about 75 s | first |
| ASVS L2 requirements walked | 0 | 253 (158 met, 45 n/a, 50 gap) | +253 |
| Open register rows from this task | 0 | 14 (5 owner) | +14 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `pagesAuth` flights case failed after its first commit | The flights client sends its own Google consent cookie (SOCS); the test checked header names | The test now checks that the caller's credential values never ride along (follow-up commit) |
| `docker pull ghcr.io/zaproxy/zaproxy:stable` refused | The proxy blocks the ghcr blob host; the Docker daemon was also not running | Started `dockerd`; pulled `zaproxy/zap-stable` from Docker Hub and pinned that digest in the workflow |
| `wrangler pages dev` stopped at start | The Workers AI binding needs a remote session and a token | The local job runs from a temporary `wrangler.toml` without `[ai]`; Ask answer refuses with `no_ai`, which does not matter for a header scan |
| Gate step heredoc on a plain `run:` line | YAML folds a plain multi-line scalar into one line | Switched to `run: |` before the first commit; the steps were then run as parsed from the YAML |
| Full pytest in this container: 804 passed, 2 failed, 9 skipped (`test_rating_inputs::test_beauty_v2_reads_no_register`, `test_rating_stability::test_adding_places_moves_nobody_else`) | Both read `app_data` files that are Git LFS pointers here (LFS objects not pulled in the cloud checkout); this task changes no Python | None needed from this task; CI checks out with its own LFS setting |
| Three ASVS verdicts claimed more than the code shows | Written from memory: `eqeqeq` (no such lint rule), repeated query keys (first value wins), `no-store` on Edge JSON (only some answers) | Reworded before commit; each checked by grep |

## Screens checked

None: no change a traveller sees. The ZAP run covered the app shell, `boot.json`, `robots.txt`, `sitemap.xml` and the icons as served by the local preview.

## What is still open

Findings of the walk and the scan, each a row in `Execution/_OPEN.md`:

- T1164-a (owner) Run the preview ZAP job after each preview deploy. Only the local preview was scanned here.
- T1164-b (owner) Live auth probes of the deployed functions. The CI tests run the real handlers, but not Supabase's gateway or Auth. This would also close T1079-f.
- T1164-c Least privilege. The Pages AI event sink (`functions/_lib/aiEvents.mjs`, T1139) holds the service role key to insert `ai_model_events`. `pagesAuth.test.mjs` pins this as the only use, so no second one can appear unreviewed. The Edge Functions also write as the service role.
- T1164-d Cloudflare Pages adds `Access-Control-Allow-Origin: *` to static answers (ZAP Medium). The Edge Functions already use an allow-list.
- T1164-e There is no `404.html`, so a missing path answers 200 with `index.html` on the local Pages preview, against what the `_headers` comment promises. To confirm on the preview.
- T1164-f (owner) Password and MFA policy. The change-password form enforces composition rules (ASVS V6.2.5), there is no context word list, and travellers have no MFA (L2 V6.3.3).
- T1164-g supabase-js 2.110.2 defaults to the implicit OAuth flow, and the app does not set PKCE (checked in `node_modules`).
- T1164-h Security documents ASVS L2 expects: crypto inventory, log inventory, data classification, session policy, remediation time frames, resource-heavy features.
- T1164-i Security event logging and log shipping.
- T1164-j (owner) Session inactivity and absolute limits, and OTP lifetime, in the Dashboard.
- T1164-k A `deno test` job for runtime fidelity (the research recommendation).
- T1164-l No antivirus scan on uploads.
- T1164-m parse-booking SSRF: DNS rebinding and redirect hops.
- T1164-n (owner) `graphql_public` is exposed by default and the app does not use it.

Outside this task's files, recorded here without a new row: `docs/security/threat-model.md` gap 15 ("No ZAP baseline, no ASVS walk") and its section 7 note about a wrong-signature test should point at this task the next time the threat model is edited; `docs/README.md` does not list `asvs.md` yet. T1079-f stays open until the live probe (T1164-b), because the stubbed test runs the real handler but not the deployed one.

## Owner steps (for the checklist)

- [T1164-a] Scan the preview with ZAP | the CI gate has only seen a local preview; the real headers come from Cloudflare's edge and can differ | deploy the preview as usual; GitHub, Actions, zap, Run workflow, job "preview", target `https://preview.carta-app.pages.dev`; read the summary table (the job fails on any High) and note Mediums in the register | `.github/workflows/zap.yml`
- [T1164-b] Probe the live Edge Functions' auth | the tests prove the handler code, not the deployed gateway and Supabase Auth | `curl -i -X POST https://<ref>.supabase.co/functions/v1/plan-day -H 'content-type: application/json' -d '{}'` and expect 401; repeat with `-H 'Authorization: Bearer <an expired access token>'` and with the anon key as the bearer, both 401; `curl -i -X POST https://<ref>.supabase.co/functions/v1/stripe-webhook -H 'stripe-signature: t=1,v1=00' -d '{}'` and expect 400; then close T1079-f | `continent-app/tests/edgeAuth.test.mjs`, `Execution/P15/T1164-security-testing.md`
- [T1164-f] Decide the password and MFA policy | ASVS L2 forbids composition rules and asks for MFA for every account; today the form demands upper case, a digit and a symbol, and only the admin has TOTP | decide: drop the three composition rules and keep length plus the leaked-password check; decide whether travellers get optional TOTP; name the context words to refuse (Carta, the traveller's name and e-mail) | `continent-app/src/lib/passwordStrength.js`, `docs/security/asvs.md` V6
- [T1164-j] Set session lifetimes in Supabase | sessions never time out and e-mail codes live an hour | Supabase Dashboard, Authentication, Sessions: set an inactivity timeout and time-boxed sessions (both may need the Pro plan); Authentication, Providers, Email: OTP expiry 600 seconds; record the values in `_OPEN-auth-settings.md` | `Execution/P15/_OPEN-auth-settings.md`, `docs/security/asvs.md` V7
- [T1164-n] Close the unused GraphQL endpoint | pg_graphql answers introspection on the project although the app never uses GraphQL | Supabase Dashboard, Settings, API: remove `graphql_public` from the exposed schemas (or Database, Extensions: disable pg_graphql); then load the app and confirm nothing broke | `supabase/config.toml`, `docs/security/asvs.md` V4.3

## Rollback procedure

`git revert` the T1164 commits on this branch. Nothing is one-way: no migration, deploy or secret was touched, and the workflow only reads.
