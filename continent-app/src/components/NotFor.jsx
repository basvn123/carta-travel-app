import React from 'react';
import { useI18n } from '../i18n/index.jsx';

/**
 * "Not for you if ..." block. See lib/notFor.js for where the lines come from.
 *
 * Deliberately plain: --paper-dim ground, a hairline above and below, no icon,
 * no colour. It is the one block on a page that is not selling anything, and
 * its plainness is what makes it read that way. `lines` is the output of
 * notForLines().
 */
export function NotFor({ lines }) {
  const { t } = useI18n();
  if (!lines || !lines.length) return null;
  return (
    <aside className="notfor" aria-label={t('notfor.label')}>
      {lines.map((l) => (
        <p key={l.key} className="notfor-line">{t(l.key, l.params)}</p>
      ))}
    </aside>
  );
}
