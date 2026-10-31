import React from 'react';
import { ChevronRightIcon } from '../../components/Icons.jsx';
import { Button } from '../../components/ui/index.js';

/**
 * The Account page's own pieces (T933, the owner-approved spec "Account:
 * who you are, what you pay, what Carta knows"). Every row is a label, its
 * current value and one action; no captions under rows.
 * Styles: src/styles/91-account.css (class prefix .ac-), imported by
 * AccountPanel.jsx.
 */

/** A plain left click, the one a link may turn into an in-app step. */
export function plainClick(e) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/**
 * One row. With `href` it is a link (it changes the view: a section, a page
 * outside the app); with `onClick` a button (an action, an editor); with
 * neither it is a static row whose `children` hold its control (a switch,
 * a segmented choice). `expanded` makes it a disclosure for an editor that
 * opens in place under it.
 */
export function Row({
  icon: Icon, label, value = null, href, onClick, danger = false, expanded, rowRef,
  children = null, ariaLabel, external = false, chevron = true, className = '',
}) {
  const inner = (
    <>
      {Icon && <Icon size={20} className="ac-row-icon" />}
      <span className="ac-row-label">{label}</span>
      {/* Always drawn on a row that acts, so the chevron keeps its column. */}
      {((value != null && value !== '') || href || onClick) && <span className="ac-row-v">{value}</span>}
      {children}
      {(href || onClick) && chevron && (
        <ChevronRightIcon size={16} className={`ac-row-chev${expanded ? ' is-open' : ''}`} />
      )}
    </>
  );
  const cls = `ac-row${danger ? ' is-danger' : ''}${!href && !onClick ? ' is-static' : ''} ${className}`.trim();
  if (href) {
    return (
      <a
        className={cls}
        href={href}
        ref={rowRef}
        aria-label={ariaLabel}
        {...(external ? {} : {
          onClick: (e) => {
            if (!onClick || !plainClick(e)) return;
            e.preventDefault();
            onClick(e);
          },
        })}
      >
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <Button variant="quiet" block className={cls} onClick={onClick} ref={rowRef} aria-label={ariaLabel} aria-expanded={expanded}>
        {inner}
      </Button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/** A group of rows under an optional 12 px heading, on one white list. */
export function Group({ id, title, children, className = '' }) {
  const kids = React.Children.toArray(children).filter(Boolean);
  if (!kids.length) return null;
  return (
    <section className={`ac-group ${className}`.trim()} aria-labelledby={title ? id : undefined}>
      {title && <h2 className="ac-group-h" id={id}>{title}</h2>}
      <div className="ac-list">{kids}</div>
    </section>
  );
}

/** A whole-word list of values, "Trips, countries, tips". */
export function listValue(words, lang) {
  const list = words.filter(Boolean);
  if (!list.length) return '';
  try { return new Intl.ListFormat(lang, { style: 'short', type: 'unit' }).format(list); } catch { return list.join(', '); }
}

/** A date as "12 Mar 2027" in the reader's language. */
export function fmtDate(iso, locale) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  } catch { return ''; }
}
