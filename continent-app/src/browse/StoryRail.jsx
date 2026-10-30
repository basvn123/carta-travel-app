import React from 'react';
import { ArrowLeftIcon, ChevronRightIcon } from '../components/Icons.jsx';
import { Button, Card, IconButton } from '../components/ui/index.js';
import { prefersReducedMotion, scrollBehavior } from '../lib/motion.js';
import '../styles/80-story-rail.css';

/**
 * StoryRail (T587, owner decisions 1 to 3 of 2026-10-22): every browse rail
 * in Carta as one moving strip, after the Komoot rail the owner pointed at,
 * in Carta's colours.
 *
 *   lead card   the rail's own card, first in the strip: a warm sunken box,
 *               tilted a little at rest, that holds the rail's heading, a
 *               fanned stack of its first three photographs (T599), the one
 *               fact marked `figure` set large, up to two more icon facts
 *               drawn from the rail's own rows (never a count of the
 *               catalogue) and "See all" as the card's one action.
 *   photo cards StoryCard: a tall 4:5 photograph with two solid pills on it
 *               (a status top left, the Score top right), the save control
 *               on the photo, then the title, one meta line and the price on
 *               the page ground, no box (decision 3). A brown arrow shows on
 *               hover and focus; the whole card is one link or button.
 *
 * Motion (decision 1): a card lifts 4 px on hover, the lead straightens; the
 * cards arrive once, staggered, the first time a rail scrolls into view, and
 * only when it starts out of view (a rail already on screen just shows).
 * Without IntersectionObserver, or under reduced motion, nothing moves and
 * everything is visible. Arrows on a fine pointer, arrow keys between cards,
 * position dots hidden from screen readers, scroll snap, no autoplay.
 */

/** Asks to be drawn with a stagger once, when the rail first enters view:
 *  'still' (shown, never animated), 'wait' (out of view, held back) or 'in'. */
function useArrival(ref) {
  const [state, setState] = React.useState('still');
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function' || prefersReducedMotion()) return undefined;
    let first = true;
    const io = new IntersectionObserver((entries) => {
      const seen = entries.some((e) => e.isIntersecting);
      if (first) {
        first = false;
        if (seen) io.disconnect();
        else setState('wait');
        return;
      }
      if (seen) {
        setState('in');
        io.disconnect();
      }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return state;
}

/** Which ends the strip can still move to, and the item nearest its start. */
function useStripPosition(ref, count) {
  const [pos, setPos] = React.useState({ atStart: true, atEnd: count <= 1, at: 0 });
  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const atStart = el.scrollLeft <= 2;
    const atEnd = el.scrollLeft >= max - 2;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const items = [...el.children];
    let at = 0;
    let best = Infinity;
    items.forEach((child, i) => {
      const d = Math.abs(child.offsetLeft - pad - el.scrollLeft);
      if (d < best) { best = d; at = i; }
    });
    if (atEnd && items.length) at = items.length - 1;
    setPos((p) => (p.atStart === atStart && p.atEnd === atEnd && p.at === at ? p : { atStart, atEnd, at }));
  }, [ref]);
  React.useEffect(() => {
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
  }, [ref, measure, count]);
  return pos;
}

/**
 * One rail. `children` are the photo cards (StoryCard), one per place; each
 * is wrapped in the strip's list item here.
 */
