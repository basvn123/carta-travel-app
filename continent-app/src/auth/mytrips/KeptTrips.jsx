import React, { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Card } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { FriendsIcon, RouteIcon } from '../../components/Icons.jsx';
import { formatMoney } from '../../lib/money.js';
import { loadFlightFile } from '../../lib/flights/flightData.js';
import { monthName } from '../../lib/dates.js';
import { setTogetherMe, unkeep, useKept, useKeptDrops } from '../../lib/recommend/keptStore.js';
import { listId, sendLink, startTogether, togetherUrl } from '../../lib/recommend/together.js';

/**
 * Kept trips (TF4, T806 to T808): the trips kept from the trip finder's
 * hearts, at the top of the shortlist. Each row is the card as it was kept
 * (photo, name, nights, month, the total a person); a trip whose flight got
 * cheaper since says by how much (T807). "Plan this trip" hands the kept
 * plan to the planner; from two kept trips, "Decide together" sends the
 * shortlist as one link (T808).
 *
 *   onPlan(record)   plan one kept trip (SavedTripsPanel hands it to Plan)
 */
export function KeptTrips({ onPlan }) {
  const { t, lang } = useI18n();
  const kept = useKept();
  const drops = useKeptDrops(kept, loadFlightFile);
  const [sent, setSent] = useState(null);
  if (!kept.length) return null;

  const together = async () => {
    const list = startTogether(kept);
    setTogetherMe(listId(list.trips), 0);
    const url = togetherUrl(list);
    const how = await sendLink(url, t('tf.tog.title'));
    setSent(how ? { how } : { how: 'manual', url });
  };

  return (
    <section className="mt-kept" aria-labelledby="mt-kept-title">
      <div className="mt-kept-head">
        <h3 className="mt-kept-title" id="mt-kept-title">{t('tf.keep.title')}</h3>
        {kept.length >= 2 && (
          <Button size="sm" variant="secondary" iconStart={<FriendsIcon size={16} />} onClick={together}>
            {t('tf.tog.start')}
          </Button>
        )}
      </div>
      {sent && (
        <p className="mt-kept-sent" role="status">
          {sent.how === 'manual' ? <>{t('tf.tog.copyThis')} <input readOnly value={sent.url} aria-label={t('tf.tog.link')} onFocus={(e) => e.target.select()} /></>
            : t(sent.how === 'copied' ? 'tf.tog.copied' : 'tf.tog.shared')}
        </p>
      )}
      <div className="mt-rows">
        {kept.map((r) => {
          const drop = drops[r.id];
          const meta = [r.country, t('tf.keep.nights', { n: r.nights }), r.month ? monthName(r.month, lang) : ''].filter(Boolean).join(', ');
          return (
            <Card
              key={r.id}
              layout="row"
              as="div"
              className="mt-row mt-kept-row"
              media={<HeroImage url={r.image} city={r.name || r.country} iso2={r.iso2} className="mt-row-img" maxWidth={330} ratio={[1, 1]} sizes="72px" />}
              title={r.name || r.country}
              meta={(
                <span className="mt-row-meta">
                  {r.iso2 && <CountryFlag country={r.iso2} size={14} />}
                  <span>{meta}</span>
                </span>
              )}
              price={(
                <span className="mt-kept-price">
                  <span className="money">{formatMoney(drop ? drop.total : r.total.perPerson, { locale: lang })}</span>
                  <span className="mt-kept-unit">{t('tf.keep.unit')}</span>
                  {drop && <span className="mt-kept-drop">{t('tf.keep.drop', { price: formatMoney(drop.perPerson, { locale: lang }) })}</span>}
                </span>
              )}
              actions={(
                <span className="mt-kept-acts">
                  {r.plan && (
                    <Button size="sm" variant="primary" iconStart={<RouteIcon size={16} />} onClick={() => onPlan(r)}>
                      {t('tf.keep.plan')}
                    </Button>
                  )}
                  <Button size="sm" variant="quiet" aria-label={t('tf.keep.removeOne', { name: r.name || r.country })} onClick={() => unkeep(r.id)}>
                    {t('tf.keep.remove')}
                  </Button>
                </span>
              )}
            />
          );
        })}
      </div>
    </section>
  );
}
