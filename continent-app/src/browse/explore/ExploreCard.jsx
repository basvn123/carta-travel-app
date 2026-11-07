import React from 'react';
import { scrollBehavior } from '../../lib/motion.js';
import { knownFor } from '../../lib/knownFor.js';
import { monthName } from '../../lib/dates.js';
import { fmtMonthRanges } from '../ClimateStrip.jsx';
import { visitLength } from '../../lib/nearby.js';
import { formatMoney } from '../../lib/money.js';
import { ChevronRightIcon } from '../../components/Icons.jsx';
import { useTravelMonth } from '../../components/SettingsLine.jsx';
import { PlaceOverview } from '../PlaceOverview.jsx';
import { openShared } from '../../lib/sharedElement.js';

// The popover's width cap and its gap to the card (house rule "Dialog
// family": a popover is at most 320 px wide, beside or under its card).
const POP_W = 320;

const POP_GAP = 8;

/**
 * Where the popover goes: beside the card when the scrolling column has
 * room on the right (then the left), else under the card, shifted so it
 * stays inside the column. Never over the card's photograph (explore N6).
 */
function placePopover(card) {
  const col = card.closest('.explore-tab') || document.documentElement;
  const b = col.getBoundingClientRect();
  const r = card.getBoundingClientRect();
  const w = Math.min(POP_W, b.width - 32);
  if (b.right - r.right >= w + POP_GAP + 8) return { side: 'right', dx: 0, w };
  if (r.left - b.left >= w + POP_GAP + 8) return { side: 'left', dx: 0, w };
  const minX = b.left + 16 - r.left;
  const maxX = b.right - 16 - w - r.left;
  return { side: 'below', dx: Math.round(Math.max(minX, Math.min(0, maxX))), w };
}

/**
 * The preview (T591, owner 2026-10-22): the receipt, the sights, the month
 * strip and the country rank went; the card itself now carries the price
 * parts and the dates. What is left is what helps a decision in one look: the
 * hook line (what the place is known for), one month verdict for the chosen
 * month ("Good in November", else "Best in Apr to Jun"), one plan sentence
 * ("3 days in November, about 225 euros a person": the visit length times the
 * day total) and one quiet action that opens the place. A paper popover
 * beside the card, never over its photograph (explore N6).
 *
 * WCAG 1.4.13: dismissible (Escape), hoverable (a child of the card, and a
 * transparent bridge spans the gap so the pointer can travel into it),
 * persistent (nothing times it out). The action repeats the card's own link
 * for a pointer, so it stays out of the tab order and the accessible
 * description (the card link already opens the place).
 */
function CardPreview({ id, p, t, month, place, reveal = false, onOpen }) {
  // Opened by the info control (a tap on a phone), the popover under the
  // card is brought into view if it opened below the fold.
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (reveal) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: scrollBehavior() });
  }, [reveal]);
  const lead = knownFor(p);
  const good = p.climate?.best || [];
  const lang = t.lang || 'en';
  const inMonth = month && good.includes(month) ? monthName(month, lang) : null;
  const verdict = inMonth
    ? t('gs.whyMonth', { month: inMonth })
    : (good.length ? t('explore.bestMonths', { months: fmtMonthRanges(good, t) }) : null);
  const stay = visitLength(p);
  const days = stay ? Math.max(1, stay.n || Math.round(stay.days) || 1) : null;
  const day = p.cost?.dayEur;
  const total = days && Number.isFinite(day) ? formatMoney(day * days) : null;
  const monthWord = month ? monthName(month, lang) : null;
  const plan = days && total
    ? t(`card.plan${days === 1 ? 'One' : 'Days'}${monthWord ? 'In' : ''}`, { n: days, month: monthWord, total })
    : (stay ? t(stay.key, { n: stay.n }) : null);
  return (
    <div
      id={id}
      ref={ref}
      className={`xcard-preview xpop xpop--${place.side} xpop-v6`}
      role="tooltip"
      style={{ '--xpop-dx': `${place.dx}px`, '--xpop-w': `${place.w}px` }}
    >
      {lead && <p className="xpop-lead">{lead}</p>}
      {(verdict || plan) && (
        <p className="xpop-facts">
          {verdict && <span className={`xpop-verdict${inMonth ? ' is-good' : ''}`}>{verdict}</span>}
          {plan && <span className="xpop-plan">{plan}</span>}
        </p>
      )}
      <a
        className="xpop-open"
        href={`#dest=${encodeURIComponent(p.id)}`}
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onOpen?.(e);
        }}
      >
        <span>{t('card.openPlace', { place: p.city })}</span>
        <ChevronRightIcon size={16} />
      </a>
    </div>
  );
}

