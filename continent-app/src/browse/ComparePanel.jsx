import React, { useMemo } from 'react';
import { composeTrip } from '../lib/runtime_pricing.js';
import { eur } from '../lib/format.js';
import { RatingBadge } from '../components/RatingBadge.jsx';

/**
 * Side-by-side comparison of the shortlisted (favorited) destinations. Prices
 * each with the current dates/choices and lines up flights, accommodation and
 * on-the-ground so the user can pick. Cheapest column is highlighted.
 */
export function ComparePanel({ data, favorites, departDate, returnDate, choices, priceMode, onClose, onSelect, onToggleFav }) {
  const group = Math.max(1, choices.group_size || 1);

  const cols = useMemo(() => {
    const ids = [...(favorites || [])];
    const out = [];
    for (const id of ids) {
      const dest = data?.destinations?.[id];
      if (!dest) continue;
      const b = composeTrip(dest, departDate, returnDate, choices, data?.destinations);
      out.push({ id, dest, b });
    }
    // Cheapest priced first; unpriced last.
    out.sort((a, b) => {
      const av = a.b?.grand_total ?? Infinity;
      const bv = b.b?.grand_total ?? Infinity;
      return av - bv;
    });
    return out;
  }, [data, favorites, departDate, returnDate, choices]);

  const pp = priceMode === 'pp';
  const div = (groupTotal) => (groupTotal == null ? null : pp ? groupTotal / group : groupTotal);

  const cheapest = cols.find((c) => c.b)?.b?.grand_total ?? null;

  // Each row: a label + a getter that returns a per-column group-total value.
  const rows = [
    { label: 'Getting there', get: (b) => b && (b.transport_mode === 'car' ? b.driving?.total : (b.flight_total != null ? b.flight_total + (b.transfer_total || 0) + (b.rental_total || 0) : null)) },
    { label: 'Accommodation', get: (b) => b?.accom_total },
    { label: 'On the ground', get: (b) => b?.ground_total },
  ];

  return (
    <div className="compare-overlay" onClick={onClose}>
      <div className="compare-modal" onClick={(e) => e.stopPropagation()}>
        <div className="compare-head">
          <div>
            <div className="panel-tag">Shortlist</div>
            <h2 className="compare-title">Compare {cols.length} destinations</h2>
            <div className="compare-sub">
              {departDate} -&gt; {returnDate}, {group} {group === 1 ? 'person' : 'people'}, {pp ? 'per person' : 'total'}
            </div>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Close">x</button>
        </div>

        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-rowlabel" />
                {cols.map((c) => (
                  <th key={c.id} className={c.b?.grand_total === cheapest && cheapest != null ? 'is-cheapest' : ''}>
                    <button className="compare-city" onClick={() => onSelect(c.id)}>
                      {c.dest.city}
                    </button>
                    <span className="compare-ccountry">{c.dest.country}</span>
                    {c.b?.grand_total === cheapest && cheapest != null && (
                      <span className="compare-badge">cheapest</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="compare-rowlabel">Rating</td>
                {cols.map((c) => (
                  <td key={c.id}>
                    {c.dest.rating?.score != null
                      ? <RatingBadge rating={c.dest.rating} size="xs" />
                      : '-'}
                  </td>
                ))}
              </tr>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="compare-rowlabel">{r.label}</td>
                  {cols.map((c) => (
                    <td key={c.id}>{c.b ? eur(div(r.get(c.b))) : '-'}</td>
                  ))}
                </tr>
              ))}
              <tr className="compare-total">
                <td className="compare-rowlabel">Total</td>
                {cols.map((c) => (
                  <td key={c.id} className={c.b?.grand_total === cheapest && cheapest != null ? 'is-cheapest' : ''}>
                    {c.b ? eur(div(c.b.grand_total)) : 'no route'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="compare-rowlabel" />
                {cols.map((c) => (
                  <td key={c.id}>
                    <button
                      className="compare-remove"
                      onClick={() => onToggleFav(c.id)}
                    >
                      remove
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
