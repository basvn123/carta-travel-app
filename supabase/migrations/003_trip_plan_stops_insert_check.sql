-- Tighten the trip_plan_stops INSERT policy: the old check only verified
-- auth.uid() = user_id, so an authenticated user could attach stop rows to
-- ANOTHER user's plan (if they learned its UUID). Confidentiality held (SELECT
-- filters on user_id), but it allowed garbage rows on someone else's plan.
-- Now the referenced plan must belong to the inserting user too.
--
-- Apply in the Supabase SQL editor (or `supabase db push`).

drop policy if exists "trip_plan_stops_insert_own" on public.trip_plan_stops;

create policy "trip_plan_stops_insert_own"
  on public.trip_plan_stops for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trip_plans p
      where p.id = trip_plan_id and p.user_id = auth.uid()
    )
  );
