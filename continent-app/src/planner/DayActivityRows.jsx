import { useState } from 'react';
import {
  StarIcon, InfoIcon, HomeIcon, BeachIcon, MountainIcon, CastleIcon,
} from '../components/Icons.jsx';
import { isMustSee, poiKind, poiMapCat } from './dayDraft.js';
import { safeUrl } from '../lib/format.js';

/** A place with no photo still deserves a thumbnail that says what it is.
 *  The glyphs match the map pins (town / nature / active / sight), so a row
 *  and its pin read as the same thing. */
const THUMB_GLYPH = { town: HomeIcon, beach: BeachIcon, active: MountainIcon, sight: CastleIcon };

/** The one thumbnail every list of places uses: the photo when the catalogue
 *  has one, its category glyph when it does not. `cat` is a poiMapCat key and
 *  `Glyph` overrides it for places that are not catalogue rows at all (a bot
 *  find has no category to speak of). */
export function PoiThumb({ img, cat, name, Glyph }) {
  // Some harvested photo URLs are dead (Wikimedia 400s on a few of the 640px
  // thumbnails). A CSS background cannot tell, so it paints an empty tinted
  // square; a real <img> can say it failed and hand the row back to its glyph.
  const [failed, setFailed] = useState(false);
  if (img && !failed) {
    return (
      <img
        className="day-thumb"
        src={img}
        alt={name || ''}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  const Fallback = Glyph || THUMB_GLYPH[cat] || CastleIcon;
  return (
    <span className="day-thumb day-thumb-empty" aria-hidden="true">
      <Fallback size={19} />
    </span>
  );
}

function ItemThumb({ item }) {
  return <PoiThumb img={item.img} cat={poiMapCat(item)} name={item.name} />;
}

/** Name first, badges under it. The name owns its whole line (wrapping, never
 *  truncating: "Hohensalzburg Fortress" must not render as "H..."), and the
 *  badge row beneath carries only marks that differentiate: the must-see
 *  star, the heritage register, a custom place's origin. The rating chip is
 *  gone from these lists on purpose: with nearly every card wearing the same
 *  8.7 it ranked nothing and only crowded the title out of its own row. */
function RowTitle({ item, must }) {
  const badges = [
    must && <span key="m" className="day-badge-must" title="A true must-see here"><StarIcon size={9} /></span>,
    item.heritage && <span key="h" className="day-badge-heritage" title="On a cultural-heritage register">heritage</span>,
    item.custom && (
      <span
        key="c"
        className="day-badge-custom"
        title={item.unmapped
          ? 'Your own place. Location approximate: shown at the city centre'
          : 'Your own place, added to this plan by you'}
      >
        custom{item.unmapped ? ', location approximate' : ''}
      </span>
    ),
  ].filter(Boolean);
  return (
    <span className="day-assigned-name">
      <span className="day-assigned-title">{item.name}</span>
      {badges.length > 0 && <span className="day-assigned-badges">{badges}</span>}
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

/** One stop of the planned day. The name is never truncated here: a row whose
 *  title reads "Erzabtei Sankt..." tells a traveller nothing. Under it sits the
 *  sentence that says what the place is (the bot's reason when the day was
 *  imported, the catalogue description otherwise) and the visit estimate, so
 *  the timeline carries context instead of a clock. */
export function AssignedRow({ item, index, last, stayLabel, note, noteFromAi, onMoveUp, onMoveDown, onRemove }) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className="day-timeline-row">
      <div className="day-timeline-num">{index + 1}</div>
      <div className="day-assigned-row day-assigned-with-info">
        {/* Always a thumbnail, photo or glyph: a timeline where only some rows
            carry a picture reads as a list with holes punched in it. */}
        <ItemThumb item={item} />
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
        {/* The narrative and the visit estimate wrap onto their own full-width
            line of the card. Kept inside the title column they would have had
            about 160px to work with, which is four words before the clamp. */}
        {(note || stayLabel) && (
          <div className="day-assigned-foot">
            {note && <p className={`day-assigned-note${noteFromAi ? ' from-ai' : ''}`}>{note}</p>}
            {stayLabel && <span className="day-assigned-when">{stayLabel}</span>}
          </div>
        )}
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
        <ItemThumb item={item} />
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
