# upload-scan

The server half of the photo and track upload path (T1070, register row T333-a). Migration `061_user_uploads.sql` holds the table, the private bucket `user-uploads`, its policies and the RPCs; this function does what SQL cannot: it runs the privacy pass on every pending upload and deletes files through the Storage API.

Every 15 minutes pg_cron posts `{"job":"scan"}` with the header `x-uploads-secret`. One run sweeps stale reservations (`uploads_sweep`), empties the purge queue (`upload_purge_queue`) through `storage.remove()`, then downloads each pending upload not yet scanned, runs `scanUpload` from `logic.mjs` (the same `stripImageMeta.js` and `gpxPrivacy.js` the app runs on the device, copied into `../_shared`) and records the result with `upload_mark_scanned`. `admin_decide_upload` refuses to publish an upload this pass has not cleared.

No AI is called. Nothing is public until an admin publishes.

## Deploy (owner)

The full ordered procedure is `docs/owner/uploads.md`. In short:

```
supabase secrets set UPLOADS_SCAN_SECRET=<a long random string>
supabase functions deploy upload-scan --no-verify-jwt
```

Then add the vault secrets `uploads_scan_url` (`https://<project-ref>.supabase.co/functions/v1/upload-scan`) and `uploads_scan_secret` (the same value), and paste 061 again so it schedules the job.

## Files

- `index.ts`: the I/O (sweep, purge, scan).
- `logic.mjs`: the pure rules, tested by `continent-app/tests/uploadScan.test.mjs`.
- `../_shared/stripImageMeta.js`, `../_shared/gpxPrivacy.js`: byte-identical copies of `continent-app/src/lib/`; the test fails when they drift. Change the app copy, then copy it here.
