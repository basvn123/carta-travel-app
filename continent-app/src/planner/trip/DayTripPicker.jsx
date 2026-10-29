import React, { useMemo, useState } from 'react';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { Field } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { formatMoney } from '../../lib/money.js';
import { cityLabel } from '../../lib/placeName.js';
import { swapCandidates } from './swapCity.js';

/** How far a day out from a base may reach, in km as the crow flies. */
export const DAY_TRIP_KM = 120;

/**
 * Add a day trip from a stop (T843, owner D4): a day out and back the same
 * evening, with no night there. Pick the day of the stay, then one of the
 * places within reach of the stop (nearest first, or by name), each with
 * what it adds to the trip: the way there and back for the party, as the
 * engine prices it. The trip's other stops may be day trips too.
 *
 *   stop        the stop's details (dest, nights, destinationId)
 *   cost(id, day)   what the trip's total gains with that day trip, or null
 */
export function DayTripPicker({ stop, destinations, cost, onPick, onClose }) {
  const { t, lang } = useI18n();
  const [day, setDay] = useState(Math.min(2, Math.max(1, stop?.nights || 1)));
  const [query, setQuery] = useState('');
  const city = cityLabel(stop?.dest?.city || '') || t('itin.unknown');
  const list = useMemo(
    () => swapCandidates({ destinations, from: stop?.dest, exclude: [stop?.destinationId], query, maxKm: query ? null : DAY_TRIP_KM, limit: 8 }),
    [destinations, stop, query],
  );
  const costs = useMemo(() => new Map(list.map(({ dest }) => [dest.id, cost?.(dest.id, day)])), [list, day]); // eslint-disable-line react-hooks/exhaustive-deps -- the trip does not change while the sheet is open
  const days = Array.from({ length: Math.max(1, stop?.nights || 1) }, (_, i) => i + 1);
  return (
    <SheetShell title={t('tp.dt.title', { city })} onClose={onClose} width={520} className="tps-sheet" labelId="tpdt-title">
      <div className="tps">
        <Field as="select" label={t('tp.dt.which')} value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {days.map((d) => <option key={d} value={d}>{t('tp.dt.dayOf', { n: d, city })}</option>)}
        </Field>
        <Field label={t('tp.sw.search')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        {list.length === 0 ? (
          <p className="tps-note">{query ? t('tp.sw.noMatch') : t('tp.dt.none', { city })}</p>
        ) : (
          <ul className="tps-list" aria-label={t('tp.dt.title', { city })}>
            {list.map(({ dest, km }) => {
              const c = costs.get(dest.id);
              return (
                <li key={dest.id}>
                  <button type="button" className="tps-row" onClick={() => onPick(dest.id, day)}>
                    <span className="tps-thumb">
                      <HeroImage url={dest.image?.url} city={cityLabel(dest.city)} iso2={dest.iso2} className="tps-img" ratio={[1, 1]} maxWidth={120} />
                    </span>
                    <span className="tps-main">
                      <span className="tps-name">{cityLabel(dest.city)}</span>
                      <span className="tps-sub">{Number.isFinite(km) ? t('tp.sw.away', { km: Math.round(km), city }) : dest.country}</span>
                    </span>
                    <span className="tps-delta">
                      {Number.isFinite(c) && c > 0 ? t('tp.bal.more', { price: formatMoney(c, { precision: 'cents', locale: lang }) }) : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SheetShell>
  );
}
