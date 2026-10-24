import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/index.jsx';
import { Switch } from './ui/Switch.jsx';
import { formatMoney } from '../lib/money.js';
import NotYet from './NotYet.jsx';
import { useSettings } from './SettingsLine.jsx';
import { useDayView } from '../hooks/useDayView.js';
import '../styles/31-infodot.css';
import '../styles/86-price-items.css';

/**
 * The opened price (T695, plan rule 9, owner 2026-10-24): one amount by
 * default; a tap on it lists, compactly, the items in it with their amounts
 * and a switch each. Switching an item off is a choice in the price request
 * (choices.price_excluded, URL key px), so it applies at once on every
 * screen, in the filters and in sorting, and it is kept like every setting.
 * No provenance, no assumptions and no sources here: items, amounts, switches.
 *
 * An item without data shows the shared placeholder ("Not available yet",
 * the owner's rule for things the data does not carry yet), never a zero, no
 * switch and nothing in the sum (plan rule 8).
 *
 * One component for the Explore card, the destination header and its
 * calculator.
 *
 *   cost   the engine row (lib/price/priceDay.js: lines with key, status, eur)
 *   way    the way there a person, { mode, perPerson } or null
 *   children  the amount the trigger wraps
 */
const ORDER = ['bed', 'food', 'transport', 'car', 'activities', 'events', 'flight'];
const POP_W = 300;
const GUTTER = 12;
const GAP = 8;

export function PriceItemList({ cost, way = null }) {
  const { t } = useI18n();
  const settings = useSettings();
  const view = useDayView();
  const excluded = new Set(view.request.excluded || []);
  const setExcluded = settings?.setPriceExcluded || null;
  const toggle = (key, on) => {
    if (!setExcluded) return;
    const next = new Set(excluded);
    if (on) next.delete(key); else next.add(key);
    setExcluded(ORDER.filter((k) => next.has(k)));
  };
  const lines = new Map((cost?.lines || []).map((l) => [l.key, l]));
  const rows = [];
  for (const key of ORDER) {
    if (key === 'flight') {
      if (!(way?.perPerson > 0)) continue;
      rows.push({ key, label: t(`price.item.${way.mode === 'plane' ? 'flight' : 'way'}`, { mode: t(`way.${way.mode}`) }),
        amount: formatMoney(view.way(way.perPerson)), priced: true });
      continue;
    }
    const l = lines.get(key);
    // The car is an item only when it is in the price (plan 3; T702: a hire
    // is a trip choice, never in the day).
    if (key === 'car' && l?.status !== 'included') continue;
    if (!l && key !== 'events') continue;
    const priced = l?.eur != null;
    rows.push({ key, label: t(`price.item.${key}`), amount: priced ? formatMoney(view.day(l.eur)) : null, priced });
  }
  return (
    <ul className="pitems-list">
      {rows.map((r) => (
        <li className="pitems-row" key={r.key} data-item={r.key}>
          {r.priced && setExcluded ? (
            <Switch label={r.label} hint={r.amount} checked={!excluded.has(r.key)} onChange={(on) => toggle(r.key, on)} />
          ) : (
            <span className="pitems-static">
              <span className="pitems-label">{r.label}</span>
              {r.priced ? <span className="pitems-amount">{r.amount}</span> : <NotYet className="pitems-amount" />}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The amount as a button that opens the item list in a popover. */
export function PriceItems({ cost, way = null, children, className = '' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const id = useId();
  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) btnRef.current?.focus();
  }, []);

  // The InfoDot placement: under the amount, flipped above when there is no
  // room, inside the viewport on a 360 px phone.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const w = Math.min(POP_W, window.innerWidth - 2 * GUTTER);
    const left = Math.max(GUTTER, Math.min(r.left, window.innerWidth - GUTTER - w));
    const h = popRef.current?.offsetHeight || 200;
    const below = r.bottom + GAP;
    const top = below + h > window.innerHeight - GUTTER && r.top - GAP - h > GUTTER ? r.top - GAP - h : below;
    setPos({ left, top, width: w });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close(true);
    };
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close(false);
    };
    const onMove = () => close(false);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, close]);

  // A card is one stretched link: the trigger sits above it and keeps its
  // click to itself, so opening the price never opens the place.
  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) close(true); else setOpen(true);
  };

  return (
    <span className={`pitems ${className}`.trim()}>
      <button
        ref={btnRef}
        type="button"
        className="pitems-trigger"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        title={t('price.itemsOpen')}
        onClick={onClick}
      >
        {children}
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          id={id}
          role="dialog"
          aria-label={t('price.itemsTitle')}
          className="infodot-pop pitems-pop"
          style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: 'hidden' }}
          onClick={(e) => e.stopPropagation()}
        >
          <strong className="infodot-term">{t('price.itemsTitle')}</strong>
          <PriceItemList cost={cost} way={way} />
        </div>,
        document.body,
      )}
    </span>
  );
}
