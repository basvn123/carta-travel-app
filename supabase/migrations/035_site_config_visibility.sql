-- 035_site_config_visibility.sql
--
-- site_config is readable by anon and authenticated ONLY where public = true.
--
-- WHY. 014 gave site_config one read policy, "site_config_read_all", with
-- USING (true): every visitor, signed in or not, could read every row. That
-- was fine while the table held the three knobs the app renders, but the
-- table is also where an operator is told to put backend numbers (the
-- ai_global_daily_cap mirror that admin_ai_usage reads, 030; the
-- ai_cost_plan_cents and ai_cost_ground_cents prices that admin_margin
-- reads, 031). Anything put there was world-readable the moment it was
-- saved. This file closes that before the table holds anything worth
-- reading: a row is private unless it is marked public.
--
-- WHAT CHANGES.
--
--   1. A column public boolean NOT NULL DEFAULT false. Existing rows get
--      false from the default, so every key starts private. NOT NULL is
--      added on top of the plan's DEFAULT false so a row can never sit in a
--      third, unknown state; the policy would treat NULL as private anyway.
--
--   2. The policy "site_config_read_all" (USING (true)) is dropped and
--      "site_config_read_public" is created FOR SELECT TO anon,
--      authenticated USING (public = true). The new name is deliberate: a
--      later re-paste of 014 re-creates "site_config_read_all" beside it,
--      and 014's own self-check (exactly one policy) then fails loudly
--      instead of silently re-opening the table under the old name.
--
--   3. Exactly three keys are marked public, the three the app reads through
--      the anon or authenticated client (src/hooks/useSiteConfig.js):
--
--        announcement  AnnouncementBar.jsx renders it for every visitor.
--        maintenance   MaintenanceGate.jsx reads it before rendering the app,
--                      signed out included; the gate fails open, so a
--                      private maintenance row would silently stop the
--                      maintenance switch from working.
--        features      useFeature() reads flags from it for every visitor.
--                      Nothing calls useFeature today, but the flags exist
--                      to gate public surfaces and the Site tab edits them.
--
--      The admin Site tab (src/components/admin/useConfigManager.js) reads
--      site_config through the client too, as role authenticated, and it
--      reads exactly these three keys, so it keeps working.
--
--      Every other key stays private. None is seeded by 014 or 017; the ones
--      the migrations know about are ai_global_daily_cap (030) and
--      ai_cost_plan_cents, ai_cost_ground_cents (031), all read only inside
--      SECURITY DEFINER functions owned by the table owner, which RLS does
--      not apply to (the table is not FORCE ROW LEVEL SECURITY). They keep
--      reading every row. The Edge Functions do not read site_config at all.
--
-- WHAT DOES NOT CHANGE. No seed value. No function. admin_set_config (034
-- body) upserts with ON CONFLICT (key) DO UPDATE SET value, updated_at,
-- updated_by only, so it never touches public: an existing public key stays
-- public, and a key an admin creates through it takes the column default,
-- false. There is no way yet to flip the flag other than SQL in the editor
-- (register row T066-b).
--
-- Apply in the Supabase SQL editor AFTER 034. Live project policy: never
-- `db push` against ntssxktaduxzpsmejwyv; paste this file there by hand. It
-- is safe to paste twice: the column add is IF NOT EXISTS, the policies are
-- dropped before they are created, and the UPDATE only sets true on the
-- three keys.
--
-- After pasting, check for "site config visibility self-check passed", then
-- run `select key, public from public.site_config order by key;` and make
-- sure no key the public app needs has been left private.
--
-- DOWN MIGRATION (restores 014's world-readable policy; the column can stay,
-- nothing reads it once the policy is gone, but it is dropped here for a
-- clean revert):
--
--   drop policy if exists "site_config_read_public" on public.site_config;
--   drop policy if exists "site_config_read_all" on public.site_config;
--   create policy "site_config_read_all" on public.site_config
--     for select using (true);
--   alter table public.site_config drop column if exists public;
--   notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- The flag
-- ---------------------------------------------------------------------------
alter table public.site_config
  add column if not exists public boolean not null default false;

-- ---------------------------------------------------------------------------
-- The policy
-- ---------------------------------------------------------------------------
drop policy if exists "site_config_read_all" on public.site_config;
drop policy if exists "site_config_read_public" on public.site_config;
create policy "site_config_read_public" on public.site_config
  for select
  to anon, authenticated
  using (public = true);

-- ---------------------------------------------------------------------------
-- The three keys the app reads
-- ---------------------------------------------------------------------------
-- Only the flag moves; value, updated_at and updated_by are left as they are.
update public.site_config
   set public = true
 where key in ('announcement', 'maintenance', 'features')
   and public is distinct from true;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  n    int;
  q    text;
  r    text[];
  k    text;
begin
  if to_regclass('public.site_config') is null then
    raise exception 'public.site_config is missing; apply 014 first';
  end if;

  -- The column, with its type, default and NOT NULL.
  select count(*) into n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'site_config'
     and column_name = 'public' and data_type = 'boolean'
     and is_nullable = 'NO' and column_default = 'false';
  if n <> 1 then
    raise exception 'site_config.public is missing or is not boolean not null default false';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.site_config'::regclass) then
    raise exception 'site_config has row level security switched off';
  end if;
  if (select relforcerowsecurity from pg_class where oid = 'public.site_config'::regclass) then
    raise exception 'site_config forces row level security; the SECURITY DEFINER readers in 030 and 031 would lose the private keys';
  end if;

  -- Still exactly one policy, as 014's self-check expects, and it is ours.
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'site_config';
  if n <> 1 then
    raise exception 'site_config should carry exactly the read policy, found %', n;
  end if;
  select qual, roles::text[] into q, r from pg_policies
   where schemaname = 'public' and tablename = 'site_config'
     and policyname = 'site_config_read_public' and cmd = 'SELECT';
  if q is null then
    raise exception 'site_config_read_public (FOR SELECT) is missing';
  end if;
  if q <> '(public = true)' then
    raise exception 'site_config_read_public reads USING %, expected (public = true)', q;
  end if;
  if not (r @> array['anon', 'authenticated'] and array['anon', 'authenticated'] @> r) then
    raise exception 'site_config_read_public applies to %, expected anon and authenticated', r;
  end if;

  -- The three keys the app reads are there and public.
  foreach k in array array['announcement', 'maintenance', 'features'] loop
    select count(*) into n from public.site_config where key = k and public = true;
    if n <> 1 then
      raise exception 'site_config key % is missing or not public; the app reads it', k;
    end if;
  end loop;

  -- The client still cannot write, so it cannot flip the flag either.
  if has_table_privilege('anon', 'public.site_config', 'UPDATE')
     or has_table_privilege('authenticated', 'public.site_config', 'UPDATE') then
    raise exception 'anon or authenticated can UPDATE site_config and could make a key public';
  end if;

  raise notice 'site config visibility self-check passed';
end;
$$;

notify pgrst, 'reload schema';
