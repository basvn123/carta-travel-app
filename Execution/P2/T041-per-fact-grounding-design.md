# T041: Design per-fact grounding (Lever 1), design now, build in P9

## Task ID

T041

## Date

2026-09-24

## What changed

Nothing in the runtime. This task produces the design that T147 (build the
volatile fact store and the expiry job) and T148 (the live-grounding
allowance) implement in P9. The design is grounded in what the code does
today, and where the brief and the code disagree it says which one wins.

The short version. Today every grounded Gemini call happens inside a user's
request, spends one unit of that user's `ground` allowance, and its result
is thrown away after the seven-day `ai_plan_cache` window. The design moves
the shared facts, the ones that are the same for everyone planning the same
place in the same quarter, into a Postgres table called `public.facts`,
keyed by entity and field, with a value, its source URLs, the date it was
fetched and an expiry set by the field's class. A nightly job refreshes what
has expired through the same Gemini grounding route the app already uses,
on the same billed Google project, with its own daily cap. `plan-day` reads
the store before it decides whether to ground, and only spends a `ground`
unit when the question is genuinely about this traveller. The P9 generation
pipeline reads and writes the same table in its numbers pass, which is what
makes one build serve two consumers.

### What grounding actually does today, and where the brief is wrong about it

The brief assumes that a grounded generation in the app fetches ticket
prices, timetables and food ranges. It does not. There are three Edge
Functions that spend AI quota and only two of them ground at all:

`supabase/functions/plan-day/index.ts` grounds only when the request carries
`wantEvents` (line 400 at HEAD, `if (wantEvents) { ... consume(service,
user.id, 'ground', GLOBAL_CAP) }`). The grounding tool is attached at line
422 and the prompt asks the model, at line 187, to look for "festivals,
markets, fairs or seasonal events that plausibly run in ${city} around
${dateISO}". That is the whole of what the app grounds for in the day
planner: dated events near a city. Prices and timetables never enter the
prompt; the candidate deck is Carta's own catalogue and the model only
sequences it.

`supabase/functions/suggest-city/index.ts` grounds by default (line 187,
`useGrounding = enabled && (status?.groundLeft ?? 0) > 0`) because its job
is to find a real place outside the catalogue near a stay point. That is a
discovery, not a fact, and it depends on the traveller's stay coordinate,
focus and free text.

`supabase/functions/parse-booking/index.ts` never grounds (header line 24,
"No grounding here, ever").

