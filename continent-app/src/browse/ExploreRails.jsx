import React, { useId } from 'react';
import { Button, Rail as HouseRail } from '../components/ui/index.js';
import { HouseIcon } from '../components/HouseIcons.jsx';
import '../styles/85-explore-rails.css';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { openShared } from '../lib/sharedElement.js';
import { countryName } from '../lib/countryName.js';
import { SaveButton } from './ExploreCards.jsx';
import { FigureAmount, PlaceScore, ReceiptButton, figureSpoken, usePlaceFigure } from './explore/HouseParts.jsx';
import { FriendCardLine } from '../together/signals.jsx';
import { MatchMark } from './explore/MatchMark.jsx';
import { STORY_MAX, RAIL_CARD_SIZES } from './StoryRail.jsx';
import { nameLines } from './nameLines.js';

/**
 * Explore's sections (T427, after the owner's review of 2026-10-13).
 *
 * Each rail is a question a traveller asks ("Best in October", "Hiking
 * bases") answered by a strip of photo tiles, capped at 12, and a "See all"
 * that opens the list with the SAME filter applied, so the rail and the list
 * can never describe different places: the rail's query is the filter's
 * predicate, passed in by ExploreTab.
 *
 * Calm by subtraction: no subtitle explaining how a rail was chosen, no
 * position figure, no count in "See all" (owner: say less). Four strips on a
 * desktop and three on a phone (eight stacked carousels pushed the list two
 * screens down in v4); every further rail is one button in a single row that
 * opens its list. On a pointer screen each strip has a pair of arrows, since
 * a scroller with no scrollbar gives a mouse no way in; the arrow keys move
 * between the tiles.
 *
 * House style 2026-11 (G1): each strip is the house Rail (components/ui)
 * with rail cards (photo, name and Score plate, flag and country, the
 * figure and its basis, G12 place-prices). The rail logic, the lead count,
 * the doors and every seeAll are unchanged.
 */

// Explore rails (owner 2026-11-18, "scroll a lot horizontally"): sixteen
// places a strip, then the See all tile (it was twelve).
const CAP = 16;

// Round-robin by country, so a rail of 292 gems does not open on ten
// Italian tiles: take each country's best in turn until the cap.
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function interleaveByCountry(rows) {
  const byCountry = new Map();
  for (const p of rows) {
    if (!byCountry.has(p.country)) byCountry.set(p.country, []);
    byCountry.get(p.country).push(p);
  }
  const queues = [...byCountry.values()];
  const out = [];
  for (let i = 0; out.length < rows.length; i++) {
    const q = queues[i % queues.length];
    if (q.length) out.push(q.shift());
    if (queues.every((x) => !x.length)) break;
  }
  return out;
}


/** One place as a house rail card (DESIGN.md "Rail and RailCard"): the photo
 *  with only the save disc on it (no text on a photo), then two lines (G12,
 *  D10, place-prices card option A): the name with its Score plate and the
 *  figure; the flag and country and the figure's basis. The two lines are
 *  one button to the place's receipt; the photo is the link to the place. */
