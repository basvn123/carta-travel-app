"""Writes supabase/diagnostics/.044_pass_functions.sql: pass_horizon_days,
pass_can_buy and grant_pass exactly as 044 defines them, for the throwaway
test of 053 (053_pass_subscriptions_test.sql). Run from the repo root."""
src = open('supabase/migrations/044_payments_quota.sql', encoding='utf-8').read().splitlines()
start = next(i for i, l in enumerate(src) if l.startswith('create or replace function public.pass_horizon_days'))
end = next(i for i, l in enumerate(src) if i > start and l.strip() == 'to service_role;' and 'grant_pass' in src[i - 1])
open('supabase/diagnostics/.044_pass_functions.sql', 'w', encoding='utf-8', newline='\n').write('\n'.join(src[start:end + 1]) + '\n')
print('lines', start + 1, 'to', end + 1)
