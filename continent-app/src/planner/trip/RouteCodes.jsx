import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { ArrowRightIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';

/**
 * A flight named by its airports, "BRU to SZG" drawn as the plane, the two
 * codes and an arrow (owner board panel 8, 2026-10-29: the route replaces
 * "Getting there" and "Getting home" everywhere a flight is shown). Screen
 * readers hear "BRU to SZG". Returns null without both codes, so the caller
 * keeps its own label. `icon` false where the row already shows the plane.
 */
export function RouteCodes({ from, to, icon = true, className = '' }) {
  const { t } = useI18n();
  if (!from || !to) return null;
  return (
    <span className={`rcodes ${className}`.trim()} role="img" aria-label={t('itin.fromTo', { a: from, b: to })}>
      {icon && <PlaneIcon size={16} aria-hidden="true" />}
      <span>{from}</span>
      <ArrowRightIcon size={14} />
      <span>{to}</span>
    </span>
  );
}
