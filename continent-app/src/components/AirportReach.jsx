import React, { useMemo } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { ChoiceRows, Segmented } from './ui/index.js';
import { airportsNear, originsWithin, REACH_HOURS, DEFAULT_REACH } from '../lib/airportReach.js';

/** "1 h 05" or "45 min", for a drive. */
function driveText(t, minutes) {
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 60) return t('pf.reach.mins', { m: minutes });
  return t('flight.duration', { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') });
}

/**
 * The airports within reach of home (T860, plan flow v3): how far the
 * traveller would go, as one Segmented (1, 2 or 3 hours, or Pick), and the
 * airports inside the longest reach as tick rows, nearest drive first, each
 * with its drive. A reach ticks every airport the flight sweep covers inside
 * it; a tap on a row switches to Pick with that row toggled. An airport the
 * sweep has no prices for cannot be ticked and says so. The setup question
 * and the settings line's From both draw this, on the same app-wide choice
 * (choices.origins, choices.airport_hours).
 *
 *   meta      the catalogue's meta (meta.origins)
 *   point     the From town { lat, lon }
 *   covered   the sweep index's origins (IATA -> priced days), or null
 *   hours     1 | 2 | 3 | 'pick' | null (null reads as the default reach)
 *   codes     the ticked IATA codes
 *   onChange(codes, hours)
 */
export function AirportReach({ meta, point, covered = null, hours = null, codes = [], onChange, labelId = 'pf-reach-h' }) {
  const { t } = useI18n();
  const lat = point?.lat ?? null;
  const lon = point?.lon ?? point?.lng ?? null;
  const list = useMemo(
    () => (lat != null && lon != null ? airportsNear(meta, { lat, lon }, { covered }) : []),
    [meta, lat, lon, covered],
  );
  const mode = hours === 'pick' ? 'pick' : (REACH_HOURS.includes(hours) ? hours : DEFAULT_REACH);
  const ticked = hours ? codes : originsWithin(list, mode);
  const pickMode = (v) => {
    if (v === 'pick') onChange(ticked, 'pick');
    else onChange(originsWithin(list, Number(v)), Number(v));
  };
  const toggle = (iata) => {
    const next = new Set(ticked);
    if (next.has(iata)) next.delete(iata); else next.add(iata);
    onChange(list.filter((a) => next.has(a.iata)).map((a) => a.iata), 'pick');
  };
  if (!list.length) return <p className="pf-help">{t('pf.reach.noTown')}</p>;
  return (
    <div className="pf-reach">
      <Segmented
        block
        label={t('pf.reach.label')}
        className="pf-fill-seg"
        value={String(mode)}
        onChange={pickMode}
        options={[
          ...REACH_HOURS.map((h) => ({ value: String(h), label: t(h === 1 ? 'pf.reach.h1' : 'pf.reach.hN', { n: h }) })),
          { value: 'pick', label: t('pf.reach.pick') },
        ]}
      />
      <h3 className="pf-ls-h" id={labelId}>{t('pf.reach.list')}</h3>
      <ChoiceRows
        multi
        label={t('pf.reach.list')}
        className="pf-reach-rows"
        value={ticked}
        onPick={toggle}
        options={list.map((a) => ({
          value: a.iata,
          icon: 'PlaneIcon',
          label: `${a.city} (${a.iata})`,
          sub: a.covered
            ? t('pf.reach.drive', { time: driveText(t, a.minutes) })
            : t('pf.reach.driveNoPrices', { time: driveText(t, a.minutes) }),
          disabled: !a.covered,
        }))}
      />
    </div>
  );
}
