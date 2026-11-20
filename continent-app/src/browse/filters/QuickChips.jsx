import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { DiamondIcon, HeartIcon } from '../../components/Icons.jsx';
import { countKey } from '../../lib/plural.js';
import { prefersReducedMotion } from '../../lib/motion.js';
import { useFilters } from './filtersStore.js';

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
 * follow, the camera stays. The row swipes sideways on a phone.
 */
export function QuickChips({ className = '', withFilters = true }) {
  const { t } = useI18n();
  const f = useFilters();
  const count = f.count || 0;
  const rowRef = React.useRef(null);
  // A chip turned on moves to the front: the row swipes back to its start,
  // so the chip and Filters are in view (a far chip left both off screen).
  const toFront = () => {
    const el = rowRef.current;
    if (el && el.scrollLeft > 0) el.scrollTo({ left: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  return (
    <div ref={rowRef} className={`xquick ${className}`.trim()} role="group" aria-label={t('filters.quickAria')}>
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
      {f.quick.map((c) => {
        const Ico = GLYPH[c.id];
        return (
          <Pressable key={c.id} className={`xquick-chip${c.on ? ' is-on' : ''}`} aria-pressed={c.on}
            data-quick={c.id} onClick={() => { f.applyQuick(c.id, !c.on); if (!c.on) toFront(); }}>
            {c.on ? <HouseIcon.check size={16} /> : Ico && <Ico size={16} />}
            <span className="xquick-word">{c.label}</span>
          </Pressable>
        );
      })}
    </div>
  );
}
