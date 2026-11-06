// T1089: preconditions the container may lack, detected rather than assumed.
import { existsSync, readFileSync } from 'node:fs';

// True when the app build/dev server would have Supabase credentials
// (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the shell or an .env file).
// Without them the app runs guest-only and every signed-in screen is absent.
export const supabaseConfigured = () => {
  const has = (txt) => /VITE_SUPABASE_URL\s*=\s*\S/.test(txt) && /VITE_SUPABASE_ANON_KEY\s*=\s*\S/.test(txt);
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) return true;
  for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    if (existsSync(f) && has(readFileSync(f, 'utf8'))) return true;
  }
  return false;
};
