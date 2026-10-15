import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { scrollBehavior } from '../lib/motion.js';
import { clampIndex, trackIndex, trackKey, trackLeft } from '../lib/dayTrack.js';

/**
 * One track for every swiped row on the item and trip pages (T430,
 * carta-design "Tracks"): the highlights, the days, the before-you-go cards,
 * the alternatives. The day track's arithmetic (lib/dayTrack.js) with a
 * section head of its own: the heading on the left, the position ("2 of 5")
 * and the two arrows on the right, so a swipe is never the only way.
 *
 *   size   'third'  three across from 1024 px, about 85% wide on a phone
 *          'half'   two across from 1024 px (the days, which carry more)
 *          'wide'   one and a bit across (the alternatives on a phone)
 *
 * `index` moves the track from outside (the week chart picks a day), and
 * `onSelect(i)` reports the card in view. `showAll` turns the row into a
 * grid in place, the flashcards' "Show all"; print always shows the grid.
 * Children are the cards, one element each.
 */
export function Track({
  title = null, headingId, label, size = 'third', index: wanted, onSelect, showAll = false,
  className = '', children, tail = null,
}) {
  const { t } = useI18n();
  const cards = React.Children.toArray(children).filter(Boolean);
  const n = cards.length;
  const id = useId();
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [grid, setGrid] = useState(false);
  const indexRef = useRef(0);
  const targetRef = useRef(null);
  const settleRef = useRef(0);
  const frameRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el || !el.children.length) return null;
    const first = el.children[0].offsetLeft;
    return { el, offsets: [...el.children].map((c) => c.offsetLeft - first), max: el.scrollWidth - el.clientWidth };
  }, []);
  const select = useCallback((i) => {
    indexRef.current = i;
    setIndex(i);
    onSelectRef.current?.(i);
  }, []);
  const go = useCallback((i) => {
    const m = measure();
    if (!m) return;
    const next = clampIndex(i, m.offsets.length);
    select(next);
    const left = trackLeft(m.offsets, next, m.max);
    if (Math.abs(left - m.el.scrollLeft) < 2) return;
    targetRef.current = left;
    window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => { targetRef.current = null; }, 900);
    m.el.scrollTo({ left, behavior: scrollBehavior() });
  }, [measure, select]);
  const onScroll = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      const m = measure();
      if (!m) return;
      if (targetRef.current != null) {
        if (Math.abs(m.el.scrollLeft - targetRef.current) >= 2) return;
        targetRef.current = null;
        return;
      }
      const i = trackIndex(m.offsets, m.el.scrollLeft, m.max, indexRef.current);
      if (i !== indexRef.current) select(i);
    });
  }, [measure, select]);
  useEffect(() => {
    if (wanted != null && wanted !== indexRef.current) go(wanted);
  }, [wanted, go]);
  useEffect(() => () => {
    window.clearTimeout(settleRef.current);
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
  }, []);
  const onKeyDown = (e) => {
    if (e.target !== trackRef.current || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const next = trackKey(e.key, indexRef.current, n);
    if (next == null) return;
    e.preventDefault();
    go(next);
  };
  const onFocus = (e) => {
    const el = trackRef.current;
    if (!el || e.target === el) return;
    const i = [...el.children].findIndex((c) => c.contains(e.target));
    if (i >= 0 && i !== indexRef.current) select(i);
  };

  if (!n) return null;
  const moves = n > 1 && !grid;
  return (
    <div className={`itrack itrack-${size}${grid ? ' is-grid' : ''} ${className}`.trim()}>
      {(title || moves || showAll) && (
        <div className="itrack-head">
          {title && <h2 className="itrack-title" id={headingId}>{title}</h2>}
          <div className="itrack-ctrl">
            {moves && (
              <>
                <span className="itrack-pos" aria-live="polite">
                  {t('detail.photoPos', { n: index + 1, total: n })}
                </span>
                <IconButton tone="plain" className="itrack-arrow is-prev" label={t('detail.trackPrev')}
                  onClick={() => go(indexRef.current - 1)} disabled={index === 0} aria-controls={id}>
                  <ChevronRightIcon size={20} />
                </IconButton>
                <IconButton tone="plain" className="itrack-arrow" label={t('detail.trackNext')}
                  onClick={() => go(indexRef.current + 1)} disabled={index >= n - 1} aria-controls={id}>
                  <ChevronRightIcon size={20} />
                </IconButton>
              </>
            )}
            {showAll && n > 1 && (
              <Button variant="quiet" size="sm" className="itrack-all" onClick={() => setGrid((v) => !v)}
                aria-expanded={grid}>
                {grid ? t('detail.showLess') : t('detail.showAll')}
              </Button>
            )}
          </div>
        </div>
      )}
      <div
        id={id}
        ref={trackRef}
        className="itrack-row"
        role="region"
        aria-label={label}
        aria-labelledby={label ? undefined : headingId}
        tabIndex={moves ? 0 : undefined}
        onScroll={moves ? onScroll : undefined}
        onKeyDown={moves ? onKeyDown : undefined}
        onFocus={moves ? onFocus : undefined}
      >
        {cards.map((c, i) => <div key={c.key ?? i} className="itrack-cell">{c}</div>)}
      </div>
      {tail}
    </div>
  );
}
