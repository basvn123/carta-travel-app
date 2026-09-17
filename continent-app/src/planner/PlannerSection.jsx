import React from 'react';

/**
 * One captioned block inside a planner step.
 *
 * The wizard steps grew as ad-hoc pairs of a `.trip-field-label` and a div,
 * each with its own margins, so the vertical rhythm was different on every
 * screen and the titles sat on top of their content. This is the one shape
 * they all use now: a section, a header, the block. The spacing lives in the
 * "Planner rhythm" block in styles.css and nowhere else.
 *
 * @param title   the caption. Omit for an uncaptioned block that still wants
 *                the section spacing.
 * @param sub     one line under the caption, when the caption needs a gloss.
 * @param aside   something right-aligned on the caption row: a count, a
 *                "change" button, a clear-all.
 */
export function PlannerSection({ title, sub, aside, className = '', children, ...rest }) {
  return (
    <section className={`guide-section ${className}`.trim()} {...rest}>
      {(title || aside) && (
        <header className="guide-section-head">
          {title && <h3 className="guide-section-title">{title}</h3>}
          {aside && <div className="guide-section-aside">{aside}</div>}
        </header>
      )}
      {sub && <p className="guide-section-sub">{sub}</p>}
      {children}
    </section>
  );
}
