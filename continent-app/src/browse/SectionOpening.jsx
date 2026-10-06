import React, { useCallback, useEffect, useRef, useState } from 'react';
import { srcSetFor, fallbackSrc } from '../lib/heroImage.js';
import { scrollBehavior } from '../lib/motion.js';
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
 */

// What a Band 1 photo is drawn at: half the phone, a third of the column.
const ICON_SIZES = '(max-width: 768px) 50vw, min(30vw, 380px)';
const RAIL_SIZES = '200px';

function Photo({ url, sizes, eager = false }) {
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
      decoding="async"
    />
  );
}

function Card({ row, describe, photo, onOpen, sizes, eager, className }) {
  const d = describe(row);
  return (
    <button
      type="button"
      className={`railcard ${className}`}
      onClick={() => onOpen(row)}
    >
      <span className="railcard-media">
        <Photo url={photo(row)} sizes={sizes} eager={eager} />
      </span>
      <span className="railcard-body">
        <span className="railcard-name">{d.name}</span>
        <span className="railcard-kind">
          {d.where && <span className="open-where">{d.where}</span>}
          {d.fact && <span className="open-fact">{d.fact}</span>}
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
  const [pos, setPos] = useState({ pages: 1, page: 0, atStart: true, atEnd: true });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const max = Math.max(0, el.scrollWidth - w);
    const pages = Math.max(1, Math.ceil(el.scrollWidth / w - 0.05));
    const atEnd = el.scrollLeft >= max - 2;
    const page = atEnd ? pages - 1 : Math.min(pages - 1, Math.round(el.scrollLeft / w));
    setPos((cur) => (cur.pages === pages && cur.page === page
      && cur.atStart === (el.scrollLeft <= 2) && cur.atEnd === atEnd
      ? cur
      : { pages, page, atStart: el.scrollLeft <= 2, atEnd }));
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

function Rail({ rail, describe, photo, onOpen, t }) {
  const stripRef = useRef(null);
  const pos = useStripPosition(stripRef);
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
      <div className="xrails-strip open-strip" ref={stripRef}>
        {rail.rows.map((row) => (
          <Card
            key={row.id}
            row={row}
            describe={describe}
            photo={photo}
            onOpen={onOpen}
            sizes={RAIL_SIZES}
            className="open-railcard"
          />
        ))}
      </div>
      {/* Where the strip is, not a control: the arrows and a swipe move it,
          so the dots are hidden from assistive technology. */}
      {pos.pages > 1 && (
        <span className="open-dots" aria-hidden="true">
          {Array.from({ length: Math.min(pos.pages, 8) }, (_, i) => (
            <span key={i} className={`open-dot ${i === Math.min(pos.page, 7) ? 'on' : ''}`} />
          ))}
        </span>
      )}
    </section>
  );
}

export function SectionOpening({
  layer, icons, heading, sub, rails, describe, photo, onOpen, t,
}) {
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
                  className="open-icon"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {rails.length > 0 && (
        <div className="xrails open-rails" data-rails={rails.length}>
          {rails.map((rail) => (
            <Rail
              key={rail.key}
              rail={rail}
              describe={describe}
              photo={photo}
              onOpen={onOpen}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
