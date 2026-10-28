import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { SheetHead } from '../flow/PlanStage.jsx';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { TripCard } from './TripCard.jsx';
import { PAGE, answerChips } from './finderText.js';

/**
 * Trips for you (T798): the answers as chips (a tap reopens that question,
 * and Continue there comes straight back), then the priced trips, six at a
 * time with "Show more trips" for the rest. One column on a phone; on a
 * desktop a grid of equal cards across the plan stage's width.
 *
 *   trips          the ranked trips, with any swap the receipt made
 *   markedId       the trip the traveller planned last (back from the planner)
 *   onOpen(trip, el)  open its receipt; `el` gets focus back on close
 *   onReopen(id)   reopen one question
 */
export function TripsForYou({ settings, trips, destinations, originName, markedId = null, onBack, onOpen, onReopen, cardRefs }) {
  const { t, lang } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const markedAt = markedId ? trips.findIndex((x) => x.id === markedId) : -1;
  const [shown, setShown] = useState(() => Math.max(PAGE, markedAt + 1));
  const when = whenText(t, settings.when, months, bcp47);
  const chips = answerChips(settings, { t, lang, originName, when, trip: trips[0] || null, locale: lang });

  useEffect(() => {
    // Back from the planner: focus the trip they planned; else the heading.
    const card = markedId ? cardRefs.current.get(markedId) : null;
    (card || titleRef.current)?.focus({ preventScroll: !card });
    if (card) card.scrollIntoView?.({ block: 'center' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival

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
    </div>
  );
}
