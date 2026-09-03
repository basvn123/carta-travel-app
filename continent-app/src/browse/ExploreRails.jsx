import React from 'react';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip, tierClass } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { kindOf } from '../lib/taxonomy.js';
import { KindGlyph } from '../components/KindGlyph.jsx';

/**
 * Editorial rails (PLAN.md C5): the first screen stops being a rating sort.
 *
 * A flat sort put 23 Italian entries in the first 60 cards. Each rail is a
 * query against fields the wire already carries, capped at 12 cards, with a
 * "See all N" that opens the grid with the SAME filter applied as chips -
 * the rail and the filter can never describe different lists, because the
 * rail's query IS the filter's predicate, passed in by ExploreTab.
 *
 * Rails render from data already in memory: no fetch, no skeleton state,
 * everything visible at rest. They lead the page only while nothing is
 * filtered or searched; the moment the reader narrows the list, the grid is
 * the answer and the rails step aside.
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
          sizes="180px" ratio={[4, 3]} />
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
        <ScoreChip rating={p.rating} size="xs" />
      </span>
    </button>
  );
}

export function ExploreRails({ rails, onSelect, t }) {
  const visible = rails.filter((r) => r.rows.length >= 4);
  if (!visible.length) return null;
  return (
    <div className="xrails">
      {visible.map((r) => (
        <section key={r.key} className="xrails-rail" aria-label={r.title}>
          <div className="xrails-head">
            <h3 className="xrails-title">{r.title}</h3>
            <button className="xrails-all" onClick={r.seeAll}>
              {t('rail.seeAll', { n: r.rows.length })}
            </button>
          </div>
          <div className="xrails-strip">
            {r.rows.slice(0, CAP).map((p) => (
              <RailCard key={p.id} p={p} onSelect={onSelect} t={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