The volatile facts K6 describes live somewhere else entirely: in the 253
trip records under `continent-app/public/journeys/journey/*.json`, where
`sources.verified` is a prose paragraph ("half board at 55.80 and bed-only
at 21.90"), `verifyFlags` is a list of disputed fields, `volatilePricing` is
a single boolean, and `dataVintage` is the string "2026". Those records are
built offline by `pipeline/journeys/build_wire.py` from
`Trips/carta-unified/carta-unified/data/trips.master.json` and never touch
Gemini at request time. The dossier wire (`continent-app/public/dossier/
{base}.json`, 3,869 files) carries `sleep.per_person_night_eur` from the
Inside Airbnb anchors and a `practical` block of affiliate links, again with
no grounding involved.

So the decision is this. The fact store is built to serve both the thing the
app grounds for today (events for a city and month) and the thing K6 needs
tomorrow (prices, ranges, timetables for trips and destinations). The
60 to 80 percent reduction claim is measured against the app's grounded
units, which today are events and discoveries; the K6 facts are new spend
that the store keeps off the per-request path from day one, so the pipeline
never has a per-request grounding phase to migrate away from. Both halves
use one table, one refresh job and one budget.

One more contradiction worth stating. `continent-app/src/lib/pricing.js`
(line 45) and CARTA_UNIT_ECONOMICS.md section 2.2 price a grounded unit at
about EUR 0.05, on the reasoning that Gemini 3 bills per search query the
model fans out to. Google's pricing page, read during this task, says
Grounding with Google Search on the Gemini 3 family carries "5,000 free
search requests per month (shared across all Gemini 3.x models)" and then
"$14 per 1,000 requests". At the app's current global ceiling of 200 AI
calls a day across every surface (`AI_GLOBAL_DAILY_CAP`), the whole of
Carta's grounded traffic sits inside the free monthly allowance today. That
does not make Lever 1 pointless: the allowance is shared with the refresh
job, the price applies the moment a busy month crosses it, and the quality
argument (one dated, sourced figure for everyone) stands on its own. It
does mean the 0.05 figure is a worst case that section 3 of the unit
economics should re-run with the real number, and it is raised as an open
item rather than fixed here.

### The fact store

One row per (entity, field). The entity key follows the convention the
shortlist already uses in `continent-app/src/lib/favorites.js` (`favKey`):
`dest:<id>` and `trip:<id>` for the two layers whose ids are global, and
`<kind>:<cc>/<id>` for the country-scoped layers (beach, lake, mountain,
trail, cycling), because those ids are only unique inside their country
file. `dest` ids are the dossier ids (`AAL`, `gem:valbona`), the same string
`plan-day` receives as `dest.id` and puts in the cache key as `destId`. Do
not use `dossier_file_base()` (which turns `gem:valbona` into `gem-valbona`
and `PRN` into `PRN_`); that is a filename rule, not an identity rule.
Points of interest inside a city are addressed by array index in the day
planner, which is not a durable id (see the P5 shortlist note), so a POI
fact is keyed `poi:<destId>/<QID>` using the Wikidata QID that
`pipeline/dossier/harvest_landmarks.py` already caches, and a POI without a
QID has no facts. That is a real limitation and it is deliberate: a key that
cannot be written down stably would rot the table.

The field is a dotted name whose first segment is the class. The class
decides the expiry. The table of classes is data, not code, so a TTL can be
tuned with an UPDATE.

| Class | Field prefix | TTL | Examples | Source of the rule |
|---|---|---|---|---|
| transport | `transport.` | 90 days | `transport.ferry.arinsal-comapedrosa`, `transport.rail.pass.regional` | K6: ferry and transport timetables 3 months |
| events | `events.` | 90 days | `events.recurring` (a list of events with months and venues for one destination) | This design: it is what plan-day grounds for today, and dates move on the same clock as timetables |
| price | `price.` | 180 days | `price.museum.uffizi.adult`, `price.lift.day.arinsal` | K6: museum and lift prices 6 months |
| range | `range.` | 365 days | `range.food.day`, `range.stay.night.midrange`, `range.hut.halfboard` | K6: food and accommodation ranges 12 months |
| booking | `booking.` | 180 days | `booking.lead.refuge`, `booking.window.restaurants` | K6 names booking lead times among the fields that rot; sits with prices because both are set by the operator |

The value is `jsonb` so a range can be `{"low": 55.8, "high": 70, "currency":
"EUR"}` and an events list can be an array, without a column per shape. A
`value_text` column carries the one-line rendering the prompt and the page
print, because a prompt should never re-serialise JSON it did not write.
Every row carries `confidence` in the K3 vocabulary (`sourced`, `derived`,
`estimated`) so T146 can render the "9 of 14 figures sourced" footer from
the same column the store already keeps.

The DDL for the migration, `supabase/migrations/030_facts.sql`, follows. It
uses the house conventions: RLS on with no client policies (service_role
bypasses), `security definer` with `set search_path = ''`, grants stated
explicitly, a down section as a comment at the foot, and a header saying to
apply by hand in the SQL editor and never `db push`.

```sql
-- 030_facts.sql: the volatile fact store (unit economics Lever 1, trips spec K6).
-- Apply by hand in the Supabase SQL editor. Never `supabase db push`.

create table if not exists public.fact_classes (
  class       text primary key,
  ttl_days    int  not null check (ttl_days between 1 and 730),
  description text not null
);

insert into public.fact_classes (class, ttl_days, description) values
  ('transport', 90,  'Timetables, ferry and rail schedules, pass validity'),
  ('events',    90,  'Recurring festivals, markets and fairs with their months'),
  ('price',     180, 'Museum, lift, attraction and hut prices'),
  ('booking',   180, 'Booking lead times and windows set by an operator'),
  ('range',     365, 'Food and accommodation ranges per person')
on conflict (class) do update set
  ttl_days = excluded.ttl_days, description = excluded.description;

alter table public.fact_classes enable row level security;

-- Field names are dotted; the first segment is the class and must exist.
create or replace function public.fact_class_of(p_field text)
returns text
language sql
immutable
set search_path = ''
as $$ select split_part(p_field, '.', 1) $$;

create table if not exists public.facts (
  entity_key   text not null,
  field        text not null check (field ~ '^[a-z]+(\.[a-z0-9-]+)+$'),
  class        text not null references public.fact_classes(class),
  -- The fact itself. NULL while status is 'missing'.
  value        jsonb,
  value_text   text check (value_text is null or length(value_text) <= 400),
  confidence   text not null default 'estimated'
               check (confidence in ('sourced', 'derived', 'estimated')),
  -- The first grounding chunk URL is the citation; the rest are kept so a
  -- reviewer can see what the model read. Empty array means unsourced.
  source_url   text,
  source_urls  jsonb not null default '[]'::jsonb,
  fetched_at   timestamptz,
  expires_at   timestamptz,
  -- missing: seeded, never fetched. ok: fresh. stale: expired and not yet
  -- refreshed (still served with its old date until 2x TTL). unsourced:
  -- the model answered without a citation, value withheld. failed: three
  -- consecutive refresh failures, needs a human look.
  status       text not null default 'missing'
               check (status in ('missing', 'ok', 'stale', 'unsourced', 'failed')),
  failures     int  not null default 0,
  -- How often a reader wanted this fact. Drives refresh order.
  demand       int  not null default 0,
  model        text,
  queries      int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (entity_key, field),
  check (class = public.fact_class_of(field))
);

create index if not exists facts_due_idx
  on public.facts (expires_at) where status in ('ok', 'stale');
create index if not exists facts_missing_idx
  on public.facts (demand desc) where status = 'missing';
create index if not exists facts_entity_idx
  on public.facts (entity_key);

alter table public.facts enable row level security;
revoke all on table public.facts from anon, authenticated;
grant select, insert, update on table public.facts to service_role;
revoke all on table public.fact_classes from anon, authenticated;
grant select on table public.fact_classes to service_role;

-- One row per refresh attempt, for the measurement plan and for debugging
-- a fact that keeps failing. No user id: the job has no user.
create table if not exists public.fact_refresh_log (
  id          bigint generated always as identity primary key,
  run_id      uuid not null,
  entity_key  text not null,
  field       text not null,
  outcome     text not null check (outcome in ('ok', 'unsourced', 'error', 'capped', 'skipped')),
  queries     int  not null default 0,
  model       text,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists fact_refresh_log_created_idx
  on public.fact_refresh_log (created_at desc);
alter table public.fact_refresh_log enable row level security;
revoke all on table public.fact_refresh_log from anon, authenticated;
grant select, insert on table public.fact_refresh_log to service_role;

-- The refresh job's own daily ceiling. Separate from ai_daily_total on
-- purpose: the nightly job must never eat the 200 calls travellers get.
create table if not exists public.fact_refresh_totals (
  day     date primary key default current_date,
  queries int  not null default 0
);
alter table public.fact_refresh_totals enable row level security;
grant select, insert, update on table public.fact_refresh_totals to service_role;

-- Reserve one unit of the refresh budget. Same shape as ai_consume's global
-- check: the statement that tests the cap is the one that increments it.
create or replace function public.fact_refresh_consume(p_cap int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v int;
begin
  insert into public.fact_refresh_totals as t (day, queries)
    values (current_date, 1)
    on conflict (day) do update set queries = t.queries + 1
      where t.queries < p_cap
    returning queries into v;
  return v is not null;
end;
$$;
revoke all on function public.fact_refresh_consume(int) from public, anon, authenticated;
grant execute on function public.fact_refresh_consume(int) to service_role;

-- Read for plan-day: every fresh or recently stale fact of one entity, in
-- one round trip. A stale fact is still served until twice its TTL has
-- passed, with its real fetched_at, because an event list from five months
-- ago beats no event list; after that it is dropped from the answer.
create or replace function public.facts_for(p_entity text, p_prefix text default null)
returns table (field text, value jsonb, value_text text, confidence text,
               source_url text, fetched_at timestamptz, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.field, f.value, f.value_text, f.confidence, f.source_url, f.fetched_at, f.status
    from public.facts f
    join public.fact_classes c on c.class = f.class
   where f.entity_key = p_entity
     and (p_prefix is null or f.field like p_prefix || '%')
     and f.status in ('ok', 'stale')
     and f.fetched_at > now() - make_interval(days => 2 * c.ttl_days)
$$;
revoke all on function public.facts_for(text, text) from public, anon, authenticated;
grant execute on function public.facts_for(text, text) to service_role;

-- Record that a reader wanted a fact that is not there. Seeds the row as
-- 'missing' so the nightly job picks it up in demand order.
create or replace function public.fact_want(p_entity text, p_field text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.facts as f (entity_key, field, class, demand)
    values (p_entity, p_field, public.fact_class_of(p_field), 1)
    on conflict (entity_key, field) do update
      set demand = f.demand + 1, updated_at = now();
end;
$$;
revoke all on function public.fact_want(text, text) from public, anon, authenticated;
grant execute on function public.fact_want(text, text) to service_role;

-- Flip expired rows to 'stale' and list what the job should do tonight,
-- most-wanted first, then oldest first. LIMIT is the batch size.
create or replace function public.facts_due(p_limit int default 40)
returns table (entity_key text, field text, class text, value jsonb, failures int)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.facts set status = 'stale', updated_at = now()
   where status = 'ok' and expires_at <= now();
  return query
    select f.entity_key, f.field, f.class, f.value, f.failures
      from public.facts f
     where f.status in ('missing', 'stale')
       and f.failures < 3
     order by (f.status = 'missing') desc, f.demand desc, f.expires_at asc nulls first
     limit p_limit;
end;
$$;
revoke all on function public.facts_due(int) from public, anon, authenticated;
grant execute on function public.facts_due(int) to service_role;

-- Admin rollup for the measurement plan: coverage, freshness and spend.
create or replace function public.admin_facts_report(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_err text := public.admin_guard('read');
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  return jsonb_build_object(
    'byStatus', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                   from (select status, count(*) n from public.facts group by status) s),
    'byClass',  (select coalesce(jsonb_object_agg(class, n), '{}'::jsonb)
                   from (select class, count(*) n from public.facts group by class) s),
    'refreshQueries', (select coalesce(sum(queries), 0) from public.fact_refresh_log
                        where created_at > now() - (p_days || ' days')::interval),
    'refreshByOutcome', (select coalesce(jsonb_object_agg(outcome, n), '{}'::jsonb)
                          from (select outcome, count(*) n from public.fact_refresh_log
                                 where created_at > now() - (p_days || ' days')::interval
                                 group by outcome) s),
    'wantedMissing', (select count(*) from public.facts where status = 'missing' and demand > 0)
  );
end;
$$;
revoke all on function public.admin_facts_report(int) from public, anon;
grant execute on function public.admin_facts_report(int) to authenticated, service_role;

-- Down migration. Run in this order:
--   drop function if exists public.admin_facts_report(int);
--   drop function if exists public.facts_due(int);
--   drop function if exists public.fact_want(text, text);
--   drop function if exists public.facts_for(text, text);
--   drop function if exists public.fact_refresh_consume(int);
--   drop table if exists public.fact_refresh_totals;
--   drop table if exists public.fact_refresh_log;
--   drop table if exists public.facts;
--   drop function if exists public.fact_class_of(text);
--   drop table if exists public.fact_classes;
-- Dropping the tables loses every fetched fact. Export public.facts to CSV
-- from the Dashboard first if the rows are worth keeping; nothing else in
-- the schema references them, so the drop is otherwise clean.
```

Two design notes on the DDL. `admin_guard` is the function migration 014
already ships, so the report RPC gates the same way `admin_ai_model_report`
(028) and `admin_ai_cache_report` (029) do. And the `check (class =
fact_class_of(field))` constraint means a writer cannot file a `price.` fact
under the `range` TTL by mistake; the class column exists only so the
foreign key and the joins are cheap.

### The refresh job

Where it runs. There are two candidates and the code has a precedent for
each. The pipeline already calls Gemini with grounding from Python:
`pipeline/dossier/parking_check.py` sends `tools: [{"google_search": {}}]`,
reads `candidates[0].groundingMetadata.groundingChunks[].web.uri` for the
citations (lines 156 to 183), holds a 6.5 second floor between calls and
walks a three-model chain on 429. The Edge Functions call the same endpoint
from Deno with the same `GEMINI_API_KEY` secret and the shared `modelChain`
and `shouldFallOver` helpers in `supabase/functions/plan-day/logic.mjs`.

The decision is a Supabase Edge Function, `supabase/functions/refresh-facts`,
invoked by `pg_cron` through `pg_net`, for three reasons. The store is in
Postgres and `plan-day` reads it there, so the writer should be next to the
reader. The pipeline's scheduler is a weekly Windows Scheduled Task on a
laptop that can be asleep (`run_pipeline.py` header, and the reason the
`heartbeat()` function exists); a nightly job that depends on it is a weekly
job with worse odds. And the Edge Function shares the deployed model chain,
the billing project and the secrets with the functions it is relieving, so
there is exactly one Gemini client to keep compliant with the billing
posture T035 documented. The Python side keeps the job it is good at:
seeding.

Cadence. Nightly at 03:00 UTC, which is the brief's cadence, kept because it
is the smallest interval at which a `missing` row raised by a traveller
during the day is filled before most of the next day's traffic. With TTLs
of 90 to 365 days almost every night finds only the demand-driven misses
plus a thin slice of expiries, which is the point: the work is spread flat
instead of arriving in a quarterly wall.

The cron entry belongs in the migration, guarded so it is harmless where the
extensions are absent:

```sql
-- Requires pg_cron and pg_net enabled under Database, Extensions in the
-- Dashboard, and the vault secret refresh_facts_url holding the function
-- URL with the service key. Without them this block does nothing.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('refresh-facts-nightly', '0 3 * * *', $c$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_facts_url'),
        headers := jsonb_build_object('Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_facts_key')),
        body := '{"reason":"cron"}'::jsonb)
    $c$);
  end if;
end $$;
-- Down: select cron.unschedule('refresh-facts-nightly');
```

Batching. One invocation calls `facts_due(40)`, works the list in order,
and stops at whichever comes first: the list is empty, 120 seconds of wall
time have passed (an Edge Function is killed well before that on the free
plan, and the batch must finish its writes), or the daily cap refuses. The
cron entry fires once; if the batch ran out of time with rows left, the
function re-invokes itself once through the same URL with `{"reason":
"continue"}`, at most three hops, so a backlog after an outage drains over
a few nights rather than one long night.

Budget cap. `FACTS_DAILY_CAP`, an Edge Function secret with a default of
120 grounded calls a day, reserved one at a time through
`fact_refresh_consume()` before each Gemini call, exactly as `ai_consume`
reserves against `ai_daily_total`. That is about 3,600 a month, inside
Google's 5,000 free monthly search requests with room for the app's own live
grounded calls, and at most about EUR 50 a month if the free allowance were
somehow spent (3,600 at $14 per 1,000), which is the size of the Google
Cloud budget alert T036-a asks the owner to set. Note the job also passes
through the model chain's per-model daily request budgets (20 a day on the
primary, 500 on the lite rungs, per the plan-day README), so the effective
cap is the smaller of the two; the lite models are fine for extraction with
a citation, which is a lookup rather than a reasoning task.

