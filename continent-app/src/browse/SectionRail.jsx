import React from 'react';
import { scrollBehavior } from '../lib/motion.js';

/**
 * The sticky section rail (T165, carta-design "Sticky section rail").
 *
 * One thin strip that sticks to the top of the page's scroller once the hero
 * has scrolled away. Each link is a real anchor to the section's id; a tap
 * opens the fold (onJump) and then scrolls to it. The section in view wears
 * the ink-fill pill.
 *
 * It anchors to section ids, not to the inner markup of the folds, so the
 * pages can change what is inside a section without touching the rail.
 * Sections the page did not render (no itinerary, no tips) simply drop out,
 * and under three sections the rail does not render at all.
 *
 * It takes no room in the flow (the CSS gives it a negative bottom margin),
 * so showing and hiding it never moves the page under the reader's thumb.
 *
 * Props:
 *   items      [{ id: 'sec-why', key: 'why', label: 'Why' }, ...] in page order
 *   scrollRef  the page's scrolling element
 *   heroRef    the element whose leaving the viewport reveals the rail
 *   onJump     (key) => void, opens the fold; the rail scrolls afterwards
 *   ready      change this when the page content has loaded (re-reads the DOM)
 */
export function SectionRail({ items, scrollRef, heroRef, onJump, ready, ariaLabel }) {
  const [present, setPresent] = React.useState([]);
  const [shown, setShown] = React.useState(false);
  const [active, setActive] = React.useState(null);
  const railRef = React.useRef(null);

  // Which of the wanted sections exist on this page right now.
  React.useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) { setPresent([]); return; }
    setPresent(items.filter((it) => root.querySelector(`#${it.id}`)));
  }, [items, scrollRef, ready]);

  // Hero gone: its bottom edge is above the top of the scroller.
  React.useEffect(() => {
    const root = scrollRef.current;
    const hero = heroRef.current;
    if (!root || !hero) { setShown(false); return undefined; }
    // The -44px margin is the rail's own height: the hero counts as gone until
    // it would show below the rail, so jumping to the first section does not
    // flip the rail off.
    const io = new IntersectionObserver(([entry]) => {
      const top = entry.rootBounds ? entry.rootBounds.top : 0;
      setShown(!entry.isIntersecting && entry.boundingClientRect.bottom <= top + 1);
    }, { root, threshold: 0, rootMargin: '-44px 0px 0px 0px' });
    io.observe(hero);
    return () => io.disconnect();
  }, [scrollRef, heroRef, ready]);

  // The section in view: the last one whose top has passed under the rail.
  React.useEffect(() => {
    const root = scrollRef.current;
    if (!root || !shown) return undefined;
    let frame = 0;
    const read = () => {
      frame = 0;
      const line = root.getBoundingClientRect().top + 60;
      let current = null;
      present.forEach((it) => {
        const el = root.querySelector(`#${it.id}`);
        if (el && el.getBoundingClientRect().top <= line) current = it.key;
      });
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef, present, shown]);

  // Keep the active pill inside the strip on a phone.
  React.useEffect(() => {
    const el = railRef.current?.querySelector('[aria-current="location"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  if (present.length < 3) return null;

  const jump = (e, it) => {
    e.preventDefault();
    onJump?.(it.key);
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector(`#${it.id}`)
        ?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    });
  };

  return (
    <nav
      className={`srail ${shown ? 'is-shown' : ''}`}
      aria-label={ariaLabel}
      ref={railRef}
      hidden={!shown}
    >
      <div className="srail-scroll">
        {present.map((it) => (
          <a
            key={it.key}
            href={`#${it.id}`}
            className={active === it.key ? 'is-active' : ''}
            aria-current={active === it.key ? 'location' : undefined}
            onClick={(e) => jump(e, it)}
          >{it.label}</a>
        ))}
      </div>
    </nav>
  );
}
