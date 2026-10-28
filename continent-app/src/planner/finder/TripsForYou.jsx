import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { SheetHead } from '../flow/PlanStage.jsx';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { MAX_COMPARE } from '../../lib/recommend/compare.js';
import { TripCard } from './TripCard.jsx';
import { TripCompare } from './TripCompare.jsx';
import { PAGE, answerChips } from './finderText.js';

// The Compare ticks for this visit (T802), per answer set: the same answers
// find the same trips with the same ids, so the ticks hold while the
// traveller reopens a question and comes back, and clear when an answer
// changes. Memory only, never stored.
const TICKS = new Map();
const answersKey = (s) => JSON.stringify([s.guide, s.when, s.party, s.priority, s.from]);

function useTicks(settings) {
  const key = answersKey(settings);
  const [ticks, setState] = useState(() => TICKS.get(key) || []);
  const seen = useRef(key);
  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    setState([]);
  }, [key]);
  const set = (next) => {
    TICKS.clear();
    TICKS.set(key, next);
    setState(next);
  };
  return [ticks, set];
}

/**
 * Trips for you (T798): the answers as chips (a tap reopens that question,
 * and Continue there comes straight back), then the priced trips, six at a
 * time with "Show more trips" for the rest. One column on a phone; on a
 * desktop a grid of equal cards across the plan stage's width.
 *
 * Compare (T802): each card has a Compare tick, up to four. From two ticks
 * a tray at the foot opens the compare table (TripCompare); closing it
 * returns focus to the tray.
 *
 *   trips          the ranked trips, with any swap the receipt made
 *   markedId       the trip the traveller planned last (back from the planner)
 *   onOpen(trip, el)  open its receipt; `el` gets focus back on close
 *   onReopen(id)   reopen one question
 *   onPlan(trip)   "Plan this trip" from the compare table (T801's hand-off)
 */
export function TripsForYou({ settings, trips, destinations, originName, markedId = null, onBack, onOpen, onReopen, onPlan, cardRefs, ui }) {
  const { t, lang } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const markedAt = markedId ? trips.findIndex((x) => x.id === markedId) : -1;
  const [shown, setShown] = useState(() => Math.max(PAGE, markedAt + 1));
  const [ticks, setTicks] = useTicks(settings);
  const [refused, setRefused] = useState(null);
  const [comparing, setComparing] = useState(false);
  const when = whenText(t, settings.when, months, bcp47);
  const chips = answerChips(settings, { t, lang, originName, when, trip: trips[0] || null, locale: lang });
  // A ticked trip that is no longer in the list is not compared.
  const ticked = ticks.map((id) => trips.find((x) => x.id === id)).filter(Boolean);

  useEffect(() => {
    // Back from the planner: focus the trip they planned; else the heading.
    const card = markedId ? cardRefs.current.get(markedId) : null;
    (card || titleRef.current)?.focus({ preventScroll: !card });
    if (card) card.scrollIntoView?.({ block: 'center' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival

  const toggle = (id) => {
    const live = ticked.map((x) => x.id);
    if (live.includes(id)) {
      setRefused(null);
      setTicks(live.filter((x) => x !== id));
    } else if (live.length >= MAX_COMPARE) {
      setRefused(id);
    } else {
      setRefused(null);
      setTicks([...live, id]);
    }
  };

  return (
    <div className="pf-step tff-trips">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} />
      <h2 className="pf-title" tabIndex={-1} ref={titleRef}>{t('tf.list.title')}</h2>
      {chips.length > 0 && (
        <ul className="tff-ansbar" aria-label={t('tf.chip.change')}>
          {chips.map((c) => (
            <li key={c.id}>
              <Button size="sm" className="tff-ans" aria-label={t('tf.chip.changeOne', { answer: c.label })} onClick={() => onReopen(c.q)}>
                {c.label}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ol className="tff-list">
        {trips.slice(0, shown).map((trip) => (
          <li key={trip.id}>
            <TripCard
              trip={trip}
              destinations={destinations}
              marked={trip.id === markedId}
              onOpen={onOpen}
              ui={ui}
              compare={{ ticked: ticks.includes(trip.id), refused: refused === trip.id, onToggle: toggle }}
              ref={(el) => { if (el) cardRefs.current.set(trip.id, el); else cardRefs.current.delete(trip.id); }}
            />
          </li>
        ))}
      </ol>
      {trips.length > shown && (
        <div className="tff-more">
          <Button variant="quiet" onClick={() => setShown(shown + PAGE)}>{t('tf.list.more')}</Button>
        </div>
      )}
      {ticked.length >= 2 && (
        <div className="tff-tray" role="region" aria-label={t('tf.cmp.tray')}>
          <p className="tff-tray-text" aria-live="polite">{t('tf.cmp.count', { n: ticked.length })}</p>
          <Button variant="primary" size="sm" onClick={() => setComparing(true)}>{t('tf.cmp.open')}</Button>
        </div>
      )}
      {comparing && ticked.length >= 2 && (
        <TripCompare
          trips={ticked}
          settings={settings}
          destinations={destinations}
          ui={ui}
          onClose={() => setComparing(false)}
          onRemove={(id) => setTicks(ticked.map((x) => x.id).filter((x) => x !== id))}
          onOpen={onOpen}
          onPlan={onPlan}
        />
      )}
    </div>
  );
}
