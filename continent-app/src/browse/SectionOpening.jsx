import React, { useCallback, useEffect, useRef, useState } from 'react';
import { srcSetFor, fallbackSrc } from '../lib/heroImage.js';
import { scrollBehavior } from '../lib/motion.js';
import { openShared } from '../lib/sharedElement.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { ChevronRightIcon, RouteIcon } from '../components/Icons.jsx';

/**
 * The opening screen of an outdoor section (spec 5.3, T183): Band 1, the
 * icons, and Band 2, the useful cuts. Band 3 is the grid DestinationsTab
 * already draws under it. What goes in each band is decided in
 * lib/openingScreen.js; this file only draws it.
 *
 * Built from what the app already ships rather than new vocabulary: the rails
 * are Explore's rails (.xrails-*, .railcard, the same "See all N" and the
 * same arrow buttons), and the icons are railcards laid out as a grid. The
 * two things Explore did not have, the 220 px card and the dot indicator,
 * are drawn from tokens only (styles/30-section-opening.css). carta-design
 * has no written rule for a carousel yet; row T183-b asks the owner for one.
 *
 * `describe(row)` returns { name, where, fact } for one wire row: the name
 * in the display face, where it is in the sans, and at most one measured
 * fact in mono.
 *
 * `maxRails` (T384, rule N4): a phone draws at most two rails; the further
 * cuts become one row of chips that apply the same saved filter as the
 * rail's "See all", so no cut is lost and the opening stops being a scroll
 * of six carousels. Desktop passes null and keeps every rail.
 *
 * T394 (V4): each card's one figure carries its label under it, as the grid
 * cards' values do (`describe` returns `factLabel`); `sharedKey(row)` names
 * the key the opened page claims its header photograph with, so the card's
 * photograph grows into the page (lib/sharedElement.js); and a cut's count
 * settles in place when a filter elsewhere changes it.
 */

// What a Band 1 photo is drawn at: half the phone, a third of the column.
const ICON_SIZES = '(max-width: 768px) 50vw, min(30vw, 380px)';
const RAIL_SIZES = '200px';

function Photo({ url, sizes, eager = false, first = false }) {
  if (!url) {
    return (
      <span className="railcard-img open-noimg" aria-hidden="true">
        <RouteIcon size={22} />
      </span>
    );
  }
  return (
    <img
      className="railcard-img"
      src={fallbackSrc(url, 500)}
      srcSet={srcSetFor(url, 960)}
      sizes={sizes}
      alt=""
      width={4}
      height={3}
      loading={eager ? 'eager' : 'lazy'}
      fetchpriority={first ? 'high' : undefined}
      decoding="async"
    />
  );
}

