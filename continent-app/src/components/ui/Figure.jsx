/*
 * Figure (G1, G5; house style 2026-11, DESIGN.md "Numbers that move
 * honestly"): a money figure that answers the traveller's own change.
 *
 *   <Figure value={total} precision="cents" mine={changedByMe} delta label="Total, 2 people" />
 *
 * - `mine` true (the traveller just changed an input that moved this figure):
 *   the new value rolls in from the side it moved to, once, and a delta note
 *   ("+€328") shows for DUR_NOTE_MS (the --dur-note token).
 * - `mine` false and the value changed: one shared dip, no roll.
 * - `still` (a refresh, a co-planner's edit, data arriving): the new value is
 *   set at once with no motion at all, so a figure nobody touched never moves.
 * - First render and reduced motion: the end state at once. Never loops.
 * Screen readers (Ledger's rule): after a change the traveller made, one
 * polite announcement of the full value (with its label), never per digit;
 * the visible figure and the delta note are not announced on their own.
 * One Figure is one announcement; for a group of figures that move together,
 * give `mine` to the one the traveller acts on and `still` to the rest.
 */
import React, { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../lib/money.js';
import { prefersReducedMotion } from '../../lib/motion.js';

/** How long a delta note stays: the --dur-note token (01-tokens.css). */
export const DUR_NOTE_MS = 4000;

export function Figure({ value, precision = 'whole', mine = false, still = false, delta = false, label, className = '' }) {
  const prev = useRef(value);
  const [anim, setAnim] = useState(null);
  const [note, setNote] = useState(null);
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === value || !Number.isFinite(before) || !Number.isFinite(value)) return undefined;
    const full = formatMoney(value, { precision });
    if (mine) setSpoken(label ? `${label} ${full}` : full);
    if (still || prefersReducedMotion()) return undefined;
    setAnim(mine ? (value > before ? 'roll-up' : 'roll-down') : 'dip');
    if (mine && delta) {
      const d = value - before;
      setNote(`${d > 0 ? '+' : '-'}${formatMoney(Math.abs(d), { precision })}`);
      const id = setTimeout(() => setNote(null), DUR_NOTE_MS);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [value, mine, still, delta, precision, label]);
  const cls = ['hs-fig', anim === 'dip' && 'hs-dip', anim?.startsWith('roll') && 'hs-roll', anim === 'roll-down' && 'is-down', className]
    .filter(Boolean).join(' ');
  return (
    <>
      <span key={`${value}`} className={cls} onAnimationEnd={() => setAnim(null)}>
        {Number.isFinite(value) ? formatMoney(value, { precision }) : null}
      </span>
      {note && <span className="hs-delta" aria-hidden="true">{note}</span>}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{spoken}</span>
    </>
  );
}
