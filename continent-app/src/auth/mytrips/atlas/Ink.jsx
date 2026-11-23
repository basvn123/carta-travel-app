import React from 'react';
import { Pressable } from '../../../components/ui/Pressable.jsx';
import { ArrowDownIcon, ArrowUpIcon } from '../../../components/Icons.jsx';

/*
 * The ink and photo parts of My trips (G12, decision 0016): one section head,
 * one two-way frame, the price move in ink, the empty price cell and the
 * country silhouette. Their look is in src/styles/73-mytrips-ink.css, scoped
 * to the My trips panel so Explore and Plan keep the kit as it is.
 */

/**
 * A section's head: the title, its count as a plain figure beside it, and
 * one action at the end (a quiet link or a Frame2). The id stays on the
 * heading for the section's aria-labelledby.
 */
export function SectHead({ id, title, count = null, icon = null, action = null, as: H = 'h3', className = '' }) {
  return (
    <div className={`ink-sh ${className}`.trim()}>
      {icon}
      <H className="ink-sh-t" id={id}>{title}</H>
      {count != null && <span className="ink-sh-n num">{count}</span>}
      {action && <div className="ink-sh-act">{action}</div>}
    </div>
  );
}

/**
 * A choice of two (Per dag | Hele reis): one umber frame, the chosen cell in
 * the action paint. Pressed buttons in a labelled group, so a screen reader
 * hears which one is on.
 *   options  [[value, label], [value, label]]
 */
export function Frame2({ label, options, value, onChange, className = '' }) {
  return (
    <div className={`ink-frame ${className}`.trim()} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <Pressable key={v} haptic="tick" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</Pressable>
      ))}
    </div>
  );
}

/** A price move in ink on its own line: the arrow, then the words. Down is
 *  umber, up is ink 2; the arrow and the word say it, never the colour alone. */
export function MoveInk({ delta, children, className = '' }) {
  const Arrow = delta < 0 ? ArrowDownIcon : ArrowUpIcon;
  return (
    <span className={`ink-move${delta < 0 ? ' is-down' : ''} ${className}`.trim()}>
      {delta ? <Arrow size={14} /> : null}<span>{children}</span>
    </span>
  );
}

/** No price yet: the empty cell (a dashed square) and the words, on one line. */
export function NoPrice({ children, className = '' }) {
  return <span className={`ink-noprice ${className}`.trim()}>{children}</span>;
}

/** The bounds of an SVG path written in absolute coordinates (the plate's countries). */
const boundsOf = (d) => {
  const n = (String(d).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) {
    x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]);
  }
  return Number.isFinite(x0) ? [x0, y0, x1 - x0, y1 - y0] : null;
};

/** A country's silhouette from the Europe plate's own path, decorative. */
export function Silhouette({ d, className = '' }) {
  const box = d ? boundsOf(d) : null;
  if (!box) return null;
  const pad = Math.max(box[2], box[3]) * 0.06;
  return (
    <svg className={className} viewBox={`${box[0] - pad} ${box[1] - pad} ${box[2] + pad * 2} ${box[3] + pad * 2}`} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** The traveller's grade as ten small cells in one umber frame, filled to n
 *  (the best trip in umber 800), with "9/10" printed beside it. */
export function GradeCells({ n, top = false, label }) {
  return (
    <span className={`ink-grade${top ? ' is-top' : ''}`} role="img" aria-label={label}>
      <span className="ink-grade-cells" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < n ? 'is-on' : undefined} />)}
      </span>
      <b aria-hidden="true">{n}<small>/10</small></b>
    </span>
  );
}

/** No grade yet: the ten cells dashed and empty, and the action beside them. */
export function GradeEmpty({ children }) {
  return (
    <span className="ink-grade is-none">
      <span className="ink-grade-cells" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => <i key={i} />)}
      </span>
      {children}
    </span>
  );
}
