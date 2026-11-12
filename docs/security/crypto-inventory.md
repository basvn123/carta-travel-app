# Cryptographic inventory and key lifecycle

Every algorithm, key and certificate Carta uses, where it is used and how each key is made, kept, rotated and retired. Built by T1211 (row T1164-h, ROADMAP C10) on 2026-11-07 from the code. Covers ASVS 5.0.0 V11.1.1 (key management policy and lifecycle) and V11.1.2 (cryptographic inventory).

Names only: no key value is written here. Where each secret lives and what a leak costs is in `SECRETS.md`; this file adds the algorithm and the lifecycle. A task that adds a key, a hash or a signature updates this file and `SECRETS.md` in the same commit.

## 1. Algorithms in use

| Algorithm | Purpose | Where (code) | Key or input |
|---|---|---|---|
| TLS (versions and ciphers set by the platform) | Every connection a browser makes: the app, R2 data, Supabase, Stripe | Cloudflare (Pages, R2 custom domain), Supabase, Stripe | Platform certificates (section 3) |
| HSTS, 2 years, `includeSubDomains`, `preload` | Keep browsers on HTTPS | `continent-app/public/_headers` (`Strict-Transport-Security: max-age=63072000`) | n/a |
| JWT signature (Supabase Auth access tokens) | Session token the app sends to Supabase and the Edge Functions | Issued and checked by Supabase Auth; Edge Functions call `auth.getUser` | Supabase JWT signing key. The algorithm (legacy shared secret or asymmetric key) is a Dashboard setting (Project Settings, JWT Keys), not visible in the repo |
| Password hashing | Traveller and admin passwords | Supabase Auth; Carta code never stores or hashes a password | Managed by Supabase Auth |
| TOTP (RFC 6238) | Admin second factor (aal2) | `continent-app/src/components/admin/useMfa.js`; enforced in SQL by `supabase/migrations/062_admin_audit.sql` | Per-admin TOTP seed held by Supabase Auth |
| HMAC-SHA256, truncated to 32 base64url characters (192 bits) | Waitlist confirm and unsubscribe links | `supabase/functions/waitlist/logic.mjs` `linkToken` | `WAITLIST_SECRET` |
| HMAC-SHA256, truncated to 32 base64url characters | Price alert confirm and unsubscribe links | `supabase/functions/price-alerts/logic.mjs` `linkToken` | `PRICE_ALERTS_LINK_SECRET` |
| HMAC-SHA256 | One-click unsubscribe links in trip reminder and price drop mail | `supabase/functions/notify/logic.mjs` `unsubToken` | `NOTIFY_SECRET` |
| HMAC-SHA256, 24 hour expiry | Free refine token for an AI day plan | `supabase/functions/plan-day/logic.mjs` `signRefineToken`, `verifyRefineToken` | `SUPABASE_SERVICE_ROLE_KEY` (see section 5) |
| HMAC-SHA256 (Stripe's signature scheme) | Prove a webhook came from Stripe | `supabase/functions/stripe-webhook/index.ts` (`constructEventAsync`) | `STRIPE_WEBHOOK_SECRET` |
| SHA-256 then constant-time compare | Shared secret headers on machine-to-machine calls | `supabase/functions/_shared/http.mjs` `secretMatches` (notify, price-alerts), `supabase/functions/upload-scan/logic.mjs` `secretOk`, `continent-app/workers/flight-sweep/src/ingest.mjs` (`crypto.subtle.timingSafeEqual`) | `NOTIFY_SECRET`, `PRICE_ALERTS_BOX_SECRET`, `UPLOADS_SCAN_SECRET`, `INGEST_TOKEN` |
| Salted SHA-256 (pseudonymisation) | Count guide readers and reporters without storing who they are | `supabase/migrations/045_admin_followups.sql` (guide views), `037_content_reports.sql`, `051_moderation_and_admin_decisions.sql`, `061_user_uploads.sql` (Postgres `sha256()`) | Salts in `guide_view_salt` and `content_report_salt` (one row each, no client grant) |
| Salted SHA-256 | Count repeated Ask questions without keeping the text | `continent-app/functions/_lib/aiEvents.mjs` `hashQuery`, called from `functions/api/ask/answer.js` | `AI_EVENTS_SALT` (not set yet, T1139-b) |
| SHA-256 (unkeyed) | Cache keys and content addresses: AI plan cache, Ask answer cache, boot index key, CSP style hash | `supabase/functions/plan-day/index.ts`, `parse-booking/index.ts`, `continent-app/src/lib/ask/context.js` `packKey`, `src/lib/bootIndex.js`, `src/lib/tripExport.js` | None. Not a security control; a collision only costs a cache miss or hit |
| SHA-256 (unkeyed), compared with `hmac.compare_digest` | Intelligence API keys stored as hashes | `services/intelligence/` (threat model section 14) | Keys in the box `.env`, hashes only |
| SHA-1 (unkeyed) | Content address of a derived photo (`img/{ab}/{cd}/{sha1}/`) | `pipeline/photos/derive.py`, `continent-app/src/lib/heroImage.js` | None. Naming only, not a security control |
| SHA-256 checksum sidecars | Integrity of backups and downloaded tools | `ops/backup_supabase.sh`, `ops/backup_nightly.sh`, `ops/restore_supabase.sh`, `infra/hetzner/cax11/cloud-init.yaml`, `infra/hetzner/jobs/*.sh` | None |
| OpenPGP, symmetric, AES-256 | Laptop database dump | `ops/backup_supabase.sh` (`gpg --symmetric --cipher-algo AES256`) | A passphrase kept in the owner's password manager |
| OpenPGP, public key | Nightly database dump on the box, sent to R2 | `ops/backup_nightly.sh` (`gpg --encrypt --recipient "$CARTA_BACKUP_KEY"`) | Owner's OpenPGP key pair: public half on the box, secret half off it. Key type not recorded in the repo |
| OpenPGP | Trails lab database dump | `infra/hetzner/jobs/trailslab.sh` | `CARTA_TRAILSLAB_DUMP_CRYPT`, `CARTA_WORKER_GPG_KEY_FILE` |
| Random tokens from `gen_random_uuid()` (UUID v4) | Trip share links (one UUID), co-plan links (two UUIDs, 64 hex), salts (two UUIDs) | `supabase/migrations/009_trip_shares.sql`, `052_coplan_links.sql`, `037_content_reports.sql`, `045_admin_followups.sql` | Postgres random source |
| `crypto.getRandomValues`, `crypto.randomUUID` | Prompt fence nonce (6 bytes); event ids | `continent-app/functions/_lib/aiGuard.js` `makeNonce`, `functions/_lib/aiEvents.mjs`, `src/lib/errorEvent.js` | Web Crypto random source |
| At-rest encryption | Database, Storage, R2 objects, Supabase Vault | Supabase and Cloudflare, platform managed | Platform keys; not configurable or visible from the repo |

Not used anywhere in Carta code: MD5 for security, custom ciphers, ECB modes, home-made random numbers (`Math.random` for a secret). The Semgrep rules in `.semgrep/carta.yml` and `docs/security/static-analysis.md` are where a new use would be caught.

## 2. Keys and their lifecycle

Lifecycle states follow NIST SP 800-57 Part 1: generate, distribute, store, use, rotate, revoke on compromise, destroy. "Owner" means the step is only the owner's (a Dashboard, a secret store); open owner steps are register rows.

| Key | Generated by | Stored | Rotation | On compromise | Destroyed |
|---|---|---|---|---|---|
| Supabase JWT signing key | Supabase | Supabase | Owner, Dashboard (JWT Keys). Rotating signs every traveller out | Rotate at once; every session ends | Old key revoked in the Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` / `CARTA_SUPABASE_SERVICE_KEY` | Supabase | Supabase (Edge Functions), GitHub secret, box `.env` | Owner, with the JWT keys; yearly and on exposure (T1059-c). Also invalidates open refine tokens (harmless: they last 24 hours) | Rotate, then update GitHub and the box | Old key revoked |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` | Stripe | Supabase secrets | Owner, Stripe Dashboard ("roll key"); before live mode and yearly | Roll at once; forged events stop | Stripe expires the old one |
| `WAITLIST_SECRET`, `PRICE_ALERTS_LINK_SECRET`, `NOTIFY_SECRET` | Owner, `openssl rand -hex 32` (`supabase/functions/price-alerts/README.md`) | Supabase secrets; `NOTIFY_SECRET` also as vault `notify_secret` (060) | Yearly and on exposure. Rotating makes links in mail already sent fail: unsubscribe falls back to the Account switch, so rotate between sends | Rotate; old links stop working | Overwritten |
| `UPLOADS_SCAN_SECRET` + vault `uploads_scan_secret` | Owner, long random string | Supabase secret and Supabase Vault (same value) | Yearly and on exposure, both in one sitting (`SECRETS.md`, "Rotating the upload scan secret") | Rotate both | Overwritten |
| `PRICE_ALERTS_BOX_SECRET` | Owner, `openssl rand -hex 32` | Supabase secret; box `.env` | Yearly and on exposure, both places together | Rotate both | Overwritten |
| `INGEST_TOKEN` / `CARTA_SWEEP_INGEST_TOKEN` | Owner | Worker secret; box `.env` | Yearly and on exposure | Rotate both | Overwritten |
| `AI_EVENTS_SALT`, `guide_view_salt`, `content_report_salt` | Owner (Ask salt); migrations 037 and 045 (two UUIDs, once) | Pages secret; database rows with no client grant | Not rotated: a new salt only breaks repeat counting across the change. Rotate if the salt leaks | Replace; past hashes can no longer be matched | Replaced |
| Backup passphrase (laptop dumps) | Owner | Password manager, never beside the dump | When a person who knew it leaves, or on exposure; old dumps keep the old passphrase | New passphrase for new dumps; re-encrypt or delete old ones | Old dumps deleted by hand |
| Backup OpenPGP key pair (`CARTA_BACKUP_KEY`) | Owner, `gpg --gen-key` off the box | Public key on the box; secret key off the box, with a copy offline | Every 2 years or on exposure; keep the old secret key until the last dump made with it has aged out (30 days on R2, `ops/backup_nightly.sh`) | New pair, re-import on the box; delete dumps made under the old key once a new restore is proven | Old secret key destroyed after the retention window |
| TOTP seeds (admin) | Supabase Auth at enrolment | Supabase Auth; the admin's authenticator app | On a lost or replaced device: unenrol and enrol again (`docs/owner/auth-settings.md` step 2) | Remove the factor in SQL, enrol again | `auth.mfa_factors` row deleted |
| Third-party API keys (Gemini, Resend, Cloudflare, R2, Hetzner, data sources) | The provider | As `SECRETS.md` lists | Owner: yearly for Critical and High radius keys, on exposure always (`docs/owner/secrets-rotation.md`) | Roll at the provider | Revoked at the provider |

Policy in one paragraph: every key is made by the platform or by a CSPRNG (`openssl rand`, `gpg`), never typed by hand; it lives only in a secret store (Supabase secrets, Supabase Vault, Cloudflare secrets, GitHub secrets, the box `.env`, mode 600 for the `carta` user, `infra/hetzner/cax11/cloud-init.yaml`) and never in git (`secret-scan.yml`); one key serves one purpose; Critical and High keys are rotated at least yearly and at once on any suspected exposure; the rotation date goes into the "Last rotated" column of `SECRETS.md`.

## 3. Certificates

| Certificate | Issued and renewed by | Covers |
|---|---|---|
| Edge certificate for `carta-europetravel.com`, `www`, `data.` | Cloudflare, automatic (edge certificate) | The app and the R2 data domain |
| `*.pages.dev`, `*.workers.dev` | Cloudflare, automatic | Preview deploys and the flight sweep Worker |
| `*.supabase.co` | Supabase, automatic | Database API, Auth, Edge Functions, Storage |

Carta holds no private key for any certificate and runs no TLS listener of its own (the Intelligence API on the box binds to 127.0.0.1 only). The minimum TLS version and HSTS at the Cloudflare zone are Dashboard settings that nobody has checked into the repo.

## 4. Review

Re-walk this inventory when a task adds a signature, a hash used for security, a token or a secret, and in full before ROADMAP C11 (the external check). The quick check: `grep -rnE "crypto\.subtle|createHmac|gen_random|sha256\(|gpg " continent-app/functions continent-app/src continent-app/workers supabase ops infra`.

## 5. Known weaknesses

- The plan-day refine token is keyed with `SUPABASE_SERVICE_ROLE_KEY` instead of a key of its own, so one key serves two purposes. A separate `REFINE_TOKEN_SECRET` would follow the one-key-one-purpose rule.
- `PRICE_ALERTS_LINK_SECRET`, `PRICE_ALERTS_BOX_SECRET` and `SENTRY_DSN` are read by code but have no row in `SECRETS.md` yet.
- Most "Last rotated" cells in `SECRETS.md` say "Not recorded", and the leaked `carta-r2-admin` token is not rolled (T291-b, T1059-c).
- The JWT signing algorithm and the zone's minimum TLS version are not recorded from the Dashboards.
