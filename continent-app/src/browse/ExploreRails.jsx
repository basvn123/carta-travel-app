import React from 'react';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import { scrollBehavior } from '../lib/motion.js';
import { PlaceTile } from './ExploreCards.jsx';

/**
 * Explore's sections (T427, after the owner's review of 2026-10-13).
 *
 * Each rail is a question a traveller asks ("Best in October", "Hiking
 * bases") answered by a strip of photo tiles, capped at 12, and a "See all"
 * that opens the list with the SAME filter applied, so the rail and the list
 * can never describe different places: the rail's query is the filter's
 * predicate, passed in by ExploreTab.
 *
 * Calm by subtraction: no subtitle explaining how a rail was chosen, no
 * position figure, no count in "See all" (owner: say less). Four strips on a
 * desktop and three on a phone (eight stacked carousels pushed the list two
 * screens down in v4); every further rail is one button in a single row that
 * opens its list. On a pointer screen each strip has a pair of arrows, since
 * a scroller with no scrollbar gives a mouse no way in; the arrow keys move
 * between the tiles.
 */

const CAP = 12;

// Round-robin by country, so a rail of 292 gems does not open on ten
// Italian tiles: take each country's best in turn until the cap.
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

function Rail({ r, onSelect, favorites, onToggleFav, t }) {
  const stripRef = React.useRef(null);
  const shown = r.rows.slice(0, CAP);
  const [edge, setEdge] = React.useState({ start: true, end: shown.length <= 1 });
  const measure = React.useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setEdge((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);
  React.useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, shown.length]);
  const page = (dir) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: scrollBehavior() });
  };
  // Left and Right move the focus tile to tile inside the strip; the browser
  // brings the focused tile into view.
  const onKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const hits = [...(stripRef.current?.querySelectorAll('.card-open') || [])];
    const i = hits.indexOf(e.target);
    if (i < 0) return;
    const next = hits[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() });
  };
  return (
    <section className="xrails-rail" aria-labelledby={`xrail-${r.key}`}>
      <div className="xrails-head">
        {/* h2: the rails sit straight under the page's h1 (T193). */}
        <h2 className="xrails-title" id={`xrail-${r.key}`}>{r.title}</h2>
        <Button variant="quiet" size="sm" className="xrails-all" onClick={r.seeAll}>
          {t('rail.seeAllPlain')}
        </Button>
        <span className="xrails-nav">
          <IconButton tone="surface" label={t('explore.railPrev')} onClick={() => page(-1)}
            disabled={edge.start} className="xrails-arrow xrails-arrow--prev">
            <ChevronRightIcon size={16} />
          </IconButton>
          <IconButton tone="surface" label={t('explore.railNext')} onClick={() => page(1)}
            disabled={edge.end} className="xrails-arrow">
            <ChevronRightIcon size={16} />
          </IconButton>
        </span>
      </div>
      <div className="xrails-strip" ref={stripRef} onKeyDown={onKey}>
        {shown.map((p) => (
          <PlaceTile key={p.id} p={p} onSelect={onSelect} t={t}
            fav={favorites?.has(p.id)} onToggleFav={onToggleFav} />
        ))}
      </div>
    </section>
  );
}

export function ExploreRails({ rails, onSelect, favorites, onToggleFav, t, lead = 4 }) {
  const visible = rails.filter((r) => r.rows.length >= 4);
  if (!visible.length) return null;
  const strips = visible.slice(0, lead);
  const doors = visible.slice(lead);
  return (
    <div className="xrails">
      {strips.map((r) => (
        <Rail key={r.key} r={r} onSelect={onSelect} favorites={favorites} onToggleFav={onToggleFav} t={t} />
      ))}
      {doors.length > 0 && (
        <nav className="xrails-doors" aria-label={t('explore.moreRails')}>
          {doors.map((r) => (
            <Button key={r.key} variant="secondary" size="sm" onClick={r.seeAll}>
              {r.short || r.title}
            </Button>
          ))}
        </nav>
      )}
    </div>
  );
}
