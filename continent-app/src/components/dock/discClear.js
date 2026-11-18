import { useEffect } from 'react';
import { prefersReducedMotion } from '../../lib/motion.js';

/*
 * The style disc keeps clear of what a card says (G12, judge 2; owner: the
 * style button stays bottom left). Two moves, both on the disc's wrapper and
 * never through React state, so a scroll re-renders nothing:
 *
 *   tuck    while a list scrolls down the disc slides out to the left
 *           (data-tucked); a scroll up or the list coming to rest brings it
 *           back. Reduced motion: it stays where it is.
 *   lift    at rest it rises (--disc-lift) just far enough that it sits on
 *           no card's name or price row and not on the Map pill, measured
 *           against what is on screen now.
 */

// What the disc must never sit on: a card's name line and its price row on
// every list (Places rows, layer and trip cards), and the phone's Map pill.
export const DISC_CLEAR = [
  '.xrow-line1', '.xrc-head', '.hs-rcard-name', '.xprice', '.xform',
  '.card-title', '.card-price',
  '.places-card-price', '.itin-card-name', '.itin-card-cost',
  '.xview-fab', '[data-disc-clear]',
].join(', ');

const GAP = 6;
const DOWN_PX = 16;
const UP_PX = 24;
const REST_MS = 180;
const SETTLE_MS = 420;

const meets = (a, b, gap) => a.left < b.right + gap && a.right > b.left - gap
  && a.top < b.bottom + gap && a.bottom > b.top - gap;

/**
 * How far up (px) the disc must rise from `base` so it meets none of
 * `targets`; 0 when it is clear where it stands. Each step lifts it above the
 * lowest thing it meets, so it lands in the first gap tall enough (a photo).
 * `minTop` is the highest its top may go (under the band); past it there is
 * no clear place and the answer is 0 (it stays home).
 */
export function discLift(base, targets, { minTop = 0, gap = GAP } = {}) {
  const h = base.bottom - base.top;
  let lift = 0;
  for (let i = 0; i < 40; i += 1) {
    const at = { left: base.left, right: base.right, top: base.top - lift, bottom: base.bottom - lift };
    const hit = targets.filter((r) => meets(at, r, gap));
    if (!hit.length) return lift;
    const top = Math.min(...hit.map((r) => r.top));
    lift = Math.max(lift + 1, Math.ceil(base.bottom - top + gap));
    if (base.bottom - lift - h < minTop) return 0;
  }
  return 0;
}

/** The disc's home rect: its fixed place without the lift or the tuck
 *  (offsets ignore transforms). */
function homeOf(el) {
  const left = el.offsetLeft;
  const top = el.offsetTop;
  return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
}

function visibleRects(sel, skip) {
  const vh = window.innerHeight;
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    if (skip.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= vh) continue;
    out.push(r);
  }
  return out;
}

/** Measures and places the disc in `ref` while `enabled`. */
export function useDiscClear(ref, enabled) {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return undefined;
    let restTimer = 0;
    let settleTimer = 0;
    let placeTimer = 0;
    let run = 0;
    const last = new WeakMap();

    const place = () => {
      placeTimer = 0;
      if (el.dataset.tucked === '1') return;
      const band = document.querySelector('.band');
      const minTop = band ? band.getBoundingClientRect().bottom + GAP : 0;
      const lift = discLift(homeOf(el), visibleRects(DISC_CLEAR, el), { minTop });
      el.style.setProperty('--disc-lift', `${lift}px`);
    };
    const placeSoon = () => {
      if (!placeTimer) placeTimer = window.setTimeout(place, 120);
    };
    const tuck = (on) => {
      // Focus on the disc keeps it out: a keyboard user never loses it.
      if (on && (prefersReducedMotion() || el.contains(document.activeElement))) return;
      if (on) el.dataset.tucked = '1';
      else delete el.dataset.tucked;
    };

    const onScroll = (e) => {
      const sc = e.target === document ? document.scrollingElement : e.target;
      if (!sc || sc.nodeType !== 1 || sc.closest?.('[role="dialog"], .band')) return;
      const y = sc.scrollTop;
      const prev = last.has(sc) ? last.get(sc) : y;
      last.set(sc, y);
      const dy = y - prev;
      if (dy) {
        run = Math.sign(dy) === Math.sign(run) ? run + dy : dy;
        if (run > DOWN_PX) { run = 0; tuck(true); } else if (run < -UP_PX) { run = 0; tuck(false); placeSoon(); }
      }
      window.clearTimeout(restTimer);
      window.clearTimeout(settleTimer);
      restTimer = window.setTimeout(() => {
        run = 0;
        tuck(false);
        place();
        // The phone band folds or unfolds after a scroll and moves the list
        // under the disc without a DOM change: place it again once that ends.
        settleTimer = window.setTimeout(place, SETTLE_MS);
      }, REST_MS);
    };

    // Rows arrive after the first paint (data, photos, the band settling),
    // so any change under the app places the disc again, at most every
    // 120 ms.
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(placeSoon) : null;
    mo?.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', placeSoon);
    place();
    return () => {
      mo?.disconnect();
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', placeSoon);
      window.clearTimeout(restTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(placeTimer);
      delete el.dataset.tucked;
      el.style.removeProperty('--disc-lift');
    };
  }, [ref, enabled]);
}
