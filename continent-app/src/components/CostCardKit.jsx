import React, { useEffect, useState } from 'react';
import { ChevronRightIcon, PencilIcon } from './Icons.jsx';

// The arc: half a circle, drawn as one path the parts share by length
// (pathLength 100), a hair of ground between them.
const ARC = 'M 14 104 A 90 90 0 0 1 194 104';
const GAP = 1.4;

/**
 * The umber cost card's kit (styles: 92-cost-card.css), shared since T1019
 * by the plan tab's CostCard and the place page's DestPriceCard.
 *
 * CostArc, the half arc (T1003). `parts` are
 * { key, eur }: each draws one length in its .ccard-k-{key} colour, in
 * order, sized by its share of the sum. Drawn in once on arrival; after that
 * each length moves to its new value, so a changed figure is seen to move.
 * `children` sit in the arc's middle (the figure and its unit).
 */
export function CostArc({ parts, children }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setDrawn(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const shown = parts.filter((x) => x.eur > 0);
  const sum = shown.reduce((n, x) => n + x.eur, 0);
  const gap = shown.length > 1 ? GAP : 0;
  let at = 0;
  const arcs = shown.map((x) => {
    const share = sum > 0 ? (x.eur / sum) * 100 : 0;
    const seg = { key: x.key, len: drawn && sum > 0 ? Math.max(0.6, share - gap) : 0, from: at };
    at += share;
    return seg;
  });

  return (
    <div className="ccard-gauge">
      <svg className="ccard-arc" viewBox="0 0 208 112" aria-hidden="true" focusable="false">
        <path d={ARC} pathLength="100" className="ccard-arc-ground" />
        {arcs.map((a) => (
          <path key={a.key} d={ARC} pathLength="100" className={`ccard-arc-seg ccard-k-${a.key}`}
            style={{ strokeDasharray: `${a.len} 200`, strokeDashoffset: -a.from }} />
        ))}
      </svg>
      {children}
    </div>
  );
}

/**
 * One row of the umber cost card (T1003; shared since T1019): `lead` (the
 * colour disc or the airline marks), the label with `sub` under it (a pencil
 * when the row `edits` what sets it), the figure, and the chevron's column
 * when `go`, so the figures of a card line up. With `onAct` the row is a
 * button whose name says the label, the sub, the figure and what it does.
 * Extra props (data-*) go on the <li>.
 */
export function CostRow({
  k, lead, label, sub = '', edits = false, fig, figText = '', onAct = null, actLabel = '', popup = false,
  go = true, className = '', ...rest
}) {
  const body = (
    <>
      {lead}
      <span className="ccard-what">
        <span className="ccard-label">{label}</span>
        {sub && (
          <span className="ccard-sub">
            {sub}
            {edits && <PencilIcon size={12} aria-hidden="true" />}
          </span>
        )}
      </span>
      <span className="ccard-fig">{fig}</span>
      {go && (onAct && !edits
        ? <ChevronRightIcon size={16} className="ccard-go" aria-hidden="true" />
        : <span className="ccard-go" aria-hidden="true" />)}
    </>
  );
  return (
    <li className={`ccard-row ccard-k-${k}${className}`} {...rest}>
      {onAct ? (
        <button type="button" className="ccard-hit" onClick={onAct} aria-haspopup={popup ? 'dialog' : undefined}
          aria-label={[label, sub, figText, actLabel].filter(Boolean).join('. ')}>
          {body}
        </button>
      ) : <div className="ccard-hit">{body}</div>}
    </li>
  );
}
