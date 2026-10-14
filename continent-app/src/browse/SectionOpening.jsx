import React, { useCallback, useEffect, useRef, useState } from 'react';
import { scrollBehavior } from '../lib/motion.js';
import { openShared } from '../lib/sharedElement.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { Button, Card, IconButton } from '../components/ui/index.js';

/**
 * The opening of a Destinations section (T428; T183 built the first one).
 *
 * Top to bottom, the same grammar Explore's idle page uses:
 *   SectionHead   one photograph of people doing the thing (countryGallery.js
 *                 SECTION_PHOTOS) and one plain title with a verb
 *   rails         photo strips of kit tile Cards: the section's best known
 *                 first, then the saved filters of lib/openingScreen.js, at
 *                 most four on a desktop and three on a phone
 *   starters      "Try one": the cuts that did not get a rail, as one row of
 *                 secondary buttons that apply the same saved filter
 *   children      what the tab puts after them (the countries track)
 *
 * What went (owner, 2026-10-14): the "Europe's 6 best-known mountains"
 * heading and its ranking sentence, the dots and the "1 to 4 of 12" under a
 * strip, the figure on "See all". The rails still follow carta-design
 * "Rails": arrows on a fine pointer, arrow keys between cards, scroll snap,
 * one aspect, nothing over a photograph but nothing at all.
 *
 * `describe(row)` returns { name, where, fact, rating } for one wire row.
 */

const RAIL_SIZES = '(max-width: 768px) 72vw, 280px';

export function SectionHead({ photo, title, id }) {
  return (
    <header className="dtab-head">
      {photo && (
        <div className="dtab-head-media">
          <HeroImage url={photo.u} city={photo.place} className="dtab-head-img"
            maxWidth={1280} sizes="(max-width: 768px) 100vw, min(70vw, 1100px)"
            ratio={[photo.w, photo.h]} eager />
        </div>
      )}
      <h2 className="dtab-title" id={id}>{title}</h2>
    </header>
  );
}

/** Whether a strip can move either way, for the two arrows. */
function useStripEnds(ref) {
  const [ends, setEnds] = useState({ atStart: true, atEnd: true });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const next = { atStart: el.scrollLeft <= 2, atEnd: el.scrollLeft >= max - 2 };
    setEnds((cur) => (cur.atStart === next.atStart && cur.atEnd === next.atEnd ? cur : next));
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
  return ends;
}

/**
 * A horizontal strip with a heading, an optional "See all" and the two
 * arrows. Shared by the rails and the countries track so both move, focus
 * and snap the same way.
 */
export function Strip({ id, title, onSeeAll = null, t, className = '', children }) {
  const stripRef = useRef(null);
  const ends = useStripEnds(stripRef);
  const onKeyDown = (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    const cards = Array.from(stripRef.current?.querySelectorAll('.card-open') || []);
    const at = cards.indexOf(document.activeElement);
    if (at < 0) return;
    const next = cards[at + dir];
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.closest('.dtab-strip > *')?.scrollIntoView({ block: 'nearest', inline: 'start', behavior: scrollBehavior() });
  };
  const page = (dir) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: scrollBehavior() });
  };
  return (
    <section className={`dtab-rail ${className}`.trim()} aria-labelledby={id}>
      <div className="dtab-rail-head">
        <h3 className="dtab-rail-title" id={id}>{title}</h3>
        {onSeeAll && (
          <Button variant="quiet" size="sm" className="dtab-all" onClick={onSeeAll}>
            {t('rail.seeAllPlain')}
          </Button>
        )}
        <span className="dtab-nav">
          <IconButton tone="surface" className="dtab-arrow is-prev" label={t('explore.railPrev')}
            onClick={() => page(-1)} disabled={ends.atStart}>
            <ChevronRightIcon size={16} />
          </IconButton>
          <IconButton tone="surface" className="dtab-arrow" label={t('explore.railNext')}
            onClick={() => page(1)} disabled={ends.atEnd}>
            <ChevronRightIcon size={16} />
          </IconButton>
        </span>
      </div>
      <ul className="dtab-strip" ref={stripRef} onKeyDown={onKeyDown} aria-label={title}>
        {children}
      </ul>
    </section>
  );
}

/** One wire row as a rail tile: the photograph, the name, where and one
 *  measured fact, and the Score. */
export function RailTile({ row, describe, photo, onOpen, sharedKey }) {
  const d = describe(row);
  const key = sharedKey ? sharedKey(row) : null;
  const url = photo(row);
  return (
    <Card
      layout="tile"
      as="div"
      className="dtab-tile"
      media={(
        <HeroImage url={url} city={d.name} className="dtab-tile-img" maxWidth={640}
          sizes={RAIL_SIZES} ratio={[4, 3]} />
      )}
      title={d.name}
      onOpen={(e) => {
        const card = e.currentTarget.closest('.card');
        if (key == null) onOpen(row);
        else openShared(card, key, () => onOpen(row));
      }}
      meta={(d.where || d.fact) ? (
        <span className="dtab-tile-meta">
          {d.where && <span className="dtab-where">{d.where}</span>}
          {d.fact && <span className="dtab-fact">{d.fact}</span>}
        </span>
      ) : null}
      rating={d.rating ? <ScoreChip rating={d.rating} size="sm" /> : null}
    />
  );
}

export function SectionOpening({
  layer, head = null, rails, starters = [], describe, photo, onOpen, t,
  sharedKey = null, children = null,
}) {
  return (
    <div className="open-bands dtab-open" data-layer={layer}>
      {head && <SectionHead photo={head.photo} title={head.title} id={`dtab-head-${layer}`} />}
      {starters.length > 0 && (
        <div className="dtab-starters" role="group" aria-labelledby={`dtab-try-${layer}`}>
          <span className="dtab-starters-label" id={`dtab-try-${layer}`}>{t('dtab.tryOne')}</span>
          {starters.map((s) => (
            <Button key={s.key} variant="secondary" size="sm" className="dtab-starter"
              data-rail={s.key} onClick={s.onPick}>
              {s.title}
            </Button>
          ))}
        </div>
      )}
      {rails.length > 0 && (
        <div className="dtab-rails" data-rails={rails.length}>
          {rails.map((rail) => (
            <Strip key={rail.key} id={`dtab-rail-${layer}-${rail.key}`} title={rail.title}
              onSeeAll={rail.onSeeAll} t={t} className="open-rail">
              {rail.rows.map((row) => (
                <li key={row.id} className="dtab-item">
                  <RailTile row={row} describe={describe} photo={photo} onOpen={onOpen}
                    sharedKey={sharedKey} />
                </li>
              ))}
            </Strip>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
