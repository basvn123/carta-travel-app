# Owner procedure: web and API hardening (T1079, C5)

The code is on `main`. The Edge Function half is live: checked 2026-11-12, an `OPTIONS` to `plan-day` from `https://evil.example` answers 403 with no `Access-Control-Allow-Origin`, and from `https://www.carta-europetravel.com` answers 204 with that origin echoed. Two steps are left.

## Steps

Both steps live in `docs/owner/cloudflare.md` since owner sweep round 2 (2026-11-12), so there is one copy of each:
- the header check after the next live deploy: cloudflare.md part 1 step 6;
- the cross-edge rate limit on `/api/`: cloudflare.md part 2 (WAF rule; Pages refuses rate limit bindings, T1157).

## Not done here, on purpose

The Wikimedia and Geograph hosts stay in `img-src` until the image ladder is live (row T052-f). (`style-src` no longer needs `'unsafe-inline'`: T1090 replaced it with two hashes.) If the app is ever served from another origin, `supabase secrets set ALLOWED_ORIGINS=https://that.origin`.
