import React from 'react';
import { Button } from '../components/ui/index.js';
import { scrollBehavior } from '../lib/motion.js';
import '../styles/88-place-template.css';

/**
 * The place and trip page template (T912, T913; the owner's approved spec of
 * 2026-10-30, "Place and trip pages: one long page, one price, one button").
 *
 * Both the destination page and Carta's trip page are one long page: photos,
 * the head, a facts row, then a sticky jump bar over the sections, with the
 * price card in a sticky right column from 1024 px and, below that, inline in
 * the page plus a fixed bar at the foot that carries the price and the one
 * primary. The parts here are shared so the two pages look like one family:
 *
 *   useWide()     true from 1024 px (where the price card is a side column)
 *   JumpBar       the sticky bar of section links; the one in view is marked
 *   PSection      a section with the template's heading and an optional note
 *   PriceDock     the fixed foot bar below 1024 px: the price, an underlined
 *                 button naming the dates and the party, and the primary
 *
 * Styles: src/styles/88-place-template.css (class prefix .pt-).
 */

const WIDE = '(min-width: 1024px)';

export function useWide() {
  const [wide, setWide] = React.useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(WIDE).matches,
  );
  React.useEffect(() => {
    const mq = window.matchMedia?.(WIDE);
    if (!mq) return undefined;
    const on = (e) => setWide(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/** Scroll the page's scroller so `id` starts just under the jump bar. */
export function scrollToSection(scrollEl, id) {
  const root = scrollEl;
  const el = root?.querySelector?.(`#${CSS.escape ? CSS.escape(id) : id}`);
  if (!root || !el) return false;
  const bar = root.querySelector('.pt-jump');
  const offset = (bar ? bar.offsetHeight : 0) + 8;
  const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - offset;
  root.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() });
  return true;
}

/**
 * The jump bar: one link per section that is on the page (a section without
 * data is not drawn, so its link goes too). A link scrolls to its section;
 * the section whose top has passed under the bar carries aria-current. It
 * sticks to the top of the page's scroller and scrolls sideways on a phone.
 *
 *   items      [{ key, id, label }] in page order (id is the section's id)
 *   scrollRef  the page's scrolling element
 *   ready      change it when the sections may have changed (re-reads the DOM)
 */
export function JumpBar({ items, scrollRef, ready, label }) {
  const [present, setPresent] = React.useState([]);
  const [active, setActive] = React.useState(null);
  const barRef = React.useRef(null);

  React.useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) { setPresent([]); return; }
    setPresent(items.filter((it) => root.querySelector(`#${it.id}`)));
  }, [items, scrollRef, ready]);

  React.useEffect(() => {
    const root = scrollRef.current;
    if (!root || !present.length) return undefined;
    let frame = 0;
    const read = () => {
      frame = 0;
      const line = root.getBoundingClientRect().top + (barRef.current?.offsetHeight || 0) + 24;
      let current = present[0].key;
      for (const it of present) {
        const el = root.querySelector(`#${it.id}`);
        if (el && el.getBoundingClientRect().top <= line) current = it.key;
      }
      // The foot of the page marks the last section, however short it is.
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) current = present[present.length - 1].key;
      setActive((cur) => (cur === current ? cur : current));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    read();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef, present]);

  // Keep the current link inside the bar where it scrolls sideways.
  React.useEffect(() => {
    const bar = barRef.current;
    const on = bar?.querySelector('[aria-current="location"]');
    if (!bar || !on) return;
    const l = on.offsetLeft;
    if (l < bar.scrollLeft || l + on.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollTo({ left: Math.max(0, l - 16), behavior: scrollBehavior() });
    }
  }, [active]);

  if (present.length < 2) return null;
  return (
    <nav className="pt-jump" aria-label={label} ref={barRef}>
      {present.map((it) => (
        <a
          key={it.key}
          href={`#${it.id}`}
          className="pt-jump-link"
          aria-current={active === it.key ? 'location' : undefined}
          onClick={(e) => {
            e.preventDefault();
            setActive(it.key);
            scrollToSection(scrollRef.current, it.id);
          }}
        >{it.label}</a>
      ))}
    </nav>
  );
}

/** A section of the long page: the template's heading, an optional quiet
 *  note on its right, then the body. `id` is the full element id. */
export function PSection({ id, title, note = null, children, className = '', headId = null }) {
  const hid = headId || `${id}-h`;
  return (
    <section className={`pt-sec ${className}`.trim()} id={id} aria-labelledby={hid}>
      <div className="pt-sec-head">
        <h2 className="pt-sec-title" id={hid}>{title}</h2>
        {note ? <div className="pt-sec-note">{note}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A sub-block inside a section with its own small heading. */
export function PBlock({ title, children, className = '', aside = null }) {
  return (
    <div className={`pt-block ${className}`.trim()}>
      {(title || aside) && (
        <div className="pt-block-head">
          {title && <h3 className="pt-block-title">{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * The fixed foot bar below 1024 px (the phone and the tablet): the price and
 * its unit, the dates and the party as an underlined button that opens the
 * price card's fields, and the page's one primary. On a phone it stands
 * where the bottom nav stands while the page is open (the page covers the
 * app, the nav included).
 */
export function PriceDock({ price, unit, inputs, onInputs, inputsLabel, primary }) {
  return (
    <div className="pt-dock">
      <div className="pt-dock-text">
        {price != null && (
          <p className="pt-dock-price">
            <span className="pt-dock-fig">{price}</span>
            {unit ? <span className="pt-dock-unit"> {unit}</span> : null}
          </p>
        )}
        {inputs && (
          <Button variant="quiet" size="sm" className="pt-dock-inputs"
            aria-label={inputsLabel || undefined} onClick={onInputs}>
            {inputs}
          </Button>
        )}
      </div>
      {primary}
    </div>
  );
}
