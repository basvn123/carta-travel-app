import React from 'react';
import { ChevronDownIcon } from '../components/Icons.jsx';

/**
 * One folding section, the disclosure primitive the long pages share.
 *
 * The header is the summary when closed and the title when open, which is what
 * lets a page of twenty sections read as a summary at a glance and as a guide
 * when opened: "When to go: best Apr, May" answers the question without
 * costing the reader a tap.
 *
 * The body mounts only while open. That is not only a paint saving, it is what
 * keeps a closed map from holding a WebGL context and a closed photo strip
 * from fetching anything.
 *
 * Lives here rather than inside DestinationPage.jsx because the trip and
 * journey pages need the same grammar: same markup, same chevron, same
 * animation, one .dsec rule set in styles.css.
 */
export function Fold({
  id, icon: Icon, title, summary, open, onToggle, children, aside, className = '',
}) {
  return (
    <section className={`dsec ${open ? 'is-open' : ''} ${className}`} id={id}>
      <div className="dsec-head">
        <button
          type="button"
          className="dsec-toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-body`}
        >
          {Icon && <Icon size={14} className="dsec-icon" />}
          <span className="dsec-title">{title}</span>
          {!open && summary && <span className="dsec-summary">{summary}</span>}
          <ChevronDownIcon size={14} className="dsec-chev" />
        </button>
        {open && aside && <div className="dsec-aside">{aside}</div>}
      </div>
      {open && <div className="dsec-body" id={`${id}-body`}>{children}</div>}
    </section>
  );
}
