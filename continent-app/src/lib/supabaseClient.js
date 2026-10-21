const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Accounts are optional: without credentials configured there is no client
// and the app runs exactly as before (guest-only, no save/sync features).
export const authConfigured = !!(url && anonKey);

/*
 * supabase-js is about 52 KB gzip and a guest's first paint needs none of it
 * (T479), so it is not imported here. getSupabase() imports it on first use
 * and creates the one client; every caller awaits the same promise, which
 * resolves null when accounts are off. A failed chunk load clears the promise
 * so the next call tries again.
 */
let clientPromise = null;
let client = null;
const readyCallbacks = [];

// The auth redirects (OAuth return, magic link, email confirmation, password
// recovery) land with the session in the hash. supabase-js reads it when the
// client is created, which is now later than the first render, and the URL
// writer (urlState.persistState) drops unknown hashes. So the hash is captured
// at import and put back, once, just before the client reads it.
const AUTH_IN_URL = /(?:^#|&)(?:access_token|error_description)=/;
const authHash = typeof window !== 'undefined' && AUTH_IN_URL.test(window.location.hash || '')
  ? window.location.hash
  : '';

function restoreAuthHash() {
  if (!authHash || AUTH_IN_URL.test(window.location.hash || '')) return;
  const { pathname, search } = window.location;
  try { window.history.replaceState(window.history.state, '', `${pathname}${search}${authHash}`); } catch { /* the client sees what is left */ }
}

export function getSupabase() {
  if (!authConfigured) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      restoreAuthHash();
      client = createClient(url, anonKey);
      for (const cb of readyCallbacks.splice(0)) {
        try { cb(client); } catch { /* one listener never blocks the others */ }
      }
      return client;
    }, (err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

/**
 * Run `cb(client)` once something else has loaded the client, without
 * loading it. For module-level listeners that must not pull supabase-js
 * into the first paint.
 */
export function whenSupabase(cb) {
  if (!authConfigured) return;
  if (client) cb(client);
  else readyCallbacks.push(cb);
}

/*
 * Could this load be a signed-in one? True when the URL carries an auth
 * redirect or supabase-js's storage key holds a session (its default key,
 * sb-<project ref>-auth-token). Unreadable storage counts as yes, so the
 * answer only ever errs towards waiting for the real session.
 */
export const mayHaveSession = (() => {
  if (!authConfigured) return false;
  if (authHash) return true;
  try {
    const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    return window.localStorage.getItem(key) !== null;
  } catch {
    return true;
  }
})();

// A load that may be signed in starts the import now, in parallel with the
// first paint, so the session resolves as early as it did before.
if (mayHaveSession) getSupabase().catch(() => {});
