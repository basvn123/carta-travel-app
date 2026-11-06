/**
 * Privacy and GDPR, end to end on a local PostgreSQL (T1118, ROADMAP C9).
 *
 *   PGHOST=127.0.0.1 PGPORT=55444 PGUSER=postgres node continent-app/scripts/admin/test_privacy_gdpr.mjs
 *
 * WHAT IT PROVES, in order:
 *
 *   0. The whole stack applies (schema.sql, then every NNN_*.sql that is not
 *      a _down file), 069 included, with its self-check notice.
 *   1. CATALOGUE. Every table in public has a line in the retention table of
 *      docs/legal/ARTICLE30.md (section 2a). A migration that adds a table
 *      fails this run until the record says how long its rows are kept.
 *   2. EXPORT. Two travellers each own a row in every table below. The
 *      victim's export_user_data() is schema 4, carries a row from each
 *      table (the schema 3 keys and the 069 keys, the waitlist sign-up with
 *      the account's own address included), and holds no id or address of
 *      the other traveller; the other traveller's export holds nothing of
 *      the victim's; a visitor cannot call it; the schema 3 body cannot be
 *      called by a client.
 *   3. DELETE. delete_user() as the victim, through the authenticated role.
 *      Afterwards no uuid column of any public table holds the victim's id
 *      and no text or jsonb column holds the victim's address, except the
 *      admin audit trail's opaque account id (kept on purpose, ARTICLE30
 *      section 4), which must no longer carry the address or handle. The
 *      other traveller's rows are all still there; the VAT record
 *      (pass_grants) and the DSA record (content_reports) stay, anonymised.
 *   4. RETENTION. Rows older than their line and rows just inside it are
 *      written for each rule; privacy_retention_sweep() as the service role
 *      deletes exactly the old ones and reports the counts; a signed-in
 *      traveller cannot run it.
 *   5. DOWN. 069_privacy_gdpr_down.sql puts schema 3 back and removes the
 *      trigger and the sweep; 069 then applies again.
 *
 * It creates and drops a database named carta_t1118_test and never touches
 * the live project. With no server reachable it SKIPS loudly and exits 0
 * (run_harnesses.mjs counts that as a failure).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.CARTA_REPO_ROOT || resolve(here, '../../..');
const migrations = resolve(repoRoot, 'supabase/migrations');
const article30 = resolve(repoRoot, 'docs/legal/ARTICLE30.md');
const DB = 'carta_t1118_test';
const PG = { host: process.env.PGHOST || '127.0.0.1', port: process.env.PGPORT || '5432', user: process.env.PGUSER || 'postgres' };
const PSQL = process.env.PSQL || 'psql';

let checks = 0;
let failures = 0;
const check = (name, cond, detail = '') => {
  checks += 1;
  if (cond) console.log(`  ok  ${name}`);
  else { failures += 1; console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); }
};

function run(db, args) {
  const r = spawnSync(PSQL, ['-h', PG.host, '-p', PG.port, '-U', PG.user, '-d', db, '-w', '-q',
    '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' } });
  return { ok: r.status === 0 && !r.error, out: String(r.stdout || '').trim(), err: String(r.stderr || (r.error ? r.error.message : '')) };
}
const must = (db, args) => { const r = run(db, args); if (!r.ok) throw new Error(r.err.trim()); return r; };
const q = (sql) => must(DB, ['-At', '-c', sql]).out;
const firstError = (err) => (err.match(/ERROR:.*$/m) || [err.trim().split('\n')[0]])[0];

// The Supabase stand-ins (auth schema, API roles, default grants, Storage)
// are the RLS suite's, read from that file so the two can never drift.
function stubs() {
  const src = readFileSync(join(here, 'test_rls_policies.mjs'), 'utf8');
  const m = src.match(/const STUBS = `([\s\S]*?)`;/);
  if (!m) throw new Error('could not read STUBS from test_rls_policies.mjs');
  return m[1];
}

const VICTIM = '00000000-0000-0000-0000-00000000d001';
const OTHER = '00000000-0000-0000-0000-00000000d002';
const ADMIN = '00000000-0000-0000-0000-00000000d0ad';
const VICTIM_EMAIL = 'victim.t1118@example.test';
const OTHER_EMAIL = 'other.t1118@example.test';

const claims = (uid) => `set request.jwt.claims = '${JSON.stringify({ sub: uid, role: 'authenticated', aal: 'aal1' })}'`;
const asUser = (uid, sql) => run(DB, ['-At', '-c', 'set role authenticated', '-c', claims(uid), '-c', sql]);
const asService = (sql) => run(DB, ['-At', '-c', 'set role service_role', '-c', `set request.jwt.claims = '{"role":"service_role"}'`, '-c', sql]);
const asAnon = (sql) => run(DB, ['-At', '-c', 'set role anon', '-c', `set request.jwt.claims = '{"role":"anon"}'`, '-c', sql]);

/** One row of the traveller's in every table the export and the delete must cover. */
function seed(uid, tag, email) {
  const tid = `00000000-0000-0000-0000-0000000${tag}a01`;
  const gid = `00000000-0000-0000-0000-0000000${tag}b01`;
  const lid = `00000000-0000-0000-0000-0000000${tag}c01`;
  must(DB, ['-c', `
    insert into public.user_settings (user_id) values ('${uid}');
    insert into public.saved_trips (user_id, destination_id, city) values ('${uid}', 'd-${tag}', 'City ${tag}');
    insert into public.trip_plans (id, user_id, label) values ('${tid}', '${uid}', 'Trip ${tag}');
    insert into public.day_plans (user_id, plan_id, payload) values ('${uid}', 'p-${tag}', '{"a":1}');
    insert into public.account_things (user_id, kind, item_id, body) values ('${uid}', 'kept', 'k-${tag}', '{"x":1}');
    insert into public.ask_chats (user_id, chat_id, title, turns) values ('${uid}', 'chat${tag}xx', 'Chat', '[]');
    insert into public.email_prefs (user_id) values ('${uid}');
    insert into public.email_log (user_id, kind, ref) values ('${uid}', 'trip_reminder', 'r-${tag}');
    insert into public.feedback (user_id, email, kind, message) values ('${uid}', '${email}', 'idea', 'Feedback from ${tag}');
    insert into public.content_reports (reason, source_hash, source_header, reporter_id, contact_email, reporter_name, target_kind, target_id)
      values ('A report long enough ${tag}', 'h-${tag}', 'none', '${uid}', '${email}', 'Name ${tag}', 'byline', 'b-${tag}');
    insert into public.paywall_events (user_id, event) values ('${uid}', 'shown');
    insert into public.edge_errors (user_id, fn, code, origin) values ('${uid}', 'plan-day', 'ai_timeout', 'edge');
    insert into public.ai_model_events (user_id, model, kind) values ('${uid}', 'm', 'plan');
    insert into public.pass_grants (user_id, tier, session_id, expires_at, amount_cents, currency, buyer_country)
      values ('${uid}', 'trip', 'cs_${tag}', now() + interval '30 days', 900, 'eur', 'BE');
    insert into public.group_trips (id, owner_id, title) values ('${gid}', '${uid}', 'Group ${tag}');
    insert into public.group_trip_members (group_id, user_id, status) values ('${gid}', '${uid}', 'joined') on conflict do nothing;
    insert into public.shared_lists (id, owner_id, name) values ('${lid}', '${uid}', 'List ${tag}');
    insert into public.shared_list_members (list_id, user_id) values ('${lid}', '${uid}') on conflict do nothing;
    insert into public.user_uploads (owner, kind, layer, item_id, storage_path, declared_bytes, licence, credit, terms_version)
      values ('${uid}', 'photo', 'trail', 't-${tag}', '${uid}/x-${tag}.jpg', 10, 'platform', 'Me ${tag}', 'v1');
  `]);
  // The waitlist through its own function, as the Edge Function writes it.
  const w = asService(`select public.waitlist_join('${email}', 'en', 'home')`);
  if (!w.ok) throw new Error(`waitlist_join: ${w.err}`);
  // An admin action about the account, with the address in its detail as 064 writes it.
  must(DB, ['-c', `insert into public.admin_audit_log (actor, action, target_user, detail)
    values ('${ADMIN}', 'reset_quota', '${uid}', jsonb_build_object('email', '${email}', 'handle', 'h${tag}', 'reason', 'support ticket'))`]);
}

