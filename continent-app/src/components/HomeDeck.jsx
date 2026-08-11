import React, { useCallback, useRef, useState } from 'react';
import { ChevronRightIcon } from './Icons.jsx';

/**
 * The product deck: the map, the trip planner and the day planner in ONE
 * section instead of three screens of scrolling.
 *
 * Stacked, the three tools cost the visitor two full page-downs before the
 * page had finished saying what Carta is, and each screenshot had to share
 * its row with a column of prose. Here they share a single frame: the tabs
 * pick one, the track slides, and the screenshot gets the room it was always
 * missing.
 *
 * It is a real ARIA tab set, not a carousel of decoration:
 *   - the rail is a tablist with roving tabindex and arrow-key selection,
 *   - the slides are tabpanels, and the ones off-frame are inert so a Tab
 *     press cannot land on a button nobody can see,
 *   - the drag follows the finger and rubber-bands at both ends, so a swipe
 *     that changes nothing still tells you it was heard,
 *   - nothing auto-advances. A page that moves while you read it is a page
 *     that has to be fought.
 */
export function HomeDeck({ slides, copy }) {
  const [at, setAt] = useState(0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  // The off-frame screenshots stay lazy until the visitor shows interest in
  // them, then all three load: a swipe that ends on an empty frame reads as
  // broken, and eager-loading 300 KB nobody asked for is how a landing page
  // gets slow.
  const [warm, setWarm] = useState(false);
  const stageRef = useRef(null);
  const railRef = useRef(null);
  const grab = useRef(null);
  const last = slides.length - 1;

  const go = useCallback((n, focusTab) => {
    const next = Math.max(0, Math.min(last, n));
    setWarm(true);
    setAt(next);
    if (focusTab) railRef.current?.querySelectorAll('[role="tab"]')[next]?.focus();
  }, [last]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at === last ? 0 : at + 1, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at === 0 ? last : at - 1, true); }
    else if (e.key === 'Home') { e.preventDefault(); go(0, true); }
    else if (e.key === 'End') { e.preventDefault(); go(last, true); }
  };

  /* ── Drag ──────────────────────────────────────────────────────────────
     The axis is decided on the first 8px of movement and then held. Claiming
     the pointer before that is what makes a phone carousel eat the page
     scroll, and a section you cannot scroll past is worse than one that does
     not swipe at all. */
  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    grab.current = { x: e.clientX, y: e.clientY, w: stageRef.current?.offsetWidth || 1, axis: null };
    setWarm(true);
  };

  const onMove = (e) => {
    const g = grab.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.axis === 'x') {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDragging(true);
      }
    }
    if (g.axis !== 'x') return;
    // Past the first and last slide the deck gives, but only a third as far.
    const end = (at === 0 && dx > 0) || (at === last && dx < 0);
    setDrag(end ? dx * 0.34 : dx);
  };

  const onUp = (e) => {
    const g = grab.current;
    grab.current = null;
    setDragging(false);
    setDrag(0);
    if (!g || g.axis !== 'x') return;
    const dx = e.clientX - g.x;
    const enough = Math.min(96, g.w * 0.16);
    if (dx <= -enough) go(at + 1);
    else if (dx >= enough) go(at - 1);
  };

  return (
    <div className="deck">
      <div className="deck-railwrap">
        <div
          className="deck-rail"
          role="tablist"
          aria-label={copy.aria}
          ref={railRef}
          onKeyDown={onKeyDown}
        >
          {slides.map((s, i) => (
            <button
              key={s.key}
              id={`deck-tab-${s.key}`}
              className={`deck-tab ${i === at ? 'is-on' : ''}`}
              role="tab"
              type="button"
              aria-selected={i === at}
              aria-controls={`deck-panel-${s.key}`}
              tabIndex={i === at ? 0 : -1}
              onClick={() => go(i)}
            >
              <span className="deck-tab-icon">{s.icon}</span>
              <span className="deck-tab-text">
                <b>{s.tab}</b>
                <i>{s.note}</i>
              </span>
            </button>
          ))}
        </div>
        {/* Equal columns, so the marker never has to measure anything. */}
        <span
          className="deck-ink"
          aria-hidden="true"
          style={{ width: `${100 / slides.length}%`, transform: `translateX(${at * 100}%)` }}
        />
      </div>

      <div
        className={`deck-stage ${dragging ? 'is-dragging' : ''}`}
        ref={stageRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className="deck-track"
          style={{ transform: `translate3d(calc(${at * -100}% + ${drag}px), 0, 0)` }}
        >
          {slides.map((s, i) => (
            <section
              key={s.key}
              id={`deck-panel-${s.key}`}
              className={`deck-slide ${i === at ? 'is-on' : ''}`}
              role="tabpanel"
              aria-labelledby={`deck-tab-${s.key}`}
              aria-hidden={i === at ? undefined : 'true'}
              inert={i === at ? undefined : ''}
            >
              {/* The live card rides under the screenshot, not beside it: the
                  two are the same argument (this is the tool, this is what it
                  says for your dates today) and splitting them left the
                  screenshot floating in a column half as tall as its
                  neighbour. */}
              <div className="deck-shot">
                <Shot {...s.shot} eager={warm || i === 0} />
                {s.preview}
              </div>
              <div className="deck-say">
                <h3 className="home-h2 deck-title">{s.title}</h3>
                <p className="home-lede deck-body">{s.body}</p>
                <ul className="deck-points">
                  {s.points.map(([term, line]) => (
                    <li key={term}><b>{term}</b><span>{line}</span></li>
                  ))}
                </ul>
                <div className="deck-cta">
                  <button className="home-btn home-btn-primary" type="button" onClick={s.onCta}>
                    {s.cta}
                  </button>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="deck-foot">
        <p className="deck-hint home-num">{copy.hint}</p>
        <div className="deck-arrows">
          <button
            className="deck-arrow deck-arrow-back"
            type="button"
            onClick={() => go(at - 1)}
            disabled={at === 0}
            aria-label={copy.prev}
          >
            <ChevronRightIcon size={15} />
          </button>
          <button
            className="deck-arrow"
            type="button"
            onClick={() => go(at + 1)}
            disabled={at === last}
            aria-label={copy.next}
          >
            <ChevronRightIcon size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A product screenshot in a browser frame. The images are captured from the
 * running app by scripts/shots.mjs; until they exist (or if one fails to
 * load) the frame states what belongs there rather than shipping a broken
 * image icon.
 */
export function Shot({ src, url, alt, eager }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="home-shot">
      <div className="home-shot-bar" aria-hidden="true">
        <i /><i /><i />
        <span>{url}</span>
      </div>
      {failed
        ? <div className="home-shot-body"><p>{alt}</p></div>
        : (
          <img
            src={src}
            alt={alt}
            loading={eager ? undefined : 'lazy'}
            onError={() => setFailed(true)}
          />
        )}
    </div>
  );
}