// G12, D10 (audit-perf.md cause 4): memoised, so a rail redraw (a typed
// letter, a saved place, a tab hop) redraws only the cards whose place, save
// state changed. Every prop is a value or a stable callback.
const PlaceRailCard = React.memo(function PlaceRailCard({ p, onSelect, fav, onToggleFav, t, eager = false }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fig = usePlaceFigure(p.cost);
  // The link is the photo, stretched over the whole card (the list row's
  // pattern), so the two lines under it can be a button beside it: a
  // button never nests in a link.
  return (
    <article className="hs-rcard xstory xrc" role="listitem">
      <a className="hs-rcard-link" href={`#dest=${encodeURIComponent(p.id)}`}
        aria-labelledby={`${uid}-n ${uid}-w`}
        onClick={(e) => {
          // A real link (T444): a plain click opens the place here, a
          // modifier click lets the browser open it in a new tab.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          openShared(e.currentTarget.closest('.hs-rcard'), p.id, () => onSelect(p.id));
        }}>
        <span className="hs-rcard-photo">
          <HeroImage url={p.image} image={p.photo} city={p.city} iso2={p.iso2} className="xrc-img" maxWidth={STORY_MAX}
            sizes={RAIL_CARD_SIZES} ratio={[4, 3]} eager={eager} />
        </span>
      </a>
      <ReceiptButton place={p} cost={p.cost} model={fig.model} label={figureSpoken(t, p, fig)} className="xrc-text">
        <span className="xrc-head">
          <span className="hs-rcard-name" id={`${uid}-n`}>{p.city}</span>
          <PlaceScore rating={p.rating} />
          <FigureAmount fig={fig} className="xrc-fig" />
        </span>
        <span className="hs-rcard-where">
          <CountryFlag country={p.iso2} size={12} />
          <span className="xrc-country" id={`${uid}-w`}>{countryName(p.iso2, p.country)}</span>
          {fig.f.eur != null && <span className="xrc-basis" aria-hidden="true">{fig.basis}</span>}
        </span>
      </ReceiptButton>
      {/* G12 map view round 2: the match mark under the country line. */}
      <MatchMark place={p} className="xrc-match" />
      <FriendCardLine destId={p.id} />
      {onToggleFav && (
        <span className="hs-rcard-save">
          <SaveButton fav={fav} onToggle={() => onToggleFav(p.id)} t={t} tone="photo" name={p.city} />
        </span>
      )}
    </article>
  );
});

/**
 * The rail's last tile (Explore rails, owner 2026-11-18: "See all must be
 * cleaner, more beautiful, more custom"). A traveller who scrolled to the
 * end of a strip wants more of the same, so the strip ends on a door the
 * size of a photo: the next places' photos as a row of round faces, "See
 * all" and the rail's name, and the umber arrow disc the head's See all
 * wears. One press opens what the head's See all opens.
 */
function SeeAllTile({ r, rest, t }) {
  const faces = rest.filter((p) => p.image || p.photo).slice(0, 3);
  return (
    <article className="hs-rcard xrc-more" role="listitem">
      <Button variant="quiet" className="xrc-more-btn" onClick={r.seeAll}
        aria-label={t('rail.seeAllNamed', { title: r.title })}>
        {faces.length > 0 && (
          <span className="xrc-more-faces" aria-hidden="true">
            {faces.map((p) => (
              <span key={p.id} className="xrc-more-face">
                <HeroImage url={p.image} image={p.photo} city={p.city} iso2={p.iso2} maxWidth={160}
                  sizes="64px" ratio={[1, 1]} />
              </span>
            ))}
          </span>
        )}
        <span className="xrc-more-text" aria-hidden="true">
          <span className="xrc-more-word">{t('rail.seeAllPlain')}</span>
          <span className="xrc-more-title">{r.title}</span>
        </span>
        <span className="hs-go-disc is-lg" aria-hidden="true"><HouseIcon.next size={20} /></span>
      </Button>
    </article>
  );
}

// H12 (T1105): how many cards of the first rails a phone sees before it
// scrolls. Those load eagerly (the first one is the page's largest paint);
// every other card waits for the viewport.
const EAGER_RAILS = 2;
const EAGER_CARDS = 2;

// G12, D10 (lane 1, explore-top-2): twenty rails of sixteen cards were
// 18,000 elements, and every re-price redrew and re-committed all of them
// (over a second of attribute writes at 4x CPU). The first rails draw their
// cards at once; a rail further down draws them when it comes within a
// screen and a half of the view, or when focus enters it, and keeps them.
// Its section, heading and See all are always there, so headings, the tab
// order and the rail doors reach every rail; its height until then is the
// contain-intrinsic-size of 85-explore-rails.css.
const MOUNT_FIRST = 3;
const MOUNT_MARGIN = '150% 0px';

function scrollParent(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === 'auto' || oy === 'scroll') return n;
  }
  return null;
}

// G12, D10 (round 6): rails coming near in one fast scroll mount one at a
// time, a frame apart, so each frame lays out one rail's cards (several at
// once were one 0.7 s layout at 4x CPU).
const mountQueue = [];
let mounting = false;
function queueMount(fn) {
  mountQueue.push(fn);
  if (mounting) return;
  mounting = true;
  const next = () => {
    const job = mountQueue.shift();
    if (!job) { mounting = false; return; }
    job();
    requestAnimationFrame(() => setTimeout(next, 0));
  };
  setTimeout(next, 0);
}

