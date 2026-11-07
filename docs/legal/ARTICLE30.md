# Record of processing activities (GDPR Article 30)

Draft for the owner to check and sign. Written 2026-10-03 by T319 from the
repository, replacing the draft in `Execution/P1/T022-trademark-and-article-30.md`,
which was wrong in six places (listed at the end). This is documentation, not
legal advice.

Brought current on 2026-11-06 by T1118 (ROADMAP C9) for migrations 049 to 069,
including tonight's 065 (synced account things), 066 (waitlist, mailed
through Resend) and 067 (channel counts). Section 2a is new: one retention
line for every table in the database, checked against the catalogue by
`continent-app/scripts/admin/test_privacy_gdpr.mjs`, which fails when a
migration adds a table this section does not name. The day counts in 2a are
plain drafts for the owner's legal review (register row T1118-a).

Every fact below cites the file it comes from. The record describes the system
as written in `supabase/migrations/` (002 to 069) and `supabase/functions/`.
Several of those migrations are not yet pasted into the live project
(`archive/plans/_OPEN-MASTER.md` stage 2.2 says "Nothing has been pasted" for 022,
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
| Date of record | 2026-10-03, brought current 2026-11-06 (T1118) |
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
| 6 | AI response cache | Not linked to a person (keyed by a hash of the request) | Parsed booking results may hold booking references and prices; names, emails and phone numbers are excluded by the prompt (`parse-booking/index.ts` header) | Free retry of an identical request | Legitimate interest, 6(1)(f) | `ai_plan_cache` (006) | Served for 24 hours (parse-booking) or 7 days (plan-day); deleted after 7 days by the daily `privacy_retention_sweep()` (069, closes the gap of row T319-c) |
| 7 | AI quota and usage | Account holders | Counts of AI units per period and day; which model answered and whether it fell back | Enforce the pass allowance; cost control | Contract, 6(1)(b) | `ai_plan_usage` (006), `ai_usage` (007), `ai_usage_days` (044), `ai_model_events` (028, 071) | Until deletion, cascade; `ai_model_events` plan and ground rows 180 days (069 sweep), call rows (no user id, 071) 30 days |
| 8 | Passes and payments | Buyers | Pass tier, dates, Stripe session id, amount, currency, billing country, Stripe fee, the withdrawal-waiver consent, the paywall reason | Provide the pass; VAT (OSS) threshold | Contract, 6(1)(b); legal obligation, 6(1)(c) for the VAT figures | `entitlements`, `pass_grants` (007, 025, 026, 044) | Kept after account deletion with the account id set to null (051 section 11, T217-d), so the sale, VAT figures and waiver consent survive without a name; the length of the VAT record is an owner decision (row T1118-b) |
| 9 | Pass offer log (paywall events) | Visitors and account holders | Event (shown, dismissed, checkout), reason, tier, account id or null for a guest | Measure the pass funnel | Legitimate interest, 6(1)(f) | `paywall_events` (022) | 180 days: `prune_paywall_events(180)` (022) runs inside the daily `privacy_retention_sweep()` (069). On account deletion the account id is set to null |
| 10 | Failure records | Account holders | Function, error code, HTTP and upstream status, account id; render crashes as `app`/`client_crash` with no message, stack or page | Find and fix outages | Legitimate interest, 6(1)(f) | `edge_errors` (040, 047) | 90 days, pruned by the writer on every call (`040_edge_errors.sql` line 183, `047` line 216) and by the daily sweep (069). Account id set to null on deletion |
| 11 | Booking parse failures | Account holders | Input kind, size, mime type, which check failed, app version, account id; never the content | Find and fix import failures | Legitimate interest, 6(1)(f) | `parse_failures` (042) | 30 days, pruned on write (`042_parse_failures.sql` line 138) and by the daily sweep (069). Account id set to null on deletion |
| 12 | Guide view counter | Readers of public guides | sha256 of a private salt, the UTC day and the reader's user id, or IP address when signed out (IPv6 by /64) | Count views once per reader per day | Legitimate interest, 6(1)(f) | `guide_views`, `guide_view_counts` (045) | Hashes for today and yesterday only: each counted view deletes older days (`045_admin_followups.sql` line 764). The per-guide total is kept and is not personal data |
| 13 | Launch counters | None identifiable | One integer per day per event, partner and surface; no account, time, page or device | Count finished trips, partner clicks, AI calls | Not personal data (`048` header, T315) | `launch_counts` (048) | Not limited |
| 13b | Channel counts | None identifiable | One integer per day per utm_source and medium bucket; no account, time, page, referrer or device, no cookie or local identifier | Know which campaign brings visits | Not personal data (same basis as row 13, T1109) | `channel_counts`, `channel_daily_total` (067) | Not limited |
| 13c | Product funnel counts | None identifiable | One integer per day per funnel step (Explore opened, place opened, plan started, priced draft, trip saved, shared); no account, time, page, place, trip, referrer or device, no cookie or local identifier | Know where visits drop out of the planning path | Not personal data (same basis as rows 13 and 13b, T1129) | `funnel_counts`, `funnel_daily_total` (070) | Not limited |
| 13d | Taste chip counts | None identifiable | One integer per day per event (chip shown, accepted, rejected), taxonomy facet and position bucket; no account, node, place, trip, time, page, referrer or device, no cookie or local identifier | Know how often the taste profile is right (acceptance rate) | Not personal data (same basis as rows 13 to 13c, T1152) | `taste_counts`, `taste_daily_total` (072) | Not limited |
| 14 | Feedback | Anyone who writes | Message, kind, optional reply email, app context, account id | Answer and fix | Legitimate interest, 6(1)(f) | `feedback` (017) | 2 years (069 sweep). Deleted with the account (069 erase trigger): the text and reply address are the traveller's |
| 15 | Content reports (DSA notices) | Reporters and guide owners | Reason text, optional contact email, reporter id, salted sha256 of the reporter's address, the reported guide and its owner | Notice and action under the DSA | Legal obligation, 6(1)(c) (DSA Art. 16) | `content_reports` (037) | 12 months after the decision (`moderation_retention_purge`, 051, also run by the 069 sweep). On the reporter's account deletion the reporter id is set to null and 069 clears the contact address and name; the reason and decision stay as the DSA record |
| 16 | Statements of reasons and complaints | Guide owners | The statement, the owner's complaint, the decision | DSA Art. 17 and 20 | Legal obligation, 6(1)(c) | `moderation_statements` (039) | 3 years after the statement or its complaint decision (051 purge, also run by the 069 sweep); owner id set to null on deletion |
| 17 | Admin audit trail | Admins and the accounts they act on | Admin id, action, target account, before and after values | Accountability for admin actions | Legitimate interest, 6(1)(f) | `admin_audit_log` (014, 033, 062, 064) | 3 years (069 sweep). On the target's account deletion the email and handle are removed from the detail; the action, reason and opaque account id stay for accountability, Art. 17(3)(e) |
| 18 | Location lookup | Visitors | A coordinate, only when the traveller presses "use my location" | Name the place | Consent, 6(1)(a) (the browser's own prompt) | Sent to Nominatim; not stored (privacy policy) | Not stored |
| 20 | Synced account things and Ask chats | Account holders | Trips kept from the finder, bookmarked trips, trips in progress, the device trip (065); the yes and no on taste chips and the taste profile with its evidence counts (072, T1152); Ask Carta chats (054) | Keep the traveller's work across devices | Contract, 6(1)(b) | `account_things` (065), `ask_chats` (054) | Until deletion, cascade. Removed things keep a tombstone (id and time only) until the account goes, because the sync needs it (T1104) |
| 21 | Group trips, shared lists, join requests, co-plan links | Account holders and the travellers they plan with | Group membership, options, votes, budgets, expenses and settlements, pay links; shared lists, items and votes; join requests; co-plan invite links and their rate-limit attempts | Plan and pay together | Contract, 6(1)(b) | `group_trips`, `group_trip_members`, `group_trip_options`, `group_trip_votes`, `group_trip_budgets` (055), `group_trip_expenses`, `group_trip_settlements`, `pay_links` (058), `shared_lists`, `shared_list_members`, `shared_list_items`, `shared_list_votes` (059), `trip_join_requests` (057), `coplan_links`, `coplan_link_attempts` (052), `friend_visibility` (056) | Until deletion, cascade (a group or list goes with its owner, a membership with its member); `coplan_link_attempts` 7 days (069 sweep) |
| 22 | Opt-in emails | Account holders who turn them on | The two switches, language, consent time; one log row per email sent (kind and trip or place ref) | Trip reminders and price drops | Consent, 6(1)(a) (off until switched on, `consented_at` set by the database) | `email_prefs`, `email_log` (060); sent through Resend | Prefs until deletion; log 400 days (069 sweep), both cascade |
| 23 | Waitlist and newsletter | Anyone who leaves an address | Email address, language, source page, sign-up, confirmation and unsubscribe times, send count | Tell people when Carta opens; newsletter | Consent, 6(1)(a), double opt-in (066) | `waitlist_signups` (066); mailed through Resend | Never confirmed: 30 days (`waitlist_purge(30)` in the 069 sweep). Confirmed: until unsubscribe. Unsubscribed: the address stays as the do-not-mail list. Deleted when an account with the same address is deleted (069), or on request by email |
| 24 | Uploads (photos, GPX tracks) | Account holders who upload | The file, its licence and credit, the OSM permission, review status, decision and statement of reasons | Show travellers' photos and tracks on places | Contract, 6(1)(b) | `user_uploads`, `upload_purge_queue` (061), private Storage bucket `user-uploads` | Until the owner removes it or the account goes (cascade; 061's trigger queues the whole folder, which upload-scan deletes within 15 minutes). Declined or removed files are deleted after the contest period; the row stays as the record |
| 25 | Price alerts | Account holders who save an alert and confirm it | Email, language, the consent request, confirmation and unsubscribe times with the wording version; per alert the place or trip, its label, dates or month, nights, party, bed tier, home and destination airports, the chosen share, the baseline and last totals, the check, fire and expiry times | Email once when a saved place or trip gets cheaper by the share chosen | Consent, 6(1)(a), double opt-in: an unticked box at save time, then one confirmation email; no alert email before the click, none after an unsubscribe (073, T1205) | `price_alerts`, `price_alert_consent` (073); priced on the box with no address or account id (`pipeline/price_alerts.py`); mailed through Resend by the `price-alerts` function | An alert ends 90 days after saving or on its first travel date; it is deleted 30 days after that or after its one email (`price_alert_purge()`, run by the box after each check). The consent row stays until the account is deleted (cascade) as the record of consent and of the unsubscribe |
| 19 | Hosting and request logs | Every visitor | IP address and request metadata | Serve the app and the data files | Legitimate interest, 6(1)(f) | Cloudflare Pages and R2 (T293), Supabase platform logs | Set by each provider |

Not personal data and not listed above: `ai_cache_events` (029, destination and
hit only, "No user id, deliberately"), `ai_cap_events` (030, reason, kind and
tier only), the daily totals tables, `pipeline_runs` (041), `site_config` (014).
Every table, personal or not, has its retention line in section 2a.

## 2a. Retention, table by table

Every table in `public` after 072, in the order `\dt` lists them. "Cascade"
means the rows go when the account is deleted (`delete_user()`, 005, or
`admin_delete_user`, 064), through `on delete cascade`. "Sweep" means
`privacy_retention_sweep()` (069), which pg_cron runs daily at 03:23 UTC once
pg_cron is enabled (owner step T1118-c). "Erase" means the 069 trigger that
runs before an account is deleted. The day counts are drafts for the owner's
legal review (T1118-a); each is one constant in 069.

| Table | Migration | Personal | Retention | How |
|---|---|---|---|---|
| `account_things` | 065 | Yes | Until the account is deleted, tombstones included | Cascade |
| `admin_audit_log` | 014 | Yes (admin, target account) | 3 years; on the target's deletion email and handle leave the detail | Sweep, erase |
| `admin_users` | 014 | Yes (admin id) | While the person is an admin | Cascade, or by hand |
| `ai_cache_events` | 029 | No | 400 days | Sweep |
| `ai_cap_events` | 030 | No | 400 days | Sweep |
| `ai_daily_total` | 007 | No (one total per day) | Not limited | None needed |
| `ai_model_events` | 028, 071 | Yes on plan and ground rows; call rows (071) carry no user id | Plan and ground rows 180 days (069 sweep); call rows 30 days (071 `ai_events_prune`, pg_cron `carta_ai_events_prune`) | Sweep, cascade, prune |
| `ai_plan_cache` | 006 | Possibly (booking references), not linked to a person | 7 days | Sweep |
| `ai_plan_usage` | 006 | Yes | Until the account is deleted | Cascade |
| `ai_usage` | 007 | Yes | Until the account is deleted | Cascade |
| `ai_usage_days` | 044 | Yes | Until the account is deleted | Cascade |
| `ask_chats` | 054 | Yes | Until the account is deleted, tombstones included | Cascade |
| `channel_counts` | 067 | No | Not limited | None needed |
| `channel_daily_total` | 067 | No | Not limited | None needed |
| `funnel_counts` | 070 | No | Not limited | None needed |
| `funnel_daily_total` | 070 | No | Not limited | None needed |
| `content_overrides` | 018 | Admin id only | While the override is in force | By hand (admins) |
| `content_report_salt` | 037 | No (a secret) | Not limited | None needed |
| `content_reports` | 037 | Yes | 12 months after the decision; contact address cleared on decision (051); reporter id, address and name cleared when the reporter's account goes | 051 purge in the sweep, erase |
| `coplan_link_attempts` | 052 | Yes | 7 days | Sweep, cascade |
| `coplan_links` | 052 | Yes | Until revoked or the account is deleted | Cascade |
| `day_plans` | 004 | Yes | Until the account is deleted, tombstones included | Cascade |
| `edge_error_daily_total` | 040 | No | Not limited | None needed |
| `edge_errors` | 040 | Yes | 90 days; account id set to null on deletion | Writer prune, sweep |
| `email_log` | 060 | Yes | 400 days | Sweep, cascade |
| `email_prefs` | 060 | Yes | Until the account is deleted | Cascade |
| `entitlements` | 007 | Yes | Until the account is deleted | Cascade |
| `feedback` | 017 | Yes | 2 years; deleted with the account | Sweep, erase |
| `friend_visibility` | 056 | Yes | Until the account is deleted | Cascade |
| `friendships` | 011 | Yes | Until either account is deleted | Cascade |
| `group_trip_budgets` | 055 | Yes | Until the member's account is deleted | Cascade |
| `group_trip_expenses` | 058 | Yes | Until the group, or the payer's or author's account, is deleted | Cascade |
| `group_trip_members` | 055 | Yes | Until the group or the member's account is deleted | Cascade |
| `group_trip_options` | 055 | Yes | Until the group or the author's account is deleted | Cascade |
| `group_trip_settlements` | 058 | Yes | Until the group or either party's account is deleted | Cascade |
| `group_trip_votes` | 055 | Yes | Until the group or the voter's account is deleted | Cascade |
| `group_trips` | 055 | Yes | Until the owner's account is deleted | Cascade |
| `guide_view_counts` | 045 | No (one total per guide) | While the guide exists | Cascade from `trip_plans` |
| `guide_view_salt` | 045 | No (a secret) | Not limited | None needed |
| `guide_views` | 045 | Pseudonymous hash | Today and yesterday only | Writer prune, sweep |
| `infra_ledger` | 031 | Admin id only | Not limited (business cost record) | None |
| `launch_counts` | 048 | No | Not limited | None needed |
| `launch_daily_total` | 048 | No | Not limited | None needed |
| `moderation_statements` | 039 | Yes | 3 years after the statement or complaint decision; owner id set to null on deletion | 051 purge in the sweep |
| `oss_alerts` | 044 | No (yearly sales total) | Not limited | None needed |
| `parse_failures` | 042 | Yes | 30 days; account id set to null on deletion | Writer prune, sweep |
| `pass_grants` | 007 | Yes | Kept for the VAT and waiver record with the account id set to null on deletion; period is an owner decision (T1118-b) | Set null |
| `pay_links` | 058 | Yes | Until the account is deleted | Cascade |
| `paywall_daily_total` | 022 | No | 400 days | 022 prune in the sweep |
| `paywall_events` | 022 | Yes | 180 days; account id set to null on deletion | 022 prune in the sweep |
| `pipeline_runs` | 041 | No | Not limited | None needed |
| `plan_tiers` | 007 | No (price catalogue) | Not limited | None needed |
| `price_alert_consent` | 073 | Yes | Until the account is deleted: the request, confirmation and unsubscribe dates are the record of consent | Cascade |
| `price_alerts` | 073 | Yes | Until 30 days after the alert fires or expires (90 days after saving or the first travel date, whichever is first); with the account at the latest | Purge (`price_alert_purge` after each box run), cascade |
| `profiles` | 010 | Yes | Until the account is deleted | Cascade |
| `saved_trips` | schema.sql | Yes | Until the account is deleted | Cascade |
| `shared_list_items` | 059 | Yes | Until the list or the author's account is deleted | Cascade |
| `shared_list_members` | 059 | Yes | Until the list or the member's account is deleted | Cascade |
| `shared_list_votes` | 059 | Yes | Until the list or the voter's account is deleted | Cascade |
| `shared_lists` | 059 | Yes | Until the owner's account is deleted | Cascade |
| `site_config` | 014 | Admin id only | Not limited | None |
| `taste_counts` | 072 | No | Not limited | None needed |
| `taste_daily_total` | 072 | No | Not limited | None needed |
| `trip_collaborators` | 020 | Yes | Until either account is deleted | Cascade |
| `trip_join_requests` | 057 | Yes | Until either account is deleted | Cascade |
| `trip_plan_stops` | 002 | Yes | Until the account is deleted | Cascade |
| `trip_plans` | 002 | Yes | Until the account is deleted | Cascade |
| `trip_shares` | 009 | Yes | Until revoked, expired or the account is deleted | Cascade |
| `upload_purge_queue` | 061 | File paths (hold the account id) | Until upload-scan deletes the files, every 15 minutes | upload-scan |
| `user_achievements` | 013 | Yes | Until the account is deleted | Cascade |
| `user_settings` | schema.sql | Yes | Until the account is deleted | Cascade |
| `user_uploads` | 061 | Yes | Until removed or the account is deleted; files of declined uploads after the contest period | Cascade, 061 sweep |
| `waitlist_signups` | 066 | Yes | Unconfirmed 30 days; confirmed until unsubscribe; unsubscribed kept as the do-not-mail list; deleted with an account of the same address | 066 purge in the sweep, erase |

Outside `public`: `auth.users` (Supabase Auth) until the account is deleted;
Storage objects in `user-uploads` as `upload_purge_queue` above; provider logs
as row 19.

## 3. Recipients

| Recipient | Role | Data | Contract | Transfer outside the EEA |
|---|---|---|---|---|
| Supabase | Processor | Rows 1 to 17 and 20 to 24 (database, auth, Storage, Edge Functions) | Data Processing Addendum, version 1, 2026-08-01, accepted with the terms (T018) | Project is EU-hosted (privacy policy); SCCs in Schedule 2 (EU, UK, Swiss) for any transfer (T018) |
| Google (Gemini API) | Processor | Row 5: prompts, documents and responses | Gemini API Additional Terms (2026-03-23) and the Cloud Data Processing Addendum; Paid Services terms apply to EEA developers on both quotas, so no training on prompts (T018) | **Yes.** The Developer API has no regional endpoint; processing is global, under the Cloud DPA's SCCs (T018). Disclosed in the policy since T270 |
| Stripe | Processor for payments made for Carta; independent controller for its own fraud prevention and legal duties (T018 body; T018's open-items paragraph says "joint controller", row T319-a asks the owner to settle the wording against Stripe's DPA) | Row 8: account email (`customer_email`), account id (`client_reference_id`), card and billing details collected on Stripe's page (`checkout/index.ts`) | Stripe DPA, last updated 2025-11-18, part of the Stripe Services Agreement (T018) | Yes, under Stripe's Data Transfer Addendum and the EU-US Data Privacy Framework (T018) |
| Resend | Processor (transactional and newsletter email: `notify` for trip reminders and price drops, 060; `waitlist` for the confirmation mail and newsletter, 066) | Rows 22 and 23: the recipient's address, the mail's text (trip places and dates, or the confirmation link) | Resend's Data Processing Addendum; acceptance with the account is not yet recorded (owner step T1118-d) | Resend is US-based; the transfer basis (DPF or SCCs in Resend's DPA) to be read and recorded by the owner (T1118-d) |
| Cloudflare | Processor (hosting: Pages for the app, R2 for the data files, DNS and proxy for the domain, T293) | Row 19: IP address and request metadata of every visitor | Cloudflare Data Processing Addendum, version 6.4, effective 2026-04-03, part of the Self-Serve Subscription Agreement; text read by the owner 2026-10-07, the dashboard has no separate accept step (T300-j) | Yes (US), under the EU-US Data Privacy Framework (DPA clause 6.4); EU SCCs Module Two, with the UK Addendum and Swiss terms, apply if that certification lapses (clause 6.2) |
| OpenStreetMap Nominatim, FOSSGIS routing (`routing.openstreetmap.de`), Overpass | Independent recipients, public services | Coordinates or address text a traveller searches, a town's area for live research (`src/lib/cityResearch.js`), and the visitor's IP | None (public services) | Server location not checked by T319 |
| CARTO and OpenStreetMap tiles, Wikimedia, Geograph, flagcdn.com, foto-webcam.eu | Independent recipients: the browser fetches files from them directly (`public/_headers` CSP `img-src`, `frame-src`; fonts are self-hosted from `public/fonts` since T199) | The visitor's IP and the file requested | None | Some of these CDNs serve globally; not checked by T319 |

