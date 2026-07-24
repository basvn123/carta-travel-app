import { useState } from 'react';
import {
  StarIcon, InfoIcon, HomeIcon, BeachIcon, MountainIcon, CastleIcon,
} from '../components/Icons.jsx';
import { isMustSee, poiKind, poiRating, poiMapCat } from './dayDraft.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { safeUrl } from '../lib/format.js';

/** A place with no photo still deserves a thumbnail that says what it is.
 *  The glyphs match the map pins (town / nature / active / sight), so a row
 *  and its pin read as the same thing. */
const THUMB_GLYPH = { town: HomeIcon, beach: BeachIcon, active: MountainIcon, sight: CastleIcon };

function ThumbFallback({ item }) {
  const Glyph = THUMB_GLYPH[poiMapCat(item)] || CastleIcon;
  return (
    <span className="day-thumb day-thumb-empty" aria-hidden="true">
      <Glyph size={19} />
    </span>
  );
}

/** Name + its badges. The name truncates on its own line box so a long title
 *  can never push the rating chip out of view, and the badge cluster keeps a
 *  clear gap from the text instead of butting up against the ellipsis. */
function RowTitle({ item, must }) {
  return (
    <span className="day-assigned-name">
      <span className="day-assigned-title">{item.name}</span>
      <span className="day-assigned-badges">
        <ScoreChip rating={poiRating(item)} />
        {must && <span className="day-badge-must" title="A true must-see here"><StarIcon size={9} /></span>}
        {item.heritage && <span className="day-badge-heritage" title="On a cultural-heritage register">heritage</span>}
      </span>
    </span>
  );
}

/** The expandable what-is-this panel behind every ⓘ: photo first, then the
 *  description, then Wikipedia. Time-planning numbers stay out of it on
 *  purpose: readers want to know WHAT a place is, the route already says
 *  how the day fits together. */
function ActivityDetail({ item, className = 'day-activity-detail' }) {
  return (
    <div className={className}>
      {item.img && (
        <span
          className="day-detail-photo"
          style={{ backgroundImage: `url(${item.img})` }}
          role="img"
          aria-label={item.name}
        />
      )}
      <p>
        {item.desc || `${poiKind(item) || 'Place'} in this city.`}
        {!item.desc && isMustSee(item) ? ' Among the highest-rated sights here.' : ''}
      </p>
      {safeUrl(item.wiki) && (
        <a href={safeUrl(item.wiki)} target="_blank" rel="noreferrer">Read more on Wikipedia ↗</a>
      )}
    </div>
  );
}

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

export function AssignedRow({ item, index, last, onMoveUp, onMoveDown, onRemove }) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className="day-timeline-row">
      <div className="day-timeline-num">{index + 1}</div>
      <div className="day-assigned-row day-assigned-with-info">
        {item.img && <span className="day-thumb" style={{ backgroundImage: `url(${item.img})` }} />}
        <div className="day-assigned-body">
          <RowTitle item={item} must={isMustSee(item)} />
          <span className="day-assigned-kind">
            {poiKind(item)}
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
        {infoOpen && <ActivityDetail item={item} className="day-activity-detail day-timeline-detail" />}
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
          : <ThumbFallback item={item} />}
        <span className="day-assigned-body">
          <RowTitle item={item} must={variant === 'must' || isMustSee(item)} />
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
      {infoOpen && <ActivityDetail item={item} />}
    </div>
  );
}
