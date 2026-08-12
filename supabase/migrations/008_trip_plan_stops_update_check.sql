-- Close the UPDATE twin of the hole 003 fixed for INSERT: the update policy
-- only had USING (auth.uid() = user_id) and no WITH CHECK, so an
-- authenticated user could UPDATE their own stop row and re-parent it onto
-- ANOTHER user's plan (if they learned its UUID, e.g. via a leaked share
-- link). Confidentiality held (SELECT filters on user_id), but the victim's
-- plan gained foreign rows. The new WITH CHECK pins both the ownership and
-- the referenced plan after the write.
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.

drop policy if exists "trip_plan_stops_update_own" on public.trip_plan_stops;

create policy "trip_plan_stops_update_own"
  on public.trip_plan_stops for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trip_plans p
      where p.id = trip_plan_id and p.user_id = auth.uid()
    )
  );
