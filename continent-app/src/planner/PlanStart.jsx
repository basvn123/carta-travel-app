import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { tabHref } from '../lib/urlState.js';
import { ChevronRightIcon } from '../components/Icons.jsx';

/* The two drawings (T465, moved here from the old bottom-nav chooser by
   T496): line work in ink on the tile's white, the shape of what each
   planner makes. Decorative, so hidden from assistive tech; the tile's name
   is its label. Drawings, not icons in a tinted tile (carta-design "Icons"). */
function TripDrawing() {
  return (
    <svg className="plan-start-art" viewBox="0 0 132 64" aria-hidden="true" focusable="false">
      <path className="pca-line" d="M18 46 C 38 46, 40 20, 64 24 S 96 46, 114 18" />
      <circle className="pca-stop" cx="18" cy="46" r="5" />
      <circle className="pca-stop" cx="64" cy="24" r="5" />
      <circle className="pca-stop pca-stop-end" cx="114" cy="18" r="5" />
    </svg>
  );
}
function DayDrawing() {
  return (
    <svg className="plan-start-art" viewBox="0 0 132 64" aria-hidden="true" focusable="false">
      <path className="pca-line" d="M24 12 V 52" />
      <circle className="pca-stop" cx="24" cy="12" r="4.5" />
      <circle className="pca-stop" cx="24" cy="32" r="4.5" />
      <circle className="pca-stop pca-stop-end" cx="24" cy="52" r="4.5" />
      <rect className="pca-bar" x="38" y="8" width="58" height="8" rx="4" />
      <rect className="pca-bar" x="38" y="28" width="76" height="8" rx="4" />
      <rect className="pca-bar" x="38" y="48" width="44" height="8" rx="4" />
    </svg>
  );
}

/** A plain-click door that stays in the app; a modified click opens the address. */
function door(go) {
  return (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go();
  };
}

/**
 * Plan with nothing in progress (T496, roadmap 1.15 section 4; owner
 * T490-a): "Plan something new" and two large tiles, Trip and One day. One
 * day is a one-day trip in the day planner (owner T484-g). A third, quiet way
 * in opens a saved trip from My trips. Neither tile is a primary: the choice
 * is the page, so both carry the same weight.
 */
export function PlanStart({ onNavigate, pageOver = false, ask = null }) {
  const { t } = useI18n();
  // The page's one h1, unless a page stands over it (T411).
  const Title = pageOver ? 'div' : 'h1';
  const tiles = [
    { key: 'trip', Art: TripDrawing, title: t('plan.startTrip'), sub: t('plan.startTripSub') },
    { key: 'day', Art: DayDrawing, title: t('plan.startDay'), sub: t('plan.startDaySub') },
  ];
  return (
    <div className="plan-start">
      <div className="plan-start-wrap">
        <Title className="plan-start-h">{t('nav.planNew')}</Title>
        {/* T558: Ask Carta, read as a plan, above the two tiles. */}
        {ask}
        <ul className="plan-start-tiles" role="list">
          {tiles.map(({ key, Art, title, sub }) => (
            <li key={key}>
              <a className="plan-start-tile" href={tabHref(key)} onClick={door(() => onNavigate(key))}>
                <Art />
                <span className="plan-start-text">
                  <span className="plan-start-title">{title}</span>
                  <span className="plan-start-sub">{sub}</span>
                </span>
                <ChevronRightIcon size={20} className="plan-start-chev" />
              </a>
            </li>
          ))}
        </ul>
        <a className="plan-start-saved" href={tabHref('trips')} onClick={door(() => onNavigate('trips'))}>
          {t('plan.openSaved')}
        </a>
      </div>
    </div>
  );
}
