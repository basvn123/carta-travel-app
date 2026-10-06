import React from 'react';
import {
  monthCells, altitudeParts, slopeShares, pavedShares,
} from '../lib/signature.js';

/**
 * The 6 px strip along the bottom of a card's photograph. Decorative to a
 * screen reader (the card's name is the button's text and the page carries
 * the figures), so aria-hidden. One component, four fillings:
 *   trail     the slope mix from the list wire's steep shares
 *   cycle     paved against unpaved, over the length with a surface tag
 *   lake      the swim months, the warmest one darkest
 *   mountain  the altitude bar, prominence solid
 * A beach card has none until the sea record exists. Each returns null
 * when its row carries no reading, so a card never shows an empty strip.
 */
export function CardStrip({ kind, row, warmC = 18 }) {
  if (!row) return null;
  if (kind === 'mountain') {
    const alt = altitudeParts(row.ele, row.prom);
    if (!alt) return null;
    return (
      <span className="places-card-strip" aria-hidden="true">
        <span className="sig-seg is-base" style={{ width: `${alt.base * 100}%` }} />
        <span className="sig-seg is-prom" style={{ width: `${alt.prom * 100}%` }} />
      </span>
    );
  }
  if (kind === 'lake') {
    const cells = monthCells(row.swim?.temps, { threshold: warmC });
    if (!cells || !cells.some((c) => c.on)) return null;
    return (
      <span className="places-card-strip is-months" aria-hidden="true">
        {cells.map((c) => (
          <span key={c.n} className={`sig-seg ${c.on ? 'is-on' : ''} ${c.on && c.peak ? 'is-peak' : ''}`.trim()} />
        ))}
      </span>
    );
  }
  const parts = kind === 'trail' ? slopeShares(row.steep) : kind === 'cycle' ? pavedShares(row.paved) : null;
  if (!parts) return null;
  return (
    <span className="places-card-strip" aria-hidden="true">
      {parts.filter((p) => p.share > 0.005).map((p) => (
        <span key={p.key} className={`rsurf-seg is-${p.tone}`} style={{ width: `${p.share * 100}%` }} />
      ))}
    </span>
  );
}
