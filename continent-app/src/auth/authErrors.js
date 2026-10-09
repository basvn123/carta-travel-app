/**
 * The sentence a traveller reads when an auth call fails (T410, brief V5-5).
 * Supabase answers in English with its own wording, so the raw message never
 * reaches the screen: the few causes a person can act on map to a sentence
 * of ours in the language they chose, everything else falls to the caller's
 * generic key. `t` is the i18n function; `fallbackKey` is the surface's own
 * "something went wrong" key.
 */
export function authErrorText(err, t, fallbackKey = 'auth.errGeneric') {
  const raw = String((err && (err.message || err.error_description)) || '').toLowerCase();
  const status = Number(err && err.status);
  if (/invalid login|invalid credentials|invalid_grant/.test(raw)) return t('auth.errBadLogin');
  if (/not confirmed|confirm your email/.test(raw)) return t('auth.errNotConfirmed');
  if (/already registered|already been registered|already exists/.test(raw)) return t('auth.errExists');
  if (/password should be|at least \d+ char|weak password/.test(raw)) return t('auth.errWeak');
  if (status === 429 || /rate limit|too many|security purposes/.test(raw)) return t('auth.errRate');
  if (/failed to fetch|networkerror|load failed|network request/.test(raw)) return t('auth.errNetwork');
  return t(fallbackKey);
}