function Card({ row, describe, photo, onOpen, sizes, eager, first, className, sharedKey }) {
  const d = describe(row);
  const key = sharedKey ? sharedKey(row) : null;
  const open = (e) => {
    if (key == null) { onOpen(row); return; }
    openShared(e.currentTarget, key, () => onOpen(row));
  };
  return (
    <button
      type="button"
      className={`railcard ${className}`}
      onClick={open}
    >
      <span className="railcard-media">
        <Photo url={photo(row)} sizes={sizes} eager={eager} first={first} />
      </span>
      <span className="railcard-body">
        <span className="railcard-name">{d.name}</span>
        <span className="railcard-kind">
          {d.where && <span className="open-where">{d.where}</span>}
          {d.fact && (
            <span className="open-fact">
              <span className="open-fact-n">{d.fact}</span>
              {d.factLabel && <span className="open-fact-l">{d.factLabel}</span>}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/**
 * Where a strip is scrolled to, for the arrows and the dots. Pages are whole
 * viewports of the strip; the dot for the last page lights once the end is
 * reached, even when the last page is a partial one.
 */
function useStripPosition(ref) {
  const [pos, setPos] = useState({ pages: 1, page: 0, atStart: true, atEnd: true, first: 1, last: 1, total: 0 });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const max = Math.max(0, el.scrollWidth - w);
    const pages = Math.max(1, Math.ceil(el.scrollWidth / w - 0.05));
    const atEnd = el.scrollLeft >= max - 2;
    const page = atEnd ? pages - 1 : Math.min(pages - 1, Math.round(el.scrollLeft / w));
    // Which cards are whole in view, for the mono position (rule Rails).
    const kids = Array.from(el.children);
    const left = el.scrollLeft;
    let first = 0;
    let last = 0;
    kids.forEach((k, i) => {
      const inView = k.offsetLeft - el.offsetLeft >= left - 2
        && k.offsetLeft - el.offsetLeft + k.offsetWidth <= left + w + 2;
      if (inView) { if (!first) first = i + 1; last = i + 1; }
    });
    if (!first) { first = 1; last = 1; }
    const total = kids.length;
    const atStart = el.scrollLeft <= 2;
    setPos((cur) => (cur.pages === pages && cur.page === page
      && cur.atStart === atStart && cur.atEnd === atEnd
      && cur.first === first && cur.last === last && cur.total === total
      ? cur
      : { pages, page, atStart, atEnd, first, last, total }));
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    measure();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [ref, measure]);
  return pos;
}

function Rail({ rail, describe, photo, onOpen, t, sharedKey }) {
  const stripRef = useRef(null);
  const pos = useStripPosition(stripRef);
  // Arrow keys on a focused card move to its neighbour and bring it into
  // view (rule Rails; the day track's pattern). Tab still walks every card,
  // so the arrows are a shortcut and never the only way.
  const onKeyDown = (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    const cards = Array.from(stripRef.current?.querySelectorAll('.railcard') || []);
    const at = cards.indexOf(document.activeElement);
    if (at < 0) return;
    const next = cards[at + dir];
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() });
  };
  const page = (dir) => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: scrollBehavior() });
  };
  const headId = `open-rail-${rail.key}`;
  return (
    <section className="xrails-rail open-rail" aria-labelledby={headId} data-rail={rail.key}>
      <div className="xrails-head">
        <div className="xrails-headings">
          <h2 className="xrails-title" id={headId}>{rail.title}</h2>
        </div>
        <button type="button" className="xrails-all open-all" onClick={rail.onSeeAll}>
          {t('rail.seeAll', { n: rail.n })}
        </button>
        {/* Desktop only (the .xrails-nav rule shows them on a hover screen),
            44 px like every other control, disabled at either end. */}
        <span className="xrails-nav">
          <button type="button" className="xrails-arrow xrails-arrow--prev open-arrow"
            onClick={() => page(-1)} disabled={pos.atStart}
            aria-label={t('explore.railPrev')}>
            <ChevronRightIcon size={16} />
          </button>
          <button type="button" className="xrails-arrow open-arrow"
            onClick={() => page(1)} disabled={pos.atEnd}
            aria-label={t('explore.railNext')}>
            <ChevronRightIcon size={16} />
          </button>
        </span>
      </div>
      <div className="xrails-strip open-strip" ref={stripRef} role="group"
        aria-label={t('open.railLabel', { name: rail.title })} onKeyDown={onKeyDown}>
        {rail.rows.map((row) => (
          <Card
            key={row.id}
            row={row}
            describe={describe}
            photo={photo}
            onOpen={onOpen}
            sizes={RAIL_SIZES}
            className="open-railcard"
            sharedKey={sharedKey}
          />
        ))}
      </div>
      {/* Where the strip is, not a control: the arrows and a swipe move it,
          so the dots are hidden from assistive technology. */}
      {pos.pages > 1 && (
        <span className="open-pos" aria-hidden="true">
          <span className="open-dots">
            {Array.from({ length: Math.min(pos.pages, 8) }, (_, i) => (
              <span key={i} className={`open-dot ${i === Math.min(pos.page, 7) ? 'on' : ''}`} />
            ))}
          </span>
          <span className="open-pos-n">
            {t('open.railPos', { from: pos.first, to: pos.last, n: pos.total })}
          </span>
        </span>
      )}
    </section>
  );
}

/** A cut chip: its count settles in place when it changes (DIRECTION.md 2.3). */
function Cut({ rail, count }) {
  const nRef = useRef(null);
  useSettledFigure(nRef, rail.n);
  return (
    <button type="button" className="open-cut" onClick={rail.onSeeAll} data-rail={rail.key}>
      <span>{rail.title}</span>
      <span className="open-cut-n" ref={nRef}>{count(rail.n)}</span>
    </button>
  );
}

export function SectionOpening({
  layer, icons, heading, sub, rails, describe, photo, onOpen, t,
  maxRails = null, count = (n) => String(n), sharedKey = null,
}) {
  const shown = maxRails == null ? rails : rails.slice(0, maxRails);
  const cuts = maxRails == null ? [] : rails.slice(maxRails);
  return (
    <div className="open-bands" data-layer={layer}>
      {icons.length > 0 && (
        <section className="open-icons" aria-labelledby={`open-icons-${layer}`}
          data-fill={icons.length}>
          <h2 className="open-icons-title" id={`open-icons-${layer}`}>{heading}</h2>
          {sub && <p className="open-icons-sub">{sub}</p>}
          <ul className="open-icons-grid" data-n={icons.length}>
            {icons.map((row, i) => (
              <li key={row.id}>
                <Card
                  row={row}
                  describe={describe}
                  photo={photo}
                  onOpen={onOpen}
                  sizes={ICON_SIZES}
                  eager={i < 3}
                  first={i === 0}
                  className="open-icon"
                  sharedKey={sharedKey}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {shown.length > 0 && (
        <div className="xrails open-rails" data-rails={shown.length}>
          {shown.map((rail) => (
            <Rail
              key={rail.key}
              rail={rail}
              describe={describe}
              photo={photo}
              onOpen={onOpen}
              t={t}
              sharedKey={sharedKey}
            />
          ))}
        </div>
      )}
      {cuts.length > 0 && (
        <div className="open-cuts">
          <p className="open-cuts-label" id={`open-cuts-${layer}`}>{t('open.moreCuts')}</p>
          <div className="open-cuts-row" role="group" aria-labelledby={`open-cuts-${layer}`}>
            {cuts.map((rail) => <Cut key={rail.key} rail={rail} count={count} />)}
          </div>
        </div>
      )}
    </div>
  );
}
