/**
 * upload-scan, the server half of the upload path (T1070, register row
 * T333-a; migration 061_user_uploads.sql). Called by pg_cron every 15
 * minutes with the header x-uploads-secret: UPLOADS_SCAN_SECRET. One run:
 *
 *   1. uploads_sweep()   reserved rows older than a day go (their path is
 *                        queued), declined and removed files past their
 *                        contest date are queued.
 *   2. the purge queue   every queued path is deleted through the Storage
 *                        API (a row delete in storage.objects would leave the
 *                        file behind); a {uid}/ folder is listed first. A
 *                        queue row goes only once its delete succeeded.
 *   3. the privacy pass  every pending upload not yet scanned is downloaded
 *                        and run through logic.mjs scanUpload: a cleaned file
 *                        replaces the stored one, a refused one is removed;
 *                        upload_mark_scanned records the result.
 *
 * Secrets: UPLOADS_SCAN_SECRET (a long random string, also the vault secret
 * uploads_scan_secret). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by
 * the platform. Deploy with `--no-verify-jwt`: the cron call carries no
 * Supabase session, and this function checks its one door itself. No AI is
 * called here, Claude or otherwise.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { BUCKET, PURGE_BATCH, SCAN_BATCH, scanUpload, secretOk, splitPurge } from './logic.mjs';

const env = (k: string) => Deno.env.get(k) || '';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

type Db = ReturnType<typeof createClient>;

async function purge(db: Db) {
  const { data: rows, error } = await db.from('upload_purge_queue')
    .select('id, path, is_prefix').order('id').limit(PURGE_BATCH);
  if (error) return { purged: 0, failed: 0, code: 'queue_read' };
  const { files, folders } = splitPurge(rows);
  let purged = 0;
  let failed = 0;

  if (files.length) {
    const { error: rmErr } = await db.storage.from(BUCKET).remove(files.map((r) => r.path));
    if (rmErr) {
      failed += files.length;
    } else {
      await db.from('upload_purge_queue').delete().in('id', files.map((r) => r.id));
      purged += files.length;
    }
  }

  for (const f of folders) {
    const prefix = f.path.replace(/\/+$/, '');
    const { data: listed, error: listErr } = await db.storage.from(BUCKET).list(prefix, { limit: 1000 });
    if (listErr) { failed += 1; continue; }
    const names = (listed || []).map((o: { name: string }) => `${prefix}/${o.name}`);
    if (names.length) {
      const { error: rmErr } = await db.storage.from(BUCKET).remove(names);
      if (rmErr) { failed += 1; continue; }
    }
    // A folder of more than 1,000 files stays queued for the next run.
    if (names.length < 1000) await db.from('upload_purge_queue').delete().eq('id', f.id);
    purged += 1;
  }
  return { purged, failed };
}

async function scan(db: Db) {
  const { data: rows, error } = await db.from('user_uploads')
    .select('id, kind, storage_path')
    .eq('status', 'pending').is('scanned_at', null)
    .order('created_at').limit(SCAN_BATCH);
  if (error) return { scanned: 0, failed: 0, code: 'pending_read' };
  let scanned = 0;
  let failed = 0;
  for (const r of rows || []) {
    const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(r.storage_path);
    if (dlErr || !blob) { failed += 1; continue; }
    const res = scanUpload(r.kind, new Uint8Array(await blob.arrayBuffer()));
    let bytes = null;
    if (res.result === 'cleaned') {
      const { error: upErr } = await db.storage.from(BUCKET).upload(r.storage_path,
        new Blob([res.bytes], { type: res.contentType }), { contentType: res.contentType, upsert: true });
      if (upErr) { failed += 1; continue; }
      bytes = res.bytes.length;
    }
    const { data: marked, error: markErr } = await db.rpc('upload_mark_scanned',
      { p_id: r.id, p_result: res.result, p_bytes: bytes });
    if (markErr || (marked && marked.error)) { failed += 1; continue; }
    scanned += 1;
  }
  return { scanned, failed };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { code: 'method' });
  const secret = env('UPLOADS_SCAN_SECRET');
  if (!secret) return json(503, { code: 'not_configured' });
  if (!(await secretOk(req.headers.get('x-uploads-secret') || '', secret))) return json(401, { code: 'auth' });

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  const { data: swept, error: sweepErr } = await db.rpc('uploads_sweep');
  const purged = await purge(db);
  const scanned = await scan(db);
  return json(200, { swept: sweepErr ? { code: 'sweep' } : swept, ...purged, ...scanned });
});
