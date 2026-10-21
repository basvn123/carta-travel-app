/**
 * What the day figure includes, as one sentence (T499, owner answer T491-h):
 * "A bed plus food and drink."
 *
 * Built from a list of included parts, one i18n key per part
 * (dest.dayPart.{part}), joined by the language's own "plus"
 * (dest.dayPartJoin) and set in dest.dayIncludes. When the owner adds a
 * transport estimate to the day figure, the caller passes
 * ['bed', 'food', 'transport'] and adds that one key in six languages; the
 * sentence and every place that prints it follow.
 */
export const DAY_PARTS = ['bed', 'food'];

export function dayIncludesText(t, parts = DAY_PARTS) {
  const words = (parts || []).map((p) => t(`dest.dayPart.${p}`)).filter(Boolean);
  if (!words.length) return '';
  const joined = words.join(` ${t('dest.dayPartJoin')} `);
  const text = t('dest.dayIncludes', { parts: joined });
  // The parts are written mid-sentence (lower case); the sentence opens with
  // a capital in every language Carta speaks.
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
