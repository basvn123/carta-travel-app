import React from 'react';
import { Button, IconButton } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { haptic } from '../../lib/haptics.js';
import { openFilters } from './filtersStore.js';
import { countKey } from '../../lib/plural.js';
import '../../styles/83-filters.css';

/**
 * The applied row under the band (G12, Explore top round 2, decision.md
 * section 2): every filter on as one removable chip, then Clear all. It
 * replaces the list toolbar's three pill styles, its repeated search chip
 * and its "Showing places in" hint: the field shows the search, the chips
 * show the filters, nothing is said twice.
 *
 *   phone    Filters (with its count) leads and opens the sheet; the chips
 *            scroll sideways in one line between it and Clear all
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
  // The scroller fades only on a side that has more, so a row that fits
  // shows its last chip's remove whole.
  const scrollRef = React.useRef(null);
  const [more, setMore] = React.useState({ start: false, end: false, stacked: false });
  const readMore = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    // G12 (Explore clean, open item): a first chip wider than the room left
    // between Filters and Clear all ("Am besten bewertet" at 360 px) takes
    // a line of its own under them, so it is never cut. Read against the
    // fixed widths, not the scroller's, so the row cannot flip back.
    const row = rowRef.current;
    const first = el.firstElementChild;
    const side = (q) => row?.querySelector(q)?.offsetWidth || 0;
    const room = (row?.clientWidth || 0) - side('.xap-filters') - side('.xap-clear') - 16;
    const stacked = !!first && first.offsetWidth > room + 1;
    setMore((m) => (m.start === start && m.end === end && m.stacked === stacked ? m : { start, end, stacked }));
  }, []);
  React.useLayoutEffect(() => {
    if (desktop) return undefined;
    readMore();
    const el = scrollRef.current;
    const ro = el && typeof ResizeObserver === 'function' ? new ResizeObserver(readMore) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [desktop, chips, readMore]);
  const remove = (c, i) => () => {
    refocus.current = i;
    if (chips.length === 1) keepFocusAfterEmpty(desktop);
    setSaid(t('filters.removed', { name: c.label }));
    haptic('tick');
    c.remove();
  };
  return (
    <div ref={rowRef} className={`xap${desktop ? ' is-desk' : ' is-phone'}${!desktop && more.stacked ? ' is-stacked' : ''}`}>
      <div className="xap-chips" role="group" aria-label={t('filter.activeAria')}>
        {!desktop && (
          <Button variant="secondary" size="sm" className={`xap-filters${count ? ' is-on' : ''}`}
            iconStart={<HouseIcon.filter size={16} />} aria-haspopup="dialog"
            aria-label={count ? t(countKey(t.lang, count, 'filters.openOnOne', 'filters.openOn'), { n: count }) : t('filters.title')}
            onClick={() => openFilters()}>
            {t('filters.title')}
            {count > 0 && <span className="xap-n" aria-hidden="true">{count}</span>}
          </Button>
        )}
        {/* Only the chips scroll on a phone: Filters and Clear all stand
            outside the scroller, so neither is ever cut ("Cle", judge 1). */}
        <div ref={scrollRef} className={`xap-scroll${more.start ? ' has-start' : ''}${more.end ? ' has-end' : ''}`}
          onScroll={desktop ? undefined : readMore}>
          {chips.map((c, i) => (
            <span key={c.key} className="xap-chip" data-chip={c.key} title={c.label}>
              <span className="xap-text">{c.label}</span>
              <IconButton className="xap-x" label={t('filter.removeChip', { name: c.label })} onClick={remove(c, i)}>
                <HouseIcon.close size={14} />
              </IconButton>
            </span>
          ))}
        </div>
        {chips.length > 0 && (
          <Button variant="quiet" size="sm" className="xap-clear" onClick={() => {
            refocus.current = 0;
            keepFocusAfterEmpty(desktop);
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

/**
 * The last chip or Clear all empties the row, and with no filter left the
 * list turns back into the overview and the row unmounts, so focus fell to
 * the page (flow M1). Once the swap lands (a few frames, the overview's
 * rails arrive late), focus goes to a lasting control: the band's Filters
 * control on a desktop, the overview's heading on a phone (the field would
 * drop its search panel). Only when focus was really lost.
 */
function keepFocusAfterEmpty(desktop) {
  let tries = 0;
  const step = () => {
    const at = document.activeElement;
    const lost = !at || at === document.body || !at.isConnected;
    // Still on the row: the render that empties it may not have landed yet.
    if (!lost && !at.closest?.('.xap')) return;
    if (lost) {
      const to = (desktop && document.querySelector('.band .band-filters'))
        || document.getElementById('xov-title')
        || document.querySelector('.band .band-input');
      if (to && to.getClientRects().length > 0) { to.focus({ preventScroll: true }); return; }
    }
    if (++tries < 30) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
