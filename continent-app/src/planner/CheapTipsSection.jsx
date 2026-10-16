import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tipsForTrip } from '../lib/cheapTips.js';
import { useI18n } from '../i18n/index.jsx';
import { Button } from '../components/ui/index.js';
import { scrollBehavior } from '../lib/motion.js';
import { monthName } from '../lib/dates.js';
import { stripDashes } from '../lib/format.js';
import {
  CalendarIcon, TrainIcon, CarIcon, DiningIcon, StarIcon, InfoIcon, SparkIcon,
} from '../components/Icons.jsx';

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

const TRACK_CAP = 8;

/** One country's rules as cards of one shape (T458): the best time, getting
 *  around, the car, food, what not to miss and what is good to know. Each card
 *  is a fact; nothing nests. */
function countryCards(country, rec, t, lang) {
  if (!rec) return [];
  const out = [];
  const card = (key, Icon, label, title, text) => {
    if (!title && !text) return;
    out.push({ key: `${country}-${key}`, Icon, meta: `${label}, ${country}`, title: stripDashes(title || ''), text: stripDashes(text || '') });
  };
  if (rec.best_months?.length) {
    card('best', CalendarIcon, t('intel.bestTime'), rec.best_months.map((m) => monthName(m, lang)).join(', '), rec.best_time_note);
  }
  const ground = rec.bus?.note || rec.rail?.note;
  if (ground) card('around', TrainIcon, t('intel.gettingAround'), (rec.bus?.operators || [])[0] || rec.rail?.operator || '', ground);
  if (rec.driving) {
    const d = rec.driving;
    card('car', CarIcon, t('intel.byCar'), d.vignette || d.tolls || '', (d.warnings || [])[0] || d.tolls || '');
  }
  if (rec.food?.length) card('food', DiningIcon, t('intel.eatDrink'), rec.food.slice(0, 2).join(', '), rec.food.slice(2).join(', '));
  (rec.must_see || []).slice(0, 2).forEach((m, i) => card(`see${i}`, StarIcon, t('intel.dontMiss'), m.name, m.why));
  (rec.insights || []).slice(0, 2).forEach((s, i) => card(`know${i}`, InfoIcon, t('intel.goodToKnow'), '', s));
  return out;
}

/**
 * Before you go: the countries' rules and the savings researched for this
 * trip, as one track of cards of one shape (carta-design "Tracks"). Swiping is
 * a shortcut: Previous and Next move one card, the position says where you
 * are, and Show all turns the track into a list.
 */
export function CheapTipsSection({ stopDetails = [], tripStart = null, transportPref = null, groupSize = 1, intelRecs = [] }) {
  const { t, lang } = useI18n();
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
    for (const { country, rec } of intelRecs) out.push(...countryCards(country, rec, t, lang));
    picked.byCountry.forEach((g) => g.tips.forEach((tip) => {
      const label = CATEGORY_KEY[tip.category] ? t(CATEGORY_KEY[tip.category]) : (tip.category || '');
      out.push({
        key: tip.id, Icon: SparkIcon, meta: [label, countryNames.get(g.iso2) || g.iso2].filter(Boolean).join(', '),
        title: stripDashes(tip.title || ''), text: stripDashes(tip.tip || ''), save: tip.savings || '',
      });
    }));
    // Europe-wide tips only when nothing was researched for these countries.
    if (!out.length) {
      picked.generic.forEach((tip) => out.push({
        key: tip.id, Icon: SparkIcon, meta: CATEGORY_KEY[tip.category] ? t(CATEGORY_KEY[tip.category]) : '',
        title: stripDashes(tip.title || ''), text: stripDashes(tip.tip || ''), save: tip.savings || '',
      }));
    }
    return out;
  }, [intelRecs, picked, countryNames, t, lang]);

  const shown = all ? cards : cards.slice(0, TRACK_CAP);

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

  const renderCard = (c) => (
    <article className="bgo-card" key={c.key}>
      <p className="bgo-meta">{c.Icon && <c.Icon size={16} />} {c.meta}</p>
      {c.title && <h3 className="bgo-title">{c.title}</h3>}
      {c.text && <p className="bgo-text">{c.text}</p>}
      {c.save && <p className="bgo-save">{c.save}</p>}
    </article>
  );

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
        <div className="bgo-list">{shown.map(renderCard)}</div>
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
            {shown.map(renderCard)}
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
