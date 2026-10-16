import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tipsForTrip } from '../lib/cheapTips.js';
import { useI18n } from '../i18n/index.jsx';
import { Button } from '../components/ui/index.js';
import { scrollBehavior } from '../lib/motion.js';

// i18n keys for the tip categories. The tip texts themselves are English data
// in cheapTips.json and wait on a translation pass (row T377-f).
const CATEGORY_KEY = {
  transport: 'trip.tipCatTransport',
  flights: 'trip.tipCatFlights',
  food: 'trip.tipCatFood',
  stay: 'trip.tipCatStay',
  activities: 'trip.tipCatActivities',
  driving: 'trip.tipCatDriving',
  connectivity: 'trip.tipCatConnectivity',
};

const TRACK_CAP = 6;

/**
 * Before you go (T432): the planned trip's country rules and the savings
 * researched for this trip, as one track of cards rather than a long closed
 * fold (carta-design "Tracks"). One card a fact: the country's rules first
 * (`intel`, the CountryIntel nodes the planner tab renders for the route),
 * then the tips filtered to this trip's countries, month, transport and party
 * (lib/cheapTips.js). Swiping is a shortcut: Previous and Next move one card,
 * the position says where you are, and Show all turns the track into a list.
 */
export function CheapTipsSection({ stopDetails = [], tripStart = null, transportPref = null, groupSize = 1, intel = null }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const [at, setAt] = useState(0);
  const trackRef = useRef(null);

  const countryNames = useMemo(() => {
    const m = new Map();
    for (const s of stopDetails) {
      if (s.dest?.iso2 && !m.has(s.dest.iso2)) m.set(s.dest.iso2, s.dest.country);
    }
    return m;
  }, [stopDetails]);

  const picked = useMemo(() => tipsForTrip({
    iso2s: [...countryNames.keys()],
    startDate: tripStart,
    transport: (transportPref === 'car' || transportPref === 'owncar') ? 'car' : 'flight',
    groupSize,
  }), [countryNames, tripStart, transportPref, groupSize]);

  const cards = useMemo(() => {
    const out = [];
    (Array.isArray(intel) ? intel : intel ? [intel] : []).forEach((node, i) => {
      out.push({ key: `intel-${node?.key ?? i}`, kind: 'intel', node });
    });
    picked.byCountry.forEach((g) => g.tips.forEach((tip) => {
      out.push({ key: tip.id, kind: 'tip', tip, place: countryNames.get(g.iso2) || g.iso2 });
    }));
    // Europe-wide tips wait behind Show all: the track is this trip's
    // countries first (T432 critique: a Spain tip on an Albania trip).
    if (!out.some((c) => c.kind === 'tip')) {
      picked.generic.forEach((tip) => out.push({ key: tip.id, kind: 'tip', tip, place: '' }));
    }
    return out;
  }, [intel, picked, countryNames]);

  const shown = all ? cards : cards.slice(0, TRACK_CAP);

  // Which card leads the track, read from the scroll position.
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || !el.firstElementChild) return;
    const w = el.firstElementChild.getBoundingClientRect().width || 1;
    setAt(Math.max(0, Math.min(shown.length - 1, Math.round(el.scrollLeft / w))));
  }, [shown.length]);
  useEffect(() => { setAt(0); }, [cards.length, all]);

  const go = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(shown.length - 1, at + dir));
    const card = el.children[next];
    if (card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: scrollBehavior() });
    setAt(next);
  };

  if (!cards.length) return null;

  const card = (c) => (c.kind === 'intel' ? (
    <article className="bgo-card bgo-intel" key={c.key}>{c.node}</article>
  ) : (
    <article className="bgo-card" key={c.key}>
      <p className="bgo-meta">
        {CATEGORY_KEY[c.tip.category] ? t(CATEGORY_KEY[c.tip.category]) : c.tip.category}
        {c.place ? `, ${c.place}` : ''}
      </p>
      <h3 className="bgo-title">{c.tip.title}</h3>
      <p className="bgo-text">{c.tip.tip}</p>
      {c.tip.savings && <p className="bgo-save">{c.tip.savings}</p>}
    </article>
  ));

  return (
    <section className="bgo" aria-labelledby="bgo-h">
      <div className="bgo-head">
        <h2 className="bgo-h" id="bgo-h">{t('plan.beforeYouGo')}</h2>
        {cards.length > 1 && (
          <Button variant="quiet" size="sm" className="bgo-all" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? t('plan.showAsTrack') : t('plan.showAll')}
          </Button>
        )}
      </div>
      {all ? (
        <div className="bgo-list">{shown.map(card)}</div>
      ) : (
        <>
          <div
            className="bgo-track"
            ref={trackRef}
            onScroll={onScroll}
            tabIndex={0}
            role="region"
            aria-label={t('plan.beforeYouGo')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
              if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
            }}
          >
            {shown.map(card)}
          </div>
          {shown.length > 1 && (
            <div className="bgo-nav">
              <Button variant="secondary" size="sm" onClick={() => go(-1)} disabled={at <= 0}>{t('journey.trackPrev')}</Button>
              <span className="bgo-pos" aria-live="polite">{t('plan.trackPos', { n: at + 1, total: shown.length })}</span>
              <Button variant="secondary" size="sm" onClick={() => go(1)} disabled={at >= shown.length - 1}>{t('journey.trackNext')}</Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
