# Data classification

Every kind of data Carta creates or handles, sorted into four protection levels, with the protection each level needs. Built by T1211 (row T1164-h, ROADMAP C10) on 2026-11-07. Covers ASVS 5.0.0 V14.1.1 (data identified and classified) and V14.1.2 (protection requirements per level).

The list of personal data, its lawful basis and its retention table by table is `docs/legal/ARTICLE30.md` (sections 2 and 2a); this file does not repeat the retention days, it adds the level. Secrets are listed by name in `SECRETS.md` and by algorithm in `crypto-inventory.md`. A task that adds a table, a column with personal data, a secret or a new kind of file classifies it here in the same commit.

## 1. Levels

| Level | Meaning | Harm if it leaks |
|---|---|---|
| **S, Secret** | Credentials, keys and tokens that grant access | Takeover of an account, the data or the money |
| **C, Confidential** | Personal data that can hurt a person if exposed, or that the law guards closely | Identity, location, money or legal exposure for a traveller |
| **P, Personal** | Ordinary personal data tied to an account | Privacy loss, no direct financial or safety harm |
| **O, Open** | Data meant to be public, or with nothing personal in it | None |

Carta does not ask for special category data (GDPR Article 9). Free text (notes, Ask chats, feedback, booking documents) may still hold it, which is one reason those fields sit at C or P and never in logs.

## 2. What sits at each level

| Data | Level | Where | Source |
|---|---|---|---|
| Service role key, Stripe keys, R2 and Cloudflare tokens, backup keys, HMAC secrets, salts, Hetzner token | S | Secret stores only | `SECRETS.md` |
| Passwords (as hashes), TOTP seeds, refresh and access tokens | S | Supabase Auth; the session in the browser's `localStorage` | `session-policy.md` |
| Trip share tokens, co-plan link tokens, waitlist and price alert link tokens | S | `trip_shares` (009), `coplan_links` (052), signed links in mail | Migrations; `crypto-inventory.md` |
| Booking documents a traveller uploads, and what the import extracts (confirmation codes, totals, links) | C | Sent to Gemini by `parse-booking`; results in `ai_plan_cache` (24 h serve, 7 days kept) and the traveller's trip | `supabase/functions/parse-booking/index.ts` |
| Payment records: Stripe session, amount, fee, billing country, waiver consent | C | `entitlements`, `pass_grants` (007, 025, 044); card data never reaches Carta | `ARTICLE30.md` row 8 |
| Email addresses (account, waitlist, price alert, report contact) | C | `auth.users`, `waitlist_signups` (066), `price_alert_consent` (073), `content_reports` (037) | `ARTICLE30.md` rows 1, 15, 23, 25 |
| Original GPX tracks and photos before the privacy pass (home location, times, health fields, EXIF GPS) | C | Private bucket `user-uploads` while pending; trimmed and stripped by `gpxPrivacy.js` and `stripImageMeta.js` | `supabase/functions/upload-scan/logic.mjs`, migration 061 |
| A coordinate from "use my location" | C | Sent to Nominatim, not stored | `ARTICLE30.md` row 18 |
| Admin audit trail, moderation reports and statements | C | `admin_audit_log`, `content_reports`, `moderation_statements` | Migrations 014, 037, 039, 062 |
| Group expenses, settlements and pay links | C | `group_trip_expenses`, `group_trip_settlements`, `pay_links` (058) | Migration 058 |
| Trips, stops, day plans, notes, saved things, settings, taste profile, Ask chats | P | `trip_plans`, `trip_plan_stops`, `day_plans`, `account_things`, `ask_chats`, `user_settings`; also device copies in `localStorage` | `ARTICLE30.md` rows 3, 20 |
| Profile, friends, badges, group and shared list membership, join requests | P | `profiles`, `friendships`, `user_achievements`, 055 to 059 tables | `ARTICLE30.md` rows 2, 21 |
| AI usage counts, model events with an account id, paywall events, failure records, feedback, email log | P | `ai_usage`, `ai_model_events`, `paywall_events`, `edge_errors`, `parse_failures`, `feedback`, `email_log` | `log-inventory.md` |
| Pseudonymous hashes (guide readers, reporters, Ask questions) | P | `guide_views` (045), `content_reports` (037), `ai_model_events` call rows (071) | Treated as personal because the salt holder could match a guess |
| Request metadata with IP (platform logs) | P | Cloudflare and Supabase, never a Carta table | `log-inventory.md` |
| The catalogue: places, prices, trails, photos with licence, wire files | O | R2 (`data.carta-europetravel.com`), `continent-app/public/` | `docs/SCHEMA.md` |
| Published guides, public shared trips, approved uploads | O (by the owner's choice) | `trip_plans.visibility` (019), `user_uploads` after review | Migrations 019, 061 |
| Daily counters with no account (launch, channel, funnel, taste, AI totals, cache and cap events) | O | 048, 067, 070, 072, 029, 030 | `ARTICLE30.md` rows 13 to 13d |

## 3. Protection requirements per level

| Requirement | S, Secret | C, Confidential | P, Personal | O, Open |
|---|---|---|---|---|
| Where it may be stored | Secret stores only (Supabase secrets and Vault, Cloudflare and GitHub secrets, box `.env` mode 600). Never git, never a table a client can read | Supabase, behind row level security; private Storage bucket | Supabase behind row level security; the traveller's own device | Anywhere, including public caches |
| Who may read it | The code that uses it; the owner | The person it is about; the service role; admins only through audited definer functions | The person; people they share with by an explicit act (share link, co-planner, friend visibility) | Anyone |
| In transit | TLS only; in headers, never in a URL a log keeps (signed mail links are the one exception and are single-purpose, expiring HMACs) | TLS only | TLS only | TLS (HSTS) |
| At rest | Platform encryption plus access control | Platform encryption; backups encrypted with OpenPGP (`ops/backup_nightly.sh`) | Platform encryption; encrypted backups | No extra requirement |
| Logs | Never logged, in any layer | Never logged as content; at most a code, size or kind (`parse_failures`) | Account id only where a row must be tied to an account; set to null on deletion | Free |
| Caching | Never cached | `no-store` or POST-only answers; the AI cache for booking results serves 24 hours only | Not in shared caches | Edge and browser caches on purpose |
| Sent to third parties | Only to the service it authenticates to | Only the processors in `ARTICLE30.md` section 3, for the purpose named there | Same | Free |
| Retention | Until rotated (`crypto-inventory.md`) | The shortest the purpose allows; days in `ARTICLE30.md` 2a | `ARTICLE30.md` 2a | Not limited |
| On account deletion | Sessions end | Deleted or anonymised (`delete_user()`, 069 erase trigger); payment records kept without a name for VAT | Deleted by cascade | Published items go with the account |
| Export (Article 15, 20) | Never exported | The person's own rows, in `export_user_data()` | Same | n/a |
| Checks that guard it | `secret-scan.yml`, Semgrep (`static-analysis.md`) | `rls-policies.yml`, `admin-rpc-security.yml`, `continent-app/scripts/admin/test_privacy_gdpr.mjs` | Same | `schema-contract.yml` (every wire key is declared in `docs/wire.schema.json`, so a new field is reviewed) |

## 4. Gaps

- Pending uploads hold C data until the scan runs; the scan cron needs migration 061 applied and its secret set (T1070-a).
- The payment record's retention length is an owner decision (T1118-b).
- Device copies of P data in `localStorage` stay until the traveller signs out with "clear this device" (`clearDeviceThings`, `AuthContext.jsx`); a shared computer keeps them otherwise.
