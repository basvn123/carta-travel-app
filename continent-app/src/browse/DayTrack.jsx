import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '../components/Button.jsx';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { scrollBehavior } from '../lib/motion.js';
import { clampIndex, trackIndex, trackKey, trackLeft } from '../lib/dayTrack.js';

/**
 * The day track (T162, spec C2): one card per day in a horizontal row, built
 * to the Day track rule in the carta-design skill.
 *
 * Above the track, right aligned, the position in mono ("Day 3 of 7") and two
 * secondary buttons, Previous and Next. Under it one 6 px dot per day, hidden
 * from screen readers because the counter says the same thing. The row snaps
 * (scroll-snap-type x mandatory, in styles/32-day-carousel.css), so a swipe
 * on a phone always lands on a card. The track itself takes focus, and while
 * it has it the arrow keys, Home and End move it a card at a time. No autoplay, no looping:
 * Next on the last day does nothing and is disabled.
 *
 * The cards are the children, one element each, and stay whole: the day's
 * own "More about this day" accordion (T163) opens inside its card and the
 * track grows with it. Every card is in the DOM, so Tab reaches every
 * control in every day, and the browser scrolls a focused card into view.
 *
 * Under reduced motion the buttons and keys jump instead of gliding
 * (lib/motion.js scrollBehavior, and scroll-behavior auto in the CSS).
 *
 * T401 (row T397-b): `onSelect(i)` reports the current day whenever it
 * changes, by scroll, key, button or focus, and `index` moves the track to a
 * day from outside, so a page that picks a day does not have to watch the
 * dots or scroll the row itself.
 */
export function DayTrack({ label, children, t, index: wantedIndex, onSelect }) {
  const cards = React.Children.toArray(children);
  const n = cards.length;
  const trackId = useId();
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const targetRef = useRef(null);   // the left a button or key is gliding to
  const settleRef = useRef(0);
  const frameRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el || !el.children.length) return null;
    const first = el.children[0].offsetLeft;
    return {
      el,
      offsets: [...el.children].map((c) => c.offsetLeft - first),
      max: el.scrollWidth - el.clientWidth,
    };
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
    // A glide the reader interrupts by swiping never reports arriving; let
    // the scroll position speak again after a moment either way.
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

  // An index from outside moves the track (row T397-b).
  useEffect(() => {
    if (wantedIndex != null && wantedIndex !== indexRef.current) go(wantedIndex);
  }, [wantedIndex, go]);

  useEffect(() => () => {
    window.clearTimeout(settleRef.current);
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
  }, []);

  // Only while the track itself has focus: an arrow pressed on a button
  // inside a card would otherwise slide that focused button out of view.
  const onKeyDown = (e) => {
    if (e.target !== trackRef.current) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const next = trackKey(e.key, indexRef.current, n);
    if (next == null) return;
    e.preventDefault();
    go(next);
  };

  // Tab onto a control inside a card makes that card the current one, so the
  // counter and the dots follow the keyboard as well as the scroll.
  const onFocus = (e) => {
    const el = trackRef.current;
    if (!el || e.target === el) return;
    const i = [...el.children].findIndex((c) => c.contains(e.target));
    if (i >= 0 && i !== indexRef.current) select(i);
  };

  if (!n) return null;
  // "Day 3 of 7": the words in the interface face, only the figures in mono
  // (row T397-c). The template is split at its placeholders, so the
  // order of words and figures follows each language.
  const runs = t('journey.trackPos')
    .split(/(\{n\}|\{total\})/)
    .filter(Boolean)
    .map((part) => {
      if (part === '{n}') return { mono: true, text: String(index + 1) };
      if (part === '{total}') return { mono: true, text: String(n) };
      return { mono: false, text: part };
    });
  return (
    <div className="dtrack-wrap">
      <div className="dtrack-bar">
        <span className="dtrack-pos" aria-live="polite">
          {runs.map((r, k) => (r.mono
            ? <span key={k} className="is-mono">{r.text}</span>
            : <React.Fragment key={k}>{r.text}</React.Fragment>))}
        </span>
        <Button
          className="dtrack-btn"
          onClick={() => go(indexRef.current - 1)}
          disabled={index === 0}
          aria-controls={trackId}
        >
          <ChevronRightIcon size={14} className="dtrack-prev-chev" />
          <span>{t('journey.trackPrev')}</span>
        </Button>
        <Button
          className="dtrack-btn"
          onClick={() => go(indexRef.current + 1)}
          disabled={index >= n - 1}
          aria-controls={trackId}
        >
          <span>{t('journey.trackNext')}</span>
          <ChevronRightIcon size={14} />
        </Button>
      </div>
      <div
        id={trackId}
        ref={trackRef}
        className="dtrack"
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        {cards}
      </div>
      <div className="dtrack-dots" aria-hidden="true">
        {cards.map((card, i) => (
          <span key={card.key ?? i} className={i === index ? 'dtrack-dot is-on' : 'dtrack-dot'} />
        ))}
      </div>
    </div>
  );
}