Sizing the store so the cap holds. Trip facts are seeded eagerly: 253 trips
today, about eight volatile fields each (two ranges, two or three prices,
one or two transport, one booking), about 2,000 rows, at a blended TTL of
about 200 days is about 10 refreshes a day; at the 600 trips D2 aims for it
is about 25. Destination facts are seeded on demand: `plan-day` calls
`fact_want()` on a miss, so the store grows to the cities travellers plan,
not to the 3,869 the dossier ships. The top 200 destinations by dossier tier
get `events.recurring` pre-seeded by the pipeline so the first traveller in
Florence does not miss. At a 90-day TTL that is about three refreshes a day
for the seeded set plus the day's new misses. The nightly load is therefore
tens of calls, not hundreds, and the 120 cap is a ceiling, not a target.

The Gemini call. Grounding and `responseSchema` cannot be combined in one
request (the note at `suggest-city/index.ts` line 56 records the API
rejecting it), so the prompt spells the JSON shape and the function extracts
the outermost object the way `suggest-city` does. One prompt per fact,
never a batch of facts in one call: a batch makes one citation list cover
five values and nobody can tell which URL supports which number. The prompt
names the entity, the field in plain words, the currency expected, and
forbids a value without a source. The response is accepted only if
`groundingMetadata.groundingChunks` carries at least one `web.uri` that is
not on the aggregator block list `pipeline/dossier/common.py` keeps as
`BLOCKED_DOMAINS` (the Deno function carries its own copy of that short list;
the duplication is noted as an open item); otherwise the row becomes
`unsourced` with the old value kept. `value_text` is passed through the same
dash and control-character scrub `cleanText` applies to model output.
`fetched_at` is `now()`, `expires_at` is `fetched_at + ttl_days`, `queries`
is the length of `groundingMetadata.webSearchQueries` when present, else 1.
`confidence` is `sourced` when a citation domain is the operator's own or an
official body, `derived` when the prompt computed it from a sourced figure
(a weekly rate from a daily one), `estimated` never, because an estimate
does not belong in a store whose promise is a source.