function useNearView(id, start) {
  const [near, setNear] = React.useState(start);
  React.useEffect(() => {
    if (near) return undefined;
    const sec = document.getElementById(id)?.closest('section');
    if (!sec || typeof IntersectionObserver !== 'function') { setNear(true); return undefined; }
    // A transition: several rails coming near in one fast scroll mount in
    // short slices instead of one long frame.
    let live = true;
    let queued = false;
    const show = () => {
      if (queued) return;
      queued = true;
      queueMount(() => { if (live) React.startTransition(() => setNear(true)); });
    };
    const now = () => setNear(true);
    // The rails scroll inside the Explore column: its edge, not the
    // viewport's, is where the margin has to reach.
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) show(); },
      { root: scrollParent(sec), rootMargin: MOUNT_MARGIN });
    io.observe(sec);
    // Focus mounts at once: the keyboard is already inside the rail.
    sec.addEventListener('focusin', now);
    return () => { live = false; io.disconnect(); sec.removeEventListener('focusin', now); };
  }, [id, near]);
  return near;
}

// G12, D10 (round 6, lead decision): a strip draws only the cards in or
// near its visible width, plus a buffer of two; the rest of its slots are
// empty spacers of the same width, so the strip scrolls as far, snaps the
// same and its arrows behave the same. Every card has one height (the name
// keeps room for two lines, 85-explore-rails.css), so a card arriving never
// changes the strip's height. Scrolling the strip draws the cards coming
// into reach and keeps them; focus entering the rail draws them all, so Tab
// and the arrow keys reach every card in order. Six of sixteen cards a rail
// on a desktop (three on a phone) cut the first draw, the late catalogue
// swap and every relayout (the docked Settings) to about a third.
const REACH_BUFFER = 2;
function firstReach() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  // Cards in view: 4.25 from 1024 px, 2.15 from 600 px, else 1.3 (05-house.css).
  const inView = w >= 1024 ? 5 : w >= 600 ? 3 : 2;
  return inView + REACH_BUFFER;
}