/** Every (table, column, count) where a uuid column holds `uid` or a text/jsonb column holds `email`. */
function traces(uid, email) {
  const cols = q(`select table_name || '.' || column_name || '.' || data_type
                    from information_schema.columns c
                    join pg_class k on k.relname = c.table_name and k.relkind = 'r'
                    join pg_namespace n on n.oid = k.relnamespace and n.nspname = 'public'
                   where c.table_schema = 'public' and data_type in ('uuid', 'text', 'jsonb')`).split('\n').filter(Boolean);
  const hits = [];
  for (const c of cols) {
    const [t, col, type] = c.split('.');
    const pred = type === 'uuid' ? `"${col}" = '${uid}'`
      : type === 'text' ? `"${col}" ilike '%${email}%' or "${col}" = '${uid}'`
        : `"${col}"::text ilike '%${email}%' or "${col}"::text like '%${uid}%'`;
    const n = Number(q(`select count(*) from public."${t}" where ${pred}`));
    if (n > 0) hits.push(`${t}.${col}=${n}`);
  }
  return hits;
}

function runTests() {
  let work = null;
  try {
    run('postgres', ['-c', `drop database if exists ${DB} with (force)`]);
    must('postgres', ['-c', `create database ${DB}`]);
    work = mkdtempSync(join(tmpdir(), 'carta-t1118-'));
    const stubFile = join(work, 'stubs.sql');
    writeFileSync(stubFile, stubs(), 'utf8');
    must(DB, ['-f', stubFile]);
    must(DB, ['-f', resolve(migrations, '../schema.sql')]);

    const files = readdirSync(migrations)
      .filter((f) => /^\d{3}_.*\.sql$/.test(f) && !/_down\.sql$/.test(f))
      .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    let failedAt = null;
    for (const f of files) {
      const r = run(DB, ['-f', resolve(migrations, f)]);
      if (!r.ok) { failedAt = `${f}: ${firstError(r.err)}`; break; }
      if (f.startsWith('069_')) check('069 applies and its self-check passes', /privacy self-check passed/.test(r.err), r.err.slice(0, 200));
    }
    check(`the stack applies (${files.length} migrations)`, !failedAt, failedAt || '');
    if (failedAt) throw new Error(failedAt);
    check('069 is in the stack', files.some((f) => f.startsWith('069_')));

    // ---------------------------------------------------------------- 1
    console.log('\n  1. Every table in public has a retention line in ARTICLE30.md section 2a:');
    const doc = readFileSync(article30, 'utf8');
    const sec = (doc.split(/^## 2a\./m)[1] || '').split(/^## /m)[0];
    check('ARTICLE30.md has a section 2a', sec.length > 200);
    const tables = q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relkind = 'r' order by 1`).split('\n').filter(Boolean);
    const missing = tables.filter((t) => !new RegExp(`^\\|[^\\n]*\`${t}\``, 'm').test(sec));
    check(`all ${tables.length} tables are listed with a retention line`, missing.length === 0, missing.join(', '));
    check('the catalogue is not suspiciously small (>= 60 tables)', tables.length >= 60, String(tables.length));

    // ---------------------------------------------------------------- 2
    console.log('\n  2. Export:');
    must(DB, ['-c', `insert into auth.users (id, email) values
      ('${VICTIM}', '${VICTIM_EMAIL.replace('victim', 'Victim')}'), ('${OTHER}', '${OTHER_EMAIL}'), ('${ADMIN}', 'admin.t1118@example.test')`]);
    seed(VICTIM, 'd1', VICTIM_EMAIL);
    seed(OTHER, 'd2', OTHER_EMAIL);
    // A cross-traveller row: the other traveller is a member of the victim's
    // group, and the victim paid an expense the other created.
    must(DB, ['-c', `insert into public.group_trip_members (group_id, user_id, status, invited_by)
      values ('00000000-0000-0000-0000-0000000d1b01', '${OTHER}', 'joined', '${VICTIM}')`]);

    const exp = (uid) => { const r = asUser(uid, 'select public.export_user_data()::text'); try { return r.ok ? JSON.parse(r.out) : { _err: r.err }; } catch { return { _err: r.out }; } };
    const mine = exp(VICTIM);
    check('the victim\'s export is schema 4', mine.schema === 4, JSON.stringify(mine).slice(0, 160));
    const nonEmpty = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));
    for (const key of ['tripPlans', 'dayPlans', 'feedback', 'reportsFiled', 'paywallEvents', 'edgeErrors', 'aiModelEvents',
      'passGrants', 'accountActions', 'settings', 'savedTrips', 'askChats', 'accountThings', 'emailPrefs', 'emailLog',
      'uploads', 'friendVisibility', 'waitlist']) {
      if (key === 'friendVisibility') continue; // no row seeded: the key must exist
      check(`export: ${key} holds the victim's row`, nonEmpty(mine[key]), JSON.stringify(mine[key]).slice(0, 100));
    }
    check('export: profile and entitlement keys from schema 3 are still there', 'profile' in mine && 'entitlement' in mine);
    check('export: friendVisibility, joinRequests and coplanLinks keys exist', ['friendVisibility', 'joinRequests', 'coplanLinks'].every((k) => Array.isArray(mine[k])));
    check('export: groupTrips owned and memberships', nonEmpty(mine.groupTrips?.owned) && nonEmpty(mine.groupTrips?.memberships));
    check('export: sharedLists owned and memberships', nonEmpty(mine.sharedLists?.owned) && nonEmpty(mine.sharedLists?.memberships));
    check('export: the waitlist row is the account\'s own address (matched without case)', mine.waitlist?.[0]?.email === VICTIM_EMAIL, JSON.stringify(mine.waitlist));
    check('export: the waitlist send bookkeeping stays out', mine.waitlist?.[0] && !('send_count' in mine.waitlist[0]));
    check('export: no tombstoned thing', (mine.accountThings || []).every((r) => r.deleted_at == null));
    const mineText = JSON.stringify(mine);
    check('export: the other traveller\'s id and address are nowhere in the file', !mineText.includes(OTHER) && !mineText.includes(OTHER_EMAIL));
    const theirs = JSON.stringify(exp(OTHER));
    check('the other traveller\'s export holds nothing of the victim\'s', !theirs.includes(VICTIM) && !theirs.includes(VICTIM_EMAIL) && !theirs.includes('Trip d1'));
    const anon = asAnon('select public.export_user_data()');
    check('a visitor cannot call the export', !anon.ok && /permission denied/.test(anon.err), firstError(anon.err));
    const v3 = asUser(VICTIM, 'select public.export_user_data_v3()');
    check('a signed-in traveller cannot call the schema 3 body directly', !v3.ok && /permission denied/.test(v3.err), firstError(v3.err));
    const helper = asUser(VICTIM, `select public.privacy_rows('trip_plans', 'true', '{}', null)`);
    check('nor the row helper (which would read any table)', !helper.ok && /permission denied/.test(helper.err), firstError(helper.err));

    // ---------------------------------------------------------------- 3
    console.log('\n  3. Delete:');
    // The control: without 069's trigger, a deletion leaves the waitlist
    // address, the feedback and the audit detail behind, and the probe says so.
    const CONTROL = '00000000-0000-0000-0000-00000000d0c0';
    const CONTROL_EMAIL = 'control.t1118@example.test';
    must(DB, ['-c', `insert into auth.users (id, email) values ('${CONTROL}', '${CONTROL_EMAIL}')`]);
    seed(CONTROL, 'dc', CONTROL_EMAIL);
    must(DB, ['-c', 'alter table auth.users disable trigger on_auth_user_deleted_privacy']);
    must(DB, ['-c', `delete from auth.users where id = '${CONTROL}'`]);
    must(DB, ['-c', 'alter table auth.users enable trigger on_auth_user_deleted_privacy']);
    const controlLeft = traces(CONTROL, CONTROL_EMAIL).filter((h) => !h.startsWith('admin_audit_log.target'));
    check('control: with the trigger off, a deletion leaves the address behind and the probe sees it',
      ['waitlist_signups.email', 'feedback.email', 'admin_audit_log.detail'].every((t) => controlLeft.some((h) => h.startsWith(`${t}=`))),
      controlLeft.join(' '));

    const before = traces(VICTIM, VICTIM_EMAIL);
    check('before: the victim\'s id or address is in many tables (the probe sees them)', before.length >= 20, before.join(' '));
    const otherBefore = traces(OTHER, OTHER_EMAIL);
    const del = asUser(VICTIM, 'select public.delete_user()');
    check('delete_user() runs as the victim', del.ok, firstError(del.err));
    check('the auth user is gone', q(`select count(*) from auth.users where id = '${VICTIM}'`) === '0');
    const after = traces(VICTIM, VICTIM_EMAIL);
    const allowed = ['admin_audit_log.target_user', 'admin_audit_log.target'];
    const left = after.filter((h) => !allowed.some((a) => h.startsWith(`${a}=`)));
    check('after: no table holds the victim\'s id or address, beyond the audit trail\'s opaque id', left.length === 0, left.join(' '));
    check('the audit row is still there and lost the address and handle',
      q(`select count(*) from public.admin_audit_log where target_user = '${VICTIM}' and not (detail ? 'email') and not (detail ? 'handle') and detail ->> 'reason' = 'support ticket'`) === '1');
    check('the waitlist sign-up with the account\'s address is gone', q(`select count(*) from public.waitlist_signups where email = '${VICTIM_EMAIL}'`) === '0');
    check('the VAT record stays, anonymised', q(`select count(*) from public.pass_grants where session_id = 'cs_d1' and user_id is null`) === '1');
    check('the DSA report stays, without contact address or name',
      q(`select count(*) from public.content_reports where target_id = 'b-d1' and reporter_id is null and contact_email is null and reporter_name is null`) === '1');
    check('the uploaded files are queued for removal (061)', Number(q(`select count(*) from public.upload_purge_queue where path like '${VICTIM}/%'`)) >= 1);
    const otherAfter = traces(OTHER, OTHER_EMAIL);
    const otherLost = otherBefore.filter((h) => !otherAfter.includes(h)).filter((h) => !h.startsWith('group_trip_members.'));
    check('every row of the other traveller is still there (their membership of the victim\'s group goes with the group)', otherLost.length === 0, otherLost.join(' '));
    check('the other traveller\'s waitlist sign-up is untouched', q(`select count(*) from public.waitlist_signups where email = '${OTHER_EMAIL}'`) === '1');

    // ---------------------------------------------------------------- 4
    console.log('\n  4. Retention sweep:');
    must(DB, ['-c', `
      insert into public.ai_plan_cache (hash, payload, model, created_at) values ('old', '{}', 'm', now() - interval '8 days'), ('new', '{}', 'm', now() - interval '6 days');
      insert into public.edge_errors (fn, code, origin, at) values ('plan-day', 'ai_error', 'edge', now() - interval '91 days'), ('plan-day', 'ai_error', 'edge', now() - interval '89 days');
      insert into public.paywall_events (event, at) values ('shown', now() - interval '181 days'), ('shown', now() - interval '179 days');
      insert into public.feedback (kind, message, created_at) values ('idea', 'old', now() - interval '25 months'), ('idea', 'recent', now() - interval '23 months');
      insert into public.admin_audit_log (actor, action, created_at) values ('${ADMIN}', 'note', now() - interval '37 months'), ('${ADMIN}', 'note', now() - interval '35 months');
      insert into public.email_log (user_id, kind, ref, sent_at) values ('${OTHER}', 'price_drop', 'old', now() - interval '401 days'), ('${OTHER}', 'price_drop', 'new', now() - interval '399 days');
      insert into public.ai_model_events (user_id, model, kind, created_at) values ('${OTHER}', 'old', 'plan', now() - interval '181 days'), ('${OTHER}', 'new', 'plan', now() - interval '179 days');
      insert into public.coplan_link_attempts (user_id, at) values ('${OTHER}', now() - interval '8 days'), ('${OTHER}', now() - interval '6 days');
      insert into public.waitlist_signups (email, created_at) values ('stale.t1118@example.test', now() - interval '31 days'), ('fresh.t1118@example.test', now() - interval '29 days');
      insert into public.waitlist_signups (email, created_at, confirmed_at) values ('kept.t1118@example.test', now() - interval '400 days', now() - interval '399 days');
    `]);
    const gv = run(DB, ['-c', `insert into public.guide_views (plan_id, day, viewer) values
      ('00000000-0000-0000-0000-0000000d2a01', current_date - 2, repeat('a', 64)), ('00000000-0000-0000-0000-0000000d2a01', current_date - 1, repeat('b', 64))`]);
    check('guide_views seeded (two days ago and yesterday)', gv.ok, firstError(gv.err));
    const denied = asUser(OTHER, 'select public.privacy_retention_sweep()');
    check('a signed-in traveller cannot run the sweep', !denied.ok && /permission denied/.test(denied.err), firstError(denied.err));
    const sw = asService('select public.privacy_retention_sweep()::text');
    check('the service role runs the sweep', sw.ok, firstError(sw.err));
    let counts = {};
    try { counts = JSON.parse(sw.out); } catch { /* checked below */ }
    check('it reports a count per rule', ['ai_plan_cache', 'edge_errors', 'paywall_events', 'feedback', 'admin_audit_log', 'email_log',
      'ai_model_events', 'coplan_link_attempts', 'waitlist_signups', 'guide_views', 'parse_failures', 'moderation'].every((k) => k in counts), sw.out);
    const pair = (label, sql, keep) => check(`${label}: the old row went, the one inside the line stayed`, q(sql) === keep, q(sql));
    pair('ai_plan_cache (7 days)', `select string_agg(hash, ',' order by hash) from public.ai_plan_cache`, 'new');
    pair('edge_errors (90 days)', `select count(*) from public.edge_errors where at < now() - interval '80 days'`, '1');
    pair('paywall_events (180 days)', `select count(*) from public.paywall_events where at < now() - interval '170 days'`, '1');
    pair('feedback (2 years)', `select string_agg(message, ',') from public.feedback where created_at < now() - interval '20 months'`, 'recent');
    pair('admin_audit_log (3 years)', `select count(*) from public.admin_audit_log where created_at < now() - interval '30 months'`, '1');
    pair('email_log (400 days)', `select string_agg(ref, ',') from public.email_log where kind = 'price_drop'`, 'new');
    pair('ai_model_events (180 days)', `select string_agg(model, ',') from public.ai_model_events where user_id = '${OTHER}' and model in ('old', 'new')`, 'new');
    pair('coplan_link_attempts (7 days)', `select count(*) from public.coplan_link_attempts where user_id = '${OTHER}'`, '1');
    pair('guide_views (yesterday and today)', `select string_agg(left(viewer, 4), ',') from public.guide_views`, 'bbbb');
    pair('waitlist (unconfirmed after 30 days; confirmed kept)', `select string_agg(split_part(email, '.', 1), ',' order by email) from public.waitlist_signups where email like '%.t1118@%' and email not like 'other%' and email not like 'control%'`, 'fresh,kept');
    const again = asService('select public.privacy_retention_sweep()::text');
    let again2 = {};
    try { again2 = JSON.parse(again.out); } catch { /* below */ }
    check('a second sweep finds nothing left to delete', again.ok && again2.ai_plan_cache === 0 && again2.feedback === 0 && again2.edge_errors === 0, again.out);

    // ---------------------------------------------------------------- 5
    console.log('\n  5. Down and up again:');
    const down = run(DB, ['-f', resolve(migrations, '069_privacy_gdpr_down.sql')]);
    check('069_privacy_gdpr_down.sql applies', down.ok, firstError(down.err));
    const back = asUser(OTHER, 'select (public.export_user_data() ->> \'schema\')');
    check('after the down file the export is schema 3 again and callable', back.ok && back.out === '3', back.out || firstError(back.err));
    check('the erase trigger and the sweep are gone',
      q(`select count(*) from pg_trigger where tgname = 'on_auth_user_deleted_privacy'`) === '0'
      && q(`select count(*) from pg_proc where proname in ('privacy_retention_sweep', 'privacy_rows', 'export_user_data_v3')`) === '0');
    const up = run(DB, ['-f', resolve(migrations, '069_privacy_gdpr.sql')]);
    check('069 applies again after its down file', up.ok && /privacy self-check passed/.test(up.err), firstError(up.err));
    const twice = run(DB, ['-f', resolve(migrations, '069_privacy_gdpr.sql')]);
    check('and a second paste is safe', twice.ok && /privacy self-check passed/.test(twice.err), firstError(twice.err));
    const four = asUser(OTHER, 'select (public.export_user_data() ->> \'schema\')');
    check('the export is schema 4 again', four.ok && four.out === '4', four.out || firstError(four.err));
  } finally {
    run('postgres', ['-c', `drop database if exists ${DB} with (force)`]);
    if (work) { try { rmSync(work, { recursive: true, force: true }); } catch { /* leave it */ } }
  }
}

console.log('Privacy and GDPR: catalogue, export, delete, retention (T1118)');
console.log('-------------------------------------------------------------');
const probe = run('postgres', ['-At', '-c', 'select 1']);
if (!probe.ok) {
  console.log(`  SKIPPED. No PostgreSQL at ${PG.user}@${PG.host}:${PG.port}; nothing was tested.`);
  console.log(`  Reason: ${probe.err.trim().split('\n')[0]}`);
  process.exit(0);
}
try { runTests(); } catch (err) { failures += 1; console.error(`FAIL  the run aborted: ${err.message}`); }
console.log(`\n${checks} assertions, ${checks - failures} passing, ${failures} failing.`);
if (failures || checks === 0) process.exit(1);
console.log('All privacy tests passed.');