Failure handling. A Gemini 429 or 5xx walks the chain (`shouldFallOver`);
three consecutive chain exhaustions end the run with outcome `capped` on the
remaining rows, because that is a Google-side day and retrying it burns the
budget. A timeout (45 seconds, as in plan-day) or a malformed answer
increments `failures` on the row and logs `error`; at three the row becomes
`failed` and leaves the queue until a human resets it. A `stale` row that
cannot be refreshed keeps serving its old value with its old date until
twice its TTL, then `facts_for()` stops returning it, so the worst outcome
of a broken job is a fact that quietly ages out, never a fact that lies
about its date. Every attempt writes one `fact_refresh_log` row, and the
run pings `CARTA_HEARTBEAT_URL` with `/facts` on completion if the secret is
set, reusing the dead-man's-switch convention from `run_pipeline.py`, since a
cron job that stops firing is otherwise invisible.

Never the Claude API. The function has one provider and it is the Gemini
REST endpoint plan-day already calls. Two existing pipeline scripts,
`pipeline/dossier/rewrite_intros.py` and `parking_check.py`, still carry a
`claude` provider using the `anthropic` SDK and `ANTHROPIC_API_KEY`; that
contradicts the rule in CLAUDE.md and is raised as an open item for its own
task. The refresh job must not copy that shape.

