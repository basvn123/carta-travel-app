import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Accounts are optional: without credentials configured, `supabase` is null
// and the app runs exactly as before (guest-only, no save/sync features).
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const authConfigured = !!supabase;
