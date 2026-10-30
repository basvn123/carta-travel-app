import React from 'react';

/**
 * A persona's mark (owner, plan flow walk 2026-10-30: "more modern, clean,
 * visually top notch", no place photographs): a small diagram of how that
 * traveller moves, in crisp ink line geometry. The filled dot is always
 * where you stay; hollow shapes are what you visit or pass. Drawn in
 * currentColor on a 72 x 48 grid, so the tile and the sheet colour it (ink,
 * or the selected ink). Each line carries pathLength 1, so a selected tile
 * can draw it once (stroke-dashoffset, 86-plan-flow.css). Decorative: the
 * name and statement beside it say the same in words.
 */
const L = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', pathLength: 1, className: 'pf-pmark-line' };
const BASE = { fill: 'currentColor', className: 'pf-pmark-base' };
const HOLLOW = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, className: 'pf-pmark-soft' };

const MARKS = {
  // Three big cities, one after another.
  cities: (
    <>
      <path {...L} d="M18 24 H30 M42 24 H54" />
      <rect {...BASE} x="6" y="16" width="12" height="16" rx="2" />
      <rect {...HOLLOW} x="30" y="13" width="12" height="22" rx="2" />
      <rect {...HOLLOW} x="54" y="18" width="12" height="12" rx="2" />
    </>
  ),
  // One big base, day trips out and back.
  hubtrips: (
    <>
      <path {...L} d="M36 24 L13 11 M36 24 L59 11 M36 24 L13 37 M36 24 L59 37" />
      <circle {...HOLLOW} cx="12" cy="10" r="3" />
      <circle {...HOLLOW} cx="60" cy="10" r="3" />
      <circle {...HOLLOW} cx="12" cy="38" r="3" />
      <circle {...HOLLOW} cx="60" cy="38" r="3" />
      <circle {...BASE} cx="36" cy="24" r="7" />
    </>
  ),
  // Your base just outside the big city.
  outside: (
    <>
      <circle {...L} cx="24" cy="22" r="13" />
      <path {...L} d="M37 25 L50 30" />
      <circle {...BASE} cx="55" cy="32" r="5" />
    </>
  ),
  // Small towns along one road through a region.
  towns: (
    <>
      <path {...L} d="M6 36 C16 36 18 20 28 22 S 42 36 50 26 S 60 12 66 12" />
      <circle {...BASE} cx="6" cy="36" r="3.5" />
      <circle {...BASE} cx="28" cy="22" r="3.5" />
      <circle {...BASE} cx="50" cy="26" r="3.5" />
      <circle {...BASE} cx="66" cy="12" r="3.5" />
    </>
  ),
  // A base by the water.
  coast: (
    <>
      <path {...L} d="M4 34 Q12 28 20 34 T36 34 T52 34 T68 34" />
      <path {...L} d="M10 41 Q18 36 26 41 T42 41 T58 41" />
      <circle {...BASE} cx="36" cy="18" r="5" />
    </>
  ),
  // A village below the mountains.
  nature: (
    <>
      <path {...L} d="M4 38 L20 14 L30 27 L42 8 L68 38" />
      <path {...L} d="M38 14 L42 8 L46 14" />
      <circle {...BASE} cx="30" cy="41" r="3.5" />
    </>
  ),
  // Your base away from where everyone else goes.
  hidden: (
    <>
      <circle {...HOLLOW} cx="10" cy="14" r="2.5" />
      <circle {...HOLLOW} cx="20" cy="24" r="2.5" />
      <circle {...HOLLOW} cx="9" cy="32" r="2.5" />
      <circle {...HOLLOW} cx="22" cy="10" r="2.5" />
      <circle {...HOLLOW} cx="27" cy="34" r="2.5" />
      <path {...L} d="M30 24 C40 24 44 34 52 34" />
      <circle {...BASE} cx="58" cy="34" r="5" />
    </>
  ),
  // One base, slow days around it.
  slow: (
    <>
      <circle {...L} cx="36" cy="24" r="12" />
      <circle {...L} cx="36" cy="24" r="20" />
      <circle {...BASE} cx="36" cy="24" r="5" />
    </>
  ),
  // A lively base, things going on all around.
  lively: (
    <>
      <path {...L} d="M36 8 V13 M36 35 V40 M20 24 H25 M47 24 H52 M25 13 L28.5 16.5 M43.5 31.5 L47 35 M47 13 L43.5 16.5 M28.5 31.5 L25 35" />
      <circle {...BASE} cx="36" cy="24" r="6" />
    </>
  ),
  // A bit of everything.
  mix: (
    <>
      <rect {...HOLLOW} x="8" y="16" width="14" height="16" rx="2" />
      <path {...L} d="M30 36 L38 18 L46 36 Z" />
      <path {...L} d="M52 30 Q57 25 62 30 T72 30" />
      <circle {...BASE} cx="38" cy="40" r="3" />
    </>
  ),
};

export function PersonaMark({ id, className = '' }) {
  const mark = MARKS[id];
  if (!mark) return null;
  return (
    <svg className={`pf-pmark ${className}`.trim()} viewBox="0 0 72 48" aria-hidden="true" focusable="false">
      {mark}
    </svg>
  );
}
