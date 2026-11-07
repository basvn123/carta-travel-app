// T1089: tells a harness whether the app under test has Supabase accounts
// configured. Without VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY the app
// runs guest-only, so a check that needs a signed-in account cannot run.
// Reads the dev server's transformed src/lib/supabaseClient.js, which starts
// with the env object Vite injects. Returns false only when that module is
// readable and the env carries no Supabase URL; true otherwise (a built
// preview bakes the env in, so there is nothing to read and the check runs).
export async function authConfigured(base) {
  try {
    const r = await fetch(new URL('src/lib/supabaseClient.js', base.endsWith('/') ? base : `${base}/`));
    const text = await r.text();
    if (!/^import\.meta\.env = \{/.test(text)) return true;
    return /"VITE_SUPABASE_URL"\s*:\s*"[^"]+"/.test(text.split('\n', 1)[0]);
  } catch {
    return true;
  }
}
