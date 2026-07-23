-- In-app account deletion (App Store guideline 5.1.1(v)).
--
-- The anon/authenticated client can never delete rows in auth.users itself,
-- so deletion runs through this SECURITY DEFINER function: it deletes the
-- CALLING user only (auth.uid(), never a parameter), and every table that
-- references auth.users(id) with ON DELETE CASCADE (trip plans, day plans,
-- saved trips, user settings) empties with it.
--
-- Apply in the Supabase SQL editor or via `supabase db push`.

create or replace function public.delete_user()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

-- Only signed-in users may call it (and it only ever affects themselves).
revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;
