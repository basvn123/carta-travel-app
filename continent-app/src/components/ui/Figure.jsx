/*
 * Figure (G1, G5; house style 2026-11, DESIGN.md "Numbers that move
 * honestly"): a money figure that answers the traveller's own change.
 *
 *   <Figure value={total} precision="cents" mine={changedByMe} delta />
 *
 * - `mine` true (the traveller just changed an input that moved this figure):
 *   the new value rolls in from the side it moved to, once, and a delta note
 *   ("+€328") shows for --dur-note.
 * - `mine` false and the value changed: one shared dip, no roll.
 * - First render, reduced motion, or a change while the page scrolls: the
 *   end state at once. Never animates a price nobody touched under the
 *   reader's eye; never loops.
 * Screen readers hear the new value once, politely (Ledger's rule), from
 * the visible text; the delta note is decorative.
 */
import React, { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../lib/money.js';
import { prefersReducedMotion } from '../../lib/motion.js';

export function Figure({ value, precision = 'whole', mine = false, delta = false, className = '' }) {
  const prev = useRef(value);
  const [anim, setAnim] = useState(null);
  const [note, setNote] = useState(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === value || !Number.isFinite(before) || !Number.isFinite(value) || prefersReducedMotion()) return undefined;
    setAnim(mine ? (value > before ? 'roll-up' : 'roll-down') : 'dip');
    if (mine && delta) {
      const d = value - before;
      setNote(`${d > 0 ? '+' : '-'}${formatMoney(Math.abs(d), { precision })}`);
      const id = setTimeout(() => setNote(null), 4000);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [value, mine, delta, precision]);
  const cls = ['hs-fig', anim === 'dip' && 'hs-dip', anim?.startsWith('roll') && 'hs-roll', anim === 'roll-down' && 'is-down', className]
    .filter(Boolean).join(' ');
  return (
    <>
      <span key={`${value}`} className={cls} onAnimationEnd={() => setAnim(null)}>
        {Number.isFinite(value) ? formatMoney(value, { precision }) : null}
      </span>
      {note && <span className="hs-delta" aria-hidden="true">{note}</span>}
    </>
  );
}