### The seeders, on the pipeline side

`pipeline/facts/seed_facts.py`, a new run_pipeline task `facts_seed` at
monthly cadence, upserts `missing` rows through the PostgREST endpoint with
the service key from the repo-root `.env` (`env_local.load_env`, the
sanctioned paste spot). It reads the journey wire for the trip fields and
the dossier wire for the top-200 `events.recurring` rows, and it never
writes a value, only the fact that a value is wanted. A second script,
`pipeline/facts/export_facts.py`, is the read half for static pages: it
pulls every `ok` and `stale` row and writes `cache/facts_snapshot.json`,
which `build_wire.py` and the P9 generation passes read so a trip page can
print "half board EUR 55.80, checked June 2026, refugicomapedrosa.ad" from
the same row `plan-day` would read. The static wire is a copy of the store,
never a second store.

The P9 numbers pass (K2 pass three, T144) becomes: for each volatile field,
read the store; if `ok`, use it and do not ground; if absent, ground once,
write the row, use it. That is the sentence that makes the store pay twice.
`parking_check.py` already keeps its own grounded facts with `sources` and
`checked` in `cache/dossier/parking_web.json`; folding it into the store as
`transport.parking.*` rows is the right end state and is left to T147 as an
open item, since it means changing what `build_dossier.py` reads.

