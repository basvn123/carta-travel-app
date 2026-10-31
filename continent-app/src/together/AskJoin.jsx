import React, { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button } from '../components/ui/index.js';
import { CheckIcon } from '../components/Icons.jsx';
import { useTogether, togetherActions } from './useTogether.js';

/**
 * "Ask to join" a friend's trip (T939, migration 057). It sends a request
 * to the trip's owner, who answers under To answer in Together; once sent
 * the button reads "Requested" and does nothing more. Drawn only for a trip
 * that has not ended, that you are not on yet, and only once 057 exists.
 */
export function AskJoin({ trip, className = '' }) {
  const { t } = useI18n();
  const s = useTogether();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = trip?.tripPlanId;
  if (s.joinMissing || !id) return null;
  if (trip.endDate && trip.endDate < new Date().toISOString().slice(0, 10)) return null;
  if (s.myPlans.some((p) => p.id === id)) return null;
  const asked = s.joinMine.has(id);
  const ask = () => {
    setBusy(true);
    setFailed(false);
    togetherActions.askJoin(id).catch(() => setFailed(true)).finally(() => setBusy(false));
  };
  return (
    <span className={`tg-askjoin ${className}`.trim()}>
      <Button variant="secondary" size="sm" disabled={asked} loading={busy}
        iconStart={asked ? <CheckIcon size={16} /> : null} onClick={asked ? undefined : ask}>
        {asked ? t('tg2.requested') : t('tg2.askJoin')}
      </Button>
      {failed && <span className="tg-askjoin-err" role="alert">{t('friends.unavailable')}</span>}
    </span>
  );
}
