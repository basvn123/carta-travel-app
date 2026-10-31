import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { tabHref } from '../lib/urlState.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { ArrowRightIcon } from '../components/Icons.jsx';
import { loadJourneyIndex, coverageFacts, typeLabel } from '../lib/journeys.js';
import '../styles/97-carta-own-trips.css';

/*
 * Carta's own trips (T964): the first thing under Explore's six tabs on
 * Places, in place of the old "Trip styles" rail. The owner's call
 * (2026-10-31): Carta's predefined trips must read as Carta's own, not as one
 * more rail like "Top rated in Europe" under it. So it is not a rail: a deep
 * umber folder with a deck of trip-style photographs dealt out of its top
 * edge (the Plan page's old fan, T747), a route drawn across it, the title,
 * the library's own counts and one button. The whole block is one link to
 * the trip library.
 *
 * Motion, one authored moment: the deck deals out of a pile when the block
 * first comes into view and the route draws itself; after that the deck
 * shuffles every few seconds (the front photograph goes to the back, the
 * next style comes forward and names itself under the deck). The shuffle
 * stops while a pointer or the focus is on the block, while it is off
 * screen or the page is hidden, and never runs with reduced motion.
 */

// Places in the fan, front first: offset steps from the centre.
const SLOTS = [0, -1, 1, -2, 2];
const POOL = 7;
const SHUFFLE_MS = 3600;
// The style in front, by month: what a week in Europe is for then.
const SEASON = {
  1: 'winter-sports', 2: 'winter-sports', 3: 'city', 4: 'hiking', 5: 'hiking', 6: 'hiking',
  7: 'water-sports', 8: 'water-sports', 9: 'hiking', 10: 'hiking', 11: 'city', 12: 'winter-sports',
};
const FAN = ['city', 'water-sports', 'cycling', 'cozy-towns', 'hiking', 'culinary', 'rail'];

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function CartaOwnTrips({ onOpen }) {
  const { t } = useI18n();
  const [deck, setDeck] = useState(null);
  const [facts, setFacts] = useState(null);
  const [turn, setTurn] = useState(0);
  const [dealt, setDealt] = useState(false);
  const rootRef = useRef(null);
  const held = useRef(false);
  const seen = useRef(false);

  useEffect(() => {
    let live = true;
    loadJourneyIndex().then((ix) => {
      if (!live || !ix?.types) return;
      const bySlug = new Map(ix.types.filter((tp) => tp.hero?.url).map((tp) => [tp.slug, tp]));
      const month = new Date().getMonth() + 1;
      const order = [...new Set([SEASON[month], ...FAN, ...bySlug.keys()])].filter((s) => bySlug.has(s)).slice(0, POOL);
      if (order.length >= 3) setDeck(order.map((s) => bySlug.get(s)));
      const f = coverageFacts(ix);
      if (f.trips > 0 && f.countries > 0) setFacts(f);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Deal once on first sight; keep track of whether it is on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setDealt(true); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      seen.current = e.isIntersecting;
      if (e.isIntersecting) setDealt(true);
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The shuffle.
  const n = deck?.length || 0;
  useEffect(() => {
    if (!dealt || n < 3 || reducedMotion()) return undefined;
    const id = setInterval(() => {
      if (held.current || !seen.current || document.hidden) return;
      setTurn((v) => v + 1);
    }, SHUFFLE_MS);
    return () => clearInterval(id);
  }, [dealt, n]);

  const front = n ? deck[turn % n] : null;
  const hold = (v) => () => { held.current = v; };

  return (
    <a
      ref={rootRef}
      className={`xown${dealt ? ' is-dealt' : ''}${deck ? '' : ' is-wait'}`}
      href={tabHref('places', undefined, { cat: 'trips' })}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpen?.();
      }}
      onPointerEnter={hold(true)}
      onPointerLeave={hold(false)}
      onFocus={hold(true)}
      onBlur={hold(false)}
    >
      <svg className="xown-route" viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path className="xown-route-line" pathLength="1"
          d="M18 206 C 90 196, 110 150, 160 142 S 250 150, 282 104 S 330 34, 392 22" />
      </svg>

      <span className="xown-deck" aria-hidden="true">
        {(deck || SLOTS.map((_, i) => ({ slug: `w${i}` }))).map((tp, i) => {
          const s = n ? ((i - turn) % n + n) % n : i;
          const shown = s < SLOTS.length;
          const k = shown ? SLOTS[s] : 0;
          return (
            <span
              key={tp.slug}
              className={`xown-card${shown ? '' : ' is-back'}${s === 0 ? ' is-front' : ''}`}
              style={{ '--k': k, '--z': shown ? SLOTS.length - Math.abs(k) + (s === 0 ? 1 : 0) : 0, '--i': i }}
            >
              {tp.hero?.url && (
                <HeroImage url={tp.hero.url} city={tp.name || tp.slug} className="xown-img" maxWidth={500}
                  sizes="(max-width: 768px) 34vw, 220px" ratio={[3, 4]} />
              )}
            </span>
          );
        })}
      </span>

      <span className="xown-now" aria-hidden="true">
        {front && <span key={front.slug} className="xown-now-word">{typeLabel(front.slug, t, front.name)}</span>}
      </span>

      <span className="xown-text">
        <h2 className="xown-title">{t('xown.title')}</h2>
        {facts && (
          <span className="xown-facts">{t('xown.facts', { trips: facts.trips, countries: facts.countries })}</span>
        )}
        <span className="xown-go">
          {t('pf.promo.link')}
          <ArrowRightIcon size={16} />
        </span>
      </span>
    </a>
  );
}
