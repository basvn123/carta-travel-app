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
