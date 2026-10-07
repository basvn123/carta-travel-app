# Record of processing activities (GDPR Article 30)

Draft for the owner to check and sign. Written 2026-10-03 by T319 from the
repository, replacing the draft in `Execution/P1/T022-trademark-and-article-30.md`,
which was wrong in six places (listed at the end). This is documentation, not
legal advice.

Every fact below cites the file it comes from. The record describes the system
as written in `supabase/migrations/` (002 to 048) and `supabase/functions/`.
Several of those migrations are not yet pasted into the live project
(`Execution/_OPEN-MASTER.md` stage 2.2 says "Nothing has been pasted" for 022,
024, 032 to 043, 045, 047 and 048; stage 3 holds 028 to 031; stage 10 holds
021, 025 to 027 and 044). A table whose migration is not pasted holds no data
yet; its row here describes what it will hold once it is.

## 1. Controller

| Field | Value |
|---|---|
| Controller | Carta, operated from Belgium by the person or entity named in the Imprint (`continent-app/src/components/Imprint.jsx`; the registered entity is still a placeholder, rows T300-h and T014) |
| Contact for data protection | bas.vannieuwenhuyse123@gmail.com (`CONTACT` in `PrivacyPolicy.jsx`; row T216-a moves it to support@carta-europetravel.com) |
| Representative, DPO | None. No DPO is required: no large-scale monitoring and no special-category data |
| Supervisory authority | Gegevensbeschermingsautoriteit / Autorité de protection des données (Belgium) |
| Date of record | 2026-10-03 |
| Why a record is kept | Article 30(5) exempts organisations under 250 staff unless processing is not occasional. Sign-ups, saved trips and AI requests happen every day, so the exemption does not apply |

## 2. Processing activities

Lawful bases are the ones the privacy policy states (`PrivacyPolicy.jsx`, table
"Legal basis for processing", as revised by T319 and awaiting the owner's
approval, row T319-a).

