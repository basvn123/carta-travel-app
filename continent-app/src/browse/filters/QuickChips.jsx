import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { DiamondIcon, HeartIcon } from '../../components/Icons.jsx';
import { countKey } from '../../lib/plural.js';
import { scrollBehavior } from '../../lib/motion.js';
import { clearAllFilters, useFilters } from './filtersStore.js';

// Each quick chip's glyph, from the house set where it has one.
const GLYPH = {
  score8: HouseIcon.star, budget: HouseIcon.euro, warm: HouseIcon.sun, water: HouseIcon.water,
  hiking: HouseIcon.walk, gems: DiamondIcon, match: HeartIcon, saved: HouseIcon.bookmark,
};

/**
 * The map's quick filters (G12 map view round 2, decision.md: row 3 on a
 * phone, under the style and settings row; the map's top edge on a
 * desktop): Filters with its count first, then one toggle chip per quick
 * filter (filterModel.js QUICK), an active one moved to the front. A chip
 * sets the same filter the sheet holds, in place; the list and the pins
 * follow, the camera stays. The row is one line at every width and
 * scrolls sideways, a soft fade on a side that has more (judgement-4: on a
 * tablet or desktop it wrapped to a second line over the map).
 * `showClear`: Clear all, a quiet text button right after the checked
 * chips (they lead the row; on a phone right after Filters), so it is in
 * view without a swipe; given where
 * no applied row says it (judgement-6: Clear all has one home).
 */
export function QuickChips({ className = '', withFilters = true, showClear = false }) {
  const { t } = useI18n();
  const f = useFilters();
  const count = f.count || 0;
  const rowRef = React.useRef(null);
  const [said, setSaid] = React.useState('');
  React.useEffect(() => {
    if (!said) return undefined;
    const h = setTimeout(() => setSaid(''), 2600);
    return () => clearTimeout(h);
  }, [said]);
  const [edges, setEdges] = React.useState({ start: false, end: false });
  React.useEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    const read = () => {
      const max = el.scrollWidth - el.clientWidth;
      const x = Math.abs(el.scrollLeft);
      setEdges((e) => {
        const n = { start: x > 1, end: max - x > 1 };
        return e.start === n.start && e.end === n.end ? e : n;
      });
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', read); ro?.disconnect(); };
  }, [f.quick.length, showClear]);
  // A chip turned on moves to the front: the row swipes back to its start,
  // so the chip and Filters are in view (a far chip left both off screen).
  const toFront = () => {
    const el = rowRef.current;
    if (el && el.scrollLeft > 0) el.scrollTo({ left: 0, behavior: scrollBehavior() });
  };
  const clear = showClear && (
    <Pressable className="xquick-clear" onClick={() => {
      setSaid(t('filters.cleared'));
      clearAllFilters();
      // The button leaves with the last filter: focus stays in the row.
      requestAnimationFrame(() => rowRef.current?.querySelector('.xquick-chip')?.focus({ preventScroll: true }));
    }}>
      {/* The word box, so it sits on its capitals like the chips' words. */}
      <span className="xquick-word">{t('filters.clearAll')}</span>
    </Pressable>
  );
  const chip = (c) => {
    const Ico = GLYPH[c.id];
    return (
      <Pressable key={c.id} className={`xquick-chip${c.on ? ' is-on' : ''}`} aria-pressed={c.on}
        data-quick={c.id} onClick={() => { f.applyQuick(c.id, !c.on); if (!c.on) toFront(); }}>
        {c.on ? <HouseIcon.check size={16} /> : Ico && <Ico size={16} />}
        <span className="xquick-word">{c.label}</span>
      </Pressable>
    );
  };
  return (
    <div ref={rowRef} className={`xquick${edges.start ? ' has-start' : ''}${edges.end ? ' has-end' : ''} ${className}`.trim()}
      role="group" aria-label={t('filters.quickAria')}>
      {withFilters && (
        <Pressable className={`xquick-chip xquick-filters${count ? ' is-on' : ''}`}
          aria-label={count ? t(countKey(t.lang, count, 'band.filtersOnOne', 'band.filtersOn'), { n: count }) : t('band.filters')}
          aria-expanded={f.isOpen} aria-haspopup="dialog"
          onClick={(e) => (f.isOpen ? f.close() : f.open({ opener: e.currentTarget }))}>
          <HouseIcon.filter size={18} />
          <span className="xquick-word">{t('band.filters')}</span>
          {count > 0 && <span className="band-count" aria-hidden="true">{count}</span>}
        </Pressable>
      )}
      {/* On a phone Filters leads the row and two checked chips already
          fill it (370 px of 390), so Clear all stands right after Filters,
          the count it clears; on the map's top edge right after the checked
          chips. Either way in view without a swipe. */}
      {withFilters && clear}
      {f.quick.filter((c) => c.on).map(chip)}
      {!withFilters && clear}
      {f.quick.filter((c) => !c.on).map(chip)}
      <p className="sr-only" role="status">{said}</p>
    </div>
  );
}
