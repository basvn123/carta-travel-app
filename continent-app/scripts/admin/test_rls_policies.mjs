/**
 * The row policies keep one traveller out of another traveller's rows.
 *
 *   PGPORT=55444 node continent-app/scripts/admin/test_rls_policies.mjs
 *
 * WHAT THIS IS FOR. test_admin_rpc_security.mjs (T077) proves the admin_*
 * functions refuse a normal user. That is one half of the database's
 * posture. The other half is the row level security on the tables
 * themselves: trip_plans, day_plans, friendships and the rest are read and
 * written by the client DIRECTLY through PostgREST, with no function in
 * between, and the only thing standing between my saved trips and yours is
 * the policy on each table. Nothing in the repo exercised those policies as
 * a whole. Each migration's self-check looks at its own table once, on
 * apply, as the database owner, which bypasses RLS; so a policy that
 * quietly lets a second user read the first user's rows would have passed
 * every check the repo had.
 *
 * WHAT IS ASSERTED. Two layers, both read from the live catalogue after the
 * whole migration stack is applied, so a table added by a later migration
 * is covered the moment its file lands in supabase/migrations.
 *
 *   CATALOGUE, every table in public:
 *     1. Row level security is enabled. A table without it is open to
 *        every signed-in user through PostgREST, whatever its policies say.
 *     2. No write policy (INSERT, UPDATE, DELETE, ALL) is unconditional
 *        (`true`). A read policy may be `true` for the public catalogue
 *        tables (plan_tiers, content_overrides); a write policy never is.
 *     3. A table that has policies has an isolation fixture below. This is
 *        the tripwire for a new table: a future migration that adds a table
 *        with policies fails this run until somebody writes its fixture,
 *        which is the moment the new policy gets read by a second person.
 *     4. A table with NO policies is closed by construction (RLS on and no
 *        policy admits nobody), and that is probed rather than trusted: a
 *        signed-in user and a signed-out visitor each try to read it and
 *        to insert into it, and both must come back with nothing.
 *
 *   ISOLATION, one fixture per table with policies:
 *     The victim seeds rows through the `authenticated` role with their
 *     own claims, which is also the positive control: a policy that denied
 *     everybody would fail the seed, not pass the test. Then a second
 *     signed-in user and a signed-out visitor each try to read the
 *     victim's rows, to update them, to delete them, and to insert a row
 *     in the victim's name. Every one of those must come back with no
 *     rows or a refusal, and afterwards the victim's rows are compared
 *     against a snapshot taken before the attempt, as the database owner,
 *     so a policy that admits a write but hides the result is still caught.
 *     Where the design admits a second user on purpose (an accepted
 *     co-planner on a trip, a public site_config row) that admission is
 *     asserted too, so the test cannot pass by denying everything.
 *
 * WHY THE FIXTURES ARE HAND-WRITTEN. The discovery of tables and policies
 * is automatic; the seeding is not, because every table has its own
 * columns and its own idea of who owns a row (user_id, owner_id,
 * requester_id, invited_by). What makes the hand-written list safe is
 * check 3 above: the list cannot drift behind the schema without the run
 * saying so.
 *
 * WHY THE GRANTS ARE STUBBED. Supabase grants every table in public to the
 * three API roles by default and relies on RLS and explicit revokes to
 * narrow that. A bare Postgres grants nothing, so without the default
 * privileges below every read as `authenticated` would fail on a missing
 * GRANT, every denial would be true for the wrong reason, and the run would
 * prove nothing about the policies. The stub puts the cluster in the same
 * posture as the live project before the migrations run.
 *
 * THE HARNESS PROVES ITSELF. At the end an unconditional read policy is
 * added to trip_plans, the second user's probe is repeated and must now see
 * the victim's trip, and the policy is dropped again. If the probe could
 * not see a deliberately leaked row, nothing above was evidence.
 *
 * MIGRATIONS. Every file in supabase/migrations is applied in numeric
 * order; there is no list to keep current. 018 as committed fails on a real
 * Postgres because of the regex bound {5,600} (register row T031-d); as the
 * other harnesses do, it is applied as committed first, the failure is
 * reported, and a copy with {5,255} is applied from a temp directory. 018
 * in the repo is never edited.
 *
 * NEEDS a PostgreSQL server that accepts a password-less connection (trust
 * auth or PGPASSWORD). Set PGHOST, PGPORT, PGUSER as needed; defaults are
 * 127.0.0.1:5432, postgres. CARTA_MIGRATIONS overrides the migrations
 * directory (the sparse worktrees do not carry it). With no server
 * reachable the script SKIPS LOUDLY, exits 0, and never prints that
 * anything passed.
 *
 * It creates and drops a database named carta_t083_test. It never touches
 * the live Supabase project.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const migrations = process.env.CARTA_MIGRATIONS || resolve(repoRoot, 'supabase/migrations');

let failures = 0;
let checks = 0;
const check = (name, cond, detail = '') => {
  checks += 1;
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
};

const PSQL_CANDIDATES = [
  process.env.PSQL || '',
  'psql',
  'C:/Program Files/PostgreSQL/18/bin/psql.exe',
  'C:/Program Files/PostgreSQL/17/bin/psql.exe',
  'C:/Program Files/PostgreSQL/16/bin/psql.exe',
].filter(Boolean);

const PG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5432',
  user: process.env.PGUSER || 'postgres',
};
const TEST_DB = process.env.CARTA_TEST_DB || 'carta_t083_test';

/**
 * Floors, never equalities (CLAUDE.md, vacuous gates). A migration that adds
 * a table or a policy must not fail the build; a discovery that comes back
 * with a handful must. 33 tables and 34 policies is what 002 to 043 define.
 */
