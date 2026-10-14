import React from 'react';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import { scrollBehavior } from '../lib/motion.js';

/**
 * A photo track on the destination page (T429; carta-design "Tracks" and
 * "Rails and cuts"): one heading, a strip of kit Card tiles that snaps a
 * card at a time, about 85 percent wide on a phone so the next one shows,
 * three across from 1024 px. On a pointer screen a pair of arrows pages the
 * strip, since a scroller without a scrollbar gives a mouse no way in; the
 * arrow keys move between the cards. "See all" (never a number, T438) turns
 * the strip into a grid of the same tiles, and "Show less" turns it back.
 *
 * The mechanics are Explore's rails (ExploreRails.jsx), so the two kinds of
 * track behave alike; the page owns its own copy because a rail's "See all"
 * opens a list, and this one opens in place.
 *
 * props
 *   id        the heading id, for aria-labelledby
 *   title     the heading text
 *   level     2 for a section's own track, 3 for a track under a section
 *   items     the rows; each needs a stable `key`
 *   render    (item, index) => a kit <Card layout="tile">
 *   extra     an optional control after the heading (a map link)
 *   onAll     called with the new state when See all toggles
 */
export function DestTrack({ id, title, level = 2, items, render, extra = null, onAll = null, t }) {
  const H = level === 3 ? 'h3' : 'h2';
  const stripRef = React.useRef(null);
  const [all, setAll] = React.useState(false);
  const [edge, setEdge] = React.useState({ start: true, end: items.length <= 1 });

  const measure = React.useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setEdge((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);
  React.useEffect(() => {
    const el = stripRef.current;
    if (!el || all) return undefined;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, items.length, all]);

  const page = (dir) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: scrollBehavior() });
  };
  const onKey = (e) => {
    if (all || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const hits = [...(stripRef.current?.querySelectorAll('.card-open') || [])];
    const i = hits.indexOf(e.target);
    if (i < 0) return;
    const next = hits[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() });
  };
  const toggleAll = () => {
    setAll((v) => !v);
    onAll?.(!all);
  };

  if (!items.length) return null;
  // Three or fewer cards fit a desktop row as they are; a grid of them says
  // nothing a strip does not.
  const canAll = items.length > 3;
  return (
    <div className={`dphoto${all ? ' is-all' : ''}`}>
      <div className="dphoto-head">
        <H className="dphoto-title" id={id}>{title}</H>
        {extra}
        {canAll && (
          <Button variant="quiet" size="sm" className="dphoto-all" onClick={toggleAll} aria-expanded={all}>
            {all ? t('dest.showLess') : t('rail.seeAllPlain')}
          </Button>
        )}
        {!all && (
          <span className="dphoto-nav">
            <IconButton tone="surface" label={t('explore.railPrev')} onClick={() => page(-1)}
              disabled={edge.start} className="dphoto-arrow is-prev">
              <ChevronRightIcon size={16} />
            </IconButton>
            <IconButton tone="surface" label={t('explore.railNext')} onClick={() => page(1)}
              disabled={edge.end} className="dphoto-arrow">
              <ChevronRightIcon size={16} />
            </IconButton>
          </span>
        )}
      </div>
      {/* A card reached with Tab comes fully into view at the start of the
          strip, at once: the snap would otherwise leave a half-shown card
          with its focus ring cut by the strip's edge (T446). */}
      <ul
        className="dphoto-strip"
        ref={stripRef}
        onKeyDown={onKey}
        onFocus={(e) => {
          if (all || !e.target.matches?.('.card-open')) return;
          e.target.closest('.dphoto-item')?.scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'instant' });
        }}
        aria-labelledby={id}
      >
        {items.map((item, i) => (
          <li className="dphoto-item" key={item.key}>{render(item, i)}</li>
        ))}
      </ul>
      {/* After See all the grid can run a few screens on a phone: the way
          back sits at its end too, not only above it (T446). */}
      {all && canAll && (
        <Button variant="quiet" size="sm" className="dphoto-all is-end" onClick={toggleAll} aria-expanded={all}>
          {t('dest.showLess')}
        </Button>
      )}
    </div>
  );
}
