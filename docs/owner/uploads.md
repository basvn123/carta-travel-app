# Owner procedure: switch on the upload path (T1070, rows T333-a and T1070-a)

Uploads must not go public before two things are done:
- the legal check of the upload Terms section and the OSM tick (T333-b): done 2026-11-12 by the decisions lane (Terms "Photos and tracks you share" fixed against OSMF Contributor Terms clauses 2 and 3);
- the 30-day notice of the Terms change (T333-f): Claude sends it once Resend sends (`docs/owner/accounts-and-signups.md` step 1, ROADMAP I1).

Already done, checked live on 2026-11-12:
- 060 and 061 are applied.
- The bucket `user-uploads` is private, with a 25 MB limit and the types `image/jpeg, image/png, application/gpx+xml`. Only the three policies (insert own slot, read own or admin, read published) exist.
- `upload-scan` is deployed without the JWT check. It answers `503 not_configured` until its secret is set.

## Steps

1. **Secret and schedule.** This is `docs/owner/supabase-migrations.md` step 2: `UPLOADS_SCAN_SECRET`, the two Vault secrets `uploads_scan_url` and `uploads_scan_secret`, then only 061's schedule block. Never re-run the whole of 061: it would drop 062's MFA check from the upload read policy.
   - Check:
     ```
     supabase db query --linked "select schedule from cron.job where jobname = 'carta_uploads_scan'"
     ```
     It answers one row.
2. **Try one upload yourself** once the legal items are done.
   - Signed in on the live site, open any trail page, choose "Add a photo or track" and send a photo.
   - Run:
     ```
     supabase db query --linked "select status, scan_result from public.user_uploads order by created_at desc limit 1"
     ```
     It shows `pending`, then within 15 minutes `clean` or `cleaned`.
3. **Publishing stays off until the review list exists (T333-c).** Until then, leave uploads pending: deciding from the SQL editor writes no audit row and skips the guard.
4. **Rollback, if anything is wrong.** Empty the bucket (Storage, user-uploads, select all, Delete), then run `061_user_uploads_down.sql`. It refuses while the bucket still holds files.