const MIN_TABLES = 33;
const MIN_POLICIES = 34;

/**
 * Policies known to call a function their caller cannot execute. This is
 * the fault class 012 and 023 repaired for profiles and trips: an RLS
 * expression runs with the privileges of whoever is querying, so a policy
 * that calls a revoked function answers 42501 instead of a row decision.
 * Each entry is asserted to STILL be broken, so the list cannot outlive the
 * bug: the migration that repairs it makes this run say "delete the entry".
 *
 *   The list is empty. Its one entry, trip_collaborators.coplan_insert_owner
 *   calling are_friends(a, b) (register row T083-a), was repaired by
 *   migration 046, which calls a one-armed is_friend_me(other) instead.
 */
const KNOWN_UNCALLABLE = [];

function findPsql() {
  for (const cand of PSQL_CANDIDATES) {
    if (cand !== 'psql' && !existsSync(cand)) continue;
    try {
      execFileSync(cand, ['--version'], { stdio: 'pipe' });
      return cand;
    } catch { /* try the next one */ }
  }
  return null;
}

/** Run psql and never throw. Returns { ok, out, err }, stderr kept either way. */
function psqlRun(bin, db, args) {
  const base = ['-h', PG.host, '-p', PG.port, '-U', PG.user, '-d', db, '-w',
    '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
  // spawnSync rather than execFileSync: a successful run's stderr carries the
  // migration self-check NOTICE, and execFileSync drops it on success.
  const r = spawnSync(bin, [...base, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
  });
  const out = String(r.stdout || '');
  const err = String(r.stderr || (r.error ? r.error.message : ''));
  return { ok: r.status === 0 && !r.error, out, err };
}

/** Run psql and throw on failure, for setup steps. */
function psql(bin, db, args) {
  const r = psqlRun(bin, db, args);
  if (!r.ok) throw new Error(r.err.trim());
  return r;
}

const scalar = (bin, db, sql) => psql(bin, db, ['-At', '-c', sql]).out.trim();
const firstError = (err) => (err.match(/ERROR:.*$/m) || [err.trim().split('\n')[0]])[0];

/**
 * What Supabase provides and a bare Postgres does not (as in
 * test_admin_rpc_security.mjs), plus the default grants the live project
 * gives every new table, sequence and function in public. The migrations
 * are written against that default: 040 and 042 say so in their own words
 * ("Supabase default-grants every new table in public to anon and
 * authenticated") and revoke what they do not want. Without the defaults
 * here, a denial would be a missing GRANT, not a policy.
 */
const STUBS = `
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  created_at         timestamptz not null default now(),
  last_sign_in_at    timestamptz,
  email_confirmed_at timestamptz,
  banned_until       timestamptz,
  raw_app_meta_data  jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create table if not exists auth.refresh_tokens (
  id      bigserial primary key,
  user_id varchar(255),
  revoked boolean default false
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$fn$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;

do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$do$;

grant usage on schema auth to authenticated, anon, service_role;

grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public
  grant all on tables to authenticated, anon, service_role;
alter default privileges in schema public
  grant all on sequences to authenticated, anon, service_role;
alter default privileges in schema public
  grant execute on functions to authenticated, anon, service_role;
`;

const VICTIM = '00000000-0000-0000-0000-00000000c001'; // owns the rows under test
const PLAIN = '00000000-0000-0000-0000-00000000c002';  // a second signed-in traveller
const THIRD = '00000000-0000-0000-0000-00000000c003';  // the victim's friend and co-planner
const PLAN = '00000000-0000-0000-0000-0000000000a1';   // the victim's trip
const SHARE = '00000000-0000-0000-0000-0000000000b1';  // the victim's share token

/**
 * One fixture per table that carries policies.
 *
 *   seed      statements that create the victim's rows. `as: 'victim'` and
 *             `as: 'third'` run through the authenticated role with that
 *             user's claims, so the seed is itself the proof that the
 *             policy admits its owner. `as: 'db'` is the service path: rows
 *             only a definer function or the service role writes.
 *   mine      a predicate that selects the victim's rows.
 *   mutate    a SET clause the attacker tries, and the victim tries as the
 *             control where `ownerWrites` is true.
 *   forge     an insert in the victim's name that the attacker tries.
 *   reads     'private'  nobody but the owner sees the rows;
 *             'public'   every role reads them (a catalogue table), so the
 *                        read must SUCCEED with rows and only writes are
 *                        denied;
 *             'rows'     a per-row flag decides; `visible` is the predicate
 *                        for the rows a stranger may see.
 *   ownerWrites  whether the owner is expected to be able to UPDATE their
 *             own row through the client (false where the table is written
 *             by functions only).
 */
const FIXTURES = [
  {
    table: 'trip_plans',
    seed: [{ as: 'victim', sql: `insert into public.trip_plans (id, user_id, label) values ('${PLAN}', '${VICTIM}', 'victim trip')` }],
    mine: `user_id = '${VICTIM}'`,
    mutate: `label = 'tampered'`,
    forge: `insert into public.trip_plans (user_id, label) values ('${VICTIM}', 'forged')`,
    reads: 'private',
    ownerWrites: true,
  },
  {
    table: 'trip_plan_stops',
    seed: [{ as: 'victim', sql: `insert into public.trip_plan_stops (trip_plan_id, user_id, position, destination_id, city) values ('${PLAN}', '${VICTIM}', 0, 'd:lisbon', 'Lisbon')` }],
    mine: `user_id = '${VICTIM}'`,
    mutate: `city = 'tampered'`,
    forge: `insert into public.trip_plan_stops (trip_plan_id, user_id, position, destination_id, city) values ('${PLAN}', '${VICTIM}', 1, 'd:porto', 'forged')`,
    reads: 'private',
    ownerWrites: true,
  },
  {
    table: 'day_plans',
    seed: [{ as: 'victim', sql: `insert into public.day_plans (user_id, plan_id, payload) values ('${VICTIM}', 'p1', '{"plan": {"id": "p1"}}')` }],
    mine: `user_id = '${VICTIM}'`,
    mutate: `payload = '{"tampered": true}'`,
    forge: `insert into public.day_plans (user_id, plan_id, payload) values ('${VICTIM}', 'forged', '{}')`,
    reads: 'private',
    ownerWrites: true,
  },
  {
    table: 'trip_shares',
    seed: [{ as: 'victim', sql: `insert into public.trip_shares (token, trip_plan_id, owner_id) values ('${SHARE}', '${PLAN}', '${VICTIM}')` }],
    mine: `owner_id = '${VICTIM}'`,
    mutate: `revoked_at = now()`,
    forge: `insert into public.trip_shares (trip_plan_id, owner_id) values ('${PLAN}', '${VICTIM}')`,
    reads: 'private',
    ownerWrites: true,
  },
  {
    // The profile row is created by 010's trigger when the account is
    // inserted, so there is nothing to seed; the update is the owner's
    // control and the read rule is "me, or someone I have a link with".
    table: 'profiles',
    seed: [{ as: 'victim', sql: `update public.profiles set display_name = 'Victim' where user_id = '${VICTIM}'` }],
    mine: `user_id = '${VICTIM}'`,
    mutate: `display_name = 'tampered'`,
    forge: `insert into public.profiles (user_id, handle) values ('${VICTIM}', 'forgedhandle')`,
    reads: 'private',
    ownerWrites: true,
  },
  {
    table: 'friendships',
    seed: [
      { as: 'victim', sql: `insert into public.friendships (requester_id, addressee_id) values ('${VICTIM}', '${THIRD}')` },
      // The addressee accepts, which is 011's respond policy exercised by
      // its owner, and what 020 needs before the victim can invite them.
      { as: 'third', sql: `update public.friendships set status = 'accepted', responded_at = now() where requester_id = '${VICTIM}' and addressee_id = '${THIRD}'` },
    ],
    mine: `requester_id = '${VICTIM}'`,
    mutate: `status = 'blocked'`,
    forge: `insert into public.friendships (requester_id, addressee_id) values ('${VICTIM}', '${PLAIN}')`,
    reads: 'private',
    ownerWrites: false, // only the addressee may change a link, by design
  },
  {
    table: 'trip_collaborators',
    seed: [
      // The invite is seeded as the victim, through 020's insert policy as
      // 046 repaired it, so the invite path itself is under test: the
      // victim owns PLAN and is an accepted friend of THIRD (the
      // friendships fixture above). Before 046 this insert was refused
      // with 42501 (register row T083-a).
      { as: 'victim', sql: `insert into public.trip_collaborators (trip_plan_id, user_id, invited_by) values ('${PLAN}', '${THIRD}', '${VICTIM}')` },
      { as: 'third', sql: `update public.trip_collaborators set status = 'accepted', responded_at = now() where trip_plan_id = '${PLAN}' and user_id = '${THIRD}'` },
    ],
    mine: `invited_by = '${VICTIM}'`,
    mutate: `status = 'accepted'`,
    forge: `insert into public.trip_collaborators (trip_plan_id, user_id, invited_by) values ('${PLAN}', '${PLAIN}', '${VICTIM}')`,
    reads: 'private',
    ownerWrites: false, // only the invitee may answer, by design
  },
  {
    table: 'entitlements',
    seed: [{ as: 'db', sql: `insert into public.entitlements (user_id, tier) values ('${VICTIM}', 'free')` }],
    mine: `user_id = '${VICTIM}'`,
    mutate: `tier = 'year'`,
    forge: `insert into public.entitlements (user_id, tier) values ('${VICTIM}', 'year')`,
    reads: 'private',
    ownerWrites: false, // Stripe and the admin write this, never the client
  },
  {
    table: 'pass_grants',
    seed: [{ as: 'db', sql: `insert into public.pass_grants (session_id, user_id, tier, expires_at) values ('cs_t083', '${VICTIM}', 'trip', now() + interval '30 days')` }],
    mine: `user_id = '${VICTIM}'`,
    mutate: `expires_at = now() + interval '100 years'`,
    forge: `insert into public.pass_grants (session_id, user_id, tier, expires_at) values ('cs_forged', '${VICTIM}', 'year', now() + interval '100 years')`,
    reads: 'private',
    ownerWrites: false,
  },
  {
    table: 'user_achievements',
    // 013's trigger already awards icebreaker when the friendship above is
    // accepted, which is why this is on conflict do nothing: the row is
    // there either way, and the trigger firing is worth not hiding.
    seed: [{ as: 'db', sql: `insert into public.user_achievements (user_id, badge) values ('${VICTIM}', 'icebreaker') on conflict do nothing` }],
    mine: `user_id = '${VICTIM}'`,
    mutate: `earned_at = now()`,
    forge: `insert into public.user_achievements (user_id, badge) values ('${VICTIM}', 'catalyst')`,
    reads: 'private',
    ownerWrites: false, // award_badge is the only writer
  },
  {
    table: 'moderation_statements',
    seed: [{ as: 'db', sql: `insert into public.moderation_statements (plan_id, owner_id, source, facts) values ('${PLAN}', '${VICTIM}', 'notice', 'test statement')` }],
    mine: `owner_id = '${VICTIM}'`,
    mutate: `reinstated = true`,
    forge: `insert into public.moderation_statements (plan_id, owner_id, source, facts) values ('${PLAN}', '${VICTIM}', 'notice', 'forged')`,
    reads: 'private',
    ownerWrites: false, // the admin decides; the owner contests through an RPC
  },
  {
    // 035: a row is readable by everyone only while its public flag is set.
    table: 'site_config',
    seed: [
      { as: 'db', sql: `insert into public.site_config (key, value, public) values ('t083_public', '{"on": true}', true)` },
      { as: 'db', sql: `insert into public.site_config (key, value, public) values ('t083_secret', '{"on": true}', false)` },
    ],
    mine: `key like 't083\\_%'`,
    visible: `key = 't083_public'`,
    mutate: `value = '{"tampered": true}'`,
    forge: `insert into public.site_config (key, value, public) values ('t083_forged', '{}', true)`,
    reads: 'rows',
    ownerWrites: false,
  },
  {
    table: 'plan_tiers',
    seed: [], // 007 seeds the three tiers itself
    mine: `tier in ('free', 'trip', 'year')`,
    mutate: `price_cents = 0`,
    forge: `insert into public.plan_tiers (tier, ai_plans, grounded, price_cents) values ('free', 999, 999, 0) on conflict do nothing`,
    reads: 'public',
    ownerWrites: false,
  },
  {
    table: 'content_overrides',
    // 043 made status, review_by and author_note mandatory.
    seed: [{ as: 'db', sql: `insert into public.content_overrides (layer, item_id, patch, status, review_by, author_note) values ('dest', 't083', '{"name": "Lisboa"}', 'temporary', now() + interval '14 days', 'Seeded by the row policy test.')` }],
    mine: `item_id = 't083'`,
    mutate: `patch = '{"name": "tampered"}'`,
    forge: `insert into public.content_overrides (layer, item_id, patch, status, review_by, author_note) values ('dest', 't083_forged', '{}', 'temporary', now(), 'Forged by the row policy test.')`,
    reads: 'public',
    ownerWrites: false,
  },
];

function runTests(bin) {
  let work = null;
  try {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    psql(bin, 'postgres', ['-c', `create database ${TEST_DB}`]);

    work = mkdtempSync(join(tmpdir(), 'carta-t083-'));
    const stubFile = join(work, 'stubs.sql');
    writeFileSync(stubFile, STUBS, 'utf8');
    psql(bin, TEST_DB, ['-f', stubFile]);

    const applyFile = (label, file) => {
      const r = psqlRun(bin, TEST_DB, ['-f', file]);
      check(`migration applied: ${label}`, r.ok, firstError(r.err));
      if (!r.ok) throw new Error(`${label} failed: ${r.err.trim()}`);
      return r;
    };

    // Every migration in the directory, in numeric order. No list to keep.
    const files = readdirSync(migrations)
      .filter((f) => /^\d{3}_.*\.sql$/.test(f))
      .sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    check('the migrations directory was found and is not empty', files.length > 0, migrations);
    if (files.length === 0) throw new Error(`no migrations in ${migrations}`);

    console.log(`  Applying ${files.length} migrations from ${migrations}:`);
    for (const name of files) {
      const file = resolve(migrations, name);
      if (name.startsWith('018_')) {
        const raw018 = psqlRun(bin, TEST_DB, ['-f', file]);
        if (raw018.ok) {
          check(`migration applied: ${name} (as committed)`, true);
        } else {
          console.log(`  note  018 as committed fails here: ${firstError(raw018.err)}`);
          const src = readFileSync(file, 'utf8');
          check('018 carries the {5,600} bound the failure points at', src.includes('{5,600}'));
          const patched = join(work, '018_content_overrides.patched.sql');
          writeFileSync(patched, src.replace('{5,600}', '{5,255}'), 'utf8');
          console.log('  note  applying a copy with {5,255} from a temp dir, for this test only');
          applyFile(`${name} (patched copy, {5,255})`, patched);
        }
        continue;
      }
      applyFile(name, file);
    }

    for (const [id, email] of [[VICTIM, 'victim@example.test'],
      [PLAIN, 'plain@example.test'], [THIRD, 'third@example.test']]) {
      psql(bin, TEST_DB, ['-c', `insert into auth.users (id, email) values ('${id}', '${email}')`]);
    }

    // ---------------------------------------------------------------------
    // Who is asking. PostgREST sets the role and request.jwt.claims; the
    // auth.uid() stub reads the same setting, so a policy sees exactly what
    // it sees live.
    // ---------------------------------------------------------------------
    const claimsSql = (claims) => `set request.jwt.claims = '${JSON.stringify(claims).replace(/'/g, "''")}'`;
    const WHO = {
      victim: { role: 'authenticated', claims: { sub: VICTIM, role: 'authenticated', aal: 'aal1' } },
      plain: { role: 'authenticated', claims: { sub: PLAIN, role: 'authenticated', aal: 'aal1' } },
      third: { role: 'authenticated', claims: { sub: THIRD, role: 'authenticated', aal: 'aal1' } },
      anon: { role: 'anon', claims: { role: 'anon' } },
    };
    /** Run one statement as a given caller. Never throws. */
    const runAs = (who, sql) => {
      if (who === 'db') {
        const r = psqlRun(bin, TEST_DB, ['-At', '-c', sql]);
        return { ok: r.ok, out: r.out.trim(), err: r.err.trim() };
      }
      const w = WHO[who];
      const r = psqlRun(bin, TEST_DB, ['-At', '-c', `set role ${w.role}`, '-c', claimsSql(w.claims), '-c', sql]);
      return { ok: r.ok, out: r.out.trim(), err: r.err.trim() };
    };
    const countAs = (who, table, pred) => runAs(who, `select count(*) from public.${table} where ${pred}`);
    const affectedAs = (who, sql) => runAs(who, `with r as (${sql} returning 1) select count(*) from r`);
    const denied = (r) => !r.ok && /permission denied|violates row-level security|row-level security policy/i.test(r.err);
    /** Nothing happened: zero rows touched, or the statement was refused. */
    const nothing = (r) => (r.ok && r.out === '0') || denied(r);
    const describe = (r) => (r.ok ? `returned ${r.out.slice(0, 80)}` : firstError(r.err));
    /** The victim's rows as the database owner, which bypasses RLS. */
    const snapshot = (table, pred) => scalar(bin, TEST_DB,
      `select count(*) || ':' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.${table} t where ${pred}`);

    // ---------------------------------------------------------------------
    // Discovery.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  Discovering the tables and policies from the catalogue:');
    const tables = JSON.parse(scalar(bin, TEST_DB, `
      select coalesce(json_agg(json_build_object(
        'name', c.relname,
        'rls', c.relrowsecurity,
        'forced', c.relforcerowsecurity,
        'policies', (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
      ) order by c.relname), '[]'::json)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')`) || '[]');
    const policies = JSON.parse(scalar(bin, TEST_DB, `
      select coalesce(json_agg(json_build_object(
        'table', tablename, 'name', policyname, 'cmd', cmd, 'permissive', permissive,
        'roles', roles, 'qual', qual, 'check', with_check
      ) order by tablename, policyname), '[]'::json)
      from pg_policies where schemaname = 'public'`) || '[]');

    check(`discovery found at least ${MIN_TABLES} tables in public`, tables.length >= MIN_TABLES, `found ${tables.length}`);
    check(`discovery found at least ${MIN_POLICIES} policies`, policies.length >= MIN_POLICIES, `found ${policies.length}`);
    if (tables.length === 0 || policies.length === 0) {
      throw new Error('discovery found nothing; every later assertion would be vacuous');
    }
    const withPolicies = tables.filter((t) => t.policies > 0);
    const closed = tables.filter((t) => t.policies === 0);
    console.log(`  note  ${tables.length} tables: ${withPolicies.length} with policies, ${closed.length} closed (RLS on, no policy); ${policies.length} policies`);

    // ---------------------------------------------------------------------
    // 1. Catalogue properties, every table.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  Every table in public has row level security on:');
    const rlsOff = tables.filter((t) => !t.rls).map((t) => t.name);
    check('row level security is enabled on every table', rlsOff.length === 0, rlsOff.join(', '));

    const openWrites = policies
      .filter((p) => p.cmd !== 'SELECT')
      .filter((p) => /^\s*true\s*$/i.test(p.qual || '') || /^\s*true\s*$/i.test(p.check || ''))
      .map((p) => `${p.table}.${p.name} (${p.cmd})`);
    check('no write policy is unconditional', openWrites.length === 0, openWrites.join(', '));

    // Every function a policy calls must be executable by the roles the
    // policy applies to, or the policy answers 42501 instead of a row
    // decision (011's fault, repaired by 012 and 023). The names are taken
    // from the deparsed expressions and matched against pg_proc in public;
    // builtins and auth.uid() are not in public and fall out on their own.
    const publicFns = JSON.parse(scalar(bin, TEST_DB, `
      select coalesce(json_object_agg(proname, json_build_object('anon', a, 'authenticated', u)), '{}'::json)
      from (
        select p.proname,
               bool_and(has_function_privilege('anon', p.oid, 'execute')) as a,
               bool_and(has_function_privilege('authenticated', p.oid, 'execute')) as u
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
         group by p.proname
      ) s`) || '{}');
    const uncallable = [];
    for (const p of policies) {
      const text = `${p.qual || ''} ${p.check || ''}`;
      const names = new Set([...text.matchAll(/(?<![\w.])(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/g)].map((m) => m[1]));
      const roles = String(p.roles || '').replace(/[{}]/g, '').split(',').filter(Boolean);
      const applies = roles.length === 0 || roles.includes('public') ? ['anon', 'authenticated']
        : roles.filter((r) => r === 'anon' || r === 'authenticated');
      for (const name of names) {
        const grants = publicFns[name];
        if (!grants) continue;
        for (const role of applies) {
          if (!grants[role]) uncallable.push({ policy: `${p.table}.${p.name}`, fn: name, role });
        }
      }
    }
    const isKnown = (u) => KNOWN_UNCALLABLE.some((k) => k.policy === u.policy && k.fn === u.fn);
    const fresh = uncallable.filter((u) => !isKnown(u)).map((u) => `${u.policy} calls ${u.fn}, which ${u.role} cannot execute`);
    check('every function a policy calls is executable by the roles the policy applies to (beyond the known entries)',
      fresh.length === 0, fresh.join('; '));
    for (const k of KNOWN_UNCALLABLE) {
      const still = uncallable.some((u) => u.policy === k.policy && u.fn === k.fn);
      check(`known: ${k.policy} still calls ${k.fn} without a grant (${k.row}); delete the entry once repaired`, still,
        `${k.policy} no longer calls ${k.fn} uncallably: remove it from KNOWN_UNCALLABLE and seed its fixture as the owner again`);
    }

    const fixtureOf = new Map(FIXTURES.map((f) => [f.table, f]));
    const unfixtured = withPolicies.filter((t) => !fixtureOf.has(t.name)).map((t) => t.name);
    check('every table with policies has an isolation fixture in this script',
      unfixtured.length === 0, `add a fixture for: ${unfixtured.join(', ')}`);
    const stale = FIXTURES.filter((f) => !tables.some((t) => t.name === f.table)).map((f) => f.table);
    check('every fixture names a table that exists', stale.length === 0, stale.join(', '));
    const fixturedButClosed = FIXTURES.filter((f) => closed.some((t) => t.name === f.table)).map((f) => f.table);
    check('no fixture names a table that has no policies (a policy was dropped, or the fixture is misplaced)',
      fixturedButClosed.length === 0, fixturedButClosed.join(', '));

    // ---------------------------------------------------------------------
    // 2. Closed tables: RLS on and no policy admits nobody. Probed, not
    //    trusted, for both client roles.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  The closed tables admit neither a signed-in user nor a visitor:');
    check('at least one table is closed', closed.length > 0, 'ai_usage, admin_users, edge_errors and the rest are expected here');
    for (const t of closed) {
      for (const who of ['plain', 'anon']) {
        const read = runAs(who, `select count(*) from public.${t.name}`);
        check(`${t.name}: ${who} reads nothing`, (read.ok && read.out === '0') || denied(read), describe(read));
        const ins = runAs(who, `insert into public.${t.name} default values`);
        // Any refusal will do: a missing grant, a policy, or a not-null
        // column the attacker cannot satisfy. What may not happen is a row.
        check(`${t.name}: ${who} cannot insert`, !ins.ok, describe(ins));
      }
    }

    // ---------------------------------------------------------------------
    // 3. Isolation, one fixture per table with policies.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  Seeding the victim\'s rows through the policies (the positive control):');
    for (const f of FIXTURES) {
      for (const s of f.seed) {
        const r = runAs(s.as, s.sql);
        check(`${f.table}: ${s.as} seeds a row`, r.ok, firstError(r.err));
      }
      const seen = countAs('victim', f.table, f.mine);
      if (f.reads === 'rows') {
        // The owner of a site_config row is the admin; a signed-in user
        // sees only the public rows, which is asserted below.
        continue;
      }
      check(`${f.table}: the victim sees their own rows`, seen.ok && Number(seen.out) > 0, describe(seen));
      if (f.ownerWrites) {
        const upd = affectedAs('victim', `update public.${f.table} set ${f.mutate} where ${f.mine}`);
        check(`${f.table}: the victim can update their own row`, upd.ok && Number(upd.out) > 0, describe(upd));
      }
    }

    console.log('');
    console.log('  A second signed-in user and a visitor get nothing from the victim\'s rows:');
    let covered = 0;
    for (const f of FIXTURES) {
      const before = snapshot(f.table, f.mine);
      check(`${f.table}: the fixture left rows to protect`, !before.startsWith('0:'), before);
      for (const who of ['plain', 'anon']) {
        const read = countAs(who, f.table, f.mine);
        if (f.reads === 'public') {
          check(`${f.table}: ${who} can read the catalogue rows`, read.ok && Number(read.out) > 0, describe(read));
        } else if (f.reads === 'rows') {
          const vis = countAs(who, f.table, f.visible);
          check(`${f.table}: ${who} sees only the public row`,
            read.ok && read.out === '1' && vis.ok && vis.out === '1', `${describe(read)} / ${describe(vis)}`);
        } else if (who === 'anon') {
          // A visitor may be stopped by a revoked grant before any policy
          // runs (013, 039 revoke select from anon). Either answer is
          // "nothing"; what may not come back is a row.
          check(`${f.table}: ${who} sees none of the victim's rows`, (read.ok && read.out === '0') || denied(read), describe(read));
        } else {
          // A signed-in user's read must SUCCEED with no rows. A 42501 here
          // is the 011 fault: a policy calling something the caller cannot
          // execute, which breaks the owner's own reads too.
          check(`${f.table}: ${who} sees none of the victim's rows`, read.ok && read.out === '0', describe(read));
        }
        const upd = affectedAs(who, `update public.${f.table} set ${f.mutate} where ${f.mine}`);
        check(`${f.table}: ${who} cannot update them`, nothing(upd), describe(upd));
        const del = affectedAs(who, `delete from public.${f.table} where ${f.mine}`);
        check(`${f.table}: ${who} cannot delete them`, nothing(del), describe(del));
        const forge = runAs(who, f.forge);
        check(`${f.table}: ${who} cannot insert in the victim's name`, !forge.ok, describe(forge));
      }
      const after = snapshot(f.table, f.mine);
      check(`${f.table}: the victim's rows are unchanged afterwards`, after === before, `${before} -> ${after}`);
      covered += 1;
    }

    // ---------------------------------------------------------------------
    // 4. Admissions the design makes on purpose. Without these the suite
    //    could pass against a database that denies everyone everything.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  What the design admits on purpose is admitted:');
    const coplan = countAs('third', 'trip_plans', `id = '${PLAN}'`);
    check('an accepted co-planner sees the trip they were invited to', coplan.ok && coplan.out === '1', describe(coplan));
    const coplanStops = countAs('third', 'trip_plan_stops', `trip_plan_id = '${PLAN}'`);
    check('and its stops', coplanStops.ok && Number(coplanStops.out) > 0, describe(coplanStops));
    const coplanDel = affectedAs('third', `delete from public.trip_plans where id = '${PLAN}'`);
    check('but cannot delete it (020: deleting stays the owner\'s alone)', nothing(coplanDel), describe(coplanDel));
    const friendProfile = countAs('third', 'profiles', `user_id = '${VICTIM}'`);
    check('a friend sees the victim\'s profile', friendProfile.ok && friendProfile.out === '1', describe(friendProfile));
    const strangerProfile = countAs('plain', 'profiles', `user_id = '${VICTIM}'`);
    check('a stranger does not', strangerProfile.ok && strangerProfile.out === '0', describe(strangerProfile));
    const ownProfile = countAs('plain', 'profiles', `user_id = '${PLAIN}'`);
    check('everyone sees their own profile', ownProfile.ok && ownProfile.out === '1', describe(ownProfile));
    const friendLink = countAs('third', 'friendships', `requester_id = '${VICTIM}'`);
    check('the addressee sees the friendship row', friendLink.ok && friendLink.out === '1', describe(friendLink));
    // The invite seed above proves the owner CAN invite a friend (046). This
    // proves the friendship arm still bites: the same owner, on the same plan,
    // cannot invite somebody who is not an accepted friend, and the refusal
    // is the policy's (a row-level security violation), not a 42501 on a
    // function the caller cannot execute.
    const strangerInvite = runAs('victim', `insert into public.trip_collaborators (trip_plan_id, user_id, invited_by) values ('${PLAN}', '${PLAIN}', '${VICTIM}')`);
    check('the owner cannot invite somebody who is not a friend (020, 046)',
      !strangerInvite.ok && /row-level security/i.test(strangerInvite.err), describe(strangerInvite));

    // ---------------------------------------------------------------------
    // 5. The harness proves itself: a deliberately leaked row is seen.
    // ---------------------------------------------------------------------
    console.log('');
    console.log('  The probe sees a deliberate leak (otherwise none of the above was evidence):');
    psql(bin, TEST_DB, ['-c', `create policy t083_leak on public.trip_plans for select using (true)`]);
    const leaked = countAs('plain', 'trip_plans', `user_id = '${VICTIM}'`);
    psql(bin, TEST_DB, ['-c', `drop policy t083_leak on public.trip_plans`]);
    check('with an unconditional read policy added, the second user sees the victim\'s trip',
      leaked.ok && leaked.out === '1', describe(leaked));
    const sealed = countAs('plain', 'trip_plans', `user_id = '${VICTIM}'`);
    check('and with it dropped again, does not', sealed.ok && sealed.out === '0', describe(sealed));

    console.log('');
    console.log(`  note  ${covered} tables covered by an isolation fixture, ${closed.length} closed tables probed, ${policies.length} policies in force`);
  } finally {
    psqlRun(bin, 'postgres', ['-c', `drop database if exists ${TEST_DB} with (force)`]);
    if (work) {
      try { rmSync(work, { recursive: true, force: true }); } catch { /* leave it */ }
    }
  }
}

console.log('The row policies keep one traveller out of another traveller\'s rows (T083)');
console.log('--------------------------------------------------------------------------');

const bin = findPsql();
let skipped = false;
let skipReason = '';

if (!bin) {
  skipped = true;
  skipReason = 'psql was not found on PATH or at a standard PostgreSQL install path.';
} else {
  const r = psqlRun(bin, 'postgres', ['-At', '-c', 'select 1']);
  if (!r.ok) {
    skipped = true;
    skipReason = `could not connect to ${PG.user}@${PG.host}:${PG.port}. ${r.err.trim()}`;
  }
}

if (skipped) {
  console.log('');
  console.log('  SKIPPED. No database was reached, so NOTHING about the row policies');
  console.log('  was tested. This run proves nothing.');
  console.log(`  Reason: ${skipReason}`);
  console.log('');
  console.log('  To run it, point the script at a PostgreSQL server you can write to');
  console.log('  without a password prompt, for example a throwaway trust-auth cluster:');
  console.log('    initdb -D <dir> -U postgres --auth=trust');
  console.log('    pg_ctl -D <dir> -o "-p 55444" start');
  console.log('    PGPORT=55444 node continent-app/scripts/admin/test_rls_policies.mjs');
  console.log('');
  process.exit(0);
}

try {
  runTests(bin);
} catch (err) {
  failures += 1;
  console.error(`FAIL  the run aborted: ${err.message}`);
}

console.log('');
console.log(`${checks} assertions, ${checks - failures} passing, ${failures} failing.`);
if (failures) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
if (checks === 0) {
  // Vacuous-gate rule: zero assertions is not a pass.
  console.error('No assertions ran; treating this as a failure.');
  process.exit(1);
}
console.log('All row policy tests passed.');
