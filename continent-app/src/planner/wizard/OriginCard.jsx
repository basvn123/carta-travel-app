import React, { useId, useState } from 'react';
import { geocodeAddress } from '../../lib/geocode.js';
import { MapPinIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
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
 *
 * T812: once the trip knows where it leaves from, the card is one line,
 * "From Brussels (BRU)" with Change, which opens the search and the airports.
 */
export function OriginCard({
  originPlace, setOriginPlace, originQuery, setOriginQuery, originResults, setOriginResults,
  originBusy, setOriginBusy, nearAirports, depIataOk, setDepIata, homeCity = '',
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(!homeCity);
  const bodyId = useId();
  const iata = depIataOk || nearAirports[0]?.iata || '';
  const searchOrigin = async () => {
    const q = originQuery.trim();
    if (q.length < 3 || originBusy) return;
    setOriginBusy(true);
    setOriginResults(await geocodeAddress(q));
    setOriginBusy(false);
  };
  const line = homeCity && (
    <div className="wz-from">
      <PlaneIcon size={20} className="wz-from-icon" />
      <span className="wz-from-txt">
        {iata ? t('wizard.gtFromAir', { place: homeCity, iata }) : t('wizard.gtFrom', { place: homeCity })}
      </span>
      <Button variant="quiet" size="sm" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
        {open ? t('wizard.gtDone') : t('wizard.change')}
      </Button>
    </div>
  );
  if (homeCity && !open) return <section className="worigin is-line" aria-label={t('plan.leaveFrom')}>{line}</section>;
  return (
    <section className={`worigin ${homeCity ? 'is-open' : ''}`} aria-labelledby={homeCity ? undefined : 'worigin-h'} aria-label={homeCity ? t('plan.leaveFrom') : undefined}>
      {line || <h2 className="worigin-h" id="worigin-h">{t('plan.leaveFrom')}</h2>}
      <div id={bodyId} className="worigin-body">
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
      </div>
    </section>
  );
}