| # | Activity | Data subjects | Personal data | Purpose | Lawful basis | Where it lives (source) | Retention |
|---|---|---|---|---|---|---|---|
| 1 | Accounts and sign-in | Account holders | Email, password hash or Google identity, sign-in times | Provide the account | Contract, 6(1)(b) | Supabase Auth `auth.users` | Until the account is deleted (`005_delete_user.sql`) |
| 2 | Profile and friends | Account holders and the friends they add | Handle, display name, emoji avatar; friend links; earned badges | Social features | Contract, 6(1)(b) | `profiles` (010), `friendships` (011), `user_achievements` (013) | Until deletion, cascade |
| 3 | Saved trips and day plans | Account holders | Trip dates, stops, notes, day plans, booking facts extracted by the import, typed own fares | Save and sync plans | Contract, 6(1)(b) | `trip_plans`, `trip_plan_stops` (002), `day_plans` (004) | Until deletion, cascade |
| 4 | Sharing and co-planning | Account holders and invited co-planners | Share links, co-planner memberships, published guides | Share a trip, plan together, publish a guide | Contract, 6(1)(b) | `trip_shares` (009), `trip_collaborators` (020), `trip_plans.visibility` (019) | Until deletion, cascade |
| 5 | AI day planner, city suggestions, booking import | Account holders | Trip dates, stops, interests, free text; documents, pasted text or a page the traveller sends | Produce the plan, suggestion or import asked for | Contract, 6(1)(b) (there is no separate consent step; T022's "consent gate" does not exist) | Sent to Google Gemini (`plan-day`, `suggest-city`, `parse-booking` call `generativelanguage.googleapis.com`) | Not kept by Carta beyond the cache in row 6 and what the traveller saves in row 3 |
| 6 | AI response cache | Not linked to a person (keyed by a hash of the request) | Parsed booking results may hold booking references and prices; names, emails and phone numbers are excluded by the prompt (`parse-booking/index.ts` header) | Free retry of an identical request | Legitimate interest, 6(1)(f) | `ai_plan_cache` (006) | Served for 24 hours (parse-booking) or 7 days (plan-day); **nothing deletes the rows** (no delete of `ai_plan_cache` in any migration or function), row T319-c |
| 7 | AI quota and usage | Account holders | Counts of AI units per period and day; which model answered and whether it fell back | Enforce the pass allowance; cost control | Contract, 6(1)(b) | `ai_plan_usage` (006), `ai_usage` (007), `ai_usage_days` (044), `ai_model_events` (028) | Until deletion, cascade |
| 8 | Passes and payments | Buyers | Pass tier, dates, Stripe session id, amount, currency, billing country, Stripe fee, the withdrawal-waiver consent, the paywall reason | Provide the pass; VAT (OSS) threshold | Contract, 6(1)(b); legal obligation, 6(1)(c) for the VAT figures | `entitlements`, `pass_grants` (007, 025, 026, 044) | Until deletion, cascade (`007_passes.sql` line 124); this also erases the sale and waiver record, owner decision in row T217-d |
| 9 | Pass offer log (paywall events) | Visitors and account holders | Event (shown, dismissed, checkout), reason, tier, account id or null for a guest | Measure the pass funnel | Legitimate interest, 6(1)(f) | `paywall_events` (022) | Policy says 180 days. `prune_paywall_events(180)` exists in 022 but nothing calls it; row T319-b makes the prune run on write. On account deletion the account id is set to null |
| 10 | Failure records | Account holders | Function, error code, HTTP and upstream status, account id; render crashes as `app`/`client_crash` with no message, stack or page | Find and fix outages | Legitimate interest, 6(1)(f) | `edge_errors` (040, 047) | 90 days, pruned by the writer on every call (`040_edge_errors.sql` line 183, `047` line 216). Account id set to null on deletion |
| 11 | Booking parse failures | Account holders | Input kind, size, mime type, which check failed, app version, account id; never the content | Find and fix import failures | Legitimate interest, 6(1)(f) | `parse_failures` (042) | 30 days, pruned on write (`042_parse_failures.sql` line 138). Account id set to null on deletion |
| 12 | Guide view counter | Readers of public guides | sha256 of a private salt, the UTC day and the reader's user id, or IP address when signed out (IPv6 by /64) | Count views once per reader per day | Legitimate interest, 6(1)(f) | `guide_views`, `guide_view_counts` (045) | Hashes for today and yesterday only: each counted view deletes older days (`045_admin_followups.sql` line 764). The per-guide total is kept and is not personal data |
| 13 | Launch counters | None identifiable | One integer per day per event, partner and surface; no account, time, page or device | Count finished trips, partner clicks, AI calls | Not personal data (`048` header, T315) | `launch_counts` (048) | Not limited |
| 14 | Feedback | Anyone who writes | Message, kind, optional reply email, app context, account id | Answer and fix | Legitimate interest, 6(1)(f) | `feedback` (017) | Kept with no limit; on deletion the account id is set to null but the text and reply email stay |
| 15 | Content reports (DSA notices) | Reporters and guide owners | Reason text, optional contact email, reporter id, salted sha256 of the reporter's address, the reported guide and its owner | Notice and action under the DSA | Legal obligation, 6(1)(c) (DSA Art. 16) | `content_reports` (037) | Kept with no limit (row T068-g); reporter id set to null on deletion |
| 16 | Statements of reasons and complaints | Guide owners | The statement, the owner's complaint, the decision | DSA Art. 17 and 20 | Legal obligation, 6(1)(c) | `moderation_statements` (039) | Kept with no limit (row T070-g) |
| 17 | Admin audit trail | Admins and the accounts they act on | Admin id, action, target account, before and after values | Accountability for admin actions | Legitimate interest, 6(1)(f) | `admin_audit_log` (014, 033) | Kept with no limit |
| 18 | Location lookup | Visitors | A coordinate, only when the traveller presses "use my location" | Name the place | Consent, 6(1)(a) (the browser's own prompt) | Sent to Nominatim; not stored (privacy policy) | Not stored |
| 19 | Hosting and request logs | Every visitor | IP address and request metadata | Serve the app and the data files | Legitimate interest, 6(1)(f) | Cloudflare Pages and R2 (T293), Supabase platform logs | Set by each provider |

Not personal data and not listed above: `ai_cache_events` (029, destination and
hit only, "No user id, deliberately"), `ai_cap_events` (030, reason, kind and
tier only), the daily totals tables, `pipeline_runs` (041), `site_config` (014).

## 3. Recipients

| Recipient | Role | Data | Contract | Transfer outside the EEA |
|---|---|---|---|---|
| Supabase | Processor | Rows 1 to 17 (database, auth, Edge Functions) | Data Processing Addendum, version 1, 2026-08-01, accepted with the terms (T018) | Project is EU-hosted (privacy policy); SCCs in Schedule 2 (EU, UK, Swiss) for any transfer (T018) |
| Google (Gemini API) | Processor | Row 5: prompts, documents and responses | Gemini API Additional Terms (2026-03-23) and the Cloud Data Processing Addendum; Paid Services terms apply to EEA developers on both quotas, so no training on prompts (T018) | **Yes.** The Developer API has no regional endpoint; processing is global, under the Cloud DPA's SCCs (T018). Disclosed in the policy since T270 |
| Stripe | Processor for payments made for Carta; independent controller for its own fraud prevention and legal duties (T018 body; T018's open-items paragraph says "joint controller", row T319-a asks the owner to settle the wording against Stripe's DPA) | Row 8: account email (`customer_email`), account id (`client_reference_id`), card and billing details collected on Stripe's page (`checkout/index.ts`) | Stripe DPA, last updated 2025-11-18, part of the Stripe Services Agreement (T018) | Yes, under Stripe's Data Transfer Addendum and the EU-US Data Privacy Framework (T018) |
| Cloudflare | Processor (hosting: Pages for the app, R2 for the data files, DNS and proxy for the domain, T293) | Row 19: IP address and request metadata of every visitor | Cloudflare Data Processing Addendum, version 6.4, effective 2026-04-03, part of the Self-Serve Subscription Agreement; text read by the owner 2026-10-07, the dashboard has no separate accept step (T300-j) | Yes (US), under the EU-US Data Privacy Framework (DPA clause 6.4); EU SCCs Module Two, with the UK Addendum and Swiss terms, apply if that certification lapses (clause 6.2) |
| Vercel | Former host, rollback only (T293: the old deployment still serves on Vercel's own URL) | Row 19 for anyone who reaches that URL | DPA covers Pro and Enterprise only; Carta was on Hobby (T018) | Yes (US) |
| OpenStreetMap Nominatim, FOSSGIS routing (`routing.openstreetmap.de`), Overpass | Independent recipients, public services | Coordinates or address text a traveller searches, a town's area for live research (`src/lib/cityResearch.js`), and the visitor's IP | None (public services) | Server location not checked by T319 |
| CARTO and OpenStreetMap tiles, Wikimedia, Geograph, flagcdn.com, foto-webcam.eu | Independent recipients: the browser fetches files from them directly (`public/_headers` CSP `img-src`, `frame-src`; fonts are self-hosted from `public/fonts` since T199) | The visitor's IP and the file requested | None | Some of these CDNs serve globally; not checked by T319 |

## 4. Data subject rights

| Right | How it is met | Source |
|---|---|---|
| Access, Art. 15, and portability, Art. 20 | "Download my data" in the Account panel calls `export_user_data()`, which reads `auth.uid()` only. Schema 3 returns 20 keys covering every table above with a user column (T315: 20 of 21 tables) | `024_export_user_data.sql`, `045` (schema 2), `048` (schema 3), `src/auth/AccountPanel.jsx` |
| Rectification, Art. 16 | Name, handle and trips are edited in the app; email through Supabase Auth | `AccountPanel.jsx` |
| Erasure, Art. 17 | "Delete my account" calls `delete_user()`, which deletes the calling user; cascades empty rows 1 to 4, 7 and 8; rows 9 to 11 and 14 to 16 keep the record with the account id set to null | `005_delete_user.sql`, the `on delete` clauses listed in section 2 |
| Objection, Art. 21 | By email; no in-app switch | Privacy policy |
| Automated decisions, Art. 22 | None. AI output is a suggestion the traveller reads; no decision about a person is automated | `TermsOfService.jsx` "The Carta bot and other AI features"; `moderation_statements.automated` is always false (039) |
| Answer time | 30 days | Privacy policy "Your rights" |

## 5. Security measures (Article 32)

- Row level security on every table; event and log tables have no client policy and no client grant, so only definer functions and the service role reach them (022, 028, 029, 030, 040, 042, 045, 048 headers).
- Security definer functions run with an empty `search_path`, and each migration's self-check refuses to apply otherwise (039, 040, 045, 048).
- Destructive admin actions need an aal2 (TOTP) session and are rate-limited by `admin_guard` tiers (032, 034); every admin action is audited (014, 033).
- The export reads `auth.uid()` and takes no user id, so it cannot be pointed at another account (T020); it is gated by re-authentication in the app.
- Passwords are handled by Supabase Auth; card data never reaches Carta (Stripe Checkout).
- Pseudonymisation where a person must be told apart without being identified: salted hashes for reporters (037) and guide readers (045).
- Encrypted database dumps kept off the laptop (T004, `docs/BACKUP.md`).

## 6. Breach procedure

Notify the Belgian authority within 72 hours of becoming aware of a breach that
risks people's rights (Art. 33), and the affected people without undue delay
when the risk is high (Art. 34). `docs/INCIDENT_RUNBOOK.md` is the operational
runbook.

## 7. What T022's draft got wrong

| T022 said | The repository says |
|---|---|
| "No international transfers occur" | Gemini processes globally (T018), Stripe transfers under its DTA and DPF, and Vercel was US-hosted |
| Supabase DPA "v3, 2024" | Version 1, 2026-08-01 (T018) |
| "User consent required before any Gemini call" | No consent gate exists; the AI features run when the traveller presses the button, so the basis is contract |
| Access: "no in-app tool exists yet" | `export_user_data()` and the Account panel button since T020, widened by 045 and 048 |
| Analytics "90 days; deleted automatically via a daily cron job" | No cron exists; 022's prune is 180 days and unscheduled (row T319-b) |
| Recipients without Stripe | Stripe receives the buyer's email and account id and is a controller in its own right for fraud and compliance (T018) |

It also named Vercel as the host; production moved to Cloudflare Pages on
2026-10-02 (T293).

## 8. Open points before signing

- T319-b: the 180-day prune of `paywall_events` must run (on write, like 040) before or with the 022 paste.
- T319-c: `ai_plan_cache` rows are never deleted; parse-booking rows should go after 24 hours.
- T217-d: account deletion erases `pass_grants`, including the VAT and waiver record.
- T068-g, T070-g: retention for content reports and statements of reasons.
- The Supabase region was not re-read for this record; confirm "EU" in the Dashboard (T319-a).

## Sign-off

Checked and adopted by the controller:

Name: ______________________  Date: ______________  Signature: ______________________
