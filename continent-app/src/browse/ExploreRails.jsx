import React from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip, tierClass } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { kindOf } from '../lib/taxonomy.js';
import { KindGlyph } from '../components/KindGlyph.jsx';
import { eurDay } from '../lib/costIndex.js';

/**
 * Editorial collections (PLAN.md C5, folded): the first screen stops being a
 * rating sort, without costing eight screens of scroll to say so.
 *
 * The rails used to stack: eight strips of cards, one under the other, and on
 * a phone that was 2,600px of page before the grid even started. They are now
 * ONE block: a row of collection tabs (each with its live count) and one
 * strip showing the chosen collection, capped at 12 cards, plus "See all N"
 * which opens the grid with the SAME filter applied as chips. The rail's
 * query IS the filter's predicate (passed in by ExploreTab), so the tab and
 * the grid can never describe different lists.
 *
 * It is a real ARIA tab set: arrow keys move between collections, the strip
 * is the tab panel, and switching a tab scrolls the strip back to its start
 * so the reader always meets a collection at its best card.
 *
 * Everything renders from data already in memory: no fetch, no skeleton,
 * nothing auto-advances. Collections lead the page only while nothing is
 * filtered or searched; once the reader narrows the list, the grid is the
 * answer and this block steps aside.
 */

const CAP = 12;

// Round-robin by country, so a rail of 292 gems does not open on ten
// Italian rows: take each country's best in turn until the cap.
export function interleaveByCountry(rows) {
  const byCountry = new Map();
  for (const p of rows) {
    if (!byCountry.has(p.country)) byCountry.set(p.country, []);
    byCountry.get(p.country).push(p);
  }
  const queues = [...byCountry.values()];
  const out = [];
  for (let i = 0; out.length < rows.length; i++) {
    const q = queues[i % queues.length];
    if (q.length) out.push(q.shift());
    if (queues.every((x) => !x.length)) break;
  }
  return out;
}

function RailCard({ p, onSelect, t }) {
  const kind = kindOf(p);
  return (
    <button className="railcard" onClick={() => onSelect(p.id)}
      aria-label={t('explore.openDest', { city: p.city })}>
      <span className="railcard-media">
        <HeroImage url={p.image} city={p.city} iso2={p.iso2}
          className="railcard-img" maxWidth={330}
          sizes="160px" ratio={[4, 3]} />
        {(p.rating?.tier ?? 0) >= 2 && (
          <span className={`railcard-seal ${tierClass(p.rating)}`} />
        )}
      </span>
      <span className="railcard-body">
        <span className="railcard-kind">
          <KindGlyph kind={kind} size={9} label={t(`pkind.${kind}`)} />
          <CountryFlag country={p.iso2} size={10} />
          <span>{p.country}</span>
        </span>
        <span className="railcard-name">{p.city}</span>
        <span className="railcard-foot">
          <ScoreChip rating={p.rating} size="xs" />
          {p.cost?.dayEur != null && (
            <span className="railcard-cost mono" title={t('cost.perDay')}>
              {eurDay(p.cost.dayEur)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export function ExploreRails({ rails, onSelect, t }) {
  const visible = rails.filter((r) => r.rows.length >= 4);
  const [activeKey, setActiveKey] = React.useState(null);
  const stripRef = React.useRef(null);
  const tabsRef = React.useRef(null);
  const active = visible.find((r) => r.key === activeKey) || visible[0] || null;

  // A new collection starts at its first card, not wherever the last one
  // was scrolled to.
  React.useEffect(() => {
    stripRef.current?.scrollTo?.({ left: 0 });
  }, [active?.key]);

  const go = (i, focus) => {
    const next = visible[(i + visible.length) % visible.length];
    if (!next) return;
    setActiveKey(next.key);
    if (focus) tabsRef.current?.querySelectorAll('[role="tab"]')[visible.indexOf(next)]?.focus();
  };
  const onKeyDown = (e) => {
    const i = visible.indexOf(active);
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1, true); }
    else if (e.key === 'Home') { e.preventDefault(); go(0, true); }
    else if (e.key === 'End') { e.preventDefault(); go(visible.length - 1, true); }
  };

  if (!active) return null;
  return (
    <section className="xcoll" aria-label={t('explore.collections')}>
      <div className="xcoll-head">
        <h3 className="xcoll-title">{t('explore.collections')}</h3>
        <button className="xrails-all" onClick={active.seeAll}>
          {t('rail.seeAll', { n: active.rows.length })}
        </button>
      </div>
      <div className="xcoll-tabs" role="tablist" ref={tabsRef} onKeyDown={onKeyDown}>
        {visible.map((r) => {
          const on = r.key === active.key;
          return (
            <button
              key={r.key}
              id={`xcoll-tab-${r.key}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="xcoll-panel"
              tabIndex={on ? 0 : -1}
              className={`xcoll-tab ${on ? 'on' : ''}`}
              onClick={() => setActiveKey(r.key)}
            >
              <span>{r.title}</span>
              <span className="xcoll-n mono">{r.rows.length}</span>
            </button>
          );
        })}
      </div>
      <div
        className="xrails-strip"
        id="xcoll-panel"
        role="tabpanel"
        aria-labelledby={`xcoll-tab-${active.key}`}
        ref={stripRef}
      >
        {active.rows.slice(0, CAP).map((p) => (
          <RailCard key={p.id} p={p} onSelect={onSelect} t={t} />
        ))}
        <button className="railcard railcard--more" onClick={active.seeAll}>
          <span className="railcard-more-n mono">{active.rows.length}</span>
          <span>{t('rail.seeAll', { n: active.rows.length })}</span>
        </button>
      </div>
    </section>
  );
}
