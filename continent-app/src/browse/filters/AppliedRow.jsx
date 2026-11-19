import React from 'react';
import { Button, IconButton } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { haptic } from '../../lib/haptics.js';
import { openFilters } from './filtersStore.js';
import '../../styles/83-filters.css';

/**
 * The applied row under the band (G12, Explore top round 2, decision.md
 * section 2): every filter on as one removable chip, then Clear all. It
 * replaces the list toolbar's three pill styles, its repeated search chip
 * and its "Showing places in" hint: the field shows the search, the chips
 * show the filters, nothing is said twice.
 *
 *   phone    Filters (with its count) leads and opens the sheet; the chips
 *            scroll sideways in one line
 *   desktop  the chips, Clear all, then at the right end Sort, Saved and
 *            Share (`tools`); Filters is in the search bar
 *
 * Each chip's remove is its own 44 px button named "Remove {name}". After a
 * remove, focus goes to the next chip (else the previous, else Clear all,
 * else Filters) and the row says "Removed {name}" once.
 */
export function AppliedRow({ chips, count, onClearAll, desktop, tools = null, t }) {
  const rowRef = React.useRef(null);
  const [said, setSaid] = React.useState('');
  const refocus = React.useRef(null);
  React.useEffect(() => {
    if (!said) return undefined;
    const h = setTimeout(() => setSaid(''), 2600);
    return () => clearTimeout(h);
  }, [said]);
  React.useLayoutEffect(() => {
    const at = refocus.current;
    if (at == null) return;
    refocus.current = null;
    const row = rowRef.current;
    const xs = [...(row?.querySelectorAll('.xap-x') || [])];
    const next = xs[Math.min(at, xs.length - 1)]
      || row?.querySelector('.xap-clear')
      || row?.querySelector('.xap-filters, .xap-tools button');
    next?.focus({ preventScroll: true });
  }, [chips]);
  const remove = (c, i) => () => {
    refocus.current = i;
    setSaid(t('filters.removed', { name: c.label }));
    haptic('tick');
    c.remove();
  };
  return (
    <div ref={rowRef} className={`xap${desktop ? ' is-desk' : ' is-phone'}`}>
      <div className="xap-chips" role="group" aria-label={t('filter.activeAria')}>
        {!desktop && (
          <Button variant="secondary" size="sm" className={`xap-filters${count ? ' is-on' : ''}`}
            iconStart={<HouseIcon.filter size={16} />} aria-haspopup="dialog"
            aria-label={count ? t('filters.openOn', { n: count }) : t('filters.title')}
            onClick={() => openFilters()}>
            {t('filters.title')}
            {count > 0 && <span className="xap-n" aria-hidden="true">{count}</span>}
          </Button>
        )}
        {chips.map((c, i) => (
          <span key={c.key} className="xap-chip" data-chip={c.key} title={c.label}>
            <span className="xap-text">{c.label}</span>
            <IconButton className="xap-x" label={t('filter.removeChip', { name: c.label })} onClick={remove(c, i)}>
              <HouseIcon.close size={14} />
            </IconButton>
          </span>
        ))}
        {chips.length > 0 && (
          <Button variant="quiet" size="sm" className="xap-clear" onClick={() => {
            refocus.current = 0;
            setSaid(t('filters.cleared'));
            onClearAll();
          }}>
            {t('filters.clearAll')}
          </Button>
        )}
      </div>
      {desktop && tools && <div className="xap-tools">{tools}</div>}
      <p className="sr-only" role="status">{said}</p>
    </div>
  );
}

/** Saved as a toggle at the row's right end (desktop): the save glyph,
 *  filled while on. */
export function SavedToggle({ on, onChange, t }) {
  return (
    <Button variant="secondary" size="sm" className={`xap-tool xap-saved${on ? ' is-on' : ''}`}
      iconStart={<HouseIcon.bookmark size={16} />} aria-pressed={on}
      aria-label={t('explore.savedOnlyAria')}
      onClick={() => onChange(!on)}>
      {t('explore.toolSaved')}
    </Button>
  );
}
