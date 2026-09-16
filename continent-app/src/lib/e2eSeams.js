/* Headless-verify seams.
 *
 * Several surfaces carry a ?xxxmock query param so the Playwright verify
 * scripts can render fixture states (earned badges, a withdrawn share link,
 * a paid pass, fabricated fare provenance) without live credentials.
 *
 * Those params used to be live in production, which meant
 * `https://…/?paymock` unlocked every client-side gate for anybody who
 * guessed the word — a shareable paywall bypass — and `?provmock` could make
 * stale fares render as freshly verified. They are now compiled out of any
 * build that does not explicitly ask for them.
 *
 * On in `vite dev`, and in any build run with VITE_E2E_SEAMS=1 (that is what
 * `.env` sets locally, so `npm run build && npm run preview` still satisfies
 * scripts/verify_*.mjs). Off in the Vercel production build, where the
 * variable is simply not set — Vite then folds this to `false` and the whole
 * mock branch is tree-shaken out of the bundle.
 *
 * The server still enforces every metered surface regardless; this only
 * closes the client-side display seams. */
export const E2E_SEAMS = import.meta.env.DEV
  || import.meta.env.VITE_E2E_SEAMS === '1';
