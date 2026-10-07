import React from 'react';
import { boldSegments } from '../lib/journeys.js';
import {
  AlertIcon, BulbIcon, CloudIcon, ClockIcon, ChevronRightIcon, ArrowLeftIcon,
} from '../components/Icons.jsx';

/**
 * A deck of advisory cards (T167, spec C5; carta-design "Flashcards").
 *
 * One card in view. Previous and Next are real buttons, the arrow keys do the
 * same when the deck has focus, and a swipe is only a shortcut for them. Show
 * all turns the deck into a plain list, and printing shows the list. No flip,
 * no stacking, no looping. The cards come from lib/flashcards.js, already
 * capped at 35 words each.
 */

export function CoinIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.4c-.5-.8-1.5-1.2-2.8-1.2-1.6 0-2.7.8-2.7 1.9 0 2.6 5.6 1.3 5.6 3.9 0 1.1-1.2 1.9-2.9 1.9-1.4 0-2.5-.5-3-1.4" />
      <path d="M12 6.6v1.6M12 15.8v1.6" />
    </svg>
  );
}

const ICONS = {
  risk: AlertIcon, money: CoinIcon, weather: CloudIcon, timing: ClockIcon, tip: BulbIcon,
};

const SWIPE_PX = 48;

function CardBody({ card }) {
  const Icon = card.icon || ICONS[card.category] || BulbIcon;
  return (
    <>
      <span className="flash-icon"><Icon size={20} /></span>
      <div className="flash-text">
        {card.label && <p className="flash-label">{card.label}</p>}
        <p className="flash-body">
          {boldSegments(card.text).map((seg, i) => (seg.bold
            ? <b key={i}>{seg.text}</b>
            : <React.Fragment key={i}>{seg.text}</React.Fragment>))}
        </p>
      </div>
    </>
  );
}

export function FlashDeck({ id, cards, label, t }) {
  const [index, setIndex] = React.useState(0);
  const [showAll, setShowAll] = React.useState(false);
  const start = React.useRef(null);
  const slides = React.useRef([]);
  const total = cards.length;
  const at = Math.min(index, Math.max(total - 1, 0));

  // Cards out of view are hidden from the keyboard and from screen readers.
  React.useEffect(() => {
    slides.current.forEach((el, i) => {
      if (!el) return;
      if (i === at) el.removeAttribute('inert'); else el.setAttribute('inert', '');
    });
  }, [at, total, showAll]);

  if (total === 0) return null;
  const go = (n) => setIndex(Math.max(0, Math.min(total - 1, n)));

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
  };
  const onPointerDown = (e) => { start.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(at + (dx < 0 ? 1 : -1));
  };

  return (
    <div className={`flash ${showAll ? 'is-all' : ''}`} id={id}>
      {total > 1 && (
        <button
          type="button"
          className="flash-all"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? t('journey.deckAsCards') : t('journey.deckShowAll')}
        </button>
      )}

      <div
        className="flash-deck"
        role="group"
        aria-roledescription={t('journey.deckRole')}
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { start.current = null; }}
      >
        <div className="flash-track" style={{ transform: `translateX(-${at * 100}%)` }}>
          {cards.map((card, i) => (
            <div
              key={card.key}
              className="flash-card"
              ref={(el) => { slides.current[i] = el; }}
              aria-hidden={i === at ? undefined : 'true'}
            >
              <CardBody card={card} />
            </div>
          ))}
        </div>
      </div>

      {total > 1 && (
        <div className="flash-bar">
          <button type="button" className="flash-btn" onClick={() => go(at - 1)} disabled={at === 0}>
            <ArrowLeftIcon size={14} />
            <span>{t('journey.deckPrev')}</span>
          </button>
          <span className="flash-pos mono" aria-live="polite">
            {t('journey.deckPos', { n: at + 1, total })}
          </span>
          <button type="button" className="flash-btn" onClick={() => go(at + 1)} disabled={at === total - 1}>
            <span>{t('journey.deckNext')}</span>
            <ChevronRightIcon size={14} />
          </button>
        </div>
      )}

      <ul className="flash-list">
        {cards.map((card) => (
          <li key={card.key}><CardBody card={card} /></li>
        ))}
      </ul>
    </div>
  );
}
