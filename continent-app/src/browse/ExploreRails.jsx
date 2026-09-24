import React from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip, tierClass } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { Fold } from './Fold.jsx';

/**
 * Editorial rails (PLAN.md C5): the first screen stops being a rating sort.
 *
 * A flat sort put 23 Italian entries in the first 60 cards. Each rail is a
 * query against fields the wire already carries, capped at 12 cards, with a
 * "See all N" that opens the grid with the SAME filter applied as chips -
 * the rail and the filter can never describe different lists, because the
 * rail's query IS the filter's predicate, passed in by ExploreTab.
 *
 * v5: three strips, not eight. Eight stacked carousels pushed the grid two
 * screens down and read as one long carousel with different titles. The
 * first three (the top tier, the gems, the month) are strips; every rail
 * after that is one chip in a row of doors, each opening the grid with the
 * rail's filter applied, so nothing is lost and the grid arrives on the
 * first screen. On a pointer screen each strip gets a pair of arrows, since
 * a horizontal scroller with no scrollbar gives a mouse no way in.
 *
 * Rails render from data already in memory: no fetch, no skeleton state,
 * everything visible at rest.
 */

const CAP = 12;
const LEAD = 3;

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
  return (
    <button className="railcard" onClick={() => onSelect(p.id)}
      aria-label={t('explore.openDest', { city: p.city })}>
      <span className="railcard-media">
        <HeroImage url={p.image} city={p.city} iso2={p.iso2}
          className="railcard-img" maxWidth={500}
          sizes="200px" ratio={[4, 3]} />
        {(p.rating?.tier ?? 0) >= 2 && (
          <span className={`railcard-seal ${tierClass(p.rating)}`} />
        )}
      </span>
      <span className="railcard-body">
        <span className="railcard-head">
          <span className="railcard-name">{p.city}</span>
          <ScoreChip rating={p.rating} size="xs" />
        </span>
        <span className="railcard-kind">
          <CountryFlag country={p.iso2} size={10} />
          <span>{p.country}</span>
        </span>
      </span>
    </button>
  );
}

function Rail({ r, onSelect, t }) {
  const stripRef = React.useRef(null);
  const page = (dir) => {
    const el = stripRef.current;
    if (!el) return;
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
  };
  return (
    <section className="xrails-rail" aria-label={r.title}>
      <div className="xrails-head">
        <div className="xrails-headings">
          <h3 className="xrails-title">{r.title}</h3>
          {r.sub && <p className="xrails-sub">{r.sub}</p>}
        </div>
        <button type="button" className="xrails-all" onClick={r.seeAll}>
          {t('rail.seeAll', { n: r.rows.length })}
        </button>
        <span className="xrails-nav">
          <button type="button" className="xrails-arrow xrails-arrow--prev"
            onClick={() => page(-1)} aria-label={t('explore.railPrev')}>
            <ChevronRightIcon size={15} />
          </button>
          <button type="button" className="xrails-arrow"
            onClick={() => page(1)} aria-label={t('explore.railNext')}>
            <ChevronRightIcon size={15} />
          </button>
        </span>
      </div>
      <div className="xrails-strip" ref={stripRef}>
        {r.rows.slice(0, CAP).map((p) => (
          <RailCard key={p.id} p={p} onSelect={onSelect} t={t} />
        ))}
      </div>
    </section>
  );
}

export function ExploreRails({ rails, onSelect, t, lead = LEAD }) {
  const visible = rails.filter((r) => r.rows.length >= 4);
  const strips = visible.slice(0, lead);
  const doors = visible.slice(lead);
  // P4.4: the doors fold like every other section in the app, same
  // component, same chevron, same animation.
  const [openDoors, setOpenDoors] = React.useState(false);
  if (!visible.length) return null;
  return (
    <div className="xrails">
      {strips.map((r) => <Rail key={r.key} r={r} onSelect={onSelect} t={t} />)}
      {doors.length > 0 && (
        <Fold
          id="sec-morerails"
          title={t('explore.moreRails')}
          summary={t('explore.moreRailsSummary', { n: doors.length })}
          open={openDoors}
          onToggle={() => setOpenDoors((v) => !v)}
          className="xrails-more-fold"
        >
          <div className="xrails-more" role="group" aria-label={t('explore.moreRails')}>
            {/* A door is a chip: it takes the rail's short label, never the
                full self-explaining title, which is a sentence. */}
            {doors.map((r) => (
              <button key={r.key} type="button" className="xrails-more-chip" onClick={r.seeAll}
                title={r.sub || undefined}>
                <span>{r.short || r.title}</span>
                <span className="xrails-more-n">{r.rows.length}</span>
              </button>
            ))}
          </div>
        </Fold>
      )}
    </div>
  );
}