### The read path in plan-day

The order of operations in `plan-day/index.ts` today is: validate, consume
`plan`, look up the cache, build the prompt, decide grounding, call Gemini.
The store slots in between the cache lookup and the prompt.

When `wantEvents` is set, the function calls `facts_for('dest:' + destId,
'events.')`. On a hit it appends a block to the prompt, "KNOWN EVENTS
(checked <month year>, source <domain>): ..." with the `value_text`, and
tells the model to place at most two of these as `isEvent` stops and to
invent none. It then runs the ordinary ungrounded call, spends only the
`plan` unit it already spent, and sets `meta.grounded = false` and a new
`meta.factsUsed = n`. No `ground` unit is consumed and no Google search
runs. The cache key gains one member, the newest `fetched_at` among the
facts used, so a refreshed events list produces a new cache row instead of
being masked by a seven-day-old plan; that is a one-line addition to
`cacheKeyInput` in `logic.mjs` and bumps the key version T039 is introducing
as `CACHE_KEY_VERSION`, so it has to land after T039 and is noted as open.

On a miss the function calls `fact_want()` so tonight's job fills it, and
then does what the feature flag says. Under `FACTS_MODE=shadow` it grounds
live exactly as today and logs that the store would have missed. Under
`serve` it grounds live only if the traveller's `ground` allowance permits
(the existing `consume(service, user.id, 'ground', GLOBAL_CAP)` branch,
unchanged) and otherwise answers ungrounded with `meta.groundingSkipped =
'pending'`, a new value the client can render as "events for this city are
being checked; try again tomorrow". Under `strict` it never grounds for
events at all. The three modes are the migration path below.

`suggest-city` does not change in this design. Its grounded call depends on
the stay point and the traveller's wish, which is the definition of
user-specific, so it stays on the live allowance. A later design could key
discoveries on a coarse region cell, but nothing today shows that the same
region and focus recur often enough to pay for it, and it is listed as open
rather than assumed.

### The live-grounding allowance

What stays live: `suggest-city` discoveries; a `plan-day` request whose
`freeText` or `mustInclude` names a place outside the candidate deck (the
prompt already handles this as an `inCatalog=false` discovery, and the
coordinates it needs are user-specific); and the `refine` loop when the
request text asks a question the store cannot hold. Everything keyed to a
place and a month goes through the store.

How it is sized. The existing counter is the mechanism; no new quota kind is
needed. `plan_tiers.grounded` is 40 on the Trip Pass and 120 on the Year
Pass today (migration 007), sized in `pricing.js` so an exhausted pass still
clears its cost at EUR 0.05 a unit. The unit economics put typical use at 5
and 12 grounded units per pass. Once events come from the store, typical
live use falls to the discovery and refine cases, which is a handful per
trip. The proposal for T148 is 10 on the Trip Pass and 30 on the Year Pass:
double the typical figure, so an ordinary traveller never hits it, and a
quarter of today's ceiling, so the worst-case AI cost in section 3 of the
unit economics falls from EUR 2.60 to EUR 1.10 on the Trip Pass and from
EUR 9.00 to EUR 4.50 on the Year Pass at the old unit price. This is a
product decision as much as a cost one: the pass copy in `PassModal.jsx`
and the six locales print `pass.featSearchOn` with the number, so lowering
it changes what a buyer is promised. It is therefore raised as a user
decision, not made here, and the design works at either number.

How it is enforced. Nothing new. `ai_consume(p_user, 'ground', cap)` and
`ai_refund` stay as they are, the tests T036 and T037 wrote keep passing,
and `ai_status` keeps reporting `groundLeft` to the UI. The only change is
that fewer code paths reach the `consume(..., 'ground', ...)` call, and one
`UPDATE public.plan_tiers` plus the display mirror in `pricing.js` if the
owner accepts the resize. The free tier keeps a grounded allowance of zero,
and gains the store's events for free, which is the quality-up half of the
lever: a free user planning Florence in May now sees the same sourced
festival list a paying user does, because it costs nothing to serve.

### Migration path

Phase 0, T147 opens. Apply migration 030 by hand. Deploy `refresh-facts`
with `FACTS_DAILY_CAP` unset (default 120) and enable the cron once
`pg_cron` and `pg_net` are on (owner step). Deploy `plan-day` with
`FACTS_MODE` unset, which means `off`: the store is never read and the
function behaves exactly as at HEAD. Run `seed_facts.py` once. From this
point the job fills the store nightly and nobody is served from it.

Phase 1, shadow. Set `FACTS_MODE=shadow`. `plan-day` reads the store on
every `wantEvents` request, records hit or miss in `fact_refresh_log` via
`fact_want()` (a hit logs nothing, a miss seeds), and still grounds live.
Exit criterion: over 14 days the store answers at least 70 percent of
`wantEvents` requests for destinations that had been seeded, read from
`admin_facts_report().wantedMissing` falling and the shadow hit count in
the plan-day logs.

