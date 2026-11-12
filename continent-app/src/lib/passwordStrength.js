/**
 * passwordStrength.js, how good is this password, measured rather than judged.
 *
 * The old rule ("at least 6 characters") is the worst of both worlds: it lets
 * "123456" through and it tells somebody who typed a long passphrase nothing.
 * Composition rules are not much better, because "one capital, one digit, one
 * symbol" reliably produces Password1! rather than a strong secret.
 *
 * So this scores entropy instead:
 *
 *     H = L x log2(R)
 *
 * where L is the length and R the size of the character pool the password
 * draws on. Length buys far more than variety does, which is exactly the
 * message we want the meter to send: a four-word phrase beats a mangled word.
 *
 * The estimate is deliberately conservative in one place. Raw entropy rates
 * "aaaaaaaaaaaa" at 56 bits, which is a lie, so repeated characters count half
 * after their first appearance. This is not a cracker model and it is not
 * meant to be one; it is a nudge with an honest number attached, and nothing
 * here gates anything on the server.
 */

// Character classes and the pool each one contributes. The symbol pool is the
// printable ASCII punctuation set; anything outside ASCII (accents, emoji) adds
// a conservative flat amount rather than the true Unicode range, which would
// score a single emoji as unbreakable.
const CLASSES = [
  [/[a-z]/, 26],
  [/[A-Z]/, 26],
  [/[0-9]/, 10],
  [/[ -/:-@[-`{-~]/, 33],
  [/[^\x20-\x7E]/, 100],
];

/** Bits of entropy, repeats discounted. Returns 0 for an empty password. */
export function passwordEntropy(pw) {
  if (!pw) return 0;
  let pool = 0;
  for (const [re, size] of CLASSES) if (re.test(pw)) pool += size;
  if (pool <= 1) return 0;
  const unique = new Set(pw).size;
  const effectiveLength = unique + (pw.length - unique) * 0.5;
  return effectiveLength * Math.log2(pool);
}

/**
 * { bits, level, score } for the meter. The thresholds follow the usual
 * reading of NIST SP 800-63B: under 36 bits is guessable offline in minutes,
 * 60 bits is a reasonable floor for an account holding personal data.
 */
export function passwordStrength(pw) {
  const bits = Math.round(passwordEntropy(pw));
  if (!pw) return { bits: 0, level: 'empty', score: 0 };
  if (bits < 36) return { bits, level: 'weak', score: 1 };
  if (bits < 60) return { bits, level: 'fair', score: 2 };
  return { bits, level: 'strong', score: 3 };
}

/** The floor the form enforces. Eight, per current guidance, not six. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The rules the password forms check (owner decision T1164-f, 2026-11-12;
 * ASVS 5.0 V6.2.5, V6.1.2, V6.2.11).
 *
 * No composition rules: "one capital, one digit, one symbol" pushes people to
 * Password1! rather than to a long phrase, and NIST SP 800-63B and ASVS both
 * advise against them. What is left is the length floor and one context
 * check: the password may not contain a word anyone who knows the account
 * would try first, that is "carta", a part of the traveller's name or the
 * part of the e-mail address before the @. The entropy meter above stays
 * beside the checklist as the honest measurement.
 */
export const CONTEXT_WORDS = ['carta'];

// Lower case, accents off, so "Émile" in a name also catches "emile123".
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * The words a password may not contain, for this account: the fixed list plus
 * each name part and each part of the e-mail's local part (split on . _ - +)
 * of three characters or more. Shorter parts ("al", "jo") would refuse far too
 * many good passwords for no gain.
 */
export function contextWords({ name = '', email = '' } = {}) {
  const local = fold(email).split('@')[0] || '';
  const parts = [...fold(name).split(/[^\p{L}\p{N}]+/u), local, ...local.split(/[._+-]+/)];
  return [...new Set([...CONTEXT_WORDS, ...parts.filter((w) => w.length >= 3)])];
}

/** The first context word the password contains, or null. */
export function passwordContextWord(pw, ctx = {}) {
  const p = fold(pw);
  if (!p) return null;
  return contextWords(ctx).find((w) => p.includes(w)) || null;
}

export const PASSWORD_RULES = [
  { key: 'len', test: (pw) => pw.length >= MIN_PASSWORD_LENGTH },
  { key: 'context', test: (pw, ctx) => !passwordContextWord(pw, ctx) },
];

/** Each rule with whether this password meets it, in checklist order. */
export function checkPasswordRules(pw, ctx = {}) {
  return PASSWORD_RULES.map((r) => ({ key: r.key, met: r.test(pw || '', ctx) }));
}

/** Every rule met. What the submit buttons gate on. */
export function passwordMeetsRules(pw, ctx = {}) {
  return PASSWORD_RULES.every((r) => r.test(pw || '', ctx));
}
