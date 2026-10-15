import React, { useCallback, useEffect, useRef, useState } from 'react';
import { scrollBehavior } from '../lib/motion.js';
import { openShared } from '../lib/sharedElement.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { ChevronRightIcon, CrosshairIcon } from '../components/Icons.jsx';
import { Button, Card, Chip, IconButton } from '../components/ui/index.js';

/**
 * The opening of a Destinations section (T428; T183 built the first one).
 *
 * Top to bottom, the same grammar Explore's idle page uses:
 *   SectionHead   the section's title with a verb, set at Explore's head
 *                 scale, and beside it the near-me door ("Beaches near me"),
 *                 the way in most people take first (T430: the door sat at
 *                 the foot of the Trails index and nowhere else)
 *   starters      the cuts that did not get a rail, as one row of kit filter
 *                 chips that apply the same saved filter
 *   rails         photo strips of kit tile Cards: the section's best known
 *                 first, then the saved filters of lib/openingScreen.js, at
 *                 most four on a desktop and three on a phone
 *   children      what the tab puts after them (the countries track)
 *
 * What went (owner, 2026-10-14): the "Europe's 6 best-known mountains"
 * heading and its ranking sentence, the dots and the "1 to 4 of 12" under a
 * strip, the figure on "See all". T430 (owner, 2026-10-15): the photograph
 * at the top of each section; the rails' photographs carry the section now.
 * The rails still follow carta-design "Rails": arrows on a fine pointer,
 * arrow keys between cards, scroll snap, one aspect, nothing over a
 * photograph.
 *
 * `describe(row)` returns { name, where, fact, rating } for one wire row.
 */

const RAIL_SIZES = '(max-width: 768px) 72vw, 280px';

export function SectionHead({ title, id, nearMe = null }) {
  return (
    <header className="dtab-head">
      <h2 className="dtab-title" id={id}>{title}</h2>
      {nearMe && (
        <Button variant="secondary" className="dtab-nearme" iconStart={<CrosshairIcon size={20} />}
          onClick={nearMe.onPick} loading={nearMe.busy}>
          {nearMe.label}
        </Button>
      )}
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
      wrap
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
          {d.fact && (
            <span className="dtab-fact">
              {d.factLabel && <span className="dtab-fact-l">{d.factLabel} </span>}
              {d.fact}
            </span>
          )}
        </span>
      ) : null}
      rating={d.rating ? <ScoreChip rating={d.rating} size="sm" /> : null}
    />
  );
}

export function SectionOpening({
  layer, head = null, rails, starters = [], describe, photo, onOpen, t,
  sharedKey = null, nearMe = null, children = null,
}) {
  return (
    <div className="open-bands dtab-open" data-layer={layer}>
      {head && <SectionHead title={head.title} id={`dtab-head-${layer}`} nearMe={nearMe} />}
      {starters.length > 0 && (
        <div className="dtab-starters" role="group" aria-label={t('dtab.tryOne')}>
          {starters.map((s) => (
            <Chip key={s.key} className="dtab-starter" data-rail={s.key} onClick={s.onPick}>
              {s.title}
            </Chip>
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
