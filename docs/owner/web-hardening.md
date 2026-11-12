# Owner procedure: web and API hardening (T1079, C5)

The code is on `main`. The Edge Function half is live: checked 2026-11-12, an `OPTIONS` to `plan-day` from `https://evil.example` answers 403 with no `Access-Control-Allow-Origin`, and from `https://www.carta-europetravel.com` answers 204 with that origin echoed. Two steps are left.

## 1. Check the headers after the next live deploy (T1079-a)

On 2026-11-12 the live site still sent the old headers (no `Cross-Origin-Opener-Policy`, the short `Permissions-Policy`, `wss://*.supabase.co` in the CSP); `continent-app/public/_headers` on `main` has the new ones. They go live with the next `node scripts/ship.mjs --live`.

1. After that deploy: `curl -sI https://www.carta-europetravel.com/ | grep -i -E "cross-origin-opener|permissions-policy|content-security-policy"`. Expect `same-origin-allow-popups`, the long Permissions-Policy (with `bluetooth=()`) and a CSP with no `wss:`.
2. Open the site, use the map, Plan, a trip's print view and the sign-in link once; the browser console must show no `securitypolicyviolation`. If the print popup is blocked, set COOP to `unsafe-none` in `public/_headers` and tell the next session.

## 2. A rate limit that holds across the edge (T1079-b)

The Functions limit per isolate only; on 2026-11-12, 45 quick calls to `/api/forecast` all answered 200.

1. Cloudflare Dashboard, Workers & Pages, `carta-app`, Settings, Bindings: if a "Rate limiting" binding is offered, add one named `RATE_LIMIT` (the code already calls `env.RATE_LIMIT.limit({ key })`).
2. Either way, add the backstop: Security, WAF, Rate limiting rules, Create rule. Expression `starts_with(http.request.uri.path, "/api/")`, characteristic IP, 30 requests per 10 seconds, action Block. Deploy.
3. Check: `for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code} " "https://www.carta-europetravel.com/api/forecast?lat=46.5&lon=8"; done` ends in 429 or 403.

## Not done here, on purpose

The Wikimedia and Geograph hosts stay in `img-src` until the image ladder is live (row T052-f). (`style-src` no longer needs `'unsafe-inline'`: T1090 replaced it with two hashes.) If the app is ever served from another origin, `supabase secrets set ALLOWED_ORIGINS=https://that.origin`.
