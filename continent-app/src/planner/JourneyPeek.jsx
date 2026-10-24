import React, { useEffect, useState } from 'react';
import { SheetShell } from '../browse/SheetShell.jsx';
import { useI18n } from '../i18n/index.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { Button } from '../components/ui/index.js';
import { LoadingBlock, ErrorBlock } from '../components/StateBlocks.jsx';
import { loadJourney } from '../lib/journeys.js';

/**
 * What's there, for a journey from the library (T669): its photograph, its
 * line, the months it is best in and the days by title, on a sheet over the
 * Trips step, with Choose this trip. The full journey page lives in Explore;
 * the planner keeps to a sheet so the trip stays one tap away.
 */
export function JourneyPeek({ card, onClose, onChoose }) {
  const { t, lang } = useI18n();
  const [trip, setTrip] = useState(undefined); // undefined loading, null failed
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setTrip(undefined);
    loadJourney(card.id.replace(/^j:/, '')).then((j) => { if (live) setTrip(j || null); }, () => { if (live) setTrip(null); });
    return () => { live = false; };
  }, [card.id, tries]);
  const monthName = (m) => new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2026, m - 1, 1));
  const months = (trip?.bestPeriod?.months || card.season || []).map(monthName);
  return (
    <SheetShell title={card.title} onClose={onClose} className="jpeek" labelId="jpeek-title">
      <div className="jpeek-body">
        {card.img?.url && <HeroImage url={card.img.url} city={card.title} className="jpeek-img" ratio={[16, 9]} maxWidth={720} />}
        {card.summary && <p className="jpeek-lead">{card.summary}</p>}
        {months.length > 0 && <p className="jpeek-when">{t('jpeek.best', { months: months.join(', ') })}</p>}
        {trip === undefined && <LoadingBlock label={t('ready.loading')} rows={3} />}
        {trip === null && <ErrorBlock message={t('state.tripsFailed')} onRetry={() => setTries((n) => n + 1)} retryLabel={t('layer.retry')} />}
        {trip && (
          <ol className="jpeek-days">
            {(trip.itinerary || []).map((d) => (
              <li key={d.day}>
                <span className="jpeek-day">{t('itin.dayN', { n: d.day })}</span>
                <span className="jpeek-title">{d.title}</span>
              </li>
            ))}
          </ol>
        )}
        <Button variant="primary" block onClick={() => onChoose(card)}>{t('ready.chooseThis')}</Button>
      </div>
    </SheetShell>
  );
}
