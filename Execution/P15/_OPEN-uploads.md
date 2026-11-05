# Owner procedure: switch on the upload path (T1070, rows T333-a and T1070-a)

Migration 061 and the `upload-scan` Edge Function are written and tested on a local Postgres 18; nothing is applied to the live project. Do these in order. Each step says how to see it worked. Never `db push` against `ntssxktaduxzpsmejwyv`.

Do not start before the legal check of the upload Terms section and the OSM tick (T333-b, owner step J4) and the 30-day notice of the Terms change (T333-f): uploads must not go live before both. Steps 1 to 5 can be done earlier, because nothing is public until step 7 and the form keeps answering honestly.

1. **Check 060 is applied.** SQL editor: `select to_regclass('public.email_prefs');` answers `email_prefs`. If it answers null, paste 055 to 060 first, in order, each with its self-check notice.
2. **Paste 061.** SQL editor, New query, paste the whole of `supabase/migrations/061_user_uploads.sql`, Run. Expect the notice `user uploads self-check passed`. A notice about pg_cron or the vault secrets is expected the first time; step 5 fixes it.
3. **Check the bucket.** Dashboard, Storage: a bucket `user-uploads` exists, marked Private, file size limit 25 MB, allowed types `image/jpeg, image/png, application/gpx+xml`. Under Storage, Policies, `objects` shows `user_uploads_insert_own_slot`, `user_uploads_read_own_or_admin`, `user_uploads_read_published` and nothing that updates or deletes.
4. **Deploy the Edge Function.** From the repo root, with the Supabase CLI logged in to the project:
   ```
   supabase secrets set UPLOADS_SCAN_SECRET=<a new long random string, 32 bytes or more>
   supabase functions deploy upload-scan --no-verify-jwt
   ```
   Keep the secret value out of chat, logs and git. Add the row to `docs/security/SECRETS.md` (name only) in the next task that touches it (T1070-b).
5. **Schedule it.** Dashboard, Database, Extensions: `pg_cron` and `pg_net` on (they already are if 060 scheduled its reminders). Dashboard, Project Settings, Vault (or `select vault.create_secret(...)` in the SQL editor): add `uploads_scan_url` = `https://ntssxktaduxzpsmejwyv.supabase.co/functions/v1/upload-scan` and `uploads_scan_secret` = the same value as `UPLOADS_SCAN_SECRET`. Paste 061 again; expect `upload-scan scheduled every 15 minutes through pg_cron`. Check: `select jobname, schedule from cron.job where jobname = 'carta_uploads_scan';` answers one row.
6. **Try one upload yourself.** Signed in on the live site, open any trail page, "Add a photo or track", send a photo. Then in the SQL editor: `select status, scan_result from public.user_uploads order by created_at desc limit 1;` shows `pending` and, within 15 minutes, `scan_result` `clean` or `cleaned`. Dashboard, Edge Functions, upload-scan, Logs shows a 200 with `scanned: 1`.
7. **Publishing stays off until the review list exists (T333-c).** Until then an upload can be decided only from the SQL editor, which writes no audit row and skips the guard; do not publish that way. Leave uploads pending.
8. **If anything is wrong**, roll back: empty the bucket (Storage, user-uploads, select all, Delete), then paste `061_user_uploads_down.sql`; it stops with a message if the bucket still holds files.

When steps 1 to 6 are done, row T1070-a can close.
