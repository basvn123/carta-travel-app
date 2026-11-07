// The waitlist form's client half (T1110, ROADMAP K3). The server half is
// supabase/functions/waitlist (double opt-in: nothing is used before the
// confirmation link in the mail is clicked). No supabase-js: one fetch.

/** Same shape rule as the function's cleanEmail, so the form catches typos first. */
export function validEmail(raw) {
  if (typeof raw !== 'string') return false;
  const e = raw.trim();
  return e.length >= 5 && e.length <= 254 && /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+$/.test(e);
}

/**
 * Sends the address. Answers 'ok' (a confirmation mail is on its way, or the
 * address is already on the list: the form says the same either way),
 * 'email' (the server refused the address) or 'unavailable' (not configured,
 * offline or a server fault).
 */
export async function joinWaitlist({ email, locale, source = 'home', fetchImpl = globalThis.fetch, env = import.meta.env } = {}) {
  if (!validEmail(email)) return 'email';
  const base = String(env?.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  if (!base || typeof fetchImpl !== 'function') return 'unavailable';
  try {
    const res = await fetchImpl(`${base}/functions/v1/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env?.VITE_SUPABASE_ANON_KEY || '' },
      body: JSON.stringify({ email: email.trim(), locale, source }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) return 'ok';
    if (body.code === 'email') return 'email';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}
