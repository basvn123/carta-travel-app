# Owner procedure: web and API hardening (T1079, C5)

The code half is merged with the batch. These steps need the Cloudflare and Supabase dashboards, so only the owner can do them. Do them in this order; each is safe to stop after.

## 1. Deploy the headers and the Functions

1. From `continent-app/`: `VITE_E2E_SEAMS= npm run build:pages`, then the deploy steps in CLAUDE.md (preview branch first, then main).
2. Check the headers on the preview URL: `curl -sI https://preview.carta-app.pages.dev/ | grep -i -E "cross-origin-opener|permissions-policy|content-security-policy"`. Expect `same-origin-allow-popups`, the long Permissions-Policy and a CSP with no `wss:`.
3. Open the preview in a browser, use the map, Plan, the print view of a trip and the sign-in link once; the console must show no `securitypolicyviolation`. If the print popup is blocked, relax COOP to `unsafe-none` in `public/_headers` and tell the next session.

## 2. Deploy the Edge Functions

1. `supabase functions deploy billing checkout notify parse-booking plan-day suggest-city` (JWT verification stays as it is for each; do not add `--no-verify-jwt` to these).
2. `supabase functions deploy stripe-webhook --no-verify-jwt` as before (Stripe sends no JWT; the signature is the check).
3. Smoke tests, with the project URL and anon key:
   - `curl -si -X OPTIONS -H "Origin: https://evil.example" https://<ref>.supabase.co/functions/v1/plan-day` must answer 403 with no `Access-Control-Allow-Origin`.
   - The same with `Origin: https://www.carta-europetravel.com` must answer 204 with that origin echoed.
   - Sign in to the app and run one Plan day suggestion; it must still work (the browser sends the origin).
4. If the app is ever served from another origin (a staging domain), set it: `supabase secrets set ALLOWED_ORIGINS=https://staging.example.com`.

## 3. Rate limits that hold across the edge

The Functions already limit per isolate. To make the limit shared:

1. Cloudflare Dashboard, Workers & Pages, `carta-app`, Settings, Bindings: look for a "Rate limiting" binding. If it is offered, add one named `RATE_LIMIT` (the code calls `env.RATE_LIMIT.limit({ key })` and needs no change). If Pages does not offer it, go to step 2.
2. Always add a WAF rate limiting rule as the backstop: Security, WAF, Rate limiting rules, custom rule. Expression `starts_with(http.request.uri.path, "/api/")`, characteristic IP, 30 requests per 10 seconds on the free plan (the lowest the plan allows is enough), action Block. Save and deploy.
3. Test: `for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code} " "https://www.carta-europetravel.com/api/forecast?lat=46.5&lon=8"; done` should end in 429 or 403 once the rule bites.

## 4. Not done here

The Wikimedia and Geograph hosts stay in img-src until the image ladder is live (row T052-f). `style-src 'unsafe-inline'` stays: React style attributes and MapLibre need it.
