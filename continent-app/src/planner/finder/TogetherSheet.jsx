import React, { useId, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CheckIcon, HeartIcon } from '../../components/Icons.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { formatMoney } from '../../lib/money.js';
import { monthName } from '../../lib/dates.js';
import { setTogetherMe, togetherMe } from '../../lib/recommend/keptStore.js';
import { decodeTogether, listId, pickOf, sendLink, standing, togetherUrl, vote } from '../../lib/recommend/together.js';

/**
 * Decide together (TF4, T808): a shared shortlist opened from its link
 * (#together=...). Each trip shows what the group thinks so far and this
 * person's Keep and Skip; the trips everyone kept rise to the top. "Send
 * your picks" passes the link on with this person's picks in it.
 *
 * This device's place in the list is remembered per shortlist, so the one
 * who started it, opening the reply, is still person 1. App loads this
 * lazily, through the finder's chunk (FindingTrips.jsx re-exports it), only
 * when a link carries a shortlist.
 */
export default function TogetherSheet({ code, onClose }) {
  const { t, lang } = useI18n();
  const titleId = useId();
  const [list, setList] = useState(() => decodeTogether(code));
  const id = list ? listId(list.trips) : null;
  const [me] = useState(() => (list ? (togetherMe(id) ?? Math.min(list.people.length, 7)) : 0));
  const [sent, setSent] = useState(null);

  if (!list) {
    return (
      <SheetShell title={t('tf.tog.title')} onClose={onClose} className="tff-tog-sheet" labelId={titleId} closeLabel={t('tf.rc.close')}>
        <div className="tff-tog">
          <p className="tff-tog-lede" role="status">{t('tf.tog.broken')}</p>
        </div>
      </SheetShell>
    );
  }

  const rows = standing(list);
  const voters = rows[0]?.voters || 0;
  const mine = list.trips.some((x) => pickOf(list.people, me, x.id));
  const pick = (tripId, choice) => {
    const now = pickOf(list.people, me, tripId);
    setTogetherMe(id, me);
    setList({ ...list, people: vote(list.people, me, tripId, now === choice ? null : choice) });
    setSent(null);
  };
  const send = async () => {
    const url = togetherUrl(list);
    const how = await sendLink(url, t('tf.tog.title'));
    setSent(how ? { how } : { how: 'manual', url });
  };

  return (
    <SheetShell title={t('tf.tog.title')} onClose={onClose} className="tff-tog-sheet" labelId={titleId} closeLabel={t('tf.rc.close')}>
      <div className="tff-tog">
        <p className="tff-tog-lede">{t('tf.tog.lede')}</p>
        <p className="tff-tog-who">
          {t('tf.tog.you', { n: me + 1 })}
          {' '}
          {t(voters === 1 ? 'tf.tog.votersOne' : 'tf.tog.voters', { n: voters })}
        </p>
        <ol className="tff-tog-list">
          {rows.map(({ trip, keeps, all }) => {
            const p = pickOf(list.people, me, trip.id);
            const name = trip.name || trip.country;
            const meta = [trip.country, t('tf.keep.nights', { n: trip.nights }), trip.month ? monthName(trip.month, lang) : ''].filter(Boolean).join(', ');
            return (
              <li key={trip.id} className={`tff-tog-row${all ? ' is-all' : ''}`}>
                <HeroImage url={trip.image} city={name} iso2={trip.iso2} className="tff-tog-img" maxWidth={330} ratio={[1, 1]} sizes="64px" />
                <div className="tff-tog-body">
                  <h3 className="tff-tog-name">{name}</h3>
                  <p className="tff-tog-meta">{meta}</p>
                  {trip.total.perPerson != null && (
                    <p className="tff-tog-price">
                      <span className="money">{formatMoney(trip.total.perPerson, { locale: lang })}</span>
                      {' '}
                      <span>{t('tf.keep.unit')}</span>
                    </p>
                  )}
                  <p className={`tff-tog-state${all ? ' is-all' : ''}`}>
                    {all && <CheckIcon size={12} />}
                    {all ? t('tf.tog.all') : t('tf.tog.kept', { k: keeps, n: Math.max(voters, 1) })}
                  </p>
                </div>
                <div className="tff-tog-acts" role="group" aria-label={t('tf.tog.yourPick', { name })}>
                  <Button size="sm" variant="quiet" className={`tff-keep${p === 'keep' ? ' is-kept' : ''}`} aria-pressed={p === 'keep'}
                    iconStart={<HeartIcon size={16} />} onClick={() => pick(trip.id, 'keep')}>
                    {t('tf.keep.keep')}
                  </Button>
                  <Button size="sm" variant="quiet" className={`tff-skip-one${p === 'skip' ? ' is-skipped' : ''}`} aria-pressed={p === 'skip'}
                    onClick={() => pick(trip.id, 'skip')}>
                    {t('tf.keep.skip')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="tff-tog-foot">
          <Button variant="primary" block disabled={!mine} onClick={send}>{t('tf.tog.send')}</Button>
          {!mine && <p className="tff-tog-hint">{t('tf.tog.pickFirst')}</p>}
          {sent && (
            <p className="tff-tog-sent" role="status">
              {sent.how === 'manual'
                ? <>{t('tf.tog.copyThis')} <input readOnly value={sent.url} aria-label={t('tf.tog.link')} onFocus={(e) => e.target.select()} /></>
                : t(sent.how === 'copied' ? 'tf.tog.copied' : 'tf.tog.shared')}
            </p>
          )}
        </div>
      </div>
    </SheetShell>
  );
}
