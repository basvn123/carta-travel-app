/**
 * The active BCP-47 locale, held in plain JS (no React, no JSX) so build-time
 * node scripts and non-component libs (format.js) can read it without pulling
 * in the i18n provider. The provider (src/i18n/index.jsx) is the only writer.
 */
let current = 'en-GB';

export function setActiveLocale(bcp47) {
  if (bcp47) current = bcp47;
}

export function activeLocale() {
  return current;
}