function useStripReach(id, total) {
  const [reach, setReach] = React.useState(firstReach);
  React.useEffect(() => {
    if (reach >= total) return undefined;
    const sec = document.getElementById(id)?.closest('section');
    if (!sec) return undefined;
    let frame = 0;
    const onScroll = (e) => {
      const strip = e.target;
      if (!(strip instanceof Element) || !strip.classList.contains('hs-rail') || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const card = strip.firstElementChild;
        const step = card ? card.offsetWidth + (parseFloat(getComputedStyle(strip).columnGap) || 0) : 0;
        if (!step) return;
        const need = Math.ceil((strip.scrollLeft + strip.clientWidth) / step) + REACH_BUFFER;
        setReach((n) => (need > n ? need : n));
      });
    };
    const all = () => setReach(total);
    sec.addEventListener('scroll', onScroll, { capture: true, passive: true });
    sec.addEventListener('focusin', all);
    return () => {
      sec.removeEventListener('scroll', onScroll, { capture: true });
      sec.removeEventListener('focusin', all);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [id, reach, total]);
  return reach;
}

// G12 round 2 fix (owner rule: no cut text): a card's name keeps room for
// as many lines as the strip's longest name needs (2 to 4), so every card of
// a strip still has one height and windowing still holds, but "Stockholm
// Archipelago (Vaxholm)" or "'s-Hertogenbosch" at 360 px in German is no
// longer cut at two. The lines are worked out once per rail list with a
// canvas (no layout per card): the font and the room a name gets beside its
// Score and figure are read once from a drawn card per viewport width.
// Place-prices card A: a strip of one-line names keeps one line, so the
// two lines under the photo stay two (about 48 px).
const NAME_LINES_MIN = 1;
const NAME_LINES_MAX = 4;
let nameRuler = null;
let nameCanvas = null;
function readNameRuler(scope) {
  const vw = window.innerWidth;
  if (nameRuler?.vw === vw) return nameRuler;
  const heads = [...(scope || document).querySelectorAll('.xrc .xrc-head')].slice(0, 8);
  let room = Infinity;
  let font = '';
  for (const h of heads) {
    const name = h.querySelector('.hs-rcard-name');
    if (!name || !h.clientWidth) continue;
    const gap = parseFloat(getComputedStyle(h).columnGap) || 0;
    let w = h.clientWidth;
    for (const c of h.children) if (c !== name) w -= c.getBoundingClientRect().width + gap;
    room = Math.min(room, w);
    if (!font) {
      const s = getComputedStyle(name);
      font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    }
  }
  if (!font || !(room > 40 && room < Infinity)) return null;
  // A card not drawn yet may carry a slightly wider figure than the ones read.
  nameRuler = { vw, font, room: room - 8 };
  return nameRuler;
}

function useNameLines(id, names, near) {
  const key = names.join('\n');
  React.useLayoutEffect(() => {
    const sec = document.getElementById(id)?.closest('section');
    if (!sec || !key) return undefined;
    const apply = () => {
      const ruler = readNameRuler(sec);
      if (!ruler) return;
      nameCanvas = nameCanvas || document.createElement('canvas').getContext('2d');
      if (!nameCanvas) return;
      nameCanvas.font = ruler.font;
      const width = (s) => nameCanvas.measureText(s).width;
      let most = NAME_LINES_MIN;
      for (const n of key.split('\n')) most = Math.max(most, nameLines(n, ruler.room, width));
      const v = String(Math.min(NAME_LINES_MAX, most));
      if (sec.style.getPropertyValue('--xrc-name-lines') !== v) sec.style.setProperty('--xrc-name-lines', v);
    };
    apply();
    // Canvas measures with a fallback until the web font has loaded.
    let live = true;
    document.fonts?.ready?.then(() => { if (live) apply(); });
    let frame = 0;
    const onResize = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; apply(); });
    };
    window.addEventListener('resize', onResize);
    return () => { live = false; window.removeEventListener('resize', onResize); if (frame) cancelAnimationFrame(frame); };
  }, [id, key, near]);
}

const ExploreRail = React.memo(function ExploreRail({ r, onSelect, favorites, onToggleFav, t, eager = false, mountNow = false }) {
  const near = useNearView(`xrail-${r.key}`, mountNow);
  const shown = near ? r.rows.slice(0, CAP) : [];
  const slots = shown.length + (r.seeAll ? 1 : 0);
  const reach = useStripReach(`xrail-${r.key}`, slots);
  // Every name of the list, drawn or not: a waiting rail holds the height
  // its names will need (--xrail-h reads the same lines).
  useNameLines(`xrail-${r.key}`, React.useMemo(() => r.rows.slice(0, CAP).map((p) => p.city || ''), [r.rows]), near);
  // h2: the rails sit straight under the page's h1 (T193). The house rail
  // (G1): the heading, See all and the two round arrows; the lead card's
  // facts and the rail lines went (house style 2026-11, owner: no redundant
  // text): the cards already show the cheapest day, the month and the Score.
  return (
    <HouseRail id={`xrail-${r.key}`} title={r.title} headingLevel={2}
      onSeeAll={r.seeAll} className={near ? 'xrails-rail' : 'xrails-rail is-waiting'}>
      {shown.map((p, i) => (i < reach
        ? <PlaceRailCard key={p.id} p={p}
          onSelect={onSelect} fav={favorites?.has(p.id)} onToggleFav={onToggleFav} t={t}
          eager={eager && i < EAGER_CARDS} />
        : <div key={p.id} className="hs-rcard xrc-spacer" aria-hidden="true" />))}
      {near && r.seeAll && (shown.length < reach
        ? <SeeAllTile r={r} rest={r.rows.slice(CAP)} t={t} />
        : <div className="hs-rcard xrc-spacer" aria-hidden="true" />)}
    </HouseRail>
  );
});