Phase 2, serve. Set `FACTS_MODE=serve`. Live grounding for events runs only
on a miss and only inside the traveller's allowance. This is the phase the
60 to 80 percent claim is measured in. Exit criterion: one full month of
`ai_usage` `ground` rows and `fact_refresh_log` rows.

Phase 3, resize and strict. If the owner accepts the T148 numbers, update
`plan_tiers` and `pricing.js`, and set `FACTS_MODE=strict` so an events miss
never grounds live; the traveller gets the pending message and the job
fills the row overnight. The store is now the only path for shared facts.

Rollback at any phase is `FACTS_MODE=off` and a redeploy of `plan-day`,
which restores today's behaviour without touching data, then
`cron.unschedule('refresh-facts-nightly')` to stop spend, then the down
migration if the tables are to go. The `plan_tiers` resize rolls back with
the 007 insert, which the register already warns (T030-d) resets the free
tier to 3 unless the free row is fixed first; T148 should update only the
`grounded` column of the two paid rows rather than re-run the insert.

### Measurement plan

The claim is that grounded units fall 60 to 80 percent. Grounded units are
counted in two places today and one more after this design.

Before. `public.ai_usage` where `kind = 'ground'`, summed over a month, is
the units travellers spent, and it exists since 007. `public.ai_model_events`
where `kind = 'ground'` (028, not yet applied, T038-a) gives the same number
per day with the model. Neither carries the number of Google searches the
model ran inside one unit, which is what Google bills; the fan-out is
unknown today and the 0.05 figure assumes it. The baseline month is the
first full month after 028 is live and before `FACTS_MODE` leaves `off`.

After. Live grounded units: the same `ai_usage` sum. Store spend:
`sum(queries)` from `fact_refresh_log` over the same month, which is the
count Google actually meters because the job reads `webSearchQueries`. Store
service: hits are visible as `wantEvents` requests whose `ai_model_events`
row says `kind = 'plan'`, minus the pending answers, and directly as the
`meta.factsUsed` count if plan-day logs it into `ai_cache_events`'s sibling.
Simplest honest number: total metered searches per month before, against
live units plus refresh queries per month after, from `ai_usage` and
`fact_refresh_log`. If the after figure is 20 to 40 percent of the before
figure at equal traffic, the claim holds. The traffic normaliser is the
`plan` unit count in `ai_usage`, which the store does not change.

The admin card that shows these belongs to BackEnd Phase 3 (the AI rollups)
and is not in this task; `admin_facts_report()` is provided so the numbers
are one RPC away when that card is built.

## Files touched

**Modified:**
- none inside the repository. This task wrote nothing under the repo root, per the concurrent-session rule in the prompt.

**Created:**
- Execution/P2/T041-per-fact-grounding-design.md (this report, committed by the orchestrator from the scratch copy)
- Execution/_OPEN.md rows T041-a to T041-g (appended by the orchestrator from OPEN-rows.md)

**Read, for the design:**
- additional docs/Carta/Plan/Finance/CARTA_UNIT_ECONOMICS.md (sections 2.2, 3, 4 Lever 1)
- additional docs/Carta/Plan/Data Quality/carta-trips-enhancement-spec.md (D2, J8, K1 to K6)
- additional docs/Carta/Plan/BackEnd/Carta BackEnd.md (Phase 3)
- Execution/P2/T035 to T038 reports and _OPEN-gemini-billing.md
- supabase/functions/plan-day/index.ts, logic.mjs, README.md
- supabase/functions/suggest-city/index.ts, parse-booking/index.ts, _shared/passes.mjs
- supabase/migrations/006, 007, 014, 018, 021, 028 and the uncommitted 029
- continent-app/src/hooks/usePaywall.jsx, useEntitlement.js, src/lib/pricing.js, src/lib/favorites.js (via the P5 note), src/planner/aiDayPlan.js, AiDayPlanModal.jsx
- pipeline/dossier/build_dossier.py, common.py, parking_check.py, rewrite_intros.py, harvest_event_dates.py; pipeline/journeys/build_wire.py; run_pipeline.py
- continent-app/public/dossier/AAL.json and one journey file, for the id and field shapes

## Commands run

Read-only throughout. No git command that changes state was run and no file under the repository was written.

```
git status --short supabase/
git diff --stat supabase/functions/plan-day/
git show HEAD:supabase/functions/plan-day/index.ts | grep -n "consume(service\|ai_plan_cache\|google_search\|AI_ENABLE_GROUNDING\|wantEvents"
```