export function StoryRail({
  id, title, line = null, facts = [], onSeeAll = null, t, headingLevel = 2, className = '', children,
  stack: _stack = null,
}) {
  const sectionRef = React.useRef(null);
  const stripRef = React.useRef(null);
  const items = React.Children.toArray(children).filter(Boolean);
  const count = items.length;
  // `stack` (the lead card's photographs) is accepted and unused since T908.
  const pos = useStripPosition(stripRef, count);
  const arrival = useArrival(sectionRef);

  const page = (dir) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: scrollBehavior() });
  };
  // Left and Right move the focus card to card; the browser brings the
  // focused card into view.
  const onKeyDown = (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    const hits = [...(stripRef.current?.querySelectorAll('.card-open') || [])];
    const at = hits.indexOf(document.activeElement);
    if (at < 0) return;
    const next = hits[at + dir];
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.closest('.storyr-item')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() });
  };

  // T908 (owner, Explore board 2026-10-30): the rail opens on a header, not
  // a lead card: the title, one line of its facts and See all, the arrows
  // beside them on a fine pointer; no position dots (Smashing Magazine:
  // dots alone move no one through a carousel). The cards that follow are
  // whole: two on a phone, three, then four.
  const H = headingLevel === 3 ? 'h3' : 'h2';
  const factLine = [line, ...(facts || []).filter((f) => f && f.text).map((f) => f.text)].filter(Boolean).slice(0, 3);
  return (
    <section ref={sectionRef} className={`storyr ${className}`.trim()} aria-labelledby={id} data-arrival={arrival}>
      <div className="storyr-head">
        <div className="storyr-head-txt">
          <H className="storyr-title" id={id}>{title}</H>
          {factLine.length > 0 && (
            <p className="storyr-line">
              {factLine.map((f, i) => <span key={i} className="storyr-line-part">{f}</span>)}
            </p>
          )}
        </div>
        <div className="storyr-head-acts">
          {onSeeAll && (
            <Button variant="quiet" size="sm" className="storyr-all" onClick={onSeeAll}>{t('rail.seeAllPlain')}</Button>
          )}
          <span className="storyr-nav">
            <IconButton tone="surface" label={t('explore.railPrev')} onClick={() => page(-1)}
              disabled={pos.atStart} className="storyr-arrow storyr-arrow--prev">
              <ChevronRightIcon size={16} />
            </IconButton>
            <IconButton tone="surface" label={t('explore.railNext')} onClick={() => page(1)}
              disabled={pos.atEnd} className="storyr-arrow">
              <ChevronRightIcon size={16} />
            </IconButton>
          </span>
        </div>
      </div>
      <ul className="storyr-strip" ref={stripRef} onKeyDown={onKeyDown} aria-label={typeof title === 'string' ? title : undefined}>
        {items.map((child, i) => (
          <li key={child.key ?? i} className="storyr-item" style={{ '--i': i }}>{child}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A photo card in a StoryRail, on the kit Card (layout tile): the photo with
 * its pills and save control as the media, then title, meta and price on the
 * page ground, and the brown arrow in the rating slot (decorative: the title's
 * link or button opens the card).
 *
 *   photo   the <img> (HeroImage) at 4:5
 *   status  a short word for the top-left pill, or null
 *   score   the ScoreChip for the top-right pill, or null
 *   save    the save control (SaveButton), or null
 */
export function StoryCard({
  photo, status = null, score = null, save = null, title, href, onOpen, meta = null, price = null,
  className = '', ...rest
}) {
  return (
    <Card
      layout="tile"
      as="div"
      wrap
      className={`storyr-card ${className}`.trim()}
      media={(
        <>
          {photo}
          {status && <span className="storyr-pill storyr-status">{status}</span>}
          {score && <span className="storyr-pill storyr-score">{score}</span>}
          {save && <span className="storyr-save">{save}</span>}
        </>
      )}
      title={title}
      href={href}
      onOpen={onOpen}
      meta={meta}
      price={price}
      rating={<ArrowLeftIcon size={20} className="storyr-go" />}
      {...rest}
    />
  );
}

/** Photo sizes for a StoryRail card: about 70 percent of a phone, then the
 *  desktop widths of 80-story-rail.css. */
// T622 (owner 2026-10-23: "the images need to be more sharp, it is often
// blurry"): a 4:5 card crops a 3:2 landscape photo, so the photo it needs is
// about 1.9 times the card's width (5/4 times 3/2). The sizes say that width,
// and the callers allow the ladder up to 1280, so a phone at 2x or 3x gets a
// 960 or a 1280 instead of an upscaled 500.
export const STORY_MAX = 1280;
export const STORY_SIZES = '(max-width: 559px) 133vw, (max-width: 1079px) 68vw, 570px';
