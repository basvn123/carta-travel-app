import React, { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { PackIcon } from '../components/PackIcons.jsx';
import { packCells } from '../lib/packGrid.js';

/**
 * What to pack as a grid of 20px icons. Tap one and a single line says why it
 * is on this trip. One line sits below the grid, not a floating tooltip, so it
 * works on touch and does not cover the next icon.
 */
export function PackGrid({ trip }) {
  const { t } = useI18n();
  const cells = useMemo(() => packCells(trip), [trip]);
  const [sel, setSel] = useState(-1);
  const cur = sel >= 0 ? cells[sel] : null;
  return (
    <div className="pack-grid-wrap">
      <ul className="pack-grid">
        {cells.map((c, i) => (
          <li key={`${c.icon}-${i}`}>
            <button
              type="button"
              className={`pack-cell${i === sel ? ' is-on' : ''}`}
              aria-pressed={i === sel}
              onClick={() => setSel(i === sel ? -1 : i)}
            >
              <PackIcon name={c.icon} />
              <span className="pack-label">{c.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="pack-why" role="status" aria-live="polite">
        {cur ? cur.why : t('journey.packHint')}
      </p>
    </div>
  );
}