The Google pricing page (https://ai.google.dev/gemini-api/docs/pricing) was fetched once to read the Grounding with Google Search figures quoted above.

## Config and secrets set

None. The design names the secrets T147 and T148 will need: `FACTS_MODE` (`off`, `shadow`, `serve`, `strict`; default `off`) on `plan-day`, `FACTS_DAILY_CAP` (default 120) on `refresh-facts`, and two vault secrets `refresh_facts_url` and `refresh_facts_key` for the cron entry. `GEMINI_API_KEY` is reused unchanged.

## Before/after measurements

Design task; nothing moved. The baseline the build task inherits:

| Metric | Before | After | Delta |
|---|---|---|---|
| Surfaces that ground per request | 2 of 3 Edge Functions (plan-day on wantEvents, suggest-city by default) | Not measured | n/a |
| Grounded allowance, Trip / Year Pass (plan_tiers.grounded) | 40 / 120 | Not measured (proposal 10 / 30, owner decision) | n/a |
| Typical grounded units per pass, Trip / Year (unit economics 3.1, 3.2) | 5 / 12 | Not measured | n/a |
| Assumed cost per grounded unit (pricing.js line 45, unit economics 2.2) | EUR 0.05 | Not measured | n/a |
| Google list price, Gemini 3.x grounding (pricing page, 2026-09-24) | 5,000 free requests a month, then $14 per 1,000 | same | 0 |
| Global daily AI ceiling, all surfaces (AI_GLOBAL_DAILY_CAP) | 200 | 200 | 0 |
| Live grounded units per month (ai_usage kind ground) | unknown: no rollup reads it and 028 is unapplied | Not measured | n/a |
| Searches the model fans out per grounded unit | unknown: nothing records webSearchQueries | recorded by the refresh job as facts.queries | n/a |
| Shared facts served from a store | 0 | Not measured | n/a |

## What broke and how it was fixed

No code ran, so nothing broke. Three things the reading turned up that the build task should not rediscover:

| What | Cause | Fix |
|---|---|---|
| The brief says grounding fetches prices and timetables in the request path; plan-day grounds only for events and suggest-city only for discoveries | The K6 facts live in the static trips data, which never grounds at request time | Design serves both: events through the store now, K6 fields through the same store in the P9 numbers pass; the 60 to 80 percent claim is measured on events plus discoveries |
| The repository prices a grounded unit at EUR 0.05 as a fan-out worst case; Google lists 5,000 free requests a month then $14 per 1,000 | The 0.05 figure predates the Gemini 3 pricing and assumed per-query billing with no free allowance | Raised as T041-c; the refresh job records webSearchQueries so the fan-out stops being a guess |
| Two pipeline scripts still carry an anthropic SDK provider | Written before the no-Claude-API rule | Raised as T041-g; the refresh job is Gemini-only by design |

## What is still open

The live-allowance resize is an owner decision. The design proposes 10 and 30 in place of 40 and 120 and shows the cost arithmetic, but the number is printed in the pass offer, so changing it changes what a buyer is promised. T148 builds whichever number the owner picks. That is T041-a.

The nightly cron needs `pg_cron` and `pg_net` enabled on the live project and two vault secrets, which are Dashboard steps only the owner can do, and they must precede the cron block in migration 030 or it silently schedules nothing. That is T041-b, sequenced with the P9 build rather than now.

The EUR 0.05 unit cost in `pricing.js` and the unit economics does not match Google's published price. Section 3 of the unit economics and the cap arithmetic in `pricing.js` should be re-run with 5,000 free requests a month and $14 per 1,000 after, using the measured fan-out once the refresh job records it. T096 (benchmark ground costs) is the natural home. That is T041-c.

`suggest-city` stays on live grounding. Whether discoveries recur often enough by region and focus to be worth a store key is unknown and needs traffic to answer; the design records the option and does not build it. That is T041-d.

The plan-day cache key must fold in the newest `fetched_at` of the facts a plan used, and that bumps the key version T039 is introducing as `CACHE_KEY_VERSION` in the uncommitted `logic.mjs`. T147 must land after T039 and bump the version once, not twice. That is T041-e.

`parking_check.py` already holds grounded parking facts with sources and a checked date in its own cache file, and `common.py` holds the aggregator block list the refresh job needs to copy into Deno. Folding the parking cache into the store and deciding where the one block list lives belongs to T147. That is T041-f.

`rewrite_intros.py` and `parking_check.py` carry a `claude` provider on the `anthropic` SDK with `ANTHROPIC_API_KEY`, which CLAUDE.md forbids. Removing the provider and the dependency is a small cleanup that belongs to its own task, since neither file is in this task's scope. That is T041-g.

No earlier register row is closed by this task. Rows T035-c, T037-a, T037-c and T037-d are read and left to their own tasks; none of them is in this design's path.

## Rollback procedure

There is nothing to roll back in the runtime: this task changed no code, no data, no secret and no schema. Reverting the design is reverting the orchestrator's commit that carries this report and the register rows:

```
git revert <commit that added Execution/P2/T041-per-fact-grounding-design.md>
```

For the built system the rollback is written into the migration path above: `FACTS_MODE=off` and redeploy `plan-day`, `cron.unschedule('refresh-facts-nightly')`, then the down section of migration 030 in the order given, after exporting `public.facts` if its rows are worth keeping.
