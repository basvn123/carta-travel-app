import { useState } from 'react';
import { StarIcon, InfoIcon } from '../components/Icons.jsx';
import { isMustSee, poiKind, dwellMinutes } from './dayDraft.js';
import { safeUrl } from '../lib/format.js';
import { fmtDur } from './dayFormat.js';

// Presentational pieces of the day planner's "things to do" list and timeline,
// lifted out of DayPlannerTab. All are prop-driven (no parent-scope closure),
// so this is a pure relocation.

export function Collapsible({ title, titleIcon, count, summary, defaultOpen = false, className = '', children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`trip-block day-collapse ${open ? 'open' : ''} ${className}`}>
      <button className="day-collapse-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="day-collapse-headline">
          <span className="day-collapse-title">
            {titleIcon}
            {title}
            {count != null && <span className="day-collapse-count">{count}</span>}
          </span>
          <span className="day-collapse-caret" aria-hidden="true">{open ? '−' : '+'}</span>
        </span>
        {!open && summary && <span className="day-collapse-summary">{summary}</span>}
      </button>
      {open && <div className="day-collapse-body">{children}</div>}
    </div>
  );
}

export function AssignedRow({ item, index, last, dwellMin, onMoveUp, onMoveDown, onRemove }) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className="day-timeline-row">
      <div className="day-timeline-num">{index + 1}</div>
      <div className="day-assigned-row day-assigned-with-info">
        {item.img && <span className="day-thumb" style={{ backgroundImage: `url(${item.img})` }} />}
        <div className="day-assigned-body">
          <span className="day-assigned-name">
            {item.name}
            {isMustSee(item) && <span className="day-badge-must" title="A true must-see here"><StarIcon size={9} /></span>}
            {!isMustSee(item) && (item.rate ?? 0) >= 2 && <span className="day-badge-rated" title="Among the best-rated places here">top rated</span>}
            {item.heritage && <span className="day-badge-heritage" title="On a cultural-heritage register">heritage</span>}
          </span>
          <span className="day-assigned-kind">
            {poiKind(item)}
            {dwellMin ? `, ~${fmtDur(dwellMin)} visit` : ''}
          </span>
        </div>
        <div className="day-timeline-tools">
          <button
            className={`day-activity-info ${infoOpen ? 'open' : ''}`}
            onClick={() => setInfoOpen(!infoOpen)}
            aria-expanded={infoOpen}
            title={`What is ${item.name}?`}
          ><InfoIcon size={13} /></button>
          <button className="trip-stop-move" onClick={onMoveUp} disabled={index === 0} aria-label="Move earlier" title="Move earlier">↑</button>
          <button className="trip-stop-move" onClick={onMoveDown} disabled={last} aria-label="Move later" title="Move later">↓</button>
          <button className="trip-stop-remove" onClick={onRemove} aria-label="Remove" title="Remove">×</button>
        </div>
        {infoOpen && (
          <div className="day-activity-detail day-timeline-detail">
            <p>
              {item.desc || `${poiKind(item) || 'Place'} in this city.`}
              {!item.desc && isMustSee(item) ? ' Among the highest-rated sights here.' : ''}
            </p>
            {safeUrl(item.wiki) && (
              <a href={safeUrl(item.wiki)} target="_blank" rel="noreferrer">Read more on Wikipedia ↗</a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** One gradation tier of the "Things to do" list: a collapsible header plus
 *  its rows. `entries` is [{ item, idx }] with idx = the item's ORIGINAL index
 *  in activities.items (what assignments and toggleActivity speak). */
export function ActivitySection({ title, badge, entries, variant = '', defaultOpen = false, assignedIdx, onToggle }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`day-tier day-tier-${variant} ${open ? 'open' : ''}`}>
      <button className="day-tier-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {badge && <span className="day-tier-badge">{badge}</span>}
        {title}
        <span className="day-tier-count">{entries.length}</span>
        <span className="day-tier-caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="day-activity-list">
          {entries.map(({ item, idx, note }) => (
            <ActivityRow
              key={idx}
              item={item}
              variant={variant}
              added={assignedIdx.includes(idx)}
              onToggle={() => onToggle(idx)}
              note={note}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A pickable place: thumbnail, name + kind, must-see star when it earns one,
 *  and an ⓘ that expands what-it-is details (description + Wikipedia link)
 *  without toggling the pick. */
export function ActivityRow({ item, variant, added, onToggle, note }) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className={`day-activity-row day-activity-rich ${variant} ${added ? 'added' : ''}`}>
      <button className="day-activity-main" onClick={onToggle}>
        {item.img
          ? <span className="day-thumb" style={{ backgroundImage: `url(${item.img})` }} />
          : <span className="day-thumb day-thumb-empty" aria-hidden="true">{(item.kind || '').slice(0, 1)}</span>}
        <span className="day-assigned-body">
          <span className="day-assigned-name">
            {item.name}
            {(variant === 'must' || isMustSee(item)) && <span className="day-badge-must" title="A true must-see here"><StarIcon size={9} /></span>}
            {!isMustSee(item) && variant !== 'must' && (item.rate ?? 0) >= 2 && <span className="day-badge-rated" title="Among the best-rated places here">top rated</span>}
            {item.heritage && <span className="day-badge-heritage" title="On a cultural-heritage register">heritage</span>}
          </span>
          <span className="day-assigned-kind">{poiKind(item)}</span>
          {note && <span className="day-poi-note">{note}</span>}
        </span>
        <span className="day-activity-add">{added ? '✓' : '+'}</span>
      </button>
      <button
        className={`day-activity-info ${infoOpen ? 'open' : ''}`}
        onClick={() => setInfoOpen(!infoOpen)}
        aria-expanded={infoOpen}
        title={`What is ${item.name}?`}
      ><InfoIcon size={14} /></button>
      {infoOpen && (
        <div className="day-activity-detail">
          <p>
            {item.desc || `${poiKind(item) || 'Place'} in this city.`}
            {!item.desc && isMustSee(item) ? ' Among the highest-rated sights here.' : ''}
            {` Plan ~${fmtDur(dwellMinutes(poiKind(item)))} for a visit.`}
          </p>
          {safeUrl(item.wiki) && (
            <a href={safeUrl(item.wiki)} target="_blank" rel="noreferrer">Read more on Wikipedia ↗</a>
          )}
        </div>
      )}
    </div>
  );
}
