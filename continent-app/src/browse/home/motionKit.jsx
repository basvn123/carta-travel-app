import React from 'react';
import { LazyMotion, MotionConfig, domAnimation, m, useInView, useReducedMotion } from 'motion/react';
import { SPRING as HOUSE } from '../../lib/motionTokens.js';

/**
 * The home page's motion kit (T948, owner 2026-10-31: "I will use Motion").
 * Every section below the hero arrives through these few pieces, so the page
 * moves one way everywhere (DESIGN.md "Home page exception v3"):
 *
 *   - springs with no bounce, sized by how far a thing travels: quick for a
 *     figure that settles, surface for a card or a line, reveal for a heading
 *     or a section arriving;
 *   - things arrive once, the first time they enter the view, never because
 *     the page keeps scrolling (no scrub, no pin);
 *   - under reduced motion MotionConfig skips every transform and the page
 *     is simply there.
 *
 * Only transform and opacity move. The kit is imported by the lazy story
 * chunk alone, so Motion never sits in the first load.
 */

// The house springs (src/lib/motionTokens.js, G1): home reads the same
// vocabulary as every screen. quick is the house settle; surface and reveal
// are the house's own (reveal is the home page's alone).
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export const SPRING = { ...HOUSE, quick: HOUSE.settle };

/** How far into view a thing must be before it arrives. */
const ONCE = { once: true, amount: 0.35 };

/** The story's root: LazyMotion keeps Motion's DOM features in this chunk
 *  only; reducedMotion "user" follows the visitor's setting. */
export function HomeMotion({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/**
 * A heading whose words lift out of their own line once, 40 ms apart. The
 * whole sentence is the heading's accessible name; the word boxes are hidden
 * from assistive tech. `parts` is an array of strings and { em } objects, so
 * one word or figure can carry the accent without splitting a translation.
 */
export function MaskedText({ as = 'h2', className, parts, id }) {
  const ref = React.useRef(null);
  const inView = useInView(ref, ONCE);
  const Tag = as;
  const words = [];
  (Array.isArray(parts) ? parts : [parts]).forEach((p) => {
    const em = typeof p === 'object' && p !== null;
    String(em ? p.em : p).split(/\s+/).filter(Boolean).forEach((w) => {
      // Punctuation after an accent ("{price}. Here") rides on the word
      // before it, so a line never starts with a full stop.
      const lead = w.match(/^[.,:;!?)]+/);
      if (lead && words.length) {
        words[words.length - 1].tail = (words[words.length - 1].tail || '') + lead[0];
        const rest = w.slice(lead[0].length);
        if (rest) words.push({ w: rest, em });
        return;
      }
      words.push({ w, em });
    });
  });
  const label = words.map((x) => x.w + (x.tail || '')).join(' ');
  return (
    // The words are split for the reveal and hidden from assistive tech; the
    // whole line is read once from a visually hidden copy. aria-label would
    // be ignored on a <p> (no name allowed on that role; T1128, axe
    // aria-prohibited-attr).
    <Tag ref={ref} id={id} className={className}>
      <span className="sr-only">{label}</span>
      {words.map((x, i) => (
        <React.Fragment key={i}>
          <span className="hm-word" aria-hidden="true">
            <m.span initial={{ y: '110%' }} animate={inView ? { y: '0%' } : undefined}
              transition={{ ...SPRING.reveal, delay: i * 0.04 }}>
              <span className={x.em ? 'hm-em' : undefined}>{x.w}</span>{x.tail}
            </m.span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </React.Fragment>
      ))}
    </Tag>
  );
}

/** A block that rises 16 px and fades in once; `delay` staggers siblings. */
export const Reveal = React.forwardRef(function Reveal({ as = 'div', className, delay = 0, children, ...rest }, ref) {
  const Tag = m[as] || m.div;
  // Reduced motion: the block is simply there (Motion's "user" setting
  // drops the rise but would still fade it in).
  const reduce = useReducedMotion();
  return (
    <Tag ref={ref} className={className} initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={ONCE} transition={{ ...SPRING.reveal, delay }} {...rest}>
      {children}
    </Tag>
  );
});

/** A figure that settles when it changes: a short dip and rise, never a
 *  count-up (PRODUCT.md, numbers). */
export function Settle({ value, className }) {
  return (
    <m.span key={value} className={className} initial={{ opacity: 0.25, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={SPRING.surface}>
      {value}
    </m.span>
  );
}