## 4. Data subject rights

| Right | How it is met | Source |
|---|---|---|
| Access, Art. 15, and portability, Art. 20 | "Download my data" in the Account panel calls `export_user_data()`, which reads `auth.uid()` only, and downloads one JSON file. Schema 4 (069) adds settings, saved trips, Ask chats, synced things, email preferences and log, uploads, group trips, shared lists, friend visibility, join requests, co-plan links and the waitlist sign-up with the account's address to schema 3's keys, so every table with a user column is in the file; other travellers' ids are stripped | `024_export_user_data.sql`, `045` (schema 2), `048`/`051` (schema 3), `069` (schema 4), `src/auth/AccountPanel.jsx` |
| Rectification, Art. 16 | Name, handle and trips are edited in the app; email through Supabase Auth | `AccountPanel.jsx` |
| Erasure, Art. 17 | "Delete my account" calls `delete_user()`, which deletes the calling user. Cascades empty rows 1 to 4, 7 and 20 to 24; 069's trigger then deletes the waitlist sign-up with the account's address and the traveller's feedback, clears the contact address and name on reports they filed and the address and handle in audit rows about them. Kept, anonymised: the purchase record (row 8, VAT), paywall, failure and parse rows (9 to 11), the DSA records (15, 16) and the audit row's opaque account id (17). Proved end to end by `test_privacy_gdpr.mjs`: after the delete no uuid column holds the account id and no text column holds the address, outside that audit id | `005_delete_user.sql`, `069_privacy_gdpr.sql`, the `on delete` clauses in section 2a |
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

- T1118-a: the legal review of every retention line in section 2a and of this record's wording (the day counts are drafts).
- T1118-b: how long the anonymised `pass_grants` VAT and waiver record is kept, then add it to the sweep.
- T1118-c: 069 is pasted and pg_cron enabled, so the sweep runs daily; until then nothing sweeps on a schedule.
- T1118-d: Resend's DPA and transfer basis read and recorded in section 3.
- Settled since 2026-10-03: T319-b and T319-c (the 069 sweep prunes `paywall_events` at 180 days and `ai_plan_cache` at 7 days; parse-booking rows are not told apart from plan-day rows, so both go at 7 days), T217-d (051 keeps `pass_grants` with the id set to null), T068-g and T070-g (051's purge).
- The Supabase region was not re-read for this record; confirm "EU" in the Dashboard (T319-a).

## Sign-off

Checked and adopted by the controller:

Name: ______________________  Date: ______________  Signature: ______________________