// The latest callback behind a stable identity: the parents' open and save
// handlers change with the search hits, and a new identity would redraw every
// memoised card on each typed letter.
function useStableCallback(fn) {
  const ref = React.useRef(fn);
  React.useLayoutEffect(() => { ref.current = fn; });
  return React.useCallback((...a) => ref.current?.(...a), []);
}

/** `hideDoors` (T599): leave out the row of further-rail buttons, for a
 *  page that shows those doors elsewhere (the overview's top). */
// G12, D10 (round 6, lead decision): when the full catalogue replaces the
// lite one (`full` turns on), every rail gets new rows at once and redrawing
// them all was one task of 0.4 to 6 s at 4x CPU. The rails take their new
// rows one per task instead, the ones in or near the view first. Only that
// swap is spread out: its figures are the same request priced on the same
// inputs, so no card ever shows a price from other settings. Any other
// change (a setting, a filter) reaches every rail at once.
function useRailsInTurn(rails, full) {
  const [held, setHeld] = React.useState(null);
  const wasFull = React.useRef(full);
  const nearKeys = React.useRef(new Set());
  const swapping = full && !wasFull.current;
  // The rails the swap found, frozen in the render the swap arrived in.
  const prev = React.useRef(rails);
  if (swapping && held == null) {
    const map = new Map(prev.current.map((r) => [r.key, r]));
    setHeld(map);
  }
  React.useLayoutEffect(() => {
    wasFull.current = full;
    prev.current = rails;
  });
  React.useEffect(() => {
    if (!held) return undefined;
    const order = rails.filter((r) => held.has(r.key) && held.get(r.key) !== r);
    order.sort((a, b) => (nearKeys.current.has(b.key) ? 1 : 0) - (nearKeys.current.has(a.key) ? 1 : 0));
    let timer = 0;
    let i = 0;
    const step = () => {
      if (i >= order.length) { React.startTransition(() => setHeld(null)); return; }
      const r = order[i];
      i += 1;
      React.startTransition(() => setHeld((m) => (m ? new Map(m).set(r.key, r) : m)));
      timer = setTimeout(step, 0);
    };
    timer = setTimeout(step, 0);
    return () => clearTimeout(timer);
    // The rails worked through are the ones of the render the swap began in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held == null, rails]);
  React.useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return undefined;
    const secs = [...document.querySelectorAll('.xrails-rail')];
    if (!secs.length) return undefined;
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const key = e.target.id?.replace(/^xrail-/, '') || e.target.querySelector('[id^="xrail-"]')?.id.replace(/^xrail-/, '');
        if (!key) continue;
        if (e.isIntersecting) nearKeys.current.add(key); else nearKeys.current.delete(key);
      }
    }, { rootMargin: '50% 0px' });
    secs.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [rails.length]);
  return held ? rails.map((r) => held.get(r.key) || r) : rails;
}

export function ExploreRails({
  rails: railsNow, onSelect, favorites, onToggleFav, t, lead = 4, hideDoors = false, eager = false,
  full = true,
}) {
  const select = useStableCallback(onSelect);
  const toggleFav = useStableCallback(onToggleFav);
  const rails = useRailsInTurn(railsNow, full);
  const visible = rails.filter((r) => r.rows.length >= 4);
  if (!visible.length) return null;
  const strips = visible.slice(0, lead);
  const doors = hideDoors ? [] : visible.slice(lead);
  // G12, D10 (owner, 2026-11-17): no head line over the rails. Each figure
  // says its unit; "Local transport: not yet measured" lives in what the
  // figure opens, inside the price it explains.
  return (
    <div className="xrails">
      {strips.map((r, ri) => (
        <ExploreRail key={r.key} r={r} onSelect={select} favorites={favorites} onToggleFav={onToggleFav ? toggleFav : null} t={t}
          eager={eager && ri < EAGER_RAILS} mountNow={ri < MOUNT_FIRST} />
      ))}
      {doors.length > 0 && (
        <nav className="xrails-doors" aria-label={t('explore.moreRails')}>
          {doors.map((r) => (
            <Button key={r.key} variant="secondary" size="sm" onClick={r.seeAll}>
              {r.short || r.title}
            </Button>
          ))}
        </nav>
      )}
    </div>
  );
}