// The popover's delays (house rule "Dialog family"): a pointer that rests
// 150 ms, a focus that rests 400 ms (so a Tab walk through the grid does not
// strobe), the info control at once.
const HOVER_MS = 150;

const FOCUS_MS = 400;

export const ExploreCard = React.memo(function ExploreCard({
  p, selected, fav, onSelect, onToggleFav, t,
  linked = false, onLink = null, month = null, region = null, reason = null, rating = null,
  layout = 'row',
}) {
  // The preview speaks of the chosen month, else the traveller's own (T591).
  const travelMonth = useTravelMonth();
  const previewMonth = month || travelMonth || null;
  // One popover, three doors: hover, focus, and the info control, which
  // pins it until it is pressed again, Escape, or a tap elsewhere.
  const [open, setOpen] = React.useState(null);
  const [place, setPlace] = React.useState(null);
  const cardRef = React.useRef(null);
  const timer = React.useRef(0);
  const popId = `xpop-${p.id}`;
  const preview = open != null;

  const later = (how, ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen((o) => (o === 'pin' ? o : how)), ms);
  };
  const drop = (how) => {
    clearTimeout(timer.current);
    setOpen((o) => (o === how ? null : o));
  };
  React.useEffect(() => () => clearTimeout(timer.current), []);

  // Placed before paint, so the popover never flashes on the wrong side.
  React.useLayoutEffect(() => {
    setPlace(preview && cardRef.current ? placePopover(cardRef.current) : null);
  }, [preview]);

  React.useEffect(() => {
    if (!preview) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { clearTimeout(timer.current); setOpen(null); } };
    const onDown = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [preview]);

  // T504 (roadmap 1.5): the row IS the place's one overview, the same
  // component the map's selected place and the phone's drawer draw. The
  // popover beside it adds what a row cannot fit; it is not a second overview.
  return (
    <PlaceOverview
      p={p} region={region} reason={reason} rating={rating} fav={fav} onToggleFav={onToggleFav} t={t}
      selected={selected} linked={linked} layout={layout}
      className={preview ? 'previewing' : ''}
      rootRef={cardRef}
      rootProps={{
        onPointerEnter: (e) => { if (e.pointerType === 'mouse') later('hover', HOVER_MS); onLink?.(p.id); },
        onPointerLeave: () => { drop('hover'); onLink?.(null); },
      }}
      hitProps={{
        onFocus: (e) => {
          // A phone has no hover: a focus there (a page arriving, a tap) never
          // opens the preview over the list; the card itself opens the place.
          if (e.target.matches?.(':focus-visible') && window.matchMedia?.('(hover: hover)').matches) later('focus', FOCUS_MS);
          onLink?.(p.id);
        },
        onBlur: () => { drop('focus'); onLink?.(null); },
        'aria-describedby': preview && place ? popId : undefined,
      }}
      onOpen={(e) => openShared(e.currentTarget, p.id, () => onSelect(p.id))}
    >
      {preview && place && (
        <CardPreview id={popId} p={p} t={t} month={previewMonth} place={place} reveal={open === 'pin'}
          onOpen={(e) => openShared(cardRef.current?.querySelector('.xrow-hit') || e.currentTarget, p.id, () => onSelect(p.id))} />
      )}
    </PlaceOverview>
  );
});
