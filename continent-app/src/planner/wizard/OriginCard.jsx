import React from 'react';
import { geocodeAddress } from '../../lib/geocode.js';
import { MapPinIcon } from '../../components/Icons.jsx';
import { Button } from '../../components/Button.jsx';
import { Chip, ChipGroup } from '../../components/ui/index.js';
import { useI18n } from '../../i18n/index.jsx';

/**
 * Where the trip leaves from, and the airport it flies from (T458). Asked on
 * Getting there, where it is used, and on From when the travel is booked. The
 * airports are a choice: the flight links start at the one picked.
 *
 * A typed address is geocoded on an explicit search only (Nominatim fair
 * use). The state lives in the wizard, so Start over clears it.
 */
export function OriginCard({
  originPlace, setOriginPlace, originQuery, setOriginQuery, originResults, setOriginResults,
  originBusy, setOriginBusy, nearAirports, depIataOk, setDepIata,
}) {
  const { t } = useI18n();
  const searchOrigin = async () => {
    const q = originQuery.trim();
    if (q.length < 3 || originBusy) return;
    setOriginBusy(true);
    setOriginResults(await geocodeAddress(q));
    setOriginBusy(false);
  };
  return (
    <section className="worigin" aria-labelledby="worigin-h">
      <h2 className="worigin-h" id="worigin-h">{t('plan.leaveFrom')}</h2>
      {originPlace ? (
        <div className="worigin-picked">
          <MapPinIcon size={20} />
          <b>{originPlace.name}</b>
          <Button variant="quiet" size="sm" onClick={() => { setOriginPlace(null); setOriginResults([]); }}>
            {t('wizard.change')}
          </Button>
        </div>
      ) : (
        <>
          <form className="worigin-search" onSubmit={(e) => { e.preventDefault(); searchOrigin(); }}>
            <label className="sr-only" htmlFor="worigin-q">{t('wizard.originLabel')}</label>
            <input
              id="worigin-q"
              className="worigin-input"
              type="search"
              value={originQuery}
              onChange={(e) => setOriginQuery(e.target.value)}
              placeholder={t('wizard.originPlaceholder')}
              autoComplete="off"
            />
            <Button type="submit" variant="secondary" disabled={originBusy || originQuery.trim().length < 3} loading={originBusy}>
              {t('wizard.search')}
            </Button>
          </form>
          {originResults.length > 0 && (
            <ul className="worigin-results">
              {originResults.map((r, i) => (
                <li key={`${r.lat},${r.lon},${i}`}>
                  <Button
                    variant="quiet"
                    block
                    className="worigin-result"
                    iconStart={<MapPinIcon size={16} />}
                    onClick={() => {
                      setOriginPlace({ name: r.shortLabel || r.name, lat: r.lat, lon: r.lon, iso2: r.iso2 });
                      setOriginResults([]);
                      setOriginQuery('');
                    }}
                  >
                    {r.label}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {nearAirports.length > 0 && (
        <div className="worigin-air">
          <span className="worigin-air-lbl" id="worigin-air">{t('plan.flyFrom')}</span>
          <ChipGroup label={t('plan.flyFrom')} className="worigin-chips" aria-labelledby="worigin-air">
            {nearAirports.map((a, i) => (
              <Chip
                key={a.iata}
                kind="choice"
                selected={(depIataOk || nearAirports[0]?.iata) === a.iata && (depIataOk ? true : i === 0)}
                onClick={() => setDepIata(a.iata)}
              >
                <b>{a.iata}</b> {a.city || a.name} <small>{a.km} km</small>
              </Chip>
            ))}
          </ChipGroup>
        </div>
      )}
    </section>
  );
}
